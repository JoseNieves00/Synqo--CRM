'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Search,
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
  whatsappProvider?: 'meta' | 'evolution';
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: TeamMember[];
  isRightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  isSearchOpen?: boolean;
  onToggleSearch?: () => void;
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
  whatsappProvider = 'meta',
  currentUserId,
  currentUserRole = 'agent',
  teamMembers = [],
  isRightPanelOpen,
  onToggleRightPanel,
  isSearchOpen = false,
  onToggleSearch,
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

  const window24h = useMemo(() => {
    if (contact.channel === 'instagram') {
      return { isExpired: false, label: '', tooltip: '' };
    }
    if (whatsappProvider === 'evolution') {
      // En Evolution API no hay restricción de 24 horas; omitimos badge para mantener la barra 100% limpia
      return { isExpired: false, label: '', tooltip: '' };
    }
    if (!contact.last_interaction_at) {
      return { isExpired: true, label: '24h Expirada', tooltip: 'Requiere plantilla oficial pre-aprobada por Meta' };
    }
    const diffHours = (Date.now() - new Date(contact.last_interaction_at).getTime()) / (1000 * 3600);
    if (diffHours >= 24) {
      return { isExpired: true, label: '24h Expirada', tooltip: 'Ventana de 24h Meta cerrada. Pulsa para enviar plantilla oficial' };
    }
    return { isExpired: false, label: '', tooltip: '' };
  }, [contact.channel, contact.last_interaction_at, whatsappProvider]);

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
      {/* 1. Lado Izquierdo: Botón Atrás + Identidad del Contacto (Limpio en 1 línea con canal anclado al Avatar) */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Avatar Inteligente con Micro-Badge de Canal en la esquina inferior */}
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-bold text-sm flex items-center justify-center">
            {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          {contact.channel === 'instagram' ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center border-2 border-white dark:border-[#0D111A] shadow-xs"
              title="Instagram Direct"
            >
              <Instagram className="w-2.5 h-2.5" />
            </span>
          ) : (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-[#0D111A] shadow-xs"
              title="WhatsApp"
            >
              <MessageSquare className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Textos de Identidad: Nombre en fila 1, teléfono y fecha en fila 2 (Sin saltos rotos) */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-[260px]">
              {contact.name || contact.phone}
            </h2>
            {isClosed && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                Archivado
              </span>
            )}
            {window24h.isExpired && (
              <button
                type="button"
                onClick={onOpenSendTemplate}
                title={window24h.tooltip}
                className="hidden xs:inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition cursor-pointer shrink-0 animate-pulse font-sans"
              >
                <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                <span>Plantilla 24h</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden truncate">
            <span className="font-mono text-[11px] truncate">
              {contact.channel === 'instagram'
                ? `@${contact.instagram_username || contact.phone}`
                : contact.phone}
            </span>
            {contact.last_interaction_at && (
              <>
                <span className="text-slate-300 dark:text-[#232A3B] shrink-0">·</span>
                <span
                  title={formatInboxConversationDate(contact.last_interaction_at).tooltip}
                  className="text-[11px] text-slate-400 dark:text-slate-500 font-sans shrink-0"
                >
                  {formatInboxConversationDate(contact.last_interaction_at).label}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Lado Derecho: Asignación, Switch IA, Cerrar y Toolbar de Iconos (Altura h-8 Uniforme) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Selector de Asignación Slim */}
        {isAdminOrSupervisor ? (
          <div className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/80 dark:bg-[#090A0F] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={contact.assigned_to || 'unassigned'}
              onChange={(e) => onReassignLead(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="unassigned" className="bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300">
                Sin Asignar
              </option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id} className="bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300">
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
            className="h-8 px-2.5 bg-[#0052FF] hover:bg-[#0043D4] text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {isClaiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Tomar chat</span>
          </button>
        ) : isAssignedToMe ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 bg-blue-50/80 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200/80 dark:border-[#00D2FF]/20 rounded-xl text-xs font-semibold">
            <User className="w-3.5 h-3.5" /> Asignado a ti
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 bg-slate-100/80 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs font-medium">
            <User className="w-3.5 h-3.5 text-slate-400" /> {assignedMember?.full_name?.split(' ')[0] || 'Asesor'}
          </span>
        )}

        {/* Switch IA en Cápsula Apple HIG */}
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
              className="h-8 px-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reabrir</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onCloseChat}
            className="h-8 px-2.5 rounded-xl border border-slate-200 dark:border-[#232A3B] hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 bg-white dark:bg-[#131722] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Finalizar o archivar chat (Atajo E)"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Cerrar</span>
          </button>
        )}

        {/* Separador vertical fino */}
        <div className="h-4 w-px bg-slate-200 dark:bg-[#232A3B] hidden sm:block mx-0.5" />

        {/* Toolbar Integrada de Iconos (h-8 w-8) */}
        <div className="flex items-center gap-1">
          {/* Botón Buscar en la Conversación */}
          {onToggleSearch && (
            <button
              type="button"
              onClick={onToggleSearch}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition cursor-pointer ${
                isSearchOpen
                  ? 'bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-[#00D2FF]/30'
                  : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-slate-200 dark:border-[#232A3B] hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
              }`}
              title="Buscar en la conversación"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Botón Alternar Panel Derecho de Contacto */}
          <button
            type="button"
            onClick={onToggleRightPanel}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition cursor-pointer ${
              isRightPanelOpen
                ? 'bg-blue-50 dark:bg-[#0052FF]/15 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-[#00D2FF]/30'
                : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-slate-200 dark:border-[#232A3B] hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
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
              className="w-8 h-8 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1A1F2C] flex items-center justify-center transition cursor-pointer"
              title="Más opciones"
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
    </div>
  );
}
