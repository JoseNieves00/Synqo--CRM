'use client';

import React from 'react';
import { Loader2, Pencil, RotateCcw, Sparkles, X } from 'lucide-react';

export interface ReactivationAiResult {
  detectedInterest: string;
  suggestedMessage: string;
  alternativeHook?: string | null;
}

interface ReactivationPanelProps {
  isGenerating: boolean;
  result: ReactivationAiResult | null;
  onGenerate: () => void;
  onApplyQuickText: () => void;
  onDismiss: () => void;
  onClearResult: () => void;
  onApplyDraft: (text: string) => void;
}

export function ReactivationPanel({
  isGenerating,
  result,
  onGenerate,
  onApplyQuickText,
  onDismiss,
  onClearResult,
  onApplyDraft,
}: ReactivationPanelProps) {
  return (
    <div className="mx-4 my-2 p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-300/80 dark:border-amber-500/30 text-xs shadow-xs animate-in fade-in space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 min-w-0">
          <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="truncate">
            <span className="font-bold">Lead en seguimiento (&gt;24h en silencio):</span>{' '}
            <span className="opacity-90">Reanuda la conversación con un gancho basado en su interés real.</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs transition disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Analizando interés...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-amber-200" />
                <span>Sugerir con IA</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onApplyQuickText}
            title="Pegar mensaje rápido predeterminado"
            className="px-2 py-1 rounded-lg bg-white dark:bg-[#1A1F2C] border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-[11px] font-medium hover:bg-amber-100/50 cursor-pointer transition"
          >
            <span>Texto rápido</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            title="No insistir más con este contacto"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {result && (
        <div className="p-3 bg-white/95 dark:bg-[#0D111A]/95 rounded-lg border border-amber-400/60 dark:border-amber-500/40 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-amber-100 dark:border-amber-950/40 pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] min-w-0">
              <span className="font-bold text-amber-800 dark:text-amber-300 shrink-0">🎯 Interés Detectado:</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/20 truncate">
                {result.detectedInterest}
              </span>
            </div>
            <button
              type="button"
              onClick={onClearResult}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer shrink-0"
            >
              Ocultar
            </button>
          </div>

          <div className="p-2.5 rounded-md bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/30 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
              <span>Opción A · Gancho Personalizado</span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 italic leading-relaxed">
              &quot;{result.suggestedMessage}&quot;
            </p>
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onApplyDraft(result.suggestedMessage)}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
              >
                <Pencil className="w-3 h-3" />
                <span>Usar en borrador</span>
              </button>
            </div>
          </div>

          {result.alternativeHook && (
            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <span>Opción B · Seguimiento Suave</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed">
                &quot;{result.alternativeHook}&quot;
              </p>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onApplyDraft(result.alternativeHook!)}
                  className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-[#1F2637] dark:hover:bg-[#2A334A] text-slate-800 dark:text-slate-200 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Usar en borrador</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
