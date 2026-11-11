'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Paperclip,
  SearchCheck,
  Send,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import {
  PROMPT_BLUEPRINT_SLOTS,
  PROMPT_SECTIONS,
  type BlueprintSlot,
} from '@/lib/ai/prompt-assistant/blueprint';
import type {
  AssistantClientBudgetNotice,
  PendingSectionProposal,
  PromptAssistantState,
} from '@/lib/ai/prompt-assistant/state';
import type { ImportedCatalogItem } from '@/lib/ai/prompt-assistant/file-import';
import type { SmartSuggestionItem } from '@/lib/ai/prompt-assistant/smart-suggestions';
import { VoiceRecorder } from './VoiceRecorder';
import { SectionProposalCard } from './SectionProposalCard';
import { CatalogImportPreview, type PendingImportState } from './CatalogImportPreview';

export interface AssistantChatFeedItem {
  id: string;
  role: 'assistant' | 'user' | 'notice';
  text: string;
}

interface AssistantChatProps {
  state: PromptAssistantState;
  preset: IndustryPreset;
  currentPrompt: string;
  activeSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  feed: AssistantChatFeedItem[];
  conflicts: string[];
  smartSuggestions?: SmartSuggestionItem[];
  dailyLimitReached: boolean;
  budgetNotice?: AssistantClientBudgetNotice | null;
  onOpenUsageModal?: () => void;
  onSubmitAnswer: (slot: BlueprintSlot | null, answer: string) => Promise<void>;
  onAnalyzeExisting: () => Promise<void>;
  onAcceptProposal: (proposal: PendingSectionProposal) => Promise<void>;
  onRejectProposal: (proposalId: string) => Promise<void>;
  onPolishPrompt?: () => Promise<void>;
  polishingPrompt?: boolean;
  polishPreview?: {
    polishedPrompt: string;
    tokensBefore: number;
    tokensAfter: number;
  } | null;
  applyingPolish?: boolean;
  onConfirmPolish?: () => Promise<void>;
  onCancelPolish?: () => void;
  onOpenSandbox?: () => void;
  onSaveImportedCatalog: (items: ImportedCatalogItem[]) => Promise<void>;
  onExtractPdfBlocks: (
    blocks: string[],
    meta: { fileName: string }
  ) => Promise<void>;
  pendingImport: PendingImportState | null;
  setPendingImport: React.Dispatch<React.SetStateAction<PendingImportState | null>>;
  onPushNotice: (text: string) => void;
}

export function AssistantChat({
  state,
  preset,
  currentPrompt,
  activeSlotId,
  onSelectSlot,
  feed,
  conflicts,
  smartSuggestions = [],
  dailyLimitReached,
  budgetNotice,
  onOpenUsageModal,
  onSubmitAnswer,
  onAnalyzeExisting,
  onAcceptProposal,
  onRejectProposal,
  onPolishPrompt,
  polishingPrompt,
  polishPreview,
  applyingPolish,
  onConfirmPolish,
  onCancelPolish,
  onOpenSandbox,
  onSaveImportedCatalog,
  onExtractPdfBlocks,
  pendingImport,
  setPendingImport,
  onPushNotice,
}: AssistantChatProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFreeMode = !activeSlotId || activeSlotId === 'free';

  const activeSlot = useMemo(() => {
    if (isFreeMode) return null;
    return (
      PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === activeSlotId) ||
      PROMPT_BLUEPRINT_SLOTS[0]
    );
  }, [activeSlotId, isFreeMode]);

  const slotChips = useMemo(() => {
    const base = activeSlot?.chips ? activeSlot.chips(preset) : [];
    return base;
  }, [activeSlot, preset]);

  const handleSend = async (textOverride?: string) => {
    const val = (textOverride ?? inputText).trim();
    if (!val || sending) return;
    if (!isFreeMode && !activeSlot) return;
    if (!textOverride) setInputText('');
    setSending(true);
    try {
      await onSubmitAnswer(isFreeMode ? null : activeSlot, val);
    } finally {
      setSending(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await onAnalyzeExisting();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = file.name.toLowerCase();
    const kind = name.endsWith('.pdf') ? 'pdf' : 'spreadsheet';

    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);

      const res = await fetch('/api/settings/prompt-assistant/import', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();

      if (!res.ok) {
        onPushNotice(data?.error || 'No se pudo procesar el archivo.');
        return;
      }

      if (data.kind === 'spreadsheet') {
        setPendingImport({
          type: 'spreadsheet',
          fileName: file.name,
          totalRows: Number(data.totalRows || 0),
          items: Array.isArray(data.items) ? data.items : [],
          exceededInlineLimit: Boolean(data.exceededInlineLimit),
          catalogInlineMax: Number(data.catalogInlineMax || 15),
        });
      } else if (data.kind === 'pdf') {
        setPendingImport({
          type: 'pdf_confirm',
          fileName: file.name,
          totalPages: Number(data.totalPages || 0),
          pagesProcessed: Number(data.pagesProcessed || 0),
          blocks: Array.isArray(data.blocks) ? data.blocks : [],
        });
      }
    } catch (err: any) {
      onPushNotice(err?.message || 'Error al subir el catálogo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const hasPromptBody = currentPrompt.trim().length >= 35;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Modo libre vs guía opcional + botón analizar prompt existente */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => onSelectSlot('free')}
              className={`px-2 py-1 rounded-md transition cursor-pointer ${
                isFreeMode
                  ? 'bg-[#0052FF] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Chat libre
            </button>
            <button
              type="button"
              onClick={() => onSelectSlot(PROMPT_BLUEPRINT_SLOTS[0].id)}
              className={`px-2 py-1 rounded-md transition cursor-pointer ${
                !isFreeMode
                  ? 'bg-[#0052FF] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Guía
            </button>
          </div>

          {!isFreeMode && (
            <select
              value={activeSlot?.id || ''}
              onChange={(e) => onSelectSlot(e.target.value)}
              className="text-[11px] font-medium px-2 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-200 max-w-[155px]"
              title="Cambiar de tema en la guía"
            >
              {PROMPT_BLUEPRINT_SLOTS.map((slot) => {
                const done = state.sectionStatus[slot.sectionId] === 'complete';
                return (
                  <option key={slot.id} value={slot.id}>
                    {done ? '✓ ' : ''}
                    {PROMPT_SECTIONS.find((sec) => sec.id === slot.sectionId)?.order}. {slot.sectionTitle}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {hasPromptBody && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || dailyLimitReached}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#232A3B] text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SearchCheck className="w-3.5 h-3.5" />
            )}
            <span>Detectar vacíos</span>
          </button>
        )}
      </div>

      {/* Área scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {conflicts.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/25 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Observaciones de orden y posibles contradicciones (no se pegan al prompt):</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {conflicts.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
            {onPolishPrompt && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onPolishPrompt}
                  disabled={polishingPrompt || dailyLimitReached}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {polishingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>Organizar y unificar secciones automáticamente</span>
                </button>
              </div>
            )}
          </div>
        )}

        {polishPreview && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Vista previa simplificada</span>
              </span>
              {polishPreview.tokensBefore > 0 && polishPreview.tokensAfter < polishPreview.tokensBefore && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                  -{Math.max(1, Math.round(((polishPreview.tokensBefore - polishPreview.tokensAfter) / polishPreview.tokensBefore) * 100))}% más compacto
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              Conservamos tus precios, medidas, cuentas, reglas y formato; eliminamos duplicados y redundancias.
            </p>
            <div className="max-h-44 overflow-y-auto rounded-lg bg-white dark:bg-[#090A0F] border border-emerald-200/80 dark:border-[#1E2433] p-2 text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {polishPreview.polishedPrompt.split('=== CATÁLOGO VISUAL DE PRODUCTOS')[0].trim()}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelPolish}
                disabled={applyingPolish}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2433] cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={onConfirmPolish}
                disabled={applyingPolish}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {applyingPolish && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Aplicar simplificación</span>
              </button>
            </div>
          </div>
        )}

        {state.pendingProposals.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mejoras sugeridas ({state.pendingProposals.length})
            </div>
            {state.pendingProposals.map((prop) => (
              <SectionProposalCard
                key={prop.id}
                proposal={prop}
                onAccept={onAcceptProposal}
                onReject={onRejectProposal}
              />
            ))}
          </div>
        )}

        {pendingImport && (
          <CatalogImportPreview
            pending={pendingImport}
            onConfirmSpreadsheetOrPdfItems={onSaveImportedCatalog}
            onConfirmPdfExtraction={(blocks) =>
              onExtractPdfBlocks(blocks, { fileName: pendingImport.fileName })
            }
            onCancel={() => setPendingImport(null)}
          />
        )}

        {/* Modo libre: redacta o dicta lo que necesites sin elegir sección manualmente */}
        {isFreeMode && (
          <div className="rounded-2xl rounded-tl-xs border border-blue-200/80 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0052FF] dark:text-[#00D2FF] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Chat libre · Especialización comercial
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
              Escribe o dicta cualquier regla, producto, precio, horario o ajuste para tu IA.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Identifico automáticamente en qué apartado ubicarlo sin borrar lo que ya configuraste.
            </p>

            {/* Sugerencias comerciales inteligentes por nicho y táctica */}
            {smartSuggestions.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span>💡 Tácticas recomendadas para tu negocio:</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {smartSuggestions.slice(0, 4).map((sug) => (
                    <div
                      key={sug.id}
                      className="p-2 rounded-xl bg-white dark:bg-[#131722] border border-blue-100 dark:border-[#232A3B] hover:border-[#0052FF]/40 dark:hover:border-[#00D2FF]/40 transition text-left flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <span>{sug.badge}</span>
                          <span>{sug.title}</span>
                        </span>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => handleSend(sug.instructionToApply)}
                          className="px-2 py-0.5 rounded-md bg-[#0052FF] hover:bg-[#0040CC] text-white text-[10px] font-bold transition cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          + Agregar
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        {sug.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {[
                'Nuevo producto/servicio: ',
                'Horario de atención y cobertura: ',
                'Método de pago y cuentas: ',
              ].map((starter, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(starter)}
                  className="px-2.5 py-1 rounded-full bg-white dark:bg-[#131722] hover:bg-blue-100/70 dark:hover:bg-[#1E2433] border border-blue-200 dark:border-[#232A3B] text-[10px] font-medium text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  {starter.replace(': ', '')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pregunta guiada del slot actual (solo cuando el usuario elige "Guía") */}
        {activeSlot && (
          <div className="rounded-2xl rounded-tl-xs border border-blue-200/80 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0052FF] dark:text-[#00D2FF] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {activeSlot.sectionTitle}
                {activeSlot.required ? ' · Clave' : ' · Opcional'}
              </span>
              {state.sectionStatus[activeSlot.sectionId] === 'complete' && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Listo
                </span>
              )}
            </div>

            <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
              {activeSlot.question}
            </p>
            {activeSlot.help && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {activeSlot.help}
              </p>
            )}

            {(slotChips.length > 0 || !activeSlot.required) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {slotChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={sending}
                    onClick={() => handleSend(chip)}
                    className="px-2.5 py-1 rounded-full bg-white dark:bg-[#131722] hover:bg-blue-100/70 dark:hover:bg-[#1E2433] border border-blue-200 dark:border-[#232A3B] text-[11px] font-medium text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
                {!activeSlot.required && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => handleSend('No aplica')}
                    className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#232A3B] text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer"
                  >
                    <SkipForward className="w-3 h-3" />
                    <span>Omitir</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Historial reciente de respuestas */}
        {feed.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#0052FF] text-white rounded-tr-xs'
                  : msg.role === 'notice'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 text-amber-800 dark:text-amber-200'
                    : 'bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200 rounded-tl-xs'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {feed.length > 0 && onOpenSandbox && hasPromptBody && (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={onOpenSandbox}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>Probar estos cambios en el simulador (Sandbox)</span>
            </button>
          </div>
        )}
      </div>

      {/* Barra inferior: adjuntar Excel/PDF + nota de voz + textarea/input */}
      <div className="p-2.5 border-t border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] shrink-0 space-y-1.5">
        {dailyLimitReached ? (
          <div
            onClick={onOpenUsageModal}
            className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition flex items-center justify-between gap-2"
          >
            <span>
              Alcanzaste tu capacidad ({budgetNotice?.limitScope === 'weekly' ? 'semanal' : 'diaria'}; se renueva {budgetNotice?.resetHint || 'pronto'}).
            </span>
            <span className="underline font-semibold shrink-0">Ver detalle</span>
          </div>
        ) : budgetNotice?.showNotice ? (
          <button
            type="button"
            onClick={onOpenUsageModal}
            className="w-full flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1 transition cursor-pointer text-left"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span>Tokens diarios restantes: <strong>{budgetNotice.remainingDailyPct ?? 100}%</strong></span>
              <span className="text-slate-400">·</span>
              <span className="text-[9px] text-[#0052FF] dark:text-[#00D2FF] hover:underline font-medium">Ver desglose</span>
            </div>
            <div className="w-14 h-1.5 rounded-full bg-slate-200 dark:bg-[#1E2433] overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full transition-all ${
                  (budgetNotice.remainingDailyPct ?? 100) > 40
                    ? 'bg-emerald-500'
                    : (budgetNotice.remainingDailyPct ?? 100) > 15
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, budgetNotice.remainingDailyPct ?? 100))}%` }}
              />
            </div>
          </button>
        ) : null}

        <div className="flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploadingFile}
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-40 shrink-0"
            title="Subir catálogo en Excel, CSV o PDF"
          >
            {uploadingFile ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#0052FF]" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          <VoiceRecorder
            disabled={sending || dailyLimitReached}
            onTranscribed={(txt) =>
              setInputText((prev) => (prev.trim() ? `${prev.trim()} ${txt}` : txt))
            }
            onError={onPushNotice}
          />

          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe o dicta tu respuesta aquí..."
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF] resize-none"
          />

          <button
            type="button"
            disabled={sending || !inputText.trim()}
            onClick={() => handleSend()}
            className="p-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white transition cursor-pointer disabled:opacity-40 shrink-0"
            title="Enviar respuesta"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
