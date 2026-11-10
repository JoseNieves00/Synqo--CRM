'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  DollarSign,
  Flame,
  Calendar,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Check,
  ChevronRight,
  Pencil,
  X,
  Phone,
  Mail,
  User,
  Instagram,
  MessageSquare,
  AlertCircle,
  Archive,
} from 'lucide-react';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { updateLeadStage } from '@/app/actions/pipeline';
import {
  LEAD_TEMPERATURE_META,
  LEAD_TEMPERATURE_ORDER,
  type LeadTemperature,
  resolveLeadTemperature,
} from '@/lib/ai/follow-up-types';
import { updateContactDetails } from '@/app/actions/contacts';
import { generateContactAiSummary, endContactConversation, reopenContactConversation } from '@/app/actions/chat';
import { toggleContactFollowUpPause } from '@/app/actions/reminders';
import { formatInboxConversationDate } from '@/lib/utils/inbox-date';

interface ContactPanelProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    pipeline_stage?: any;
    is_ai_active: boolean;
    last_interaction_at: string;
    assigned_to?: string | null;
    custom_fields?: any;
    channel?: 'whatsapp' | 'instagram';
    instagram_username?: string | null;
    instagram_id?: string | null;
    conversation_status?: string;
    deal_value?: number | null;
  };
  teamMembers?: Array<{ id: string; full_name: string }>;
  onContactUpdate?: (fields: Partial<any>) => void;
  onOpenScheduleReminder?: () => void;
  onClosePanel?: () => void;
  isMobileDrawer?: boolean;
}

export function ContactPanel({
  contact,
  teamMembers = [],
  onContactUpdate,
  onOpenScheduleReminder,
  onClosePanel,
  isMobileDrawer = false,
}: ContactPanelProps) {
  const [stage, setStage] = useState(contact.pipeline_stage || 'nuevo');
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

  // Notas internas
  const [notes, setNotes] = useState(contact.custom_fields?.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedNotice, setNotesSavedNotice] = useState(false);

  // Valor del negocio (Deal Value)
  const initialDealValue = contact.deal_value ?? contact.custom_fields?.deal_value ?? '';
  const [dealValue, setDealValue] = useState(initialDealValue ? String(initialDealValue) : '');
  const [isSavingDealValue, setIsSavingDealValue] = useState(false);

  // Temperatura (clave única lead_temperature con lectura compatible de temperature)
  const [temperature, setTemperature] = useState<LeadTemperature>(
    resolveLeadTemperature(contact.custom_fields) || 'warm'
  );

  // Resumen IA
  const [aiSummary, setAiSummary] = useState(contact.custom_fields?.ai_summary || null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isTogglingFollowUp, setIsTogglingFollowUp] = useState(false);

  // Cierre rápido modal state
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closeResolution, setCloseResolution] = useState<'won' | 'lost' | 'dismissed'>('won');
  const [closeNote, setCloseNote] = useState('');
  const [isClosingChat, setIsClosingChat] = useState(false);

  useEffect(() => {
    setStage(contact.pipeline_stage || 'nuevo');
    setNotes(contact.custom_fields?.notes || '');
    setDealValue(contact.deal_value ? String(contact.deal_value) : contact.custom_fields?.deal_value ? String(contact.custom_fields?.deal_value) : '');
    setTemperature(resolveLeadTemperature(contact.custom_fields) || 'warm');
    setAiSummary(contact.custom_fields?.ai_summary || null);
  }, [contact]);

  // Cambiar etapa comercial
  const handleStageChange = async (newStage: string) => {
    setStage(newStage);
    setIsUpdatingStage(true);
    try {
      await updateLeadStage(contact.id, newStage as any);
      onContactUpdate?.({ pipeline_stage: newStage });
    } catch (err) {
      console.error('[ContactPanel] Error actualizando etapa:', err);
    } finally {
      setIsUpdatingStage(false);
    }
  };

  // Guardar notas internas
  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await updateContactDetails(contact.id, { notes });
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          notes,
        },
      });
      setNotesSavedNotice(true);
      setTimeout(() => setNotesSavedNotice(false), 2500);
    } catch (err) {
      console.error('[ContactPanel] Error guardando notas:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Guardar valor del negocio
  const handleSaveDealValue = async () => {
    const num = parseFloat(dealValue.replace(/[^0-9.]/g, '')) || null;
    setIsSavingDealValue(true);
    try {
      await updateContactDetails(contact.id, { deal_value: num } as any);
      onContactUpdate?.({
        deal_value: num,
        custom_fields: {
          ...(contact.custom_fields || {}),
          deal_value: num,
        },
      });
    } catch (err) {
      console.error('[ContactPanel] Error guardando valor del negocio:', err);
    } finally {
      setIsSavingDealValue(false);
    }
  };

  // Cambiar temperatura (override humano guardado en lead_temperature con auditoría)
  const handleTemperatureChange = async (temp: LeadTemperature) => {
    setTemperature(temp);
    try {
      await updateContactDetails(contact.id, { lead_temperature: temp });
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          lead_temperature: temp,
        },
      });
    } catch (err) {
      console.error('[ContactPanel] Error guardando temperatura:', err);
    }
  };

  // Generar resumen con IA
  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const summary = await generateContactAiSummary(contact.id);
      setAiSummary(summary);
      onContactUpdate?.({
        custom_fields: {
          ...(contact.custom_fields || {}),
          ai_summary: summary,
        },
      });
    } catch (err) {
      console.error('[ContactPanel] Error generando resumen IA:', err);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Cerrar chat
  const handleExecuteClose = async () => {
    setIsClosingChat(true);
    try {
      await endContactConversation(contact.id, closeResolution, closeNote);
      setIsClosingModalOpen(false);
      onContactUpdate?.({
        conversation_status: 'closed',
        custom_fields: {
          ...(contact.custom_fields || {}),
          conversation_status: 'closed',
          close_resolution: closeResolution,
        },
        pipeline_stage: closeResolution === 'won' ? 'ganado' : closeResolution === 'lost' ? 'perdido' : stage,
      });
    } catch (err) {
      console.error('[ContactPanel] Error cerrando chat:', err);
    } finally {
      setIsClosingChat(false);
    }
  };

  // Reabrir chat
  const handleReopen = async () => {
    try {
      await reopenContactConversation(contact.id);
      onContactUpdate?.({
        conversation_status: 'open',
        custom_fields: {
          ...(contact.custom_fields || {}),
          conversation_status: 'open',
        },
      });
    } catch (err) {
      console.error('[ContactPanel] Error reabriendo chat:', err);
    }
  };

  const isClosed = contact.conversation_status === 'closed' || contact.custom_fields?.conversation_status === 'closed';
  const activeReminder = contact.custom_fields?.active_reminder;

  return (
    <div
      className="h-full w-full flex flex-col bg-white dark:bg-[#0D111A] border-l border-slate-200 dark:border-[#232A3B] text-slate-800 dark:text-slate-200 text-xs overflow-y-auto select-none"
    >
      {/* Cabecera del Panel */}
      <div className="p-3.5 border-b border-slate-100 dark:border-[#232A3B] flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-[#090A0F]/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center font-bold text-xs">
            {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-white truncate">
              {contact.name || 'Sin nombre registrado'}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono flex-wrap">
              {contact.channel === 'instagram' ? (
                <span className="flex items-center gap-1">
                  <Instagram className="w-3 h-3 text-pink-500" />
                  <span>@{contact.instagram_username || contact.phone}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 text-[#0052FF]" />
                  <span>{contact.phone}</span>
                </span>
              )}
              {contact.last_interaction_at && (
                <>
                  <span className="text-slate-300 dark:text-[#232A3B]">•</span>
                  <span
                    title={formatInboxConversationDate(contact.last_interaction_at).tooltip}
                    className="text-[10px] text-slate-400 font-sans"
                  >
                    {formatInboxConversationDate(contact.last_interaction_at).label}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {onClosePanel && (
          <button
            type="button"
            onClick={onClosePanel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-4 flex-1">
        {/* Tarjeta de Resumen Ejecutivo de IA */}
        <div className="rounded-xl p-3 border border-blue-100 dark:border-blue-950/60 bg-gradient-to-br from-blue-50/50 via-white to-blue-50/20 dark:from-[#0052FF]/10 dark:via-[#131722] dark:to-[#0052FF]/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Resumen comercial IA</span>
            </div>
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="text-[10px] text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingSummary ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Actualizando...</span>
                </>
              ) : (
                <span>Actualizar</span>
              )}
            </button>
          </div>

          {aiSummary ? (
            <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
              {Array.isArray(aiSummary.key_points) && aiSummary.key_points.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1">
                  {aiSummary.key_points.map((pt: string, idx: number) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              ) : (
                <p className="whitespace-pre-line">{aiSummary.summary_text || aiSummary.summary || 'Resumen de conversación disponible.'}</p>
              )}

              {(aiSummary.next_step || aiSummary.recommended_action) && (
                <div className="mt-2 pt-2 border-t border-blue-200/50 dark:border-[#232A3B] flex items-start gap-1.5 text-blue-900 dark:text-blue-200 font-medium">
                  <ChevronRight className="w-3.5 h-3.5 text-[#0052FF] shrink-0 mt-0.5" />
                  <span>Siguiente paso: {aiSummary.next_step || aiSummary.recommended_action}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              Aún no se ha generado un resumen de este prospecto. Haz clic en actualizar para que la IA extraiga los puntos clave.
            </p>
          )}
        </div>

        {/* Etapa Comercial & Valor del Negocio */}
        <div className="space-y-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Etapa en el pipeline
            </label>
            <div className="relative">
              <select
                value={stage}
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={isUpdatingStage}
                className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF] cursor-pointer"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {isUpdatingStage && (
                <Loader2 className="w-3 h-3 animate-spin text-[#0052FF] absolute right-2.5 top-2.5" />
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Valor del Negocio */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Valor estimado ($)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  onBlur={handleSaveDealValue}
                  placeholder="$ 0.00"
                  className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                />
              </div>
            </div>

            {/* Nivel de Calificación / Temperatura */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nivel de calificación
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-[#090A0F] p-1 rounded-lg border border-slate-200 dark:border-[#232A3B]">
                {LEAD_TEMPERATURE_ORDER.map((t) => {
                  const meta = LEAD_TEMPERATURE_META[t];
                  const emoji = meta.badge.split(' ')[0];
                  const active = temperature === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTemperatureChange(t)}
                      className={`py-1 px-1.5 text-[10px] rounded text-center transition cursor-pointer truncate ${
                        active
                          ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white font-bold shadow-2xs ring-1 ring-slate-200 dark:ring-[#2C354B]'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                      title={`${meta.label}: ${meta.description}`}
                    >
                      {emoji} {meta.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recordatorios y Seguimiento */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Recordatorios activos</span>
            {onOpenScheduleReminder && (
              <button
                type="button"
                onClick={onOpenScheduleReminder}
                className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                + Programar
              </button>
            )}
          </div>

          {activeReminder?.scheduledFor ? (
            <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 text-amber-900 dark:text-amber-200 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">
                    {new Date(activeReminder.scheduledFor).toLocaleDateString([], {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    -{' '}
                    {new Date(activeReminder.scheduledFor).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {activeReminder.note && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                      &quot;{activeReminder.note}&quot;
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">No hay recordatorios pendientes programados.</p>
          )}

          {contact.custom_fields?.follow_up && (
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]/60 flex items-center justify-between gap-2 mt-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  Embudo: {contact.custom_fields.follow_up.category} (Paso #{Number(contact.custom_fields.follow_up.currentStepIndex || 0) + 1})
                </p>
                {contact.custom_fields.follow_up.nextSendAt && !contact.custom_fields.follow_up.paused && (
                  <p className="text-[10px] text-slate-500">
                    Próximo envío: {new Date(contact.custom_fields.follow_up.nextSendAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isTogglingFollowUp}
                onClick={async () => {
                  const nextPaused = !contact.custom_fields?.follow_up?.paused;
                  setIsTogglingFollowUp(true);
                  try {
                    await toggleContactFollowUpPause(contact.id, nextPaused);
                    onContactUpdate?.({
                      custom_fields: {
                        ...(contact.custom_fields || {}),
                        follow_up: { ...(contact.custom_fields?.follow_up || {}), paused: nextPaused },
                      },
                    });
                  } finally {
                    setIsTogglingFollowUp(false);
                  }
                }}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold border cursor-pointer transition shrink-0 ${
                  contact.custom_fields.follow_up.paused
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300'
                }`}
              >
                {contact.custom_fields.follow_up.paused ? 'Reanudar' : 'Pausar'}
              </button>
            </div>
          )}
        </div>

        {/* Ficha / Notas Internas */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Notas internas del cliente</span>
            {notesSavedNotice && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 animate-in fade-in">
                <Check className="w-3 h-3" /> Guardado
              </span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            rows={3}
            placeholder="Escribe preferencias del cliente, acuerdos de precio, productos de interés..."
            className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#0052FF] resize-none"
          />
        </div>

        {/* Botones de Acción de Cierre / Conversión */}
        <div className="pt-2 border-t border-slate-100 dark:border-[#232A3B] space-y-2">
          {isClosed ? (
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] text-center space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <Archive className="w-3.5 h-3.5" /> Conversación cerrada / archivada
              </span>
              <button
                type="button"
                onClick={handleReopen}
                className="w-full py-1.5 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold transition cursor-pointer shadow-xs"
              >
                Reabrir conversación
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsClosingModalOpen(true)}
              className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar / Cerrar venta</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal de Finalización / Cierre con Resultado */}
      {isClosingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-4 border border-slate-200 dark:border-[#232A3B] shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-950 dark:text-white">Cerrar conversación</h3>
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Elige el resultado del chat. Esto archivará la conversación y actualizará el retorno comercial:
            </p>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setCloseResolution('won')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                  closeResolution === 'won'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                <span className="text-[11px]">Ganado ($)</span>
              </button>

              <button
                type="button"
                onClick={() => setCloseResolution('lost')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                  closeResolution === 'lost'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 mx-auto mb-1 text-rose-600" />
                <span className="text-[11px]">No concretado</span>
              </button>

              <button
                type="button"
                onClick={() => setCloseResolution('dismissed')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                  closeResolution === 'dismissed'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Check className="w-4 h-4 mx-auto mb-1 text-[#0052FF]" />
                <span className="text-[11px]">Resuelto</span>
              </button>
            </div>

            <textarea
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="Nota de cierre opcional (motivo de pérdida, producto vendido, etc.)..."
              rows={2}
              className="w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(false)}
                className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] text-slate-600 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteClose}
                disabled={isClosingChat}
                className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isClosingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Confirmar Cierre</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
