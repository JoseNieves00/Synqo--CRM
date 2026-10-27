'use client';

import { useEffect, useRef } from 'react';
import { recordUserHeartbeat, setAvailabilityStatus } from '@/app/actions/presence';

const INACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutos sin actividad física
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // Latido cada 60 segundos

/**
 * Componente silencioso de monitoreo de presencia y detección antifantasma.
 * Envía señales de actividad al servidor si el usuario está físicamente presente y navegando.
 * Si el usuario se ausenta por más de 10 minutos, suspende el pulso para evitar que el
 * sistema le asigne nuevos clientes desatendidos.
 */
export function UserPresenceHeartbeat() {
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);

  useEffect(() => {
    // 1. Enviar latido inicial al cargar el CRM
    recordUserHeartbeat('available');

    // 2. Escuchar interacción física real del usuario
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        recordUserHeartbeat('available');
      }
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    let throttleTimeout: NodeJS.Timeout | null = null;

    const throttledHandler = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          handleUserActivity();
          throttleTimeout = null;
        }, 1000); // Throttling a 1 segundo para no saturar el event loop
      }
    };

    events.forEach((ev) => window.addEventListener(ev, throttledHandler, { passive: true }));

    // 3. Intervalo de latido periódico (Heartbeat)
    const interval = setInterval(() => {
      const now = Date.now();
      const inactiveDuration = now - lastActivityRef.current;
      const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';

      if (inactiveDuration >= INACTIVITY_THRESHOLD_MS || !isVisible) {
        // Usuario inactivo (Agente Fantasma o pestaña oculta prolongada)
        if (!isIdleRef.current) {
          isIdleRef.current = true;
          // Marcar como busy/offline para detener la auto-asignación hacia él
          recordUserHeartbeat('busy');
        }
      } else {
        // Usuario activo y presente
        if (isIdleRef.current) {
          isIdleRef.current = false;
        }
        recordUserHeartbeat('available');
      }
    }, HEARTBEAT_INTERVAL_MS);

    // 4. Pausar o reanudar al cambiar de pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        if (isIdleRef.current) {
          isIdleRef.current = false;
          recordUserHeartbeat('available');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, throttledHandler));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, []);

  return null;
}

