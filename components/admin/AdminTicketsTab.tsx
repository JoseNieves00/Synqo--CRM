'use client';

import React, { useState } from 'react';
import {
  LifeBuoy,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Loader2,
  Image as ImageIcon,
  Check,
  ChevronDown,
} from 'lucide-react';
import { updateTicketStatus, listAllTicketsForAdmin } from '@/app/actions/support';
import { TicketCategory, TicketPriority, TicketStatus } from '@/lib/supabase/types';

interface AdminTicketsTabProps {
  initialTickets: any[];
}

export function AdminTicketsTab({ initialTickets }: AdminTicketsTabProps) {
  const [tickets, setTickets] = useState<any[]>(initialTickets);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const refreshTickets = async (status = statusFilter, category = categoryFilter) => {
    setLoading(true);
    try {
      const data = await listAllTicketsForAdmin({
        status,
        category,
      });
      setTickets(data);
    } catch (err) {
      console.warn('[REFRESH TICKETS ERROR]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    setUpdatingId(ticketId);
    try {
      await updateTicketStatus(ticketId, newStatus);
      // Actualizar optimistamente
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );
    } catch (err: any) {
      alert(`Error al cambiar estado: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const orgName = t.organizations?.name?.toLowerCase() || '';
    const title = t.title?.toLowerCase() || '';
    const desc = t.description?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();
    return orgName.includes(q) || title.includes(q) || desc.includes(q);
  });

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Tarjetas de Métricas de Soporte */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-1">
            Total Tickets
          </span>
          <div className="text-xl sm:text-2xl font-black text-gray-900">{tickets.length}</div>
        </div>

        <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-xs ${openCount > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-amber-900">
              Abiertos
            </span>
            {openCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </div>
          <div className={`text-xl sm:text-2xl font-black ${openCount > 0 ? 'text-amber-950' : 'text-gray-900'}`}>{openCount}</div>
        </div>

        <div className="p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-blue-600 block mb-1">
            En Revisión (Dev)
          </span>
          <div className="text-xl sm:text-2xl font-black text-blue-900">{inProgressCount}</div>
        </div>

        <div className="p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-600 block mb-1">
            Resueltos GitHub
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-900">{resolvedCount}</div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Filtro de Estado con scroll horizontal suave */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto scrollbar-none whitespace-nowrap">
            {[
              { id: 'open', label: 'Abiertos' },
              { id: 'in_progress', label: 'En Progreso' },
              { id: 'resolved', label: 'Resueltos' },
              { id: 'all', label: 'Todos' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  refreshTickets(tab.id, categoryFilter);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer flex-shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-gray-900 shadow-xs font-bold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro de Categoría */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              refreshTickets(statusFilter, e.target.value);
            }}
            className="w-full sm:w-auto border border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-700 bg-white font-medium focus:ring-2 focus:ring-black"
          >
            <option value="all">Todas las Categorías</option>
            <option value="whatsapp">Meta WhatsApp API</option>
            <option value="ai_assistant">Inteligencia Artificial</option>
            <option value="calendar">Agenda y Citas</option>
            <option value="billing">Facturación</option>
            <option value="bug">Bugs del Sistema</option>
            <option value="feature_request">Nuevas Funciones</option>
          </select>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por empresa o título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-black bg-white"
          />
        </div>
      </div>

      {/* Lista de Tickets */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#0052FF]" />
            <span className="text-xs">Sincronizando tickets con GitHub...</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-gray-800">Cero Incidencias Pendientes</h4>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              No hay tickets en este estado. Todos los reportes han sido atendidos por el equipo de desarrollo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredTickets.map((ticket) => {
              const isUpdating = updatingId === ticket.id;
              const orgName = ticket.organizations?.name || 'Empresa Desconocida';
              const reporterName = ticket.profiles?.full_name || ticket.profiles?.email || 'Usuario';

              return (
                <div key={ticket.id} className="p-3.5 sm:p-5 hover:bg-slate-50/70 transition space-y-2.5 sm:space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                      <span className="font-bold text-[11px] sm:text-xs text-gray-900 bg-slate-100 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg font-mono">
                        {orgName}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs font-semibold text-gray-700">{reporterName}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-[10px] sm:text-[11px] text-gray-400">
                        {new Date(ticket.created_at).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {/* Categoría Badge */}
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {ticket.category}
                      </span>

                      {/* Prioridad Badge */}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          ticket.priority === 'critical'
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : ticket.priority === 'high'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {ticket.priority}
                      </span>

                      {/* Enlace directo a GitHub Issue */}
                      {ticket.github_issue_url ? (
                        <a
                          href={ticket.github_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-[#090A0F] text-white hover:bg-black transition cursor-pointer shadow-2xs"
                          title="Abrir incidencia en GitHub"
                        >
                          <span>Issue #{ticket.github_issue_number}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-mono">Sin GitHub</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900">{ticket.title}</h4>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-line">
                      {ticket.description}
                    </p>
                  </div>

                  {/* Acciones y Metadatos Rápidos */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-gray-500">
                      {ticket.screenshot_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(ticket.screenshot_url)}
                          className="inline-flex items-center gap-1 text-[#0052FF] font-semibold hover:underline cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Ver Captura Adjunta</span>
                        </button>
                      )}
                      {ticket.system_metadata?.currentUrl && (
                        <span className="truncate max-w-[200px] sm:max-w-xs text-gray-400 font-mono">
                          URL: {ticket.system_metadata.currentUrl.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                      <span className="text-[11px] font-medium text-gray-400">Estado:</span>
                      <select
                        disabled={isUpdating}
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(ticket.id, e.target.value as TicketStatus)}
                        className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border transition cursor-pointer disabled:opacity-50 w-auto ${
                          ticket.status === 'resolved' || ticket.status === 'closed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : ticket.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-amber-50 text-amber-900 border-amber-300'
                        }`}
                      >
                        <option value="open">Abierto (Pendiente)</option>
                        <option value="in_progress">En Progreso (Dev)</option>
                        <option value="resolved">Resuelto ✅ (Cierra Issue)</option>
                        <option value="closed">Cerrado Definitivo</option>
                      </select>
                      {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para visualizar captura de pantalla */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-900">Captura de Pantalla del Reporte</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-xs text-gray-500 hover:text-black font-bold cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewImage} alt="Captura del problema" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

