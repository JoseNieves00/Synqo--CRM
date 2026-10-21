'use client';

import React, { useState } from 'react';
import { updateUserProfile } from '@/app/actions/profile';
import { User, Lock, CheckCircle2, AlertCircle, X, Shield, HelpCircle } from 'lucide-react';

interface UserProfileModalProps {
  initialFullName: string;
  userEmail: string;
  userRole: string;
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({
  initialFullName,
  userEmail,
  userRole,
  isOpen,
  onClose,
}: UserProfileModalProps) {
  const [fullName, setFullName] = useState(initialFullName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    // Si se desea cambiar la contraseña
    if (newPassword) {
      if (!currentPassword) {
        setFeedback({
          type: 'error',
          message: 'Debes ingresar tu contraseña actual para autorizar el cambio.',
        });
        setSaving(false);
        return;
      }

      if (newPassword.length < 8) {
        setFeedback({
          type: 'error',
          message: 'La nueva contraseña debe tener al menos 8 caracteres.',
        });
        setSaving(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setFeedback({
          type: 'error',
          message: 'Las contraseñas ingresadas no coinciden.',
        });
        setSaving(false);
        return;
      }
    }

    try {
      const res = await updateUserProfile({
        fullName,
        currentPassword: currentPassword ? currentPassword : undefined,
        newPassword: newPassword ? newPassword : undefined,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Tu perfil fue actualizado exitosamente.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Ocurrió un error al actualizar el perfil.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error inesperado.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200">
        <div className="p-5 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Mi Perfil de Usuario</h3>
              <p className="text-xs text-gray-500">Actualiza tu nombre o cambia tu contraseña de acceso.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Correo Electrónico</label>
            <input
              type="text"
              disabled
              value={userEmail}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 text-xs font-mono cursor-not-allowed"
            />
            <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Rol asignado: <strong className="uppercase text-gray-700">{userRole}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs text-gray-900"
            />
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  Cambiar Contraseña (Opcional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotHelp(!showForgotHelp)}
                  className="text-[11px] text-[#0052FF] hover:underline font-semibold cursor-pointer"
                >
                  ¿Olvidaste tu contraseña actual?
                </button>
              </div>

              {showForgotHelp && (
                <div className="mb-3 p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs space-y-1.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    <HelpCircle className="w-4 h-4 text-[#0052FF]" />
                    <span>Recuperación de Contraseña por Jerarquía</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-blue-800">
                    {userRole === 'admin' ? (
                      <>
                        🏢 Como <strong>Administrador de Empresa</strong>, comunícate con el <strong>Super Administrador de Synqo</strong> (<code className="bg-blue-100 px-1 py-0.5 rounded font-mono">admin@synqo.dev</code>) para regenerar tu contraseña temporal de inmediato.
                      </>
                    ) : userRole === 'superadmin' ? (
                      <>
                        🛡️ Como <strong>Super Administrador</strong>, la recuperación de credenciales se gestiona a nivel de infraestructura central.
                      </>
                    ) : (
                      <>
                        👤 Como <strong>Asesor / Colaborador</strong>, solicita al <strong>Administrador de tu empresa</strong> que regenere tu contraseña temporal desde la pestaña <em>"Equipo & Asientos"</em> en Configuración.
                      </>
                    )}
                  </p>
                </div>
              )}

              <label className="block text-[11px] text-gray-500 mb-1">
                1. Contraseña Actual (requerida para autorizar cambios)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu contraseña actual"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] text-xs text-gray-900"
              />
            </div>

            {(currentPassword.length > 0 || newPassword.length > 0) && (
              <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    2. Nueva Contraseña (mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Escribe tu nueva contraseña"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] text-xs text-gray-900"
                  />
                </div>

                {newPassword && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      3. Confirmar Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite exactamente la nueva contraseña"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] text-xs text-gray-900"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0052FF] hover:bg-[#0047E0] transition shadow-md shadow-[#0052FF]/20 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

