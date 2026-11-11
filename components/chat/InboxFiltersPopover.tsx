'use client';

import type { InboxSortMode } from '@/lib/inbox/buckets';
import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, X, Check, RotateCcw } from 'lucide-react';
import { PIPELINE_STAGES } from '@/services/contact.service';
import {
  LEAD_TEMPERATURE_META,
  LEAD_TEMPERATURE_ORDER,
  type LeadTemperature,
} from '@/lib/ai/follow-up-types';

export interface FilterState {
  channel: 'all' | 'whatsapp' | 'instagram';
  agentId: string;
  stage: string;
  temperature: string;
  /** Orden de la lista: recent (WhatsApp estándar), unread_first, score, oldest, name o auto. */
  sort?: InboxSortMode;
}

export const SORT_OPTIONS: Array<{ id: InboxSortMode; label: string; hint: string }> = [
  { id: 'recent', label: '💬 Recientes (WhatsApp)', hint: 'Predeterminado de WhatsApp: mensajes más recientes arriba' },
  { id: 'unread_first', label: '🔵 No leídos primero', hint: 'Chats no leídos arriba, seguidos de los más recientes' },
  { id: 'score', label: '🔥 Más propensos', hint: 'Mayor probabilidad de compra primero (lead score)' },
  { id: 'oldest', label: '⏳ Más antiguos', hint: 'Chats con más tiempo sin interacción primero' },
  { id: 'name', label: '🔤 Nombre A-Z', hint: 'Orden alfabético por nombre del contacto' },
];

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface InboxFiltersPopoverProps {
  filters: FilterState;
  teamMembers: TeamMember[];
  currentUserId?: string;
  onChangeFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClearFilters: () => void;
}

export function InboxFiltersPopover({
  filters,
  teamMembers,
  currentUserId,
  onChangeFilter,
  onClearFilters,
}: InboxFiltersPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Contar cuántos filtros están activos (distintos a 'all' y orden distinto a predeterminado 'recent')
  const activeCount = [
    filters.channel !== 'all',
    filters.agentId !== 'all',
    filters.stage !== 'all',
    filters.temperature !== 'all',
    Boolean(filters.sort && filters.sort !== 'recent' && filters.sort !== 'auto'),
  ].filter(Boolean).length;

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
          activeCount > 0
            ? 'bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-[#00D2FF]/30 font-semibold'
            : 'bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
        }`}
        title="Orden y filtros: Canal, Asesor, Etapa y Temperatura"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-[#0052FF] text-white text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-[#131722] rounded-xl shadow-xl border border-slate-200 dark:border-[#232A3B] p-3 z-50 animate-in fade-in zoom-in-95 text-xs select-none">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 dark:border-[#232A3B]">
            <span className="font-semibold text-slate-900 dark:text-white">Filtros de conversación</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-[11px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {/* Orden de la lista */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Ordenar por
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.hint}
                    onClick={() => onChangeFilter('sort', opt.id)}
                    className={`py-1 px-1 rounded-md text-center text-[10px] font-medium transition cursor-pointer border truncate ${
                      (filters.sort || 'recent') === opt.id
                        ? 'bg-[#0052FF] text-white border-[#0052FF]'
                        : 'bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Canal */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Canal
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['all', 'whatsapp', 'instagram'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => onChangeFilter('channel', ch)}
                    className={`py-1 rounded-md text-center text-[11px] font-medium transition cursor-pointer border ${
                      filters.channel === ch
                        ? 'bg-[#0052FF] text-white border-[#0052FF]'
                        : 'bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:bg-slate-100'
                    }`}
                  >
                    {ch === 'all' ? 'Todos' : ch === 'whatsapp' ? 'WhatsApp' : 'Instagram'}
                  </button>
                ))}
              </div>
            </div>

            {/* Asesor Asignado */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Asesor
              </label>
              <select
                value={filters.agentId}
                onChange={(e) => onChangeFilter('agentId', e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
              >
                <option value="all">Todos los asesores</option>
                <option value="unassigned">Sin asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Etapa del Pipeline */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Etapa comercial
              </label>
              <select
                value={filters.stage}
                onChange={(e) => onChangeFilter('stage', e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
              >
                <option value="all">Todas las etapas</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperatura / Calificación IA */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Calificación
              </label>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { id: 'all', label: 'Todos' },
                  ...LEAD_TEMPERATURE_ORDER.map((t) => ({
                    id: t,
                    label: `${LEAD_TEMPERATURE_META[t].badge.split(' ')[0]} ${LEAD_TEMPERATURE_META[t].label}`,
                  })),
                  { id: 'unclassified', label: '❔ Sin clasif.' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChangeFilter('temperature', t.id)}
                    className={`py-1 px-1.5 rounded-md text-center text-[10px] font-medium transition cursor-pointer border truncate ${
                      filters.temperature === t.id
                        ? 'bg-[#0052FF] text-white border-[#0052FF]'
                        : 'bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Botón inferior para limpiar filtros cuando hay alguno activo */}
            {activeCount > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#232A3B]">
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar todos los filtros ({activeCount})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Muestra chips removibles para cada filtro activo
 */
export function InboxActiveFilterChips({
  filters,
  teamMembers,
  onRemoveFilter,
}: {
  filters: FilterState;
  teamMembers: TeamMember[];
  onRemoveFilter: <K extends keyof FilterState>(key: K) => void;
}) {
  const chips: Array<{ key: keyof FilterState; label: string }> = [];

  if (filters.channel !== 'all') {
    chips.push({
      key: 'channel',
      label: `Canal: ${filters.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'}`,
    });
  }

  if (filters.agentId !== 'all') {
    const agent = teamMembers.find((m) => m.id === filters.agentId);
    const agentName = filters.agentId === 'unassigned' ? 'Sin Asignar' : agent?.full_name || 'Asesor';
    chips.push({ key: 'agentId', label: `Asesor: ${agentName}` });
  }

  if (filters.stage !== 'all') {
    const stageObj = PIPELINE_STAGES.find((s) => s.id === filters.stage);
    chips.push({ key: 'stage', label: `Etapa: ${stageObj?.label || filters.stage}` });
  }

  if (filters.temperature !== 'all') {
    const meta = LEAD_TEMPERATURE_META[filters.temperature as LeadTemperature];
    const tempLabel = meta
      ? `${meta.badge.split(' ')[0]} ${meta.label}`
      : filters.temperature === 'unclassified'
      ? '❔ Sin clasificar'
      : filters.temperature;
    chips.push({ key: 'temperature', label: tempLabel });
  }

  if (filters.sort && filters.sort !== 'recent') {
    const sortLabels: Record<string, string> = {
      unread_first: 'Orden: 🔵 No leídos',
      score: 'Orden: 🔥 Más propensos',
      oldest: 'Orden: ⏳ Más antiguos',
      name: 'Orden: 🔤 Nombre A-Z',
      auto: 'Orden: Automático',
    };
    chips.push({ key: 'sort', label: sortLabels[filters.sort] || `Orden: ${filters.sort}` });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1 select-none">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20"
        >
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={() => onRemoveFilter(chip.key)}
            className="hover:text-rose-600 transition cursor-pointer"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
