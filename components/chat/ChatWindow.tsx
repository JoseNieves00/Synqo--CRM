'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MessageSender } from '@/lib/supabase/types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AiToggleSwitch } from './AiToggleSwitch';
import { ChatHeader } from './ChatHeader';
import { ContactPanel } from './ContactPanel';
import { formatMessageDateDivider } from '@/lib/utils/inbox-date';
import { isWithin24HourWindow, getRemainingHoursInWindow, PIPELINE_STAGES } from '@/services/contact.service';
import {
  sendAgentMessage,
  sendAgentMediaMessage,
  sendAgentTemplate,
  toggleContactAi,
  endContactConversation,
  reopenContactConversation,
  markContactReactivationDismissed,
  generateReactivationAiSuggestion,
  snoozeContactAi,
  triggerSinglePendingAiAction,
  reactToMessage,
} from '@/app/actions/chat';
import { useInboxStore } from '@/lib/inbox/use-inbox-store';
import { formatImageMessageContent, formatDocumentMessageContent, formatAudioMessageContent, formatVideoMessageContent, formatQuoteMessageContent } from '@/lib/media/format';
import { claimUnassignedLead, assignLeadByAdmin, takeoverInactiveLead } from '@/app/actions/assignment';
import dynamic from 'next/dynamic';
import { deleteContactWithPassword, updateContactDetails } from '@/app/actions/contacts';
import { completeContactReminder, cancelContactReminder, type ActiveReminderData } from '@/app/actions/reminders';
import { META_TEMPLATES } from '@/lib/whatsapp/templates';
import { createClient } from '@/lib/supabase/client';

const ScheduleReminderModal = dynamic(
  () => import('./ScheduleReminderModal').then((m) => m.ScheduleReminderModal),
  { ssr: false }
);
const AiSummaryModal = dynamic(
  () => import('./AiSummaryModal'),
  { ssr: false }
);
import {
  Phone,
  ArrowLeft,
  Clock,
  AlertCircle,
  UserCheck,
  Zap,
  User,
  Shield,
  Bot,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Instagram,
  Trash2,
  AlertTriangle,
  Lock,
  Sparkles,
  Package,
  RotateCcw,
  Check,
  Pencil,
  Flag,
  X,
  Receipt,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Search,
  Smartphone,
} from 'lucide-react';
import { updateLeadStage } from '@/app/actions/pipeline';
import { PipelineStage } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';

interface MessageItem {
  id: string;
  sender_type: MessageSender;
  content: string;
  created_at: string;
  status?: string | null;
  reply_to_message_id?: string | null;
  reactions?: any;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ChatWindowProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    pipeline_stage?: any;
    is_ai_active: boolean;
    last_interaction_at: string;
    assigned_to?: string | null;
    custom_fields?: any;
    channel?: 'whatsapp' | 'instagram';
    instagram_username?: string | null;
    instagram_id?: string | null;
    conversation_status?: string;
    waiting_since?: string | null;
    deal_value?: number | null;
    unread_count?: number;
    last_message?: any;
    last_message_sender?: string | null;
    last_message_preview?: string | null;
    ai_snooze_until?: string | null;
  };
  messages: MessageItem[];
  isLoadingMessages?: boolean;
  onOptimisticMessage?: (msg: MessageItem) => void;
  onContactUpdate?: (fields: Partial<any>) => void;
  onLoadOlderMessages?: (contactId: string) => Promise<number>;
  customTemplates?: Array<{ name: string; label: string }>;
  whatsappProvider?: 'meta' | 'evolution';
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
  onBack?: () => void;
}

export function ChatWindow({
  contact,
  messages,
  isLoadingMessages = false,
  onOptimisticMessage,
  onContactUpdate,
  onLoadOlderMessages,
  customTemplates,
  whatsappProvider = 'meta',
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  onBack,
}: ChatWindowProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const lastContactIdRef = useRef<string>(contact.id);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasNoMoreOlder, setHasNoMoreOlder] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const broadcastChannelRef = useRef<any>(null);
  const lastTypingBroadcastRef = useRef<number>(0);

  // Estados de Eliminación Rápida de Chat
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Estados de Recordatorio Comercial
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isAiSummaryModalOpen, setIsAiSummaryModalOpen] = useState(false);
  const [activeReminder, setActiveReminder] = useState<ActiveReminderData | null>(
    contact.custom_fields?.active_reminder || null
  );
  const [isCompletingReminder, setIsCompletingReminder] = useState(false);

  // Estados de Finalización de Conversación ('Dar Fin')
  const [isEndChatModalOpen, setIsEndChatModalOpen] = useState(false);
  const [endResolution, setEndResolution] = useState<'completed' | 'won' | 'lost'>('completed');
  const [endNote, setEndNote] = useState('');
  const [endDealValue, setEndDealValue] = useState(contact.deal_value ? String(contact.deal_value) : '');
  const [isEndingChat, setIsEndingChat] = useState(false);

  useEffect(() => {
    const handleOpenEndModal = (e: any) => {
      const res = e.detail?.resolution;
      if (res) setEndResolution(res);
      setIsEndChatModalOpen(true);
    };
    window.addEventListener('synqo-open-end-chat-modal', handleOpenEndModal as EventListener);
    return () => window.removeEventListener('synqo-open-end-chat-modal', handleOpenEndModal as EventListener);
  }, []);

  // Estados de Citar / Responder Mensaje
  const [replyingToMessage, setReplyingToMessage] = useState<{
    id?: string;
    senderType: MessageSender;
    content: string;
  } | null>(null);

  const handleReplyMessage = React.useCallback(
    (target: { id?: string; senderType: MessageSender; content: string }) => {
      setReplyingToMessage(target);
    },
    []
  );

  // Limpiar estados locales al cambiar de conversación (siempre volver al chat sin ficha invasiva)
  useEffect(() => {
    setReplyingToMessage(null);
    setShowMoreActions(false);
    setShowSnoozeMenu(false);
    setIsSearchOpen(false);
    setChatSearchQuery('');
    setUnreadBelowCount(0);
    setShowScrollBottom(false);
    setIsRightPanelOpen(false);
  }, [contact.id]);

  // 1. Reacciones bidireccionales con emojis
  const handleReactMessage = React.useCallback(
    async (messageId: string, emoji: string) => {
      const msg = messages.find((m) => m.id === messageId);
      const isRemoving = msg?.reactions?.emoji === emoji;
      const nextReactions = isRemoving ? null : { emoji, from: 'agent', reacted_at: new Date().toISOString() };
      useInboxStore.getState().updateMessageReaction(messageId, contact.id, nextReactions);

      try {
        await reactToMessage(messageId, emoji);
      } catch (err) {
        console.warn('[ChatWindow] Error reaccionando al mensaje:', err);
      }
    },
    [contact.id, messages]
  );

  // 2. Búsqueda dentro de la conversación actual (WhatsApp Web Parity)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  const searchMatches = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .map((m, idx) => (m.content?.toLowerCase().includes(q) ? idx : -1))
      .filter((idx) => idx !== -1);
  }, [messages, chatSearchQuery]);

  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [chatSearchQuery]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const next = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(next);
    const targetMsg = messages[searchMatches[next]];
    if (targetMsg?.id) {
      document.getElementById(`msg-${targetMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prev = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prev);
    const targetMsg = messages[searchMatches[prev]];
    if (targetMsg?.id) {
      document.getElementById(`msg-${targetMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 3. Botón flotante ↓ de salto al fondo con contador de nuevos mensajes
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const prevMessagesLengthRef = useRef(messages.length);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isFar = fromBottom > 200;
    setShowScrollBottom(isFar);
    if (!isFar) {
      setUnreadBelowCount(0);
    }
  };

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      if (showScrollBottom) {
        setUnreadBelowCount((prev) => prev + (messages.length - prevMessagesLengthRef.current));
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, showScrollBottom]);

  // 4. Divisor visual de mensajes no leídos al abrir la conversación
  const initialUnreadCountRef = useRef<number>(contact.unread_count || 0);
  useEffect(() => {
    initialUnreadCountRef.current = contact.unread_count || 0;
  }, [contact.id]);

  const unreadDividerIndex = useMemo(() => {
    const count = initialUnreadCountRef.current;
    if (count <= 0) return -1;
    const idx = messages.length - count;
    return idx >= 0 ? idx : 0;
  }, [messages.length]);

  // Estados de Pausa Temporal de IA (Snooze)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

  // Menú estructurado de Más Opciones (...)
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreActionsRef.current && !moreActionsRef.current.contains(event.target as Node)) {
        setShowMoreActions(false);
      }
    }
    if (showMoreActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreActions]);

  const handleSnoozeAi = async (duration: 30 | 120 | 'tomorrow') => {
    setShowSnoozeMenu(false);
    try {
      await snoozeContactAi(contact.id, duration);
      let resumeIso: string;
      if (duration === 30) resumeIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      else if (duration === 120) resumeIso = new Date(Date.now() + 120 * 60 * 1000).toISOString();
      else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
        resumeIso = d.toISOString();
      }
      onContactUpdate?.({
        is_ai_active: false,
        ai_snooze_until: resumeIso,
        conversation_status: 'snoozed',
        waiting_since: null,
        custom_fields: {
          ...(contact.custom_fields || {}),
          ai_snooze_until: resumeIso,
          manual_ai_paused: false,
          unattended_handoff: false,
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al pausar la IA');
    }
  };

  useEffect(() => {
    setActiveReminder(contact.custom_fields?.active_reminder || null);
  }, [contact.custom_fields?.active_reminder]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showDeleteModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showDeleteModal]);

  const handleDeleteChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword.trim() || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteContactWithPassword(contact.id, deletePassword);
      setShowDeleteModal(false);
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/inbox');
        window.dispatchEvent(new CustomEvent('synqo-chat-deleted', { detail: contact.id }));
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Error al eliminar la conversación');
    } finally {
      setIsDeleting(false);
    }
  };

  // Estados de Asignación y Bloqueo Concurrente
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [otherTyping, setOtherTyping] = useState<string | null>(null);

  // Despacho puntual de IA para este chat
  const [isTriggeringAi, setIsTriggeringAi] = useState(false);

  const isLastMessageFromLead = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.sender_type === 'lead';
  }, [messages]);

  const handleTriggerSingleAi = async () => {
    if (isTriggeringAi) return;
    setIsTriggeringAi(true);
    try {
      if (!contact.is_ai_active) {
        onContactUpdate?.({ is_ai_active: true });
        await toggleContactAi(contact.id, true);
      }
      await triggerSinglePendingAiAction(contact.id);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Error al solicitar respuesta de IA');
    } finally {
      setIsTriggeringAi(false);
    }
  };

  const isBaileys = whatsappProvider === 'evolution';
  const is24hValid = isBaileys ? true : isWithin24HourWindow(contact.last_interaction_at);
  const remainingHours = getRemainingHoursInWindow(contact.last_interaction_at);
  const effectiveTemplates = isBaileys ? [] : customTemplates;

  const isAdminOrSupervisor = currentUserRole === 'admin' || currentUserRole === 'supervisor';
  const isAssignedToMe = contact.assigned_to === currentUserId;
  const isUnassigned = !contact.assigned_to;
  const isAssignedToOther = Boolean(contact.assigned_to && contact.assigned_to !== currentUserId);

  // Desenganche de Asesor Inactivo (> 5 minutos de espera sin respuesta del asesor asignado)
  const inactiveAdvisorMinutes = React.useMemo(() => {
    if (!isAssignedToOther || contact.is_ai_active) return 0;
    try {
      const elapsed = (Date.now() - new Date(contact.last_interaction_at).getTime()) / (1000 * 60);
      return Math.max(0, elapsed);
    } catch {
      return 0;
    }
  }, [isAssignedToOther, contact.is_ai_active, contact.last_interaction_at]);

  const canTakeoverInactive = isAssignedToOther && inactiveAdvisorMinutes >= 5;

  // Modo Solo Lectura: Si está asignado a otro agente y el usuario actual es un agente regular,
  // se libera si el asesor asignado lleva > 5 min inactivo para que otro asesor rescate al cliente
  const isReadOnly = isAssignedToOther && !isAdminOrSupervisor && !canTakeoverInactive;

  const assignedMember = teamMembers.find((m) => m.id === contact.assigned_to);

  // Edición Rápida del Nombre del Lead en Cabecera
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(contact.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    setTempName(contact.name || '');
    setIsEditingName(false);
  }, [contact.id, contact.name]);

  const handleSaveQuickName = async () => {
    const newName = tempName.trim();
    if (!newName) return;
    setIsSavingName(true);
    try {
      await updateContactDetails(contact.id, { name: newName });
      onContactUpdate?.({ name: newName });
      setIsEditingName(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al actualizar nombre del lead');
    } finally {
      setIsSavingName(false);
    }
  };

  // Rescate de Lead por Inactividad de Asesor (> 5m)
  const handleTakeoverInactive = async () => {
    if (isClaiming || !currentUserId) return;
    setIsClaiming(true);
    try {
      const res = await takeoverInactiveLead(contact.id);
      if (res.success) {
        onContactUpdate?.({ assigned_to: currentUserId });
        setClaimSuccess(true);
        setTimeout(() => setClaimSuccess(false), 3000);
      } else {
        setErrorMessage(res.error || 'No se pudo tomar el cliente.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al rescatar el cliente.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Detección de Motivo de Relevo de IA para Banner de Contexto
  const [dismissedHandoffBanner, setDismissedHandoffBanner] = useState(false);
  useEffect(() => {
    setDismissedHandoffBanner(false);
  }, [contact.id]);

  // Sugerencias de Reactivación con IA según el interés del prospecto
  const [isGeneratingReactivation, setIsGeneratingReactivation] = useState(false);
  const [reactivationAiResult, setReactivationAiResult] = useState<{
    detectedInterest: string;
    suggestedMessage: string;
    alternativeHook: string;
  } | null>(null);

  useEffect(() => {
    setReactivationAiResult(null);
  }, [contact.id]);

  const latestHandoffReason = React.useMemo(() => {
    if (contact.is_ai_active || messages.length === 0) return null;
    const startIdx = Math.max(0, messages.length - 15);
    for (let i = messages.length - 1; i >= startIdx; i--) {
      const m = messages[i];
      if (
        m.sender_type === 'system' &&
        (m.content.includes('Relevo') || m.content.includes('Asesor humano requerido'))
      ) {
        const match = m.content.match(/Motivo:\s*["']?([^"'\]]+)["']?/i);
        if (match && match[1]) return match[1].trim();
        return m.content.replace(/^\[🚨\s*/, '').replace(/\]$/, '').trim();
      }
    }
    return null;
  }, [messages, contact.is_ai_active]);

  // Pre-computar índices de divisores de fecha (cero asignaciones new Date() por mensaje)
  const dateDividers = React.useMemo(() => {
    const dividerSet = new Set<number>();
    let lastDateStr = '';
    for (let i = 0; i < messages.length; i++) {
      const dateStr = messages[i].created_at ? messages[i].created_at.slice(0, 10) : '';
      if (dateStr && dateStr !== lastDateStr) {
        dividerSet.add(i);
        lastDateStr = dateStr;
      }
    }
    return dividerSet;
  }, [messages]);

  const lastMessage = messages[messages.length - 1];
  const isWaitingForHuman = !contact.is_ai_active && lastMessage && lastMessage.sender_type === 'lead';

  // Detección acotada de Comprobante de Pago pendiente de verificación por asesor humano
  const hasPendingReceipt = React.useMemo(() => {
    if (contact.pipeline_stage === 'ganado' || messages.length === 0) return false;
    const startIdx = Math.max(0, messages.length - 20);
    for (let i = messages.length - 1; i >= startIdx; i--) {
      const c = messages[i].content;
      if (c && (c.includes('Comprobante de pago recibido') || c.toLowerCase().includes('comprobante de pago'))) {
        return true;
      }
    }
    return false;
  }, [messages, contact.pipeline_stage]);

  // Preservar la posición de scroll individual por conversación al cambiar de contacto
  useEffect(() => {
    // 1. Guardar la posición de scroll del contacto que estamos dejando
    if (lastContactIdRef.current && scrollContainerRef.current) {
      scrollPositionsRef.current[lastContactIdRef.current] = scrollContainerRef.current.scrollTop;
    }
    lastContactIdRef.current = contact.id;

    // 2. Restaurar la posición de lectura o bajar al fondo si es la primera vez que se abre
    const savedPos = scrollPositionsRef.current[contact.id];
    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return;
      if (typeof savedPos === 'number') {
        scrollContainerRef.current.scrollTop = savedPos;
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    });
  }, [contact.id]);

  // Auto-scroll suave solo cuando el usuario ya se encuentra cerca del fondo
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 180;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Cargar lote anterior de mensajes con compensación de altura (cero saltos visuales)
  const handleLoadOlder = async () => {
    if (!onLoadOlderMessages || isLoadingOlder) return;
    setIsLoadingOlder(true);
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const loadedCount = await onLoadOlderMessages(contact.id);
      if (loadedCount === 0) {
        setHasNoMoreOlder((prev) => ({ ...prev, [contact.id]: true }));
      } else {
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop += (newScrollHeight - prevScrollHeight);
          }
        });
      }
    } catch (err) {
      console.error('[LOAD OLDER MESSAGES ERROR]', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Canal Realtime Broadcast: Detección de Colisión (Typing Presence entre agentes)
  useEffect(() => {
    if (!contact.id) return;
    const supabase = createClient();
    let typingTimeout: NodeJS.Timeout | null = null;

    const channel = supabase.channel(`chat-collision-${contact.id}`, {
      config: { broadcast: { self: false } },
    });

    broadcastChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const typingUser = payload?.payload?.userName;
        if (typingUser) {
          setOtherTyping(typingUser);
          if (typingTimeout) clearTimeout(typingTimeout);
          typingTimeout = setTimeout(() => {
            setOtherTyping(null);
          }, 3500);
        }
      })
      .subscribe();

    return () => {
      broadcastChannelRef.current = null;
      supabase.removeChannel(channel);
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [contact.id]);

  // Emitir señal de tipeo con throttle de 3.5 segundos para evitar saturación de red
  const handleTypingBroadcast = () => {
    if (!contact.id) return;
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current < 3500) {
      return; // Cero lag en tipeo: no enviar ráfagas de WebSocket por cada tecla
    }
    lastTypingBroadcastRef.current = now;

    const currentMember = teamMembers.find((m) => m.id === currentUserId);
    const myName = currentMember?.full_name || 'Un asesor';
    const channel = broadcastChannelRef.current || createClient().channel(`chat-collision-${contact.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { userName: myName },
      })
      .catch(() => {});
  };

  // Reclamar lead huérfano con Bloqueo Atómico Transaccional
  const handleClaimLead = async () => {
    setIsClaiming(true);
    setErrorMessage(null);
    try {
      await claimUnassignedLead(contact.id);
      setClaimSuccess(true);
      setTimeout(() => setClaimSuccess(false), 3000);
      onContactUpdate?.({ assigned_to: currentUserId });
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo tomar el lead.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Reasignar lead (solo Admins o Supervisores)
  const handleAdminReassign = async (targetId: string) => {
    setErrorMessage(null);
    const targetAssigned = targetId === 'unassigned' ? null : targetId;
    try {
      await assignLeadByAdmin(contact.id, targetAssigned);
      onContactUpdate?.({ assigned_to: targetAssigned });
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al reasignar lead.');
    }
  };

  // Estados y acciones de Embudo y Validación de Pago
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [isApprovingPayment, setIsApprovingPayment] = useState(false);

  const handleStageChange = async (newStage: PipelineStage) => {
    setIsUpdatingStage(true);
    try {
      const nextTemp =
        newStage === 'ganado'
          ? 'hot'
          : newStage === 'perdido'
          ? 'cold'
          : undefined;
      onContactUpdate?.({
        pipeline_stage: newStage,
        ...(newStage === 'ganado' || newStage === 'perdido'
          ? { conversation_status: 'closed', is_ai_active: false, waiting_since: null }
          : {}),
        ...(nextTemp
          ? { custom_fields: { ...(contact.custom_fields || {}), lead_temperature: nextTemp } }
          : {}),
      });
      await updateLeadStage(contact.id, newStage);
    } catch (err: any) {
      console.error('[UPDATE STAGE ERROR]', err);
      setErrorMessage(err?.message || 'Error al actualizar fase del embudo');
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const handleVerifyAndApprovePayment = async () => {
    if (isApprovingPayment) return;
    setIsApprovingPayment(true);
    setErrorMessage(null);
    try {
      // 1. Actualizar fase en BD
      await updateLeadStage(contact.id, 'ganado');
      onContactUpdate?.({
        pipeline_stage: 'ganado',
        conversation_status: 'closed',
        is_ai_active: false,
        waiting_since: null,
        custom_fields: { ...(contact.custom_fields || {}), lead_temperature: 'hot' },
      });

      // 2. Enviar mensaje de confirmación amigable al cliente
      const confirmationText = '¡Excelente! Hemos verificado tu comprobante de pago exitosamente. 🎉 Tu orden ha sido confirmada y pasará a despacho. ¡Muchas gracias por tu compra!';
      await handleSendMessage(confirmationText);
    } catch (err: any) {
      console.error('[APPROVE PAYMENT ERROR]', err);
      setErrorMessage(err?.message || 'Error al verificar y aprobar el comprobante');
    } finally {
      setIsApprovingPayment(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    setErrorMessage(null);
    let finalContent = text;
    const replyMeta = replyingToMessage;
    if (replyMeta) {
      finalContent = formatQuoteMessageContent(replyMeta.content, text);
    }
    setReplyingToMessage(null);

    const clientMessageId = crypto.randomUUID();
    onOptimisticMessage?.({
      id: clientMessageId,
      sender_type: 'agent_manual',
      content: finalContent,
      created_at: new Date().toISOString(),
      status: 'sending',
      reply_to_message_id: replyMeta?.id || null,
    });
    try {
      await sendAgentMessage(contact.id, finalContent, replyMeta?.id, clientMessageId);
      if (isReactivationEligible) {
        markContactReactivationDismissed(contact.id).catch(() => {});
        onContactUpdate?.({
          custom_fields: {
            ...(contact.custom_fields || {}),
            reactivation_attempted: true,
          },
        });
      }
    } catch (err: any) {
      console.error('[SEND MESSAGE ERROR]', err);
      onOptimisticMessage?.({
        id: clientMessageId,
        sender_type: 'agent_manual',
        content: finalContent,
        created_at: new Date().toISOString(),
        status: 'failed',
        reply_to_message_id: replyMeta?.id || null,
      });
      const msg = err?.message || '';
      if (msg.includes('Session has expired') || msg.includes('access token') || msg.includes('OAuthException') || msg.includes('190')) {
        setErrorMessage('El token de acceso de WhatsApp ha expirado en Meta. Por favor actualízalo en Configuración.');
      } else if (msg.includes('131047') || msg.includes('24 hours') || msg.includes('24h')) {
        setErrorMessage('La ventana de 24 horas de Meta ha vencido para este cliente. Debes enviar una Plantilla Oficial para reanudar la conversación.');
      } else if (msg.includes('Disconnected') || msg.includes('desconectad') || msg.includes('405')) {
        setErrorMessage('El teléfono o la sesión de WhatsApp está desconectada. Revisa la vinculación en Configuración.');
      } else {
        setErrorMessage(`Error al enviar mensaje: ${msg || 'Error de conexión con WhatsApp'}`);
      }
      throw err; // Permite a ChatInput preservar el texto escrito en el borrador
    }
  };

  const handleRetryMessage = async (msg: { id?: string; content: string }) => {
    setErrorMessage(null);
    const retryId = msg.id || crypto.randomUUID();
    onOptimisticMessage?.({
      id: retryId,
      sender_type: 'agent_manual',
      content: msg.content,
      created_at: new Date().toISOString(),
      status: 'sending',
    });
    try {
      await sendAgentMessage(contact.id, msg.content, undefined, retryId);
    } catch (err: any) {
      console.error('[RETRY MESSAGE ERROR]', err);
      onOptimisticMessage?.({
        id: retryId,
        sender_type: 'agent_manual',
        content: msg.content,
        created_at: new Date().toISOString(),
        status: 'failed',
      });
      setErrorMessage(`Error al reintentar envío: ${err?.message || 'Error de conexión con WhatsApp'}`);
    }
  };

  const handleSendMedia = async (
    mediaUrl: string,
    caption?: string,
    fileName?: string,
    isDocument?: boolean,
    isAudio?: boolean,
    isVideo?: boolean
  ) => {
    setErrorMessage(null);
    const formatted = isVideo
      ? formatVideoMessageContent(mediaUrl, caption)
      : isAudio
      ? formatAudioMessageContent(mediaUrl, caption)
      : isDocument
      ? formatDocumentMessageContent(mediaUrl, fileName, caption)
      : formatImageMessageContent(mediaUrl, caption);
    const clientMessageId = crypto.randomUUID();
    onOptimisticMessage?.({
      id: clientMessageId,
      sender_type: 'agent_manual',
      content: formatted,
      created_at: new Date().toISOString(),
      status: 'sending',
    });
    try {
      await sendAgentMediaMessage(contact.id, mediaUrl, caption, fileName, isDocument, isAudio, isVideo, clientMessageId);
    } catch (err: any) {
      console.error('[SEND MEDIA ERROR]', err);
      onOptimisticMessage?.({
        id: clientMessageId,
        sender_type: 'agent_manual',
        content: formatted,
        created_at: new Date().toISOString(),
        status: 'failed',
      });
      setErrorMessage(`Error al enviar archivo o audio: ${err?.message || 'Error de conexión con WhatsApp'}`);
      throw err;
    }
  };

  const handleSendTemplate = async (templateKey: string) => {
    setErrorMessage(null);
    const tplLabel = (META_TEMPLATES as any)[templateKey]?.label || templateKey;
    const clientMessageId = crypto.randomUUID();
    onOptimisticMessage?.({
      id: clientMessageId,
      sender_type: 'agent_manual',
      content: `[Plantilla oficial: ${tplLabel}]`,
      created_at: new Date().toISOString(),
      status: 'sending',
    });
    try {
      await sendAgentTemplate(contact.id, templateKey, clientMessageId);
    } catch (err: any) {
      console.error('[SEND TEMPLATE ERROR]', err);
      onOptimisticMessage?.({
        id: clientMessageId,
        sender_type: 'agent_manual',
        content: `[Plantilla oficial: ${tplLabel}]`,
        created_at: new Date().toISOString(),
        status: 'failed',
      });
      const msg = err?.message || '';
      if (msg.includes('Session has expired') || msg.includes('access token')) {
        setErrorMessage('El token de acceso de WhatsApp ha expirado en Meta. Por favor genera un token permanente en Meta for Developers e ingrésalo en Configuración.');
      } else if (msg.includes('does not exist in')) {
        setErrorMessage(`La plantilla "${templateKey}" no existe o aún no ha sido aprobada en Meta para el idioma configurado.`);
      } else {
        setErrorMessage(`Error de Meta al enviar plantilla: ${msg || 'No se pudo despachar la plantilla'}`);
      }
    }
  };

  const handleCompleteReminder = async () => {
    if (!activeReminder || isCompletingReminder) return;
    setIsCompletingReminder(true);
    try {
      await completeContactReminder(contact.id, activeReminder.id);
      setActiveReminder(null);
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          active_reminder: null,
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al completar recordatorio');
    } finally {
      setIsCompletingReminder(false);
    }
  };

  const handleCancelReminder = async () => {
    if (!activeReminder) return;
    if (!window.confirm('¿Deseas cancelar y descartar este recordatorio?')) return;
    try {
      await cancelContactReminder(contact.id, activeReminder.id);
      setActiveReminder(null);
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          active_reminder: null,
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al cancelar recordatorio');
    }
  };

  // 🛡️ Lógica de Reactivación de Leads Fríos (Blindaje Anti-Spam: 1 Solo Intento)
  const isReactivationEligible = useMemo(() => {
    // 1. Etapas excluidas
    if (
      contact.pipeline_stage === 'ganado' ||
      contact.pipeline_stage === 'perdido' ||
      contact.pipeline_stage === 'cita_agendada'
    ) {
      return false;
    }
    // 2. Si la conversación está cerrada formalmente
    if (contact.conversation_status === 'closed' || contact.custom_fields?.conversation_status === 'closed') {
      return false;
    }
    // 3. Ya se intentó reactivar (anti-spam de 1 intento)
    if (contact.custom_fields?.reactivation_attempted) {
      return false;
    }
    // 4. Si el cliente tiene mensajes sin leer o está esperando respuesta, NO es reactivación (es Por Responder)
    if ((contact.unread_count || 0) > 0 || contact.waiting_since) {
      return false;
    }
    // 5. El último mensaje DEBE haber sido enviado por NOSOTROS (IA o Asesor).
    // Si el lead habló de último o la IA/asesor no han respondido, no es reactivación en frío.
    const effectiveSender =
      contact.last_message_sender ||
      contact.last_message?.sender_type ||
      contact.custom_fields?.last_message?.sender_type;

    if (effectiveSender === 'lead') {
      return false;
    }

    // 6. Debe tener entre 24 horas y 10 días de silencio
    try {
      const elapsed = Date.now() - new Date(contact.last_interaction_at).getTime();
      const hours = elapsed / (1000 * 3600);
      return hours >= 24 && hours <= 240;
    } catch {
      return false;
    }
  }, [
    contact.pipeline_stage,
    contact.conversation_status,
    contact.custom_fields?.conversation_status,
    contact.custom_fields?.reactivation_attempted,
    contact.custom_fields?.last_message,
    contact.unread_count,
    contact.waiting_since,
    contact.last_message_sender,
    contact.last_message,
    contact.last_interaction_at,
  ]);

  const isWaitingForResponse = Boolean(contact.waiting_since || (contact.unread_count && contact.unread_count > 0));

  const handleApplyApologyMessage = () => {
    const cleanName = (contact.name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';
    const text = `${greeting} Te ofrezco una sincera disculpa por la demora en responderte, teníamos congestión en la línea. Ya estoy aquí contigo para atenderte con prioridad. Cuéntame, ¿todavía te podemos colaborar con tu consulta?`;
    if (typeof window !== 'undefined' && contact.id) {
      try {
        localStorage.setItem(`synqo_draft_${contact.id}`, text);
        window.dispatchEvent(new CustomEvent('synqo-apply-draft', { detail: { contactId: contact.id, text } }));
      } catch {}
    }
  };

  const handleApplyDraftText = (text: string) => {
    if (typeof window !== 'undefined' && contact.id) {
      try {
        localStorage.setItem(`synqo_draft_${contact.id}`, text);
        window.dispatchEvent(new CustomEvent('synqo-apply-draft', { detail: { contactId: contact.id, text } }));
      } catch {}
    }
  };

  const handleApplyReactivationMessage = () => {
    const cleanName = (contact.name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';
    const text = `${greeting} ¿Cómo estás? Quería saber si tuviste oportunidad de revisar la información que te compartimos o si tienes alguna inquietud en la que podamos apoyarte 😊`;
    handleApplyDraftText(text);
  };

  const handleGenerateAiReactivation = async () => {
    if (isGeneratingReactivation) return;
    setIsGeneratingReactivation(true);
    setErrorMessage(null);
    try {
      const res = await generateReactivationAiSuggestion(contact.id);
      if (res.success && res.suggestedMessage) {
        setReactivationAiResult({
          detectedInterest: res.detectedInterest || 'Interés comercial',
          suggestedMessage: res.suggestedMessage,
          alternativeHook: res.alternativeHook || '',
        });
      } else {
        setErrorMessage(res.error || 'No se pudo generar la sugerencia de reactivación');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al conectar con la IA');
    } finally {
      setIsGeneratingReactivation(false);
    }
  };

  const handleDismissReactivation = async () => {
    try {
      await markContactReactivationDismissed(contact.id);
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          reactivation_attempted: true,
        },
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const handleEndConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEndingChat) return;
    setIsEndingChat(true);
    setErrorMessage(null);
    try {
      const dealNum = endResolution === 'won' && endDealValue ? parseFloat(endDealValue.replace(/[^0-9.]/g, '')) || null : null;
      await endContactConversation(contact.id, endResolution, endNote, dealNum);
      setIsEndChatModalOpen(false);
      setEndNote('');
      onContactUpdate?.({
        pipeline_stage: endResolution === 'won' ? 'ganado' : endResolution === 'lost' ? 'perdido' : contact.pipeline_stage,
        conversation_status: 'closed',
        deal_value: dealNum ?? contact.deal_value,
        custom_fields: {
          ...(contact.custom_fields || {}),
          conversation_status: 'closed',
          ...(dealNum ? { deal_value: dealNum } : {}),
        },
      });

      // Despachar evento para saltar automáticamente al siguiente chat en la cola (Inbox Zero)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('synqo-inbox-zero-next', { detail: { closedContactId: contact.id } }));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al finalizar conversación');
    } finally {
      setIsEndingChat(false);
    }
  };

  const handleToggleAi = async (newState: boolean) => {
    const nextCf = { ...(contact.custom_fields || {}) };
    if (newState) {
      nextCf.manual_ai_paused = false;
      delete nextCf.ai_snooze_until;
      delete nextCf.mobile_takeover_at;
      delete nextCf.mobile_takeover_source;
    } else {
      nextCf.manual_ai_paused = true;
    }
    onContactUpdate?.({
      is_ai_active: newState,
      ...(newState ? { ai_snooze_until: null } : {}),
      custom_fields: nextCf,
    });
    await toggleContactAi(contact.id, newState);
  };

  const handleReopenChat = async () => {
    try {
      await reopenContactConversation(contact.id);
      onContactUpdate?.({
        conversation_status: 'open',
        custom_fields: {
          ...(contact.custom_fields || {}),
          conversation_status: 'open',
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al reabrir conversación');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isTyping) return;

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setIsEndChatModalOpen(true);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleToggleAi(!contact.is_ai_active);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contact.is_ai_active, contact.id]);

  return (
    <div className="flex h-full w-full bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs transition-colors">
      <div className="flex flex-col flex-1 h-full min-w-0">
        {/* Cabecera Modular del Chat */}
        <ChatHeader
          contact={contact as any}
          whatsappProvider={whatsappProvider}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          teamMembers={teamMembers}
          isRightPanelOpen={isRightPanelOpen}
          onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
          isSearchOpen={isSearchOpen}
          onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
          onToggleAi={() => handleToggleAi(!contact.is_ai_active)}
          onSnoozeAi={handleSnoozeAi}
          onClaimLead={handleClaimLead}
          onReassignLead={handleAdminReassign}
          onCloseChat={() => setIsEndChatModalOpen(true)}
          onReopenChat={handleReopenChat}
          onOpenScheduleReminder={() => setIsReminderModalOpen(true)}
          onOpenSendTemplate={() => setIsTemplatesModalOpen(true)}
          onDeleteChat={() => setShowDeleteModal(true)}
          onBack={onBack}
        />

        {/* Banner de Coexistencia Móvil (Asesor escribió desde WhatsApp / Instagram en el celular) */}
        {!contact.is_ai_active && contact.custom_fields?.mobile_takeover_at && !isReadOnly && (
          <div className="px-3 sm:px-4 py-2 bg-sky-50/90 dark:bg-sky-950/30 border-b border-sky-200 dark:border-sky-800/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-900 dark:text-sky-100 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Smartphone className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="truncate">
                Atendido desde{' '}
                <strong>
                  {contact.custom_fields?.mobile_takeover_source === 'mobile_instagram'
                    ? 'Instagram móvil'
                    : 'WhatsApp móvil'}
                </strong>
                {(() => {
                  const resumeIso = contact.ai_snooze_until || contact.custom_fields?.ai_snooze_until;
                  if (contact.custom_fields?.manual_ai_paused) return ' · IA en pausa manual';
                  if (resumeIso && !Number.isNaN(new Date(resumeIso).getTime())) {
                    return ` · IA retoma sola a las ${new Date(resumeIso).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`;
                  }
                  return ' · IA en pausa temporal';
                })()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleToggleAi(true)}
              className="px-2.5 py-1 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
            >
              <Bot className="w-3 h-3" />
              <span>Retomar IA</span>
            </button>
          </div>
        )}

        {/* Barra de acciones táctiles rápidas en navegador móvil (< md) */}
        {!isReadOnly && (
          <div className="flex md:hidden items-center gap-1.5 px-3 py-1.5 bg-slate-50/90 dark:bg-[#0E121B] border-b border-slate-200 dark:border-[#232A3B] overflow-x-auto text-[11px] shrink-0">
            <button
              type="button"
              onClick={() => handleToggleAi(!contact.is_ai_active)}
              className={`px-2.5 py-1 rounded-full font-semibold shrink-0 flex items-center gap-1 border cursor-pointer ${
                contact.is_ai_active
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>{contact.is_ai_active ? 'Pausar IA' : 'Activar IA'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSnoozeAi(120)}
              className="px-2.5 py-1 rounded-full bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200 font-medium shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3 h-3" />
              <span>Pausar 2h</span>
            </button>
            <button
              type="button"
              onClick={() => setIsReminderModalOpen(true)}
              className="px-2.5 py-1 rounded-full bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200 font-medium shrink-0 cursor-pointer"
            >
              ⏰ Recordar
            </button>
            <button
              type="button"
              onClick={() => setIsRightPanelOpen((prev) => !prev)}
              className="px-2.5 py-1 rounded-full bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200 font-medium shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <User className="w-3 h-3" />
              <span>Ficha</span>
            </button>
          </div>
        )}

        {/* Barra de Búsqueda Dentro del Chat (WhatsApp Web Parity) */}
        {isSearchOpen && (
          <div className="px-4 py-2 bg-slate-50 dark:bg-[#0E121B] border-b border-slate-200 dark:border-[#232A3B] flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-1 transition-colors">
            <div className="flex-1 flex items-center gap-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 shadow-2xs focus-within:border-[#0052FF]">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) handlePrevMatch();
                    else handleNextMatch();
                  } else if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Buscar en este chat (Enter: sig, Shift+Enter: ant)..."
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                {chatSearchQuery.trim()
                  ? searchMatches.length > 0
                    ? `${currentMatchIdx + 1} de ${searchMatches.length}`
                    : 'Sin coincidencias'
                  : `${messages.length} mensajes`}
              </span>
              <button
                type="button"
                onClick={handlePrevMatch}
                disabled={searchMatches.length === 0}
                className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                title="Coincidencia anterior"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                disabled={searchMatches.length === 0}
                className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                title="Siguiente coincidencia"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setChatSearchQuery('');
                }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Cerrar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

              {/* Alerta de Error de Meta o Concurrencia */}
      {errorMessage && (
        <div className="mx-4 mt-2.5 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-semibold cursor-pointer shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Alerta de Colisión en Tiempo Real (Otro operador escribiendo) */}
      {otherTyping && (
        <div className="mx-4 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
          <span>
            <strong>{otherTyping}</strong> está respondiendo este chat en este momento...
          </span>
        </div>
      )}

      {/* Banner de Validación Humana de Comprobante de Pago */}
      {hasPendingReceipt && (
        <div className="mx-4 mt-2.5 p-3 bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent border border-emerald-500/30 rounded-xl text-xs text-emerald-950 dark:text-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <span>Comprobante de Pago Recibido</span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  Validación Asesor Requerida
                </span>
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Por seguridad anti-fraude bancario, valida el extracto antes de confirmar la venta al cliente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerifyAndApprovePayment}
            disabled={isApprovingPayment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shrink-0 transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isApprovingPayment ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Aprobando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Aprobar Pago & Marcar Ganado</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Banner de Contexto de Relevo de IA (Motivo específico) */}
      {latestHandoffReason && !dismissedHandoffBanner && (
        <div className="mx-4 mt-2.5 p-3 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 flex-wrap">
                <span>Relevo de IA: Atención Requerida</span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-800 dark:text-amber-300">
                  Duda Puntual
                </span>
              </p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 font-medium">
                <strong className="text-amber-900 dark:text-amber-200">Motivo:</strong> "{latestHandoffReason}"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleToggleAi(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shrink-0 transition shadow-xs cursor-pointer"
              title="Reactivar IA si la consulta ya fue resuelta"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Reactivar IA</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedHandoffBanner(true)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              title="Ocultar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Banner de Atención Pendiente */}
      {isWaitingForHuman && (
        <div className="mx-4 mt-2.5 p-2.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-rose-700 dark:text-rose-300">Atención requerida:</span>{' '}
              <span className="text-slate-600 dark:text-slate-300">El cliente está esperando respuesta de un asesor.</span>
            </div>
          </div>
        </div>
      )}

      {/* Columna de Mensajes + Input */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Lista de Mensajes con Preservación de Scroll */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-[#090A0F] space-y-1 transition-colors">
            {isLoadingMessages && messages.length === 0 ? (
              <div className="h-full flex flex-col justify-end space-y-3 p-2 animate-pulse">
                <div className="flex justify-start">
                  <div className="w-48 h-10 bg-slate-200 dark:bg-[#1A1F2C] rounded-2xl rounded-tl-xs" />
                </div>
                <div className="flex justify-end">
                  <div className="w-56 h-12 bg-blue-100 dark:bg-[#0052FF]/20 rounded-2xl rounded-tr-xs" />
                </div>
                <div className="flex justify-start">
                  <div className="w-40 h-9 bg-slate-200 dark:bg-[#1A1F2C] rounded-2xl rounded-tl-xs" />
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                No hay mensajes registrados con este contacto.
              </div>
            ) : (
              <>
                {/* Botón de Paginación Ascendente ("Cargar anteriores") */}
                {onLoadOlderMessages && !hasNoMoreOlder[contact.id] && messages.length >= 40 && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={handleLoadOlder}
                      disabled={isLoadingOlder}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] text-[11px] font-semibold text-slate-600 dark:text-slate-300 rounded-full shadow-2xs hover:bg-slate-50 dark:hover:bg-[#232A3B] transition cursor-pointer disabled:opacity-50"
                    >
                      {isLoadingOlder ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-[#0052FF]" />
                          <span>Cargando anteriores...</span>
                        </>
                      ) : (
                        <span>Cargar mensajes anteriores</span>
                      )}
                    </button>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const showDateDivider = dateDividers.has(idx);
                  const showUnreadDivider = idx === unreadDividerIndex;

                  return (
                    <React.Fragment key={msg.id || `msg-${idx}`}>
                      {showDateDivider && (
                        <div className="flex justify-center my-3 sticky top-1 z-10 select-none">
                          <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-white/95 dark:bg-[#131722]/95 backdrop-blur-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] shadow-2xs">
                            {formatMessageDateDivider(msg.created_at)}
                          </span>
                        </div>
                      )}
                      {showUnreadDivider && (
                        <div className="flex items-center gap-3 my-4 select-none px-4">
                          <div className="flex-1 h-px bg-blue-200 dark:bg-blue-500/30" />
                          <span className="text-[11px] font-bold text-[#0052FF] dark:text-[#00D2FF] bg-blue-50 dark:bg-[#0052FF]/15 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-500/30 shadow-2xs">
                            Mensajes no leídos
                          </span>
                          <div className="flex-1 h-px bg-blue-200 dark:bg-blue-500/30" />
                        </div>
                      )}
                      <MessageBubble
                        id={msg.id}
                        content={msg.content}
                        senderType={msg.sender_type}
                        createdAt={msg.created_at}
                        status={msg.status}
                        replyToMessageId={msg.reply_to_message_id}
                        reactions={msg.reactions}
                        contactId={contact.id}
                        onReply={handleReplyMessage}
                        onRetry={handleRetryMessage}
                        onReact={handleReactMessage}
                        isSearchMatch={searchMatches[currentMatchIdx] === idx}
                      />
                    </React.Fragment>
                  );
                })}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Botón flotante ↓ de salto al fondo con contador de nuevos mensajes */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                setUnreadBelowCount(0);
              }}
              className="absolute right-6 bottom-24 z-20 flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#232A3B] rounded-full shadow-lg hover:bg-slate-50 dark:hover:bg-[#232A3B] transition cursor-pointer text-xs font-semibold animate-in fade-in zoom-in-95"
            >
              <ChevronDown className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
              {unreadBelowCount > 0 ? (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#0052FF] text-white rounded-full">
                  {unreadBelowCount}
                </span>
              ) : (
                <span>Ir al final</span>
              )}
            </button>
          )}

          {/* Banner de Estado de la IA / Sugerencia de Reactivación antes del Input */}
          {contact.is_ai_active && !isReadOnly ? (
            <div className="px-4 py-1.5 bg-slate-100 dark:bg-[#0E121B] border-t border-slate-200 dark:border-[#1E2433] flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <Bot className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] flex-shrink-0" />
              <span>
                <strong>IA Activa:</strong> La IA está respondiendo automáticamente. Al enviar un mensaje tomarás el control manual.
              </span>
            </div>
          ) : !isReadOnly ? (
            <div className="px-4 py-2 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 dark:from-[#0052FF]/10 dark:via-[#1A1F2C] dark:to-[#0052FF]/10 border-t border-blue-200 dark:border-blue-500/20 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 min-w-0">
                <Sparkles className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
                <span className="truncate">
                  <strong className="text-slate-900 dark:text-white">Asesor en control manual:</strong> ¿Duda del cliente resuelta? Puedes reactivar la IA para que continúe la conversación.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAi(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#0052FF] hover:bg-[#0043D4] text-white rounded-lg text-xs font-semibold shrink-0 transition shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Reactivar IA</span>
              </button>
            </div>
          ) : null}

          {/* Banner de Disculpa Rápida si el cliente está esperando respuesta */}
          {isWaitingForResponse && !isReadOnly && !isReactivationEligible && (
            <div className="mx-4 my-1.5 p-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 min-w-0">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">
                  <strong>Cliente esperando:</strong> Puedes insertar una disculpa y tomar el chat con 1 clic.
                </span>
              </div>
              <button
                type="button"
                onClick={handleApplyApologyMessage}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shrink-0 shadow-xs transition"
              >
                <Zap className="w-3 h-3" />
                <span>Disculpar demora</span>
              </button>
            </div>
          )}

          {/* Banner de Reactivación Inteligente con IA según Interés del Lead */}
          {isReactivationEligible && (
            <div className="mx-4 my-2 p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-300/80 dark:border-amber-500/30 text-xs shadow-xs animate-in fade-in space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 min-w-0">
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="truncate">
                    <span className="font-bold">Lead en seguimiento (&gt;24h en silencio):</span>{' '}
                    <span className="opacity-90">Reanuda la conversación con un gancho basado en su interés real.</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleGenerateAiReactivation}
                    disabled={isGeneratingReactivation}
                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs transition disabled:opacity-60"
                  >
                    {isGeneratingReactivation ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Analizando interés...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-200" />
                        <span>Sugerir con IA</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyReactivationMessage}
                    title="Pegar mensaje rápido predeterminado"
                    className="px-2 py-1 rounded-lg bg-white dark:bg-[#1A1F2C] border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-[11px] font-medium hover:bg-amber-100/50 cursor-pointer transition"
                  >
                    <span>Texto rápido</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissReactivation}
                    title="No insistir más con este contacto"
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tarjeta de Sugerencias Generadas por la IA */}
              {reactivationAiResult && (
                <div className="p-3 bg-white/95 dark:bg-[#0D111A]/95 rounded-lg border border-amber-400/60 dark:border-amber-500/40 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-100 dark:border-amber-950/40 pb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                      <span className="font-bold text-amber-800 dark:text-amber-300 shrink-0">🎯 Interés Detectado:</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/20 truncate">
                        {reactivationAiResult.detectedInterest}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReactivationAiResult(null)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer shrink-0"
                    >
                      Ocultar
                    </button>
                  </div>

                  {/* Opción 1: Enfoque Directo en su Consulta */}
                  <div className="p-2.5 rounded-md bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/30 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
                      <span>Opción A · Gancho Personalizado</span>
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-200 italic leading-relaxed">
                      "{reactivationAiResult.suggestedMessage}"
                    </p>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplyDraftText(reactivationAiResult.suggestedMessage)}
                        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Usar en borrador</span>
                      </button>
                    </div>
                  </div>

                  {/* Opción 2: Alternativa Suave */}
                  {reactivationAiResult.alternativeHook && (
                    <div className="p-2.5 rounded-md bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <span>Opción B · Seguimiento Suave</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed">
                        "{reactivationAiResult.alternativeHook}"
                      </p>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApplyDraftText(reactivationAiResult.alternativeHook)}
                          className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-[#1F2637] dark:hover:bg-[#2A334A] text-slate-800 dark:text-slate-200 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Usar en borrador</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Input de Chat con Bloqueo Anti-Colisión (Solo Lectura) */}
          <ChatInput
            contactId={contact.id}
            contactName={contact.name || contact.phone}
            contactPhone={contact.phone}
            isWithin24h={is24hValid}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onSendTemplate={handleSendTemplate}
            customTemplates={effectiveTemplates}
            disabled={isReadOnly}
            disabledReason={
              isReadOnly
                ? `Chat asignado a ${assignedMember?.full_name || 'otro asesor'}. Modo solo lectura.`
                : undefined
            }
            onTyping={handleTypingBroadcast}
            isAiActive={contact.is_ai_active}
            onToggleAi={handleToggleAi}
            replyingToMessage={replyingToMessage}
            onCancelReply={() => setReplyingToMessage(null)}
          />
        </div>
      </div>

      {/* Panel Lateral de Detalles del Lead (Desktop >= xl) */}
      {isRightPanelOpen && (
        <div className="hidden xl:block w-80 2xl:w-96 h-full border-l border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] overflow-y-auto shrink-0 animate-in slide-in-from-right-4 duration-200">
          <ContactPanel
            contact={contact as any}
            teamMembers={teamMembers}
            onContactUpdate={onContactUpdate}
            onOpenScheduleReminder={() => setIsReminderModalOpen(true)}
            onClosePanel={() => setIsRightPanelOpen(false)}
          />
        </div>
      )}

      {/* Drawer Flotante de Detalles del Lead (Mobile / Tablet < xl) */}
      {isRightPanelOpen && mounted && createPortal(
        <div
          className="xl:hidden fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={() => setIsRightPanelOpen(false)}
        >
          <div
            className="w-full max-w-sm sm:max-w-md h-full bg-white dark:bg-[#0D111A] shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <ContactPanel
              contact={contact as any}
              teamMembers={teamMembers}
              onContactUpdate={onContactUpdate}
              onOpenScheduleReminder={() => setIsReminderModalOpen(true)}
              onClosePanel={() => setIsRightPanelOpen(false)}
              isMobileDrawer={true}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Confirmación Rápida para Eliminar Chat */}
      {showDeleteModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F]">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  ¿Eliminar conversación?
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeleteChat} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5 [scrollbar-width:thin]">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Esta acción es permanente e irreversible. Se eliminará a{' '}
                  <strong className="text-slate-900 dark:text-white">{contact.name || contact.phone}</strong>{' '}
                  junto con todo su historial de mensajes, notas y registros de actividad.
                </p>

                {deleteError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirma con tu contraseña de administrador:
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      placeholder="Tu contraseña actual"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full pl-8.5 pr-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePassword.trim()}
                  className="min-w-[125px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                >
                  {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isDeleting ? 'Eliminando...' : 'Eliminar Chat'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Resumen Ejecutivo con IA */}
      <AiSummaryModal
        isOpen={isAiSummaryModalOpen}
        onClose={() => setIsAiSummaryModalOpen(false)}
        contactId={contact.id}
        contactName={contact.name || contact.phone}
        initialSummary={contact.custom_fields?.ai_summary || null}
        onSummaryUpdated={(newSummary) => {
          onContactUpdate?.({
            custom_fields: {
              ...(contact.custom_fields || {}),
              ai_summary: newSummary,
            },
          });
        }}
      />

      {/* Modal de Programar Recordatorio */}
      <ScheduleReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        contactId={contact.id}
        contactName={contact.name || contact.phone}
        existingReminder={activeReminder}
        onReminderSaved={(reminder) => {
          setActiveReminder(reminder);
          onContactUpdate?.({
            custom_fields: {
              ...(contact.custom_fields || {}),
              active_reminder: reminder,
            },
          });
        }}
      />

      {/* Modal de Finalizar Conversación ('Dar Fin') */}
      {isEndChatModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Dar Fin a la Conversación
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {contact.name || contact.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEndChatModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEndConversation} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 [scrollbar-width:thin]">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Resultado de la Atención
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEndResolution('completed')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        endResolution === 'completed'
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-[#0052FF]/10 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <span className="text-base">✓</span>
                      <span className="text-xs font-bold">Completado</span>
                      <span className="text-[10px] opacity-70">Atención regular</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEndResolution('won')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        endResolution === 'won'
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <span className="text-base">🎉</span>
                      <span className="text-xs font-bold">Ganado</span>
                      <span className="text-[10px] opacity-70">Venta cerrada</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEndResolution('lost')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        endResolution === 'lost'
                          ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                          : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <span className="text-base">✕</span>
                      <span className="text-xs font-bold">Perdido</span>
                      <span className="text-[10px] opacity-70">No concretado</span>
                    </button>
                  </div>
                </div>

                {/* Campo de Monto de la Venta (Solo si el resultado es Ganado) */}
                {endResolution === 'won' && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="block text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                      Valor de la Venta Ganada ($):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-semibold text-slate-400">$</span>
                      <input
                        type="text"
                        value={endDealValue}
                        onChange={(e) => setEndDealValue(e.target.value)}
                        placeholder="0 COP"
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-emerald-300 dark:border-emerald-500/40 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Este monto alimentará tus métricas de conversión comercial y analítica de ROI.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nota interna de cierre (opcional):
                  </label>
                  <textarea
                    value={endNote}
                    onChange={(e) => setEndNote(e.target.value)}
                    placeholder="Ej: Cliente realizó pedido y pagó por transferencia..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0052FF]"
                  />
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
                <button
                  type="button"
                  onClick={() => setIsEndChatModalOpen(false)}
                  disabled={isEndingChat}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isEndingChat}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isEndingChat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Finalizar Atención</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
