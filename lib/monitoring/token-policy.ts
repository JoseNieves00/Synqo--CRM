/**
 * Política de Consumo de Tokens, Umbrales Push Configurables (x%) y Estado Gerencial.
 * Única fuente de verdad para cálculo de excedentes, alertas por umbral y reportes por WhatsApp.
 * Se almacena dentro de `organizations.appointment_settings.token_policy` y `.manager_security`
 * para mantener compatibilidad sin migraciones obligatorias.
 */

export const DEFAULT_TOKEN_ALERT_THRESHOLDS = [80, 90, 100] as const;

export interface TokenPolicyConfig {
  /** Porcentajes enteros (10..100) en los que se envía aviso único por ciclo */
  alertThresholds: number[];
  /** Mapa threshold ("80", "90", "100") -> ISO timestamp de envío en el ciclo actual */
  alertsSentInCycle: Record<string, string>;
  /** Tarifa de referencia por cada 500k tokens extra en COP (opcional para mostrar en aviso) */
  overagePricePer500kCop?: number | null;
  /** En Synqo el bot continúa operando en Modo Excedente al superar el 100% */
  overageAllowed: boolean;
}

export interface ManagerSessionState {
  unlockedUntil?: string | null;
  awaitingPinUntil?: string | null;
  pendingCommand?: string | null;
  failedAttempts?: number;
  lockedUntil?: string | null;
}

export interface ManagerSecurityConfig {
  pinHash?: string | null;
  sessionTtlMinutes: number;
  sessions: Record<string, ManagerSessionState>;
}

export interface TokenStatusSnapshot {
  used: number;
  limit: number;
  rawPercentage: number;
  displayPercentage: number;
  remainingBase: number;
  overageTokens: number;
  isOverage: boolean;
  isWarning: boolean;
  crossedThresholds: number[];
  unnotifiedThresholds: number[];
  highestUnnotifiedThreshold: number | null;
}

/**
 * Normaliza una lista o cadena de umbrales porcentuales (10..100) ordenada ascendentemente.
 */
export function normalizeAlertThresholds(raw?: unknown): number[] {
  let candidates: number[] = [];

  if (Array.isArray(raw)) {
    candidates = raw.map((v) => Number(v));
  } else if (typeof raw === 'string') {
    candidates = raw
      .split(/[,;\s]+/)
      .map((s) => Number(s.replace(/[^0-9]/g, '')))
      .filter((n) => Number.isFinite(n));
  }

  const valid = Array.from(
    new Set(
      candidates
        .map((n) => Math.round(n))
        .filter((n) => Number.isFinite(n) && n >= 10 && n <= 100)
    )
  ).sort((a, b) => a - b);

  if (valid.length === 0) {
    return [...DEFAULT_TOKEN_ALERT_THRESHOLDS];
  }

  // Asegurar máximo 5 umbrales para evitar sobrecarga de notificaciones
  return valid.slice(0, 5);
}

export function normalizeTokenPolicy(raw?: any): TokenPolicyConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const alertsSentRaw =
    src.alertsSentInCycle && typeof src.alertsSentInCycle === 'object'
      ? src.alertsSentInCycle
      : {};

  const alertsSentInCycle: Record<string, string> = {};
  for (const [k, v] of Object.entries(alertsSentRaw)) {
    if (typeof v === 'string' && v.trim()) {
      alertsSentInCycle[String(k)] = v;
    }
  }

  const priceNum = Number(src.overagePricePer500kCop);
  return {
    alertThresholds: normalizeAlertThresholds(src.alertThresholds),
    alertsSentInCycle,
    overagePricePer500kCop:
      Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum) : null,
    overageAllowed: src.overageAllowed !== false,
  };
}

export function normalizeManagerSecurity(raw?: any): ManagerSecurityConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const ttl = Number(src.sessionTtlMinutes);
  const sessions =
    src.sessions && typeof src.sessions === 'object' ? { ...src.sessions } : {};

  return {
    pinHash: typeof src.pinHash === 'string' && src.pinHash.trim() ? src.pinHash.trim() : null,
    sessionTtlMinutes: Number.isFinite(ttl) && ttl >= 5 && ttl <= 60 ? Math.round(ttl) : 15,
    sessions,
  };
}

/**
 * Calcula estado exacto de consumo, excedente y qué umbrales Push faltan por notificar en el ciclo.
 */
export function computeTokenStatus(params: {
  used: number;
  limit: number;
  policy?: TokenPolicyConfig | any;
}): TokenStatusSnapshot {
  const limit = Number(params.limit) > 0 ? Number(params.limit) : 500000;
  const used = Math.max(0, Number(params.used) || 0);
  const policy = normalizeTokenPolicy(params.policy);

  const exactPct = (used / limit) * 100;
  const rawPercentage = Math.round(exactPct);
  const remainingBase = Math.max(0, limit - used);
  const overageTokens = Math.max(0, used - limit);
  const isOverage = used >= limit;

  const minWarningThreshold =
    policy.alertThresholds.find((t) => t < 100) ?? 80;
  const isWarning = !isOverage && rawPercentage >= minWarningThreshold;

  const crossedThresholds = policy.alertThresholds.filter((t) => rawPercentage >= t);
  const unnotifiedThresholds = crossedThresholds.filter(
    (t) => !policy.alertsSentInCycle[String(t)]
  );
  const highestUnnotifiedThreshold =
    unnotifiedThresholds.length > 0
      ? unnotifiedThresholds[unnotifiedThresholds.length - 1]
      : null;

  return {
    used,
    limit,
    rawPercentage,
    displayPercentage: Math.min(100, rawPercentage),
    remainingBase,
    overageTokens,
    isOverage,
    isWarning,
    crossedThresholds,
    unnotifiedThresholds,
    highestUnnotifiedThreshold,
  };
}

/**
 * Redacta el mensaje Push proactivo para WhatsApp cuando la empresa cruza un umbral (x% o 100%).
 */
export function formatPushTokenAlertMessage(params: {
  orgName: string;
  adminName?: string | null;
  threshold: number;
  used: number;
  limit: number;
  rawPercentage: number;
  overageTokens: number;
  overagePricePer500kCop?: number | null;
}): string {
  const firstName = (params.adminName || '').trim().split(' ')[0];
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const extraPriceNote = params.overagePricePer500kCop
    ? ` ($${params.overagePricePer500kCop.toLocaleString('es-CO')} COP por cada 500k tokens adicionales)`
    : '';

  if (params.threshold >= 100 || params.overageTokens > 0) {
    return [
      `🔔 *Notificación Synqo — ${params.orgName}*`,
      `${greeting}, completaste el 100% de tu cupo base mensual (${params.used.toLocaleString('es-CO')} / ${params.limit.toLocaleString('es-CO')} tokens · ${params.rawPercentage}%).`,
      ``,
      `🟢 *Tu bot sigue atendiendo sin interrupciones en Modo Excedente.*`,
      `• Excedente actual: *${params.overageTokens.toLocaleString('es-CO')} tokens*${extraPriceNote}.`,
      `Puedes consultar el consumo en vivo cuando quieras escribiendo *#tokens*.`,
    ].join('\n');
  }

  return [
    `⚠️ *Alerta preventiva Synqo (${params.threshold}%) — ${params.orgName}*`,
    `${greeting}, tu empresa alcanzó el *${params.rawPercentage}%* de sus tokens base (${params.used.toLocaleString('es-CO')} / ${params.limit.toLocaleString('es-CO')}).`,
    ``,
    `• Cupo base restante: *${Math.max(0, params.limit - params.used).toLocaleString('es-CO')} tokens*.`,
    `• Al llegar al 100%, el bot *no se detendrá* y pasará automáticamente a Modo Excedente${extraPriceNote}.`,
    `Escribe *#tokens* en este chat cuando quieras ver el detalle actualizado.`,
  ].join('\n');
}

/**
 * Reporte determinístico de tokens para WhatsApp Pull (`#tokens` / opción `1`). 0 tokens de IA.
 */
export function formatManagerTokensReport(params: {
  orgName: string;
  adminName?: string | null;
  status: TokenStatusSnapshot;
  googleUsed?: number;
  openaiUsed?: number;
  overagePricePer500kCop?: number | null;
}): string {
  const { status } = params;
  const overageNote =
    status.isOverage && params.overagePricePer500kCop
      ? ` (~$${Math.ceil((status.overageTokens / 500000) * params.overagePricePer500kCop).toLocaleString('es-CO')} COP est.)`
      : '';

  const lines = [
    `🤖 *ESTADO DE TOKENS — ${params.orgName.toUpperCase()}*`,
    `• Cupo base mensual: *${status.limit.toLocaleString('es-CO')}* tokens`,
    `• Consumidos: *${status.used.toLocaleString('es-CO')}* (${status.rawPercentage}%)`,
    status.isOverage
      ? `• Excedente acumulado: *${status.overageTokens.toLocaleString('es-CO')}* tokens${overageNote}`
      : `• Cupo restante base: *${status.remainingBase.toLocaleString('es-CO')}* tokens`,
  ];

  if (typeof params.googleUsed === 'number' || typeof params.openaiUsed === 'number') {
    lines.push(
      `• Motores: Gemini ${(params.googleUsed || 0).toLocaleString('es-CO')} · Respaldo ${(params.openaiUsed || 0).toLocaleString('es-CO')}`
    );
  }

  lines.push(
    status.isOverage
      ? `• Estado bot: 🟢 *Operativo (Modo Excedente activo)*`
      : `• Estado bot: 🟢 *100% Operativo*`
  );
  lines.push(`\nResponde *#admin* para ver opciones gerenciales o *salir* para cerrar sesión.`);
  return lines.join('\n');
}

/**
 * Menú gerencial base tipo Bancolombia (listo para escalar opciones 2..5 en la siguiente iteración).
 */
export function formatManagerMenuMessage(params: {
  orgName: string;
  adminName?: string | null;
}): string {
  const firstName = (params.adminName || '').trim().split(' ')[0] || 'Administrador';
  return [
    `📊 *PANEL GERENCIAL — ${params.orgName.toUpperCase()}*`,
    `Hola ${firstName}, sesión segura activa (15 min):`,
    ``,
    `🔢 *1.* 🤖 Consumo de Tokens y Excedente *(Disponible)*`,
    `🔢 *2.* 📈 Resumen Comercial de Hoy *(Próximamente)*`,
    `🔢 *3.* 👥 Asesores y Carga de Chats *(Próximamente)*`,
    `🔢 *4.* 🚨 Chats Críticos sin Responder *(Próximamente)*`,
    `🔢 *5.* ⏸️ Pausar / Activar Bot IA *(Próximamente)*`,
    ``,
    `Responde con *1* (o *#tokens*) para consultar consumo, o *salir* para cerrar sesión.`,
  ].join('\n');
}
