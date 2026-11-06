'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MessageSender } from '@/lib/supabase/types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AiToggleSwitch } from './AiToggleSwitch';
import { LeadDetailsDrawer } from './LeadDetailsDrawer';
import { isWithin24HourWindow, getRemainingHoursInWindow, PIPELINE_STAGES } from '@/services/contact.service';
import { sendAgentMessage, sendAgentMediaMessage, sendAgentTemplate, toggleContactAi, endContactConversation, markContactReactivationDismissed, snoozeContactAi } from '@/app/actions/chat';
import { formatImageMessageContent, formatDocumentMessageContent, formatAudioMessageContent, formatVideoMessageContent, formatQuoteMessageContent } from '@/lib/media/format';
import { claimUnassignedLead, assignLeadByAdmin, takeoverInactiveLead } from '@/app/actions/assignment';
import dynamic from 'next/dynamic';
import { deleteContactWithPassword, updateContactDetails } from '@/app/actions/contacts';
import { completeContactReminder, cancelContactReminder, type ActiveReminderData } from '@/app/actions/reminders';
import { META_TEMPLATES } from '@/services/whatsapp.service';
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
  draftText?: string;
  onDraftChange?: (text: string) => void;
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
  draftText,
  onDraftChange,
  onBack,
}: ChatWindowProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
  const [isEndingChat, setIsEndingChat] = useState(false);

  // Estados de Citar / Responder Mensaje
  const [replyingToMessage, setReplyingToMessage] = useState<{
    id?: string;
    senderType: MessageSender;
    content: string;
  } | null>(null);

  // Estados de Pausa Temporal de IA (Snooze)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

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
      onContactUpdate?.({ is_ai_active: false });
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

  const latestHandoffReason = React.useMemo(() => {
    if (contact.is_ai_active) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
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

  const lastMessage = messages[messages.length - 1];
  const isWaitingForHuman = !contact.is_ai_active && lastMessage && lastMessage.sender_type === 'lead';

  // Detección de Comprobante de Pago pendiente de verificación por asesor humano
  const hasPendingReceipt =
    contact.pipeline_stage !== 'ganado' &&
    messages.some(
      (m) =>
        m.content?.includes('Comprobante de pago recibido') ||
        m.content?.toLowerCase().includes('comprobante de pago')
    );

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
      onContactUpdate?.({ pipeline_stage: newStage });
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
      onContactUpdate?.({ pipeline_stage: 'ganado' });

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

    onOptimisticMessage?.({
      id: `temp-${Date.now()}`,
      sender_type: 'agent_manual',
      content: finalContent,
      created_at: new Date().toISOString(),
      status: 'pending',
      reply_to_message_id: replyMeta?.id || null,
    });
    try {
      await sendAgentMessage(contact.id, finalContent, replyMeta?.id);
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
    onOptimisticMessage?.({
      id: `temp-${Date.now()}`,
      sender_type: 'agent_manual',
      content: formatted,
      created_at: new Date().toISOString(),
      status: 'pending',
    });
    try {
      await sendAgentMediaMessage(contact.id, mediaUrl, caption, fileName, isDocument, isAudio, isVideo);
    } catch (err: any) {
      console.error('[SEND MEDIA ERROR]', err);
      setErrorMessage(`Error al enviar archivo o audio: ${err?.message || 'Error de conexión con WhatsApp'}`);
      throw err;
    }
  };

  const handleSendTemplate = async (templateKey: string) => {
    setErrorMessage(null);
    const tplLabel = (META_TEMPLATES as any)[templateKey]?.label || templateKey;
    onOptimisticMessage?.({
      id: `temp-${Date.now()}`,
      sender_type: 'agent_manual',
      content: `[Plantilla oficial: ${tplLabel}]`,
      created_at: new Date().toISOString(),
    });
    try {
      await sendAgentTemplate(contact.id, templateKey);
    } catch (err: any) {
      console.error('[SEND TEMPLATE ERROR]', err);
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
    if (contact.pipeline_stage === 'ganado' || contact.pipeline_stage === 'perdido') return false;
    if (contact.custom_fields?.reactivation_attempted) return false;
    try {
      const elapsed = Date.now() - new Date(contact.last_interaction_at).getTime();
      const hours = elapsed / (1000 * 3600);
      return hours >= 24 && hours <= 240;
    } catch {
      return false;
    }
  }, [contact.pipeline_stage, contact.custom_fields?.reactivation_attempted, contact.last_interaction_at]);

  const handleApplyReactivationMessage = () => {
    const cleanName = (contact.name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';
    const text = `${greeting} ¿Cómo estás? Quería saber si tuviste oportunidad de revisar la información que te compartimos o si tienes alguna inquietud en la que podamos apoyarte 😊`;
    onDraftChange?.(text);
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
      await endContactConversation(contact.id, endResolution, endNote);
      setIsEndChatModalOpen(false);
      setEndNote('');
      onContactUpdate?.({
        pipeline_stage: endResolution === 'won' ? 'ganado' : endResolution === 'lost' ? 'perdido' : contact.pipeline_stage,
        custom_fields: {
          ...(contact.custom_fields || {}),
          conversation_status: 'closed',
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al finalizar conversación');
    } finally {
      setIsEndingChat(false);
    }
  };

  const handleToggleAi = async (newState: boolean) => {
    onContactUpdate?.({ is_ai_active: newState });
    await toggleContactAi(contact.id, newState);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs transition-colors">
      {/* Cabecera del Chat */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] flex flex-wrap items-center justify-between gap-3">
        {/* Info del Contacto y Asignación */}
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition cursor-pointer"
              title="Volver a la lista de chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-1.5 animate-in fade-in">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveQuickName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  autoFocus
                  placeholder="Nombre del cliente..."
                  className="text-xs px-2.5 py-1 border border-[#0052FF] rounded-lg bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white focus:outline-none font-semibold w-40 sm:w-56 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleSaveQuickName}
                  disabled={isSavingName}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg cursor-pointer"
                  title="Guardar nombre"
                >
                  {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-xs">
                  {contact.name ||
                    (contact.channel === 'instagram'
                      ? contact.instagram_username
                        ? `@${contact.instagram_username}`
                        : 'Contacto Instagram'
                      : 'Lead de WhatsApp')}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setTempName(contact.name || '');
                    setIsEditingName(true);
                  }}
                  className="opacity-60 group-hover:opacity-100 p-1 text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] rounded transition cursor-pointer"
                  title="Editar nombre rápidamente con 1 clic"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2 py-0.5 text-xs">
              <Flag className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
              <select
                value={contact.pipeline_stage || 'nuevo'}
                onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
                disabled={isUpdatingStage}
                title="Fase del embudo de ventas"
                className="bg-transparent text-[11px] font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200">
                    {s.label}
                  </option>
                ))}
              </select>
              {isUpdatingStage && <Loader2 className="w-2.5 h-2.5 animate-spin text-[#0052FF]" />}
            </div>
          </div>
          {contact.channel === 'instagram' ? (
            <div className="flex items-center gap-1.5 text-xs text-pink-700 dark:text-pink-300 font-mono mt-0.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-500/20">
                <Instagram className="w-3 h-3 text-pink-500 dark:text-pink-400" />
                <span>Instagram Direct</span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {contact.instagram_username ? `@${contact.instagram_username}` : contact.phone}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 dark:bg-[#00D2FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20">
                <MessageSquare className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>WhatsApp</span>
              </span>
              <span>{contact.phone}</span>
            </div>
          )}
        </div>
      </div>

        {/* Controles: Asignación, 24h, IA Switch y Ficha */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge o Selector de Asignación */}
          {isAdminOrSupervisor ? (
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={contact.assigned_to || 'unassigned'}
                onChange={(e) => handleAdminReassign(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="unassigned" className="bg-white dark:bg-[#131722] text-amber-700 dark:text-amber-400">Sin Asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id} className="bg-white dark:bg-[#131722] text-slate-800 dark:text-slate-200">
                    {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : isUnassigned ? (
            <button
              onClick={handleClaimLead}
              disabled={isClaiming}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#0052FF] hover:bg-[#0043D4] text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Tomando...</span>
                </>
              ) : claimSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  <span>Asignado</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Tomar cliente</span>
                </>
              )}
            </button>
          ) : isAssignedToMe ? (
            <span className="px-2.5 py-1 bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20 rounded-lg text-xs font-medium flex items-center gap-1">
              <User className="w-3 h-3" /> Asignado a ti
            </span>
          ) : isAssignedToOther && canTakeoverInactive ? (
            <button
              type="button"
              onClick={handleTakeoverInactive}
              disabled={isClaiming}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs animate-pulse"
              title={`El asesor ${assignedMember?.full_name || 'asignado'} lleva ${Math.round(inactiveAdvisorMinutes)}m sin responder al cliente. Haz clic para rescatar la atención.`}
            >
              {isClaiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              <span>⚡ Rescatar Lead (&gt;5m)</span>
            </button>
          ) : (
            <span className="px-2.5 py-1 bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] rounded-lg text-xs font-medium flex items-center gap-1">
              <User className="w-3 h-3 text-slate-400" /> {assignedMember?.full_name || 'Otro asesor'}
            </span>
          )}

          {/* Indicador de Ventana de 24h Meta (Solo se muestra cuando ha expirado, para no generar ruido visual) */}
          {!isBaileys && !is24hValid && (
            <div
              suppressHydrationWarning
              title="La ventana de 24 horas de Meta ha vencido. Debes enviar una plantilla autorizada para reactivar."
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30"
            >
              <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>24h Expirada</span>
            </div>
          )}

          {/* Switch IA / Control Humano y Pausa Temporal */}
          <div className="flex items-center gap-1 relative">
            <AiToggleSwitch
              contactId={contact.id}
              initialIsAiActive={contact.is_ai_active}
              onToggle={handleToggleAi}
            />
            {contact.is_ai_active && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSnoozeMenu((prev) => !prev)}
                  className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
                  title="Pausar IA temporalmente (30m, 2h o hasta mañana)"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
                {showSnoozeMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 border-b border-slate-100 dark:border-[#232A3B] select-none">
                      Pausa temporal de IA
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSnoozeAi(30)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>⏱️</span> Pausar 30 minutos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSnoozeAi(120)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>⏱️</span> Pausar 2 horas
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSnoozeAi('tomorrow')}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>☀️</span> Hasta mañana (8 AM)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chip de Recordatorio Activo o Botón para Programar */}
          {activeReminder ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-500/30">
              {activeReminder.reminderType === 'shipping' ? (
                <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : activeReminder.reminderType === 'reactivation' ? (
                <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <span className="truncate max-w-[130px] sm:max-w-[180px]" title={activeReminder.note || 'Recordatorio activo'}>
                {activeReminder.reminderType === 'shipping' ? 'Envío' : activeReminder.reminderType === 'reactivation' ? 'Reactivar' : 'Recordar'}: {new Date(activeReminder.scheduledFor).toLocaleDateString([], { day: 'numeric', month: 'short' })} {new Date(activeReminder.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                type="button"
                onClick={handleCompleteReminder}
                disabled={isCompletingReminder}
                title="Marcar recordatorio como completado"
                className="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
              >
                {isCompletingReminder ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                <span className="hidden sm:inline">Listo</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReminderModalOpen(true)}
                title="Editar recordatorio"
                className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleCancelReminder}
                title="Descartar recordatorio"
                className="p-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsReminderModalOpen(true)}
              title="Programar recordatorio de envío o reactivación comercial"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:border-blue-300 dark:hover:border-blue-500/30"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Recordatorio</span>
            </button>
          )}

          {/* Botón Resumen IA (Visible en pantallas medianas/grandes) */}
          <button
            type="button"
            onClick={() => setIsAiSummaryModalOpen(true)}
            title="Ver o generar resumen ejecutivo de la negociación con IA"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#0052FF]/10 dark:to-indigo-950/20 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-blue-500/30 hover:border-blue-400 dark:hover:border-blue-400 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
            <span>Resumen IA</span>
          </button>

          {/* Botón Ficha del Lead (Acción Principal de Contexto) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            title="Abrir detalles y notas del prospecto"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              isDrawerOpen
                ? 'bg-[#0052FF] text-white border-[#0052FF]'
                : 'bg-white dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:bg-slate-50 dark:hover:bg-[#232A3B]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Ficha</span>
          </button>

          {/* Menú Estructurado de Más Opciones (...) */}
          <div className="relative" ref={moreActionsRef}>
            <button
              type="button"
              onClick={() => setShowMoreActions((prev) => !prev)}
              title="Más opciones de la conversación"
              className={`p-1.5 rounded-xl border transition cursor-pointer shadow-2xs ${
                showMoreActions
                  ? 'bg-slate-200 dark:bg-[#232A3B] text-slate-900 dark:text-white border-slate-300 dark:border-slate-600'
                  : 'bg-white dark:bg-[#1A1F2C] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#232A3B] hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#232A3B]'
              }`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreActions && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 divide-y divide-slate-100 dark:divide-[#1E2433]">
                <div className="py-1">
                  {/* Resumen IA (para pantallas donde el botón superior está oculto) */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreActions(false);
                      setIsAiSummaryModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-2.5"
                  >
                    <Sparkles className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                    <div>
                      <div className="font-semibold text-xs">Resumen IA</div>
                      <div className="text-[10px] text-slate-400">Ver acuerdos y contexto clave</div>
                    </div>
                  </button>

                  {/* Programar Recordatorio */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreActions(false);
                      setIsReminderModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-2.5"
                  >
                    <Clock className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="font-semibold text-xs">Programar Recordatorio</div>
                      <div className="text-[10px] text-slate-400">Envío, cobro o reactivación</div>
                    </div>
                  </button>

                  {/* Dar Fin a la Conversación */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreActions(false);
                      setIsEndChatModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <div className="font-semibold text-xs">Finalizar Conversación</div>
                      <div className="text-[10px] text-slate-400">Marcar resolución y archivar</div>
                    </div>
                  </button>
                </div>

                {/* Zona de Destrucción / Admin */}
                {isAdminOrSupervisor && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        setDeleteError(null);
                        setDeletePassword('');
                        setShowDeleteModal(true);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition cursor-pointer flex items-center gap-2.5"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      <div>
                        <div className="font-semibold text-xs">Eliminar Conversación</div>
                        <div className="text-[10px] text-rose-400/80">Borrado permanente con clave</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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

      {/* Contenedor Principal: Chat + Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Columna de Mensajes + Input */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Lista de Mensajes con Preservación de Scroll */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-[#090A0F] space-y-1 transition-colors">
            {isLoadingMessages ? (
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

                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    id={msg.id}
                    content={msg.content}
                    senderType={msg.sender_type}
                    createdAt={msg.created_at}
                    status={msg.status}
                    replyToMessageId={msg.reply_to_message_id}
                    reactions={msg.reactions}
                    onReply={(target) => setReplyingToMessage(target)}
                  />
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

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

          {/* Banner de Reactivación Inteligente de 1 solo intento (Anti-Spam) */}
          {isReactivationEligible && (
            <div className="mx-4 my-2 p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-300/80 dark:border-amber-500/30 flex items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 min-w-0">
                <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="truncate">
                  <span className="font-bold">Reactivar Lead (&gt;24h en silencio):</span>{' '}
                  <span className="opacity-90">1 solo intento permitido por protección anti-spam.</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleApplyReactivationMessage}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Sugerir Reactivación</span>
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
            draftText={draftText}
            onDraftChange={onDraftChange}
            isAiActive={contact.is_ai_active}
            onToggleAi={handleToggleAi}
            replyingToMessage={replyingToMessage}
            onCancelReply={() => setReplyingToMessage(null)}
          />
        </div>

        {/* Drawer de Detalles del Lead */}
        <LeadDetailsDrawer
          contact={contact as any}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        />
      </div>

      {/* Modal de Confirmación Rápida para Eliminar Chat */}
      {showDeleteModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-2">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                ¿Eliminar esta conversación?
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              Esta acción es permanente e irreversible. Se eliminará a{' '}
              <strong className="text-slate-900 dark:text-white">{contact.name || contact.phone}</strong>{' '}
              junto con todo su historial de mensajes, notas y registros de actividad.
            </p>

            {deleteError && (
              <div className="p-2.5 mb-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleDeleteChat} className="space-y-3">
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

              <div className="flex items-center justify-end gap-2 pt-2">
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
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-[#232A3B]">
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
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEndConversation} className="space-y-4">
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setIsEndChatModalOpen(false)}
                  disabled={isEndingChat}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-semibold cursor-pointer"
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
