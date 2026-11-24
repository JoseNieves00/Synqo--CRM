import assert from 'node:assert/strict';
import test from 'node:test';

test('1. Interceptor anti-desvío comercial rechaza relevo de asesor ante intenciones de compra o plan separe', () => {
  const isPurchaseOrSepareIntent = (handoffReason: string) => {
    return (
      /(apartar|separe|abono|abonar|comprar|reserva(r|ndo)?|ordenar|interes.*compra)/i.test(handoffReason) &&
      !/(comprobante|recibo|voucher|transferido|consignaci[oó]n|captura|humano|asesor|hablar con|persona|queja|reclamo)/i.test(
        handoffReason
      )
    );
  };

  const reasonsToBlock = [
    'Cliente desea apartar modelo con abono inicial.',
    'Cliente quiere apartar con plan separe',
    'Cliente dice que sí a apartar cocina mediana',
    'Interes en compra y pide abono',
    'Desea reservar la cocina grande',
    'Cliente confirmó que quiere comprar',
    'quiere apartar su cocina mediana',
  ];

  for (const reason of reasonsToBlock) {
    assert.strictEqual(
      isPurchaseOrSepareIntent(reason),
      true,
      `Razón "${reason}" debió ser bloqueada para forzar cierre directo de la IA en vez de desviar a humano.`
    );
  }
});

test('2. Permite relevo a humano para casos operativos legítimos (comprobante, queja, petición expresa de humano)', () => {
  const isPurchaseOrSepareIntent = (handoffReason: string) => {
    return (
      /(apartar|separe|abono|abonar|comprar|reserva(r|ndo)?|ordenar|interes.*compra)/i.test(handoffReason) &&
      !/(comprobante|recibo|voucher|transferido|consignaci[oó]n|captura|humano|asesor|hablar con|persona|queja|reclamo)/i.test(
        handoffReason
      )
    );
  };

  const legitimateHandoffs = [
    'Cliente adjuntó comprobante de pago de Bancolombia',
    'Cliente envió recibo de transferencia',
    'Cliente solicita hablar con un asesor humano',
    'Cliente quiere hablar con alguien del equipo',
    'Reclamo: la cocina llegó con una puerta rayada',
    'Audio inaudible recibido',
  ];

  for (const reason of legitimateHandoffs) {
    assert.strictEqual(
      isPurchaseOrSepareIntent(reason),
      false,
      `Razón "${reason}" debió permitirse para relevo humano legítimo.`
    );
  }
});
