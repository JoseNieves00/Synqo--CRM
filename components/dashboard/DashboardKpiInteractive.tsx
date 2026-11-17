'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  Bot,
  Sparkles,
  Cpu,
  ArrowRight,
  MessageSquare,
  X,
  ChevronRight,
  BarChart3,
  Layers,
  Zap,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type { DashboardMetrics } from '@/app/actions/dashboard';

interface DashboardKpiInteractiveProps {
  metrics: DashboardMetrics | null;
  tokenUsage?: any;
  totalLeads: number;
  aiActiveLeads: number;
  needsHumanCount: number;
}

type DetailTab = 'tokens' | 'conversion' | 'autonomy' | 'sales' | null;

export function DashboardKpiInteractive({
  metrics,
  tokenUsage,
  totalLeads,
  aiActiveLeads,
  needsHumanCount,
}: DashboardKpiInteractiveProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(null);

  // Cálculos de Tokenización (100% Tokens, CERO costos monetarios)
  const totalTokens = metrics?.costs.totalTokensPeriod || 0;
  const models = metrics?.costs.byModel || [];

  const geminiTokens = models
    .filter((m) => m.provider.toLowerCase().includes('google') || m.model.toLowerCase().includes('gemini'))
    .reduce((sum, m) => sum + m.totalTokens, 0);

  const openAiTokens = models
    .filter((m) => m.provider.toLowerCase().includes('openai') || m.model.toLowerCase().includes('gpt'))
    .reduce((sum, m) => sum + m.totalTokens, 0);

  const promptTokensTotal = models.reduce((sum, m) => sum + (m.promptTokens || 0), 0);
  const completionTokensTotal = models.reduce((sum, m) => sum + (m.completionTokens || 0), 0);

  const geminiPct = totalTokens > 0 ? Math.round((geminiTokens / totalTokens) * 100) : 100;
  const openAiPct = totalTokens > 0 ? Math.round((openAiTokens / totalTokens) * 100) : 0;
  const promptPct = totalTokens > 0 ? Math.round((promptTokensTotal / totalTokens) * 100) : 75;
  const completionPct = 100 - promptPct;

  const quotaPct = tokenUsage?.rawPercentage ?? tokenUsage?.percentage ?? 0;
  const quotaUsed = tokenUsage?.tokensUsed ?? totalTokens;
  const quotaLimit = tokenUsage?.tokensLimit ?? 500000;

  // Embudo de Conversión
  const funnel = metrics?.funnelCounts || {
    nuevo: 0,
    calificado: 0,
    cita_agendada: 0,
    ganado: 0,
    perdido: 0,
  };

  const totalInFunnel =
    funnel.nuevo + funnel.calificado + funnel.cita_agendada + funnel.ganado + funnel.perdido || 1;

  return (
    <>
      {/* Grid de 6 KPIs interactivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* KPI 1: Cierres / Ventas */}
        <div
          onClick={() => setActiveTab('sales')}
          className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs cursor-pointer hover:border-[#0052FF]/50 hover:shadow-md transition-all group relative"
          title="Haz clic para ver el desglose de cierres y ticket promedio"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Cierres ({metrics?.periodLabel || 'Mes'})
            </span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white font-tabular truncate">
            ${(metrics?.salesRevenueInPeriod || 0).toLocaleString('es-CO')}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
              {metrics?.wonInPeriod || 0} {metrics?.isCalendarBusiness ? 'citas / cierres' : 'cierres'} · Ticket ${(metrics?.avgTicketUsdOrCop || 0).toLocaleString('es-CO')}
            </span>
          </div>
          <span className="text-[9px] text-[#0052FF] dark:text-[#00D2FF] font-medium opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
            Ver detalle ↗
          </span>
        </div>

        {/* KPI 2: Conversión */}
        <div
          onClick={() => setActiveTab('conversion')}
          className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs cursor-pointer hover:border-purple-500/50 hover:shadow-md transition-all group relative"
          title="Haz clic para ver el embudo de conversión y motivos de pérdida"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Conversión</span>
            <TrendingUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.conversionRatePct ?? 0}%
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate mt-1">
            {metrics?.wonInPeriod || 0} ganados / {metrics?.newLeadsInPeriod || 0} nuevos ({totalLeads} total)
          </span>
          <span className="text-[9px] text-purple-600 dark:text-purple-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
            Ver embudo ↗
          </span>
        </div>

        {/* KPI 3: Autonomía IA */}
        <div
          onClick={() => setActiveTab('autonomy')}
          className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs cursor-pointer hover:border-[#0052FF]/50 hover:shadow-md transition-all group relative"
          title="Haz clic para ver la tasa de autonomía y motivos de relevo"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Autonomía IA</span>
            <Bot className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.aiPerformance.autonomyPct ?? 100}%
          </div>
          <span className="text-[11px] text-[#0052FF] dark:text-[#00D2FF] font-medium block truncate mt-1">
            {metrics?.aiPerformance.autonomousConversations || 0}/
            {metrics?.aiPerformance.totalActiveConversationsInPeriod || 0} chats sin humano
          </span>
          <span className="text-[9px] text-[#0052FF] dark:text-[#00D2FF] font-medium opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
            Ver relevos ↗
          </span>
        </div>

        {/* KPI 4: IA vs Humano */}
        <div
          onClick={() => setActiveTab('autonomy')}
          className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs cursor-pointer hover:border-amber-500/50 hover:shadow-md transition-all group relative"
          title="Haz clic para ver la comparativa de ventas y respuesta IA vs Humano"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">IA vs Humano</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {metrics?.aiPerformance.aiWonSalesCount || 0}{' '}
            <span className="text-sm text-slate-400 font-normal">/</span>{' '}
            {metrics?.aiPerformance.humanWonSalesCount || 0}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate mt-1">
            Ventas IA vs Asesor · {aiActiveLeads} con IA activa
          </span>
          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
            Ver comparativa ↗
          </span>
        </div>

        {/* KPI 5: Tokens IA (100% Tokenización, 0 costos monetarios) */}
        <div
          onClick={() => setActiveTab('tokens')}
          className="bg-white dark:bg-[#131722] p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-xs cursor-pointer hover:border-emerald-500/50 hover:shadow-md transition-all group relative"
          title="Haz clic para ver los gráficos de tokenización y modelos IA"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Tokens IA ({metrics?.periodLabel || 'Mes'})
            </span>
            <Cpu className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-tabular">
            {(metrics?.costs.totalTokensPeriod || 0).toLocaleString('es-CO')}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block truncate mt-1">
            {(metrics?.costs.tokensPerConversation || 0).toLocaleString('es-CO')} tok/chat · cuota {quotaPct}%
          </span>
          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
            Ver gráfico de tokens ↗
          </span>
        </div>

        {/* KPI 6: Por responder (Enlace directo al Inbox) */}
        <Link
          href="/inbox?view=por_responder"
          className={`p-4 rounded-2xl border shadow-xs transition hover:opacity-95 ${
            needsHumanCount > 0
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
              : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider">Por Responder</span>
            <MessageSquare
              className={`w-3.5 h-3.5 ${
                needsHumanCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
              }`}
            />
          </div>
          <div
            className={`text-2xl font-black font-tabular ${
              needsHumanCount > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'
            }`}
          >
            {needsHumanCount}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <span>{needsHumanCount > 0 ? 'Requiere atención' : 'Bandeja al día'}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </Link>
      </div>

      {/* Modal / Vista Detallada de KPIs (Drill-Down) */}
      {activeTab && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
          <div className="bg-white dark:bg-[#131722] rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-[#232A3B] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header del Modal con Pestañas */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-[#232A3B] flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-[#090A0F]/50">
              <div className="flex items-center gap-2 overflow-x-auto max-w-[85%] [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setActiveTab('tokens')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === 'tokens'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-[#232A3B]'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Tokenización IA</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('conversion')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === 'conversion'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-[#232A3B]'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Conversión & Embudo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('autonomy')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === 'autonomy'
                      ? 'bg-[#0052FF] text-white shadow-xs'
                      : 'bg-white dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-[#232A3B]'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Autonomía & Relevos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('sales')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === 'sales'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-[#232A3B]'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Cierres</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido según la pestaña activa */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-200 text-xs">
              {/* TAB 1: TOKENIZACIÓN IA (100% Tokens, Cero Costos Monetarios) */}
              {activeTab === 'tokens' && (
                <div className="space-y-5 animate-in fade-in">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-500" />
                      <span>Análisis Gráfico de Tokenización del Motor IA</span>
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Monitoreo técnico de consumo de tokens y distribución de modelos durante {metrics?.periodLabel || 'el periodo'}.
                    </p>
                  </div>

                  {/* Tarjetas de Resumen Técnico */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Tokens</span>
                      <p className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5">
                        {totalTokens.toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Promedio / Chat</span>
                      <p className="text-base font-black font-mono text-[#0052FF] dark:text-[#00D2FF] mt-0.5">
                        {(metrics?.costs.tokensPerConversation || 0).toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Interacciones IA</span>
                      <p className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5">
                        {(metrics?.costs.totalRunsPeriod || 0).toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#090A0F] p-3 rounded-xl border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Cuota Usada</span>
                      <p className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {quotaPct}%
                      </p>
                    </div>
                  </div>

                  {/* Tarjeta de Modelo IA Único y Unificado */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-[#0052FF]" />
                        <span>Motor de Inteligencia Artificial</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Activo · 100% Operacional
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-900 dark:text-white">
                            Synqo IA
                          </p>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-[#0052FF] dark:text-[#00D2FF] font-semibold">
                            Motor Neuronal Principal
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Optimizado para atención comercial en tiempo real, catalogación visual y respuestas ágiles.
                        </p>
                      </div>
                      <div className="text-right sm:border-l sm:border-slate-200 sm:dark:border-[#232A3B] sm:pl-4 shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Procesado</span>
                        <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                          {totalTokens.toLocaleString('es-CO')} <span className="text-xs font-normal text-slate-400">tok</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* GRÁFICO 1: Composición de Tokens (Entrada vs Salida) */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-500" />
                        <span>Flujo de Tokenización: Entrada (Contexto) vs Salida (Respuestas)</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Total: {totalTokens.toLocaleString('es-CO')} tok</span>
                    </div>

                    {/* Barra de progreso gráfica */}
                    <div className="h-5 w-full rounded-xl bg-slate-200 dark:bg-[#1E2433] overflow-hidden flex shadow-inner">
                      <div
                        style={{ width: `${Math.max(5, promptPct)}%` }}
                        className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-[10px] text-white font-bold transition-all duration-500"
                        title={`Tokens de Entrada (Prompt/Catálogo): ${promptTokensTotal.toLocaleString('es-CO')} (${promptPct}%)`}
                      >
                        {promptPct > 15 ? `${promptPct}% Entrada` : ''}
                      </div>
                      <div
                        style={{ width: `${Math.max(5, completionPct)}%` }}
                        className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 flex items-center justify-center text-[10px] text-white font-bold transition-all duration-500"
                        title={`Tokens de Salida (Respuestas): ${completionTokensTotal.toLocaleString('es-CO')} (${completionPct}%)`}
                      >
                        {completionPct > 15 ? `${completionPct}% Salida` : ''}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            Tokens de Entrada (Contexto)
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {promptTokensTotal.toLocaleString('es-CO')} tokens ({promptPct}%)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200/80 dark:border-[#232A3B]">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            Tokens de Salida (Respuestas)
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {completionTokensTotal.toLocaleString('es-CO')} tokens ({completionPct}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* GRÁFICO 2: Cuota de Tokenización Mensual */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#090A0F]/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Estado de Cuota Mensual de Tokens</span>
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {quotaPct}% utilizado
                      </span>
                    </div>

                    <div className="h-4 w-full rounded-xl bg-slate-200 dark:bg-[#1E2433] overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(3, quotaPct))}%` }}
                        className={`h-full transition-all duration-500 ${
                          quotaPct > 90
                            ? 'bg-rose-500'
                            : quotaPct > 70
                            ? 'bg-amber-500'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Usados: <strong className="font-mono text-slate-900 dark:text-white">{quotaUsed.toLocaleString('es-CO')}</strong></span>
                      <span>Límite mensual: <strong className="font-mono text-slate-900 dark:text-white">{quotaLimit.toLocaleString('es-CO')}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CONVERSIÓN & EMBUDO */}
              {activeTab === 'conversion' && (
                <div className="space-y-5 animate-in fade-in">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <span>Embudo Comercial de Conversión</span>
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Flujo de prospectos a través de las etapas del pipeline durante {metrics?.periodLabel || 'el periodo'}.
                    </p>
                  </div>

                  {/* Barras de Embudo */}
                  <div className="space-y-2.5 bg-slate-50/70 dark:bg-[#090A0F]/60 p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B]">
                    {[
                      { label: 'Nuevos Leads', count: funnel.nuevo, color: 'bg-blue-500' },
                      { label: 'Calificados', count: funnel.calificado, color: 'bg-purple-500' },
                      { label: 'Citas / Cotizados', count: funnel.cita_agendada, color: 'bg-amber-500' },
                      { label: 'Cierres Ganados', count: funnel.ganado, color: 'bg-emerald-500' },
                      { label: 'Perdidos', count: funnel.perdido, color: 'bg-slate-400' },
                    ].map((step, idx) => {
                      const pct = Math.max(3, Math.round((step.count / totalInFunnel) * 100));
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{step.label}</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              {step.count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-3 w-full bg-slate-200 dark:bg-[#1E2433] rounded-full overflow-hidden">
                            <div
                              className={`h-full ${step.color} rounded-full transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Motivos de Pérdida Frecuentes */}
                  {Array.isArray(metrics?.lostReasons) && metrics.lostReasons.length > 0 && (
                    <div className="space-y-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Principales Motivos de Pérdida
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {metrics.lostReasons.map((lr, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] flex items-center justify-between"
                          >
                            <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                              {lr.reason || 'Sin motivo especificado'}
                            </span>
                            <span className="font-mono font-bold text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/10">
                              {lr.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: AUTONOMÍA & RELEVOS */}
              {activeTab === 'autonomy' && (
                <div className="space-y-5 animate-in fade-in">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#0052FF]" />
                      <span>Autonomía de la IA & Motivos de Relevo</span>
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Proporción de conversaciones cerradas 100% por IA versus handoffs a asesores humanos.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-center space-y-1">
                      <span className="text-[11px] text-slate-500 font-semibold uppercase">Autonomía Pura</span>
                      <p className="text-3xl font-black text-[#0052FF] dark:text-[#00D2FF]">
                        {metrics?.aiPerformance.autonomyPct ?? 100}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {metrics?.aiPerformance.autonomousConversations || 0} chats resueltos sin intervención humana
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-center space-y-1">
                      <span className="text-[11px] text-slate-500 font-semibold uppercase">Velocidad de Respuesta IA</span>
                      <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        ~{Math.round((metrics?.aiPerformance.p50LatencyMs || 1800) / 1000)}s
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Tiempo de respuesta promedio ante preguntas del cliente
                      </p>
                    </div>
                  </div>

                  {/* Motivos de Relevo */}
                  {Array.isArray(metrics?.aiPerformance.handoffReasons) &&
                    metrics.aiPerformance.handoffReasons.length > 0 && (
                      <div className="space-y-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          Causas más comunes de intervención de un asesor
                        </span>
                        <div className="space-y-1.5">
                          {metrics.aiPerformance.handoffReasons.map((hr, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] flex items-center justify-between"
                            >
                              <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                                {hr.reason}
                              </span>
                              <span className="font-mono font-bold text-[#0052FF] dark:text-[#00D2FF]">
                                {hr.count} chats
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* TAB 4: CIERRES & VENTAS */}
              {activeTab === 'sales' && (
                <div className="space-y-5 animate-in fade-in">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>Rendimiento Financiero & Cierres Ganados</span>
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Ingresos generados por cierres comerciales en {metrics?.periodLabel || 'el periodo'}.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Facturado</span>
                      <p className="text-xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
                        ${(metrics?.salesRevenueInPeriod || 0).toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Cierres Totales</span>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                        {metrics?.wonInPeriod || 0}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Ticket Promedio</span>
                      <p className="text-xl font-black text-[#0052FF] dark:text-[#00D2FF] font-mono mt-0.5">
                        ${(metrics?.avgTicketUsdOrCop || 0).toLocaleString('es-CO')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con Botón de Cierre */}
            <div className="p-3.5 border-t border-slate-100 dark:border-[#232A3B] flex items-center justify-end bg-slate-50/50 dark:bg-[#090A0F]/50 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0052FF] text-white hover:bg-[#0043D4] transition cursor-pointer"
              >
                Cerrar vista detallada
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
