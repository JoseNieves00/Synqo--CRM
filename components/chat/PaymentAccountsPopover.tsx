'use client';

import React from 'react';
import Link from 'next/link';
import { CreditCard, X } from 'lucide-react';
import type { CustomPaymentAccount } from '@/lib/types/payments';

interface PaymentAccountsPopoverProps {
  menuRef: React.RefObject<HTMLDivElement>;
  paymentAccounts: CustomPaymentAccount[];
  onClose: () => void;
  onInsertAll: () => void;
  onInsertOne: (acc: CustomPaymentAccount) => void;
}

export function PaymentAccountsPopover({
  menuRef,
  paymentAccounts,
  onClose,
  onInsertAll,
  onInsertOne,
}: PaymentAccountsPopoverProps) {
  const activeAccounts = paymentAccounts.filter((a) => a.isActive);

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-3 mb-2 z-40 w-84 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl shadow-2xl p-3 space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#1E2433] px-0.5">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CreditCard className="w-3.5 h-3.5" />
          </span>
          <span>Datos de Pago</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Link
            href="/settings"
            className="text-[11px] font-medium text-[#0052FF] dark:text-[#00D2FF] hover:underline"
            title="Configurar cuentas bancarias en Ajustes"
          >
            Ajustes
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeAccounts.length === 0 ? (
        <div className="py-5 px-3 text-center space-y-2">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#1A1F2C] border border-slate-200 dark:border-[#232A3B] flex items-center justify-center mx-auto text-slate-400">
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            No tienes cuentas de pago configuradas o activas.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0052FF] dark:text-[#00D2FF] hover:underline"
          >
            Configurar cuentas en Ajustes &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          <button
            type="button"
            onClick={onInsertAll}
            className="w-full text-left px-2.5 py-2 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition flex items-center justify-between cursor-pointer border border-emerald-200/80 dark:border-emerald-500/25 group"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📋</span>
              <span className="text-xs font-bold">Insertar todas las cuentas</span>
            </div>
            <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300">
              Completo
            </span>
          </button>

          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-1 pt-1">
            Cuentas individuales:
          </div>

          {activeAccounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => onInsertOne(acc)}
              className="w-full text-left p-2.5 rounded-xl bg-slate-50/70 dark:bg-[#0E131F]/60 hover:bg-slate-100 dark:hover:bg-[#1A1F2C] border border-slate-200/70 dark:border-[#232A3B] transition cursor-pointer flex flex-col gap-0.5 group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-[#0052FF] dark:group-hover:text-[#00D2FF] transition truncate">
                  {acc.title}
                </span>
                {acc.paymentLink && (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-[#0052FF] dark:text-[#00D2FF] shrink-0">
                    Link
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                {acc.accountNumber}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Titular: <span className="font-medium text-slate-600 dark:text-slate-400">{acc.holderName}</span>
                {acc.holderId ? ` • ${acc.holderId}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
