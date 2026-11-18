'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  CreditCard,
  Truck,
  Image as ImageIcon,
  Clock,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  X,
  CheckCircle2,
} from 'lucide-react';
import type { DashboardSmartTip } from '@/services/dashboard-tips.service';

interface DashboardSmartTipsWidgetProps {
  tips: DashboardSmartTip[];
}

export function DashboardSmartTipsWidget({ tips = [] }: DashboardSmartTipsWidgetProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('synqo_dismissed_dashboard_tips');
      if (stored) {
        setDismissedIds(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDismiss = (id: string) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    try {
      localStorage.setItem('synqo_dismissed_dashboard_tips', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const visibleTips = tips.filter((t) => !dismissedIds.includes(t.id));

  if (visibleTips.length === 0) {
    return (
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              ¡Tu configuración y prompt están al 100%!
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cuentas oficiales, políticas de flete y catálogo están operando de forma óptima sin fricciones.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'payments':
        return <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'shipping':
        return <Truck className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'gallery':
        return <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'follow_ups':
        return <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case 'friction':
        return <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'operational':
        return <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#0052FF]" />;
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
            Alto Impacto
          </span>
        );
      case 'medium':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
            Optimización
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            Operativo
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-[#0052FF] dark:text-[#00D2FF] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Recomendaciones & Tips Clave
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1E2433] text-slate-600 dark:text-slate-300">
                {visibleTips.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Diagnóstico automático de tu negocio para cerrar más ventas y evitar fricciones operativas.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTips.map((tip) => (
          <div
            key={tip.id}
            className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B] hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col justify-between gap-3 relative group"
          >
            <button
              type="button"
              onClick={() => handleDismiss(tip.id)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition opacity-0 group-hover:opacity-100 p-1"
              title="Descartar recomendación"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-white dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] shrink-0">
                  {getCategoryIcon(tip.category)}
                </div>
                {getImpactBadge(tip.impact)}
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                {tip.title}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                {tip.description}
              </p>
            </div>

            {tip.actionHref && tip.actionLabel && (
              <Link
                href={tip.actionHref}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0052FF] dark:text-[#00D2FF] hover:underline pt-1 self-start"
              >
                <span>{tip.actionLabel}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
