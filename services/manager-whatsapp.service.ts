import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/security/encryption';
import { MessagingService } from './messaging.service';
import { PlatformAlertService } from './platform-alert.service';
import {
  computeTokenStatus,
  formatManagerMenuMessage,
  formatManagerTokensReport,
  normalizeManagerSecurity,
  normalizeTokenPolicy,
  type ManagerSessionState,
} from '@/lib/monitoring/token-policy';

const COMMAND_REGEX = /^#(tokens|admin|kpis|synqo|reporte)\b/i;
const EXIT_REGEX = /^(salir|cerrar|#salir)$/i;
const PIN_REGEX = /^\d{4}$/;
const MENU_OPTION_REGEX = /^[1-5]$/;

export interface ManagerCommandEvaluationResult {
  handled: boolean;
  replyText?: string;
  updatedAppointmentSettings?: Record<string, any>;
}

/**
 * Evalúa comandos gerenciales determinísticos (`#tokens`, `#admin`, PIN 4 dígitos, menú)
 * con 0 llamadas a modelos de IA y 0 creación de leads.
 */
export function evaluateManagerCommand(params: {
  org: {
    id: string;
    name?: string | null;
    ai_tokens_used?: number | null;
    ai_tokens_limit?: number | null;
    ai_tokens_google_used?: number | null;
    ai_tokens_openai_used?: number | null;
    appointment_settings?: any;
  };
  advisor: {
    id: string;
    full_name?: string | null;
    role?: string | null;
    is_super_admin?: boolean | null;
  };
  messageText: string;
  nowMs?: number;
}): ManagerCommandEvaluationResult {
  const { org, advisor } = params;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const trimmed = (params.messageText || '').trim();
  if (!trimmed) return { handled: false };

  const currentSettings =
    org.appointment_settings && typeof org.appointment_settings === 'object'
      ? { ...org.appointment_settings }
      : {};
  const managerSec = normalizeManagerSecurity(currentSettings.manager_security);
  const existingSession: ManagerSessionState = { ...(managerSec.sessions[advisor.id] || {}) };

  const isCommand = COMMAND_REGEX.test(trimmed);
  const isExit = EXIT_REGEX.test(trimmed);
  const isPinInput = PIN_REGEX.test(trimmed);
  const isMenuOption = MENU_OPTION_REGEX.test(trimmed);

  const isUnlocked =
    Boolean(existingSession.unlockedUntil) &&
    new Date(existingSession.unlockedUntil as string).getTime() > nowMs;
  const isAwaitingPin =
    Boolean(existingSession.awaitingPinUntil) &&
    new Date(existingSession.awaitingPinUntil as string).getTime() > nowMs;
  const isLocked =
    Boolean(existingSession.lockedUntil) &&
    new Date(existingSession.lockedUntil as string).getTime() > nowMs;

  // Ignorar mensajes normales que no sean comandos ni correspondan a una sesión gerencial activa
  if (!isCommand) {
    if (isExit && (isUnlocked || isAwaitingPin)) {
      // continuar para cerrar sesión
    } else if (isPinInput && isAwaitingPin) {
      // continuar para validar PIN
    } else if (isMenuOption && isUnlocked) {
      // continuar para atender opción del menú
    } else {
      return { handled: false };
    }
  }

  // Verificar permisos (solo admin, supervisor o super_admin)
  const canAccess =
    advisor.role === 'admin' ||
    advisor.role === 'supervisor' ||
    Boolean(advisor.is_super_admin);

  if (!canAccess) {
    return {
      handled: true,
      replyText:
        '🔒 El acceso gerencial por WhatsApp (*#tokens* / *#admin*) está reservado para administradores o supervisores de la cuenta.',
    };
  }

  const orgName = org.name || 'Synqo CRM';
  const firstName = (advisor.full_name || '').trim().split(' ')[0] || 'Administrador';

  const saveSessionState = (nextSession: ManagerSessionState): Record<string, any> => ({
    ...currentSettings,
    manager_security: {
      ...managerSec,
      sessions: {
        ...managerSec.sessions,
        [advisor.id]: nextSession,
      },
    },
  });

  if (isExit) {
    return {
      handled: true,
      replyText: '🔒 Sesión gerencial cerrada correctamente.',
      updatedAppointmentSettings: saveSessionState({
        ...existingSession,
        unlockedUntil: null,
        awaitingPinUntil: null,
        pendingCommand: null,
      }),
    };
  }

  if (isLocked) {
    const minsLeft = Math.max(
      1,
      Math.ceil((new Date(existingSession.lockedUntil as string).getTime() - nowMs) / 60000)
    );
    return {
      handled: true,
      replyText: `🔒 Acceso gerencial bloqueado temporalmente por 3 intentos fallidos. Intenta nuevamente en *${minsLeft} min*.`,
    };
  }

  if (!managerSec.pinHash) {
    return {
      handled: true,
      replyText: [
        `🔐 *PIN Gerencial no configurado — ${orgName}*`,
        `Hola ${firstName}. Para proteger la información de consumo y métricas de tu empresa, primero configura tu *PIN de 4 dígitos* en:`,
        `CRM → *Configuración → Alertas de Tokens y PIN Gerencial*.`,
      ].join('\n'),
    };
  }

  const buildCommandOutput = (cmd: string): string => {
    const normalizedCmd = cmd.toLowerCase();
    if (normalizedCmd === '#tokens' || normalizedCmd === '1') {
      const policy = normalizeTokenPolicy(currentSettings.token_policy);
      const status = computeTokenStatus({
        used: Number(org.ai_tokens_used || 0),
        limit: Number(org.ai_tokens_limit) || 500000,
        policy,
      });
      return formatManagerTokensReport({
        orgName,
        adminName: advisor.full_name,
        status,
        googleUsed: Number(org.ai_tokens_google_used || 0),
        openaiUsed: Number(org.ai_tokens_openai_used || 0),
        overagePricePer500kCop: policy.overagePricePer500kCop,
      });
    }

    if (MENU_OPTION_REGEX.test(normalizedCmd)) {
      return `ℹ️ La opción *${normalizedCmd}* del Panel Gerencial estará disponible en la próxima actualización. Responde *1* (o *#tokens*) para consultar consumo y excedente, o *salir* para cerrar sesión.`;
    }

    return formatManagerMenuMessage({
      orgName,
      adminName: advisor.full_name,
    });
  };

  // Si la sesión ya está desbloqueada, responder inmediatamente y renovar ventana de 15 min
  if (isUnlocked) {
    const nextUnlocked = new Date(
      nowMs + managerSec.sessionTtlMinutes * 60 * 1000
    ).toISOString();
    const targetCmd = isCommand ? trimmed.split(/\s+/)[0] : trimmed;
    return {
      handled: true,
      replyText: buildCommandOutput(targetCmd),
      updatedAppointmentSettings: saveSessionState({
        ...existingSession,
        unlockedUntil: nextUnlocked,
        awaitingPinUntil: null,
        pendingCommand: null,
      }),
    };
  }

  // Si estaba esperando el PIN y el usuario envió 4 dígitos
  if (isPinInput && isAwaitingPin) {
    const valid = verifyPassword(trimmed, managerSec.pinHash);
    if (valid) {
      const nextUnlocked = new Date(
        nowMs + managerSec.sessionTtlMinutes * 60 * 1000
      ).toISOString();
      const commandToRun = existingSession.pendingCommand || '#admin';
      return {
        handled: true,
        replyText: buildCommandOutput(commandToRun),
        updatedAppointmentSettings: saveSessionState({
          unlockedUntil: nextUnlocked,
          awaitingPinUntil: null,
          pendingCommand: null,
          failedAttempts: 0,
          lockedUntil: null,
        }),
      };
    }

    const attempts = Number(existingSession.failedAttempts || 0) + 1;
    if (attempts >= 3) {
      const lockedUntil = new Date(nowMs + 60 * 60 * 1000).toISOString();
      return {
        handled: true,
        replyText:
          '🚨 *Acceso bloqueado por 1 hora* tras 3 intentos consecutivos de PIN incorrecto.',
        updatedAppointmentSettings: saveSessionState({
          unlockedUntil: null,
          awaitingPinUntil: null,
          pendingCommand: null,
          failedAttempts: 0,
          lockedUntil,
        }),
      };
    }

    return {
      handled: true,
      replyText: `❌ PIN incorrecto. Te quedan *${3 - attempts}* intento(s). Ingresa tu PIN de 4 dígitos:`,
      updatedAppointmentSettings: saveSessionState({
        ...existingSession,
        failedAttempts: attempts,
        awaitingPinUntil: new Date(nowMs + 5 * 60 * 1000).toISOString(),
      }),
    };
  }

  // Primer comando recibido sin sesión activa -> pedir PIN (Modo Bancolombia)
  const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
  return {
    handled: true,
    replyText: [
      `🔒 *Synqo Gerencial — ${orgName}*`,
      `Hola ${firstName}. Por seguridad, responde con tu *PIN de 4 dígitos* para acceder (${nowIso.slice(0, 10)}).`,
    ].join('\n'),
    updatedAppointmentSettings: saveSessionState({
      ...existingSession,
      awaitingPinUntil: new Date(nowMs + 5 * 60 * 1000).toISOString(),
      pendingCommand: cmdName,
      unlockedUntil: null,
    }),
  };
}

export class ManagerWhatsAppService {
  /**
   * Procesa mensajes provenientes del WhatsApp personal de un miembro admin/supervisor
   * contra la línea del negocio sin crear leads ni consumir tokens de IA.
   */
  static async handleAdvisorMessage(params: {
    organization: any;
    advisor: {
      id: string;
      full_name?: string | null;
      role?: string | null;
      is_super_admin?: boolean | null;
    };
    senderPhone: string;
    messageText: string;
  }): Promise<boolean> {
    const trimmedCmd = (params.messageText || '').trim();
    if (params.advisor.is_super_admin) {
      if (/^#(plataforma|resumen)\b/i.test(trimmedCmd)) {
        const digest = await PlatformAlertService.generateLivePlatformDigest();
        await MessagingService.sendTextMessage({
          organization: params.organization,
          to: params.senderPhone,
          body: digest,
          simulateTyping: false,
        });
        return true;
      }

      if (/^#desconectados\b/i.test(trimmedCmd)) {
        const report = await PlatformAlertService.getDisconnectedChannelsReport();
        await MessagingService.sendTextMessage({
          organization: params.organization,
          to: params.senderPhone,
          body: report,
          simulateTyping: false,
        });
        return true;
      }

      if (/^#tickets\b/i.test(trimmedCmd)) {
        const report = await PlatformAlertService.getOpenTicketsReport();
        await MessagingService.sendTextMessage({
          organization: params.organization,
          to: params.senderPhone,
          body: report,
          simulateTyping: false,
        });
        return true;
      }

      if (/^#(consumo|tokens_global)\b/i.test(trimmedCmd)) {
        const report = await PlatformAlertService.getPlatformTokensReport();
        await MessagingService.sendTextMessage({
          organization: params.organization,
          to: params.senderPhone,
          body: report,
          simulateTyping: false,
        });
        return true;
      }
    }

    const { data: freshOrg } = await (supabaseAdmin.from('organizations') as any)
      .select(
        'id, name, ai_tokens_used, ai_tokens_limit, ai_tokens_google_used, ai_tokens_openai_used, appointment_settings'
      )
      .eq('id', params.organization.id)
      .single();

    if (!freshOrg) return false;

    const evalRes = evaluateManagerCommand({
      org: freshOrg,
      advisor: params.advisor,
      messageText: params.messageText,
    });

    if (!evalRes.handled) return false;

    if (evalRes.updatedAppointmentSettings) {
      await (supabaseAdmin.from('organizations') as any)
        .update({
          appointment_settings: evalRes.updatedAppointmentSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', freshOrg.id);
    }

    if (evalRes.replyText) {
      await MessagingService.sendTextMessage({
        organization: params.organization,
        to: params.senderPhone,
        body: evalRes.replyText,
        simulateTyping: false,
      });
    }

    return true;
  }
}
