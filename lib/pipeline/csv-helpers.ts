/**
 * Normaliza un número telefónico a formato internacional E.164.
 * Si tiene 10 dígitos (ej. móvil en Colombia 3124567890), antepone +57 por defecto.
 */
export function normalizeE164Phone(rawPhone: string, defaultCountryCode = '57'): string {
  if (!rawPhone) return '';
  // Eliminar espacios, guiones, puntos y caracteres no numéricos excepto '+'
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return digits.length >= 7 ? `+${digits}` : '';
  }

  const onlyDigits = cleaned.replace(/\D/g, '');
  if (onlyDigits.length === 10) {
    return `+${defaultCountryCode}${onlyDigits}`;
  }
  if (onlyDigits.length >= 11) {
    return `+${onlyDigits}`;
  }
  return onlyDigits.length >= 7 ? `+${defaultCountryCode}${onlyDigits}` : '';
}

/**
 * Sanitiza campos de texto para evitar CSV Formula Injection (=, +, -, @)
 */
export function sanitizeCsvField(text?: string | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}
