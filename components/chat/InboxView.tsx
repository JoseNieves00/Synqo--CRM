'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  Bot,
  User,
  Sparkles,
  Download,
  Clock,
  Package,
  RotateCcw,
  X,
  Loader2,
} from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { createClient } from '@/lib/supabase/client';
import { getUnattendedHandoffs, getContactMessages, markContactAsRead, loadMoreContacts, searchContactsGlobal } from '@/app/actions/chat';
import { importRecentEvolutionChats } from '@/app/actions/evolution';

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: any;
  is_ai_active: boolean;
  last_interaction_at: string;
  assigned_to?: string | null;
  custom_fields?: any;
  channel?: 'whatsapp' | 'instagram';
  instagram_username?: string | null;
  instagram_id?: string | null;
  unread_count?: number;
  last_message?: any;
  ai_snooze_until?: string | null;
}

interface MessageItem {
  id: string;
  sender_type: any;
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

interface ContactListItemProps {
  contact: ContactItem;
  isActive: boolean;
  isMine: boolean;
  assignedUserName?: string;
  isUnattended: boolean;
  onSelect: (id: string) => void;
}

/**
 * Componente de tarjeta de conversación memoizado para garantizar 60 FPS en el Inbox.
 * Previene re-renderizados innecesarios de los 50 contactos cuando cambia el chat activo o se escribe.
 */
const ContactListItem = React.memo(
  function ContactListItem({
    contact: c,
    isActive,
    isMine,
    assignedUserName,
    isUnattended,
    onSelect,
  }: ContactListItemProps) {
    const dateStr = useMemo(() => {
      try {
        return new Date(c.last_interaction_at).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return '';
      }
    }, [c.last_interaction_at]);

    const activeReminder = c.custom_fields?.active_reminder;
    const unreadCount = c.unread_count ?? c.custom_fields?.unread_count ?? 0;
    const lastMsg = c.last_message || c.custom_fields?.last_message;
    const lastMsgText = typeof lastMsg === 'string' ? lastMsg : lastMsg?.text || '';
    const lastMsgSender = typeof lastMsg === 'object' ? lastMsg?.sender_type : null;
    const isOutbound = lastMsgSender === 'agent_manual' || lastMsgSender === 'ai';

    const reminderInfo = useMemo(() => {
      if (!activeReminder?.scheduledFor) return null;
      try {
        const d = new Date(activeReminder.scheduledFor);
        const now = new Date();
        const isOverdue = d.getTime() < now.getTime();
        const isToday = d.toDateString() === now.toDateString();
        const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const label = isToday ? `Hoy ${timeStr}` : `${dateStr} ${timeStr}`;
        const typeLabel =
          activeReminder.reminderType === 'shipping'
            ? 'Envío'
            : activeReminder.reminderType === 'reactivation'
            ? 'Reactivar'
            : 'Recordatorio';
        return { isOverdue, isToday, label, typeLabel, type: activeReminder.reminderType };
      } catch {
        return null;
      }
    }, [activeReminder]);

    const waitingMinutes = useMemo(() => {
      if (!isUnattended) return 0;
      try {
        const elapsed = (Date.now() - new Date(c.last_interaction_at).getTime()) / (1000 * 60);
        return Math.max(0, Math.floor(elapsed));
      } catch {
        return 0;
      }
    }, [isUnattended, c.last_interaction_at]);

    return (
      <a
        href={`/inbox/${c.id}`}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && e.button === 0) {
            e.preventDefault();
            onSelect(c.id);
          }
        }}
        className={`p-3 block transition cursor-pointer relative border-l-2 select-none ${
          isActive
            ? 'bg-blue-50/70 dark:bg-[#0052FF]/10 border-l-[#0052FF]'
            : isUnattended
            ? 'bg-rose-50 dark:bg-rose-500/10 border-l-rose-500 hover:bg-rose-100/60 dark:hover:bg-rose-500/15'
            : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
        }`}
      >
        {/* Badge de Atención Pendiente & Semáforo SLA */}
        {isUnattended && (
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse" />
              Requiere asesor
            </span>
            {waitingMinutes < 2 ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 shrink-0">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                &lt; 2m
              </span>
            ) : waitingMinutes <= 5 ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shrink-0">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                {waitingMinutes}m espera
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0 animate-pulse">
                <Clock className="w-2.5 h-2.5" />
                ⏳ {waitingMinutes}m
              </span>
            )}
          </div>
        )}

        {/* Badge de Recordatorio Activo */}
        {reminderInfo && (
          <div className="mb-1.5 flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border truncate max-w-full ${
                reminderInfo.isOverdue
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/30 animate-pulse'
                  : reminderInfo.isToday
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                  : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20'
              }`}
            >
              {reminderInfo.type === 'shipping' ? (
                <Package className="w-2.5 h-2.5 shrink-0" />
              ) : reminderInfo.type === 'reactivation' ? (
                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
              ) : (
                <Clock className="w-2.5 h-2.5 shrink-0" />
              )}
              <span className="truncate">
                {reminderInfo.isOverdue ? 'Vencido: ' : ''}{reminderInfo.typeLabel} ({reminderInfo.label})
              </span>
            </span>
          </div>
        )}

        {/* Fila 1: Nombre y Hora */}
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className={`font-semibold text-xs truncate min-w-0 ${isUnattended ? 'text-rose-700 dark:text-rose-200' : 'text-slate-900 dark:text-white'}`}>
            {c.name || 'Prospecto sin nombre'}
          </span>
          <span suppressHydrationWarning className="text-[10px] text-slate-400 dark:text-slate-400 font-mono flex-shrink-0">
            {dateStr}
          </span>
        </div>

        {/* Fila 2: Preview del Último Mensaje y Contador de No Leídos (WhatsApp Style) */}
        <div className="flex items-center justify-between gap-1 text-[11px] mb-1.5 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isOutbound && (
              <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">
                {lastMsgSender === 'agent_manual' ? 'Tú: ' : 'IA: '}
              </span>
            )}
            <p className="truncate text-slate-500 dark:text-slate-400 font-normal leading-tight">
              {lastMsgText || 'Conversación iniciada'}
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-bold text-[10px] min-w-[18px] text-center shadow-xs shrink-0 animate-in zoom-in-75">
              {unreadCount}
            </span>
          )}
        </div>

        {/* Fila 3: Canal, Identificador y Estado IA */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono mb-1.5 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {c.channel === 'instagram' ? (
              <>
                <span className="inline-flex items-center text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-500/20 shrink-0 font-sans">
                  IG
                </span>
                <span className="text-[11px] truncate text-pink-700 dark:text-pink-300 font-medium">
                  {c.instagram_username ? `@${c.instagram_username}` : c.phone}
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-[#00D2FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20 shrink-0 font-sans">
                  WA
                </span>
                <span className="text-[11px] truncate text-slate-600 dark:text-slate-300">{c.phone}</span>
              </>
            )}
          </div>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono shrink-0 ${
              c.is_ai_active
                ? 'bg-blue-50 dark:bg-[#00D2FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20'
                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20'
            }`}
          >
            {c.is_ai_active ? 'AI' : 'HUMAN'}
          </span>
        </div>

        {/* Fila 3: Pipeline Stage, Temperatura & Chip de Asignación */}
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-mono uppercase bg-slate-100 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] px-1.5 py-0.5 rounded shrink-0">
              {c.pipeline_stage}
            </span>
            {c.custom_fields?.lead_temperature === 'hot' || c.pipeline_stage === 'calificado' || c.pipeline_stage === 'cita_agendada' ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0" title="Lead Caliente: Alta intención de compra">
                🔥 Caliente
              </span>
            ) : c.custom_fields?.lead_temperature === 'cold' || c.pipeline_stage === 'perdido' ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0" title="Lead Frío: Sin intención definida">
                ❄️ Frío
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 shrink-0" title="Lead Tibio: Evaluando precios o catálogo">
                🌤️ Tibio
              </span>
            )}
          </div>

          {/* Chip de Agente Asignado */}
          {c.assigned_to ? (
            <span
              className={`font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${
                isMine
                  ? 'bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] font-semibold border border-blue-200 dark:border-[#00D2FF]/20'
                  : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B]'
              }`}
            >
              <User className="w-2.5 h-2.5 text-slate-400" />
              {isMine ? 'Tú' : assignedUserName || 'Asignado'}
            </span>
          ) : (
            <span className="font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
              <User className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
              Sin Asignar
            </span>
          )}
        </div>
      </a>
    );
  },
  (prev, next) => {
    return (
      prev.isActive === next.isActive &&
      prev.isUnattended === next.isUnattended &&
      prev.isMine === next.isMine &&
      prev.assignedUserName === next.assignedUserName &&
      prev.contact.id === next.contact.id &&
      prev.contact.last_interaction_at === next.contact.last_interaction_at &&
      prev.contact.is_ai_active === next.contact.is_ai_active &&
      prev.contact.pipeline_stage === next.contact.pipeline_stage &&
      prev.contact.name === next.contact.name &&
      prev.contact.phone === next.contact.phone &&
      prev.contact.channel === next.contact.channel &&
      prev.contact.instagram_username === next.contact.instagram_username &&
      (prev.contact.unread_count ?? prev.contact.custom_fields?.unread_count) ===
        (next.contact.unread_count ?? next.contact.custom_fields?.unread_count) &&
      (prev.contact.last_message?.text ?? prev.contact.custom_fields?.last_message?.text) ===
        (next.contact.last_message?.text ?? next.contact.custom_fields?.last_message?.text) &&
      prev.contact.custom_fields?.active_reminder?.id === next.contact.custom_fields?.active_reminder?.id &&
      prev.contact.custom_fields?.active_reminder?.scheduledFor === next.contact.custom_fields?.active_reminder?.scheduledFor &&
      prev.contact.custom_fields?.lead_temperature === next.contact.custom_fields?.lead_temperature
    );
  }
);

interface InboxViewProps {
  organizationId?: string;
  contacts: ContactItem[];
  activeContact: ContactItem | null;
  messages: MessageItem[];
  customTemplates?: Array<{ name: string; label: string }>;
  whatsappProvider?: 'meta' | 'evolution';
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
  pendingGapsCount?: number;
}

export function InboxView({
  organizationId,
  contacts,
  activeContact,
  messages,
  customTemplates,
  whatsappProvider = 'meta',
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  pendingGapsCount = 0,
}: InboxViewProps) {
  const router = useRouter();
  const [contactList, setContactList] = useState<ContactItem[]>(contacts);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Atajo de teclado global Ctrl+K / Cmd+K para enfocar el buscador al instante
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Contacto activo y caché de mensajes local para transiciones 0ms ultra-suaves
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    activeContact?.id || (contacts.length > 0 ? contacts[0].id : null)
  );

  // Paginación bajo demanda y búsqueda global para escalar a miles de conversaciones sin sobrecargar el DOM
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreContacts, setHasMoreContacts] = useState(contacts.length >= 50);
  const [totalContactsCount, setTotalContactsCount] = useState<number | null>(null);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Búsqueda global en Postgres con debounce cuando el usuario busca un contacto específico
  useEffect(() => {
    const q = deferredSearch.trim();
    if (q.length < 3) return;

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const res = await searchContactsGlobal(q);
        if (!isCancelled && res.contacts && res.contacts.length > 0) {
          setContactList((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newOnes = (res.contacts as ContactItem[]).filter((c) => !existingIds.has(c.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
          });
        }
      } catch (err) {
        console.error('[InboxView] Error en búsqueda global:', err);
      } finally {
        if (!isCancelled) setIsSearchingGlobal(false);
      }
    }, 450);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [deferredSearch]);

  const handleLoadMoreContacts = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await loadMoreContacts({ offset: contactList.length, limit: 30 });
      if (!res.contacts || res.contacts.length === 0) {
        setHasMoreContacts(false);
      } else {
        setContactList((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const newItems = (res.contacts as ContactItem[]).filter((c) => !existingIds.has(c.id));
          return [...prev, ...newItems];
        });
        if (res.contacts.length < 30) {
          setHasMoreContacts(false);
        }
      }
      if (res.totalCount !== null) {
        setTotalContactsCount(res.totalCount);
      }
    } catch (err) {
      console.error('[InboxView] Error al cargar más contactos:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, contactList.length]);
  const draftsRef = useRef<Record<string, string>>({});
  const messagesCacheRef = useRef<Record<string, MessageItem[]>>({});
  const [messagesCache, setMessagesCache] = useState<Record<string, MessageItem[]>>(() => {
    if (activeContact?.id && messages && messages.length > 0) {
      return { [activeContact.id]: messages };
    }
    return {};
  });
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Inicializar caché de mensajes iniciales
  useEffect(() => {
    if (activeContact?.id && messages && messages.length > 0) {
      messagesCacheRef.current[activeContact.id] = messages;
      setMessagesCache((prev) => ({
        ...prev,
        [activeContact.id]: messages,
      }));
    }
  }, [activeContact?.id, messages]);

  // Selección fluida en cliente: 0ms si ya está en caché, sin recargar la página entera
  const handleSelectContact = useCallback(async (targetId: string, pushState = true) => {
    if (!targetId) return;
    setSelectedContactId(targetId);

    // Despejar badge de no leídos de inmediato (0ms de latencia)
    setContactList((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              unread_count: 0,
              custom_fields: { ...(c.custom_fields || {}), unread_count: 0 },
            }
          : c
      )
    );

    // Persistir lectura en base de datos en segundo plano
    markContactAsRead(targetId).catch(() => {});

    if (pushState && typeof window !== 'undefined') {
      window.history.pushState({ contactId: targetId }, '', `/inbox/${targetId}`);
    }

    // Si ya los tenemos en memoria, no hacemos ninguna petición (0ms de latencia)
    if (messagesCacheRef.current[targetId]) {
      return;
    }

    // Si aún no se han cargado, solicitamos únicamente los mensajes de este contacto
    setIsLoadingMessages(true);
    try {
      const fetched = await getContactMessages(targetId);
      messagesCacheRef.current[targetId] = fetched;
      setMessagesCache((prev) => ({
        ...prev,
        [targetId]: fetched,
      }));
    } catch (err) {
      console.error('[InboxView] Error cargando mensajes:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Agregar mensaje optimista al chat activo sin recarga
  const handleOptimisticMessage = useCallback((msg: MessageItem) => {
    if (!selectedContactId) return;
    const current = messagesCacheRef.current[selectedContactId] || [];
    const updated = [...current, msg];
    messagesCacheRef.current[selectedContactId] = updated;
    setMessagesCache((prev) => ({
      ...prev,
      [selectedContactId]: updated,
    }));

    // Despejar inmediatamente el badge de atención en 0ms cuando el asesor responde
    setUnattendedIds((prev) => {
      if (!prev.has(selectedContactId)) return prev;
      const next = new Set(prev);
      next.delete(selectedContactId);
      window.dispatchEvent(
        new CustomEvent('synqo-unattended-count', { detail: { count: next.size, items: [] } })
      );
      return next;
    });

    // Actualizar última interacción y último mensaje del contacto localmente
    setContactList((prev) =>
      prev.map((c) =>
        c.id === selectedContactId
          ? {
              ...c,
              last_interaction_at: new Date().toISOString(),
              last_message: { text: msg.content, sender_type: msg.sender_type, created_at: msg.created_at },
            }
          : c
      )
    );
  }, [selectedContactId]);

  // Actualizar datos del contacto de forma reactiva local (IA toggle, reasignación, etc.)
  const handleContactUpdate = useCallback((updatedFields: Partial<ContactItem>) => {
    if (!selectedContactId) return;
    setContactList((prev) =>
      prev.map((c) => (c.id === selectedContactId ? { ...c, ...updatedFields } : c))
    );
  }, [selectedContactId]);

  // Cargar lote anterior de mensajes para paginación ascendente ("Cargar anteriores")
  const handleLoadOlderMessages = useCallback(async (targetContactId: string): Promise<number> => {
    const current = messagesCacheRef.current[targetContactId] || [];
    if (current.length === 0) return 0;
    const oldest = current[0];
    const older = await getContactMessages(targetContactId, oldest.created_at, 50);
    if (!older || older.length === 0) return 0;

    const existingIds = new Set(current.map((m) => m.id));
    const newItems = older.filter((m: any) => !existingIds.has(m.id));
    if (newItems.length === 0) return 0;

    const merged = [...newItems, ...current];
    messagesCacheRef.current[targetContactId] = merged;
    setMessagesCache((prev) => ({
      ...prev,
      [targetContactId]: merged,
    }));

    return newItems.length;
  }, []);

  // Navegación nativa adelante/atrás del navegador sin recargas de página
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const pathname = window.location.pathname;
      const match = pathname.match(/\/inbox\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        handleSelectContact(match[1], false);
      } else if (pathname === '/inbox') {
        if (contactList.length > 0) {
          handleSelectContact(contactList[0].id, false);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [contactList, handleSelectContact]);

  // Evento personalizado para selección desde notificaciones flotantes (sin recarga)
  useEffect(() => {
    const handleCustomSelect = (e: any) => {
      const contactId = e.detail;
      if (contactId) {
        handleSelectContact(contactId, true);
      }
    };
    const handleDeleted = (e: any) => {
      const deletedId = e.detail;
      setContactList((prev) => {
        const remaining = prev.filter((c) => c.id !== deletedId);
        if (selectedContactId === deletedId && remaining.length > 0) {
          handleSelectContact(remaining[0].id, true);
        }
        return remaining;
      });
    };

    window.addEventListener('synqo-select-contact', handleCustomSelect);
    window.addEventListener('synqo-chat-deleted', handleDeleted);
    return () => {
      window.removeEventListener('synqo-select-contact', handleCustomSelect);
      window.removeEventListener('synqo-chat-deleted', handleDeleted);
    };
  }, [selectedContactId, handleSelectContact]);

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'supervisor';

  // Pestañas principales de trabajo:
  // 'hot' (🔥 Calientes), 'today_reminders' (⏰ Hoy), 'urgent' (🚨 Por Atender), 'mine' (Mis Chats), 'unassigned' (Sin Asignar), 'all' (Todos)
  const [activeTab, setActiveTab] = useState<'mine' | 'hot' | 'today_reminders' | 'urgent' | 'unassigned' | 'all'>(
    isAdmin ? 'all' : 'mine'
  );

  // Filtro secundario de IA / Humano
  const [aiFilter, setAiFilter] = useState<'all' | 'ai' | 'human'>('all');

  // Filtro de canal omnicanal (WhatsApp / Instagram)
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram'>('all');

  // Filtro por agente específico (solo visible para Admins y Supervisores)
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');

  // Conjunto de IDs de contactos con relevo pendiente no contestado
  const [unattendedIds, setUnattendedIds] = useState<Set<string>>(new Set());

  // Estado de sincronización manual de chats de WhatsApp (Evolution API / Z-API)
  const [syncingChats, setSyncingChats] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const isBaileys = whatsappProvider === 'evolution';

  const handleSyncChats = async () => {
    setSyncingChats(true);
    setSyncFeedback(null);
    try {
      const res = await importRecentEvolutionChats();
      setSyncFeedback(res.message);
      router.refresh();
      setTimeout(() => setSyncFeedback(null), 6000);
    } catch (err: any) {
      setSyncFeedback(err.message || 'Error al sincronizar chats.');
      setTimeout(() => setSyncFeedback(null), 6000);
    } finally {
      setSyncingChats(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchUnattended = async () => {
      try {
        const list = await getUnattendedHandoffs();
        if (isMounted) {
          setUnattendedIds(new Set(list.map((item: any) => item.id)));
        }
      } catch (e) {
        console.warn('[InboxView] Error cargando relevos pendientes:', e);
      }
    };

    fetchUnattended();

    const handleHandoffUpdate = (e: any) => {
      if (Array.isArray(e?.detail?.items)) {
        setUnattendedIds(new Set(e.detail.items.map((item: any) => item.id)));
      } else {
        fetchUnattended();
      }
    };

    window.addEventListener('synqo-unattended-count', handleHandoffUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('synqo-unattended-count', handleHandoffUpdate);
    };
  }, []);

  // Mantener actualizado el estado cuando cambian las props
  useEffect(() => {
    setContactList(contacts);
  }, [contacts]);

  // Suscripción Realtime a mensajes de Supabase para el contacto activo
  useEffect(() => {
    if (!selectedContactId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-messages-${selectedContactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${selectedContactId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageItem;
          const current = messagesCacheRef.current[selectedContactId] || [];
          if (!current.some((m) => m.id === newMsg.id)) {
            // Reemplazar mensaje temporal optimista si coincide para evitar burbujas duplicadas
            const filtered = current.filter(
              (m) => !(m.id.startsWith('temp-') && m.sender_type === newMsg.sender_type && m.content === newMsg.content)
            );
            const updated = [...filtered, newMsg];
            messagesCacheRef.current[selectedContactId] = updated;
            setMessagesCache((prev) => ({
              ...prev,
              [selectedContactId]: updated,
            }));
          }

          // Actualizar hora de interacción y último mensaje en la columna izquierda
          setContactList((prev) =>
            prev.map((c) =>
              c.id === selectedContactId
                ? {
                    ...c,
                    last_interaction_at: newMsg.created_at,
                    last_message: { text: newMsg.content, sender_type: newMsg.sender_type, created_at: newMsg.created_at },
                  }
                : c
            )
          );

          // Si el asesor respondió (desde la web o desde el móvil WhatsApp), despejar atención inmediatamente
          if (newMsg.sender_type === 'agent' || newMsg.sender_type === 'agent_manual') {
            setUnattendedIds((prev) => {
              if (!prev.has(selectedContactId)) return prev;
              const next = new Set(prev);
              next.delete(selectedContactId);
              window.dispatchEvent(
                new CustomEvent('synqo-unattended-count', { detail: { count: next.size, items: [] } })
              );
              return next;
            });
          } else if (newMsg.sender_type === 'lead') {
            // Si el cliente habla y la IA está apagada, marcar como pendiente de atención
            setUnattendedIds((prev) => {
              const currentContact = contactList.find((c) => c.id === selectedContactId);
              if (currentContact && !currentContact.is_ai_active) {
                const next = new Set(prev);
                next.add(selectedContactId);
                window.dispatchEvent(
                  new CustomEvent('synqo-unattended-count', { detail: { count: next.size, items: [] } })
                );
                return next;
              }
              return prev;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${selectedContactId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as any;
          const current = messagesCacheRef.current[selectedContactId] || [];
          const next = current.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
          messagesCacheRef.current[selectedContactId] = next;
          setMessagesCache((prev) => ({
            ...prev,
            [selectedContactId]: next,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedContactId]);

  // Suscripción Realtime a actualización de contactos (asignaciones, IA activa, relevos)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('inbox-contacts-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
          filter: organizationId ? `organization_id=eq.${organizationId}` : undefined,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id?: string };
            if (deleted?.id) {
              setContactList((prev) => prev.filter((c) => c.id !== deleted.id));
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            if (updated.deleted_at) {
              setContactList((prev) => prev.filter((c) => c.id !== updated.id));
            } else {
              setContactList((prev) =>
                prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
              );
            }
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as any;
            if (!inserted.deleted_at && (!organizationId || inserted.organization_id === organizationId)) {
              setContactList((prev) => [inserted, ...prev]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  // Conteo de chats por pestañas memoizado
  const myChatsCount = useMemo(
    () => contactList.filter((c) => c.assigned_to === currentUserId).length,
    [contactList, currentUserId]
  );
  const unassignedCount = useMemo(
    () => contactList.filter((c) => !c.assigned_to).length,
    [contactList]
  );
  const urgentCount = useMemo(
    () => contactList.filter((c) => unattendedIds.has(c.id)).length,
    [contactList, unattendedIds]
  );
  const hotCount = useMemo(
    () =>
      contactList.filter((c) => {
        const temp = c.custom_fields?.lead_temperature;
        return (
          temp === 'hot' ||
          c.pipeline_stage === 'calificado' ||
          c.pipeline_stage === 'cita_agendada'
        );
      }).length,
    [contactList]
  );
  const todayRemindersCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return contactList.filter((c) => {
      const scheduled = c.custom_fields?.active_reminder?.scheduledFor;
      if (!scheduled) return false;
      try {
        return new Date(scheduled).toDateString() === todayStr;
      } catch {
        return false;
      }
    }).length;
  }, [contactList]);

  // Filtrado compuesto no bloqueante a 60 FPS usando deferredSearch
  const filteredContacts = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();

    const result = contactList.filter((c) => {
      // 1. Filtro de búsqueda por texto diferido (permite tipeo fluido sin bloquear el input)
      if (q) {
        const matchesSearch =
          (c.name?.toLowerCase() || '').includes(q) ||
          c.phone.includes(q) ||
          (c.instagram_username?.toLowerCase() || '').includes(q);
        if (!matchesSearch) return false;
      }

      // 2. Filtro por canal omnicanal
      if (channelFilter === 'whatsapp' && c.channel === 'instagram') return false;
      if (channelFilter === 'instagram' && c.channel !== 'instagram') return false;

      // 3. Filtro por Pestaña de Asignación / Focos de Cierre
      if (activeTab === 'urgent') {
        const isUrgent = unattendedIds.has(c.id);
        if (!isUrgent) return false;
      } else if (activeTab === 'hot') {
        const temp = c.custom_fields?.lead_temperature;
        const isHot =
          temp === 'hot' ||
          c.pipeline_stage === 'calificado' ||
          c.pipeline_stage === 'cita_agendada';
        if (!isHot) return false;
      } else if (activeTab === 'today_reminders') {
        const scheduled = c.custom_fields?.active_reminder?.scheduledFor;
        if (!scheduled) return false;
        try {
          if (new Date(scheduled).toDateString() !== new Date().toDateString()) return false;
        } catch {
          return false;
        }
      } else if (activeTab === 'mine') {
        if (c.assigned_to !== currentUserId) return false;
      } else if (activeTab === 'unassigned') {
        if (c.assigned_to) return false;
      }

      // 4. Filtro por Agente Específico (Admin/Supervisor)
      if (isAdmin && selectedAgentFilter !== 'all') {
        if (selectedAgentFilter === 'unassigned') {
          if (c.assigned_to) return false;
        } else {
          if (c.assigned_to !== selectedAgentFilter) return false;
        }
      }

      // 5. Filtro por IA / Asesor Humano
      if (aiFilter === 'ai' && !c.is_ai_active) return false;
      if (aiFilter === 'human' && c.is_ai_active) return false;

      return true;
    });

    // Ordenamiento por Semáforo SLA y Prioridad de Espera:
    // Los leads con relevo pendiente o esperando asesor humano se priorizan arriba del directorio
    return result.sort((a, b) => {
      const aUrgent = unattendedIds.has(a.id);
      const bUrgent = unattendedIds.has(b.id);

      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;

      // Si ambos están en espera urgente, ordenar primero el que lleva más minutos esperando (SLA)
      if (aUrgent && bUrgent) {
        const timeA = new Date(a.last_interaction_at).getTime();
        const timeB = new Date(b.last_interaction_at).getTime();
        return timeA - timeB; // Más antiguo esperando primero
      }

      // Por defecto: interacción más reciente primero
      return new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime();
    });
  }, [contactList, deferredSearch, channelFilter, activeTab, currentUserId, isAdmin, selectedAgentFilter, aiFilter, unattendedIds]);

  const currentActiveContact =
    contactList.find((c) => c.id === selectedContactId) ||
    (activeContact?.id === selectedContactId ? activeContact : null) ||
    (contactList.length > 0 ? contactList[0] : null);

  const currentMessages =
    (selectedContactId && messagesCache[selectedContactId]) ||
    (currentActiveContact?.id && messagesCache[currentActiveContact.id]) ||
    [];

  return (
    <div className="flex h-[calc(100vh-80px)] gap-3 overflow-hidden">
      {/* Columna Izquierda: Directorio de Leads */}
      <div className={`w-full md:w-80 lg:w-96 bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden flex-col flex-shrink-0 text-slate-900 dark:text-slate-100 shadow-xs transition-colors ${
        selectedContactId ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Cabecera del Directorio */}
        <div className="p-3.5 border-b border-slate-200 dark:border-[#1E2433] bg-slate-50 dark:bg-[#0E121B] space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                Inbox
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {contactList.length} conversaciones
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {isBaileys && (
                <button
                  type="button"
                  onClick={handleSyncChats}
                  disabled={syncingChats}
                  title="Sincronizar últimos chats de WhatsApp al CRM"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-3.5 h-3.5 ${syncingChats ? 'animate-bounce text-indigo-600' : ''}`} />
                  <span className="hidden sm:inline">{syncingChats ? 'Sincronizando...' : 'Sincronizar'}</span>
                </button>
              )}
              <NewLeadModal
                buttonLabel="Nuevo Lead"
                onSuccess={(id) => {
                  if (id) {
                    handleSelectContact(id);
                  }
                }}
              />
            </div>
          </div>

          {/* Banner de Feedback de Sincronización */}
          {syncFeedback && (
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-700 dark:text-purple-300 flex items-center justify-between gap-2">
              <span className="leading-tight">{syncFeedback}</span>
              <button
                type="button"
                onClick={() => setSyncFeedback(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer font-bold shrink-0"
              >
                &times;
              </button>
            </div>
          )}

          {/* Buscador Rápido con Atajo ⌘K */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full pl-8 pr-12 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#232A3B] focus:outline-none focus:ring-1 focus:ring-[#0052FF] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
            {isSearchingGlobal ? (
              <Loader2 className="w-3.5 h-3.5 text-[#0052FF] animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            ) : search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-block text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 select-none pointer-events-none">
                ⌘K
              </kbd>
            )}
          </div>

          {/* Selector Omnicanal: Preparado y visible únicamente cuando existan contactos de Instagram */}
          {contactList.some((c) => c.channel === 'instagram') && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-0.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-xs">
              <button
                onClick={() => setChannelFilter('all')}
                className={`flex-1 py-1 rounded-md text-center transition cursor-pointer text-[11px] font-medium ${
                  channelFilter === 'all'
                    ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos ({contactList.length})
              </button>
              <button
                onClick={() => setChannelFilter('whatsapp')}
                className={`flex-1 py-1 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-medium ${
                  channelFilter === 'whatsapp'
                    ? 'bg-white dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF]'
                }`}
              >
                WA ({contactList.filter((c) => c.channel !== 'instagram').length})
              </button>
              <button
                onClick={() => setChannelFilter('instagram')}
                className={`flex-1 py-1 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-medium ${
                  channelFilter === 'instagram'
                    ? 'bg-white dark:bg-[#131722] text-pink-600 dark:text-pink-300 border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-300'
                }`}
              >
                IG ({contactList.filter((c) => c.channel === 'instagram').length})
              </button>
            </div>
          )}

          {/* Recordatorio de Preguntas Frecuentes Pendientes (Solo administradores) */}
          {pendingGapsCount > 0 && isAdmin && (
            <Link
              href="/settings"
              className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs hover:border-amber-300 dark:hover:border-amber-400 transition group"
              title="Resolver dudas frecuentes de clientes"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="font-medium text-[11px] truncate">
                  {pendingGapsCount === 1 ? '1 duda pendiente por resolver' : `${pendingGapsCount} dudas pendientes por resolver`}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 group-hover:underline flex-shrink-0">
                Resolver &rarr;
              </span>
            </Link>
          )}

          {/* Pestañas de Asignación y Focos de Cierre de Ventas */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-1 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs font-medium overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer shrink-0 ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos ({contactList.length})
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer shrink-0 ${
                activeTab === 'mine'
                  ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Míos ({myChatsCount})
            </button>
            <button
              onClick={() => setActiveTab('hot')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'hot'
                  ? 'bg-white dark:bg-[#131722] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
              title="Leads Calientes: Alta intención de compra"
            >
              <span>🔥 Calientes</span>
              {hotCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-mono font-bold">
                  {hotCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('today_reminders')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'today_reminders'
                  ? 'bg-white dark:bg-[#131722] text-blue-600 dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-[#00D2FF]'
              }`}
              title="Recordatorios comerciales agendados para hoy"
            >
              <span>⏰ Hoy</span>
              {todayRemindersCount > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 rounded-full text-[10px] font-mono font-bold">
                  {todayRemindersCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('urgent')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'urgent'
                  ? 'bg-white dark:bg-[#131722] text-rose-700 dark:text-rose-300 border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300'
              }`}
              title="Chats con relevo humano o esperando asesor"
            >
              <span>Por Atender</span>
              {urgentCount > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 rounded-full text-[10px] font-mono font-bold animate-pulse">
                  {urgentCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('unassigned')}
              className={`px-2.5 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'unassigned'
                  ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sin Asignar
              {unassignedCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 rounded-full text-[10px] font-mono font-bold">
                  {unassignedCount}
                </span>
              )}
            </button>
          </div>

          {/* Filtro Dropdown para Administrador: Ver por Vendedor Específico */}
          {isAdmin && (
            <div className="pt-0.5">
              <select
                value={selectedAgentFilter}
                onChange={(e) => setSelectedAgentFilter(e.target.value)}
                className="w-full text-xs bg-white dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
              >
                <option value="all">Filtrar por Agente: Todos</option>
                <option value="unassigned">Solo Sin Asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtros rápidos Modo Automático / Asesor */}
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
            <button
              onClick={() => setAiFilter('all')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                aiFilter === 'all' ? 'bg-[#0052FF] text-white' : 'bg-slate-100 dark:bg-[#090A0F] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setAiFilter('ai')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'ai' ? 'bg-[#0052FF] text-white' : 'bg-slate-100 dark:bg-[#090A0F] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] hover:text-[#0052FF] dark:hover:text-white'
              }`}
            >
              <Bot className="w-3 h-3" /> Automático
            </button>
            <button
              onClick={() => setAiFilter('human')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'human' ? 'bg-[#0052FF] text-white' : 'bg-slate-100 dark:bg-[#090A0F] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-3 h-3" /> Asesor
            </button>
          </div>
        </div>

        {/* Lista de Chats con Scroll */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E2433]">
          {contactList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500 space-y-3">
              <p>No tienes conversaciones registradas aún.</p>
              {isBaileys && (
                <button
                  type="button"
                  onClick={handleSyncChats}
                  disabled={syncingChats}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition shadow-xs cursor-pointer disabled:opacity-50 mx-auto"
                >
                  <Download className={`w-3.5 h-3.5 ${syncingChats ? 'animate-bounce' : ''}`} />
                  {syncingChats ? 'Sincronizando...' : 'Sincronizar Últimos 50 Chats'}
                </button>
              )}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">
              No hay conversaciones en esta sección.
            </div>
          ) : (
            <>
              {filteredContacts.map((c) => {
                const isActive = selectedContactId === c.id;
                const isMine = c.assigned_to === currentUserId;
                const assignedUser = teamMembers.find((m) => m.id === c.assigned_to);
                const isUnattended = unattendedIds.has(c.id);

                return (
                  <ContactListItem
                    key={c.id}
                    contact={c}
                    isActive={isActive}
                    isMine={isMine}
                    assignedUserName={assignedUser?.full_name}
                    isUnattended={isUnattended}
                    onSelect={handleSelectContact}
                  />
                );
              })}

              {!deferredSearch.trim() && hasMoreContacts && (
                <div className="p-3 text-center border-t border-slate-100 dark:border-[#1E2433]">
                  <button
                    type="button"
                    onClick={handleLoadMoreContacts}
                    disabled={isLoadingMore}
                    className="w-full py-2 px-3 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-[#151923] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#1E2433] rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052FF]" />
                        <span>Cargando conversaciones...</span>
                      </>
                    ) : (
                      <span>Cargar más conversaciones ({contactList.length}{totalContactsCount ? ` de ${totalContactsCount}` : ''})</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Columna Derecha: Ventana de Chat */}
      <div className={`flex-1 min-w-0 h-full ${
        !selectedContactId ? 'hidden md:flex' : 'flex'
      }`}>
        {currentActiveContact ? (
          <ChatWindow
            contact={currentActiveContact}
            messages={currentMessages}
            isLoadingMessages={isLoadingMessages && currentMessages.length === 0}
            onOptimisticMessage={handleOptimisticMessage}
            onContactUpdate={handleContactUpdate}
            onLoadOlderMessages={handleLoadOlderMessages}
            customTemplates={customTemplates}
            whatsappProvider={whatsappProvider}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            teamMembers={teamMembers}
            draftText={selectedContactId ? (draftsRef.current[selectedContactId] || '') : ''}
            onDraftChange={(val) => {
              if (selectedContactId) {
                draftsRef.current[selectedContactId] = val;
              }
            }}
            onBack={() => setSelectedContactId(null)}
          />
        ) : (
          <div className="h-full bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] flex flex-col items-center justify-center p-8 text-center text-slate-800 dark:text-slate-100 shadow-xs transition-colors">
            <MessageSquare className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-2.5" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Selecciona una conversación</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Elige un contacto del panel izquierdo para revisar los mensajes y gestionar la atención en tiempo real.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
