'use client';

import React, { useState } from 'react';
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
  DollarSign,
  Filter,
} from 'lucide-react';
import {
  OrganizationRow,
  PlanType,
  provisionCompany,
  updateCompanySeats,
  toggleCompanyStatus,
  updateCompanyPlan,
  updateCompanyDetails,
  regenerateCompanyAdminPassword,
  registerCompanyPayment,
} from '@/app/actions/superadmin';
import { PLAN_DEFAULTS } from '@/lib/billing/plan-defaults';

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
}

export default function AdminConsoleClient({
  initialMetrics,
  initialOrganizations,
}: AdminConsoleClientProps) {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>(initialOrganizations);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationRow | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPlan, setEditPlan] = useState<PlanType>('starter');
  const [editSeats, setEditSeats] = useState<number>(2);
  const [editTokensLimit, setEditTokensLimit] = useState<number>(500000);
  const [editResetTokens, setEditResetTokens] = useState<boolean>(false);
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

  // Formulario de nueva empresa (Opción A: mes actual como cortesía/setup)
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [planType, setPlanType] = useState<PlanType>('starter');
  const [maxUsers, setMaxUsers] = useState<number>(2);
  const [firstBillingMonth, setFirstBillingMonth] = useState<string>(currentMonthStr);

  // Filtro de cobranza
  const [billingFilter, setBillingFilter] = useState<'all' | 'al_dia' | 'pendiente' | 'mora'>('all');

  // Estado para modal de actualización de cobertura/pago
  const [payingOrg, setPayingOrg] = useState<OrganizationRow | null>(null);
  const [payMonth, setPayMonth] = useState<string>(currentMonthStr);

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
    return true;
  });

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

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await provisionCompany({
        companyName,
        adminName,
        adminEmail,
        adminPassword,
        planType,
        maxUsers,
        firstBillingMonth,
      });

      if (res.success) {
        setSuccessMsg(`Empresa "${companyName}" aprovisionada exitosamente. Admin: ${adminEmail}`);
        // Limpiar formulario y cerrar modal
        setCompanyName('');
        setAdminName('');
        setAdminEmail('');
        setAdminPassword('');
        setMaxUsers(2);
        setIsProvisionOpen(false);

        // Actualizar lista local optimistamente
        const newOrgRow: OrganizationRow = {
          id: res.organization.id,
          name: res.organization.name,
          subscription_status: 'active',
          plan_type: planType,
          max_users: maxUsers,
          is_active: true,
          whatsapp_phone_number_id: null,
          created_at: new Date().toISOString(),
          users_count: 1,
          contacts_count: 0,
          admin_email: adminEmail,
          admin_name: adminName,
          paid_until_month: firstBillingMonth,
          billing_status: 'al_dia',
          billing_status_label: `Al día (${firstBillingMonth})`,
          billing_status_color: 'emerald',
          ai_tokens_used: 0,
        };
        setOrganizations([newOrgRow, ...organizations]);
        setMetrics((prev) => ({
          ...prev,
          totalOrganizations: prev.totalOrganizations + 1,
          activeOrganizations: prev.activeOrganizations + 1,
          totalProfiles: prev.totalProfiles + 1,
        }));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al aprovisionar la empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (org: OrganizationRow) => {
    setEditingOrg(org);
    setEditName(org.name);
    const safePlan: PlanType = org.plan_type === 'core' ? 'starter' : org.plan_type;
    setEditPlan(safePlan);
    setEditSeats(org.max_users);
    const defaultLimit = PLAN_DEFAULTS[safePlan]?.aiTokensLimit || 500000;
    setEditTokensLimit(org.ai_tokens_limit || defaultLimit);
    setEditResetTokens(false);
  };

  const handleApplyPlanDefaults = (plan: PlanType) => {
    const defaults = PLAN_DEFAULTS[plan];
    if (defaults) {
      setEditSeats(Math.max(defaults.maxUsers, editingOrg?.users_count || 1));
      setEditTokensLimit(defaults.aiTokensLimit);
    }
  };

  const handleUpdateCompanyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    if (editSeats < editingOrg.users_count) {
      setErrorMsg(
        `No puedes reducir a ${editSeats} asientos porque la empresa tiene ${editingOrg.users_count} usuarios activos.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await updateCompanyDetails({
        organizationId: editingOrg.id,
        name: editName,
        planType: editPlan,
        maxUsers: editSeats,
        aiTokensLimit: editTokensLimit,
        resetTokensUsed: editResetTokens,
      });

      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === editingOrg.id
            ? {
                ...o,
                name: editName,
                plan_type: editPlan,
                max_users: editSeats,
                ai_tokens_limit: editTokensLimit,
                ai_tokens_used: editResetTokens ? 0 : o.ai_tokens_used,
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

      {/* Tarjetas de Métricas de Plataforma */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Empresas
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900">{metrics.totalOrganizations}</span>
            <span className="text-xs text-emerald-600 font-semibold">
              ({metrics.activeOrganizations} activas)
            </span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Usuarios / Asientos
            </span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900">{metrics.totalProfiles}</span>
            <span className="text-xs text-gray-500">en plataforma</span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Leads Totales
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900">{metrics.totalContacts}</span>
            <span className="text-xs text-emerald-600 font-medium">WhatsApp Leads</span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Mensajes Procesados
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900">{metrics.totalMessages}</span>
            <span className="text-xs text-amber-600 font-medium">IA & Agentes</span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Tokens OpenAI
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900">
              {metrics.totalAiTokensUsed ? (metrics.totalAiTokensUsed > 1000000 ? `${(metrics.totalAiTokensUsed / 1000000).toFixed(1)}M` : `${Math.round(metrics.totalAiTokensUsed / 1000)}k`) : '0'}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Consumo Total</span>
          </div>
        </div>
      </div>

      {/* Barra de Control de Cobranza Mensual & Alertas */}
      {metrics.billingSummary && (
        <div className="p-5 bg-gradient-to-r from-slate-900 to-[#131722] rounded-2xl border border-slate-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
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

            {billingFilter !== 'all' && (
              <button
                onClick={() => setBillingFilter('all')}
                className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Limpiar filtro
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
              onClick={() => setIsProvisionOpen(true)}
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
                <th className="py-3 px-5">Asientos</th>
                <th className="py-3 px-5">Plan</th>
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
                  <td colSpan={9} className="py-12 text-center text-gray-400 text-sm">
                    No se encontraron organizaciones registradas.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const seatsFull = org.users_count >= org.max_users;
                  const seatPercentage = Math.min(100, (org.users_count / org.max_users) * 100);

                  return (
                    <tr key={org.id} className="hover:bg-gray-50/50 transition">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-gray-900 text-sm">{org.name}</div>
                        <div className="text-[11px] text-gray-400 font-mono">ID: {org.id.slice(0, 8)}...</div>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-medium text-gray-800">{org.admin_name || 'Sin nombre'}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{org.admin_email}</div>
                      </td>

                      <td className="py-3.5 px-5 min-w-[150px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-semibold ${seatsFull ? 'text-amber-600' : 'text-gray-700'}`}>
                            {org.users_count} / {org.max_users} asientos
                          </span>
                          <button
                            onClick={() => handleOpenEditModal(org)}
                            title="Editar empresa y asientos"
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

                      <td className="py-3.5 px-5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(org)}
                          className="capitalize px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition cursor-pointer flex items-center gap-1"
                          title="Cambiar plan comercial (Upgrade / Downgrade)"
                        >
                          {org.plan_type === 'core' ? 'Starter' : org.plan_type}
                        </button>
                      </td>

                      <td className="py-3.5 px-5 min-w-[140px]">
                        {(() => {
                          const used = org.ai_tokens_used || 0;
                          const limit = org.ai_tokens_limit || 100000;
                          const pct = Math.min(100, Math.round((used / limit) * 100));
                          const isWarn = pct >= 80 && pct < 100;
                          const isOver = pct >= 100;

                          return (
                            <div>
                              <div className="flex items-center justify-between mb-1 text-[11px]">
                                <span className={`font-mono font-semibold ${isOver ? 'text-rose-600' : isWarn ? 'text-amber-600' : 'text-gray-700'}`}>
                                  {used.toLocaleString()} / {(limit / 1000)}k
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

                          <button
                            onClick={() => handleOpenPayModal(org)}
                            className="text-[11px] font-semibold text-[#0052FF] hover:text-[#0047E0] hover:underline flex items-center gap-1 cursor-pointer w-fit mt-0.5"
                          >
                            <Receipt className="w-3 h-3" />
                            Registrar pago
                          </button>
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
                        <button
                          onClick={() => handleOpenEditModal(org)}
                          className="p-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                          title="Editar empresa (Plan, Asientos, Tokens)"
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

      {/* Modal: Aprovisionar Empresa */}
      {isProvisionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#0052FF]" />
                Aprovisionar Nueva Empresa (Tenant)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Crea la organización y su usuario administrador con contraseña temporal segura.
              </p>
            </div>

            <form onSubmit={handleProvisionSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nombre de la Empresa *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ej. Clínica Dental Sonrisas"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Nombre del Administrador *
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ej. Dr. Carlos Mendoza"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Email de Acceso *
                  </label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="carlos@clinicasonrisas.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Contraseña Inicial / Temporal * (Mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Contraseña robusta para el cliente"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Plan</label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                  >
                    <option value="starter">Starter (Validación - 2 Asientos)</option>
                    <option value="pro">Pro (Comercial - 5 Asientos)</option>
                    <option value="enterprise">Enterprise (Corporativo - 12 Asientos)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Límite de Asientos (Usuarios)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Primer mes cubierto (Mensual vs Anual) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Período Cubierto Inicial
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFirstBillingMonth(currentMonthStr)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition cursor-pointer"
                    >
                      Mes Actual
                    </button>
                    <button
                      type="button"
                      onClick={() => setFirstBillingMonth(getNextYearStr())}
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold transition cursor-pointer"
                    >
                      ⭐ Pago Anual (1 Año)
                    </button>
                  </div>
                </div>
                <input
                  type="month"
                  value={firstBillingMonth}
                  onChange={(e) => setFirstBillingMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Para cobros mensuales déjalo en el mes actual. Si el cliente pagó la anualidad por anticipado, pulsa <strong>Pago Anual</strong>.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsProvisionOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  {isSubmitting ? 'Aprovisionando...' : 'Crear y Habilitar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Empresa (Plan, Asientos, Tokens) */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0052FF] flex items-center justify-center font-bold shadow-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Editar Empresa: {editingOrg.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Gestión de plan comercial, cupo de asientos y asignación de tokens IA.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCompanyDetails} className="p-6 space-y-4">
              {/* Nombre de la Empresa */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nombre Comercial de la Empresa *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ej. Clínica Dental Sonrisas"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] font-semibold"
                />
              </div>

              {/* Plan Comercial */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Plan Comercial
                  </label>
                  <button
                    type="button"
                    onClick={() => handleApplyPlanDefaults(editPlan)}
                    className="text-[11px] font-semibold text-[#0052FF] hover:text-[#0047E0] hover:underline flex items-center gap-1 cursor-pointer"
                    title="Aplica asientos y cuota de tokens por defecto de este plan"
                  >
                    <Zap className="w-3 h-3" />
                    Sincronizar cupos base del plan
                  </button>
                </div>
                <select
                  value={editPlan}
                  onChange={(e) => {
                    const newPlan = e.target.value as PlanType;
                    setEditPlan(newPlan);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-medium"
                >
                  <option value="starter">Starter (Validación - 2 Asientos / 500k Tokens)</option>
                  <option value="pro">Pro (Comercial - 5 Asientos / 2.5M Tokens)</option>
                  <option value="enterprise">Enterprise (Corporativo - 12 Asientos / 7.5M Tokens)</option>
                </select>
              </div>

              {/* Límite de Asientos */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Límite de Asientos (Usuarios)
                  </label>
                  <span className="text-[11px] text-gray-500">
                    En uso: <strong className="text-gray-900">{editingOrg.users_count}</strong> miembros activos
                  </span>
                </div>
                <input
                  type="number"
                  min={editingOrg.users_count || 1}
                  max={500}
                  value={editSeats}
                  onChange={(e) => setEditSeats(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] font-semibold"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Por seguridad, no se puede reducir a un número menor que los miembros actuales ({editingOrg.users_count}).
                </p>
              </div>

              {/* Gestión de Tokens IA y Boosters */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Límite de Tokens IA Mensual
                  </span>
                  <span className="text-[11px] font-mono text-slate-600 font-semibold">
                    {(editingOrg.ai_tokens_used || 0).toLocaleString()} consumidos
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={100000}
                    min={100000}
                    max={100000000}
                    value={editTokensLimit}
                    onChange={(e) => setEditTokensLimit(parseInt(e.target.value, 10) || 100000)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-mono font-bold text-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
                    = {(editTokensLimit / 1000).toLocaleString()}k
                  </span>
                </div>

                {/* Presets Rápidos de Tokens (Booster de 1 Clic) */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                    Acciones Rápidas (Paquetes Booster & Restablecer):
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditTokensLimit((prev) => prev + 1000000)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                      title="Suma 1 Millón de tokens para el mes en curso"
                    >
                      ⭐ +1M Tokens (Booster)
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditTokensLimit((prev) => prev + 500000)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer"
                      title="Suma 500k tokens para el mes en curso"
                    >
                      +500k Tokens
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setEditTokensLimit(PLAN_DEFAULTS[editPlan]?.aiTokensLimit || 500000)
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
                      title="Restablece al valor oficial del plan"
                    >
                      ↺ Base Plan ({((PLAN_DEFAULTS[editPlan]?.aiTokensLimit || 500000) / 1000)}k)
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={editResetTokens}
                      onChange={(e) => setEditResetTokens(e.target.checked)}
                      className="rounded text-[#0052FF] focus:ring-[#0052FF]/20"
                    />
                    Reiniciar tokens consumidos a 0 (Cortesía de soporte)
                  </label>
                </div>

                <p className="text-[10px] text-slate-500 italic">
                  💡 Al renovar la mensualidad en la fecha de cobro, los paquetes booster expiran y el límite vuelve automáticamente a la cuota base del plan.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
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
                  className="px-5 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mini-Modal: Actualizar Cobertura de Pago (Mensual o Anual) */}
      {payingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Actualizar Estado de Pago
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Empresa: <strong className="text-gray-900">{payingOrg.name}</strong>
              </p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-5 space-y-4">
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
                      ? 'bg-gradient-to-r from-purple-500/10 to-indigo-500/10 text-purple-700 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-purple-50/50 text-purple-700 border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>⭐ Pago Anual Anticipado</span>
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

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
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

