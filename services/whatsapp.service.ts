/**
 * Catálogo pragmático de 3 plantillas comerciales pre-aprobadas en Meta WhatsApp Business.
 * Se utilizan cuando la ventana de 24 horas del lead ha expirado.
 */
export const META_TEMPLATES = {
  recordatorio_cita: {
    name: 'recordatorio_cita',
    label: 'Recordatorio de Cita Agendada',
    description: 'Recuerda al prospecto su cita próxima con opción de confirmar.',
  },
  reactivacion_lead: {
    name: 'reactivacion_lead',
    label: 'Reactivación de Contacto',
    description: 'Pregunta al lead si aún está interesado en retomar la conversación.',
  },
  seguimiento_general: {
    name: 'seguimiento_general',
    label: 'Seguimiento de Propuesta',
    description: 'Informa que tenemos novedades sobre su solicitud o requerimiento.',
  },
} as const;

export type MetaTemplateKey = keyof typeof META_TEMPLATES;

interface SendTextMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}

interface SendTemplateMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  components?: unknown[];
}

export class WhatsAppService {
  private static BASE_URL = 'https://graph.facebook.com/v20.0';

  /**
   * Envía un mensaje de texto libre por WhatsApp (válido dentro de la ventana de 24h).
   */
  static async sendTextMessage({ phoneNumberId, accessToken, to, body }: SendTextMessageParams): Promise<string> {
    const url = `${this.BASE_URL}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[WHATSAPP API ERROR]', errorData);
      throw new Error(`WhatsApp API Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.messages?.[0]?.id || '';
  }

  /**
   * Envía una plantilla oficial de WhatsApp Business (requerida cuando expiró la ventana de 24h).
   */
  static async sendTemplateMessage({
    phoneNumberId,
    accessToken,
    to,
    templateName,
    languageCode = 'es',
    components = [],
  }: SendTemplateMessageParams): Promise<string> {
    const url = `${this.BASE_URL}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[WHATSAPP TEMPLATE API ERROR]', errorData);
      throw new Error(`WhatsApp Template Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.messages?.[0]?.id || '';
  }

  /**
   * Marca un mensaje entrante como leído en WhatsApp (doble tilde azul).
   */
  static async markAsRead(phoneNumberId: string, accessToken: string, messageId: string): Promise<void> {
    try {
      await fetch(`${this.BASE_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
    } catch (e) {
      console.warn('[WHATSAPP MARK READ WARNING]', e);
    }
  }
}

