'use client';

import React, { useState } from 'react';
import { PipelineStage } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { KanbanColumn } from './KanbanColumn';
import { updateLeadStage } from '@/app/actions/pipeline';

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: PipelineStage;
  is_ai_active: boolean;
  last_interaction_at: string;
}

interface KanbanBoardProps {
  initialContacts: ContactItem[];
}

export function KanbanBoard({ initialContacts }: KanbanBoardProps) {
  const [contacts, setContacts] = useState<ContactItem[]>(initialContacts);

  const handleMoveStage = async (contactId: string, newStage: PipelineStage) => {
    // Actualización optimista de la UI
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: newStage } : c))
    );

    try {
      await updateLeadStage(contactId, newStage);
    } catch (error) {
      console.error('Error al actualizar fase en servidor:', error);
      // Revertir estado si falla
      setContacts(initialContacts);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2">
      {PIPELINE_STAGES.map((stage) => {
        const stageContacts = contacts.filter((c) => c.pipeline_stage === stage.id);
        return (
          <KanbanColumn
            key={stage.id}
            id={stage.id}
            label={stage.label}
            colorClass={stage.color}
            contacts={stageContacts}
            onMoveStage={handleMoveStage}
          />
        );
      })}
    </div>
  );
}

