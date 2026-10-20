'use client';

import React, { useState, useEffect } from 'react';
import { PipelineStage } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { KanbanColumn } from './KanbanColumn';
import { updateLeadStage } from '@/app/actions/pipeline';
import { createClient } from '@/lib/supabase/client';
import { Search, Bot, User, Filter, Download } from 'lucide-react';

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  pipeline_stage: PipelineStage;
  is_ai_active: boolean;
  last_interaction_at: string;
}

interface KanbanBoardProps {
  initialContacts: ContactItem[];
}

export function KanbanBoard({ initialContacts }: KanbanBoardProps) {
  const [contacts, setContacts] = useState<ContactItem[]>(initialContacts);
  const [search, setSearch] = useState('');
  const [aiFilter, setAiFilter] = useState<'all' | 'ai' | 'human'>('all');

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  // Sincronización Realtime con Supabase
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('kanban-contacts-live')
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
            setContacts((prev) =>
              prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            );
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as ContactItem;
            setContacts((prev) => [inserted, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string };
            setContacts((prev) => prev.filter((c) => c.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleMoveStage = async (contactId: string, newStage: PipelineStage) => {
    // Actualización optimista de la UI
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: newStage } : c))
    );

    try {
      await updateLeadStage(contactId, newStage);
    } catch (error) {
      console.error('Error al actualizar fase en servidor:', error);
      // Revertir estado si falla
      setContacts(initialContacts);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      (c.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      c.phone.includes(search);

    if (!matchesSearch) return false;

    if (aiFilter === 'ai') return c.is_ai_active;
    if (aiFilter === 'human') return !c.is_ai_active;
    return true;
  });

  const handleExportCsv = () => {
    if (filteredContacts.length === 0) return;

    const stageLabelMap: Record<string, string> = {
      nuevo: 'Nuevo Lead',
      calificado: 'Calificado',
      cita_agendada: 'Cita Agendada',
      ganado: 'Ganado / Cerrado',
      perdido: 'Perdido / Descarte',
    };

    const headers = ['Nombre', 'WhatsApp / Teléfono', 'Etapa Pipeline', 'Control', 'Última Interacción'];

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const rows = filteredContacts.map((contact) => [
      contact.name || 'Sin nombre',
      contact.phone,
      stageLabelMap[contact.pipeline_stage] || contact.pipeline_stage,
      contact.is_ai_active ? 'IA Activa' : 'Asesor Humano',
      contact.last_interaction_at ? new Date(contact.last_interaction_at).toLocaleString('es-ES') : 'N/A',
    ]);

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\r\n');

    // \uFEFF BOM para compatibilidad total con Microsoft Excel en español (tildes y ñ)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `leads-synqo-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Barra de herramientas del Kanban */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar prospecto en el pipeline..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-400 text-[11px] font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filtrar:
          </span>
          <button
            onClick={() => setAiFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              aiFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({contacts.length})
          </button>
          <button
            onClick={() => setAiFilter('ai')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              aiFilter === 'ai'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Bot className="w-3 h-3" /> IA Activa
          </button>
          <button
            onClick={() => setAiFilter('human')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              aiFilter === 'human'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <User className="w-3 h-3" /> Humano
          </button>

          <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block" />

          <button
            onClick={handleExportCsv}
            disabled={filteredContacts.length === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            title="Exportar prospectos visibles a archivo CSV compatible con Excel"
          >
            <Download className="w-3 h-3 text-emerald-600" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tablero Kanban con Columnas */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
        {PIPELINE_STAGES.map((stage) => {
          const stageContacts = filteredContacts.filter((c) => c.pipeline_stage === stage.id);
          return (
            <KanbanColumn
              key={stage.id}
              id={stage.id}
              label={stage.label}
              colorClass={stage.color}
              contacts={stageContacts}
              onMoveStage={handleMoveStage}
            />
          );
        })}
      </div>
    </div>
  );
}

