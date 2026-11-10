'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Wrench } from 'lucide-react';
import type { HealthActionTarget, PromptHealthReport } from '@/lib/ai/prompt-assistant/health';

interface HealthChecklistProps {
  health: PromptHealthReport;
  onAction: (target: HealthActionTarget) => void;
}

export function HealthChecklist({ health, onAction }: HealthChecklistProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F] p-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
          <span>Salud general del prompt</span>
          <span className="font-mono text-[#0052FF] dark:text-[#00D2FF]">
            {health.completenessPct}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[#1E2433] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              health.completenessPct >= 80
                ? 'bg-emerald-500'
                : health.completenessPct >= 45
                  ? 'bg-amber-500'
                  : 'bg-[#0052FF]'
            }`}
            style={{ width: `${Math.max(4, Math.min(100, health.completenessPct))}%` }}
          />
        </div>
        {health.missingRequiredLabels.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Falta reforzar: {health.missingRequiredLabels.slice(0, 3).join(', ')}
            {health.missingRequiredLabels.length > 3 ? '...' : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {health.checks.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] p-2.5 flex items-start justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0">
              {item.status === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : item.status === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <CircleDashed className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {item.label}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                  {item.detail}
                </p>
              </div>
            </div>

            {item.actionTarget && item.status !== 'ok' && (
              <button
                type="button"
                onClick={() => onAction(item.actionTarget!)}
                className="shrink-0 px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#1E2433] hover:bg-slate-200 dark:hover:bg-[#283147] text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <Wrench className="w-3 h-3" />
                <span>{item.actionLabel || 'Arreglar'}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
