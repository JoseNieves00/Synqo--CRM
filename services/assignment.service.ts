import { supabaseAdmin } from '@/lib/supabase/admin';

export interface FindAgentOptions {
  maxWorkload?: number;
  excludeAgentId?: string | null;
}

/**
 * Servicio de Asignación Inteligente y Autónoma Multi-Agente
 * Implementa Balanceo de Carga (Load Balancing), Rotación Equitativa (Round-Robin)
 * y Reasignación Automática por Vencimiento de SLA.
 */
export class AssignmentService {
  /**
   * Encuentra de forma autónoma el mejor agente disponible en la organización según:
   * 1. Presencia física activa o disponibilidad 'available'.
   * 2. Modo configurado en la organización ('load_balance' vs 'round_robin').
   * 3. Respeto del límite de carga (Workload Capping).
   * 4. Exclusión opcional de un agente (ej: para reasignaciones por inactividad).
   */
  static async findBestAvailableAgent(
    organizationId: string,
    options?: number | FindAgentOptions
  ): Promise<string | null> {
    try {
      const maxWorkload = typeof options === 'number' ? options : options?.maxWorkload || 15;
      const excludeAgentId = typeof options === 'object' ? options?.excludeAgentId : undefined;

      // 1. Consultar configuración de asignación de la organización
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('assignment_mode, include_admins_in_assignment')
        .eq('id', organizationId)
        .single();

      const assignmentMode = org?.assignment_mode || 'load_balance';
      const includeAdmins = Boolean(org?.include_admins_in_assignment);
      const rolesAllowed = includeAdmins ? ['agent', 'supervisor', 'admin'] : ['agent'];

      // Ventana de presencia reciente: 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // 2. Consultar candidatos de la organización
      let query = (supabaseAdmin.from('profiles') as any)
        .select('id, full_name, email, role, last_seen_at, availability_status, last_assigned_at')
        .eq('organization_id', organizationId)
        .in('role', rolesAllowed);

      if (excludeAgentId) {
        query = query.neq('id', excludeAgentId);
      }

      const { data: candidates, error: candidateError } = await query;

      if (candidateError || !candidates || candidates.length === 0) {
        return null;
      }

      // Filtrar candidatos activos (no en modo 'busy' u 'offline')
      const availableAgents = candidates.filter((agent: any) => {
        const isNotBusyOrOffline = !agent.availability_status || agent.availability_status === 'available';
        const isRecentlyActive = agent.last_seen_at && new Date(agent.last_seen_at) >= new Date(fiveMinutesAgo);
        // Si tiene estado explícito 'available', lo consideramos disponible aunque su último heartbeat haya sido hace unos minutos
        return isNotBusyOrOffline && (agent.availability_status === 'available' || isRecentlyActive);
      });

      if (availableAgents.length === 0) {
        return null;
      }

      const agentIds = availableAgents.map((a: any) => a.id);

      // 3. Contar carga activa (chats no cerrados) de cada candidato
      const { data: activeContacts } = await (supabaseAdmin.from('contacts') as any)
        .select('assigned_to')
        .eq('organization_id', organizationId)
        .in('assigned_to', agentIds)
        .not('pipeline_stage', 'in', '("ganado","perdido")');

      const workloadMap = new Map<string, number>();
      agentIds.forEach((id: string) => workloadMap.set(id, 0));

      if (activeContacts) {
        for (const c of activeContacts) {
          if (c.assigned_to && workloadMap.has(c.assigned_to)) {
            workloadMap.set(c.assigned_to, (workloadMap.get(c.assigned_to) || 0) + 1);
          }
        }
      }

      // Filtrar candidatos que no excedan el límite de carga máxima
      const eligibleAgents = availableAgents.filter((agent: any) => {
        const load = workloadMap.get(agent.id) || 0;
        return load < maxWorkload;
      });

      if (eligibleAgents.length === 0) {
        return null;
      }

      let chosenAgentId: string;

      // 4. Selección según modo de asignación
      if (assignmentMode === 'round_robin') {
        // Ordenar por last_assigned_at ascendente (los que llevan más tiempo sin recibir lead van primero)
        eligibleAgents.sort((a: any, b: any) => {
          if (!a.last_assigned_at) return -1;
          if (!b.last_assigned_at) return 1;
          return new Date(a.last_assigned_at).getTime() - new Date(b.last_assigned_at).getTime();
        });
        chosenAgentId = eligibleAgents[0].id;
      } else {
        // Load Balancing por defecto: menor cantidad de chats abiertos
        eligibleAgents.sort((a: any, b: any) => {
          const loadA = workloadMap.get(a.id) || 0;
          const loadB = workloadMap.get(b.id) || 0;
          return loadA - loadB;
        });
        chosenAgentId = eligibleAgents[0].id;
      }

      // 5. Actualizar marca temporal de asignación
      await (supabaseAdmin.from('profiles') as any)
        .update({ last_assigned_at: new Date().toISOString() })
        .eq('id', chosenAgentId);

      return chosenAgentId;
    } catch (err) {
      console.error('[ASSIGNMENT SERVICE ERROR] Error buscando agente disponible:', err);
      return null;
    }
  }

  /**
   * Reasignación Autónoma en Cascada por Vencimiento de SLA:
   * Detecta leads en estado de relevo (is_ai_active = false) asignados a un asesor
   * que no han recibido respuesta humana dentro del margen SLA (ej: 15 min),
   * y los reasigna de manera automática al siguiente asesor disponible.
   */
  static async reassignStaleHandoffs(targetOrgId?: string): Promise<{ reallocatedCount: number }> {
    try {
      let orgQuery = (supabaseAdmin.from('organizations') as any)
        .select('id, name, handoff_sla_minutes');

      if (targetOrgId) {
        orgQuery = orgQuery.eq('id', targetOrgId);
      }

      const { data: orgs } = await orgQuery;
      if (!orgs || orgs.length === 0) return { reallocatedCount: 0 };

      let reallocatedCount = 0;

      for (const org of orgs) {
        const slaMinutes = org.handoff_sla_minutes || 15;
        const thresholdIso = new Date(Date.now() - slaMinutes * 60 * 1000).toISOString();

        // Buscar contactos con IA apagada, con asesor asignado y sin actividad humana reciente
        const { data: staleContacts } = await (supabaseAdmin.from('contacts') as any)
          .select('id, name, phone, assigned_to, last_interaction_at, custom_fields')
          .eq('organization_id', org.id)
          .eq('is_ai_active', false)
          .not('assigned_to', 'is', null)
          .lt('last_interaction_at', thresholdIso)
          .not('pipeline_stage', 'in', '("ganado","perdido")');

        if (!staleContacts || staleContacts.length === 0) continue;

        for (const contact of staleContacts) {
          // Verificar si el último mensaje fue del lead (o de sistema), confirmando que el asesor NO ha respondido
          const { data: latestMsg } = await (supabaseAdmin.from('messages') as any)
            .select('sender_type, created_at')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestMsg && (latestMsg.sender_type === 'lead' || latestMsg.sender_type === 'system')) {
            // El asesor no atendió en más de slaMinutes: reasignar autónomamente
            const newAgentId = await this.findBestAvailableAgent(org.id, {
              excludeAgentId: contact.assigned_to,
            });

            if (newAgentId && newAgentId !== contact.assigned_to) {
              const { data: newProfile } = await (supabaseAdmin.from('profiles') as any)
                .select('full_name')
                .eq('id', newAgentId)
                .single();

              await (supabaseAdmin.from('contacts') as any)
                .update({
                  assigned_to: newAgentId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', contact.id);

              // Registrar nota de auditoría en el chat
              const newName = newProfile?.full_name || 'Nuevo Asesor';
              await (supabaseAdmin.from('messages') as any).insert({
                contact_id: contact.id,
                sender_type: 'system',
                content: `[⏱ Reasignación Autónoma: El asesor asignado no respondió en ${slaMinutes} min. Chat transferido a ${newName}]`,
              });

              // Despachar alerta de WhatsApp al nuevo asesor en segundo plano
              const { HandoffService } = await import('./handoff.service');
              await HandoffService.notifyHandoff({
                organizationId: org.id,
                contactId: contact.id,
                reason: `Reasignación por tiempo de espera (${slaMinutes} min sin respuesta)`,
              });

              reallocatedCount++;
              console.log(`[ASSIGNMENT SERVICE] 🔄 Contacto ${contact.id} reasignado de forma autónoma a ${newName}`);
            }
          }
        }
      }

      return { reallocatedCount };
    } catch (err) {
      console.error('[ASSIGNMENT SERVICE] Error en reassignStaleHandoffs:', err);
      return { reallocatedCount: 0 };
    }
  }
}
