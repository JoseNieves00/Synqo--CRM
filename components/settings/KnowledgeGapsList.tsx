'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
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
  Zap,
} from 'lucide-react';
import { KnowledgeGapRow, resolveKnowledgeGapAndTrainAI, dismissKnowledgeGap } from '@/app/actions/knowledge-gaps';

interface KnowledgeGapsListProps {
  initialGaps: KnowledgeGapRow[];
  onPromptUpdated?: (newPrompt: string, newStructuredData?: any) => void;
}

export function KnowledgeGapsList({ initialGaps, onPromptUpdated }: KnowledgeGapsListProps) {
  const [gaps, setGaps] = useState<KnowledgeGapRow[]>(initialGaps);
  const [viewTab, setViewTab] = useState<'pending' | 'resolved'>('pending');
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [createSnippet, setCreateSnippet] = useState(false);
  const [snippetShortcut, setSnippetShortcut] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingGaps = useMemo(() => gaps.filter((g) => g.status === 'pending'), [gaps]);
  const resolvedGaps = useMemo(() => gaps.filter((g) => g.status === 'resolved'), [gaps]);

  // Categorías únicas con sus respectivos conteos
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of pendingGaps) {
      const cat = g.ai_category || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [pendingGaps]);

  const categories = useMemo(() => Object.keys(categoryCounts), [categoryCounts]);

  const filteredPendingGaps = useMemo(() => {
    if (selectedCategory === 'all') return pendingGaps;
    return pendingGaps.filter((g) => (g.ai_category || 'general') === selectedCategory);
  }, [pendingGaps, selectedCategory]);

  const handleOpenAnswer = (gap: KnowledgeGapRow) => {
    setActiveGapId(gap.id);
    setAnswerText(gap.suggested_answer || '');
    setCreateSnippet(false);
    const catCode = (gap.ai_category || 'info').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
    setSnippetShortcut(`/${catCode}`);
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
      const res = await resolveKnowledgeGapAndTrainAI(gapId, answerText.trim(), {
        createQuickSnippet: createSnippet,
        shortcut: snippetShortcut,
      });
      if (res.success) {
        const extraNote = res.snippetCreated ? ' Además, se agregó a tus Atajos Rápidos (/).' : '';
        setSuccessMsg(`¡Respuesta guardada con éxito! La IA ahora responderá con esta directriz automáticamente.${extraNote}`);
        setGaps((prev) =>
          prev.map((g) => (g.id === gapId ? { ...g, status: 'resolved', suggested_answer: answerText.trim(), resolved_at: new Date().toISOString() } : g))
        );
        setActiveGapId(null);
        setAnswerText('');
        setCreateSnippet(false);

        // Notificar al formulario padre de Settings para mantener el prompt sincronizado en memoria
        if (res.updatedPrompt) {
          onPromptUpdated?.(res.updatedPrompt, (res as any).updatedStructuredData);
        }
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
      {/* Banner Explicativo con Selector de Pestañas */}
      <div className="p-4 bg-amber-500/5 dark:bg-[#131722] border border-amber-500/20 dark:border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 rounded-xl flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Bucle de Aprendizaje: Preguntas Frecuentes
              {pendingGaps.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-bold">
                  {pendingGaps.length} por resolver
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Consultas reales de prospectos que requirieron intervención manual. Al responderlas aquí, la IA se entrena y responderá automáticamente en el futuro.
            </p>
          </div>
        </div>

        {/* Pestañas: Por Resolver vs Resueltas */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#090A0F] p-1 rounded-xl shrink-0 border border-slate-200 dark:border-[#232A3B]">
          <button
            type="button"
            onClick={() => setViewTab('pending')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'pending'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Por Resolver ({pendingGaps.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('resolved')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'resolved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Resueltas ({resolvedGaps.length})</span>
          </button>
        </div>
      </div>

      {/* Píldoras de Filtro por Categoría / Tópico */}
      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1A1F2C] dark:text-slate-400 dark:hover:bg-[#232A3B]'
            }`}
          >
            Todas ({pendingGaps.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer capitalize ${
                selectedCategory === cat
                  ? 'bg-[#0052FF] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1A1F2C] dark:text-slate-400 dark:hover:bg-[#232A3B]'
              }`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      )}

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

      {viewTab === 'pending' ? (
        filteredPendingGaps.length === 0 ? (
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
            {filteredPendingGaps.map((gap) => {
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

                      {/* Checkbox opcional de Crear Atajo Rápido (/) */}
                      <div className="p-2.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-lg space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={createSnippet}
                            onChange={(e) => setCreateSnippet(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#0052FF] focus:ring-[#0052FF]"
                          />
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>Crear también como Atajo Rápido (/) para el equipo comercial</span>
                        </label>
                        {createSnippet && (
                          <div className="flex items-center gap-2 pl-5 pt-1 animate-in fade-in duration-100">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Comando:</span>
                            <input
                              type="text"
                              value={snippetShortcut}
                              onChange={(e) => setSnippetShortcut(e.target.value)}
                              placeholder="/atajo"
                              className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white font-mono focus:outline-none"
                            />
                          </div>
                        )}
                      </div>

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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Transferido para atención del asesor.
                        </span>
                        {gap.contact_id && (
                          <Link
                            href={`/inbox/${gap.contact_id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline"
                          >
                            <span>Ver conversación en Inbox</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
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
        )
      ) : (
        /* Vista de Preguntas Resueltas */
        resolvedGaps.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-[#131722] border border-dashed border-slate-200 dark:border-[#232A3B] rounded-2xl space-y-2 shadow-xs">
            <HelpCircle className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
            <h5 className="text-xs font-bold text-slate-900 dark:text-white">Aún no hay preguntas resueltas</h5>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Cuando respondas dudas en la pestaña &quot;Por Resolver&quot;, aparecerán aquí para que puedas consultar cómo responde tu IA o modificar las respuestas cuando desees.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {resolvedGaps.map((gap) => {
              const isAnswering = activeGapId === gap.id;
              const isSubmitting = submittingId === gap.id;

              return (
                <div
                  key={gap.id}
                  className="p-4 bg-white dark:bg-[#131722] border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl hover:border-emerald-500/50 transition space-y-3 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        &quot;{gap.question_text}&quot;
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                        ✅ Activa en IA
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] font-mono">
                        {gap.ai_category || 'general'}
                      </span>
                      {gap.resolved_at && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(gap.resolved_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isAnswering ? (
                    <div className="p-3.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Modificar respuesta oficial aprendida por la IA:
                      </label>
                      <textarea
                        rows={2}
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Escribe la nueva directriz..."
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
                          <span>Actualizar Respuesta</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-500/5 dark:bg-[#090A0F] border border-emerald-500/20 dark:border-[#232A3B] rounded-xl flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                          Respuesta activa de la IA:
                        </span>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                          {gap.suggested_answer || 'Respuesta guardada.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenAnswer(gap)}
                        className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] rounded-lg text-[11px] font-semibold transition shrink-0 cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

