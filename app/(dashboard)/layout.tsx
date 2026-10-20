import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Settings,
  Bot,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar de Navegación */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800">
        {/* Brand */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-lg">
            S
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white">Synqo CRM</h1>
            <span className="text-[11px] text-slate-400 block -mt-0.5">synqo.dev</span>
          </div>
        </div>

        {/* Menú Principal */}
        <nav className="flex-1 p-4 space-y-1.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <LayoutDashboard className="w-4 h-4 text-slate-400" />
            Dashboard
          </Link>

          <Link
            href="/inbox"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            Inbox WhatsApp
          </Link>

          <Link
            href="/pipeline"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <Kanban className="w-4 h-4 text-blue-400" />
            Pipeline Kanban
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Configuración & API
          </Link>
        </nav>

        {/* Estado del Servicio & Facturación */}
        <div className="p-4 m-4 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Plan Synqo</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
              Activo
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            OpenAI Tool Calling y Agendamiento Cal.com operativos.
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-Tenant RLS Activo</span>
          </div>
        </div>
      </aside>

      {/* Área de Contenido Principal */}
      <main className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-semibold text-gray-800">Organización Demo</span>
            <span>/</span>
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-200 flex items-center gap-1">
              <Bot className="w-3 h-3 text-emerald-600" /> WhatsApp Cloud Graph v20+
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="font-mono">Security-by-Design</span>
          </div>
        </header>

        <div className="p-8 flex-1">{children}</div>
      </main>
    </div>
  );
}

