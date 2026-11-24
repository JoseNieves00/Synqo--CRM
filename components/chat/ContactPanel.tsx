'use client';

import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import { resolveRecommendedCommercialAction } from '@/lib/leads/lead-score';
import React, { useState, useEffect, useMemo } from 'react';
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
  Copy,
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
  Tag as TagIcon,
  ShoppingBag,
  UserRoundSearch,
  Plus,
  Target,
  Lightbulb,
  Wallet,
  Zap,
  UserCheck,
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
import { getCustomer360Action } from '@/app/actions/crm';
import { Customer360Drawer } from '@/components/crm/Customer360Drawer';
import { TAG_COLOR_CLASSES, formatCop } from '@/components/crm/crm-ui-helpers';

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
    lead_score?: number | null;
    lead_score_breakdown?: any;
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
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Cierre rápido modal state
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closeResolution, setCloseResolution] = useState<'won' | 'lost' | 'dismissed'>('won');
  const [closeNote, setCloseNote] = useState('');
  const [isClosingChat, setIsClosingChat] = useState(false);

  // Ficha 360 integrada (etiquetas, pedidos/LTV y notas del equipo)
  const [is360Open, setIs360Open] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'resumen' | 'etiquetas' | 'pedidos' | 'notas'>('resumen');
  const [crmMini, setCrmMini] = useState<{
    tags: Array<{ id: string; name: string; color: string; source: 'ai' | 'human' }>;
    ordersCount: number;
    ltv: number;
    notesCount: number;
  } | null>(null);

  // Radiografía Comercial del Lead
  const painPoint =
    contact.custom_fields?.pain_point ||
    aiSummary?.pain_point ||
    '';
  const productInterest =
    contact.custom_fields?.product_interest ||
    contact.custom_fields?.last_quoted_product ||
    aiSummary?.product_interest ||
    aiSummary?.product_of_interest ||
    '';
  const purchasingPower = (
    contact.custom_fields?.purchasing_power ||
    aiSummary?.purchasing_power ||
    null
  ) as 'economico' | 'estandar' | 'premium' | null;

  const urgency =
    contact.custom_fields?.urgency ||
    aiSummary?.urgency ||
    '';
  const decisionMaker =
    contact.custom_fields?.decision_maker ||
    aiSummary?.decision_maker ||
    '';

  // Semáforo de temperatura comercial (Caliente 80-100%, Tibio 40-79%, Frío 0-39%)
  const recAction = useMemo(() => {
    if (typeof contact.lead_score !== 'number') return null;
    return resolveRecommendedCommercialAction({
      score: contact.lead_score,
      stage: contact.pipeline_stage,
      customFields: contact.custom_fields,
      dealValue: contact.deal_value,
    });
  }, [contact.lead_score, contact.pipeline_stage, contact.custom_fields, contact.deal_value]);

  const tempScore = useMemo(() => {
    if (typeof contact.lead_score === 'number') {
      return Math.round(contact.lead_score);
    }
    if (temperature === 'hot') return 90;
    if (temperature === 'qualified_doubt') return 70;
    if (temperature === 'warm') return 45;
    return 15;
  }, [contact.lead_score, temperature]);

  const semaforoData = useMemo(() => {
    if (tempScore >= 80 || temperature === 'hot') {
      return {
        label: '🔥 Caliente',
        range: '80-100%',
        desc: 'Alta probabilidad de cierre · Listo para comprar o agendar',
        badgeClass:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
        barClass: 'bg-gradient-to-r from-orange-500 via-rose-500 to-red-500',
        dotClass: 'bg-rose-500 ring-4 ring-rose-500/20',
      };
    }
    if (tempScore >= 40 || temperature === 'warm' || temperature === 'qualified_doubt') {
      return {
        label: temperature === 'qualified_doubt' ? '🟠 Duda Calificada' : '🟡 Tibio',
        range: '40-79%',
        desc: 'Evaluando opciones · Consultando características o precios',
        badgeClass:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
        barClass: 'bg-gradient-to-r from-amber-400 to-amber-500',
        dotClass: 'bg-amber-500 ring-4 ring-amber-500/20',
      };
    }
    return {
      label: '❄️ Frío',
      range: '0-39%',
      desc: 'Baja probabilidad actual · Descartado o sin interacción',
      badgeClass:
        'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
      barClass: 'bg-slate-300 dark:bg-slate-700',
      dotClass: 'bg-sky-400 ring-4 ring-sky-400/20',
    };
  }, [tempScore, temperature]);

  const purchasingPowerMeta = useMemo(() => {
    if (purchasingPower === 'premium') {
      return {
        label: '💎 Premium / Alto',
        class:
          'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
      };
    }
    if (purchasingPower === 'economico') {
      return {
        label: '🏷️ Económico / Ajustado',
        class:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
      };
    }
    if (purchasingPower === 'estandar') {
      return {
        label: '⚖️ Estándar / Medio',
        class:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
      };
    }
    return {
      label: '⚪ Por detectar',
      class:
        'bg-slate-100 text-slate-500 border-slate-200 dark:bg-[#1A1F2C] dark:text-slate-400 dark:border-[#232A3B]',
    };
  }, [purchasingPower]);

  const loadCrmMini = React.useCallback(async () => {
    try {
      const res = await getCustomer360Action(contact.id);
      setCrmMini({
        tags: res.tags || [],
        ordersCount: res.ordersCount || 0,
        ltv: res.ltv || 0,
        notesCount: (res.notes || []).length,
      });
    } catch {
      // Silencioso si aún no corrió migración o sin datos
    }
  }, [contact.id]);

  useEffect(() => {
    loadCrmMini();
  }, [loadCrmMini]);

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
      const nextTemp =
        newStage === 'ganado'
          ? 'hot'
          : newStage === 'perdido'
          ? 'cold'
          : undefined;
      onContactUpdate?.({
        pipeline_stage: newStage,
        ...(newStage === 'ganado' || newStage === 'perdido'
          ? {
              conversation_status: 'closed',
              is_ai_active: false,
              waiting_since: null,
            }
          : {}),
        ...(nextTemp
          ? {
              custom_fields: {
                ...(contact.custom_fields || {}),
                lead_temperature: nextTemp,
              },
            }
          : {}),
      });
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
                <div className="flex items-center gap-1.5 my-0.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-mono font-semibold">
                    <Phone className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{contact.phone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!contact.phone) return;
                      navigator.clipboard.writeText(contact.phone);
                      setCopiedPhone(true);
                      setTimeout(() => setCopiedPhone(false), 2000);
                    }}
                    title="Copiar número"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    {copiedPhone ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={`https://wa.me/${(contact.phone || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir en WhatsApp"
                    className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
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

            {/* Probabilidad de compra (score IA híbrido) */}
            {typeof contact.lead_score === 'number' && (
              <div className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Probabilidad de compra
                  </span>
                  <LeadScoreBadge
                    score={contact.lead_score}
                    breakdown={contact.lead_score_breakdown}
                    actionLabel={recAction?.label}
                    size="sm"
                    showLabel
                  />
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#232A3B] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-lime-500 to-emerald-500"
                    style={{ width: `${Math.max(2, contact.lead_score)}%` }}
                  />
                </div>
                {Array.isArray(contact.lead_score_breakdown) && contact.lead_score_breakdown.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {contact.lead_score_breakdown.map((f: any) => (
                      <li key={f.key} className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">{f.label}</span>
                        <span className={`font-mono ${f.points >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {f.points > 0 ? '+' : ''}
                          {f.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {recAction && (
                  <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-start gap-1.5">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 shrink-0">🎯 Siguiente paso:</span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">
                      {recAction.label}
                    </span>
                  </div>
                )}
              </div>
            )}

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

        {/* Tarjeta de Abono / Plan Separe / Reserva (Compatible con Productos, Servicios e Híbridos) */}
        {Boolean(contact.custom_fields?.order?.is_separe || Number(contact.custom_fields?.order?.deposit_paid || 0) > 0) && (
          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/80 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Abono / Plan Separe / Reserva
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                Number(contact.custom_fields?.order?.balance_due || 0) > 0
                  ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
              }`}>
                {Number(contact.custom_fields?.order?.balance_due || 0) > 0 ? 'Saldo pendiente' : 'Liquidado'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
              <div className="p-2 rounded-lg bg-white/90 dark:bg-[#131722]/90 border border-amber-200/50 dark:border-amber-500/20">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Abono Inicial:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCop(Number(contact.custom_fields?.order?.deposit_paid || 0))}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/90 dark:bg-[#131722]/90 border border-amber-200/50 dark:border-amber-500/20">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Saldo por Cobrar:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {formatCop(Number(contact.custom_fields?.order?.balance_due || 0))}
                </span>
              </div>
            </div>
            {Array.isArray(contact.custom_fields?.order?.items) && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Detalle: {contact.custom_fields.order.items.map((it: any) => `${it.quantity}x ${it.product_name}`).join(', ')}
              </p>
            )}
          </div>
        )}

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

        {/* Ficha 360: Etiquetas, Pedidos y LTV */}
        <div className="p-2.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-xs">
              <UserRoundSearch className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              Ficha 360°
            </span>
            <button
              type="button"
              onClick={() => {
                setDrawerTab('resumen');
                setIs360Open(true);
              }}
              className="text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
            >
              Ver completa
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('pedidos');
                setIs360Open(true);
              }}
              className="text-left p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B] hover:border-[#0052FF]/50 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" /> Pedidos ({crmMini?.ordersCount ?? 0})
              </div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                {formatCop(crmMini?.ltv ?? 0)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawerTab('etiquetas');
                setIs360Open(true);
              }}
              className="text-left p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B] hover:border-[#0052FF]/50 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <TagIcon className="w-3 h-3" /> Etiquetas ({crmMini?.tags.length ?? 0})
              </div>
              <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate mt-0.5">
                {crmMini && crmMini.tags.length > 0 ? 'Gestionar' : '+ Etiquetar'}
              </div>
            </button>
          </div>

          {crmMini && crmMini.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {crmMini.tags.slice(0, 6).map((t) => (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                    TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.slate
                  }`}
                >
                  {t.source === 'ai' && <Sparkles className="w-2.5 h-2.5" />}
                  {t.name}
                </span>
              ))}
              {crmMini.tags.length > 6 && (
                <span className="text-[10px] text-slate-400 self-center">
                  +{crmMini.tags.length - 6}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('pedidos');
                setIs360Open(true);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]/50 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Pedido
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawerTab('notas');
                setIs360Open(true);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]/50 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Notas equipo ({crmMini?.notesCount ?? 0})
            </button>
          </div>
        </div>

        {/* Radiografía Comercial del Lead */}
        <div className="p-3 rounded-xl border border-blue-200/80 dark:border-[#232A3B] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-[#090A0F] dark:via-[#131722] dark:to-[#0052FF]/5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
              <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                Radiografía del Prospecto
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="text-[10.5px] text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Actualizar análisis con IA"
            >
              {isGeneratingSummary ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Actualizar IA</span>
                </>
              )}
            </button>
          </div>

          {/* Semáforo de Temperatura con Barra de Probabilidad */}
          <div className="p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${semaforoData.dotClass}`} />
                Semáforo de Cierre
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${semaforoData.badgeClass}`}>
                {semaforoData.label} ({semaforoData.range})
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1A1F2C] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${semaforoData.barClass}`}
                style={{ width: `${Math.max(5, tempScore)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              {semaforoData.desc}
            </p>
          </div>

          {/* Dolor Principal (Solo si fue extraído) */}
          {painPoint?.trim() && (
            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200 mb-1 text-[11px]">
                <Target className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Necesidad / Dolor Principal</span>
              </div>
              <p className="text-slate-800 dark:text-slate-200 text-[11px] leading-snug font-medium">
                {painPoint.trim()}
              </p>
            </div>
          )}

          {/* Interés y Poder Adquisitivo (Solo si fueron extraídos) */}
          {(productInterest?.trim() || purchasingPower) && (
            <div className={`grid gap-1.5 text-[11px] ${productInterest?.trim() && purchasingPower ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {productInterest?.trim() && (
                <div className="p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                    <Lightbulb className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-semibold uppercase tracking-wider">Interés Detectado</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={productInterest}>
                    {productInterest.trim()}
                  </p>
                </div>
              )}

              {purchasingPower && (
                <div className="p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                    <Wallet className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="font-semibold uppercase tracking-wider">Poder Adquisitivo</span>
                  </div>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${purchasingPowerMeta.class}`}>
                    {purchasingPowerMeta.label}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Decisor & Urgencia de Cierre (Solo si fueron extraídos) */}
          {(decisionMaker?.trim() || urgency?.trim()) && (
            <div className={`grid gap-1.5 text-[11px] ${decisionMaker?.trim() && urgency?.trim() ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {decisionMaker?.trim() && (
                <div className="p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                    <UserCheck className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="font-semibold uppercase tracking-wider">Poder de Decisión</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={decisionMaker}>
                    {decisionMaker.trim()}
                  </p>
                </div>
              )}

              {urgency?.trim() && (
                <div className="p-2 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-semibold uppercase tracking-wider">Urgencia / Plazo</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={urgency}>
                    {urgency.trim()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ⚡ Resumen Ejecutivo / Puntos Clave */}
          <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-[#0052FF]/10 border border-blue-100 dark:border-blue-900/40 text-[11px] space-y-1.5">
            <div className="flex items-center gap-1 font-bold text-blue-950 dark:text-blue-200 text-[11px]">
              <Zap className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
              <span>⚡ Resumen Ejecutivo & Próximo Paso</span>
            </div>
            {aiSummary ? (
              <div className="space-y-1 text-slate-700 dark:text-slate-300">
                {Array.isArray(aiSummary.key_points) && aiSummary.key_points.length > 0 ? (
                  <ul className="list-disc pl-3.5 space-y-0.5 text-[10.5px]">
                    {aiSummary.key_points.map((pt: string, idx: number) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-line text-[10.5px] leading-relaxed">
                    {aiSummary.summary_text || aiSummary.summary || 'Resumen de conversación disponible.'}
                  </p>
                )}
                {(aiSummary.next_step || aiSummary.recommended_action) && (
                  <div className="pt-1.5 border-t border-blue-200/60 dark:border-blue-900/40 flex items-start gap-1 font-semibold text-blue-900 dark:text-blue-200 text-[10.5px]">
                    <ChevronRight className="w-3 h-3 text-[#0052FF] shrink-0 mt-0.5" />
                    <span>Paso: {aiSummary.next_step || aiSummary.recommended_action}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic">
                Aún no hay puntos clave extraídos. Haz clic en &quot;Actualizar IA&quot; para sintetizar la conversación.
              </p>
            )}
          </div>
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

      <Customer360Drawer
        contactId={is360Open ? contact.id : null}
        initialTab={drawerTab}
        onClose={() => setIs360Open(false)}
        onChanged={loadCrmMini}
      />

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
