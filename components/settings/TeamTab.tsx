'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { addTeamMember, removeTeamMember, regenerateTeamMemberPassword } from '@/app/actions/team';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
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
        <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Key className="w-4 h-4" />
              Nueva Contraseña Temporal Generada para {tempPassResult.fullName}
            </div>
            <p className="text-[11px] text-slate-300 mt-1">
              Usuario: <span className="font-mono text-white">{tempPassResult.email}</span> • Al ingresar al CRM, el sistema le exigirá cambiarla inmediatamente.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-xs font-mono text-emerald-400 font-bold select-all tracking-wider">
                {tempPassResult.tempPassword}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopyPassword}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '¡Copiada!' : 'Copiar'}
            </button>
            <button
              onClick={() => setTempPassResult(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Tarjeta de Control de Asientos / Cupos */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">
                Gestión de Asientos & Agentes
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Plan {initialData.organization.planType}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Los agentes pueden chatear con los prospectos de WhatsApp y gestionar el Pipeline Kanban.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isQuotaFull}
              className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer ${
                isQuotaFull
                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  : 'bg-[#0052FF] hover:bg-[#0047E0] text-white shadow-md shadow-[#0052FF]/20'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              {isQuotaFull ? 'Límite de Asientos Alcanzado' : 'Agregar Miembro'}
            </button>
          </div>
        </div>

        {/* Barra de progreso de cupos */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-gray-700">
              {usedSeats} de {maxUsers} asientos ocupados
            </span>
            <span
              className={`font-bold ${
                isQuotaFull ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {percentage}% utilizado
            </span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isQuotaFull ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {isQuotaFull && (
            <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Has completado la cuota de usuarios autorizados para tu plan actual. Para habilitar más cupos, solicita una ampliación de tu suscripción.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de Miembros */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            Miembros del Equipo ({members.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/30 text-gray-400 uppercase font-semibold">
                <th className="py-3 px-6">Nombre & Correo</th>
                <th className="py-3 px-6">Rol</th>
                <th className="py-3 px-6">Fecha de Alta</th>
                <th className="py-3 px-6 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => {
                const isAdmin = member.role === 'admin';
                return (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-gray-900">{member.full_name}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{member.email}</div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          isAdmin
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : member.role === 'supervisor'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {isAdmin ? 'Administrador' : member.role === 'supervisor' ? 'Supervisor' : 'Agente'}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-gray-500">
                      {new Date(member.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    <td className="py-3.5 px-6 text-right space-x-1">
                      <button
                        onClick={() => handleRegeneratePassword(member.id, member.full_name)}
                        disabled={regeneratingId === member.id}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                        title="Regenerar contraseña temporal"
                      >
                        <RotateCcw className={`w-4 h-4 ${regeneratingId === member.id ? 'animate-spin text-emerald-600' : ''}`} />
                      </button>

                      {!isAdmin && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.full_name)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                Agregar Nuevo Miembro al Equipo
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Crea el acceso asignándole una contraseña temporal para que ingrese de inmediato.
              </p>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Laura Gómez"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="laura@empresa.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Rol de Acceso *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                >
                  <option value="agent">Agente (Inbox WhatsApp & Pipeline)</option>
                  <option value="supervisor">Supervisor (Monitoreo & Reportes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-gray-400" />
                  Contraseña Temporal de Acceso * (Mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña inicial para el usuario"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  El usuario utilizará este correo y contraseña en /login.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-[#0052FF]/20 transition cursor-pointer"
                >
                  {isSubmitting ? 'Guardando...' : 'Crear Miembro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

