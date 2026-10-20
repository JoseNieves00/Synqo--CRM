'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Settings,
  ShieldCheck,
} from 'lucide-react';

interface SidebarNavProps {
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

export function SidebarNav({ isSuperAdmin, isAdmin }: SidebarNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      activeColor: 'text-white bg-slate-800/90 shadow-sm border border-slate-700/60 font-semibold',
      iconColor: 'text-slate-200',
      matchExact: true,
    },
    {
      href: '/inbox',
      label: 'Inbox WhatsApp',
      icon: MessageSquare,
      activeColor: 'text-white bg-slate-800/90 shadow-sm border border-slate-700/60 font-semibold',
      iconColor: 'text-emerald-400',
      matchExact: false,
    },
    {
      href: '/pipeline',
      label: 'Pipeline Kanban',
      icon: Kanban,
      activeColor: 'text-white bg-slate-800/90 shadow-sm border border-slate-700/60 font-semibold',
      iconColor: 'text-blue-400',
      matchExact: true,
    },
  ];

  if (isAdmin) {
    navItems.push({
      href: '/settings',
      label: 'Configuración & Equipo',
      icon: Settings,
      activeColor: 'text-white bg-slate-800/90 shadow-sm border border-slate-700/60 font-semibold',
      iconColor: 'text-purple-400',
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
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Consola Super Admin</span>
        </Link>
      )}

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.matchExact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer ${
              isActive
                ? item.activeColor
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
            }`}
          >
            <Icon className={`w-4 h-4 transition-colors ${isActive ? item.iconColor : 'text-slate-400'}`} />
            <span>{item.label}</span>
            {isActive && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

