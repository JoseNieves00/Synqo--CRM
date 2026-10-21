export interface BillingStatusResult {
  status: 'al_dia' | 'pendiente' | 'gracia' | 'mora_preventiva' | 'baja_definitiva';
  label: string;
  color: 'emerald' | 'blue' | 'amber' | 'rose' | 'purple';
  daysPastDue: number;
  isSuspended: boolean;
}

/**
 * Calcula el estado de cobranza en tiempo real según las Condiciones del Servicio de Synqo:
 * - Día 1 al 5: Periodo ordinario de pago ('pendiente')
 * - Día 6 al 9: Periodo de gracia ('gracia')
 * - Día 10+: Suspensión preventiva por mora ('mora_preventiva')
 * - Día 30+: Baja definitiva sugerida ('baja_definitiva')
 * - Opción A: Días de cortesía en mes de ingreso ('al_dia')
 */
export function calculateBillingStatus(org: {
  is_active?: boolean;
  subscription_status?: string;
  paid_until_month?: string | null;
  past_due_since?: string | null;
  created_at?: string;
}): BillingStatusResult {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;
  const currentDay = now.getDate();

  const isExplicitlyInactive = org.is_active === false;
  const isCanceled = org.subscription_status === 'canceled';

  // 1. Si está cancelada / dada de baja
  if (isCanceled) {
    let daysPast = 30;
    if (org.past_due_since) {
      daysPast = Math.max(30, Math.floor((now.getTime() - new Date(org.past_due_since).getTime()) / (1000 * 60 * 60 * 24)));
    }
    return {
      status: 'baja_definitiva',
      label: 'Baja Definitiva (30d+)',
      color: 'purple',
      daysPastDue: daysPast,
      isSuspended: true,
    };
  }

  // 2. Si fue suspendida manualmente o está marcada como past_due
  if (isExplicitlyInactive || org.subscription_status === 'past_due') {
    let daysPast = 10;
    if (org.past_due_since) {
      daysPast = Math.max(1, Math.floor((now.getTime() - new Date(org.past_due_since).getTime()) / (1000 * 60 * 60 * 24)));
    }
    if (daysPast >= 30) {
      return {
        status: 'baja_definitiva',
        label: `Baja Sugerida (${daysPast}d mora)`,
        color: 'purple',
        daysPastDue: daysPast,
        isSuspended: true,
      };
    }
    return {
      status: 'mora_preventiva',
      label: `Suspendida (${daysPast}d mora)`,
      color: 'rose',
      daysPastDue: daysPast,
      isSuspended: true,
    };
  }

  // 3. Evaluar según paid_until_month (Opción A: si es nueva o ya cubrió el mes)
  const paidMonth = org.paid_until_month || currentMonthStr;

  if (paidMonth >= currentMonthStr) {
    return {
      status: 'al_dia',
      label: `Al día (${paidMonth})`,
      color: 'emerald',
      daysPastDue: 0,
      isSuspended: false,
    };
  }

  // Si paid_until_month < currentMonthStr, no se ha registrado pago para el mes actual
  if (currentDay <= 5) {
    return {
      status: 'pendiente',
      label: 'Cobro Pendiente (Día 1-5)',
      color: 'blue',
      daysPastDue: 0,
      isSuspended: false,
    };
  }

  if (currentDay < 10) {
    const daysGrace = currentDay - 5;
    return {
      status: 'gracia',
      label: `Período Gracia (${daysGrace}d)`,
      color: 'amber',
      daysPastDue: daysGrace,
      isSuspended: false,
    };
  }

  // Si llegó al día 10 sin pagar
  const daysMora = currentDay - 9;
  return {
    status: 'mora_preventiva',
    label: `Mora Preventiva (${daysMora}d)`,
    color: 'rose',
    daysPastDue: daysMora,
    isSuspended: false,
  };
}
