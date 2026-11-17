'use client';

import React, { useState } from 'react';
import { User, LogOut, Settings2 } from 'lucide-react';
import { UserProfileModal } from '@/components/profile/UserProfileModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface SidebarUserCardProps {
  userFullName: string;
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
  isCollapsed?: boolean;
}

export function SidebarUserCard({
  userFullName,
  userEmail,
  userRole,
  signOutAction,
  isCollapsed = false,
}: SidebarUserCardProps) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const initials = userFullName
    ? userFullName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('')
    : 'U';

  return (
    <>
      <div
        className={`p-2 lg:p-3.5 border-t border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#090A0F] flex ${
          isCollapsed ? 'flex-col items-center gap-2' : 'flex-col lg:flex-row items-center justify-between gap-2'
        } transition-colors`}
      >
        {!isCollapsed ? (
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="hidden lg:block overflow-hidden mr-2 cursor-pointer group flex-1"
            title="Editar mi perfil"
          >
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-[#0052FF] dark:group-hover:text-[#00D2FF] transition truncate">
                {userFullName}
              </p>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold bg-slate-100 dark:bg-[#131722] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#232A3B]">
                {userRole}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">{userEmail}</p>
              <Settings2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            title={`Perfil: ${userFullName} (${userEmail})`}
            className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-[#0052FF]/20 text-[#0052FF] dark:text-[#00D2FF] font-bold text-xs flex items-center justify-center hover:ring-2 hover:ring-[#0052FF]/30 transition cursor-pointer"
          >
            {initials}
          </button>
        )}

        <div className={`flex ${isCollapsed ? 'flex-col' : 'flex-col lg:flex-row'} items-center gap-0.5`}>
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-[#131722] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        initialFullName={userFullName}
        userEmail={userEmail}
        userRole={userRole}
      />
    </>
  );
}
