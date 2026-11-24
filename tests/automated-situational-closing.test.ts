import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesPlaybook, composePlaybookAndBusinessPrompt } from '../lib/ai/sales-playbook';
import { CreateOrderToolSchema } from '../lib/validations/tool-calls.schema';

test('1. Playbook de ventas automáticas en situaciones específicas se mantiene compacto y dentro de presupuesto de tokens', () => {
  const playbook = buildSalesPlaybook({ hasCalendar: false });
  const estimatedTokens = Math.ceil(playbook.length / 4);

  assert.ok(
    estimatedTokens <= 2500,
    `El playbook con situaciones específicas debe medir <= 2500 tokens estimados (actual: ${estimatedTokens})`
  );

  // Verificación de protocolos situacionales
  assert.ok(playbook.includes('COMPATIBILIDAD MULTI-MODELO'), 'Debe incluir compatibilidad para productos, servicios e híbridos');
  assert.ok(playbook.includes('TÉRMINOS NATURALES Y COTIDIANOS'), 'Debe exigir términos naturales cotidianos');
  assert.ok(playbook.includes('Te dejo apartado el tuyo'), 'Debe incluir frase humana de apartado de producto');
  assert.ok(playbook.includes('Te guardo el cupo'), 'Debe incluir frase humana de reserva de servicio');
  assert.ok(playbook.includes('REGLA DE VARIANTES ESTRICTA'), 'Debe incluir regla estricta contra invención de variantes');
  assert.ok(playbook.includes('MONOSÍLABOS O ANUNCIO'), 'Debe incluir protocolo para monosílabos y pauta');
  assert.ok(playbook.includes('POSTERGACIÓN O DUDA'), 'Debe incluir protocolo para "lo voy a pensar"');
  assert.ok(playbook.includes('SALIDA AMABLE O CORTE'), 'Debe incluir protocolo para "ah ok gracias"');
  assert.ok(playbook.includes('PREGUNTA DE UBICACIÓN O DESCONFIANZA'), 'Debe incluir protocolo de ubicación y contraentrega');
  assert.ok(playbook.includes('PARÁLISIS POR COMPARACIÓN'), 'Debe incluir regla de Best-Seller');
  assert.ok(playbook.includes('CIERRE Y LIQUIDACIÓN DE ORDEN'), 'Debe incluir recolección de 3 datos y create_order');
});

test('2. CreateOrderToolSchema valida correctamente pedidos tradicionales y órdenes con Plan Separe', () => {
  // Orden tradicional
  const traditionalOrder = CreateOrderToolSchema.parse({
    items: [{ product_name: 'Torre de Aprendizaje', quantity: 1, unit_price: 320000 }],
    total: 320000,
    nombre: 'Carolina Gómez',
    telefono: '3001234567',
    ciudad: 'Medellín',
    direccion: 'Calle 10 # 40-20',
    metodo_pago: 'Bancolombia',
  });

  assert.equal(traditionalOrder.total, 320000);
  assert.equal(traditionalOrder.is_separe, false);
  assert.equal(traditionalOrder.deposit_paid, 0);

  // Orden con Plan Separe
  const separeOrder = CreateOrderToolSchema.parse({
    items: [{ product_name: 'Cama Montessori', quantity: 1, unit_price: 850000 }],
    total: 850000,
    nombre: 'Juan Pérez',
    telefono: '3159876543',
    ciudad: 'Bogotá',
    direccion: 'Carrera 15 # 85-30',
    metodo_pago: 'Plan Separe',
    is_separe: true,
    deposit_paid: 200000,
    balance_due: 650000,
  });

  assert.equal(separeOrder.total, 850000);
  assert.equal(separeOrder.is_separe, true);
  assert.equal(separeOrder.deposit_paid, 200000);
  assert.equal(separeOrder.balance_due, 650000);
});

test('3. composePlaybookAndBusinessPrompt integra políticas de pago, envío y situaciones de cierre sin duplicación', () => {
  const compiled = composePlaybookAndBusinessPrompt({
    businessPrompt: 'Filippo Kids es una fábrica de mobiliario infantil en madera.',
    hasCalendar: false,
    paymentAccounts: [
      {
        id: '1',
        title: 'Bancolombia Ahorros',
        accountNumber: '123-456789-01',
        holderName: 'Filippo SAS',
        isActive: true,
      },
    ],
    shippingSettings: {
      enabled: true,
      baseRate: 25000,
      allowCashOnDelivery: true,
      freeShippingMinAmount: 500000,
      carrierNames: 'Coordinadora, Envía',
      generalPolicy: 'Despachos de lunes a viernes.',
      cityRates: [
        {
          id: 'c1',
          city: 'Bogotá',
          cost: 15000,
          isCashOnDelivery: true,
          deliveryTime: '2 días hábiles',
        },
      ],
    },
  });

  assert.ok(compiled.includes('cuentas_de_pago_oficiales'), 'Debe incluir cuentas de pago oficiales');
  assert.ok(compiled.includes('politicas_y_tarifas_de_envio'), 'Debe incluir políticas de envío y contraentrega');
  assert.ok(compiled.includes('MONOSÍLABOS O ANUNCIO'), 'Debe contener los protocolos situacionales');
  assert.ok(compiled.includes('Filippo Kids es una fábrica'), 'Debe contener las instrucciones de la empresa');
});
