'use client';

import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { InboxSidebar } from './InboxSidebar';
import { BatchApologyModal } from './BatchApologyModal';
import { InboxCommandPalette } from '@/components/inbox/InboxCommandPalette';
import { ContactRowData } from './ConversationRow';
import { FilterState } from './InboxFiltersPopover';
import {
  InboxViewType,
  InboxCounts,
  SeguimientoFilterType,
  SeguimientoSubCounts,
  listInbox,
  getInboxCounts,
  getContactMessages,
  markContactAsRead,
  endContactConversation,
  snoozeContactAi,
  toggleContactAi,
} from '@/app/actions/chat';
import { claimUnassignedLead } from '@/app/actions/assignment';
import {
  useInboxStore,
  useInboxCounts,
  useViewContactIds,
} from '@/lib/inbox/use-inbox-store';
import { compareInboxContacts, type InboxSortMode } from '@/lib/inbox/buckets';

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
  initialCounts?: InboxCounts;
  initialTotalCount?: number | null;
  paymentAccounts?: any[];
  catalogItems?: any[];
  initialView?: InboxViewType;
  initialFilters?: FilterState;
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
  initialCounts,
  initialTotalCount = null,
  paymentAccounts = [],
  catalogItems = [],
  initialView = 'por_responder',
  initialFilters,
}: InboxViewProps) {
  const router = useRouter();

  // 1. Estado de la Vista / Bandeja Activa (URL como fuente de verdad)
  const [activeView, setActiveView] = useState<InboxViewType>(initialView);
  const [seguimientoFilter, setSeguimientoFilter] = useState<SeguimientoFilterType>('all');
  const [seguimientoSubCounts, setSeguimientoSubCounts] = useState<SeguimientoSubCounts | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    activeContact?.id || (initialContacts.length > 0 ? initialContacts[0].id : null)
  );

  // 2. Filtros secundarios sincronizados con SSR / URL
  const [filters, setFilters] = useState<FilterState>(
    initialFilters || {
      channel: 'all',
      agentId: 'all',
      stage: 'all',
      temperature: 'all',
    }
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const latestLoadReqRef = useRef(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // 3. Estado local de carga y paginación
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [hasMore, setHasMore] = useState(
    initialTotalCount !== undefined && initialTotalCount !== null
      ? initialContacts.length < initialTotalCount
      : initialContacts.length >= 30
  );
  const [totalCount, setTotalCount] = useState<number | null>(initialTotalCount);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      useInboxStore.getState().setSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 4. Inicializar Zustand Store con datos SSR (Zero Layout Shift)
  useEffect(() => {
    useInboxStore.getState().initialize({
      organizationId,
      currentUserId: currentUserId || '',
      currentUserRole: currentUserRole || 'agent',
      initialContacts: initialContacts || [],
      initialCounts: initialCounts || {
        por_responder: 0,
        mis_abiertos: 0,
        ia_atendiendo: 0,
        seguimiento: 0,
        cerrados: 0,
      },
      initialView,
      activeContact,
      activeContactId: activeContact?.id || (initialContacts.length > 0 ? initialContacts[0].id : null),
      initialMessages: messages || [],
      templates: customTemplates,
      teamMembers: teamMembers,
    });
    if (initialFilters) {
      useInboxStore.getState().setFilters(initialFilters);
    }

    if (paymentAccounts.length > 0 || catalogItems.length > 0) {
      useInboxStore.getState().setBootstrap({
        paymentAccounts,
        catalog: catalogItems,
      });
    }
  }, [organizationId, initialView]);

  // Mantener vista y filtros sincronizados cuando Next.js navega con nuevos searchParams (ej: clic desde Dashboard)
  useEffect(() => {
    setActiveView(initialView);
    useInboxStore.getState().setActiveView(initialView);
    if (initialFilters) {
      setFilters(initialFilters);
    }
  }, [
    initialView,
    initialFilters?.channel,
    initialFilters?.agentId,
    initialFilters?.stage,
    initialFilters?.temperature,
    initialFilters?.sort,
  ]);

  // Sembrar mensajes iniciales de SSR en el store inmediatamente si aún no existen
  if (activeContact?.id && messages && messages.length > 0) {
    const current = useInboxStore.getState().messagesByContact[activeContact.id];
    if (!current || !current.items || current.items.length === 0) {
      useInboxStore.getState().setContactMessages(activeContact.id, messages);
    }
  }

  // 5. Selectores Finos del Store Normalizado
  const counts = useInboxCounts();
  const viewContactIds = useViewContactIds(activeView);
  // Selectores acotados: InboxView solo re-renderiza si cambian los contactos de la vista actual,
  // el contacto activo o los mensajes del chat abierto (no ante cualquier evento del store).
  const viewContacts = useInboxStore(
    useShallow((s) => viewContactIds.map((id) => s.contactsById[id]).filter(Boolean) as ContactRowData[])
  );
  const selectedContactFromStore = useInboxStore((s) =>
    selectedContactId ? (s.contactsById[selectedContactId] as ContactRowData | undefined) : undefined
  );
  const selectedMessagesFromStore = useInboxStore((s) =>
    selectedContactId ? s.messagesByContact[selectedContactId]?.items : undefined
  );

  // Lista de contactos de la vista actual (orden WhatsApp Web garantizado)
  const contactList = useMemo(() => {
    const fromStore = viewContacts;
    if (fromStore.length > 0) {
      return [...fromStore].sort((a, b) => compareInboxContacts(a, b, activeView, filters.sort));
    }
    if (initialContacts && initialContacts.length > 0 && activeView === initialView && !searchQuery.trim() && filters.channel === 'all' && filters.agentId === 'all' && filters.stage === 'all' && filters.temperature === 'all') {
      return [...(initialContacts as ContactRowData[])].sort((a, b) => compareInboxContacts(a, b, activeView, filters.sort));
    }
    return fromStore;
  }, [viewContacts, initialContacts, activeView, initialView, searchQuery, filters]);

  // Mensajes de la conversación activa (con fallback inmediato a SSR para evitar pestañeo en blanco)
  const activeMessages = useMemo(() => {
    if (!selectedContactId) return [];
    const fromStore = selectedMessagesFromStore;
    if (fromStore && fromStore.length > 0) return fromStore;
    if (activeContact && selectedContactId === activeContact.id && messages && messages.length > 0) {
      return messages;
    }
    return fromStore || [];
  }, [selectedMessagesFromStore, selectedContactId, activeContact, messages]);

  // Contacto activo en pantalla
  const activeContactData = useMemo(() => {
    if (selectedContactId && selectedContactFromStore) {
      return selectedContactFromStore;
    }
    if (activeContact && (!selectedContactId || selectedContactId === activeContact.id)) {
      return activeContact as ContactRowData;
    }
    return null;
  }, [selectedContactFromStore, selectedContactId, activeContact]);

  // 6. Sincronización inicial desde URL (query params completos: view, c, ch, stage, temp, agent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') as InboxViewType | null;
    const contactParam = params.get('c');
    const channelParam = params.get('ch') as any;
    const stageParam = params.get('stage');
    const tempParam = params.get('temp');
    const agentParam = params.get('agent');
    const sortParam = params.get('sort');

    if (viewParam && ['por_responder', 'mis_abiertos', 'ia_atendiendo', 'seguimiento', 'cerrados'].includes(viewParam)) {
      setActiveView(viewParam);
      useInboxStore.getState().setActiveView(viewParam);
    }
    if (contactParam) {
      setSelectedContactId(contactParam);
      useInboxStore.getState().setActiveContactId(contactParam);
    }
    const validSorts: InboxSortMode[] = ['recent', 'unread_first', 'score', 'oldest', 'name', 'auto'];
    setFilters((prev) => ({
      channel: channelParam && ['all', 'whatsapp', 'instagram'].includes(channelParam) ? channelParam : prev.channel,
      stage: stageParam || prev.stage,
      temperature: tempParam || prev.temperature,
      agentId: agentParam || prev.agentId,
      sort: sortParam && validSorts.includes(sortParam as InboxSortMode) ? (sortParam as InboxSortMode) : prev.sort || 'recent',
    }));
  }, []);

  // 7. Refrescar contadores desde servidor
  const refreshCounts = useCallback(async () => {
    try {
      const serverCounts = await getInboxCounts();
      useInboxStore.getState().setCounts(serverCounts);
    } catch (err) {
      console.warn('[InboxView] Error obteniendo contadores:', err);
    }
  }, []);

  // 8. Cargar lista de contactos cuando cambia la vista, filtros o búsqueda
  const isFirstMountRef = useRef(true);
  const loadContacts = useCallback(
    async (offset = 0, isAppend = false) => {
      const reqId = ++latestLoadReqRef.current;
      setIsLoadingList(true);
      try {
        const res = await listInbox({
          view: activeView,
          seguimientoSubView: activeView === 'seguimiento' ? seguimientoFilter : 'all',
          channel: filters.channel,
          agentId: filters.agentId,
          stage: filters.stage,
          temperature: filters.temperature,
          sort: filters.sort || 'auto',
          search: debouncedSearchQuery,
          offset,
          limit: 30,
        });

        if (reqId !== latestLoadReqRef.current) return;

        useInboxStore.getState().setViewContacts(activeView, res.contacts, isAppend);
        if (res.seguimientoSubCounts) {
          setSeguimientoSubCounts(res.seguimientoSubCounts);
        }

        if (!isAppend) {
          if (!selectedContactId && res.contacts.length > 0) {
            openChat(res.contacts[0].id);
          }
        }

        setHasMore(
          res.totalCount !== null
            ? offset + res.contacts.length < res.totalCount
            : res.contacts.length === 30
        );
        if (res.totalCount !== null) {
          setTotalCount(res.totalCount);
        }
      } catch (err) {
        console.error('[InboxView] Error cargando lista de inbox:', err);
      } finally {
        if (reqId === latestLoadReqRef.current) {
          setIsLoadingList(false);
        }
      }
    },
    [activeView, seguimientoFilter, filters, debouncedSearchQuery, selectedContactId]
  );

  // Recargar contactos cuando cambian vista, filtros o búsqueda debounced
  useEffect(() => {
    useInboxStore.getState().setFilters(filters);
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (
        activeView === 'seguimiento' ||
        activeView !== initialView ||
        (contactList.length === 0 && (counts[activeView] || 0) > 0)
      ) {
        loadContacts(0, false);
      }
      return;
    }
    loadContacts(0, false);
  }, [activeView, seguimientoFilter, filters, debouncedSearchQuery]);

  // 9. Mapeo unificado para abrir chat (URL, clicks, popstate, notificaciones, J/K)
  const openChat = useCallback(
    async (contactId: string, options?: { skipPushState?: boolean }) => {
      if (!contactId) return;
      setSelectedContactId(contactId);
      useInboxStore.getState().setActiveContactId(contactId);

      // Despejar badge de no leídos inmediatamente (optimistic UI)
      useInboxStore.getState().upsertContact({ id: contactId, unread_count: 0 });
      markContactAsRead(contactId).catch(() => {});

      // Sincronizar URL sin recargar el layout
      if (!options?.skipPushState && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('view', activeView);
        url.searchParams.set('c', contactId);
        window.history.pushState(null, '', url.toString());
      }

      // Cargar mensajes con patrón Stale-While-Revalidate:
      // Si ya hay mensajes en caché o provistos por SSR, renderizarlos de inmediato (0ms, sin skeleton molesto)
      // pero SIEMPRE revalidar en segundo plano con el servidor para traer mensajes nuevos
      const cached = useInboxStore.getState().messagesByContact[contactId];
      const hasCached = Boolean(
        (cached && cached.items && cached.items.length > 0) ||
        (contactId === activeContact?.id && messages && messages.length > 0)
      );

      if (!hasCached) {
        setIsLoadingMessages(true);
      }

      try {
        const msgs = await getContactMessages(contactId);
        useInboxStore.getState().setContactMessages(contactId, msgs);
      } catch (err) {
        console.error('[InboxView] Error cargando mensajes:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [activeView, activeContact?.id, messages]
  );

  const handleSelectContact = useCallback(
    (contactId: string) => {
      openChat(contactId);
    },
    [openChat]
  );

  // Escuchar botón Atrás del navegador (Popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const contactParam = params.get('c');
      const viewParam = params.get('view') as InboxViewType | null;
      if (viewParam) {
        setActiveView(viewParam);
        useInboxStore.getState().setActiveView(viewParam);
      }
      if (contactParam) openChat(contactParam, { skipPushState: true });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [openChat]);

  // Escuchar eventos globales de selección de contacto (Notificaciones, Relevos, etc.)
  useEffect(() => {
    const handleSelectContactEvent = (e: any) => {
      const contactId = e.detail;
      if (contactId) {
        openChat(contactId);
      }
    };
    window.addEventListener('synqo-select-contact', handleSelectContactEvent as EventListener);
    return () => window.removeEventListener('synqo-select-contact', handleSelectContactEvent as EventListener);
  }, [openChat]);

  // Escuchar eventos de Inbox Zero: Salto automático al siguiente chat disponible tras finalizar o con ⌘+Enter
  useEffect(() => {
    const handleInboxZeroNext = (e: any) => {
      const closedId = e.detail?.closedContactId;
      const currentList = contactList;
      const currentIdx = currentList.findIndex((c: any) => c.id === closedId);

      let nextContact: any = null;
      if (currentIdx !== -1) {
        nextContact = currentList[currentIdx + 1] || currentList[currentIdx - 1];
      } else if (currentList.length > 0) {
        nextContact = currentList[0];
      }

      if (nextContact && nextContact.id !== closedId) {
        openChat(nextContact.id);
      } else if (!e.detail?.jumpOnly) {
        // Si no hay más contactos y se cerró la conversación, limpiar selección
        setSelectedContactId(null);
        useInboxStore.getState().setActiveContactId(null);
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('c');
          window.history.pushState(null, '', url.toString());
        }
      }
    };

    window.addEventListener('synqo-inbox-zero-next', handleInboxZeroNext as EventListener);
    return () => window.removeEventListener('synqo-inbox-zero-next', handleInboxZeroNext as EventListener);
  }, [contactList, openChat]);

  // Cargar lote anterior de mensajes por keyset pagination (sin saltos de scroll)
  const handleLoadOlderMessages = useCallback(async (contactId: string): Promise<number> => {
    const cached = useInboxStore.getState().messagesByContact[contactId];
    const current = cached?.items || [];
    if (current.length === 0) return 0;
    const oldestCreatedAt = current[0]?.created_at;
    if (!oldestCreatedAt) return 0;

    try {
      const older = await getContactMessages(contactId, oldestCreatedAt, 40);
      if (!older || older.length === 0) return 0;

      useInboxStore.getState().setContactMessages(contactId, older, {
        isPrepend: true,
        hasMoreOlder: older.length >= 40,
      });

      return older.length;
    } catch (err) {
      console.error('[InboxView] Error cargando mensajes anteriores:', err);
      return 0;
    }
  }, []);

  // 10. Actualización optimista de mensajes
  const handleBackFromChat = useCallback(() => {
    setSelectedContactId(null);
    useInboxStore.getState().setActiveContactId(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('c');
      window.history.pushState(null, '', url.toString());
    }
  }, []);

  const handleOptimisticMessage = useCallback((msg: MessageItem) => {
    if (!selectedContactId) return;
    useInboxStore.getState().upsertMessage({
      ...msg,
      contact_id: selectedContactId,
    });
  }, [selectedContactId]);

  // Actualizar contacto en lista local
  const handleContactUpdate = useCallback(
    (fields: Partial<ContactRowData>) => {
      if (!selectedContactId) return;
      useInboxStore.getState().upsertContact({ id: selectedContactId, ...fields });
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
        useInboxStore.getState().upsertContact({ id: contactId, assigned_to: currentUserId });
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
        useInboxStore.getState().upsertContact({
          id: contactId,
          conversation_status: 'closed',
          is_ai_active: false,
          waiting_since: null,
        });
        refreshCounts();
      } catch (err) {
        console.error('[InboxView] Error al cerrar chat:', err);
      }
    },
    [refreshCounts]
  );

  const handleQuickSnooze = useCallback(
    async (contactId: string) => {
      try {
        await snoozeContactAi(contactId, 30);
        const resumeIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const existingCf = useInboxStore.getState().contactsById[contactId]?.custom_fields || {};
        useInboxStore.getState().upsertContact({
          id: contactId,
          is_ai_active: false,
          ai_snooze_until: resumeIso,
          conversation_status: 'snoozed',
          waiting_since: null,
          custom_fields: {
            ...existingCf,
            ai_snooze_until: resumeIso,
            manual_ai_paused: false,
            unattended_handoff: false,
          },
        });
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
      ids.forEach((id) => useInboxStore.getState().removeContact(id));
      refreshCounts();
    },
    [refreshCounts]
  );

  // 13. Atajos de Teclado (⌘K = Comandos, J = Siguiente, K = Anterior)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atajo global ⌘K / Ctrl+K para abrir la paleta de comandos
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

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
        } else if (currentIdx === -1 && contactList.length > 0) {
          handleSelectContact(contactList[0].id);
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

  return (
    <div className="flex h-[calc(100dvh-132px)] md:h-[calc(100dvh-80px)] overflow-hidden rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] shadow-xs">
      {/* 1. Columna Izquierda: Sidebar de Conversaciones */}
      <div className={`h-full ${selectedContactId ? 'hidden md:flex' : 'flex w-full'}`}>
        <InboxSidebar
          contacts={contactList}
          counts={counts}
          activeView={activeView}
          seguimientoFilter={seguimientoFilter}
          serverSeguimientoSubCounts={seguimientoSubCounts}
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
          onChangeSeguimientoFilter={setSeguimientoFilter}
          onChangeView={(v) => {
            setActiveView(v);
            useInboxStore.getState().setActiveView(v);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('view', v);
              window.history.pushState(null, '', url.toString());
            }
          }}
          onChangeSearch={setSearchQuery}
          onChangeFilter={(k, v) => {
            setFilters((prev) => {
              const next = { ...prev, [k]: v };
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                if (next.channel !== 'all') url.searchParams.set('ch', next.channel);
                else url.searchParams.delete('ch');
                if (next.agentId !== 'all') url.searchParams.set('agent', next.agentId);
                else url.searchParams.delete('agent');
                if (next.stage !== 'all') url.searchParams.set('stage', next.stage);
                else url.searchParams.delete('stage');
                if (next.temperature !== 'all') url.searchParams.set('temp', next.temperature);
                else url.searchParams.delete('temp');
                if (next.sort && next.sort !== 'auto') url.searchParams.set('sort', next.sort);
                else url.searchParams.delete('sort');
                window.history.replaceState(null, '', url.toString());
              }
              return next;
            });
          }}
          onClearFilters={() => {
            setFilters({ channel: 'all', agentId: 'all', stage: 'all', temperature: 'all', sort: 'recent' });
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              ['ch', 'agent', 'stage', 'temp', 'sort'].forEach((p) => url.searchParams.delete(p));
              window.history.replaceState(null, '', url.toString());
            }
          }}
          onRemoveFilterChip={(k) => {
            setFilters((prev) => {
              const next = { ...prev, [k]: k === 'sort' ? 'recent' : 'all' };
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                const paramMap: Record<keyof FilterState, string> = {
                  channel: 'ch',
                  agentId: 'agent',
                  stage: 'stage',
                  temperature: 'temp',
                  sort: 'sort',
                };
                url.searchParams.delete(paramMap[k]);
                window.history.replaceState(null, '', url.toString());
              }
              return next;
            });
          }}
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
            contact={activeContactData}
            messages={activeMessages}
            isLoadingMessages={isLoadingMessages}
            onOptimisticMessage={handleOptimisticMessage}
            onContactUpdate={handleContactUpdate}
            onLoadOlderMessages={handleLoadOlderMessages}
            customTemplates={customTemplates}
            whatsappProvider={whatsappProvider}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            teamMembers={teamMembers}
            onBack={handleBackFromChat}
          />
        ) : (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50/50 dark:bg-[#090A0F]/50">
            {activeView === 'por_responder' && counts.por_responder === 0 ? (
              <div className="flex flex-col items-center animate-in zoom-in-95 duration-200 max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3.5 shadow-2xs border border-emerald-200 dark:border-emerald-500/20">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  ¡Bandeja al día! (Inbox Zero)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Has atendido todas las conversaciones pendientes en esta bandeja. Los nuevos mensajes entrantes aparecerán aquí en tiempo real.
                </p>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center mb-3">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  Selecciona una conversación
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Elige un chat de la lista izquierda o usa los atajos <strong>J / K</strong> para navegar rápidamente entre prospectos.
                </p>
              </>
            )}
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

      {/* Paleta de Comandos Global ⌘K para Asesores Comerciales */}
      <InboxCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        activeContactId={selectedContactId}
        onSelectView={(v) => {
          setActiveView(v);
          useInboxStore.getState().setActiveView(v);
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('view', v);
            window.history.pushState(null, '', url.toString());
          }
        }}
        onNextChat={() => {
          const currentIdx = contactList.findIndex((c) => c.id === selectedContactId);
          if (currentIdx >= 0 && currentIdx < contactList.length - 1) {
            handleSelectContact(contactList[currentIdx + 1].id);
          } else if (currentIdx === -1 && contactList.length > 0) {
            handleSelectContact(contactList[0].id);
          }
        }}
        onPrevChat={() => {
          const currentIdx = contactList.findIndex((c) => c.id === selectedContactId);
          if (currentIdx > 0) {
            handleSelectContact(contactList[currentIdx - 1].id);
          }
        }}
        onRequestAiDraft={() => {
          // Disparar generación con copiloto simulando Ctrl+J
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, ctrlKey: true }));
        }}
        onToggleAi={(activate) => {
          if (selectedContactId) {
            const existingCf =
              useInboxStore.getState().contactsById[selectedContactId]?.custom_fields || {};
            const nextCf = { ...existingCf };
            if (activate) {
              nextCf.manual_ai_paused = false;
              delete nextCf.ai_snooze_until;
              delete nextCf.mobile_takeover_at;
              delete nextCf.mobile_takeover_source;
            } else {
              nextCf.manual_ai_paused = true;
            }
            useInboxStore.getState().upsertContact({
              id: selectedContactId,
              is_ai_active: activate,
              ...(activate ? { ai_snooze_until: null } : {}),
              custom_fields: nextCf,
            });
            toggleContactAi(selectedContactId, activate)
              .then(() => refreshCounts())
              .catch((err) => console.error('[InboxView Cmd+K ToggleAI error]', err));
          }
        }}
        onOpenCloseChatModal={(resolution) => {
          // Abre modal de fin de conversación en ChatWindow
          window.dispatchEvent(new CustomEvent('synqo-open-end-chat-modal', { detail: { resolution } }));
        }}
      />
    </div>
  );
}
