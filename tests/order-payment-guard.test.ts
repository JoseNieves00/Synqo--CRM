import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateOrderPaymentGuard,
  isCashOnDeliveryPaymentMethod,
  hasCustomerPaymentProof,
  buildNormalizedItemsSignature,
} from '../lib/orders/order-guard';

test('1. Contraentrega permite crear pedido sin comprobante previo', () => {
  assert.equal(isCashOnDeliveryPaymentMethod('Contraentrega', false), true);
  assert.equal(isCashOnDeliveryPaymentMethod('Pago contra entrega en efectivo', false), true);

  const res = evaluateOrderPaymentGuard({
    paymentMethod: 'Contraentrega',
    isSepare: false,
    hasPendingReceipt: false,
    messages: [{ sender_type: 'lead', content: 'Aquí están mis datos: Juan Pérez, Calle 10, 3001234567' }],
  });

  assert.equal(res.allowed, true);
  assert.equal(res.reason, 'cash_on_delivery');
});

test('2. Transferencia / Nequi / Plan Separe bloquea pedido fantasma si no hay comprobante', () => {
  assert.equal(isCashOnDeliveryPaymentMethod('Contraentrega', true), false);

  const transferBlocked = evaluateOrderPaymentGuard({
    paymentMethod: 'Nequi',
    isSepare: false,
    hasPendingReceipt: false,
    messages: [
      { sender_type: 'ai', content: 'Nuestra cuenta Nequi es 3001234567. Envíanos el comprobante.' },
      { sender_type: 'lead', content: 'Me llamo Alessandro, vivo en Valledupar, cel 3128618489' },
    ],
  });

  assert.equal(transferBlocked.allowed, false);
  assert.equal(transferBlocked.reason, 'missing_payment_proof');

  const separeBlocked = evaluateOrderPaymentGuard({
    paymentMethod: 'Plan Separe',
    isSepare: true,
    hasPendingReceipt: false,
    messages: [{ sender_type: 'lead', content: 'Quiero apartarla, aquí mis datos' }],
  });

  assert.equal(separeBlocked.allowed, false);
  assert.equal(separeBlocked.reason, 'missing_payment_proof');
});

test('3. Transferencia / Plan Separe permite crear pedido cuando existe comprobante o has_pending_receipt', () => {
  const byFlag = evaluateOrderPaymentGuard({
    paymentMethod: 'Bancolombia',
    isSepare: true,
    hasPendingReceipt: true,
    messages: [],
  });
  assert.equal(byFlag.allowed, true);
  assert.equal(byFlag.reason, 'payment_proof_present');

  const byImageAfterAccounts = hasCustomerPaymentProof(false, [
    { sender_type: 'ai', content: 'Puedes transferir a Bancolombia Ahorros 1234567890.' },
    { sender_type: 'lead', content: '[Imagen: https://example.com/voucher.jpg] Listo, ahí te envié el comprobante' },
  ]);
  assert.equal(byImageAfterAccounts, true);

  const res = evaluateOrderPaymentGuard({
    paymentMethod: 'Transferencia Bancolombia',
    isSepare: false,
    hasPendingReceipt: false,
    messages: [
      { sender_type: 'ai', content: 'Puedes transferir a Bancolombia Ahorros 1234567890.' },
      { sender_type: 'lead', content: '[Imagen: https://example.com/voucher.jpg]' },
    ],
  });
  assert.equal(res.allowed, true);
  assert.equal(res.reason, 'payment_proof_present');
});

test('4. Firma de ítems normalizada detecta pedidos idénticos sin importar orden o mayúsculas', () => {
  const sigA = buildNormalizedItemsSignature([
    { product_name: 'Casita de los sueños', quantity: 1 },
    { product_name: 'Cocina Chef', quantity: 2 },
  ]);
  const sigB = buildNormalizedItemsSignature([
    { product_name: '  cocina chef ', quantity: 2 },
    { product_name: 'CASITA DE LOS SUEÑOS', quantity: 1 },
  ]);
  assert.equal(sigA, sigB);
});
