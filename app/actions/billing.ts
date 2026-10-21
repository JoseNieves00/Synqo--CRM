'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Permite al Administrador de una empresa suspendida descargar un respaldo completo
 * de todos sus prospectos, etapas y notas en formato CSV compatible con Excel (UTF-8 BOM).
 * Cumple con la cláusula contractual de propiedad y exportación de datos del cliente.
 */
export async function exportSuspendedCompanyDataAction() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('No autenticado.');
  }

  // 1. Obtener perfil y validar organización
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Organización no encontrada.');
  }

  // Solo administradores o superadmin pueden exportar la base de datos de la empresa
  if (profile.role !== 'admin' && !profile.is_super_admin) {
    throw new Error('Solo el administrador de la cuenta tiene autorización para descargar el respaldo de datos.');
  }

  // 2. Obtener datos de la organización
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name')
    .eq('id', profile.organization_id)
    .single();

  const orgName = org?.name || 'empresa';

  // 3. Obtener contactos de la organización
  const { data: contacts, error } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone, pipeline_stage, is_ai_active, created_at, last_interaction_at')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Error obteniendo prospectos: ${error.message}`);
  }

  // 4. Formatear como CSV con Excel UTF-8 BOM
  const headers = ['Nombre', 'WhatsApp / Teléfono', 'Etapa Pipeline', 'Control', 'Fecha Creación', 'Última Interacción'];
  const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

  const rows = (contacts || []).map((c) => [
    escapeCsv(c.name || 'Sin nombre'),
    escapeCsv(c.phone),
    escapeCsv(c.pipeline_stage),
    escapeCsv(c.is_ai_active ? 'IA Activa' : 'Asesor Humano'),
    escapeCsv(c.created_at ? new Date(c.created_at).toLocaleString('es-CO') : ''),
    escapeCsv(c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleString('es-CO') : ''),
  ]);

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const safeOrgName = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filename = `respaldo-contactos-${safeOrgName}-${new Date().toISOString().slice(0, 10)}.csv`;

  return {
    success: true,
    csvContent,
    filename,
    totalRecords: contacts?.length || 0,
  };
}
