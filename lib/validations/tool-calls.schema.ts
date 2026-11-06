import { z } from 'zod';
import { isValidMediaUrl } from '@/lib/security/verify-webhook';

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
  duration_minutes: z.number().int().positive().optional().describe('Duración total acumulada en minutos si es un combo de servicios'),
  specialist_name: z.string().optional(),
});

export const BookNativeAppointmentToolSchema = z.object({
  start_time: z.string().describe('Horario seleccionado en formato ISO o YYYY-MM-DDTHH:mm:ss'),
  service_name: z.string().min(2),
  duration_minutes: z.number().int().positive().optional(),
  specialist_name: z.string().optional(),
  reference_info: z.string().optional().describe('Placa del vehículo, nombre del alumno, mascota o documento'),
  notes: z.string().optional(),
});

export const RescheduleNativeAppointmentToolSchema = z.object({
  new_start_time: z.string().describe('Nuevo horario seleccionado'),
  reason: z.string().optional(),
});

export const CancelNativeAppointmentToolSchema = z.object({
  reason: z.string().optional(),
});

export const SendWhatsAppImageToolSchema = z.object({
  image_url: z
    .string()
    .url()
    .refine((url) => isValidMediaUrl(url), {
      message: 'URL de imagen no autorizada o insegura (debe ser HTTPS y provenir de un servidor autorizado)',
    })
    .describe('URL pública directa de la imagen (https://...)'),
  caption: z.string().max(300).optional().describe('Breve descripción o pie de foto (máximo 1 o 2 oraciones)'),
});

export type UpdateStageToolInput = z.infer<typeof UpdateStageToolSchema>;
export type CheckAvailabilityToolInput = z.infer<typeof CheckAvailabilityToolSchema>;
export type BookAppointmentToolInput = z.infer<typeof BookAppointmentToolSchema>;
export type CheckNativeAvailabilityToolInput = z.infer<typeof CheckNativeAvailabilityToolSchema>;
export type BookNativeAppointmentToolInput = z.infer<typeof BookNativeAppointmentToolSchema>;
export type RescheduleNativeAppointmentToolInput = z.infer<typeof RescheduleNativeAppointmentToolSchema>;
export type CancelNativeAppointmentToolInput = z.infer<typeof CancelNativeAppointmentToolSchema>;
export type SendWhatsAppImageToolInput = z.infer<typeof SendWhatsAppImageToolSchema>;
