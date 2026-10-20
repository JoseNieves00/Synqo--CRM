export interface CalSlot {
  time: string;
}

export class CalService {
  private static BASE_URL = 'https://api.cal.com/v1';

  /**
   * Consulta los horarios libres disponibles para agendar una cita.
   */
  static async getAvailableSlots(
    apiKey: string,
    eventTypeId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<string[]> {
    const url = `${this.BASE_URL}/slots?apiKey=${apiKey}&eventTypeId=${eventTypeId}&startTime=${dateFrom}&endTime=${dateTo}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Cal.com API error al consultar disponibilidad: ${response.statusText}`);
    }

    const data = await response.json();
    const slots: string[] = [];

    if (data.slots && typeof data.slots === 'object') {
      for (const day of Object.keys(data.slots)) {
        if (Array.isArray(data.slots[day])) {
          for (const slot of data.slots[day]) {
            if (slot?.time) {
              slots.push(slot.time);
            }
          }
        }
      }
    }

    // Retornamos un máximo de 5 opciones para mantener el mensaje de WhatsApp conciso
    return slots.slice(0, 5);
  }

  /**
   * Crea una reserva en Cal.com vinculando los datos del lead.
   */
  static async createBooking(params: {
    apiKey: string;
    eventTypeId: number;
    start: string; // ISO 8601 string
    name: string;
    email: string;
    phone: string;
    notes?: string;
  }): Promise<{ bookingId: number; startTime: string }> {
    const url = `${this.BASE_URL}/bookings?apiKey=${params.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventTypeId: params.eventTypeId,
        start: params.start,
        name: params.name,
        email: params.email || 'lead@synqo.client',
        metadata: { phone: params.phone },
        description: params.notes || 'Agendado automáticamente vía WhatsApp por Synqo AI',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en Cal.com al confirmar cita: ${errText}`);
    }

    const data = await response.json();
    return {
      bookingId: data.booking?.id || data.id,
      startTime: data.booking?.startTime || params.start,
    };
  }
}

