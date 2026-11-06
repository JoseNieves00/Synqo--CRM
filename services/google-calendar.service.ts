import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';

export interface CreateEventParams {
  organizationId: string;
  summary: string;
  description?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  clientName?: string;
  clientPhone?: string;
  referenceInfo?: string;
}

export interface GoogleCalendarEventResult {
  success: boolean;
  eventId?: string;
  meetLink: string | null;
  syncedToGoogle: boolean;
  error?: string;
}

export class GoogleCalendarService {
  /**
   * Obtiene un access_token válido para la organización,
   * refrescándolo automáticamente si expiró y tiene refresh_token.
   */
  static async getValidAccessToken(organizationId: string): Promise<string | null> {
    try {
      const { data: org, error } = await (supabaseAdmin.from('organizations') as any)
        .select('google_calendar_token')
        .eq('id', organizationId)
        .single();

      if (error || !org?.google_calendar_token) return null;

      const decrypted = decryptSecret(org.google_calendar_token);
      if (!decrypted) return null;

      // Si es un payload JSON estructurado (OAuth 2.0 de 1 clic)
      if (decrypted.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(decrypted);
          const { access_token, refresh_token, expires_at } = parsed;

          // Si el access_token todavía no expira (con margen de 2 minutos)
          if (access_token && expires_at && Date.now() < (expires_at - 120000)) {
            return access_token;
          }

          // Si está expirado pero tenemos refresh_token
          if (refresh_token) {
            const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            if (clientId && clientSecret) {
              const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  refresh_token: refresh_token,
                  grant_type: 'refresh_token',
                }),
              });

              if (res.ok) {
                const refreshed = await res.json();
                const newAccessToken = refreshed.access_token;
                const newExpiresAt = Date.now() + ((refreshed.expires_in || 3600) * 1000);

                // Actualizar token en la BD
                const newPayload = JSON.stringify({
                  access_token: newAccessToken,
                  refresh_token: refreshed.refresh_token || refresh_token,
                  expires_at: newExpiresAt,
                });

                await (supabaseAdmin.from('organizations') as any)
                  .update({
                    google_calendar_token: encryptSecret(newPayload),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', organizationId);

                return newAccessToken;
              }
            }
          }

          return access_token || null;
        } catch {
          return decrypted;
        }
      }

      // Si es un token plano manual
      return decrypted;
    } catch (err) {
      console.warn('[GOOGLE CALENDAR GET ACCESS TOKEN ERROR]', err);
      return null;
    }
  }

  /**
   * Enlace de reunión de Google Meet (retorna null si no fue generado por Google Calendar)
   */
  static generateDefaultMeetLink(): string | null {
    return null;
  }

  /**
   * Crea un evento en el Google Calendar conectado de la organización,
   * solicitando un enlace oficial de Google Meet via conferenceData.
   */
  static async createCalendarEvent(params: CreateEventParams): Promise<GoogleCalendarEventResult> {
    const {
      organizationId,
      summary,
      description = '',
      startTime,
      endTime,
      clientName,
      referenceInfo,
    } = params;

    try {
      const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
        .select('google_calendar_token, google_calendar_id, google_calendar_sync_enabled')
        .eq('id', organizationId)
        .single();

      if (orgErr || !org || !org.google_calendar_token || !org.google_calendar_sync_enabled) {
        // No está conectado o la sincronización automática está apagada
        return {
          success: true,
          meetLink: null,
          syncedToGoogle: false,
        };
      }

      const calendarId = encodeURIComponent(org.google_calendar_id || 'primary');
      const decryptedToken = await this.getValidAccessToken(organizationId);
      if (!decryptedToken) {
        return {
          success: true,
          meetLink: null,
          syncedToGoogle: false,
        };
      }

      const eventPayload = {
        summary: referenceInfo ? `${summary} [${referenceInfo}]` : summary,
        description: `${description}\n\nCliente: ${clientName || 'N/A'}${referenceInfo ? `\nReferencia: ${referenceInfo}` : ''}\nAgendado automáticamente vía Synqo CRM.`,
        start: {
          dateTime: startTime,
          timeZone: 'America/Bogota',
        },
        end: {
          dateTime: endTime,
          timeZone: 'America/Bogota',
        },
        conferenceData: {
          createRequest: {
            requestId: `synqo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${decryptedToken}`,
          },
          body: JSON.stringify(eventPayload),
          signal: AbortSignal.timeout(6000),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.warn('[GOOGLE CALENDAR SYNC WARN] Google Calendar API error:', res.status, errorText);
        return {
          success: false,
          meetLink: null,
          syncedToGoogle: false,
          error: `Google API Error: ${res.status}`,
        };
      }

      const eventData = await res.json();
      const meetLink =
        eventData.hangoutLink ||
        eventData.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
        null;

      return {
        success: true,
        eventId: eventData.id,
        meetLink,
        syncedToGoogle: true,
      };
    } catch (err: any) {
      console.warn('[GOOGLE CALENDAR SYNC ERROR]', err?.message || err);
      return {
        success: false,
        meetLink: null,
        syncedToGoogle: false,
        error: err?.message,
      };
    }
  }

  /**
   * Consulta intervalos ocupados en el Google Calendar conectado para bloquear turnos en Synqo
   */
  static async getBusyIntervals(params: {
    organizationId: string;
    timeMin: string;
    timeMax: string;
  }): Promise<Array<{ start: string; end: string }>> {
    const { organizationId, timeMin, timeMax } = params;

    try {
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('google_calendar_token, google_calendar_id, google_calendar_block_busy')
        .eq('id', organizationId)
        .single();

      if (!org?.google_calendar_token || !org?.google_calendar_block_busy) {
        return [];
      }

      const calendarId = org.google_calendar_id || 'primary';
      const decryptedToken = await this.getValidAccessToken(organizationId);
      if (!decryptedToken) return [];

      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${decryptedToken}`,
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: 'America/Bogota',
          items: [{ id: calendarId }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return [];

      const data = await res.json();
      const busyList = data?.calendars?.[calendarId]?.busy || [];
      return busyList.map((b: any) => ({
        start: b.start,
        end: b.end,
      }));
    } catch (err) {
      console.warn('[GOOGLE CALENDAR BUSY QUERY ERROR]', err);
      return [];
    }
  }
}

