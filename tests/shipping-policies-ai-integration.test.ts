import assert from 'node:assert/strict';
import test from 'node:test';
import { formatShippingPolicyPrompt, type ShippingSettings } from '../lib/types/shipping';
import { composePlaybookAndBusinessPrompt } from '../lib/ai/sales-playbook';
import { extractOrganizationCapabilities } from '../lib/ai/copilot-engine';

test('1. formatShippingPolicyPrompt genera bloque estructurado con tarifas específicas, base y contraentrega', () => {
  const settings: ShippingSettings = {
    enabled: true,
    baseRate: 25000,
    allowCashOnDelivery: true,
    freeShippingMinAmount: 400000,
    carrierNames: 'Coordinadora, Interrapidísimo',
    generalPolicy: 'Despachos de lunes a viernes en horario hábil.',
    cityRates: [
      {
        id: 'c1',
        city: 'Bogotá',
        department: 'Cundinamarca',
        cost: 12000,
        isCashOnDelivery: true,
        deliveryTime: '24 a 48 horas',
        notes: 'Aplica para perímetro urbano',
      },
      {
        id: 'c2',
        city: 'Medellín',
        department: 'Antioquia',
        cost: 15000,
        isCashOnDelivery: true,
        deliveryTime: '2 días hábiles',
      },
      {
        id: 'c3',
        city: 'Leticia',
        department: 'Amazonas',
        cost: 45000,
        isCashOnDelivery: false,
        deliveryTime: '5 a 8 días hábiles',
        notes: 'Solo despacho con pago anticipado',
      },
    ],
  };

  const promptBlock = formatShippingPolicyPrompt(settings);

  assert.ok(promptBlock.includes('<politicas_y_tarifas_de_envio>'));
  assert.ok(promptBlock.includes('Transportadoras aliadas: Coordinadora, Interrapidísimo'));
  assert.ok(promptBlock.includes('Tarifa base de envío nacional (destinos generales): $25.000 COP'));
  assert.ok(promptBlock.includes('Envío GRATIS: Aplica para compras iguales o superiores a $400.000 COP'));
  assert.ok(promptBlock.includes('Pago contraentrega: Habilitado en ciudades con cobertura'));
  assert.ok(promptBlock.includes('Bogotá (Cundinamarca): $12.000 COP con opción de contraentrega (24 a 48 horas) — Aplica para perímetro urbano'));
  assert.ok(promptBlock.includes('Leticia (Amazonas): $45.000 COP pago previo (5 a 8 días hábiles) — Solo despacho con pago anticipado'));
  assert.ok(promptBlock.includes('REGLA ESTRICTA DE CIUDAD: Jamás asumas que el cliente se encuentra en una ciudad específica'));
  assert.ok(promptBlock.includes('Despachos de lunes a viernes en horario hábil.'));
  assert.ok(promptBlock.includes('</politicas_y_tarifas_de_envio>'));
});

test('2. composePlaybookAndBusinessPrompt inyecta políticas de envío bajo instrucciones de negocio con prioridad MAXIMA', () => {
  const shippingSettings: ShippingSettings = {
    enabled: true,
    baseRate: 20000,
    allowCashOnDelivery: true,
    freeShippingMinAmount: null,
    carrierNames: 'Envía',
    cityRates: [
      { id: '1', city: 'Cali', cost: 14000, isCashOnDelivery: true },
    ],
  };

  const compiled = composePlaybookAndBusinessPrompt({
    businessPrompt: 'Somos fábrica de ropa infantil en Bucaramanga.',
    shippingSettings,
  });

  assert.ok(compiled.includes('<instrucciones_del_negocio prioridad="MAXIMA">'));
  assert.ok(compiled.includes('<politicas_y_tarifas_de_envio>'));
  assert.ok(compiled.includes('Cali: $14.000 COP con opción de contraentrega'));
  assert.ok(compiled.includes('Tarifa base de envío nacional (destinos generales): $20.000 COP'));
  assert.ok(compiled.includes('COTIZACIÓN DE ENVÍOS Y DESTINOS'));
});

test('3. Cuando allowCashOnDelivery es falso, la política y el copiloto prohíben contraentrega', () => {
  const shippingSettingsNoCOD: ShippingSettings = {
    enabled: true,
    baseRate: 18000,
    allowCashOnDelivery: false,
    freeShippingMinAmount: null,
    cityRates: [],
  };

  const promptBlock = formatShippingPolicyPrompt(shippingSettingsNoCOD);
  assert.ok(promptBlock.includes('Pago contraentrega: No disponible'));

  const org = {
    system_prompt: 'Tienda virtual de tecnología. Envíos nacionales.',
    appointment_settings: {
      shipping_settings: shippingSettingsNoCOD,
    },
  };

  const caps = extractOrganizationCapabilities(org);
  assert.strictEqual(caps.canOfferContraentrega, false, 'Copiloto debe detectar que contraentrega está deshabilitado en shipping_settings');
});

test('4. Cuando shipping_settings está deshabilitado o nulo, no se inyecta el bloque de fletes', () => {
  const compiledDisabled = composePlaybookAndBusinessPrompt({
    businessPrompt: 'Consultoría empresarial online.',
    shippingSettings: {
      enabled: false,
      baseRate: 0,
      allowCashOnDelivery: false,
      cityRates: [],
    },
  });

  assert.ok(!compiledDisabled.includes('<politicas_y_tarifas_de_envio>'));

  const compiledNull = composePlaybookAndBusinessPrompt({
    businessPrompt: 'Servicios de diseño gráfico.',
    shippingSettings: null,
  });

  assert.ok(!compiledNull.includes('<politicas_y_tarifas_de_envio>'));
});
