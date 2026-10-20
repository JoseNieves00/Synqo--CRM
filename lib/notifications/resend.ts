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
   * Alerta cuando Synqo AI confirma una nueva cita comercial en Cal.com
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
}

