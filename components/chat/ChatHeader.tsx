'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  UserCheck,
  Zap,
  MoreVertical,
  Clock,
  Archive,
  RotateCcw,
  Trash2,
  Sparkles,
  Package,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Instagram,
  Loader2,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { AiToggleSwitch } from './AiToggleSwitch';
import { isWithin24HourWindow, getRemainingHoursInWindow, PIPELINE_STAGES } from '@/services/contact.service';
import { formatInboxConversationDate } from '@/lib/utils/inbox-date';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ChatHeaderProps {
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
    conversation_status?: string;
  };
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
  isRightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onToggleAi: () => Promise<void>;
  onSnoozeAi: (durationMinutes: 30 | 120 | 'tomorrow') => Promise<void>;
  onClaimLead: () => Promise<void>;
  onReassignLead: (agentId: string) => Promise<void>;
  onCloseChat: () => void;
  onReopenChat?: () => void;
  onOpenScheduleReminder: () => void;
  onOpenSendTemplate?: () => void;
  onDeleteChat?: () => void;
  onBack?: () => void;
}

export function ChatHeader({
  contact,
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  isRightPanelOpen,
  onToggleRightPanel,
  onToggleAi,
  onSnoozeAi,
  onClaimLead,
  onReassignLead,
  onCloseChat,
  onReopenChat,
  onOpenScheduleReminder,
  onOpenSendTemplate,
  onDeleteChat,
  onBack,
}: ChatHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSnoozeSubmenu, setShowSnoozeSubmenu] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isAdminOrSupervisor = currentUserRole === 'admin' || currentUserRole === 'supervisor';
  const isAssignedToMe = contact.assigned_to === currentUserId;
  const isUnassigned = !contact.assigned_to;
  const assignedMember = teamMembers.find((m) => m.id === contact.assigned_to);

  const isClosed = contact.conversation_status === 'closed' || contact.custom_fields?.conversation_status === 'closed';

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
        setShowSnoozeSubmenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      await onClaimLead();
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="h-14 border-b border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 select-none">
      {/* Lado Izquierdo: Botón Atrás + Identidad del Contacto */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-bold text-sm flex items-center justify-center shrink-0">
          {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {contact.name || contact.phone}
            </h2>
            {isClosed && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                Archivado
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            {contact.channel === 'instagram' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-pink-600 dark:text-pink-400 font-semibold">
                <Instagram className="w-3 h-3" />
                <span>@{contact.instagram_username || contact.phone}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#0052FF] dark:text-[#00D2FF] font-semibold">
                <MessageSquare className="w-3 h-3" />
                <span>{contact.phone}</span>
              </span>
            )}
            {contact.last_interaction_at && (
              <>
                <span className="text-slate-300 dark:text-[#232A3B]">•</span>
                <span
                  title={formatInboxConversationDate(contact.last_interaction_at).tooltip}
                  className="text-[11px] text-slate-400 dark:text-slate-500 font-sans"
                >
                  {formatInboxConversationDate(contact.last_interaction_at).label}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lado Derecho: Asignación, Switch IA, Cerrar y Menú Más */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Asignación */}
        {isAdminOrSupervisor ? (
          <div className="hidden sm:flex items-center gap-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg px-2 py-1 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={contact.assigned_to || 'unassigned'}
              onChange={(e) => onReassignLead(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="unassigned">Sin Asignar</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} {m.id === currentUserId ? '(Tú)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : isUnassigned ? (
          <button
            type="button"
            onClick={handleClaim}
            disabled={isClaiming}
            className="px-2.5 py-1 bg-[#0052FF] hover:bg-[#0043D4] text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
          >
            {isClaiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
            <span className="hidden sm:inline">Tomar cliente</span>
          </button>
        ) : isAssignedToMe ? (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20 rounded-lg text-xs font-medium">
            <User className="w-3 h-3" /> Asignado a ti
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B] rounded-lg text-xs font-medium">
            <User className="w-3 h-3" /> {assignedMember?.full_name?.split(' ')[0] || 'Asesor'}
          </span>
        )}

        {/* Switch IA */}
        <AiToggleSwitch
          contactId={contact.id}
          initialIsAiActive={contact.is_ai_active}
          onToggle={onToggleAi}
        />

        {/* Botón Acción Cerrar Chat / Reabrir */}
        {isClosed ? (
          onReopenChat && (
            <button
              type="button"
              onClick={onReopenChat}
              className="px-2.5 py-1 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reabrir</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onCloseChat}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
            title="Finalizar o archivar chat (Atajo E)"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Cerrar chat</span>
          </button>
        )}

        {/* Botón Alternar Panel Derecho de Contacto */}
        <button
          type="button"
          onClick={onToggleRightPanel}
          className={`p-1.5 rounded-lg border transition cursor-pointer ${
            isRightPanelOpen
              ? 'bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-[#00D2FF]/30'
              : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-slate-200 dark:border-[#232A3B]'
          }`}
          title={isRightPanelOpen ? 'Ocultar panel de contacto' : 'Mostrar panel de contacto'}
        >
          {isRightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>

        {/* Menú Opciones ... */}
        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-[#131722] rounded-xl shadow-xl border border-slate-200 dark:border-[#232A3B] py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
              {/* Pausa temporal de IA */}
              <button
                type="button"
                onClick={() => setShowSnoozeSubmenu((prev) => !prev)}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pausa temporal de IA</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400" />
              </button>

              {showSnoozeSubmenu && (
                <div className="bg-slate-50 dark:bg-[#090A0F] py-1 px-1 border-y border-slate-100 dark:border-[#232A3B] space-y-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await onSnoozeAi(30);
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-1 rounded text-[11px] hover:bg-white dark:hover:bg-[#131722] text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    ⏱️ Pausar 30 minutos
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onSnoozeAi(120);
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-1 rounded text-[11px] hover:bg-white dark:hover:bg-[#131722] text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    ⏱️ Pausar 2 horas
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onSnoozeAi('tomorrow');
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-1 rounded text-[11px] hover:bg-white dark:hover:bg-[#131722] text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    ☀️ Hasta mañana (8 AM)
                  </button>
                </div>
              )}

              {/* Programar Recordatorio */}
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenScheduleReminder();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5 text-blue-500" />
                <span>Programar recordatorio</span>
              </button>

              {/* Enviar Plantilla Oficial */}
              {onOpenSendTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenSendTemplate();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#0052FF]" />
                  <span>Enviar plantilla oficial</span>
                </button>
              )}

              {/* Eliminar Chat */}
              {onDeleteChat && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onDeleteChat();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-2 border-t border-slate-100 dark:border-[#232A3B] cursor-pointer mt-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar conversación</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
