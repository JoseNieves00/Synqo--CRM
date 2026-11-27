'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  ExternalLink,
  MessageSquare,
  MapPin,
  CreditCard,
  User,
  Bot,
  ChevronDown,
  Trash2,
  Pencil,
  Upload,
  Eye,
  X,
  Send,
  FileText,
} from 'lucide-react';
import {
  listOrdersAction,
  updateOrderStatusAction,
  updateOrderDetailsAction,
  updateOrderTrackingAction,
  deleteOrderAction,
  type OrderListItem,
} from '@/app/actions/crm';
import { matchesOrderSearchQuery } from '@/lib/crm/order-search';
import type { OrderStatus } from '@/lib/crm/constants';

interface Props {
  initialOrders: OrderListItem[];
  initialStats: {
    totalRevenue: number;
    totalOrders: number;
    pendingValidation: number;
    confirmedToShip: number;
    paid: number;
    shipped?: number;
    delivered: number;
    cancelled: number;
  };
  shippingCarriers?: string[];
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
  shipped: {
    label: 'En Camino',
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/40',
    icon: Truck,
  },
  delivered: {
    label: 'Entregado',
    color: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-rose-600 dark:text-rose-400',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40',
    icon: XCircle,
  },
};

function isContraentregaOrder(order: OrderListItem): boolean {
  return /contra\s*entrega/i.test(String(order.payment_method || ''));
}

export function OrdersManagerClient({ initialOrders, initialStats, shippingCarriers = [] }: Props) {
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);
  const [stats, setStats] = useState(initialStats);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | 'cod' | 'separe' | 'prepaid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifyOnStatusChange, setNotifyOnStatusChange] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modales: Detalles/Edición, Guía/Despacho, Eliminación doble verificación
  const [detailOrder, setDetailOrder] = useState<OrderListItem | null>(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_phone: '',
    city: '',
    address: '',
    payment_method: '',
    notes: '',
    subtotal: '0',
    shipping_cost: '0',
    total: '0',
  });

  const [guideOrder, setGuideOrder] = useState<OrderListItem | null>(null);
  const [guideCarrier, setGuideCarrier] = useState('');
  const [guideTracking, setGuideTracking] = useState('');
  const [guideMarkShipped, setGuideMarkShipped] = useState(true);
  const [guideNotifyClient, setGuideNotifyClient] = useState(true);
  const [guideFile, setGuideFile] = useState<{ base64: string; name: string; mime: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OrderListItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isSavingModal, setIsSavingModal] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 4500);
  };

  React.useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setOrders(initialOrders);
      return;
    }
    const timer = setTimeout(() => {
      listOrdersAction({ status: selectedStatus, search: q, limit: 300 })
        .then((res) => {
          setOrders(res.orders);
          setStats(res.stats);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedStatus, initialOrders]);

  const refreshFromServer = async () => {
    const res = await listOrdersAction({
      status: selectedStatus,
      search: searchQuery.trim() || undefined,
      limit: searchQuery.trim() ? 300 : 100,
    });
    setOrders(res.orders);
    setStats(res.stats);
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await updateOrderStatusAction({
        orderId,
        status: nextStatus,
        notifyCustomer: notifyOnStatusChange,
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updated_at: new Date().toISOString() } : o))
      );
      if (notifyOnStatusChange) {
        showToast(
          res.customerNotified
            ? 'Estado actualizado y cliente notificado por WhatsApp.'
            : `Estado actualizado (${res.notifyWarning || 'sin notificación WhatsApp'}).`
        );
      }
      refreshFromServer().catch(() => {});
    } catch (err: any) {
      alert(`Error actualizando pedido: ${err.message || 'Error desconocido'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const openDetailsModal = (order: OrderListItem, editMode = false) => {
    setDetailOrder(order);
    setIsEditingDetail(editMode);
    setEditForm({
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      city: order.city || '',
      address: order.address || '',
      payment_method: order.payment_method || '',
      notes: order.notes || '',
      subtotal: String(order.subtotal || order.total || 0),
      shipping_cost: String(order.shipping_cost || 0),
      total: String(order.total || 0),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailOrder) return;
    setIsSavingModal(true);
    try {
      const sub = Math.max(0, Number(editForm.subtotal) || 0);
      const ship = Math.max(0, Number(editForm.shipping_cost) || 0);
      const tot = Math.max(0, Number(editForm.total) || sub + ship);
      await updateOrderDetailsAction({
        orderId: detailOrder.id,
        customer_name: editForm.customer_name,
        customer_phone: editForm.customer_phone,
        city: editForm.city,
        address: editForm.address,
        payment_method: editForm.payment_method,
        notes: editForm.notes,
        subtotal: sub,
        shipping_cost: ship,
        total: tot,
      });
      await refreshFromServer();
      setDetailOrder(null);
      showToast('Datos del pedido actualizados.');
    } catch (err: any) {
      alert(err.message || 'Error guardando cambios');
    } finally {
      setIsSavingModal(false);
    }
  };

  const openGuideModal = (order: OrderListItem) => {
    setGuideOrder(order);
    setGuideCarrier(order.carrier || shippingCarriers[0] || '');
    setGuideTracking(order.tracking_number || '');
    setGuideMarkShipped(true);
    setGuideNotifyClient(true);
    setGuideFile(null);
  };

  const handleGuideFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setGuideFile({
        base64: String(reader.result || ''),
        name: file.name,
        mime: file.type || 'image/jpeg',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guideOrder) return;
    setIsSavingModal(true);
    try {
      const res = await updateOrderTrackingAction({
        orderId: guideOrder.id,
        carrier: guideCarrier,
        trackingNumber: guideTracking,
        guideFileBase64: guideFile?.base64,
        guideFileName: guideFile?.name,
        guideMimeType: guideFile?.mime,
        markAsShipped: guideMarkShipped,
        notifyCustomer: guideNotifyClient,
      });
      await refreshFromServer();
      setGuideOrder(null);
      showToast(
        guideNotifyClient
          ? res.customerNotified
            ? 'Guía guardada y enviada al cliente por WhatsApp.'
            : `Guía guardada (${res.notifyWarning || 'sin envío WhatsApp'}).`
          : 'Guía de envío guardada.'
      );
    } catch (err: any) {
      alert(err.message || 'Error guardando guía');
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') return;
    setIsSavingModal(true);
    try {
      await deleteOrderAction({ orderId: deleteTarget.id });
      setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await refreshFromServer();
      showToast('Pedido eliminado con auditoría en el historial.');
    } catch (err: any) {
      alert(err.message || 'Error eliminando pedido');
    } finally {
      setIsSavingModal(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (selectedStatus !== 'all' && order.status !== selectedStatus) return false;
    if (modalityFilter === 'cod' && !isContraentregaOrder(order)) return false;
    if (modalityFilter === 'separe' && !order.is_separe) return false;
    if (modalityFilter === 'prepaid' && (isContraentregaOrder(order) || order.is_separe)) return false;
    return matchesOrderSearchQuery(order, searchQuery);
  });

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#0052FF]/10 text-[#0052FF]">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Gestión de Pedidos</h1>
            <p className="text-xs text-slate-500">
              Despachos, contraentrega, guías de transportadora y seguimiento al cliente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] px-3 py-1.5 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOnStatusChange}
              onChange={(e) => setNotifyOnStatusChange(e.target.checked)}
              className="rounded border-slate-300 text-[#0052FF] focus:ring-[#0052FF]"
            />
            <Send className="w-3.5 h-3.5 text-[#0052FF]" />
            <span>Avisar al cliente al cambiar estado</span>
          </label>
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
            Pagados y contraentregas cobradas
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Por Despachar
          </span>
          <div className="text-xl font-extrabold text-[#0052FF] dark:text-[#00D2FF]">{stats.confirmedToShip}</div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">Listos para guía o mensajería</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            En Camino
          </span>
          <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{stats.shipped || 0}</div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">Con transportadora asignada</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Por Validar Pago
          </span>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{stats.pendingValidation}</div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 block">
            Total histórico: {stats.totalOrders} pedidos
          </span>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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
            {(['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map((st) => {
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
                  <span
                    className={`text-[10px] px-1.5 rounded-full ${
                      selectedStatus === st
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/60 dark:bg-[#232A3B] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente, teléfono, ciudad..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0052FF] transition"
            />
          </div>
        </div>

        {/* Filtro rápido por modalidad */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400 font-semibold">Modalidad:</span>
          {[
            { id: 'all', label: 'Todas' },
            { id: 'cod', label: '💵 Contraentrega' },
            { id: 'separe', label: '🏷️ Plan Separe' },
            { id: 'prepaid', label: '💳 Anticipado / Transferencia' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModalityFilter(m.id as any)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                modalityFilter === m.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300'
              }`}
            >
              {m.label}
            </button>
          ))}
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
            const isCod = isContraentregaOrder(order);
            const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const isUpdating = updatingOrderId === order.id;

            const statusOptions: Array<{ value: OrderStatus; label: string }> = isCod
              ? [
                  ...(order.status === 'pending' ? [{ value: 'pending' as const, label: '⏳ Por Validar' }] : []),
                  { value: 'confirmed', label: '📦 Por Despachar (Contraentrega)' },
                  { value: 'shipped', label: '🚚 En Camino (Con guía)' },
                  { value: 'delivered', label: '✅ Entregado y Cobrado' },
                  { value: 'cancelled', label: '❌ Cancelado' },
                ]
              : [
                  { value: 'pending', label: '⏳ Por Validar Pago' },
                  { value: 'confirmed', label: '📦 Por Despachar' },
                  { value: 'paid', label: '💳 Pagado' },
                  { value: 'shipped', label: '🚚 En Camino' },
                  { value: 'delivered', label: '✅ Entregado' },
                  { value: 'cancelled', label: '❌ Cancelado' },
                ];

            return (
              <div
                key={order.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] hover:border-slate-300 dark:hover:border-[#2F374A] transition shadow-xs space-y-4"
              >
                {/* Fila Superior */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{order.customer_name}</h3>
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
                        {isCod && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            💵 Contraentrega
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
                        {isCod ? 'Total a Cobrar al Entregar' : order.is_separe ? 'Total Plan Separe' : 'Total Pedido'}
                      </span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">
                        ${order.total.toLocaleString('es-CO')}{' '}
                        <span className="text-xs font-normal text-slate-400">COP</span>
                      </span>
                      {(order.shipping_cost || 0) > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Prod: ${(order.subtotal || order.total - (order.shipping_cost || 0)).toLocaleString('es-CO')} + Flete: $
                          {(order.shipping_cost || 0).toLocaleString('es-CO')}
                        </div>
                      )}
                      {order.is_separe && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          Abono:{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ${(order.deposit_paid || 0).toLocaleString('es-CO')}
                          </span>{' '}
                          · Saldo:{' '}
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            ${(order.balance_due || Math.max(0, order.total - (order.deposit_paid || 0))).toLocaleString('es-CO')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <select
                        value={order.status}
                        disabled={isUpdating}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border appearance-none pr-7 cursor-pointer transition focus:outline-none ${statusCfg.badgeBg} ${statusCfg.color}`}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                    </div>
                  </div>
                </div>

                {/* Ítems */}
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

                {/* Despacho, Pago y Guía */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Despacho</span>
                      <span>
                        {order.address || 'Sin dirección'}
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

                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Truck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Guía / Transportadora</span>
                      {order.carrier || order.tracking_number ? (
                        <span>
                          {order.carrier || 'Transportadora'}
                          {order.tracking_number ? ` · #${order.tracking_number}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">Sin guía cargada aún</span>
                      )}
                      {order.shipping_guide_url && (
                        <a
                          href={order.shipping_guide_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-[#0052FF] underline font-semibold"
                        >
                          Ver archivo
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {order.notes && (
                  <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px]">
                    <span className="font-bold">Notas:</span> {order.notes}
                  </div>
                )}

                {/* Botones de Acción */}
                <div className="pt-2 border-t border-slate-100 dark:border-[#1E2433] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openGuideModal(order)}
                      className="px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{order.tracking_number ? 'Actualizar Guía' : 'Subir Guía / Despachar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDetailsModal(order, false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detalles</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDetailsModal(order, true)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(order);
                        setDeleteConfirmText('');
                      }}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.customer_phone && (
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}

                    <Link
                      href={`/inbox?c=${order.contact_id}`}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Chat</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Detalles / Edición puntual */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0052FF]" />
                {isEditingDetail ? 'Editar Pedido (Corrección Puntual)' : 'Detalle Completo del Pedido'}
              </h3>
              <button type="button" onClick={() => setDetailOrder(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditingDetail ? (
              <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Nombre Cliente</label>
                    <input
                      value={editForm.customer_name}
                      onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Teléfono</label>
                    <input
                      value={editForm.customer_phone}
                      onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Ciudad / Municipio</label>
                    <input
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Medio de Pago</label>
                    <input
                      value={editForm.payment_method}
                      onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Dirección Completa</label>
                  <input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Subtotal Productos</label>
                    <input
                      type="number"
                      value={editForm.subtotal}
                      onChange={(e) => {
                        const sub = Number(e.target.value) || 0;
                        const ship = Number(editForm.shipping_cost) || 0;
                        setEditForm({ ...editForm, subtotal: e.target.value, total: String(sub + ship) });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Flete / Envío</label>
                    <input
                      type="number"
                      value={editForm.shipping_cost}
                      onChange={(e) => {
                        const ship = Number(e.target.value) || 0;
                        const sub = Number(editForm.subtotal) || 0;
                        setEditForm({ ...editForm, shipping_cost: e.target.value, total: String(sub + ship) });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Total</label>
                    <input
                      type="number"
                      value={editForm.total}
                      onChange={(e) => setEditForm({ ...editForm, total: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B] font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Notas</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsEditingDetail(false)} className="px-3 py-2 rounded-xl text-slate-500 cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingModal}
                    className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    {isSavingModal ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E121B] space-y-1">
                  <div><strong>Cliente:</strong> {detailOrder.customer_name} ({detailOrder.customer_phone || 'Sin tel'})</div>
                  <div><strong>Ciudad / Dirección:</strong> {detailOrder.city || '—'} · {detailOrder.address || '—'}</div>
                  <div><strong>Pago:</strong> {detailOrder.payment_method || 'Por definir'}</div>
                  <div><strong>Desglose:</strong> Subtotal ${(detailOrder.subtotal || detailOrder.total).toLocaleString('es-CO')} + Flete ${(detailOrder.shipping_cost || 0).toLocaleString('es-CO')} = <strong>${detailOrder.total.toLocaleString('es-CO')} COP</strong></div>
                  {detailOrder.carrier && (
                    <div><strong>Transportadora / Guía:</strong> {detailOrder.carrier} {detailOrder.tracking_number ? `(#${detailOrder.tracking_number})` : ''}</div>
                  )}
                  {detailOrder.shipping_guide_url && (
                    <div>
                      <a href={detailOrder.shipping_guide_url} target="_blank" rel="noopener noreferrer" className="text-[#0052FF] underline font-semibold">
                        Abrir comprobante / guía adjunta
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingDetail(true)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] font-semibold cursor-pointer"
                  >
                    Editar datos
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailOrder(null)}
                    className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-bold cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Subir Guía y Notificar Cliente */}
      {guideOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveGuide}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#0052FF]" />
                Subir Guía de Envío ({guideOrder.customer_name})
              </h3>
              <button type="button" onClick={() => setGuideOrder(null)} className="text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="font-semibold block mb-1">Transportadora (desde Políticas de Envío)</label>
              {shippingCarriers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {shippingCarriers.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGuideCarrier(c)}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        guideCarrier === c
                          ? 'bg-[#0052FF] text-white'
                          : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <input
                required
                value={guideCarrier}
                onChange={(e) => setGuideCarrier(e.target.value)}
                placeholder="Ej: Interrapidísimo, Servientrega..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Número de Guía</label>
              <input
                value={guideTracking}
                onChange={(e) => setGuideTracking(e.target.value)}
                placeholder="Ej: 700123456789"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Foto o PDF de la Guía (Opcional)</label>
              <input type="file" accept="image/*,application/pdf" onChange={handleGuideFileChange} className="w-full text-[11px]" />
              {guideFile && <p className="text-emerald-600 mt-1">Archivo listo: {guideFile.name}</p>}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={guideMarkShipped}
                onChange={(e) => setGuideMarkShipped(e.target.checked)}
                className="rounded border-slate-300 text-[#0052FF]"
              />
              <span>Marcar pedido como <strong>En Camino</strong></span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={guideNotifyClient}
                onChange={(e) => setGuideNotifyClient(e.target.checked)}
                className="rounded border-slate-300 text-[#0052FF]"
              />
              <span>Enviar guía y estado al cliente por WhatsApp</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setGuideOrder(null)} className="px-3 py-2 text-slate-500 cursor-pointer">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingModal}
                className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-bold cursor-pointer disabled:opacity-50"
              >
                {isSavingModal ? 'Guardando...' : 'Guardar y Despachar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Eliminar Pedido con Doble Verificación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131722] border border-rose-200 dark:border-rose-900/50 p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Confirmar Eliminación de Pedido
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              Vas a eliminar el pedido de <strong>{deleteTarget.customer_name}</strong> por{' '}
              <strong>${deleteTarget.total.toLocaleString('es-CO')} COP</strong>. Esta acción recalculará el valor del cliente y no se puede deshacer.
            </p>
            <div>
              <label className="font-semibold block mb-1">
                Escribe <span className="font-mono text-rose-600">ELIMINAR</span> para confirmar:
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-3 py-2 text-slate-500 cursor-pointer">
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingModal || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR'}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:opacity-40"
              >
                {isSavingModal ? 'Eliminando...' : 'Eliminar Definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
