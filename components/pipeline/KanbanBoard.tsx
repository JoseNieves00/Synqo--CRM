'use client';

import React, { useState, useEffect } from 'react';
import { PipelineStage } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { KanbanColumn } from './KanbanColumn';
import { updateLeadStage } from '@/app/actions/pipeline';
import { createClient } from '@/lib/supabase/client';
import { Search, Bot, User, Upload, Settings2, Download, Lock } from 'lucide-react';
import { EditStageLabelsModal } from './EditStageLabelsModal';
import { ImportContactsModal } from './ImportContactsModal';

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
  customStageLabels?: Record<string, string>;
  userRole?: string;
}

export function KanbanBoard({
  initialContacts,
  customStageLabels = {},
  userRole = 'agent',
}: KanbanBoardProps) {
  const [contacts, setContacts] = useState<ContactItem[]>(initialContacts);
  const [search, setSearch] = useState('');
  const [aiFilter, setAiFilter] = useState<'all' | 'ai' | 'human'>('all');
  const [stageLabels, setStageLabels] = useState<Record<string, string>>(customStageLabels);
  const [isEditLabelsOpen, setIsEditLabelsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  useEffect(() => {
    setStageLabels(customStageLabels);
  }, [customStageLabels]);

  const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';
  const isAdmin = userRole === 'admin';

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
      stageLabels[contact.pipeline_stage] || stageLabelMap[contact.pipeline_stage] || contact.pipeline_stage,
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
    <div className="space-y-3.5">
      {/* Barra de herramientas del Kanban */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#131722] p-2.5 rounded-xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 shadow-xs transition-colors">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar prospecto..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {/* Filtros de IA */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-0.5 rounded-lg border border-slate-200 dark:border-[#232A3B]">
            <button
              onClick={() => setAiFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                aiFilter === 'all'
                  ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos ({contacts.length})
            </button>
            <button
              onClick={() => setAiFilter('ai')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'ai'
                  ? 'bg-[#0052FF] text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF]'
              }`}
            >
              <Bot className="w-3 h-3" /> IA
            </button>
            <button
              onClick={() => setAiFilter('human')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                aiFilter === 'human'
                  ? 'bg-[#0052FF] text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-3 h-3" /> Humano
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-[#232A3B] mx-0.5 hidden sm:block" />

          {/* Importar Contactos CSV */}
          {isAdminOrSupervisor && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C]"
              title="Importar contactos masivamente desde archivo CSV / Excel"
            >
              <Upload className="w-3 h-3 text-slate-400" />
              <span>Importar CSV</span>
            </button>
          )}

          {/* Personalizar Nombres de Etapas */}
          {isAdminOrSupervisor && (
            <button
              onClick={() => setIsEditLabelsOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C]"
              title="Personalizar nombres de las 5 columnas del embudo"
            >
              <Settings2 className="w-3 h-3 text-slate-400" />
              <span>Etapas</span>
            </button>
          )}

          {/* Exportar CSV (Blindaje: Solo Admin) */}
          {isAdmin ? (
            <button
              onClick={handleExportCsv}
              disabled={filteredContacts.length === 0}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 bg-slate-50 dark:bg-[#090A0F] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar prospectos visibles a archivo CSV"
            >
              <Download className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Exportar</span>
            </button>
          ) : (
            <span
              className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] flex items-center gap-1 cursor-not-allowed"
              title="La exportación de base de datos está reservada al Administrador por seguridad"
            >
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Exportar</span>
            </span>
          )}
        </div>
      </div>

      {/* Tablero Kanban con Columnas */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
        {PIPELINE_STAGES.map((stage) => {
          const stageContacts = filteredContacts.filter((c) => c.pipeline_stage === stage.id);
          const customLabel = stageLabels[stage.id] || stage.label;
          return (
            <KanbanColumn
              key={stage.id}
              id={stage.id}
              label={customLabel}
              colorClass={stage.color}
              contacts={stageContacts}
              onMoveStage={handleMoveStage}
            />
          );
        })}
      </div>

      {/* Modales */}
      <EditStageLabelsModal
        isOpen={isEditLabelsOpen}
        onClose={() => setIsEditLabelsOpen(false)}
        currentLabels={stageLabels}
        onLabelsUpdated={(newLabels) => setStageLabels(newLabels)}
      />

      <ImportContactsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          // Revalidación se encarga via server action
        }}
      />
    </div>
  );
}
