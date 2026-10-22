export interface CalSlot {
  time: string;
}

export class CalService {
  private static BASE_URL = 'https://api.cal.com/v2';
  private static EVENT_TYPES_VERSION = '2026-06-12';
  private static SLOTS_VERSION = '2024-09-04';
  private static BOOKINGS_VERSION = '2026-05-01';

  /**
   * Resuelve de forma transparente un identificador (ID numérico, slug como 'cita-comercial'
   * o enlace URL de Cal.com) al ID numérico requerido por la API v2.
   */
  static async resolveEventTypeId(apiKey: string, identifier: string | number): Promise<number> {
    const raw = String(identifier || '').trim();

    // Si ya es un ID puramente numérico
    if (/^\d+$/.test(raw)) {
      return parseInt(raw, 10);
    }

    // Si es una URL o slug compuesto, extraer el slug del evento
    let targetSlug = raw;
    if (raw.includes('cal.com')) {
      const cleanUrl = raw.split('?')[0].replace(/\/+$/, '');
      const parts = cleanUrl.split('/');
      targetSlug = parts[parts.length - 1] || raw;
    }

    // Consultar /v2/event-types para mapear el slug al ID numérico en la cuenta del usuario
    const cleanKey = apiKey.trim().replace(/^Bearer\s+/i, '');
    try {
      const res = await fetch(`${this.BASE_URL}/event-types`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'cal-api-version': this.EVENT_TYPES_VERSION,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : (data.event_types || []);

        // Buscar coincidencia exacta por slug o título
        const match = list.find((et: any) =>
          String(et.slug).toLowerCase() === targetSlug.toLowerCase() ||
          String(et.title).toLowerCase() === targetSlug.toLowerCase() ||
          targetSlug.toLowerCase().includes(String(et.slug).toLowerCase())
        );

        if (match?.id) {
          return Number(match.id);
        }

        // Si solo tiene 1 tipo de evento configurado en su cuenta, asociarlo automáticamente
        if (list.length === 1 && list[0]?.id) {
          return Number(list[0].id);
        }
      }
    } catch (err) {
      console.warn('[CalService] No se pudo autocompletar Event Type por slug:', err);
    }

    return parseInt(raw, 10) || 0;
  }

  /**
   * Consulta los horarios libres disponibles para agendar una cita en Cal.com API v2.
   * Admite tanto el ID numérico como el slug 'cita-comercial'.
   */
  static async getAvailableSlots(
    apiKey: string,
    eventTypeId: string | number,
    dateFrom: string,
    dateTo: string
  ): Promise<string[]> {
    const cleanKey = apiKey.trim().replace(/^Bearer\s+/i, '');
    const numericEventTypeId = await this.resolveEventTypeId(cleanKey, eventTypeId);

    // Normalizar fechas para Cal.com API v2
    const start = dateFrom.trim();
    let end = dateTo.trim();

    // Si start y end son iguales en formato YYYY-MM-DD, extender end al día siguiente para cubrir el rango completo
    if (start.length === 10 && end.length === 10 && start === end) {
      const nextDay = new Date(`${end}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      end = nextDay.toISOString().split('T')[0];
    }

    const url = `${this.BASE_URL}/slots?eventTypeId=${numericEventTypeId}&start=${start}&end=${end}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'cal-api-version': this.SLOTS_VERSION,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg =
        errData?.error?.message || errData?.message || response.statusText;
      throw new Error(`Cal.com API error al consultar disponibilidad: ${errMsg}`);
    }

    const data = await response.json();
    const slots: string[] = [];

    // En API v2, los slots vienen en data.data como un objeto por fechas { "YYYY-MM-DD": [ { start: "..." } ] }
    // o en versiones previas dentro de data.data.slots / data.slots
    const rawSlots = data.data?.slots || (data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data.slots);
    if (rawSlots && typeof rawSlots === 'object') {
      for (const day of Object.keys(rawSlots)) {
        if (Array.isArray(rawSlots[day])) {
          for (const slot of rawSlots[day]) {
            if (slot?.time) {
              slots.push(slot.time);
            } else if (slot?.start) {
              slots.push(slot.start);
            }
          }
        }
      }
    }

    return slots;
  }

  /**
   * Crea una reserva en Cal.com API v2 vinculando los datos del lead.
   * Admite tanto el ID numérico como el slug 'cita-comercial'.
   */
  static async createBooking(params: {
    apiKey: string;
    eventTypeId: number | string;
    start: string; // ISO 8601 string
    name: string;
    email: string;
    phone: string;
    notes?: string;
  }): Promise<{ bookingId: number | string; startTime: string }> {
    const cleanKey = params.apiKey.trim().replace(/^Bearer\s+/i, '');
    const numericEventTypeId = await this.resolveEventTypeId(cleanKey, params.eventTypeId);
    const url = `${this.BASE_URL}/bookings`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'cal-api-version': this.BOOKINGS_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventTypeId: numericEventTypeId,
        start: params.start,
        attendee: {
          name: params.name || 'Cliente WhatsApp',
          email: params.email || `${params.phone}@synqo.client`,
          timeZone: 'UTC',
          phoneNumber: params.phone,
        },
        metadata: {
          phone: params.phone,
          notes: params.notes || 'Agendado automáticamente vía WhatsApp por Synqo AI',
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errText =
        errData?.error?.message ||
        errData?.message ||
        (await response.text().catch(() => 'Error desconocido'));
      throw new Error(`Error en Cal.com al confirmar cita: ${errText}`);
    }

    const data = await response.json();
    const booking = data.data || data.booking || data;
    return {
      bookingId: booking.id || booking.uid || 0,
      startTime: booking.startTime || booking.start || params.start,
    };
  }
}
