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
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const STAGE_BADGES: Record<string, { label: string; color: string }> = {
  nuevo: { label: 'Nuevo Lead', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 font-mono text-[10px]' },
  calificado: { label: 'Calificado', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 font-mono text-[10px]' },
  cita_agendada: { label: 'Cita Agendada', color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 font-mono text-[10px]' },
  ganado: { label: 'Cierre Ganado', color: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30 font-mono text-[10px]' },
  perdido: { label: 'Perdido', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-mono text-[10px]' },
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
    <div className="space-y-6">
      {/* Cabecera de bienvenida y acción rápida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Panel de Control Comercial
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gestión inteligente de prospectos, agendamiento de citas y atención multicanal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NewLeadModal buttonLabel="Registrar Lead Manual" />
        </div>
      </div>

      {/* Alerta de Consumo de Tokens IA */}
      {tokenUsage && (tokenUsage.isWarning || tokenUsage.isExceeded) && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
            tokenUsage.isExceeded
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
              : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                tokenUsage.isExceeded
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                  : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
              }`}
            >
              {tokenUsage.isExceeded ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                {tokenUsage.isExceeded
                  ? 'Límite de Tokens IA Mensual Alcanzado'
                  : 'Alerta de Consumo: Cuota de Tokens al 80%+'}
              </h4>
              <p className="text-xs mt-0.5 text-slate-600 dark:text-slate-300">
                {tokenUsage.isExceeded
                  ? `Has consumido ${tokenUsage.tokensUsed.toLocaleString()} de ${tokenUsage.tokensLimit.toLocaleString()} tokens autorizados. La IA se ha pausado preventivamente. Solicita una ampliación a soporte.`
                  : `Has utilizado el ${tokenUsage.percentage}% de tus tokens asignados (${tokenUsage.tokensUsed.toLocaleString()} / ${tokenUsage.tokensLimit.toLocaleString()}).`}
              </p>
            </div>
          </div>

          <Link
            href="/settings"
            prefetch={true}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-800 dark:text-white border border-slate-200 dark:border-[#232A3B] transition shrink-0 shadow-xs"
          >
            Ver Configuración
          </Link>
        </div>
      )}

      {/* Tarjetas de Métricas Clave Reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Leads</span>
            <Users className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">{totalLeads}</div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Contactos comerciales</span>
        </div>

        {/* Métrica de Leads Sin Asignar */}
        <div className={`p-4 rounded-2xl border transition shadow-xs ${
          unassignedCount > 0
            ? 'bg-amber-50/70 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
            : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-medium uppercase tracking-wider ${unassignedCount > 0 ? 'text-amber-800 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
              Sin Asignar
            </span>
            <AlertCircle className={`w-3.5 h-3.5 ${unassignedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-black font-tabular ${unassignedCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
            {unassignedCount}
          </div>
          <span className={`text-[11px] font-medium ${unassignedCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {unassignedCount > 0 ? 'Requieren atención' : 'Todo asignado'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">IA Activa</span>
            <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">{aiActiveLeads}</div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {totalLeads > 0 ? `${Math.round((aiActiveLeads / totalLeads) * 100)}% con IA` : 'Sin leads'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Citas Agendadas</span>
            <CalendarCheck className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">{bookedAppointments}</div>
          <span className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] font-medium">Agenda Synqo</span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Conversión</span>
            <TrendingUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">{conversionRate}%</div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">Cierre & Citas</span>
        </div>

        {/* Métrica de Consumo de Tokens */}
        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Tokens IA</span>
            <Zap className={`w-3.5 h-3.5 ${tokenUsage && tokenUsage.isWarning ? 'text-amber-500' : 'text-emerald-500'}`} />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {tokenUsage ? `${tokenUsage.percentage}%` : '0%'}
          </div>
          <div className="mt-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
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
          <span suppressHydrationWarning className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block font-mono">
            {tokenUsage ? `${(tokenUsage.tokensUsed).toLocaleString()} / ${(tokenUsage.tokensLimit).toLocaleString()}` : '0 tokens'}
          </span>
        </div>
      </div>

      {/* SECCIÓN PRIORITARIA: PROSPECTOS SIN ASIGNAR */}
      {unassignedCount > 0 && (
        <div className="bg-white dark:bg-[#131722] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xs transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#232A3B] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Prospectos Sin Asignar (Atención Prioritaria)
                  </h3>
                  <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                    {unassignedCount} {unassignedCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Estos contactos no tienen un asesor responsable asignado. Puedes tomar el lead o asignarlo directamente en el Inbox.
                </p>
              </div>
            </div>

            <Link
              href="/inbox"
              prefetch={true}
              className="text-xs text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white font-semibold flex items-center gap-1.5 self-start sm:self-auto bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 px-3.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-500/30 transition shrink-0"
            >
              <span>Ver cola en Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedLeads.slice(0, 6).map((lead: any) => {
              const stageBadge = STAGE_BADGES[lead.pipeline_stage] || {
                label: lead.pipeline_stage,
                color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-mono text-[10px]',
              };
              return (
                <div
                  key={lead.id}
                  className="bg-slate-50 dark:bg-[#090A0F] rounded-xl border border-slate-200 dark:border-[#232A3B] p-3.5 flex flex-col justify-between gap-3 hover:border-amber-400 dark:hover:border-amber-500/40 transition shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {lead.name || 'Sin nombre registrado'}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{lead.phone}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${stageBadge.color}`}>
                      {stageBadge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#1E2433] text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-[11px] font-mono">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {lead.last_interaction_at
                        ? new Date(lead.last_interaction_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                        : 'Reciente'}
                    </span>
                    <Link
                      href={`/inbox/${lead.id}`}
                      prefetch={true}
                      className="inline-flex items-center gap-1 font-semibold text-xs text-[#0052FF] dark:text-[#00D2FF] hover:underline"
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
        <div className="lg:col-span-8 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs transition-colors">
          <div className="p-4 border-b border-slate-200 dark:border-[#232A3B] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Leads Recientes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Última actividad comercial registrada</p>
            </div>
            <Link
              href="/pipeline"
              prefetch={true}
              className="text-xs text-[#0052FF] dark:text-[#00D2FF] hover:underline font-medium flex items-center gap-1 transition"
            >
              Ver Pipeline Completo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-[#1E2433]">
            {recentLeads.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aún no hay leads registrados</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Registra un prospecto manualmente o conecta el webhook de WhatsApp para recibir mensajes reales.
                </p>
                <NewLeadModal buttonLabel="Crear Primer Lead" />
              </div>
            ) : (
              recentLeads.map((lead: any) => (
                <div key={lead.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold text-xs">
                      {lead.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{lead.name || 'Sin nombre'}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        lead.is_ai_active
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                      }`}
                    >
                      {lead.is_ai_active ? 'IA Activa' : 'Humano'}
                    </span>

                    {(() => {
                      const stageBadge = STAGE_BADGES[lead.pipeline_stage] || {
                        label: lead.pipeline_stage,
                        color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-mono text-[10px]',
                      };
                      return (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageBadge.color}`}>
                          {stageBadge.label}
                        </span>
                      );
                    })()}

                    <Link
                      href={`/inbox/${lead.id}`}
                      prefetch={true}
                      className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-[#232A3B] rounded-lg transition"
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
          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs transition-colors">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Estado del Asistente IA</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              El motor inteligente califica el interés del prospecto y agenda citas automáticamente en tu calendario.
            </p>
            <div className="pt-1">
              <Link
                href="/settings"
                prefetch={true}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Configurar Instrucciones & IA
              </Link>
            </div>
          </div>

          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs transition-colors">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Atención en WhatsApp</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Supervisa las conversaciones en tiempo real. Al responder como asesor, el asistente se pausa automáticamente.
            </p>
            <div className="pt-1">
              <Link
                href="/inbox"
                prefetch={true}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0052FF] hover:bg-[#0043D4] px-3 py-2 rounded-xl transition shadow-xs"
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
