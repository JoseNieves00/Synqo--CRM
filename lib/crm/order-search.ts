/**
 * Helpers compartidos para búsqueda normalizada de contactos y pedidos (sin tildes ni formato estricto de teléfono).
 */

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value || '').replace(/[^\d]/g, '');
}

export function matchesOrderSearchQuery(
  order: {
    customer_name?: string | null;
    customer_phone?: string | null;
    city?: string | null;
    address?: string | null;
    notes?: string | null;
    items?: Array<{ product_name?: string | null }>;
  },
  rawQuery: string
): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;

  const qDigits = normalizePhoneDigits(rawQuery);
  const textMatch =
    normalizeSearchText(order.customer_name).includes(q) ||
    normalizeSearchText(order.customer_phone).includes(q) ||
    normalizeSearchText(order.city).includes(q) ||
    normalizeSearchText(order.address).includes(q) ||
    normalizeSearchText(order.notes).includes(q) ||
    (order.items || []).some((it) => normalizeSearchText(it.product_name).includes(q));

  if (textMatch) return true;

  // Coincidencia flexible por dígitos (ej: "305 906 1271" contra "+573059061271")
  if (qDigits.length >= 4) {
    const phoneDigits = normalizePhoneDigits(order.customer_phone);
    if (phoneDigits && phoneDigits.includes(qDigits)) return true;
  }

  return false;
}
