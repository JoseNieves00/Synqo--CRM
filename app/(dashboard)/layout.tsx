import React from 'react';
import Image from 'next/image';
import { getCurrentUserAndOrg, signOut } from '@/app/actions/auth';
import {
  Bot,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import { MustChangePasswordModal } from '@/components/profile/MustChangePasswordModal';
import { HandoffAlertNotifier } from '@/components/notifications/HandoffAlertNotifier';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUserAndOrg();

  const orgName = current?.organization?.name || 'Mi Organización';
  const userEmail = current?.user?.email || '';
  const userFullName = current?.profile?.full_name || 'Usuario';
  const subStatus = current?.organization?.subscription_status || 'active';
  const planType = current?.organization?.plan_type || 'core';
  const orgId = current?.organization?.id;
  const userRole = current?.profile?.role || 'agent';
  const isSuperAdmin = Boolean(current?.profile?.is_super_admin);
  const isAdmin = userRole === 'admin' || isSuperAdmin;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Sidebar de Navegación Fija */}
      <aside className="w-64 bg-[#090A0F] text-slate-100 flex flex-col border-r border-[#1E2433] flex-shrink-0 h-full select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-[#1E2433] flex items-center gap-3">
          <Image
            src="/brand/isotipo-128w.png"
            alt="Synqo"
            width={34}
            height={34}
            className="w-9 h-9 object-contain"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-white leading-tight">synqo</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[#00D2FF]/10 text-[#00D2FF] font-mono rounded border border-[#00D2FF]/20 font-bold">.dev</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">CRM Comercial</span>
          </div>
        </div>

        {/* Menú de Navegación Principal Reactivo con Prefetching */}
        <SidebarNav isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} />

        {/* Estado del Servicio & Facturación */}
        <div className="p-3 mx-3 mb-2 rounded-xl bg-[#131722] border border-[#232A3B]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300 capitalize">Plan {planType}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                subStatus === 'active' || subStatus === 'trialing'
                  ? 'bg-[#0052FF]/20 text-[#00D2FF] border-[#00D2FF]/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {subStatus === 'trialing' ? 'Prueba (14d)' : subStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00D2FF] flex-shrink-0" />
            <span className="truncate">Seguridad Empresarial Activa</span>
          </div>
        </div>

        {/* Perfil del Usuario & Botón de Cerrar Sesión */}
        <SidebarUserCard
          userFullName={userFullName}
          userEmail={userEmail}
          userRole={userRole}
          signOutAction={signOut}
        />
      </aside>

      {/* Notificador de Relevo Humano (Campana Sonora + Notificación Push) */}
      {orgId && <HandoffAlertNotifier organizationId={orgId} />}

      {/* Modal Obligatorio de Cambio de Contraseña si ingresó con Clave Temporal */}
      <MustChangePasswordModal
        mustChange={Boolean(current?.mustChangePassword)}
        userEmail={userEmail}
      />

      {/* Área de Contenido Principal con Scroll Independiente */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Superior Fijo */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 sm:px-8 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-2.5 text-sm text-gray-500">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-xs">{orgName}</span>
            <span className="text-gray-300">/</span>
            <span className="text-[#0052FF] bg-[#0052FF]/10 px-2.5 py-0.5 rounded-full text-xs font-medium border border-[#0052FF]/20 flex items-center gap-1.5 font-mono">
              <Bot className="w-3.5 h-3.5 text-[#0052FF]" /> WhatsApp Cloud Activo
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-emerald-600 font-medium">
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md hidden sm:inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Línea Conectada
            </span>
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
