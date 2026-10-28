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

interface SidebarNavProps {
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

export function SidebarNav({ isSuperAdmin, isAdmin }: SidebarNavProps) {
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
      activeColor: 'text-white bg-[#131722] shadow-sm border border-[#232A3B] font-semibold',
      iconColor: 'text-slate-200',
      matchExact: true,
    },
    {
      href: '/inbox',
      label: 'Inbox WhatsApp',
      icon: MessageSquare,
      activeColor: 'text-white bg-[#131722] shadow-sm border border-[#232A3B] font-semibold',
      iconColor: 'text-[#00D2FF]',
      matchExact: false,
    },
    {
      href: '/pipeline',
      label: 'Pipeline Kanban',
      icon: Kanban,
      activeColor: 'text-white bg-[#131722] shadow-sm border border-[#232A3B] font-semibold',
      iconColor: 'text-[#0052FF]',
      matchExact: true,
    },
    {
      href: '/calendar',
      label: 'Agenda & Citas',
      icon: Calendar,
      activeColor: 'text-white bg-[#131722] shadow-sm border border-[#232A3B] font-semibold',
      iconColor: 'text-[#00D2FF]',
      matchExact: false,
    },
  ];

  if (isAdmin) {
    navItems.push({
      href: '/settings',
      label: 'Configuración & Equipo',
      icon: Settings,
      activeColor: 'text-white bg-[#131722] shadow-sm border border-[#232A3B] font-semibold',
      iconColor: 'text-indigo-400',
      matchExact: false,
    });
  }

  return (
    <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
      {isSuperAdmin && (
        <Link
          href="/admin"
          prefetch={true}
          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition mb-2 ${
            pathname.startsWith('/admin')
              ? 'bg-[#0052FF] text-white shadow-md shadow-[#0052FF]/20'
              : 'bg-[#0052FF]/10 text-[#00D2FF] hover:bg-[#0052FF]/20 border border-[#0052FF]/30'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-[#00D2FF]" />
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
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer ${
              isActive
                ? item.activeColor
                : 'text-slate-400 hover:text-white hover:bg-[#131722]/60 font-medium'
            }`}
          >
            <Icon className={`w-4 h-4 transition-colors ${isActive ? item.iconColor : 'text-slate-400'}`} />
            <span>{item.label}</span>

            {/* Badge de Relevos Pendientes en Inbox */}
            {isInbox && unattendedCount > 0 ? (
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-sm shadow-rose-500/40 animate-pulse">
                🔴 {unattendedCount}
              </span>
            ) : isActive ? (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00D2FF] shadow-[0_0_8px_#00D2FF] animate-pulse" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}


