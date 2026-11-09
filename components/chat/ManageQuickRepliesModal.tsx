'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Loader2,
  FileText,
  AlertCircle,
  Copy,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { QuickSnippet, saveOrganizationQuickReplies } from '@/app/actions/chat';

interface ManageQuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSnippets: QuickSnippet[];
  aiSuggestions: QuickSnippet[];
  onSnippetsUpdated: (updated: QuickSnippet[]) => void;
  initialEditShortcut?: string | null;
}

export function ManageQuickRepliesModal({
  isOpen,
  onClose,
  activeSnippets,
  aiSuggestions,
  onSnippetsUpdated,
  initialEditShortcut,
}: ManageQuickRepliesModalProps) {
  const [snippets, setSnippets] = useState<QuickSnippet[]>(activeSnippets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estado para la edición de un atajo existente
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editShortcut, setEditShortcut] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editText, setEditText] = useState('');

  // Formulario de nuevo atajo
  const [newShortcut, setNewShortcut] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setSnippets(activeSnippets);
      setError(null);
      setSuccessMsg(null);

      // Si se abre para editar un atajo específico
      if (initialEditShortcut) {
        const idx = activeSnippets.findIndex(
          (s) => s.shortcut.toLowerCase() === initialEditShortcut.toLowerCase()
        );
        if (idx !== -1) {
          const target = activeSnippets[idx];
          setEditingIndex(idx);
          setEditShortcut(target.shortcut);
          setEditLabel(target.label);
          setEditText(target.text);
        } else {
          setEditingIndex(null);
        }
      } else {
        setEditingIndex(null);
      }

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, activeSnippets, initialEditShortcut]);

  if (!isOpen) return null;

  const existingShortcuts = new Set(snippets.map((s) => s.shortcut.toLowerCase()));

  const startEditing = (idx: number) => {
    const target = snippets[idx];
    if (!target) return;
    setEditingIndex(idx);
    setEditShortcut(target.shortcut);
    setEditLabel(target.label);
    setEditText(target.text);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditShortcut('');
    setEditLabel('');
    setEditText('');
  };

  const handleSaveEdit = async (idx: number) => {
    if (!editShortcut.trim() || !editText.trim()) {
      setError('El código y el texto del atajo son obligatorios.');
      return;
    }

    let cleanCode = editShortcut.trim();
    if (!cleanCode.startsWith('/')) cleanCode = '/' + cleanCode;
    cleanCode = '/' + cleanCode.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Validar que no choque con otro atajo diferente
    const duplicate = snippets.some(
      (s, i) => i !== idx && s.shortcut.toLowerCase() === cleanCode.toLowerCase()
    );
    if (duplicate) {
      setError(`Ya existe otro atajo con el comando "${cleanCode}". Elige otro diferente.`);
      return;
    }

    const updated = [...snippets];
    updated[idx] = {
      ...updated[idx],
      shortcut: cleanCode,
      label: editLabel.trim() || cleanCode,
      text: editText.trim(),
    };

    setSnippets(updated);
    setEditingIndex(null);
    setError(null);
    setLoading(true);

    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        onSnippetsUpdated(res.snippets);
        setSuccessMsg(`Atajo "${cleanCode}" actualizado y guardado exitosamente.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al persistir la edición del atajo.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAiSuggestion = async (suggestion: QuickSnippet) => {
    if (existingShortcuts.has(suggestion.shortcut.toLowerCase())) {
      return;
    }
    const updated = [
      ...snippets,
      {
        id: `custom-${Date.now()}`,
        shortcut: suggestion.shortcut,
        label: suggestion.label,
        text: suggestion.text,
      },
    ];
    setSnippets(updated);
    setLoading(true);
    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        onSnippetsUpdated(res.snippets);
        setSuccessMsg(`Atajo "${suggestion.shortcut}" agregado.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el atajo sugerido.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomizeAiSuggestion = (suggestion: QuickSnippet) => {
    setNewShortcut(suggestion.shortcut);
    setNewLabel(suggestion.label);
    setNewText(suggestion.text);
    setSuccessMsg(`Sugerencia "${suggestion.shortcut}" cargada en el formulario para personalizar.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteSnippet = async (indexToRemove: number) => {
    const target = snippets[indexToRemove];
    const updated = snippets.filter((_, idx) => idx !== indexToRemove);
    setSnippets(updated);
    if (editingIndex === indexToRemove) {
      cancelEditing();
    } else if (editingIndex !== null && editingIndex > indexToRemove) {
      setEditingIndex(editingIndex - 1);
    }

    setLoading(true);
    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        onSnippetsUpdated(res.snippets);
        setSuccessMsg(`Atajo "${target?.shortcut || 'seleccionado'}" eliminado.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar el atajo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcut.trim() || !newText.trim()) return;

    let cleanCode = newShortcut.trim();
    if (!cleanCode.startsWith('/')) cleanCode = '/' + cleanCode;
    cleanCode = '/' + cleanCode.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

    const existsDuplicate = snippets.some(
      (s) => s.shortcut.toLowerCase() === cleanCode.toLowerCase()
    );
    if (existsDuplicate) {
      setError(`Ya existe un atajo con el código "${cleanCode}". Elige otro.`);
      return;
    }

    const newSnippetItem: QuickSnippet = {
      id: `custom-${Date.now()}`,
      shortcut: cleanCode,
      label: newLabel.trim() || cleanCode,
      text: newText.trim(),
    };

    const updated = [...snippets, newSnippetItem];
    setSnippets(updated);
    setNewShortcut('');
    setNewLabel('');
    setNewText('');
    setLoading(true);
    setError(null);

    try {
      const res = await saveOrganizationQuickReplies(updated);
      if (res.success) {
        onSnippetsUpdated(res.snippets);
        setSuccessMsg(`Atajo "${cleanCode}" creado y guardado.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el nuevo atajo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await saveOrganizationQuickReplies(snippets);
      if (res.success) {
        onSnippetsUpdated(res.snippets);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar los atajos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#131722] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-[#232A3B] animate-in zoom-in-95 duration-200 text-slate-100">
        {/* Cabecera Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1E2433] bg-[#090A0F]/70">
          <div className="flex items-center gap-2.5 text-white">
            <div className="w-8 h-8 rounded-lg bg-[#090A0F] text-[#00D2FF] border border-[#232A3B] flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Atajos & Respuestas Rápidas (/)</h3>
              <p className="text-xs text-slate-400">Edita, personaliza o crea tus comandos para responder con 1 clic en el chat.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido scrolleable interno */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 [scrollbar-width:thin]">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl font-medium animate-in fade-in duration-150 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
          {/* SECCIÓN 1: Sugerencias de la IA basadas en el Prompt */}
          {aiSuggestions.length > 0 && (
            <div className="bg-[#090A0F] border border-[#232A3B] rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00D2FF]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Sugerencias de la IA (Basadas en tu catálogo y prompt)</span>
                </div>
                <span className="text-[10px] font-mono text-[#00D2FF] bg-[#00D2FF]/10 border border-[#00D2FF]/20 px-2 py-0.5 rounded-full font-semibold">
                  IA Generativa
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                La IA analizó las políticas y servicios de tu negocio para proponerte estos atajos pre-redactados:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {aiSuggestions.map((sug) => {
                  const isAlreadyAdded = existingShortcuts.has(sug.shortcut.toLowerCase());
                  return (
                    <div
                      key={sug.id || sug.shortcut}
                      className="p-2.5 bg-[#131722] rounded-lg border border-[#232A3B] space-y-1.5 text-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-200 truncate">{sug.label}</span>
                          <code className="text-[10px] font-mono text-[#00D2FF] bg-[#090A0F] px-1.5 py-0.5 rounded border border-[#232A3B]">
                            {sug.shortcut}
                          </code>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {sug.text}
                        </p>
                      </div>

                      <div className="pt-1 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCustomizeAiSuggestion(sug)}
                          className="text-[10px] font-medium text-slate-400 hover:text-[#00D2FF] px-2 py-1 rounded-md hover:bg-[#1A1F2C] transition flex items-center gap-1 cursor-pointer"
                          title="Cargar en el formulario para personalizar antes de guardar"
                        >
                          <Pencil className="w-3 h-3" /> Personalizar
                        </button>
                        {isAlreadyAdded ? (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                            <Check className="w-3 h-3" /> Añadido
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddAiSuggestion(sug)}
                            className="text-[11px] font-semibold text-white bg-[#0052FF] hover:bg-[#0043D4] px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Añadir
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECCIÓN 2: Lista de Atajos Activos con Soporte Completo de Edición */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Tus Atajos Activos ({snippets.length})</span>
              </span>
              <span className="text-[10px] text-slate-500">
                Haz clic en el lápiz para editar cualquier atajo
              </span>
            </div>

            {snippets.length === 0 ? (
              <div className="p-5 text-center border border-dashed border-[#232A3B] rounded-xl text-slate-500 text-xs">
                No tienes atajos guardados. Puedes añadir las sugerencias de la IA o crear tus propios atajos abajo.
              </div>
            ) : (
              <div className="divide-y divide-[#1E2433] border border-[#232A3B] rounded-xl bg-[#090A0F] overflow-hidden">
                {snippets.map((item, idx) => {
                  const isEditing = editingIndex === idx;

                  if (isEditing) {
                    return (
                      <div
                        key={item.id || idx}
                        className="p-3.5 bg-[#131722] border-l-4 border-l-[#0052FF] space-y-3 animate-in fade-in duration-150"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#00D2FF] flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5 text-[#00D2FF]" />
                            <span>Editando atajo:</span>
                            <code className="font-mono text-white bg-[#090A0F] px-1.5 py-0.5 rounded border border-[#232A3B]">
                              {item.shortcut}
                            </code>
                          </span>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1A1F2C] transition cursor-pointer"
                            title="Cancelar edición"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-medium text-slate-400 block mb-1">
                              Código de atajo (ej. /cuenta)
                            </label>
                            <input
                              type="text"
                              value={editShortcut}
                              onChange={(e) => setEditShortcut(e.target.value)}
                              placeholder="/comando"
                              className="w-full text-xs px-2.5 py-1.5 border border-[#232A3B] rounded-lg bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-slate-400 block mb-1">
                              Nombre o Etiqueta
                            </label>
                            <input
                              type="text"
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              placeholder="Nombre visible del atajo"
                              className="w-full text-xs px-2.5 py-1.5 border border-[#232A3B] rounded-lg bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-medium text-slate-400">
                              Texto del mensaje
                            </label>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {"{primer_nombre}"} se reemplaza por el nombre del lead
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            placeholder="Texto completo que el asesor enviará..."
                            className="w-full text-xs px-2.5 py-2 border border-[#232A3B] rounded-lg bg-[#090A0F] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1E2433]">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={loading || !editShortcut.trim() || !editText.trim()}
                            onClick={() => handleSaveEdit(idx)}
                            className="px-3.5 py-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                          >
                            {loading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Guardando...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Guardar cambios</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id || idx}
                      className="p-2.5 flex items-start justify-between gap-3 text-xs hover:bg-[#131722] transition group"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-bold text-[#00D2FF] bg-[#131722] px-1.5 py-0.5 rounded border border-[#232A3B]">
                            {item.shortcut}
                          </code>
                          <span className="font-semibold text-white">{item.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed whitespace-pre-line">
                          {item.text}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditing(idx)}
                          className="text-slate-400 hover:text-[#00D2FF] p-1.5 rounded-lg hover:bg-[#1E2433] transition cursor-pointer"
                          title="Editar atajo"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSnippet(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                          title="Eliminar atajo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECCIÓN 3: Crear Nuevo Atajo Personalizado */}
          <div className="border border-[#232A3B] rounded-xl p-3.5 bg-[#090A0F] space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#0052FF]" />
              Crear Nuevo Atajo Personalizado
            </h4>

            <form onSubmit={handleCreateCustomSnippet} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Código de atajo (ej. /cuenta)
                  </label>
                  <input
                    type="text"
                    value={newShortcut}
                    onChange={(e) => setNewShortcut(e.target.value)}
                    placeholder="/garantia"
                    className="w-full text-xs px-3 py-1.5 border border-[#232A3B] rounded-lg bg-[#131722] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Nombre o Etiqueta
                  </label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Política de Garantía"
                    className="w-full text-xs px-3 py-1.5 border border-[#232A3B] rounded-lg bg-[#131722] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-400">
                    Texto del mensaje
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Usa {"{primer_nombre}"} para el nombre del cliente
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Escribe el mensaje completo que el asesor enviará..."
                  className="w-full text-xs px-3 py-2 border border-[#232A3B] rounded-lg bg-[#131722] text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading || !newShortcut.trim() || !newText.trim()}
                  className="px-3 py-1.5 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-lg transition disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir y Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer con Guardar Cambios Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-t border-[#1E2433] bg-[#090A0F]/70">
          <span className="text-[11px] text-slate-500 font-medium">
            {snippets.length} atajo{snippets.length === 1 ? '' : 's'} activo{snippets.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-[#1A1F2C] transition cursor-pointer font-medium"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
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
                  <span>Listo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
