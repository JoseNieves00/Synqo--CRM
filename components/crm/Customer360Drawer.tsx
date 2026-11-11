'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  Sparkles,
  Tag as TagIcon,
  ShoppingBag,
  StickyNote,
  Megaphone,
  MessageSquare,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  getCustomer360Action,
  createManualOrderAction,
  updateOrderStatusAction,
  addContactNoteAction,
  deleteContactNoteAction,
  assignTagsToContactsAction,
  removeTagFromContactAction,
  createTagAction,
} from '@/app/actions/crm';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import type { LeadScoreFactor } from '@/lib/leads/lead-score';
import { TAG_COLORS, ORDER_STATUSES, type TagColor, type OrderStatus } from '@/lib/crm/constants';
import {
  TAG_COLOR_CLASSES,
  ORDER_STATUS_META,
  STAGE_LABELS_DEFAULT,
  TEMPERATURE_META,
  formatCop,
  formatShortDate,
} from './crm-ui-helpers';

type TabKey = 'resumen' | 'etiquetas' | 'pedidos' | 'notas';

interface Customer360Data {
  contact: any;
  tags: Array<{ id: string; name: string; color: string; source: 'ai' | 'human' }>;
  allOrgTags: Array<{ id: string; name: string; color: string; created_by_ai: boolean }>;
  orders: any[];
  ordersCount: number;
  ltv: number;
  notes: Array<{ id: string; author_id: string | null; author_name: string | null; body: string; created_at: string }>;
  campaigns: Array<{
    id: string;
    campaignId: string;
    campaignName: string;
    status: string;
    skipReason: string | null;
    message: string | null;
    sentAt: string | null;
    repliedAt: string | null;
    convertedAt: string | null;
  }>;
  windowOpen: boolean;
}

export function Customer360Drawer({
  contactId,
  onClose,
  onChanged,
  initialTab = 'resumen',
}: {
  contactId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  initialTab?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [data, setData] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nueva etiqueta
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColor>('blue');

  // Nueva nota
  const [noteBody, setNoteBody] = useState('');

  // Nuevo pedido
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('confirmed');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderCity, setOrderCity] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCustomer360Action(id);
      setData(res as Customer360Data);
    } catch (e: any) {
      setError(e?.message || 'Error cargando ficha 360.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!contactId) {
      setData(null);
      return;
    }
    setTab(initialTab);
    load(contactId);
  }, [contactId, initialTab, load]);

  if (!contactId) return null;

  const refresh = async () => {
    if (!contactId) return;
    await load(contactId);
    onChanged?.();
  };

  const handleAssignTag = async (tagId: string) => {
    if (!contactId) return;
    setBusy(true);
    try {
      await assignTagsToContactsAction({ contactIds: [contactId], tagIds: [tagId] });
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Error asignando etiqueta.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contactId) return;
    setBusy(true);
    try {
      await removeTagFromContactAction({ contactId, tagId });
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Error quitando etiqueta.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndAssignTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId || !newTagName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTagAction({ name: newTagName.trim(), color: newTagColor });
      await assignTagsToContactsAction({ contactIds: [contactId], tagIds: [created.tag.id] });
      setNewTagName('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la etiqueta.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId || !noteBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addContactNoteAction({ contactId, body: noteBody.trim() });
      setNoteBody('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la nota.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setBusy(true);
    try {
      await deleteContactNoteAction(noteId);
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la nota.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId || !productName.trim()) return;
    const parsedUnit = unitPrice ? Number(unitPrice) : undefined;
    const computedTotal =
      manualTotal !== ''
        ? Number(manualTotal)
        : parsedUnit !== undefined
          ? parsedUnit * Math.max(1, quantity)
          : 0;
    setBusy(true);
    setError(null);
    try {
      await createManualOrderAction({
        contactId,
        items: [
          {
            product_name: productName.trim(),
            quantity: Math.max(1, quantity),
            ...(parsedUnit !== undefined ? { unit_price: parsedUnit } : {}),
          },
        ],
        total: Math.max(0, computedTotal),
        status: orderStatus,
        paymentMethod: paymentMethod.trim() || undefined,
        address: orderAddress.trim() || undefined,
        city: orderCity.trim() || undefined,
        notes: orderNotes.trim() || undefined,
      });
      setProductName('');
      setQuantity(1);
      setUnitPrice('');
      setManualTotal('');
      setPaymentMethod('');
      setOrderAddress('');
      setOrderCity('');
      setOrderNotes('');
      setShowOrderForm(false);
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Error registrando el pedido.');
    } finally {
      setBusy(false);
    }
  };

  const handleOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    setBusy(true);
    setError(null);
    try {
      await updateOrderStatusAction({ orderId, status });
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Error actualizando el estado del pedido.');
    } finally {
      setBusy(false);
    }
  };

  const contact = data?.contact;
  const cf = (contact?.custom_fields || {}) as Record<string, any>;
  const breakdown: LeadScoreFactor[] = Array.isArray(contact?.lead_score_breakdown)
    ? contact.lead_score_breakdown
    : [];
  const tempKey = contact?.lead_temperature || cf.lead_temperature;
  const tempMeta = tempKey ? TEMPERATURE_META[tempKey] : null;
  const assignedTagIds = new Set((data?.tags || []).map((t) => t.id));
  const availableOrgTags = (data?.allOrgTags || []).filter((t) => !assignedTagIds.has(t.id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-[#0D111A] h-full shadow-2xl border-l border-slate-200 dark:border-[#232A3B] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#232A3B] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {contact?.name || contact?.phone || 'Ficha 360 del Cliente'}
              </h2>
              {typeof contact?.lead_score === 'number' && (
                <LeadScoreBadge
                  score={contact.lead_score}
                  breakdown={breakdown}
                  size="sm"
                  showLabel
                />
              )}
              {data && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    data.windowOpen
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                      : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {data.windowOpen ? 'Ventana 24h abierta' : 'Fuera ventana 24h'}
                </span>
              )}
            </div>
            {contact && (
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-mono">{contact.phone}</span>
                <span>•</span>
                <span className="capitalize">{contact.channel || 'whatsapp'}</span>
                <span>•</span>
                <span>Etapa: {STAGE_LABELS_DEFAULT[contact.pipeline_stage] || contact.pipeline_stage}</span>
                {tempMeta && (
                  <span className={`px-1.5 py-0.5 rounded border text-[11px] ${tempMeta.badgeClass}`}>
                    {tempMeta.label}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {contact && (
              <Link
                href={`/inbox/${contact.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] text-white transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ir al chat
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1C2233]"
              aria-label="Cerrar Ficha 360"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Bar */}
        {data && (
          <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-slate-50/70 dark:bg-[#131722] border-b border-slate-200 dark:border-[#232A3B]">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">LTV Total</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCop(data.ltv)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Pedidos válidos</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {data.ordersCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Etiquetas / Notas</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {data.tags.length} etiq. · {data.notes.length} notas
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] overflow-x-auto">
          {[
            { id: 'resumen' as TabKey, label: 'Resumen y Score', icon: TrendingUp },
            { id: 'etiquetas' as TabKey, label: `Etiquetas (${data?.tags.length ?? 0})`, icon: TagIcon },
            { id: 'pedidos' as TabKey, label: `Pedidos (${data?.orders.length ?? 0})`, icon: ShoppingBag },
            { id: 'notas' as TabKey, label: `Notas y Campañas`, icon: StickyNote },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#0052FF] text-[#0052FF] dark:text-[#00D2FF]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading && !data ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando ficha 360...
            </div>
          ) : data ? (
            <>
              {/* TAB: RESUMEN */}
              {tab === 'resumen' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 bg-slate-50/60 dark:bg-[#131722]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Desglose de Propensión IA ({contact.lead_score ?? 0}/100)
                    </h3>
                    {breakdown.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Sin factores calculados todavía. El score se actualiza automáticamente al interactuar o actualizar datos del cliente.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {breakdown.map((f, idx) => (
                          <div
                            key={`${f.key || f.label}-${idx}`}
                            className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 border-slate-200/70 dark:border-[#1E2536]"
                          >
                            <span className="text-slate-700 dark:text-slate-200">{f.label}</span>
                            <span
                              className={`font-mono font-semibold ${
                                f.points >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {f.points > 0 ? `+${f.points}` : f.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                        Producto / Interés
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {cf.producto_interes || cf.interes || cf.service || 'No especificado'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                        Valor estimado (Deal)
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white font-mono">
                        {contact.deal_value ? formatCop(contact.deal_value) : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                        Última interacción
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatShortDate(contact.last_interaction_at)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                        Ciudad / Dirección
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {cf.city || cf.ciudad || cf.address || 'Sin registrar'}
                      </div>
                    </div>
                  </div>

                  {cf.resumen_ia && (
                    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
                        Resumen IA de la conversación
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {cf.resumen_ia}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: ETIQUETAS */}
              {tab === 'etiquetas' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                      Etiquetas asignadas al cliente
                    </h3>
                    {data.tags.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Este cliente aún no tiene etiquetas. La IA también puede etiquetarlo automáticamente durante el chat.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {data.tags.map((t) => (
                          <span
                            key={t.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                              TAG_COLOR_CLASSES[t.color] || TAG_COLOR_CLASSES.slate
                            }`}
                          >
                            {t.source === 'ai' && (
                              <span title="Asignada por IA">
                                <Sparkles className="w-3 h-3" />
                              </span>
                            )}
                            {t.name}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRemoveTag(t.id)}
                              className="opacity-70 hover:opacity-100 ml-0.5"
                              title="Quitar etiqueta"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {availableOrgTags.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Agregar etiqueta existente
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {availableOrgTags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled={busy}
                            onClick={() => handleAssignTag(t.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0052FF] text-slate-700 dark:text-slate-200 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={handleCreateAndAssignTag}
                    className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-3 bg-slate-50/60 dark:bg-[#131722]"
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Crear nueva etiqueta y asignar
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Ej: vip, paga-contraentrega, talla-m"
                        className="flex-1 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                      <select
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value as TagColor)}
                        className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        {TAG_COLORS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={busy || !newTagName.trim()}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] disabled:opacity-50 text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Crear y asignar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB: PEDIDOS */}
              {tab === 'pedidos' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Historial de Compras y Pedidos
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowOrderForm((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showOrderForm ? 'Cancelar' : 'Registrar Pedido'}
                    </button>
                  </div>

                  {showOrderForm && (
                    <form
                      onSubmit={handleCreateOrder}
                      className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-3 bg-slate-50/70 dark:bg-[#131722]"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Producto / Servicio *
                          </label>
                          <input
                            type="text"
                            required
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            placeholder="Ej: Conjunto Niño Talla 6"
                            className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Cantidad
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                            className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Precio unitario (COP)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)}
                            placeholder="Ej: 85000"
                            className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Total pedido (COP)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={manualTotal}
                            onChange={(e) => setManualTotal(e.target.value)}
                            placeholder={
                              unitPrice ? String(Number(unitPrice) * quantity) : 'Auto si pones unitario'
                            }
                            className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Estado
                          </label>
                          <select
                            value={orderStatus}
                            onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                            className="w-full rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {ORDER_STATUS_META[s].label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <input
                          type="text"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          placeholder="Método (Contraentrega, Nequi...)"
                          className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={orderCity}
                          onChange={(e) => setOrderCity(e.target.value)}
                          placeholder="Ciudad"
                          className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={orderAddress}
                          onChange={(e) => setOrderAddress(e.target.value)}
                          placeholder="Dirección"
                          className="rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          placeholder="Notas de envío / talla / color..."
                          className="flex-1 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#0D111A] px-2.5 py-1.5 text-xs"
                        />
                        <button
                          type="submit"
                          disabled={busy || !productName.trim()}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
                        >
                          Guardar pedido
                        </button>
                      </div>
                    </form>
                  )}

                  {data.orders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-[#232A3B] py-10 text-center text-xs text-slate-500">
                      Este cliente aún no tiene pedidos registrados en el historial.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.orders.map((o: any) => {
                        const statusMeta =
                          ORDER_STATUS_META[o.status as OrderStatus] || ORDER_STATUS_META.pending;
                        const items: any[] = Array.isArray(o.items) ? o.items : [];
                        return (
                          <div
                            key={o.id}
                            className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusMeta.badgeClass}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {formatShortDate(o.created_at)}
                                </span>
                                {o.source === 'ai' && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                                    <Sparkles className="w-3 h-3" /> IA
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                                  {formatCop(o.total)}
                                </span>
                                <select
                                  value={o.status}
                                  disabled={busy}
                                  onChange={(e) =>
                                    handleOrderStatusChange(o.id, e.target.value as OrderStatus)
                                  }
                                  className="rounded-md border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] px-2 py-1 text-[11px]"
                                >
                                  {ORDER_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {ORDER_STATUS_META[s].label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {items.length > 0 && (
                              <ul className="text-xs text-slate-700 dark:text-slate-200 space-y-0.5">
                                {items.map((it, idx) => (
                                  <li key={idx}>
                                    • {it.quantity || 1}x {it.product_name}
                                    {it.unit_price ? ` (${formatCop(it.unit_price)})` : ''}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {(o.payment_method || o.city || o.address || o.notes) && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-slate-100 dark:border-[#1E2536]">
                                {o.payment_method && <span>Pago: {o.payment_method}</span>}
                                {(o.city || o.address) && (
                                  <span>
                                    Envío: {[o.city, o.address].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                                {o.notes && <span>Nota: {o.notes}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: NOTAS Y CAMPAÑAS */}
              {tab === 'notas' && (
                <div className="space-y-6">
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Notas internas del equipo
                    </h3>
                    <textarea
                      rows={3}
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Escribe una nota interna sobre este cliente (acuerdos, objeciones, detalles de entrega)..."
                      className="w-full rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={busy || !noteBody.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0052FF] hover:bg-[#0040CC] disabled:opacity-50 text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Guardar nota
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2.5">
                    {data.notes.length === 0 ? (
                      <p className="text-xs text-slate-500">Sin notas registradas.</p>
                    ) : (
                      data.notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-3 text-xs space-y-1 bg-slate-50/50 dark:bg-[#131722]"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {n.author_name || 'Asesor'} · {formatShortDate(n.created_at)}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteNote(n.id)}
                              className="text-slate-400 hover:text-rose-500"
                              title="Eliminar nota"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                            {n.body}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-[#232A3B] space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5" />
                      Campañas IA recibidas ({data.campaigns.length})
                    </h3>
                    {data.campaigns.length === 0 ? (
                      <p className="text-xs text-slate-500">No ha sido incluido en campañas aún.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.campaigns.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-xl border border-slate-200 dark:border-[#232A3B] p-3 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {c.campaignName}
                              </span>
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="capitalize text-slate-500">{c.status}</span>
                                {c.convertedAt && (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                    <CheckCircle2 className="w-3 h-3" /> Convirtió
                                  </span>
                                )}
                                {!c.convertedAt && c.repliedAt && (
                                  <span className="text-blue-600 font-medium">Respondió</span>
                                )}
                              </div>
                            </div>
                            {c.message && (
                              <p className="text-slate-600 dark:text-slate-300 italic">
                                &ldquo;{c.message}&rdquo;
                              </p>
                            )}
                            {c.skipReason && (
                              <p className="text-[11px] text-amber-600">Omitido: {c.skipReason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
