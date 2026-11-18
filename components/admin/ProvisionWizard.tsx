'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  X,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  QrCode,
  Smartphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { provisionCompany } from '@/app/actions/superadmin';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProvisionWizard({ onSuccess, onCancel }: Props) {
  // Datos de la empresa
  const [companyName, setCompanyName] = useState('');
  const [planType, setPlanType] = useState<'starter' | 'core' | 'pro' | 'enterprise'>('core');
  const [maxUsers, setMaxUsers] = useState<number>(3);

  // Credenciales Admin Inicial
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState(() => `Synqo${Math.floor(1000 + Math.random() * 9000)}!`);
  const [showPassword, setShowPassword] = useState(false);

  // Motor de WhatsApp
  const [whatsappProvider, setWhatsappProvider] = useState<'meta' | 'evolution'>('evolution');

  // Estados de envío y éxito
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    companyName: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  } | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Validación rápida
  const isFormValid = Boolean(
    companyName.trim().length >= 2 &&
    adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) &&
    adminPassword.length >= 8
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await provisionCompany({
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        planType,
        maxUsers,
        whatsappProvider,
      });

      setSuccessData({
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprovisionar la empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copiar todo el mensaje para WhatsApp
  const handleCopyWhatsAppMessage = () => {
    if (!successData) return;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://crm.synqo.dev/login';

    const message = `🎉 ¡Bienvenido a Synqo CRM!

Tus credenciales de acceso inicial como Administrador:
🏢 Empresa: ${successData.companyName}
👤 Usuario / Email: ${successData.adminEmail}
🔒 Contraseña inicial: ${successData.adminPassword}

👉 Inicia sesión aquí: ${loginUrl}

Módulos comerciales activos:
• 💬 Inbox Multicanal (WhatsApp & Instagram)
• 🤖 Agente IA Autónomo Comercial (ARM 24/7)
• 📊 Pipeline Kanban de Ventas
• 📅 Agenda Comercial & Citas (Google Calendar)
• ⚡ Seguimientos Automáticos de Leads

Por seguridad te sugerimos cambiar tu contraseña una vez ingreses al sistema. ¡Estamos listos para potenciar tus ventas!`;

    navigator.clipboard.writeText(message);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleCopySingleField = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200 text-gray-900">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center font-bold shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {successData ? '🎉 Empresa Creada con Éxito' : 'Aprovisionar Nueva Empresa'}
              </h2>
              <p className="text-xs text-gray-500">
                {successData
                  ? 'Comparte los datos de acceso con el administrador del negocio'
                  : 'Configura la empresa y sus credenciales de acceso inicial'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={successData ? () => { onSuccess(); onCancel(); } : onCancel}
            className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-200/60 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 [scrollbar-width:thin]">
          {!successData ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Sección 1: Datos de la Empresa */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#0052FF]" />
                  <h3 className="text-sm font-bold text-gray-900">Datos de la Empresa</h3>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ej. Distribuidora del Valle, Asesorías Pro, Clínica Dental…"
                    className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition font-medium shadow-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Plan Comercial
                    </label>
                    <select
                      value={planType}
                      onChange={(e) => setPlanType(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#0052FF]"
                    >
                      <option value="starter">Plan Starter</option>
                      <option value="core">Plan Core (Recomendado)</option>
                      <option value="pro">Plan Pro</option>
                      <option value="enterprise">Plan Enterprise</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Asesores / Usuarios Autorizados
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={maxUsers}
                        onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                        className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#0052FF]"
                      />
                      <span className="text-xs text-gray-500 shrink-0">cupos</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 2: Administrador Inicial */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#0052FF]" />
                  <h3 className="text-sm font-bold text-gray-900">Administrador Inicial</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Ej. Carlos Mendoza"
                      className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Correo Electrónico (Login) *
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@empresa.com"
                      className="w-full h-10 px-3.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Contraseña Temporal *
                    </label>
                    <button
                      type="button"
                      onClick={() => setAdminPassword(`Synqo${Math.floor(1000 + Math.random() * 9000)}!`)}
                      className="text-[11px] text-[#0052FF] hover:underline font-semibold cursor-pointer"
                    >
                      Generar otra
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-white border border-gray-200 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#0052FF]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sección 3: Conexión de WhatsApp */}
              <div className="p-5 rounded-2xl bg-slate-50/50 border border-gray-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#0052FF]" />
                  <h3 className="text-sm font-bold text-gray-900">Canal de WhatsApp Inicial</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      whatsappProvider === 'evolution'
                        ? 'bg-blue-50/80 border-[#0052FF] ring-2 ring-[#0052FF]/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="waProvider"
                      value="evolution"
                      checked={whatsappProvider === 'evolution'}
                      onChange={() => setWhatsappProvider('evolution')}
                      className="mt-0.5 w-4 h-4 text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-[#0052FF]" />
                        Evolution QR (30 segundos)
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded">Recomendado</span>
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-tight mt-0.5">
                        Conserva su número de ventas actual escaneando un código QR. Sin costos por mensaje ni papeleo de Meta.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                      whatsappProvider === 'meta'
                        ? 'bg-blue-50/80 border-[#0052FF] ring-2 ring-[#0052FF]/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="waProvider"
                      value="meta"
                      checked={whatsappProvider === 'meta'}
                      onChange={() => setWhatsappProvider('meta')}
                      className="mt-0.5 w-4 h-4 text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-gray-700" />
                        Meta Cloud API (Oficial)
                      </span>
                      <span className="text-[11px] text-gray-500 block leading-tight mt-0.5">
                        Canal corporativo oficial WABA. Requiere cuenta verificada de Meta y plantillas aprobadas.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {/* Botón de Enviar */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  className="px-6 py-2.5 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Aprovisionando...</span>
                    </>
                  ) : (
                    <span>Crear Empresa Inmediatamente</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Pantalla de Éxito */
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-emerald-950">
                  ¡Empresa {successData.companyName} Aprovisionada!
                </h3>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  La organización y su usuario administrador ya están activos en Synqo CRM. Comparte estas credenciales con el cliente.
                </p>
              </div>

              {/* Tarjetas de Credenciales */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                  <div>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase block">Usuario / Email</span>
                    <span className="text-xs font-mono font-bold text-gray-900">{successData.adminEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySingleField(successData.adminEmail, 'email')}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    title="Copiar email"
                  >
                    {copiedField === 'email' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                  <div>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase block">Contraseña Temporal</span>
                    <span className="text-xs font-mono font-bold text-gray-900">{successData.adminPassword}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySingleField(successData.adminPassword, 'password')}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    title="Copiar contraseña"
                  >
                    {copiedField === 'password' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyWhatsAppMessage}
                  className="w-full sm:flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>¡Mensaje Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Mensaje para WhatsApp</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSuccess();
                    onCancel();
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-xl text-xs font-bold transition text-center"
                >
                  Listo / Finalizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
