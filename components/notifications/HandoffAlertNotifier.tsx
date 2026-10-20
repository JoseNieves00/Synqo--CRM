'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, MessageSquare, X } from 'lucide-react';

interface HandoffAlertNotifierProps {
  organizationId: string;
}

interface AlertData {
  id: string;
  name: string;
  phone: string;
  timestamp: number;
}

/**
 * Genera un sonido de campana armónico y profesional mediante Web Audio API.
 * No requiere descargar archivos de audio externos y funciona de inmediato en el navegador.
 */
function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tono 1 (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Tono 2 más agudo y brillante (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
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

export function HandoffAlertNotifier({ organizationId }: HandoffAlertNotifierProps) {
  const router = useRouter();
  const [activeAlerts, setActiveAlerts] = useState<AlertData[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setPermission(res);
    }
  };

  useEffect(() => {
    if (!organizationId) return;

    const supabase = createClient();

    // Canal Realtime para monitorear relevo humano en los contactos de la organización
    const channel = supabase
      .channel(`handoff-alerts-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;

          // Detección: is_ai_active cambió de true a false (o se desactivó la IA solicitando asesor humano)
          if (oldRecord && oldRecord.is_ai_active === true && newRecord.is_ai_active === false) {
            triggerAlert({
              id: newRecord.id,
              name: newRecord.name || 'Prospecto WhatsApp',
              phone: newRecord.phone || '',
              timestamp: Date.now(),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const triggerAlert = (alert: AlertData) => {
    // 1. Reproducir sonido de campana
    playChimeSound();

    // 2. Disparar notificación push del navegador si está autorizada
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🚨 Synqo CRM: Atención Requerida', {
          body: `${alert.name} (${alert.phone}) necesita atención inmediata de un asesor humano.`,
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

  return (
    <>
      {/* Botón discreto para solicitar permisos de notificación si están en 'default' */}
      {permission === 'default' && (
        <div className="fixed bottom-4 left-4 z-40 bg-slate-900/90 text-white text-[11px] px-3 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-2.5 backdrop-blur-sm animate-in fade-in duration-300">
          <Bell className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>¿Activar alertas sonoras y de escritorio para llamadas de leads?</span>
          <button
            onClick={requestNotificationPermission}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition"
          >
            Activar
          </button>
        </div>
      )}

      {/* Notificaciones Flotantes de Relevo Humano */}
      {activeAlerts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full">
          {activeAlerts.map((alert) => (
            <div
              key={`${alert.id}-${alert.timestamp}`}
              className="bg-slate-900 text-white p-4 rounded-2xl border-2 border-emerald-500/80 shadow-2xl flex items-start gap-3.5 animate-in slide-in-from-bottom-5 duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    ¡Relevo Humano Solicitado!
                  </span>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-slate-400 hover:text-white p-0.5 rounded transition"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-sm"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Atender en Inbox
                  </button>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

