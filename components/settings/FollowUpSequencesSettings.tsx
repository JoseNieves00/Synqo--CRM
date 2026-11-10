'use client';

import React, { useState } from 'react';
import {
  Repeat,
  Sparkles,
  Plus,
  Trash2,
  Image as ImageIcon,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import {
  FOLLOW_UP_CATEGORY_META,
  type FollowUpCategory,
  type FollowUpSettingsConfig,
  type FollowUpStep,
  createEmptyFollowUpSettings,
} from '@/lib/ai/follow-up-types';
import { saveFollowUpSequences, suggestFollowUpSequences } from '@/app/actions/settings';
import { uploadChatMedia } from '@/app/actions/chat';
import { compressImageClient } from '@/lib/media/client-compression';

interface FollowUpSequencesSettingsProps {
  initialConfig?: FollowUpSettingsConfig;
  whatsappTemplates?: Array<{ name: string; label: string }>;
}

const CATEGORIES: FollowUpCategory[] = [
  'hot_unclosed',
  'qualified_doubt',
  'warm',
  'unresponsive',
  'post_order',
];

export function FollowUpSequencesSettings({
  initialConfig,
  whatsappTemplates = [],
}: FollowUpSequencesSettingsProps) {
  const [config, setConfig] = useState<FollowUpSettingsConfig>(
    initialConfig || createEmptyFollowUpSettings()
  );
  const [expandedCat, setExpandedCat] = useState<FollowUpCategory>('hot_unclosed');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await saveFollowUpSequences(config);
      if (res.success) {
        setConfig(res.config);
        showToast('success', 'Secuencias de seguimiento guardadas y listas para envío automático.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Error al guardar las secuencias.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuggestWithAi = async () => {
    setIsSuggesting(true);
    try {
      const res = await suggestFollowUpSequences();
      if (res.success && res.suggestions) {
        setConfig((prev) => {
          const nextSequences = { ...prev.sequences };
          for (const cat of CATEGORIES) {
            const suggestedSteps = res.suggestions[cat] || [];
            if (suggestedSteps.length > 0) {
              nextSequences[cat] = {
                ...nextSequences[cat],
                enabled: cat !== 'post_order' ? true : nextSequences[cat].enabled,
                steps: suggestedSteps.map((s, idx) => ({
                  id: `${cat}-ai-${Date.now()}-${idx}`,
                  delayValue: Number(s.delayValue) || 1,
                  delayUnit: s.delayUnit === 'days' ? 'days' : 'hours',
                  text: s.text,
                  imageUrls: nextSequences[cat].steps[idx]?.imageUrls || [],
                  metaTemplateName: nextSequences[cat].steps[idx]?.metaTemplateName,
                })),
              };
            }
          }
          return { ...prev, sequences: nextSequences };
        });
        showToast(
          'success',
          'Borradores generados desde tus instrucciones de negocio. Revísalos, adjunta fotos si deseas y guarda.'
        );
      }
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudieron generar sugerencias.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddStep = (cat: FollowUpCategory) => {
    setConfig((prev) => ({
      ...prev,
      sequences: {
        ...prev.sequences,
        [cat]: {
          ...prev.sequences[cat],
          steps: [
            ...prev.sequences[cat].steps,
            {
              id: `${cat}-step-${Date.now()}`,
              delayValue: cat === 'hot_unclosed' ? 4 : 24,
              delayUnit: 'hours',
              text: '¡Hola {nombre}! Queríamos confirmar si deseas avanzar con {producto}. Quedo atento.',
              imageUrls: [],
            },
          ],
        },
      },
    }));
  };

  const handleUpdateStep = (cat: FollowUpCategory, stepIdx: number, patch: Partial<FollowUpStep>) => {
    setConfig((prev) => {
      const steps = [...prev.sequences[cat].steps];
      steps[stepIdx] = { ...steps[stepIdx], ...patch };
      return {
        ...prev,
        sequences: {
          ...prev.sequences,
          [cat]: { ...prev.sequences[cat], steps },
        },
      };
    });
  };

  const handleDeleteStep = (cat: FollowUpCategory, stepIdx: number) => {
    setConfig((prev) => ({
      ...prev,
      sequences: {
        ...prev.sequences,
        [cat]: {
          ...prev.sequences[cat],
          steps: prev.sequences[cat].steps.filter((_, i) => i !== stepIdx),
        },
      },
    }));
  };

  const handleUploadImage = async (cat: FollowUpCategory, stepIdx: number, file: File) => {
    const stepId = config.sequences[cat].steps[stepIdx]?.id || `${cat}-${stepIdx}`;
    setUploadingStepId(stepId);
    try {
      const compressed = await compressImageClient(file);
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await uploadChatMedia(fd);
      if (res?.url) {
        const currentImgs = config.sequences[cat].steps[stepIdx]?.imageUrls || [];
        handleUpdateStep(cat, stepIdx, { imageUrls: [...currentImgs, res.url].slice(0, 3) });
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Error subiendo imagen.');
    } finally {
      setUploadingStepId(null);
    }
  };

  const insertVariable = (cat: FollowUpCategory, stepIdx: number, variable: string) => {
    const current = config.sequences[cat].steps[stepIdx]?.text || '';
    handleUpdateStep(cat, stepIdx, { text: current ? `${current} ${variable}` : variable });
  };

  return (
    <div className="space-y-5 text-slate-900 dark:text-white">
      {/* Cabecera de control */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Seguimientos Automáticos por Embudo
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Envía mensajes precargados con fotos y llamado a la acción según la categoría IA del lead (sin consumo de tokens en cada envío).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSuggestWithAi}
              disabled={isSuggesting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition cursor-pointer disabled:opacity-60"
            >
              {isSuggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Sugerir con IA</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0052FF] hover:bg-[#0043D4] text-white transition cursor-pointer shadow-xs disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Guardar Secuencias</span>
            </button>
          </div>
        </div>

        {/* Interruptor Maestro y Tope Diario */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#232A3B]">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
              className="w-4 h-4 rounded text-[#0052FF] focus:ring-[#0052FF]"
            />
            <span className="text-xs font-semibold">
              Activar envío automático programado (respeta horario comercial y opt-out)
            </span>
          </label>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Tope diario anti-spam:</span>
            <input
              type="number"
              min={5}
              max={500}
              value={config.dailyCap ?? 40}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  dailyCap: Math.max(5, Math.min(500, Number(e.target.value) || 40)),
                }))
              }
              className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-center font-mono text-xs"
            />
            <span className="text-slate-500 dark:text-slate-400">envíos/día</span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Acordeones por Categoría */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const meta = FOLLOW_UP_CATEGORY_META[cat];
          const seq = config.sequences[cat];
          const isOpen = expandedCat === cat;

          return (
            <div
              key={cat}
              className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden"
            >
              <div
                onClick={() => setExpandedCat(cat)}
                className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-[#1A1F2C]/50 transition"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{meta.label}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B]">
                      {meta.badge}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {seq.steps.length} {seq.steps.length === 1 ? 'paso' : 'pasos'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{meta.description}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seq.enabled}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          sequences: {
                            ...p.sequences,
                            [cat]: { ...p.sequences[cat], enabled: e.target.checked },
                          },
                        }))
                      }
                      className="rounded text-[#0052FF]"
                    />
                    <span>Activa</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setExpandedCat(isOpen ? cat : cat)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="p-4 pt-2 border-t border-slate-100 dark:border-[#232A3B] space-y-3 bg-slate-50/40 dark:bg-[#090A0F]/40">
                  {seq.steps.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                      Aún no hay pasos configurados para esta categoría. Haz clic en &quot;Agregar Paso&quot; o usa &quot;Sugerir con IA&quot;.
                    </p>
                  ) : (
                    seq.steps.map((step, idx) => (
                      <div
                        key={step.id}
                        className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-[#0052FF] dark:text-[#00D2FF] font-mono">
                              Paso #{idx + 1}
                            </span>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-500">Esperar</span>
                            <input
                              type="number"
                              min={1}
                              max={90}
                              value={step.delayValue}
                              onChange={(e) =>
                                handleUpdateStep(cat, idx, { delayValue: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className="w-14 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-center font-mono text-xs"
                            />
                            <select
                              value={step.delayUnit}
                              onChange={(e) =>
                                handleUpdateStep(cat, idx, {
                                  delayUnit: e.target.value === 'days' ? 'days' : 'hours',
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-xs"
                            >
                              <option value="hours">Horas</option>
                              <option value="days">Días</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteStep(cat, idx)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                            title="Eliminar paso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <textarea
                          rows={3}
                          value={step.text}
                          onChange={(e) => handleUpdateStep(cat, idx, { text: e.target.value })}
                          placeholder="Escribe el mensaje con tu llamado a la acción..."
                          className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                        />

                        {/* Variables, Imagen y Plantilla Meta */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">Variables:</span>
                            {['{nombre}', '{producto}', '{empresa}'].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => insertVariable(cat, idx, v)}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-[#1A1F2C] hover:bg-blue-50 dark:hover:bg-[#0052FF]/20 border border-slate-200 dark:border-[#232A3B] cursor-pointer"
                              >
                                + {v}
                              </button>
                            ))}

                            <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 cursor-pointer hover:bg-emerald-100">
                              {uploadingStepId === step.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ImageIcon className="w-3 h-3" />
                              )}
                              <span>Adjuntar Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadImage(cat, idx, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400 text-[10px]">Plantilla Meta (&gt;24h):</span>
                            {whatsappTemplates.length > 0 ? (
                              <select
                                value={step.metaTemplateName || ''}
                                onChange={(e) =>
                                  handleUpdateStep(cat, idx, { metaTemplateName: e.target.value || undefined })
                                }
                                className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-[11px] max-w-[160px]"
                              >
                                <option value="">Sin plantilla (solo &lt;24h)</option>
                                {whatsappTemplates.map((t) => (
                                  <option key={t.name} value={t.name}>
                                    {t.label || t.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={step.metaTemplateName || ''}
                                onChange={(e) =>
                                  handleUpdateStep(cat, idx, { metaTemplateName: e.target.value || undefined })
                                }
                                placeholder="nombre_plantilla_meta"
                                className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-[11px] w-36 font-mono"
                              />
                            )}
                          </div>
                        </div>

                        {/* Previsualización de imágenes adjuntas */}
                        {step.imageUrls && step.imageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {step.imageUrls.map((url, imgIdx) => (
                              <div key={imgIdx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-[#232A3B]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateStep(cat, idx, {
                                      imageUrls: (step.imageUrls || []).filter((_, i) => i !== imgIdx),
                                    })
                                  }
                                  className="absolute top-0.5 right-0.5 p-0.5 bg-slate-900/80 text-white rounded-full hover:bg-rose-600 cursor-pointer"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={() => handleAddStep(cat)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#0052FF]" />
                    <span>Agregar Paso</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
