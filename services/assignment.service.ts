import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Servicio de Asignación Inteligente Multi-Agente
 * Implementa balanceo de carga (Load Balancing) y fallback a la cola del Administrador.
 */
export class AssignmentService {
  /**
   * Encuentra el mejor agente disponible en la organización según:
   * 1. Presencia física activa en los últimos 3 minutos (last_seen_at).
   * 2. Estado de disponibilidad 'available'.
   * 3. Rol 'agent'.
   * 4. Menor cantidad de chats activos (pipeline_stage != 'ganado' y != 'perdido').
   * 5. Límite de carga (Workload Capping) menor a maxWorkload.
   *
   * Si no hay ningún agente disponible que cumpla los criterios, retorna null
   * para que el lead pase a la Cola de Supervisión del Administrador (assigned_to = null).
   */
  static async findBestAvailableAgent(
    organizationId: string,
    maxWorkload = 15
  ): Promise<string | null> {
    try {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

      // 1. Consultar agentes activos y disponibles en la organización
      const { data: candidates, error: candidateError } = await (supabaseAdmin.from('profiles') as any)
        .select('id, full_name, email, role, last_seen_at, availability_status')
        .eq('organization_id', organizationId)
        .eq('role', 'agent')
        .gte('last_seen_at', threeMinutesAgo);

      if (candidateError || !candidates || candidates.length === 0) {
        return null;
      }

      // Filtrar aquellos que no estén en modo 'busy' u 'offline'
      const availableAgents = candidates.filter(
        (agent: any) => !agent.availability_status || agent.availability_status === 'available'
      );

      if (availableAgents.length === 0) {
        return null;
      }

      // 2. Si solo hay 1 agente disponible, verificar su carga de trabajo
      const agentIds = availableAgents.map((a: any) => a.id);

      // 3. Contar leads activos asignados a cada candidato
      const { data: activeContacts, error: countError } = await (supabaseAdmin.from('contacts') as any)
        .select('assigned_to')
        .eq('organization_id', organizationId)
        .in('assigned_to', agentIds)
        .not('pipeline_stage', 'in', '("ganado","perdido")');

      const workloadMap = new Map<string, number>();
      agentIds.forEach((id: string) => workloadMap.set(id, 0));

      if (!countError && activeContacts) {
        for (const c of activeContacts) {
          if (c.assigned_to && workloadMap.has(c.assigned_to)) {
            workloadMap.set(c.assigned_to, (workloadMap.get(c.assigned_to) || 0) + 1);
          }
        }
      }

      // 4. Filtrar agentes que no excedan el límite de carga y ordenar por menor carga
      const eligibleAgents = availableAgents
        .map((agent: any) => ({
          id: agent.id,
          workload: workloadMap.get(agent.id) || 0,
        }))
        .filter((item: any) => item.workload < maxWorkload)
        .sort((a: any, b: any) => a.workload - b.workload);

      if (eligibleAgents.length === 0) {
        // Todos los agentes disponibles están al límite de capacidad
        return null;
      }

      // 5. Retornar el agente con menor carga de trabajo (Load Balancing)
      return eligibleAgents[0].id;
    } catch (err) {
      console.error('[ASSIGNMENT SERVICE ERROR] Error buscando agente disponible:', err);
      return null;
    }
  }
}

