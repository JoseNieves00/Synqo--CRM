'use client';

import React from 'react';
import { InboxViewType, InboxCounts } from '@/app/actions/chat';
import { Clock, UserCheck, Bot, CalendarCheck, Archive } from 'lucide-react';

interface InboxViewsTabsProps {
  activeView: InboxViewType;
  counts: InboxCounts;
  onChangeView: (view: InboxViewType) => void;
}

export function InboxViewsTabs({ activeView, counts, onChangeView }: InboxViewsTabsProps) {
  const tabs = [
    {
      id: 'por_responder' as InboxViewType,
      label: 'Por responder',
      icon: Clock,
      count: counts.por_responder,
      color: 'text-rose-600 dark:text-rose-400',
      badgeBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      tooltip: 'Chats con espera activa que necesitan atención del asesor',
      highlightPulse: counts.por_responder > 0,
    },
    {
      id: 'mis_abiertos' as InboxViewType,
      label: 'Mis abiertos',
      icon: UserCheck,
      count: counts.mis_abiertos,
      color: 'text-[#0052FF] dark:text-[#00D2FF]',
      badgeBg: 'bg-blue-500/15 text-[#0052FF] dark:text-[#00D2FF] border-blue-500/30',
      tooltip: 'Todos mis chats asignados que aún están abiertos',
    },
    {
      id: 'ia_atendiendo' as InboxViewType,
      label: 'IA atendiendo',
      icon: Bot,
      count: counts.ia_atendiendo,
      color: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      tooltip: 'Conversaciones activas atendidas por la Inteligencia Artificial',
    },
    {
      id: 'seguimiento' as InboxViewType,
      label: 'Seguimiento',
      icon: CalendarCheck,
      count: counts.seguimiento,
      color: 'text-amber-600 dark:text-amber-400',
      badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      tooltip: 'Recordatorios de hoy, pausas de IA y cotizaciones pendientes',
    },
    {
      id: 'cerrados' as InboxViewType,
      label: 'Cerrados',
      icon: Archive,
      count: counts.cerrados,
      color: 'text-slate-500 dark:text-slate-400',
      badgeBg: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      tooltip: 'Historial de conversaciones finalizadas o archivadas',
    },
  ];

  return (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-1 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs font-medium overflow-x-auto no-scrollbar select-none">
      {tabs.map((tab) => {
        const isActive = activeView === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChangeView(tab.id)}
            title={tab.tooltip}
            className={`px-2.5 py-1.5 rounded-lg text-center transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              isActive
                ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? tab.color : 'text-slate-400'}`} />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border ${tab.badgeBg} ${
                  tab.highlightPulse ? 'animate-pulse' : ''
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
