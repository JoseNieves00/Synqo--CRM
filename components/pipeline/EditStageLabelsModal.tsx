'use client';

import React, { useState } from 'react';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { PipelineStage } from '@/lib/supabase/types';
import { updateCustomStageLabels } from '@/app/actions/pipeline';
import { X, Settings2, Check, RotateCcw, Loader2, Sparkles, Car, ShoppingBag, Briefcase } from 'lucide-react';

interface EditStageLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLabels: Record<string, string>;
  onLabelsUpdated: (newLabels: Record<string, string>) => void;
}

export function EditStageLabelsModal({
  isOpen,
  onClose,
  currentLabels,
  onLabelsUpdated,
}: EditStageLabelsModalProps) {
  const [labels, setLabels] = useState<Record<string, string>>(() => ({
    ...currentLabels,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await updateCustomStageLabels(labels as any);
      if (res.success) {
        onLabelsUpdated(res.stageLabels);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar alias de etapas');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const emptyLabels: Record<string, string> = {
      nuevo: '',
      calificado: '',
      cita_agendada: '',
      ganado: '',
      perdido: '',
    };
    setLabels(emptyLabels);
  };

  // Plantillas sugeridas de 1 clic según nicho
  const applyPreset = (preset: 'auto' | 'retail' | 'b2b') => {
    if (preset === 'auto') {
      setLabels({
        nuevo: 'Vehículo Ingresado',
        calificado: 'Presupuesto Enviado',
        cita_agendada: 'Turno en Taller',
        ganado: 'Servicio Entregado',
        perdido: 'Cancelado',
      });
    } else if (preset === 'retail') {
      setLabels({
        nuevo: 'Interesado / Consulta',
        calificado: 'Cotización / Catálogo',
        cita_agendada: 'Cita en Tienda / Showroom',
        ganado: 'Pedido Pagado',
        perdido: 'No Compró',
      });
    } else if (preset === 'b2b') {
      setLabels({
        nuevo: 'Lead Prospección',
        calificado: 'Diagnóstico Comercial',
        cita_agendada: 'Reunión / Propuesta',
        ganado: 'Contrato Cerrado',
        perdido: 'Declinado',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131722] rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-[#232A3B] space-y-4 animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2433] pb-3">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#090A0F] text-[#0052FF] dark:text-[#00D2FF] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Personalizar Etapas del Embudo</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Adapta el nombre de las columnas al lenguaje de tu negocio.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plantillas de 1 Clic */}
        <div className="bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
            <span>Plantillas sugeridas por industria:</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => applyPreset('auto')}
              className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Car className="w-3.5 h-3.5 text-slate-400" />
              <span>Taller & Lavadero</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('retail')}
              className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
              <span>Comercio & Retail</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('b2b')}
              className="px-2.5 py-1 bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3B] rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span>Servicios B2B</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          {PIPELINE_STAGES.map((stage) => {
            const currentVal = labels[stage.id] ?? '';
            return (
              <div key={stage.id} className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
                    Nombre por defecto: <code className="text-slate-500 dark:text-slate-400 font-mono text-[11px] font-normal">{stage.label}</code>
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={currentVal}
                  onChange={(e) =>
                    setLabels((prev) => ({
                      ...prev,
                      [stage.id]: e.target.value,
                    }))
                  }
                  placeholder={`Ej: ${stage.label}`}
                  className="w-full text-xs px-3 py-1.5 border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#090A0F] text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#1E2433]">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
