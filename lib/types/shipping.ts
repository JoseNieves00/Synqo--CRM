export interface ShippingCityRate {
  id: string;
  city: string; // Nombre de la ciudad o municipio (ej: Barranquilla, Soledad, Bogotá, etc.)
  department?: string; // Departamento o estado (ej: Atlántico, Cundinamarca)
  cost: number; // Costo del envío en moneda local (ej: 90000, 15000, 0 para gratis)
  isCashOnDelivery: boolean; // Si aplica pago contraentrega en esta ciudad
  deliveryTime?: string; // Tiempo estimado de entrega (ej: 1 a 2 días hábiles)
  notes?: string; // Observaciones adicionales (ej: Aplica recargo para zonas rurales)
}

export interface ShippingSettings {
  enabled: boolean;
  baseRate: number; // Tarifa plana nacional para ciudades no especificadas (ej: 35000)
  allowCashOnDelivery: boolean; // Si la empresa maneja pago contraentrega de manera general
  codFreeShipping?: boolean; // Si el pago contraentrega incluye envío gratis o suma el flete al total
  freeShippingMinAmount?: number | null; // Monto mínimo para envío gratis (opcional, ej: 500000)
  carrierNames?: string; // Transportadoras aliadas (ej: Coordinadora, Envia, Interrapidisimo)
  generalPolicy?: string; // Política o salvedades generales de despacho
  cityRates: ShippingCityRate[]; // Tarifas específicas por ciudad o municipio
}

export interface CustomerShippingData {
  recipient_name?: string; // Nombre completo de quien recibe
  id_number?: string; // Cédula de ciudadanía, NIT o DNI
  phone?: string; // Celular / WhatsApp de contacto
  destination_city?: string; // Ciudad o municipio de destino (+ departamento)
  address?: string; // Dirección completa (calle, carrera, barrio, apto, torre)
  notes?: string; // Indicaciones de entrega (ej: casa esquinera reja blanca)
}

export function createDefaultShippingSettings(): ShippingSettings {
  return {
    enabled: true,
    baseRate: 35000,
    allowCashOnDelivery: true,
    codFreeShipping: false,
    freeShippingMinAmount: null,
    carrierNames: 'Coordinadora, Envía, Interrapidísimo',
    generalPolicy: 'Despachos de lunes a viernes. El costo puede variar si el destino tiene trayecto especial de reexpedición.',
    cityRates: [],
  };
}

/**
 * Formatea los datos de despacho al formato estándar de guías para copiar en 1 clic.
 */
export function formatShippingGuideText(data: CustomerShippingData): string {
  const parts: string[] = [];
  parts.push(`📦 *DATOS PARA GUÍA DE ENVÍO*`);
  parts.push(`• *Nombre:* ${data.recipient_name?.trim() || 'Pendiente'}`);
  parts.push(`• *Identificación:* ${data.id_number?.trim() || 'Pendiente'}`);
  parts.push(`• *Teléfono:* ${data.phone?.trim() || 'Pendiente'}`);
  parts.push(`• *Ciudad de destino:* ${data.destination_city?.trim() || 'Pendiente'}`);
  parts.push(`• *Dirección:* ${data.address?.trim() || 'Pendiente'}`);
  if (data.notes?.trim()) {
    parts.push(`• *Observaciones:* ${data.notes.trim()}`);
  }
  return parts.join('\n');
}

/**
 * Compila las políticas y tarifas de envío en un bloque estructurado para el System Prompt de la IA.
 */
export function formatShippingPolicyPrompt(settings?: ShippingSettings | null): string {
  if (!settings || !settings.enabled) return '';

  const lines: string[] = [];
  lines.push('<politicas_y_tarifas_de_envio>');
  if (settings.carrierNames?.trim()) {
    lines.push(`- Transportadoras aliadas: ${settings.carrierNames.trim()}`);
  }
  if (settings.baseRate > 0) {
    lines.push(`- Tarifa base de envío nacional (destinos generales): $${settings.baseRate.toLocaleString('es-CO')} COP`);
  }
  if (settings.freeShippingMinAmount && settings.freeShippingMinAmount > 0) {
    lines.push(`- Envío GRATIS: Aplica para compras iguales o superiores a $${settings.freeShippingMinAmount.toLocaleString('es-CO')} COP`);
  }
  lines.push(
    settings.allowCashOnDelivery
      ? `- Pago contraentrega: Habilitado en ciudades con cobertura de transportadora aliada.`
      : `- Pago contraentrega: No disponible (el flete o pedido se cancela previo al despacho).`
  );

  if (settings.cityRates && settings.cityRates.length > 0) {
    lines.push('- Tarifas específicas por ciudad o municipio:');
    for (const cr of settings.cityRates) {
      const costStr = cr.cost === 0 ? 'GRATIS' : `$${cr.cost.toLocaleString('es-CO')} COP`;
      const codStr = cr.isCashOnDelivery ? 'con opción de contraentrega' : 'pago previo';
      const timeStr = cr.deliveryTime ? ` (${cr.deliveryTime})` : '';
      const notesStr = cr.notes ? ` — ${cr.notes}` : '';
      lines.push(`  * ${cr.city}${cr.department ? ` (${cr.department})` : ''}: ${costStr} ${codStr}${timeStr}${notesStr}`);
    }
    lines.push('REGLA ESTRICTA DE CIUDAD: Jamás asumas que el cliente se encuentra en una ciudad específica (como Barranquilla u otra) a menos que el cliente la haya nombrado explícitamente. Ante preguntas generales como "¿hacen envíos?", confirma despachos nacionales desde la sede oficial y pregunta a qué ciudad necesita la entrega.');
  }

  if (settings.generalPolicy?.trim()) {
    lines.push(`- Instrucciones generales: ${settings.generalPolicy.trim()}`);
  }
  const codFreightClause = settings.codFreeShipping
    ? 'En modalidad contraentrega el envío está incluido/gratis según esta configuración (salvo salvedad explícita en el prompt).'
    : 'El pago contraentrega NO exime del flete (salvo envío gratis por monto o excepción explícita en el prompt).';
  lines.push(
    `- REGLA OBLIGATORIA DE COTIZACIÓN CON FLETE: Si la entrega es fuera de la ciudad sede del negocio y NO cumple envío gratis, SIEMPRE debes desglosar explícitamente Producto + Envío = Total antes de cerrar el pedido. ${codFreightClause} Si la ciudad no figura en tarifas específicas, usa la tarifa base o aclara el valor aproximado del flete antes de confirmar el total definitivo.`
  );
  lines.push('</politicas_y_tarifas_de_envio>');

  return lines.join('\n');
}
