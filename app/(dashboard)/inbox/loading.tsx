import React from 'react';

export default function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-80px)] bg-white dark:bg-[#090A0F] rounded-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs animate-in fade-in duration-150 transition-colors">
      {/* Panel Izquierdo: Directorio de Conversaciones */}
      <div className="w-80 sm:w-96 border-r border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] flex flex-col shrink-0 transition-colors">
        {/* Cabecera Directorio */}
        <div className="p-3.5 border-b border-slate-100 dark:border-[#232A3B] space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
            <div className="h-5 w-14 bg-slate-100 dark:bg-[#1A1F2C] rounded-full animate-pulse" />
          </div>

          {/* Filtro Multicanal */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-[#090A0F] rounded-xl border border-slate-200 dark:border-[#1E2433]">
            <div className="h-6 bg-white dark:bg-[#1A1F2C] rounded-lg animate-pulse" />
            <div className="h-6 bg-white/60 dark:bg-[#1A1F2C]/50 rounded-lg animate-pulse" />
            <div className="h-6 bg-white/60 dark:bg-[#1A1F2C]/50 rounded-lg animate-pulse" />
          </div>

          {/* Buscador */}
          <div className="h-8 w-full bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#1E2433] rounded-xl animate-pulse" />
        </div>

        {/* Lista de Chats */}
        <div className="flex-1 divide-y divide-slate-100 dark:divide-[#1E2433] overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-[#1A1F2C] shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-28 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
                  <div className="h-2.5 w-10 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
                </div>
                <div className="h-2.5 w-40 bg-slate-100 dark:bg-[#1A1F2C]/50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel Derecho: Ventana de Conversación */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#090A0F] transition-colors">
        {/* Header de Chat */}
        <div className="h-14 px-5 border-b border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0E121B] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] animate-pulse" />
            <div className="space-y-1">
              <div className="h-3.5 w-32 bg-slate-200 dark:bg-[#1A1F2C] rounded animate-pulse" />
              <div className="h-2.5 w-20 bg-slate-100 dark:bg-[#1A1F2C]/60 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-24 bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-lg animate-pulse" />
            <div className="h-7 w-20 bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Mensajes Simulados */}
        <div className="flex-1 p-6 space-y-4 overflow-hidden flex flex-col justify-end">
          <div className="max-w-md p-3.5 rounded-2xl bg-white dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] self-start space-y-1.5 animate-pulse shadow-2xs">
            <div className="h-3 w-48 bg-slate-200 dark:bg-[#232A3B] rounded" />
            <div className="h-3 w-32 bg-slate-100 dark:bg-[#232A3B]/60 rounded" />
          </div>

          <div className="max-w-md p-3.5 rounded-2xl bg-[#0052FF]/10 dark:bg-[#0052FF]/20 border border-[#0052FF]/20 dark:border-[#0052FF]/30 self-end space-y-1.5 animate-pulse">
            <div className="h-3 w-56 bg-[#0052FF]/20 dark:bg-[#0052FF]/40 rounded" />
            <div className="h-3 w-40 bg-[#0052FF]/15 dark:bg-[#0052FF]/30 rounded" />
          </div>
        </div>

        {/* Input Composer Skeleton */}
        <div className="p-3 bg-white dark:bg-[#131722] border-t border-slate-200 dark:border-[#232A3B] flex items-center gap-2">
          <div className="h-9 flex-1 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl animate-pulse" />
          <div className="h-9 w-10 bg-[#0052FF]/30 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
