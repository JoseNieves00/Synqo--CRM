import React from 'react';
import Link from 'next/link';
import {
  Users,
  MessageSquare,
  CalendarCheck,
  TrendingUp,
  Bot,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Título de la vista */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Panel de Control Comercial
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitoreo en tiempo real de leads de WhatsApp, automatizaciones de IA y agendamiento comercial.
        </p>
      </div>

      {/* Tarjetas de Métricas Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Total de Leads</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">128</div>
          <span className="text-xs text-emerald-600 font-medium">+14% respecto al mes anterior</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Interacciones de IA Activa</span>
            <Bot className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">94%</div>
          <span className="text-xs text-gray-500">Respuestas en menos de 2 seg</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Citas Agendadas (Cal.com)</span>
            <CalendarCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">32</div>
          <span className="text-xs text-emerald-600 font-medium">Sincronizadas automáticamente</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Tasa de Conversión</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">25.0%</div>
          <span className="text-xs text-emerald-600 font-medium">Lead nuevo a cita agendada</span>
        </div>
      </div>

      {/* Accesos Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Bandeja de Entrada de WhatsApp</h3>
              <p className="text-xs text-gray-500">
                Atiende conversaciones en curso, supervisa a Synqo AI o interviene manualmente.
              </p>
            </div>
          </div>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            Ir a Bandeja de WhatsApp <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Tablero Kanban Comercial</h3>
              <p className="text-xs text-gray-500">
                Visualiza el progreso de leads desde 'nuevo' hasta 'ganado' con actualización automática.
              </p>
            </div>
          </div>
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Ver Tablero Pipeline <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

