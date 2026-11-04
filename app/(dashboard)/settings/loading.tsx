import React from 'react';

export default function SettingsLoading() {
  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in duration-150 transition-colors">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-6 w-60 bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
        <div className="h-3.5 w-96 bg-slate-100 dark:bg-[#131722]/60 rounded-lg animate-pulse" />
      </div>

      {/* Barra de Pestañas Segmentadas */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl w-fit">
        <div className="h-8 w-36 bg-white dark:bg-[#1A1F2C] rounded-xl animate-pulse shadow-2xs" />
        <div className="h-8 w-36 bg-slate-200/60 dark:bg-[#131722] rounded-xl animate-pulse" />
        <div className="h-8 w-44 bg-slate-200/60 dark:bg-[#131722] rounded-xl animate-pulse" />
        <div className="h-8 w-36 bg-slate-200/60 dark:bg-[#131722] rounded-xl animate-pulse" />
      </div>

      {/* Tarjeta Principal de Configuración */}
      <div className="space-y-5">
        {/* Presets de Nicho */}
        <div className="p-6 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-4 transition-colors">
          <div className="space-y-1">
            <div className="h-4 w-48 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            <div className="h-3 w-80 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="p-3 bg-slate-50 dark:bg-[#090A0F] rounded-xl border border-slate-200 dark:border-[#1E2433] space-y-2 animate-pulse"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-[#1A1F2C]" />
                <div className="h-3.5 w-28 bg-slate-200 dark:bg-[#1A1F2C] rounded" />
                <div className="h-2.5 w-full bg-slate-100 dark:bg-[#1A1F2C]/50 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Tarjeta de Meta WhatsApp Cloud API */}
        <div className="p-6 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-4 transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E2433] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20" />
              <div className="space-y-1">
                <div className="h-4 w-44 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
                <div className="h-2.5 w-60 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-6 w-24 bg-slate-100 dark:bg-[#1A1F2C] rounded-full animate-pulse" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="h-9 w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] rounded-xl animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="h-9 w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
