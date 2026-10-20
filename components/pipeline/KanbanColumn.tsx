'use client';

import React from 'react';
import { PipelineStage } from '@/lib/supabase/types';
import { ContactCard } from './ContactCard';

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: PipelineStage;
  is_ai_active: boolean;
  last_interaction_at: string;
}

interface KanbanColumnProps {
  id: PipelineStage;
  label: string;
  colorClass: string;
  contacts: ContactItem[];
  onMoveStage: (contactId: string, newStage: PipelineStage) => void;
}

export function KanbanColumn({
  id,
  label,
  colorClass,
  contacts,
  onMoveStage,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col flex-1 min-w-[280px] bg-gray-50/80 rounded-xl border border-gray-200/80 p-3 max-h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${colorClass}`}>
            {label}
          </span>
        </div>
        <span className="text-xs font-bold text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-2xs">
          {contacts.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {contacts.length === 0 ? (
          <div className="h-28 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
            <span className="text-xs text-gray-400 font-medium">Sin leads en esta fase</span>
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              id={contact.id}
              name={contact.name}
              phone={contact.phone}
              currentStage={contact.pipeline_stage}
              isAiActive={contact.is_ai_active}
              lastInteractionAt={contact.last_interaction_at}
              onMoveStage={onMoveStage}
            />
          ))
        )}
      </div>
    </div>
  );
}

