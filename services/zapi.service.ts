import { calculateHumanCadence, sleep } from '@/lib/anti-ban/cadence';

export interface ZApiCredentials {
  instanceId: string;
  token: string;
  clientToken?: string;
}

export interface ZApiStatusResponse {
  connected: boolean;
  smartphoneConnected?: boolean;
  phone?: string;
  error?: string;
}

export interface ZApiQrCodeResponse {
  type: 'image' | 'base64' | 'string';
  value: string;
}

export interface ZApiPhoneCodeParams extends ZApiCredentials {
  phone: string;
}

export interface ZApiPhoneCodeResponse {
  code: string;
}

export class ZApiService {
  private static BASE_URL = 'https://api.z-api.io';

  private static buildHeaders(clientToken?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clientToken && clientToken.trim()) {
      headers['Client-Token'] = clientToken.trim();
    }
    return headers;
  }

  /**
   * Obtiene el código QR en tiempo real para renderizar en la interfaz de usuario.
   */
  static async getQrCode({ instanceId, token, clientToken }: ZApiCredentials): Promise<ZApiQrCodeResponse> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/qr-code/image`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(clientToken),
      cache: 'no-store',
    });

    if (!response.ok) {
      // Fallback al endpoint /qr-code
      const fallbackUrl = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/qr-code`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        headers: this.buildHeaders(clientToken),
        cache: 'no-store',
      });

      if (!fallbackRes.ok) {
        const errData = await fallbackRes.text().catch(() => '');
        if (
          errData.toLowerCase().includes('already connected') ||
          errData.toLowerCase().includes('already_connected') ||
          errData.toLowerCase().includes('conectada') ||
          errData.toLowerCase().includes('connected')
        ) {
          throw new Error('ALREADY_CONNECTED');
        }
        throw new Error(`Error obteniendo QR de Z-API (${fallbackRes.status}): ${errData}`);
      }

      const fbData = await fallbackRes.json().catch(() => ({}));
      if (fbData.connected === true) {
        throw new Error('ALREADY_CONNECTED');
      }
      return {
        type: 'base64',
        value: fbData.value || fbData.qr || fbData.qrcode || '',
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.connected === true) {
        throw new Error('ALREADY_CONNECTED');
      }
      return {
        type: 'base64',
        value: data.value || data.qr || data.qrcode || '',
      };
    }

    // Si devuelve un stream o imagen binaria
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      type: 'image',
      value: `data:${contentType || 'image/png'};base64,${base64}`,
    };
  }

  /**
   * Obtiene un código de emparejamiento numérico (Pairing Code) para vincular por teléfono.
   * Endpoint oficial: GET /instances/{instanceId}/token/{token}/phone-code/{phone}
   */
  static async getPhoneCode({
    instanceId,
    token,
    clientToken,
    phone,
  }: ZApiPhoneCodeParams): Promise<ZApiPhoneCodeResponse> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    // Limpieza estricta de teléfono: solo dígitos numéricos (código de país + número)
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanPhone || cleanPhone.length < 8) {
      throw new Error('El número telefónico debe contener código de país y al menos 8 dígitos (ej: 573001234567).');
    }

    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/phone-code/${cleanPhone}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(clientToken),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errData = await response.text().catch(() => '');
      if (
        errData.toLowerCase().includes('already connected') ||
        errData.toLowerCase().includes('already_connected') ||
        errData.toLowerCase().includes('conectada') ||
        errData.toLowerCase().includes('connected')
      ) {
        throw new Error('ALREADY_CONNECTED');
      }
      throw new Error(`Error obteniendo código de vinculación (${response.status}): ${errData}`);
    }

    const data = await response.json().catch(() => ({}));
    const rawCode = data.code || data.pairingCode || data.value || '';
    if (!rawCode) {
      throw new Error('No se recibió el código de vinculación de Z-API.');
    }

    return {
      code: String(rawCode).trim(),
    };
  }

  /**
   * Consulta el estado de conexión de la instancia de Z-API.
   */
  static async getStatus({ instanceId, token, clientToken }: ZApiCredentials): Promise<ZApiStatusResponse> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/status`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(clientToken),
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          connected: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        connected: Boolean(data.connected),
        smartphoneConnected: Boolean(data.smartphoneConnected),
        phone: data.phone || data.connectedPhone || undefined,
      };
    } catch (e: any) {
      return {
        connected: false,
        error: e.message || 'Error de conexión con Z-API',
      };
    }
  }

  /**
   * Autoconfigura silenciosamente los 4 webhooks en Z-API para que apunten a Synqo.
   */
  static async configureWebhooks({
    instanceId,
    token,
    clientToken,
    webhookUrl,
  }: ZApiCredentials & { webhookUrl: string }): Promise<{ success: boolean; errors: string[] }> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const headers = this.buildHeaders(clientToken);
    const errors: string[] = [];

    const endpoints = [
      'update-webhook-received',
      'update-webhook-connected',
      'update-webhook-disconnected',
      'update-webhook-delivery',
    ];

    for (const ep of endpoints) {
      const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/${ep}`;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: webhookUrl }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          errors.push(`Error en ${ep} (${res.status}): ${errBody}`);
        }
      } catch (err: any) {
        errors.push(`Fallo de red en ${ep}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Envía un mensaje de texto con simulación opcional de cadencia humana (typing).
   */
  static async sendTextMessage({
    instanceId,
    token,
    clientToken,
    to,
    message,
    simulateTyping = true,
  }: ZApiCredentials & {
    to: string;
    message: string;
    simulateTyping?: boolean;
  }): Promise<string> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const cleanTo = to.replace(/[^0-9]/g, '');
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/send-text`;

    let delayTypingSeconds = 0;
    if (simulateTyping) {
      const cadence = calculateHumanCadence(message);
      delayTypingSeconds = cadence.delayTypingSeconds;

      // Si hay una pausa de lectura biológica estimada, esperar brevemente antes de disparar
      if (cadence.readingDelayMs > 0) {
        await sleep(Math.min(cadence.readingDelayMs, 2500));
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(clientToken),
      body: JSON.stringify({
        phone: cleanTo,
        message,
        delayTyping: delayTypingSeconds,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Z-API SEND TEXT ERROR]', errorData);
      throw new Error(`Z-API Send Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.messageId || data.zaapId || data.id || '';
  }

  /**
   * Envía un mensaje con botones o lista interactiva.
   * Si la cuenta no admite botones interactivos (limitación de Meta en emulación web),
   * realiza un fallback automático a texto enriquecido con opciones numeradas.
   */
  static async sendInteractiveButtonsMessage({
    instanceId,
    token,
    clientToken,
    to,
    bodyText,
    buttons,
  }: ZApiCredentials & {
    to: string;
    bodyText: string;
    buttons: Array<{ id: string; title: string }>;
  }): Promise<string> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const cleanTo = to.replace(/[^0-9]/g, '');
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/send-button-list`;

    const formattedButtons = buttons.slice(0, 3).map((btn) => ({
      id: btn.id,
      label: btn.title.slice(0, 20),
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(clientToken),
        body: JSON.stringify({
          phone: cleanTo,
          message: bodyText,
          buttons: formattedButtons,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.messageId || data.zaapId || '';
      }
    } catch (e) {
      console.warn('[Z-API BUTTONS FAILED, USING TEXT FALLBACK]', e);
    }

    // Degradación elegante: enviar como texto claro con opciones
    const optionsText = buttons.map((b, i) => `*${i + 1}️⃣ ${b.title}*`).join('\n');
    const fallbackText = `${bodyText}\n\n${optionsText}\n\n_Por favor responde con el número de tu opción._`;

    return await this.sendTextMessage({
      instanceId,
      token,
      clientToken,
      to,
      message: fallbackText,
      simulateTyping: true,
    });
  }

  /**
   * Obtiene la lista de chats recientes de la instancia para importación controlada.
   */
  static async getRecentChats({
    instanceId,
    token,
    clientToken,
    pageSize = 50,
  }: ZApiCredentials & { pageSize?: number }): Promise<any[]> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/chats?page=1&pageSize=${pageSize}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(clientToken),
        cache: 'no-store',
      });

      if (!response.ok) {
        // Fallback sin query params si el endpoint de la versión rechaza parámetros
        const fallbackRes = await fetch(`${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/chats`, {
          method: 'GET',
          headers: this.buildHeaders(clientToken),
          cache: 'no-store',
        });

        if (!fallbackRes.ok) {
          throw new Error(`Z-API Chats Error (${fallbackRes.status})`);
        }

        const data = await fallbackRes.json();
        return Array.isArray(data) ? data : data.chats || [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.chats || [];
    } catch (err: any) {
      console.warn('[Z-API GET CHATS ERROR]', err.message);
      return [];
    }
  }

  /**
   * Cierra la sesión activa de WhatsApp Web en Z-API.
   */
  static async disconnect({ instanceId, token, clientToken }: ZApiCredentials): Promise<boolean> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/disconnect`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(clientToken),
    });

    return response.ok;
  }

  /**
   * Reinicia el contenedor / navegador de la instancia en Z-API.
   */
  static async restart({ instanceId, token, clientToken }: ZApiCredentials): Promise<boolean> {
    const cleanInstance = instanceId.trim();
    const cleanToken = token.trim();
    const url = `${this.BASE_URL}/instances/${cleanInstance}/token/${cleanToken}/restart`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(clientToken),
    });

    return response.ok;
  }
}

