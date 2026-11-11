'use client';

import React from 'react';
import Link from 'next/link';
import { Flame, MessageSquare, UserRoundSearch, Users, Megaphone, ArrowUpRight } from 'lucide-react';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import type { LeadScoreFactor } from '@/lib/leads/lead-score';

export interface TopPropensityLeadItem {
  id: string;
  name: string | null;
  phone: string | null;
  channel: string | null;
  pipeline_stage: string | null;
  lead_score: number;
  lead_score_breakdown: LeadScoreFactor[] | null;
  deal_value: number | null;
  product_interest: string | null;
  last_interaction_at: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  calificado: 'Calificado',
  cita_agendada: 'Cita agendada',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Sin actividad';
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  return `Hace ${Math.floor(diffHr / 24)} d`;
}

export function TopPropensityWidget({ leads }: { leads: TopPropensityLeadItem[] }) {
  return (
    <div className="bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Top 10 Más Propensos a Cerrar
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Priorizados por puntaje IA (0–100) entre leads abiertos. Pasa el cursor sobre el puntaje para ver el porqué.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/clientes?sort=score_desc"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#1C2233] dark:hover:bg-[#252D42] text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            Base de Clientes
            <ArrowUpRight className="w-3 h-3 opacity-70" />
          </Link>
          <Link
            href="/campanas"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF]/10 hover:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] transition-colors"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Campañas IA
          </Link>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-[#232A3B] py-8 px-4 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no hay leads abiertos con puntaje de propensión calculado.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#232A3B] text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Cliente</th>
                <th className="py-2 pr-3 font-semibold">Score IA</th>
                <th className="py-2 pr-3 font-semibold hidden md:table-cell">Interés / Etapa</th>
                <th className="py-2 pr-3 font-semibold hidden sm:table-cell">Valor est.</th>
                <th className="py-2 pr-3 font-semibold hidden lg:table-cell">Última interacción</th>
                <th className="py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1E2536] text-sm">
              {leads.map((lead, idx) => (
                <tr
                  key={lead.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-[#192030]/60 transition-colors"
                >
                  <td className="py-2.5 pr-3 text-xs font-mono text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                      {lead.name || lead.phone || 'Sin nombre'}
                    </div>
                    {lead.phone && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {lead.phone}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <LeadScoreBadge
                      score={lead.lead_score}
                      breakdown={lead.lead_score_breakdown}
                      size="sm"
                      showLabel
                    />
                  </td>
                  <td className="py-2.5 pr-3 hidden md:table-cell">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
                      {lead.product_interest || '—'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {STAGE_LABEL[lead.pipeline_stage || 'nuevo'] || lead.pipeline_stage || 'Nuevo'}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 hidden sm:table-cell font-mono text-xs text-slate-700 dark:text-slate-200">
                    {lead.deal_value && lead.deal_value > 0
                      ? `$${Number(lead.deal_value).toLocaleString('es-CO')} COP`
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3 hidden lg:table-cell text-xs text-slate-500 dark:text-slate-400">
                    {formatRelativeTime(lead.last_interaction_at)}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/clientes?contact=${lead.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#1E2536] dark:hover:bg-[#273047] text-slate-700 dark:text-slate-200 transition-colors"
                        title="Abrir Ficha 360"
                      >
                        <UserRoundSearch className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">Ficha 360</span>
                      </Link>
                      <Link
                        href={`/inbox/${lead.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] text-white transition-colors"
                        title="Abrir chat en Inbox"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">Chat</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
