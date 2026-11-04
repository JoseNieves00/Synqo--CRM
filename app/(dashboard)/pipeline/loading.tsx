import React from 'react';

export default function PipelineLoading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-150 transition-colors">
      {/* Barra de Herramientas Superior */}
      <div className="p-3 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 transition-colors">
        {/* Buscador */}
        <div className="h-9 w-full md:w-80 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />

        {/* Filtro IA Segmentado */}
        <div className="h-9 w-64 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />

        {/* Botones de Acción */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-9 w-24 bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-9 w-28 bg-[#0052FF]/20 dark:bg-[#0052FF]/30 border border-blue-200 dark:border-[#0052FF]/40 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Columnas Kanban (5 columnas) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-start">
        {[...Array(5)].map((_, colIdx) => (
          <div
            key={colIdx}
            className="bg-slate-100/70 dark:bg-[#0E121B] rounded-2xl border border-slate-200 dark:border-[#1E2433] p-3 space-y-3 transition-colors"
          >
            {/* Header de Columna */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#1E2433]">
              <div className="h-4 w-24 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="h-4 w-6 bg-slate-200 dark:bg-[#1A1F2C] rounded-full animate-pulse" />
            </div>

            {/* Tarjetas de Lead en Columna */}
            <div className="space-y-2.5">
              {[...Array(colIdx === 0 ? 3 : 2)].map((_, cardIdx) => (
                <div
                  key={cardIdx}
                  className="p-3.5 bg-white dark:bg-[#131722] rounded-xl border border-slate-200 dark:border-[#232A3B] shadow-xs space-y-2.5 animate-pulse"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="h-3.5 w-28 bg-slate-200 dark:bg-[#1A1F2C] rounded" />
                      <div className="h-2.5 w-20 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded" />
                    </div>
                    <div className="h-4 w-12 bg-slate-100 dark:bg-[#1A1F2C] rounded" />
                  </div>
                  <div className="h-4 w-24 bg-blue-50 dark:bg-[#00D2FF]/10 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
