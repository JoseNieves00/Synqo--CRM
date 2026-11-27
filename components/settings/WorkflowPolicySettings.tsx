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

interface WorkflowPolicySettingsProps {
  initialPolicy?: Partial<WorkflowPolicy> | null;
}

const REQUIRED_FIELD_OPTIONS: Array<{ id: RequiredLeadField; label: string }> = [
  { id: 'product_or_service', label: 'Producto o Servicio de interés' },
  { id: 'city', label: 'Ciudad de entrega' },
  { id: 'modality', label: 'Modalidad (presencial / virtual)' },
  { id: 'date_preference', label: 'Fecha u horario preferido' },
];

export function WorkflowPolicySettings({ initialPolicy }: WorkflowPolicySettingsProps) {
  const [policy, setPolicy] = useState<WorkflowPolicy>(() => normalizeWorkflowPolicy(initialPolicy));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const applyPreset = (presetKey: keyof typeof WORKFLOW_PRESETS) => {
    setPolicy({ ...WORKFLOW_PRESETS[presetKey].policy });
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

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveWorkflowPolicy(policy);
      setFeedback({ type: 'success', text: 'Flujo de trabajo guardado. La IA aplicará estas reglas de inmediato.' });
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

        {/* Presets de 1 clic */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Plantillas rápidas (1 clic):
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(WORKFLOW_PRESETS) as Array<keyof typeof WORKFLOW_PRESETS>).map((key) => {
              const preset = WORKFLOW_PRESETS[key];
              const isActive = policy.presetId === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                    isActive
                      ? 'border-[#0052FF] bg-blue-50/60 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-[#232A3B] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{preset.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{preset.description}</p>
                </button>
              );
            })}
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
        </div>

        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-4 space-y-2.5">
          <p className="font-bold text-slate-900 dark:text-white">
            3. Datos obligatorios antes de cotizar o relevar
          </p>
          <div className="space-y-2">
            {REQUIRED_FIELD_OPTIONS.map((opt) => (
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

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={policy.allowAiOrders}
              onChange={(e) => setPolicy((p) => ({ ...p, presetId: 'custom', allowAiOrders: e.target.checked }))}
              className="rounded border-slate-300 text-[#0052FF]"
            />
            <span>Permitir que la IA cree pedidos</span>
          </label>

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
        </div>
      </div>
    </div>
  );
}
