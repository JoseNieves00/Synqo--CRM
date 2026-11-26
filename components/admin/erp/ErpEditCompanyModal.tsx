'use client';

import React from 'react';
import {
  Building2,
  Check,
  Loader2,
  QrCode,
  Sparkles,
  Zap,
} from 'lucide-react';
import { EnabledModules, OrganizationRow } from '@/app/actions/superadmin';
import {
  estimateChatsFromTokens,
  formatTokenDetailed,
} from '@/lib/billing/plan-defaults';

export interface ErpEditCompanyModalProps {
  editingOrg: OrganizationRow;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  editName: string;
  setEditName: React.Dispatch<React.SetStateAction<string>>;
  editSeats: number;
  setEditSeats: React.Dispatch<React.SetStateAction<number>>;
  editTokensLimit: number;
  setEditTokensLimit: React.Dispatch<React.SetStateAction<number>>;
  editResetTokens: boolean;
  setEditResetTokens: React.Dispatch<React.SetStateAction<boolean>>;
  editTokenAlertThresholds: string;
  setEditTokenAlertThresholds: React.Dispatch<React.SetStateAction<string>>;
  editBusinessModel: 'products' | 'services' | 'hybrid';
  setEditBusinessModel: React.Dispatch<React.SetStateAction<'products' | 'services' | 'hybrid'>>;
  setEditModules: React.Dispatch<React.SetStateAction<EnabledModules>>;
  editWaProvider: 'meta' | 'evolution';
  setEditWaProvider: React.Dispatch<React.SetStateAction<'meta' | 'evolution'>>;
  editEvolutionApiUrl: string;
  setEditEvolutionApiUrl: React.Dispatch<React.SetStateAction<string>>;
  editEvolutionInstanceName: string;
  setEditEvolutionInstanceName: React.Dispatch<React.SetStateAction<string>>;
  editEvolutionApiKey: string;
  setEditEvolutionApiKey: React.Dispatch<React.SetStateAction<string>>;
  editEvolutionAntiBan: boolean;
  setEditEvolutionAntiBan: React.Dispatch<React.SetStateAction<boolean>>;
  editEvolutionMaxOutbound: number;
  setEditEvolutionMaxOutbound: React.Dispatch<React.SetStateAction<number>>;
}

export function ErpEditCompanyModal({
  editingOrg,
  onClose,
  onSubmit,
  isSubmitting,
  editName,
  setEditName,
  editSeats,
  setEditSeats,
  editTokensLimit,
  setEditTokensLimit,
  editResetTokens,
  setEditResetTokens,
  editTokenAlertThresholds,
  setEditTokenAlertThresholds,
  editBusinessModel,
  setEditBusinessModel,
  setEditModules,
  editWaProvider,
  setEditWaProvider,
  editEvolutionApiUrl,
  setEditEvolutionApiUrl,
  editEvolutionInstanceName,
  setEditEvolutionInstanceName,
  editEvolutionApiKey,
  setEditEvolutionApiKey,
  editEvolutionAntiBan,
  setEditEvolutionAntiBan,
  editEvolutionMaxOutbound,
  setEditEvolutionMaxOutbound,
}: ErpEditCompanyModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera Pinned */}
        <div className="shrink-0 px-6 py-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center font-bold shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                Editar Empresa: <span>{editingOrg.name}</span>
              </h3>
              <p className="text-xs text-gray-500">
                Ajuste de plan comercial, límite de usuarios y asignación de tokens IA para el mes en curso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-200/60 transition cursor-pointer text-sm font-semibold"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 [scrollbar-width:thin]">
            {/* Layout Horizontal de 2 Columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Columna Izquierda: Información de Empresa & Equipo */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Nombre Comercial de la Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ej. Clínica Dental Sonrisas"
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 font-medium transition shadow-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Límite de Usuarios
                    </label>
                    <span className="text-[11px] text-gray-500 font-medium">
                      En uso: <strong className="text-gray-900">{editingOrg.users_count}</strong> activos
                    </span>
                  </div>
                  <input
                    type="number"
                    min={editingOrg.users_count || 1}
                    max={500}
                    value={editSeats}
                    onChange={(e) => setEditSeats(parseInt(e.target.value, 10) || 1)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 font-medium transition shadow-xs"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Protección de integridad: No se puede reducir por debajo de {editingOrg.users_count} miembros activos.
                  </p>
                </div>

                {/* Tarjeta de Resumen Rápido / Cortesía de soporte */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Cortesía de Soporte Técnico
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={editResetTokens}
                      onChange={(e) => setEditResetTokens(e.target.checked)}
                      className="rounded text-[#0052FF] focus:ring-[#0052FF]/20 w-4 h-4"
                    />
                    <span>Reiniciar tokens consumidos a 0 ahora</span>
                  </label>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Google Gemini (Primario • $0):
                      </span>
                      <strong className="font-mono text-slate-800">
                        {((editingOrg.ai_tokens_google_used ?? (editingOrg.ai_tokens_used ? Math.max(0, editingOrg.ai_tokens_used - (editingOrg.ai_tokens_openai_used || 0)) : 0))).toLocaleString()} tokens
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${editingOrg.ai_tokens_openai_used ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        OpenAI (Mensajería):
                      </span>
                      <strong className="font-mono text-slate-800">
                        {(editingOrg.ai_tokens_openai_used || 0).toLocaleString()} tokens
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Consumo Actual y Umbrales Push */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                      Cuota Mensual de Tokens IA
                    </span>
                    <span className="text-[11px] font-mono text-slate-600 font-semibold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      {Math.min(100, Math.round(((editingOrg.ai_tokens_used || 0) / Math.max(1, editTokensLimit)) * 100))}% consumido
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Cuota Base Mensual
                      </span>
                      <div className="text-base font-black text-[#0052FF]">
                        {formatTokenDetailed(editTokensLimit)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Capacidad Estimada
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        {estimateChatsFromTokens(editTokensLimit)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Para adicionar tokens temporales o aumentar el límite permanente con su cobro, usa la pestaña{' '}
                    <strong className="text-slate-700">Billetera &amp; Tokens IA</strong>.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Umbrales Push de Aviso (% separados por coma):
                  </label>
                  <input
                    type="text"
                    value={editTokenAlertThresholds}
                    onChange={(e) => setEditTokenAlertThresholds(e.target.value)}
                    placeholder="80, 90, 100"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white font-mono text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Sección de Módulos Activos (Por Empresa / Plan) */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#0052FF]" />
                    Módulos Activos
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Activa o desactiva agenda según el giro del negocio.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'products' as const,
                    title: 'Vende Productos',
                    desc: 'Activa Pedidos & Plan Separe. Apaga Calendario para ahorrar tokens.',
                  },
                  {
                    id: 'services' as const,
                    title: 'Vende Servicios',
                    desc: 'Activa Agenda de Citas, Recordatorios y Google Meet.',
                  },
                  {
                    id: 'hybrid' as const,
                    title: 'Modelo Híbrido',
                    desc: 'Activa Pedidos + Agenda de Citas & Google Meet unificados.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setEditBusinessModel(opt.id);
                      const isServ = opt.id === 'services' || opt.id === 'hybrid';
                      const isProd = opt.id === 'products' || opt.id === 'hybrid';
                      setEditModules((prev) => ({
                        ...prev,
                        native_calendar: isServ,
                        anti_no_show: isServ,
                        orders: isProd,
                      }));
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      editBusinessModel === opt.id
                        ? 'bg-blue-50/70 border-[#0052FF] ring-1 ring-[#0052FF]'
                        : 'bg-gray-50/50 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs font-bold text-gray-900 block">{opt.title}</span>
                    <span className="text-[10px] text-gray-500 block leading-tight mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {/* Módulo WhatsApp Engine en Edición: Meta vs Evolution API */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-[#0052FF]" />
                    Motor de Mensajería WhatsApp Asignado
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Configurado exclusivamente desde esta consola de Super Admin. Si activas Evolution API, el cliente solo verá el QR para escanear en sus Ajustes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      editWaProvider === 'evolution'
                        ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editWaProvider"
                      value="evolution"
                      checked={editWaProvider === 'evolution'}
                      onChange={() => setEditWaProvider('evolution')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 block">
                        Evolution API (VPS)
                      </span>
                      <span className="text-[10px] text-indigo-700 block font-medium">
                        Self-Hosted • QR & Código
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      editWaProvider === 'meta'
                        ? 'bg-blue-50/70 border-[#0052FF] ring-2 ring-[#0052FF]/20'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editWaProvider"
                      value="meta"
                      checked={editWaProvider === 'meta'}
                      onChange={() => setEditWaProvider('meta')}
                      className="text-[#0052FF] focus:ring-[#0052FF]"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-900 block">
                        Meta Cloud API
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        Oficial Meta • WABA
                      </span>
                    </div>
                  </label>
                </div>

                {editWaProvider === 'evolution' && (
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2.5">
                    <p className="text-[11px] text-indigo-950 font-medium">
                      Usa automáticamente el VPS central de Synqo y genera su instancia. El cliente solo escanea el QR desde Ajustes.
                    </p>
                    <details className="group">
                      <summary className="text-[11px] font-bold text-indigo-700 cursor-pointer select-none list-none flex items-center gap-1">
                        <span>▸ Configuración avanzada / VPS dedicado (opcional)</span>
                      </summary>
                      <div className="mt-2.5 space-y-2.5 pt-2 border-t border-indigo-200/60">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-gray-700 block mb-1">
                              URL del VPS
                            </label>
                            <input
                              type="text"
                              placeholder="Opcional (usa VPS global)"
                              value={editEvolutionApiUrl}
                              onChange={(e) => setEditEvolutionApiUrl(e.target.value)}
                              className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-700 block mb-1">
                              Nombre de Instancia
                            </label>
                            <input
                              type="text"
                              placeholder="Auto-generado"
                              value={editEvolutionInstanceName}
                              onChange={(e) => setEditEvolutionInstanceName(e.target.value)}
                              className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-700 block mb-1">
                              API Key propia
                            </label>
                            <input
                              type="password"
                              placeholder="Opcional (usa global)"
                              value={editEvolutionApiKey}
                              onChange={(e) => setEditEvolutionApiKey(e.target.value)}
                              className="w-full text-xs font-mono border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editEvolutionAntiBan}
                              onChange={(e) => setEditEvolutionAntiBan(e.target.checked)}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] font-semibold text-indigo-950">
                              Heurística Anti-Ban
                            </span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-500">Tope/hora:</span>
                            <input
                              type="number"
                              min={5}
                              max={500}
                              value={editEvolutionMaxOutbound}
                              onChange={(e) => setEditEvolutionMaxOutbound(Number(e.target.value))}
                              className="w-16 text-xs text-center border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-900 font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Botones de Acción (Footer Horizontal Pinned) */}
          <div className="shrink-0 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/70">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[150px] inline-flex items-center justify-center gap-1.5 px-6 py-2 bg-[#0052FF] hover:bg-[#0047E0] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
