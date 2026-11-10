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

  const overageTokens = Math.max(0, used - limit);
  const rawPct = limit > 0 ? Math.round((used / limit) * 100) : percentage;

  const supportWhatsappText = encodeURIComponent(
    `Hola, soy de la empresa "${orgName}". Alcanzamos el ${rawPct}% de nuestro cupo base de tokens en Synqo CRM y deseamos ampliar nuestra capacidad.`
  );

  return (
    <div
      className={`px-4 sm:px-6 py-2.5 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-all animate-in fade-in slide-in-from-top-1 ${
        isExceeded
          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-950 dark:text-amber-200'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            isExceeded
              ? 'bg-amber-200/70 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
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
              <span>
                🔔 Cupo base 100% ({rawPct}%) — Modo Excedente Activo (+{overageTokens.toLocaleString('es-CO')} tokens)
              </span>
            ) : (
              <span>⚡ ¡Tu negocio está en alta demanda! Has utilizado el {rawPct}% de tu cupo base</span>
            )}
          </p>
          <p className="text-[11px] opacity-90 truncate">
            {isExceeded ? (
              <span>
                Tu agente IA sigue atendiendo a tus clientes sin interrupciones. Consulta el consumo escribiendo #tokens por WhatsApp.
              </span>
            ) : (
              <span>
                Tu atención automatizada sigue activa normalmente. Al superar el 100% pasará automáticamente a Modo Excedente.
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold shadow-xs transition cursor-pointer text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{isExceeded ? 'Ampliar Cupo' : 'Ampliar Capacidad'}</span>
        </a>

        <Link
          href="/settings"
          className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60 border border-current/20 text-[11px] font-semibold transition"
        >
          Ver Consumo
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

