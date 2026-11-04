import React from 'react';
import dynamicImport from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getCalendarData } from '@/app/actions/calendar-admin';

export const dynamic = 'force-dynamic';

function CalendarSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 dark:bg-[#090A0F] text-slate-800 dark:text-slate-100 animate-pulse transition-colors">
      {/* Header Skeleton */}
      <div className="p-6 border-b border-slate-200 dark:border-[#1E2433] bg-white dark:bg-[#0E121B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-[#131722]" />
          <div>
            <div className="h-5 w-40 bg-slate-300 dark:bg-[#1A2030] rounded-md mb-2" />
            <div className="h-3 w-56 bg-slate-200 dark:bg-[#131722] rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-slate-200 dark:bg-[#131722] rounded-xl" />
          <div className="h-9 w-36 bg-[#0052FF]/20 dark:bg-[#0052FF]/40 rounded-xl" />
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-[#1E2433] bg-slate-100/60 dark:bg-[#0E121B]/60 flex items-center gap-3">
        <div className="h-8 w-44 bg-slate-200 dark:bg-[#131722] rounded-lg" />
        <div className="h-8 w-40 bg-slate-200 dark:bg-[#131722] rounded-lg" />
        <div className="h-8 w-48 bg-slate-200 dark:bg-[#131722] rounded-lg" />
      </div>

      {/* Grid Skeleton */}
      <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-slate-200 dark:bg-[#1E2433] rounded" />
              <div className="h-5 w-20 bg-slate-200 dark:bg-[#1E2433] rounded-full" />
            </div>
            <div className="h-5 w-3/4 bg-slate-300 dark:bg-[#1A2030] rounded" />
            <div className="space-y-1.5 pt-2">
              <div className="h-3 w-1/2 bg-slate-200 dark:bg-[#1E2433] rounded" />
              <div className="h-3 w-2/3 bg-slate-200 dark:bg-[#1E2433] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CalendarViewClient = dynamicImport(
  () => import('@/components/calendar/CalendarViewClient').then((mod) => mod.CalendarViewClient),
  {
    loading: () => <CalendarSkeleton />,
    ssr: true,
  }
);

export default async function CalendarPage() {
  const data = await getCalendarData();

  // 🛡️ REGLA DE MÓDULO: Si el Super Admin apagó el módulo de calendario, denegar acceso
  if (data.organization?.enabled_modules?.native_calendar === false) {
    redirect('/dashboard');
  }

  return (
    <CalendarViewClient
      initialAppointments={data.appointments}
      specialists={data.specialists}
      rooms={data.rooms}
      services={data.services}
      organization={data.organization}
    />
  );
}


