'use client';

import React, { useEffect, useState } from 'react';
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

interface MobileBottomNavProps {
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  enabledModules?: EnabledModules;
}

export function MobileBottomNav({ isAdmin, isSuperAdmin = false, enabledModules }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [unattendedCount, setUnattendedCount] = useState(0);

  useEffect(() => {
    getUnattendedHandoffs()
      .then((list) => setUnattendedCount(list.length))
      .catch(() => {});

    const handleCountUpdate = (e: any) => {
      if (typeof e?.detail?.count === 'number') {
        setUnattendedCount(e.detail.count);
      }
    };

    window.addEventListener('synqo-unattended-count', handleCountUpdate);
    return () => window.removeEventListener('synqo-unattended-count', handleCountUpdate);
  }, []);

  const items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact: boolean;
    isInbox?: boolean;
    isSuperAdminOnly?: boolean;
  }> = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/pipeline', label: 'Pipeline', icon: Kanban, exact: true },
    ...(enabledModules?.native_calendar !== false
      ? [{ href: '/calendar', label: 'Agenda', icon: Calendar, exact: false }]
      : []),
    ...(isAdmin ? [{ href: '/settings', label: 'Ajustes', icon: Settings, exact: false }] : []),
    ...(isSuperAdmin
      ? [{ href: '/admin', label: 'SuperAdmin', icon: ShieldCheck, exact: false, isSuperAdminOnly: true }]
      : []),
  ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#090A0F]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#1E2433] pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="flex items-center justify-around h-14 px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] font-semibold transition ${
                active
                  ? 'text-[#0052FF] dark:text-[#00D2FF]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.isInbox && unattendedCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center font-mono">
                    {unattendedCount > 9 ? '9+' : unattendedCount}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
