import React from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getOrganizationTokenUsage } from '@/app/actions/usage';
import { getOrganizationPendingReminders } from '@/app/actions/reminders';
import { getDashboardMetrics, type DashboardPeriod } from '@/app/actions/dashboard';
import { RemindersDashboardWidget } from '@/components/dashboard/RemindersDashboardWidget';
import { TopPropensityWidget } from '@/components/dashboard/TopPropensityWidget';
import { getRecentAiActivity } from '@/app/actions/ai-activity';
import { AiActivityFeed } from '@/components/dashboard/AiActivityFeed';
import { ClassifyLeadsButton } from '@/components/dashboard/ClassifyLeadsButton';
import { redirect } from 'next/navigation';

const NewLeadModal = nextDynamic(
  () => import('@/components/pipeline/NewLeadModal').then((m) => m.NewLeadModal),
  { ssr: false }
);
import {
  Users,
  MessageSquare,
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
  DollarSign,
  Flame,
  Snowflake,
  CheckCircle2,
  Repeat,
  Cpu,
  HelpCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const STAGE_BADGES: Record<string, { label: string; color: string }> = {
  nuevo: { label: 'Nuevo Lead', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 font-mono text-[10px]' },
  calificado: { label: 'Calificado', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 font-mono text-[10px]' },
  cita_agendada: { label: 'Cita Agendada', color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 font-mono text-[10px]' },
  ganado: { label: 'Cierre Ganado', color: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30 font-mono text-[10px]' },
  perdido: { label: 'Perdido', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-mono text-[10px]' },
};

const PERIOD_OPTIONS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: 'month', label: 'Este mes' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  const rawPeriod = searchParams?.period;
  const period: DashboardPeriod =
    rawPeriod === 'today' || rawPeriod === '7d' || rawPeriod === 'month' ? rawPeriod : 'month';

  const [
    metrics,
    recentLeadsRes,
    tokenUsage,
    remindersData,
    aiActivityData,
  ] = await Promise.all([
    getDashboardMetrics(period, current.organization.id),
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, created_at, assigned_to')
      .eq('organization_id', current.organization.id)
      .is('deleted_at', null)
      .order('last_interaction_at', { ascending: false })
      .limit(5),
    getOrganizationTokenUsage(),
    getOrganizationPendingReminders(),
    getRecentAiActivity(15),
  ]);

  const recentLeads = recentLeadsRes.data || [];

  const totalLeads = metrics?.totalContacts ?? 0;
  const needsHumanCount = metrics?.needsHumanCount ?? 0;
  const needsHumanLeads = metrics?.needsHumanLeads || [];
  const aiActiveLeads = metrics?.aiActiveCount ?? 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Cabecera con selector de periodo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Panel de Control Comercial
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ventas, calificación IA, seguimientos y rentabilidad · {metrics?.periodLabel || 'Este mes'} ({metrics?.timezone})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="inline-flex items-center p-1 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] overflow-x-auto max-w-full [scrollbar-width:none]">
            {PERIOD_OPTIONS.map((opt) => (
              <Link
                key={opt.id}
                href={`/dashboard?period=${opt.id}`}
                prefetch={true}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  period === opt.id
                    ? 'bg-[#0052FF] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <NewLeadModal buttonLabel="Registrar Lead Manual" />
        </div>
      </div>

      {/* Alerta de Consumo de Tokens IA */}
      {tokenUsage && (tokenUsage.isWarning || tokenUsage.isExceeded) && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
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
              {tokenUsage.isExceeded ? <ShieldAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                {tokenUsage.isExceeded
                  ? `Modo Excedente Activo (${tokenUsage.rawPercentage}% · Bot Operando)`
                  : `Alerta de Consumo: Cuota al ${tokenUsage.rawPercentage}%`}
              </h4>
              <p className="text-xs mt-0.5 text-slate-600 dark:text-slate-300">
                Has utilizado {tokenUsage.tokensUsed.toLocaleString('es-CO')} / {tokenUsage.tokensLimit.toLocaleString('es-CO')} tokens ({tokenUsage.rawPercentage}%)
                {tokenUsage.overageTokens > 0
                  ? ` · Excedente acumulado: ${tokenUsage.overageTokens.toLocaleString('es-CO')} tokens.`
                  : '.'}
              </p>
            </div>
          </div>

          <Link
            href="/settings"
            prefetch={true}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#131722] hover:bg-slate-100 text-slate-800 dark:text-white border border-slate-200 dark:border-[#232A3B] transition shrink-0 self-start sm:self-auto"
          >
            Ver Configuración
          </Link>
        </div>
      )}

      {/* Alerta operativa: pasos de seguimiento saltados en Meta por falta de plantilla */}
      {(metrics?.followUp.skippedNoTemplateCount ?? 0) > 0 && (
        <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{metrics?.followUp.skippedNoTemplateCount}</strong> contactos tuvieron pasos de seguimiento omitidos por superar la ventana de 24h en Meta sin plantilla vinculada.
            </span>
          </div>
          <Link href="/settings" className="text-amber-800 dark:text-amber-300 font-bold underline shrink-0">
            Vincular plantillas
          </Link>
        </div>
      )}

      {/* KPIs Principales de Negocio y IA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Cierres ({metrics?.periodLabel})</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white font-tabular truncate">
            ${(metrics?.salesRevenueInPeriod || 0).toLocaleString('es-CO')}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {metrics?.wonInPeriod || 0} {metrics?.isCalendarBusiness ? 'citas / cierres' : 'cierres'} · Ticket ${(metrics?.avgTicketUsdOrCop || 0).toLocaleString('es-CO')}
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Conversión</span>
            <TrendingUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.conversionRatePct ?? 0}%
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {metrics?.wonInPeriod || 0} ganados / {metrics?.newLeadsInPeriod || 0} nuevos ({totalLeads} total)
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Autonomía IA</span>
            <Bot className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF]" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.aiPerformance.autonomyPct ?? 100}%
          </div>
          <span className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] font-medium">
            {metrics?.aiPerformance.autonomousConversations || 0}/{metrics?.aiPerformance.totalActiveConversationsInPeriod || 0} chats sin humano
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">IA vs Humano</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.aiPerformance.aiWonSalesCount || 0} <span className="text-sm text-slate-400 font-normal">/</span> {metrics?.aiPerformance.humanWonSalesCount || 0}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Ventas IA vs Asesor · {aiActiveLeads} con IA activa
          </span>
        </div>

        <div className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Tokens IA ({metrics?.periodLabel})</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {(metrics?.costs.totalTokensPeriod || 0).toLocaleString('es-CO')}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {(metrics?.costs.tokensPerConversation || 0).toLocaleString('es-CO')} tok/chat · cuota {tokenUsage?.rawPercentage ?? tokenUsage?.percentage ?? 0}%
          </span>
        </div>

        <Link
          href="/inbox?view=por_responder"
          className={`p-4 rounded-2xl border shadow-xs transition hover:opacity-95 ${
            needsHumanCount > 0
              ? 'bg-amber-50/70 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-medium uppercase tracking-wider ${needsHumanCount > 0 ? 'text-amber-800 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
              Requieren Humano
            </span>
            <AlertCircle className={`w-3.5 h-3.5 ${needsHumanCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-2xl font-black font-tabular ${needsHumanCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
            {needsHumanCount}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {needsHumanCount > 0 ? 'Relevos o espera sin IA' : `Al día · cuota ${tokenUsage?.percentage || 0}%`}
          </span>
        </Link>
      </div>

      {/* SECCIÓN NUEVA: Calificación IA (4 grupos + Cierres) y Embudo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Clasificación IA de Prospectos
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 font-tabular">
                  Total Calificados: {(metrics?.categories.hot || 0) + (metrics?.categories.qualifiedDoubt || 0)}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                4 niveles de intención: calificados listos vs. con dudas puntuales, tibios evaluando y fríos descartados ({metrics?.categories.movementsInPeriod || 0} cambios en el periodo).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ClassifyLeadsButton initialUnclassified={metrics?.categories.unclassified || 0} />
              <Link href="/inbox?view=ia_atendiendo" className="text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline">
                Ver en Inbox →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Link
              href="/inbox?view=ia_atendiendo&temp=hot"
              className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:border-rose-400 transition block"
            >
              <div className="flex items-center gap-1 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Calif. · Listo</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
                {metrics?.categories.hot || 0}
              </div>
              <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80">Listo para cerrar →</p>
            </Link>

            <Link
              href="/inbox?view=ia_atendiendo&temp=qualified_doubt"
              className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 hover:border-orange-400 transition block"
            >
              <div className="flex items-center gap-1 text-orange-700 dark:text-orange-300 text-[11px] font-bold">
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Calif. · Dudas</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
                {metrics?.categories.qualifiedDoubt || 0}
              </div>
              <p className="text-[10px] text-orange-700/80 dark:text-orange-300/80">Por confirmar →</p>
            </Link>

            <Link
              href="/inbox?view=ia_atendiendo&temp=warm"
              className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 hover:border-amber-400 transition block"
            >
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Tibios</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
                {metrics?.categories.warm || 0}
              </div>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80">Evaluando →</p>
            </Link>

            <Link
              href="/pipeline?temp=cold"
              className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 hover:border-sky-400 transition block"
            >
              <div className="flex items-center gap-1 text-sky-700 dark:text-sky-300 text-[11px] font-bold">
                <Snowflake className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Fríos</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
                {metrics?.categories.cold || 0}
              </div>
              <p className="text-[10px] text-sky-700/80 dark:text-sky-300/80">Sin interés →</p>
            </Link>

            <Link
              href="/inbox?view=cerrados&stage=ganado"
              className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-400 transition block col-span-2 sm:col-span-1"
            >
              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Cerrados</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
                {metrics?.categories.buyers || 0}
              </div>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                {metrics?.isCalendarBusiness ? 'Clientes cerrados →' : 'Cierres ganados →'}
              </p>
            </Link>
          </div>

          {/* Embudo por Etapa */}
          <div className="pt-2 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Embudo por etapa comercial (clic para filtrar)
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {(
                [
                  { id: 'nuevo', label: 'Nuevo', view: 'ia_atendiendo' },
                  { id: 'calificado', label: 'Calificado', view: 'ia_atendiendo' },
                  { id: 'cita_agendada', label: 'Agendado', view: 'ia_atendiendo' },
                  { id: 'ganado', label: 'Ganado', view: 'cerrados' },
                  { id: 'perdido', label: 'Perdido', view: 'cerrados' },
                ] as const
              ).map((st) => (
                <Link
                  key={st.id}
                  href={`/inbox?view=${st.view}&stage=${st.id}`}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF]/50 transition block"
                >
                  <div className="text-base font-black text-slate-900 dark:text-white font-tabular">
                    {metrics?.funnelCounts[st.id] || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{st.label}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Columna derecha: Seguimientos automáticos + Motivos de pérdida / handoff */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-purple-500" />
                <span>Seguimientos Automáticos</span>
              </h3>
              <Link href="/inbox?view=seguimiento" className="text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline">
                Cola programada ({metrics?.followUp.activeScheduledCount || 0})
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                <div className="text-lg font-black font-tabular">{metrics?.followUp.sentInPeriod || 0}</div>
                <div className="text-[10px] text-slate-500">Enviados</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                <div className="text-lg font-black text-[#0052FF] dark:text-[#00D2FF] font-tabular">
                  {metrics?.followUp.responseRatePct || 0}%
                </div>
                <div className="text-[10px] text-slate-500">Tasa respuesta</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-tabular">
                  {metrics?.followUp.recoveredSalesCount || 0}
                </div>
                <div className="text-[10px] text-slate-500">Recuperadas</div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Motivos de No Compra &amp; Consumo de Tokens
            </h3>
            {metrics?.lostReasons && metrics.lostReasons.length > 0 ? (
              <div className="space-y-1">
                {metrics.lostReasons.map((lr) => (
                  <div key={lr.reason} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-[#1E2433] last:border-0">
                    <span className="text-slate-600 dark:text-slate-300 truncate pr-2">{lr.reason}</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{lr.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Sin pérdidas registradas en este periodo.</p>
            )}

            {metrics?.costs.byModel && metrics.costs.byModel.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#232A3B] space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Tokens por modelo (p50: {(metrics.aiPerformance.p50LatencyMs / 1000).toFixed(1)}s · p90: {(metrics.aiPerformance.p90LatencyMs / 1000).toFixed(1)}s{metrics.costs.tokensPerSale > 0 ? ` · ${metrics.costs.tokensPerSale.toLocaleString('es-CO')} tok/cierre` : ''})
                </div>
                {metrics.costs.byModel.slice(0, 4).map((m) => {
                  const pct = Math.round((m.totalTokens / Math.max(1, metrics.costs.totalTokensPeriod)) * 100);
                  return (
                    <div key={`${m.provider}-${m.model}`} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-600 dark:text-slate-300 truncate">{m.provider}:{m.model}</span>
                      <span className="text-slate-900 dark:text-white shrink-0">
                        {m.totalTokens.toLocaleString('es-CO')} tok ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECCIÓN PRIORITARIA REAL: ÚNICAMENTE CHATS QUE REQUIEREN INTERVENCIÓN HUMANA */}
      {needsHumanLeads.length > 0 && (
        <div className="bg-white dark:bg-[#131722] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#232A3B] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chats que Requieren Atención Humana
                  </h3>
                  <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                    {needsHumanCount}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Solo clientes con relevo solicitado, comprobante de pago o IA pausada esperando respuesta (los atendidos por la IA no se muestran aquí).
                </p>
              </div>
            </div>

            <Link
              href="/inbox?view=por_responder"
              prefetch={true}
              className="text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-500/30 transition shrink-0 self-start sm:self-auto"
            >
              <span>Ver cola Por responder</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {needsHumanLeads.slice(0, 6).map((lead) => {
              const stageBadge = STAGE_BADGES[lead.pipeline_stage || 'nuevo'] || {
                label: lead.pipeline_stage || 'nuevo',
                color: 'bg-slate-100 text-slate-700 font-mono text-[10px]',
              };
              return (
                <div
                  key={lead.id}
                  className="bg-slate-50 dark:bg-[#090A0F] rounded-xl border border-slate-200 dark:border-[#232A3B] p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {lead.name || 'Sin nombre registrado'}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{lead.phone || lead.channel || 'Canal directo'}</span>
                      </p>
                      <span className="inline-block mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        {lead.reason}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${stageBadge.color}`}>
                      {stageBadge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#1E2433] text-[11px]">
                    <span className="text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {lead.last_interaction_at
                        ? new Date(lead.last_interaction_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                        : 'Reciente'}
                    </span>
                    <Link href={`/inbox?view=por_responder&c=${lead.id}`} className="inline-flex items-center gap-1 font-semibold text-xs text-[#0052FF] dark:text-[#00D2FF] hover:underline">
                      <span>Atender ahora</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recordatorios y Despachos */}
      <RemindersDashboardWidget
        initialData={remindersData}
        currentUserRole={current.profile.role}
        currentUserId={current.user.id}
      />

      {/* Top 10 Más Propensos a Cerrar */}
      <TopPropensityWidget leads={metrics?.topPropensityLeads || []} />

      {/* Leads Recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-[#232A3B] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Leads Recientes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Última actividad comercial registrada</p>
            </div>
            <Link href="/pipeline" className="text-xs text-[#0052FF] dark:text-[#00D2FF] hover:underline font-medium flex items-center gap-1">
              Ver Pipeline <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#1E2433]">
            {recentLeads.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold">Aún no hay leads registrados</p>
              </div>
            ) : (
              recentLeads.map((lead: any) => (
                <div key={lead.id} className="p-3.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center font-bold text-xs shrink-0">
                      {lead.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold truncate">{lead.name || 'Sin nombre'}</h4>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono truncate">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      lead.is_ai_active
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                    }`}>
                      {lead.is_ai_active ? 'IA' : 'Humano'}
                    </span>
                    <Link href={`/inbox/${lead.id}`} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1">
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs">
            <h3 className="font-bold text-sm">Configurar Seguimientos &amp; IA</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Personaliza los mensajes precargados por embudo, galería visual e instrucciones del asistente.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ir a Configuración
            </Link>
          </div>

          <div className="bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] space-y-3 shadow-xs">
            <h3 className="font-bold text-sm">Bandeja Omnicanal</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Supervisa los chats activos o interviene manualmente cuando sea necesario.
            </p>
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0052FF] hover:bg-[#0043D4] px-3 py-2 rounded-xl"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Abrir Inbox
            </Link>
          </div>
        </div>
      </div>

      <AiActivityFeed initialItems={aiActivityData.items} initialStats={aiActivityData.stats} />
    </div>
  );
}
