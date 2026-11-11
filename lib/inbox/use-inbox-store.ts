import { create } from 'zustand';
import {
  contactIsAiAttending,
  contactMatchesInboxView,
  contactNeedsHumanResponse,
  sortInboxViewIds,
  type InboxSortMode,
} from './buckets';

export type InboxViewType = 'por_responder' | 'mis_abiertos' | 'ia_atendiendo' | 'seguimiento' | 'cerrados';

export interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage?: any;
  is_ai_active: boolean;
  last_interaction_at: string;
  updated_at: string;
  custom_fields?: any;
  assigned_to?: string | null;
  channel?: 'whatsapp' | 'instagram';
  instagram_username?: string | null;
  instagram_id?: string | null;
  unread_count?: number;
  last_message?: any;
  last_message_sender?: string | null;
  last_message_preview?: string | null;
  waiting_since?: string | null;
  conversation_status?: string;
  deal_value?: number | null;
  ai_snooze_until?: string | null;
  last_lead_message_at?: string | null;
  lead_score?: number | null;
  lead_score_breakdown?: any;
  lead_temperature?: string | null;
}

export interface MessageItem {
  id: string;
  contact_id?: string;
  sender_type: 'lead' | 'agent_manual' | 'ai' | 'system';
  content: string;
  created_at: string;
  status?: string | null;
  reply_to_message_id?: string | null;
  reactions?: any;
  meta_message_id?: string | null;
}

export interface InboxCounts {
  por_responder: number;
  mis_abiertos: number;
  ia_atendiendo: number;
  seguimiento: number;
  cerrados: number;
}

export interface InboxFilters {
  channel: 'all' | 'whatsapp' | 'instagram';
  agentId: string;
  stage: string;
  temperature: string;
  sort?: InboxSortMode;
}

export interface BootstrapData {
  paymentAccounts: any[];
  catalog: any[];
  quickReplies: any[] | { activeSnippets?: any[]; aiSuggestions?: any[] };
  templates: Array<{ name: string; label: string }>;
  teamMembers: Array<{ id: string; full_name: string; email: string; role: string }>;
  loadedAt: number;
}

interface MessagesState {
  items: MessageItem[];
  hasMoreOlder: boolean;
  oldestCreatedAt?: string;
  syncedAt: number;
}

export interface InboxStoreState {
  // Organización y sesión
  organizationId: string | null;
  currentUserId: string | null;
  currentUserRole: string;

  // Contactos normalizados por ID
  contactsById: Record<string, ContactItem>;

  // IDs de contactos por cada bandeja/vista
  viewIds: Record<InboxViewType, string[]>;

  // Mensajes agrupados por contacto
  messagesByContact: Record<string, MessagesState>;

  // Selección actual y navegación
  activeContactId: string | null;
  activeView: InboxViewType;
  filters: InboxFilters;
  searchQuery: string;

  // Contadores de bandejas
  counts: InboxCounts;

  // Bootstrap cacheado una sola vez por sesión
  bootstrap: BootstrapData | null;

  // Estado de sincronización en red
  isOnline: boolean;
  lastSyncAt: string | null;
  isLoadingList: boolean;
  isLoadingMessages: boolean;

  // Acciones
  initialize: (params: {
    organizationId: string;
    currentUserId: string;
    currentUserRole: string;
    initialContacts: ContactItem[];
    initialCounts: InboxCounts;
    initialView?: InboxViewType;
    activeContact?: ContactItem | null;
    activeContactId?: string | null;
    initialMessages?: MessageItem[];
    templates?: Array<{ name: string; label: string }>;
    teamMembers?: Array<{ id: string; full_name: string; email: string; role: string }>;
  }) => void;

  setActiveView: (view: InboxViewType) => void;
  setFilters: (filters: Partial<InboxFilters>) => void;
  setSearchQuery: (query: string) => void;
  setActiveContactId: (id: string | null) => void;

  upsertContact: (contact: Partial<ContactItem> & { id: string }) => void;
  removeContact: (id: string) => void;
  setViewContacts: (view: InboxViewType, contacts: ContactItem[], isAppend?: boolean) => void;

  setContactMessages: (
    contactId: string,
    messages: MessageItem[],
    options?: { hasMoreOlder?: boolean; isPrepend?: boolean }
  ) => void;
  upsertMessage: (msg: MessageItem & { contact_id: string }) => void;
  updateMessageStatus: (msgId: string, contactId: string, status: string, metaMessageId?: string | null) => void;
  updateMessageReaction: (msgId: string, contactId: string, reactions: any) => void;

  setCounts: (counts: Partial<InboxCounts>) => void;
  setBootstrap: (data: Partial<BootstrapData>) => void;
  setOnline: (isOnline: boolean) => void;
  setLastSyncAt: (iso: string) => void;
  setLoadingList: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
}

export const useInboxStore = create<InboxStoreState>((set, get) => ({
  organizationId: null,
  currentUserId: null,
  currentUserRole: 'agent',

  contactsById: {},
  viewIds: {
    por_responder: [],
    mis_abiertos: [],
    ia_atendiendo: [],
    seguimiento: [],
    cerrados: [],
  },
  messagesByContact: {},

  activeContactId: null,
  activeView: 'por_responder',
  filters: {
    channel: 'all',
    agentId: 'all',
    stage: 'all',
    temperature: 'all',
  },
  searchQuery: '',

  counts: {
    por_responder: 0,
    mis_abiertos: 0,
    ia_atendiendo: 0,
    seguimiento: 0,
    cerrados: 0,
  },

  bootstrap: null,
  isOnline: true,
  lastSyncAt: null,
  isLoadingList: false,
  isLoadingMessages: false,

  initialize: ({
    organizationId,
    currentUserId,
    currentUserRole,
    initialContacts,
    initialCounts,
    initialView,
    activeContact,
    activeContactId,
    initialMessages,
    templates,
    teamMembers,
  }) => {
    const contactsMap: Record<string, ContactItem> = {};
    const ids: string[] = [];

    initialContacts.forEach((c) => {
      contactsMap[c.id] = c;
      ids.push(c.id);
    });
    if (activeContact && activeContact.id && !contactsMap[activeContact.id]) {
      contactsMap[activeContact.id] = activeContact;
    }

    const messagesMap: Record<string, MessagesState> = {};
    if (activeContactId && initialMessages && initialMessages.length > 0) {
      messagesMap[activeContactId] = {
        items: initialMessages,
        hasMoreOlder: initialMessages.length >= 40,
        oldestCreatedAt: initialMessages[0]?.created_at,
        syncedAt: Date.now(),
      };
    }

    set((state) => {
      const targetView = initialView || state.activeView || 'por_responder';
      const mergedContactsById = { ...state.contactsById, ...contactsMap };
      return {
        organizationId,
        currentUserId,
        currentUserRole,
        activeView: targetView,
        contactsById: mergedContactsById,
        viewIds: {
          ...state.viewIds,
          [targetView]: sortInboxViewIds(ids, mergedContactsById, targetView, state.filters.sort),
        },
        messagesByContact: { ...state.messagesByContact, ...messagesMap },
        counts: initialCounts,
        activeContactId: activeContactId ?? state.activeContactId,
        bootstrap: state.bootstrap ?? {
          paymentAccounts: [],
          catalog: [],
          quickReplies: [],
          templates: templates || [],
          teamMembers: teamMembers || [],
          loadedAt: Date.now(),
        },
        lastSyncAt: new Date().toISOString(),
      };
    });
  },

  setActiveView: (view) => set({ activeView: view }),
  setFilters: (newFilters) => set((s) => ({ filters: { ...s.filters, ...newFilters } })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveContactId: (id) => set({ activeContactId: id }),

  upsertContact: (contact) => {
    set((state) => {
      const existing = (state.contactsById[contact.id] || {}) as Partial<ContactItem>;
      const updated = { ...existing, ...contact } as ContactItem;
      // Solo reordenar listas si cambió alguna clave de orden (evita O(n log n) por cada evento realtime)
      const sortKeyChanged =
        existing.last_interaction_at !== updated.last_interaction_at ||
        existing.updated_at !== updated.updated_at ||
        existing.waiting_since !== updated.waiting_since ||
        existing.lead_score !== updated.lead_score;
      const nextContactsById = {
        ...state.contactsById,
        [contact.id]: updated,
      };

      // Sincronizar pertenencia exacta y orden WhatsApp Web usando las reglas canónicas
      const currentView = state.activeView;
      const currentIds = state.viewIds[currentView] || [];
      const isAlreadyInView = currentIds.includes(contact.id);
      const nextViewIds = { ...state.viewIds };

      const matchesFilterAndSearch = (() => {
        const f = state.filters;
        if (f.channel === 'whatsapp' && updated.channel === 'instagram') return false;
        if (f.channel === 'instagram' && updated.channel !== 'instagram') return false;
        if (f.agentId === 'unassigned' && updated.assigned_to) return false;
        if (f.agentId !== 'all' && f.agentId !== 'unassigned' && updated.assigned_to !== f.agentId) return false;
        if (f.stage !== 'all' && updated.pipeline_stage !== f.stage) return false;
        if (f.temperature !== 'all') {
          const t =
            updated.lead_temperature || updated.custom_fields?.lead_temperature || updated.custom_fields?.temperature || null;
          if (f.temperature === 'unclassified' && t) return false;
          if (f.temperature !== 'unclassified' && t !== f.temperature) return false;
        }
        const q = (state.searchQuery || '').trim().toLowerCase();
        if (q) {
          const hay = `${updated.name || ''} ${updated.phone || ''} ${updated.instagram_username || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })();

      const matchesCurrentView =
        matchesFilterAndSearch && contactMatchesInboxView(updated, currentView, state.currentUserId);
      if (isAlreadyInView && !matchesCurrentView) {
        nextViewIds[currentView] = currentIds.filter((id) => id !== contact.id);
      } else if (!isAlreadyInView && matchesCurrentView) {
        nextViewIds[currentView] = sortInboxViewIds([contact.id, ...currentIds], nextContactsById, currentView, state.filters.sort);
      } else if (isAlreadyInView && matchesCurrentView && sortKeyChanged) {
        nextViewIds[currentView] = sortInboxViewIds(currentIds, nextContactsById, currentView, state.filters.sort);
      }

      // También sincronizar/ordenar otras vistas en caché cuando el chat cambia de dueño/estado o fecha
      (Object.keys(nextViewIds) as InboxViewType[]).forEach((v) => {
        if (v === currentView) return;
        const ids = nextViewIds[v];
        if (!ids || ids.length === 0) return;
        if (ids.includes(contact.id)) {
          if (!contactMatchesInboxView(updated, v, state.currentUserId)) {
            nextViewIds[v] = ids.filter((id) => id !== contact.id);
          } else if (sortKeyChanged) {
            nextViewIds[v] = sortInboxViewIds(ids, nextContactsById, v, state.filters.sort);
          }
        }
      });

      return {
        contactsById: nextContactsById,
        viewIds: nextViewIds,
      };
    });
  },

  removeContact: (id) => {
    set((state) => {
      const { [id]: _, ...restContacts } = state.contactsById;
      const newViewIds = { ...state.viewIds };
      (Object.keys(newViewIds) as InboxViewType[]).forEach((view) => {
        newViewIds[view] = newViewIds[view].filter((cId) => cId !== id);
      });
      return {
        contactsById: restContacts,
        viewIds: newViewIds,
        activeContactId: state.activeContactId === id ? null : state.activeContactId,
      };
    });
  },

  setViewContacts: (view, contacts, isAppend = false) => {
    set((state) => {
      const newContactsById = { ...state.contactsById };
      const newIds = contacts.map((c) => {
        newContactsById[c.id] = { ...(newContactsById[c.id] || {}), ...c };
        return c.id;
      });

      const currentIds = isAppend ? (state.viewIds[view] || []) : [];
      const sortedMergedIds = sortInboxViewIds([...currentIds, ...newIds], newContactsById, view, state.filters.sort);

      return {
        contactsById: newContactsById,
        viewIds: {
          ...state.viewIds,
          [view]: sortedMergedIds,
        },
      };
    });
  },

  setContactMessages: (contactId, messages, options) => {
    set((state) => {
      const current = state.messagesByContact[contactId]?.items || [];
      let nextItems: MessageItem[];

      if (options?.isPrepend) {
        // Cargar anteriores: deduplicar y anteponer
        const existingIds = new Set(current.map((m) => m.id));
        const filteredNew = messages.filter((m) => !existingIds.has(m.id));
        nextItems = [...filteredNew, ...current];
      } else {
        // Carga fresca o incremental: deduplicar y anexar
        const map = new Map<string, MessageItem>();
        current.forEach((m) => map.set(m.id, m));
        messages.forEach((m) => map.set(m.id, m));
        nextItems = Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      return {
        messagesByContact: {
          ...state.messagesByContact,
          [contactId]: {
            items: nextItems,
            hasMoreOlder: options?.hasMoreOlder ?? (nextItems.length >= 40),
            oldestCreatedAt: nextItems[0]?.created_at,
            syncedAt: Date.now(),
          },
        },
      };
    });
  },

  upsertMessage: (msg) => {
    const contactId = msg.contact_id;
    if (!contactId) return;

    set((state) => {
      const currentMessagesState = state.messagesByContact[contactId];
      const current = currentMessagesState?.items || [];
      const idx = current.findIndex((m) => m.id === msg.id);

      let updatedMessages: MessageItem[];
      if (idx >= 0) {
        // Reemplazar / reconciliar optimista
        updatedMessages = [...current];
        updatedMessages[idx] = { ...updatedMessages[idx], ...msg };
      } else {
        updatedMessages = [...current, msg];
      }

      // Actualizar vista previa del contacto si existe en contactsById
      const existingContact = state.contactsById[contactId];
      let updatedContactsById = state.contactsById;
      const nextViewIds = { ...state.viewIds };

      if (existingContact) {
        const isFromLead = msg.sender_type === 'lead';
        const isCurrentActive = state.activeContactId === contactId;
        const newUnread = isCurrentActive || !isFromLead ? 0 : (existingContact.unread_count || 0) + 1;
        const newConversationStatus = isFromLead
          ? (existingContact.conversation_status === 'closed' ? 'open' : existingContact.conversation_status)
          : (existingContact.conversation_status === 'closed' ? 'closed' : 'waiting_customer');

        const existingMs = existingContact.last_interaction_at ? new Date(existingContact.last_interaction_at).getTime() : 0;
        const msgMs = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();
        const isNewerMsg = msgMs >= existingMs;

        updatedContactsById = {
          ...state.contactsById,
          [contactId]: {
            ...existingContact,
            ...(isNewerMsg
              ? {
                  last_message_preview: msg.content.slice(0, 160),
                  last_message_sender: msg.sender_type,
                  last_interaction_at: msg.created_at,
                }
              : {}),
            unread_count: newUnread,
            waiting_since: isFromLead ? (existingContact.waiting_since || msg.created_at) : null,
            conversation_status: newConversationStatus,
          },
        };

        const currentView = state.activeView;
        const viewList = nextViewIds[currentView] || [];

        const updatedContactItem = updatedContactsById[contactId];
        if (isFromLead) {
          const needsHuman = contactNeedsHumanResponse(updatedContactItem);
          const aiAttending = contactIsAiAttending(updatedContactItem);

          if (viewList.includes(contactId)) {
            nextViewIds[currentView] = sortInboxViewIds(viewList, updatedContactsById, currentView, state.filters.sort);
          } else if (
            (currentView === 'por_responder' && needsHuman) ||
            (currentView === 'ia_atendiendo' && aiAttending) ||
            (currentView === 'mis_abiertos' && updatedContactItem.assigned_to === state.currentUserId)
          ) {
            nextViewIds[currentView] = sortInboxViewIds([contactId, ...viewList], updatedContactsById, currentView, state.filters.sort);
          }
        } else {
          // Si el mensaje es de la IA o de un asesor, ya fue respondido
          if (nextViewIds['por_responder']?.includes(contactId) && updatedContactItem.custom_fields?.unattended_handoff !== true) {
            nextViewIds['por_responder'] = nextViewIds['por_responder'].filter((id) => id !== contactId);
          }
          if (contactIsAiAttending(updatedContactItem) && nextViewIds['ia_atendiendo']) {
            const list = nextViewIds['ia_atendiendo'].includes(contactId)
              ? nextViewIds['ia_atendiendo']
              : [contactId, ...nextViewIds['ia_atendiendo']];
            nextViewIds['ia_atendiendo'] = sortInboxViewIds(list, updatedContactsById, 'ia_atendiendo', state.filters.sort);
          }
          if (viewList.includes(contactId)) {
            nextViewIds[currentView] = sortInboxViewIds(viewList, updatedContactsById, currentView, state.filters.sort);
          }
        }
      }

      return {
        messagesByContact: {
          ...state.messagesByContact,
          [contactId]: {
            items: updatedMessages,
            hasMoreOlder: currentMessagesState?.hasMoreOlder ?? true,
            oldestCreatedAt: updatedMessages[0]?.created_at,
            syncedAt: currentMessagesState?.syncedAt || Date.now(),
          },
        },
        contactsById: updatedContactsById,
        viewIds: nextViewIds,
      };
    });
  },

  updateMessageStatus: (msgId, contactId, status, metaMessageId) => {
    set((state) => {
      const current = state.messagesByContact[contactId]?.items || [];
      const idx = current.findIndex((m) => m.id === msgId || (metaMessageId && m.meta_message_id === metaMessageId));
      if (idx === -1) return state;

      const copy = [...current];
      copy[idx] = {
        ...copy[idx],
        status,
        ...(metaMessageId ? { meta_message_id: metaMessageId } : {}),
      };

      return {
        messagesByContact: {
          ...state.messagesByContact,
          [contactId]: {
            ...state.messagesByContact[contactId],
            items: copy,
          },
        },
      };
    });
  },

  updateMessageReaction: (msgId, contactId, reactions) => {
    set((state) => {
      const current = state.messagesByContact[contactId]?.items || [];
      const idx = current.findIndex((m) => m.id === msgId);
      if (idx === -1) return state;

      const copy = [...current];
      copy[idx] = {
        ...copy[idx],
        reactions,
      };

      return {
        messagesByContact: {
          ...state.messagesByContact,
          [contactId]: {
            ...state.messagesByContact[contactId],
            items: copy,
          },
        },
      };
    });
  },

  setCounts: (counts) => set((s) => ({ counts: { ...s.counts, ...counts } })),
  setBootstrap: (data) =>
    set((s) => ({
      bootstrap: s.bootstrap
        ? { ...s.bootstrap, ...data, loadedAt: Date.now() }
        : {
            paymentAccounts: [],
            catalog: [],
            quickReplies: [],
            templates: [],
            teamMembers: [],
            loadedAt: Date.now(),
            ...data,
          },
    })),
  setOnline: (isOnline) => set({ isOnline }),
  setLastSyncAt: (iso) => set({ lastSyncAt: iso }),
  setLoadingList: (loading) => set({ isLoadingList: loading }),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
}));

// ==============================================================================
// Selectores Finos (Zero Re-render Waste)
// ==============================================================================

export const useActiveContact = () =>
  useInboxStore((s) => (s.activeContactId ? s.contactsById[s.activeContactId] || null : null));

export const useActiveMessages = () =>
  useInboxStore((s) => (s.activeContactId ? s.messagesByContact[s.activeContactId]?.items || [] : []));

export const useContact = (id: string) => useInboxStore((s) => s.contactsById[id] || null);

export const useViewContactIds = (view: InboxViewType) => useInboxStore((s) => s.viewIds[view] || []);

export const useInboxCounts = () => useInboxStore((s) => s.counts);

export const useBootstrap = () => useInboxStore((s) => s.bootstrap);

export const useInboxSyncStatus = () =>
  useInboxStore((s) => ({
    isOnline: s.isOnline,
    lastSyncAt: s.lastSyncAt,
    isLoadingList: s.isLoadingList,
    isLoadingMessages: s.isLoadingMessages,
  }));
