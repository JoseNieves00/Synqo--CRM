'use client';

import React, { useMemo } from 'react';
import { MessageSquare, Instagram, Clock, CheckCircle2, UserCheck, Bot, User, Check, Pause } from 'lucide-react';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { formatInboxConversationDate } from '@/lib/utils/inbox-date';

export interface ContactRowData {
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
  unread_count?: number;
  last_message?: any;
  ai_snooze_until?: string | null;
  conversation_status?: string;
  waiting_since?: string | null;
  last_message_preview?: string | null;
  last_message_sender?: string | null;
  deal_value?: number | null;
}

interface ConversationRowProps {
  contact: ContactRowData;
  isActive: boolean;
  isSelected?: boolean;
  isMine?: boolean;
  assignedUserName?: string;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onQuickAssign?: (id: string, e: React.MouseEvent) => void;
  onQuickClose?: (id: string, e: React.MouseEvent) => void;
  onQuickSnooze?: (id: string, e: React.MouseEvent) => void;
}

export const ConversationRow = React.memo(function ConversationRow({
  contact: c,
  isActive,
  isSelected = false,
  isMine = false,
  assignedUserName,
  onSelect,
  onToggleSelect,
  onQuickAssign,
  onQuickClose,
  onQuickSnooze,
}: ConversationRowProps) {
  // 1. Formatear fecha y hora inteligente de última interacción (Hoy, Ayer, o día)
  const dateFormatted = useMemo(() => {
    return formatInboxConversationDate(c.last_interaction_at);
  }, [c.last_interaction_at]);

  // 2. Cálculo del temporizador de espera (SLA)
  // Se calcula con waiting_since o last_interaction_at si hay mensajes pendientes
  const waitingInfo = useMemo(() => {
    const waitingTimestamp = c.waiting_since || (c.unread_count && c.unread_count > 0 ? c.last_interaction_at : null);
    if (!waitingTimestamp) return null;

    try {
      const elapsedMinutes = Math.floor((Date.now() - new Date(waitingTimestamp).getTime()) / (1000 * 60));
      if (elapsedMinutes < 0) return null;

      let label = `${elapsedMinutes}m`;
      if (elapsedMinutes >= 60 && elapsedMinutes < 1440) {
        const hrs = Math.floor(elapsedMinutes / 60);
        label = `${hrs}h`;
      } else if (elapsedMinutes >= 1440) {
        const days = Math.floor(elapsedMinutes / 1440);
        label = `${days}d`;
      }

      // Semáforo: Verde (<15m), Ámbar (<60m), Rojo (>=60m)
      const color =
        elapsedMinutes < 15
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
          : elapsedMinutes < 60
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-bold animate-pulse';

      return { label, color, elapsedMinutes };
    } catch {
      return null;
    }
  }, [c.waiting_since, c.unread_count, c.last_interaction_at]);

  // 3. Vista previa con prefijo del emisor
  const { previewText, senderPrefix } = useMemo(() => {
    const rawPreview =
      c.last_message_preview ||
      (typeof c.last_message === 'string' ? c.last_message : c.last_message?.text) ||
      c.custom_fields?.last_message ||
      '';

    const sender = c.last_message_sender || c.last_message?.sender_type;
    let prefix = '';
    if (sender === 'lead') {
      prefix = '';
    } else if (sender === 'ai') {
      prefix = 'IA: ';
    } else if (sender === 'agent_manual') {
      prefix = isMine ? 'Tú: ' : `${assignedUserName ? assignedUserName.split(' ')[0] : 'Asesor'}: `;
    }

    return { previewText: rawPreview, senderPrefix: prefix };
  }, [c.last_message_preview, c.last_message, c.last_message_sender, c.custom_fields, isMine, assignedUserName]);

  // 4. Etiqueta de temperatura (hot, warm, cold)
  const temperature = c.custom_fields?.temperature;
  const tempDot =
    temperature === 'hot' ? (
      <span title="Lead Caliente (Alta intención de compra)" className="w-2 h-2 rounded-full bg-rose-500 shrink-0 shadow-xs" />
    ) : temperature === 'warm' ? (
      <span title="Lead Tibio" className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
    ) : temperature === 'cold' ? (
      <span title="Lead Frío" className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
    ) : null;

  // 5. Etiqueta del Pipeline
  const stageObj = useMemo(() => {
    return PIPELINE_STAGES.find((s) => s.id === c.pipeline_stage) || { label: c.pipeline_stage || 'Nuevo' };
  }, [c.pipeline_stage]);

  const unreadCount = c.unread_count ?? c.custom_fields?.unread_count ?? 0;
  const isClosed = c.conversation_status === 'closed' || c.custom_fields?.conversation_status === 'closed';

  // 6. Indicador de Reactivación Comercial (>24h de silencio y último mensaje fue nuestro)
  const isColdForReactivation = useMemo(() => {
    if (c.pipeline_stage === 'ganado' || c.pipeline_stage === 'perdido' || c.pipeline_stage === 'cita_agendada') return false;
    if (isClosed || c.custom_fields?.reactivation_attempted) return false;
    if (unreadCount > 0 || c.waiting_since) return false;
    const sender = c.last_message_sender || c.last_message?.sender_type;
    if (sender === 'lead') return false;
    try {
      const elapsed = Date.now() - new Date(c.last_interaction_at).getTime();
      const hours = elapsed / (1000 * 3600);
      return hours >= 24 && hours <= 240;
    } catch {
      return false;
    }
  }, [c.pipeline_stage, isClosed, c.custom_fields?.reactivation_attempted, unreadCount, c.waiting_since, c.last_message_sender, c.last_message, c.last_interaction_at]);

  return (
    <div
      onClick={() => onSelect(c.id)}
      className={`group relative p-3 border-l-2 select-none transition cursor-pointer ${
        isActive
          ? 'bg-blue-50/80 dark:bg-[#0052FF]/15 border-l-[#0052FF]'
          : isSelected
          ? 'bg-slate-100 dark:bg-[#1A1F2C] border-l-slate-400'
          : unreadCount > 0
          ? 'bg-slate-50/90 dark:bg-[#131722] border-l-[#0052FF] hover:bg-slate-100/70 dark:hover:bg-[#1A1F2C]'
          : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-[#131722]/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Checkbox de Selección Múltiple y Nombre */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(c.id, e);
              }}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-[#232A3B] text-[#0052FF] focus:ring-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            />
          )}

          {tempDot}

          {/* Ícono del canal */}
          {c.channel === 'instagram' ? (
            <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
          )}

          <h3
            className={`font-semibold text-xs truncate ${
              unreadCount > 0
                ? 'text-slate-950 dark:text-white font-bold'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            {c.name || (c.channel === 'instagram' && c.instagram_username ? `@${c.instagram_username}` : c.phone)}
          </h3>
        </div>

        {/* Hora / Fecha y Temporizador SLA */}
        <div className="flex items-center gap-1.5 shrink-0 text-right">
          {waitingInfo && (
            <span
              title={`Esperando respuesta hace ${waitingInfo.label}`}
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${waitingInfo.color} flex items-center gap-0.5`}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>{waitingInfo.label}</span>
            </span>
          )}
          <span
            title={dateFormatted.tooltip}
            className={`text-[10px] font-mono ${
              dateFormatted.isToday
                ? 'text-slate-600 dark:text-slate-300 font-semibold'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {dateFormatted.label}
          </span>
        </div>
      </div>

      {/* Vista Previa del Mensaje */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <p
          className={`text-xs truncate flex-1 ${
            unreadCount > 0
              ? 'text-slate-900 dark:text-slate-100 font-medium'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {senderPrefix && <span className="text-slate-400 font-normal">{senderPrefix}</span>}
          {previewText || <span className="italic opacity-60">Sin mensajes recientes</span>}
        </p>

        {unreadCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-[#0052FF] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      {/* Pie de Fila: Etapa, Asesor y Botones Hover */}
      <div className="flex items-center justify-between gap-1 mt-1.5 pt-1 border-t border-slate-100/60 dark:border-[#232A3B]/40">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Pill de Etapa */}
          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] truncate max-w-[90px]">
            {stageObj.label}
          </span>

          {/* Badge de Reactivación Comercial */}
          {isColdForReactivation && (
            <span
              title="Lead en silencio (>24h). Listo para reactivar."
              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0"
            >
              Reactivar
            </span>
          )}

          {/* Asesor asignado */}
          {assignedUserName ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] truncate max-w-[95px] ${
                isMine ? 'text-[#0052FF] dark:text-[#00D2FF] font-medium' : 'text-slate-400'
              }`}
              title={`Asignado a: ${assignedUserName}`}
            >
              <User className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{assignedUserName.split(' ')[0]}</span>
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Sin asignar</span>
          )}

          {/* Estado de IA */}
          {c.is_ai_active ? (
            <span title="IA activa respondiendo" className="text-emerald-500 shrink-0">
              <Bot className="w-3 h-3" />
            </span>
          ) : (
            <span title="IA pausada - Asesor al mando" className="text-amber-500 shrink-0">
              <UserCheck className="w-3 h-3" />
            </span>
          )}
        </div>

        {/* Acciones Rápidas al pasar el Mouse (Hover) */}
        <div className="hidden group-hover:flex items-center gap-1 bg-white/90 dark:bg-[#131722]/90 backdrop-blur-xs px-1 rounded-md shadow-xs">
          {!isMine && onQuickAssign && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAssign(c.id, e);
              }}
              className="p-1 text-slate-500 hover:text-[#0052FF] rounded hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              title="Tomar / Asignarme este lead"
            >
              <UserCheck className="w-3 h-3" />
            </button>
          )}

          {onQuickSnooze && c.is_ai_active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickSnooze(c.id, e);
              }}
              className="p-1 text-slate-500 hover:text-amber-600 rounded hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              title="Pausar IA temporalmente"
            >
              <Pause className="w-3 h-3" />
            </button>
          )}

          {!isClosed && onQuickClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickClose(c.id, e);
              }}
              className="p-1 text-slate-500 hover:text-emerald-600 rounded hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              title="Cerrar chat y archivar (E)"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
