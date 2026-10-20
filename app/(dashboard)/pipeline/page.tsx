import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { KanbanBoard } from '@/components/pipeline/KanbanBoard';

export default async function PipelinePage() {
  const supabase = createServerSupabaseClient();

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at')
    .order('last_interaction_at', { ascending: false });

  // Fallback con datos de muestra para visualizar el embudo si la BD está recién creada
  const initialContacts = contacts && contacts.length > 0 ? contacts : [
    {
      id: 'demo-lead-1',
      name: 'Carlos Mendoza',
      phone: '+52 55 1234 5678',
      pipeline_stage: 'calificado' as const,
      is_ai_active: true,
      last_interaction_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-lead-2',
      name: 'Mariana Gómez',
      phone: '+54 9 11 9876 5432',
      pipeline_stage: 'cita_agendada' as const,
      is_ai_active: false,
      last_interaction_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    },
    {
      id: 'demo-lead-3',
      name: 'Roberto Valdés',
      phone: '+57 300 123 4567',
      pipeline_stage: 'nuevo' as const,
      is_ai_active: true,
      last_interaction_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-lead-4',
      name: 'Dra. Elena Ruiz',
      phone: '+52 81 8765 4321',
      pipeline_stage: 'ganado' as const,
      is_ai_active: false,
      last_interaction_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Pipeline Comercial & Agendamiento
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Los estados se actualizan automáticamente cuando OpenAI ejecuta tool calls de calificación y reservas en Cal.com.
          </p>
        </div>
      </div>

      <KanbanBoard initialContacts={initialContacts} />
    </div>
  );
}

