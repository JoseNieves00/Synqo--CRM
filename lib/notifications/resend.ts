import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendHandoffEmailParams {
  adminEmail: string;
  leadName: string;
  leadPhone: string;
  reason?: string;
}

interface SendBookingEmailParams {
  adminEmail: string;
  leadName: string;
  leadPhone: string;
  bookingTime: string;
}

export class NotificationService {
  /**
   * Alerta inmediata cuando un lead requiere atención manual humana (is_ai_active = false)
   */
  static async sendHumanHandoffAlert({ adminEmail, leadName, leadPhone, reason }: SendHandoffEmailParams): Promise<void> {
    if (!resend) {
      console.warn('[RESEND SKIPPED] RESEND_API_KEY no configurada. Alerta en log:', { adminEmail, leadName, leadPhone });
      return;
    }

    try {
      await resend.emails.send({
        from: 'Synqo Alertas <alertas@synqo.dev>',
        to: adminEmail,
        subject: `🚨 Alerta Synqo: Relevo humano requerido para ${leadName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="margin-bottom: 20px;">
              <span style="background-color: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 13px;">
                🚨 Atención Manual Urgente
              </span>
            </div>
            <h2 style="color: #0f172a; margin-top: 0;">Relevo Humano Requerido</h2>
            <p style="font-size: 15px; line-height: 1.5;">El prospecto <strong>${leadName}</strong> (${leadPhone}) necesita atención directa de un asesor comercial.</p>
            ${reason ? `<div style="background-color: #f8fafc; padding: 12px; border-left: 4px solid #f43f5e; margin: 16px 0; font-size: 14px;"><strong>Motivo:</strong> ${reason}</div>` : ''}
            <div style="margin-top: 24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'}/inbox" style="background-color: #0f172a; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; display: inline-block;">
                Abrir Chat en Synqo CRM
              </a>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error('[RESEND ERROR handoff]', err);
    }
  }

  /**
   * Alerta cuando Synqo AI confirma una nueva cita comercial en la Agenda Synqo
   */
  static async sendAppointmentBookedAlert({ adminEmail, leadName, leadPhone, bookingTime }: SendBookingEmailParams): Promise<void> {
    if (!resend) {
      console.warn('[RESEND SKIPPED] RESEND_API_KEY no configurada. Alerta en log:', { adminEmail, leadName, bookingTime });
      return;
    }

    try {
      const formattedDate = new Date(bookingTime).toLocaleString('es-ES', {
        dateStyle: 'full',
        timeStyle: 'short',
      });

      await resend.emails.send({
        from: 'Synqo Citas <alertas@synqo.dev>',
        to: adminEmail,
        subject: `✅ Nueva Cita Agendada: ${leadName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="margin-bottom: 20px;">
              <span style="background-color: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 13px;">
                ✅ Cita Agendada por IA
              </span>
            </div>
            <h2 style="color: #0f172a; margin-top: 0;">¡Nueva Demostración Reservada!</h2>
            <p style="font-size: 15px; line-height: 1.5;">Synqo AI ha confirmado automáticamente un espacio comercial con el siguiente lead:</p>
            <ul style="line-height: 1.8; font-size: 14px; color: #334155;">
              <li><strong>Nombre:</strong> ${leadName}</li>
              <li><strong>Teléfono WhatsApp:</strong> ${leadPhone}</li>
              <li><strong>Horario Reservado:</strong> ${formattedDate}</li>
            </ul>
            <div style="margin-top: 24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'}/pipeline" style="background-color: #16a34a; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; display: inline-block;">
                Ver en Tablero Kanban
              </a>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error('[RESEND ERROR appointment]', err);
    }
  }

  /**
   * Alerta inmediata cuando un canal de mensajería (WhatsApp Evolution API o Meta) se desconecta o su token expira
   */
  static async sendChannelDisconnectedAlert(params: {
    adminEmail: string;
    companyName: string;
    provider: 'meta' | 'instagram' | 'evolution';
    reason?: string;
  }): Promise<void> {
    if (!resend) {
      console.warn('[RESEND SKIPPED] Desconexión de canal:', params);
      return;
    }

    try {
      const channelLabel =
        params.provider === 'evolution'
          ? 'WhatsApp Evolution API (Celular desconectado en VPS)'
          : params.provider === 'meta'
          ? 'WhatsApp Cloud API (Token expirado/inválido)'
          : 'Instagram Direct';

      await resend.emails.send({
        from: 'Synqo Infraestructura <alertas@synqo.dev>',
        to: params.adminEmail,
        subject: `🚨 ALERTA CRÍTICA: Desconexión de ${channelLabel} en ${params.companyName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 8px;">
            <div style="margin-bottom: 20px;">
              <span style="background-color: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 13px;">
                🚨 Desconexión de Canal Detectada
              </span>
            </div>
            <h2 style="color: #0f172a; margin-top: 0;">Línea de ${channelLabel} Fuera de Línea</h2>
            <p style="font-size: 15px; line-height: 1.5;">Hemos detectado que la conexión de mensajería para tu empresa <strong>${params.companyName}</strong> se ha interrumpido.</p>
            ${params.reason ? `<div style="background-color: #fff1f2; padding: 12px; border-left: 4px solid #e11d48; margin: 16px 0; font-size: 14px;"><strong>Diagnóstico del sistema:</strong> ${params.reason}</div>` : ''}
            <p style="font-size: 14px; color: #475569;">Mientras la línea permanezca desconectada, los clientes entrantes no podrán recibir respuestas automáticas de la IA.</p>
            <div style="margin-top: 24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'}/settings" style="background-color: #e11d48; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">
                Reconectar Canal en Configuración
              </a>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error('[RESEND ERROR channel disconnected]', err);
    }
  }

  /**
   * Alerta cuando la empresa alcanza un umbral configurable (x% o 100%) de su cuota mensual de tokens de IA.
   * En Modo Excedente, el bot sigue atendiendo sin interrupciones y notifica el acumulado.
   */
  static async sendTokenQuotaExhaustedAlert(params: {
    adminEmail: string;
    companyName: string;
    usedTokens: number;
    limitTokens: number;
    percentage: number;
    threshold?: number;
    overageTokens?: number;
    overageMode?: boolean;
  }): Promise<void> {
    if (!resend) {
      console.warn('[RESEND SKIPPED] Cuota de tokens:', params);
      return;
    }

    try {
      const isFull = params.percentage >= 100 || (params.threshold ?? 0) >= 100;
      const isOverage = params.overageMode !== false;
      const thresholdLabel = params.threshold ?? (isFull ? 100 : params.percentage);
      const overage = params.overageTokens ?? Math.max(0, params.usedTokens - params.limitTokens);

      await resend.emails.send({
        from: 'Synqo IA <alertas@synqo.dev>',
        to: params.adminEmail,
        subject: `${
          isFull
            ? isOverage
              ? '🔔 CUPO BASE 100% — MODO EXCEDENTE ACTIVO'
              : '🚨 CUOTA AGOTADA'
            : `⚠️ AVISO DE CONSUMO (${thresholdLabel}%)`
        }: Tokens de IA en ${params.companyName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="margin-bottom: 20px;">
              <span style="background-color: ${isFull ? '#fef3c7' : '#e0f2fe'}; color: ${isFull ? '#92400e' : '#0369a1'}; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 13px;">
                ${isFull ? '🔔 100% del Cupo Base Alcanzado' : `⚠️ Umbral del ${thresholdLabel}% Alcanzado`}
              </span>
            </div>
            <h2 style="color: #0f172a; margin-top: 0;">${
              isFull && isOverage
                ? 'Modo Excedente Activo (Tu bot sigue operando)'
                : isFull
                ? 'Atención Automática Pausada'
                : `Consumo de IA al ${params.percentage}%`
            }</h2>
            <p style="font-size: 15px; line-height: 1.5;">Tu empresa <strong>${params.companyName}</strong> ha consumido <strong>${params.usedTokens.toLocaleString('es-CO')}</strong> de <strong>${params.limitTokens.toLocaleString('es-CO')}</strong> tokens base mensuales (${params.percentage}%).</p>
            ${
              overage > 0
                ? `<p style="font-size: 14px; color: #b45309;">Excedente acumulado en el ciclo actual: <strong>${overage.toLocaleString('es-CO')} tokens</strong>.</p>`
                : ''
            }
            <p style="font-size: 14px; color: #475569;">
              ${
                isFull && isOverage
                  ? 'Tu agente IA continúa atendiendo a tus clientes sin interrupciones en Modo Excedente. También puedes consultar el estado en cualquier momento escribiendo <strong>#tokens</strong> desde tu WhatsApp autorizado.'
                  : isFull
                  ? 'Para evitar cobros imprevistos, la IA ha sido silenciada temporalmente. Tus asesores humanos pueden seguir atendiendo con normalidad desde el CRM.'
                  : 'Te avisamos con anticipación para que tengas visibilidad total de tu consumo. Al llegar al 100%, el bot continuará operando en Modo Excedente. Puedes consultar tu saldo escribiendo <strong>#tokens</strong> por WhatsApp.'
              }
            </p>
            <div style="margin-top: 24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev'}/settings" style="background-color: #0f172a; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">
                Ver Consumo y Configurar Alertas
              </a>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error('[RESEND ERROR token quota]', err);
    }
  }
}

