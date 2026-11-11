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
  deal_value?: number | null;
  custom_fields?: any;
  lead_score?: number | null;
  lead_score_breakdown?: any;
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
  const [visibleLimit, setVisibleLimit] = React.useState(20);

  // Sumatoria monetaria de los tratos en esta columna
  const totalAmount = React.useMemo(() => {
    return contacts.reduce((sum, c) => {
      const val = Number(c.deal_value ?? c.custom_fields?.deal_value ?? c.custom_fields?.order?.total ?? 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [contacts]);

  // Si la cantidad de contactos cambia drásticamente, mantener un límite consistente
  const visibleContacts = contacts.slice(0, visibleLimit);
  const remainingCount = contacts.length - visibleLimit;

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
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md border bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-[#232A3B] shadow-2xs truncate">
            {label}
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-[#131722] px-1.5 py-0.2 rounded-full border border-slate-200 dark:border-[#232A3B] shadow-2xs shrink-0">
            {contacts.length}
          </span>
        </div>
        {totalAmount > 0 && (
          <span
            className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20 shrink-0 shadow-2xs"
            title={`Valor total en esta fase: $${totalAmount.toLocaleString('es-CO')}`}
          >
            ${totalAmount.toLocaleString('es-CO')}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {contacts.length === 0 ? (
          <div className="h-24 flex items-center justify-center border border-dashed border-slate-300 dark:border-[#232A3B] rounded-lg">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Sin prospectos en esta fase</span>
          </div>
        ) : (
          <>
            {visibleContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                id={contact.id}
                name={contact.name}
                phone={contact.phone}
                currentStage={contact.pipeline_stage}
                isAiActive={contact.is_ai_active}
                lastInteractionAt={contact.last_interaction_at}
                dealValue={contact.deal_value}
                custom_fields={contact.custom_fields}
                leadScore={contact.lead_score}
                leadScoreBreakdown={contact.lead_score_breakdown}
                onMoveStage={onMoveStage}
              />
            ))}

            {remainingCount > 0 && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 25)}
                className="w-full py-2 text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:text-blue-700 dark:hover:text-cyan-300 bg-white/70 dark:bg-[#131722]/80 hover:bg-white dark:hover:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl transition text-center shadow-2xs"
              >
                + Ver {remainingCount} prospectos más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
