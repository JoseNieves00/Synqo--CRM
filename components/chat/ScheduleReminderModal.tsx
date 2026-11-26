'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Package,
  RotateCcw,
  Calendar,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  createContactReminder,
  getReminderDraftContextAction,
  generateReminderDraftAction,
  type ReminderType,
  type ReminderDispatchMode,
  type ActiveReminderData,
} from '@/app/actions/reminders';

interface ScheduleReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  existingReminder?: ActiveReminderData | null;
  onReminderSaved: (reminder: ActiveReminderData) => void;
}

export function ScheduleReminderModal({
  isOpen,
  onClose,
  contactId,
  contactName,
  existingReminder,
  onReminderSaved,
}: ScheduleReminderModalProps) {
  const [reminderType, setReminderType] = useState<ReminderType>(
    existingReminder?.reminderType || 'reactivation'
  );
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [note, setNote] = useState<string>(existingReminder?.note || '');
  const [dispatchMode, setDispatchMode] = useState<ReminderDispatchMode>(
    existingReminder?.dispatchMode || 'ai_contextual'
  );
  const [suggestedMessage, setSuggestedMessage] = useState<string>(
    existingReminder?.suggestedMessage || ''
  );
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [metaWarningCtx, setMetaWarningCtx] = useState<{
    isMetaChannel: boolean;
    metaWindowExpiresAt: string | null;
  }>({ isMetaChannel: false, metaWindowExpiresAt: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Inicializar fecha por defecto: Mañana a las 9:00 AM si no hay fecha existente
  useEffect(() => {
    if (existingReminder?.scheduledFor) {
      const d = new Date(existingReminder.scheduledFor);
      setScheduledFor(formatToDateTimeLocal(d));
      setReminderType(existingReminder.reminderType);
      setNote(existingReminder.note || '');
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setScheduledFor(formatToDateTimeLocal(tomorrow));
    }
    if (isOpen && contactId) {
      getReminderDraftContextAction(contactId)
        .then((ctx) => {
          setMetaWarningCtx({
            isMetaChannel: ctx.isMetaChannel,
            metaWindowExpiresAt: ctx.metaWindowExpiresAt,
          });
          if (!existingReminder?.note && ctx.suggestedNote) {
            setNote((prev) => prev || ctx.suggestedNote);
          }
        })
        .catch(() => {});
    }
  }, [existingReminder, isOpen, contactId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  function formatToDateTimeLocal(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Atajos rápidos de 1-Clic
  const handlePreset = (preset: '2h' | 'tomorrow_9am' | '2d' | '1w') => {
    const now = new Date();
    if (preset === '2h') {
      now.setHours(now.getHours() + 2);
    } else if (preset === 'tomorrow_9am') {
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
    } else if (preset === '2d') {
      now.setDate(now.getDate() + 2);
      now.setHours(9, 0, 0, 0);
    } else if (preset === '1w') {
      now.setDate(now.getDate() + 7);
      now.setHours(9, 0, 0, 0);
    }
    setScheduledFor(formatToDateTimeLocal(now));
  };

  const isOutsideMeta24h = Boolean(
    metaWarningCtx.isMetaChannel &&
      scheduledFor &&
      (!metaWarningCtx.metaWindowExpiresAt ||
        new Date(scheduledFor).getTime() > new Date(metaWarningCtx.metaWindowExpiresAt).getTime())
  );

  const handleGenerateDraft = async () => {
    setGeneratingDraft(true);
    setError(null);
    try {
      const res = await generateReminderDraftAction({ contactId, note });
      setSuggestedMessage(res.draft);
      setDispatchMode('manual_exact');
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar el borrador con IA.');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!scheduledFor) {
      setError('Por favor selecciona una fecha y hora para el recordatorio.');
      return;
    }
    if (dispatchMode === 'manual_exact' && !suggestedMessage.trim()) {
      setError('Escribe o genera el mensaje exacto que se enviará.');
      return;
    }

    const targetDate = new Date(scheduledFor);
    if (isNaN(targetDate.getTime())) {
      setError('Fecha inválida.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await createContactReminder({
        contactId,
        reminderType,
        scheduledFor: targetDate.toISOString(),
        note: note.trim() || undefined,
        dispatchMode,
        suggestedMessage: dispatchMode === 'manual_exact' ? suggestedMessage.trim() : undefined,
      });

      if (res.reminder) {
        onReminderSaved(res.reminder);
      }
      onClose();
    } catch (err: any) {
      console.error('[REMINDER SAVE ERROR]', err);
      setError(err?.message || 'Error al programar el recordatorio.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
        {/* Cabecera */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Programar Recordatorio</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                Para: <strong>{contactName || 'Lead WhatsApp'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido con scroll interno */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 [scrollbar-width:thin]">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Selector de Tipo de Recordatorio */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tipo de Recordatorio Comercial:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReminderType('shipping')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  reminderType === 'shipping'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold shadow-xs'
                    : 'border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Package className="w-4 h-4" />
                <span className="text-xs">📦 Envío</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  Despacho / Guía
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReminderType('reactivation')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  reminderType === 'reactivation'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold shadow-xs'
                    : 'border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-xs">🔄 Reactivar</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  Seguimiento Lead
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReminderType('custom')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  reminderType === 'custom'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold shadow-xs'
                    : 'border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span className="text-xs">⏰ General</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  Personalizado
                </span>
              </button>
            </div>
          </div>

          {/* 2. Atajos Rápidos de Fecha (1-Clic) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Programar para:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => handlePreset('2h')}
                className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] rounded-lg transition text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                En 2 horas
              </button>
              <button
                type="button"
                onClick={() => handlePreset('tomorrow_9am')}
                className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] rounded-lg transition text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Mañana 9 AM
              </button>
              <button
                type="button"
                onClick={() => handlePreset('2d')}
                className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] rounded-lg transition text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                En 2 días
              </button>
              <button
                type="button"
                onClick={() => handlePreset('1w')}
                className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] rounded-lg transition text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                En 1 semana
              </button>
            </div>

            {/* Selector Datetime Local */}
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            />

            {isOutsideMeta24h && (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Esta hora supera la ventana de 24h de Meta. Si no tienes plantilla aprobada en Seguimientos, prográmalo dentro de las próximas 24h.
                </span>
              </div>
            )}
          </div>

          {/* 3. Modo de envío: IA Contextual vs Mensaje Exacto */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Cómo enviar el seguimiento:
              </label>
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={generatingDraft}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer disabled:opacity-50"
              >
                {generatingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>{generatingDraft ? 'Redactando...' : 'Generar borrador IA editable'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDispatchMode('ai_contextual')}
                className={`p-2 rounded-xl border text-left text-[11px] transition cursor-pointer ${
                  dispatchMode === 'ai_contextual'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-600 dark:text-slate-300'
                }`}
              >
                <div>IA Contextual</div>
                <div className="text-[10px] font-normal opacity-80">Redacta según chat y prompt</div>
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode('manual_exact')}
                className={`p-2 rounded-xl border text-left text-[11px] transition cursor-pointer ${
                  dispatchMode === 'manual_exact'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-slate-600 dark:text-slate-300'
                }`}
              >
                <div>Mensaje Exacto</div>
                <div className="text-[10px] font-normal opacity-80">Se envía tal cual lo escribas</div>
              </button>
            </div>

            {dispatchMode === 'manual_exact' && (
              <textarea
                rows={3}
                value={suggestedMessage}
                onChange={(e) => setSuggestedMessage(e.target.value)}
                placeholder="Escribe el mensaje exacto o pulsa 'Generar borrador IA editable' arriba..."
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
              />
            )}
          </div>

          {/* 4. Nota o detalle del recordatorio */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Objetivo / nota breve {dispatchMode === 'ai_contextual' ? '(guía para la IA)' : '(opcional)'}:
            </label>
            <input
              type="text"
              placeholder={
                reminderType === 'shipping'
                  ? 'Ej: Enviar número de guía de Coordinadora / Interrapidísimo'
                  : reminderType === 'reactivation'
                  ? 'Ej: Confirmar si revisó la cotización'
                  : 'Ej: Confirmar método de pago pactado'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              {dispatchMode === 'ai_contextual'
                ? 'La IA usará esta guía junto con las reglas de tu prompt y los últimos mensajes (y se cancela si el cliente responde antes).'
                : 'Se enviará tu texto exacto a la hora programada (y se cancela si el cliente responde antes).'}
            </p>
          </div>
        </div>

        {/* Botones de acción fijos */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0E131F]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !scheduledFor}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0052FF] hover:bg-[#0047E0] text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Programando...</span>
              </>
            ) : (
              <span>Programar Recordatorio</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
