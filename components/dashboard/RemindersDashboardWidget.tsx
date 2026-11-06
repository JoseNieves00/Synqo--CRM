'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Clock,
  Package,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  Check,
  Loader2,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  completeContactReminder,
  type ReminderItemView,
} from '@/app/actions/reminders';

interface RemindersDashboardWidgetProps {
  initialData: {
    overdue: ReminderItemView[];
    today: ReminderItemView[];
    upcoming: ReminderItemView[];
    totalPending: number;
  };
  currentUserRole?: string;
  currentUserId?: string;
}

export function RemindersDashboardWidget({
  initialData,
  currentUserRole = 'agent',
  currentUserId,
}: RemindersDashboardWidgetProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdminOrSupervisor = currentUserRole === 'admin' || currentUserRole === 'supervisor';

  const filterList = (items: ReminderItemView[]) => {
    return items.filter((item) => {
      if (completedIds.has(item.id)) return false;
      if (filterMode === 'mine' && currentUserId && item.assignedTo !== currentUserId) {
        return false;
      }
      return true;
    });
  };

  const overdue = filterList(initialData.overdue);
  const today = filterList(initialData.today);
  const upcoming = filterList(initialData.upcoming);
  const totalPending = overdue.length + today.length + upcoming.length;

  const handleComplete = async (reminderId: string, contactId: string) => {
    if (completingId) return;
    setCompletingId(reminderId);

    try {
      await completeContactReminder(contactId, reminderId);
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.add(reminderId);
        return next;
      });
    } catch (err: any) {
      console.error('[Complete reminder error]:', err);
      alert(err?.message || 'Error al completar recordatorio');
    } finally {
      setCompletingId(null);
    }
  };

  const renderReminderCard = (item: ReminderItemView) => {
    const isOverdue = item.isOverdue;
    const isToday = item.isToday;
    const isCompleting = completingId === item.id;

    const date = new Date(item.scheduledFor);
    const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = date.toLocaleDateString([], { day: 'numeric', month: 'short' });

    return (
      <div
        key={item.id}
        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
          isOverdue
            ? 'bg-rose-50/40 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/30'
            : isToday
            ? 'bg-amber-50/40 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/30'
            : 'bg-white dark:bg-[#0E121B] border-slate-200 dark:border-[#232A3B]'
        }`}
      >
        <div className="space-y-2">
          {/* Fila Superior: Tipo, Badge de Urgencia y Hora */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${
                  item.reminderType === 'shipping'
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                    : item.reminderType === 'reactivation'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                    : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20'
                }`}
              >
                {item.reminderType === 'shipping' ? (
                  <Package className="w-3 h-3" />
                ) : item.reminderType === 'reactivation' ? (
                  <RotateCcw className="w-3 h-3" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
                <span>
                  {item.reminderType === 'shipping'
                    ? 'Despacho / Envío'
                    : item.reminderType === 'reactivation'
                    ? 'Reactivación'
                    : 'Recordatorio'}
                </span>
              </span>

              {isOverdue ? (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 px-1.5 py-0.2 rounded border border-rose-300 dark:border-rose-500/30 animate-pulse">
                  Vencido
                </span>
              ) : isToday ? (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-500/30">
                  Para Hoy
                </span>
              ) : null}
            </div>

            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold shrink-0">
              {isToday ? `Hoy ${timeFormatted}` : `${dateFormatted} ${timeFormatted}`}
            </span>
          </div>

          {/* Fila Cliente & Teléfono */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {item.contactName || 'Cliente sin nombre'}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {item.contactPhone}
            </p>
          </div>

          {/* Nota del Asesor */}
          {item.note && (
            <div className="p-2 rounded-lg bg-slate-100/80 dark:bg-[#1A1F2C]/80 border border-slate-200/60 dark:border-[#232A3B]/60 text-[11px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
              &quot;{item.note}&quot;
            </div>
          )}

          {/* Asesor Asignado */}
          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">
              Asignado a: <strong className="text-slate-700 dark:text-slate-300">{item.assignedName || 'Sin Asignar'}</strong>
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-[#232A3B]/60">
          <button
            type="button"
            onClick={() => handleComplete(item.id, item.contactId)}
            disabled={isCompleting}
            title="Marcar recordatorio como atendido y completado"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
          >
            {isCompleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>Completar</span>
          </button>

          <Link
            href={`/inbox/${item.contactId}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] hover:bg-blue-100 dark:hover:bg-[#0052FF]/20 border border-blue-200 dark:border-[#00D2FF]/30 transition"
          >
            <span>Ir al Chat</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl p-5 space-y-4 shadow-xs transition-colors">
      {/* Cabecera del Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#232A3B] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Recordatorios y Despachos Pendientes
              </h3>
              {totalPending > 0 && (
                <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                  {totalPending} {totalPending === 1 ? 'pendiente' : 'pendientes'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Control comercial para recontactar clientes y despachar pedidos a tiempo.
            </p>
          </div>
        </div>

        {/* Filtros: Todos los asesores vs Mis recordatorios */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isAdminOrSupervisor && (
            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-[#090A0F] p-0.5 border border-slate-200 dark:border-[#232A3B] text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mine')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  filterMode === 'mine'
                    ? 'bg-white dark:bg-[#1A1F2C] text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mis Recordatorios
              </button>
            </div>
          )}

          <Link
            href="/inbox"
            className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232A3B] hover:bg-slate-50 dark:hover:bg-[#1A1F2C] transition shrink-0"
          >
            <span>Ir al Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Contenido: Si no hay recordatorios */}
      {totalPending === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-[#0E121B] rounded-xl border border-dashed border-slate-200 dark:border-[#232A3B]">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            ¡Todo al día! No tienes recordatorios comerciales ni despachos pendientes.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Puedes programar recordatorios de envío o seguimiento con 1 clic desde la barra superior del chat en el Inbox.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Recordatorios Vencidos (Atención Inmediata) */}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Atención Inmediata / Vencidos ({overdue.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {overdue.map(renderReminderCard)}
              </div>
            </div>
          )}

          {/* 2. Recordatorios de Hoy */}
          {today.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Para Hoy ({today.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {today.map(renderReminderCard)}
              </div>
            </div>
          )}

          {/* 3. Próximos Días */}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>Próximos Días ({upcoming.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.map(renderReminderCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
