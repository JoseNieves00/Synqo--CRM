'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Calendar,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { getUnattendedHandoffs } from '@/app/actions/chat';
import type { EnabledModules } from '@/lib/supabase/types';

interface SidebarNavProps {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  enabledModules?: EnabledModules;
}

export function SidebarNav({ isSuperAdmin, isAdmin, enabledModules }: SidebarNavProps) {
  const pathname = usePathname();
  const [unattendedCount, setUnattendedCount] = useState<number>(0);

  useEffect(() => {
    // 1. Carga inicial del contador
    getUnattendedHandoffs()
      .then((list) => setUnattendedCount(list.length))
      .catch((e) => console.warn('[SidebarNav] Error cargando relevos pendientes:', e));

    // 2. Escucha de eventos de actualización emitidos por HandoffAlertNotifier
    const handleCountUpdate = (e: any) => {
      if (typeof e?.detail?.count === 'number') {
        setUnattendedCount(e.detail.count);
      }
    };

    window.addEventListener('synqo-unattended-count', handleCountUpdate);
    return () => {
      window.removeEventListener('synqo-unattended-count', handleCountUpdate);
    };
  }, []);

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      activeColor:
        'text-slate-900 dark:text-white bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold shadow-xs',
      iconColor: 'text-slate-900 dark:text-white',
      matchExact: true,
    },
    {
      href: '/inbox',
      label: 'Inbox',
      icon: MessageSquare,
      activeColor:
        'text-slate-900 dark:text-white bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold shadow-xs',
      iconColor: 'text-[#0052FF] dark:text-[#00D2FF]',
      matchExact: false,
    },
    {
      href: '/pipeline',
      label: 'Pipeline Kanban',
      icon: Kanban,
      activeColor:
        'text-slate-900 dark:text-white bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold shadow-xs',
      iconColor: 'text-[#0052FF]',
      matchExact: true,
    },
    ...(enabledModules?.native_calendar !== false
      ? [
          {
            href: '/calendar',
            label: 'Agenda & Citas',
            icon: Calendar,
            activeColor:
              'text-slate-900 dark:text-white bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold shadow-xs',
            iconColor: 'text-[#0052FF] dark:text-[#00D2FF]',
            matchExact: false,
          },
        ]
      : []),
  ];

  if (isAdmin) {
    navItems.push({
      href: '/settings',
      label: 'Configuración & Equipo',
      icon: Settings,
      activeColor:
        'text-slate-900 dark:text-white bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold shadow-xs',
      iconColor: 'text-slate-700 dark:text-slate-300',
      matchExact: false,
    });
  }

  return (
    <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
      {isSuperAdmin && (
        <Link
          href="/admin"
          prefetch={true}
          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition mb-2 border ${
            pathname.startsWith('/admin')
              ? 'bg-[#0052FF] text-white border-[#0052FF]'
              : 'bg-slate-100 dark:bg-[#131722] text-[#0052FF] dark:text-[#00D2FF] hover:bg-slate-200 dark:hover:bg-[#1A1F2C] border-slate-200 dark:border-[#232A3B]'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
          <span>Consola Super Admin</span>
        </Link>
      )}

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.matchExact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const isInbox = item.href === '/inbox';

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm transition-all duration-150 cursor-pointer ${
              isActive
                ? item.activeColor
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#131722]/60 font-medium'
            }`}
          >
            <Icon className={`w-4 h-4 transition-colors ${isActive ? item.iconColor : 'text-slate-400 dark:text-slate-400'}`} />
            <span>{item.label}</span>

            {/* Badge de Relevos Pendientes en Inbox */}
            {isInbox && unattendedCount > 0 ? (
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                {unattendedCount}
              </span>
            ) : isActive ? (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0052FF] dark:bg-[#00D2FF]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
