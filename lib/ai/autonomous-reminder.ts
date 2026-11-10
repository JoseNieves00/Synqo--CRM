import type { LeadTemperature } from '@/lib/ai/follow-up-types';

/**
 * Convierte partes locales (año, mes, día, hora, minuto) en la zona horaria del negocio a un Date UTC real.
 */
export function buildDateInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  try {
    const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = dtf.formatToParts(guessUtc);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    const localH = get('hour') === 24 ? 0 : get('hour');
    const renderedLocalUtc = Date.UTC(get('year'), get('month') - 1, get('day'), localH, get('minute'), 0);
    const desiredLocalUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const offsetMs = renderedLocalUtc - guessUtc.getTime();
    return new Date(desiredLocalUtc - offsetMs);
  } catch {
    // Fallback Colombia (-05:00)
    return new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
  }
}

function getLocalParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Dom .. 6=Sab
} {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const getNum = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wk = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
    const rawHour = getNum('hour');
    return {
      year: getNum('year'),
      month: getNum('month'),
      day: getNum('day'),
      hour: rawHour === 24 ? 0 : rawHour,
      minute: getNum('minute'),
      weekday: wkMap[wk] ?? 1,
    };
  } catch {
    const d = new Date(date.getTime() - 5 * 3600 * 1000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      weekday: d.getUTCDay(),
    };
  }
}

/**
 * Evita programar mensajes en madrugada o noche tardía (ventana humana 08:00 - 20:30 hora local).
 */
export function adjustToHumanHours(targetDate: Date, orgTimezone: string, now: Date = new Date()): Date {
  let candidate = new Date(Math.max(targetDate.getTime(), now.getTime() + 10 * 60 * 1000));
  const local = getLocalParts(candidate, orgTimezone);
  const mins = local.hour * 60 + local.minute;

  if (mins < 8 * 60) {
    candidate = buildDateInTimeZone(local.year, local.month, local.day, 8, 30, orgTimezone);
  } else if (mins >= 20 * 60 + 30) {
    const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    candidate = buildDateInTimeZone(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      9,
      0,
      orgTimezone
    );
  }

  return candidate;
}

/**
 * Parsea fecha (YYYY-MM-DD / ISO), hora local opcional (HH:mm) o delay en horas a un timestamp futuro en horario humano.
 */
export function parseFollowUpScheduleDate(params: {
  date?: string;
  timeLocal?: string;
  delayHours?: number;
  orgTimezone: string;
  now?: Date;
}): Date | null {
  const now = params.now || new Date();
  const tz = params.orgTimezone || 'America/Bogota';

  if (typeof params.delayHours === 'number' && Number.isFinite(params.delayHours) && params.delayHours > 0) {
    const clampedHours = Math.min(720, Math.max(0.5, params.delayHours));
    const target = new Date(now.getTime() + clampedHours * 3600 * 1000);
    return adjustToHumanHours(target, tz, now);
  }

  const trimmed = (params.date || '').trim();
  if (!trimmed) return null;

  let hour = 9;
  let minute = 30;
  const timeMatch = (params.timeLocal || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    hour = Math.min(23, Math.max(0, Number(timeMatch[1])));
    minute = Math.min(59, Math.max(0, Number(timeMatch[2])));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    let target = buildDateInTimeZone(y, m, d, hour, minute, tz);
    if (!timeMatch && target.getTime() <= now.getTime()) {
      // Si pidieron hoy sin hora específica y ya pasaron las 9:30 AM, agendar +3 horas dentro de horario
      target = new Date(now.getTime() + 3 * 3600 * 1000);
    }
    return adjustToHumanHours(target, tz, now);
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return adjustToHumanHours(parsed, tz, now);
}

/**
 * Detecta de forma determinística si el mensaje del lead expresa una ventana temporal o aplazamiento
 * para programar seguimiento autónomo aunque el modelo no haya invocado `schedule_follow_up`.
 */
export function inferAutonomousReminderFromLeadMessage(params: {
  leadText: string;
  orgTimezone: string;
  productInterest?: string | null;
  temperature?: LeadTemperature | null;
  now?: Date;
}): { scheduledFor: Date; reason: string; suggestedMessage: string } | null {
  if (params.temperature === 'cold') return null;
  const text = (params.leadText || '').trim();
  if (!text || text.length < 4) return null;
  const lower = text.toLowerCase();

  // Ignorar preguntas informativas simples sobre horarios de atención o si hay stock mañana
  if (/^[¿?].*(abren|atienden|horario|trabajan|env[ií]os)/i.test(lower) && !/(aviso|confirmo|escr[ií]b|hablamos|pienso|pago)/i.test(lower)) {
    return null;
  }

  const now = params.now || new Date();
  const tz = params.orgTimezone || 'America/Bogota';
  const localNow = getLocalParts(now, tz);
  const productLabel = params.productInterest?.trim();
  const subjectSuffix = productLabel ? ` sobre ${productLabel}` : '';

  const makeLocalTarget = (daysAhead: number, hour = 9, minute = 30) => {
    const targetUtcDay = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysAhead));
    return adjustToHumanHours(
      buildDateInTimeZone(
        targetUtcDay.getUTCFullYear(),
        targetUtcDay.getUTCMonth() + 1,
        targetUtcDay.getUTCDate(),
        hour,
        minute,
        tz
      ),
      tz,
      now
    );
  };

  // 1) "en X horas" / "en un par de horas"
  const hoursMatch = lower.match(/\ben\s+(\d{1,2})\s*horas?\b/);
  if (hoursMatch) {
    const h = Math.min(48, Math.max(1, Number(hoursMatch[1])));
    return {
      scheduledFor: adjustToHumanHours(new Date(now.getTime() + h * 3600 * 1000), tz, now),
      reason: `Cliente pidió retomar en ${h} horas${subjectSuffix}`,
      suggestedMessage: `¡Hola! Como quedamos, te escribo ahora para retomar${subjectSuffix} y ayudarte si deseas confirmar 😊`,
    };
  }

  // 2) "en X días"
  const daysMatch = lower.match(/\ben\s+(\d{1,2})\s*d[ií]as?\b/);
  if (daysMatch) {
    const d = Math.min(30, Math.max(1, Number(daysMatch[1])));
    return {
      scheduledFor: makeLocalTarget(d, 9, 30),
      reason: `Cliente indicó retomar en ${d} días${subjectSuffix}`,
      suggestedMessage: `¡Hola! Pasaron los días que acordamos y te escribo para ver cómo te fue y retomar${subjectSuffix} 😊`,
    };
  }

  // 3) Día específico de la semana ("el lunes", "para el viernes", etc.)
  const weekdayMap: Array<{ regex: RegExp; day: number; label: string }> = [
    { regex: /\b(el|para el|este)\s+lunes\b/, day: 1, label: 'lunes' },
    { regex: /\b(el|para el|este)\s+martes\b/, day: 2, label: 'martes' },
    { regex: /\b(el|para el|este)\s+mi[eé]rcoles\b/, day: 3, label: 'miércoles' },
    { regex: /\b(el|para el|este)\s+jueves\b/, day: 4, label: 'jueves' },
    { regex: /\b(el|para el|este)\s+viernes\b/, day: 5, label: 'viernes' },
    { regex: /\b(el|para el|este)\s+s[aá]bado\b/, day: 6, label: 'sábado' },
    { regex: /\b(el|para el|este)\s+domingo\b/, day: 0, label: 'domingo' },
  ];
  for (const w of weekdayMap) {
    if (w.regex.test(lower)) {
      let diff = (w.day - localNow.weekday + 7) % 7;
      if (diff === 0) diff = 7;
      return {
        scheduledFor: makeLocalTarget(diff, 9, 30),
        reason: `Cliente pidió contacto el ${w.label}${subjectSuffix}`,
        suggestedMessage: `¡Hola! Como quedamos para este ${w.label}, te escribo para retomar${subjectSuffix}. ¿Te ayudo a confirmarlo hoy? 😊`,
      };
    }
  }

  // 4) Quincena / fecha de pago ("quincena", "cuando me paguen", "el 15", "el 30")
  if (/(quincena|cuando me paguen|cuando cobre|pr[oó]ximo pago|fin de mes)/i.test(lower)) {
    const daysInMonth = new Date(Date.UTC(localNow.year, localNow.month, 0)).getUTCDate();
    let targetDay = localNow.day < 15 ? 15 : daysInMonth;
    let targetMonth = localNow.month;
    let targetYear = localNow.year;
    if (/fin de mes/.test(lower) && localNow.day >= daysInMonth) {
      targetMonth += 1;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear += 1;
      }
      targetDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    } else if (localNow.day >= daysInMonth) {
      targetMonth += 1;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear += 1;
      }
      targetDay = 15;
    }
    const scheduled = adjustToHumanHours(
      buildDateInTimeZone(targetYear, targetMonth, targetDay, 9, 30, tz),
      tz,
      now
    );
    return {
      scheduledFor: scheduled,
      reason: `Cliente espera quincena o fecha de pago${subjectSuffix}`,
      suggestedMessage: `¡Hola! Recordé que me comentaste sobre la quincena para${subjectSuffix || ' tu pedido'}. ¿Lo revisamos hoy para dejártelo listo? 😊`,
    };
  }

  // 5) "pasado mañana"
  if (/pasado\s+ma[ñn]ana/i.test(lower)) {
    return {
      scheduledFor: makeLocalTarget(2, 9, 30),
      reason: `Cliente pidió retomar pasado mañana${subjectSuffix}`,
      suggestedMessage: `¡Hola! Como acordamos para hoy, quería saber cómo ves avanzar${subjectSuffix} 😊`,
    };
  }

  // 6) "mañana" con intención de seguimiento
  if (/\bma[ñn]ana\b/i.test(lower) && /(aviso|confirmo|escrib|hablamos|pago|pido|reservo|veo|cuento|paso)/i.test(lower)) {
    return {
      scheduledFor: makeLocalTarget(1, 9, 30),
      reason: `Cliente pidió retomar mañana${subjectSuffix}`,
      suggestedMessage: `¡Hola! Tal como quedamos ayer, te escribo hoy para confirmar si avanzamos${subjectSuffix} 😊`,
    };
  }

  // 7) "en la tarde" / "más tarde" / "en un rato"
  if (/(en la tarde|m[aá]s tarde|ahorita|en un rato|luego hoy)/i.test(lower)) {
    return {
      scheduledFor: adjustToHumanHours(new Date(now.getTime() + 4 * 3600 * 1000), tz, now),
      reason: `Cliente pidió retomar más tarde hoy${subjectSuffix}`,
      suggestedMessage: `¡Hola! Paso por aquí más tarde como me comentaste, ¿pudiste revisar lo de${subjectSuffix || ' nuestra conversación'}? 😊`,
    };
  }

  // 8) "en la noche" / "cuando llegue a casa"
  if (/(en la noche|esta noche|cuando llegue)/i.test(lower)) {
    const tonight = buildDateInTimeZone(localNow.year, localNow.month, localNow.day, 19, 0, tz);
    const target = tonight.getTime() > now.getTime() + 30 * 60 * 1000 ? tonight : makeLocalTarget(1, 9, 30);
    return {
      scheduledFor: adjustToHumanHours(target, tz, now),
      reason: `Cliente pidió retomar en la noche${subjectSuffix}`,
      suggestedMessage: `¡Hola! Te escribo tal como acordamos para ayudarte con${subjectSuffix || ' tu consulta'} cuando estés más tranquilo/a 😊`,
    };
  }

  // 9) "lo pienso" / "consulto" / "te aviso" / "después te confirmo"
  if (/(lo pienso|voy a pensarlo|d[eé]jame pensar|te aviso|te confirmo luego|te confirmo despu[eé]s|consulto con)/i.test(lower)) {
    return {
      scheduledFor: makeLocalTarget(1, 10, 0),
      reason: `Cliente quedó pensando/consultando${subjectSuffix}`,
      suggestedMessage: `¡Hola! Quería saber cómo te fue pensando lo de${subjectSuffix || ' la opción que revisamos'} y si te quedó alguna duda para apoyarte 😊`,
    };
  }

  return null;
}

/**
 * Extrae sin consumo de tokens las secciones del prompt más relevantes para recontacto y cierre
 * (identidad breve + reglas de recontacto, plan separe, promos, pagos, envíos e instrucciones de fotos),
 * evitando truncar reglas escritas al final de prompts largos sin inflar tokens con todo el catálogo.
 */
export function extractRecontactPromptDigest(fullPrompt: string, maxChars = 2200): string {
  const cleaned = String(fullPrompt || '')
    .replace(/\[(?:foto|imagen):\s*https?:\/\/[^\]]+\]/gi, '')
    .replace(/<\/?[a-zA-Z0-9_-]+>/g, '\n')
    .replace(/\r/g, '')
    .trim();

  if (!cleaned) return 'Empresa comercial.';
  if (cleaned.length <= maxChars) return cleaned;

  const introBudget = Math.min(450, Math.floor(maxChars * 0.25));
  const intro = cleaned.slice(0, introBudget).trim();

  // Prioridad 1: reglas explícitas de recontacto, plan separe, apartados, abonos y envío de imágenes
  const highPriorityPattern =
    /(recontact|seguimiento|recordatorio|reactivar|plan separe|separe|abono|apartado|foto|imagen)/i;
  // Prioridad 2: beneficios de cierre, envíos, garantías, pagos y promos
  const secondaryPattern =
    /(reserva|cita|env[ií]o|domicilio|contraentrega|descuento|promo|garant[ií]a|pago|bancolombia|nequi|daviplata|obsequio|regalo|beneficio)/i;

  const blocks = cleaned
    .slice(introBudget)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6);

  const highLines: string[] = [];
  const secLines: string[] = [];
  const seen = new Set<string>();

  for (const line of blocks) {
    const norm = line.toLowerCase();
    if (seen.has(norm)) continue;
    if (highPriorityPattern.test(line)) {
      seen.add(norm);
      highLines.push(line.slice(0, 320));
    } else if (secondaryPattern.test(line)) {
      seen.add(norm);
      secLines.push(line.slice(0, 320));
    }
  }

  const selected: string[] = [];
  let totalLen = intro.length;
  for (const line of [...highLines, ...secLines]) {
    if (totalLen + line.length + 2 > maxChars) break;
    selected.push(line);
    totalLen += line.length + 1;
  }

  return selected.length > 0 ? `${intro}\n...\n${selected.join('\n')}` : cleaned.slice(0, maxChars);
}

