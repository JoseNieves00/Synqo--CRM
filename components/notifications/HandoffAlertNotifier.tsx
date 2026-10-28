'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, MessageSquare, X, UserCheck, AlertCircle } from 'lucide-react';
import { getUnattendedHandoffs } from '@/app/actions/chat';

interface HandoffAlertNotifierProps {
  organizationId: string;
  currentUserId?: string;
  isAdmin?: boolean;
}

interface AlertData {
  id: string;
  name: string;
  phone: string;
  timestamp: number;
  type?: 'handoff' | 'assignment';
}

interface UnattendedItem {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  waitingSince: string;
  assignedTo?: string | null;
}

/**
 * Formatea tiempo relativo en español (ej. "Hace 3 min")
 */
function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Hace un momento';
    if (diffMin === 1) return 'Hace 1 min';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return 'Hace 1 hora';
    return `Hace ${diffHours} h`;
  } catch {
    return 'Pendiente';
  }
}

/**
 * Genera un sonido de campana armónico y profesional mediante Web Audio API.
 */
function playChimeSound(isPriority = true) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tono 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(isPriority ? 587.33 : 440, ctx.currentTime);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Tono 2 más agudo
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(isPriority ? 880 : 659.25, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.65);
  } catch (err) {
    console.warn('[Audio Alert] No se pudo reproducir el sonido:', err);
  }
}

export function HandoffAlertNotifier({
  organizationId,
  currentUserId,
  isAdmin = false,
}: HandoffAlertNotifierProps) {
  const router = useRouter();
  const [activeAlerts, setActiveAlerts] = useState<AlertData[]>([]);
  const [unattendedList, setUnattendedList] = useState<UnattendedItem[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const originalTitleRef = useRef<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      originalTitleRef.current = document.title;
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setPermission(res);
    }
  };

  // Función para sincronizar la lista de relevos pendientes
  const syncUnattended = async () => {
    try {
      const list = await getUnattendedHandoffs();
      setUnattendedList(list);

      // Notificar globalmente para actualizar badge del Sidebar
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('synqo-unattended-count', { detail: { count: list.length } })
        );
      }
    } catch (err) {
      console.warn('[Anti-Visto] Error al sincronizar relevos:', err);
    }
  };

  // 1. Carga inicial y sondeo periódico de respaldo (cada 40s)
  useEffect(() => {
    if (!organizationId) return;

    syncUnattended();
    const interval = setInterval(syncUnattended, 40000);
    return () => clearInterval(interval);
  }, [organizationId]);

  // 2. Campanada insistente periódica (cada 2.5 min si hay chats sin responder)
  useEffect(() => {
    if (unattendedList.length === 0) return;

    const chimeInterval = setInterval(() => {
      playChimeSound(true);
    }, 150000); // 2.5 minutos

    return () => clearInterval(chimeInterval);
  }, [unattendedList.length]);

  // 3. Título parpadeante en pestaña de navegador cuando la pestaña está en segundo plano
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let titleInterval: NodeJS.Timeout | null = null;
    let isToggled = false;

    const handleVisibilityOrState = () => {
      if (unattendedList.length > 0 && document.hidden) {
        if (!titleInterval) {
          titleInterval = setInterval(() => {
            isToggled = !isToggled;
            document.title = isToggled
              ? `(${unattendedList.length}) 🚨 Relevo pendiente — Synqo CRM`
              : `💬 Cliente esperando respuesta — Synqo CRM`;
          }, 1500);
        }
      } else {
        if (titleInterval) {
          clearInterval(titleInterval);
          titleInterval = null;
        }
        if (originalTitleRef.current) {
          document.title = originalTitleRef.current;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrState);
    handleVisibilityOrState();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrState);
      if (titleInterval) clearInterval(titleInterval);
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
  }, [unattendedList.length]);

  // 4. Suscripción Supabase Realtime a contacts y messages
  useEffect(() => {
    if (!organizationId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`anti-visto-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;

          // Relevo humano activado
          if (oldRecord && oldRecord.is_ai_active === true && newRecord.is_ai_active === false) {
            const isMyLead = newRecord.assigned_to === currentUserId;
            if (isMyLead || isAdmin) {
              triggerAlert({
                id: newRecord.id,
                name: newRecord.name || 'Prospecto WhatsApp',
                phone: newRecord.phone || '',
                timestamp: Date.now(),
                type: 'handoff',
              });
            }
          }

          // Asignación de lead
          if (
            currentUserId &&
            oldRecord &&
            oldRecord.assigned_to !== currentUserId &&
            newRecord.assigned_to === currentUserId
          ) {
            triggerAlert({
              id: newRecord.id,
              name: newRecord.name || 'Prospecto WhatsApp',
              phone: newRecord.phone || '',
              timestamp: Date.now(),
              type: 'assignment',
            });
          }

          syncUnattended();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          syncUnattended();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, currentUserId, isAdmin]);

  const triggerAlert = (alert: AlertData) => {
    const isHandoff = alert.type === 'handoff';

    // 1. Sonido
    playChimeSound(isHandoff);

    // 2. Notificación push si está autorizada
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const title = isHandoff
          ? '🚨 Synqo CRM: Relevo Humano Solicitado'
          : '🔔 Synqo CRM: Nuevo Lead Asignado';
        const body = isHandoff
          ? `${alert.name} (${alert.phone}) necesita atención inmediata de un asesor humano.`
          : `Se te ha asignado el lead ${alert.name} (${alert.phone}).`;

        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('[Push Notification] Error mostrando notificación:', e);
      }
    }

    // 3. Agregar a la lista de banners flotantes en el CRM
    setActiveAlerts((prev) => [alert, ...prev.slice(0, 2)]);
  };

  const dismissAlert = (id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const latestUnattended = unattendedList[0];

  return (
    <>
      {/* Botón para solicitar permisos de notificación si están en 'default' */}
      {permission === 'default' && (
        <div className="fixed bottom-4 left-4 z-40 bg-slate-900/90 text-white text-[11px] px-3 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-2.5 backdrop-blur-sm animate-in fade-in duration-300">
          <Bell className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>¿Activar alertas sonoras y de escritorio para llamadas y asignaciones?</span>
          <button
            onClick={requestNotificationPermission}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition cursor-pointer"
          >
            Activar
          </button>
        </div>
      )}

      {/* 1. Alertas de Entrada Inmediata (Toast Transitorio) */}
      {activeAlerts.length > 0 && (
        <div className="fixed bottom-24 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full">
          {activeAlerts.map((alert) => {
            const isHandoff = alert.type === 'handoff';

            return (
              <div
                key={`${alert.id}-${alert.timestamp}`}
                className={`bg-[#090A0F] text-white p-4 rounded-2xl border-2 shadow-2xl flex items-start gap-3.5 animate-in slide-in-from-bottom-5 duration-200 ${
                  isHandoff ? 'border-[#0052FF]' : 'border-emerald-500'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isHandoff
                      ? 'bg-[#0052FF]/20 text-[#00D2FF]'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {isHandoff ? (
                    <BellRing className="w-5 h-5 animate-bounce" />
                  ) : (
                    <UserCheck className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isHandoff ? 'text-[#00D2FF]' : 'text-emerald-400'
                      }`}
                    >
                      {isHandoff ? '¡Relevo Humano Solicitado!' : '¡Nuevo Lead Asignado!'}
                    </span>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs font-semibold text-white truncate mt-0.5">
                    {alert.name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {alert.phone}
                  </p>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => {
                        dismissAlert(alert.id);
                        router.push(`/inbox/${alert.id}`);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-lg transition shadow-md cursor-pointer text-white ${
                        isHandoff
                          ? 'bg-[#0052FF] hover:bg-[#0047E0] shadow-[#0052FF]/20'
                          : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Atender en Inbox
                    </button>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-[#131722] rounded-lg transition cursor-pointer"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Banner Flotante Insistente Anti-Visto (Permanente mientras hayan clientes sin contestar) */}
      {unattendedList.length > 0 && latestUnattended && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 duration-300">
          {isMinimized ? (
            <button
              onClick={() => setIsMinimized(false)}
              className="px-3.5 py-2.5 rounded-2xl bg-[#090A0F] border-2 border-rose-500 shadow-2xl text-white text-xs font-bold flex items-center gap-2.5 hover:bg-[#131722] transition cursor-pointer"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <span>🚨 {unattendedList.length} {unattendedList.length === 1 ? 'Relevo Pendiente' : 'Relevos Pendientes'}</span>
              <span className="text-[10px] text-slate-400 font-semibold bg-[#1E2433] px-2 py-0.5 rounded-md">Abrir ↗</span>
            </button>
          ) : (
            <div className="bg-[#090A0F] text-white p-4 rounded-2xl border-2 border-rose-500 shadow-2xl max-w-sm w-full space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E2433]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-rose-400">
                    {unattendedList.length === 1 ? '¡1 Chat en Visto (Relevo IA)!' : `¡${unattendedList.length} Chats en Visto (Relevo IA)!`}
                  </span>
                </div>
                <button
                  onClick={() => setIsMinimized(true)}
                  title="Minimizar aviso"
                  className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-[#131722] hover:bg-[#1A2030] transition cursor-pointer font-bold"
                >
                  Minimizar
                </button>
              </div>

              {/* Tarjeta del cliente más reciente esperando */}
              <div className="bg-[#131722] p-3 rounded-xl border border-[#232A3B] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white truncate max-w-[190px]">
                    {latestUnattended.name}
                  </span>
                  <span className="text-[10px] text-rose-400 font-mono font-semibold">
                    {formatTimeAgo(latestUnattended.waitingSince)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  {latestUnattended.phone}
                </div>

                {latestUnattended.lastMessage && (
                  <p className="text-[11px] text-slate-200 italic line-clamp-2 mt-1 bg-[#090A0F]/80 p-2 rounded-lg border border-[#1E2433]">
                    "{latestUnattended.lastMessage}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => router.push(`/inbox/${latestUnattended.id}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#0052FF] hover:bg-[#0040CC] font-bold text-xs text-white rounded-xl shadow-lg shadow-[#0052FF]/25 transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>⚡ Atender en Inbox</span>
                </button>

                {unattendedList.length > 1 && (
                  <button
                    onClick={() => router.push('/inbox')}
                    className="px-3 py-2.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#131722] hover:bg-[#1A2030] rounded-xl transition cursor-pointer border border-[#232A3B]"
                  >
                    Ver ({unattendedList.length})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

