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
    seats: 'Hasta 2 asientos de asesores incluidos',
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
    seats: 'Hasta 2 asientos de asesores incluidos',
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
    seats: 'Hasta 5 asientos de asesores incluidos',
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
    seats: 'Hasta 12 asientos de asesores incluidos',
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
    calEventTypeId?: string | null;
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
  const [calApiKey, setCalApiKey] = useState('');
  const [calEventTypeId, setCalEventTypeId] = useState(initialData.calEventTypeId || '');
  const [systemPrompt, setSystemPrompt] = useState(
    initialData.systemPrompt ||
      'Eres un asesor comercial experto y empático de Synqo. Responde con cortesía, resuelve dudas de servicios y orienta al prospecto a agendar una cita mediante Cal.com.'
  );

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
            Equipo & Asientos ({teamData.members.length}/{teamData.organization.maxUsers})
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

                  {/* Cuotas del Plan: Asientos y Tokens */}
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
                Phone Number ID de Meta
              </label>
              <input
                type="text"
                placeholder="Ej. 104589234812345"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center justify-between">
                <span>WhatsApp Permanent Access Token</span>
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Almacenamiento Seguro
                </span>
              </label>
              <input
                type="password"
                placeholder="••••••••••••••••••••••••"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
        </div>

        {/* Cal.com Scheduling */}
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
                  <Lock className="w-3 h-3" /> Almacenamiento Seguro
                </span>
              </label>
              <input
                type="password"
                placeholder="cal_live_••••••••••••••••"
                value={calApiKey}
                onChange={(e) => setCalApiKey(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Event Type ID de Cal.com
              </label>
              <input
                type="text"
                placeholder="Ej. 123456"
                value={calEventTypeId}
                onChange={(e) => setCalEventTypeId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-3.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
        </div>

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

