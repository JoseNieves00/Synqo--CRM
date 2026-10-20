import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Línea sutil de progreso superior */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-emerald-500/20 overflow-hidden z-50">
        <div className="h-full bg-emerald-500 w-1/3 animate-[shimmer_1.2s_infinite]" />
      </div>

      {/* Cabecera Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200/70 rounded-xl animate-pulse" />
          <div className="h-4 w-80 bg-slate-200/50 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-36 bg-slate-200/60 rounded-xl animate-pulse" />
      </div>

      {/* Tarjetas de Métricas Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
              <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
            </div>
            <div className="h-7 w-14 bg-slate-200/70 rounded-lg animate-pulse" />
            <div className="h-2 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Área de Contenido Principal Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="h-5 w-32 bg-slate-200/60 rounded animate-pulse" />
            <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="space-y-3 pt-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-14 w-full bg-slate-50/80 rounded-xl border border-gray-100/60 animate-pulse flex items-center px-4 justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200/60" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-28 bg-slate-200/70 rounded" />
                    <div className="h-2.5 w-20 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="h-6 w-16 bg-slate-200/50 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="h-5 w-28 bg-slate-200/60 rounded animate-pulse border-b border-gray-100 pb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 w-full bg-slate-50/80 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

