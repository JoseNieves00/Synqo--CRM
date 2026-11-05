'use client';

import React from 'react';
import { Bot, User, Clock, ArrowRight } from 'lucide-react';
import { PipelineStage } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import Link from 'next/link';

interface ContactCardProps {
  id: string;
  name: string | null;
  phone: string;
  currentStage: PipelineStage;
  isAiActive: boolean;
  lastInteractionAt: string;
  custom_fields?: any;
  onMoveStage?: (contactId: string, newStage: PipelineStage) => void;
}

function ContactCardComponent({
  id,
  name,
  phone,
  currentStage,
  isAiActive,
  lastInteractionAt,
  custom_fields,
  onMoveStage,
}: ContactCardProps) {
  const formattedDate = new Date(lastInteractionAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const dealValue = Number(custom_fields?.deal_value || 0);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]/60 dark:hover:border-[#0052FF]/60 p-3 shadow-xs hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
          {name || 'Lead sin nombre'}
        </h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {dealValue > 0 && (
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-[10px] bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-500/20">
              ${dealValue.toLocaleString('es-CO')}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
              isAiActive
                ? 'bg-blue-50 dark:bg-[#00D2FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20'
                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20'
            }`}
          >
            {isAiActive ? (
              <>
                <Bot className="w-2.5 h-2.5" />
                <span>AI</span>
              </>
            ) : (
              <>
                <User className="w-2.5 h-2.5" />
                <span>HUMAN</span>
              </>
            )}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mb-2.5">{phone}</p>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-[#1E2433]">
        <span suppressHydrationWarning className="flex items-center gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
          <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          {formattedDate}
        </span>

        <Link
          href={`/inbox/${id}`}
          prefetch={false}
          className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] hover:underline font-medium flex items-center gap-0.5"
        >
          Chat <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {onMoveStage && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#1E2433]/60 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Fase:</span>
          <select
            value={currentStage}
            onChange={(e) => onMoveStage(id, e.target.value as PipelineStage)}
            className="text-[10px] bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.id} value={s.id} className="bg-white dark:bg-[#131722] text-slate-900 dark:text-slate-200">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function areCardsEqual(prev: ContactCardProps, next: ContactCardProps) {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.phone === next.phone &&
    prev.currentStage === next.currentStage &&
    prev.isAiActive === next.isAiActive &&
    prev.lastInteractionAt === next.lastInteractionAt &&
    prev.custom_fields?.deal_value === next.custom_fields?.deal_value &&
    prev.onMoveStage === next.onMoveStage
  );
}

export const ContactCard = React.memo(ContactCardComponent, areCardsEqual);
