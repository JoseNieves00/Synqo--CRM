'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Bot, Clock, DollarSign, ShieldCheck, Save, Loader2 } from 'lucide-react';
import {
  WORKFLOW_PRESETS,
  normalizeWorkflowPolicy,
  type WorkflowPolicy,
  type WorkflowRole,
  type PriceDisclosurePolicy,
  type RequiredLeadField,
} from '@/lib/types/workflow';
import { saveWorkflowPolicy } from '@/app/actions/settings';

interface BusinessHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
  days: number[];
}

interface WorkflowPolicySettingsProps {
  initialPolicy?: Partial<WorkflowPolicy> | null;
  initialBusinessHours?: Partial<BusinessHoursConfig> | null;
  supportsOrders?: boolean;
  supportsAppointments?: boolean;
  onPolicySaved?: (saved: WorkflowPolicy, savedHours?: BusinessHoursConfig) => void;
}

const DEFAULT_HOURS: BusinessHoursConfig = {
  enabled: false,
  start: '08:00',
  end: '21:00',
  days: [1, 2, 3, 4, 5, 6],
};

const WEEK_DAYS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
];

const REQUIRED_FIELD_OPTIONS: Array<{
  id: RequiredLeadField;
  label: string;
  scope: 'all' | 'orders' | 'appointments';
}> = [
  { id: 'product_or_service', label: 'Producto o Servicio de interés', scope: 'all' },
  { id: 'city', label: 'Ciudad de entrega', scope: 'orders' },
  { id: 'modality', label: 'Modalidad (presencial / virtual)', scope: 'appointments' },
  { id: 'date_preference', label: 'Fecha u horario preferido', scope: 'appointments' },
];

export function WorkflowPolicySettings({
  initialPolicy,
  initialBusinessHours,
  supportsOrders = true,
  supportsAppointments = true,
  onPolicySaved,
}: WorkflowPolicySettingsProps) {
  const [policy, setPolicy] = useState<WorkflowPolicy>(() => normalizeWorkflowPolicy(initialPolicy));
  const [hours, setHours] = useState<BusinessHoursConfig>(() => ({
    enabled: Boolean(initialBusinessHours?.enabled),
    start: initialBusinessHours?.start || DEFAULT_HOURS.start,
    end: initialBusinessHours?.end || DEFAULT_HOURS.end,
    days: Array.isArray(initialBusinessHours?.days) ? initialBusinessHours.days : DEFAULT_HOURS.days,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const visibleRequiredFields = REQUIRED_FIELD_OPTIONS.filter((opt) => {
    if (opt.scope === 'orders') return supportsOrders;
    if (opt.scope === 'appointments') return supportsAppointments;
    return true;
  });

  const applyModePreset = (mode: 'autonomous' | 'handoff') => {
    if (mode === 'autonomous') {
      const base =
        !supportsOrders && supportsAppointments
          ? WORKFLOW_PRESETS.appointments.policy
          : WORKFLOW_PRESETS.autonomous_24_7.policy;
      setPolicy({
        ...base,
        allowAiOrders: supportsOrders,
        allowAiAppointments: supportsAppointments,
        requiredFields: supportsOrders && !supportsAppointments ? ['product_or_service'] : base.requiredFields,
      });
    } else {
      const base = WORKFLOW_PRESETS.qualifier_handoff.policy;
      setPolicy({
        ...base,
        allowAiOrders: false,
        allowAiAppointments: false,
        requiredFields: supportsOrders
          ? ['product_or_service', 'city']
          : ['product_or_service', 'modality'],
      });
    }
    setFeedback(null);
  };

  const toggleRequiredField = (field: RequiredLeadField) => {
    setPolicy((prev) => {
      const exists = prev.requiredFields.includes(field);
      return {
        ...prev,
        presetId: 'custom',
        requiredFields: exists
          ? prev.requiredFields.filter((f) => f !== field)
          : [...prev.requiredFields, field],
      };
    });
  };

  const toggleDay = (dayId: number) => {
    setHours((prev) => ({
      ...prev,
      days: prev.days.includes(dayId) ? prev.days.filter((d) => d !== dayId) : [...prev.days, dayId],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveWorkflowPolicy(policy, hours);
      onPolicySaved?.(policy, hours);
      setFeedback({ type: 'success', text: 'Flujo de trabajo y horario guardados. La IA aplicará estas reglas de inmediato.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error guardando el flujo de trabajo.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0052FF] dark:text-[#00D2FF] shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Flujo Operativo del Agente IA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Define cómo actúa la IA según tu horario laboral, cuándo da precios y cuándo pasa el chat a un asesor.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Guardando...' : 'Guardar Flujo'}</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* 2 Modos Universales adaptados al tipo de negocio */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Modo de atención principal (1 clic):
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => applyModePreset('autonomous')}
              className={`text-left p-4 rounded-xl border transition cursor-pointer ${
                policy.presetId === 'autonomous_24_7' || policy.presetId === 'appointments'
                  ? 'border-[#0052FF] bg-blue-50/60 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-[#232A3B] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Atención Autónoma 24/7
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {supportsOrders && supportsAppointments
                  ? 'La IA asesora, da precios, cierra pedidos y agenda citas sola todo el día.'
                  : supportsAppointments
                  ? 'La IA asesora, da precios, consulta disponibilidad y agenda citas sola 24/7.'
                  : 'La IA asesora, da precios, cotiza y cierra pedidos sola todo el día.'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyModePreset('handoff')}
              className={`text-left p-4 rounded-xl border transition cursor-pointer ${
                policy.presetId === 'qualifier_handoff'
                  ? 'border-[#0052FF] bg-blue-50/60 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-[#232A3B] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Recepción + Relevo a Asesor (Horario Laboral)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                En horario laboral captura {supportsOrders ? 'producto + ciudad' : 'servicio + modalidad'} y pasa al asesor sin dar precios. Fuera de horario responde dudas, da precios y deja el cierre pendiente en Inbox.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Controles detallados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <Clock className="w-4 h-4 text-[#0052FF]" />
            <span>1. Rol según Horario Laboral</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Dentro de horario laboral
            </label>
            <select
              value={policy.businessHoursRole}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, presetId: 'custom', businessHoursRole: e.target.value as WorkflowRole }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
            >
              <option value="autonomous_close">Cierra ventas / citas sola</option>
              <option value="qualify_and_handoff">Recibe, captura datos y pasa a asesor</option>
              <option value="assist_only">Solo responde dudas y pasa a asesor</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Fuera de horario (noches / madrugadas)
            </label>
            <select
              value={policy.afterHoursRole}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, presetId: 'custom', afterHoursRole: e.target.value as WorkflowRole }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
            >
              <option value="assist_only">Responde dudas y deja venta pendiente al asesor</option>
              <option value="qualify_and_handoff">Captura datos y deja pendiente al abrir</option>
              <option value="autonomous_close">Cierra ventas / citas sola 24/7</option>
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#232A3B] space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Activar horario laboral automático
              </span>
              <input
                type="checkbox"
                checked={hours.enabled}
                onChange={(e) => setHours((h) => ({ ...h, enabled: e.target.checked }))}
                className="rounded border-slate-300 text-[#0052FF]"
              />
            </label>

            {hours.enabled && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Hora inicio</label>
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Hora fin</label>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {WEEK_DAYS.map((d) => {
                    const active = hours.days.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDay(d.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                          active
                            ? 'bg-[#0052FF] text-white'
                            : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span>2. Precios y Pertinencia</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              ¿Cuándo puede dar precios la IA?
            </label>
            <select
              value={policy.pricePolicy}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, presetId: 'custom', pricePolicy: e.target.value as PriceDisclosurePolicy }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
            >
              <option value="always">Siempre</option>
              <option value="after_hours_only">Solo fuera de horario (de día cotiza el asesor)</option>
              <option value="never">Nunca (siempre cotiza el asesor)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Estilo de respuesta
            </label>
            <select
              value={policy.responseStyle}
              onChange={(e) =>
                setPolicy((p) => ({
                  ...p,
                  presetId: 'custom',
                  responseStyle: e.target.value as 'strict' | 'consultive',
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
            >
              <option value="strict">Estricto (solo responde lo preguntado, cero extras)</option>
              <option value="consultive">Consultivo (asesora y sugiere opciones)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Extensión máxima de cada respuesta
            </label>
            <select
              value={String(policy.maxReplyChars ?? 450)}
              onChange={(e) =>
                setPolicy((p) => ({
                  ...p,
                  presetId: 'custom',
                  maxReplyChars: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-white"
            >
              <option value="250">Muy corta (hasta 250 caracteres)</option>
              <option value="450">Estándar WhatsApp (hasta 450 caracteres)</option>
              <option value="800">Amplia (hasta 800 caracteres)</option>
              <option value="0">Sin límite fijo (según el prompt del negocio)</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-4 space-y-2.5">
          <p className="font-bold text-slate-900 dark:text-white">
            3. Datos obligatorios antes de cotizar o relevar
          </p>
          <div className="space-y-2">
            {visibleRequiredFields.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={policy.requiredFields.includes(opt.id)}
                  onChange={() => toggleRequiredField(opt.id)}
                  className="rounded border-slate-300 text-[#0052FF]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>4. Relevo y Acciones Permitidas</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={policy.handoffOnQualified}
              onChange={(e) => setPolicy((p) => ({ ...p, presetId: 'custom', handoffOnQualified: e.target.checked }))}
              className="rounded border-slate-300 text-[#0052FF]"
            />
            <span>Relevar a asesor al completar datos obligatorios</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={policy.handoffOnCampaignReply}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, presetId: 'custom', handoffOnCampaignReply: e.target.checked }))
              }
              className="rounded border-slate-300 text-[#0052FF]"
            />
            <span>Pasar directo a asesor al responder campaña o seguimiento</span>
          </label>

          {supportsOrders && (
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={policy.allowAiOrders}
                onChange={(e) => setPolicy((p) => ({ ...p, presetId: 'custom', allowAiOrders: e.target.checked }))}
                className="rounded border-slate-300 text-[#0052FF]"
              />
              <span>Permitir que la IA cree pedidos</span>
            </label>
          )}

          {supportsAppointments && (
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={policy.allowAiAppointments}
                onChange={(e) =>
                  setPolicy((p) => ({ ...p, presetId: 'custom', allowAiAppointments: e.target.checked }))
                }
                className="rounded border-slate-300 text-[#0052FF]"
              />
              <span>Permitir que la IA agende citas</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
