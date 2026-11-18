'use client';

import React, { useState, useEffect } from 'react';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { PipelineStage } from '@/lib/supabase/types';
import { updateCustomStageLabels } from '@/app/actions/pipeline';
import {
  X,
  Settings2,
  Check,
  RotateCcw,
  Loader2,
  Sparkles,
  ShoppingBag,
  Briefcase,
  Stethoscope,
  Bot,
} from 'lucide-react';

interface EditStageLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLabels: Record<string, string>;
  currentCriteria?: Record<string, string>;
  onLabelsUpdated: (newLabels: Record<string, string>, newCriteria?: Record<string, string>) => void;
}

export function EditStageLabelsModal({
  isOpen,
  onClose,
  currentLabels,
  currentCriteria = {},
  onLabelsUpdated,
}: EditStageLabelsModalProps) {
  const [labels, setLabels] = useState<Record<string, string>>(() => ({
    ...currentLabels,
  }));
  const [criteria, setCriteria] = useState<Record<string, string>>(() => ({
    ...currentCriteria,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setLabels({ ...currentLabels });
      setCriteria({ ...currentCriteria });
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, currentLabels, currentCriteria]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await updateCustomStageLabels(labels as any, criteria as any);
      if (res.success) {
        onLabelsUpdated(res.stageLabels, res.stageCriteria);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar configuración de etapas');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const emptyMap: Record<string, string> = {
      nuevo: '',
      calificado: '',
      cita_agendada: '',
      ganado: '',
      perdido: '',
    };
    setLabels(emptyMap);
    setCriteria(emptyMap);
  };

  // Plantillas comerciales de 1 clic según nicho
  const applyPreset = (preset: 'b2b' | 'commerce' | 'health') => {
    if (preset === 'b2b') {
      setLabels({
        nuevo: 'Lead Prospección',
        calificado: 'Diagnóstico / Cotización',
        cita_agendada: 'Demo / Reunión Agendada',
        ganado: 'Contrato Cerrado',
        perdido: 'Declinado',
      });
      setCriteria({
        nuevo: 'Primer contacto o consulta general',
        calificado: 'El cliente compartió sus requerimientos o pidió cotización formal',
        cita_agendada: 'Coordinó fecha/hora de videollamada o demo comercial',
        ganado: 'Aprobó la propuesta o confirmó el pago',
        perdido: 'Rechazó la propuesta o no cuenta con presupuesto',
      });
    } else if (preset === 'commerce') {
      setLabels({
        nuevo: 'Consulta Inicial',
        calificado: 'Catálogo / Cotizado',
        cita_agendada: 'Visita Showroom / Cita',
        ganado: 'Pedido Confirmado',
        perdido: 'No Compró',
      });
      setCriteria({
        nuevo: 'Saludo inicial o pregunta básica',
        calificado: 'Pidió precios, catálogo o cotización de productos específicos',
        cita_agendada: 'Agendó visita presencial o llamada de asesoría',
        ganado: 'Confirmó el pedido, compra o pago',
        perdido: 'Desistió, no hay cobertura o falta de stock',
      });
    } else if (preset === 'health') {
      setLabels({
        nuevo: 'Contacto Inicial',
        calificado: 'Interés en Tratamiento',
        cita_agendada: 'Valoración Agendada',
        ganado: 'Tratamiento Aceptado',
        perdido: 'Cancelado',
      });
      setCriteria({
        nuevo: 'Primera consulta médica/odontológica',
        calificado: 'Preguntó por procedimiento específico o tarifas de servicio',
        cita_agendada: 'Confirmó cita de valoración con el doctor o especialista',
        ganado: 'Aprobó el presupuesto y aceptó iniciar el tratamiento',
        perdido: 'No asistió o canceló el servicio',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100 transition-colors">
        
        {/* Cabecera */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E121B]">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#090A0F] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Personalizar Etapas & Criterios IA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Define el nombre de tus etapas y la condición para que la IA mueva los prospectos automáticamente.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:thin]">
            
            {/* Plantillas Sugeridas */}
            <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
                <span>Plantillas comerciales sugeridas (1 clic):</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => applyPreset('b2b')}
                  className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#0052FF]" />
                  <span>Servicios B2B & Consultoría</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('commerce')}
                  className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Comercio & Mayoristas</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('health')}
                  className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-purple-600" />
                  <span>Salud & Clínicas</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs p-3 rounded-xl font-medium">
                {error}
              </div>
            )}

            {/* Lista de Etapas */}
            <div className="space-y-4">
              {PIPELINE_STAGES.map((stage) => {
                const currentName = labels[stage.id] ?? '';
                const currentCrit = criteria[stage.id] ?? '';

                return (
                  <div
                    key={stage.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/40 dark:bg-[#0E121B]/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0052FF]" />
                        Columna Base: <code className="text-slate-500 font-mono text-[11px] font-normal">{stage.label}</code>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Nombre visible en el Kanban */}
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Nombre en Tablero
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={currentName}
                          onChange={(e) =>
                            setLabels((prev) => ({
                              ...prev,
                              [stage.id]: e.target.value,
                            }))
                          }
                          placeholder={`Ej: ${stage.label}`}
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-medium"
                        />
                      </div>

                      {/* Criterio semántico de avance para la IA */}
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Bot className="w-3 h-3 text-[#0052FF]" />
                          Criterio de Avance IA
                        </label>
                        <input
                          type="text"
                          maxLength={150}
                          value={currentCrit}
                          onChange={(e) =>
                            setCriteria((prev) => ({
                              ...prev,
                              [stage.id]: e.target.value,
                            }))
                          }
                          placeholder="¿Qué detona que la IA mueva el lead aquí?"
                          className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E121B]">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
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
