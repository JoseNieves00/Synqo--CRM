'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  Bot,
  User,
  Clock,
  AlertCircle,
  Users,
  Shield,
  Zap,
  Sparkles,
} from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import { createClient } from '@/lib/supabase/client';

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: any;
  is_ai_active: boolean;
  last_interaction_at: string;
  assigned_to?: string | null;
  custom_fields?: any;
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
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  pendingGapsCount = 0,
}: InboxViewProps) {
  const router = useRouter();
  const [contactList, setContactList] = useState<ContactItem[]>(contacts);
  const [messageList, setMessageList] = useState<MessageItem[]>(messages);
  const [search, setSearch] = useState('');

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'supervisor';

  // Pestañas principales de trabajo:
  // Para Agente: por defecto 'mine' (Mis Chats)
  // Para Admin: por defecto 'all' (Todos los chats)
  const [activeTab, setActiveTab] = useState<'mine' | 'unassigned' | 'all'>(
    isAdmin ? 'all' : 'mine'
  );

  // Filtro secundario de IA / Humano
  const [aiFilter, setAiFilter] = useState<'all' | 'ai' | 'human'>('all');

  // Filtro por agente específico (solo visible para Admins y Supervisores)
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');

  useEffect(() => {
    setContactList(contacts);
  }, [contacts]);

  useEffect(() => {
    setMessageList(messages);
  }, [messages]);

  // Polling inteligente cada 4 segundos cuando la pestaña está en primer plano
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        router.refresh();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [router]);

  // Suscripción Realtime a cambios en contactos y mensajes
  useEffect(() => {
    const supabase = createClient();

    const contactsChannel = supabase
      .channel('inbox-contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ContactItem;
            setContactList((prev) =>
              prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            );
          } else {
            router.refresh();
          }
        }
      )
      .subscribe();

    let messagesChannel: any = null;
    if (activeContact?.id) {
      messagesChannel = supabase
        .channel(`inbox-messages-${activeContact.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `contact_id=eq.${activeContact.id}`,
          },
          (payload) => {
            const newMsg = payload.new as MessageItem;
            setMessageList((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(contactsChannel);
      if (messagesChannel) supabase.removeChannel(messagesChannel);
    };
  }, [activeContact?.id, router]);

  // Contadores para badges
  const unassignedCount = contactList.filter((c) => !c.assigned_to).length;
  const myChatsCount = contactList.filter((c) => c.assigned_to === currentUserId).length;

  // Filtrado compuesto
  const filteredContacts = contactList.filter((c) => {
    // 1. Búsqueda por texto (nombre o teléfono)
    const matchesSearch =
      (c.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      c.phone.includes(search);

    if (!matchesSearch) return false;

    // 2. Filtro de pestaña principal
    if (activeTab === 'mine') {
      if (c.assigned_to !== currentUserId) return false;
    } else if (activeTab === 'unassigned') {
      if (c.assigned_to) return false;
    }

    // 3. Filtro por agente específico (Admin)
    if (isAdmin && selectedAgentFilter !== 'all') {
      if (selectedAgentFilter === 'unassigned') {
        if (c.assigned_to) return false;
      } else {
        if (c.assigned_to !== selectedAgentFilter) return false;
      }
    }

    // 4. Filtro por estado de IA
    if (aiFilter === 'ai') return c.is_ai_active;
    if (aiFilter === 'human') return !c.is_ai_active;

    return true;
  });

  return (
    <div className="flex h-[calc(100vh-125px)] gap-4 overflow-hidden">
      {/* Columna Izquierda: Directorio de Leads */}
      <div className="w-80 md:w-96 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col shadow-sm flex-shrink-0">
        {/* Cabecera del Directorio */}
        <div className="p-4 border-b border-gray-200 bg-gray-50/70 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                Inbox Multi-Agente
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {contactList.length} conversaciones registradas
              </p>
            </div>
            <NewLeadModal buttonLabel="+" className="px-2.5 py-1 text-xs" />
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            />
          </div>

          {/* Recordatorio Activo de Vacíos de Conocimiento en la IA */}
          {pendingGapsCount > 0 && (
            <Link
              href="/settings"
              className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 text-xs hover:border-amber-400 transition group shadow-2xs"
              title="Entrenar IA con las dudas recientes de tus clientes"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse flex-shrink-0" />
                <span className="font-bold text-[11px] truncate">
                  {pendingGapsCount === 1 ? '1 duda sin respuesta de IA' : `${pendingGapsCount} dudas sin respuesta de IA`}
                </span>
              </div>
              <span className="text-[10px] font-bold text-amber-700 group-hover:underline flex-shrink-0">
                Entrenar →
              </span>
            </Link>
          )}

          {/* Pestañas de Asignación */}
          <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl text-xs font-semibold">
            {isAdmin ? (
              <>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Todos ({contactList.length})
                </button>
                <button
                  onClick={() => setActiveTab('unassigned')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeTab === 'unassigned'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Por Asignar
                  {unassignedCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                      {unassignedCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('mine')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                    activeTab === 'mine'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mis Chats ({myChatsCount})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('mine')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                    activeTab === 'mine'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mis Chats ({myChatsCount})
                </button>
                <button
                  onClick={() => setActiveTab('unassigned')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer flex items-center justify-center gap-1 ${
                    activeTab === 'unassigned'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Sin Asignar
                  {unassignedCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                      {unassignedCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1 rounded-lg text-center transition cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
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
                className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">👥 Filtrar por Agente: Todos</option>
                <option value="unassigned">⚠️ Solo Sin Asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    👤 {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtros rápidos IA / Humano */}
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
            <button
              onClick={() => setAiFilter('all')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                aiFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setAiFilter('ai')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'ai' ? 'bg-[#0052FF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Bot className="w-3 h-3" /> IA
            </button>
            <button
              onClick={() => setAiFilter('human')}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'human' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <User className="w-3 h-3" /> Humano
            </button>
          </div>
        </div>

        {/* Lista de Chats con Scroll */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              No hay conversaciones en esta sección.
            </div>
          ) : (
            filteredContacts.map((c) => {
              const isActive = activeContact?.id === c.id;
              const isMine = c.assigned_to === currentUserId;
              const assignedUser = teamMembers.find((m) => m.id === c.assigned_to);

              const dateStr = new Date(c.last_interaction_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <Link
                  key={c.id}
                  href={`/inbox/${c.id}`}
                  className={`p-3 block transition cursor-pointer ${
                    isActive
                      ? 'bg-[#0052FF]/5 border-l-4 border-l-[#0052FF]'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Fila 1: Nombre y Hora */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-gray-900 truncate mr-2">
                      {c.name || 'Prospecto sin nombre'}
                    </span>
                    <span suppressHydrationWarning className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                      {dateStr}
                    </span>
                  </div>

                  {/* Fila 2: Teléfono y Estado IA */}
                  <div className="flex items-center justify-between text-xs text-gray-500 font-mono mb-1.5">
                    <span className="text-[11px]">{c.phone}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase font-sans ${
                        c.is_ai_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.is_ai_active ? 'IA' : 'HUMANO'}
                    </span>
                  </div>

                  {/* Fila 3: Pipeline Stage & Chip de Asignación */}
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {c.pipeline_stage}
                    </span>

                    {/* Chip de Agente Asignado */}
                    {c.assigned_to ? (
                      <span
                        className={`font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          isMine
                            ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <User className="w-2.5 h-2.5" />
                        {isMine ? 'Tú' : assignedUser?.full_name || 'Asignado'}
                      </span>
                    ) : (
                      <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5 text-amber-500" />
                        Sin Asignar
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Columna Derecha: Ventana de Chat */}
      <div className="flex-1 min-w-0 h-full">
        {activeContact ? (
          <ChatWindow
            key={activeContact.id}
            contact={contactList.find((c) => c.id === activeContact.id) || activeContact}
            messages={messageList}
            onOptimisticMessage={(msg) => setMessageList((prev) => [...prev, msg])}
            customTemplates={customTemplates}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            teamMembers={teamMembers}
          />
        ) : (
          <div className="h-full bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center p-8 text-center shadow-sm">
            <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
            <h3 className="font-bold text-base text-gray-900">Selecciona una conversación</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              Elige un contacto del panel izquierdo para revisar los mensajes enviados por el prospecto, la IA y los agentes humanos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
