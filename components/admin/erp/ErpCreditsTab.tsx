'use client';

import React, { useEffect, useState } from 'react';
import {
  Wallet,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import {
  getErpCreditsAndWalletAction,
  updateOpenAiWalletAction,
} from '@/app/actions/erp';
import { formatTokenQuota, estimateChatsFromTokens } from '@/lib/billing/plan-defaults';
import { estimateMarginalOpenAiCost } from '@/services/erp.service';
import type { OrganizationRow } from '@/app/actions/superadmin';

interface ErpCreditsTabProps {
  organizations: OrganizationRow[];
  onGoToBilling?: (orgId: string) => void;
}

export function ErpCreditsTab({ organizations, onGoToBilling }: ErpCreditsTabProps) {
  const [loading, setLoading] = useState(true);
  const [savingWallet, setSavingWallet] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getErpCreditsAndWalletAction>> | null>(null);

  const [balanceUsd, setBalanceUsd] = useState('0');
  const [trm, setTrm] = useState('4200');
  const [bufferPct, setBufferPct] = useState('15');
  const [walletNotes, setWalletNotes] = useState('');
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getErpCreditsAndWalletAction();
      setData(res);
      setBalanceUsd(String(res.wallet.balanceUsd));
      setTrm(String(res.wallet.trmCopPerUsd));
      setBufferPct(String(res.wallet.safetyBufferPct));
      setWalletNotes(res.wallet.notes || '');
      setIsWalletOpen(res.wallet.balanceUsd <= 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWallet(true);
    setFeedback(null);
    try {
      await updateOpenAiWalletAction({
        balanceUsd: Number(balanceUsd) || 0,
        trmCopPerUsd: Number(trm) || 4200,
        safetyBufferPct: Number(bufferPct) || 15,
        notes: walletNotes,
      });
      await loadData();
      setFeedback('Billetera OpenAI actualizada.');
    } finally {
      setSavingWallet(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#0052FF]" />
        <span className="text-xs">Calculando liquidez OpenAI...</span>
      </div>
    );
  }

  const f = data?.forecast;
  const activeOrgs = organizations.filter(
    (o) => o.is_active !== false && !o.name.startsWith('__TEST_')
  );

  return (
    <div className="space-y-5">
      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Semáforo de Liquidez OpenAI */}
      {f && (
        <div
          className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            f.isSufficient
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/80 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                f.isSufficient ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
              }`}
            >
              {f.isSufficient ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {f.isSufficient
                  ? `Saldo OpenAI suficiente (superávit de $${f.surplusUsd.toFixed(2)} USD)`
                  : `Recarga recomendada en OpenAI: $${f.deficitUsd.toFixed(2)} USD (~$${f.deficitCop.toLocaleString('es-CO')} COP)`}
              </h3>
              <p className="text-xs opacity-85 mt-0.5">
                {f.activeOrgsCount} empresas activas ({f.trialOrgsCount} en prueba) · Compromiso pendiente:{' '}
                <strong>{formatTokenQuota(f.committedRemainingTokens)}</strong> ({estimateChatsFromTokens(f.committedRemainingTokens)}) ·
                Costo est. con buffer: <strong>${f.estimatedWithBufferUsd.toFixed(2)} USD</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 self-start md:self-center cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recalcular
          </button>
        </div>
      )}

      {/* Acordeón: Billetera OpenAI (configuración inicial o recargas) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsWalletOpen((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Wallet className="w-4 h-4 text-[#0052FF] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900">Billetera OpenAI</h3>
              <p className="text-[11px] text-gray-500 truncate">
                {f
                  ? `Saldo real est.: $${f.walletBalanceUsd.toFixed(2)} USD · Descuento automático activo`
                  : 'Configura tu saldo inicial una sola vez'}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
              isWalletOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isWalletOpen && (
          <form onSubmit={handleSaveWallet} className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4">
            {data?.wallet.trmSource === 'live_api' && (
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Dólar en vivo: ${Number(trm).toLocaleString('es-CO')} COP
              </span>
            )}

            {f && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Saldo base</span>
                  <strong className="font-mono text-slate-900">${f.recordedWalletBalanceUsd.toFixed(2)} USD</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Consumo auto</span>
                  <strong className="font-mono text-rose-600">-${f.spentSinceUpdateUsd.toFixed(4)} USD</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Saldo real est.</span>
                  <strong className="font-mono text-emerald-700">${f.walletBalanceUsd.toFixed(2)} USD</strong>
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-500 leading-snug">
              Ingresa tu saldo actual de{' '}
              <a
                href="https://platform.openai.com/settings/organization/billing/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0052FF] font-semibold hover:underline"
              >
                OpenAI Billing
              </a>{' '}
              la primera vez (o cuando recargues). El sistema descuenta automáticamente cada uso en{' '}
              <code className="font-mono">ai_runs</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Saldo OpenAI (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={balanceUsd}
                  onChange={(e) => setBalanceUsd(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 font-mono font-bold text-gray-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Buffer Seguridad (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={bufferPct}
                  onChange={(e) => setBufferPct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 font-mono text-gray-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingWallet}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingWallet ? 'Guardando...' : 'Guardar Saldo OpenAI'}
            </button>
          </form>
        )}
      </div>

      {/* Desglose de Compromiso por Empresa */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Compromiso por Empresa Activa ({activeOrgs.length})
          </h3>
          <span className="text-[11px] text-gray-400">
            Las recargas y cobros se gestionan desde Cotizar &amp; Cobrar
          </span>
        </div>
        <div className="divide-y divide-gray-100 text-xs">
          {activeOrgs.map((org) => {
            const limit = Number(org.ai_tokens_limit || 5_000_000);
            const extra = Math.max(0, Number((org as any).extra_tokens_balance || 0));
            const used = Number(org.ai_tokens_used || 0);
            const remaining = Math.max(0, limit + extra - used);
            const est = estimateMarginalOpenAiCost({
              tokens: remaining,
              trmCopPerUsd: Number(trm) || 4200,
            });
            return (
              <div key={org.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{org.name}</div>
                  <div className="text-[11px] text-gray-500">
                    Límite base: <span className="font-mono">{formatTokenQuota(limit)}</span>
                    {extra > 0 && (
                      <span className="text-emerald-700 font-semibold"> + {formatTokenQuota(extra)} extra</span>
                    )}{' '}
                    · Restante: <span className="font-mono">{formatTokenQuota(remaining)}</span> ({estimateChatsFromTokens(remaining)})
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right font-mono">
                    <div className="font-bold text-gray-900">${est.usd.toFixed(2)} USD</div>
                    <div className="text-[10px] text-gray-500">~${est.cop.toLocaleString('es-CO')} COP</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoToBilling?.(org.id)}
                    className="px-3 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0043D4] text-white text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  >
                    <span>Recargar / Cobrar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
