import { z } from 'zod';

export const WhatsAppMessageSchema = z.object({
  from: z.string().min(8),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({
    body: z.string(),
  }).optional(),
});

export const WhatsAppWebhookValueSchema = z.object({
  messaging_product: z.string(),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(
    z.object({
      profile: z.object({
        name: z.string(),
      }),
      wa_id: z.string(),
    })
  ).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z.array(z.record(z.unknown())).optional(),
});

export const WhatsAppWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: WhatsAppWebhookValueSchema,
          field: z.string(),
        })
      ),
    })
  ),
});

