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

export const SendProductCardToolSchema = z.object({
  product_name_or_id: z
    .string()
    .min(1)
    .max(160)
    .describe('Nombre, palabra clave o ID exacto del producto en la galería del negocio'),
  details: z
    .string()
    .max(400)
    .optional()
    .describe('Medidas, características o tiempo/envío leídos textualmente del prompt del negocio'),
});

export const UpdateLeadProfileToolSchema = z.object({
  temperature: z
    .enum(['hot', 'qualified_doubt', 'warm', 'cold'])
    .describe('hot (calificado listo para cerrar), qualified_doubt (calificado con dudas puntuales), warm (tibio evaluando), cold (frío / no interesado)'),
  product_of_interest: z.string().max(160).optional(),
  objection: z.string().max(240).optional(),
  lost_reason: z.string().max(200).optional(),
});

export const ScheduleFollowUpToolSchema = z
  .object({
    date: z
      .string()
      .min(4)
      .max(60)
      .optional()
      .describe('Fecha solicitada o estimada en formato YYYY-MM-DD o ISO 8601'),
    time_local: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .optional()
      .describe('Hora local aproximada en formato 24h HH:mm (ej. 15:30)'),
    delay_hours: z
      .number()
      .min(0.5)
      .max(720)
      .optional()
      .describe('Horas a esperar cuando el contacto aplica hoy o en un lapso relativo (ej. 3 para más tarde hoy, 24 para mañana)'),
    reason: z.string().max(240).optional().describe('Motivo, duda o producto para retomar en ese contacto'),
    suggested_message: z
      .string()
      .max(500)
      .optional()
      .describe('Borrador corto y natural del mensaje que la IA enviará autónomamente al cumplirse el recordatorio'),
  })
  .refine((data) => Boolean(data.date || data.delay_hours), {
    message: 'Debes indicar al menos date o delay_hours',
  });

export const CreateOrderToolSchema = z.object({
  items: z
    .array(
      z.object({
        product_name: z.string().min(1).max(160),
        quantity: z.number().int().positive().default(1),
        unit_price: z.number().nonnegative().optional(),
      })
    )
    .min(1),
  total: z.number().nonnegative(),
  nombre: z.string().min(2).max(120),
  telefono: z.string().min(6).max(40),
  direccion: z.string().min(3).max(250),
  ciudad: z.string().min(2).max(100),
  metodo_pago: z.string().max(80).optional(),
  notas: z.string().max(400).optional(),
});

export type UpdateStageToolInput = z.infer<typeof UpdateStageToolSchema>;
export type CheckAvailabilityToolInput = z.infer<typeof CheckAvailabilityToolSchema>;
export type BookAppointmentToolInput = z.infer<typeof BookAppointmentToolSchema>;
export type CheckNativeAvailabilityToolInput = z.infer<typeof CheckNativeAvailabilityToolSchema>;
export type BookNativeAppointmentToolInput = z.infer<typeof BookNativeAppointmentToolSchema>;
export type RescheduleNativeAppointmentToolInput = z.infer<typeof RescheduleNativeAppointmentToolSchema>;
export type CancelNativeAppointmentToolInput = z.infer<typeof CancelNativeAppointmentToolSchema>;
export type SendWhatsAppImageToolInput = z.infer<typeof SendWhatsAppImageToolSchema>;
export type SendProductCardToolInput = z.infer<typeof SendProductCardToolSchema>;
export type UpdateLeadProfileToolInput = z.infer<typeof UpdateLeadProfileToolSchema>;
export type ScheduleFollowUpToolInput = z.infer<typeof ScheduleFollowUpToolSchema>;
export type CreateOrderToolInput = z.infer<typeof CreateOrderToolSchema>;
