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
  X,
  Send,
  FileText,
  SlidersHorizontal,
  Copy,
  Check,
  AlertTriangle,
  StickyNote,
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

  // Modal unificado de Gestión de Pedido
  type ModalTab = 'summary' | 'edit' | 'guide' | 'danger';
  const [activeOrder, setActiveOrder] = useState<OrderListItem | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('summary');
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

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
    deposit_paid: '0',
    balance_due: '0',
  });

  const [guideCarrier, setGuideCarrier] = useState('');
  const [guideTracking, setGuideTracking] = useState('');
  const [guideMarkShipped, setGuideMarkShipped] = useState(true);
  const [guideNotifyClient, setGuideNotifyClient] = useState(true);
  const [guideFile, setGuideFile] = useState<{ base64: string; name: string; mime: string } | null>(null);

  const [modalStatus, setModalStatus] = useState<OrderStatus>('pending');
  const [modalCancelReason, setModalCancelReason] = useState('');
  const [modalStatusNotify, setModalStatusNotify] = useState(true);

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

  const refreshFromServer = async (keepOrderId?: string) => {
    const res = await listOrdersAction({
      status: selectedStatus,
      search: searchQuery.trim() || undefined,
      limit: searchQuery.trim() ? 300 : 100,
    });
    setOrders(res.orders);
    setStats(res.stats);
    if (keepOrderId) {
      const updated = res.orders.find((o) => o.id === keepOrderId) || null;
      setActiveOrder(updated);
    }
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
      refreshFromServer(activeOrder?.id === orderId ? orderId : undefined).catch(() => {});
    } catch (err: any) {
      alert(`Error actualizando pedido: ${err.message || 'Error desconocido'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const openOrderModal = (order: OrderListItem, initialTab: ModalTab = 'summary') => {
    setActiveOrder(order);
    setModalTab(initialTab);
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
      deposit_paid: String(order.deposit_paid || 0),
      balance_due: String(order.balance_due || Math.max(0, order.total - (order.deposit_paid || 0))),
    });
    setGuideCarrier(order.carrier || shippingCarriers[0] || '');
    setGuideTracking(order.tracking_number || '');
    setGuideMarkShipped(true);
    setGuideNotifyClient(true);
    setGuideFile(null);
    setModalStatus(order.status);
    setModalCancelReason('');
    setModalStatusNotify(notifyOnStatusChange);
    setDeleteConfirmText('');
  };

  const handleCopyShippingData = async (order: OrderListItem) => {
    const itemsText = order.items.map((it) => `${it.quantity}x ${it.product_name}`).join(', ');
    const isCod = isContraentregaOrder(order);
    const amountToCollect = order.is_separe
      ? order.balance_due || Math.max(0, order.total - (order.deposit_paid || 0))
      : order.total;
    const summary = [
      `Cliente: ${order.customer_name}`,
      `Teléfono: ${order.customer_phone || 'N/A'}`,
      `Ciudad: ${order.city || 'N/A'}`,
      `Dirección: ${order.address || 'N/A'}`,
      `Productos: ${itemsText || 'N/A'}`,
      `Pago: ${order.payment_method || 'Por definir'}`,
      isCod || order.is_separe
        ? `Valor a cobrar: $${Number(amountToCollect).toLocaleString('es-CO')} COP`
        : `Total: $${Number(order.total).toLocaleString('es-CO')} COP`,
      order.notes ? `Observaciones: ${order.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(summary);
      setCopiedOrderId(order.id);
      showToast('Datos de despacho copiados al portapapeles.');
      setTimeout(() => setCopiedOrderId((cur) => (cur === order.id ? null : cur)), 2000);
    } catch {
      showToast('No se pudo copiar al portapapeles.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setIsSavingModal(true);
    try {
      const sub = Math.max(0, Number(editForm.subtotal) || 0);
      const ship = Math.max(0, Number(editForm.shipping_cost) || 0);
      const tot = Math.max(0, Number(editForm.total) || sub + ship);
      const dep = Math.max(0, Number(editForm.deposit_paid) || 0);
      const bal = activeOrder.is_separe ? Math.max(0, Number(editForm.balance_due) || Math.max(0, tot - dep)) : 0;
      await updateOrderDetailsAction({
        orderId: activeOrder.id,
        customer_name: editForm.customer_name,
        customer_phone: editForm.customer_phone,
        city: editForm.city,
        address: editForm.address,
        payment_method: editForm.payment_method,
        notes: editForm.notes,
        subtotal: sub,
        shipping_cost: ship,
        total: tot,
        ...(activeOrder.is_separe ? { deposit_paid: dep, balance_due: bal } : {}),
      });
      await refreshFromServer(activeOrder.id);
      setModalTab('summary');
      showToast('Pedido y observaciones actualizados.');
    } catch (err: any) {
      alert(err.message || 'Error guardando cambios');
    } finally {
      setIsSavingModal(false);
    }
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
    if (!activeOrder) return;
    setIsSavingModal(true);
    try {
      const res = await updateOrderTrackingAction({
        orderId: activeOrder.id,
        carrier: guideCarrier,
        trackingNumber: guideTracking.trim() || undefined,
        guideFileBase64: guideFile?.base64,
        guideFileName: guideFile?.name,
        guideMimeType: guideFile?.mime,
        markAsShipped: guideMarkShipped,
        notifyCustomer: guideNotifyClient,
      });
      await refreshFromServer(activeOrder.id);
      setGuideFile(null);
      setModalTab('summary');
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

  const handleSaveModalStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setIsSavingModal(true);
    try {
      const res = await updateOrderStatusAction({
        orderId: activeOrder.id,
        status: modalStatus,
        notifyCustomer: modalStatusNotify,
        cancelReason: modalCancelReason.trim() || undefined,
      });
      await refreshFromServer(activeOrder.id);
      setModalCancelReason('');
      setModalTab('summary');
      showToast(
        modalStatusNotify
          ? res.customerNotified
            ? 'Estado actualizado y cliente notificado por WhatsApp.'
            : `Estado actualizado (${res.notifyWarning || 'sin notificación WhatsApp'}).`
          : 'Estado del pedido actualizado.'
      );
    } catch (err: any) {
      alert(err.message || 'Error actualizando estado');
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!activeOrder || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') return;
    setIsSavingModal(true);
    try {
      const deletedId = activeOrder.id;
      await deleteOrderAction({ orderId: deletedId });
      setOrders((prev) => prev.filter((o) => o.id !== deletedId));
      setActiveOrder(null);
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
                      onClick={() => openOrderModal(order, 'summary')}
                      className="px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Gestionar Pedido</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyShippingData(order)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232A3B] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                      title="Copiar datos de despacho para transportadora"
                    >
                      {copiedOrderId === order.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedOrderId === order.id ? 'Copiado' : 'Copiar Datos'}</span>
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

      {/* Modal Unificado: Gestionar Pedido (Resumen, Editar y Observaciones, Guía y Despacho, Estado y Eliminar) */}
      {activeOrder && (() => {
        const isCod = isContraentregaOrder(activeOrder);
        const statusCfg = STATUS_CONFIG[activeOrder.status] || STATUS_CONFIG.pending;
        const quickObservationChips = [
          'Llamar antes de entregar',
          'Entregar en portería',
          'Entrega en horario de la tarde',
          'Cliente confirma pago contraentrega en efectivo',
          'Revisar dirección exacta con el cliente',
        ];

        const modalStatusOptions: Array<{ value: OrderStatus; label: string }> = isCod
          ? [
              ...(activeOrder.status === 'pending' ? [{ value: 'pending' as const, label: '⏳ Por Validar' }] : []),
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
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSavingModal) setActiveOrder(null);
            }}
          >
            <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              {/* Header del Modal */}
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-[#1E2433] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {activeOrder.customer_name}
                    </h3>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusCfg.badgeBg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    {isCod && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                        Contraentrega
                      </span>
                    )}
                    {activeOrder.is_separe && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                        Plan Separe
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {activeOrder.customer_phone || 'Sin teléfono'} · Total: ${activeOrder.total.toLocaleString('es-CO')} COP
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSavingModal}
                  onClick={() => setActiveOrder(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Pestañas del Modal */}
              <div className="px-4 sm:px-5 pt-2.5 border-b border-slate-100 dark:border-[#1E2433] flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] bg-slate-50/60 dark:bg-[#0E121B]/60">
                {[
                  { id: 'summary' as const, label: 'Resumen', icon: FileText },
                  { id: 'edit' as const, label: 'Editar y Observaciones', icon: Pencil },
                  { id: 'guide' as const, label: 'Guía y Despacho', icon: Truck },
                  { id: 'danger' as const, label: 'Estado y Eliminar', icon: AlertTriangle },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = modalTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setModalTab(tab.id)}
                      className={`px-3 py-2 rounded-t-xl text-xs font-bold flex items-center gap-1.5 border-b-2 transition shrink-0 cursor-pointer ${
                        active
                          ? tab.id === 'danger'
                            ? 'border-rose-500 text-rose-600 dark:text-rose-400 bg-white dark:bg-[#131722]'
                            : 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF] bg-white dark:bg-[#131722]'
                          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Contenido Scrollable del Modal */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
                {modalTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E121B] border border-slate-100 dark:border-[#1E2433] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Datos de Entrega y Pago
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyShippingData(activeOrder)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer transition"
                        >
                          {copiedOrderId === activeOrder.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedOrderId === activeOrder.id ? 'Copiado' : 'Copiar para transportadora'}</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                        <div><strong>Cliente:</strong> {activeOrder.customer_name}</div>
                        <div><strong>Teléfono:</strong> {activeOrder.customer_phone || 'Sin teléfono'}</div>
                        <div><strong>Ciudad:</strong> {activeOrder.city || 'Sin ciudad'}</div>
                        <div><strong>Medio de pago:</strong> {activeOrder.payment_method || 'Por definir'}</div>
                        <div className="sm:col-span-2"><strong>Dirección:</strong> {activeOrder.address || 'Sin dirección'}</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E121B] border border-slate-100 dark:border-[#1E2433] space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Productos ({activeOrder.items.length}) y Valores
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {activeOrder.items.map((it, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-semibold text-slate-800 dark:text-slate-200"
                          >
                            {it.quantity}x {it.product_name}
                            {it.unit_price ? ` ($${Number(it.unit_price).toLocaleString('es-CO')})` : ''}
                          </span>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-slate-200/70 dark:border-[#232A3B] flex flex-wrap items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                        <span>
                          Subtotal: <strong>${(activeOrder.subtotal || activeOrder.total).toLocaleString('es-CO')}</strong> · Flete:{' '}
                          <strong>${(activeOrder.shipping_cost || 0).toLocaleString('es-CO')}</strong>
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Total: ${activeOrder.total.toLocaleString('es-CO')} COP
                        </span>
                      </div>
                      {activeOrder.is_separe && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          Abono recibido:{' '}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            ${(activeOrder.deposit_paid || 0).toLocaleString('es-CO')}
                          </strong>{' '}
                          · Saldo pendiente:{' '}
                          <strong className="text-amber-600 dark:text-amber-400">
                            ${(activeOrder.balance_due || Math.max(0, activeOrder.total - (activeOrder.deposit_paid || 0))).toLocaleString('es-CO')}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E121B] border border-slate-100 dark:border-[#1E2433] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Guía y Transportadora
                        </span>
                        <button
                          type="button"
                          onClick={() => setModalTab('guide')}
                          className="text-[11px] font-bold text-[#0052FF] hover:underline cursor-pointer"
                        >
                          {activeOrder.carrier || activeOrder.tracking_number || activeOrder.shipping_guide_url ? 'Actualizar guía' : 'Subir guía'}
                        </button>
                      </div>
                      {activeOrder.carrier || activeOrder.tracking_number || activeOrder.shipping_guide_url ? (
                        <div className="text-slate-700 dark:text-slate-300 space-y-1">
                          <div>
                            <strong>Transportadora:</strong> {activeOrder.carrier || 'Sin especificar'}
                            {activeOrder.tracking_number ? ` · Guía #${activeOrder.tracking_number}` : ' · (Sin # de guía)'}
                          </div>
                          {activeOrder.shipping_guide_url && (
                            <a
                              href={activeOrder.shipping_guide_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#0052FF] underline font-semibold"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Abrir comprobante / guía adjunta
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-400">Sin guía cargada aún.</p>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                          <StickyNote className="w-3.5 h-3.5" />
                          Observaciones del Pedido / Cliente
                        </span>
                        <button
                          type="button"
                          onClick={() => setModalTab('edit')}
                          className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                        >
                          {activeOrder.notes ? 'Editar observación' : 'Agregar observación'}
                        </button>
                      </div>
                      <p className="text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                        {activeOrder.notes || 'Sin observaciones registradas.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {activeOrder.customer_phone && (
                          <a
                            href={`https://wa.me/${activeOrder.customer_phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                        <Link
                          href={`/inbox?c=${activeOrder.contact_id}`}
                          className="px-3 py-2 rounded-xl bg-[#0052FF] text-white font-semibold flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir Chat</span>
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveOrder(null)}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] font-semibold cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}

                {modalTab === 'edit' && (
                  <form onSubmit={handleSaveEdit} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                    {activeOrder.is_separe && (
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30">
                        <div>
                          <label className="font-semibold block mb-1">Abono Recibido (Plan Separe)</label>
                          <input
                            type="number"
                            value={editForm.deposit_paid}
                            onChange={(e) => {
                              const dep = Number(e.target.value) || 0;
                              const tot = Number(editForm.total) || 0;
                              setEditForm({
                                ...editForm,
                                deposit_paid: e.target.value,
                                balance_due: String(Math.max(0, tot - dep)),
                              });
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0E121B]"
                          />
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Saldo Pendiente</label>
                          <input
                            type="number"
                            value={editForm.balance_due}
                            onChange={(e) => setEditForm({ ...editForm, balance_due: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0E121B] font-bold"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="font-semibold block mb-1">Observaciones / Notas del Cliente o Internas</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {quickObservationChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() =>
                              setEditForm((prev) => ({
                                ...prev,
                                notes: prev.notes.trim() ? `${prev.notes.trim()}\n• ${chip}` : `• ${chip}`,
                              }))
                            }
                            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#1A1F2C] hover:bg-slate-200 dark:hover:bg-[#232A3B] text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer transition"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={3}
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        placeholder="Ej: Cliente pide llamar antes de entregar, especificaciones del producto, novedades..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setModalTab('summary')}
                        className="px-3 py-2 rounded-xl text-slate-500 cursor-pointer"
                      >
                        Volver
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
                )}

                {modalTab === 'guide' && (
                  <form onSubmit={handleSaveGuide} className="space-y-3.5">
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
                        placeholder="Ej: Interrapidísimo, Servientrega, Coordinadora..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">
                        Número de Guía <span className="text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        value={guideTracking}
                        onChange={(e) => setGuideTracking(e.target.value)}
                        placeholder="Ej: 700123456789 (puedes dejarlo vacío si solo subes foto/PDF)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">
                        Foto o PDF de la Guía <span className="text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleGuideFileChange}
                        className="w-full text-[11px] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-100 cursor-pointer"
                      />
                      {guideFile && <p className="text-emerald-600 mt-1 font-semibold">Archivo listo: {guideFile.name}</p>}
                      {!guideFile && activeOrder.shipping_guide_url && (
                        <p className="mt-1.5 text-slate-500">
                          Guía actual:{' '}
                          <a
                            href={activeOrder.shipping_guide_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0052FF] underline font-semibold"
                          >
                            Ver archivo cargado
                          </a>
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-1">
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
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setModalTab('summary')}
                        className="px-3 py-2 text-slate-500 cursor-pointer"
                      >
                        Volver
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingModal}
                        className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-bold cursor-pointer disabled:opacity-50"
                      >
                        {isSavingModal ? 'Guardando...' : 'Guardar Guía y Despachar'}
                      </button>
                    </div>
                  </form>
                )}

                {modalTab === 'danger' && (
                  <div className="space-y-5">
                    <form onSubmit={handleSaveModalStatus} className="p-4 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0E121B] space-y-3">
                      <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-[#0052FF]" />
                        Cambiar Estado con Observación
                      </h4>
                      <div>
                        <label className="font-semibold block mb-1">Nuevo Estado</label>
                        <select
                          value={modalStatus}
                          onChange={(e) => setModalStatus(e.target.value as OrderStatus)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-semibold"
                        >
                          {modalStatusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {modalStatus === 'cancelled' && (
                        <div>
                          <label className="font-semibold block mb-1">Motivo de Cancelación / Observación</label>
                          <textarea
                            rows={2}
                            value={modalCancelReason}
                            onChange={(e) => setModalCancelReason(e.target.value)}
                            placeholder="Ej: Cliente desistió, dirección sin cobertura, no contestó..."
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modalStatusNotify}
                          onChange={(e) => setModalStatusNotify(e.target.checked)}
                          className="rounded border-slate-300 text-[#0052FF]"
                        />
                        <span>Notificar cambio de estado al cliente por WhatsApp</span>
                      </label>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSavingModal}
                          className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-bold cursor-pointer disabled:opacity-50"
                        >
                          {isSavingModal ? 'Actualizando...' : 'Actualizar Estado'}
                        </button>
                      </div>
                    </form>

                    <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 space-y-3">
                      <h4 className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4" />
                        Zona de Peligro: Eliminar Pedido
                      </h4>
                      <p className="text-slate-600 dark:text-slate-300">
                        Vas a eliminar el pedido de <strong>{activeOrder.customer_name}</strong> por{' '}
                        <strong>${activeOrder.total.toLocaleString('es-CO')} COP</strong>. Esta acción recalculará el valor del cliente y no se puede deshacer.
                      </p>
                      <div>
                        <label className="font-semibold block mb-1">
                          Escribe <span className="font-mono text-rose-600">ELIMINAR</span> para confirmar:
                        </label>
                        <input
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="ELIMINAR"
                          className="w-full px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#0E121B]"
                        />
                      </div>
                      <div className="flex justify-end">
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
            </div>
          </div>
        );
      })()}
    </div>
  );
}
