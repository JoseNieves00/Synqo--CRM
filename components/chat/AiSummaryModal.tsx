'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  RotateCcw,
  Target,
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
} from 'lucide-react';
import { generateContactAiSummary } from '@/app/actions/chat';

export interface AiSummaryData {
  product_interest: string;
  objections_doubts: string;
  next_step: string;
  summary_text: string;
  generated_at?: string;
}

interface AiSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  initialSummary?: AiSummaryData | null;
  onSummaryUpdated?: (summary: AiSummaryData) => void;
}

export default function AiSummaryModal({
  isOpen,
  onClose,
  contactId,
  contactName,
  initialSummary,
  onSummaryUpdated,
}: AiSummaryModalProps) {
  const [summary, setSummary] = useState<AiSummaryData | null>(initialSummary || null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar automáticamente si no hay resumen previo al abrir el modal
  React.useEffect(() => {
    if (isOpen) {
      if (initialSummary) {
        setSummary(initialSummary);
      } else {
        handleGenerate();
      }
    }
  }, [isOpen, initialSummary, contactId]);

  if (!isOpen) return null;

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await generateContactAiSummary(contactId);
      setSummary(data);
      onSummaryUpdated?.(data);
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar el resumen con IA.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    if (!summary) return;
    const textToCopy = `📋 RESUMEN COMERCIAL - ${contactName}\n\n🎯 Interés: ${summary.product_interest}\n⚠️ Duda/Objeción: ${summary.objections_doubts}\n👉 Siguiente paso: ${summary.next_step}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formattedDate = summary?.generated_at
    ? new Date(summary.generated_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado Pinned */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-[#232A3B] flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-transparent dark:from-[#0052FF]/10 dark:via-indigo-950/20 dark:to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Resumen Ejecutivo con IA
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold">
                  Gemini Flash
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                {contactName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1 min-h-0 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#0052FF] dark:text-[#00D2FF] animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Analizando conversación y catálogo...
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Extrayendo producto de interés, objeciones y siguiente paso
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-200 text-xs">
              <p className="font-semibold mb-1">Error al procesar el resumen</p>
              <p className="opacity-90">{error}</p>
              <button
                onClick={handleGenerate}
                className="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reintentar
              </button>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {/* Tarjeta 1: Producto / Interés */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200/80 dark:border-[#232A3B] transition hover:border-blue-300 dark:hover:border-blue-500/30">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 mb-1.5">
                  <Target className="w-4 h-4 shrink-0" />
                  <span>1. Producto o Servicio de Interés</span>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium pl-6">
                  {summary.product_interest}
                </p>
              </div>

              {/* Tarjeta 2: Dudas u Objeciones */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200/80 dark:border-[#232A3B] transition hover:border-amber-300 dark:hover:border-amber-500/30">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>2. Duda u Objeción Principal</span>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium pl-6">
                  {summary.objections_doubts}
                </p>
              </div>

              {/* Tarjeta 3: Siguiente Paso */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 transition">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">
                  <ArrowRight className="w-4 h-4 shrink-0" />
                  <span>3. Siguiente Paso Recomendado para el Asesor</span>
                </div>
                <p className="text-xs text-slate-900 dark:text-slate-100 leading-relaxed font-semibold pl-6">
                  {summary.next_step}
                </p>
              </div>

              {/* Marca temporal */}
              {formattedDate && (
                <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                  <Clock className="w-3 h-3" />
                  <span>Generado: {formattedDate}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Pie de modal Pinned */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-[#232A3B] flex items-center justify-between bg-slate-50/50 dark:bg-[#090A0F]/50">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Volver a analizar la conversación con los mensajes nuevos"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Regenerar</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!summary || isLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
