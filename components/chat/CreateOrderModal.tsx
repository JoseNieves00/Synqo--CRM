'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Send, ShoppingBag, Trash2, X } from 'lucide-react';
import { createManualOrderAction } from '@/app/actions/crm';

interface CreateOrderModalProps {
  isOpen: boolean;
  mounted: boolean;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    custom_fields?: any;
  };
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

interface DraftItem {
  product_name: string;
  quantity: string;
  unit_price: string;
}

const PAYMENT_PRESETS = [
  'Contraentrega',
  'Transferencia / Nequi',
  'Plan Separe',
  'Anticipado',
];

export function CreateOrderModal({
  isOpen,
  mounted,
  contact,
  onClose,
  onSuccess,
}: CreateOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Contraentrega');
  const [items, setItems] = useState<DraftItem[]>([{ product_name: '', quantity: '1', unit_price: '' }]);
  const [shippingCost, setShippingCost] = useState('0');
  const [depositPaid, setDepositPaid] = useState('0');
  const [notes, setNotes] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cf = contact.custom_fields || {};
    setCustomerName(contact.name || cf.nombre || '');
    setCustomerPhone(contact.phone || '');
    setCity(cf.ciudad || cf.city || '');
    setAddress(cf.direccion || cf.address || '');
    setPaymentMethod('Contraentrega');
    setItems([{ product_name: '', quantity: '1', unit_price: '' }]);
    setShippingCost('0');
    setDepositPaid('0');
    setNotes('');
    setNotifyCustomer(true);
    setErrorMsg(null);
  }, [isOpen, contact]);

  if (!isOpen || !mounted) return null;

  const isSepare = /separe/i.test(paymentMethod);
  const subtotal = items.reduce((sum, it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const price = Math.max(0, Number(it.unit_price) || 0);
    return sum + qty * price;
  }, 0);
  const shipping = Math.max(0, Number(shippingCost) || 0);
  const total = subtotal + shipping;
  const deposit = isSepare ? Math.max(0, Number(depositPaid) || 0) : 0;
  const balanceDue = isSepare ? Math.max(0, total - deposit) : 0;

  const handleAddItem = () => {
    setItems((prev) => [...prev, { product_name: '', quantity: '1', unit_price: '' }]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validItems = items
      .filter((it) => it.product_name.trim())
      .map((it) => ({
        product_name: it.product_name.trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit_price: it.unit_price !== '' ? Math.max(0, Number(it.unit_price) || 0) : undefined,
      }));

    if (validItems.length === 0) {
      setErrorMsg('Ingresa al menos un producto.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await createManualOrderAction({
        contactId: contact.id,
        customerName,
        customerPhone,
        city,
        address,
        paymentMethod,
        items: validItems,
        subtotal,
        shippingCost: shipping,
        total,
        isSepare,
        depositPaid: deposit,
        balanceDue,
        notes,
        notifyCustomer,
      });

      onSuccess(
        notifyCustomer
          ? res.customerNotified
            ? 'Pedido registrado y confirmación enviada al cliente por WhatsApp.'
            : `Pedido registrado (${res.notifyWarning || 'sin envío WhatsApp'}).`
          : 'Pedido registrado en Gestión de Pedidos.'
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error registrando el pedido.');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#131722] rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-[#232A3B] text-slate-900 dark:text-slate-100">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Registrar Pedido desde el Chat
              </h4>
              <p className="text-[11px] text-slate-500">
                Datos prellenados del contacto · Aparecerá directo en Pedidos
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 text-xs">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 font-medium">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-1">Nombre Cliente</label>
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Teléfono</label>
                <input
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Ciudad / Municipio</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ej: Medellín, Antioquia"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Dirección de Entrega</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej: Cra 45 # 12-34, Apto 201"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold">Productos del Pedido</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-[11px] font-bold text-[#0052FF] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Agregar producto
                </button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      required
                      placeholder="Nombre del producto"
                      value={it.product_name}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, product_name: e.target.value } : row))
                        )
                      }
                      className="col-span-6 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Cant"
                      value={it.quantity}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, quantity: e.target.value } : row))
                        )
                      }
                      className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B] text-center"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Precio unit."
                      value={it.unit_price}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, unit_price: e.target.value } : row))
                        )
                      }
                      className="col-span-3 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length === 1}
                      className="col-span-1 p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer flex justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1.5">Medio de Pago / Modalidad</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PAYMENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPaymentMethod(preset)}
                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition ${
                      paymentMethod === preset
                        ? 'bg-[#0052FF] text-white'
                        : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#0E121B] border border-slate-100 dark:border-[#1E2433]">
              <div>
                <label className="font-semibold block mb-1">Subtotal Productos</label>
                <div className="px-3 py-2 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-mono">
                  ${subtotal.toLocaleString('es-CO')}
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Flete / Envío</label>
                <input
                  type="number"
                  min={0}
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="font-semibold block mb-1">Total Pedido</label>
                <div className="px-3 py-2 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-extrabold text-[#0052FF] dark:text-[#00D2FF]">
                  ${total.toLocaleString('es-CO')} COP
                </div>
              </div>

              {isSepare && (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Abono Inicial</label>
                    <input
                      type="number"
                      min={0}
                      value={depositPaid}
                      onChange={(e) => setDepositPaid(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Saldo Pendiente</label>
                    <div className="px-3 py-2 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] font-bold text-amber-600">
                      ${balanceDue.toLocaleString('es-CO')}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="font-semibold block mb-1">Observaciones (Opcional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Llamar antes de entregar, color/talla acordada, horario..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#0E121B]"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={(e) => setNotifyCustomer(e.target.checked)}
                className="rounded border-slate-300 text-[#0052FF]"
              />
              <Send className="w-3.5 h-3.5 text-[#0052FF]" />
              <span>Enviar confirmación del pedido al cliente por WhatsApp</span>
            </label>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-xl font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-w-[145px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer shadow-xs"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSaving ? 'Registrando...' : 'Registrar Pedido'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
