'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
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

let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Genera un sonido de campana armónico y profesional mediante Web Audio API.
 * Garantiza reproducción incluso si la pestaña está en segundo plano.
 */
function playChimeSound(isPriority = true) {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    // Tono 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(isPriority ? 587.33 : 440, t);
    gain1.gain.setValueAtTime(0.35, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.35);

    // Tono 2 más agudo
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(isPriority ? 880 : 659.25, t + 0.15);
    gain2.gain.setValueAtTime(0.45, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.15);
    osc2.stop(t + 0.7);
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
  const pathname = usePathname();
  const isInsideInbox = Boolean(pathname?.startsWith('/inbox'));
  const [activeAlerts, setActiveAlerts] = useState<AlertData[]>([]);
  const [unattendedList, setUnattendedList] = useState<UnattendedItem[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const originalTitleRef = useRef<string>('');
  const knownAiStatesRef = useRef<Map<string, boolean>>(new Map());
  const knownAssignmentsRef = useRef<Map<string, string | null>>(new Map());

  // Desbloqueo proactivo del Web Audio API en el primer gesto del usuario
  useEffect(() => {
    if (typeof window !== 'undefined') {
      originalTitleRef.current = document.title;
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }

      const unlockAudio = () => {
        getSharedAudioContext();
      };
      window.addEventListener('click', unlockAudio, { once: true });
      window.addEventListener('keydown', unlockAudio, { once: true });
      window.addEventListener('pointerdown', unlockAudio, { once: true });

      return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('pointerdown', unlockAudio);
      };
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        getSharedAudioContext();
      }
    }
  };

  // Función para sincronizar la lista de relevos pendientes
  const syncUnattended = async () => {
    try {
      const list = await getUnattendedHandoffs();
      setUnattendedList(list);

      // Actualizar mapa de estados conocidos
      list.forEach((item) => {
        knownAiStatesRef.current.set(item.id, false);
        if (item.assignedTo !== undefined) {
          knownAssignmentsRef.current.set(item.id, item.assignedTo);
        }
      });

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

  // Sincronización inmediata al volver a enfocar la pestaña del navegador
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocus = () => {
      syncUnattended();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // 1. Carga inicial y sondeo periódico de respaldo (cada 30s)
  useEffect(() => {
    if (!organizationId) return;

    syncUnattended();
    const interval = setInterval(syncUnattended, 30000);
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
        if (!document.hidden) {
          syncUnattended();
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

          if (!newRecord) return;

          // Relevo humano activado (detección tolerante a REPLICA IDENTITY)
          const prevAi = oldRecord?.is_ai_active !== undefined
            ? oldRecord.is_ai_active
            : knownAiStatesRef.current.get(newRecord.id);

          const isHandoffTransition = prevAi !== false && newRecord.is_ai_active === false;
          knownAiStatesRef.current.set(newRecord.id, newRecord.is_ai_active);

          if (isHandoffTransition) {
            const isMyLead = newRecord.assigned_to === currentUserId;
            if (isMyLead || isAdmin || !newRecord.assigned_to) {
              triggerAlert({
                id: newRecord.id,
                name: newRecord.name || 'Prospecto WhatsApp',
                phone: newRecord.phone || '',
                timestamp: Date.now(),
                type: 'handoff',
              });
            }
          }

          // Asignación de lead al agente actual
          const prevAssigned = oldRecord?.assigned_to !== undefined
            ? oldRecord.assigned_to
            : knownAssignmentsRef.current.get(newRecord.id);

          knownAssignmentsRef.current.set(newRecord.id, newRecord.assigned_to);

          if (
            currentUserId &&
            prevAssigned !== currentUserId &&
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
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg && newMsg.sender_type === 'system') {
            const isHandoffNotice =
              typeof newMsg.content === 'string' &&
              (newMsg.content.includes('Relevo Silencioso') ||
               newMsg.content.includes('Relevo Solicitado') ||
               newMsg.content.includes('Asesor humano'));

            if (isHandoffNotice && newMsg.contact_id) {
              triggerAlert({
                id: newMsg.contact_id,
                name: 'Relevo Requerido',
                phone: '',
                timestamp: Date.now(),
                type: 'handoff',
              });
            }
          }
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

    // 1. Sonido armónico de notificación (garantizado aun en segundo plano)
    playChimeSound(isHandoff);

    // 2. Notificación push de escritorio con persistencia y acción directa de 1 clic
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const title = isHandoff
          ? '🚨 Synqo CRM: Relevo Humano Solicitado'
          : '🔔 Synqo CRM: Nuevo Lead Asignado';
        const body = isHandoff
          ? `${alert.name} ${alert.phone ? `(${alert.phone})` : ''} necesita atención inmediata de un asesor humano.`
          : `Se te ha asignado el lead ${alert.name} ${alert.phone ? `(${alert.phone})` : ''}.`;

        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: `handoff-${alert.id}`,
          requireInteraction: true,
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/inbox')) {
            window.history.pushState({ contactId: alert.id }, '', `/inbox/${alert.id}`);
            window.dispatchEvent(new CustomEvent('synqo-select-contact', { detail: alert.id }));
          } else {
            router.push(`/inbox/${alert.id}`);
          }
        };
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
        <div className="fixed bottom-4 left-4 md:left-[276px] z-40 bg-slate-900/90 text-white text-[11px] px-3 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-2.5 backdrop-blur-sm animate-in fade-in duration-300">
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

      {/* 1. Alertas de Entrada Inmediata (Toast Transitorio en Lado Izquierdo) */}
      {activeAlerts.filter((a) => pathname !== `/inbox/${a.id}`).length > 0 && (
        <div className="fixed bottom-24 left-5 md:left-[276px] z-50 flex flex-col gap-2.5 max-w-sm w-full">
          {activeAlerts.filter((a) => pathname !== `/inbox/${a.id}`).map((alert) => {
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
                        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/inbox')) {
                          window.history.pushState({ contactId: alert.id }, '', `/inbox/${alert.id}`);
                          window.dispatchEvent(new CustomEvent('synqo-select-contact', { detail: alert.id }));
                        } else {
                          router.push(`/inbox/${alert.id}`);
                        }
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

      {/* 2. Banner Flotante de Atención (Ubicado a la izquierda, junto al Sidebar, fuera del Inbox) */}
      {!isInsideInbox && !isDismissed && unattendedList.length > 0 && latestUnattended && (
        <div className="fixed bottom-5 left-5 md:left-[276px] z-50 animate-in slide-in-from-bottom-5 duration-300">
          {isMinimized ? (
            <div className="flex items-center gap-1.5 p-1 pl-3 pr-1.5 rounded-full bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] shadow-lg text-slate-800 dark:text-slate-100 text-xs font-medium">
              <button
                onClick={() => setIsMinimized(false)}
                className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {unattendedList.length} {unattendedList.length === 1 ? 'chat pendiente' : 'chats pendientes'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-[#1A1F2C] px-1.5 py-0.5 rounded-md border border-slate-200/60 dark:border-[#232A3B]">
                  Abrir ↗
                </span>
              </button>
              <button
                onClick={() => setIsDismissed(true)}
                title="Descartar aviso"
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#131722] text-slate-900 dark:text-white p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl max-w-sm w-full space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#1E2433]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {unattendedList.length === 1 ? '1 conversación pendiente' : `${unattendedList.length} conversaciones pendientes`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsMinimized(true)}
                    title="Minimizar"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#1A2030] transition cursor-pointer"
                  >
                    Minimizar
                  </button>
                  <button
                    onClick={() => setIsDismissed(true)}
                    title="Cerrar aviso"
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-[#1A2030] transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tarjeta del cliente más reciente esperando */}
              <div className="bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white truncate max-w-[190px]">
                    {latestUnattended.name}
                  </span>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono font-semibold">
                    {formatTimeAgo(latestUnattended.waitingSince)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {latestUnattended.phone}
                </div>

                {latestUnattended.lastMessage && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 italic line-clamp-2 mt-1 bg-white dark:bg-[#131722] p-2 rounded-lg border border-slate-200 dark:border-[#1E2433]">
                    "{latestUnattended.lastMessage}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/inbox')) {
                      window.history.pushState({ contactId: latestUnattended.id }, '', `/inbox/${latestUnattended.id}`);
                      window.dispatchEvent(new CustomEvent('synqo-select-contact', { detail: latestUnattended.id }));
                    } else {
                      router.push(`/inbox/${latestUnattended.id}`);
                    }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#0052FF] hover:bg-[#0047E0] font-semibold text-xs text-white rounded-xl shadow-xs transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Atender en Inbox</span>
                </button>

                {unattendedList.length > 1 && (
                  <button
                    onClick={() => router.push('/inbox')}
                    className="px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1A2030] rounded-xl transition cursor-pointer border border-slate-200 dark:border-[#232A3B]"
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

