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
import type { PendingSectionProposal, PromptAssistantState } from '@/lib/ai/prompt-assistant/state';
import type { ImportedCatalogItem } from '@/lib/ai/prompt-assistant/file-import';
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
  dailyLimitReached: boolean;
  onSubmitAnswer: (slot: BlueprintSlot, answer: string) => Promise<void>;
  onAnalyzeExisting: () => Promise<void>;
  onAcceptProposal: (proposal: PendingSectionProposal) => Promise<void>;
  onRejectProposal: (proposalId: string) => Promise<void>;
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
  dailyLimitReached,
  onSubmitAnswer,
  onAnalyzeExisting,
  onAcceptProposal,
  onRejectProposal,
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

  const activeSlot = useMemo(() => {
    return (
      PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === activeSlotId) ||
      PROMPT_BLUEPRINT_SLOTS[0]
    );
  }, [activeSlotId]);

  const slotChips = useMemo(() => {
    const base = activeSlot?.chips ? activeSlot.chips(preset) : [];
    return base;
  }, [activeSlot, preset]);

  const handleSend = async (textOverride?: string) => {
    const val = (textOverride ?? inputText).trim();
    if (!val || sending || !activeSlot) return;
    if (!textOverride) setInputText('');
    setSending(true);
    try {
      await onSubmitAnswer(activeSlot, val);
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
      {/* Selector de sección + botón analizar prompt existente */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <select
          value={activeSlot?.id || ''}
          onChange={(e) => onSelectSlot(e.target.value)}
          className="text-[11px] font-medium px-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-200 max-w-[215px]"
          title="Cambiar de sección"
        >
          {PROMPT_BLUEPRINT_SLOTS.map((slot) => {
            const done = state.sectionStatus[slot.sectionId] === 'complete';
            return (
              <option key={slot.id} value={slot.id}>
                {done ? '✓ ' : ''}
                {PROMPT_SECTIONS.find((sec) => sec.id === slot.sectionId)?.order}. {slot.sectionTitle} — {slot.label}
              </option>
            );
          })}
        </select>

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
          <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/25 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Posibles datos contradictorios en tu texto actual:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {conflicts.map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
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

        {/* Pregunta guiada del slot actual */}
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
      </div>

      {/* Barra inferior: adjuntar Excel/PDF + nota de voz + textarea/input */}
      <div className="p-2.5 border-t border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] shrink-0 space-y-1.5">
        {dailyLimitReached && (
          <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-2.5 py-1.5">
            Alcanzaste el límite de generación automática por hoy. Aún puedes usar respuestas rápidas, subir Excel/CSV o editar el texto manualmente arriba.
          </div>
        )}

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
