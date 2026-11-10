'use client';

import React, { useState } from 'react';
import { Bell, Lock, ShieldCheck, CheckCircle2, AlertCircle, Plus, X, Loader2, Sparkles } from 'lucide-react';
import { saveTokenAndManagerSettings } from '@/app/actions/settings';
import { DEFAULT_TOKEN_ALERT_THRESHOLDS } from '@/lib/monitoring/token-policy';

interface TokenAlertsAndPinCardProps {
  initialThresholds?: number[];
  initialOveragePricePer500kCop?: number | null;
  initialHasPin?: boolean;
  alertsSentInCycle?: Record<string, string>;
}

const PRESET_THRESHOLDS = [50, 70, 80, 90, 95, 100];

export function TokenAlertsAndPinCard({
  initialThresholds = [...DEFAULT_TOKEN_ALERT_THRESHOLDS],
  initialHasPin = false,
  alertsSentInCycle = {},
}: TokenAlertsAndPinCardProps) {
  const [thresholds, setThresholds] = useState<number[]>(
    initialThresholds.length > 0 ? initialThresholds : [...DEFAULT_TOKEN_ALERT_THRESHOLDS]
  );
  const [customInput, setCustomInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const toggleThreshold = (val: number) => {
    setThresholds((prev) => {
      if (prev.includes(val)) {
        const next = prev.filter((x) => x !== val);
        return next.length > 0 ? next : [val];
      }
      if (prev.length >= 5) return prev;
      return [...prev, val].sort((a, b) => a - b);
    });
  };

  const handleAddCustom = () => {
    const n = Math.round(Number(customInput.replace(/[^0-9]/g, '')));
    if (!Number.isFinite(n) || n < 10 || n > 100) {
      setFeedback({ type: 'error', text: 'Ingresa un porcentaje válido entre 10 y 100.' });
      return;
    }
    if (!thresholds.includes(n) && thresholds.length >= 5) {
      setFeedback({ type: 'error', text: 'Máximo 5 umbrales de notificación por empresa.' });
      return;
    }
    if (!thresholds.includes(n)) {
      setThresholds((prev) => [...prev, n].sort((a, b) => a - b));
    }
    setCustomInput('');
    setFeedback(null);
  };

  const handleSave = async () => {
    if (newPin.trim() && !/^\d{4}$/.test(newPin.trim())) {
      setFeedback({ type: 'error', text: 'El PIN gerencial debe tener exactamente 4 dígitos numéricos.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await saveTokenAndManagerSettings({
        alertThresholds: thresholds,
        newPin: newPin.trim() || undefined,
      });

      setThresholds(res.alertThresholds);
      setHasPin(res.hasManagerPin);
      setNewPin('');
      setFeedback({
        type: 'success',
        text: 'Alertas de tokens y seguridad gerencial guardadas correctamente.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo guardar la configuración de tokens.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Alertas de Tokens y Consulta Gerencial (#tokens)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Avisos automáticos por WhatsApp y correo cuando alcances cada x% del plan. Al 100%, el bot sigue operando en Modo Excedente.
            </p>
          </div>
        </div>

        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 self-start sm:self-auto ${
            hasPin
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
          }`}
        >
          {hasPin ? '🔐 PIN Gerencial Activo' : '⚠️ Configura tu PIN'}
        </span>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
              : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bloque Izquierdo: Umbrales Push (x%) */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Avisar automáticamente al alcanzar (%):
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Máx 5 avisos/mes</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_THRESHOLDS.map((t) => {
              const active = thresholds.includes(t);
              const sentAt = alertsSentInCycle[String(t)];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleThreshold(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1 ${
                    active
                      ? 'bg-[#0052FF] text-white border-[#0052FF]'
                      : 'bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]'
                  }`}
                  title={sentAt ? `Notificado en este ciclo (${new Date(sentAt).toLocaleDateString('es-CO')})` : `Avisar al ${t}%`}
                >
                  <span>{t}%</span>
                  {sentAt && <span className="text-[9px] opacity-80">✓</span>}
                </button>
              );
            })}

            {thresholds
              .filter((t) => !PRESET_THRESHOLDS.includes(t))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleThreshold(t)}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-[#0052FF] text-white border-[#0052FF] flex items-center gap-1 cursor-pointer"
                  title="Quitar umbral personalizado"
                >
                  <span>{t}%</span>
                  <X className="w-3 h-3" />
                </button>
              ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Ej. 65%"
              className="w-28 px-3 py-1.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF] transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#0052FF]" />
              <span>Agregar %</span>
            </button>
          </div>

          <p className="pt-2 border-t border-slate-200 dark:border-[#1E2433] text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Al alcanzar el 100% de tu plan mensual, el bot continúa operando sin interrupciones en <strong>Modo Excedente</strong>.
          </p>
        </div>

        {/* Bloque Derecho: PIN Gerencial WhatsApp (Modo Bancolombia) */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] space-y-3 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                PIN de Seguridad WhatsApp (4 dígitos)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Cuando escribas <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-[#1A1F2C] font-mono text-[10px]">#tokens</code> o <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-[#1A1F2C] font-mono text-[10px]">#admin</code> desde tu WhatsApp de administrador registrado en Equipo, el bot te pedirá este PIN (sesión de 15 min, bloqueo automático tras 3 intentos fallidos, <strong>0 consumo de tokens</strong>).
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {hasPin ? 'Cambiar PIN gerencial (dejar vacío para conservar):' : 'Crear PIN de 4 dígitos:'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-32 px-3 py-1.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-sm font-mono tracking-[0.35em] text-center"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-[#1E2433]">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              PIN cifrado y protegido
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0052FF] hover:bg-[#0043D4] text-white transition cursor-pointer disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Guardar Alertas y PIN</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
