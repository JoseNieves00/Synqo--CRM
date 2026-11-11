'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Zap, X, Calendar, Clock, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AssistantClientBudgetNotice } from '@/lib/ai/prompt-assistant/state';

interface AssistantUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: AssistantClientBudgetNotice | null;
}

export function AssistantUsageModal({ isOpen, onClose, budget }: AssistantUsageModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const dailyCap = budget?.dailyCap ?? 50000;
  const tokensToday = budget?.tokensToday ?? 0;
  const remainingDaily = budget?.tokensRemainingToday ?? Math.max(0, dailyCap - tokensToday);
  const remainingDailyPct = budget?.remainingDailyPct ?? (dailyCap > 0 ? Math.max(0, Math.min(100, Math.round((remainingDaily / dailyCap) * 100))) : 100);

  const weeklyCap = budget?.weeklyCap ?? 150000;
  const tokensWeekly = budget?.tokensLast7Days ?? 0;
  const remainingWeekly = budget?.tokensRemainingWeekly ?? Math.max(0, weeklyCap - tokensWeekly);
  const remainingWeeklyPct = budget?.remainingWeeklyPct ?? (weeklyCap > 0 ? Math.max(0, Math.min(100, Math.round((remainingWeekly / weeklyCap) * 100))) : 100);

  const isDailyExceeded = remainingDaily <= 0;
  const isWeeklyExceeded = remainingWeekly <= 0;

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#1E2433] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Cabecera */}
        <div className="p-4 bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#1E2433] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Capacidad del Asistente</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {remainingDailyPct}%
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tope cortesía Synqo (sin cobro a tu cuota comercial)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 space-y-4">
          {/* Card: Tope Diario */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1E2433] bg-slate-50/50 dark:bg-[#131722]/50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                <Clock className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>Tope Diario</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className={`font-bold ${isDailyExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {remainingDailyPct}%
                </span>
                <span className="text-slate-400 text-[10px]">restante</span>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[#1E2433] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remainingDailyPct > 40
                    ? 'bg-emerald-500'
                    : remainingDailyPct > 15
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, remainingDailyPct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              <span>Restante: <strong className="text-slate-800 dark:text-slate-200 font-mono">{remainingDaily.toLocaleString()}</strong> tokens</span>
              <span>Límite: <strong className="text-slate-800 dark:text-slate-200 font-mono">{dailyCap.toLocaleString()}</strong> / día</span>
            </div>

            <div className="text-[10px] text-slate-400 border-t border-slate-200/60 dark:border-[#1E2433] pt-2 flex items-center justify-between">
              <span>Consumido hoy: {tokensToday.toLocaleString()} tokens ({budget?.callsToday || 0} peticiones)</span>
              <span>Se reinicia a la medianoche</span>
            </div>
          </div>

          {/* Card: Tope Semanal */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1E2433] bg-slate-50/50 dark:bg-[#131722]/50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                <Calendar className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>Tope Semanal (Ventana móvil 7 días)</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className={`font-bold ${isWeeklyExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {remainingWeeklyPct}%
                </span>
                <span className="text-slate-400 text-[10px]">restante</span>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[#1E2433] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  remainingWeeklyPct > 40
                    ? 'bg-emerald-500'
                    : remainingWeeklyPct > 15
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, remainingWeeklyPct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              <span>Restante: <strong className="text-slate-800 dark:text-slate-200 font-mono">{remainingWeekly.toLocaleString()}</strong> tokens</span>
              <span>Límite: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weeklyCap.toLocaleString()}</strong> / semana</span>
            </div>

            <div className="text-[10px] text-slate-400 border-t border-slate-200/60 dark:border-[#1E2433] pt-2 flex items-center justify-between">
              <span>Consumo 7 días: {tokensWeekly.toLocaleString()} tokens ({budget?.callsLast7Days || 0} peticiones)</span>
              <span>Renovación: {budget?.resetHint || 'continua'}</span>
            </div>
          </div>

          {/* Información y garantía Synqo */}
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-300">
            <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              El uso del Asistente de Prompt utiliza modelos ultra-eficientes y no reduce tu saldo de tokens para clientes de WhatsApp.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-[#1E2433] dark:hover:bg-[#252C3E] text-slate-800 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
