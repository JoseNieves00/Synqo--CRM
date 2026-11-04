import { decryptSecret } from '@/lib/security/encryption';
import { WhatsAppService, META_TEMPLATES, MetaTemplateKey } from './whatsapp.service';
import { ZApiService } from './zapi.service';
import { checkOutboundRateLimit } from '@/lib/anti-ban/cadence';

export interface MessagingOrganization {
  id: string;
  name?: string;
  whatsapp_provider?: 'meta' | 'zapi' | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_access_token?: string | null;
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_client_token?: string | null;
  zapi_status?: string | null;
  zapi_anti_ban_mode?: boolean | null;
  zapi_max_outbound_per_hour?: number | null;
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
   * Envía un mensaje de texto plano enrutándolo al proveedor activo (Meta o Z-API).
   */
  static async sendTextMessage({
    organization,
    to,
    body,
    simulateTyping = true,
    isColdOutbound = false,
  }: SendTextMessageOptions): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    if (provider === 'zapi') {
      if (!organization.zapi_instance_id || !organization.zapi_token) {
        throw new Error('Instancia de Z-API no configurada en la organización.');
      }

      // Protección Anti-Spam en frío para conexiones QR
      if (isColdOutbound && organization.zapi_anti_ban_mode !== false) {
        const maxPerHour = organization.zapi_max_outbound_per_hour || 20;
        const rateCheck = checkOutboundRateLimit(organization.id, maxPerHour);
        if (!rateCheck.allowed) {
          throw new Error(
            `[ANTI-BAN SYNQO] Límite de seguridad alcanzado: Máximo ${maxPerHour} mensajes salientes/hora para proteger tu línea de WhatsApp. Podrás enviar más en ${rateCheck.resetInMinutes} minutos.`
          );
        }
      }

      const decryptedToken = decryptSecret(organization.zapi_token);
      const decryptedClientToken = organization.zapi_client_token
        ? decryptSecret(organization.zapi_client_token)
        : undefined;

      return await ZApiService.sendTextMessage({
        instanceId: organization.zapi_instance_id,
        token: decryptedToken,
        clientToken: decryptedClientToken,
        to,
        message: body,
        simulateTyping,
      });
    }

    // Ruta Oficial Meta Cloud API
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
   * Envía botones interactivos de 1-toque al proveedor activo.
   */
  static async sendInteractiveButtonsMessage({
    organization,
    to,
    bodyText,
    buttons,
  }: SendButtonsOptions): Promise<string> {
    const provider = organization.whatsapp_provider || 'meta';

    if (provider === 'zapi') {
      if (!organization.zapi_instance_id || !organization.zapi_token) {
        throw new Error('Instancia de Z-API no configurada en la organización.');
      }

      const decryptedToken = decryptSecret(organization.zapi_token);
      const decryptedClientToken = organization.zapi_client_token
        ? decryptSecret(organization.zapi_client_token)
        : undefined;

      return await ZApiService.sendInteractiveButtonsMessage({
        instanceId: organization.zapi_instance_id,
        token: decryptedToken,
        clientToken: decryptedClientToken,
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
   * Si el motor es Z-API, traduce la plantilla a texto libre sin costo ni restricción de 24h.
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

    if (provider === 'zapi') {
      // En Z-API no hay ventana de 24 horas ni necesidad de aprobación de Meta.
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
