'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ArrowRight,
  BookOpen,
  Filter,
} from 'lucide-react';
import { KnowledgeGapRow, resolveKnowledgeGapAndTrainAI, dismissKnowledgeGap } from '@/app/actions/knowledge-gaps';

interface KnowledgeGapsListProps {
  initialGaps: KnowledgeGapRow[];
}

export function KnowledgeGapsList({ initialGaps }: KnowledgeGapsListProps) {
  const [gaps, setGaps] = useState<KnowledgeGapRow[]>(initialGaps);
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingGaps = gaps.filter((g) => g.status === 'pending');

  const handleOpenAnswer = (gap: KnowledgeGapRow) => {
    setActiveGapId(gap.id);
    setAnswerText(gap.suggested_answer || '');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleResolve = async (gapId: string) => {
    if (!answerText.trim()) {
      setErrorMsg('Por favor escribe la respuesta para esta consulta.');
      return;
    }

    setSubmittingId(gapId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await resolveKnowledgeGapAndTrainAI(gapId, answerText.trim());
      if (res.success) {
        setSuccessMsg('¡Respuesta guardada con éxito! El sistema responderá automáticamente con esta información a partir de ahora.');
        setGaps((prev) =>
          prev.map((g) => (g.id === gapId ? { ...g, status: 'resolved', suggested_answer: answerText.trim() } : g))
        );
        setActiveGapId(null);
        setAnswerText('');
      } else {
        setErrorMsg(res.error || 'Error al guardar la respuesta.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDismiss = async (gapId: string) => {
    setSubmittingId(gapId);
    try {
      const res = await dismissKnowledgeGap(gapId);
      if (res.success) {
        setGaps((prev) => prev.map((g) => (g.id === gapId ? { ...g, status: 'dismissed' } : g)));
      }
    } catch (err: any) {
      alert('Error al descartar la duda: ' + err.message);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner Explicativo */}
      <div className="p-4 bg-amber-500/5 dark:bg-[#131722] border border-amber-500/20 dark:border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 rounded-xl flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Preguntas Frecuentes por Resolver
              {pendingGaps.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-bold">
                  {pendingGaps.length} pendiente{pendingGaps.length === 1 ? '' : 's'}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Consultas reales de prospectos que requirieron intervención manual. Escribe la respuesta oficial para resolverlas automáticamente en el futuro.
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
          <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {pendingGaps.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-[#131722] border border-dashed border-slate-200 dark:border-[#232A3B] rounded-2xl space-y-2 shadow-xs">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mx-auto" />
          <h5 className="text-xs font-bold text-slate-900 dark:text-white">Cero Preguntas Pendientes</h5>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Tu base de conocimiento cubre todas las consultas recientes de tus clientes.
            Cuando un prospecto pregunte algo nuevo, se registrará aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingGaps.map((gap) => {
            const isAnswering = activeGapId === gap.id;
            const isSubmitting = submittingId === gap.id;

            return (
              <div
                key={gap.id}
                className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl hover:border-amber-500/40 transition space-y-3 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-amber-500/10 text-amber-500 dark:text-amber-400 rounded-lg border border-amber-500/20">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      &quot;{gap.question_text}&quot;
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                    {gap.occurrences && gap.occurrences >= 3 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-bold" title="Esta duda se ha repetido varias veces. Es ideal para definir una regla oficial.">
                        🔥 Recurrente ({gap.occurrences} veces)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] font-medium" title="Caso puntual o aislado. Solo se recomienda entrenar si es una política general.">
                        Caso puntual ({gap.occurrences || 1} vez)
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] font-mono">
                      {gap.ai_category || 'general'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(gap.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Formulario de Respuesta / Entrenamiento */}
                {isAnswering ? (
                  <div className="p-3.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      ¿Qué debe responder tu IA cuando pregunten esto en el futuro?
                    </label>
                    <textarea
                      rows={2}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Ej: Sí, realizamos envíos a todo el país por Servientrega con flete gratis en compras sobre $150.000..."
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF]"
                    />
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveGapId(null)}
                        className="px-3 py-1.5 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleResolve(gap.id)}
                        className="px-3.5 py-1.5 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Guardar Respuesta</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Transferido para atención del asesor.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleDismiss(gap.id)}
                        className="px-2.5 py-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAnswer(gap)}
                        className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Responder Duda</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

