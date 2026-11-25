'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Lock, X } from 'lucide-react';

interface DeleteChatModalProps {
  isOpen: boolean;
  mounted: boolean;
  contactLabel: string;
  deletePassword: string;
  setDeletePassword: (v: string) => void;
  deleteError: string | null;
  isDeleting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function DeleteChatModal({
  isOpen,
  mounted,
  contactLabel,
  deletePassword,
  setDeletePassword,
  deleteError,
  isDeleting,
  onClose,
  onSubmit,
}: DeleteChatModalProps) {
  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F]">
          <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              ¿Eliminar conversación?
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5 [scrollbar-width:thin]">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Esta acción es permanente e irreversible. Se eliminará a{' '}
              <strong className="text-slate-900 dark:text-white">{contactLabel}</strong>{' '}
              junto con todo su historial de mensajes, notas y registros de actividad.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirma con tu contraseña de administrador:
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="Tu contraseña actual"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting || !deletePassword.trim()}
              className="min-w-[125px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isDeleting ? 'Eliminando...' : 'Eliminar Chat'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface EndChatModalProps {
  isOpen: boolean;
  mounted: boolean;
  contactLabel: string;
  endResolution: 'completed' | 'won' | 'lost';
  setEndResolution: (r: 'completed' | 'won' | 'lost') => void;
  endDealValue: string;
  setEndDealValue: (v: string) => void;
  endNote: string;
  setEndNote: (v: string) => void;
  isEndingChat: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function EndChatModal({
  isOpen,
  mounted,
  contactLabel,
  endResolution,
  setEndResolution,
  endDealValue,
  setEndDealValue,
  endNote,
  setEndNote,
  isEndingChat,
  onClose,
  onSubmit,
}: EndChatModalProps) {
  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Dar Fin a la Conversación
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{contactLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 [scrollbar-width:thin]">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Resultado de la Atención
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEndResolution('completed')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                    endResolution === 'completed'
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-[#0052FF]/10 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                  }`}
                >
                  <span className="text-base">✓</span>
                  <span className="text-xs font-bold">Completado</span>
                  <span className="text-[10px] opacity-70">Atención regular</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEndResolution('won')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                    endResolution === 'won'
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                  }`}
                >
                  <span className="text-base">🎉</span>
                  <span className="text-xs font-bold">Ganado</span>
                  <span className="text-[10px] opacity-70">Venta cerrada</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEndResolution('lost')}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                    endResolution === 'lost'
                      ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1F2C]'
                  }`}
                >
                  <span className="text-base">✕</span>
                  <span className="text-xs font-bold">Perdido</span>
                  <span className="text-[10px] opacity-70">No concretado</span>
                </button>
              </div>
            </div>

            {endResolution === 'won' && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="block text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                  Valor de la Venta Ganada ($):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-semibold text-slate-400">$</span>
                  <input
                    type="text"
                    value={endDealValue}
                    onChange={(e) => setEndDealValue(e.target.value)}
                    placeholder="0 COP"
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-emerald-300 dark:border-emerald-500/40 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Este monto alimentará tus métricas de conversión comercial y analítica de ROI.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nota interna de cierre (opcional):
              </label>
              <textarea
                value={endNote}
                onChange={(e) => setEndNote(e.target.value)}
                placeholder="Ej: Cliente realizó pedido y pagó por transferencia..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0052FF]"
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
            <button
              type="button"
              onClick={onClose}
              disabled={isEndingChat}
              className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isEndingChat}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isEndingChat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Finalizar Atención</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
