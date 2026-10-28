/**
 * Catálogo pragmático de 3 plantillas comerciales pre-aprobadas en Meta WhatsApp Business.
 * Se utilizan cuando la ventana de 24 horas del lead ha expirado.
 */
export const META_TEMPLATES = {
  hello_world: {
    name: 'hello_world',
    label: 'Saludo Oficial (hello_world)',
    description: 'Plantilla estándar de Meta para iniciar contacto con nuevos prospectos.',
  },
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
    const cleanTo = to.replace(/[^0-9]/g, '');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
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
   * Envía un mensaje interactivo con botones de respuesta rápida (Quick Reply Buttons).
   * Ideal para confirmación de citas con un solo toque: [✓ Confirmar] o [↻ Reprogramar].
   */
  static async sendInteractiveButtonsMessage({
    phoneNumberId,
    accessToken,
    to,
    bodyText,
    buttons,
  }: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    bodyText: string;
    buttons: Array<{ id: string; title: string }>;
  }): Promise<string> {
    const url = `${this.BASE_URL}/${phoneNumberId}/messages`;
    const cleanTo = to.replace(/[^0-9]/g, '');

    const replyButtons = buttons.slice(0, 3).map((btn) => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title.slice(0, 20), // Límite de Meta: 20 caracteres por título de botón
      },
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: { buttons: replyButtons },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[WHATSAPP INTERACTIVE BUTTONS ERROR]', errorData);
      throw new Error(`WhatsApp Interactive Error (${response.status}): ${JSON.stringify(errorData)}`);
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
    const cleanTo = to.replace(/[^0-9]/g, '');

    // Intentar con el código principal y fallback a variantes comunes (es_CO, es, es_LA, en_US, en)
    const candidateLanguages = [languageCode, 'es_CO', 'es', 'es_LA', 'en_US', 'en'].filter(
      (val, idx, arr) => arr.indexOf(val) === idx
    );

    let lastErrorData: any = null;

    for (const code of candidateLanguages) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanTo,
          type: 'template',
          template: {
            name: templateName,
            language: { code },
            ...(components && components.length > 0 ? { components } : {}),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.messages?.[0]?.id || '';
      }

      const errorData = await response.json().catch(() => ({}));
      lastErrorData = errorData;

      // Si el error no es de idioma no encontrado, salir para no insistir inútilmente
      const errStr = JSON.stringify(errorData);
      if (!errStr.includes('does not exist in') && !errStr.includes('language')) {
        break;
      }
    }

    console.error('[WHATSAPP TEMPLATE API ERROR]', lastErrorData);
    throw new Error(
      `WhatsApp Template Error: ${lastErrorData?.error?.message || JSON.stringify(lastErrorData)}`
    );
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

  /**
   * Descarga un archivo multimedia (audio/nota de voz, documento o imagen) desde Meta Graph API.
   * Preserva la autenticación Bearer requerida en la URL de descarga directa de Meta CDN.
   */
  static async downloadMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, '');

    // 1. Consultar metadatos del medio para obtener la URL temporal de descarga
    const metaRes = await fetch(`${this.BASE_URL}/${mediaId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
      },
    });

    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}));
      throw new Error(`Error obteniendo metadatos de audio Meta (${metaRes.status}): ${JSON.stringify(err)}`);
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    const mimeType = metaData.mime_type || 'audio/ogg';

    if (!downloadUrl) {
      throw new Error('Meta no devolvió la URL de descarga para el archivo de audio.');
    }

    // 2. Descargar el archivo binario pasando el token Bearer en el encabezado
    const downloadRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
      },
    });

    if (!downloadRes.ok) {
      throw new Error(`Error descargando audio desde Meta CDN (${downloadRes.status})`);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  }

  /**
   * Intercambia el código de autorización generado por el popup de Meta Embedded Signup
   * por un User Access Token de la API de Graph.
   */
  static async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    tokenType?: string;
    expiresIn?: number;
  }> {
    const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('Variables META_APP_ID o META_APP_SECRET no configuradas en el servidor.');
    }

    const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);

    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.access_token) {
      const errMsg = data.error?.message || 'Error al intercambiar código de autorización en Meta';
      console.error('[META EMBEDDED SIGNUP OAUTH ERROR]', data);
      throw new Error(`Meta OAuth Error: ${errMsg}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Intenta intercambiar un token de usuario de corta duración por un token de larga duración (~60 días).
   */
  static async getLongLivedToken(shortLivedToken: string): Promise<string> {
    const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) return shortLivedToken;

    try {
      const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      url.searchParams.set('grant_type', 'fb_exchange_token');
      url.searchParams.set('client_id', appId);
      url.searchParams.set('client_secret', appSecret);
      url.searchParams.set('fb_exchange_token', shortLivedToken);

      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_token) {
        return data.access_token;
      }
    } catch (e) {
      console.warn('[META LONG LIVED TOKEN WARNING]', e);
    }
    return shortLivedToken;
  }

  /**
   * Inspecciona el token con debug_token para extraer los WABA IDs autorizados en granular_scopes.
   */
  static async debugToken(userAccessToken: string): Promise<{
    isValid: boolean;
    wabaIds: string[];
    scopes: string[];
  }> {
    const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return { isValid: false, wabaIds: [], scopes: [] };
    }

    try {
      const url = new URL('https://graph.facebook.com/v21.0/debug_token');
      url.searchParams.set('input_token', userAccessToken);
      url.searchParams.set('access_token', `${appId}|${appSecret}`);

      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.data) {
        return { isValid: false, wabaIds: [], scopes: [] };
      }

      const info = data.data;
      const wabaIds: string[] = [];

      if (Array.isArray(info.granular_scopes)) {
        for (const gs of info.granular_scopes) {
          if (gs.scope === 'whatsapp_business_management' && Array.isArray(gs.target_ids)) {
            wabaIds.push(...gs.target_ids);
          }
        }
      }

      return {
        isValid: Boolean(info.is_valid),
        wabaIds,
        scopes: info.scopes || [],
      };
    } catch (err) {
      console.warn('[META DEBUG TOKEN ERROR]', err);
      return { isValid: false, wabaIds: [], scopes: [] };
    }
  }

  /**
   * Suscribe la aplicación a la cuenta de WhatsApp Business (WABA) del cliente
   * para recibir sus webhooks automáticamente en Synqo CRM.
   */
  static async subscribeWabaApp(wabaId: string, accessToken: string): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        console.log(`[META EMBEDDED SIGNUP] WABA ${wabaId} suscrita exitosamente a webhooks.`);
        return true;
      }
      console.warn(`[META SUBSCRIBED APPS WARNING] WABA ${wabaId}:`, data);
      return false;
    } catch (err) {
      console.warn(`[META SUBSCRIBED APPS ERROR] WABA ${wabaId}:`, err);
      return false;
    }
  }

  /**
   * Obtiene la lista de números telefónicos asociados a una WABA.
   */
  static async getWabaPhoneNumbers(wabaId: string, accessToken: string): Promise<Array<{
    id: string;
    display_phone_number: string;
    verified_name?: string;
    quality_rating?: string;
    code_verification_status?: string;
  }>> {
    try {
      const url = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.data)) {
        return data.data;
      }
      console.warn(`[META PHONE NUMBERS WARNING] WABA ${wabaId}:`, data);
      return [];
    } catch (err) {
      console.warn(`[META PHONE NUMBERS ERROR] WABA ${wabaId}:`, err);
      return [];
    }
  }

  /**
   * Obtiene información detallada de un número telefónico por su Phone Number ID.
   */
  static async getPhoneNumberDetails(phoneNumberId: string, accessToken: string): Promise<{
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  } | null> {
    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}


