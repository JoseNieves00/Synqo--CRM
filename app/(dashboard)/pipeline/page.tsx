import React from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { KanbanBoard } from '@/components/pipeline/KanbanBoard';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Consultar contactos de la organización activa con límite de rendimiento
  const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields')
    .eq('organization_id', current.organization.id)
    .order('last_interaction_at', { ascending: false })
    .limit(150);

  const leadList = contacts || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Pipeline Comercial & Agendamiento
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona visualmente el avance de tus prospectos o permite que el Asistente IA actualice las etapas al confirmar citas e interés de compra.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <NewLeadModal buttonLabel="Crear Nuevo Prospecto" />
        </div>
      </div>

      {leadList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg mx-auto shadow-sm">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">El Pipeline está vacío</h3>
          <p className="text-xs text-gray-500 mt-1 mb-6">
            Aún no tienes prospectos registrados. Puedes crear tu primer lead manualmente ahora mismo o esperar mensajes entrantes por WhatsApp.
          </p>
          <NewLeadModal buttonLabel="Registrar Primer Lead" />
        </div>
      ) : (
        <KanbanBoard initialContacts={leadList} />
      )}
    </div>
  );
}
