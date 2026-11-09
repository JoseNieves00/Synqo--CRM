'use client';

import React, { useState, useEffect } from 'react';
import { updateUserProfile, getUserProfileDetails, sendTestWhatsAppAlert } from '@/app/actions/profile';
import { useTheme } from 'next-themes';
import {
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  Shield,
  HelpCircle,
  Sun,
  Moon,
  Laptop,
  Bell,
  Mail,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Sparkles,
} from 'lucide-react';

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
  const [email, setEmail] = useState(userEmail);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(true);
  const [whatsappAlerts247, setWhatsappAlerts247] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const isAdmin =
    userRole === 'admin' ||
    userRole === 'superadmin' ||
    userEmail.toLowerCase() === 'admin@synqo.dev';

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setFullName(initialFullName);
      setEmail(userEmail);
      // Cargar preferencias guardadas del usuario
      getUserProfileDetails()
        .then((res) => {
          if (res.success && res.profile) {
            if (res.profile.full_name) setFullName(res.profile.full_name);
            if (res.profile.email) setEmail(res.profile.email);
            if (res.profile.whatsapp_phone) setWhatsappPhone(res.profile.whatsapp_phone);
            if (typeof res.profile.whatsapp_alerts_enabled === 'boolean') {
              setWhatsappAlertsEnabled(res.profile.whatsapp_alerts_enabled);
            }
            if (typeof res.profile.whatsapp_alerts_24_7 === 'boolean') {
              setWhatsappAlerts247(res.profile.whatsapp_alerts_24_7);
            }
          }
        })
        .catch(() => {});

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, initialFullName, userEmail]);

  const handleSendTestAlert = async () => {
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await sendTestWhatsAppAlert(whatsappPhone);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Alerta de prueba enviada a tu WhatsApp.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Error enviando la prueba.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error de conexión.',
      });
    } finally {
      setSendingTest(false);
    }
  };

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
        email: isAdmin ? email : undefined,
        currentPassword: currentPassword ? currentPassword : undefined,
        newPassword: newPassword ? newPassword : undefined,
        whatsappPhone,
        whatsappAlertsEnabled,
        whatsappAlerts247,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Tu perfil fue actualizado exitosamente.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
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

  const isSuperAdminAccount =
    userEmail.toLowerCase() === 'admin@synqo.dev' || userRole === 'superadmin';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      {/* Contenedor Horizontal Optimizado (max-w-3xl con Header y Footer fijos) */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-[#232A3B] transition-colors animate-in zoom-in-95 duration-200">
        
        {/* Encabezado Fijo */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/80 dark:bg-[#090A0F] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0052FF] to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Mi Perfil de Usuario
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30'
                      : 'bg-blue-100 text-[#0052FF] dark:bg-blue-500/20 dark:text-[#00D2FF] border border-blue-200 dark:border-blue-500/30'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  {userRole}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configura tus datos de identidad, alertas de relevo y preferencias personales.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E2433] rounded-lg transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario y Cuerpo con Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [scrollbar-width:thin]">
            {/* Feedback alert banner */}
            {feedback && (
              <div
                className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium animate-in fade-in duration-150 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Cuadrícula Horizontal de 2 Columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Columna Izquierda: Identidad & Apariencia */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <User className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                  <span>Identidad de Usuario</span>
                </div>

                {/* Nombre Completo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre y apellido"
                    className="w-full h-9.5 px-3 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 text-xs text-slate-900 dark:text-white transition shadow-2xs"
                  />
                </div>

                {/* Correo Electrónico (Editable por Admin) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Correo Electrónico
                    </label>
                    {isAdmin ? (
                      <span className="text-[10px] font-semibold text-[#0052FF] dark:text-[#00D2FF] bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">
                        Editable por Admin
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">
                        Gestionado por el Administrador
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      required={isAdmin}
                      disabled={!isAdmin}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full h-9.5 pl-8 pr-3 rounded-xl border text-xs font-mono transition ${
                        isAdmin
                          ? 'border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 shadow-2xs'
                          : 'border-slate-200 dark:border-[#232A3B] bg-slate-100 dark:bg-[#0D1017] text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      }`}
                    />
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                  </div>
                </div>

                {/* Preferencia de Tema & Apariencia */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Tema de la Interfaz</span>
                    <span className="text-[10px] text-slate-400 font-normal">Preferencia local</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer select-none ${
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
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer select-none ${
                        theme === 'dark'
                          ? 'bg-white dark:bg-[#131722] text-[#0052FF] font-semibold border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Oscuro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('system')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition cursor-pointer select-none ${
                        theme === 'system'
                          ? 'bg-white dark:bg-[#131722] text-[#0052FF] font-semibold border border-slate-200 dark:border-[#232A3B] shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Laptop className="w-3.5 h-3.5 text-slate-500" />
                      <span>Sistema</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Alertas de WhatsApp & Seguridad */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Bell className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Alertas Autónomas en mi WhatsApp</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Número de WhatsApp Personal (Notificaciones)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        placeholder="ej: 3001234567 o 57300..."
                        className="w-full h-9.5 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 text-xs font-mono text-slate-900 dark:text-white transition shadow-2xs"
                      />
                      <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                    </div>
                    <button
                      type="button"
                      disabled={sendingTest || !whatsappPhone.trim()}
                      onClick={handleSendTestAlert}
                      className="h-9.5 px-3 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer disabled:opacity-50 shadow-2xs"
                      title="Enviar un mensaje de prueba a tu WhatsApp"
                    >
                      {sendingTest ? 'Enviando...' : '🔔 Probar'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Recibe avisos inmediatos en tu celular cuando un lead calificado se te asigne o requiera atención humana.
                  </p>
                </div>

                <div className="space-y-2 p-2.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={whatsappAlertsEnabled}
                      onChange={(e) => setWhatsappAlertsEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0052FF] focus:ring-0 cursor-pointer"
                    />
                    <span className="font-medium">Recibir avisos al asignárseme un prospecto</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={whatsappAlerts247}
                      onChange={(e) => setWhatsappAlerts247(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0052FF] focus:ring-0 cursor-pointer"
                    />
                    <span className="font-medium">Guardia 24/7 (recibir alertas fuera de horario)</span>
                  </label>
                </div>

                {/* Bloque de Contraseña / Seguridad */}
                <div className="pt-1">
                  {isSuperAdminAccount ? (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#00D2FF]">
                          <Shield className="w-3.5 h-3.5" />
                          <span>Super Admin Protegido</span>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-[#0052FF]/30 text-[#00D2FF] px-1.5 py-0.5 rounded border border-[#00D2FF]/20">
                          Terminal Only
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        La contraseña del Super Administrador se actualiza mediante CLI:
                      </p>
                      <code className="text-[11px] font-mono text-[#00D2FF] block bg-[#05070B] p-1.5 rounded-lg border border-slate-800 select-all">
                        npm run reset-superadmin
                      </code>
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-[#232A3B] rounded-xl overflow-hidden bg-slate-50/50 dark:bg-[#090A0F]/60">
                      <button
                        type="button"
                        onClick={() => setShowPasswordSection(!showPasswordSection)}
                        className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer select-none"
                      >
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Cambiar Contraseña (Opcional)</span>
                        </span>
                        {showPasswordSection ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {showPasswordSection && (
                        <div className="p-3 border-t border-slate-200 dark:border-[#232A3B] space-y-2.5 bg-white dark:bg-[#131722] animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Actualizar credenciales de acceso
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowForgotHelp(!showForgotHelp)}
                              className="text-[10px] text-[#0052FF] dark:text-[#00D2FF] hover:underline font-semibold cursor-pointer"
                            >
                              ¿Olvidaste tu contraseña?
                            </button>
                          </div>

                          {showForgotHelp && (
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
                              <p className="leading-snug">
                                {userRole === 'admin' ? (
                                  <>
                                    Contacta al <strong>Super Admin</strong> (
                                    <code className="font-mono">admin@synqo.dev</code>) para
                                    regenerar tu contraseña temporal.
                                  </>
                                ) : (
                                  <>
                                    Solicita al <strong>Administrador de tu empresa</strong> que
                                    regenere tu clave temporal desde <em>Equipo & Usuarios</em>.
                                  </>
                                )}
                              </p>
                            </div>
                          )}

                          <div>
                            <input
                              type="password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="1. Contraseña actual para autorizar"
                              className="w-full h-8.5 px-3 rounded-lg border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="2. Nueva (mín. 8 caracteres)"
                              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
                            />
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="3. Confirmar nueva"
                              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-300 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pie de Página Fijo (NUNCA se oculta ni sale de la pantalla) */}
          <div className="shrink-0 px-6 py-3.5 bg-slate-50 dark:bg-[#0E131F] border-t border-slate-200 dark:border-[#232A3B] flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
              <span>Cambios sincronizados en tu sesión activa.</span>
            </span>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#1E2433] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0052FF] hover:bg-[#0047E0] transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
