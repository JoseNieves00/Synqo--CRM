import React from 'react';
import Link from 'next/link';
import { getCurrentUserAndOrg, signOut } from '@/app/actions/auth';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Settings,
  Bot,
  ShieldCheck,
  LogOut,
  Building2,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUserAndOrg();

  const orgName = current?.organization?.name || 'Empresa Synqo Demo';
  const userEmail = current?.user?.email || 'admin@synqo.dev';
  const userFullName = current?.profile?.full_name || 'Administrador Demo';
  const subStatus = current?.organization?.subscription_status || 'active';
  const planType = current?.organization?.plan_type || 'core';
  const orgId = current?.organization?.id;
  const userRole = current?.profile?.role || 'agent';
  const isSuperAdmin = Boolean(current?.profile?.is_super_admin);
  const isAdmin = userRole === 'admin' || isSuperAdmin;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Sidebar de Navegación Fija */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 flex-shrink-0 h-full select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-emerald-500/20">
            S
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white leading-tight">Synqo CRM</h1>
            <span className="text-[11px] text-emerald-400 font-mono tracking-wider">synqo.dev</span>
          </div>
        </div>

        {/* Menú de Navegación Principal */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {isSuperAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition mb-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Consola Super Admin
            </Link>
          )}

          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
          >
            <LayoutDashboard className="w-4 h-4 text-slate-400" />
            Dashboard
          </Link>

          <Link
            href="/inbox"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            Inbox WhatsApp
          </Link>

          <Link
            href="/pipeline"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
          >
            <Kanban className="w-4 h-4 text-blue-400" />
            Pipeline Kanban
          </Link>

          {isAdmin && (
            <Link
              href="/settings"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Configuración & Equipo
            </Link>
          )}
        </nav>

        {/* Estado del Servicio & Facturación */}
        <div className="p-3 mx-3 mb-2 rounded-xl bg-slate-800/70 border border-slate-700/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300 capitalize">Plan {planType}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                subStatus === 'active' || subStatus === 'trialing'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {subStatus === 'trialing' ? 'Prueba (14d)' : subStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">RLS Multi-Tenant Activo</span>
          </div>
        </div>

        {/* Perfil del Usuario & Botón de Cerrar Sesión */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="overflow-hidden mr-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-white truncate">{userFullName}</p>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700">
                {userRole}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate">{userEmail}</p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Área de Contenido Principal con Scroll Independiente */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Superior Fijo */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 sm:px-8 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-2.5 text-sm text-gray-500">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-xs">{orgName}</span>
            <span className="text-gray-300">/</span>
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-200 flex items-center gap-1">
              <Bot className="w-3 h-3 text-emerald-600" /> WhatsApp v20+
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
            {orgId && (
              <span className="bg-gray-100 px-2.5 py-1 rounded-md text-gray-600 hidden sm:inline-block">
                Org: {orgId.slice(0, 8)}...
              </span>
            )}
          </div>
        </header>

        {/* Panel de Contenido */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
