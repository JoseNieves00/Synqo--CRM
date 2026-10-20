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
} from 'lucide-react';
import {
  OrganizationRow,
  provisionCompany,
  updateCompanySeats,
  toggleCompanyStatus,
  updateCompanyPlan,
} from '@/app/actions/superadmin';

interface Metrics {
  totalOrganizations: number;
  activeOrganizations: number;
  totalContacts: number;
  totalMessages: number;
  totalProfiles: number;
  totalAiTokensUsed?: number;
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
  const [newSeatLimit, setNewSeatLimit] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario de nueva empresa
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [planType, setPlanType] = useState<'core' | 'pro' | 'enterprise'>('core');
  const [maxUsers, setMaxUsers] = useState<number>(3);

  // Filtrado de organizaciones
  const filteredOrgs = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.admin_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.admin_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.id.includes(searchQuery)
  );

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
      });

      if (res.success) {
        setSuccessMsg(`Empresa "${companyName}" aprovisionada exitosamente. Admin: ${adminEmail}`);
        // Limpiar formulario y cerrar modal
        setCompanyName('');
        setAdminName('');
        setAdminEmail('');
        setAdminPassword('');
        setMaxUsers(3);
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

  const handleUpdateSeats = async () => {
    if (!editingOrg) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await updateCompanySeats(editingOrg.id, newSeatLimit);
      setOrganizations((prev) =>
        prev.map((o) => (o.id === editingOrg.id ? { ...o, max_users: newSeatLimit } : o))
      );
      setSuccessMsg(`Límite de asientos para "${editingOrg.name}" actualizado a ${newSeatLimit}.`);
      setEditingOrg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar asientos.');
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

  return (
    <div className="space-y-8">
      {/* Notificaciones */}
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
                <th className="py-3 px-5">Asientos (Usuarios)</th>
                <th className="py-3 px-5">Plan</th>
                <th className="py-3 px-5">Consumo Tokens IA</th>
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

                      <td className="py-3.5 px-5 min-w-[160px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-semibold ${seatsFull ? 'text-amber-600' : 'text-gray-700'}`}>
                            {org.users_count} / {org.max_users} asientos
                          </span>
                          <button
                            onClick={() => {
                              setEditingOrg(org);
                              setNewSeatLimit(org.max_users);
                            }}
                            title="Modificar asientos"
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
                        <span className="capitalize px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          {org.plan_type}
                        </span>
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

                      <td className="py-3.5 px-5 text-right">
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
                    <option value="core">Core (Estándar)</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
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

      {/* Modal: Editar Asientos */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-200">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">
                Ajustar Asientos: {editingOrg.name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Define cuántos agentes o supervisores puede crear esta empresa.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Cantidad Máxima de Asientos
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={newSeatLimit}
                  onChange={(e) => setNewSeatLimit(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] font-semibold"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Actualmente tiene {editingOrg.users_count} miembros activos.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpdateSeats}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Asientos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

