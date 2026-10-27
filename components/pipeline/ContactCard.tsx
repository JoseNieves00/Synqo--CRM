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
  onMoveStage?: (contactId: string, newStage: PipelineStage) => void;
}

export function ContactCard({
  id,
  name,
  phone,
  currentStage,
  isAiActive,
  lastInteractionAt,
  onMoveStage,
}: ContactCardProps) {
  const formattedDate = new Date(lastInteractionAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm text-gray-900 truncate">
          {name || 'Lead sin nombre'}
        </h4>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isAiActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          {isAiActive ? (
            <>
              <Bot className="w-3 h-3 text-emerald-600" />
              IA Activa
            </>
          ) : (
            <>
              <User className="w-3 h-3 text-amber-600" />
              Humano
            </>
          )}
        </span>
      </div>

      <p className="text-xs text-gray-500 font-mono mb-3">{phone}</p>

      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
        <span suppressHydrationWarning className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formattedDate}
        </span>

        <Link
          href={`/inbox/${id}`}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
        >
          Ver chat <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {onMoveStage && (
        <div className="mt-3 pt-2">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block mb-1">
            Mover a etapa:
          </label>
          <select
            value={currentStage}
            onChange={(e) => onMoveStage(id, e.target.value as PipelineStage)}
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-black"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

