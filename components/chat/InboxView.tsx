'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Sparkles, RefreshCw } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { InboxSidebar } from './InboxSidebar';
import { BatchApologyModal } from './BatchApologyModal';
import { ContactRowData } from './ConversationRow';
import { FilterState } from './InboxFiltersPopover';
import { createClient } from '@/lib/supabase/client';
import {
  InboxViewType,
  InboxCounts,
  listInbox,
  getInboxCounts,
  getContactMessages,
  markContactAsRead,
  endContactConversation,
  snoozeContactAi,
} from '@/app/actions/chat';
import { claimUnassignedLead, assignLeadByAdmin } from '@/app/actions/assignment';
import { importRecentEvolutionChats } from '@/app/actions/evolution';

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

interface InboxViewProps {
  organizationId: string;
  contacts: any[];
  activeContact: any | null;
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
  contacts: initialContacts,
  activeContact,
  messages,
  customTemplates = [],
  whatsappProvider = 'meta',
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  pendingGapsCount = 0,
}: InboxViewProps) {
  const router = useRouter();

  // 1. Estado de la Vista / Bandeja Activa (URL como fuente de verdad)
  const [activeView, setActiveView] = useState<InboxViewType>('por_responder');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    activeContact?.id || (initialContacts.length > 0 ? initialContacts[0].id : null)
  );

  // 2. Filtros secundarios
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    agentId: 'all',
    stage: 'all',
    temperature: 'all',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // 3. Lista de Contactos & Paginación
  const [contactList, setContactList] = useState<ContactRowData[]>(initialContacts || []);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // 4. Contadores reales del Servidor
  const [counts, setCounts] = useState<InboxCounts>({
    por_responder: 0,
    mis_abiertos: 0,
    ia_atendiendo: 0,
    seguimiento: 0,
    cerrados: 0,
  });

  // 5. Caché de Mensajes & Borradores en Memoria (0ms switching)
  const messagesCacheRef = useRef<Record<string, MessageItem[]>>({});
  const [messagesCache, setMessagesCache] = useState<Record<string, MessageItem[]>>(() => {
    if (activeContact?.id && messages && messages.length > 0) {
      return { [activeContact.id]: messages };
    }
    return {};
  });
  const draftsRef = useRef<Record<string, string>>({});
  const [draftText, setDraftText] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // 6. Sincronización inicial desde URL (query params)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') as InboxViewType | null;
    const contactParam = params.get('c');
    const channelParam = params.get('ch') as any;

    if (viewParam && ['por_responder', 'mis_abiertos', 'ia_atendiendo', 'seguimiento', 'cerrados'].includes(viewParam)) {
      setActiveView(viewParam);
    }
    if (contactParam) {
      setSelectedContactId(contactParam);
    }
    if (channelParam && ['all', 'whatsapp', 'instagram'].includes(channelParam)) {
      setFilters((prev) => ({ ...prev, channel: channelParam }));
    }
  }, []);

  // 7. Cargar contadores del servidor al montar
  const refreshCounts = useCallback(async () => {
    try {
      const serverCounts = await getInboxCounts();
      setCounts(serverCounts);
    } catch (err) {
      console.warn('[InboxView] Error obteniendo contadores:', err);
    }
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // 8. Cargar lista de contactos cuando cambia la vista, filtros o búsqueda
  const loadContacts = useCallback(
    async (offset = 0, isAppend = false) => {
      setIsLoadingList(true);
      try {
        const res = await listInbox({
          view: activeView,
          channel: filters.channel,
          agentId: filters.agentId,
          stage: filters.stage,
          temperature: filters.temperature,
          search: searchQuery,
          offset,
          limit: 30,
        });

        if (isAppend) {
          setContactList((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newOnes = res.contacts.filter((c: any) => !existingIds.has(c.id));
            return [...prev, ...newOnes];
          });
        } else {
          setContactList(res.contacts);
          // Si el contacto seleccionado ya no pertenece a la vista, seleccionar el primero disponible
          if (res.contacts.length > 0 && (!selectedContactId || !res.contacts.some((c: any) => c.id === selectedContactId))) {
            setSelectedContactId(res.contacts[0].id);
          }
        }

        setHasMore(res.contacts.length === 30);
        if (res.totalCount !== null) {
          setTotalCount(res.totalCount);
        }
      } catch (err) {
        console.error('[InboxView] Error cargando lista de inbox:', err);
      } finally {
        setIsLoadingList(false);
      }
    },
    [activeView, filters, searchQuery, selectedContactId]
  );

  // Recargar contactos cuando cambian vista o filtros
  useEffect(() => {
    loadContacts(0, false);
  }, [activeView, filters, searchQuery]);

  // 9. Manejar selección de contacto y sincronizar URL
  const handleSelectContact = useCallback(
    async (contactId: string) => {
      if (!contactId) return;
      setSelectedContactId(contactId);

      // Despejar badge de no leídos inmediatamente (optimistic UI)
      setContactList((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, unread_count: 0 } : c))
      );
      markContactAsRead(contactId).catch(() => {});

      // Sincronizar URL sin recargar
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('view', activeView);
        url.searchParams.set('c', contactId);
        window.history.pushState(null, '', url.toString());
      }

      // Cargar mensajes si no están en memoria
      if (messagesCacheRef.current[contactId]) {
        return;
      }

      setIsLoadingMessages(true);
      try {
        const msgs = await getContactMessages(contactId);
        messagesCacheRef.current[contactId] = msgs;
        setMessagesCache((prev) => ({ ...prev, [contactId]: msgs }));
      } catch (err) {
        console.error('[InboxView] Error cargando mensajes:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [activeView]
  );

  // Escuchar botón Atrás del navegador (Popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const contactParam = params.get('c');
      const viewParam = params.get('view') as InboxViewType | null;
      if (viewParam) setActiveView(viewParam);
      if (contactParam) setSelectedContactId(contactParam);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 10. Actualización optimista de mensajes
  const handleOptimisticMessage = useCallback((msg: MessageItem) => {
    if (!selectedContactId) return;
    setMessagesCache((prev) => {
      const current = prev[selectedContactId] || [];
      // Si ya existe por id temporal, reemplazarlo
      const existingIdx = current.findIndex((m) => m.id === msg.id);
      let updated: MessageItem[];
      if (existingIdx >= 0) {
        updated = [...current];
        updated[existingIdx] = msg;
      } else {
        updated = [...current, msg];
      }
      messagesCacheRef.current[selectedContactId] = updated;
      return { ...prev, [selectedContactId]: updated };
    });

    // Actualizar preview local
    setContactList((prev) =>
      prev.map((c) =>
        c.id === selectedContactId
          ? {
              ...c,
              last_message_preview: msg.content.slice(0, 150),
              last_message_sender: msg.sender_type,
              last_interaction_at: msg.created_at,
              unread_count: 0,
            }
          : c
      )
    );
  }, [selectedContactId]);

  // Actualizar contacto en lista local
  const handleContactUpdate = useCallback(
    (fields: Partial<ContactRowData>) => {
      if (!selectedContactId) return;
      setContactList((prev) =>
        prev.map((c) => (c.id === selectedContactId ? { ...c, ...fields } : c))
      );
      refreshCounts();
    },
    [selectedContactId, refreshCounts]
  );

  // 11. Acciones Rápidas desde el Sidebar (Hover Actions)
  const handleQuickAssign = useCallback(
    async (contactId: string) => {
      if (!currentUserId) return;
      try {
        await claimUnassignedLead(contactId);
        setContactList((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, assigned_to: currentUserId } : c))
        );
        refreshCounts();
      } catch (err) {
        console.error('[InboxView] Error al auto-asignarse lead:', err);
      }
    },
    [currentUserId, refreshCounts]
  );

  const handleQuickClose = useCallback(
    async (contactId: string) => {
      try {
        await endContactConversation(contactId, 'completed');
        // Remover de la vista si estamos en una vista de abiertos
        if (activeView !== 'cerrados') {
          setContactList((prev) => prev.filter((c) => c.id !== contactId));
        } else {
          setContactList((prev) =>
            prev.map((c) => (c.id === contactId ? { ...c, conversation_status: 'closed' } : c))
          );
        }
        refreshCounts();
      } catch (err) {
        console.error('[InboxView] Error al cerrar chat:', err);
      }
    },
    [activeView, refreshCounts]
  );

  const handleQuickSnooze = useCallback(
    async (contactId: string) => {
      try {
        await snoozeContactAi(contactId, 30);
        setContactList((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, is_ai_active: false } : c))
        );
        refreshCounts();
      } catch (err) {
        console.error('[InboxView] Error pausando IA:', err);
      }
    },
    [refreshCounts]
  );

  // 12. Acciones en Bloque (Multi-Select)
  const [isBatchApologyOpen, setIsBatchApologyOpen] = useState(false);
  const [batchApologyContacts, setBatchApologyContacts] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);

  const handleOpenBatchApology = useCallback((ids: string[]) => {
    const targets = contactList
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
    if (targets.length > 0) {
      setBatchApologyContacts(targets);
      setIsBatchApologyOpen(true);
    }
  }, [contactList]);

  const handleBatchApologySuccess = useCallback(async () => {
    await Promise.all([loadContacts(0, false), refreshCounts()]);
  }, [loadContacts, refreshCounts]);

  const handleBatchClose = useCallback(
    async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => endContactConversation(id, 'completed')));
      setContactList((prev) => prev.filter((c) => !ids.includes(c.id)));
      refreshCounts();
    },
    [refreshCounts]
  );

  // 13. Suscripción Realtime a Supabase
  useEffect(() => {
    const supabase = createClient();

    // Canal de contactos para actualizar preview, estado y badges a 60 FPS
    const contactChannel = supabase
      .channel(`inbox_contacts_${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated || !updated.id) return;

          setContactList((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...updated };
              return copy;
            }
            return prev;
          });

          refreshCounts();
        }
      )
      .subscribe();

    // Canal de mensajes para recibir nuevos chats en vivo
    const messagesChannel = supabase
      .channel(`inbox_messages_${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as MessageItem & { contact_id: string };
          if (!newMsg || !newMsg.contact_id) return;

          // Si el mensaje pertenece al chat activo, insertarlo
          if (newMsg.contact_id === selectedContactId) {
            setMessagesCache((prev) => {
              const current = prev[selectedContactId] || [];
              if (current.some((m) => m.id === newMsg.id)) return prev;
              const updated = [...current, newMsg];
              messagesCacheRef.current[selectedContactId] = updated;
              return { ...prev, [selectedContactId]: updated };
            });
          }

          // Actualizar vista previa del contacto
          setContactList((prev) =>
            prev.map((c) =>
              c.id === newMsg.contact_id
                ? {
                    ...c,
                    last_message_preview: newMsg.content.slice(0, 150),
                    last_message_sender: newMsg.sender_type,
                    last_interaction_at: newMsg.created_at,
                    unread_count:
                      newMsg.contact_id === selectedContactId
                        ? 0
                        : (c.unread_count || 0) + (newMsg.sender_type === 'lead' ? 1 : 0),
                  }
                : c
            )
          );

          refreshCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [organizationId, selectedContactId, refreshCounts]);

  // 14. Atajos de Teclado (J = Siguiente, K = Anterior)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isTyping) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const currentIdx = contactList.findIndex((c) => c.id === selectedContactId);
        if (currentIdx >= 0 && currentIdx < contactList.length - 1) {
          handleSelectContact(contactList[currentIdx + 1].id);
        }
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const currentIdx = contactList.findIndex((c) => c.id === selectedContactId);
        if (currentIdx > 0) {
          handleSelectContact(contactList[currentIdx - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contactList, selectedContactId, handleSelectContact]);

  // Contacto activo en pantalla
  const activeContactData = useMemo(() => {
    return contactList.find((c) => c.id === selectedContactId) || activeContact || null;
  }, [contactList, selectedContactId, activeContact]);

  const activeMessages = useMemo(() => {
    if (!selectedContactId) return [];
    return messagesCache[selectedContactId] || [];
  }, [messagesCache, selectedContactId]);

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] shadow-xs">
      {/* 1. Columna Izquierda: Sidebar de Conversaciones */}
      <div className={`h-full ${selectedContactId ? 'hidden md:flex' : 'flex w-full'}`}>
        <InboxSidebar
          contacts={contactList}
          counts={counts}
          activeView={activeView}
          selectedContactId={selectedContactId}
          filters={filters}
          searchQuery={searchQuery}
          isLoading={isLoadingList}
          hasMore={hasMore}
          teamMembers={teamMembers}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          pendingGapsCount={pendingGapsCount}
          onSelectContact={handleSelectContact}
          onChangeView={(v) => {
            setActiveView(v);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('view', v);
              window.history.pushState(null, '', url.toString());
            }
          }}
          onChangeSearch={setSearchQuery}
          onChangeFilter={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          onClearFilters={() =>
            setFilters({ channel: 'all', agentId: 'all', stage: 'all', temperature: 'all' })
          }
          onRemoveFilterChip={(k) => setFilters((prev) => ({ ...prev, [k]: 'all' }))}
          onLoadMore={() => loadContacts(contactList.length, true)}
          onQuickAssign={handleQuickAssign}
          onQuickClose={handleQuickClose}
          onQuickSnooze={handleQuickSnooze}
          onBatchClose={handleBatchClose}
          onOpenBatchApology={handleOpenBatchApology}
        />
      </div>

      {/* 2. Columna Central y Derecha: Ventana del Chat y Panel de Contacto */}
      <div className={`flex-1 h-full min-w-0 ${!selectedContactId ? 'hidden md:flex' : 'flex'}`}>
        {activeContactData ? (
          <ChatWindow
            key={activeContactData.id}
            contact={activeContactData}
            messages={activeMessages}
            isLoadingMessages={isLoadingMessages}
            onOptimisticMessage={handleOptimisticMessage}
            onContactUpdate={handleContactUpdate}
            customTemplates={customTemplates}
            whatsappProvider={whatsappProvider}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            teamMembers={teamMembers}
            draftText={draftText}
            onDraftChange={setDraftText}
            onBack={() => {
              setSelectedContactId(null);
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.delete('c');
                window.history.pushState(null, '', url.toString());
              }
            }}
          />
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50/50 dark:bg-[#090A0F]/50">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              Selecciona una conversación
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mt-1">
              Elige un chat de la lista izquierda o usa los atajos <strong>J / K</strong> para navegar rápidamente entre prospectos.
            </p>
          </div>
        )}
      </div>

      {/* Modal de Rescate Masivo por Demora */}
      {isBatchApologyOpen && (
        <BatchApologyModal
          isOpen={isBatchApologyOpen}
          onClose={() => setIsBatchApologyOpen(false)}
          selectedContacts={batchApologyContacts}
          currentUserName={teamMembers.find((m) => m.id === currentUserId)?.full_name || 'Asesor'}
          onSuccess={handleBatchApologySuccess}
        />
      )}
    </div>
  );
}
