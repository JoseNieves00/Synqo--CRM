'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  Info,
  RotateCcw,
  Copy,
  Check,
  Pencil,
  Smartphone,
  Mail,
  X,
} from 'lucide-react';
import {
  addTeamMember,
  removeTeamMember,
  regenerateTeamMemberPassword,
  updateTeamMemberNonSensitive,
} from '@/app/actions/team';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
  whatsapp_phone?: string | null;
  created_at: string;
}

interface TeamTabProps {
  initialData: {
    organization: {
      id: string;
      name: string;
      planType: string;
      maxUsers: number;
      usedUsers: number;
      remainingSeats: number;
    };
    members: TeamMember[];
  };
}

export function TeamTab({ initialData }: TeamTabProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialData.members);
  const [maxUsers, setMaxUsers] = useState(initialData.organization.maxUsers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [tempPassResult, setTempPassResult] = useState<{
    email: string;
    fullName: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Formulario de nuevo miembro
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor'>('agent');

  // Estado para edición de datos no sensibles (Admin)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'supervisor' | 'agent'>('agent');
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);

  useEffect(() => {
    if (isModalOpen || tempPassResult || editingMember) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isModalOpen, tempPassResult, editingMember]);

  const handleOpenEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setEditFullName(member.full_name);
    setEditEmail(member.email);
    setEditWhatsapp(member.whatsapp_phone || '');
    setEditRole(member.role);
    setFeedback(null);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setIsEditingSubmitting(true);
    setFeedback(null);

    try {
      const res = await updateTeamMemberNonSensitive({
        memberId: editingMember.id,
        fullName: editFullName,
        email: editEmail,
        whatsappPhone: editWhatsapp,
        role: editRole,
      });

      if (res.success && res.member) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === editingMember.id
              ? {
                  ...m,
                  full_name: res.member.full_name,
                  email: res.member.email,
                  whatsapp_phone: res.member.whatsapp_phone,
                  role: res.member.role,
                }
              : m
          )
        );
        setFeedback({
          type: 'success',
          message: `Datos no sensibles de ${res.member.full_name} actualizados exitosamente.`,
        });
        setEditingMember(null);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al actualizar los datos del usuario.',
      });
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  const usedSeats = members.length;
  const isQuotaFull = usedSeats >= maxUsers;
  const percentage = Math.min(100, Math.round((usedSeats / maxUsers) * 100));

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await addTeamMember({
        fullName,
        email,
        password,
        role,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Miembro ${res.member.fullName} agregado exitosamente. Comunícale su contraseña temporal de acceso.`,
        });
        setMembers((prev) => [
          ...prev,
          {
            id: res.member.id,
            full_name: res.member.fullName,
            email: res.member.email,
            role: res.member.role,
            created_at: new Date().toISOString(),
          },
        ]);
        setFullName('');
        setEmail('');
        setPassword('');
        setIsModalOpen(false);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al agregar miembro al equipo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`¿Estás seguro de que deseas revocar el acceso a ${memberName}?`)) return;

    try {
      await removeTeamMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setFeedback({
        type: 'success',
        message: `Acceso de ${memberName} revocado correctamente.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al eliminar miembro.',
      });
    }
  };

  const handleRegeneratePassword = async (memberId: string, memberName: string) => {
    if (
      !confirm(
        `¿Deseas generar una nueva contraseña temporal para ${memberName}? El usuario deberá cambiarla obligatoriamente al ingresar.`
      )
    ) {
      return;
    }

    setRegeneratingId(memberId);
    setFeedback(null);
    setTempPassResult(null);

    try {
      const res = await regenerateTeamMemberPassword(memberId);
      if (res.success && res.tempPassword) {
        setTempPassResult({
          email: res.email,
          fullName: res.fullName,
          tempPassword: res.tempPassword,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error regenerando contraseña temporal.',
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleCopyPassword = () => {
    if (!tempPassResult) return;
    navigator.clipboard.writeText(tempPassResult.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-gray-500 hover:text-gray-800 font-semibold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Alerta de Contraseña Temporal Generada */}
      {tempPassResult && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-emerald-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Key className="w-4 h-4" />
              Nueva Contraseña Temporal Generada para {tempPassResult.fullName}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
              Usuario: <span className="font-mono text-slate-900 dark:text-white font-semibold">{tempPassResult.email}</span> • Al ingresar al CRM, el sistema le exigirá cambiarla inmediatamente.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-slate-700 shadow-2xs">
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-bold select-all tracking-wider">
                {tempPassResult.tempPassword}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopyPassword}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '¡Copiada!' : 'Copiar'}
            </button>
            <button
              onClick={() => setTempPassResult(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition text-xs cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Tarjeta de Control de Usuarios / Cupos */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Gestión de Usuarios & Agentes
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Los agentes pueden chatear con los prospectos del Inbox y gestionar el Pipeline Kanban.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isQuotaFull}
              className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                isQuotaFull
                  ? 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#232A3B] cursor-not-allowed'
                  : 'bg-[#0052FF] hover:bg-[#0047E0] text-white shadow-xs'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              {isQuotaFull ? 'Límite de Usuarios Alcanzado' : 'Agregar Miembro'}
            </button>
          </div>
        </div>

        {/* Barra de progreso de cupos */}
        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-[#1E2433]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {usedSeats} de {maxUsers} usuarios ocupados
            </span>
            <span
              className={`font-bold ${
                isQuotaFull ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {percentage}% utilizado
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-[#090A0F] h-2 rounded-full overflow-hidden border border-slate-200 dark:border-[#1E2433]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isQuotaFull ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {isQuotaFull && (
            <div className="mt-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
              <Info className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <span>
                Has completado la cuota de usuarios autorizados para tu cuenta. Para habilitar más cupos, contacta al soporte o administrador.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de Miembros */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#1A1F2C]/50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
            Miembros del Equipo ({members.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232A3B] bg-slate-100/60 dark:bg-[#1A1F2C]/30 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <th className="py-3 px-6">Nombre & Correo</th>
                <th className="py-3 px-6">WhatsApp Personal</th>
                <th className="py-3 px-6">Rol</th>
                <th className="py-3 px-6">Fecha de Alta</th>
                <th className="py-3 px-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1E2433]">
              {members.map((member) => {
                const isAdmin = member.role === 'admin';
                return (
                  <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-[#1A1F2C]/50 transition">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-900 dark:text-white">{member.full_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{member.email}</div>
                    </td>

                    <td className="py-3.5 px-6">
                      {member.whatsapp_phone ? (
                        <div className="inline-flex items-center gap-1.5 font-mono text-slate-800 dark:text-slate-200 font-medium">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{member.whatsapp_phone}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Sin vincular</span>
                      )}
                    </td>

                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          isAdmin
                            ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                            : member.role === 'supervisor'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {isAdmin ? 'Administrador' : member.role === 'supervisor' ? 'Supervisor' : 'Agente'}
                      </span>
                    </td>

                    <td suppressHydrationWarning className="py-3.5 px-6 text-slate-500 dark:text-slate-400">
                      {new Date(member.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    <td className="py-3.5 px-6 text-right space-x-1">
                      <button
                        onClick={() => handleOpenEditModal(member)}
                        className="p-1.5 text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition cursor-pointer"
                        title="Editar datos no sensibles (Nombre, Correo, WhatsApp, Rol)"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleRegeneratePassword(member.id, member.full_name)}
                        disabled={regeneratingId === member.id}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition cursor-pointer disabled:opacity-50"
                        title="Regenerar contraseña temporal"
                      >
                        <RotateCcw className={`w-4 h-4 ${regeneratingId === member.id ? 'animate-spin text-emerald-500' : ''}`} />
                      </button>

                      {!isAdmin && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.full_name)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                          title="Revocar acceso"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Agregar Miembro */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-[#232A3B]">
            <div className="p-5 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#1A1F2C]/50">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                Agregar Nuevo Miembro al Equipo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Crea el acceso asignándole una contraseña temporal para que ingrese de inmediato.
              </p>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Laura Gómez"
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="laura@empresa.com"
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Rol de Acceso *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                >
                  <option value="agent">Agente (Inbox & Pipeline)</option>
                  <option value="supervisor">Supervisor (Monitoreo & Reportes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-400" />
                  Contraseña Temporal de Acceso * (Mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña inicial para el usuario"
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                  El usuario utilizará este correo y contraseña en /login.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-[#1A1F2C] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  {isSubmitting ? 'Guardando...' : 'Crear Miembro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Datos No Sensibles del Miembro (Admin) */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-[#232A3B] transition-colors animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#1A1F2C]/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                  Editar Miembro del Equipo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Actualiza información no sensible para <strong>{editingMember.full_name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMember} className="p-5 space-y-4">
              {/* Banner de Seguridad: Solo Datos No Sensibles */}
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                <Shield className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Modificación Segura de Datos No Sensibles</span>
                  <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-snug">
                    Por seguridad, las credenciales de contraseña permanecen cifradas y no se editan directamente. Si el usuario requiere una nueva clave, usa el botón de regenerar contraseña temporal con cambio forzado.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Ej. Laura Gómez"
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Correo Electrónico *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="laura@empresa.com"
                    className="w-full h-10 pl-9 pr-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs font-mono"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Número de WhatsApp Personal (Alertas de Relevo)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="ej: 3001234567 o 57300..."
                    className="w-full h-10 pl-9 pr-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs font-mono"
                  />
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                  Permite al sistema enviar alertas de WhatsApp directo a su celular cuando se le asigne un prospecto.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Rol de Acceso *
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                >
                  <option value="agent">Agente (Inbox & Pipeline)</option>
                  <option value="supervisor">Supervisor (Monitoreo & Reportes)</option>
                  <option value="admin">Administrador (Control Total de Empresa)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  disabled={isEditingSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-[#1A1F2C] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isEditingSubmitting}
                  className="px-5 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {isEditingSubmitting ? (
                    <span>Guardando...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

