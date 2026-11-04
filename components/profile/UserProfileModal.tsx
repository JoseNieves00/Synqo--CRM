'use client';

import React, { useState } from 'react';
import { updateUserProfile } from '@/app/actions/profile';
import { useTheme } from 'next-themes';
import { User, Lock, CheckCircle2, AlertCircle, X, Shield, HelpCircle, Sun, Moon, Laptop } from 'lucide-react';

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
  const { theme, setTheme } = useTheme();
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
          message: 'Las nuevas contraseñas no coinciden.',
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-[#232A3B] transition-colors">
        <div className="p-5 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mi Perfil de Usuario</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Actualiza tu nombre o cambia tu contraseña.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E2433] rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo Electrónico</label>
            <input
              type="text"
              disabled
              value={userEmail}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-100 dark:bg-[#0D1017] text-slate-500 dark:text-slate-400 text-xs font-mono cursor-not-allowed"
            />
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Rol asignado: <strong className="uppercase text-slate-700 dark:text-slate-300">{userRole}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre Completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:ring-1 focus:ring-[#0052FF] text-xs text-slate-900 dark:text-white"
            />
          </div>

          {/* Preferencia de Apariencia & Tema */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Tema de la Interfaz</span>
              <span className="text-[10px] text-slate-400 font-normal">Preferencia de este dispositivo</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-[#131722] text-[#0052FF] font-semibold border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Claro</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-[#131722] text-[#0052FF] font-semibold border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Oscuro</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer ${
                  theme === 'system'
                    ? 'bg-white dark:bg-[#131722] text-[#0052FF] font-semibold border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>Sistema</span>
              </button>
            </div>
          </div>

          {/* Bloque de Contraseña */}
          {userEmail.toLowerCase() === 'admin@synqo.dev' || userRole === 'superadmin' ? (
            <div className="pt-2 border-t border-slate-200 dark:border-[#1E2433]">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#00D2FF]" />
                    <span className="font-bold text-xs">Cuenta Super Admin Protegida</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-[#0052FF]/20 text-[#00D2FF] border border-[#00D2FF]/30">
                    Terminal Only
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Por seguridad de infraestructura, la contraseña del Super Administrador está desactivada en la web y únicamente se puede actualizar mediante terminal:
                </p>
                <div className="bg-[#090A0F] p-2.5 rounded-xl border border-slate-800">
                  <code className="text-xs font-mono text-[#00D2FF] block select-all">
                    npm run reset-superadmin
                  </code>
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-200 dark:border-[#1E2433] space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
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
                  <div className="mb-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 font-bold text-blue-950 dark:text-white">
                      <HelpCircle className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                      <span>Recuperación de Contraseña por Jerarquía</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                      {userRole === 'admin' ? (
                        <>
                          Como <strong>Administrador de Empresa</strong>, comunícate con el <strong>Super Administrador de Synqo</strong> (<code className="bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded font-mono">admin@synqo.dev</code>) para regenerar tu contraseña temporal de inmediato.
                        </>
                      ) : (
                        <>
                          Como <strong>Asesor / Colaborador</strong>, solicita al <strong>Administrador de tu empresa</strong> que regenere tu contraseña temporal desde la pestaña <em>"Equipo & Usuarios"</em> en Configuración.
                        </>
                      )}
                    </p>
                  </div>
                )}

                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  1. Contraseña Actual (requerida para autorizar cambios)
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña actual"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:ring-1 focus:ring-[#0052FF] text-xs text-slate-900 dark:text-white"
                />
              </div>

              {(currentPassword.length > 0 || newPassword.length > 0) && (
                <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      2. Nueva Contraseña (mínimo 8 caracteres)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Escribe tu nueva contraseña"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:ring-1 focus:ring-[#0052FF] text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  {newPassword && (
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        3. Confirmar Nueva Contraseña
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite exactamente la nueva contraseña"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:ring-1 focus:ring-[#0052FF] text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#1E2433]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1E2433] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0052FF] hover:bg-[#0047E0] transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
