export type PlatformAlertEventType =
  | 'new_ticket'
  | 'channel_disconnected'
  | 'token_expired'
  | 'company_token_threshold'
  | 'assistant_cap_exceeded'
  | 'billing_delinquency'
  | 'ai_error_burst'
  | 'daily_digest';

export type PlatformAlertSeverity = 'info' | 'warning' | 'critical';

export interface PlatformAlertEvent {
  id?: string;
  type: PlatformAlertEventType;
  severity?: PlatformAlertSeverity;
  orgId?: string;
  companyName: string;
  title: string;
  details: string;
  dedupeWindowMinutes?: number;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface PlatformAlertsConfig {
  enabled: boolean;
  notifyOnTicket: boolean;
  notifyOnDisconnect: boolean;
  notifyOnTokenExpired: boolean;
  notifyOnTokenThreshold: boolean;
  notifyOnAssistantCap: boolean;
  notifyOnBillingDelinquency: boolean;
  notifyOnAiErrorBurst: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string;   // "07:00"
  metaTemplateName?: string;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  targetAudience: 'all' | 'paying' | 'evolution';
  createdAt: string;
  expiresAt?: string | null;
  createdByEmail?: string;
  sendWhatsAppBroadcast?: boolean;
}

export interface PlatformEventLogItem {
  id: string;
  type: PlatformAlertEventType;
  severity: PlatformAlertSeverity;
  orgId?: string;
  companyName: string;
  title: string;
  details: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  metadata?: Record<string, any>;
}

export const DEFAULT_PLATFORM_ALERTS_CONFIG: PlatformAlertsConfig = {
  enabled: true,
  notifyOnTicket: true,
  notifyOnDisconnect: true,
  notifyOnTokenExpired: true,
  notifyOnTokenThreshold: true,
  notifyOnAssistantCap: true,
  notifyOnBillingDelinquency: true,
  notifyOnAiErrorBurst: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  metaTemplateName: '',
};

export function normalizePlatformAlertsConfig(
  input: any
): PlatformAlertsConfig {
  const src = input && typeof input === 'object' ? input : {};
  return {
    enabled: src.enabled !== false,
    notifyOnTicket: src.notifyOnTicket !== false,
    notifyOnDisconnect: src.notifyOnDisconnect !== false,
    notifyOnTokenExpired: src.notifyOnTokenExpired !== false,
    notifyOnTokenThreshold: src.notifyOnTokenThreshold !== false,
    notifyOnAssistantCap: src.notifyOnAssistantCap !== false,
    notifyOnBillingDelinquency: src.notifyOnBillingDelinquency !== false,
    notifyOnAiErrorBurst: src.notifyOnAiErrorBurst !== false,
    quietHoursEnabled: Boolean(src.quietHoursEnabled),
    quietHoursStart: typeof src.quietHoursStart === 'string' && src.quietHoursStart ? src.quietHoursStart : '22:00',
    quietHoursEnd: typeof src.quietHoursEnd === 'string' && src.quietHoursEnd ? src.quietHoursEnd : '07:00',
    metaTemplateName: typeof src.metaTemplateName === 'string' ? src.metaTemplateName.trim() : '',
  };
}

export function isWithinQuietHours(
  config: PlatformAlertsConfig,
  date: Date = new Date(),
  timeZone = 'America/Bogota'
): boolean {
  if (!config.quietHoursEnabled) return false;
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date); // "HH:mm"

  const [currH, currM] = timeStr.split(':').map(Number);
  const [startH, startM] = (config.quietHoursStart || '22:00').split(':').map(Number);
  const [endH, endM] = (config.quietHoursEnd || '07:00').split(':').map(Number);

  const curr = currH * 60 + currM;
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (start < end) {
    return curr >= start && curr < end;
  }
  // Cruce de medianoche (ej: 22:00 a 07:00)
  return curr >= start || curr < end;
}
