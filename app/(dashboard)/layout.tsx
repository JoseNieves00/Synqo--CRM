import React from 'react';
import Image from 'next/image';
import { getCurrentUserAndOrg, signOut } from '@/app/actions/auth';
import {
  ShieldCheck,
  Building2,
} from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { HandoffAlertNotifier } from '@/components/notifications/HandoffAlertNotifier';
import { UserPresenceHeartbeat } from '@/components/presence/UserPresenceHeartbeat';
import { SupportHeaderButton } from '@/components/support/SupportHeaderButton';
import { WhatsAppConnectionIndicator } from '@/components/dashboard/WhatsAppConnectionIndicator';
import { MobileHeaderControls } from '@/components/dashboard/MobileHeaderControls';
import { UsageQuotaBanner } from '@/components/dashboard/UsageQuotaBanner';
import { InboxSyncProvider } from '@/components/inbox/InboxSyncProvider';

const MustChangePasswordModal = nextDynamic(
  () => import('@/components/profile/MustChangePasswordModal').then((m) => m.MustChangePasswordModal),
  { ssr: false }
);

const SuspendedOrganizationModal = nextDynamic(
  () => import('@/components/billing/SuspendedOrganizationModal').then((m) => m.SuspendedOrganizationModal),
  { ssr: false }
);

const SupportModal = nextDynamic(
  () => import('@/components/support/SupportModal').then((m) => m.SupportModal),
  { ssr: false }
);

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

  // Cálculo de alerta de consumo de IA para la empresa cliente (umbrales configurables x% y Modo Excedente)
  const usedTokens = Number(current?.organization?.ai_tokens_used || 0);
  const limitTokens = Number(current?.organization?.ai_tokens_limit || 500000);
  const tokenPolicyRaw = (current?.organization?.appointment_settings as any)?.token_policy;
  const thresholds: number[] = Array.isArray(tokenPolicyRaw?.alertThresholds) && tokenPolicyRaw.alertThresholds.length > 0
    ? tokenPolicyRaw.alertThresholds
    : [80, 90, 100];
  const minWarnPct = thresholds.find((t) => t < 100) ?? 80;
  const usagePercentage = Math.min(100, Math.round((usedTokens / limitTokens) * 100));
  const rawUsagePct = Math.round((usedTokens / limitTokens) * 100);
  const isUsageWarning = rawUsagePct >= minWarnPct && usedTokens < limitTokens;
  const isUsageExceeded = usedTokens >= limitTokens;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-[#090A0F] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sidebar Responsivo: Oculto en móvil (usa bottom bar), colapsado en tablet (md), expandido en desktop (lg) */}
      <aside className="hidden md:flex md:w-20 lg:w-64 bg-white dark:bg-[#090A0F] text-slate-800 dark:text-slate-100 flex-col border-r border-slate-200 dark:border-[#1E2433] flex-shrink-0 h-full select-none transition-all">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#1E2433] flex items-center justify-center lg:justify-start gap-3">
          <Image
            src="/brand/isotipo-128w.png"
            alt="Synqo"
            width={32}
            height={32}
            className="w-8 h-8 object-contain shrink-0"
          />
          <div className="hidden lg:block">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-tight">synqo</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#0052FF]/10 text-[#0052FF] dark:bg-[#00D2FF]/10 dark:text-[#00D2FF] font-mono rounded border border-[#0052FF]/20 dark:border-[#00D2FF]/20 font-bold">.dev</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wider">CRM Comercial</span>
          </div>
        </div>

        {/* Menú de Navegación Principal Reactivo con Prefetching y Control de Módulos */}
        <SidebarNav
          isSuperAdmin={isSuperAdmin}
          isAdmin={isAdmin}
          enabledModules={current?.organization?.enabled_modules}
        />

        {/* Estado del Servicio & Suscripción */}
        <div className="hidden lg:block p-3 mx-3 mb-2 rounded-xl bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
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

      {/* Sincronizador de Datos en Tiempo Real (Sync Engine Único) */}
      <InboxSyncProvider organizationId={orgId} currentUserId={current?.user?.id} />

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
        {/* Header Superior Fijo Adaptativo PWA (con soporte para notch / Dynamic Island / Status Bar) */}
        <header className="bg-white dark:bg-[#090A0F] border-b border-slate-200 dark:border-[#1E2433] px-3 sm:px-6 pt-[env(safe-area-inset-top)] flex items-center justify-between flex-shrink-0 z-10 transition-colors">
          <div className="h-12 w-full flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
              <Image
                src="/brand/isotipo-128w.png"
                alt="Synqo"
                width={22}
                height={22}
                className="w-5.5 h-5.5 object-contain shrink-0 md:hidden"
              />
              <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 hidden md:block" />
              <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px] sm:max-w-xs">{orgName}</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <WhatsAppConnectionIndicator
                initialProvider={current?.organization?.whatsapp_provider || 'meta'}
                initialStatus={current?.organization?.evolution_status || 'disconnected'}
                initialPhone={current?.organization?.evolution_phone_connected || null}
                isAdmin={isAdmin}
              />
              <SupportHeaderButton />
              <MobileHeaderControls
                userFullName={userFullName}
                userEmail={userEmail}
                userRole={userRole}
                signOutAction={signOut}
              />
            </div>
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-20 md:pb-6 bg-slate-50 dark:bg-[#090A0F] transition-colors">
          {children}
        </main>

        {/* Tab Bar inferior exclusivo para móvil / PWA */}
        <MobileBottomNav isAdmin={isAdmin} enabledModules={current?.organization?.enabled_modules} />

        {/* Modal y Botón Flotante de Ayuda & Reporte de Fallas */}
        <SupportModal />
      </div>
    </div>
  );
}
