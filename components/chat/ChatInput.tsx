'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Send, AlertTriangle, FileText, Zap, X, Settings2, Sparkles, Image as ImageIcon, Paperclip, Loader2 } from 'lucide-react';
import { getOrganizationQuickReplies, uploadChatMedia } from '@/app/actions/chat';
import { type QuickSnippet, BASE_DEFAULT_SNIPPETS } from '@/lib/chat/snippets';

const ManageQuickRepliesModal = dynamic(
  () => import('./ManageQuickRepliesModal').then((m) => m.ManageQuickRepliesModal),
  { ssr: false }
);

interface ChatInputProps {
  contactId: string;
  isWithin24h: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onSendMedia?: (mediaUrl: string, caption?: string, fileName?: string, isDocument?: boolean) => Promise<void>;
  onSendTemplate: (templateName: string) => Promise<void>;
  customTemplates?: Array<{ name: string; label: string }>;
  disabled?: boolean;
  disabledReason?: string;
  onTyping?: () => void;
  draftText?: string;
  onDraftChange?: (text: string) => void;
}

export function ChatInput({
  contactId,
  isWithin24h,
  onSendMessage,
  onSendMedia,
  onSendTemplate,
  customTemplates,
  disabled,
  disabledReason,
  onTyping,
  draftText,
  onDraftChange,
}: ChatInputProps) {
  const [message, setMessage] = useState(draftText || '');
  const availableTemplates = customTemplates && customTemplates.length > 0
    ? customTemplates
    : [];

  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    availableTemplates[0]?.name || ''
  );
  const [loading, setLoading] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [selectedSnippetIndex, setSelectedSnippetIndex] = useState(0);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [activeSnippets, setActiveSnippets] = useState<QuickSnippet[]>(BASE_DEFAULT_SNIPPETS);
  const [aiSuggestions, setAiSuggestions] = useState<QuickSnippet[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronizar borrador al cambiar de contacto activo
  useEffect(() => {
    setMessage(draftText || '');
  }, [contactId]);

  // Estado para previsualización y envío de imagen adjunta
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    previewUrl?: string;
    caption: string;
    isDocument?: boolean;
  } | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Cargar atajos personalizados y sugerencias generadas por la IA según el prompt
  useEffect(() => {
    let isMounted = true;
    getOrganizationQuickReplies().then((data) => {
      if (isMounted && data) {
        if (data.activeSnippets && data.activeSnippets.length > 0) {
          setActiveSnippets(data.activeSnippets);
        }
        if (data.aiSuggestions) {
          setAiSuggestions(data.aiSuggestions);
        }
      }
    }).catch((err) => {
      console.warn('[ChatInput] Error cargando atajos:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (availableTemplates.length > 0 && !availableTemplates.some((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(availableTemplates[0].name);
    }
  }, [availableTemplates, selectedTemplate]);

  // Si el usuario empieza a escribir con '/', abrir el menú de atajos automáticamente
  const isTypingShortcut = message.startsWith('/');
  const filteredSnippets = isTypingShortcut
    ? activeSnippets.filter((s) => s.shortcut.toLowerCase().startsWith(message.toLowerCase()))
    : activeSnippets;

  // Reiniciar cursor de selección rápida al cambiar el filtro
  useEffect(() => {
    setSelectedSnippetIndex(0);
  }, [message, showSnippets]);

  const handleApplySnippet = (snippetText: string) => {
    setMessage(snippetText);
    onDraftChange?.(snippetText);
    setShowSnippets(false);
    inputRef.current?.focus();
  };

  const handleTextChange = (newVal: string) => {
    setMessage(newVal);
    onDraftChange?.(newVal);
    onTyping?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isPopoverOpen = showSnippets || (isTypingShortcut && filteredSnippets.length > 0);
    if (!isPopoverOpen || filteredSnippets.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSnippetIndex((prev) => (prev + 1) % filteredSnippets.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSnippetIndex((prev) => (prev - 1 + filteredSnippets.length) % filteredSnippets.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const currentSnippet = filteredSnippets[selectedSnippetIndex] || filteredSnippets[0];
      if (currentSnippet) {
        handleApplySnippet(currentSnippet.text);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSnippets(false);
    }
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading || disabled) return;

    setLoading(true);
    const textToSend = message;
    setMessage('');
    onDraftChange?.('');
    setShowSnippets(false);

    try {
      await onSendMessage(textToSend);
    } catch {
      setMessage(textToSend);
      onDraftChange?.(textToSend);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate || loading || disabled) return;
    setLoading(true);
    try {
      await onSendTemplate(selectedTemplate);
    } finally {
      setLoading(false);
    }
  };

  // Si el chat está bloqueado porque otro agente lo tiene asignado
  if (disabled) {
    return (
      <div className="p-3.5 bg-slate-50 dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] text-center text-xs text-slate-500 dark:text-slate-400">
        <span>{disabledReason || 'Chat en modo solo lectura.'}</span>
      </div>
    );
  }

  // Fuera de la ventana de 24 horas: bloqueo de mensajes libres según política Meta
  if (!isWithin24h) {
    return (
      <div className="p-3.5 bg-white dark:bg-[#131722] border-t border-slate-200 dark:border-[#1E2433] space-y-2.5 transition-colors">
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-300">Ventana de 24 horas de Meta cerrada</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-200/80 mt-0.5 leading-relaxed">
              Han transcurrido más de 24 horas desde la última interacción. Para reanudar el contacto oficial, envía una plantilla autorizada:
            </p>
          </div>
        </div>

        {availableTemplates.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            >
              {availableTemplates.map((tpl) => (
                <option key={tpl.name} value={tpl.name}>
                  {tpl.label || tpl.name} ({tpl.name})
                </option>
              ))}
            </select>

            <button
              onClick={handleSendTemplate}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{loading ? 'Enviando...' : 'Enviar Plantilla'}</span>
            </button>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg p-2.5 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              No hay plantillas oficiales registradas para este canal.
            </span>
            <Link
              href="/settings"
              className="inline-flex items-center text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline shrink-0"
            >
              Configurar en Ajustes &rarr;
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Dentro de las 24 horas: input libre normal para el agente humano con atajos rápidos
  return (
    <div className="relative border-t border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#131722] transition-colors">
      {/* Popover flotante de sugerencias al escribir '/' o al pulsar 'Atajos' */}
      {(showSnippets || (isTypingShortcut && filteredSnippets.length > 0)) && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-[#131722] rounded-xl shadow-2xl border border-slate-200 dark:border-[#232A3B] p-2 space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150 z-30 max-w-md text-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-200 dark:border-[#1E2433] text-xs font-semibold text-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Respuestas Rápidas (Escribe / para filtrar):</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSnippets(false);
                  setIsManageModalOpen(true);
                }}
                className="text-[11px] font-medium text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
                title="Personalizar atajos o ver sugerencias de la IA"
              >
                Gestionar
              </button>
              <button
                type="button"
                onClick={() => setShowSnippets(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredSnippets.map((s, idx) => {
              const isSelected = idx === selectedSnippetIndex;
              return (
                <button
                  key={s.shortcut}
                  type="button"
                  onClick={() => handleApplySnippet(s.text)}
                  className={`w-full text-left p-2 rounded-lg transition group cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-[#1A1F2C] border-blue-300 dark:border-[#0052FF]/60 ring-1 ring-[#0052FF]/30'
                      : 'hover:bg-slate-50 dark:hover:bg-[#1A1F2C] border-transparent hover:border-slate-200 dark:border-[#232A3B]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white">
                      {s.label}
                    </span>
                    <code className="text-[10px] font-mono text-[#0052FF] dark:text-[#00D2FF] bg-slate-100 dark:bg-[#090A0F] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#232A3B]">
                      {s.shortcut}
                    </code>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mini-Barra Superior de Atajos de 1-Clic */}
      <div className="px-3 pt-2 flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <button
          type="button"
          onClick={() => setShowSnippets((prev) => !prev)}
          className="px-2 py-0.5 rounded-md font-semibold bg-blue-50 dark:bg-[#090A0F] hover:bg-blue-100 dark:hover:bg-[#1A1F2C] text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/30 flex items-center gap-1 transition shrink-0 cursor-pointer"
        >
          <Zap className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
          <span>Atajos (/)</span>
        </button>

        {activeSnippets.slice(0, 3).map((snippet) => (
          <button
            key={snippet.shortcut}
            type="button"
            onClick={() => handleApplySnippet(snippet.text)}
            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] transition shrink-0 truncate max-w-[140px] cursor-pointer"
            title={snippet.text}
          >
            {snippet.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setIsManageModalOpen(true)}
          className="px-2 py-0.5 rounded-md font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 transition shrink-0 cursor-pointer ml-auto"
          title="Personalizar atajos y ver sugerencias de la IA"
        >
          <Settings2 className="w-3 h-3" />
          <span>Personalizar</span>
        </button>
      </div>

      {/* Previsualización de Imagen o Archivo Adjunto antes de Enviar */}
      {pendingMedia && (
        <div className="mx-2.5 my-1.5 p-2.5 bg-slate-100 dark:bg-[#1A1F2C] border border-blue-200 dark:border-blue-900/60 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-[#232A3B] shrink-0 bg-black/10 flex items-center justify-center">
            {pendingMedia.isDocument ? (
              <FileText className="w-7 h-7 text-[#0052FF] dark:text-[#00D2FF]" />
            ) : (
              <img
                src={pendingMedia.previewUrl}
                alt="Previsualización"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate" title={pendingMedia.file.name}>
                {pendingMedia.file.name}
              </span>
              <button
                type="button"
                onClick={() => setPendingMedia(null)}
                disabled={isUploadingMedia}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md cursor-pointer"
                title="Quitar adjunto"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              placeholder={pendingMedia.isDocument ? "Mensaje que acompaña el documento..." : "Añade un pie de foto opcional..."}
              value={pendingMedia.caption}
              onChange={(e) => setPendingMedia({ ...pendingMedia, caption: e.target.value })}
              disabled={isUploadingMedia}
              className="w-full text-xs px-2.5 py-1 bg-white dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0052FF]"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!pendingMedia || !onSendMedia || isUploadingMedia) return;
              setIsUploadingMedia(true);
              setMediaError(null);
              try {
                const formData = new FormData();
                formData.append('file', pendingMedia.file);
                const uploadRes = await uploadChatMedia(formData);
                await onSendMedia(
                  uploadRes.url,
                  pendingMedia.caption || undefined,
                  pendingMedia.file.name,
                  pendingMedia.isDocument
                );
                setPendingMedia(null);
              } catch (err: any) {
                console.error('[UPLOAD MEDIA ERROR]', err);
                setMediaError(err?.message || 'Error al enviar archivo.');
              } finally {
                setIsUploadingMedia(false);
              }
            }}
            disabled={isUploadingMedia}
            className="px-3 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isUploadingMedia ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Subiendo...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{pendingMedia.isDocument ? 'Enviar Archivo' : 'Enviar Foto'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {mediaError && (
        <div className="mx-2.5 my-1 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-lg text-rose-600 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{mediaError}</span>
          <button type="button" onClick={() => setMediaError(null)} className="cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmitText}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) {
            setMediaError('El archivo arrastrado supera el límite de 15 MB.');
            return;
          }
          setMediaError(null);
          const isDoc = !file.type.startsWith('image/');
          setPendingMedia({
            file,
            previewUrl: isDoc ? undefined : URL.createObjectURL(file),
            caption: message.trim(),
            isDocument: isDoc,
          });
          setMessage('');
        }}
        className="p-2.5 pt-1.5 flex gap-1.5 items-center"
      >
        {/* Botón de Adjuntar Foto o Archivo */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || disabled}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl transition cursor-pointer shrink-0 disabled:opacity-40"
          title="Adjuntar foto o archivo (PDF, Word, Excel)"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 15 * 1024 * 1024) {
              setMediaError('El archivo supera el límite máximo de 15 MB.');
              return;
            }
            setMediaError(null);
            const isDoc = !file.type.startsWith('image/');
            setPendingMedia({
              file,
              previewUrl: isDoc ? undefined : URL.createObjectURL(file),
              caption: message.trim(),
              isDocument: isDoc,
            });
            setMessage('');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="hidden"
        />

        <input
          ref={inputRef}
          type="text"
          placeholder="Escribe un mensaje o pega una foto con Ctrl+V..."
          value={message}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                  if (file.size > 10 * 1024 * 1024) {
                    setMediaError('La imagen pegada supera el límite de 10 MB.');
                    return;
                  }
                  setMediaError(null);
                  setPendingMedia({
                    file,
                    previewUrl: URL.createObjectURL(file),
                    caption: message.trim(),
                    isDocument: false,
                  });
                  setMessage('');
                  e.preventDefault();
                  return;
                }
              }
            }
          }}
          disabled={loading}
          className="flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0052FF] focus:border-[#0052FF] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2 rounded-xl transition shadow-xs disabled:opacity-40 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Modal de Gestión de Atajos y Sugerencias de IA */}
      <ManageQuickRepliesModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        activeSnippets={activeSnippets}
        aiSuggestions={aiSuggestions}
        onSnippetsUpdated={(updated) => setActiveSnippets(updated)}
      />
    </div>
  );
}
