'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LifeBuoy,
  X,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  ExternalLink,
  MessageSquare,
  Clock,
  Bug,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { createSupportTicket, listMyTickets } from '@/app/actions/support';
import { askClientCopilot } from '@/app/actions/client-copilot';
import { TicketCategory, TicketPriority } from '@/lib/supabase/types';

export function SupportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'copilot' | 'report' | 'history'>('copilot');

  // Estado del Copilot de Ayuda
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy tu asistente de soporte de Synqo. ¿En qué puedo ayudarte hoy? Puedes preguntarme sobre la conexión de WhatsApp, la ventana de 24 horas, la agenda y citas o reportar una falla técnica.',
    },
  ]);

  // Estado del Formulario de Reporte de Falla
  const [category, setCategory] = useState<TicketCategory>('whatsapp');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    issueUrl?: string | null;
  } | null>(null);

  // Estado de Mis Tickets
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Soporte para pegar capturas de pantalla con Ctrl+V / Cmd+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || activeTab !== 'report') return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setScreenshotData(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, activeTab]);

  // Cargar tickets cuando se abre la pestaña de historial
  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      setLoadingTickets(true);
      listMyTickets()
        .then((res) => setMyTickets(res))
        .finally(() => setLoadingTickets(false));
    }
  }, [isOpen, activeTab]);

  const handleAskCopilot = async (overrideQuery?: string) => {
    const q = overrideQuery || copilotQuery;
    if (!q.trim() || copilotLoading) return;

    const userMsg = { role: 'user' as const, content: q };
    setCopilotMessages((prev) => [...prev, userMsg]);
    setCopilotQuery('');
    setCopilotLoading(true);

    try {
      const res = await askClientCopilot(q, copilotMessages);
      setCopilotMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.answer || 'Sin respuesta.' },
      ]);
    } catch {
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error al consultar el asistente. Puedes crear un ticket técnico con un desarrollador.',
        },
      ]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmittingTicket(true);
    setTicketFeedback(null);

    const systemMetadata = {
      currentUrl: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    };

    try {
      const res = await createSupportTicket({
        title,
        description,
        category,
        priority,
        screenshotUrl: screenshotData,
        systemMetadata,
      });

      setTicketFeedback({
        type: 'success',
        message: res.message || 'Ticket creado y enviado a desarrollo.',
        issueUrl: res.githubIssueUrl,
      });

      // Limpiar formulario tras éxito
      setTitle('');
      setDescription('');
      setScreenshotData(null);
    } catch (err: any) {
      setTicketFeedback({
        type: 'error',
        message: err.message || 'Error al enviar el ticket.',
      });
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <>
      {/* Botón Flotante Discreto en Esquina Inferior Derecha */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-slate-900 text-white hover:bg-black shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border border-slate-700 font-medium text-xs group"
        title="Centro de Ayuda & Soporte Técnico"
      >
        <LifeBuoy className="w-4 h-4 text-[#00D2FF] group-hover:rotate-45 transition-transform duration-300" />
        <span className="hidden sm:inline">¿Ayuda o Problemas?</span>
      </button>

      {/* Modal Principal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Cabecera */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Centro de Soporte & Ayuda</h3>
                  <p className="text-[11px] text-gray-500">Respuestas al instante y reporte directo a desarrollo</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas de Navegación */}
            <div className="flex items-center border-b border-gray-200 px-4 bg-white text-xs font-semibold text-gray-600">
              <button
                type="button"
                onClick={() => setActiveTab('copilot')}
                className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 transition cursor-pointer ${
                  activeTab === 'copilot'
                    ? 'border-[#0052FF] text-[#0052FF]'
                    : 'border-transparent hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Asistente Rápido</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('report')}
                className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 transition cursor-pointer ${
                  activeTab === 'report'
                    ? 'border-rose-600 text-rose-600'
                    : 'border-transparent hover:text-gray-900'
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Reportar Falla a Devs</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 transition cursor-pointer ${
                  activeTab === 'history'
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent hover:text-gray-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Mis Tickets</span>
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="flex-1 overflow-y-auto p-5 text-xs text-gray-700">
              {/* TAB 1: ASISTENTE RÁPIDO COPILOT */}
              {activeTab === 'copilot' && (
                <div className="flex flex-col h-full space-y-4">
                  {/* Preguntas Frecuentes Rápidas */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Preguntas Frecuentes:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        '¿Por qué dice ventana de 24h cerrada?',
                        '¿Cómo generar el Token Permanente?',
                        '¿Cómo configurar la Agenda de Citas?',
                        '¿Qué pasa si agoto los tokens?',
                      ].map((prompt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleAskCopilot(prompt)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer border border-slate-200"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mensajes del Chat */}
                  <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto space-y-3 p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
                    {copilotMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            IA
                          </div>
                        )}
                        <div
                          className={`p-3 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-slate-900 text-white'
                              : 'bg-white border border-gray-200 text-gray-800 shadow-2xs whitespace-pre-line'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {copilotLoading && (
                      <div className="flex items-center gap-2 text-gray-400 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052FF]" />
                        <span>Consultando base de conocimiento...</span>
                      </div>
                    )}
                  </div>

                  {/* Input del Chat */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Escribe tu duda sobre el CRM..."
                      value={copilotQuery}
                      onChange={(e) => setCopilotQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAskCopilot()}
                      className="flex-1 text-xs border border-gray-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0052FF]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAskCopilot()}
                      disabled={copilotLoading || !copilotQuery.trim()}
                      className="px-3.5 py-2.5 rounded-xl bg-[#0052FF] text-white hover:bg-[#0047E0] transition cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Acceso Directo a Ticket si no se resolvió */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span>¿Es una falla técnica que requiere atención de un programador?</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('report')}
                      className="text-rose-600 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Crear Ticket a Devs</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: REPORTAR FALLA TÉCNICA (GITHUB ISSUE) */}
              {activeTab === 'report' && (
                <form onSubmit={handleCreateTicket} className="space-y-4">
                  {ticketFeedback && (
                    <div
                      className={`p-3.5 rounded-xl flex items-start gap-2.5 text-xs ${
                        ticketFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {ticketFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{ticketFeedback.message}</p>
                        {ticketFeedback.issueUrl && (
                          <a
                            href={ticketFeedback.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0052FF] hover:underline font-bold mt-1 inline-flex items-center gap-1"
                          >
                            <span>Ver Issue creado en GitHub</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">
                        Categoría de la Falla <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as TicketCategory)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs focus:ring-2 focus:ring-black bg-white"
                      >
                        <option value="whatsapp">Meta WhatsApp Cloud API</option>
                        <option value="ai_assistant">Inteligencia Artificial / Prompt</option>
                        <option value="calendar">Agenda y Citas</option>
                        <option value="billing">Facturación & Licencia</option>
                        <option value="bug">Error / Bug en el CRM</option>
                        <option value="feature_request">Sugerencia / Nueva Función</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">
                        Prioridad
                      </label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as TicketPriority)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs focus:ring-2 focus:ring-black bg-white"
                      >
                        <option value="low">Baja (Consulta / Detalle estético)</option>
                        <option value="medium">Media (Comportamiento irregular)</option>
                        <option value="high">Alta (Interrupción de ventas)</option>
                        <option value="critical">Crítica (Caída total de WhatsApp)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      Título Breve del Problema <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Mensajes de WhatsApp no se entregan al cliente"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-black"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      Descripción Detallada <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Indica qué estabas haciendo cuando ocurrió el error, qué esperabas que pasara y qué ocurrió..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-black resize-none"
                    />
                  </div>

                  {/* Soporte para pegar captura de pantalla con Ctrl+V */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      Captura de Pantalla (Opcional - Puedes pegar con Ctrl+V)
                    </label>
                    {screenshotData ? (
                      <div className="relative border border-slate-300 rounded-xl overflow-hidden p-2 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-emerald-600" />
                          <span className="text-[11px] text-gray-700 font-semibold">Captura adjuntada</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setScreenshotData(null)}
                          className="text-[10px] text-rose-600 hover:underline font-bold"
                        >
                          Eliminar captura
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 bg-slate-50/50">
                        <p className="text-[11px]">
                          Toma una captura de pantalla y presiona <strong>Ctrl + V</strong> o <strong>Cmd + V</strong> aquí para adjuntarla.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                    <span className="text-[10px] text-gray-400">
                      Se generará un Issue en GitHub sincronizado con soporte.
                    </span>
                    <button
                      type="submit"
                      disabled={submittingTicket || !title.trim() || !description.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {submittingTicket ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando ticket...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Enviar Ticket a Desarrollo</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: MIS TICKETS */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-900">Historial de Reportes</span>
                    <span className="text-[11px] text-gray-400">{myTickets.length} reportes</span>
                  </div>

                  {loadingTickets ? (
                    <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-[#0052FF]" />
                      <span>Cargando reportes...</span>
                    </div>
                  ) : myTickets.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 bg-slate-50 border border-slate-200 rounded-xl">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-gray-800">No tienes tickets abiertos</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Tu sistema está operando con normalidad.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {myTickets.map((t) => (
                        <div
                          key={t.id}
                          className="p-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900">{t.title}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                t.status === 'resolved' || t.status === 'closed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : t.status === 'in_progress'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {t.status === 'resolved'
                                ? 'Resuelto ✅'
                                : t.status === 'in_progress'
                                ? 'En Revisión 👨‍💻'
                                : 'Abierto'}
                            </span>
                          </div>

                          <p className="text-[11px] text-gray-600 line-clamp-2">{t.description}</p>

                          <div className="flex items-center justify-between pt-1 text-[10px] text-gray-400 border-t border-gray-50">
                            <span>{new Date(t.created_at).toLocaleDateString('es-ES')}</span>
                            {t.github_issue_url && (
                              <a
                                href={t.github_issue_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#0052FF] hover:underline font-semibold inline-flex items-center gap-1"
                              >
                                <span>Issue #{t.github_issue_number}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

