/**
 * Utilidades para formateo inteligente de fechas y horas en el Inbox
 * Permite distinguir si un mensaje o chat fue "Hoy", "Ayer" o el día exacto de la semana/año.
 */

export function formatInboxConversationDate(dateStr?: string | null): {
  label: string;
  isToday: boolean;
  tooltip: string;
} {
  if (!dateStr) return { label: '', isToday: false, tooltip: '' };

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { label: '', isToday: false, tooltip: '' };

    const now = new Date();
    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // 1. Mismo día (Hoy)
    if (d.toDateString() === now.toDateString()) {
      return {
        label: `Hoy ${timeStr}`,
        isToday: true,
        tooltip: `Hoy a las ${timeStr}`,
      };
    }

    // 2. Ayer
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return {
        label: `Ayer ${timeStr}`,
        isToday: false,
        tooltip: `Ayer a las ${timeStr}`,
      };
    }

    // 3. Esta semana (últimos 6 días)
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 7) {
      const dayRaw = d.toLocaleDateString('es-ES', { weekday: 'short' });
      const dayCapitalized = dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1).replace('.', '');
      return {
        label: `${dayCapitalized} ${timeStr}`,
        isToday: false,
        tooltip: `${dayCapitalized}, ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} a las ${timeStr}`,
      };
    }

    // 4. Mismo año (ej: "28 oct 11:20")
    if (d.getFullYear() === now.getFullYear()) {
      const dateShort = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return {
        label: `${dateShort} ${timeStr}`,
        isToday: false,
        tooltip: `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${timeStr}`,
      };
    }

    // 5. Años anteriores (ej: "15/12/25 14:00")
    const fullDate = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return {
      label: `${fullDate} ${timeStr}`,
      isToday: false,
      tooltip: d.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' }),
    };
  } catch {
    return { label: '', isToday: false, tooltip: '' };
  }
}

/**
 * Genera el texto para los separadores flotantes/centrados entre días en el historial del chat
 * Ej: "Hoy", "Ayer", "Lunes, 3 de noviembre", "Miércoles, 15 de enero de 2025"
 */
export function formatMessageDateDivider(dateStr?: string | null): string {
  if (!dateStr) return '';

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';

    const now = new Date();

    // Mismo día
    if (d.toDateString() === now.toDateString()) {
      return 'Hoy';
    }

    // Ayer
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    }

    // Mismo año: "Lunes, 3 de noviembre"
    if (d.getFullYear() === now.getFullYear()) {
      const formatted = d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    // Años anteriores: "Lunes, 3 de noviembre de 2025"
    const formatted = d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return '';
  }
}

/**
 * Fecha completa en español para tooltips
 */
export function formatFullDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
