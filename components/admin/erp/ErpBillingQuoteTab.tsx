'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Calendar,
  Zap,
  Printer,
  Loader2,
  UserPlus,
} from 'lucide-react';
import type { OrganizationRow } from '@/app/actions/superadmin';
import { provisionCompany } from '@/app/actions/superadmin';
import {
  grantTokenPackAction,
  grantCycleOrTrialAction,
  adjustPermanentTokensAction,
  getPendingQuotesAction,
  upsertPendingQuoteAction,
  deletePendingQuoteAction,
  getErpGlobalPricingAction,
  saveErpGlobalPricingAction,
} from '@/app/actions/erp';
import {
  calculateSmartOverageAndRechargeQuote,
  buildQuoteWhatsAppUrl,
  prunePendingQuotes,
  type PendingQuoteRecord,
} from '@/services/erp.service';
import { estimateChatsFromTokens, formatTokenQuota } from '@/lib/billing/plan-defaults';

interface ErpBillingQuoteTabProps {
  organizations: OrganizationRow[];
  initialOrgId?: string | null;
  onConsumeInitialOrg?: () => void;
  onRefresh?: () => void;
  onOpenCreditsTab?: () => void;
}

type QueueFilter = 'all' | 'due_soon' | 'overage' | 'ok';
type ChargeKind = 'monthly_plan' | 'token_pack' | 'new_client';

function formatCopInput(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '';
  return val.toLocaleString('es-CO');
}

function parseCopInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ErpBillingQuoteTab({
  organizations,
  initialOrgId,
  onConsumeInitialOrg,
  onRefresh,
  onOpenCreditsTab,
}: ErpBillingQuoteTabProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(initialOrgId || organizations[0]?.id || '');

  // Precios globales persistidos automáticamente en BD
  const [monthlyBaseCop, setMonthlyBaseCop] = useState<number>(200000);
  const [pricePer1MCop, setPricePer1MCop] = useState<number>(20000);
  const [pricingLoaded, setPricingLoaded] = useState<boolean>(false);
  const [pricingSaveStatus, setPricingSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const pricingDirtyRef = useRef<boolean>(false);

  // Tipo de cobro inteligente + descuento puntual
  const [chargeKind, setChargeKind] = useState<ChargeKind>(initialOrgId ? 'token_pack' : 'monthly_plan');
  const [rechargeScope, setRechargeScope] = useState<'temporary' | 'permanent'>('temporary');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customRechargeTokens, setCustomRechargeTokens] = useState<number | null>(null);
  const [customRechargeCop, setCustomRechargeCop] = useState<number | null>(null);
  const [discountType, setDiscountType] = useState<'cop' | 'pct'>('cop');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Campos rápidos para cotizar empresa nueva sin crearla aún
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientAdminName, setNewClientAdminName] = useState<string>('');
  const [newClientEmail, setNewClientEmail] = useState<string>('');
  const [newClientBusinessModel, setNewClientBusinessModel] = useState<'products' | 'services' | 'hybrid'>('products');
  const [newClientMaxUsers, setNewClientMaxUsers] = useState<number>(2);
  const [newClientTokensLimit, setNewClientTokensLimit] = useState<number>(5_000_000);
  const [pendingQuotes, setPendingQuotes] = useState<PendingQuoteRecord[]>([]);
  const [createdCredentials, setCreatedCredentials] = useState<{
    companyName: string;
    email: string;
    tempPassword: string;
    phone: string;
  } | null>(null);

  const persistLocalQuotes = (next: PendingQuoteRecord[]) => {
    setPendingQuotes(next);
    try {
      localStorage.setItem('synqo_pending_company_quotes', JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    let active = true;
    const loadQuotes = async () => {
      let localList: PendingQuoteRecord[] = [];
      try {
        const saved = localStorage.getItem('synqo_pending_company_quotes');
        if (saved) localList = prunePendingQuotes(JSON.parse(saved));
      } catch {}
      if (active && localList.length > 0) setPendingQuotes(localList);

      try {
        const remote = await getPendingQuotesAction();
        if (active && remote.supported) {
          persistLocalQuotes(remote.quotes);
        }
      } catch {}
    };
    loadQuotes();
    getErpGlobalPricingAction()
      .then((res) => {
        if (!active) return;
        setMonthlyBaseCop(res.monthlyBaseCop);
        setPricePer1MCop(res.pricePer1MCop);
        setPricingLoaded(true);
      })
      .catch(() => {
        if (active) setPricingLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Auto-guardado en BD con debounce al editar tarifas globales
  useEffect(() => {
    if (!pricingLoaded || !pricingDirtyRef.current) return;
    setPricingSaveStatus('saving');
    const timer = setTimeout(() => {
      saveErpGlobalPricingAction({ monthlyBaseCop, pricePer1MCop })
        .then(() => {
          pricingDirtyRef.current = false;
          setPricingSaveStatus('saved');
        })
        .catch(() => setPricingSaveStatus('idle'));
    }, 650);
    return () => clearTimeout(timer);
  }, [monthlyBaseCop, pricePer1MCop, pricingLoaded]);

  useEffect(() => {
    if (initialOrgId) {
      setSelectedOrgId(initialOrgId);
      setChargeKind('token_pack');
      setCustomRechargeTokens(null);
      setCustomRechargeCop(null);
      onConsumeInitialOrg?.();
    }
  }, [initialOrgId, onConsumeInitialOrg]);

  const [processing, setProcessing] = useState(false);
  const [revertStepOpen, setRevertStepOpen] = useState(false);
  const [revertConfirmText, setRevertConfirmText] = useState('');
  const [quoteSentModalUrl, setQuoteSentModalUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const calculatorRef = useRef<HTMLDivElement | null>(null);

  const scrollToCalculatorOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => {
        calculatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const enriched = useMemo(() => {
    return organizations
      .map((org) => {
        const quote = calculateSmartOverageAndRechargeQuote({
          usedTokens: Number(org.ai_tokens_used || 0),
          baseLimit: Number(org.ai_tokens_limit || 5_000_000),
          extraBalance: Number((org as any).extra_tokens_balance || 0),
          billingDueDay: (org as any).billing_due_day || null,
          billingCycleEndsAt: (org as any).billing_cycle_ends_at || null,
          monthlyBasePriceCop: monthlyBaseCop,
          overagePricePer1MCop: pricePer1MCop,
        });
        const isPastDue = org.subscription_status === 'past_due';
        const isDueSoon = quote.daysRemainingInCycle <= 5 || isPastDue;
        const isOverage = quote.overageTokens > 0;
        const priority = isOverage ? 1 : isPastDue ? 2 : isDueSoon ? 3 : 4;
        return { org, quote, isPastDue, isDueSoon, isOverage, priority };
      })
      .sort((a, b) => a.priority - b.priority || b.quote.overageTokens - a.quote.overageTokens);
  }, [organizations, monthlyBaseCop, pricePer1MCop]);

  const filtered = useMemo(() => {
    if (filter === 'overage') return enriched.filter((e) => e.isOverage);
    if (filter === 'due_soon') return enriched.filter((e) => e.isDueSoon);
    if (filter === 'ok') return enriched.filter((e) => !e.isOverage && !e.isDueSoon);
    return enriched;
  }, [enriched, filter]);

  const activeItem =
    enriched.find((e) => e.org.id === selectedOrgId) || filtered[0] || enriched[0] || null;

  // Extraer teléfono automáticamente del administrador y ajustar modo sugerido al cambiar empresa
  useEffect(() => {
    if (!activeItem || chargeKind === 'new_client') return;
    const orgAny = activeItem.org as any;
    const autoPhone =
      orgAny?.appointment_settings?.notification_phone ||
      orgAny?.notification_phone ||
      orgAny?.evolution_phone_connected ||
      '';
    setCustomPhone(String(autoPhone || ''));
    const savedBaseCop = Number(orgAny?.appointment_settings?.token_policy?.monthlyBasePriceCop);
    if (Number.isFinite(savedBaseCop) && savedBaseCop > 0) {
      setMonthlyBaseCop(savedBaseCop);
    }
    setChargeKind(activeItem.quote.mode === 'end_of_month' ? 'monthly_plan' : 'token_pack');
    setRechargeScope('temporary');
    setCustomRechargeTokens(null);
    setCustomRechargeCop(null);
    setDiscountValue(0);
    setFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.org.id]);

  const isNewClient = chargeKind === 'new_client';

  const effectiveRechargeTokens = isNewClient
    ? 0
    : chargeKind === 'monthly_plan'
    ? 0
    : customRechargeTokens !== null
    ? customRechargeTokens
    : activeItem?.quote.recommendedRechargeTokens || 1_000_000;

  const autoRechargeCop = Math.round((effectiveRechargeTokens / 1_000_000) * pricePer1MCop);
  const effectiveRechargeCop =
    customRechargeCop !== null ? Math.max(0, customRechargeCop) : autoRechargeCop;
  const effectiveBaseCop =
    isNewClient || chargeKind === 'monthly_plan' ? monthlyBaseCop : 0;
  const effectiveOverageTokens = isNewClient ? 0 : activeItem?.quote.overageTokens || 0;
  const effectiveOverageCop = isNewClient ? 0 : activeItem?.quote.overageCop || 0;
  const subtotalCop = effectiveBaseCop + effectiveOverageCop + effectiveRechargeCop;
  const effectiveDiscountCop = Math.min(
    subtotalCop,
    discountValue > 0
      ? discountType === 'pct'
        ? Math.round((subtotalCop * Math.min(100, discountValue)) / 100)
        : Math.round(discountValue)
      : 0
  );
  const effectiveTotalCop = Math.max(0, subtotalCop - effectiveDiscountCop);

  const canGeneratePdf =
    effectiveTotalCop > 0 && (!isNewClient || newClientName.trim().length > 0);

  const summaryStats = useMemo(() => {
    const overageCount = enriched.filter((e) => e.isOverage).length;
    const dueSoonCount = enriched.filter((e) => e.isDueSoon).length;
    const totalPendingCop = enriched.reduce((acc, e) => acc + e.quote.totalToCollectCop, 0);
    return { overageCount, dueSoonCount, totalPendingCop };
  }, [enriched]);

  const handlePrintPdf = () => {
    if (!canGeneratePdf) {
      setFeedback({
        type: 'error',
        text: isNewClient
          ? 'Ingresa el nombre del negocio y un valor mayor a $0 para generar el PDF.'
          : 'El total a cobrar debe ser mayor a $0 COP para generar el comprobante PDF.',
      });
      return;
    }

    const rawName = isNewClient ? newClientName.trim() : activeItem?.org.name || 'Cliente Synqo';
    const targetName = escapeHtml(rawName);
    const safeEmail = escapeHtml(newClientEmail.trim());
    const dueDayLabel = isNewClient
      ? 'Se fija al confirmar el pago'
      : `${(activeItem?.org as any)?.billing_due_day || new Date().getDate()} de cada mes`;
    const docNum = `SYNQO-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const logoUrl = `${window.location.origin}/brand/isotipo-128w.png`;

    const baseTokens = isNewClient
      ? Math.max(5_000_000, newClientTokensLimit)
      : Number(activeItem?.org.ai_tokens_limit || 5_000_000);
    const baseChats = estimateChatsFromTokens(baseTokens);
    const overageChats = effectiveOverageTokens > 0 ? estimateChatsFromTokens(effectiveOverageTokens) : '';
    const rechargeChats = effectiveRechargeTokens > 0 ? estimateChatsFromTokens(effectiveRechargeTokens) : '';

    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Cuenta de Cobro ${docNum} - ${targetName}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 36px; color: #0f172a; max-width: 720px; margin: auto; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0052FF; padding-bottom: 16px; margin-bottom: 24px; }
  .brand-wrap { display: flex; align-items: center; gap: 12px; }
  .brand-wrap img { width: 42px; height: 42px; object-fit: contain; }
  .brand { font-size: 22px; font-weight: 800; color: #0052FF; line-height: 1.1; }
  .meta { text-align: right; font-size: 12px; color: #475569; }
  .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 11px; text-transform: uppercase; color: #64748b; }
  .right { text-align: right; }
  .total { font-size: 18px; font-weight: 800; color: #0f172a; text-align: right; margin-top: 8px; }
  .note { font-size: 11px; color: #64748b; margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 12px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand-wrap">
      <img src="${logoUrl}" alt="Synqo CRM" />
      <div>
        <div class="brand">synqo.dev</div>
        <div style="font-size:12px;color:#64748b;">Cuenta de Cobro / Comprobante de Servicio</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>N.º:</strong> ${docNum}</div>
      <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-CO')}</div>
      <div><strong>Día de pago mensual:</strong> ${dueDayLabel}</div>
    </div>
  </div>
  <div class="box">
    <div><strong>Cliente:</strong> ${targetName}</div>
    ${isNewClient && safeEmail ? `<div><strong>Usuario / Correo asignado:</strong> ${safeEmail} <em>(se activa al confirmar pago)</em></div>` : ''}
    ${!isNewClient && activeItem ? `<div><strong>Consumo actual:</strong> ${activeItem.quote.usedTokens.toLocaleString('es-CO')} / ${activeItem.quote.effectiveLimit.toLocaleString('es-CO')} tokens</div>` : ''}
  </div>
  <table>
    <thead>
      <tr><th>Concepto</th><th class="right">Capacidad / Detalle</th><th class="right">Valor (COP)</th></tr>
    </thead>
    <tbody>
      ${effectiveBaseCop > 0 ? `<tr><td>Mensualidad Synqo CRM (${baseChats})</td><td class="right">${baseTokens.toLocaleString('es-CO')} tokens IA/mes</td><td class="right">$${effectiveBaseCop.toLocaleString('es-CO')}</td></tr>` : ''}
      ${effectiveOverageTokens > 0 ? `<tr><td>Consumo adicional del ciclo (${overageChats})</td><td class="right">+${effectiveOverageTokens.toLocaleString('es-CO')} tokens</td><td class="right">$${effectiveOverageCop.toLocaleString('es-CO')}</td></tr>` : ''}
      ${effectiveRechargeTokens > 0 ? `<tr><td>${rechargeScope === 'permanent' ? 'Ampliación permanente mensual' : 'Paquete adicional mes en curso'} (${rechargeChats})</td><td class="right">+${effectiveRechargeTokens.toLocaleString('es-CO')} tokens</td><td class="right">$${effectiveRechargeCop.toLocaleString('es-CO')}</td></tr>` : ''}
      ${effectiveDiscountCop > 0 ? `<tr><td>Descuento aplicado</td><td class="right">${discountType === 'pct' ? `${discountValue}%` : 'Ajuste comercial'}</td><td class="right">-$${effectiveDiscountCop.toLocaleString('es-CO')}</td></tr>` : ''}
    </tbody>
  </table>
  <div class="total">TOTAL A PAGAR: $${effectiveTotalCop.toLocaleString('es-CO')} COP</div>
  <div class="note">
    Documento informativo de cobro de servicio. ${effectiveRechargeTokens > 0 && rechargeScope === 'temporary' ? 'Las recargas puntuales aplican exclusivamente para el ciclo mensual en curso. ' : ''}
    Una vez confirmado el pago, el servicio y/o la capacidad quedan activos de inmediato.
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  const handleApplyChargeAndRecharge = async () => {
    if (!activeItem || isNewClient || processing) return;
    if (effectiveTotalCop <= 0 && effectiveRechargeTokens <= 0) {
      setFeedback({ type: 'error', text: 'Ingresa una recarga o un valor mayor a $0 COP.' });
      return;
    }
    if (chargeKind === 'token_pack' && effectiveRechargeTokens < 100_000 && effectiveOverageTokens <= 0) {
      setFeedback({ type: 'error', text: 'La recarga mínima es de 100.000 tokens.' });
      return;
    }
    setProcessing(true);
    setFeedback(null);
    const idempotencyKey = `erp-${chargeKind}-${activeItem.org.id}-${Date.now()}`;
    const discountNote =
      effectiveDiscountCop > 0
        ? ` | Lista $${subtotalCop.toLocaleString('es-CO')} - Desc. $${effectiveDiscountCop.toLocaleString('es-CO')} COP`
        : '';
    try {
      if (chargeKind === 'monthly_plan') {
        await grantCycleOrTrialAction({
          organizationId: activeItem.org.id,
          cycleKind: 'paid',
          days: 30,
          tokensLimit: Math.max(5_000_000, Number(activeItem.org.ai_tokens_limit || 5_000_000)),
          resetTokensUsed: true,
          amountCop: effectiveTotalCop,
          notes: `Cobro ERP: Mensualidad Normal${effectiveOverageTokens > 0 ? ` + excedente ${effectiveOverageTokens.toLocaleString('es-CO')} tok` : ''}${discountNote}`,
          idempotencyKey,
        });
      } else {
        await grantTokenPackAction({
          organizationId: activeItem.org.id,
          tokensAmount: effectiveRechargeTokens,
          overageSettledTokens: effectiveOverageTokens,
          mode: rechargeScope,
          amountCop: effectiveTotalCop,
          notes:
            (rechargeScope === 'permanent'
              ? `Cobro ERP: Ampliación permanente +${effectiveRechargeTokens.toLocaleString('es-CO')} tokens/mes`
              : `Cobro ERP: Recarga mes en curso +${effectiveRechargeTokens.toLocaleString('es-CO')} tokens`) + discountNote,
          idempotencyKey,
        });
      }
      setCustomRechargeCop(null);
      setDiscountValue(0);
      setFeedback({
        type: 'success',
        text: `Cobro registrado ($${effectiveTotalCop.toLocaleString('es-CO')} COP) para ${activeItem.org.name}.`,
      });
      onRefresh?.();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error registrando el cobro.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveAndSendQuote = async () => {
    if (!newClientName.trim() || !newClientEmail.trim()) {
      setFeedback({ type: 'error', text: 'Ingresa al menos Nombre del Negocio y Correo para guardar y enviar la cotización.' });
      return;
    }
    const safeLimit = Math.max(5_000_000, newClientTokensLimit);
    const entry: PendingQuoteRecord = {
      id: `q-${Date.now()}`,
      companyName: newClientName.trim(),
      adminName: newClientAdminName.trim() || newClientName.trim(),
      adminEmail: newClientEmail.trim().toLowerCase(),
      phone: customPhone.trim(),
      businessModel: newClientBusinessModel,
      maxUsers: newClientMaxUsers,
      aiTokensLimit: safeLimit,
      monthlyBaseCop: effectiveTotalCop,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const nextList = prunePendingQuotes([entry, ...pendingQuotes]);
    persistLocalQuotes(nextList);
    upsertPendingQuoteAction({
      companyName: entry.companyName,
      adminName: entry.adminName,
      adminEmail: entry.adminEmail,
      phone: entry.phone,
      businessModel: entry.businessModel,
      maxUsers: entry.maxUsers,
      aiTokensLimit: entry.aiTokensLimit,
      monthlyBaseCop: entry.monthlyBaseCop,
    }).catch(() => {});

    setFeedback({ type: 'success', text: `Cotización guardada para ${entry.companyName}.` });
    setQuoteSentModalUrl(waUrl);
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleApproveAndCreateCompany = async () => {
    if (!newClientName.trim() || !newClientEmail.trim()) {
      setFeedback({ type: 'error', text: 'Nombre del Negocio y Correo son obligatorios para crear la empresa.' });
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`¿Confirmas que "${newClientName.trim()}" ya realizó el pago para crear y activar su empresa?`)
    ) {
      return;
    }
    setProcessing(true);
    setFeedback(null);
    const tempPassword = `Synqo${Math.floor(1000 + Math.random() * 9000)}!`;
    const safeLimit = Math.max(5_000_000, newClientTokensLimit);
    const approvalDueDay = new Date().getDate();
    try {
      await provisionCompany({
        companyName: newClientName.trim(),
        adminName: newClientAdminName.trim() || newClientName.trim(),
        adminEmail: newClientEmail.trim(),
        adminPassword: tempPassword,
        maxUsers: newClientMaxUsers,
        industryPreset: newClientBusinessModel,
        aiTokensLimit: safeLimit,
        monthlyBasePriceCop: effectiveTotalCop,
        billingDueDay: approvalDueDay,
        enabledModules: {
          native_calendar: newClientBusinessModel !== 'products',
          orders: newClientBusinessModel !== 'services',
          physical_rooms: false,
          staff_mobile_portal: false,
          quick_pay: false,
          anti_no_show: true,
        },
      });
      setCreatedCredentials({
        companyName: newClientName.trim(),
        email: newClientEmail.trim(),
        tempPassword,
        phone: customPhone.trim(),
      });
      const emailKey = newClientEmail.trim().toLowerCase();
      persistLocalQuotes(
        pendingQuotes.filter((q) => q.adminEmail.toLowerCase() !== emailKey)
      );
      deletePendingQuoteAction(emailKey).catch(() => {});
      setFeedback({
        type: 'success',
        text: `¡Empresa "${newClientName.trim()}" creada y activada (día de pago: ${approvalDueDay} de cada mes)!`,
      });
      onRefresh?.();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Error al crear la empresa desde la cotización.' });
    } finally {
      setProcessing(false);
    }
  };

  const waUrl = isNewClient
    ? buildQuoteWhatsAppUrl({
        phone: customPhone,
        companyName: newClientName.trim() || 'tu negocio',
        mode: 'new_client',
        overageTokens: 0,
        overageCop: 0,
        rechargeTokens: 0,
        rechargeCop: 0,
        monthlyBaseCop: monthlyBaseCop,
        totalCop: effectiveTotalCop,
        daysRemaining: 30,
        baseTokensLimit: Math.max(5_000_000, newClientTokensLimit),
        maxUsers: newClientMaxUsers,
        discountCop: effectiveDiscountCop,
      })
    : activeItem
    ? buildQuoteWhatsAppUrl({
        phone: customPhone,
        companyName: activeItem.org.name,
        mode: chargeKind === 'monthly_plan' ? 'end_of_month' : 'mid_month_recharge',
        overageTokens: effectiveOverageTokens,
        overageCop: effectiveOverageCop,
        rechargeTokens: effectiveRechargeTokens,
        rechargeCop: effectiveRechargeCop,
        monthlyBaseCop: effectiveBaseCop || monthlyBaseCop,
        totalCop: effectiveTotalCop,
        daysRemaining: activeItem.quote.daysRemainingInCycle,
        baseTokensLimit: Number(activeItem.org.ai_tokens_limit || 5_000_000),
        discountCop: effectiveDiscountCop,
      })
    : '#';

  return (
    <div className="space-y-5">
      {/* KPIs Financieros Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Por Cobrar (Proyectado)</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-tabular">
            ${summaryStats.totalPendingCop.toLocaleString('es-CO')} COP
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">En Excedente</div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-tabular">
            {summaryStats.overageCount} empresa(s)
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B]">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Próximos a Corte (≤ 5d)</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-tabular">
            {summaryStats.dueSoonCount} empresa(s)
          </div>
        </div>
      </div>

      {/* Tarifas Globales Editables con Formato COP */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
          <DollarSign className="w-4 h-4 text-[#0052FF]" />
          <span>Tarifas Editables:</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>Base mensual:</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatCopInput(monthlyBaseCop)}
              onChange={(e) => {
                pricingDirtyRef.current = true;
                setMonthlyBaseCop(parseCopInput(e.target.value));
              }}
              className="w-32 h-8 pl-6 pr-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] font-mono text-xs"
            />
          </div>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>1M tokens extra:</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatCopInput(pricePer1MCop)}
              onChange={(e) => {
                pricingDirtyRef.current = true;
                setPricePer1MCop(Math.max(1000, parseCopInput(e.target.value)));
              }}
              className="w-28 h-8 pl-6 pr-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] font-mono text-xs"
            />
          </div>
        </label>
        {pricingSaveStatus !== 'idle' && (
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {pricingSaveStatus === 'saving' ? 'Guardando tarifas...' : 'Guardado en BD'}
          </span>
        )}
        {onOpenCreditsTab && (
          <button
            type="button"
            onClick={onOpenCreditsTab}
            className="ml-auto text-xs font-bold text-[#0052FF] dark:text-[#00D2FF] hover:underline cursor-pointer"
          >
            Ver liquidez en Billetera OpenAI →
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Cola de Cobro */}
        <div className="lg:col-span-6 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cola de Cobro</h3>
            <button
              type="button"
              onClick={() => {
                setChargeKind('new_client');
                setCustomPhone('');
                setFeedback(null);
                scrollToCalculatorOnMobile();
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                isNewClient
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700/40 hover:bg-purple-100'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Cotizar Nueva Empresa</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'overage', label: 'Excedente' },
                { id: 'due_soon', label: 'Por vencer' },
                { id: 'ok', label: 'Al día' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2 py-1 rounded-lg font-semibold cursor-pointer ${
                  filter === f.id
                    ? 'bg-[#0052FF] text-white'
                    : 'bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[280px] lg:max-h-[420px] overflow-y-auto pr-1">
            {filtered.map(({ org, quote, isOverage, isDueSoon }) => (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  setSelectedOrgId(org.id);
                  if (chargeKind === 'new_client') setChargeKind('monthly_plan');
                  scrollToCalculatorOnMobile();
                }}
                className={`w-full text-left p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                  !isNewClient && activeItem?.org.id === org.id
                    ? 'border-[#0052FF] bg-blue-50/50 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-[#232A3B] hover:border-slate-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{org.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {(quote.usedTokens / 1_000_000).toFixed(2)}M / {(quote.effectiveLimit / 1_000_000).toFixed(2)}M · Día pago: {(org as any).billing_due_day || '—'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isOverage
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                        : isDueSoon
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    {isOverage
                      ? `+${Math.round(quote.overageTokens / 1000)}k exc.`
                      : isDueSoon
                      ? `Corte en ${quote.daysRemainingInCycle}d`
                      : 'Al día'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {pendingQuotes.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-[#1E2433] space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Cotizaciones Pendientes ({pendingQuotes.length})
              </div>
              {pendingQuotes.map((q) => (
                <div
                  key={q.id}
                  onClick={() => {
                    setChargeKind('new_client');
                    setNewClientName(q.companyName);
                    setNewClientAdminName(q.adminName);
                    setNewClientEmail(q.adminEmail);
                    setCustomPhone(q.phone);
                    setNewClientBusinessModel(q.businessModel);
                    setNewClientMaxUsers(q.maxUsers);
                    setMonthlyBaseCop(q.monthlyBaseCop);
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF] cursor-pointer flex items-center justify-between text-[11px]"
                >
                  <span className="font-semibold truncate">{q.companyName} ({q.adminEmail})</span>
                  <span className="font-mono text-[#0052FF] shrink-0 ml-2">${q.monthlyBaseCop.toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calculadora Inteligente de Cobro + PDF + wa.me */}
        <div ref={calculatorRef} className="lg:col-span-6 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] p-4 sm:p-5 space-y-4 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-[#1E2433] pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isNewClient ? 'Cotizar Nueva Empresa' : activeItem?.org.name || 'Calculadora de Cobro'}
              </h3>
              {!isNewClient && activeItem && (
                <>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Faltan {activeItem.quote.daysRemainingInCycle} días para corte</span>
                  {Number(activeItem.org.ai_tokens_limit || 5_000_000) > 5_000_000 && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => {
                        setRevertStepOpen((prev) => !prev);
                        setRevertConfirmText('');
                      }}
                      className="text-[10px] font-bold text-amber-700 dark:text-amber-300 underline cursor-pointer ml-1"
                    >
                      Revertir a 5M base
                    </button>
                  )}
                </p>
                {revertStepOpen && activeItem && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 text-[11px] space-y-2">
                    <div className="font-bold text-amber-900 dark:text-amber-200">
                      Doble verificación: escribe REVERTIR para bajar la cuota permanente de {activeItem.org.name} a 5.000.000 tokens.
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={revertConfirmText}
                        onChange={(e) => setRevertConfirmText(e.target.value)}
                        placeholder="Escribe REVERTIR"
                        className="h-7 px-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#090A0F] text-xs font-mono uppercase w-36"
                      />
                      <button
                        type="button"
                        disabled={processing || revertConfirmText.trim().toUpperCase() !== 'REVERTIR'}
                        onClick={async () => {
                          if (!window.confirm(`Última confirmación: ¿revertir ${activeItem.org.name} a 5.000.000 tokens base?`)) return;
                          setProcessing(true);
                          try {
                            const res = await adjustPermanentTokensAction({
                              organizationId: activeItem.org.id,
                              targetBaseLimit: 5_000_000,
                            });
                            setMonthlyBaseCop(res.monthlyBasePriceCop);
                            setRevertStepOpen(false);
                            setRevertConfirmText('');
                            setFeedback({ type: 'success', text: 'Cuota base revertida a 5.000.000 tokens.' });
                            onRefresh?.();
                          } catch (e: any) {
                            setFeedback({ type: 'error', text: e?.message || 'Error revirtiendo cuota.' });
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        className="h-7 px-2.5 rounded-lg bg-amber-600 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRevertStepOpen(false);
                          setRevertConfirmText('');
                        }}
                        className="h-7 px-2 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!canGeneratePdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs font-semibold hover:bg-slate-100 dark:hover:bg-[#1A1F2C] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Generar PDF</span>
            </button>
          </div>

          {/* Selector de Tipo de Cobro */}
          {!isNewClient && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setChargeKind('monthly_plan')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                  chargeKind === 'monthly_plan'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300'
                }`}
              >
                <div>Mensualidad Normal</div>
                <div className="text-[10px] font-normal opacity-80">Plan base + excedente</div>
              </button>
              <button
                type="button"
                onClick={() => setChargeKind('token_pack')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                  chargeKind === 'token_pack'
                    ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                    : 'border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300'
                }`}
              >
                <div>Paquete Extra Tokens</div>
                <div className="text-[10px] font-normal opacity-80">Excedente + recarga mes</div>
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="space-y-3 text-xs">
            {isNewClient && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="sm:col-span-3 block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Nombre del Negocio *</span>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ej. Clínica Sonrisas"
                    className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Nombre Admin</span>
                  <input
                    type="text"
                    value={newClientAdminName}
                    onChange={(e) => setNewClientAdminName(e.target.value)}
                    placeholder="Ej. Laura Gómez"
                    className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
                  />
                </label>
                <label className="sm:col-span-2 block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Usuario / Correo a activar *</span>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    placeholder="admin@clinica.com"
                    className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
                  />
                </label>
                <label className="sm:col-span-2 block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Tipo de Negocio</span>
                  <select
                    value={newClientBusinessModel}
                    onChange={(e) => setNewClientBusinessModel(e.target.value as any)}
                    className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
                  >
                    <option value="products">Solo Productos</option>
                    <option value="services">Solo Servicios / Citas</option>
                    <option value="hybrid">Híbrido (Productos + Servicios)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Usuarios máx.</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newClientMaxUsers}
                    onChange={(e) => setNewClientMaxUsers(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
                  />
                </label>

                <div className="sm:col-span-3 p-3 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Capacidad Mensual Inicial (Tokens / Conversaciones)
                    </span>
                    <span className="text-[11px] font-bold text-[#0052FF] dark:text-[#00D2FF]">
                      {estimateChatsFromTokens(Math.max(5_000_000, newClientTokensLimit))} / mes
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5_000_000, 7_500_000, 10_000_000, 15_000_000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setNewClientTokensLimit(amt);
                          const extraM = Math.max(0, (amt - 5_000_000) / 1_000_000);
                          setMonthlyBaseCop(Math.round(169000 + extraM * pricePer1MCop));
                        }}
                        className={`h-8 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                          newClientTokensLimit === amt
                            ? 'bg-[#0052FF] text-white border-[#0052FF]'
                            : 'bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B]'
                        }`}
                      >
                        {formatTokenQuota(amt)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newClientTokensLimit > 0 ? newClientTokensLimit.toLocaleString('es-CO') : ''}
                      onChange={(e) => {
                        const parsed = parseCopInput(e.target.value);
                        setNewClientTokensLimit(parsed);
                        const extraM = Math.max(0, (Math.max(5_000_000, parsed) - 5_000_000) / 1_000_000);
                        setMonthlyBaseCop(Math.round(169000 + extraM * pricePer1MCop));
                      }}
                      placeholder="5.000.000"
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-mono text-xs font-bold"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCopInput(monthlyBaseCop)}
                      onChange={(e) => setMonthlyBaseCop(parseCopInput(e.target.value))}
                      placeholder="Mensualidad COP (editable)"
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-mono text-xs font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Por defecto 5.000.000 tokens (~400 a 667 conversaciones). Puedes ajustar capacidad o precio especial libremente.
                  </p>
                </div>
              </div>
            )}

            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                WhatsApp del Administrador {customPhone ? '(detectado / editable)' : '(ingresar manual)'}:
              </span>
              <input
                type="text"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="Ej. 573001234567"
                className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F]"
              />
            </label>

            {!isNewClient && chargeKind === 'token_pack' && activeItem && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRechargeScope('temporary')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      rechargeScope === 'temporary'
                        ? 'border-[#0052FF] bg-blue-50/70 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF] font-bold'
                        : 'border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div>Solo este mes</div>
                    <div className="text-[10px] font-normal opacity-80">Se suma al saldo extra del ciclo</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRechargeScope('permanent')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      rechargeScope === 'permanent'
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div>Permanente</div>
                    <div className="text-[10px] font-normal opacity-80">Amplía cuota y tarifa mensual</div>
                  </button>
                </div>

                {effectiveOverageTokens > 0 && (
                  <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-bold">
                        Excedente / gracia consumida
                      </div>
                      <div className="text-[11px] text-slate-700 dark:text-slate-200">
                        +{effectiveOverageTokens.toLocaleString('es-CO')} tok ({estimateChatsFromTokens(effectiveOverageTokens)}) · se salda al acreditar
                      </div>
                    </div>
                    <div className="text-xs font-black text-rose-600 dark:text-rose-400 font-tabular shrink-0">
                      ${effectiveOverageCop.toLocaleString('es-CO')} COP
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Recarga proyectada (Tokens)</span>
                    <span className="text-[11px] font-bold text-[#0052FF] dark:text-[#00D2FF]">
                      {estimateChatsFromTokens(effectiveRechargeTokens)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {[
                      {
                        label: `Sug. ${formatTokenQuota(activeItem.quote.recommendedRechargeTokens || 1_000_000)}`,
                        amt: activeItem.quote.recommendedRechargeTokens || 1_000_000,
                      },
                      { label: '+500k', amt: 500_000 },
                      { label: '+1M', amt: 1_000_000 },
                      { label: '+2M', amt: 2_000_000 },
                      { label: '+5M', amt: 5_000_000 },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setCustomRechargeTokens(chip.amt);
                          setCustomRechargeCop(null);
                        }}
                        className={`h-8 px-2 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                          effectiveRechargeTokens === chip.amt
                            ? 'bg-[#0052FF] text-white border-[#0052FF]'
                            : 'bg-white dark:bg-[#131722] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#232A3B]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRechargeTokens(Math.max(0, effectiveRechargeTokens - 500_000));
                        setCustomRechargeCop(null);
                      }}
                      className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-bold text-sm cursor-pointer hover:bg-slate-100"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={effectiveRechargeTokens > 0 ? effectiveRechargeTokens.toLocaleString('es-CO') : ''}
                      onChange={(e) => {
                        setCustomRechargeTokens(parseCopInput(e.target.value));
                        setCustomRechargeCop(null);
                      }}
                      placeholder="1.000.000"
                      className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-mono text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRechargeTokens(effectiveRechargeTokens + 500_000);
                        setCustomRechargeCop(null);
                      }}
                      className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-bold text-sm cursor-pointer hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500">
                      Valor recarga COP (editable para descuento):
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCopInput(effectiveRechargeCop)}
                      onChange={(e) => setCustomRechargeCop(parseCopInput(e.target.value))}
                      placeholder="0"
                      className="w-32 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-mono text-xs font-bold text-right text-[#0052FF]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Descuento puntual (opcional) */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Descuento:</span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-[#232A3B] overflow-hidden text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('cop');
                      setDiscountValue(0);
                    }}
                    className={`px-2 py-1 cursor-pointer ${
                      discountType === 'cop'
                        ? 'bg-[#0052FF] text-white'
                        : 'bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    $ COP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('pct');
                      setDiscountValue(0);
                    }}
                    className={`px-2 py-1 cursor-pointer ${
                      discountType === 'pct'
                        ? 'bg-[#0052FF] text-white'
                        : 'bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={discountValue > 0 ? (discountType === 'cop' ? formatCopInput(discountValue) : String(discountValue)) : ''}
                  onChange={(e) => {
                    const parsed = parseCopInput(e.target.value);
                    setDiscountValue(discountType === 'pct' ? Math.min(100, parsed) : parsed);
                  }}
                  placeholder={discountType === 'pct' ? '0 %' : '$ 0'}
                  className="w-28 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] font-mono text-xs font-bold text-right"
                />
                {effectiveDiscountCop > 0 && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    -${effectiveDiscountCop.toLocaleString('es-CO')}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 space-y-1">
              {effectiveDiscountCop > 0 && (
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Subtotal: ${subtotalCop.toLocaleString('es-CO')} COP</span>
                  <span className="text-emerald-600 font-semibold">Desc: -${effectiveDiscountCop.toLocaleString('es-CO')} COP</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">TOTAL A COBRAR</span>
                <span className="text-lg font-black text-[#0052FF] dark:text-[#00D2FF] font-tabular">
                  ${effectiveTotalCop.toLocaleString('es-CO')} COP
                </span>
              </div>
            </div>
          </div>

          {isNewClient ? (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleSaveAndSendQuote}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Guardar Cotización y Enviar por WhatsApp (wa.me)</span>
              </button>

              <div className="pt-3 border-t border-dashed border-slate-200 dark:border-[#232A3B] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  ¿El cliente ya realizó el pago?
                </span>
                <button
                  type="button"
                  onClick={handleApproveAndCreateCompany}
                  disabled={processing}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Aprobar Pago y Crear Empresa</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Cotizar por WhatsApp (wa.me)</span>
              </a>
              <button
                type="button"
                onClick={handleApplyChargeAndRecharge}
                disabled={processing || effectiveTotalCop <= 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>Registrar Cobro</span>
              </button>
            </div>
          )}

          {createdCredentials && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700/40 text-xs space-y-2">
              <div className="font-bold text-emerald-800 dark:text-emerald-200">
                Accesos listos para {createdCredentials.companyName}:
              </div>
              <div className="font-mono text-[11px] text-emerald-900 dark:text-emerald-100">
                Usuario: {createdCredentials.email} · Clave temporal: {createdCredentials.tempPassword}
              </div>
              <a
                href={`https://wa.me/${createdCredentials.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `¡Bienvenido a Synqo CRM! Tu cuenta de *${createdCredentials.companyName}* ya está activa.\n\n• Usuario: ${createdCredentials.email}\n• Contraseña temporal: ${createdCredentials.tempPassword}\n• Ingresa aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px]"
              >
                <Send className="w-3 h-3" />
                <span>Enviar Accesos por WhatsApp (wa.me)</span>
              </a>
            </div>
          )}

          {isNewClient && pendingQuotes.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-[#1E2433] space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Cotizaciones Pendientes ({pendingQuotes.length})
              </div>
              {pendingQuotes.map((q) => (
                <div
                  key={q.id}
                  onClick={() => {
                    setNewClientName(q.companyName);
                    setNewClientAdminName(q.adminName);
                    setNewClientEmail(q.adminEmail);
                    setCustomPhone(q.phone);
                    setNewClientBusinessModel(q.businessModel);
                    setNewClientMaxUsers(q.maxUsers);
                    setNewClientTokensLimit(q.aiTokensLimit || 5_000_000);
                    setMonthlyBaseCop(q.monthlyBaseCop);
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-[#232A3B] hover:border-[#0052FF] cursor-pointer flex items-center justify-between text-[11px]"
                >
                  <span className="font-semibold">
                    {q.companyName} ({q.adminEmail}) · {formatTokenQuota(q.aiTokensLimit || 5_000_000)}
                  </span>
                  <span className="font-mono text-[#0052FF]">${q.monthlyBaseCop.toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {quoteSentModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                ¡Cotización guardada y lista!
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              La cotización quedó guardada en <strong>Cotizaciones Pendientes</strong> e intentamos abrir WhatsApp automáticamente. Si tu navegador bloqueó la ventana emergente, usa el enlace directo:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={quoteSentModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Abrir WhatsApp (wa.me)</span>
              </a>
              <button
                type="button"
                onClick={() => setQuoteSentModalUrl(null)}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-[#232A3B] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
