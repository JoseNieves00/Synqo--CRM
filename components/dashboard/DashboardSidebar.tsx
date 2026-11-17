'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { SidebarUserCard } from '@/components/dashboard/SidebarUserCard';
import type { EnabledModules } from '@/lib/supabase/types';

interface DashboardSidebarProps {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  enabledModules?: EnabledModules;
  subStatus: string;
  userFullName: string;
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
}

export function DashboardSidebar({
  isSuperAdmin,
  isAdmin,
  enabledModules,
  subStatus,
  userFullName,
  userEmail,
  userRole,
  signOutAction,
}: DashboardSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('synqo_sidebar_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('synqo_sidebar_collapsed', String(next));
    } catch {}
  };

  return (
    <aside
      className={`hidden md:flex ${
        isCollapsed ? 'md:w-20 lg:w-20' : 'md:w-20 lg:w-64'
      } bg-white dark:bg-[#090A0F] text-slate-800 dark:text-slate-100 flex-col border-r border-slate-200 dark:border-[#1E2433] flex-shrink-0 h-full select-none transition-all duration-300 ease-in-out`}
    >
      {/* Brand Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-[#1E2433] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center justify-center lg:justify-start gap-3 min-w-0">
          <Image
            src="/brand/isotipo-128w.png"
            alt="Synqo"
            width={32}
            height={32}
            className="w-8 h-8 object-contain shrink-0"
          />
          {!isCollapsed && (
            <div className="hidden lg:block truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-tight">
                  synqo
                </span>
                <span className="text-[10px] px-1.5 py-0.2 bg-[#0052FF]/10 text-[#0052FF] dark:bg-[#00D2FF]/10 dark:text-[#00D2FF] font-mono rounded border border-[#0052FF]/20 dark:border-[#00D2FF]/20 font-bold">
                  .dev
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wider block truncate">
                CRM Comercial
              </span>
            </div>
          )}
        </div>

        {/* Botón para colapsar / achicar sidebar en desktop */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expandir menú lateral' : 'Achicar menú lateral para ampliar área de trabajo'}
          className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#131722] transition cursor-pointer"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Menú de Navegación Principal */}
      <SidebarNav
        isSuperAdmin={isSuperAdmin}
        isAdmin={isAdmin}
        enabledModules={enabledModules}
        isCollapsed={isCollapsed}
      />

      {/* Estado del Servicio & Suscripción (Solo en expandido) */}
      {!isCollapsed && (
        <div className="hidden lg:block p-3 mx-3 mb-2 rounded-xl bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] transition-all">
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
      )}

      {/* Perfil del Usuario & Botón de Cerrar Sesión & Switcher de Tema */}
      <SidebarUserCard
        userFullName={userFullName}
        userEmail={userEmail}
        userRole={userRole}
        signOutAction={signOutAction}
        isCollapsed={isCollapsed}
      />
    </aside>
  );
}
