import { decryptSecret } from '@/lib/security/encryption';
import { WhatsAppService, META_TEMPLATES, MetaTemplateKey } from './whatsapp.service';
import { EvolutionService } from './evolution.service';
import { checkOutboundRateLimit } from '@/lib/anti-ban/cadence';

export interface MessagingOrganization {
  id: string;
  name?: string;
  whatsapp_provider?: 'meta' | 'evolution' | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_access_token?: string | null;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
  evolution_instance_name?: string | null;
  evolution_status?: string | null;
  evolution_anti_ban_mode?: boolean | null;
  evolution_max_outbound_per_hour?: number | null;
}

export interface SendTextMessageOptions {
  organization: MessagingOrganization;
  to: string;
  body: string;
  simulateTyping?: boolean;
  isColdOutbound?: boolean;
}

export interface SendButtonsOptions {
  organization: MessagingOrganization;
  to: string;
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface SendTemplateOptions {
  organization: MessagingOrganization;
  to: string;
  templateKey: string;
  templateName?: string;
  languageCode?: string;
  components?: unknown[];
}

export class MessagingService {
  /**
   * Resuelve y valida las credenciales requeridas para Evolution API.
   */
  private static resolveEvolutionConfig(organization: MessagingOrganization): {
    instanceName: string;
    apiKey: string;
    apiUrl?: string | null;
  } {
    if (!organization.evolution_instance_name && !organization.evolution_api_key) {
      throw new Error('Instancia de Evolution API no configurada en la plataforma.');
    }

    const instanceName =
      organization.evolution_instance_name ||
      `synqo_${organization.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;

    let decryptedKey = '';
    if (organization.evolution_api_key) {
      try {
        decryptedKey = decryptSecret(organization.evolution_api_key);
      } catch {}
    }
    if (!decryptedKey && process.env.EVOLUTION_API_KEY) {
      decryptedKey = process.env.EVOLUTION_API_KEY.trim();
    }

    if (!instanceName || !decryptedKey) {
      throw new Error('Instancia de Evolution API no configurada en la plataforma.');
    }

    return {
      instanceName,
      apiKey: decryptedKey,
      apiUrl: organization.evolution_api_url,
    };
  }

  /**
   * Envía un mensaje de texto plano enrutándolo al proveedor activo (Meta o Evolution API).
   */
  static async sendTextMessage({
    organization,
    to,
    body,
    simulateTyping = true,
    isColdOutbound = false,
  }: SendTextMessageOptions): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    // 1. Ruta Evolution API (VPS / Baileys)
    if (provider === 'evolution') {
      const evoConfig = this.resolveEvolutionConfig(organization);

      // Protección Anti-Spam en frío para conexiones VPS
      if (isColdOutbound && organization.evolution_anti_ban_mode !== false) {
        const maxPerHour = organization.evolution_max_outbound_per_hour || 20;
        const rateCheck = checkOutboundRateLimit(organization.id, maxPerHour);
        if (!rateCheck.allowed) {
          throw new Error(
            `[ANTI-BAN SYNQO] Límite de seguridad alcanzado: Máximo ${maxPerHour} mensajes salientes/hora para proteger tu línea de WhatsApp en VPS. Podrás enviar más en ${rateCheck.resetInMinutes} minutos.`
          );
        }
      }

      return await EvolutionService.sendTextMessage({
        apiUrl: evoConfig.apiUrl,
        apiKey: evoConfig.apiKey,
        instanceName: evoConfig.instanceName,
        to,
        message: body,
        simulateTyping,
      });
    }

    // 2. Ruta Oficial Meta Cloud API
    if (!organization.whatsapp_phone_number_id || !organization.whatsapp_access_token) {
      throw new Error('Credenciales oficiales de WhatsApp (Meta) no configuradas.');
    }

    const decryptedToken = decryptSecret(organization.whatsapp_access_token);
    return await WhatsAppService.sendTextMessage({
      phoneNumberId: organization.whatsapp_phone_number_id,
      accessToken: decryptedToken,
      to,
      body,
    });
  }

  /**
   * Envía un mensaje multimedia (imagen) enrutándolo al proveedor activo (Meta o Evolution API).
   */
  static async sendMediaMessage({
    organization,
    to,
    mediaUrl,
    caption,
    mediaType = 'image',
    fileName,
  }: {
    organization: MessagingOrganization;
    to: string;
    mediaUrl: string;
    caption?: string;
    mediaType?: 'image' | 'document' | 'video' | 'audio';
    fileName?: string;
  }): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    if (provider === 'evolution') {
      const evoConfig = this.resolveEvolutionConfig(organization);
      return await EvolutionService.sendMediaMessage({
        apiUrl: evoConfig.apiUrl,
        apiKey: evoConfig.apiKey,
        instanceName: evoConfig.instanceName,
        to,
        mediaUrl,
        caption,
        mediaType,
        fileName,
      });
    }

    // Meta Cloud API
    if (!organization.whatsapp_phone_number_id || !organization.whatsapp_access_token) {
      throw new Error('Credenciales de WhatsApp Cloud API no configuradas en la plataforma.');
    }

    const decryptedToken = decryptSecret(organization.whatsapp_access_token);

    if (mediaType === 'document') {
      return await WhatsAppService.sendDocumentMessage({
        phoneNumberId: organization.whatsapp_phone_number_id,
        accessToken: decryptedToken,
        to,
        documentUrl: mediaUrl,
        caption,
        fileName,
      });
    }

    return await WhatsAppService.sendImageMessage({
      phoneNumberId: organization.whatsapp_phone_number_id,
      accessToken: decryptedToken,
      to,
      imageUrl: mediaUrl,
      caption,
    });
  }

  /**
   * Envía botones interactivos de 1-toque al proveedor activo.
   */
  static async sendInteractiveButtonsMessage({
    organization,
    to,
    bodyText,
    buttons,
  }: SendButtonsOptions): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    if (provider === 'evolution') {
      const evoConfig = this.resolveEvolutionConfig(organization);

      return await EvolutionService.sendInteractiveButtonsMessage({
        apiUrl: evoConfig.apiUrl,
        apiKey: evoConfig.apiKey,
        instanceName: evoConfig.instanceName,
        to,
        bodyText,
        buttons,
      });
    }

    if (!organization.whatsapp_phone_number_id || !organization.whatsapp_access_token) {
      throw new Error('Credenciales oficiales de WhatsApp (Meta) no configuradas.');
    }

    const decryptedToken = decryptSecret(organization.whatsapp_access_token);
    return await WhatsAppService.sendInteractiveButtonsMessage({
      phoneNumberId: organization.whatsapp_phone_number_id,
      accessToken: decryptedToken,
      to,
      bodyText,
      buttons,
    });
  }

  /**
   * Envía una plantilla comercial pre-aprobada.
   * Si el motor es Evolution API, traduce la plantilla a texto libre sin costo ni restricción de 24h.
   */
  static async sendTemplateMessage({
    organization,
    to,
    templateKey,
    templateName: customTemplateName,
    languageCode = 'es',
    components = [],
  }: SendTemplateOptions): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    if (provider === 'evolution') {
      // En Evolution API no hay ventana de 24 horas ni necesidad de aprobación de Meta.
      // Traducir el catálogo estándar de plantillas a texto enriquecido directo:
      const templateDef = (META_TEMPLATES as any)[templateKey];
      let fallbackText = `Hola, nos comunicamos de ${organization.name || 'nuestro equipo'}. ¿En qué podemos ayudarte el día de hoy?`;

      if (templateKey === 'recordatorio_cita') {
        fallbackText = `Hola, te recordamos que tienes una cita programada próximamente con nosotros. Por favor confírmanos si asistirás respondiendo a este mensaje.`;
      } else if (templateKey === 'reactivacion_lead') {
        fallbackText = `Hola, queríamos verificar si aún estás interesado en retomar la información sobre nuestros servicios. ¡Quedamos atentos a tus dudas!`;
      } else if (templateKey === 'seguimiento_general') {
        fallbackText = `Hola, tenemos novedades sobre tu consulta previa. ¿Tienes un momento para conversar?`;
      } else if (templateDef?.label) {
        fallbackText = `Hola, te escribimos de ${organization.name || 'nuestro equipo'} para brindarte seguimiento a tu solicitud.`;
      }

      return await this.sendTextMessage({
        organization,
        to,
        body: fallbackText,
        simulateTyping: true,
        isColdOutbound: true,
      });
    }

    // Ruta Oficial Meta Cloud API
    if (!organization.whatsapp_phone_number_id || !organization.whatsapp_access_token) {
      throw new Error('Credenciales oficiales de WhatsApp (Meta) no configuradas.');
    }

    const templateDef = (META_TEMPLATES as any)[templateKey];
    const templateName = customTemplateName || templateDef?.name || templateKey;
    const decryptedToken = decryptSecret(organization.whatsapp_access_token);

    return await WhatsAppService.sendTemplateMessage({
      phoneNumberId: organization.whatsapp_phone_number_id,
      accessToken: decryptedToken,
      to,
      templateName,
      languageCode,
      components,
    });
  }
}
