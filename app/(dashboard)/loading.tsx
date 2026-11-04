import React from 'react';

export default function DashboardLoadingFallback() {
  return (
    <div className="space-y-6 animate-in fade-in duration-150 transition-colors">
      {/* Línea sutil de progreso superior */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-[#0052FF]/20 dark:bg-[#00D2FF]/20 overflow-hidden z-50">
        <div className="h-full bg-[#0052FF] dark:bg-[#00D2FF] w-1/3 animate-[shimmer_1.2s_infinite]" />
      </div>

      {/* Cabecera Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-3.5 w-72 bg-slate-100 dark:bg-[#131722]/60 rounded-lg animate-pulse" />
        </div>
        <div className="h-9 w-32 bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
      </div>

      {/* Grid Genérico Adaptativo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-3"
          >
            <div className="h-4 w-28 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            <div className="h-8 w-20 bg-slate-200 dark:bg-[#1A1F2C] rounded-lg animate-pulse" />
            <div className="h-2 w-full bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="p-6 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-4">
        <div className="h-5 w-40 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
        <div className="space-y-3 pt-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-12 w-full bg-slate-50 dark:bg-[#1A1F2C]/40 rounded-xl border border-slate-100 dark:border-[#232A3B]/60 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
