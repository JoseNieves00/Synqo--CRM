'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  CreditCard,
  Package,
  Calendar,
  Bot,
  User,
  ArrowRight,
  Flame,
  MessageSquare,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { useInboxStore, InboxViewType } from '@/lib/inbox/use-inbox-store';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'chat' | 'navigation' | 'sales' | 'ai';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  perform: () => void;
  disabled?: boolean;
}

interface InboxCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeContactId: string | null;
  onSelectView: (view: InboxViewType) => void;
  onOpenCloseChatModal?: (resolution?: 'won' | 'lost' | 'completed') => void;
  onOpenScheduleReminder?: () => void;
  onOpenSendTemplate?: () => void;
  onToggleAi?: (activate: boolean) => void;
  onInsertPaymentAccounts?: () => void;
  onRequestAiDraft?: () => void;
  onNextChat?: () => void;
  onPrevChat?: () => void;
}

export function InboxCommandPalette({
  isOpen,
  onClose,
  activeContactId,
  onSelectView,
  onOpenCloseChatModal,
  onOpenScheduleReminder,
  onOpenSendTemplate,
  onToggleAi,
  onInsertPaymentAccounts,
  onRequestAiDraft,
  onNextChat,
  onPrevChat,
}: InboxCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const activeContact = useInboxStore(
    (s) => (activeContactId ? s.contactsById[activeContactId] : null)
  );

  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    // Comandos de Chat Activo
    if (activeContactId && activeContact) {
      list.push(
        {
          id: 'chat-close-won',
          title: 'Dar Fin: Venta Ganada',
          subtitle: `Cerrar chat con ${activeContact.name || activeContact.phone} y registrar venta`,
          category: 'chat',
          icon: CheckCircle2,
          shortcut: '⌘+E',
          perform: () => onOpenCloseChatModal?.('won'),
        },
        {
          id: 'chat-close-completed',
          title: 'Dar Fin: Atención Completada',
          subtitle: 'Finalizar atención regular',
          category: 'chat',
          icon: CheckCircle2,
          perform: () => onOpenCloseChatModal?.('completed'),
        },
        {
          id: 'chat-close-lost',
          title: 'Dar Fin: No Concretado / Perdido',
          subtitle: 'Marcar conversación como perdida',
          category: 'chat',
          icon: XCircle,
          perform: () => onOpenCloseChatModal?.('lost'),
        },
        {
          id: 'chat-copilot-draft',
          title: 'Redactar con Copiloto IA',
          subtitle: 'Generar respuesta sugerida según el contexto',
          category: 'ai',
          icon: Sparkles,
          shortcut: '⌘+J',
          perform: () => onRequestAiDraft?.(),
        },
        {
          id: 'chat-toggle-ai',
          title: activeContact.is_ai_active ? 'Pausar IA (Control Manual)' : 'Reactivar IA',
          subtitle: activeContact.is_ai_active
            ? 'Tomar control como asesor humano'
            : 'Permitir que la IA responda automáticamente',
          category: 'ai',
          icon: Bot,
          shortcut: 'A',
          perform: () => onToggleAi?.(!activeContact.is_ai_active),
        },
        {
          id: 'chat-schedule-reminder',
          title: 'Agendar Recordatorio Comercial',
          subtitle: 'Programar llamada, cotización o seguimiento',
          category: 'sales',
          icon: Calendar,
          perform: () => onOpenScheduleReminder?.(),
        },
        {
          id: 'chat-send-template',
          title: 'Enviar Plantilla Oficial de WhatsApp',
          subtitle: 'Re-activar ventana de 24h con plantilla aprobada',
          category: 'chat',
          icon: FileText,
          perform: () => onOpenSendTemplate?.(),
        },
        {
          id: 'chat-insert-payment',
          title: 'Insertar Cuentas Bancarias',
          subtitle: 'Bancolombia, Nequi, Daviplata configuradas',
          category: 'sales',
          icon: CreditCard,
          perform: () => onInsertPaymentAccounts?.(),
        }
      );
    }

    // Comandos de Navegación entre Bandejas
    list.push(
      {
        id: 'nav-por-responder',
        title: 'Ir a: Por Responder',
        subtitle: 'Cola de SLA crítico y mensajes sin contestar',
        category: 'navigation',
        icon: Flame,
        perform: () => onSelectView('por_responder'),
      },
      {
        id: 'nav-mis-abiertos',
        title: 'Ir a: Mis Chats Abiertos',
        subtitle: 'Conversaciones asignadas directamente a ti',
        category: 'navigation',
        icon: User,
        perform: () => onSelectView('mis_abiertos'),
      },
      {
        id: 'nav-seguimiento',
        title: 'Ir a: En Seguimiento',
        subtitle: 'Recordatorios comerciales y prospectos pausados',
        category: 'navigation',
        icon: Clock,
        perform: () => onSelectView('seguimiento'),
      },
      {
        id: 'nav-ia-atendiendo',
        title: 'Ir a: IA Atendiendo',
        subtitle: 'Chats donde el agente IA está interactuando',
        category: 'navigation',
        icon: Bot,
        perform: () => onSelectView('ia_atendiendo'),
      },
      {
        id: 'nav-cerrados',
        title: 'Ir a: Historial Cerrados',
        subtitle: 'Conversaciones archivadas y resueltas',
        category: 'navigation',
        icon: MessageSquare,
        perform: () => onSelectView('cerrados'),
      },
      {
        id: 'nav-next-chat',
        title: 'Siguiente Chat en Cola',
        subtitle: 'Avanzar al siguiente prospecto de la lista',
        category: 'navigation',
        icon: ArrowRight,
        shortcut: 'J',
        perform: () => onNextChat?.(),
      },
      {
        id: 'nav-prev-chat',
        title: 'Chat Anterior en Cola',
        subtitle: 'Retroceder al prospecto previo de la lista',
        category: 'navigation',
        icon: ArrowRight,
        shortcut: 'K',
        perform: () => onPrevChat?.(),
      }
    );

    return list;
  }, [
    activeContactId,
    activeContact,
    onOpenCloseChatModal,
    onRequestAiDraft,
    onToggleAi,
    onOpenScheduleReminder,
    onOpenSendTemplate,
    onInsertPaymentAccounts,
    onSelectView,
    onNextChat,
    onPrevChat,
  ]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q))
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filteredCommands.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected && !selected.disabled) {
        onClose();
        selected.perform();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-xs flex items-start justify-center pt-24 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input de Búsqueda */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]/50">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando o busca una acción comercial (⌘K)..."
            className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-[#1E2433] text-slate-500 rounded border border-slate-200 dark:border-[#2A3447]">
            ESC
          </kbd>
        </div>

        {/* Lista de Comandos */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
              No se encontraron comandos para &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    cmd.perform();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF]'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-[#0052FF] text-white'
                          : 'bg-slate-100 dark:bg-[#1E2433] text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        <span>{cmd.title}</span>
                      </div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {cmd.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-[#1E2433] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#2A3447]">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer con Ayuda de Atajos */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#0E121B] border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Navegar</span>
            <span>↵ Ejecutar</span>
            <span>ESC Salir</span>
          </div>
          <span className="font-semibold text-[#0052FF] dark:text-[#00D2FF]">Synqo Velocity</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
