'use client';

import React, { useState } from 'react';
import {
  updateOrganizationSettings,
  testWhatsAppConnection,
  testCalConnection,
} from '@/app/actions/settings';
import {
  KeyRound,
  Bot,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Lock,
  Users,
  Sliders,
  Check,
  Zap,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { TeamTab } from './TeamTab';

interface PlanDetails {
  title: string;
  badge: string;
  description: string;
  tokens: string;
  seats: string;
  features: string[];
  highlight?: string;
}

const PLAN_BENEFITS: Record<string, PlanDetails> = {
  core: {
    title: 'Starter (Validación)',
    badge: 'Starter',
    description: 'Diseñado para negocios unipersonales o 1-2 asesores validando su canal de captación y cierre por WhatsApp.',
    tokens: '500,000 tokens IA / mes (~350 - 500 chats)',
    seats: 'Hasta 2 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte técnico estándar por ticket y correo',
    ],
  },
  starter: {
    title: 'Starter (Validación)',
    badge: 'Starter',
    description: 'Diseñado para negocios unipersonales o 1-2 asesores validando su canal de captación y cierre por WhatsApp.',
    tokens: '500,000 tokens IA / mes (~350 - 500 chats)',
    seats: 'Hasta 2 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte técnico estándar por ticket y correo',
    ],
  },
  pro: {
    title: 'Pro Comercial (Recomendado)',
    badge: 'Pro',
    description: 'Para empresas con equipo comercial activo que buscan acelerar la conversión y cierre de prospectos calificados.',
    tokens: '2,500,000 tokens IA / mes (~1,800 - 2,500 chats)',
    seats: 'Hasta 5 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Exportación de Leads y contactos a archivo CSV / Excel',
      'Alertas sonoras melódicas y notificaciones push al navegador',
      'Soporte comercial prioritario por correo electrónico',
    ],
    highlight: 'Plan Más Popular',
  },
  enterprise: {
    title: 'Enterprise Corporativo (Escala)',
    badge: 'Enterprise',
    description: 'Para operaciones comerciales consolidadas con múltiples turnos y equipos comerciales grandes.',
    tokens: '7,500,000 tokens IA / mes (~5,000 - 7,500 chats)',
    seats: 'Hasta 12 usuarios de asesores incluidos',
    features: [
      'IA autónoma con Prompt 100% editable y personalizable',
      'Bandeja de entrada de WhatsApp & Kanban en tiempo real',
      'Agendamiento de citas sincronizado con Cal.com',
      'Exportación Masiva de Leads & Historial completo a Excel',
      'Grupo VIP de WhatsApp dedicado con SLA de respuesta < 2h',
      'Sesión de Capacitación en Vivo (45 min) para asesores',
      'Facturación corporativa anual / local y soporte preferencial',
    ],
    highlight: 'Soporte VIP en WhatsApp',
  },
};

interface SettingsFormProps {
  initialData: {
    whatsappPhoneNumberId?: string | null;
    hasWhatsappToken?: boolean;
    hasWhatsappAppSecret?: boolean;
    calEventTypeId?: string | null;
    calComEnabled?: boolean;
    systemPrompt?: string | null;
    subscriptionStatus?: string | null;
    planType?: string | null;
    orgName?: string | null;
  };
  teamData?: {
    organization: {
      id: string;
      name: string;
      planType: string;
      maxUsers: number;
      usedUsers: number;
      remainingSeats: number;
    };
    members: any[];
  };
}

export function SettingsForm({ initialData, teamData }: SettingsFormProps) {
  const [activeTab, setActiveTab] = useState<'integrations' | 'team'>('integrations');
  const [phoneNumberId, setPhoneNumberId] = useState(initialData.whatsappPhoneNumberId || '');
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [appSecret, setAppSecret] = useState('');
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [calApiKey, setCalApiKey] = useState('');
  const [calEventTypeId, setCalEventTypeId] = useState(initialData.calEventTypeId || '');
  const [systemPrompt, setSystemPrompt] = useState(
    initialData.systemPrompt ||
      'Eres un asesor comercial experto y empático de Synqo. Responde con cortesía, resuelve dudas de servicios y orienta al prospecto a agendar una cita mediante Cal.com.'
  );

  // URL del Webhook y token de verificación para Meta Developers
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/webhook`
    : 'https://crm.synqo.dev/api/whatsapp/webhook';
  const verifyToken = 'synqo_webhook_2026';

  const copyToClipboard = (text: string, type: 'url' | 'token') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    }
  };

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Estados para pruebas de conexión
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const [testingCal, setTestingCal] = useState(false);
  const [calTestResult, setCalTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWaTestResult(null);
    try {
      const res = await testWhatsAppConnection({
        phoneNumberId: phoneNumberId || undefined,
        accessToken: accessToken || undefined,
        appSecret: appSecret || undefined,
      });
      setWaTestResult(res);
    } catch (err: any) {
      setWaTestResult({ success: false, error: err.message || 'Error probando WhatsApp' });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleTestCal = async () => {
    setTestingCal(true);
    setCalTestResult(null);
    try {
      const res = await testCalConnection({
        apiKey: calApiKey || undefined,
        eventTypeId: calEventTypeId || undefined,
      });
      setCalTestResult(res);
      if (res.success && (res as any).detectedEventId) {
        setCalEventTypeId(String((res as any).detectedEventId));
      }
    } catch (err: any) {
      setCalTestResult({ success: false, error: err.message || 'Error probando Cal.com' });
    } finally {
      setTestingCal(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await updateOrganizationSettings({
        whatsappPhoneNumberId: phoneNumberId || undefined,
        whatsappAccessToken: accessToken || undefined,
        whatsappAppSecret: appSecret || undefined,
        calApiKey: calApiKey || undefined,
        calEventTypeId: calEventTypeId || undefined,
        systemPrompt: systemPrompt || undefined,
      });

      setFeedback({
        type: 'success',
        message: 'Configuración y credenciales guardadas de forma segura.',
      });
      // Limpiar campos sensibles por seguridad
      setAccessToken('');
      setAppSecret('');
      setCalApiKey('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error al guardar configuración',
      });
    } finally {
      setSaving(false);
    }
  };

  const subStatus = initialData.subscriptionStatus || 'trialing';
  const planType = initialData.planType || 'core';

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Configuración & Administración
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona las integraciones de IA, credenciales cifradas y accesos de agentes de {initialData.orgName || 'tu empresa'}.
        </p>
      </div>

      {/* Navegación por Pestañas */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'integrations'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Integraciones & IA
        </button>

        {teamData && (
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
              activeTab === 'team'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            Equipo & Usuarios ({teamData.members.length}/{teamData.organization.maxUsers})
          </button>
        )}
      </div>

      {activeTab === 'team' && teamData ? (
        <TeamTab initialData={teamData} />
      ) : (
        <>
          {feedback && (
            <div
              className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Tarjeta de Licencia y Beneficios del Plan */}
          {(() => {
            const currentPlan = PLAN_BENEFITS[planType.toLowerCase()] || PLAN_BENEFITS.core;
            return (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#0052FF]/10 text-[#0052FF] rounded-xl">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900">Estado de Licencia & Servicio</h2>
                        {currentPlan.highlight && (
                          <span className="text-[10px] bg-[#0052FF]/10 text-[#0052FF] font-semibold px-2 py-0.5 rounded-full border border-[#0052FF]/20">
                            {currentPlan.highlight}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Plan contratado y herramientas activas en tu suscripción</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                        subStatus === 'active' || subStatus === 'trialing'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          subStatus === 'active' || subStatus === 'trialing'
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-rose-500'
                        }`}
                      />
                      {subStatus === 'trialing'
                        ? `Prueba Activa (${currentPlan.badge})`
                        : `Plan ${currentPlan.badge}: ${subStatus.toUpperCase()}`}
                    </span>
                  </div>
                </div>

                {/* Descripción y Resumen del Plan */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-gray-700 leading-relaxed font-medium">
                    {currentPlan.description}
                  </p>

                  {/* Cuotas del Plan: Usuarios y Tokens */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white text-[#0052FF] border border-slate-200 shadow-xs">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">
                          Capacidad de Equipo
                        </span>
                        <span className="text-xs font-bold text-gray-900">{currentPlan.seats}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white text-[#0052FF] border border-slate-200 shadow-xs">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">
                          Cuota Mensual de Inteligencia Artificial
                        </span>
                        <span className="text-xs font-bold text-gray-900">{currentPlan.tokens}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lista Oficial de Beneficios */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-2">
                      Beneficios Incluidos en tu Plan:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {currentPlan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-gray-600">
                          <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Formulario de Integraciones */}
          <form onSubmit={handleSave} className="space-y-6">
            {/* Guía y Datos del Webhook para Meta Developers */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Configuración del Webhook en Meta Developers</h3>
                    <p className="text-xs text-slate-300">Pega estos datos en tu App de Meta para recibir los mensajes de WhatsApp</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Webhook Listo
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* URL del Webhook */}
                <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">URL de devolución de llamada (Webhook URL)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookUrl, 'url')}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer font-medium transition"
                    >
                      {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedWebhook ? '¡Copiado!' : 'Copiar URL'}
                    </button>
                  </div>
                  <div className="bg-slate-950/60 rounded px-2.5 py-1.5 text-xs font-mono text-emerald-400 break-all select-all border border-slate-800">
                    {webhookUrl}
                  </div>
                </div>

                {/* Token de Verificación */}
                <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">Token de verificación (Verify Token)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(verifyToken, 'token')}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer font-medium transition"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken ? '¡Copiado!' : 'Copiar Token'}
                    </button>
                  </div>
                  <div className="bg-slate-950/60 rounded px-2.5 py-1.5 text-xs font-mono text-blue-400 select-all border border-slate-800">
                    {verifyToken}
                  </div>
                </div>
              </div>

              {/* Pasos visuales rápidos */}
              <div className="bg-slate-950/40 rounded-lg p-3 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span>📌 Pasos en tu App de Meta Developers:</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">30 segundos</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pt-0.5">
                  <li>En tu App de Meta ve a <strong className="text-slate-200">WhatsApp → Configuración</strong>.</li>
                  <li>En la sección <strong className="text-slate-200">Webhook</strong> pulsa <em>Editar</em>, pega la URL y el Token de arriba y haz clic en <em>Verificar y guardar</em>.</li>
                  <li>En la tabla de campos, haz clic en <strong className="text-slate-200">Administrar</strong> y activa la casilla <code className="text-emerald-400 bg-slate-850 px-1 rounded font-mono">messages</code>.</li>
                </ol>
              </div>
            </div>

            {/* Meta WhatsApp Cloud API */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Meta WhatsApp Cloud API (v20+)</h2>
                    <p className="text-xs text-gray-500">Credenciales del número comercial de WhatsApp Business</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={testingWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin' : ''}`} />
                  {testingWhatsApp ? 'Probando...' : 'Probar Conexión WhatsApp'}
                </button>
              </div>

              {waTestResult && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                    waTestResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {waTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{waTestResult.success ? waTestResult.message : waTestResult.error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Phone Number ID de Meta (Solo números)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 104589234812345"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Encuéntralo en Meta for Developers → WhatsApp → API Setup → Phone number ID.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                    <span>WhatsApp Permanent Access Token</span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Cifrado AES-256
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder={initialData.hasWhatsappToken ? '•••••••••••••••••••••••• (Guardado)' : 'EAAG••••••••••••••••••••'}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value.trim())}
                      className="w-full text-sm border border-gray-300 rounded-md pl-3.5 pr-10 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                      title={showToken ? 'Ocultar token' : 'Mostrar token'}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Token del Sistema con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>Meta App Secret (Clave Secreta de la App)</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-normal px-2 py-0.5 rounded-full border border-slate-200">
                        Recomendado para Autogestión
                      </span>
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Cifrado AES-256
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showAppSecret ? 'text' : 'password'}
                      placeholder={initialData.hasWhatsappAppSecret ? '•••••••••••••••••••••••••••••••• (Guardado)' : 'Ej. a1b2c3d4e5f67890abcdef1234567890'}
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value.trim())}
                      className="w-full text-sm border border-gray-300 rounded-md pl-3.5 pr-10 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAppSecret(!showAppSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                      title={showAppSecret ? 'Ocultar secret' : 'Mostrar secret'}
                    >
                      {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Encuéntralo en Meta for Developers → Configuración de la app → Información básica → Clave secreta. Valida criptográficamente cada mensaje entrante para tu empresa.
                  </p>
                </div>
              </div>
            </div>

        {/* Cal.com Scheduling (Solo si el Super Admin lo habilitó para esta empresa) */}
        {initialData.calComEnabled && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Integración con Cal.com</h2>
                  <p className="text-xs text-gray-500">Permite a Synqo AI consultar disponibilidad y agendar citas</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestCal}
                disabled={testingCal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${testingCal ? 'animate-spin' : ''}`} />
                {testingCal ? 'Probando...' : 'Probar Conexión Cal.com'}
              </button>
            </div>

            {calTestResult && (
              <div
                className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  calTestResult.success
                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {calTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{calTestResult.success ? calTestResult.message : calTestResult.error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                  <span>Cal.com API Key</span>
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Almacenamiento Cifrado
                  </span>
                </label>
                <input
                  type="password"
                  placeholder="cal_live_••••••••••••••••"
                  value={calApiKey}
                  onChange={(e) => setCalApiKey(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Generada en Cal.com → Settings → Developer → API Keys (empieza con <code>cal_live_</code>).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Tipo de Evento o Enlace Cal.com (Opcional - Detección Automática)
                </label>
                <input
                  type="text"
                  placeholder="Ej. cita-comercial (o déjalo vacío para auto-detectar)"
                  value={calEventTypeId}
                  onChange={(e) => setCalEventTypeId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black font-mono text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Puedes escribir el nombre de tu evento (ej. <strong className="text-purple-700">cita-comercial</strong>), pegar tu enlace completo, o dejarlo en blanco para que el botón <strong>"Probar Conexión"</strong> lo detecte y complete automáticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* OpenAI System Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="p-2.5 bg-slate-100 text-slate-800 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Instrucciones y Objetivos del Asesor IA</h2>
              <p className="text-xs text-gray-500">Define el tono, servicios de la empresa y objetivos comerciales</p>
            </div>
          </div>

          <div>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Las directrices de confidencialidad, cortesía y protección comercial se aplican automáticamente para garantizar un servicio profesional.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0052FF] hover:bg-[#0047E0] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition shadow-md shadow-[#0052FF]/20 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </form>
      </>
      )}
    </div>
  );
}

