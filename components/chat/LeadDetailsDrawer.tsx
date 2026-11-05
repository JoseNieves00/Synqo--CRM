'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Trash2,
  Lock,
  AlertTriangle,
  Eye,
  EyeOff,
  DollarSign,
} from 'lucide-react';
import { PipelineStage } from '@/lib/supabase/types';
import { updateContactDetails, deleteContactWithPassword } from '@/app/actions/contacts';
import { useRouter } from 'next/navigation';

interface LeadDetailsDrawerProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    pipeline_stage: PipelineStage;
    is_ai_active: boolean;
    last_interaction_at: string;
    assigned_to?: string | null;
    custom_fields?: any;
    created_at?: string;
  };
  isOpen: boolean;
  onClose: () => void;
}

const STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'nuevo', label: 'Nuevo Lead', color: 'bg-[#1A1F2C] text-slate-300' },
  { key: 'calificado', label: 'Calificado', color: 'bg-[#0052FF]/10 text-[#00D2FF]' },
  { key: 'cita_agendada', label: 'Cita Agendada', color: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'ganado', label: 'Cierre Ganado', color: 'bg-teal-500/10 text-teal-300' },
  { key: 'perdido', label: 'Perdido', color: 'bg-rose-500/10 text-rose-400' },
];

export function LeadDetailsDrawer({
  contact,
  isOpen,
  onClose,
}: LeadDetailsDrawerProps) {
  const router = useRouter();
  const [name, setName] = useState(contact.name || '');
  const [stage, setStage] = useState<PipelineStage>(contact.pipeline_stage);
  const [notes, setNotes] = useState<string>(contact.custom_fields?.notes || '');
  const [dealValue, setDealValue] = useState<string>(
    contact.custom_fields?.deal_value ? String(contact.custom_fields.deal_value) : ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Estados para eliminación segura con contraseña
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showDeleteModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showDeleteModal]);

  useEffect(() => {
    setName(contact.name || '');
    setStage(contact.pipeline_stage);
    setNotes(contact.custom_fields?.notes || '');
    setDealValue(contact.custom_fields?.deal_value ? String(contact.custom_fields.deal_value) : '');
    setSavedSuccess(false);
  }, [contact.id, contact.name, contact.pipeline_stage, contact.custom_fields?.notes, contact.custom_fields?.deal_value]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[^0-9.]/g, '')) : null;
      await updateContactDetails(contact.id, {
        name,
        pipelineStage: stage,
        notes,
        dealValue: isNaN(parsedValue as number) ? null : parsedValue,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving contact details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword.trim() || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteContactWithPassword(contact.id, deletePassword);
      setShowDeleteModal(false);
      onClose();
      router.push('/inbox');
      router.refresh();
    } catch (err: any) {
      setDeleteError(err?.message || 'Error al eliminar el prospecto');
    } finally {
      setIsDeleting(false);
    }
  };

  const cleanPhone = contact.phone.replace(/[^0-9]/g, '');

  return (
    <div className="w-80 border-l border-[#1E2433] bg-[#131722] flex flex-col h-full z-20 flex-shrink-0 animate-in slide-in-from-right duration-200 text-slate-100">
      {/* Drawer Header */}
      <div className="p-3.5 border-b border-[#1E2433] flex items-center justify-between bg-[#0E121B]">
        <h3 className="font-semibold text-xs text-white flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-[#00D2FF]" />
          <span>Ficha del Prospecto</span>
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A1F2C] transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {savedSuccess && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">Cambios guardados.</span>
          </div>
        )}

        {/* Nombre del Lead */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre completo"
            className="w-full px-3 py-1.5 rounded-lg border border-[#232A3B] bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-medium"
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-slate-400 font-medium mb-1">Contacto Directo</label>
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#090A0F] border border-[#232A3B] font-mono text-slate-200">
            <span>{contact.phone}</span>
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00D2FF] hover:underline font-sans text-[11px] font-medium flex items-center gap-1"
            >
              Abrir Web <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Etapa del Pipeline */}
        <div>
          <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            Etapa Comercial
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PipelineStage)}
            className="w-full px-3 py-1.5 rounded-lg border border-[#232A3B] bg-[#090A0F] text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-medium cursor-pointer"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key} className="bg-[#131722] text-slate-200">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Valor Estimado del Trato / Venta */}
        <div>
          <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            Valor del Trato / Venta ($)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">$</span>
            <input
              type="text"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="0 (ej: 150000)"
              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-[#232A3B] bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF] font-mono text-xs"
            />
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
            Se totaliza automáticamente en la columna correspondiente del tablero Kanban.
          </span>
        </div>

        {/* Notas Internas */}
        <div>
          <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Notas Internas
          </label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anotaciones sobre presupuesto, intereses o seguimiento..."
            className="w-full p-2.5 rounded-lg border border-[#232A3B] bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
          />
        </div>

        {/* Metadata de interacción */}
        <div className="p-2.5 rounded-lg bg-[#090A0F] border border-[#232A3B] space-y-1.5 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" /> Última Interacción:
            </span>
            <span suppressHydrationWarning className="font-mono text-slate-300">
              {new Date(contact.last_interaction_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span>Estado de IA:</span>
            <span
              className={`font-semibold font-mono ${
                contact.is_ai_active ? 'text-[#00D2FF]' : 'text-amber-400'
              }`}
            >
              {contact.is_ai_active ? 'Autónoma (IA)' : 'Control Humano'}
            </span>
          </div>
        </div>
      </div>

      {/* Drawer Footer with Save & Delete Buttons */}
      <div className="p-3 border-t border-[#1E2433] bg-[#0E121B] space-y-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-2 bg-[#0052FF] hover:bg-[#0043D4] disabled:opacity-50 text-white rounded-lg font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-xs"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Guardando...' : 'Guardar Ficha'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeletePassword('');
            setShowDeleteModal(true);
          }}
          className="w-full py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg font-medium transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar Prospecto</span>
        </button>
      </div>

      {/* Modal de Confirmación con Contraseña */}
      {showDeleteModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
              ¿Eliminar este prospecto?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              Esta acción es permanente e irreversible. Se eliminará a{' '}
              <strong className="text-slate-900 dark:text-slate-200">{contact.name || contact.phone}</strong>{' '}
              junto con su historial de mensajes.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs mb-3 font-medium">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteContact} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Confirma tu contraseña para continuar:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Tu contraseña de Synqo"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePassword.trim()}
                  className="min-w-[120px] flex-1 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Eliminando...' : 'Eliminar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

