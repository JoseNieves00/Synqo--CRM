'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  QrCode,
  Loader2,
  X,
  Zap,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import {
  getEvolutionConnectionStatus,
  getEvolutionQrCode,
} from '@/app/actions/evolution';

interface WhatsAppConnectionIndicatorProps {
  initialProvider?: 'meta' | 'evolution';
  initialStatus?: 'connected' | 'disconnected' | 'connecting';
  initialPhone?: string | null;
  isAdmin?: boolean;
}

export function WhatsAppConnectionIndicator({
  initialProvider = 'meta',
  initialStatus = 'disconnected',
  initialPhone = null,
  isAdmin = false,
}: WhatsAppConnectionIndicatorProps) {
  const [provider, setProvider] = useState<'meta' | 'evolution'>(initialProvider);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>(initialStatus);
  const [phone, setPhone] = useState<string | null>(initialPhone);
  const [isChecking, setIsChecking] = useState(false);

  // Estados del Modal Rápido de Reconexión QR
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(25);
  const [qrError, setQrError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [mounted, setMounted] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sincronización inicial y Healthcheck cada 60s para mantener el socket activo
  useEffect(() => {
    if (provider !== 'evolution') return;

    let isMounted = true;
    const checkStatus = async () => {
      try {
        const res = await getEvolutionConnectionStatus();
        if (isMounted && res) {
          setStatus(res.connected ? 'connected' : 'disconnected');
          if (res.phone) setPhone(res.phone);
        }
      } catch {
        // Fallo silencioso en background
      }
    };

    // Consulta inicial en background
    checkStatus();

    // Healthcheck periódico cada 60s
    const healthcheckInterval = setInterval(checkStatus, 60000);
    return () => {
      isMounted = false;
      clearInterval(healthcheckInterval);
    };
  }, [provider]);

  // Manejador para abrir el Modal y cargar el QR
  const handleOpenQrModal = async () => {
    if (!isAdmin) return;
    setIsQrModalOpen(true);
    setLoadingQr(true);
    setQrError(null);
    setQrImage(null);
    setJustConnected(false);
    setQrCountdown(25);

    try {
      const res = await getEvolutionQrCode();
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setPhone(res.phone);
        setJustConnected(true);
        setTimeout(() => setIsQrModalOpen(false), 1500);
      } else if (res.value) {
        setQrImage(res.value);
      } else {
        setQrError('No se recibió la imagen del código QR. Verifica tu VPS.');
      }
    } catch (err: any) {
      setQrError(err?.message || 'Error al conectar con la instancia de WhatsApp.');
    } finally {
      setLoadingQr(false);
    }
  };

  // Cuenta regresiva del QR y refresco manual
  const handleRefreshQr = async () => {
    setLoadingQr(true);
    setQrError(null);
    try {
      const res = await getEvolutionQrCode();
      if (res.connected) {
        setStatus('connected');
        if (res.phone) setPhone(res.phone);
        setJustConnected(true);
        setTimeout(() => setIsQrModalOpen(false), 1500);
      } else if (res.value) {
        setQrImage(res.value);
        setQrCountdown(25);
      }
    } catch (err: any) {
      setQrError(err?.message || 'Error al refrescar el QR.');
    } finally {
      setLoadingQr(false);
    }
  };

  // Sondeo cada 3s mientras el modal de QR esté abierto para detectar vinculación
  useEffect(() => {
    if (!isQrModalOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    // Cronómetro de cuenta regresiva
    countdownIntervalRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          handleRefreshQr();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);

    // Sondeo de estado
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getEvolutionConnectionStatus();
        if (res?.connected) {
          setStatus('connected');
          if (res.phone) setPhone(res.phone);
          setJustConnected(true);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setTimeout(() => {
            setIsQrModalOpen(false);
            setJustConnected(false);
          }, 1500);
        }
      } catch {
        // Ignorar errores durante sondeo
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isQrModalOpen]);

  // Si el proveedor configurado es Meta Cloud API
  if (provider === 'meta') {
    return (
      <div
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-blue-200 dark:border-[#00D2FF]/20"
        title="Canal Meta WhatsApp Cloud API activo"
      >
        <span className="w-2 h-2 rounded-full bg-[#0052FF] dark:bg-[#00D2FF]" />
        <span>Meta Cloud API</span>
      </div>
    );
  }

  // Proveedor Evolution API (VPS Self-Hosted / Baileys)
  const isConnected = status === 'connected';

  return (
    <>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 transition-colors shadow-2xs"
            title={`Sesión de WhatsApp activa en VPS${phone ? ` (${phone})` : ''}. Sin restricción de 24h.`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold hidden md:inline">WhatsApp en Línea</span>
            <span className="font-semibold md:hidden">WA Conectado</span>
            {phone && (
              <span className="hidden lg:inline text-[10px] font-mono opacity-80 pl-1 border-l border-emerald-300 dark:border-emerald-500/30">
                {phone.startsWith('+') ? phone : `+${phone}`}
              </span>
            )}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 p-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 transition-colors animate-in fade-in">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="font-semibold hidden sm:inline">WhatsApp Desconectado</span>
            {isAdmin ? (
              <button
                type="button"
                onClick={handleOpenQrModal}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition cursor-pointer shadow-xs"
                title="Escanear código QR para reconectar sesión"
              >
                <QrCode className="w-3 h-3" />
                <span>Reconectar QR</span>
              </button>
            ) : (
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono hidden md:inline">
                Aviso a Admin
              </span>
            )}
          </div>
        )}
      </div>

      {/* Modal Flotante de Reconexión Rápida en 1 Clic */}
      {isQrModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E2433]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Reconectar WhatsApp
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Sesión Multi-Dispositivo (VPS)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido / QR Code */}
            <div className="py-4 flex flex-col items-center text-center">
              {justConnected ? (
                <div className="py-8 flex flex-col items-center gap-3 animate-in zoom-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h5 className="font-bold text-sm text-slate-900 dark:text-white">¡WhatsApp Vinculado con Éxito!</h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tu CRM está conectado y listo para recibir y enviar mensajes.
                  </p>
                </div>
              ) : loadingQr ? (
                <div className="w-56 h-56 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] flex flex-col items-center justify-center gap-2.5">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0052FF] dark:text-[#00D2FF]" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Generando código QR...</span>
                </div>
              ) : qrError ? (
                <div className="w-56 h-56 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-4 flex flex-col items-center justify-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                  <p className="text-[11px] leading-relaxed">{qrError}</p>
                  <button
                    type="button"
                    onClick={handleRefreshQr}
                    className="mt-2 px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-500 cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              ) : qrImage ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
                    <img
                      src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
                      alt="Código QR WhatsApp"
                      className="w-52 h-52 object-contain rounded-lg"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0052FF]" />
                    <span>Caduca en <strong className="font-mono text-slate-900 dark:text-white">{qrCountdown}s</strong></span>
                    <button
                      type="button"
                      onClick={handleRefreshQr}
                      className="text-[#0052FF] dark:text-[#00D2FF] font-semibold hover:underline ml-1 cursor-pointer"
                    >
                      Refrescar
                    </button>
                  </div>
                </div>
              ) : null}

              {!justConnected && (
                <div className="mt-4 text-left p-3 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white">¿Cómo escanear?</p>
                  <p>1. Abre WhatsApp en tu celular.</p>
                  <p>2. Toca <strong>Ajustes</strong> o los 3 puntos &rarr; <strong>Dispositivos vinculados</strong>.</p>
                  <p>3. Selecciona <strong>Vincular un dispositivo</strong> y apunta tu cámara a este código.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-between text-xs">
              <Link
                href="/settings"
                onClick={() => setIsQrModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] inline-flex items-center gap-1 font-medium"
              >
                <span>Ajustes avanzados</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

