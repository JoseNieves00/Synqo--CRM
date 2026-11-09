import { calculateHumanCadence, sleep } from '@/lib/anti-ban/cadence';

export interface EvolutionCredentials {
  apiUrl?: string | null;
  apiKey: string;
  instanceName: string;
}

export interface EvolutionStatusResponse {
  connected: boolean;
  state?: 'open' | 'close' | 'connecting';
  phone?: string;
  error?: string;
}

export interface EvolutionQrCodeResponse {
  type: 'image' | 'base64' | 'connected';
  value: string;
  connected?: boolean;
  phone?: string;
}

export interface EvolutionPhoneCodeParams extends EvolutionCredentials {
  phone: string;
}

export interface EvolutionPhoneCodeResponse {
  code: string;
}

export class EvolutionService {
  /**
   * Resuelve la URL base de Evolution API v2 configurada (VPS o variable de entorno).
   */
  static resolveBaseUrl(customUrl?: string | null): string {
    const raw =
      customUrl?.trim() ||
      process.env.EVOLUTION_API_URL ||
      process.env.NEXT_PUBLIC_EVOLUTION_API_URL ||
      'http://localhost:8080';
    return raw.replace(/\/+$/, '');
  }

  /**
   * Encabezados de autorización requeridos por Evolution API v2.
   */
  private static buildHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      apikey: apiKey.trim(),
    };
  }

  /**
   * Normaliza el nombre de la instancia para evitar caracteres especiales inválidos en URLs.
   */
  static sanitizeInstanceName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '_');
  }

  /**
   * Crea la instancia en Evolution API v2 si aún no existe en el VPS.
   */
  static async createInstanceIfNotExists({
    apiUrl,
    apiKey,
    instanceName,
    webhookUrl,
  }: EvolutionCredentials & { webhookUrl?: string }): Promise<{ success: boolean; created: boolean }> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);

    const body: any = {
      instanceName: cleanInstance,
      token: apiKey.trim(),
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    };

    if (webhookUrl) {
      body.webhook = {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
      };
    }

    try {
      const response = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (response.status === 201 || response.status === 200) {
        return { success: true, created: true };
      }

      // Si ya existe (código 403 o error 'already in use')
      const errText = await response.text().catch(() => '');
      if (
        response.status === 403 ||
        errText.toLowerCase().includes('already') ||
        errText.toLowerCase().includes('exists')
      ) {
        if (webhookUrl) {
          // Asegurar que el webhook esté registrado y actualizado en la instancia existente
          await this.configureWebhooks({ apiUrl, apiKey, instanceName: cleanInstance, webhookUrl }).catch(() => {});
        }
        return { success: true, created: false };
      }

      console.warn(`[EVOLUTION CREATE WARN] (${response.status}): ${errText}`);
      return { success: false, created: false };
    } catch (e: any) {
      console.warn('[EVOLUTION CREATE ERROR]', e.message);
      return { success: false, created: false };
    }
  }

  /**
   * Obtiene el código QR en vivo para renderizar en la interfaz del CRM.
   * Endpoint oficial: GET /instance/connect/{instance}
   */
  static async getQrCode({
    apiUrl,
    apiKey,
    instanceName,
    webhookUrl,
  }: EvolutionCredentials & { webhookUrl?: string }): Promise<EvolutionQrCodeResponse> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);

    // 1. Verificar estado actual antes de solicitar QR
    const status = await this.getStatus({ apiUrl, apiKey, instanceName: cleanInstance });
    if (status.connected) {
      return {
        type: 'connected',
        value: '',
        connected: true,
        phone: status.phone,
      };
    }

    // 2. Asegurar que la instancia existe en el VPS
    await this.createInstanceIfNotExists({ apiUrl, apiKey, instanceName: cleanInstance, webhookUrl });

    // 3. Solicitar QR de conexión
    const connectUrl = `${baseUrl}/instance/connect/${cleanInstance}`;
    const response = await fetch(connectUrl, {
      method: 'GET',
      headers: this.buildHeaders(apiKey),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errData = await response.text().catch(() => '');
      if (
        errData.toLowerCase().includes('already connected') ||
        errData.toLowerCase().includes('open')
      ) {
        return {
          type: 'connected',
          value: '',
          connected: true,
        };
      }
      throw new Error(`Error obteniendo QR de Evolution API (${response.status}): ${errData}`);
    }

    const data = await response.json().catch(() => ({}));

    // Si ya está conectado
    if (data.instance?.state === 'open' || data.state === 'open') {
      return {
        type: 'connected',
        value: '',
        connected: true,
        phone: data.instance?.phone || data.phone,
      };
    }

    // Evolution API v2 devuelve 'base64' (data:image/png;base64,...) o 'code'
    const qrValue = data.base64 || data.code || data.qrcode || '';
    if (!qrValue) {
      throw new Error('No se recibió la imagen o código QR de Evolution API.');
    }

    return {
      type: 'base64',
      value: qrValue.startsWith('data:') ? qrValue : `data:image/png;base64,${qrValue}`,
      connected: false,
    };
  }

  /**
   * Obtiene un código de emparejamiento numérico (Pairing Code) para vincular por teléfono.
   * Endpoint oficial Evolution API v2: GET /instance/connect/{instance}?number={phone}
   */
  static async getPhoneCode({
    apiUrl,
    apiKey,
    instanceName,
    phone,
    webhookUrl,
  }: EvolutionPhoneCodeParams & { webhookUrl?: string }): Promise<EvolutionPhoneCodeResponse> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    let cleanPhone = phone.replace(/\D/g, '');

    // Si el usuario ingresó 10 dígitos iniciando en 3 (típico celular colombiano sin prefijo 57), normalizar a 57...
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    if (!cleanPhone || cleanPhone.length < 8) {
      throw new Error('El número telefónico debe contener código de país y al menos 8 dígitos (ej: 573001234567).');
    }

    // 1. Asegurar que la instancia existe
    await this.createInstanceIfNotExists({ apiUrl, apiKey, instanceName: cleanInstance, webhookUrl });

    const url = `${baseUrl}/instance/connect/${cleanInstance}?number=${cleanPhone}`;

    const executeConnect = async () => {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
        cache: 'no-store',
      });

      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        if (
          errData.toLowerCase().includes('already connected') ||
          errData.toLowerCase().includes('open')
        ) {
          throw new Error('ALREADY_CONNECTED');
        }
        throw new Error(`Error obteniendo código de vinculación (${response.status}): ${errData}`);
      }

      const data = await response.json().catch(() => ({}));
      let raw = data.pairingCode || data.pairing_code || '';
      // Solo aceptar data.code si NO es un string de código QR (no contiene '@' y es de longitud corta <= 10)
      if (!raw && data.code && typeof data.code === 'string' && data.code.length <= 10 && !data.code.includes('@')) {
        raw = data.code;
      }
      return raw ? String(raw).trim() : null;
    };

    let code = await executeConnect();

    // 2. Si Evolution API retornó null en pairingCode (debido a que la instancia estaba en bucle QR 'connecting'),
    // reinicializamos la instancia limpia para que Baileys active el modo Pairing Code en el socket.
    if (!code) {
      console.warn(`[EVOLUTION PHONE CODE] La instancia ${cleanInstance} está en bucle QR. Reinicializando para habilitar Pairing Code...`);
      await fetch(`${baseUrl}/instance/delete/${cleanInstance}`, {
        method: 'DELETE',
        headers: this.buildHeaders(apiKey),
      }).catch(() => {});

      await this.createInstanceIfNotExists({ apiUrl, apiKey, instanceName: cleanInstance, webhookUrl });

      code = await executeConnect();
    }

    if (!code) {
      throw new Error('No se recibió el código de vinculación de Evolution API. Intenta nuevamente.');
    }

    // Formatear a XXXX-XXXX para máxima legibilidad humana si tiene 8 caracteres
    const formattedCode = code.length === 8 && !code.includes('-')
      ? `${code.slice(0, 4)}-${code.slice(4)}`
      : code;

    return {
      code: formattedCode,
    };
  }

  /**
   * Consulta el estado de conexión de la instancia en Evolution API v2.
   * Endpoint oficial: GET /instance/connectionState/{instance}
   */
  static async getStatus({
    apiUrl,
    apiKey,
    instanceName,
  }: EvolutionCredentials): Promise<EvolutionStatusResponse> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/instance/connectionState/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          connected: false,
          state: 'close',
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      const rawState =
        data.instance?.state ||
        data.state ||
        data.connectionStatus?.state ||
        (data.connected ? 'open' : 'close');

      const isConnected = rawState === 'open';

      // Si está conectado, intentar extraer el teléfono asociado
      let connectedPhone: string | undefined = undefined;
      if (isConnected) {
        connectedPhone =
          data.instance?.phone ||
          data.instance?.wuid?.replace(/[^0-9]/g, '') ||
          data.phone;

        // Si no vino en connectionState, consultar fetchInstances
        if (!connectedPhone) {
          try {
            const fetchRes = await fetch(`${baseUrl}/instance/fetchInstances?instanceName=${cleanInstance}`, {
              method: 'GET',
              headers: this.buildHeaders(apiKey),
              cache: 'no-store',
            });
            if (fetchRes.ok) {
              const fetchList = await fetchRes.json();
              const instItem = Array.isArray(fetchList)
                ? fetchList.find((i: any) => i.name === cleanInstance || i.instance?.name === cleanInstance)
                : fetchList;
              connectedPhone =
                instItem?.ownerJid?.replace(/[^0-9]/g, '') ||
                instItem?.profilePictureUrl ||
                instItem?.phone;
            }
          } catch {}
        }
      }

      return {
        connected: isConnected,
        state: isConnected ? 'open' : rawState === 'connecting' ? 'connecting' : 'close',
        phone: connectedPhone,
      };
    } catch (e: any) {
      return {
        connected: false,
        state: 'close',
        error: e.message || 'Error de conexión con Evolution API en el VPS',
      };
    }
  }

  /**
   * Configura los webhooks en Evolution API v2 para que apunten al CRM con firma criptográfica.
   * Endpoint oficial: POST /webhook/set/{instance}
   */
  static async configureWebhooks({
    apiUrl,
    apiKey,
    instanceName,
    webhookUrl,
    secret,
  }: EvolutionCredentials & { webhookUrl: string; secret?: string }): Promise<{ success: boolean; error?: string }> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/webhook/set/${cleanInstance}`;

    const headersPayload: Record<string, string> = {
      apikey: apiKey.trim(),
    };
    if (secret) {
      headersPayload.Authorization = `Bearer ${secret}`;
    }

    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers: headersPayload,
        events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return { success: false, error: `Error configurando webhook (${res.status}): ${errBody}` };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Fallo de red al configurar webhook: ${err.message}` };
    }
  }

  /**
   * Envía presencia humana en WhatsApp ('composing' | 'recording' | 'available' | 'paused')
   * Endpoint oficial Evolution API v2: POST /chat/sendPresence/{instance}
   */
  static async sendPresence({
    apiUrl,
    apiKey,
    instanceName,
    to,
    presence = 'composing',
    delay = 1200,
  }: EvolutionCredentials & {
    to: string;
    presence?: 'composing' | 'recording' | 'available' | 'paused';
    delay?: number;
  }): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const cleanTo = to.includes('@') ? to.trim() : to.replace(/[^0-9]/g, '');
    const url = `${baseUrl}/chat/sendPresence/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          number: cleanTo,
          presence,
          delay,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Envía un mensaje de texto con simulación opcional de cadencia humana (typing delay).
   * Endpoint oficial: POST /message/sendText/{instance}
   */
  static async sendTextMessage({
    apiUrl,
    apiKey,
    instanceName,
    to,
    message,
    simulateTyping = true,
  }: EvolutionCredentials & {
    to: string;
    message: string;
    simulateTyping?: boolean;
  }): Promise<string> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    let cleanTo = to.includes('@') ? to.trim() : to.replace(/[^0-9]/g, '');
    // Soporte nativo para WhatsApp Linked Devices (LID): si es un identificador de dispositivo privado de 14+ dígitos, dirigir al canal @lid
    if (!cleanTo.includes('@') && cleanTo.length >= 14 && !cleanTo.startsWith('55') && !cleanTo.startsWith('52') && !cleanTo.startsWith('57')) {
      cleanTo = `${cleanTo}@lid`;
    }
    const url = `${baseUrl}/message/sendText/${cleanInstance}`;

    let delayMs = 1000;
    if (simulateTyping) {
      const cadence = calculateHumanCadence(message);
      delayMs = cadence.delayTypingSeconds * 1000;

      // Pausa de lectura biológica estimada
      if (cadence.readingDelayMs > 0) {
        await sleep(Math.min(cadence.readingDelayMs, 2500));
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        number: cleanTo,
        text: message,
        delay: delayMs,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EVOLUTION SEND TEXT ERROR]', errorData);
      throw new Error(`Evolution API Send Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.key?.id || data.messageId || data.id || '';
  }

  /**
   * Envía un archivo multimedia (imagen, foto o documento) con caption opcional a través de Evolution API v2.
   * Endpoint oficial: POST /message/sendMedia/{instance}
   */
  static async sendMediaMessage({
    apiUrl,
    apiKey,
    instanceName,
    to,
    mediaUrl,
    caption,
    mediaType = 'image',
    fileName = 'imagen.jpg',
  }: EvolutionCredentials & {
    to: string;
    mediaUrl: string;
    caption?: string;
    mediaType?: 'image' | 'document' | 'video' | 'audio';
    fileName?: string;
  }): Promise<string> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    let cleanTo = to.includes('@') ? to.trim() : to.replace(/[^0-9]/g, '');
    if (!cleanTo.includes('@') && cleanTo.length >= 14 && !cleanTo.startsWith('55') && !cleanTo.startsWith('52') && !cleanTo.startsWith('57')) {
      cleanTo = `${cleanTo}@lid`;
    }
    const url = `${baseUrl}/message/sendMedia/${cleanInstance}`;

    const payload: any = {
      number: cleanTo,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption || '',
      fileName: fileName,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EVOLUTION SEND MEDIA ERROR]', errorData);
      throw new Error(`Evolution API Send Media Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.key?.id || data.messageId || data.id || '';
  }

  /**
   * Envía una nota de voz oficial de WhatsApp (PTT / Push-To-Talk) a través de Evolution API v2.
   * Endpoint oficial: POST /message/sendWhatsAppAudio/{instance}
   */
  static async sendWhatsAppAudio({
    apiUrl,
    apiKey,
    instanceName,
    to,
    audioUrl,
  }: EvolutionCredentials & {
    to: string;
    audioUrl: string;
  }): Promise<string> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    let cleanTo = to.includes('@') ? to.trim() : to.replace(/[^0-9]/g, '');
    if (!cleanTo.includes('@') && cleanTo.length >= 14 && !cleanTo.startsWith('55') && !cleanTo.startsWith('52') && !cleanTo.startsWith('57')) {
      cleanTo = `${cleanTo}@lid`;
    }
    const url = `${baseUrl}/message/sendWhatsAppAudio/${cleanInstance}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        number: cleanTo,
        audio: audioUrl,
      }),
    });

    if (!response.ok) {
      // Fallback elegante a sendMedia si el endpoint específico de PTT no responde
      return this.sendMediaMessage({
        apiUrl,
        apiKey,
        instanceName,
        to: cleanTo,
        mediaUrl: audioUrl,
        mediaType: 'audio',
        fileName: 'audio.ogg',
      });
    }

    const data = await response.json().catch(() => ({}));
    return data.key?.id || data.messageId || data.id || '';
  }

  /**
   * Envía opciones interactivas o realiza degradación elegante a texto enriquecido con opciones numeradas.
   */
  static async sendInteractiveButtonsMessage({
    apiUrl,
    apiKey,
    instanceName,
    to,
    bodyText,
    buttons,
  }: EvolutionCredentials & {
    to: string;
    bodyText: string;
    buttons: Array<{ id: string; title: string }>;
  }): Promise<string> {
    // Las conexiones emuladas Baileys suelen fallar al renderizar botones interactivos nativos
    // en WhatsApp móvil. Degradamos limpiamente a texto numerado con cadencia humana.
    const optionsText = buttons.map((b, i) => `*${i + 1}️⃣ ${b.title}*`).join('\n');
    const fallbackText = `${bodyText}\n\n${optionsText}\n\n_Por favor responde con el número de tu opción._`;

    return await this.sendTextMessage({
      apiUrl,
      apiKey,
      instanceName,
      to,
      message: fallbackText,
      simulateTyping: true,
    });
  }

  /**
   * Obtiene la lista de chats recientes de la instancia para importación controlada al CRM.
   * Endpoint oficial: POST /chat/findChats/{instance}
   */
  static async getRecentChats({
    apiUrl,
    apiKey,
    instanceName,
  }: EvolutionCredentials): Promise<any[]> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/chat/findChats/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({}),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Evolution API Chats Error (${response.status})`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.chats || [];
    } catch (err: any) {
      console.warn('[EVOLUTION GET CHATS ERROR]', err.message);
      return [];
    }
  }

  /**
   * Descarga cualquier medio multimedia (imagen, audio, documento) en Base64 desde Evolution API.
   * Endpoint oficial: POST /chat/getBase64FromMediaMessage/{instance}
   */
  static async getBase64Media({
    apiUrl,
    apiKey,
    instanceName,
    messageId,
    messagePayload,
    convertToMp4 = false,
  }: EvolutionCredentials & { messageId: string; messagePayload?: any; convertToMp4?: boolean }): Promise<{ base64: string; mimetype: string } | null> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          message: messagePayload || {
            key: {
              id: messageId,
            },
          },
          convertToMp4,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.base64) return null;

      return {
        base64: data.base64,
        mimetype: data.mimetype || (convertToMp4 ? 'audio/mp4' : 'audio/ogg; codecs=opus'),
      };
    } catch (e: any) {
      console.warn('[EVOLUTION GET BASE64 MEDIA ERROR]', e.message);
      return null;
    }
  }

  /**
   * Descarga el audio o medio multimedia en Base64 para transcripción con Whisper.
   * Endpoint oficial: POST /chat/getBase64FromMediaMessage/{instance}
   */
  static async getBase64Audio({
    apiUrl,
    apiKey,
    instanceName,
    messageId,
    messagePayload,
  }: EvolutionCredentials & { messageId: string; messagePayload?: any }): Promise<{ base64: string; mimetype: string } | null> {
    return this.getBase64Media({
      apiUrl,
      apiKey,
      instanceName,
      messageId,
      messagePayload,
      convertToMp4: false, // Whisper transcribe nativamente OGG Opus sin requerir ffmpeg en el VPS
    });
  }

  /**
   * Envía una reacción con emoji a un mensaje específico en Evolution API.
   * Endpoint oficial: POST /message/sendReaction/{instance}
   */
  static async sendReaction({
    apiUrl,
    apiKey,
    instanceName,
    remoteJid,
    messageId,
    emoji,
  }: EvolutionCredentials & { remoteJid: string; messageId: string; emoji: string }): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const cleanPhone = remoteJid.replace(/[^\d]/g, '');
    const formattedJid = remoteJid.includes('@') ? remoteJid : `${cleanPhone}@s.whatsapp.net`;
    const url = `${baseUrl}/message/sendReaction/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          key: {
            remoteJid: formattedJid,
            fromMe: false,
            id: messageId,
          },
          reaction: emoji,
        }),
      });

      return response.ok;
    } catch (e: any) {
      console.warn('[EVOLUTION SEND REACTION WARN]', e?.message);
      return false;
    }
  }

  /**
   * Cierra la sesión activa de WhatsApp Web en el VPS (Logout).
   * Endpoint oficial: DELETE /instance/logout/{instance}
   */
  static async disconnect({
    apiUrl,
    apiKey,
    instanceName,
  }: EvolutionCredentials): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/instance/logout/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(apiKey),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Reinicia el socket o contenedor de la instancia en el VPS.
   * Endpoint oficial: POST /instance/restart/{instance}
   */
  static async restart({
    apiUrl,
    apiKey,
    instanceName,
  }: EvolutionCredentials): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/instance/restart/${cleanInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Marca mensajes de un chat como leídos en WhatsApp (doble tilde azul).
   * Endpoint oficial: POST /chat/markMessageAsRead/{instance}
   */
  static async markMessageAsRead({
    apiUrl,
    apiKey,
    instanceName,
    remoteJid,
    messageId,
  }: EvolutionCredentials & {
    remoteJid: string;
    messageId: string;
  }): Promise<boolean> {
    const baseUrl = this.resolveBaseUrl(apiUrl);
    const cleanInstance = this.sanitizeInstanceName(instanceName);
    const url = `${baseUrl}/chat/markMessageAsRead/${cleanInstance}`;

    const formattedJid = remoteJid.includes('@')
      ? remoteJid
      : `${remoteJid.replace(/[^\d]/g, '')}@s.whatsapp.net`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          readMessages: [
            {
              remoteJid: formattedJid,
              id: messageId,
              fromMe: false,
            },
          ],
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

