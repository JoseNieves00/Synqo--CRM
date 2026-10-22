import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/app/actions/superadmin';
import { signOut } from '@/app/actions/auth';
import { ShieldCheck, ArrowLeft, LogOut, LayoutDashboard } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireSuperAdmin();
  } catch (err) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-16 border-b border-[#1E2433] bg-[#090A0F] px-6 sm:px-10 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <Image
            src="/brand/isotipo-128w.png"
            alt="Synqo"
            width={34}
            height={34}
            className="w-9 h-9 object-contain"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm tracking-wide text-white">
                Synqo Master Console
              </h1>
              <span className="text-[10px] bg-[#0052FF]/20 text-[#00D2FF] border border-[#00D2FF]/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                Super Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">synqo.dev · Gestión Global</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131722] hover:bg-[#1A1F2C] text-slate-300 hover:text-white border border-[#232A3B] transition font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al CRM
          </Link>

          <form action={signOut}>
            <button
              type="submit"
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#131722] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-50 text-slate-900 p-6 sm:p-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

