import { z } from 'zod';

export const UpdateStageToolSchema = z.object({
  new_stage: z.enum(['nuevo', 'calificado', 'cita_agendada', 'ganado', 'perdido']),
  reason: z.string().max(200).optional(),
});

export const CheckAvailabilityToolSchema = z.object({
  date_from: z.string().describe('Fecha inicial (YYYY-MM-DD o formato ISO)'),
  date_to: z.string().describe('Fecha final (YYYY-MM-DD o formato ISO)'),
});

export const BookAppointmentToolSchema = z.object({
  start_iso_time: z.string().describe('Horario seleccionado en formato ISO 8601 con zona horaria'),
  lead_name: z.string().min(2).max(100),
  lead_email: z.string().email().optional(),
});

export type UpdateStageToolInput = z.infer<typeof UpdateStageToolSchema>;
export type CheckAvailabilityToolInput = z.infer<typeof CheckAvailabilityToolSchema>;
export type BookAppointmentToolInput = z.infer<typeof BookAppointmentToolSchema>;

