import React from 'react';

export default function DashboardPageLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-150 transition-colors">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-6 w-52 bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-3.5 w-80 bg-slate-100 dark:bg-[#131722]/60 rounded-lg animate-pulse" />
        </div>
        <div className="h-9 w-40 bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
      </div>

      {/* 6 Tarjetas de Métricas Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-2.5 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="w-3.5 h-3.5 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            </div>
            <div className="h-7 w-12 bg-slate-200 dark:bg-[#1A1F2C] rounded-lg animate-pulse" />
            <div className="h-2.5 w-24 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Tabla de Leads Recientes y Bloque Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-[#232A3B] flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-28 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="h-3 w-44 bg-slate-100 dark:bg-[#1A1F2C]/50 rounded animate-pulse" />
            </div>
            <div className="h-3 w-28 bg-slate-100 dark:bg-[#1A1F2C] rounded animate-pulse" />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-[#1E2433]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
                    <div className="h-2.5 w-24 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 bg-slate-100 dark:bg-[#1A1F2C] rounded-full animate-pulse" />
                  <div className="h-5 w-20 bg-slate-100 dark:bg-[#1A1F2C] rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Acceso Lateral */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs transition-colors">
            <div className="h-4 w-36 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            <div className="h-3 w-full bg-slate-100 dark:bg-[#1A1F2C]/50 rounded animate-pulse" />
            <div className="h-8 w-44 bg-slate-100 dark:bg-[#1A1F2C] rounded-xl animate-pulse mt-2" />
          </div>

          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs transition-colors">
            <div className="h-4 w-36 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            <div className="h-3 w-full bg-slate-100 dark:bg-[#1A1F2C]/50 rounded animate-pulse" />
            <div className="h-8 w-40 bg-slate-100 dark:bg-[#1A1F2C] rounded-xl animate-pulse mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
