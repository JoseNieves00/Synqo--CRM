import type { FollowUpCategory } from '@/lib/ai/follow-up-types';
import { LEAD_SCORE_UNCLASSIFIED_BASE } from '@/lib/leads/lead-score';

export interface ReactivationQueueItem {
  contact: { lead_score?: number | null; [key: string]: any };
  category: FollowUpCategory;
}

const CATEGORY_RANK: Record<string, number> = {
  hot_unclosed: 0,
  qualified_doubt: 1,
  warm: 2,
  post_order: 3,
  unresponsive: 4,
};

/**
 * Ordena la cola de recontacto para que el cupo diario se gaste en quienes tienen
 * más probabilidad de comprar, y descarta a quienes están por debajo del umbral.
 *
 * - Post-pedido nunca se filtra por score (es fidelización, no venta).
 * - Contactos sin score aún (null) no se descartan; se ordenan con la base neutra de "sin clasificar".
 */
export function prioritizeReactivationQueue<T extends ReactivationQueueItem>(
  queue: T[],
  opts: { prioritizeByScore: boolean; minLeadScore: number }
): T[] {
  const rank = (cat: FollowUpCategory) => CATEGORY_RANK[cat] ?? 5;
  const scoreOf = (item: T) =>
    typeof item.contact.lead_score === 'number' && Number.isFinite(item.contact.lead_score)
      ? item.contact.lead_score
      : null;

  const filtered = opts.prioritizeByScore
    ? queue.filter((item) => {
        if (item.category === 'post_order') return true;
        const score = scoreOf(item);
        return score === null || score >= opts.minLeadScore;
      })
    : [...queue];

  return filtered.sort((a, b) => {
    if (opts.prioritizeByScore) {
      // Sin score aún → se ordena como "sin clasificar" (base neutra)
      const sa = scoreOf(a) ?? LEAD_SCORE_UNCLASSIFIED_BASE;
      const sb = scoreOf(b) ?? LEAD_SCORE_UNCLASSIFIED_BASE;
      if (sa !== sb) return sb - sa;
    }
    return rank(a.category) - rank(b.category);
  });
}
