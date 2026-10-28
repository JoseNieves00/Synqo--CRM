import React from 'react';
import { getCalendarData } from '@/app/actions/calendar-admin';
import { CalendarViewClient } from '@/components/calendar/CalendarViewClient';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const data = await getCalendarData();

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

