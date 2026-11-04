import React from 'react';

export default function CalendarLoading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-150 transition-colors">
      {/* Barra de Control de Agenda */}
      <div className="p-3 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-9 w-20 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
        </div>

        <div className="flex items-center gap-2">
          <div className="h-9 w-44 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-9 w-28 bg-[#0052FF]/20 dark:bg-[#0052FF]/30 border border-blue-200 dark:border-[#0052FF]/40 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Grilla / Agenda */}
      <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-4 shadow-xs transition-colors">
        <div className="grid grid-cols-7 gap-2 pb-3 border-b border-slate-100 dark:border-[#232A3B]">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-6 bg-slate-100 dark:bg-[#1A1F2C] rounded-lg animate-pulse" />
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2 min-h-[450px]">
          {[...Array(28)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-slate-50 dark:bg-[#090A0F]/60 rounded-xl border border-slate-200 dark:border-[#1E2433] p-1.5 space-y-1"
            >
              <div className="h-3 w-4 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              {i % 4 === 0 && (
                <div className="h-5 bg-blue-50 dark:bg-[#0052FF]/20 border border-blue-200 dark:border-[#0052FF]/30 rounded text-[9px] animate-pulse" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
