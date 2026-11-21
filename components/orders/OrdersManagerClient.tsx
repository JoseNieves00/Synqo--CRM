'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  AlertCircle,
  XCircle,
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  MapPin,
  CreditCard,
  User,
  Bot,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { updateOrderStatusAction, type OrderListItem } from '@/app/actions/crm';
import type { OrderStatus } from '@/lib/crm/constants';

interface Props {
  initialOrders: OrderListItem[];
  initialStats: {
    totalRevenue: number;
    totalOrders: number;
    pendingValidation: number;
    confirmedToShip: number;
    paid: number;
    delivered: number;
    cancelled: number;
  };
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; badgeBg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'Por Validar Pago',
    color: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40',
    icon: Clock,
  },
  confirmed: {
    label: 'Por Despachar',
    color: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40',
    icon: ShoppingBag,
  },
  paid: {
    label: 'Pagado',
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40',
    icon: CheckCircle2,
  },
  delivered: {
    label: 'Entregado',
    color: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40',
    icon: Truck,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-rose-600 dark:text-rose-400',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40',
    icon: XCircle,
  },
};

export function OrdersManagerClient({ initialOrders, initialStats }: Props) {
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);
  const [stats, setStats] = useState(initialStats);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatusAction({ orderId, status: nextStatus });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updated_at: new Date().toISOString() } : o))
      );
    } catch (err: any) {
      alert(`Error actualizando pedido: ${err.message || 'Error desconocido'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (selectedStatus !== 'all' && order.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = order.customer_name?.toLowerCase().includes(q);
      const matchPhone = order.customer_phone?.toLowerCase().includes(q);
      const matchCity = order.city?.toLowerCase().includes(q);
      const matchNotes = order.notes?.toLowerCase().includes(q);
      const matchItem = order.items.some((it) => it.product_name?.toLowerCase().includes(q));
      return matchName || matchPhone || matchCity || matchNotes || matchItem;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0052FF]/10 text-[#0052FF]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Gestión de Pedidos</h1>
              <p className="text-xs text-slate-500">
                Control operativo de órdenes de productos, despachos y validación de transferencias.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/inbox"
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1F2C] dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 transition"
          >
            <MessageSquare className="w-4 h-4 text-[#0052FF]" />
            <span>Ir al Inbox</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Ventas Cobradas (LTV)
          </span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white">
            ${stats.totalRevenue.toLocaleString('es-CO')} <span className="text-xs font-normal text-slate-400">COP</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Pedidos pagados y entregados
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Por Validar Pago
          </span>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
            {stats.pendingValidation}
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">
            Comprobante pendiente de revisión
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Por Despachar
          </span>
          <div className="text-xl font-extrabold text-[#0052FF] dark:text-[#00D2FF]">
            {stats.confirmedToShip}
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">
            Listos para empaque o mensajería
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Histórico
          </span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white">
            {stats.totalOrders}
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">
            Órdenes registradas en el CRM
          </span>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        {/* Segmented control de estados */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              selectedStatus === 'all'
                ? 'bg-[#0052FF] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]'
            }`}
          >
            Todos ({orders.length})
          </button>
          {(['pending', 'confirmed', 'paid', 'delivered', 'cancelled'] as OrderStatus[]).map((st) => {
            const count = orders.filter((o) => o.status === st).length;
            const cfg = STATUS_CONFIG[st];
            return (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  selectedStatus === st
                    ? 'bg-[#0052FF] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1F2C]'
                }`}
              >
                <span>{cfg.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedStatus === st ? 'bg-white/20 text-white' : 'bg-slate-200/60 dark:bg-[#232A3B] text-slate-600 dark:text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Buscador */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, ciudad, producto..."
            className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] transition"
          />
        </div>
      </div>

      {/* Lista de Pedidos */}
      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-[#232A3B] bg-slate-50/50 dark:bg-[#0E121B]">
          <ShoppingBag className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No se encontraron pedidos</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            {searchQuery
              ? 'No hay pedidos que coincidan con la búsqueda actual.'
              : 'Cuando los clientes confirmen compras por WhatsApp o el asesor registre un pedido, aparecerán listados aquí.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredOrders.map((order) => {
            const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            const isUpdating = updatingOrderId === order.id;

            return (
              <div
                key={order.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] hover:border-slate-300 dark:hover:border-[#2F374A] transition shadow-xs space-y-4"
              >
                {/* Fila Superior: Cliente + Estado + Total */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 font-bold">
                      <User className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {order.customer_name}
                        </h3>
                        {order.source === 'ai' ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/40 text-[#0052FF] dark:text-[#00D2FF] border border-indigo-200 dark:border-indigo-800/40 flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            IA WhatsApp
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 dark:bg-[#1E2433] text-slate-600 dark:text-slate-300">
                            Asesor
                          </span>
                        )}
                        {order.is_separe && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            🏷️ Plan Separe
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {order.customer_phone || 'Sin teléfono'} •{' '}
                        {new Date(order.created_at).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        {order.is_separe ? 'Total Plan Separe' : 'Total Pedido'}
                      </span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">
                        ${order.total.toLocaleString('es-CO')}{' '}
                        <span className="text-xs font-normal text-slate-400">COP</span>
                      </span>
                      {order.is_separe && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          Abono: <span className="text-emerald-600 dark:text-emerald-400 font-bold">${(order.deposit_paid || 0).toLocaleString('es-CO')}</span> · Saldo: <span className="text-amber-600 dark:text-amber-400 font-bold">${(order.balance_due || Math.max(0, order.total - (order.deposit_paid || 0))).toLocaleString('es-CO')}</span>
                        </div>
                      )}
                    </div>

                    {/* Selector de Estado Rápido */}
                    <div className="relative">
                      <select
                        value={order.status}
                        disabled={isUpdating}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border appearance-none pr-7 cursor-pointer transition focus:outline-none ${statusCfg.badgeBg} ${statusCfg.color}`}
                      >
                        <option value="pending">⏳ Por Validar Pago</option>
                        <option value="confirmed">📦 Por Despachar</option>
                        <option value="paid">💳 Pagado</option>
                        <option value="delivered">🚚 Entregado</option>
                        <option value="cancelled">❌ Cancelado</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                    </div>
                  </div>
                </div>

                {/* Ítems del Pedido */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E121B] border border-slate-100 dark:border-[#1E2433] space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Productos del Pedido ({order.items.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {order.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shadow-xs"
                      >
                        <span className="w-5 h-5 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-[10px] font-extrabold flex items-center justify-center">
                          {it.quantity}x
                        </span>
                        <span>{it.product_name}</span>
                        {it.unit_price && (
                          <span className="text-slate-400 text-[11px] font-mono">
                            (${Number(it.unit_price).toLocaleString('es-CO')})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Datos de Despacho, Pago y Notas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Despacho</span>
                      <span>
                        {order.address || 'Sin dirección registrada'}
                        {order.city ? `, ${order.city}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <CreditCard className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Medio de Pago</span>
                      <span>{order.payment_method || 'A convenir con asesor'}</span>
                    </div>
                  </div>

                  {order.notes && (
                    <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px]">
                      <span className="font-bold block mb-0.5">Notas del Pedido:</span>
                      <p>{order.notes}</p>
                    </div>
                  )}
                </div>

                {/* Botones de Acción */}
                <div className="pt-2 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-end gap-2">
                  {order.customer_phone && (
                    <a
                      href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp Directo</span>
                    </a>
                  )}

                  <Link
                    href={`/inbox?contactId=${order.contact_id}`}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir Chat en Inbox</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
