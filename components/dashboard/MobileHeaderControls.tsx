'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { User, LogOut, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { UserProfileModal } from '@/components/profile/UserProfileModal';

interface MobileHeaderControlsProps {
  userFullName: string;
  userEmail: string;
  userRole: string;
  isSuperAdmin?: boolean;
  signOutAction: () => Promise<void>;
}

export function MobileHeaderControls({
  userFullName,
  userEmail,
  userRole,
  isSuperAdmin = false,
  signOutAction,
}: MobileHeaderControlsProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <>
      <div className="flex md:hidden items-center gap-1">
        {isSuperAdmin && (
          <Link
            href="/admin"
            prefetch={true}
            className="p-1.5 rounded-lg bg-[#0052FF]/10 text-[#0052FF] dark:bg-[#00D2FF]/10 dark:text-[#00D2FF] border border-[#0052FF]/20 dark:border-[#00D2FF]/20 hover:bg-[#0052FF]/20 transition"
            title="Consola Super Admin"
            aria-label="Consola Super Admin"
          >
            <ShieldCheck className="w-4 h-4" />
          </Link>
        )}
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setIsProfileOpen(true)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
          title="Mi Perfil"
          aria-label="Mi Perfil"
        >
          <User className="w-4 h-4" />
        </button>
        <form action={signOutAction} className="inline-flex">
          <button
            type="submit"
            title="Cerrar sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        initialFullName={userFullName}
        userEmail={userEmail}
        userRole={userRole}
      />
    </>
  );
}
