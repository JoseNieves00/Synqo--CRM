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
      setErrorMsg('Por favor escribe la respuesta que debe dar la IA.');
      return;
    }

    setSubmittingId(gapId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await resolveKnowledgeGapAndTrainAI(gapId, answerText.trim());
      if (res.success) {
        setSuccessMsg('¡IA entrenada exitosamente! La respuesta fue anexada a las políticas y la IA la usará de inmediato.');
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
      <div className="p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 text-amber-500 rounded-xl flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900 flex items-center gap-2">
              Bucle de Aprendizaje Continuo (Knowledge Gaps)
              {pendingGaps.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black">
                  {pendingGaps.length} pendiente{pendingGaps.length === 1 ? '' : 's'}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Aquí aparecen las preguntas reales que tus clientes hicieron en WhatsApp y que tu IA no supo responder.
              Escribe la respuesta en 1 frase y la IA aprenderá de inmediato.
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
          <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {pendingGaps.length === 0 ? (
        <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h5 className="text-xs font-bold text-gray-800">Cero Preguntas Pendientes</h5>
          <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
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
                className="p-4 bg-white border border-gray-200 rounded-2xl shadow-2xs hover:border-amber-300 transition space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-amber-50 text-amber-700 rounded-lg">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-gray-900">
                      &quot;{gap.question_text}&quot;
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
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
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold text-gray-700">
                      ¿Qué debe responder tu IA cuando pregunten esto en el futuro?
                    </label>
                    <textarea
                      rows={2}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Ej: Sí, realizamos envíos a todo el país por Servientrega con flete gratis en compras sobre $150.000..."
                      className="w-full text-xs p-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                    />
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveGapId(null)}
                        className="px-3 py-1.5 rounded-lg text-[11px] text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleResolve(gap.id)}
                        className="px-3.5 py-1.5 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Entrenar IA en 1 Clic</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-400">
                      Relevo activado en WhatsApp para atención del asesor.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleDismiss(gap.id)}
                        className="px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-600 transition cursor-pointer"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAnswer(gap)}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Entrenar IA</span>
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

