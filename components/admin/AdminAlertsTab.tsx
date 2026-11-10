'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  Send,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Megaphone,
  Clock,
  Shield,
  RefreshCw,
  Trash2,
  Check,
  CheckCheck,
  Building2,
  Users,
  Smartphone,
  Info,
  Calendar,
} from 'lucide-react';
import {
  PlatformAlertsConfig,
  PlatformAnnouncement,
  PlatformEventLogItem,
} from '@/lib/monitoring/platform-alerts';
import {
  getSuperAdminAlertsAndAnnouncementsAction,
  saveSuperAdminAlertsConfigAction,
  sendTestSuperAdminAlertAction,
  resolvePlatformEventAction,
  publishPlatformAnnouncementAction,
  deletePlatformAnnouncementAction,
} from '@/app/actions/superadmin';

export function AdminAlertsTab() {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuración del SuperAdmin
  const [config, setConfig] = useState<PlatformAlertsConfig>({
    enabled: true,
    notifyOnTicket: true,
    notifyOnDisconnect: true,
    notifyOnTokenExpired: true,
    notifyOnTokenThreshold: true,
    notifyOnAssistantCap: true,
    notifyOnBillingDelinquency: true,
    notifyOnAiErrorBurst: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    metaTemplateName: '',
  });

  const [phones, setPhones] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [platformOrgName, setPlatformOrgName] = useState<string>('Synqo Global');
  const [platformProvider, setPlatformProvider] = useState<string>('meta');

  // Eventos operativos
  const [eventsLog, setEventsLog] = useState<PlatformEventLogItem[]>([]);
  const [eventFilter, setEventFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  // Anuncios para clientes
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newSeverity, setNewSeverity] = useState<'info' | 'warning' | 'urgent'>('info');
  const [newAudience, setNewAudience] = useState<'all' | 'paying' | 'evolution'>('all');
  const [newExpiresDays, setNewExpiresDays] = useState<number>(7);
  const [broadcastWhatsApp, setBroadcastWhatsApp] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getSuperAdminAlertsAndAnnouncementsAction();
      if (res.success) {
        setConfig(res.config);
        setPhones(res.phones || []);
        setEmails(res.emails || []);
        setPlatformOrgName(res.platformOrgName);
        setPlatformProvider(res.platformProvider);
        setEventsLog(res.eventsLog || []);
        setAnnouncements(res.announcements || []);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error cargando datos de alertas' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setStatusMsg(null);
    try {
      const res = await saveSuperAdminAlertsConfigAction(config);
      if (res.success) {
        setConfig(res.config);
        setStatusMsg({ type: 'success', text: 'Configuración de alertas guardada exitosamente.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error guardando configuración' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendTestAlert = async () => {
    setSendingTest(true);
    setStatusMsg(null);
    try {
      const res = await sendTestSuperAdminAlertAction();
      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: `Alerta de prueba enviada: ${
            res.sentWhatsApp
              ? 'WhatsApp recibido correctamente.'
              : res.sentEmailFallback
              ? 'Respaldada por correo electrónico.'
              : 'Verificada con éxito.'
          }`,
        });
        loadData();
      } else {
        setStatusMsg({
          type: 'error',
          text: `No se pudo enviar la alerta de prueba (${res.skippedReason || 'revisa teléfonos y canal'}).`,
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error en prueba de alerta' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleResolveEvent = async (id: string) => {
    try {
      const res = await resolvePlatformEventAction(id);
      if (res.success) {
        setEventsLog((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: 'resolved', resolvedAt: new Date().toISOString() } : e))
        );
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error marcando evento' });
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim()) return;

    setPublishing(true);
    setStatusMsg(null);
    try {
      const res = await publishPlatformAnnouncementAction({
        title: newTitle,
        message: newMessage,
        severity: newSeverity,
        targetAudience: newAudience,
        expiresInDays: newExpiresDays,
        sendWhatsAppBroadcast: broadcastWhatsApp,
      });

      if (res.success) {
        setNewTitle('');
        setNewMessage('');
        setBroadcastWhatsApp(false);
        setStatusMsg({
          type: 'success',
          text: `Comunicado publicado exitosamente.${
            res.broadcastResult?.sentCount
              ? ` Difundido por WhatsApp a ${res.broadcastResult.sentCount} administradores.`
              : ''
          }`,
        });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error publicando comunicado' });
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('¿Eliminar este comunicado de forma permanente?')) return;
    try {
      const res = await deletePlatformAnnouncementAction(id);
      if (res.success) {
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error eliminando comunicado' });
    }
  };

  const filteredEvents = eventsLog.filter((e) => {
    if (eventFilter === 'pending') return e.status === 'pending';
    if (eventFilter === 'resolved') return e.status === 'resolved';
    return true;
  });

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-slate-500 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#0052FF]" />
        <p className="text-sm">Cargando Centro de Alertas & Comunicados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs font-semibold hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Grid Superior: Canal SuperAdmin & Configuración de Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tarjeta 1: Canal Emisor del SuperAdmin */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 text-[#0052FF] rounded-xl">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Línea SuperAdmin</h3>
                <p className="text-xs text-gray-500">{platformOrgName}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-slate-100 text-slate-700">
              {platformProvider}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 font-medium">Destinatarios WhatsApp:</span>
              <span className="font-mono font-semibold text-gray-800">
                {phones.length > 0 ? phones.join(', ') : 'No configurado'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 font-medium">Email Resend Fallback:</span>
              <span className="font-mono font-semibold text-gray-800 truncate max-w-[180px]">
                {emails.length > 0 ? emails[0] : 'admin@synqo.dev'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-3">
            <button
              type="button"
              disabled={sendingTest}
              onClick={handleSendTestAlert}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {sendingTest ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BellRing className="w-3.5 h-3.5 text-yellow-400" />
              )}
              Enviar Alerta de Prueba a mi WhatsApp
            </button>

            <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-amber-600" /> Comandos WhatsApp Disponibles:
              </p>
              <p className="font-mono text-[10px] leading-relaxed">
                #plataforma • #desconectados • #tickets • #consumo
              </p>
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Toggles de Eventos Operativos & Horario de Silencio */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Configuración de Notificaciones</h3>
                <p className="text-xs text-gray-500">
                  Selecciona qué eventualidades disparan alertas directas a tu WhatsApp
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={savingConfig}
              onClick={handleSaveConfig}
              className="flex items-center gap-1.5 py-1.5 px-3 bg-[#0052FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              {savingConfig && <RefreshCw className="w-3 h-3 animate-spin" />}
              Guardar Cambios
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnDisconnect}
                onChange={(e) => setConfig({ ...config, notifyOnDisconnect: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Canal Evolution Desconectado</p>
                <p className="text-[11px] text-gray-500">Alerta inmediata cuando una empresa se desconecta</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnTicket}
                onChange={(e) => setConfig({ ...config, notifyOnTicket: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Nuevo Ticket de Soporte</p>
                <p className="text-[11px] text-gray-500">Notifica cuando un cliente abre ticket desde su CRM</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnTokenThreshold}
                onChange={(e) => setConfig({ ...config, notifyOnTokenThreshold: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Consumo de Tokens (≥80% / Excedido)</p>
                <p className="text-[11px] text-gray-500">Avisa si una empresa agota o supera su límite contratado</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnAssistantCap}
                onChange={(e) => setConfig({ ...config, notifyOnAssistantCap: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Tope Asistente de Prompt Excedido</p>
                <p className="text-[11px] text-gray-500">Detecta abusos o uso atípico del asistente de prompt</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnBillingDelinquency}
                onChange={(e) => setConfig({ ...config, notifyOnBillingDelinquency: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Suspensión Preventiva por Mora</p>
                <p className="text-[11px] text-gray-500">Alerta cuando se suspende una cuenta mora día 10+</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifyOnAiErrorBurst}
                onChange={(e) => setConfig({ ...config, notifyOnAiErrorBurst: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <div>
                <p className="font-bold text-gray-900">Ráfagas de Falla en IA / Cron</p>
                <p className="text-[11px] text-gray-500">Alertas ante fallas masivas de API o tareas programadas</p>
              </div>
            </label>
          </div>

          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quietHoursToggle"
                checked={config.quietHoursEnabled}
                onChange={(e) => setConfig({ ...config, quietHoursEnabled: e.target.checked })}
                className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
              />
              <label htmlFor="quietHoursToggle" className="font-semibold text-gray-800 cursor-pointer">
                Horario de Silencio (no molestar):
              </label>
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="time"
                  disabled={!config.quietHoursEnabled}
                  value={config.quietHoursStart}
                  onChange={(e) => setConfig({ ...config, quietHoursStart: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-gray-300 text-xs disabled:opacity-40"
                />
                <span className="text-gray-400">a</span>
                <input
                  type="time"
                  disabled={!config.quietHoursEnabled}
                  value={config.quietHoursEnd}
                  onChange={(e) => setConfig({ ...config, quietHoursEnd: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-gray-300 text-xs disabled:opacity-40"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-500">Plantilla Meta (&gt;24h):</span>
              <input
                type="text"
                placeholder="ej: synqo_superadmin_alert"
                value={config.metaTemplateName || ''}
                onChange={(e) => setConfig({ ...config, metaTemplateName: e.target.value })}
                className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-mono w-48"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grid Inferior: Publicador de Comunicados & Feed de Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Comunicados Oficiales para Clientes (5 columnas) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Publicar Comunicado</h3>
                <p className="text-xs text-gray-500">
                  Banner visible en el Dashboard de las empresas clientes
                </p>
              </div>
            </div>

            <form onSubmit={handlePublishAnnouncement} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Título del Comunicado</label>
                <input
                  type="text"
                  required
                  placeholder="ej: Mantenimiento Preventivo de Servidores"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-[#0052FF]"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Mensaje Explicativo</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detalla la ventana de mantenimiento o el aviso importante..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-[#0052FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Nivel de Severidad</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs"
                  >
                    <option value="info">Informativo (Azul)</option>
                    <option value="warning">Precaución (Ámbar)</option>
                    <option value="urgent">Urgente (Rojo)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Audiencia Objetivo</label>
                  <select
                    value={newAudience}
                    onChange={(e) => setNewAudience(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 text-xs"
                  >
                    <option value="all">Todas las Empresas</option>
                    <option value="paying">Solo Clientes Activos</option>
                    <option value="evolution">Solo Usuarios Evolution</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-800">
                  <input
                    type="checkbox"
                    checked={broadcastWhatsApp}
                    onChange={(e) => setBroadcastWhatsApp(e.target.checked)}
                    className="rounded border-gray-300 text-[#0052FF] focus:ring-[#0052FF]"
                  />
                  <span>Difundir también al WhatsApp de los Administradores</span>
                </label>
                <p className="text-[10px] text-gray-500 pl-5">
                  Envía un mensaje directo a cada administrador de empresa con pausas anti-ban (1.5-2.5s).
                </p>
              </div>

              <button
                type="submit"
                disabled={publishing}
                className="w-full py-2.5 px-4 bg-[#0052FF] hover:bg-blue-600 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Publicar Comunicado Oficial
              </button>
            </form>
          </div>

          {/* Lista de Comunicados Activos */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Comunicados Activos ({announcements.length})
            </h4>

            {announcements.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No hay comunicados activos en este momento.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl border border-gray-100 bg-slate-50 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            a.severity === 'urgent'
                              ? 'bg-rose-100 text-rose-700'
                              : a.severity === 'warning'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {a.severity}
                        </span>
                        <span className="font-bold text-xs text-gray-900 truncate">{a.title}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 line-clamp-2">{a.message}</p>
                      <p className="text-[10px] text-gray-400">
                        Público: {a.targetAudience} • Creado: {new Date(a.createdAt).toLocaleDateString('es-CO')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteAnnouncement(a.id)}
                      className="p-1 text-gray-400 hover:text-rose-600 transition"
                      title="Eliminar comunicado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Feed de Eventos Operativos de la Plataforma (7 columnas) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Monitor de Eventos Operativos</h3>
                <p className="text-xs text-gray-500">Historial reciente de incidentes detectados</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setEventFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  eventFilter === 'all' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Todos ({eventsLog.length})
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('pending')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  eventFilter === 'pending' ? 'bg-white shadow-xs text-rose-600' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Pendientes ({eventsLog.filter((e) => e.status === 'pending').length})
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('resolved')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  eventFilter === 'resolved' ? 'bg-white shadow-xs text-emerald-600' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Resueltos
              </button>
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-xs italic">
              No hay eventos en este filtro. Todo el ecosistema opera con normalidad.
            </div>
          ) : (
            <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
              {filteredEvents.map((item) => {
                const isPending = item.status === 'pending';
                const isCritical = item.severity === 'critical';

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                      isPending
                        ? isCritical
                          ? 'border-rose-200 bg-rose-50/50'
                          : 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-200 bg-gray-50/60 opacity-80'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            item.severity === 'critical'
                              ? 'bg-rose-100 text-rose-700'
                              : item.severity === 'warning'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {item.type.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-xs text-gray-900">{item.companyName}</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(item.createdAt).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-gray-800">{item.title}</p>
                      <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {item.details}
                      </p>

                      {!isPending && item.resolvedAt && (
                        <p className="text-[10px] text-emerald-700 flex items-center gap-1 font-medium pt-1">
                          <CheckCheck className="w-3 h-3" /> Resuelto por {item.resolvedBy || 'SuperAdmin'} el{' '}
                          {new Date(item.resolvedAt).toLocaleDateString('es-CO')}
                        </p>
                      )}
                    </div>

                    {isPending && (
                      <button
                        onClick={() => handleResolveEvent(item.id)}
                        className="py-1 px-2.5 bg-white hover:bg-emerald-50 border border-gray-300 hover:border-emerald-300 text-emerald-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-xs cursor-pointer flex-shrink-0"
                      >
                        <Check className="w-3 h-3" /> Marcar Atendido
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
