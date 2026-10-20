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
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    redirect('/login');
  }

  // Consultas optimizadas en paralelo
  const [{ data: contacts }, tokenUsage] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, created_at')
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Total de Prospectos</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalLeads}</div>
          <span className="text-xs text-gray-400">Contactos comerciales activos</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">IA Activa (Autónoma)</span>
            <Bot className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{aiActiveLeads}</div>
          <span className="text-xs text-emerald-600 font-medium">
            {totalLeads > 0 ? `${Math.round((aiActiveLeads / totalLeads) * 100)}% atendidos por IA` : 'Sin leads aún'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Citas Agendadas</span>
            <CalendarCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{bookedAppointments}</div>
          <span className="text-xs text-blue-600 font-medium">Confirmadas vía Cal.com</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Tasa de Conversión</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{conversionRate}%</div>
          <span className="text-xs text-purple-600 font-medium">Citas & Ventas cerradas</span>
        </div>

        {/* Métrica de Consumo de Tokens */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Consumo de Tokens IA</span>
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
            {tokenUsage ? `${(tokenUsage.tokensUsed).toLocaleString()} / ${(tokenUsage.tokensLimit).toLocaleString()} tokens` : '0 tokens'}
          </span>
        </div>
      </div>

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

                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                      {lead.pipeline_stage}
                    </span>

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
