import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getOrganizationTokenUsage } from '@/app/actions/usage';
import { redirect } from 'next/navigation';
import { NewLeadModal } from '@/components/pipeline/NewLeadModal';
import {
  Users,
  MessageSquare,
  CalendarCheck,
  TrendingUp,
  Bot,
  ArrowRight,
  Phone,
  Clock,
  Sparkles,
  Zap,
  AlertTriangle,
  ShieldAlert,
  AlertCircle,
  UserCheck,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const STAGE_BADGES: Record<string, { label: string; color: string }> = {
  nuevo: { label: 'Nuevo Lead', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  calificado: { label: 'Calificado', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  cita_agendada: { label: 'Cita Agendada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ganado: { label: 'Cierre Ganado', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  perdido: { label: 'Perdido / Descarte', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default async function DashboardPage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Consultas optimizadas en paralelo
  const [{ data: contacts }, tokenUsage] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, created_at, assigned_to')
      .eq('organization_id', current.organization.id)
      .order('last_interaction_at', { ascending: false })
      .limit(100),
    getOrganizationTokenUsage(),
  ]);

  const leadList = contacts || [];

  const totalLeads = leadList.length;
  const aiActiveLeads = leadList.filter((c: any) => c.is_ai_active).length;
  const bookedAppointments = leadList.filter((c: any) => c.pipeline_stage === 'cita_agendada').length;
  const wonLeads = leadList.filter((c: any) => c.pipeline_stage === 'ganado').length;
  const unassignedLeads = leadList.filter((c: any) => !c.assigned_to);
  const unassignedCount = unassignedLeads.length;

  const conversionRate = totalLeads > 0
    ? (((bookedAppointments + wonLeads) / totalLeads) * 100).toFixed(1)
    : '0.0';

  const recentLeads = leadList.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Cabecera de bienvenida y acción rápida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Panel de Control Comercial
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestión inteligente de prospectos, agendamiento de citas y atención por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NewLeadModal buttonLabel="Registrar Lead Manual" />
        </div>
      </div>

      {/* Alerta de Consumo de Tokens IA */}
      {tokenUsage && (tokenUsage.isWarning || tokenUsage.isExceeded) && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            tokenUsage.isExceeded
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                tokenUsage.isExceeded ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950'
              }`}
            >
              {tokenUsage.isExceeded ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider">
                {tokenUsage.isExceeded
                  ? '¡Límite de Tokens IA Mensual Alcanzado!'
                  : 'Alerta de Consumo: Cuota de Tokens al 80%+'}
              </h4>
              <p className="text-xs mt-0.5">
                {tokenUsage.isExceeded
                  ? `Has consumido ${tokenUsage.tokensUsed.toLocaleString()} de ${tokenUsage.tokensLimit.toLocaleString()} tokens autorizados. La IA se ha pausado preventivamente. Solicita una ampliación a soporte.`
                  : `Has utilizado el ${tokenUsage.percentage}% de tus tokens asignados (${tokenUsage.tokensUsed.toLocaleString()} / ${tokenUsage.tokensLimit.toLocaleString()}).`}
              </p>
            </div>
          </div>

          <Link
            href="/settings"
            prefetch={true}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-300 shadow-sm hover:bg-gray-50 transition flex-shrink-0"
          >
            Ver Configuración
          </Link>
        </div>
      )}

      {/* Tarjetas de Métricas Clave Reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Total Prospectos</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalLeads}</div>
          <span className="text-xs text-gray-400">Contactos comerciales</span>
        </div>

        {/* Métrica de Leads Sin Asignar */}
        <div className={`p-5 rounded-xl border shadow-sm transition ${
          unassignedCount > 0
            ? 'bg-amber-50/70 border-amber-300'
            : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className={`text-xs font-medium ${unassignedCount > 0 ? 'text-amber-900 font-bold' : ''}`}>
              Sin Asignar
            </span>
            <AlertCircle className={`w-4 h-4 ${unassignedCount > 0 ? 'text-amber-600 animate-pulse' : 'text-gray-400'}`} />
          </div>
          <div className={`text-2xl font-bold ${unassignedCount > 0 ? 'text-amber-950' : 'text-gray-900'}`}>
            {unassignedCount}
          </div>
          <span className={`text-xs font-semibold ${unassignedCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
            {unassignedCount > 0 ? 'Requieren atención' : 'Todo asignado'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">IA Activa (Autónoma)</span>
            <Bot className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{aiActiveLeads}</div>
          <span className="text-xs text-emerald-600 font-medium">
            {totalLeads > 0 ? `${Math.round((aiActiveLeads / totalLeads) * 100)}% con IA` : 'Sin leads'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Citas Agendadas</span>
            <CalendarCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{bookedAppointments}</div>
          <span className="text-xs text-blue-600 font-medium">Vía Cal.com</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Tasa de Conversión</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{conversionRate}%</div>
          <span className="text-xs text-purple-600 font-medium">Cierre & Citas</span>
        </div>

        {/* Métrica de Consumo de Tokens */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Tokens IA</span>
            <Zap className={`w-4 h-4 ${tokenUsage && tokenUsage.isWarning ? 'text-amber-500' : 'text-emerald-500'}`} />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {tokenUsage ? `${tokenUsage.percentage}%` : '0%'}
          </div>
          <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                tokenUsage?.isExceeded
                  ? 'bg-rose-500'
                  : tokenUsage?.isWarning
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${tokenUsage?.percentage || 0}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block font-mono">
            {tokenUsage ? `${(tokenUsage.tokensUsed).toLocaleString()} / ${(tokenUsage.tokensLimit).toLocaleString()}` : '0 tokens'}
          </span>
        </div>
      </div>

      {/* SECCIÓN PRIORITARIA: PROSPECTOS SIN ASIGNAR */}
      {unassignedCount > 0 && (
        <div className="bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 border border-amber-200/90 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Prospectos Sin Asignar (Atención Prioritaria)
                  </h3>
                  <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                    {unassignedCount} {unassignedCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Estos contactos no tienen un asesor responsable asignado. Puedes tomar el lead o asignarlo directamente en el Inbox.
                </p>
              </div>
            </div>

            <Link
              href="/inbox"
              prefetch={true}
              className="text-xs text-amber-900 hover:text-amber-950 font-semibold flex items-center gap-1.5 self-start sm:self-auto bg-amber-100/80 hover:bg-amber-200/80 px-3.5 py-1.5 rounded-xl border border-amber-300 transition shrink-0"
            >
              <span>Ver cola en Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedLeads.slice(0, 6).map((lead: any) => {
              const stageBadge = STAGE_BADGES[lead.pipeline_stage] || {
                label: lead.pipeline_stage,
                color: 'bg-gray-100 text-gray-700 border-gray-200',
              };
              return (
                <div
                  key={lead.id}
                  className="bg-white rounded-xl border border-amber-200/80 p-3.5 flex flex-col justify-between gap-3 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate">
                        {lead.name || 'Sin nombre registrado'}
                      </h4>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                        <span>{lead.phone}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${stageBadge.color}`}>
                      {stageBadge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px]">
                    <span className="text-gray-500 flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3 text-gray-400" />
                      {lead.last_interaction_at
                        ? new Date(lead.last_interaction_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                        : 'Reciente'}
                    </span>
                    <Link
                      href={`/inbox/${lead.id}`}
                      prefetch={true}
                      className="inline-flex items-center gap-1 font-bold text-xs text-[#0052FF] hover:text-[#0047E0] hover:underline"
                    >
                      <span>Tomar lead</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sección de Leads Recientes y Enlaces Rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tabla de Leads Recientes */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Leads Recientes</h3>
              <p className="text-xs text-gray-500">Última actividad comercial registrada</p>
            </div>
            <Link
              href="/pipeline"
              prefetch={true}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Ver Pipeline Completo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {recentLeads.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Aún no hay leads registrados</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Registra un prospecto manualmente o conecta el webhook de WhatsApp para recibir mensajes reales.
                </p>
                <NewLeadModal buttonLabel="Crear Primer Lead" />
              </div>
            ) : (
              recentLeads.map((lead: any) => (
                <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs">
                      {lead.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{lead.name || 'Sin nombre'}</h4>
                      <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                        <Phone className="w-3 h-3" />
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                        lead.is_ai_active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {lead.is_ai_active ? 'IA Activa' : 'Control Humano'}
                    </span>

                    {(() => {
                      const stageBadge = STAGE_BADGES[lead.pipeline_stage] || {
                        label: lead.pipeline_stage,
                        color: 'bg-gray-100 text-gray-600 border-gray-200',
                      };
                      return (
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${stageBadge.color}`}>
                          {stageBadge.label}
                        </span>
                      );
                    })()}

                    <Link
                      href={`/inbox/${lead.id}`}
                      prefetch={true}
                      className="text-xs text-gray-400 hover:text-black p-1.5 hover:bg-gray-100 rounded-md transition"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Accesos y Estado de Integraciones */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Estado del Asistente IA</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              El motor inteligente califica el interés del prospecto y agenda citas automáticamente en tu calendario.
            </p>
            <div className="pt-2">
              <Link
                href="/settings"
                prefetch={true}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg border border-emerald-200 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Configurar Instrucciones & IA
              </Link>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Atención en WhatsApp</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Supervisa las conversaciones en tiempo real. Al responder como asesor, el asistente se pausa automáticamente.
            </p>
            <div className="pt-2">
              <Link
                href="/inbox"
                prefetch={true}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Abrir Bandeja de Entrada
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
