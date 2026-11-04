'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  Bot,
  User,
  Sparkles,
  Download,
} from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { createClient } from '@/lib/supabase/client';
import { getUnattendedHandoffs, getContactMessages } from '@/app/actions/chat';
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
}

interface MessageItem {
  id: string;
  sender_type: any;
  content: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface InboxViewProps {
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

  // Contacto activo y caché de mensajes local para transiciones 0ms ultra-suaves
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    activeContact?.id || (contacts.length > 0 ? contacts[0].id : null)
  );
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
  }, [selectedContactId]);

  // Actualizar datos del contacto de forma reactiva local (IA toggle, reasignación, etc.)
  const handleContactUpdate = useCallback((updatedFields: Partial<ContactItem>) => {
    if (!selectedContactId) return;
    setContactList((prev) =>
      prev.map((c) => (c.id === selectedContactId ? { ...c, ...updatedFields } : c))
    );
  }, [selectedContactId]);

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
  // Para Agente: por defecto 'mine' (Mis Chats)
  // Para Admin: por defecto 'all' (Todos los chats)
  const [activeTab, setActiveTab] = useState<'mine' | 'unassigned' | 'all'>(
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
            const updated = [...current, newMsg];
            messagesCacheRef.current[selectedContactId] = updated;
            setMessagesCache((prev) => ({
              ...prev,
              [selectedContactId]: updated,
            }));
          }

          // Actualizar hora de interacción en la columna izquierda
          setContactList((prev) =>
            prev.map((c) =>
              c.id === selectedContactId
                ? { ...c, last_interaction_at: newMsg.created_at }
                : c
            )
          );
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
            if (!inserted.deleted_at) {
              setContactList((prev) => [inserted, ...prev]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Conteo de chats por pestañas
  const myChatsCount = contactList.filter((c) => c.assigned_to === currentUserId).length;
  const unassignedCount = contactList.filter((c) => !c.assigned_to).length;

  // Filtrado compuesto
  const filteredContacts = contactList.filter((c) => {
    // 1. Filtro de búsqueda por texto
    const q = search.toLowerCase();
    const matchesSearch =
      (c.name?.toLowerCase() || '').includes(q) ||
      c.phone.includes(q) ||
      (c.instagram_username?.toLowerCase() || '').includes(q);

    if (!matchesSearch) return false;

    // 2. Filtro por canal omnicanal
    if (channelFilter === 'whatsapp') {
      if (c.channel === 'instagram') return false;
    } else if (channelFilter === 'instagram') {
      if (c.channel !== 'instagram') return false;
    }

    // 3. Filtro por Pestaña de Asignación
    if (activeTab === 'mine') {
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
      <div className="w-80 md:w-96 bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden flex flex-col flex-shrink-0 text-slate-900 dark:text-slate-100 shadow-xs transition-colors">
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

          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#232A3B] focus:outline-none focus:ring-1 focus:ring-[#0052FF] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
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

          {/* Recordatorio de Preguntas Frecuentes Pendientes */}
          {pendingGapsCount > 0 && (
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

          {/* Pestañas de Asignación */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-0.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-xs font-medium">
            {isAdmin ? (
              <>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Todos ({contactList.length})
                </button>
                <button
                  onClick={() => setActiveTab('unassigned')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeTab === 'unassigned'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Por Asignar
                  {unassignedCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 rounded-full text-[10px] font-mono font-bold">
                      {unassignedCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('mine')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
                    activeTab === 'mine'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Mis Chats ({myChatsCount})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('mine')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
                    activeTab === 'mine'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Mis Chats ({myChatsCount})
                </button>
                <button
                  onClick={() => setActiveTab('unassigned')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeTab === 'unassigned'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
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
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Todos
                </button>
              </>
            )}
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
            filteredContacts.map((c) => {
              const isActive = selectedContactId === c.id;
              const isMine = c.assigned_to === currentUserId;
              const assignedUser = teamMembers.find((m) => m.id === c.assigned_to);
              const isUnattended = unattendedIds.has(c.id);

              const dateStr = new Date(c.last_interaction_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <a
                  key={c.id}
                  href={`/inbox/${c.id}`}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && e.button === 0) {
                      e.preventDefault();
                      handleSelectContact(c.id);
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
                  {/* Badge de Atención Pendiente */}
                  {isUnattended && (
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse" />
                        Pendiente de atención
                      </span>
                      <span className="text-[10px] text-rose-700 dark:text-rose-300 shrink-0 font-medium">Requiere asesor</span>
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

                  {/* Fila 2: Canal, Identificador y Estado IA */}
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

                  {/* Fila 3: Pipeline Stage & Chip de Asignación */}
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-mono uppercase bg-slate-100 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] px-1.5 py-0.5 rounded">
                      {c.pipeline_stage}
                    </span>

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
                        {isMine ? 'Tú' : assignedUser?.full_name || 'Asignado'}
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
            })
          )}
        </div>
      </div>

      {/* Columna Derecha: Ventana de Chat */}
      <div className="flex-1 min-w-0 h-full">
        {currentActiveContact ? (
          <ChatWindow
            key={currentActiveContact.id}
            contact={currentActiveContact}
            messages={currentMessages}
            isLoadingMessages={isLoadingMessages && currentMessages.length === 0}
            onOptimisticMessage={handleOptimisticMessage}
            onContactUpdate={handleContactUpdate}
            customTemplates={customTemplates}
            whatsappProvider={whatsappProvider}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            teamMembers={teamMembers}
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
