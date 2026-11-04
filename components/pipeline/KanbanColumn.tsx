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
  const [isOver, setIsOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const contactId = e.dataTransfer.getData('text/plain');
    if (contactId && onMoveStage) {
      onMoveStage(contactId, id);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col flex-1 min-w-[280px] rounded-xl border transition-all duration-200 p-3 max-h-[calc(100vh-170px)] text-slate-900 dark:text-slate-100 ${
        isOver
          ? 'bg-blue-50/50 dark:bg-[#131722] border-[#0052FF] ring-1 ring-[#0052FF]/30 shadow-md'
          : 'bg-slate-100/70 dark:bg-[#0E121B] border-slate-200 dark:border-[#1E2433]'
      }`}
    >
      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200 dark:border-[#1E2433]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md border bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-[#232A3B] shadow-2xs">
            {label}
          </span>
        </div>
        <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-[#131722] px-2 py-0.2 rounded-full border border-slate-200 dark:border-[#232A3B] shadow-2xs">
          {contacts.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {contacts.length === 0 ? (
          <div className="h-24 flex items-center justify-center border border-dashed border-slate-300 dark:border-[#232A3B] rounded-lg">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Sin prospectos en esta fase</span>
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
