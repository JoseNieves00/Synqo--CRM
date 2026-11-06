'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Send, AlertTriangle, FileText, Zap, X, Settings2, Sparkles, Image as ImageIcon, Paperclip, Loader2, Mic, Trash2, CreditCard, Camera } from 'lucide-react';
import { getOrganizationQuickReplies, uploadChatMedia } from '@/app/actions/chat';
import { type QuickSnippet, BASE_DEFAULT_SNIPPETS } from '@/lib/chat/snippets';
import { getOrganizationPaymentAccounts, getOrganizationCatalogGallery } from '@/app/actions/settings';
import { CustomPaymentAccount, formatPaymentAccountText, formatAllPaymentAccountsText } from '@/lib/types/payments';
import { GalleryPhotoItem } from '@/lib/media/format';

const ManageQuickRepliesModal = dynamic(
  () => import('./ManageQuickRepliesModal').then((m) => m.ManageQuickRepliesModal),
  { ssr: false }
);

interface ChatInputProps {
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  isWithin24h: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onSendMedia?: (mediaUrl: string, caption?: string, fileName?: string, isDocument?: boolean, isAudio?: boolean, isVideo?: boolean) => Promise<void>;
  onSendTemplate: (templateName: string) => Promise<void>;
  customTemplates?: Array<{ name: string; label: string }>;
  disabled?: boolean;
  disabledReason?: string;
  onTyping?: () => void;
  draftText?: string;
  onDraftChange?: (text: string) => void;
  isAiActive?: boolean;
  onToggleAi?: (state: boolean) => Promise<void>;
  replyingToMessage?: { id?: string; senderType: string; content: string } | null;
  onCancelReply?: () => void;
}

export function ChatInput({
  contactId,
  contactName,
  contactPhone,
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
  isAiActive,
  onToggleAi,
  replyingToMessage,
  onCancelReply,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para cuentas y métodos de pago personalizables
  const [paymentAccounts, setPaymentAccounts] = useState<CustomPaymentAccount[]>([]);
  const [showPaymentMenu, setShowPaymentMenu] = useState(false);
  const paymentMenuRef = useRef<HTMLDivElement>(null);

  // Catálogo visual para envío rápido por asesores humanos
  const [catalogItems, setCatalogItems] = useState<GalleryPhotoItem[]>([]);
  const [showCatalogMenu, setShowCatalogMenu] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSendingCatalogPhoto, setIsSendingCatalogPhoto] = useState<string | null>(null);
  const catalogMenuRef = useRef<HTMLDivElement>(null);

  // Cargar cuentas de pago y catálogo de fotos configurados al montar
  useEffect(() => {
    let isMounted = true;
    getOrganizationPaymentAccounts()
      .then((accs) => {
        if (isMounted) setPaymentAccounts(accs || []);
      })
      .catch((err) => console.warn('[ChatInput] Error cargando cuentas de pago:', err));

    getOrganizationCatalogGallery()
      .then((items) => {
        if (isMounted) setCatalogItems(items || []);
      })
      .catch((err) => console.warn('[ChatInput] Error cargando catálogo:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Cerrar popover de catálogo al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catalogMenuRef.current && !catalogMenuRef.current.contains(e.target as Node)) {
        setShowCatalogMenu(false);
      }
    };
    if (showCatalogMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCatalogMenu]);

  const handleSendCatalogItem = async (item: GalleryPhotoItem) => {
    if (!onSendMedia) return;
    try {
      setIsSendingCatalogPhoto(item.id);
      const caption = `${item.name}${item.price ? ` (${item.price})` : ''}`;
      await onSendMedia(item.url, caption, undefined, false, false, false);
      setShowCatalogMenu(false);
    } catch (err) {
      console.error('[ChatInput] Error enviando foto de catálogo:', err);
    } finally {
      setIsSendingCatalogPhoto(null);
    }
  };

  // Cerrar popover de pago al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paymentMenuRef.current && !paymentMenuRef.current.contains(e.target as Node)) {
        setShowPaymentMenu(false);
      }
    };
    if (showPaymentMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPaymentMenu]);

  const handleInsertPaymentAccount = (account: CustomPaymentAccount) => {
    const text = formatPaymentAccountText(account);
    const updated = message ? `${message}\n\n${text}` : text;
    setMessage(updated);
    onDraftChange?.(updated);
    setShowPaymentMenu(false);
    inputRef.current?.focus();
  };

  const handleInsertAllPaymentAccounts = () => {
    const text = formatAllPaymentAccountsText(paymentAccounts);
    const updated = message ? `${message}\n\n${text}` : text;
    setMessage(updated);
    onDraftChange?.(updated);
    setShowPaymentMenu(false);
    inputRef.current?.focus();
  };

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

  // Estados de Grabación de Nota de Voz
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    if (disabled || isRecording) return;
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[AUDIO RECORDING ERROR]', err);
      setMediaError('No se pudo acceder al micrófono. Por favor permite los permisos en tu navegador.');
    }
  };

  const cancelRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !onSendMedia || isUploadingAudio) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsUploadingAudio(true);

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/ogg' });
        if (audioBlob.size < 500) {
          setMediaError('La grabación fue demasiado corta.');
          return;
        }

        const ext = recorder.mimeType.includes('webm') ? 'webm' : recorder.mimeType.includes('mp4') ? 'mp4' : 'ogg';
        const audioFile = new File([audioBlob], `nota_voz_${Date.now()}.${ext}`, { type: audioBlob.type });

        const formData = new FormData();
        formData.append('file', audioFile);
        const uploadRes = await uploadChatMedia(formData);

        await onSendMedia(uploadRes.url, undefined, `nota_voz.${ext}`, false, true);
      } catch (err: any) {
        console.error('[AUDIO UPLOAD ERROR]', err);
        setMediaError(err?.message || 'Error al enviar nota de voz.');
      } finally {
        setIsUploadingAudio(false);
        setIsRecording(false);
        setRecordingSeconds(0);
        audioChunksRef.current = [];
      }
    };

    try {
      recorder.stop();
    } catch {
      setIsUploadingAudio(false);
      setIsRecording(false);
    }
  };

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
    // Sustitución de variables dinámicas: {nombre}, {primer_nombre}, {telefono}
    const cleanName = (contactName || '').trim();
    const isPhoneNumberOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const displayFullName = cleanName && !isPhoneNumberOnly ? cleanName : 'estimado cliente';
    const displayFirstName = cleanName && !isPhoneNumberOnly ? cleanName.split(' ')[0] : 'hola';

    let processed = snippetText
      .replace(/\{primer_nombre\}/gi, displayFirstName)
      .replace(/\{nombre\}/gi, displayFullName)
      .replace(/\{first_name\}/gi, displayFirstName)
      .replace(/\{name\}/gi, displayFullName)
      .replace(/\{telefono\}/gi, contactPhone || '');

    setMessage(processed);
    onDraftChange?.(processed);
    setShowSnippets(false);
    inputRef.current?.focus();
  };

  const handleTextChange = (newVal: string) => {
    setMessage(newVal);
    onDraftChange?.(newVal);
    onTyping?.();

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isPopoverOpen = showSnippets || (isTypingShortcut && filteredSnippets.length > 0);
    if (isPopoverOpen && filteredSnippets.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSnippetIndex((prev) => (prev + 1) % filteredSnippets.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSnippetIndex((prev) => (prev - 1 + filteredSnippets.length) % filteredSnippets.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const currentSnippet = filteredSnippets[selectedSnippetIndex] || filteredSnippets[0];
        if (currentSnippet) {
          handleApplySnippet(currentSnippet.text);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSnippets(false);
        return;
      }
    }

    // Comportamiento WhatsApp: Enter envía, Shift+Enter añade nueva línea
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitText(e);
    }
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;

    const textToSend = message;
    setMessage('');
    onDraftChange?.('');
    setShowSnippets(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    setLoading(true);
    try {
      await onSendMessage(textToSend);
    } catch {
      setMessage(textToSend);
      onDraftChange?.(textToSend);
    } finally {
      setLoading(false);
    }
  };

  const handleSendAndReactivateAi = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() || disabled) return;

    const textToSend = message;
    setMessage('');
    onDraftChange?.('');
    setShowSnippets(false);
    setShowPaymentMenu(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    setLoading(true);
    try {
      await onSendMessage(textToSend);
      if (onToggleAi) {
        await onToggleAi(true);
      }
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

        {/* Botón y Popover de Cuentas y Métodos de Pago 100% Personalizable */}
        <div className="relative" ref={paymentMenuRef}>
          <button
            type="button"
            onClick={() => {
              setShowPaymentMenu((prev) => {
                if (!prev) {
                  getOrganizationPaymentAccounts().then((accs) => setPaymentAccounts(accs || [])).catch(() => {});
                }
                return !prev;
              });
            }}
            className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1 transition shrink-0 cursor-pointer"
            title="Insertar datos bancarios y cuentas de pago de la empresa"
          >
            <CreditCard className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Datos de Pago</span>
          </button>

          {showPaymentMenu && (
            <div className="absolute left-0 bottom-full mb-2 z-50 w-72 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl shadow-xl p-2.5 space-y-1.5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-[#1E2433] px-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-emerald-500" /> Cuentas de Pago
                </span>
                <button
                  type="button"
                  onClick={() => setShowPaymentMenu(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {paymentAccounts.filter((a) => a.isActive).length === 0 ? (
                <div className="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  <p>No tienes cuentas de pago activas.</p>
                  <Link
                    href="/settings"
                    className="text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline block mt-1"
                  >
                    Configurar en Ajustes →
                  </Link>
                </div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    onClick={handleInsertAllPaymentAccounts}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/15 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition flex items-center justify-between cursor-pointer border border-emerald-500/20"
                  >
                    <span>📋 Insertar todas las cuentas</span>
                    <span className="text-[10px] font-normal text-slate-400">Completo</span>
                  </button>

                  <div className="border-t border-slate-100 dark:border-[#1E2433] my-1" />

                  {paymentAccounts
                    .filter((a) => a.isActive)
                    .map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handleInsertPaymentAccount(acc)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-[11px] transition cursor-pointer flex flex-col border border-transparent hover:border-slate-200 dark:hover:border-[#232A3B]"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{acc.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">{acc.accountNumber} • {acc.holderName}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botón y Popover del Catálogo Visual de Productos */}
        <div className="relative" ref={catalogMenuRef}>
          <button
            type="button"
            onClick={() => setShowCatalogMenu((prev) => !prev)}
            className="px-2 py-0.5 rounded-md font-semibold bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-blue-500/30 flex items-center gap-1 transition shrink-0 cursor-pointer"
            title="Enviar fotos y precios oficiales de productos en 1 clic"
          >
            <Camera className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
            <span>Catálogo</span>
            {catalogItems.length > 0 && (
              <span className="text-[9px] bg-blue-200 dark:bg-blue-900/60 text-[#0052FF] dark:text-[#00D2FF] px-1 rounded-full font-bold">
                {catalogItems.length}
              </span>
            )}
          </button>

          {showCatalogMenu && (
            <div className="absolute left-0 bottom-full mb-2 z-50 w-80 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl shadow-xl p-2.5 space-y-2 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-[#1E2433] px-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Camera className="w-3 h-3 text-[#0052FF]" /> Catálogo Visual
                </span>
                <button
                  type="button"
                  onClick={() => setShowCatalogMenu(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Filtro de búsqueda rápida en el popover */}
              <input
                type="text"
                placeholder="Buscar por nombre, tag o modelo..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full text-xs px-2.5 py-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                autoFocus
              />

              {catalogItems.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  <p>No hay fotos vinculadas en el catálogo.</p>
                  <Link
                    href="/settings"
                    className="text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline block mt-1"
                  >
                    Vincular fotos en Ajustes →
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                  {catalogItems
                    .filter((item) => {
                      if (!catalogSearch.trim()) return true;
                      const q = catalogSearch.toLowerCase();
                      return (
                        item.name.toLowerCase().includes(q) ||
                        item.price?.toLowerCase().includes(q) ||
                        item.keywords?.some((k) => k.toLowerCase().includes(q))
                      );
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-[#090A0F]/50 flex items-center gap-2 transition"
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-11 h-11 rounded-md object-cover shrink-0 border border-slate-200 dark:border-[#232A3B]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                              {item.name}
                            </span>
                            {item.isHero && (
                              <span className="text-[9px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1 rounded font-bold shrink-0">
                                ⭐
                              </span>
                            )}
                          </div>
                          {item.price && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                              {item.price}
                            </span>
                          )}
                          {item.keywords && item.keywords.length > 0 && (
                            <p className="text-[9px] text-slate-400 truncate">
                              {item.keywords.slice(0, 2).map((k) => `#${k}`).join(' ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSendCatalogItem(item)}
                          disabled={Boolean(isSendingCatalogPhoto)}
                          className="px-2 py-1 rounded-md bg-[#0052FF] hover:bg-[#0047E0] text-white text-[11px] font-bold shrink-0 transition cursor-pointer disabled:opacity-50"
                          title="Enviar esta foto al cliente por WhatsApp"
                        >
                          {isSendingCatalogPhoto === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Enviar'
                          )}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

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

      {isRecording ? (
        <div className="p-2.5 pt-2 flex items-center justify-between gap-3 animate-in fade-in bg-rose-50/50 dark:bg-rose-950/20 border-t border-rose-200 dark:border-rose-900/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
              {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
              Grabando nota de voz de WhatsApp...
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cancelRecording}
              disabled={isUploadingAudio}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition cursor-pointer"
              title="Cancelar y descartar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={stopAndSendRecording}
              disabled={isUploadingAudio}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Enviar nota de voz"
            >
              {isUploadingAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Audio</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Banner de Cita / Responder a mensaje */}
          {replyingToMessage && (
            <div className="mx-2.5 mb-1 p-2 bg-slate-100 dark:bg-[#1A1F2C] border-l-4 border-[#0052FF] rounded-r-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-bottom-1">
              <div className="flex-1 min-w-0 pr-2">
                <span className="font-semibold text-[11px] text-[#0052FF] dark:text-[#00D2FF] block">
                  Respondiendo a {replyingToMessage.senderType === 'lead' ? (contactName || 'Cliente') : 'Asesor'}:
                </span>
                <p className="truncate text-slate-600 dark:text-slate-300 text-[11px] italic">
                  {replyingToMessage.content}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                title="Cancelar respuesta"
              >
                <X className="w-3.5 h-3.5" />
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
              if (file.size > 25 * 1024 * 1024) {
                setMediaError('El archivo arrastrado supera el límite de 25 MB.');
                return;
              }
              setMediaError(null);
              const isVideo = file.type.startsWith('video/');
              const isDoc = !file.type.startsWith('image/') && !isVideo;
              setPendingMedia({
                file,
                previewUrl: isDoc ? undefined : URL.createObjectURL(file),
                caption: message.trim(),
                isDocument: isDoc,
              });
              setMessage('');
            }}
            className="p-2.5 pt-1.5 flex gap-1.5 items-end"
          >
            {/* Botón de Adjuntar Foto, Video o Archivo */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || disabled}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl transition cursor-pointer shrink-0 disabled:opacity-40 mb-0.5"
              title="Adjuntar foto, video o archivo (PDF, Word, Excel)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Botón de Grabar Nota de Voz */}
            <button
              type="button"
              onClick={startRecording}
              disabled={loading || disabled}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-40 mb-0.5"
              title="Grabar y enviar nota de voz oficial de WhatsApp"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 25 * 1024 * 1024) {
                  setMediaError('El archivo supera el límite máximo de 25 MB.');
                  return;
                }
                setMediaError(null);
                const isVideo = file.type.startsWith('video/');
                const isDoc = !file.type.startsWith('image/') && !isVideo;
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

            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Escribe un mensaje o pega una foto con Ctrl+V (Shift+Enter para nueva línea)..."
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
                      if (file.size > 15 * 1024 * 1024) {
                        setMediaError('La imagen pegada supera el límite de 15 MB.');
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
              className="flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0052FF] focus:border-[#0052FF] resize-none min-h-[38px] max-h-[140px] leading-relaxed transition-all"
            />

            {isAiActive === false && onToggleAi && (
              <button
                type="button"
                onClick={handleSendAndReactivateAi}
                disabled={loading || !message.trim()}
                title="Enviar respuesta y reactivar la IA inmediatamente para que continúe atendiendo al cliente"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl transition shadow-xs disabled:opacity-40 flex items-center gap-1.5 cursor-pointer shrink-0 text-xs font-semibold mb-0.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Enviar & IA</span>
              </button>
            )}

            <button
              type="submit"
              disabled={loading || !message.trim()}
              title="Enviar mensaje manual (Enter)"
              className="bg-[#0052FF] hover:bg-[#0043D4] text-white px-3.5 py-2 rounded-xl transition shadow-xs disabled:opacity-40 flex items-center justify-center cursor-pointer shrink-0 mb-0.5"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </>
      )}

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
