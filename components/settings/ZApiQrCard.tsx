'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  QrCode,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Unlink,
  Eye,
  EyeOff,
  Zap,
  Info,
  Sliders,
  Check,
  Download,
  Copy,
  Phone,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  saveZapiCredentials,
  getZapiQrCode,
  getZapiPhoneCode,
  getZapiConnectionStatus,
  disconnectZapiSession,
  importRecentZapiChats,
} from '@/app/actions/zapi';

interface ZApiQrCardProps {
  initialInstanceId?: string;
  hasToken?: boolean;
  hasClientToken?: boolean;
  initialStatus?: 'connected' | 'disconnected' | 'connecting';
  initialPhone?: string;
  antiBanMode?: boolean;
  maxOutboundPerHour?: number;
  isSuperAdmin?: boolean;
}

export function ZApiQrCard({
  initialInstanceId = '',
  hasToken = false,
  hasClientToken = false,
  initialStatus = 'disconnected',
  initialPhone = '',
  antiBanMode = true,
  maxOutboundPerHour = 20,
  isSuperAdmin = false,
}: ZApiQrCardProps) {
  const router = useRouter();
  const [instanceId, setInstanceId] = useState(initialInstanceId);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [clientToken, setClientToken] = useState('');
  const [showClientToken, setShowClientToken] = useState(false);

  const [hasSavedToken, setHasSavedToken] = useState(hasToken);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>(initialStatus);
  const [connectedPhone, setConnectedPhone] = useState(initialPhone);

  const [antiBan, setAntiBan] = useState(antiBanMode);
  const [maxOutbound, setMaxOutbound] = useState(maxOutboundPerHour);

  const [showConfigInputs, setShowConfigInputs] = useState(!initialInstanceId || !hasToken);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importingChats, setImportingChats] = useState(false);

  // Estados del visor de Código QR y Vinculación
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [connectTab, setConnectTab] = useState<'qr' | 'phone'>('qr');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(20);

  // Estados específicos de vinculación por Código de Teléfono (Pairing Code)
  const [phoneNumber, setPhoneNumber] = useState(initialPhone || '');
  const [phoneCode, setPhoneCode] = useState<string | null>(null);
  const [loadingPhoneCode, setLoadingPhoneCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Manejo de Polling automático de conexión cuando el visor de QR está activo
  useEffect(() => {
    if (!qrModalOpen || status === 'connected') {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    // Intervalo de verificación de conexión en segundo plano
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getZapiConnectionStatus();
        if (res.connected) {
          setStatus('connected');
          if (res.phone) setConnectedPhone(res.phone);
          setQrModalOpen(false);
          setFeedback({
            type: 'success',
            message: `¡WhatsApp vinculado exitosamente! Línea activa: ${res.phone || ''}`,
          });
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch {
        // Silencioso durante el polling
      }
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [qrModalOpen, status]);

  // Manejo de la cuenta regresiva para refresco del QR (solo activo en pestaña de QR)
  useEffect(() => {
    if (!qrModalOpen || !qrImage || connectTab !== 'qr') return;

    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          handleRefreshQr();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrModalOpen, qrImage, connectTab]);

  /**
   * Guarda o actualiza las credenciales de Z-API
   */
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceId.trim()) {
      setFeedback({ type: 'error', message: 'El Instance ID de Z-API es obligatorio.' });
      return;
    }

    setSavingCredentials(true);
    setFeedback(null);

    try {
      const res = await saveZapiCredentials({
        instanceId: instanceId.trim(),
        token: token.trim() || undefined,
        clientToken: clientToken.trim() || undefined,
        whatsappProvider: 'zapi',
        antiBanMode: antiBan,
        maxOutboundPerHour: maxOutbound,
      });

      if (token.trim()) {
        setHasSavedToken(true);
        setToken('');
      }
      setShowConfigInputs(false);
      setFeedback({
        type: 'success',
        message: `${res.message} ${res.webhookFeedback || ''}`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error guardando credenciales de Z-API',
      });
    } finally {
      setSavingCredentials(false);
    }
  };

  /**
   * Solicita el código QR para renderizar en el modal
   */
  const handleOpenQrModal = async () => {
    if (!instanceId && !initialInstanceId) {
      setFeedback({
        type: 'warning',
        message: 'Primero debes asignar una instancia de Z-API en la empresa.',
      });
      if (isSuperAdmin) setShowConfigInputs(true);
      return;
    }

    setLoadingQr(true);
    setFeedback(null);
    setQrCountdown(20);

    try {
      const res = await getZapiQrCode();
      if ((res as any).connected || res.type === 'connected') {
        setStatus('connected');
        if ((res as any).phone) setConnectedPhone((res as any).phone);
        setFeedback({
          type: 'success',
          message: (res as any).message || '¡WhatsApp ya se encuentra vinculado exitosamente!',
        });
        setQrModalOpen(false);
        return;
      }

      setQrImage(res.value);
      setQrModalOpen(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al cargar código QR',
      });
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
    }
  };

  const handleRefreshQr = async () => {
    setLoadingQr(true);
    try {
      const res = await getZapiQrCode();
      if ((res as any).connected || res.type === 'connected') {
        setStatus('connected');
        if ((res as any).phone) setConnectedPhone((res as any).phone);
        setFeedback({
          type: 'success',
          message: (res as any).message || '¡WhatsApp vinculado exitosamente!',
        });
        setQrModalOpen(false);
        return;
      }
      setQrImage(res.value);
      setQrCountdown(20);
    } catch (err: any) {
      console.warn('[QR REFRESH ERROR]', err);
    } finally {
      setLoadingQr(false);
    }
  };

  /**
   * Solicita el código alfanumérico de 8 caracteres (Pairing Code) para vincular por teléfono
   */
  const handleGetPhoneCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = phoneNumber.replace(/\D/g, '');
    if (!clean || clean.length < 8) {
      setFeedback({
        type: 'warning',
        message: 'Ingresa un número telefónico válido con código de país (ej. 573001234567).',
      });
      return;
    }

    setLoadingPhoneCode(true);
    setFeedback(null);

    try {
      const res = await getZapiPhoneCode(clean);
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setConnectedPhone(res.phone);
        setFeedback({
          type: 'success',
          message: res.message || '¡WhatsApp ya se encuentra vinculado exitosamente!',
        });
        setQrModalOpen(false);
        return;
      }

      setPhoneCode(res.code);
      setFeedback({
        type: 'success',
        message: 'Código de vinculación generado. Ingrésalo en tu aplicación de WhatsApp.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error obteniendo código de vinculación telefónica.',
      });
    } finally {
      setLoadingPhoneCode(false);
    }
  };

  /**
   * Copia el código al portapapeles con feedback visual
   */
  const handleCopyPhoneCode = () => {
    if (!phoneCode) return;
    navigator.clipboard.writeText(phoneCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  /**
   * Desconecta la sesión activa de WhatsApp
   */
  const handleDisconnect = async () => {
    if (
      !confirm(
        '¿Estás seguro de desconectar WhatsApp? La IA dejará de responder mensajes hasta que vuelvas a escanear el código QR.'
      )
    ) {
      return;
    }

    setDisconnecting(true);
    setFeedback(null);

    try {
      await disconnectZapiSession();
      setStatus('disconnected');
      setConnectedPhone('');
      setFeedback({
        type: 'success',
        message: 'Sesión de WhatsApp desconectada exitosamente.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error desconectando sesión de WhatsApp',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  /**
   * Sincroniza los últimos chats de WhatsApp al Inbox y Pipeline (Modelo C)
   */
  const handleImportChats = async () => {
    setImportingChats(true);
    setFeedback(null);

    try {
      const res = await importRecentZapiChats();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message,
        });
        router.refresh();
      } else {
        setFeedback({
          type: 'warning',
          message: res.message || 'No se pudieron sincronizar los chats.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al sincronizar chats recientes.',
      });
    } finally {
      setImportingChats(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
              : feedback.type === 'warning'
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            {feedback.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
            {feedback.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            &times;
          </button>
        </div>
      )}

      {/* Tarjeta de Estado Activo o Conexión */}
      {status === 'connected' ? (
        <div className="bg-slate-50 dark:bg-[#090A0F] border border-emerald-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    WhatsApp Vinculado por Código QR
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    En Línea (Sincronizado)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Línea conectada:{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {connectedPhone ? `+${connectedPhone}` : 'Dispositivo móvil activo'}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={handleImportChats}
                disabled={importingChats}
                title="Importa las últimas 50 conversaciones de WhatsApp al Inbox y Pipeline"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/30 transition cursor-pointer disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 ${importingChats ? 'animate-bounce text-purple-600 dark:text-purple-400' : ''}`} />
                {importingChats ? 'Sincronizando chats...' : 'Sincronizar Últimos Chats'}
              </button>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                {disconnecting ? 'Desvinculando...' : 'Desconectar WhatsApp'}
              </button>
            </div>
          </div>

          {/* Banner de Sincronización Segura */}
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-900 dark:text-purple-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">Historial reciente de conversaciones (Modelo C)</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Al pulsar <strong>&ldquo;Sincronizar Últimos Chats&rdquo;</strong>, Synqo importará tus 50 conversaciones más recientes para que puedas verlas y responderlas desde el Inbox. Por seguridad, <strong>la IA se mantendrá desactivada</strong> en estos contactos para proteger tu privacidad y evitar respuestas accidentales a clientes o familiares antiguos.
              </p>
            </div>
          </div>

          {/* Insignias de Blindaje Anti-Baneo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                <strong>Cadencia Humana Activa:</strong> Retardos dinámicos de tipeo (1.5s - 8s) y pausas de lectura simuladas.
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Smartphone className="w-4 h-4 text-blue-500 shrink-0" />
              <span>
                <strong>Coexistencia Móvil:</strong> Puedes intervenir desde tu celular; la IA se pausará automáticamente.
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Tarjeta de Inicio Rápido (Desconectado) */
        <div className="bg-slate-50/60 dark:bg-[#0B0E14] border border-slate-200 dark:border-[#1E2433] rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                  Conexión Inmediata Express (Z-API)
                </span>
                <span className="text-[11px] font-bold text-slate-500">Sin Burocracia Meta</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Vincular WhatsApp (Código QR o Teléfono)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                Conecta tu WhatsApp en menos de 1 minuto escaneando el código QR o solicitando un código directo a tu teléfono móvil. La IA de Synqo comenzará a atender prospectos automáticamente.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenQrModal}
              disabled={loadingQr}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-500/20 transition cursor-pointer shrink-0"
            >
              <Zap className="w-4 h-4" />
              {loadingQr ? 'Generando sesión...' : 'Vincular WhatsApp'}
            </button>
          </div>

          {/* Checklist de Prevención de Puntos Ciegos */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
              <Info className="w-4 h-4 shrink-0" />
              <span>Antes de escanear el código QR, verifica:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
              <li>
                Abre WhatsApp en tu teléfono &rarr; <strong>Ajustes &rarr; Dispositivos vinculados</strong>. Asegúrate de tener <strong>menos de 4 sesiones abiertas</strong>.
              </li>
              <li>
                Mantén tu teléfono con conexión estable a internet y batería suficiente para evitar desconexiones de sesión.
              </li>
              <li>
                Si escribes manualmente a un cliente desde el celular, la IA se pausará en ese chat durante 45 minutos para darte el control.
              </li>
            </ul>
          </div>

          {/* Configuración de credenciales de Z-API (Exclusivo Super Administrador) */}
          {isSuperAdmin && (
            <>
              <div className="border-t border-slate-200 dark:border-[#1E2433] pt-4">
                <button
                  type="button"
                  onClick={() => setShowConfigInputs(!showConfigInputs)}
                  className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  {showConfigInputs ? 'Ocultar credenciales de instancia' : 'Configurar Instance ID y Token de Z-API (Super Admin)'}
                </button>
              </div>

              {showConfigInputs && (
                <form onSubmit={handleSaveCredentials} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Instance ID (Z-API) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={instanceId}
                        onChange={(e) => setInstanceId(e.target.value)}
                        placeholder="Ej. 3C429381XXXXXX..."
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                        required
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Identificador de la instancia en el panel de Z-API.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Token de la Instancia {hasSavedToken && <span className="text-emerald-500 font-bold">(Guardado)</span>}
                      </label>
                      <div className="relative">
                        <input
                          type={showToken ? 'text' : 'password'}
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder={hasSavedToken ? '••••••••••••••••••••' : 'Pega el token aquí...'}
                          className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Se cifrará con AES-256-GCM antes de guardarse.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Client-Token de Seguridad (Opcional)
                      </label>
                      <div className="relative">
                        <input
                          type={showClientToken ? 'text' : 'password'}
                          value={clientToken}
                          onChange={(e) => setClientToken(e.target.value)}
                          placeholder={hasClientToken ? '••••••••••••••••••••' : 'Token de cuenta Z-API...'}
                          className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClientToken(!showClientToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showClientToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={antiBan}
                          onChange={(e) => setAntiBan(e.target.checked)}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span>🛡️ Blindaje Anti-Baneo activo (Recomendado)</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={savingCredentials}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-500 transition cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {savingCredentials ? 'Guardando...' : 'Guardar y Autoconfigurar Webhooks'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal / Visor de Conexión en Vivo (QR o Código de Teléfono) */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                Paso Final • Vinculación WhatsApp
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Conectar Dispositivo
              </h3>

              {/* Selector de Pestañas (Código QR vs Código de Teléfono) */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#090A0F] p-1 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs">
                <button
                  type="button"
                  onClick={() => setConnectTab('qr')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    connectTab === 'qr'
                      ? 'bg-white dark:bg-[#131722] text-slate-900 dark:text-white shadow-2xs border border-slate-200/80 dark:border-[#232A3B]'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Código QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConnectTab('phone')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    connectTab === 'phone'
                      ? 'bg-white dark:bg-[#131722] text-purple-600 dark:text-purple-400 shadow-2xs border border-slate-200/80 dark:border-[#232A3B]'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Código de Teléfono</span>
                </button>
              </div>
            </div>

            {/* Pestaña 1: Código QR */}
            {connectTab === 'qr' && (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Abre WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular un dispositivo
                </p>

                {/* Contenedor del Código QR */}
                <div className="relative mx-auto w-64 h-64 bg-slate-50 dark:bg-[#090A0F] border-2 border-dashed border-purple-500/40 rounded-2xl flex items-center justify-center p-3 overflow-hidden shadow-inner">
                  {loadingQr ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
                      <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
                      <span>Obteniendo QR seguro...</span>
                    </div>
                  ) : qrImage ? (
                    <img
                      src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
                      alt="Código QR de WhatsApp"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <div className="text-xs text-slate-400">No se pudo cargar el QR</div>
                  )}
                </div>

                {/* Contador de Expiración */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Esperando escaneo ({qrCountdown}s)
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshQr}
                    disabled={loadingQr}
                    className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingQr ? 'animate-spin' : ''}`} />
                    Refrescar
                  </button>
                </div>
              </div>
            )}

            {/* Pestaña 2: Código por Teléfono (Pairing Code) */}
            {connectTab === 'phone' && (
              <div className="space-y-4 pt-1 text-left">
                {!phoneCode ? (
                  <form onSubmit={handleGetPhoneCode} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Número de WhatsApp (con código de país)
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="Ej. 573001234567"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                          required
                          autoFocus
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        Ingresa el código del país seguido de tu número sin símbolos ni espacios.
                      </p>
                    </div>

                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-900 dark:text-purple-300 flex items-start gap-2">
                      <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed text-[11px]">
                        Recibirás un código de 8 caracteres para ingresarlo en tu WhatsApp móvil y vincularlo al instante sin necesidad de usar la cámara.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={loadingPhoneCode}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-500/20 transition cursor-pointer disabled:opacity-50"
                    >
                      {loadingPhoneCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Generando código seguro...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Generar Código de 8 Dígitos
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {/* Caja de Código Generado */}
                    <div className="bg-slate-50 dark:bg-[#090A0F] border-2 border-dashed border-purple-500/40 rounded-2xl p-4 text-center space-y-2 shadow-inner">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Tu Código de Vinculación
                      </span>
                      <div className="text-2xl font-mono font-black tracking-widest text-purple-600 dark:text-purple-400 select-all py-1">
                        {phoneCode}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyPhoneCode}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/30 transition cursor-pointer"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Código</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Guía interactiva paso a paso */}
                    <div className="bg-slate-50/70 dark:bg-[#0B0E14] border border-slate-200 dark:border-[#232A3B] rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-2">
                      <p className="font-bold text-[11px] text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-purple-500" />
                        Pasos en tu teléfono:
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 pl-0.5">
                        <li>Abre <strong>WhatsApp</strong> en tu teléfono móvil.</li>
                        <li>Ve a <strong>Ajustes / Configuración &rarr; Dispositivos vinculados</strong>.</li>
                        <li>Toca el botón <strong>Vincular un dispositivo</strong>.</li>
                        <li>En la parte inferior de la pantalla, pulsa <strong>&ldquo;Vincular con el número de teléfono&rdquo;</strong> (o responde a la notificación).</li>
                        <li>Escribe el código de 8 caracteres mostrado arriba.</li>
                      </ol>
                    </div>

                    {/* Detección en vivo */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Esperando confirmación en tu celular...
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhoneCode(null)}
                        className="text-purple-600 dark:text-purple-400 hover:underline text-[11px] font-semibold cursor-pointer"
                      >
                        Cambiar número
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botón de Cierre */}
            <button
              type="button"
              onClick={() => {
                setQrModalOpen(false);
                setPhoneCode(null);
              }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#1E2433] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#283045] transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

