'use client';

import React, { useState } from 'react';
import { Zap, AlertTriangle, ShieldAlert, X, MessageCircle } from 'lucide-react';
import Link from 'next/link';

interface UsageQuotaBannerProps {
  isWarning: boolean;
  isExceeded: boolean;
  percentage: number;
  used: number;
  limit: number;
  orgName: string;
}

export function UsageQuotaBanner({
  isWarning,
  isExceeded,
  percentage,
  used,
  limit,
  orgName,
}: UsageQuotaBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!isWarning && !isExceeded)) {
    return null;
  }

  const supportWhatsappText = encodeURIComponent(
    `Hola, soy de la empresa "${orgName}". Hemos alcanzado el ${percentage}% de nuestra capacidad de IA en Synqo CRM y deseamos solicitar un paquete de expansión de conversaciones.`
  );

  return (
    <div
      className={`px-4 sm:px-6 py-2.5 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-all animate-in fade-in slide-in-from-top-1 ${
        isExceeded
          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            isExceeded
              ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300'
              : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
          }`}
        >
          {isExceeded ? (
            <ShieldAlert className="w-4 h-4" />
          ) : (
            <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
          )}
        </div>

        <div className="min-w-0">
          <p className="font-bold tracking-tight">
            {isExceeded ? (
              <span>Capacidad mensual de IA completada ({percentage}%)</span>
            ) : (
              <span>⚡ ¡Tu negocio está en alta demanda! Has aprovechado el {percentage}% de tu IA</span>
            )}
          </p>
          <p className="text-[11px] opacity-90 truncate">
            {isExceeded ? (
              <span>
                La IA se ha pausado preventivamente. Tu equipo humano puede seguir respondiendo normalmente. Solicita una recarga para reactivar.
              </span>
            ) : (
              <span>
                Tu atención automatizada sigue activa normalmente. Solicita una ampliación para asegurar disponibilidad continua.
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <a
          href={`https://wa.me/?text=${supportWhatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold shadow-xs transition cursor-pointer text-[11px] ${
            isExceeded
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{isExceeded ? 'Reactivar IA Ahora' : 'Ampliar Capacidad'}</span>
        </a>

        <Link
          href="/settings"
          className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60 border border-current/20 text-[11px] font-semibold transition"
        >
          Ver Plan
        </Link>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
          title="Cerrar notificación"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

