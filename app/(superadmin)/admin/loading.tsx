import React from 'react';
import { Building2, Users, ShieldCheck, MessageSquare, Zap, Search, Plus } from 'lucide-react';

export default function SuperAdminLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Barra de progreso superior ultra sutil */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-[#0052FF]/20 overflow-hidden z-50">
        <div className="h-full bg-[#00D2FF] w-1/3 animate-[shimmer_1.2s_infinite]" />
      </div>

      {/* Cabecera del Panel */}
      <div className="mb-8 space-y-2">
        <div className="h-8 w-80 bg-slate-200/80 rounded-xl animate-pulse" />
        <div className="h-4 w-96 bg-slate-200/60 rounded-lg animate-pulse" />
      </div>

      {/* Tarjetas de Métricas de Plataforma (5 Columnas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { icon: Building2, color: 'bg-blue-50 text-[#0052FF]' },
          { icon: Users, color: 'bg-indigo-50 text-indigo-500' },
          { icon: ShieldCheck, color: 'bg-[#0052FF]/10 text-[#0052FF]' },
          { icon: MessageSquare, color: 'bg-cyan-50 text-[#00D2FF]' },
          { icon: Zap, color: 'bg-[#0052FF]/10 text-[#0052FF]' },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={i}
              className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-20 bg-slate-200/60 rounded animate-pulse" />
                <div className={`p-2 rounded-xl ${item.color}`}>
                  <Icon className="w-4 h-4 opacity-50" />
                </div>
              </div>
              <div className="h-8 w-16 bg-slate-200/80 rounded-lg animate-pulse" />
              <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
          );
        })}
      </div>

      {/* Tabla de Empresas Skeleton */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Barra superior de la tabla */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="h-5 w-48 bg-slate-200/80 rounded-lg animate-pulse" />
            <div className="h-3.5 w-72 bg-slate-100 rounded animate-pulse" />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-9 w-60 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-9 w-40 bg-[#0052FF]/20 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* Tabla Skeleton */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-200 text-gray-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-5">Empresa</th>
                <th className="py-3 px-5">Administrador</th>
                <th className="py-3 px-5">Asientos</th>
                <th className="py-3 px-5">Plan</th>
                <th className="py-3 px-5">Tokens IA</th>
                <th className="py-3 px-5">Leads</th>
                <th className="py-3 px-5">Estado</th>
                <th className="py-3 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...Array(4)].map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-4 px-5">
                    <div className="h-4 w-32 bg-slate-200/80 rounded mb-1" />
                    <div className="h-2.5 w-20 bg-slate-100 rounded" />
                  </td>
                  <td className="py-4 px-5">
                    <div className="h-3.5 w-28 bg-slate-200/70 rounded mb-1" />
                    <div className="h-2.5 w-36 bg-slate-100 rounded" />
                  </td>
                  <td className="py-4 px-5 min-w-[140px]">
                    <div className="h-3 w-20 bg-slate-100 rounded mb-1.5" />
                    <div className="h-1.5 w-full bg-slate-100 rounded-full" />
                  </td>
                  <td className="py-4 px-5">
                    <div className="h-5 w-14 bg-slate-100 rounded-md" />
                  </td>
                  <td className="py-4 px-5 min-w-[130px]">
                    <div className="h-3 w-24 bg-slate-100 rounded mb-1.5" />
                    <div className="h-1.5 w-full bg-slate-100 rounded-full" />
                  </td>
                  <td className="py-4 px-5">
                    <div className="h-4 w-8 bg-slate-200/70 rounded" />
                  </td>
                  <td className="py-4 px-5">
                    <div className="h-5 w-16 bg-emerald-50 rounded-full" />
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="h-7 w-7 bg-slate-100 rounded-lg ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
