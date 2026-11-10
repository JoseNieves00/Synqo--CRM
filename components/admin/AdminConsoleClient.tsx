'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  MessageSquare,
  ShieldCheck,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
  PauseCircle,
  PlayCircle,
  ExternalLink,
  Lock,
  Zap,
  KeyRound,
  Copy,
  Check,
  Receipt,
  CreditCard,
  Calendar,
  LifeBuoy,
  Sparkles,
  Info,
  QrCode,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCheck,
  User,
  Mail,
  Loader2,
} from 'lucide-react';
import { AdminTicketsTab } from './AdminTicketsTab';
import { AdminCopilotTab } from './AdminCopilotTab';
import { AdminAlertsTab } from './AdminAlertsTab';
import { ProvisionWizard } from './ProvisionWizard';
import {
  OrganizationRow,
  EnabledModules,
  listAllOrganizations,
  updateCompanySeats,
  toggleCompanyStatus,
  updateCompanyDetails,
  updateOrganizationModules,
  regenerateCompanyAdminPassword,
  registerCompanyPayment,
} from '@/app/actions/superadmin';
import {
  formatTokenQuota,
  formatTokenDetailed,
  estimateChatsFromTokens,
} from '@/lib/billing/plan-defaults';

interface Metrics {
  totalOrganizations: number;
  activeOrganizations: number;
  totalContacts: number;
  totalMessages: number;
  totalProfiles: number;
  totalAiTokensUsed?: number;
  billingSummary?: {
    paidCount: number;
    pendingCount: number;
    graceCount: number;
    moraCount: number;
  };
}

interface AdminConsoleClientProps {
  initialMetrics: Metrics;
  initialOrganizations: OrganizationRow[];
  initialTickets?: any[];
}

export default function AdminConsoleClient({
  initialMetrics,
  initialOrganizations,
  initialTickets = [],
}: AdminConsoleClientProps) {
  const [mainTab, setMainTab] = useState<'companies' | 'tickets' | 'alerts' | 'copilot'>('companies');
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>(initialOrganizations);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationRow | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSeats, setEditSeats] = useState<number>(2);
  const [editTokensLimit, setEditTokensLimit] = useState<number>(500000);
  const [editResetTokens, setEditResetTokens] = useState<boolean>(false);
  const [editTokenAlertThresholds, setEditTokenAlertThresholds] = useState<string>('80, 90, 100');
  const [editModules, setEditModules] = useState<EnabledModules>({
    native_calendar: true,
    physical_rooms: false,
    staff_mobile_portal: false,
    quick_pay: false,
    anti_no_show: true,
  });
  const [editCompanyCode, setEditCompanyCode] = useState<string>('');
  const [editWaProvider, setEditWaProvider] = useState<'meta' | 'evolution'>('meta');
  const [editEvolutionApiUrl, setEditEvolutionApiUrl] = useState('');
  const [editEvolutionApiKey, setEditEvolutionApiKey] = useState('');
  const [editEvolutionInstanceName, setEditEvolutionInstanceName] = useState('');
  const [editEvolutionAntiBan, setEditEvolutionAntiBan] = useState(true);
  const [editEvolutionMaxOutbound, setEditEvolutionMaxOutbound] = useState(50);
  const [editSpecialistLabel, setEditSpecialistLabel] = useState('Colaborador');
  const [editRoomLabel, setEditRoomLabel] = useState('Espacio');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [regeneratedAdmin, setRegeneratedAdmin] = useState<{
    orgName: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);

  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const handleOpenProvisionModal = () => {
    setIsProvisionOpen(true);
  };

  // Filtro de cobranza
  const [billingFilter, setBillingFilter] = useState<'all' | 'al_dia' | 'pendiente' | 'mora'>('all');
  // Filtro de alta demanda / consumo de IA
  const [usageFilter, setUsageFilter] = useState<'all' | 'warning_80'>('all');

  // Estado para modal de actualización de cobertura/pago
  const [payingOrg, setPayingOrg] = useState<OrganizationRow | null>(null);
  const [payMonth, setPayMonth] = useState<string>(currentMonthStr);

  useEffect(() => {
    if (editingOrg || payingOrg) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [editingOrg, payingOrg]);

  const getNextMonthStr = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  };

  const getNextYearStr = () => {
    const now = new Date();
    const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    return `${nextYear.getFullYear()}-${String(nextYear.getMonth() + 1).padStart(2, '0')}`;
  };

  // Filtrado de organizaciones
  const filteredOrgs = organizations.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.admin_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.admin_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.id.includes(searchQuery);

    if (!matchesSearch) return false;

    if (billingFilter === 'al_dia') {
      return org.billing_status === 'al_dia';
    }
    if (billingFilter === 'pendiente') {
      return org.billing_status === 'pendiente' || org.billing_status === 'gracia';
    }
    if (billingFilter === 'mora') {
      return (
        org.billing_status === 'mora_preventiva' ||
        org.billing_status === 'baja_definitiva' ||
        !org.is_active
      );
    }

    if (usageFilter === 'warning_80') {
      const used = org.ai_tokens_used || 0;
      const limit = org.ai_tokens_limit || 100000;
      if (used / limit < 0.8) return false;
    }

    return true;
  });

  const highUsageCount = organizations.filter((org) => {
    const used = org.ai_tokens_used || 0;
    const limit = org.ai_tokens_limit || 100000;
    return used / limit >= 0.8;
  }).length;

  const handleOpenPayModal = (org: OrganizationRow) => {
    setPayingOrg(org);
    const isAlreadyCovered = org.paid_until_month && org.paid_until_month >= currentMonthStr;
    setPayMonth(isAlreadyCovered ? getNextMonthStr() : currentMonthStr);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingOrg) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await registerCompanyPayment({
        organizationId: payingOrg.id,
        periodMonth: payMonth,
      });

      const isFuture = payMonth > currentMonthStr;
      const newLabel = isFuture ? `Al día (hasta ${payMonth})` : `Al día (${payMonth})`;

      setSuccessMsg(`Estado actualizado para "${payingOrg.name}" hasta ${payMonth}. Cuenta al día.`);
      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === payingOrg.id
            ? {
                ...o,
                is_active: true,
                subscription_status: 'active',
                paid_until_month: payMonth,
                days_past_due: 0,
                billing_status: 'al_dia',
                billing_status_label: newLabel,
                billing_status_color: 'emerald',
                ai_tokens_used: 0,
              }
            : o
        )
      );
      setPayingOrg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar estado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (org: OrganizationRow) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditSeats(org.max_users);
    setEditTokensLimit(org.ai_tokens_limit || 500000);
    setEditResetTokens(false);
    const policyThresholds = (org.appointment_settings as any)?.token_policy?.alertThresholds;
    setEditTokenAlertThresholds(
      Array.isArray(policyThresholds) && policyThresholds.length > 0
        ? policyThresholds.join(', ')
        : '80, 90, 100'
    );
    setEditModules(org.enabled_modules || {
      native_calendar: true,
      physical_rooms: false,
      staff_mobile_portal: false,
      quick_pay: false,
      anti_no_show: true,
    });
    setEditCompanyCode(org.company_code || '');
    setEditWaProvider(
      org.whatsapp_provider === 'evolution' || org.evolution_instance_name
        ? 'evolution'
        : 'meta'
    );
    setEditEvolutionApiUrl(org.evolution_api_url || '');
    setEditEvolutionApiKey('');
    setEditEvolutionInstanceName(org.evolution_instance_name || '');
    setEditEvolutionAntiBan(org.evolution_anti_ban_mode ?? true);
    setEditEvolutionMaxOutbound(org.evolution_max_outbound_per_hour ?? 50);
    setEditSpecialistLabel(org.specialist_label || 'Colaborador');
    setEditRoomLabel(org.room_label || 'Espacio');
  };

  const handleUpdateCompanyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    if (editSeats < editingOrg.users_count) {
      setErrorMsg(
        `No puedes reducir a ${editSeats} usuarios porque la empresa tiene ${editingOrg.users_count} usuarios activos.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await updateCompanyDetails({
        organizationId: editingOrg.id,
        name: editName,
        maxUsers: editSeats,
        aiTokensLimit: editTokensLimit,
        resetTokensUsed: editResetTokens,
        tokenAlertThresholds: editTokenAlertThresholds,
        enabledModules: editModules,
        companyCode: editCompanyCode,
        whatsappProvider: editWaProvider,
        evolutionApiUrl: editEvolutionApiUrl.trim() || undefined,
        evolutionApiKey: editEvolutionApiKey.trim() || undefined,
        evolutionInstanceName: editEvolutionInstanceName.trim() || undefined,
        evolutionAntiBanMode: editEvolutionAntiBan,
        evolutionMaxOutboundPerHour: editEvolutionMaxOutbound,
        specialistLabel: editSpecialistLabel,
        roomLabel: editRoomLabel,
      });

      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === editingOrg.id
            ? {
                ...o,
                name: editName,
                max_users: editSeats,
                ai_tokens_limit: editTokensLimit,
                ai_tokens_used: editResetTokens ? 0 : o.ai_tokens_used,
                enabled_modules: editModules,
                companyCode: editCompanyCode,
                whatsapp_provider: editWaProvider,
                evolution_api_url: editEvolutionApiUrl.trim() || null,
                evolution_instance_name: editEvolutionInstanceName.trim() || null,
                evolution_anti_ban_mode: editEvolutionAntiBan,
                evolution_max_outbound_per_hour: editEvolutionMaxOutbound,
                specialist_label: editSpecialistLabel,
                room_label: editRoomLabel,
              }
            : o
        )
      );

      setSuccessMsg(`Empresa "${editName}" actualizada exitosamente.`);
      setEditingOrg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (org: OrganizationRow) => {
    const newStatus = !org.is_active;
    try {
      await toggleCompanyStatus(org.id, newStatus);
      setOrganizations((prev) =>
        prev.map((o) => (o.id === org.id ? { ...o, is_active: newStatus } : o))
      );
      setSuccessMsg(`Empresa "${org.name}" ${newStatus ? 'reactivada' : 'suspendida'} correctamente.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cambiar estado.');
    }
  };

  const handleRegenerateAdminPassword = async (org: OrganizationRow) => {
    setIsRegenerating(org.id);
    setErrorMsg(null);
    try {
      const res = await regenerateCompanyAdminPassword(org.id);
      setRegeneratedAdmin({
        orgName: org.name,
        email: res.email,
        tempPassword: res.tempPassword,
      });
      setSuccessMsg(`Contraseña temporal regenerada para el administrador de "${org.name}".`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error regenerando contraseña.');
    } finally {
      setIsRegenerating(null);
    }
  };

  const handleCopyPassword = () => {
    if (!regeneratedAdmin) return;
    navigator.clipboard.writeText(regeneratedAdmin.tempPassword);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Notificaciones */}
      {regeneratedAdmin && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-400 text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center flex-shrink-0 font-bold shadow-sm">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                Nueva Contraseña Temporal Generada ({regeneratedAdmin.orgName})
              </p>
              <p className="text-[11px] text-amber-800">
                Admin: <code className="font-mono font-semibold">{regeneratedAdmin.email}</code>
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-slate-600">Clave Temporal:</span>
                <span className="font-mono bg-white px-2.5 py-0.5 rounded-lg border border-amber-300 text-xs font-bold text-slate-950 select-all">
                  {regeneratedAdmin.tempPassword}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleCopyPassword}
              className="px-3.5 py-1.5 bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey ? 'Copiada' : 'Copiar Clave'}
            </button>
            <button
              onClick={() => setRegeneratedAdmin(null)}
              className="text-xs text-gray-500 hover:text-gray-800 font-semibold px-2 py-1 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-medium">{successMsg}</p>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
          >
            Cerrar
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs text-rose-700 hover:text-rose-900 font-semibold"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Pestañas Principales del Super Admin */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3 overflow-x-auto scrollbar-none whitespace-nowrap -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setMainTab('companies')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0 ${
            mainTab === 'companies'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>
            <span className="hidden sm:inline">Empresas & Facturación</span>
            <span className="sm:hidden">Empresas</span> ({organizations.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('tickets')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0 ${
            mainTab === 'tickets'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <LifeBuoy className="w-4 h-4 text-rose-500" />
          <span>
            <span className="hidden sm:inline">Soporte & GitHub Issues</span>
            <span className="sm:hidden">Tickets Soporte</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('alerts')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0 ${
            mainTab === 'alerts'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          <span>
            <span className="hidden sm:inline">Alertas & Comunicados</span>
            <span className="sm:hidden">Alertas Ops</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('copilot')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex-shrink-0 ${
            mainTab === 'copilot'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-[#00D2FF]" />
          <span>
            <span className="hidden sm:inline">Admin Copilot (IA)</span>
            <span className="sm:hidden">Copilot IA</span>
          </span>
        </button>
      </div>

      {mainTab === 'companies' && (
        <>
          {/* Tarjetas de Métricas de Plataforma */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-5">
        <div className="p-3.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Empresas
            </span>
            <div className="p-2 sm:p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">{metrics.totalOrganizations}</span>
            <span className="text-[10px] sm:text-xs text-emerald-600 font-semibold truncate">
              ({metrics.activeOrganizations} activas)
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
              Usuarios Equipo
            </span>
            <div className="p-2 sm:p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">{metrics.totalProfiles}</span>
            <span className="text-[10px] sm:text-xs text-gray-500 truncate">en plataforma</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
              Leads Totales
            </span>
            <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">{metrics.totalContacts}</span>
            <span className="text-[10px] sm:text-xs text-emerald-600 font-medium truncate">WhatsApp</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
              Mensajes
            </span>
            <div className="p-2 sm:p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">{metrics.totalMessages}</span>
            <span className="text-[10px] sm:text-xs text-amber-600 font-medium truncate">IA & Agentes</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-5 bg-white rounded-2xl border border-gray-200 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
              Tokens OpenAI
            </span>
            <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900">
              {metrics.totalAiTokensUsed ? (metrics.totalAiTokensUsed > 1000000 ? `${(metrics.totalAiTokensUsed / 1000000).toFixed(1)}M` : `${Math.round(metrics.totalAiTokensUsed / 1000)}k`) : '0'}
            </span>
            <span className="text-[10px] sm:text-xs text-emerald-600 font-medium truncate">Consumo Total</span>
          </div>
        </div>
      </div>

      {/* Barra de Control de Cobranza Mensual & Alertas */}
      {metrics.billingSummary && (
        <div className="p-5 bg-[#131722] rounded-2xl border border-[#232A3B] text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#0052FF]/20 text-[#00D2FF] rounded-2xl border border-[#00D2FF]/20 flex-shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Control de Cobranza Mensual
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  Ciclo Día 1 al 5
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Seguimiento de pagos manuales según Condiciones de Servicio (Mora preventiva al día 10).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setBillingFilter('al_dia')}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition cursor-pointer ${
                billingFilter === 'al_dia'
                  ? 'bg-emerald-500 text-white border-emerald-400 font-bold'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{metrics.billingSummary.paidCount} Al día</span>
            </button>

            <button
              onClick={() => setBillingFilter('pendiente')}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition cursor-pointer ${
                billingFilter === 'pendiente'
                  ? 'bg-amber-500 text-white border-amber-400 font-bold'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{metrics.billingSummary.pendingCount + metrics.billingSummary.graceCount} Pendientes / Gracia</span>
            </button>

            <button
              onClick={() => setBillingFilter('mora')}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition cursor-pointer ${
                billingFilter === 'mora'
                  ? 'bg-rose-500 text-white border-rose-400 font-bold'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>{metrics.billingSummary.moraCount} En Mora (10d+)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUsageFilter(usageFilter === 'warning_80' ? 'all' : 'warning_80');
                if (billingFilter !== 'all') setBillingFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition cursor-pointer ${
                usageFilter === 'warning_80'
                  ? 'bg-amber-500 text-white border-amber-400 font-bold shadow-xs'
                  : highUsageCount > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-500'
              }`}
              title="Filtrar empresas que han alcanzado el 80% o más de su capacidad de IA"
            >
              <span className={`w-2 h-2 rounded-full ${highUsageCount > 0 ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
              <span>🔥 {highUsageCount} Alta Demanda (80%+)</span>
            </button>

            {(billingFilter !== 'all' || usageFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setBillingFilter('all');
                  setUsageFilter('all');
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controles y Tabla de Empresas */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Empresas Aprovisionadas</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Administración centralizada de clientes multi-tenant, cupos de agentes y credenciales.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Buscador */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar empresa o admin..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF]"
              />
            </div>

            {/* Botón Provisionar */}
            <button
              onClick={handleOpenProvisionModal}
              className="px-4 py-2 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer shadow-[#0052FF]/20"
            >
              <Plus className="w-4 h-4" />
              Nueva Empresa
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-5">Empresa</th>
                <th className="py-3 px-5">Administrador</th>
                <th className="py-3 px-5">Usuarios</th>
                <th className="py-3 px-5">Tokens IA</th>
                <th className="py-3 px-5">Cobranza & Ciclo</th>
                <th className="py-3 px-5">Leads</th>
                <th className="py-3 px-5">Estado</th>
                <th className="py-3 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">
                    No se encontraron organizaciones registradas.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const seatsFull = org.users_count >= org.max_users;
                  const seatPercentage = Math.min(100, (org.users_count / org.max_users) * 100);
                  const tokenUsed = org.ai_tokens_used || 0;
                  const tokenLimit = org.ai_tokens_limit || 100000;
                  const tokenPct = Math.min(100, Math.round((tokenUsed / tokenLimit) * 100));
                  const isHighUsage = tokenPct >= 80;
                  const isExceeded = tokenPct >= 100;

                  return (
                    <tr
                      key={org.id}
                      className={`transition ${
                        isExceeded
                          ? 'bg-rose-50/50 hover:bg-rose-50/80 border-l-4 border-l-rose-500'
                          : isHighUsage
                          ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-l-amber-500'
                          : 'hover:bg-gray-50/50'
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{org.name}</span>
                          {org.is_exempt && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <ShieldCheck className="w-3 h-3 text-amber-600" />
                              Super Admin
                            </span>
                          )}
                          {isExceeded ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200"
                              title="Capacidad de IA completada (100%)"
                            >
                              🚨 Límite
                            </span>
                          ) : isHighUsage ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                              title="Alta Demanda (80%+ de capacidad utilizada)"
                            >
                              🔥 {tokenPct}%
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{org.id.slice(0, 8)}...</span>
                          {org.company_code && (
                            <span className="text-purple-700 font-semibold font-mono flex items-center gap-1">
                              • <KeyRound className="w-3 h-3 text-purple-500" /> {org.company_code}
                            </span>
                          )}
                        </div>
                        {(org.specialist_label || org.room_label) && (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 flex-wrap">
                            {org.specialist_label && (
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                👥 {org.specialist_label}s
                              </span>
                            )}
                            {org.room_label && (
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                🏠 {org.room_label}s
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-medium text-gray-800">{org.admin_name || 'Sin nombre'}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{org.admin_email}</div>
                      </td>

                      <td className="py-3.5 px-5 min-w-[150px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-semibold ${seatsFull ? 'text-amber-600' : 'text-gray-700'}`}>
                            {org.users_count} / {org.max_users} usuarios
                          </span>
                          <button
                            onClick={() => handleOpenEditModal(org)}
                            title="Editar empresa y límite de usuarios"
                            className="text-gray-400 hover:text-emerald-600 transition cursor-pointer p-0.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              seatsFull ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${seatPercentage}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-5 min-w-[155px]">
                        {(() => {
                          const used = org.ai_tokens_used || 0;
                          const limit = org.ai_tokens_limit || 100000;
                          const pct = Math.min(100, Math.round((used / limit) * 100));
                          const isWarn = pct >= 80 && pct < 100;
                          const isOver = pct >= 100;

                          const googleUsed = org.ai_tokens_google_used ?? (org.ai_tokens_used ? Math.max(0, org.ai_tokens_used - (org.ai_tokens_openai_used || 0)) : 0);
                          const openaiUsed = org.ai_tokens_openai_used || 0;
                          const openaiLimit = org.ai_tokens_openai_backup_limit || 50000;
                          const hasUsedBackup = openaiUsed > 0;

                          return (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span
                                  className={`font-mono font-semibold ${isOver ? 'text-rose-600' : isWarn ? 'text-amber-600' : 'text-gray-700'}`}
                                  title={`Total acumulado: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens`}
                                >
                                  {formatTokenQuota(used)} / {formatTokenQuota(limit)}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  isOver ? 'bg-rose-100 text-rose-700' : isWarn ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {pct}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              {/* Trazabilidad Dual: Google (Costo $0) vs OpenAI (Backup Emergencia) */}
                              <div className="flex items-center gap-1.5 text-[10px] pt-0.5">
                                <span
                                  className="inline-flex items-center gap-1 text-emerald-700 font-medium"
                                  title={`Google Gemini Flash (Costo $0): ${googleUsed.toLocaleString()} tokens consumidos`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  G: {formatTokenQuota(googleUsed)}
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded ${
                                    hasUsedBackup
                                      ? 'bg-amber-100 text-amber-800 font-semibold border border-amber-200'
                                      : 'text-gray-400'
                                  }`}
                                  title={`OpenAI Backup (Emergencia): ${openaiUsed.toLocaleString()} / ${openaiLimit.toLocaleString()} tokens`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${hasUsedBackup ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
                                  OpenAI: {formatTokenQuota(openaiUsed)}
                                </span>
                              </div>

                              {org.prompt_assistant_stats && (org.prompt_assistant_stats.tokensToday > 0 || org.prompt_assistant_stats.totalTokens > 0) && (
                                <div className="flex items-center gap-1.5 text-[10px] pt-0.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border ${
                                      org.prompt_assistant_stats.capExceededToday
                                        ? 'bg-rose-100 text-rose-700 border-rose-200 font-bold'
                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                    }`}
                                    title={`Uso del Asistente de Prompt (cortesía Synqo): ${org.prompt_assistant_stats.tokensToday.toLocaleString()} / ${org.prompt_assistant_stats.dailyCap.toLocaleString()} tokens hoy (${org.prompt_assistant_stats.totalTokens.toLocaleString()} acumulados)`}
                                  >
                                    {org.prompt_assistant_stats.capExceededToday ? '⚠️ Tope Asistente:' : 'Asist:'}{' '}
                                    {formatTokenQuota(org.prompt_assistant_stats.tokensToday)} / {formatTokenQuota(org.prompt_assistant_stats.dailyCap)} hoy
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Cobranza & Mensualidad */}
                      <td className="py-3.5 px-5 min-w-[150px]">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              org.billing_status_color === 'emerald'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : org.billing_status_color === 'blue'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : org.billing_status_color === 'amber'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : org.billing_status_color === 'purple'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                org.billing_status_color === 'emerald'
                                  ? 'bg-emerald-500'
                                  : org.billing_status_color === 'amber'
                                  ? 'bg-amber-500'
                                  : org.billing_status_color === 'purple'
                                  ? 'bg-purple-500'
                                  : 'bg-rose-500 animate-pulse'
                              }`}
                            />
                            {org.billing_status_label || (org.is_active ? 'Al día' : 'En mora')}
                          </span>

                          {org.is_exempt ? (
                            <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1 mt-0.5">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Cuenta Exenta
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenPayModal(org)}
                              className="text-[11px] font-semibold text-[#0052FF] hover:text-[#0047E0] hover:underline flex items-center gap-1 cursor-pointer w-fit mt-0.5"
                            >
                              <Receipt className="w-3 h-3" />
                              Registrar pago
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-5 font-semibold text-gray-700">
                        {org.contacts_count}
                      </td>

                      <td className="py-3.5 px-5">
                        {org.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Suspendida
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right flex items-center justify-end gap-1">
                        {isHighUsage && (
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(
                              `Hola ${org.admin_name || 'Admin'} de ${org.name}, te escribo de Synqo CRM. Vemos que tu negocio ha tenido alta demanda este mes (${tokenPct}% de capacidad de IA alcanzada). ¿Deseas activar un paquete de expansión de conversaciones para no pausar la IA?`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                            title="Contactar al Administrador por WhatsApp para ofrecer Paquete de Expansión (Upsell)"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </a>
                        )}

                        <button
                          onClick={() => handleOpenEditModal(org)}
                          className="p-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-[#0052FF] hover:bg-[#0052FF]/10 transition cursor-pointer"
                          title="Editar empresa (Plan, Usuarios, Módulos y Tokens)"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {org.admin_email?.toLowerCase() === 'admin@synqo.dev' ? (
                          <span
                            className="p-1.5 text-gray-300 cursor-not-allowed inline-flex items-center"
                            title="La contraseña del Super Admin solo se cambia por terminal (npm run reset-superadmin)"
                          >
                            <KeyRound className="w-4 h-4 opacity-30 text-gray-400" />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRegenerateAdminPassword(org)}
                            disabled={isRegenerating === org.id}
                            className="p-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-[#0052FF] hover:bg-[#0052FF]/10 transition cursor-pointer disabled:opacity-50"
                            title="Regenerar contraseña temporal del Administrador"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleStatus(org)}
                          className={`p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            org.is_active
                              ? 'text-rose-600 hover:bg-rose-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={org.is_active ? 'Suspender empresa' : 'Reactivar empresa'}
                        >
                          {org.is_active ? (
                            <PauseCircle className="w-4 h-4" />
                          ) : (
                            <PlayCircle className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )}

  {mainTab === 'tickets' && (
    <AdminTicketsTab initialTickets={initialTickets} />
  )}

  {mainTab === 'alerts' && (
    <AdminAlertsTab />
  )}

  {mainTab === 'copilot' && (
    <AdminCopilotTab />
  )}

      {/* Wizard: Aprovisionar Nueva Empresa */}
      {isProvisionOpen && (
        <ProvisionWizard
          onSuccess={async () => {
            setIsProvisionOpen(false);
            try {
              const updated = await listAllOrganizations();
              setOrganizations(updated);
            } catch {
              window.location.reload();
            }
          }}
          onCancel={() => setIsProvisionOpen(false)}
        />
      )}

      {/* Modal: Editar Empresa (Plan, Usuarios, Tokens) — Diseño Horizontal Adaptativo */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Cabecera Pinned */}
            <div className="shrink-0 px-6 py-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center font-bold shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    Editar Empresa: <span>{editingOrg.name}</span>
                  </h3>
                  <p className="text-xs text-gray-500">
                    Ajuste de plan comercial, límite de usuarios y asignación de tokens IA para el mes en curso.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-200/60 transition cursor-pointer text-sm font-semibold"
                title="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCompanyDetails} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 [scrollbar-width:thin]">
                {/* Layout Horizontal de 2 Columnas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Columna Izquierda: Información de Empresa & Equipo */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Nombre Comercial de la Empresa *
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ej. Clínica Dental Sonrisas"
                      className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 font-medium transition shadow-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        Límite de Usuarios
                      </label>
                      <span className="text-[11px] text-gray-500 font-medium">
                        En uso: <strong className="text-gray-900">{editingOrg.users_count}</strong> activos
                      </span>
                    </div>
                    <input
                      type="number"
                      min={editingOrg.users_count || 1}
                      max={500}
                      value={editSeats}
                      onChange={(e) => setEditSeats(parseInt(e.target.value, 10) || 1)}
                      className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 font-medium transition shadow-xs"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Protección de integridad: No se puede reducir por debajo de {editingOrg.users_count} miembros activos.
                    </p>
                  </div>

                  {/* Nomenclatura Personalizada (Multi-Nicho - Condicionada por módulos) */}
                  {(editModules.native_calendar || editModules.staff_mobile_portal || editModules.physical_rooms) ? (
                    <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-3 animate-in fade-in">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#0052FF]" />
                        Nomenclatura y Roles Personalizados
                      </span>
                      <div className={`grid gap-3 ${(editModules.native_calendar || editModules.staff_mobile_portal) && editModules.physical_rooms ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {(editModules.native_calendar || editModules.staff_mobile_portal) && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Nombre Colaboradores
                            </label>
                            <input
                              type="text"
                              value={editSpecialistLabel}
                              onChange={(e) => setEditSpecialistLabel(e.target.value)}
                              placeholder="Doctor, Barbero, etc."
                              className="w-full h-9 px-3 text-xs rounded-xl border border-blue-200 bg-white focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 font-semibold text-slate-800 transition"
                            />
                          </div>
                        )}
                        {editModules.physical_rooms && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Nombre Espacios
                            </label>
                            <input
                              type="text"
                              value={editRoomLabel}
                              onChange={(e) => setEditRoomLabel(e.target.value)}
                              placeholder="Consultorio, Cabina, etc."
                              className="w-full h-9 px-3 text-xs rounded-xl border border-blue-200 bg-white focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 font-semibold text-slate-800 transition"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Sin módulos de agenda o espacios activos. Nomenclatura no requerida.</span>
                    </div>
                  )}

                  {/* Tarjeta de Resumen Rápido / Cortesía de soporte */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[11px] font-bold text-slate-700 block">
                      Cortesía de Soporte Técnico
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                      <input
                        type="checkbox"
                        checked={editResetTokens}
                        onChange={(e) => setEditResetTokens(e.target.checked)}
                        className="rounded text-[#0052FF] focus:ring-[#0052FF]/20 w-4 h-4"
                      />
                      <span>Reiniciar tokens consumidos a 0 ahora</span>
                    </label>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 mt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Google Gemini (Primario • $0):
                        </span>
                        <strong className="font-mono text-slate-800">
                          {((editingOrg.ai_tokens_google_used ?? (editingOrg.ai_tokens_used ? Math.max(0, editingOrg.ai_tokens_used - (editingOrg.ai_tokens_openai_used || 0)) : 0))).toLocaleString()} tokens
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${editingOrg.ai_tokens_openai_used ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
                          OpenAI Backup (Emergencia):
                        </span>
                        <strong className="font-mono text-slate-800">
                          {(editingOrg.ai_tokens_openai_used || 0).toLocaleString()} / {(editingOrg.ai_tokens_openai_backup_limit || 25000).toLocaleString()} tokens
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Gestión de Tokens IA y Boosters */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                  <div className="space-y-3">
                    {/* Cabecera con consumo actual y porcentaje */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                        Límite Mensual de Tokens IA
                      </span>
                      <span className="text-[11px] font-mono text-slate-600 font-semibold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {Math.min(100, Math.round(((editingOrg.ai_tokens_used || 0) / editTokensLimit) * 100))}% consumido
                      </span>
                    </div>

                    {/* Tarjeta destacada con el límite actual seleccionado en texto legible y estimación */}
                    <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Cuota Asignada
                        </span>
                        <div className="text-base font-black text-[#0052FF]">
                          {formatTokenDetailed(editTokensLimit)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Capacidad Estimada
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {estimateChatsFromTokens(editTokensLimit)}
                        </span>
                      </div>
                    </div>

                    {/* Chips de selección rápida por niveles oficiales */}
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Niveles Predefinidos (1 Clic):
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { tokens: 500000, label: '500k', sub: 'Starter' },
                          { tokens: 1000000, label: '1M', sub: '1 Millón' },
                          { tokens: 2500000, label: '2.5M', sub: 'Pro' },
                          { tokens: 5000000, label: '5M', sub: '5 Millones' },
                          { tokens: 7500000, label: '7.5M', sub: 'Enterprise' },
                          { tokens: 10000000, label: '10M', sub: '10 Millones' },
                        ].map((tier) => {
                          const isSelected = editTokensLimit === tier.tokens;
                          return (
                            <button
                              key={tier.tokens}
                              type="button"
                              onClick={() => setEditTokensLimit(tier.tokens)}
                              className={`py-1 px-2 rounded-xl text-center border transition cursor-pointer ${
                                isSelected
                                  ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                              }`}
                            >
                              <span className="block text-xs font-bold leading-tight">{tier.label}</span>
                              <span className={`block text-[9px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                {tier.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Boosters Rápidos de 1 Clic (+1M, +500k, Restablecer base) */}
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Paquetes Booster (Mes en Curso):
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditTokensLimit((prev) => prev + 1000000)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                          title="Suma 1 Millón de tokens (1M) al límite del mes actual"
                        >
                          +1M Booster
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditTokensLimit((prev) => prev + 500000)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer"
                          title="Suma 500k tokens al límite del mes actual"
                        >
                          +500k Extra
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditTokensLimit(500000)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                          title="Restablece a la cuota base de 500k tokens"
                        >
                          ↺ 500k Base
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Input manual alternativo para custom exacto */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={100000}
                        min={100000}
                        max={100000000}
                        value={editTokensLimit}
                        onChange={(e) => setEditTokensLimit(parseInt(e.target.value, 10) || 100000)}
                        placeholder="Cantidad manual..."
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-mono font-semibold text-slate-800"
                      />
                      <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1.5 rounded-xl border border-gray-300 font-mono flex-shrink-0 shadow-2xs">
                        {formatTokenQuota(editTokensLimit)}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 italic">
                      Asigna la cuota base mensual de tokens IA (en Modo Excedente el bot no se detiene al 100%).
                    </p>

                    <div className="pt-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Umbrales Push de Aviso (% separados por coma):
                      </label>
                      <input
                        type="text"
                        value={editTokenAlertThresholds}
                        onChange={(e) => setEditTokenAlertThresholds(e.target.value)}
                        placeholder="80, 90, 100"
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-mono text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección de Módulos Activos (Por Empresa / Plan) */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#0052FF]" />
                      Módulos Habilitados en la Empresa (Control Modular)
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Activa o desactiva funcionalidades según el plan de suscripción acordado.
                    </p>
                  </div>
                  {/* Código de Empresa para Colaboradores */}
                  <div className="flex items-center gap-1.5 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-700">Código Equipo:</span>
                    <input
                      type="text"
                      value={editCompanyCode}
                      onChange={(e) => setEditCompanyCode(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      className="w-24 text-xs font-mono font-black text-purple-900 bg-transparent uppercase border-b border-purple-300 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 1. Calendario Nativo */}
                  <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    editModules.native_calendar ? 'bg-blue-50/50 border-[#0052FF]/30' : 'bg-gray-50/50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editModules.native_calendar}
                      onChange={(e) => setEditModules(prev => ({ ...prev, native_calendar: e.target.checked }))}
                      className="mt-0.5 rounded text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#0052FF]" />
                        Calendario Nativo
                      </span>
                      <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                        Agendamiento nativo multi-especialista con Synqo AI y horarios propios.
                      </span>
                    </div>
                  </label>

                  {/* 2. Salones y Espacios Físicos */}
                  <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    editModules.physical_rooms ? 'bg-blue-50/50 border-[#0052FF]/30' : 'bg-gray-50/50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editModules.physical_rooms}
                      onChange={(e) => setEditModules(prev => ({ ...prev, physical_rooms: e.target.checked }))}
                      className="mt-0.5 rounded text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#0052FF]" />
                        Salones y Espacios Físicos
                      </span>
                      <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                        Control de cupos por sala, acústica y clases individuales o grupales.
                      </span>
                    </div>
                  </label>

                  {/* 3. Portal Móvil Colaboradores */}
                  <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    editModules.staff_mobile_portal ? 'bg-blue-50/50 border-[#0052FF]/30' : 'bg-gray-50/50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editModules.staff_mobile_portal}
                      onChange={(e) => setEditModules(prev => ({ ...prev, staff_mobile_portal: e.target.checked }))}
                      className="mt-0.5 rounded text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#0052FF]" />
                        Portal Móvil Colaboradores
                      </span>
                      <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                        Acceso con PIN para barberos/profes: agenda de hoy, bloqueos y chat con sede.
                      </span>
                    </div>
                  </label>

                  {/* 4. Pagos Rápidos */}
                  <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    editModules.quick_pay ? 'bg-blue-50/50 border-[#0052FF]/30' : 'bg-gray-50/50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editModules.quick_pay}
                      onChange={(e) => setEditModules(prev => ({ ...prev, quick_pay: e.target.checked }))}
                      className="mt-0.5 rounded text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#0052FF]" />
                        Pagos Rápidos y Cobro
                      </span>
                      <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                        Registro opcional de método de pago (Efectivo, Nequi, Datáfono).
                      </span>
                    </div>
                  </label>

                  {/* 5. Protocolo Anti-No-Show (Solo si Calendario Nativo está activo) */}
                  {editModules.native_calendar && (
                  <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition sm:col-span-2 ${
                    editModules.anti_no_show ? 'bg-emerald-50/50 border-emerald-300' : 'bg-gray-50/50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editModules.anti_no_show}
                      onChange={(e) => setEditModules(prev => ({ ...prev, anti_no_show: e.target.checked }))}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Protocolo Anti-No-Show (Confirmación 8h)
                        {editWaProvider === 'evolution' && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold">
                            Evolution API (Sin costo por mensaje)
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">
                        Recordatorio automático diurno (máx 8pm) y liberación de cupo si no confirman 8h antes.
                      </span>
                    </div>
                  </label>
                  )}
                </div>

                {/* Módulo WhatsApp Engine en Edición: Meta vs Evolution API */}
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-[#0052FF]" />
                      Motor de Mensajería WhatsApp Asignado
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Configurado exclusivamente desde esta consola de Super Admin. Si activas Evolution API, el cliente solo verá el QR para escanear en sus Ajustes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                        editWaProvider === 'evolution'
                          ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editWaProvider"
                        value="evolution"
                        checked={editWaProvider === 'evolution'}
                        onChange={() => setEditWaProvider('evolution')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">
                          Evolution API (VPS)
                        </span>
                        <span className="text-[10px] text-indigo-700 block font-medium">
                          Self-Hosted • QR & Código
                        </span>
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                        editWaProvider === 'meta'
                          ? 'bg-blue-50/70 border-[#0052FF] ring-2 ring-[#0052FF]/20'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editWaProvider"
                        value="meta"
                        checked={editWaProvider === 'meta'}
                        onChange={() => setEditWaProvider('meta')}
                        className="text-[#0052FF] focus:ring-[#0052FF]"
                      />
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">
                          Meta Cloud API
                        </span>
                        <span className="text-[10px] text-gray-500 block">
                          Oficial Meta • WABA
                        </span>
                      </div>
                    </label>
                  </div>

                  {editWaProvider === 'evolution' && (
                    <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-3">
                      <p className="text-[11px] text-indigo-950 font-medium">
                        Credenciales Evolution API v2 (Deja la clave en blanco para conservar la existente):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-700 block mb-1">
                            URL del VPS
                          </label>
                          <input
                            type="text"
                            placeholder="https://evolution.synqo.dev o http://ip:8080"
                            value={editEvolutionApiUrl}
                            onChange={(e) => setEditEvolutionApiUrl(e.target.value)}
                            className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-700 block mb-1">
                            Nombre de Instancia <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="ej: empresa_synqo"
                            value={editEvolutionInstanceName}
                            onChange={(e) => setEditEvolutionInstanceName(e.target.value)}
                            className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-700 block mb-1">
                            Nueva API Key
                          </label>
                          <input
                            type="password"
                            placeholder="Dejar en blanco para mantener..."
                            value={editEvolutionApiKey}
                            onChange={(e) => setEditEvolutionApiKey(e.target.value)}
                            className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-indigo-200/60 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editEvolutionAntiBan}
                            onChange={(e) => setEditEvolutionAntiBan(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] font-semibold text-indigo-950">
                            Heurística Anti-Ban (Jitter humano y demoras realistas)
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">Tope/hora:</span>
                          <input
                            type="number"
                            min={5}
                            max={500}
                            value={editEvolutionMaxOutbound}
                            onChange={(e) => setEditEvolutionMaxOutbound(Number(e.target.value))}
                            className="w-16 text-xs text-center border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-900 font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              </div>

              {/* Botones de Acción (Footer Horizontal Pinned) */}
              <div className="shrink-0 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/70">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[150px] inline-flex items-center justify-center gap-1.5 px-6 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mini-Modal: Actualizar Cobertura de Pago (Mensual o Anual) */}
      {payingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="shrink-0 p-5 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  Actualizar Estado de Pago
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Empresa: <strong className="text-gray-900">{payingOrg.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingOrg(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 [scrollbar-width:thin]">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Selecciona el período cubierto:
                </label>
                
                {/* Botones de Selección Rápida */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setPayMonth(currentMonthStr)}
                    className={`py-2 px-3 text-xs rounded-xl border font-semibold transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      payMonth === currentMonthStr
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span>Mes Actual</span>
                    <span className="text-[10px] text-gray-400 font-mono font-normal">({currentMonthStr})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMonth(getNextMonthStr())}
                    className={`py-2 px-3 text-xs rounded-xl border font-semibold transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      payMonth === getNextMonthStr()
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span>+1 Mes Siguiente</span>
                    <span className="text-[10px] text-gray-400 font-mono font-normal">({getNextMonthStr()})</span>
                  </button>
                </div>

                {/* Botón Destacado: Pago Anual (12 Meses) */}
                <button
                  type="button"
                  onClick={() => setPayMonth(getNextYearStr())}
                  className={`w-full py-2.5 px-3 mb-3 text-xs rounded-xl border font-bold transition cursor-pointer flex items-center justify-between ${
                    payMonth === getNextYearStr()
                      ? 'bg-purple-500/10 text-purple-700 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-purple-50/50 text-purple-700 border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>Pago Anual Anticipado</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-mono font-normal">12 meses</span>
                  </span>
                  <span className="font-mono text-[11px] text-purple-600 font-bold">({getNextYearStr()})</span>
                </button>

                {/* Selector Manual */}
                <div>
                  <span className="text-[11px] text-gray-500 block mb-1">O define un mes específico:</span>
                  <input
                    type="month"
                    required
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono font-semibold text-gray-800 bg-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p>• La empresa quedará en verde <strong>Al día</strong> hasta el final de <strong>{payMonth}</strong>.</p>
                <p>• Si estaba suspendida, se <strong>reactiva de inmediato</strong>.</p>
                <p>• Los tokens de OpenAI se <strong>reinician a 0</strong> para el nuevo ciclo.</p>
              </div>

              </div>

              <div className="shrink-0 px-5 py-3.5 flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setPayingOrg(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isSubmitting ? 'Guardando...' : 'Confirmar y Activar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

