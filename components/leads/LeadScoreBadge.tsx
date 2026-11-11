'use client';

import React from 'react';
import { Flame } from 'lucide-react';
import { getLeadScoreBand, LEAD_SCORE_BAND_META, type LeadScoreFactor } from '@/lib/leads/lead-score';

interface LeadScoreBadgeProps {
  score?: number | null;
  breakdown?: LeadScoreFactor[] | null;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
  className?: string;
}

/** Formatea el desglose del score para tooltip nativo ("por qué 82"). */
export function formatLeadScoreBreakdown(score: number, breakdown?: LeadScoreFactor[] | null): string {
  const lines = (breakdown || []).map((f) => `${f.points > 0 ? '+' : ''}${f.points}  ${f.label}`);
  return [`Probabilidad de compra: ${score}/100`, ...lines].join('\n');
}

export const LeadScoreBadge = React.memo(function LeadScoreBadge({
  score,
  breakdown,
  size = 'xs',
  showLabel = false,
  className = '',
}: LeadScoreBadgeProps) {
  const band = getLeadScoreBand(score);
  if (!band || score === null || score === undefined) return null;
  const meta = LEAD_SCORE_BAND_META[band];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-[10px] px-1.5 py-px gap-0.5';

  return (
    <span
      title={formatLeadScoreBreakdown(score, breakdown)}
      className={`inline-flex items-center rounded-md border font-bold tabular-nums leading-none shrink-0 ${sizeClass} ${meta.className} ${className}`}
      aria-label={`Probabilidad de compra ${score} de 100 (${meta.label})`}
    >
      {band === 'very_high' && <Flame className={size === 'sm' ? 'w-3 h-3' : 'w-2.5 h-2.5'} />}
      {score}
      {showLabel && <span className="font-medium">· {meta.label}</span>}
    </span>
  );
});
