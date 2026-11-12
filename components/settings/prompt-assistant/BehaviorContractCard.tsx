'use client';

import React from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import type { BehaviorContract } from '@/lib/ai/prompt-assistant/readiness';
import type { PendingSectionProposal } from '@/lib/ai/prompt-assistant/state';
import { SectionProposalCard } from './SectionProposalCard';

interface BehaviorContractCardProps {
  contract: BehaviorContract | null;
  proposals: PendingSectionProposal[];
  onAccept: (proposal: PendingSectionProposal) => void;
  onReject: (proposalId: string) => void;
}

/**
 * "¿Qué hará tu bot realmente?" — Contrato de comportamiento del prompt:
 * traduce el texto del negocio a conductas ejecutables concretas (0 tokens)
 * y propone con 1 clic las que faltan para que el bot haga lo que el cliente
 * quiere que haga en realidad.
 */
export function BehaviorContractCard({ contract, proposals, onAccept, onReject }: BehaviorContractCardProps) {
  if (!contract) return null;

  const detected = contract.items.filter((i) => i.detected);
  const missing = contract.items.filter((i) => !i.detected);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F] p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <CircleHelp className="w-3.5 h-3.5 text-[#0052FF]" />
            ¿Qué hará tu bot realmente?
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Esto es lo que tu bot puede hacer HOY con las instrucciones que escribiste. Lo que falta,
            lo puedes completar con un clic.
          </p>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
            missing.length === 0
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}
        >
          {detected.length}/{contract.items.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1">
        {contract.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 text-[11px] leading-snug"
            title={item.evidence ? `Evidencia en tu texto: "${item.evidence}"` : 'No se encontró en tu prompt'}
          >
            <span
              className={`mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                item.detected
                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                  : 'bg-slate-200 dark:bg-[#232A3B]'
              }`}
            >
              {item.detected ? (
                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="w-2.5 h-2.5 text-slate-400" />
              )}
            </span>
            <span className={item.detected ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}>
              {item.title}
              {item.detected && item.evidence ? (
                <span className="text-slate-400 dark:text-slate-500"> — {item.evidence}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {proposals.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Completa lo que falta ({proposals.length})
          </div>
          {proposals.map((prop) => (
            <SectionProposalCard
              key={prop.id}
              proposal={prop}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
