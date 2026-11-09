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
  Key,
  Send,
  Loader2,
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
          message: res.message || 'Alerta de prueba enviada exitosamente.',
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
        message: err.message || 'Error de conexión con el servicio.',
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
          message: 'Perfil actualizado exitosamente.',
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
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      {/* Contenedor Modal: Synqo Precision (Diseño Horizontal Equilibrado) */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-[#232A3B] transition-colors animate-in zoom-in-95 duration-150">
        
        {/* Cabecera Fija */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-200/80 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200/80 dark:border-[#232A3B] flex items-center justify-center text-[#0052FF] dark:text-[#00D2FF]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Mi Perfil de Usuario
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B]">
                  <Shield className="w-3 h-3 text-[#0052FF] dark:text-[#00D2FF]" />
                  {userRole}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configura tu identidad, preferencias visuales y alertas de WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-lg transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario & Cuerpo con Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [scrollbar-width:thin]">
            {/* Banner de Feedback */}
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

            {/* Cuadrícula de 2 Columnas Balanceadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Columna Izquierda: Identidad & Apariencia */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-0.5">
                  <User className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                  <span>Identidad de Usuario</span>
                </div>

                {/* Nombre Completo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre y apellido"
                    className="w-full h-9.5 px-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 text-xs text-slate-900 dark:text-white transition shadow-2xs"
                  />
                </div>

                {/* Correo Electrónico (Con icono alineado sin superposición) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Correo Electrónico
                    </label>
                    {isAdmin ? (
                      <span className="text-[10px] font-semibold text-[#0052FF] dark:text-[#00D2FF] bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-200/80 dark:border-blue-500/20">
                        Editable por Admin
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">
                        Gestionado por Administrador
                      </span>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required={isAdmin}
                      disabled={!isAdmin}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full h-9.5 pl-10 pr-3.5 rounded-xl border text-xs font-mono transition ${
                        isAdmin
                          ? 'border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 shadow-2xs'
                          : 'border-slate-200 dark:border-[#232A3B] bg-slate-100/70 dark:bg-[#0D1017] text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                {/* Preferencia de Tema & Apariencia */}
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Tema de la Interfaz</span>
                    <span className="text-[10px] text-slate-400 font-normal">Preferencia local</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/70 dark:bg-[#090A0F] border border-slate-200/80 dark:border-[#232A3B] rounded-xl text-xs font-medium">
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
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-0.5">
                  <Bell className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                  <span>Alertas en WhatsApp Personal</span>
                </div>

                {/* Teléfono de WhatsApp con icono perfectamente alineado y botón sobrio */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Número de WhatsApp para Notificaciones
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 flex items-center">
                      <Smartphone className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        placeholder="ej: 3001234567 o 57300..."
                        className="w-full h-9.5 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/15 text-xs font-mono text-slate-900 dark:text-white transition shadow-2xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={sendingTest || !whatsappPhone.trim()}
                      onClick={handleSendTestAlert}
                      className="h-9.5 px-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#1A1F2C] hover:bg-slate-100 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-200 text-xs font-semibold whitespace-nowrap transition cursor-pointer disabled:opacity-50 shadow-2xs flex items-center gap-1.5"
                      title="Enviar un mensaje de prueba al número ingresado"
                    >
                      {sendingTest ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052FF]" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                          <span>Probar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Recibe avisos inmediatos cuando un lead calificado requiera tu atención.
                  </p>
                </div>

                {/* Toggles Modernos Estilo iOS / Apple HIG */}
                <div className="space-y-1.5">
                  <div
                    onClick={() => setWhatsappAlertsEnabled(!whatsappAlertsEnabled)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/50 hover:bg-slate-50 dark:hover:bg-[#090A0F] transition cursor-pointer select-none"
                  >
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Alertas de prospectos asignados
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Avisar al celular al asignárseme un nuevo chat.
                      </div>
                    </div>
                    <div
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out p-0.5 ${
                        whatsappAlertsEnabled ? 'bg-[#0052FF]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          whatsappAlertsEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => setWhatsappAlerts247(!whatsappAlerts247)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/50 hover:bg-slate-50 dark:hover:bg-[#090A0F] transition cursor-pointer select-none"
                  >
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Guardia 24/7 (Fuera de horario)
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Continuar recibiendo avisos en fines de semana o noches.
                      </div>
                    </div>
                    <div
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out p-0.5 ${
                        whatsappAlerts247 ? 'bg-[#0052FF]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          whatsappAlerts247 ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Bloque de Contraseña / Seguridad */}
                <div className="pt-0.5">
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
                        Por seguridad de infraestructura, la contraseña de Super Admin se actualiza por terminal:
                      </p>
                      <code className="text-[11px] font-mono text-[#00D2FF] block bg-[#05070B] p-1.5 rounded-lg border border-slate-800 select-all">
                        npm run reset-superadmin
                      </code>
                    </div>
                  ) : (
                    <div className="border border-slate-200/80 dark:border-[#232A3B] rounded-xl overflow-hidden bg-slate-50/50 dark:bg-[#090A0F]/60">
                      <button
                        type="button"
                        onClick={() => setShowPasswordSection(!showPasswordSection)}
                        className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-[#1A1F2C] transition cursor-pointer select-none"
                      >
                        <span className="flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-slate-400" />
                          <span>Cambiar Contraseña (Opcional)</span>
                        </span>
                        {showPasswordSection ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {showPasswordSection && (
                        <div className="p-3 border-t border-slate-200/80 dark:border-[#232A3B] space-y-2.5 bg-white dark:bg-[#131722] animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Credenciales de acceso
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
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/25 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
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
                              className="w-full h-8.5 px-3 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="2. Nueva (mín. 8 car.)"
                              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
                            />
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="3. Confirmar nueva"
                              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] focus:outline-none focus:border-[#0052FF] text-xs text-slate-900 dark:text-white"
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

          {/* Pie de Página Fijo (Garantiza visibilidad de botones en 100% de pantallas) */}
          <div className="shrink-0 px-6 py-3.5 bg-slate-50/80 dark:bg-[#0E131F] border-t border-slate-200/80 dark:border-[#232A3B] flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>Sesión activa protegida</span>
            </span>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#1E2433] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0052FF] hover:bg-[#0047E0] transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
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
