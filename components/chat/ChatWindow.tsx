'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSender } from '@/lib/supabase/types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { AiToggleSwitch } from './AiToggleSwitch';
import { LeadDetailsDrawer } from './LeadDetailsDrawer';
import { isWithin24HourWindow, getRemainingHoursInWindow } from '@/services/contact.service';
import { sendAgentMessage, sendAgentTemplate, toggleContactAi } from '@/app/actions/chat';
import { claimUnassignedLead, assignLeadByAdmin } from '@/app/actions/assignment';
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
  };
  messages: MessageItem[];
  onOptimisticMessage?: (msg: MessageItem) => void;
  customTemplates?: Array<{ name: string; label: string }>;
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
}

export function ChatWindow({
  contact,
  messages,
  onOptimisticMessage,
  customTemplates,
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
}: ChatWindowProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de Asignación y Bloqueo Concurrente
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [otherTyping, setOtherTyping] = useState<string | null>(null);

  const is24hValid = isWithin24HourWindow(contact.last_interaction_at);
  const remainingHours = getRemainingHoursInWindow(contact.last_interaction_at);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo tomar el lead.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Reasignar lead (solo Admins o Supervisores)
  const handleAdminReassign = async (targetId: string) => {
    setErrorMessage(null);
    try {
      await assignLeadByAdmin(contact.id, targetId === 'unassigned' ? null : targetId);
      router.refresh();
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
      if (msg.includes('Session has expired') || msg.includes('access token')) {
        setErrorMessage('El token de acceso de WhatsApp ha expirado en Meta. Por favor actualízalo en Configuración.');
      } else {
        setErrorMessage(`Error al enviar mensaje: ${msg || 'Error de conexión con WhatsApp'}`);
      }
    } finally {
      router.refresh();
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
    } finally {
      router.refresh();
    }
  };

  const handleToggleAi = async (newState: boolean) => {
    await toggleContactAi(contact.id, newState);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Cabecera del Chat */}
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-3">
        {/* Info del Contacto y Asignación */}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900 truncate max-w-[200px] sm:max-w-xs">
              {contact.name || 'Lead de WhatsApp'}
            </h2>
            {contact.pipeline_stage && (
              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {contact.pipeline_stage}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mt-0.5">
            <Phone className="w-3 h-3 text-gray-400" />
            <span>{contact.phone}</span>
          </div>
        </div>

        {/* Controles: Asignación, 24h, IA Switch y Ficha */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge o Selector de Asignación */}
          {isAdminOrSupervisor ? (
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1 text-xs shadow-xs">
              <User className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={contact.assigned_to || 'unassigned'}
                onChange={(e) => handleAdminReassign(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="unassigned">⚠️ Sin Asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    👤 {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : isUnassigned ? (
            <button
              onClick={handleClaimLead}
              disabled={isClaiming}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Reclamando...</span>
                </>
              ) : claimSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  <span>¡Tomado!</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Tomar este cliente</span>
                </>
              )}
            </button>
          ) : isAssignedToMe ? (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1">
              <User className="w-3 h-3" /> Asignado a ti
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium flex items-center gap-1">
              <User className="w-3 h-3 text-gray-400" /> {assignedMember?.full_name || 'Otro asesor'}
            </span>
          )}

          {/* Indicador de la Ventana de 24h de Meta */}
          <div
            suppressHydrationWarning
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border ${
              is24hValid
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {is24hValid ? (
              <>
                <Clock className="w-3 h-3" />
                <span suppressHydrationWarning>{remainingHours}h restantes</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-amber-600" />
                <span>24h Expirada</span>
              </>
            )}
          </div>

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
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
              isDrawerOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ficha</span>
          </button>
        </div>
      </div>

      {/* Alerta de Error de Meta o Concurrencia */}
      {errorMessage && (
        <div className="mx-4 mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Alerta de Colisión en Tiempo Real (Otro operador escribiendo) */}
      {otherTyping && (
        <div className="mx-4 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2 shadow-xs animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-pulse flex-shrink-0" />
          <span>
            <strong>{otherTyping}</strong> está respondiendo este chat en este momento...
          </span>
        </div>
      )}

      {/* Banner de Relevo Humano Pendiente (Anti-Visto) */}
      {isWaitingForHuman && (
        <div className="mx-4 mt-2.5 p-3 bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-300 rounded-xl text-xs text-rose-950 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
            </span>
            <div>
              <span className="font-extrabold text-rose-800">🚨 Relevo pendiente:</span>{' '}
              <span className="text-gray-700">El cliente está esperando la respuesta de un asesor humano. Escribe tu respuesta abajo para continuar la conversación.</span>
            </div>
          </div>
        </div>
      )}

      {/* Contenedor Principal: Chat + Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Columna de Mensajes + Input */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Lista de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-1">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
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
            <div className="px-4 py-1.5 bg-blue-50/80 border-t border-blue-100 flex items-center gap-2 text-[11px] text-blue-700">
              <Bot className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span>
                <strong>IA Activa:</strong> La IA está respondiendo a este prospecto. Si envías un mensaje, tomarás el control manual.
              </span>
            </div>
          )}

          {/* Input de Chat con Bloqueo Anti-Colisión (Solo Lectura) */}
          <ChatInput
            contactId={contact.id}
            isWithin24h={is24hValid}
            onSendMessage={handleSendMessage}
            onSendTemplate={handleSendTemplate}
            customTemplates={customTemplates}
            disabled={isReadOnly}
            disabledReason={
              isReadOnly
                ? `🔒 Chat asignado a ${assignedMember?.full_name || 'otro asesor'}. Modo solo lectura.`
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
    </div>
  );
}
