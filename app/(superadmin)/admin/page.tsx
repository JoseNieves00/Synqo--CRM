import React from 'react';
import { getSuperAdminMetrics, listAllOrganizations, getCronHealthAction } from '@/app/actions/superadmin';
import { listAllTicketsForAdmin } from '@/app/actions/support';
import AdminConsoleClient from '@/components/admin/AdminConsoleClient';

export const dynamic = 'force-dynamic';

const CRON_LABELS: Record<string, string> = {
  'lead-reactivation': 'Recontacto autónomo IA',
  'appointment-reminders': 'Recordatorios de citas',
  'cleanup-storage': 'Limpieza de storage',
};

function cronHealthColor(status: string | null): string {
  if (!status) return 'text-gray-400';
  if (status === 'invoked') return 'text-emerald-600';
  if (status === 'error') return 'text-red-600';
  return 'text-amber-600';
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

export default async function SuperAdminPage() {
  const [metrics, organizations, initialTickets, cronHealth] = await Promise.all([
    getSuperAdminMetrics(),
    listAllOrganizations(),
    listAllTicketsForAdmin(),
    getCronHealthAction().catch(() => ({ jobs: [] })),
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

      <div className="mb-8 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
          Salud de Automatización (Crons)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cronHealth.jobs.map((job) => (
            <div key={job.jobName} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{CRON_LABELS[job.jobName] || job.jobName}</span>
                <span className={`text-[10px] font-mono font-bold ${cronHealthColor(job.lastStatus)}`}>
                  {formatAgo(job.lastRunAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{job.invocationsLast24h} OK 24h</span>
                {job.errorsLast24h > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{job.errorsLast24h} errores</span>
                )}
                {job.skippedMissingSecretsLast24h > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" title="Faltan synqo_app_url / synqo_cron_secret en Vault">
                    ⚠ {job.skippedMissingSecretsLast24h} omitidos (Vault)
                  </span>
                )}
              </div>
              {job.lastDetail && (
                <p className="text-[10px] text-gray-400 mt-1 truncate" title={job.lastDetail}>{job.lastDetail}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <AdminConsoleClient
        initialMetrics={metrics}
        initialOrganizations={organizations}
        initialTickets={initialTickets || []}
      />
    </div>
  );
}

