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
}

export function NewLeadModal({
  buttonLabel = 'Nuevo Lead',
  className = '',
  defaultStage = 'nuevo',
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
      await createLead({
        name,
        phone,
        pipelineStage: stage,
      });

      // Limpiar y cerrar
      setName('');
      setPhone('');
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-sm cursor-pointer ${className}`}
      >
        <Plus className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900 text-sm">Registrar Nuevo Prospecto</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition cursor-pointer p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nombre Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sofía Martínez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Número de WhatsApp (con código de país)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="+52 55 1234 5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Incluye el símbolo + y el código de país (ej. +52, +54, +57, +34).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Etapa Inicial en el Pipeline
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as PipelineStage)}
                    className="w-full text-xs border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                  {loading ? 'Guardando...' : 'Crear Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

