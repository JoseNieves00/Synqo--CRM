'use client';

import React, { useState } from 'react';
import { User, LogOut, Settings2 } from 'lucide-react';
import { UserProfileModal } from '@/components/profile/UserProfileModal';

interface SidebarUserCardProps {
  userFullName: string;
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
}

export function SidebarUserCard({
  userFullName,
  userEmail,
  userRole,
  signOutAction,
}: SidebarUserCardProps) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  return (
    <>
      <div className="p-3.5 border-t border-[#1E2433] bg-[#090A0F] flex items-center justify-between">
        <div
          onClick={() => setIsProfileModalOpen(true)}
          className="overflow-hidden mr-2 cursor-pointer group flex-1"
          title="Editar mi perfil"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-white group-hover:text-[#00D2FF] transition truncate">
              {userFullName}
            </p>
            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold bg-[#131722] text-slate-300 border border-[#232A3B]">
              {userRole}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <p className="text-[11px] text-slate-400 font-mono truncate">{userEmail}</p>
            <Settings2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
          </div>
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#131722] transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
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

