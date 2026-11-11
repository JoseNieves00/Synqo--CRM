import { PipelineStage } from '@/lib/supabase/types';

/**
 * Determina si el contacto se encuentra dentro de la ventana de interacción de 24 horas de Meta.
 * Si (ahora - last_interaction_at < 24 horas), se permite el envío de texto libre.
 * Si pasaron más de 24 horas, Meta exige utilizar una plantilla oficial pre-aprobada.
 */
export function isWithin24HourWindow(lastInteractionAt: string | Date | null | undefined): boolean {
  if (!lastInteractionAt) return false;
  const interactionTime = new Date(lastInteractionAt).getTime();
  if (isNaN(interactionTime)) return false;

  const currentTime = Date.now();
  const diffHours = (currentTime - interactionTime) / (1000 * 60 * 60);

  // Permitir ventana de 24 horas con tolerancia para ligeros desfases de reloj (clock skew de hasta 1 hora a futuro)
  return diffHours < 24 && diffHours >= -1.0;
}

/**
 * Ancla real de la ventana de 24h de Meta: el ÚLTIMO MENSAJE DEL CLIENTE.
 * `last_interaction_at` NO sirve porque también se actualiza con mensajes salientes
 * (IA, asesor, follow-ups), lo que hacía creer que la ventana seguía abierta.
 */
export function getLeadWindowAnchor(contact: {
  last_lead_message_at?: string | null;
  custom_fields?: any;
} | null | undefined): string | null {
  if (!contact) return null;
  return contact.last_lead_message_at || contact.custom_fields?.last_lead_message_at || null;
}

/**
 * Indica si la ventana de servicio de 24h de Meta está abierta para el contacto
 * (solo cuenta mensajes ENTRANTES del cliente). Sin mensaje del cliente → cerrada.
 */
export function isLeadWindowOpen(contact: {
  last_lead_message_at?: string | null;
  custom_fields?: any;
} | null | undefined): boolean {
  return isWithin24HourWindow(getLeadWindowAnchor(contact));
}

/**
 * Calcula las horas restantes de la ventana de 24 horas de Meta.
 */
export function getRemainingHoursInWindow(lastInteractionAt: string | Date | null | undefined): number {
  if (!lastInteractionAt) return 0;
  const interactionTime = new Date(lastInteractionAt).getTime();
  if (isNaN(interactionTime)) return 0;

  const diffHours = (Date.now() - interactionTime) / (1000 * 60 * 60);
  const remaining = 24 - Math.max(0, diffHours);
  return remaining > 0 ? Math.min(24, Math.floor(remaining * 10) / 10) : 0;
}

export const PIPELINE_STAGES: { id: PipelineStage; label: string; color: string }[] = [
  { id: 'nuevo', label: 'Nuevo Lead', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 'calificado', label: 'Calificado', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'cita_agendada', label: 'Cita Agendada', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'ganado', label: 'Ganado / Cerrado', color: 'bg-green-100 text-green-800 border-green-300' },
  { id: 'perdido', label: 'Perdido / Descarte', color: 'bg-gray-100 text-gray-800 border-gray-300' },
];

