/**
 * Motor de Festivos Oficiales y Días Feriados
 * 
 * Calcula de forma determinista y sin dependencias externas los días festivos
 * para Colombia (Ley Emiliani y feriados de Pascua) y países de habla hispana.
 */

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Calcula la fecha del Domingo de Pascua para un año dado utilizando el algoritmo de Butcher/Meeus.
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Si una fecha no cae en lunes, la traslada al lunes siguiente (Ley Emiliani).
 */
function moveToNextMonday(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 1) return date; // Ya es lunes
  const daysToAdd = day === 0 ? 1 : 8 - day;
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + daysToAdd);
  return result;
}

function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysUTC(date: Date, days: number): Date {
  const res = new Date(date.getTime());
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}

/**
 * Retorna todos los días festivos de Colombia para un año específico.
 */
export function getColombianHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // 1. Feriados Fijos (no se trasladan al lunes)
  holidays.push({ date: `${year}-01-01`, name: 'Año Nuevo' });
  holidays.push({ date: `${year}-05-01`, name: 'Día del Trabajo' });
  holidays.push({ date: `${year}-07-20`, name: 'Día de la Independencia' });
  holidays.push({ date: `${year}-08-07`, name: 'Batalla de Boyacá' });
  holidays.push({ date: `${year}-12-08`, name: 'Inmaculada Concepción' });
  holidays.push({ date: `${year}-12-25`, name: 'Navidad' });

  // 2. Feriados Fijos trasladables al siguiente lunes (Ley 51 de 1983 - Ley Emiliani)
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 0, 6)))),
    name: 'Reyes Magos',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 2, 19)))),
    name: 'Día de San José',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 5, 29)))),
    name: 'San Pedro y San Pablo',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 7, 15)))),
    name: 'Asunción de la Virgen',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 9, 12)))),
    name: 'Día de la Raza',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 10, 1)))),
    name: 'Todos los Santos',
  });
  holidays.push({
    date: formatDateUTC(moveToNextMonday(new Date(Date.UTC(year, 10, 11)))),
    name: 'Independencia de Cartagena',
  });

  // 3. Feriados Móviles basados en el Domingo de Pascua
  const easter = getEasterSunday(year);

  // Jueves Santo (Pascua - 3 días)
  holidays.push({
    date: formatDateUTC(addDaysUTC(easter, -3)),
    name: 'Jueves Santo',
  });

  // Viernes Santo (Pascua - 2 días)
  holidays.push({
    date: formatDateUTC(addDaysUTC(easter, -2)),
    name: 'Viernes Santo',
  });

  // Ascensión del Señor (Pascua + 40 días, trasladado al lunes: Pascua + 43 días)
  holidays.push({
    date: formatDateUTC(moveToNextMonday(addDaysUTC(easter, 40))),
    name: 'Ascensión del Señor',
  });

  // Corpus Christi (Pascua + 60 días, trasladado al lunes: Pascua + 64 días aprox)
  holidays.push({
    date: formatDateUTC(moveToNextMonday(addDaysUTC(easter, 60))),
    name: 'Corpus Christi',
  });

  // Sagrado Corazón de Jesús (Pascua + 68 días, trasladado al lunes)
  holidays.push({
    date: formatDateUTC(moveToNextMonday(addDaysUTC(easter, 68))),
    name: 'Sagrado Corazón de Jesús',
  });

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Verifica si una fecha específica (formato YYYY-MM-DD) es día festivo.
 */
export function isHoliday(dateStr: string, country: string = 'CO'): { isHoliday: boolean; name?: string } {
  try {
    const [yearStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) return { isHoliday: false };

    const holidays = getColombianHolidays(year);
    const match = holidays.find((h) => h.date === dateStr);

    if (match) {
      return { isHoliday: true, name: match.name };
    }
    return { isHoliday: false };
  } catch {
    return { isHoliday: false };
  }
}

