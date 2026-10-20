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
} from 'lucide-react';
import { TeamTab } from './TeamTab';

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

          {/* Tarjeta de Licencia y Estado */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Estado de Licencia y Servicio</h2>
                  <p className="text-xs text-gray-500">Plan activo y disponibilidad de atención automatizada</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  subStatus === 'active' || subStatus === 'trialing'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}
              >
                {subStatus === 'trialing' ? `Prueba Activa (Plan ${planType.toUpperCase()})` : `Plan ${planType.toUpperCase()}: ${subStatus}`}
              </span>
            </div>
            <div className="text-xs text-gray-600 leading-relaxed">
              Tu empresa cuenta con acceso activo a la atención automática de WhatsApp, calificación de prospectos y agendamiento comercial con Inteligencia Artificial.
            </div>
          </div>

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

