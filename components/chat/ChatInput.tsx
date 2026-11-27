'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Send, AlertTriangle, FileText, Zap, X, Settings2, Sparkles, Image as ImageIcon, Paperclip, Loader2, Mic, Trash2, CreditCard, Camera, Pencil, ChevronDown, ChevronUp, Layers, CheckSquare, Square, Check } from 'lucide-react';
import { getOrganizationQuickReplies, uploadChatMedia, generateDraftAiReply } from '@/app/actions/chat';
import { type QuickSnippet, BASE_DEFAULT_SNIPPETS } from '@/lib/chat/snippets';
import { getOrganizationPaymentAccounts, getOrganizationCatalogGallery } from '@/app/actions/settings';
import { CustomPaymentAccount, formatPaymentAccountText, formatAllPaymentAccountsText } from '@/lib/types/payments';
import { GalleryPhotoItem } from '@/lib/media/format';
import { groupGalleryIntoProducts, GroupedProductGallery } from '@/lib/ai/product-gallery';
import { extractGenuineFirstName } from '@/lib/ai/follow-up-types';
import { compressImageClient } from '@/lib/media/client-compression';
import { useBootstrap, useInboxStore } from '@/lib/inbox/use-inbox-store';

const ManageQuickRepliesModal = dynamic(
  () => import('./ManageQuickRepliesModal').then((m) => m.ManageQuickRepliesModal),
  { ssr: false }
);
import { PaymentAccountsPopover } from './PaymentAccountsPopover';
import { GalleryCatalogPopover } from './GalleryCatalogPopover';
import { QuickSnippetsPopover } from './QuickSnippetsPopover';
import { VoiceRecorderBar } from './VoiceRecorderBar';

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
  const [snippetsSearch, setSnippetsSearch] = useState('');
  const [selectedSnippetIndex, setSelectedSnippetIndex] = useState(0);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageModalInitialShortcut, setManageModalInitialShortcut] = useState<string | null>(null);
  const bootstrap = useBootstrap();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSnippets, setActiveSnippets] = useState<QuickSnippet[]>(() => {
    const b = bootstrap?.quickReplies as any;
    return (b?.activeSnippets && b.activeSnippets.length > 0) ? b.activeSnippets : BASE_DEFAULT_SNIPPETS;
  });
  const [aiSuggestions, setAiSuggestions] = useState<QuickSnippet[]>(() => {
    const b = bootstrap?.quickReplies as any;
    return b?.aiSuggestions || [];
  });

  // Estado para cuentas y métodos de pago personalizables
  const [paymentAccounts, setPaymentAccounts] = useState<CustomPaymentAccount[]>(
    () => (bootstrap?.paymentAccounts as CustomPaymentAccount[]) || []
  );
  const [showPaymentMenu, setShowPaymentMenu] = useState(false);
  const paymentButtonRef = useRef<HTMLButtonElement>(null);
  const paymentMenuRef = useRef<HTMLDivElement>(null);

  // Catálogo visual para envío rápido por asesores humanos
  const [catalogItems, setCatalogItems] = useState<GalleryPhotoItem[]>(
    () => (bootstrap?.catalog as GalleryPhotoItem[]) || []
  );
  const [showCatalogMenu, setShowCatalogMenu] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSendingCatalogPhoto, setIsSendingCatalogPhoto] = useState<string | null>(null);
  const [selectedCatalogPhotoIds, setSelectedCatalogPhotoIds] = useState<string[]>([]);
  const [batchSendProgress, setBatchSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [expandedProductGroup, setExpandedProductGroup] = useState<string | null>(null);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const catalogMenuRef = useRef<HTMLDivElement>(null);

  const groupedCatalog = useMemo(() => {
    const visibleItems = catalogItems.filter((item) => item.isAvailable !== false);
    return groupGalleryIntoProducts(visibleItems);
  }, [catalogItems]);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return groupedCatalog;
    const q = catalogSearch.toLowerCase();
    return groupedCatalog.filter((prod) => {
      return (
        prod.productName.toLowerCase().includes(q) ||
        prod.price?.toLowerCase().includes(q) ||
        prod.keywords?.some((k) => k.toLowerCase().includes(q)) ||
        prod.allPhotos.some(
          (p) =>
            (p.imageRole || '').toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
        )
      );
    });
  }, [groupedCatalog, catalogSearch]);

  // Estado para Copiloto IA de redacción de borradores para asesores
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);

  const handleRequestAiDraft = async () => {
    if (isGeneratingDraft || disabled) return;
    setIsGeneratingDraft(true);
    try {
      const res = await generateDraftAiReply(contactId);
      if (res?.draft) {
        setAiDraft(res.draft);
      }
    } catch (err) {
      console.error('[ChatInput] Error generando borrador con copiloto:', err);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Anticipación proactiva: Genera en segundo plano sugerencia de Copiloto IA al entrar a chat desatendido
  useEffect(() => {
    let cancelled = false;
    const activeContact = useInboxStore.getState().contactsById[contactId];
    const isUnattended = activeContact && (Number(activeContact.unread_count || 0) > 0 || Boolean(activeContact.waiting_since));

    if (isUnattended && !activeContact.is_ai_active && !message.trim()) {
      const timer = setTimeout(async () => {
        if (cancelled || isGeneratingDraft || aiDraft) return;
        try {
          const res = await generateDraftAiReply(contactId);
          if (!cancelled && res?.draft) {
            setAiDraft(res.draft);
          }
        } catch {}
      }, 1200);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [contactId]);

  // Cuentas de pago y catálogo: leer de bootstrap cacheado o consultar una sola vez
  useEffect(() => {
    const b = useInboxStore.getState().bootstrap;
    if (b?.paymentAccounts !== undefined) {
      setPaymentAccounts(b.paymentAccounts as CustomPaymentAccount[]);
    } else {
      getOrganizationPaymentAccounts()
        .then((accs) => {
          if (accs) {
            setPaymentAccounts(accs);
            useInboxStore.getState().setBootstrap({ paymentAccounts: accs });
          }
        })
        .catch((err) => console.warn('[ChatInput] Error cargando cuentas de pago:', err));
    }

    if (b?.catalog !== undefined) {
      setCatalogItems(b.catalog as GalleryPhotoItem[]);
    } else {
      getOrganizationCatalogGallery()
        .then((items) => {
          if (items) {
            setCatalogItems(items);
            useInboxStore.getState().setBootstrap({ catalog: items });
          }
        })
        .catch((err) => console.warn('[ChatInput] Error cargando catálogo:', err));
    }
  }, [bootstrap?.paymentAccounts, bootstrap?.catalog]);

  // Cerrar popover de catálogo al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        catalogMenuRef.current &&
        !catalogMenuRef.current.contains(target) &&
        !catalogButtonRef.current?.contains(target)
      ) {
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

  const toggleSelectCatalogPhoto = (photoId: string) => {
    setSelectedCatalogPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSendBatchCatalog = async (photosToSend: GalleryPhotoItem[]) => {
    if (!onSendMedia || photosToSend.length === 0 || batchSendProgress) return;
    try {
      setBatchSendProgress({ current: 0, total: photosToSend.length });
      for (let i = 0; i < photosToSend.length; i++) {
        const item = photosToSend[i];
        setBatchSendProgress({ current: i + 1, total: photosToSend.length });
        const caption = `${item.name}${item.price ? ` (${item.price})` : ''}`;
        await onSendMedia(item.url, caption, undefined, false, false, false);
        if (i < photosToSend.length - 1) {
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      setSelectedCatalogPhotoIds([]);
      setShowCatalogMenu(false);
    } catch (err) {
      console.error('[ChatInput] Error enviando lote de catálogo:', err);
    } finally {
      setBatchSendProgress(null);
    }
  };

  // Cerrar popover de pago al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        paymentMenuRef.current &&
        !paymentMenuRef.current.contains(target) &&
        !paymentButtonRef.current?.contains(target)
      ) {
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
    if (typeof window !== 'undefined' && contactId) {
      try {
        localStorage.setItem(`synqo_draft_${contactId}`, updated);
      } catch {}
    }
    onDraftChange?.(updated);
    setShowPaymentMenu(false);
    inputRef.current?.focus();
  };

  const handleInsertAllPaymentAccounts = () => {
    const text = formatAllPaymentAccountsText(paymentAccounts);
    const updated = message ? `${message}\n\n${text}` : text;
    setMessage(updated);
    if (typeof window !== 'undefined' && contactId) {
      try {
        localStorage.setItem(`synqo_draft_${contactId}`, updated);
      } catch {}
    }
    onDraftChange?.(updated);
    setShowPaymentMenu(false);
    inputRef.current?.focus();
  };

  // Sincronizar borrador persistido por contacto en localStorage
  useEffect(() => {
    let saved = '';
    if (typeof window !== 'undefined' && contactId) {
      try {
        saved = localStorage.getItem(`synqo_draft_${contactId}`) || '';
      } catch {}
    }
    setMessage(saved || draftText || '');

    const handleApplyDraft = (e: any) => {
      if (e.detail?.contactId === contactId && e.detail?.text) {
        setMessage(e.detail.text);
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
          inputRef.current.focus();
        }
      }
    };
    window.addEventListener('synqo-apply-draft', handleApplyDraft as EventListener);
    return () => window.removeEventListener('synqo-apply-draft', handleApplyDraft as EventListener);
  }, [contactId, draftText]);

  // Limpiar menús y adjuntos no enviados al cambiar de contacto
  useEffect(() => {
    setPendingMedia(null);
    setMediaError(null);
    setShowSnippets(false);
    setShowPaymentMenu(false);
    setShowCatalogMenu(false);
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

      // Priorizar formatos nativos compatibles con WhatsApp oficial (OGG/Opus o MP4/AAC)
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
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

        const ext = recorder.mimeType.includes('ogg') ? 'ogg' : recorder.mimeType.includes('mp4') ? 'm4a' : 'ogg';
        const audioFile = new File([audioBlob], `nota_voz_${Date.now()}.${ext}`, { type: recorder.mimeType || 'audio/ogg' });

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

  // Cargar atajos personalizados y sugerencias generadas por la IA: leer de bootstrap o consultar una sola vez
  useEffect(() => {
    const b = useInboxStore.getState().bootstrap;
    const qr = b?.quickReplies as any;
    if (qr && qr.activeSnippets) {
      if (qr.activeSnippets.length > 0) setActiveSnippets(qr.activeSnippets);
      if (qr.aiSuggestions) setAiSuggestions(qr.aiSuggestions);
      return;
    }

    getOrganizationQuickReplies().then((data) => {
      if (data) {
        if (data.activeSnippets && data.activeSnippets.length > 0) {
          setActiveSnippets(data.activeSnippets);
        }
        if (data.aiSuggestions) {
          setAiSuggestions(data.aiSuggestions);
        }
        useInboxStore.getState().setBootstrap({ quickReplies: data as any });
      }
    }).catch((err) => {
      console.warn('[ChatInput] Error cargando atajos:', err);
    });
  }, [bootstrap?.quickReplies]);

  useEffect(() => {
    if (availableTemplates.length > 0 && !availableTemplates.some((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(availableTemplates[0].name);
    }
  }, [availableTemplates, selectedTemplate]);

  // Si el usuario escribe '/' al inicio o tras un espacio, activar menú de atajos automáticamente
  const shortcutMatch = message.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
  const isTypingShortcut = Boolean(shortcutMatch);
  const typingShortcutQuery = shortcutMatch ? `/${shortcutMatch[1].toLowerCase()}` : '';

  // Lista enriquecida con atajos dinámicos de cuentas de pago y citas
  const enrichedSnippets = useMemo(() => {
    let list = [...activeSnippets];

    // Si la organización tiene cuentas de pago configuradas, sincronizar /pago y /cuenta con los datos reales
    if (paymentAccounts && paymentAccounts.length > 0) {
      const paymentText = formatAllPaymentAccountsText(paymentAccounts);
      list = list.map((s) => {
        if (s.shortcut.toLowerCase() === '/pago' || s.shortcut.toLowerCase() === '/cuenta') {
          return { ...s, text: paymentText };
        }
        return s;
      });
      if (!list.some((s) => s.shortcut.toLowerCase() === '/pago')) {
        list.push({
          id: 'dyn-pago',
          shortcut: '/pago',
          label: 'Cuentas de Pago',
          text: paymentText,
        });
      }
      if (!list.some((s) => s.shortcut.toLowerCase() === '/cuenta')) {
        list.push({
          id: 'dyn-cuenta',
          shortcut: '/cuenta',
          label: 'Cuentas Bancarias',
          text: paymentText,
        });
      }
    } else {
      if (!list.some((s) => s.shortcut.toLowerCase() === '/pago')) {
        list.push({
          id: 'default-pago',
          shortcut: '/pago',
          label: 'Medios de Pago',
          text: '¡Hola {primer_nombre}! Te comparto nuestros medios de pago oficiales. Por favor envíanos la captura de tu comprobante una vez realizada la transferencia para validarla de inmediato.',
        });
      }
    }

    if (!list.some((s) => s.shortcut.toLowerCase() === '/cita')) {
      list.push({
        id: 'default-cita',
        shortcut: '/cita',
        label: 'Coordinar Cita',
        text: '{primer_nombre}, ¿para qué día y horario te gustaría coordinar tu cita? Con mucho gusto te confirmo la disponibilidad de inmediato.',
      });
    }

    return list;
  }, [activeSnippets, paymentAccounts]);

  const filteredSnippets = isTypingShortcut
    ? enrichedSnippets.filter((s) => s.shortcut.toLowerCase().startsWith(typingShortcutQuery))
    : snippetsSearch.trim()
    ? enrichedSnippets.filter(
        (s) =>
          s.shortcut.toLowerCase().includes(snippetsSearch.toLowerCase()) ||
          s.label.toLowerCase().includes(snippetsSearch.toLowerCase()) ||
          s.text.toLowerCase().includes(snippetsSearch.toLowerCase())
      )
    : enrichedSnippets;

  // Reiniciar cursor de selección rápida al cambiar el filtro
  useEffect(() => {
    setSelectedSnippetIndex(0);
  }, [message, showSnippets, snippetsSearch]);

  const handleApplySnippet = (snippetText: string) => {
    // Sustitución de variables dinámicas: {nombre}, {primer_nombre}, {telefono}
    // Deducción inteligente de nombre genuino (evita "Hola Dios", "Hola Life", etc.)
    const cleanFirstName = extractGenuineFirstName(contactName);
    const cleanFullName = cleanFirstName ? (contactName || '').trim() : '';

    let processed = snippetText;
    if (!cleanFirstName) {
      // Sanitización limpia: convertir "¡Hola {primer_nombre}!" en "¡Hola!" sin repetir "¡Hola hola!" ni "estimado cliente"
      processed = processed
        .replace(/¡?Hola\s+\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|first_name)\s*\}?\}!?/gi, '¡Hola!')
        .replace(/¡?Hola\s+\{\{?\s*(nombre|name)\s*\}?\}!?/gi, '¡Hola!')
        .replace(/Hola\s+\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|first_name)\s*\}?\},?/gi, 'Hola,')
        .replace(/\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|first_name)\s*\}?\}/gi, '')
        .replace(/\{\{?\s*(nombre|name)\s*\}?\}/gi, '');
    } else {
      processed = processed
        .replace(/\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|first_name)\s*\}?\}/gi, cleanFirstName)
        .replace(/\{\{?\s*(nombre|name)\s*\}?\}/gi, cleanFullName);
    }
    processed = processed.replace(/\{telefono\}/gi, contactPhone || '').replace(/\s{2,}/g, ' ').trim();

    // Inserción inteligente:
    // Si el texto actual termina con un comando tipo /algo, reemplazarlo con el snippet
    // Si ya hay texto que no es comando, anexarlo abajo
    let updatedText = processed;
    if (message.trim()) {
      if (/(?:^|\s)\/[a-zA-Z0-9_-]*$/.test(message)) {
        updatedText = message.replace(/(?:^|\s)\/[a-zA-Z0-9_-]*$/, (match) => {
          const prefix = match.startsWith(' ') ? ' ' : '';
          return prefix + processed;
        });
      } else {
        updatedText = `${message}\n\n${processed}`;
      }
    }

    setMessage(updatedText);
    if (typeof window !== 'undefined' && contactId) {
      try {
        localStorage.setItem(`synqo_draft_${contactId}`, updatedText);
      } catch {}
    }
    onDraftChange?.(updatedText);
    setShowSnippets(false);
    setSnippetsSearch('');

    // Auto-ajustar altura del textarea para que el atajo se vea completo y legible
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
        inputRef.current.focus();
      }
    }, 10);
  };

  const handleTextChange = (newVal: string) => {
    setMessage(newVal);
    if (typeof window !== 'undefined' && contactId) {
      try {
        if (newVal) {
          localStorage.setItem(`synqo_draft_${contactId}`, newVal);
        } else {
          localStorage.removeItem(`synqo_draft_${contactId}`);
        }
      } catch {}
    }
    onDraftChange?.(newVal);
    onTyping?.();

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Atajo global Ctrl+J / Cmd+J para generar borrador con Copiloto IA
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      handleRequestAiDraft();
      return;
    }

    // Aceptar borrador propuesto por el Copiloto IA con Tab
    if (e.key === 'Tab' && aiDraft) {
      e.preventDefault();
      setMessage(aiDraft);
      onDraftChange?.(aiDraft);
      setAiDraft(null);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
          inputRef.current.focus();
        }
      }, 10);
      return;
    }

    if (e.key === 'Escape' && aiDraft) {
      e.preventDefault();
      setAiDraft(null);
      return;
    }

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

    // Atajo Inbox Zero: ⌘+Enter o Ctrl+Enter envía y salta al siguiente chat de la cola
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmitText(e);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('synqo-inbox-zero-next', {
            detail: { closedContactId: contactId, jumpOnly: true },
          })
        );
      }
      return;
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
    if (typeof window !== 'undefined' && contactId) {
      try {
        localStorage.removeItem(`synqo_draft_${contactId}`);
      } catch {}
    }
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
      if (typeof window !== 'undefined' && contactId) {
        try {
          localStorage.setItem(`synqo_draft_${contactId}`, textToSend);
        } catch {}
      }
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
    if (typeof window !== 'undefined' && contactId) {
      try {
        localStorage.removeItem(`synqo_draft_${contactId}`);
      } catch {}
    }
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
      if (typeof window !== 'undefined' && contactId) {
        try {
          localStorage.setItem(`synqo_draft_${contactId}`, textToSend);
        } catch {}
      }
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
      {/* Popovers flotantes anclados al contenedor raíz para evitar recorte por overflow-x */}

      {/* 1. Popover flotante de sugerencias al escribir '/' o al pulsar 'Atajos' */}
      {(showSnippets || (isTypingShortcut && filteredSnippets.length > 0)) && (
        <QuickSnippetsPopover
          isTypingShortcut={isTypingShortcut}
          snippetsSearch={snippetsSearch}
          setSnippetsSearch={setSnippetsSearch}
          filteredSnippets={filteredSnippets}
          selectedSnippetIndex={selectedSnippetIndex}
          onApplySnippet={handleApplySnippet}
          onOpenManage={(shortcut) => {
            setShowSnippets(false);
            setManageModalInitialShortcut(shortcut);
            setIsManageModalOpen(true);
          }}
          onClose={() => {
            setShowSnippets(false);
            setSnippetsSearch('');
          }}
        />
      )}

      {/* 2. Popover de Cuentas y Datos de Pago de la Empresa */}
      {showPaymentMenu && (
        <PaymentAccountsPopover
          menuRef={paymentMenuRef}
          paymentAccounts={paymentAccounts}
          onClose={() => setShowPaymentMenu(false)}
          onInsertAll={handleInsertAllPaymentAccounts}
          onInsertOne={handleInsertPaymentAccount}
        />
      )}

      {/* 3. Popover de Galería & Catálogo Visual */}
      {showCatalogMenu && (
        <GalleryCatalogPopover
          menuRef={catalogMenuRef}
          catalogItems={catalogItems}
          groupedCatalog={groupedCatalog}
          filteredCatalog={filteredCatalog}
          catalogSearch={catalogSearch}
          setCatalogSearch={setCatalogSearch}
          selectedCatalogPhotoIds={selectedCatalogPhotoIds}
          setSelectedCatalogPhotoIds={setSelectedCatalogPhotoIds}
          expandedProductGroup={expandedProductGroup}
          setExpandedProductGroup={setExpandedProductGroup}
          isSendingCatalogPhoto={isSendingCatalogPhoto}
          batchSendProgress={batchSendProgress}
          onClose={() => setShowCatalogMenu(false)}
          onToggleSelectPhoto={toggleSelectCatalogPhoto}
          onSendSingle={handleSendCatalogItem}
          onSendBatch={handleSendBatchCatalog}
        />
      )}

      {/* Mini-Barra Superior de Atajos de 1-Clic (Sin scrollbar nativo feo) */}
      <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden text-xs">
        {/* Botón de Copiloto IA */}
        <button
          type="button"
          onClick={handleRequestAiDraft}
          disabled={isGeneratingDraft || loading || disabled}
          className="h-7 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#0052FF]/15 dark:to-indigo-500/15 hover:from-blue-100 hover:to-indigo-100 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200/80 dark:border-blue-500/30 transition cursor-pointer shadow-2xs disabled:opacity-50 select-none"
          title="El Copiloto IA analiza el chat y propone un borrador de respuesta para que lo revises (Atajo: Ctrl+J)"
        >
          {isGeneratingDraft ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-[#0052FF]" />
              <span>Pensando...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Copiloto IA</span>
            </>
          )}
        </button>

        {/* Botón Atajos (/) */}
        <button
          type="button"
          onClick={() => {
            setShowSnippets((prev) => !prev);
            setShowPaymentMenu(false);
            setShowCatalogMenu(false);
          }}
          className={`h-7 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer select-none ${
            showSnippets
              ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-2xs'
              : 'bg-slate-50 dark:bg-[#1A1F2C] hover:bg-slate-100 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#232A3B]'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
          <span>Atajos (/)</span>
        </button>

        {/* Botón Datos de Pago */}
        <button
          ref={paymentButtonRef}
          type="button"
          onClick={() => {
            setShowPaymentMenu((prev) => {
              if (!prev) {
                getOrganizationPaymentAccounts()
                  .then((accs) => setPaymentAccounts(accs || []))
                  .catch(() => {});
              }
              return !prev;
            });
            setShowSnippets(false);
            setShowCatalogMenu(false);
          }}
          className={`h-7 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer select-none ${
            showPaymentMenu
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
              : 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
          }`}
          title="Insertar datos bancarios y cuentas de pago de la empresa"
        >
          <CreditCard className={`w-3.5 h-3.5 ${showPaymentMenu ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
          <span>Datos de Pago</span>
        </button>

        {/* Botón Catálogo */}
        <button
          ref={catalogButtonRef}
          type="button"
          onClick={() => {
            setShowCatalogMenu((prev) => !prev);
            setShowSnippets(false);
            setShowPaymentMenu(false);
          }}
          className={`h-7 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer select-none ${
            showCatalogMenu
              ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-2xs'
              : 'bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-blue-500/30'
          }`}
          title="Enviar fotos y precios oficiales de productos en 1 clic"
        >
          <Camera className={`w-3.5 h-3.5 ${showCatalogMenu ? 'text-white' : 'text-[#0052FF] dark:text-[#00D2FF]'}`} />
          <span>Catálogo</span>
          {catalogItems.length > 0 && (
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold leading-tight ${
                showCatalogMenu
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-200 dark:bg-blue-900/60 text-[#0052FF] dark:text-[#00D2FF]'
              }`}
            >
              {catalogItems.length}
            </span>
          )}
        </button>

        {/* Snippets rápidos de 1 clic (máx 2 visibles sin duplicar Datos de Pago; el resto en Atajos /) */}
        {activeSnippets
          .filter((s) => !/^\/(pago|cuenta)$/i.test(s.shortcut))
          .slice(0, 2)
          .map((snippet) => (
          <button
            key={snippet.shortcut}
            type="button"
            onClick={() => handleApplySnippet(snippet.text)}
            className="h-7 shrink-0 whitespace-nowrap inline-flex items-center px-2.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#1A1F2C] hover:bg-slate-100 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] transition truncate max-w-[150px] cursor-pointer select-none active:scale-95"
            title={`${snippet.shortcut} - ${snippet.text}`}
          >
            {snippet.label}
          </button>
        ))}

        {/* Botón Personalizar */}
        <button
          type="button"
          onClick={() => setIsManageModalOpen(true)}
          className="h-7 shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-2 text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer ml-auto select-none"
          title="Personalizar atajos y ver sugerencias de la IA"
        >
          <Settings2 className="w-3.5 h-3.5" />
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
        <VoiceRecorderBar
          recordingSeconds={recordingSeconds}
          isUploadingAudio={isUploadingAudio}
          onCancel={cancelRecording}
          onSend={stopAndSendRecording}
        />
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

          {/* Banner de Borrador Sugerido por el Copiloto IA */}
          {aiDraft && (
            <div className="mx-2.5 mb-1.5 p-2 rounded-xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-blue-50/90 dark:from-[#0052FF]/15 dark:via-[#1A1F2C] dark:to-[#0052FF]/15 border border-blue-200 dark:border-blue-500/30 text-xs shadow-xs animate-in fade-in slide-in-from-bottom-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-white block text-[11px]">
                      Sugerencia del Copiloto IA:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 text-xs italic mt-0.5 line-clamp-2 leading-snug" title={aiDraft}>
                      &ldquo;{aiDraft}&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage(aiDraft);
                      onDraftChange?.(aiDraft);
                      setAiDraft(null);
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.style.height = 'auto';
                          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
                          inputRef.current.focus();
                        }
                      }, 10);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-[#0052FF] text-white hover:bg-[#0043D4] rounded-lg transition shadow-2xs flex items-center gap-1 cursor-pointer"
                    title="Usar este borrador (Presiona Tab)"
                  >
                    <span>Usar</span>
                    <kbd className="text-[9px] bg-white/20 px-1 rounded font-mono">Tab</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDraft(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition cursor-pointer"
                    title="Descartar borrador"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
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
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 25 * 1024 * 1024) {
                  setMediaError('El archivo supera el límite máximo de 25 MB.');
                  return;
                }
                setMediaError(null);
                const isVideo = file.type.startsWith('video/');
                const isDoc = !file.type.startsWith('image/') && !isVideo;
                const fileToUse = (!isDoc && !isVideo) ? await compressImageClient(file) : file;

                setPendingMedia({
                  file: fileToUse,
                  previewUrl: isDoc ? undefined : URL.createObjectURL(fileToUse),
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
              onPaste={async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  const item = items[i];
                  if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                      if (file.size > 25 * 1024 * 1024) {
                        setMediaError('La imagen pegada supera el límite de 25 MB.');
                        return;
                      }
                      setMediaError(null);
                      const compressed = await compressImageClient(file);
                      setPendingMedia({
                        file: compressed,
                        previewUrl: URL.createObjectURL(compressed),
                        caption: message.trim(),
                        isDocument: false,
                      });
                      setMessage('');
                      e.preventDefault();
                      break;
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
              title="Enviar (Enter) · ⌘+Enter para Enviar y pasar al siguiente"
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
        onClose={() => {
          setIsManageModalOpen(false);
          setManageModalInitialShortcut(null);
        }}
        activeSnippets={activeSnippets}
        aiSuggestions={aiSuggestions}
        onSnippetsUpdated={(updated) => {
          setActiveSnippets(updated);
          useInboxStore.getState().setBootstrap({
            quickReplies: { activeSnippets: updated, aiSuggestions },
          });
        }}
        initialEditShortcut={manageModalInitialShortcut}
      />
    </div>
  );
}
