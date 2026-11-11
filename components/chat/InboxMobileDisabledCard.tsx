import React from 'react';
import Link from 'next/link';
import { Monitor, ArrowRight, LayoutDashboard, Settings } from 'lucide-react';

export function InboxMobileDisabledCard({ forceVisible = false }: { forceVisible?: boolean } = {}) {
  return (
    <div className={`${forceVisible ? 'flex' : 'flex md:hidden'} flex-col items-center justify-center min-h-[calc(100dvh-180px)] px-4 py-8 text-center animate-in fade-in duration-200`}>
      <div className="w-full max-w-sm bg-white dark:bg-[#131722] rounded-3xl border border-slate-200 dark:border-[#232A3B] p-6 shadow-xl space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#0052FF]/10 dark:bg-[#00D2FF]/10 text-[#0052FF] dark:text-[#00D2FF] border border-[#0052FF]/20 dark:border-[#00D2FF]/20 flex items-center justify-center mx-auto shadow-inner">
          <Monitor className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#232A3B]">
            Versión Móvil PWA
          </span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white pt-1">
            Inbox optimizado para Pantalla Grande
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            El Inbox de mensajería omnicanal está temporalmente configurado para utilizarse desde tu computador o tablet con pantalla extendida.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] text-left space-y-1 text-xs">
          <p className="font-semibold text-slate-800 dark:text-slate-200">En tu teléfono puedes usar:</p>
          <ul className="text-slate-500 dark:text-slate-400 space-y-1 text-[11px] list-disc list-inside">
            <li>Métricas de ventas y rendimiento en tiempo real</li>
            <li>Gestión y configuración completa de la empresa</li>
            <li>Embudos de ventas, agenda y citas</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Link
            href="/dashboard"
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-bold shadow-md transition cursor-pointer"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Ir al Dashboard Móvil</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/settings"
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-[#232A3B] transition cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Ver Configuración</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
