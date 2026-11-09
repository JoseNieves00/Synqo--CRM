'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Eye,
  ExternalLink,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  CustomPaymentAccount,
  formatPaymentAccountText,
  formatAllPaymentAccountsText,
} from '@/lib/types/payments';
import { saveOrganizationPaymentAccounts } from '@/app/actions/settings';

interface PaymentAccountsSettingsProps {
  initialAccounts: CustomPaymentAccount[];
}

export function PaymentAccountsSettings({ initialAccounts }: PaymentAccountsSettingsProps) {
  const [accounts, setAccounts] = useState<CustomPaymentAccount[]>(initialAccounts || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CustomPaymentAccount | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewAccount, setPreviewAccount] = useState<CustomPaymentAccount | null>(null);
  const [mounted, setMounted] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formHolder, setFormHolder] = useState('');
  const [formHolderId, setFormHolderId] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormTitle('');
    setFormNumber('');
    setFormHolder('');
    setFormHolderId('');
    setFormLink('');
    setFormInstructions('');
    setFormIsActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: CustomPaymentAccount) => {
    setEditingAccount(acc);
    setFormTitle(acc.title);
    setFormNumber(acc.accountNumber);
    setFormHolder(acc.holderName);
    setFormHolderId(acc.holderId || '');
    setFormLink(acc.paymentLink || '');
    setFormInstructions(acc.instructions || '');
    setFormIsActive(acc.isActive);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formTitle.trim() || !formNumber.trim() || !formHolder.trim()) {
      setModalError('Por favor completa los campos requeridos: Método/Banco, Número de cuenta y Nombre del titular.');
      return;
    }

    let cleanLink = formLink.trim();
    if (cleanLink && !cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
      cleanLink = `https://${cleanLink}`;
    }

    const updatedItem: CustomPaymentAccount = {
      id: editingAccount ? editingAccount.id : `acc-${Date.now()}`,
      title: formTitle.trim(),
      accountNumber: formNumber.trim(),
      holderName: formHolder.trim(),
      holderId: formHolderId.trim() || undefined,
      paymentLink: cleanLink || undefined,
      instructions: formInstructions.trim() || undefined,
      isActive: formIsActive,
    };

    let newAccounts: CustomPaymentAccount[];
    if (editingAccount) {
      newAccounts = accounts.map((a) => (a.id === editingAccount.id ? updatedItem : a));
    } else {
      newAccounts = [...accounts, updatedItem];
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await saveOrganizationPaymentAccounts(newAccounts);
      if (res.success && res.accounts) {
        setAccounts(res.accounts);
        setIsModalOpen(false);
        setFeedback({ type: 'success', message: '¡Método de pago guardado correctamente!' });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setModalError(res.error || 'Error al guardar cuenta de pago');
      }
    } catch (err: any) {
      setModalError(err?.message || 'Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este método de pago?')) return;
    const newAccounts = accounts.filter((a) => a.id !== id);
    setIsSaving(true);
    try {
      const res = await saveOrganizationPaymentAccounts(newAccounts);
      if (res.success && res.accounts) {
        setAccounts(res.accounts);
        setFeedback({ type: 'success', message: 'Método de pago eliminado.' });
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error al eliminar' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    const newAccounts = accounts.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a));
    setAccounts(newAccounts);
    try {
      await saveOrganizationPaymentAccounts(newAccounts);
    } catch {
      // Revert if error
      setAccounts(accounts);
    }
  };

  const copyFormatted = (acc: CustomPaymentAccount) => {
    const text = formatPaymentAccountText(acc);
    navigator.clipboard.writeText(text);
    setCopiedId(acc.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const copyAllFormatted = () => {
    const text = formatAllPaymentAccountsText(accounts);
    navigator.clipboard.writeText(text);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Banner Informativo */}
      <div className="p-4 bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] rounded-xl shrink-0 mt-0.5">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Cuentas y Métodos de Pago 100% Personalizables
              <span className="px-2 py-0.2 text-[10px] font-bold bg-[#0052FF]/10 text-[#0052FF] dark:text-[#00D2FF] rounded-full">
                1 Clic en Chat
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Configura tus cuentas bancarias, billeteras (Nequi, Bancolombia, Zelle, Bizum, CLABE, etc.) o links de pago. Tus asesores podrán enviar estos datos exactos al prospecto con 1 clic en el chat.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {accounts.length > 0 && (
            <button
              type="button"
              onClick={copyAllFormatted}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1F2C] dark:hover:bg-[#232A3B] text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              title="Copiar texto con todos los métodos de pago juntos"
            >
              {copiedId === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'all' ? '¡Copiado!' : 'Copiar Todos'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Cuenta</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Grid de Cuentas */}
      {accounts.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-[#0E121B] border border-dashed border-slate-200 dark:border-[#232A3B] rounded-2xl">
          <CreditCard className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No tienes cuentas de pago configuradas</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Agrega tu primera cuenta (ej. Nequi, Daviplata, Bancolombia, Zelle, Bizum o enlace de pasarela) para agilizar las ventas de tu equipo.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear primer método de pago</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={`p-4 rounded-2xl border transition shadow-xs flex flex-col justify-between ${
                acc.isActive
                  ? 'bg-white dark:bg-[#131722] border-slate-200 dark:border-[#232A3B]'
                  : 'bg-slate-50 dark:bg-[#0E121B] border-slate-200/60 dark:border-[#1E2433] opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {acc.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(acc.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition ${
                        acc.isActive
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-[#1A1F2C] text-slate-500 border-slate-300 dark:border-[#232A3B]'
                      }`}
                    >
                      {acc.isActive ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyFormatted(acc)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-lg transition cursor-pointer"
                      title="Copiar texto para WhatsApp"
                    >
                      {copiedId === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(acc)}
                      className="p-1.5 text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-blue-50 dark:hover:bg-[#0052FF]/10 rounded-lg transition cursor-pointer"
                      title="Editar método de pago"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(acc.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                      title="Eliminar método de pago"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 font-mono">
                  <div className="flex items-center justify-between py-0.5 border-b border-slate-100 dark:border-[#1E2433]">
                    <span className="text-slate-400 font-sans text-[11px]">Número / Cuenta:</span>
                    <span className="font-bold text-slate-900 dark:text-white select-all">{acc.accountNumber}</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5 border-b border-slate-100 dark:border-[#1E2433]">
                    <span className="text-slate-400 font-sans text-[11px]">Titular:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{acc.holderName}</span>
                  </div>
                  {acc.holderId && (
                    <div className="flex items-center justify-between py-0.5 border-b border-slate-100 dark:border-[#1E2433]">
                      <span className="text-slate-400 font-sans text-[11px]">Doc / NIT:</span>
                      <span className="text-slate-700 dark:text-slate-300">{acc.holderId}</span>
                    </div>
                  )}
                  {acc.paymentLink && (
                    <div className="flex items-center justify-between py-0.5 border-b border-slate-100 dark:border-[#1E2433]">
                      <span className="text-slate-400 font-sans text-[11px]">Link:</span>
                      <a
                        href={acc.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0052FF] dark:text-[#00D2FF] hover:underline flex items-center gap-1 max-w-[180px] truncate"
                      >
                        <span className="truncate">{acc.paymentLink}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>

                {acc.instructions && (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
                    "{acc.instructions}"
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Agregar / Editar Cuenta (Portaled a document.body) */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F]">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                {editingAccount ? 'Editar Método de Pago' : 'Nuevo Método de Pago'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5 [scrollbar-width:thin]">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Método / Banco *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Nequi, Bancolombia Ahorros, Zelle, Bizum, CLABE..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    autoFocus
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Número de Cuenta / Teléfono / Correo *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 3001234567, 123-456789-01, correo@zelle.com..."
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Titular *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Empresa S.A.S. o Juan Pérez"
                    value={formHolder}
                    onChange={(e) => setFormHolder(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Doc / Cédula / NIT (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: NIT 900.123.456-1"
                      value={formHolderId}
                      onChange={(e) => setFormHolderId(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Link de Pago (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="pasarela.com/pay/..."
                      value={formLink}
                      onChange={(e) => setFormLink(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Instrucciones para el Cliente (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Enviar comprobante por este chat con tu nombre completo"
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="account-active"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-[#0052FF] focus:ring-[#0052FF] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="account-active" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
                    Habilitar este método de pago para envío rápido en el Inbox
                  </label>
                </div>

                {modalError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#0E131F]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Guardar Método</span>
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

