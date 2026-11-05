'use client';

import React from 'react';
import { LifeBuoy } from 'lucide-react';

/**
 * Botón de Acceso Limpio para el Header Superior
 * Siempre accesible desde cualquier pantalla sin bloquear la vista de chat ni formularios.
 */
export function SupportHeaderButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('synqo-open-support'))}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#131722] hover:bg-slate-200 dark:hover:bg-[#1A2030] border border-slate-200 dark:border-[#232A3B] transition cursor-pointer shadow-2xs"
      title="Centro de Ayuda & Soporte Técnico"
    >
      <LifeBuoy className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
      <span className="hidden sm:inline">¿Ayuda o Problemas?</span>
    </button>
  );
}
