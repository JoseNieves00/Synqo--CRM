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

export const CheckNativeAvailabilityToolSchema = z.object({
  date: z.string().describe('Fecha en formato YYYY-MM-DD'),
  service_name: z.string().optional(),
  specialist_name: z.string().optional(),
});

export const BookNativeAppointmentToolSchema = z.object({
  start_time: z.string().describe('Horario seleccionado'),
  service_name: z.string().min(2),
  duration_minutes: z.number().int().positive().optional(),
  specialist_name: z.string().optional(),
  notes: z.string().optional(),
});

export const RescheduleNativeAppointmentToolSchema = z.object({
  new_start_time: z.string().describe('Nuevo horario seleccionado'),
  reason: z.string().optional(),
});

export const CancelNativeAppointmentToolSchema = z.object({
  reason: z.string().optional(),
});

export type UpdateStageToolInput = z.infer<typeof UpdateStageToolSchema>;
export type CheckAvailabilityToolInput = z.infer<typeof CheckAvailabilityToolSchema>;
export type BookAppointmentToolInput = z.infer<typeof BookAppointmentToolSchema>;
export type CheckNativeAvailabilityToolInput = z.infer<typeof CheckNativeAvailabilityToolSchema>;
export type BookNativeAppointmentToolInput = z.infer<typeof BookNativeAppointmentToolSchema>;
export type RescheduleNativeAppointmentToolInput = z.infer<typeof RescheduleNativeAppointmentToolSchema>;
export type CancelNativeAppointmentToolInput = z.infer<typeof CancelNativeAppointmentToolSchema>;
