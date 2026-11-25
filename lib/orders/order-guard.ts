import { isPaymentReceiptHint, parseImageMessageContent } from '../media/format';

export interface OrderGuardMessage {
  sender_type?: string;
  content?: string | null;
}

export interface EvaluateOrderPaymentGuardInput {
  paymentMethod?: string | null;
  isSepare?: boolean | null;
  hasPendingReceipt?: boolean | null;
  messages?: OrderGuardMessage[];
}

export interface OrderPaymentGuardResult {
  allowed: boolean;
  reason: 'cash_on_delivery' | 'payment_proof_present' | 'missing_payment_proof';
  isCashOnDelivery: boolean;
  hasPaymentProof: boolean;
}

const CASH_ON_DELIVERY_PATTERN =
  /(contra\s*entrega|pago\s+al\s+recibir|efectivo\s+al\s+recibir|cash[_\s]*on[_\s]*delivery|\bcod\b)/i;

const PAYMENT_CONTEXT_PATTERN =
  /(nequi|bancolombia|daviplata|cuenta|llave|transfiya|transferencia|comprobante|abono|plan\s+separe|link\s+de\s+pago|pse)/i;

/**
 * Determina si el método de pago acordado corresponde a pago contraentrega (no requiere abono previo).
 * Si el pedido es Plan Separe (`isSepare: true`), siempre requiere comprobante de abono inicial.
 */
export function isCashOnDeliveryPaymentMethod(
  paymentMethod?: string | null,
  isSepare?: boolean | null
): boolean {
  if (isSepare) return false;
  if (!paymentMethod) return false;
  return CASH_ON_DELIVERY_PATTERN.test(paymentMethod);
}

/**
 * Verifica si el cliente ya envió un comprobante o evidencia de pago en el chat:
 * - Flag `custom_fields.has_pending_receipt === true`, o
 * - Un mensaje entrante del lead con imagen/adjunto que sea pista de comprobante,
 *   o una imagen enviada después de que la empresa compartió datos de pago/abono.
 */
export function hasCustomerPaymentProof(
  hasPendingReceipt?: boolean | null,
  messages: OrderGuardMessage[] = []
): boolean {
  if (hasPendingReceipt === true) return true;

  let paymentInfoShared = false;

  for (const msg of messages) {
    const content = String(msg?.content || '');
    if (!content) continue;

    if (msg.sender_type === 'ai' || msg.sender_type === 'agent_manual') {
      if (PAYMENT_CONTEXT_PATTERN.test(content)) {
        paymentInfoShared = true;
      }
      continue;
    }

    if (msg.sender_type !== 'lead') continue;

    const parsedImg = parseImageMessageContent(content);
    const hasAttachmentTag =
      parsedImg.isImage ||
      /\[(imagen|foto|archivo|documento|comprobante|media)\s*:/i.test(content);

    if (hasAttachmentTag) {
      if (isPaymentReceiptHint(content) || isPaymentReceiptHint(parsedImg.caption) || paymentInfoShared) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Regla anti-pedidos fantasma:
 * - Contraentrega: permitido crear el pedido con los datos de envío.
 * - Transferencia, billeteras digitales, link de pago o Plan Separe: exige comprobante previo.
 */
export function evaluateOrderPaymentGuard(
  input: EvaluateOrderPaymentGuardInput
): OrderPaymentGuardResult {
  const isCashOnDelivery = isCashOnDeliveryPaymentMethod(input.paymentMethod, input.isSepare);
  if (isCashOnDelivery) {
    return {
      allowed: true,
      reason: 'cash_on_delivery',
      isCashOnDelivery: true,
      hasPaymentProof: false,
    };
  }

  const hasPaymentProof = hasCustomerPaymentProof(input.hasPendingReceipt, input.messages || []);
  if (hasPaymentProof) {
    return {
      allowed: true,
      reason: 'payment_proof_present',
      isCashOnDelivery: false,
      hasPaymentProof: true,
    };
  }

  return {
    allowed: false,
    reason: 'missing_payment_proof',
    isCashOnDelivery: false,
    hasPaymentProof: false,
  };
}

/**
 * Normaliza la firma de ítems de un pedido para detectar duplicados en ventanas cortas.
 */
export function buildNormalizedItemsSignature(
  items: Array<{ product_name?: string; quantity?: number }> = []
): string {
  return items
    .map((i) => `${Math.max(1, Math.round(Number(i.quantity) || 1))}x:${String(i.product_name || '').trim().toLowerCase()}`)
    .sort()
    .join('|');
}

