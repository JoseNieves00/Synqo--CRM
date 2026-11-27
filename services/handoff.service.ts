import { supabaseAdmin } from '@/lib/supabase/admin';
import { isConversationClosed } from '@/lib/crm/constants';
import { MessagingService } from './messaging.service';
import { AssignmentService } from './assignment.service';

export interface NotifyHandoffParams {
  organizationId: string;
  contactId: string;
  reason?: string;
  channel?: 'whatsapp' | 'instagram';
  allowClosedOrderAlert?: boolean;
}

export class HandoffService {
  /**
   * Sanitiza y normaliza un número a formato internacional E.164.
   * Maneja prefijos colombianos (+57 / 57), limpia caracteres no numéricos y valida longitud.
   */
  static cleanE164Phone(rawPhone: string): string {
    if (!rawPhone) return '';
    let digits = rawPhone.replace(/\D/g, '');

    // Si comienza con 00, eliminarlo
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }

    // Caso Colombia: 10 dígitos que inician en 3 (ej: 3001234567) -> 573001234567
    if (digits.length === 10 && digits.startsWith('3')) {
      digits = '57' + digits;
    }

    return digits;
  }

  /**
   * Ejecuta la asignación autónoma del lead (si no tiene o si el actual no está disponible)
   * y despacha de manera 100% automática una alerta al WhatsApp personal del asesor.
   */
  static async notifyHandoff({
    organizationId,
    contactId,
    reason = 'Cliente solicitó atención de un asesor humano',
    channel = 'whatsapp',
    allowClosedOrderAlert = false,
  }: NotifyHandoffParams): Promise<{ success: boolean; assignedAgentId?: string | null; alertSent: boolean }> {
    try {
      // 1. Obtener datos del contacto y de la organización
      const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, phone, instagram_id, assigned_to, custom_fields, is_ai_active, conversation_status, closed_at, pipeline_stage')
        .eq('id', contactId)
        .single();

      if (contactError || !contact) {
        console.warn('[HANDOFF SERVICE] Contacto no encontrado para handoff:', contactId);
        return { success: false, alertSent: false };
      }

      // 🛡️ Anti-falsos-positivos: nunca alertar a un asesor por un cliente cuya
      // conversación ya fue cerrada (ganado/perdido/dismissed/completed), SALVO confirmación de pedido nuevo.
      if (!allowClosedOrderAlert && isConversationClosed(contact)) {
        console.log('[HANDOFF SERVICE] Conversación cerrada: alerta omitida para', contactId);
        return { success: true, assignedAgentId: contact.assigned_to || null, alertSent: false };
      }

      const { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
        .select('id, name, business_hours, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        console.warn('[HANDOFF SERVICE] Organización no encontrada para handoff:', organizationId);
        return { success: false, alertSent: false };
      }

      // 2. Garantizar asignación autónoma: si no tiene agente asignado, buscar el mejor disponible
      let assignedAgentId = contact.assigned_to;
      if (!assignedAgentId) {
        assignedAgentId = await AssignmentService.findBestAvailableAgent(organizationId);
        if (assignedAgentId) {
          await (supabaseAdmin.from('contacts') as any)
            .update({ assigned_to: assignedAgentId, updated_at: new Date().toISOString() })
            .eq('id', contactId);
        }
      }

      // 3. Si aún no hay agente disponible, intentar asignar a un admin con alertas activas
      if (!assignedAgentId) {
        const { data: fallbackAdmin } = await (supabaseAdmin.from('profiles') as any)
          .select('id')
          .eq('organization_id', organizationId)
          .eq('role', 'admin')
          .eq('whatsapp_alerts_enabled', true)
          .limit(1)
          .maybeSingle();

        if (fallbackAdmin) {
          assignedAgentId = fallbackAdmin.id;
        }
      }

      if (!assignedAgentId) {
        console.log('[HANDOFF SERVICE] No hay asesores disponibles ni admins con alertas para notificar.');
        return { success: true, assignedAgentId: null, alertSent: false };
      }

      // 4. Consultar perfil del asesor asignado
      const { data: agentProfile } = await (supabaseAdmin.from('profiles') as any)
        .select('id, full_name, email, role, whatsapp_phone, whatsapp_alerts_enabled, whatsapp_alerts_24_7')
        .eq('id', assignedAgentId)
        .single();

      if (!agentProfile || !agentProfile.whatsapp_alerts_enabled || !agentProfile.whatsapp_phone) {
        console.log(`[HANDOFF SERVICE] Asesor ${agentProfile?.full_name || assignedAgentId} no tiene alertas de WhatsApp activas o teléfono registrado.`);
        return { success: true, assignedAgentId, alertSent: false };
      }

      const cleanAdvisorPhone = this.cleanE164Phone(agentProfile.whatsapp_phone);
      if (!cleanAdvisorPhone || cleanAdvisorPhone.length < 9) {
        console.warn(`[HANDOFF SERVICE] Teléfono de asesor inválido para WhatsApp: ${agentProfile.whatsapp_phone}`);
        return { success: true, assignedAgentId, alertSent: false };
      }

      // 5. Blindaje Anti-Spam: No enviar más de 1 alerta de WhatsApp por contacto cada 10 minutos
      const lastAlertAt = contact.custom_fields?.last_handoff_alert_at;
      if (lastAlertAt) {
        const diffMinutes = (Date.now() - new Date(lastAlertAt).getTime()) / (1000 * 60);
        if (diffMinutes < 10) {
          console.log(`[HANDOFF SERVICE] Alerta omitida por límite anti-spam (hace ${diffMinutes.toFixed(1)} min) para ${cleanAdvisorPhone}`);
          return { success: true, assignedAgentId, alertSent: false };
        }
      }

      // 6. Obtener último mensaje del cliente para contextualizar la alerta
      const { data: lastMsg } = await (supabaseAdmin.from('messages') as any)
        .select('content')
        .eq('contact_id', contactId)
        .eq('sender_type', 'lead')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const leadDisplayName = contact.name || (channel === 'instagram' ? 'Lead de Instagram' : 'Prospecto');
      const leadContactInfo = contact.phone || contact.instagram_id || 'Sin teléfono';
      const lastContentSnippet = lastMsg?.content ? `"${lastMsg.content.slice(0, 140)}"` : 'Consulta entrante';
      const advisorFirstName = (agentProfile.full_name || 'Asesor').split(' ')[0];

      // Detección de intención de compra
      const isBuyingIntent =
        contact.custom_fields?.lead_temperature === 'hot' ||
        /pago|transfer|cuenta|comprar|nequi|bancolombia|consign|separar|separe|pedido/i.test(reason) ||
        (typeof contact.deal_value === 'number' && contact.deal_value > 0);

      const alertHeading = isBuyingIntent ? '🔔 *¡Posible prospecto a comprar!*' : '🚨 *Nuevo Lead Asignado*';
      const valueLine = contact.deal_value && Number(contact.deal_value) > 0
        ? `\n• *Monto estimado:* $${Number(contact.deal_value).toLocaleString('es-CO')} COP`
        : '';

      // Formato profesional y accionable para WhatsApp
      const alertBody = `${alertHeading}\n\nHola *${advisorFirstName}*, el prospecto *${leadDisplayName}* (${leadContactInfo}) requiere atención comercial:\n• *Motivo:* ${reason}${valueLine}\n• *Último mensaje:* ${lastContentSnippet}\n\n👉 *Abrir en CRM:* https://crm.synqo.dev/inbox/${contactId}\n\n_Tip: Responde citando este mensaje para escribirle directamente al cliente desde tu WhatsApp, o responde *1* para confirmar que lo tomaste._`;

      // 7. Despacho autónomo por la línea de WhatsApp de la empresa
      let outboundMessageId: string | null = null;
      try {
        outboundMessageId = await MessagingService.sendTextMessage({
          organization: org,
          to: cleanAdvisorPhone,
          body: alertBody,
          simulateTyping: false,
        });

        // 8. Registrar en tabla handoff_alerts para vincular futuras citas o respuestas del asesor
        await (supabaseAdmin.from('handoff_alerts') as any).insert({
          organization_id: organizationId,
          contact_id: contactId,
          profile_id: assignedAgentId,
          channel_message_id: outboundMessageId || null,
          reason,
          status: 'sent',
        });

        // Actualizar marca de tiempo en custom_fields del contacto
        const updatedCustomFields = {
          ...(contact.custom_fields || {}),
          last_handoff_alert_at: new Date().toISOString(),
          handoff_reason: reason,
        };

        await (supabaseAdmin.from('contacts') as any)
          .update({ custom_fields: updatedCustomFields })
          .eq('id', contactId);

        console.log(`[HANDOFF SERVICE] ✅ Alerta de WhatsApp enviada automáticamente a ${cleanAdvisorPhone} (${advisorFirstName})`);
        return { success: true, assignedAgentId, alertSent: true };
      } catch (dispatchErr: any) {
        console.warn(`[HANDOFF SERVICE] Fallo al enviar WhatsApp al asesor ${cleanAdvisorPhone}:`, dispatchErr?.message);
        return { success: true, assignedAgentId, alertSent: false };
      }
    } catch (err: any) {
      console.error('[HANDOFF SERVICE ERROR]', err);
      return { success: false, alertSent: false };
    }
  }

  /**
   * Notifica directamente al/los administrador(es) con WhatsApp configurado cuando se confirma un pedido,
   * sin depender de `whatsapp_alerts_enabled` (que puede estar apagado para alertas de prospectos)
   * y sin bloquearse por el cooldown anti-spam de 10 minutos de handoffs previos.
   */
  static async notifyOrderCreated(params: {
    organizationId: string;
    contactId: string;
    customerName: string;
    customerPhone?: string | null;
    itemsSummary: string;
    total: number;
    paymentMethod?: string | null;
    city?: string | null;
    address?: string | null;
    isSepare?: boolean;
    depositPaid?: number;
    balanceDue?: number;
    notes?: string | null;
    source?: 'ai' | 'manual';
  }): Promise<{ sentCount: number }> {
    try {
      const [{ data: org }, { data: admins }] = await Promise.all([
        (supabaseAdmin.from('organizations') as any)
          .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode')
          .eq('id', params.organizationId)
          .single(),
        (supabaseAdmin.from('profiles') as any)
          .select('id, full_name, role, whatsapp_phone')
          .eq('organization_id', params.organizationId)
          .eq('role', 'admin')
          .not('whatsapp_phone', 'is', null),
      ]);

      if (!org || !Array.isArray(admins) || admins.length === 0) {
        return { sentCount: 0 };
      }

      const dispatchLocation = [params.city, params.address].filter(Boolean).join(' - ') || 'Por confirmar';
      const separeBlock = params.isSepare
        ? `\n• *Plan Separe:* Abono $${Number(params.depositPaid || 0).toLocaleString('es-CO')} | Saldo $${Number(params.balanceDue || 0).toLocaleString('es-CO')}`
        : '';
      const notesLine = params.notes ? `\n• *Notas:* ${params.notes}` : '';
      const sourceLabel = params.source === 'manual' ? 'Asesor' : 'IA WhatsApp';

      let sentCount = 0;
      const sentPhones = new Set<string>();

      for (const admin of admins) {
        const cleanAdminPhone = this.cleanE164Phone(admin.whatsapp_phone || '');
        if (!cleanAdminPhone || cleanAdminPhone.length < 9 || sentPhones.has(cleanAdminPhone)) continue;
        sentPhones.add(cleanAdminPhone);

        const adminFirstName = (admin.full_name || 'Admin').split(' ')[0];
        const body = `🛒 *Nuevo Pedido Confirmado (${sourceLabel})*\n\nHola *${adminFirstName}*, se registró un nuevo pedido en *${org.name || 'tu empresa'}*:\n\n• *Cliente:* ${params.customerName}${params.customerPhone ? ` (${params.customerPhone})` : ''}\n• *Producto(s):* ${params.itemsSummary}\n• *Total:* $${Number(params.total || 0).toLocaleString('es-CO')} COP\n• *Medio de pago:* ${params.paymentMethod || (params.isSepare ? 'Plan Separe' : 'Por definir')}${separeBlock}\n• *Despacho:* ${dispatchLocation}${notesLine}\n• *Estado:* 📦 Por Despachar\n\n👉 *Ver Pedido:* https://crm.synqo.dev/pedidos\n💬 *Abrir Chat:* https://crm.synqo.dev/inbox?c=${params.contactId}`;

        try {
          await MessagingService.sendTextMessage({
            organization: org,
            to: cleanAdminPhone,
            body,
            simulateTyping: false,
          });
          sentCount++;
        } catch (sendErr: any) {
          console.warn(`[ORDER ADMIN ALERT WARN] Fallo al enviar a ${cleanAdminPhone}:`, sendErr?.message);
        }
      }

      return { sentCount };
    } catch (err: any) {
      console.warn('[NOTIFY ORDER CREATED WARN]', err?.message || err);
      return { sentCount: 0 };
    }
  }
}
