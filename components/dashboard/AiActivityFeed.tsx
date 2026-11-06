'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Bot,
  Zap,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Cpu,
  Layers,
} from 'lucide-react';
import {
  type AiActivityItem,
  type AiActivityStats,
  getRecentAiActivity,
} from '@/app/actions/ai-activity';

interface AiActivityFeedProps {
  initialItems: AiActivityItem[];
  initialStats: AiActivityStats;
}

export function AiActivityFeed({
  initialItems,
  initialStats,
}: AiActivityFeedProps) {
  const [items, setItems] = useState<AiActivityItem[]>(initialItems);
  const [stats, setStats] = useState<AiActivityStats>(initialStats);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      try {
        const fresh = await getRecentAiActivity(20);
        setItems(fresh.items);
        setStats(fresh.stats);
      } catch (e) {
        console.error('Error refreshing AI activity', e);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Exitoso
          </span>
        );
      case 'fallback':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Fallback
          </span>
        );
      case 'failed':
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `hace ${diffSec}s`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `hace ${diffMin}m`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `hace ${diffHour}h`;
      return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
      {/* Encabezado con Stats en vivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Observabilidad de la IA en Vivo
              </h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                Autónomo
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Auditoría de ejecuciones, modelos utilizados y latencias por prospecto.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="Actualizar registro"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* Mini Métricas del Día */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Respuestas Hoy</span>
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {stats.totalRunsToday}
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Latencia Promedio</span>
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {stats.avgLatencyMs ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Efectividad</span>
          </div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.successRate}%
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            <span>Tokens Utilizados</span>
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {stats.totalTokensToday.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Lista de Ejecuciones Recientes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
          <span>Últimas Respuestas Autónomas</span>
          <span>Modelo & Canal</span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60">
            <Bot className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              No hay ejecuciones de IA registradas aún hoy.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Cuando los leads interactúen por WhatsApp o Instagram, verás aquí cada respuesta con sus métricas.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="py-2.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg flex items-center justify-between gap-3 text-xs transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {getStatusBadge(item.status)}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.contactId ? (
                        <Link
                          href={`/inbox/${item.contactId}`}
                          className="font-semibold text-slate-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 truncate flex items-center gap-1"
                        >
                          <span>{item.contactName || item.contactPhone || 'Lead anónimo'}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {item.contactName || item.contactPhone || 'Lead'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{formatTimeAgo(item.createdAt)}</span>
                      <span>•</span>
                      <span>{item.latencyMs ? `${item.latencyMs}ms` : '—'}</span>
                      <span>•</span>
                      <span>{item.totalTokens ? `${item.totalTokens} tokens` : '0 tks'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-right">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      <Cpu className="w-3 h-3 text-slate-400" />
                      {item.model || item.provider || 'gemini'}
                    </span>
                    <span className="text-[10px] text-slate-400 capitalize mt-0.5">
                      {item.channel.replace('whatsapp_', '')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
