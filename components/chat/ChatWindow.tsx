'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSender } from '@/lib/supabase/types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AiToggleSwitch } from './AiToggleSwitch';
import { LeadDetailsDrawer } from './LeadDetailsDrawer';
import { isWithin24HourWindow, getRemainingHoursInWindow } from '@/services/contact.service';
import { sendAgentMessage, sendAgentMediaMessage, sendAgentTemplate, toggleContactAi } from '@/app/actions/chat';
import { formatImageMessageContent } from '@/lib/media/format';
import { claimUnassignedLead, assignLeadByAdmin } from '@/app/actions/assignment';
import { deleteContactWithPassword } from '@/app/actions/contacts';
import { META_TEMPLATES } from '@/services/whatsapp.service';
import { createClient } from '@/lib/supabase/client';
import {
  Phone,
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
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MessageItem {
  id: string;
  sender_type: MessageSender;
  content: string;
  created_at: string;
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
  customTemplates?: Array<{ name: string; label: string }>;
  whatsappProvider?: 'meta' | 'evolution';
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
}

export function ChatWindow({
  contact,
  messages,
  isLoadingMessages = false,
  onOptimisticMessage,
  onContactUpdate,
  customTemplates,
  whatsappProvider = 'meta',
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
}: ChatWindowProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialScroll = useRef(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de Eliminación Rápida de Chat
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Modo Solo Lectura: Si está asignado a otro agente y el usuario actual es un agente regular
  const isReadOnly = isAssignedToOther && !isAdminOrSupervisor;

  const assignedMember = teamMembers.find((m) => m.id === contact.assigned_to);

  const lastMessage = messages[messages.length - 1];
  const isWaitingForHuman = !contact.is_ai_active && lastMessage && lastMessage.sender_type === 'lead';

  useEffect(() => {
    if (isInitialScroll.current) {
      isInitialScroll.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Canal Realtime Broadcast: Detección de Colisión (Typing Presence entre agentes)
  useEffect(() => {
    if (!contact.id) return;
    const supabase = createClient();
    let typingTimeout: NodeJS.Timeout | null = null;

    const channel = supabase.channel(`chat-collision-${contact.id}`, {
      config: { broadcast: { self: false } },
    });

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
      supabase.removeChannel(channel);
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [contact.id]);

  // Emitir señal de tipeo para advertir a otros compañeros
  const handleTypingBroadcast = () => {
    if (!contact.id) return;
    const currentMember = teamMembers.find((m) => m.id === currentUserId);
    const myName = currentMember?.full_name || 'Un asesor';
    const supabase = createClient();
    supabase
      .channel(`chat-collision-${contact.id}`)
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

  const handleSendMessage = async (text: string) => {
    setErrorMessage(null);
    onOptimisticMessage?.({
      id: `temp-${Date.now()}`,
      sender_type: 'agent_manual',
      content: text,
      created_at: new Date().toISOString(),
    });
    try {
      await sendAgentMessage(contact.id, text);
    } catch (err: any) {
      console.error('[SEND MESSAGE ERROR]', err);
      const msg = err?.message || '';
      if (msg.includes('Session has expired') || msg.includes('access token') || msg.includes('OAuthException') || msg.includes('190')) {
        setErrorMessage('El token de acceso de WhatsApp ha expirado en Meta. Por favor actualízalo en Configuración.');
      } else if (msg.includes('131047') || msg.includes('24 hours') || msg.includes('24h')) {
        setErrorMessage('La ventana de 24 horas de Meta ha vencido para este cliente. Debes enviar una Plantilla Oficial para reanudar la conversación.');
      } else if (msg.includes('Disconnected') || msg.includes('desconectad') || msg.includes('405')) {
        setErrorMessage('El teléfono o la instancia de WhatsApp (Evolution API) está desconectada. Revisa la vinculación en Configuración.');
      } else {
        setErrorMessage(`Error al enviar mensaje: ${msg || 'Error de conexión con WhatsApp'}`);
      }
      throw err; // Permite a ChatInput preservar el texto escrito en el borrador
    }
  };

  const handleSendMedia = async (mediaUrl: string, caption?: string) => {
    setErrorMessage(null);
    const formatted = formatImageMessageContent(mediaUrl, caption);
    onOptimisticMessage?.({
      id: `temp-${Date.now()}`,
      sender_type: 'agent_manual',
      content: formatted,
      created_at: new Date().toISOString(),
    });
    try {
      await sendAgentMediaMessage(contact.id, mediaUrl, caption);
    } catch (err: any) {
      console.error('[SEND MEDIA ERROR]', err);
      setErrorMessage(`Error al enviar imagen: ${err?.message || 'Error de conexión con WhatsApp'}`);
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

  const handleToggleAi = async (newState: boolean) => {
    onContactUpdate?.({ is_ai_active: newState });
    await toggleContactAi(contact.id, newState);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs transition-colors">
      {/* Cabecera del Chat */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] flex flex-wrap items-center justify-between gap-3">
        {/* Info del Contacto y Asignación */}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
              {contact.name ||
                (contact.channel === 'instagram'
                  ? contact.instagram_username
                    ? `@${contact.instagram_username}`
                    : 'Contacto Instagram'
                  : 'Lead de WhatsApp')}
            </h2>
            {contact.pipeline_stage && (
              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B]">
                {contact.pipeline_stage}
              </span>
            )}
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
          ) : (
            <span className="px-2.5 py-1 bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] rounded-lg text-xs font-medium flex items-center gap-1">
              <User className="w-3 h-3 text-slate-400" /> {assignedMember?.full_name || 'Otro asesor'}
            </span>
          )}

          {/* Indicador de la Ventana / Protocolo de WhatsApp */}
          {isBaileys ? (
            <div
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
              title="Instancia Evolution API activa: Sesión Baileys en VPS sin ventana de 24 horas"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Evolution API (Sin restricción 24h)</span>
            </div>
          ) : (
            <div
              suppressHydrationWarning
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border ${
                is24hValid
                  ? 'bg-emerald-50 dark:bg-[#090A0F] text-emerald-700 dark:text-slate-300 border-emerald-200 dark:border-[#232A3B]'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              }`}
            >
              {is24hValid ? (
                <>
                  <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-slate-400" />
                  <span suppressHydrationWarning>{remainingHours}h restantes</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>24h Expirada</span>
                </>
              )}
            </div>
          )}

          {/* Switch IA / Control Humano */}
          <AiToggleSwitch
            contactId={contact.id}
            initialIsAiActive={contact.is_ai_active}
            onToggle={handleToggleAi}
          />

          {/* Botón Ficha del Lead */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
              isDrawerOpen
                ? 'bg-[#0052FF] text-white border-[#0052FF]'
                : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ficha</span>
          </button>

          {/* Botón Eliminar Chat Directo (Solo Admins y Supervisores) */}
          {isAdminOrSupervisor && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeletePassword('');
                setShowDeleteModal(true);
              }}
              title="Eliminar este chat y conversación permanentemente"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-[#232A3B] hover:border-rose-200 dark:hover:border-rose-500/20 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
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
          {/* Lista de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-[#090A0F] space-y-1 transition-colors">
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
              messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  content={msg.content}
                  senderType={msg.sender_type}
                  createdAt={msg.created_at}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Banner de Estado de la IA antes del Input */}
          {contact.is_ai_active && !isReadOnly && (
            <div className="px-4 py-1.5 bg-slate-100 dark:bg-[#0E121B] border-t border-slate-200 dark:border-[#1E2433] flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <Bot className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] flex-shrink-0" />
              <span>
                <strong>IA Activa:</strong> La IA está respondiendo automáticamente. Al enviar un mensaje tomarás el control manual.
              </span>
            </div>
          )}

          {/* Input de Chat con Bloqueo Anti-Colisión (Solo Lectura) */}
          <ChatInput
            contactId={contact.id}
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
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131722] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-2">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
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
              <div className="p-2.5 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
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
                    className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePassword.trim()}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
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
    </div>
  );
}
