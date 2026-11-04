'use client';

import React, { useState } from 'react';
import { createLead } from '@/app/actions/contacts';
import { PipelineStage } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { Plus, X, Phone, User, Tag, Loader2 } from 'lucide-react';

interface NewLeadModalProps {
  buttonLabel?: string;
  className?: string;
  defaultStage?: PipelineStage;
  onSuccess?: (contactId?: string) => void;
}

export function NewLeadModal({
  buttonLabel = 'Nuevo Lead',
  className = '',
  defaultStage = 'nuevo',
  onSuccess,
}: NewLeadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<PipelineStage>(defaultStage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await createLead({
        name,
        phone,
        pipelineStage: stage,
      });

      // Limpiar y cerrar
      setName('');
      setPhone('');
      setIsOpen(false);

      if (onSuccess && res?.contactId) {
        onSuccess(res.contactId);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Registrar Nuevo Prospecto"
        className={`inline-flex items-center gap-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer ${className}`}
      >
        <Plus className="w-3.5 h-3.5" />
        {buttonLabel ? <span>{buttonLabel}</span> : null}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-md w-full border border-slate-200 dark:border-[#232A3B] shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#1E2433] bg-slate-50 dark:bg-[#0E121B]">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Registrar Nuevo Prospecto</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre Completo *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sofía Martínez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 text-sm bg-white dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-10 pr-3.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Número de Teléfono / WhatsApp *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="+57 312 456 7890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-10 text-sm bg-white dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-10 pr-3.5 text-slate-900 dark:text-white font-mono placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Incluye el prefijo de país (ej. +57, +52, +54, +34, +1).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Etapa Inicial
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as PipelineStage)}
                    className="w-full h-10 text-sm bg-white dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl pl-10 pr-3.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 transition shadow-xs cursor-pointer"
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id} className="bg-white dark:bg-[#131722] text-slate-900 dark:text-slate-200">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#0052FF] hover:bg-[#0043D4] text-white font-semibold text-xs px-5 py-2 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{loading ? 'Guardando...' : 'Crear Lead'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
