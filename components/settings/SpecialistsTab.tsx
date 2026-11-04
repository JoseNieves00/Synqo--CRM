'use client';

import React, { useState, useTransition } from 'react';
import {
  Users,
  Plus,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Phone,
  KeyRound,
  Trash2,
  Share2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Clock,
  X,
} from 'lucide-react';
import {
  createSpecialistAdmin,
  updateSpecialistAdmin,
  deleteSpecialistAdmin,
  generateStaffInviteAdmin,
} from '@/app/actions/calendar-admin';

interface SpecialistItem {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  access_pin: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  is_active: boolean;
  created_at: string;
}

interface SpecialistsTabProps {
  specialists: SpecialistItem[];
  organizationId: string;
  companyCode: string;
  companyName: string;
  specialistLabel?: string;
}

export function SpecialistsTab({
  specialists: initialSpecialists,
  companyCode,
  companyName,
  specialistLabel = 'Colaborador',
}: SpecialistsTabProps) {
  const [specialists, setSpecialists] = useState<SpecialistItem[]>(initialSpecialists);
  const [isPending, startTransition] = useTransition();

  // Modal de Invitación Segura con QR
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteData, setInviteData] = useState<{
    rawToken: string;
    inviteUrl: string;
    expiresAt: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Modal de Creación Manual
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    phone: '',
    specialty: '',
    pin: '',
    password: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Generar invitación efímera
  const handleGenerateInvite = () => {
    setInviteModalOpen(true);
    setInviteData(null);
    setCopiedLink(false);

    startTransition(async () => {
      try {
        const res = await generateStaffInviteAdmin();
        const fullUrl = `${window.location.origin}${res.invitePath}`;
        setInviteData({
          rawToken: res.rawToken,
          inviteUrl: fullUrl,
          expiresAt: res.expiresAt,
        });
      } catch (err: any) {
        alert(err.message || 'Error al generar invitación');
      }
    });
  };

  // Copiar link al portapapeles
  const handleCopyLink = () => {
    if (!inviteData?.inviteUrl) return;
    navigator.clipboard.writeText(inviteData.inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Compartir por WhatsApp
  const handleShareWhatsApp = () => {
    if (!inviteData?.inviteUrl) return;
    const msg = `Hola! Únete al portal de colaboradores de ${companyName} aquí: ${inviteData.inviteUrl} (Válido por 24 horas).`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Aprobar o rechazar
  const handleUpdateApproval = (
    specialistId: string,
    status: 'approved' | 'rejected'
  ) => {
    startTransition(async () => {
      try {
        await updateSpecialistAdmin(specialistId, {
          approvalStatus: status,
          isActive: status === 'approved',
        });
        setSpecialists((prev) =>
          prev.map((s) =>
            s.id === specialistId
              ? { ...s, approval_status: status, is_active: status === 'approved' }
              : s
          )
        );
      } catch (err: any) {
        alert(err.message || 'Error al actualizar colaborador');
      }
    });
  };

  // Eliminar
  const handleDelete = (specialistId: string) => {
    if (!confirm('¿Seguro que deseas eliminar a este colaborador?')) return;
    startTransition(async () => {
      try {
        await deleteSpecialistAdmin(specialistId);
        setSpecialists((prev) => prev.filter((s) => s.id !== specialistId));
      } catch (err: any) {
        alert(err.message || 'Error al eliminar colaborador');
      }
    });
  };

  // Crear manual
  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      try {
        const res = await createSpecialistAdmin({
          name: manualForm.name,
          phone: manualForm.phone,
          specialty: manualForm.specialty,
          accessPin: manualForm.pin,
          password: manualForm.password || undefined,
        });

        if (res.specialist) {
          const newItem: SpecialistItem = {
            id: res.specialist.id,
            name: manualForm.name,
            phone: manualForm.phone,
            specialty: manualForm.specialty || 'Especialista',
            access_pin: manualForm.pin || manualForm.phone.slice(-4),
            approval_status: 'approved',
            is_active: true,
            created_at: new Date().toISOString(),
          };
          setSpecialists((prev) => [newItem, ...prev]);
          setCreateModalOpen(false);
          setManualForm({ name: '', phone: '', specialty: '', pin: '', password: '' });
        }
      } catch (err: any) {
        setFormError(err.message || 'Error al crear colaborador');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header con Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#0052FF] dark:text-[#00D2FF]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Equipo de {specialistLabel}s</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestión y portal móvil para el equipo de {specialistLabel.toLowerCase()}s de {companyName}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Botón Invitación Efímera Segura */}
          <button
            onClick={handleGenerateInvite}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>Invitación Segura (24h / QR)</span>
          </button>

          {/* Botón Crear Manual */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1F2C] dark:hover:bg-[#232A3B] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
            <span>Nuevo {specialistLabel}</span>
          </button>
        </div>
      </div>

      {/* Lista de Colaboradores */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1A1F2C] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#232A3B]">
              <tr>
                <th className="py-3 px-4 font-semibold">{specialistLabel}</th>
                <th className="py-3 px-4 font-semibold">Especialidad / Rol</th>
                <th className="py-3 px-4 font-semibold">Celular (PK)</th>
                <th className="py-3 px-4 font-semibold">PIN Rápido</th>
                <th className="py-3 px-4 font-semibold">Estado de Aprobación</th>
                <th className="py-3 px-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1E2433]">
              {specialists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay {specialistLabel.toLowerCase()}s registrados. Genera una invitación segura para que se auto-registren o agrégalos manualmente.
                  </td>
                </tr>
              ) : (
                specialists.map((spec) => (
                  <tr key={spec.id} className="hover:bg-slate-50 dark:hover:bg-[#131722]/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{spec.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Reg: {new Date(spec.created_at).toLocaleDateString('es-CO')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {spec.specialty || 'General'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {spec.phone || <span className="text-slate-400">Sin teléfono</span>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#0052FF] dark:text-[#00D2FF]">
                      •••• ({spec.access_pin})
                    </td>
                    <td className="py-3.5 px-4">
                      {spec.approval_status === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Pendiente de Aprobación
                        </span>
                      ) : spec.approval_status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Aprobado & Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                          <XCircle className="w-3 h-3" /> Rechazado / Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {spec.approval_status === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleUpdateApproval(spec.id, 'approved')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition text-xs shadow-xs"
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              onClick={() => handleUpdateApproval(spec.id, 'rejected')}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-[#131722] dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-rose-500/30 transition text-xs"
                            >
                              ✕ Rechazar
                            </button>
                          </>
                        ) : (
                          <>
                            {spec.approval_status === 'rejected' && (
                              <button
                                onClick={() => handleUpdateApproval(spec.id, 'approved')}
                                className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition text-xs"
                              >
                                Reactivar
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(spec.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition cursor-pointer"
                              title="Eliminar colaborador"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Enlace de Invitación Segura & QR */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#232A3B] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1E2433]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Invitación Segura (One-Time)</h3>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isPending || !inviteData ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 space-y-3">
                <RefreshCw className="w-7 h-7 text-[#0052FF] dark:text-[#00D2FF] animate-spin" />
                <p className="text-xs">Generando token criptográfico firmado...</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* QR Code Container */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white border border-slate-200 dark:border-transparent flex flex-col items-center justify-center mx-auto w-fit shadow-xs">
                  {/* Utilizando qrserver API para rendering nítido */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      inviteData.inviteUrl
                    )}`}
                    alt="Código QR de Invitación"
                    width={180}
                    height={180}
                    className="w-44 h-44 object-contain"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-600 font-mono mt-1 font-semibold">
                    Escanear con la cámara del celular
                  </span>
                </div>

                {/* Explicación de Seguridad */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Vigencia máxima:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 24 horas (Un solo uso)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Empresa:</span>
                    <span className="text-slate-900 dark:text-white font-medium">{companyName} ({companyCode})</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#1E2433]">
                    El colaborador definirá su propia contraseña. Tras registrarse, requerirá tu aprobación para ver la agenda.
                  </p>
                </div>

                {/* Enlace y Botones de Copiar / Compartir */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 dark:bg-[#090B10] border border-slate-200 dark:border-[#232A3B] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-hidden">
                    <span className="truncate flex-1">{inviteData.inviteUrl}</span>
                    <button
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 rounded bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1A2030] border border-slate-200 dark:border-[#232A3B] text-slate-800 dark:text-white flex items-center gap-1 transition shadow-xs"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleShareWhatsApp}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Compartir por WhatsApp Directo</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Creación Manual */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-[#232A3B] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E2433]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Crear {specialistLabel} Manualmente</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateManual} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder={`Ej. Juan ${specialistLabel}`}
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Número de Celular * (Acceso)</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej. 3001234567"
                  value={manualForm.phone}
                  onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                  className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Especialidad o Sub-rol</label>
                <input
                  type="text"
                  placeholder="Ej. Consulta General, Barbería Clásica, Terapia"
                  value={manualForm.specialty}
                  onChange={(e) => setManualForm({ ...manualForm, specialty: e.target.value })}
                  className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">PIN Rápido (4 dígitos)</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Auto (últimos 4)"
                    value={manualForm.pin}
                    onChange={(e) => setManualForm({ ...manualForm, pin: e.target.value })}
                    className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Contraseña (Opcional)</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={manualForm.password}
                    onChange={(e) => setManualForm({ ...manualForm, password: e.target.value })}
                    className="w-full h-10 px-3.5 bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1A2030] text-slate-600 dark:text-slate-300 dark:hover:text-white transition font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0040CC] text-white font-semibold transition disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {isPending ? 'Guardando...' : `Crear ${specialistLabel}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

