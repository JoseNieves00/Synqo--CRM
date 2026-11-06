'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  FileText,
  Search,
  X,
  Check,
} from 'lucide-react';
import { QuickSnippet, saveOrganizationQuickReplies } from '@/app/actions/chat';

interface QuickRepliesSettingsProps {
  initialSnippets: QuickSnippet[];
  initialAiSuggestions?: QuickSnippet[];
}

export function QuickRepliesSettings({
  initialSnippets = [],
  initialAiSuggestions = [],
}: QuickRepliesSettingsProps) {
  const [snippets, setSnippets] = useState<QuickSnippet[]>(initialSnippets);
  const [aiSuggestions] = useState<QuickSnippet[]>(initialAiSuggestions);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<QuickSnippet | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form states
  const [formShortcut, setFormShortcut] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formText, setFormText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isModalOpen]);

  const openCreateModal = () => {
    setEditingSnippet(null);
    setEditingIndex(null);
    setFormShortcut('');
    setFormLabel('');
    setFormText('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (snippet: QuickSnippet, idx: number) => {
    setEditingSnippet(snippet);
    setEditingIndex(idx);
    setFormShortcut(snippet.shortcut);
    setFormLabel(snippet.label);
    setFormText(snippet.text);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCustomizeAiSuggestion = (sug: QuickSnippet) => {
    setEditingSnippet(null);
    setEditingIndex(null);
    setFormShortcut(sug.shortcut);
    setFormLabel(sug.label);
    setFormText(sug.text);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleAddAiSuggestion = async (sug: QuickSnippet) => {
    const cleanCode = sug.shortcut.toLowerCase();
    if (snippets.some((s) => s.shortcut.toLowerCase() === cleanCode)) {
      setFeedback({ type: 'error', message: `El atajo "${sug.shortcut}" ya está en tu lista.` });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const updated = [
      ...snippets,
      {
        id: `custom-${Date.now()}`,
        shortcut: sug.shortcut,
        label: sug.label,
        text: sug.text,
      },
    ];

    setSnippets(updated);
    setIsSaving(true);
    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        setSnippets(res.snippets);
        setFeedback({ type: 'success', message: `Atajo "${sug.shortcut}" añadido con éxito.` });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error al guardar el atajo.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formShortcut.trim() || !formText.trim()) {
      setModalError('El comando y el mensaje son obligatorios.');
      return;
    }

    let cleanCode = formShortcut.trim();
    if (!cleanCode.startsWith('/')) cleanCode = '/' + cleanCode;
    cleanCode = '/' + cleanCode.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Validar duplicados si es nuevo o si cambió el comando
    const duplicate = snippets.some(
      (s, i) => (editingIndex === null || i !== editingIndex) && s.shortcut.toLowerCase() === cleanCode.toLowerCase()
    );
    if (duplicate) {
      setModalError(`Ya existe un atajo con el comando "${cleanCode}". Elige otro.`);
      return;
    }

    let updated: QuickSnippet[];
    if (editingIndex !== null) {
      // Editando atajo existente
      updated = [...snippets];
      updated[editingIndex] = {
        ...updated[editingIndex],
        shortcut: cleanCode,
        label: formLabel.trim() || cleanCode,
        text: formText.trim(),
      };
    } else {
      // Creando nuevo atajo
      const newSnippet: QuickSnippet = {
        id: `custom-${Date.now()}`,
        shortcut: cleanCode,
        label: formLabel.trim() || cleanCode,
        text: formText.trim(),
      };
      updated = [...snippets, newSnippet];
    }

    setIsSaving(true);
    setModalError(null);

    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        setSnippets(res.snippets);
        setIsModalOpen(false);
        setFeedback({
          type: 'success',
          message: editingIndex !== null
            ? `Atajo "${cleanCode}" actualizado con éxito.`
            : `Atajo "${cleanCode}" creado con éxito.`,
        });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setModalError(err?.message || 'Error al persistir el atajo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (idx: number) => {
    const target = snippets[idx];
    if (!target) return;
    if (!confirm(`¿Eliminar el atajo "${target.shortcut}"?`)) return;

    const updated = snippets.filter((_, i) => i !== idx);
    setSnippets(updated);
    setIsSaving(true);

    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        setSnippets(res.snippets);
        setFeedback({ type: 'success', message: `Atajo "${target.shortcut}" eliminado.` });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error al eliminar el atajo.' });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSnippets = snippets.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.shortcut.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.text.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header & Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#131722] border border-[#232A3B] p-4 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#090A0F] border border-[#232A3B] flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Atajos & Respuestas Rápidas (/)</h3>
            <span className="text-[10px] font-mono text-[#00D2FF] bg-[#00D2FF]/10 border border-[#00D2FF]/20 px-2 py-0.5 rounded-full font-semibold">
              {snippets.length} activos
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Comandos rápidos que tus asesores usan en el chat escribiendo <code className="text-[#00D2FF] font-mono">/</code> para responder preguntas frecuentes en 1 segundo.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-3.5 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Atajo</span>
        </button>
      </div>

      {/* Sugerencias de la IA si existen */}
      {aiSuggestions.length > 0 && (
        <div className="bg-[#090A0F] border border-[#232A3B] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#00D2FF]">
              <Sparkles className="w-4 h-4" />
              <span>Sugerencias Inteligentes de la IA (Listas para adoptar)</span>
            </div>
            <span className="text-[10px] font-mono text-[#00D2FF] bg-[#00D2FF]/10 border border-[#00D2FF]/20 px-2 py-0.5 rounded-full font-semibold">
              Basadas en tu negocio
            </span>
          </div>
          <p className="text-xs text-slate-400">
            La IA detectó estos textos clave en tus políticas y catálogo. Puedes agregarlos directamente o editarlos antes de guardar:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {aiSuggestions.map((sug) => {
              const isAlreadyAdded = snippets.some(
                (s) => s.shortcut.toLowerCase() === sug.shortcut.toLowerCase()
              );
              return (
                <div
                  key={sug.shortcut}
                  className="p-3 bg-[#131722] rounded-xl border border-[#232A3B] flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-white truncate">{sug.label}</span>
                      <code className="text-[10px] font-mono text-[#00D2FF] bg-[#090A0F] px-1.5 py-0.5 rounded border border-[#232A3B]">
                        {sug.shortcut}
                      </code>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed whitespace-pre-line">
                      {sug.text}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1E2433]">
                    <button
                      type="button"
                      onClick={() => handleCustomizeAiSuggestion(sug)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-[#00D2FF] rounded-lg hover:bg-[#1A1F2C] transition flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Personalizar</span>
                    </button>
                    {isAlreadyAdded ? (
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Añadido
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddAiSuggestion(sug)}
                        disabled={isSaving}
                        className="px-3 py-1 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buscador de atajos */}
      <div className="flex items-center gap-2 bg-[#131722] border border-[#232A3B] px-3 py-2 rounded-xl">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar atajo por comando (ej. /cuenta), nombre o contenido..."
          className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lista de Atajos Activos */}
      <div className="space-y-2">
        {filteredSnippets.length === 0 ? (
          <div className="p-8 text-center bg-[#131722] border border-dashed border-[#232A3B] rounded-2xl text-slate-500 text-xs space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-600" />
            <p>
              {searchQuery
                ? `No se encontraron atajos con el término "${searchQuery}".`
                : 'No tienes atajos configurados aún. Crea el primero con el botón superior.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSnippets.map((item, idx) => (
              <div
                key={item.id || item.shortcut}
                className="bg-[#131722] border border-[#232A3B] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-[#2D374D] transition group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="text-xs font-mono font-bold text-[#00D2FF] bg-[#090A0F] px-2 py-0.5 rounded-lg border border-[#232A3B] shrink-0">
                        {item.shortcut}
                      </code>
                      <h4 className="text-xs font-semibold text-white truncate">{item.label}</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-[#090A0F]/60 p-2.5 rounded-xl border border-[#1E2433]">
                    {item.text}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[#1E2433]">
                  <button
                    type="button"
                    onClick={() => openEditModal(item, idx)}
                    className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-[#090A0F] hover:bg-[#1A1F2C] border border-[#232A3B] rounded-lg transition flex items-center gap-1 cursor-pointer font-medium"
                    title="Editar comando, etiqueta o mensaje del atajo"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#00D2FF]" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 bg-[#090A0F] hover:bg-rose-500/10 border border-[#232A3B] hover:border-rose-500/30 rounded-lg transition cursor-pointer"
                    title="Eliminar atajo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Creación / Edición de Atajo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#131722] rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-[#232A3B] space-y-4 animate-in zoom-in-95 duration-200 text-slate-100">
            <div className="flex items-center justify-between border-b border-[#1E2433] pb-3">
              <div className="flex items-center gap-2.5 text-white">
                <div className="w-8 h-8 rounded-lg bg-[#090A0F] text-[#00D2FF] border border-[#232A3B] flex items-center justify-center">
                  {editingIndex !== null ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">
                    {editingIndex !== null ? 'Editar Atajo Rápido' : 'Crear Nuevo Atajo Rápido'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingIndex !== null
                      ? `Modifica el comando o la redacción del atajo ${editingSnippet?.shortcut || ''}`
                      : 'Define un nuevo atajo para que tu equipo comercial responda al instante.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Código de Atajo <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value)}
                    placeholder="/cuenta"
                    className="w-full text-xs px-3 py-2 border border-[#232A3B] rounded-xl bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ejemplo: /precios, /garantia</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Nombre o Etiqueta
                  </label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Cuentas Bancarias"
                    className="w-full text-xs px-3 py-2 border border-[#232A3B] rounded-xl bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Visible en el menú de sugerencias</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Mensaje del Atajo <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormText((prev) => prev + '{primer_nombre}')}
                    className="text-[10px] text-[#00D2FF] hover:underline cursor-pointer font-mono"
                    title="Insertar variable de nombre del lead"
                  >
                    + Insertar {"{primer_nombre}"}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Escribe el mensaje completo. Puedes usar {primer_nombre} para que el CRM lo reemplace por el nombre real del contacto..."
                  className="w-full text-xs px-3 py-2.5 border border-[#232A3B] rounded-xl bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF] leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E2433]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formShortcut.trim() || !formText.trim()}
                  className="px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingIndex !== null ? 'Guardar Cambios' : 'Crear Atajo'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

