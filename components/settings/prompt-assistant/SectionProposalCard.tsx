'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Edit3, Loader2, Sparkles, X } from 'lucide-react';
import type { PendingSectionProposal } from '@/lib/ai/prompt-assistant/state';

interface SectionProposalCardProps {
  proposal: PendingSectionProposal;
  onAccept: (proposal: PendingSectionProposal) => Promise<void> | void;
  onReject: (proposalId: string) => Promise<void> | void;
}

export function SectionProposalCard({
  proposal,
  onAccept,
  onReject,
}: SectionProposalCardProps) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(proposal.proposedText);

  useEffect(() => {
    setDraftText(proposal.proposedText);
    setEditing(false);
  }, [proposal.id, proposal.proposedText]);

  const handleAccept = async () => {
    setBusy('accept');
    try {
      await onAccept({
        ...proposal,
        proposedText: draftText.trim() || proposal.proposedText,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    try {
      await onReject(proposal.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 text-xs space-y-2 ${
        proposal.isConflict
          ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20'
          : 'border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          {proposal.isConflict ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#00D2FF] shrink-0" />
          )}
          <span>{proposal.sectionTitle}</span>
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 text-right">
          {proposal.reason}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <div className="rounded-lg bg-slate-100/80 dark:bg-[#090A0F] p-2 border border-slate-200/70 dark:border-[#1E2433]">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">
            Actual
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-3">
            {proposal.currentText || 'Sin definir'}
          </p>
        </div>

        <div className="rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 p-2 border border-emerald-200 dark:border-emerald-700/40">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400">
              Propuesta
            </span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[10px] font-semibold text-slate-500 hover:text-[#0052FF] dark:text-slate-400 dark:hover:text-[#00D2FF] inline-flex items-center gap-0.5 cursor-pointer"
            >
              <Edit3 className="w-2.5 h-2.5" />
              <span>{editing ? 'Vista previa' : 'Editar'}</span>
            </button>
          </div>

          {editing ? (
            <textarea
              rows={4}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="w-full text-[11px] p-1.5 rounded-md border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#090A0F] text-slate-800 dark:text-slate-100 leading-relaxed"
            />
          ) : (
            <p className="text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {draftText}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleReject}
          disabled={busy !== null}
          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#232A3B] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E2433] text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {busy === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          <span>Descartar</span>
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy !== null || !draftText.trim()}
          className="px-2.5 py-1 rounded-lg bg-[#0052FF] hover:bg-[#0043D4] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {busy === 'accept' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          <span>Aplicar en sección</span>
        </button>
      </div>
    </div>
  );
}
