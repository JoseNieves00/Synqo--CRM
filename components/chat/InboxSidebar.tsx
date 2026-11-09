'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, X, Loader2, Sparkles, CheckCircle2, UserCheck, Archive, Zap } from 'lucide-react';
import { InboxViewType, InboxCounts } from '@/app/actions/chat';
import { InboxViewsTabs } from './InboxViewsTabs';
import { InboxFiltersPopover, InboxActiveFilterChips, FilterState } from './InboxFiltersPopover';
import { ConversationRow, ContactRowData } from './ConversationRow';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface InboxSidebarProps {
  contacts: ContactRowData[];
  counts: InboxCounts;
  activeView: InboxViewType;
  selectedContactId: string | null;
  filters: FilterState;
  searchQuery: string;
  isLoading: boolean;
  hasMore: boolean;
  teamMembers: TeamMember[];
  currentUserId?: string;
  currentUserRole?: string;
  pendingGapsCount?: number;
  onSelectContact: (id: string) => void;
  onChangeView: (view: InboxViewType) => void;
  onChangeSearch: (query: string) => void;
  onChangeFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClearFilters: () => void;
  onRemoveFilterChip: <K extends keyof FilterState>(key: K) => void;
  onLoadMore: () => void;
  onQuickAssign?: (contactId: string) => void;
  onQuickClose?: (contactId: string) => void;
  onQuickSnooze?: (contactId: string) => void;
  onBatchClose?: (contactIds: string[]) => void;
  onBatchAssign?: (contactIds: string[], agentId: string) => void;
  onOpenBatchApology?: (contactIds: string[]) => void;
}

export function InboxSidebar({
  contacts,
  counts,
  activeView,
  selectedContactId,
  filters,
  searchQuery,
  isLoading,
  hasMore,
  teamMembers,
  currentUserId,
  currentUserRole,
  pendingGapsCount = 0,
  onSelectContact,
  onChangeView,
  onChangeSearch,
  onChangeFilter,
  onClearFilters,
  onRemoveFilterChip,
  onLoadMore,
  onQuickAssign,
  onQuickClose,
  onQuickSnooze,
  onBatchClose,
  onBatchAssign,
  onOpenBatchApology,
}: InboxSidebarProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const listContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 74,
    overscan: 6,
  });

  // Mantener el contacto seleccionado visible al navegar con J/K o hacer clic
  useEffect(() => {
    if (!selectedContactId) return;
    const idx = contacts.findIndex((c) => c.id === selectedContactId);
    if (idx >= 0) {
      rowVirtualizer.scrollToIndex(idx, { align: 'auto' });
    }
  }, [selectedContactId]);

  // Mapa de nombres de asesores
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((m) => map.set(m.id, m.full_name));
    return map;
  }, [teamMembers]);

  // Selección individual para acciones en bloque
  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  // Mensaje de bandeja vacía según la vista
  const emptyState = useMemo(() => {
    if (searchQuery.trim()) {
      return {
        title: 'Sin coincidencias',
        subtitle: `No encontramos contactos para "${searchQuery}"`,
      };
    }
    switch (activeView) {
      case 'por_responder':
        return {
          title: '¡Bandeja al día!',
          subtitle: 'No hay mensajes pendientes esperando respuesta.',
        };
      case 'mis_abiertos':
        return {
          title: 'Sin chats asignados',
          subtitle: 'No tienes conversaciones abiertas en este momento.',
        };
      case 'ia_atendiendo':
        return {
          title: 'Sin actividad de IA',
          subtitle: 'No hay leads activos siendo atendidos por la IA.',
        };
      case 'seguimiento':
        return {
          title: 'Sin seguimientos pendientes',
          subtitle: 'No hay recordatorios ni pausas programadas para hoy.',
        };
      case 'cerrados':
        return {
          title: 'Sin conversaciones cerradas',
          subtitle: 'Los chats finalizados aparecerán aquí para consulta.',
        };
      default:
        return {
          title: 'Sin conversaciones',
          subtitle: 'No hay contactos en esta sección.',
        };
    }
  }, [activeView, searchQuery]);

  return (
    <div className="w-full md:w-80 lg:w-96 flex flex-col h-full bg-white dark:bg-[#0D111A] border-r border-slate-200 dark:border-[#232A3B] shrink-0 select-none">
      {/* 1. Barra de Búsqueda y Filtros Popover */}
      <div className="p-3 border-b border-slate-200 dark:border-[#232A3B] space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <InboxFiltersPopover
            filters={filters}
            teamMembers={teamMembers}
            currentUserId={currentUserId}
            onChangeFilter={onChangeFilter}
            onClearFilters={onClearFilters}
          />
        </div>

        {/* 2. Chips de Filtros Activos */}
        <InboxActiveFilterChips
          filters={filters}
          teamMembers={teamMembers}
          onRemoveFilter={onRemoveFilterChip}
        />

        {/* 3. Pestañas de las 5 Bandejas por Estado */}
        <InboxViewsTabs
          activeView={activeView}
          counts={counts}
          onChangeView={onChangeView}
        />
      </div>

      {/* 4. Barra de Acciones en Bloque (Multi-Select) */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-[#0052FF]/15 px-3 py-2 border-b border-blue-200 dark:border-[#00D2FF]/20 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 font-semibold text-[#0052FF] dark:text-[#00D2FF]">
            <span>{selectedIds.size} seleccionados</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="underline text-[11px] font-normal cursor-pointer"
            >
              {selectedIds.size === contacts.length ? 'Deseleccionar' : 'Todos'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenBatchApology && (
              <button
                type="button"
                onClick={() => onOpenBatchApology(Array.from(selectedIds))}
                className="px-2.5 py-1 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
                title="Escribirles automáticamente a los clientes pidiendo disculpas por la demora"
              >
                <Zap className="w-3 h-3" />
                <span>Disculpar demora</span>
              </button>
            )}
            {onBatchClose && (
              <button
                type="button"
                onClick={() => {
                  onBatchClose(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }}
                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Lista Virtualizada de Conversaciones (60 FPS para >2.000 chats) */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300">
              {emptyState.title}
            </h4>
            <p className="text-[11px] leading-relaxed max-w-[200px] mx-auto">
              {emptyState.subtitle}
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const c = contacts[virtualItem.index];
              if (!c) return null;
              return (
                <div
                  key={c.id}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="border-b border-slate-100 dark:border-[#232A3B]/40"
                >
                  <ConversationRow
                    contact={c}
                    isActive={c.id === selectedContactId}
                    isSelected={selectedIds.has(c.id)}
                    isMine={c.assigned_to === currentUserId}
                    assignedUserName={c.assigned_to ? memberMap.get(c.assigned_to) : undefined}
                    onSelect={onSelectContact}
                    onToggleSelect={handleToggleSelect}
                    onQuickAssign={onQuickAssign ? (id, e) => onQuickAssign(id) : undefined}
                    onQuickClose={onQuickClose ? (id, e) => onQuickClose(id) : undefined}
                    onQuickSnooze={onQuickSnooze ? (id, e) => onQuickSnooze(id) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {hasMore && contacts.length > 0 && (
          <div className="p-3 text-center border-t border-slate-100 dark:border-[#232A3B]">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#0052FF]" />
                  <span>Cargando chats...</span>
                </>
              ) : (
                <span>Cargar más conversaciones</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
