'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Tag,
  FileText,
  Clock,
  Save,
  CheckCircle2,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { PipelineStage } from '@/lib/supabase/types';
import { updateContactDetails } from '@/app/actions/contacts';

interface LeadDetailsDrawerProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    pipeline_stage: PipelineStage;
    is_ai_active: boolean;
    last_interaction_at: string;
    custom_fields?: any;
    created_at?: string;
  };
  isOpen: boolean;
  onClose: () => void;
}

const STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'nuevo', label: 'Nuevo Lead', color: 'bg-slate-100 text-slate-700' },
  { key: 'calificado', label: 'Calificado', color: 'bg-blue-50 text-blue-700' },
  { key: 'cita_agendada', label: 'Cita Agendada', color: 'bg-emerald-50 text-emerald-700' },
  { key: 'ganado', label: 'Cierre Ganado', color: 'bg-teal-50 text-teal-800' },
  { key: 'perdido', label: 'Perdido', color: 'bg-rose-50 text-rose-700' },
];

export function LeadDetailsDrawer({
  contact,
  isOpen,
  onClose,
}: LeadDetailsDrawerProps) {
  const [name, setName] = useState(contact.name || '');
  const [stage, setStage] = useState<PipelineStage>(contact.pipeline_stage);
  const [notes, setNotes] = useState<string>(contact.custom_fields?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await updateContactDetails(contact.id, {
        name,
        pipelineStage: stage,
        notes,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving contact details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const cleanPhone = contact.phone.replace(/[^0-9]/g, '');

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full z-20 flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
        <h3 className="font-bold text-xs uppercase tracking-wider text-gray-700 flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-600" />
          Ficha del Prospecto
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {savedSuccess && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">Cambios guardados exitosamente.</span>
          </div>
        )}

        {/* Nombre del Lead */}
        <div>
          <label className="block text-gray-600 font-semibold mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre completo"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-gray-900"
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-gray-600 font-semibold mb-1">WhatsApp</label>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 font-mono">
            <span>{contact.phone}</span>
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:text-emerald-700 font-sans text-[11px] font-semibold flex items-center gap-1"
            >
              Abrir Web <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Etapa del Pipeline */}
        <div>
          <label className="block text-gray-600 font-semibold mb-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            Etapa de Venta (Pipeline)
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PipelineStage)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold text-gray-800 bg-white cursor-pointer"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Notas Internas */}
        <div>
          <label className="block text-gray-600 font-semibold mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
            Notas Internas del Asesor
          </label>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anotaciones sobre presupuesto, intereses, seguimiento o requerimientos especiales..."
            className="w-full p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-gray-900"
          />
        </div>

        {/* Metadata de interacción */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-[11px] text-gray-500">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Última Interacción:
            </span>
            <span className="font-mono text-gray-700">
              {new Date(contact.last_interaction_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span>Estado de IA:</span>
            <span
              className={`font-semibold ${
                contact.is_ai_active ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {contact.is_ai_active ? 'Autónoma (IA)' : 'Humano'}
            </span>
          </div>
        </div>
      </div>

      {/* Drawer Footer with Save Button */}
      <div className="p-3 border-t border-gray-200 bg-gray-50/50">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Guardando...' : 'Guardar Ficha'}
        </button>
      </div>
    </div>
  );
}

