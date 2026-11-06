import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from './messaging.service';
import { AssignmentService } from './assignment.service';

export interface NotifyHandoffParams {
  organizationId: string;
  contactId: string;
  reason?: string;
  channel?: 'whatsapp' | 'instagram';
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
  }: NotifyHandoffParams): Promise<{ success: boolean; assignedAgentId?: string | null; alertSent: boolean }> {
    try {
      // 1. Obtener datos del contacto y de la organización
      const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, phone, instagram_id, assigned_to, custom_fields, is_ai_active')
        .eq('id', contactId)
        .single();

      if (contactError || !contact) {
        console.warn('[HANDOFF SERVICE] Contacto no encontrado para handoff:', contactId);
        return { success: false, alertSent: false };
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

      // Formato profesional y accionable para WhatsApp
      const alertBody = `🚨 *Nuevo Lead Asignado*\n\nHola *${advisorFirstName}*, se te ha asignado un prospecto que requiere tu atención:\n• *Cliente:* ${leadDisplayName} (${leadContactInfo})\n• *Motivo:* ${reason}\n• *Último mensaje:* ${lastContentSnippet}\n\n👉 *Abrir en CRM:* https://crm.synqo.dev/inbox/${contactId}\n\n_Tip: Responde citando este mensaje para escribirle directamente al cliente desde tu WhatsApp, o responde *1* para confirmar que lo tomaste._`;

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
}
