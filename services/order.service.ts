import { supabaseAdmin } from '@/lib/supabase/admin';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/crm/constants';

export { ORDER_STATUSES, type OrderStatus };

export interface OrderItemInput {
  product_name: string;
  quantity: number;
  unit_price?: number;
}

/** Atribución de campañas: un pedido cuenta como conversión si llega hasta 7 días después del envío. */
const CAMPAIGN_ATTRIBUTION_DAYS = 7;

export class OrderService {
  /**
   * Registra un pedido como entidad propia y, si aplica, lo atribuye a la campaña IA
   * que contactó al cliente en los últimos días. Best effort para el flujo de la IA.
   */
  static async recordOrder(params: {
    organizationId: string;
    contactId: string;
    items: OrderItemInput[];
    total: number;
    status?: OrderStatus;
    paymentMethod?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
    source: 'ai' | 'human';
    createdBy?: string | null;
  }): Promise<{ id: string; campaignId: string | null } | null> {
    try {
      const sinceIso = new Date(Date.now() - CAMPAIGN_ATTRIBUTION_DAYS * 24 * 3600 * 1000).toISOString();
      const { data: recipient } = await (supabaseAdmin.from('campaign_recipients') as any)
        .select('id, campaign_id')
        .eq('contact_id', params.contactId)
        .eq('status', 'sent')
        .is('converted_at', null)
        .gte('sent_at', sinceIso)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: order, error } = await (supabaseAdmin.from('orders') as any)
        .insert({
          organization_id: params.organizationId,
          contact_id: params.contactId,
          items: params.items,
          total: Math.max(0, Number(params.total) || 0),
          status: params.status || 'confirmed',
          payment_method: params.paymentMethod || null,
          customer_name: params.customerName || null,
          customer_phone: params.customerPhone || null,
          address: params.address || null,
          city: params.city || null,
          notes: params.notes || null,
          source: params.source,
          campaign_id: recipient?.campaign_id || null,
          created_by: params.createdBy || null,
        })
        .select('id')
        .single();

      if (error || !order) {
        console.warn('[ORDER SERVICE] Error registrando pedido', error?.message);
        return null;
      }

      if (recipient?.id) {
        await (supabaseAdmin.from('campaign_recipients') as any)
          .update({ converted_at: new Date().toISOString() })
          .eq('id', recipient.id);
      }

      return { id: order.id, campaignId: recipient?.campaign_id || null };
    } catch (err: any) {
      console.warn('[ORDER SERVICE] recordOrder falló', err?.message || err);
      return null;
    }
  }
}
