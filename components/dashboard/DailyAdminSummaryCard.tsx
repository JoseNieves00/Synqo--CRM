import React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck2, Lightbulb, Sparkles } from 'lucide-react';
import type { DailyAdminSummaryPayload } from '@/services/daily-summary.service';

interface DailyAdminSummaryCardProps {
  summary: DailyAdminSummaryPayload | null | undefined;
}

export function DailyAdminSummaryCard({ summary }: DailyAdminSummaryCardProps) {
  if (!summary) return null;

  const { metrics, shortSummary, actionableTip, tipActionHref, tipActionLabel, dateLabel } = summary;

  return (
    <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 shadow-xs space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <CalendarCheck2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Resumen Diario de Operación
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
              Ayer · {dateLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0E121B] border border-slate-200 dark:border-[#232A3B] font-semibold text-slate-700 dark:text-slate-200 font-tabular">
            {metrics.newLeads} leads nuevos
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0E121B] border border-slate-200 dark:border-[#232A3B] font-semibold text-slate-700 dark:text-slate-200 font-tabular">
            {metrics.aiReplies} IA · {metrics.humanReplies} asesor
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 font-semibold text-emerald-700 dark:text-emerald-300 font-tabular">
            {metrics.wonDeals} cierres
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        {shortSummary}
      </p>

      <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
            <span className="font-bold">Tip para hoy: </span>
            {actionableTip}
          </p>
        </div>
        {tipActionHref && tipActionLabel && (
          <Link
            href={tipActionHref}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0052FF] dark:text-[#00D2FF] hover:underline shrink-0 self-start sm:self-center"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{tipActionLabel}</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
