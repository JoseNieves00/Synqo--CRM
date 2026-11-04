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
  Server,
  Key,
} from 'lucide-react';
import {
  saveEvolutionCredentials,
  getEvolutionQrCode,
  getEvolutionPhoneCode,
  getEvolutionConnectionStatus,
  disconnectEvolutionSession,
  importRecentEvolutionChats,
} from '@/app/actions/evolution';

interface EvolutionQrCardProps {
  initialApiUrl?: string;
  initialInstanceName?: string;
  hasApiKey?: boolean;
  initialStatus?: 'connected' | 'disconnected' | 'connecting';
  initialPhone?: string;
  antiBanMode?: boolean;
  maxOutboundPerHour?: number;
  isSuperAdmin?: boolean;
}

export function EvolutionQrCard({
  initialApiUrl = '',
  initialInstanceName = '',
  hasApiKey = false,
  initialStatus = 'disconnected',
  initialPhone = '',
  antiBanMode = true,
  maxOutboundPerHour = 20,
  isSuperAdmin = false,
}: EvolutionQrCardProps) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [instanceName, setInstanceName] = useState(initialInstanceName);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const [hasSavedApiKey, setHasSavedApiKey] = useState(hasApiKey);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>(initialStatus);
  const [connectedPhone, setConnectedPhone] = useState(initialPhone);

  const [antiBan, setAntiBan] = useState(antiBanMode);
  const [maxOutbound, setMaxOutbound] = useState(maxOutboundPerHour);

  const [showConfigInputs, setShowConfigInputs] = useState(false);
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
        const res = await getEvolutionConnectionStatus();
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

  useEffect(() => {
    if (qrModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [qrModalOpen]);

  /**
   * Guarda o actualiza las credenciales de Evolution API
   */
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim()) {
      setFeedback({ type: 'error', message: 'El Nombre de la Instancia de Evolution API es obligatorio.' });
      return;
    }

    setSavingCredentials(true);
    setFeedback(null);

    try {
      const res = await saveEvolutionCredentials({
        apiUrl: apiUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        instanceName: instanceName.trim(),
        whatsappProvider: 'evolution',
        antiBanMode: antiBan,
        maxOutboundPerHour: maxOutbound,
      });

      if (apiKey.trim()) {
        setHasSavedApiKey(true);
        setApiKey('');
      }
      setShowConfigInputs(false);
      setFeedback({
        type: 'success',
        message: `${res.message} ${res.webhookFeedback || ''}`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error guardando credenciales de Evolution API',
      });
    } finally {
      setSavingCredentials(false);
    }
  };

  /**
   * Abre el modal y solicita el Código QR en vivo
   */
  const handleOpenQrModal = async () => {
    setConnectTab('qr');
    setQrModalOpen(true);
    setFeedback(null);
    setLoadingQr(true);
    setQrImage(null);
    setQrCountdown(20);

    try {
      const res = await getEvolutionQrCode();
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setConnectedPhone(res.phone);
        setQrModalOpen(false);
        setFeedback({
          type: 'success',
          message: 'Esta línea de WhatsApp ya se encuentra vinculada y activa.',
        });
      } else if (res.value) {
        setQrImage(res.value);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'No se pudo generar el código QR. Verifica la conectividad de tu VPS.',
      });
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
    }
  };

  /**
   * Refresca manualmente el QR Code
   */
  const handleRefreshQr = async () => {
    setLoadingQr(true);
    try {
      const res = await getEvolutionQrCode();
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setConnectedPhone(res.phone);
        setQrModalOpen(false);
        setFeedback({
          type: 'success',
          message: '¡WhatsApp vinculado con éxito!',
        });
      } else if (res.value) {
        setQrImage(res.value);
        setQrCountdown(20);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error refrescando QR.',
      });
    } finally {
      setLoadingQr(false);
    }
  };

  /**
   * Solicita el código de vinculación por teléfono (Pairing Code)
   */
  const handleRequestPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setFeedback({ type: 'error', message: 'Ingresa un número telefónico válido con indicativo de país.' });
      return;
    }

    setLoadingPhoneCode(true);
    setPhoneCode(null);
    setCopiedCode(false);
    setFeedback(null);

    try {
      const res = await getEvolutionPhoneCode(phoneNumber.trim());
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setConnectedPhone(res.phone);
        setQrModalOpen(false);
        setFeedback({
          type: 'success',
          message: 'Esta línea ya se encuentra vinculada a WhatsApp.',
        });
      } else if (res.code) {
        setPhoneCode(res.code);
        setFeedback({
          type: 'success',
          message: res.message || 'Código generado exitosamente.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'No se pudo obtener el código de vinculación telefónico.',
      });
    } finally {
      setLoadingPhoneCode(false);
    }
  };

  /**
   * Copia el pairing code al portapapeles (limpio de guiones para ingreso rápido en WhatsApp)
   */
  const handleCopyCode = () => {
    if (!phoneCode) return;
    const cleanToCopy = phoneCode.replace(/-/g, '').trim();
    navigator.clipboard.writeText(cleanToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  /**
   * Desconecta la sesión activa de WhatsApp
   */
  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de desconectar esta línea de WhatsApp? La IA y el CRM dejarán de recibir mensajes hasta que vuelvas a vincularla.')) {
      return;
    }

    setDisconnecting(true);
    setFeedback(null);

    try {
      await disconnectEvolutionSession();
      setStatus('disconnected');
      setConnectedPhone('');
      setFeedback({
        type: 'warning',
        message: 'Sesión de WhatsApp desconectada correctamente.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al desconectar la sesión.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  /**
   * Sincroniza los últimos chats de la línea al CRM
   */
  const handleImportRecentChats = async () => {
    setImportingChats(true);
    setFeedback(null);

    try {
      const res = await importRecentEvolutionChats();
      setFeedback({
        type: res.importedCount > 0 ? 'success' : 'warning',
        message: res.message,
      });
      router.refresh();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error importando chats recientes.',
      });
    } finally {
      setImportingChats(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xs space-y-6">
      {/* Encabezado y Estado de Conexión */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#232A3B] pb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
          }`}>
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Evolution API v2 (VPS Propio)
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Self-Hosted
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Conexión directa WhatsApp Web / Baileys en tu propio servidor sin tarifas por conversación de Meta.
            </p>
          </div>
        </div>

        {/* Badge de Estado */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Conectado</span>
              {connectedPhone && <span className="font-mono text-[11px] opacity-80">({connectedPhone})</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#1E2433] border border-slate-200 dark:border-[#2A3447] text-slate-600 dark:text-slate-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
              <span>Desconectado</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
              : feedback.type === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Acciones Rápidas de Conexión y Gestión de Sesión */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Botón Principal: Escanear QR o Vincular por Teléfono */}
        <button
          type="button"
          onClick={handleOpenQrModal}
          className={`flex items-center justify-center gap-2 p-3.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isConnected
              ? 'bg-slate-100 dark:bg-[#1E2433] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#252E40] border border-slate-200 dark:border-[#2A3447]'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>{isConnected ? 'Ver / Re-vincular QR' : 'Vincular WhatsApp (QR o Código)'}</span>
        </button>

        {/* Sincronización de Chats */}
        <button
          type="button"
          onClick={handleImportRecentChats}
          disabled={!isConnected || importingChats}
          title="Importa conversaciones recientes sin activar la IA de forma segura"
          className="flex items-center justify-center gap-2 p-3.5 rounded-xl border border-slate-200 dark:border-[#2A3447] bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className={`w-4 h-4 text-indigo-500 ${importingChats ? 'animate-bounce' : ''}`} />
          <span>{importingChats ? 'Sincronizando...' : 'Sincronizar Últimos 50 Chats'}</span>
        </button>

        {/* Desconectar Sesión o Configurar (Super Admin) */}
        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <Unlink className="w-4 h-4" />
            <span>{disconnecting ? 'Desconectando...' : 'Desconectar Sesión'}</span>
          </button>
        ) : isSuperAdmin ? (
          <button
            type="button"
            onClick={() => setShowConfigInputs(!showConfigInputs)}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl border border-slate-200 dark:border-[#2A3447] bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-slate-500" />
            <span>{showConfigInputs ? 'Ocultar Parámetros' : 'Configurar Instancia (Super Admin)'}</span>
          </button>
        ) : null}
      </div>

      {/* Formulario de Configuración de Instancia (Solo visible para Super Admin) */}
      {showConfigInputs && isSuperAdmin && (
        <form onSubmit={handleSaveCredentials} className="p-4 rounded-xl bg-slate-50 dark:bg-[#181D29] border border-slate-200 dark:border-[#232A3B] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-indigo-500" />
              <span>Parámetros de Evolution API en tu VPS</span>
            </h3>
            {initialInstanceName && (
              <button
                type="button"
                onClick={() => setShowConfigInputs(false)}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cerrar
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* URL Base del VPS */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                URL del Servidor Evolution API (VPS)
              </label>
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://evolution.tudominio.com o http://vps-ip:8080"
                className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3447] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                La URL pública donde desplegaste Evolution API. Si se deja en blanco, usará el valor configurado por defecto.
              </p>
            </div>

            {/* Nombre de la Instancia */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre de la Instancia <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="ej: synqo_empresa"
                required
                className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3447] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Identificador único de la sesión (solo letras minúsculas, números y guiones).
              </p>
            </div>

            {/* Global API Key */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Evolution API Key <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasSavedApiKey ? '•••••••••••••••••••••••••••••• (Guardada con AES-256)' : 'Pega la AUTHENTICATION_API_KEY de tu .env de Evolution'}
                  className="w-full px-3 py-2 pr-10 rounded-xl text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3447] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Se almacena encriptada de extremo a extremo con AES-256-GCM.
              </p>
            </div>
          </div>

          {/* Configuración de Seguridad y Anti-Ban */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#232A3B] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Modo Protección Anti-Ban
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Simula pausas de lectura orgánica humana y cadencia de digitación antes de cada envío.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={antiBan}
                  onChange={(e) => setAntiBan(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Límite de envíos en frío por hora: <strong className="text-indigo-600 dark:text-indigo-400">{maxOutbound} msgs/h</strong>
                </span>
                <span className="text-[10px] text-slate-400">Recomendado: 15 a 30</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={maxOutbound}
                onChange={(e) => setMaxOutbound(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingCredentials}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {savingCredentials ? 'Guardando...' : 'Guardar y Autoconfigurar Webhooks'}
            </button>
          </div>
        </form>
      )}

      {/* Modal / Dialogo de Conexión (QR Code y Pairing Code Telefónico) */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 dark:border-[#232A3B] flex items-center justify-between bg-slate-50/50 dark:bg-[#181D29]/50">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Vincular WhatsApp con Evolution API
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Pestañas de Método: Escanear QR vs Código Telefónico */}
            <div className="flex border-b border-slate-100 dark:border-[#232A3B] bg-slate-50 dark:bg-[#181D29]">
              <button
                type="button"
                onClick={() => setConnectTab('qr')}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  connectTab === 'qr'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131722]'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Escanear Código QR</span>
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('phone')}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  connectTab === 'phone'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131722]'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Código Numérico (Sin Cámara)</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {connectTab === 'qr' ? (
                /* Tab 1: Código QR */
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative w-64 h-64 bg-slate-100 dark:bg-[#181D29] rounded-2xl flex items-center justify-center border border-slate-200 dark:border-[#2A3447] overflow-hidden p-3">
                    {loadingQr ? (
                      <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                        <span>Generando código QR seguro...</span>
                      </div>
                    ) : qrImage ? (
                      <img
                        src={qrImage}
                        alt="Código QR WhatsApp"
                        className="w-full h-full object-contain rounded-xl"
                      />
                    ) : (
                      <div className="text-xs text-slate-400 p-4">
                        Presiona refrescar para solicitar el código QR.
                      </div>
                    )}
                  </div>

                  {/* Cuenta regresiva y botón de refresco */}
                  <div className="flex items-center justify-between w-full max-w-xs text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                      Refresca en: <strong>{qrCountdown}s</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleRefreshQr}
                      disabled={loadingQr}
                      className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingQr ? 'animate-spin' : ''}`} />
                      <span>Refrescar ahora</span>
                    </button>
                  </div>

                  {/* Instrucciones de escaneo */}
                  <div className="text-left w-full max-w-xs p-3 rounded-xl bg-slate-50 dark:bg-[#181D29] border border-slate-200 dark:border-[#232A3B] text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Cómo vincular desde tu celular:
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Abre WhatsApp en tu teléfono comercial.</li>
                      <li>Toca <strong>Dispositivos vinculados</strong>.</li>
                      <li>Toca <strong>Vincular un dispositivo</strong> y apunta al código.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                /* Tab 2: Vinculación Telefónica (Pairing Code) */
                <div className="space-y-4">
                  <form onSubmit={handleRequestPhoneCode} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Número telefónico de WhatsApp con código de país
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="ej: 573001234567"
                          required
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-[#181D29] border border-slate-200 dark:border-[#2A3447] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                          type="submit"
                          disabled={loadingPhoneCode}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          {loadingPhoneCode ? 'Generando...' : 'Obtener Código'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sin espacios ni signos + (ej: 573001234567). Si omites el 57 para celular colombiano, se antepondrá automáticamente.
                      </p>
                    </div>
                  </form>

                  {/* Renderizado del Pairing Code */}
                  {phoneCode && (
                    <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-center space-y-3 animate-in fade-in duration-200">
                      <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                        Código de Vinculación Generado:
                      </p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#131722] rounded-xl border border-indigo-500/30 shadow-xs">
                        <span className="text-2xl font-mono font-bold tracking-widest text-indigo-600 dark:text-indigo-400">
                          {phoneCode}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          title="Copiar código"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                        >
                          {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      {copiedCode && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          ¡Código copiado al portapapeles!
                        </p>
                      )}
                    </div>
                  )}

                  {/* Instrucciones Pairing Code */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181D29] border border-slate-200 dark:border-[#232A3B] text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Cómo vincular sin cámara:
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Abre WhatsApp en el <strong>teléfono celular principal</strong> donde está la cuenta.</li>
                      <li>Toca <strong>Dispositivos vinculados</strong> $\rightarrow$ <strong>Vincular un dispositivo</strong>.</li>
                      <li>Toca la opción inferior: <strong>"Vincular con el número de teléfono"</strong>.</li>
                      <li>Escribe o pega el código de 8 caracteres que ves arriba.</li>
                    </ol>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 pt-1 border-t border-slate-200/50 dark:border-slate-800/50 mt-1">
                      ⚠️ <strong>Nota:</strong> WhatsApp Web no puede autorizar ni vincular nuevos dispositivos. Debe ingresarse en la app WhatsApp del teléfono físico que posee la línea.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#181D29]/50 flex justify-between items-center text-xs">
              <span className="text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Esperando confirmación en WhatsApp...
              </span>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3447] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2433]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

