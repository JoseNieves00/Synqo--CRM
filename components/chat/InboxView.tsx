'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Plus, Phone, Bot, User, Clock } from 'lucide-react';
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
  custom_fields?: any;
}

interface MessageItem {
  id: string;
  sender_type: any;
  content: string;
  created_at: string;
}

interface InboxViewProps {
  contacts: ContactItem[];
  activeContact: ContactItem | null;
  messages: MessageItem[];
}

export function InboxView({
  contacts,
  activeContact,
  messages,
}: InboxViewProps) {
  const router = useRouter();
  const [contactList, setContactList] = useState<ContactItem[]>(contacts);
  const [messageList, setMessageList] = useState<MessageItem[]>(messages);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ai' | 'human'>('all');

  useEffect(() => {
    setContactList(contacts);
  }, [contacts]);

  useEffect(() => {
    setMessageList(messages);
  }, [messages]);

  // Suscripción Realtime a mensajes entrantes y cambios de contacto
  useEffect(() => {
    if (!activeContact?.id) return;
    const supabase = createClient();

    const channel = supabase
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts',
        },
        (payload) => {
          const updated = payload.new as ContactItem;
          setContactList((prev) =>
            prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeContact?.id]);

  const filteredContacts = contactList.filter((c) => {
    const matchesSearch =
      (c.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      c.phone.includes(search);

    if (!matchesSearch) return false;

    if (filter === 'ai') return c.is_ai_active;
    if (filter === 'human') return !c.is_ai_active;
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-125px)] gap-4 overflow-hidden">
      {/* Columna Izquierda: Directorio de Leads */}
      <div className="w-80 md:w-96 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col shadow-sm flex-shrink-0">
        {/* Cabecera del Directorio */}
        <div className="p-4 border-b border-gray-200 bg-gray-50/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                Conversaciones WhatsApp
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {contacts.length} leads registrados
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
              placeholder="Buscar por nombre o celular..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            />
          </div>

          {/* Filtros rápidos */}
          <div className="flex items-center gap-1.5 pt-1 text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({contacts.length})
            </button>
            <button
              onClick={() => setFilter('ai')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                filter === 'ai'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Bot className="w-3 h-3" /> IA
            </button>
            <button
              onClick={() => setFilter('human')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                filter === 'human'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              No hay conversaciones que coincidan con la búsqueda.
            </div>
          ) : (
            filteredContacts.map((c) => {
              const isActive = activeContact?.id === c.id;
              const dateStr = new Date(c.last_interaction_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <Link
                  key={c.id}
                  href={`/inbox/${c.id}`}
                  className={`p-3.5 block transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-gray-900 truncate mr-2">
                      {c.name || 'Prospecto sin nombre'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                      {dateStr}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 font-mono mb-1.5">
                    <span className="text-[11px]">{c.phone}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-sans ${
                        c.is_ai_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.is_ai_active ? 'IA' : 'HUMANO'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {c.pipeline_stage}
                    </span>
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
            contact={contactList.find((c) => c.id === activeContact.id) || activeContact}
            messages={messageList}
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

