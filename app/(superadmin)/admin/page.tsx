import React from 'react';
import { getSuperAdminMetrics, listAllOrganizations } from '@/app/actions/superadmin';
import { listAllTicketsForAdmin } from '@/app/actions/support';
import AdminConsoleClient from '@/components/admin/AdminConsoleClient';

export const dynamic = 'force-dynamic';

export default async function SuperAdminPage() {
  const [metrics, organizations, initialTickets] = await Promise.all([
    getSuperAdminMetrics(),
    listAllOrganizations(),
    listAllTicketsForAdmin(),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          Panel de Control Super Administrador
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Supervisión global de empresas suscritas, asignación de cupos de agentes, soporte y analítica con IA.
        </p>
      </div>

      <AdminConsoleClient
        initialMetrics={metrics}
        initialOrganizations={organizations}
        initialTickets={initialTickets || []}
      />
    </div>
  );
}

