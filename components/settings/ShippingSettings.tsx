'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Truck,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  MapPin,
  DollarSign,
  ShieldCheck,
  X,
  HelpCircle,
  Package,
} from 'lucide-react';
import {
  ShippingSettings as ShippingSettingsType,
  ShippingCityRate,
  createDefaultShippingSettings,
} from '@/lib/types/shipping';
import { saveOrganizationShippingSettings } from '@/app/actions/settings';

interface ShippingSettingsProps {
  initialSettings?: ShippingSettingsType | null;
}

export function ShippingSettings({ initialSettings }: ShippingSettingsProps) {
  const [settings, setSettings] = useState<ShippingSettingsType>(
    initialSettings || createDefaultShippingSettings()
  );
  const [cityRates, setCityRates] = useState<ShippingCityRate[]>(
    initialSettings?.cityRates || []
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingCityRate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State for City Rate Modal
  const [formCity, setFormCity] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formCost, setFormCost] = useState('0');
  const [formCod, setFormCod] = useState(true);
  const [formTime, setFormTime] = useState('1 a 2 días hábiles');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isModalOpen]);

  const openAddModal = () => {
    setEditingRate(null);
    setFormCity('');
    setFormDepartment('');
    setFormCost('35000');
    setFormCod(true);
    setFormTime('1 a 2 días hábiles');
    setFormNotes('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rate: ShippingCityRate) => {
    setEditingRate(rate);
    setFormCity(rate.city);
    setFormDepartment(rate.department || '');
    setFormCost(String(rate.cost));
    setFormCod(rate.isCashOnDelivery);
    setFormTime(rate.deliveryTime || '');
    setFormNotes(rate.notes || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveCityRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCity.trim()) {
      setModalError('Debes ingresar el nombre de la ciudad o municipio.');
      return;
    }

    const costNum = Math.max(0, parseInt(formCost.replace(/[^0-9]/g, '') || '0', 10));

    if (editingRate) {
      setCityRates((prev) =>
        prev.map((r) =>
          r.id === editingRate.id
            ? {
                ...r,
                city: formCity.trim(),
                department: formDepartment.trim() || undefined,
                cost: costNum,
                isCashOnDelivery: formCod,
                deliveryTime: formTime.trim() || undefined,
                notes: formNotes.trim() || undefined,
              }
            : r
        )
      );
    } else {
      const newRate: ShippingCityRate = {
        id: `city-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        city: formCity.trim(),
        department: formDepartment.trim() || undefined,
        cost: costNum,
        isCashOnDelivery: formCod,
        deliveryTime: formTime.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };
      setCityRates((prev) => [...prev, newRate]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteCityRate = (id: string) => {
    setCityRates((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload: ShippingSettingsType = {
        ...settings,
        cityRates,
      };
      const res = await saveOrganizationShippingSettings(payload);
      if (res.success && res.settings) {
        setSettings(res.settings);
        setCityRates(res.settings.cityRates);
        setFeedback({
          type: 'success',
          message: '¡Configuración de envíos y tarifas sincronizada exitosamente con la IA y el CRM!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Ocurrió un error al guardar los envíos.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error de conexión al guardar.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRates = useMemo(() => {
    if (!searchQuery.trim()) return cityRates;
    const q = searchQuery.toLowerCase();
    return cityRates.filter(
      (r) =>
        r.city.toLowerCase().includes(q) ||
        (r.department && r.department.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q))
    );
  }, [cityRates, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-blue-500/10 text-[#0052FF] dark:text-[#00D2FF]">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Envíos, Fletes y Tarifas por Ciudad
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[#0052FF] dark:text-[#00D2FF]">
                {cityRates.length} Ciudades
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configura tus políticas de entrega, costos por municipio y pago contraentrega. La IA las consultará en tiempo real para cotizar.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span>Guardar Cambios</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs font-medium animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Reglas Generales de Envíos */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-4 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Package className="w-3.5 h-3.5" />
          Políticas Generales de Entrega
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tarifa Base Nacional ($ COP)
            </label>
            <input
              type="number"
              value={settings.baseRate}
              onChange={(e) =>
                setSettings({ ...settings, baseRate: Math.max(0, parseInt(e.target.value || '0', 10)) })
              }
              placeholder="35000"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Aplica para municipios no especificados en la tabla.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Monto Mínimo para Envío Gratis ($ COP)
            </label>
            <input
              type="number"
              value={settings.freeShippingMinAmount ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  freeShippingMinAmount: e.target.value ? Math.max(0, parseInt(e.target.value, 10)) : null,
                })
              }
              placeholder="Ej. 500000 (Opcional)"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Déjalo vacío si no ofreces envío gratis por monto.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Pago Contraentrega Nacional
            </label>
            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowCashOnDelivery}
                  onChange={(e) => setSettings({ ...settings, allowCashOnDelivery: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0052FF]"></div>
              </label>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {settings.allowCashOnDelivery ? 'Habilitado' : 'Deshabilitado'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Informa al cliente si puede pagar al recibir.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Transportadoras Aliadas
            </label>
            <input
              type="text"
              value={settings.carrierNames || ''}
              onChange={(e) => setSettings({ ...settings, carrierNames: e.target.value })}
              placeholder="Coordinadora, Envía, Interrapidísimo"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Indicaciones Generales de Despacho
            </label>
            <input
              type="text"
              value={settings.generalPolicy || ''}
              onChange={(e) => setSettings({ ...settings, generalPolicy: e.target.value })}
              placeholder="Despachos lunes a viernes. Reexpedición sujeta a cotización."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Tabla de Tarifas por Ciudad / Municipio */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0052FF]" />
              Tarifas por Ciudad o Municipio
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registra los destinos frecuentes de tus clientes para cotizaciones automáticas exactas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar ciudad..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-lg text-slate-900 dark:text-white w-40 sm:w-56"
              />
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Ciudad</span>
            </button>
          </div>
        </div>

        {filteredRates.length === 0 ? (
          <div className="py-12 text-center space-y-3 border-2 border-dashed border-slate-200 dark:border-[#232A3B] rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[#0052FF] flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {searchQuery ? 'No hay ciudades que coincidan con la búsqueda.' : 'No tienes tarifas por ciudad configuradas.'}
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#0052FF] hover:underline"
            >
              + Agregar la primera ciudad (ej. Barranquilla $90.000)
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-[#1A1F2C] text-slate-700 dark:text-slate-200 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-[#232A3B]">
                <tr>
                  <th className="py-2.5 px-3">Ciudad / Municipio</th>
                  <th className="py-2.5 px-3">Costo de Envío</th>
                  <th className="py-2.5 px-3">Modalidad</th>
                  <th className="py-2.5 px-3">Tiempo Estimado</th>
                  <th className="py-2.5 px-3">Observaciones</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232A3B]">
                {filteredRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-slate-50/50 dark:hover:bg-[#1A1F2C]/50 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>{rate.city}</span>
                        {rate.department && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({rate.department})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                      {rate.cost === 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">GRATIS</span>
                      ) : (
                        <span>${rate.cost.toLocaleString('es-CO')} COP</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {rate.isCashOnDelivery ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                          Contraentrega
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Pago previo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400">
                      {rate.deliveryTime || '1 a 3 días hábiles'}
                    </td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {rate.notes || '—'}
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(rate)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Editar tarifa"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCityRate(rate.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Eliminar tarifa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Agregar / Editar Tarifa por Ciudad */}
      {isModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#232A3B]">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0052FF]" />
                  <span>{editingRate ? 'Editar Tarifa de Envío' : 'Agregar Tarifa por Ciudad'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveCityRate} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ciudad o Municipio *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    placeholder="Ej. Barranquilla, Soledad, Bogotá..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={formDepartment}
                      onChange={(e) => setFormDepartment(e.target.value)}
                      placeholder="Ej. Atlántico"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Costo del Envío ($ COP)
                    </label>
                    <input
                      type="number"
                      required
                      value={formCost}
                      onChange={(e) => setFormCost(e.target.value)}
                      placeholder="90000 (0 para gratis)"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B]">
                  <div>
                    <span className="block font-semibold text-slate-800 dark:text-slate-200">
                      Pago Contraentrega
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ¿La transportadora recauda el dinero al entregar en esta ciudad?
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCod}
                      onChange={(e) => setFormCod(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0052FF]"></div>
                  </label>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tiempo Estimado de Entrega
                  </label>
                  <input
                    type="text"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    placeholder="Ej. 1 a 2 días hábiles"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Observaciones / Condiciones Específicas
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Ej. Flete aproximado según transportadora"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#232A3B]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white font-bold transition shadow-xs"
                  >
                    {editingRate ? 'Actualizar Ciudad' : 'Agregar Ciudad'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
