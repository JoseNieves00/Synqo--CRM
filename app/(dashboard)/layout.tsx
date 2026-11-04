import React from 'react';
import Image from 'next/image';
import { getCurrentUserAndOrg, signOut } from '@/app/actions/auth';
import {
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import { MustChangePasswordModal } from '@/components/profile/MustChangePasswordModal';
import { HandoffAlertNotifier } from '@/components/notifications/HandoffAlertNotifier';
import { UserPresenceHeartbeat } from '@/components/presence/UserPresenceHeartbeat';
import { SuspendedOrganizationModal } from '@/components/billing/SuspendedOrganizationModal';
import { SupportModal } from '@/components/support/SupportModal';
import { UsageQuotaBanner } from '@/components/dashboard/UsageQuotaBanner';

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
  const orgId = current?.organization?.id;
  const userRole = current?.profile?.role || 'agent';
  const isSuperAdmin = Boolean(current?.profile?.is_super_admin);
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const isSuspended =
    !isSuperAdmin &&
    (current?.organization?.is_active === false ||
      subStatus === 'past_due' ||
      subStatus === 'canceled');

  // Cálculo de alerta de consumo de IA para la empresa cliente (80% y 100%)
  const usedTokens = Number(current?.organization?.ai_tokens_used || 0);
  const limitTokens = Number(current?.organization?.ai_tokens_limit || 500000);
  const usagePercentage = Math.min(100, Math.round((usedTokens / limitTokens) * 100));
  const isUsageWarning = usagePercentage >= 80 && usagePercentage < 100;
  const isUsageExceeded = usagePercentage >= 100;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sidebar de Navegación Fija */}
      <aside className="w-64 bg-white dark:bg-[#090A0F] text-slate-800 dark:text-slate-100 flex flex-col border-r border-slate-200 dark:border-[#1E2433] flex-shrink-0 h-full select-none transition-colors">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#1E2433] flex items-center gap-3">
          <Image
            src="/brand/isotipo-128w.png"
            alt="Synqo"
            width={32}
            height={32}
            className="w-8 h-8 object-contain"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-tight">synqo</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#0052FF]/10 text-[#0052FF] dark:bg-[#00D2FF]/10 dark:text-[#00D2FF] font-mono rounded border border-[#0052FF]/20 dark:border-[#00D2FF]/20 font-bold">.dev</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wider">CRM Comercial</span>
          </div>
        </div>

        {/* Menú de Navegación Principal Reactivo con Prefetching */}
        <SidebarNav isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} />

        {/* Estado del Servicio & Suscripción */}
        <div className="p-3 mx-3 mb-2 rounded-xl bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Suscripción</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                subStatus === 'active' || subStatus === 'trialing'
                  ? 'bg-blue-50 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] border-blue-200 dark:border-[#00D2FF]/30'
                  : 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
              }`}
            >
              {subStatus === 'trialing' ? 'Prueba (14d)' : subStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] flex-shrink-0" />
            <span className="truncate">Seguridad Empresarial</span>
          </div>
        </div>

        {/* Perfil del Usuario & Botón de Cerrar Sesión & Switcher de Tema */}
        <SidebarUserCard
          userFullName={userFullName}
          userEmail={userEmail}
          userRole={userRole}
          signOutAction={signOut}
        />
      </aside>

      {/* Latido de Presencia y Detección Antifantasma */}
      <UserPresenceHeartbeat />

      {/* Notificador de Relevo Humano y Nuevas Asignaciones */}
      {orgId && (
        <HandoffAlertNotifier
          organizationId={orgId}
          currentUserId={current?.user?.id}
          isAdmin={isAdmin}
        />
      )}

      {/* Modal Obligatorio de Cambio de Contraseña si ingresó con Clave Temporal */}
      <MustChangePasswordModal
        mustChange={Boolean(current?.mustChangePassword)}
        userEmail={userEmail}
      />

      {/* Pantalla Bloqueante de Suspensión Preventiva por Mora (Garantiza Propiedad de Datos) */}
      {isSuspended && (
        <SuspendedOrganizationModal
          orgName={orgName}
          userFullName={userFullName}
          userEmail={userEmail}
          userRole={userRole}
          signOutAction={signOut}
          statusLabel={subStatus === 'canceled' ? 'Baja Definitiva (30d+)' : 'Suspensión Preventiva (Mora)'}
        />
      )}

      {/* Área de Contenido Principal con Scroll Independiente */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50 dark:bg-[#090A0F] transition-colors">
        {/* Header Superior Fijo Delgado (48px) y Unificado */}
        <header className="h-12 bg-white dark:bg-[#090A0F] border-b border-slate-200 dark:border-[#1E2433] px-5 sm:px-6 flex items-center justify-between flex-shrink-0 z-10 transition-colors">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">{orgName}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Espacio limpio para acciones globales o botón de ayuda */}
          </div>
        </header>

        {/* Banner Inteligente de Alerta de Consumo para la Empresa Cliente */}
        {!isSuperAdmin && (isUsageWarning || isUsageExceeded) && (
          <UsageQuotaBanner
            isWarning={isUsageWarning}
            isExceeded={isUsageExceeded}
            percentage={usagePercentage}
            used={usedTokens}
            limit={limitTokens}
            orgName={orgName}
          />
        )}

        {/* Panel de Contenido Principal */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-[#090A0F] transition-colors">
          {children}
        </main>

        {/* Modal y Botón Flotante de Ayuda & Reporte de Fallas */}
        <SupportModal />
      </div>
    </div>
  );
}
