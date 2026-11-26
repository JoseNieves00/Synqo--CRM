import assert from 'node:assert/strict';
import {
  stripRedundantCatalogListAfterCards,
  extractSentInformationSummary,
} from '../lib/media/format';
import { DashboardTipsService } from '../services/dashboard-tips.service';
import { buildYesterdayWindow, DailySummaryService } from '../services/daily-summary.service';
import { findGalleryProductMatch, type EnrichedGalleryItem } from '../lib/ai/product-gallery';

// 1. DashboardTipsService: eficiencia operativa y deep-links por pestaña
const tips = DashboardTipsService.generateTips({
  organization: {
    id: 'org-1',
    name: 'Clínica Dental Norte',
    industry_preset: 'salud',
    system_prompt: 'Atendemos odontología general y diseño de sonrisa.',
    enabled_modules: { native_calendar: true, orders: false },
    appointment_settings: {
      follow_up_sequences: { enabled: true },
      payment_accounts: [{ id: 'p1', bank: 'Bancolombia' }],
    },
    structured_prompt_data: {
      gallery: [
        {
          id: 'g1',
          name: 'Sede Principal',
          url: 'https://example.com/sede.jpg',
        },
      ],
    },
  },
  metrics: {
    categories: { hot: 2, qualifiedDoubt: 3, warm: 2, cold: 0, unclassified: 6 },
    followUp: { sentInPeriod: 5, responseRatePct: 20, skippedNoTemplateCount: 2 },
    needsHumanCount: 3,
    totalContacts: 15,
  },
});

assert.ok(tips.length > 0, 'Debe generar tips personalizados');
assert.ok(
  tips.some((t) => t.id === 'followup_missing_meta_templates' && t.actionHref === '/settings?tab=follow_ups'),
  'Debe incluir tip de plantillas Meta faltantes con deep-link a follow_ups'
);
assert.ok(
  tips.some((t) => t.id === 'enrich_gallery_context' && t.actionHref === '/settings?tab=gallery'),
  'Debe detectar imágenes sin keywords ni contextRule y enlazar a ?tab=gallery'
);
assert.ok(
  tips.some((t) => t.actionHref?.startsWith('/inbox') || t.actionHref?.startsWith('/settings?tab=')),
  'Los tips deben usar deep-links específicos'
);

// 1b. Negocio de SOLO servicios (incluso si enabled_modules.orders no está definido en false) NO debe recibir tip de envíos
const servicesOnlyTips = DashboardTipsService.generateTips({
  organization: {
    id: 'org-serv',
    name: 'Consultorio Jurídico Integral',
    industry_preset: 'servicios',
    system_prompt: 'Ofrecemos asesoría legal, redacción de contratos y citas virtuales o presenciales.',
    enabled_modules: { native_calendar: true },
    appointment_settings: { follow_up_sequences: { enabled: true } },
  },
  metrics: {
    categories: { hot: 1, qualifiedDoubt: 1, warm: 1, cold: 0, unclassified: 0 },
  },
});
assert.ok(
  !servicesOnlyTips.some((t) => t.id === 'setup_shipping_policy'),
  'Un negocio de solo servicios NO debe recibir tip de políticas de envío'
);

// 2. DailySummaryService: ventana de ayer y formato WhatsApp
const win = buildYesterdayWindow('America/Bogota');
assert.match(win.dateKey, /^\d{4}-\d{2}-\d{2}$/, 'dateKey debe ser YYYY-MM-DD');
const waMsg = DailySummaryService.formatWhatsAppMessage('Clínica Norte', {
  dateKey: win.dateKey,
  dateLabel: win.dateLabel,
  generatedAt: new Date().toISOString(),
  metrics: {
    dateKey: win.dateKey,
    dateLabel: win.dateLabel,
    newLeads: 8,
    inboundMessages: 34,
    aiReplies: 28,
    humanReplies: 4,
    wonDeals: 2,
    revenue: 650000,
    appointmentsBooked: 3,
    pendingHandoffs: 1,
    tokensUsed: 12000,
  },
  shortSummary: 'Ayer entraron 8 leads y la IA resolvió el 88% de consultas sin relevo.',
  actionableTip: 'Agrega los tiempos de recuperación de diseño de sonrisa en el prompt para evitar 2 relevos.',
  tipActionHref: '/settings?tab=integrations#prompt-assistant',
  tipActionLabel: 'Ajustar Prompt',
});
assert.ok(waMsg.includes('Resumen Diario - Clínica Norte'));
assert.ok(waMsg.includes('Tip para hoy:'));

// 3. Galería contextual: coincidencia por contextRule y rechazo de consultas ambiguas
const galleryItems: EnrichedGalleryItem[] = [
  {
    id: 'img-sede',
    name: 'Mapa Sede Norte',
    url: 'https://example.com/mapa.jpg',
    searchKeywords: ['ubicacion', 'direccion', 'mapa', 'llegar'],
    contextRule: 'Enviar solo cuando pregunte por dirección física o cómo llegar a la sede',
  },
];

const strongMatch = findGalleryProductMatch(galleryItems, 'como llegar a la direccion fisica');
assert.equal(strongMatch?.id, 'img-sede', 'Debe encontrar la imagen cuando el contexto coincide claramente');

const ambiguousMatch = findGalleryProductMatch(galleryItems, 'hola info');
assert.equal(ambiguousMatch, null, 'Debe rechazar consultas ambiguas para evitar imágenes en contextos erróneos');

// 4. Regresión: evitar duplicar frases enviadas en el caption de la foto (incluso con abono/plan separe)
const sentCaption = [
  'Cocina pequeña · $350.000',
  'Cocina pequeña de MDF, ideal para juegos. Medidas: 1,07 m alto × 52 cm ancho × 26 cm prof. Recuerda que puedes apartar tu favorita con plan separe dando un abono inicial y pagando el saldo a tu ritmo! ✨',
].join('\n');
const rawAiReply =
  '¡Recuerda que puedes apartar tu favorita con plan separe dando un abono inicial y pagando el saldo a tu ritmo! ✨\n¿Para entrega en qué ciudad sería?';
const dedupedReply = stripRedundantCatalogListAfterCards(rawAiReply, {
  stripCardSpecs: true,
  sentCaptions: [sentCaption],
});
assert.equal(
  dedupedReply,
  '¿Para entrega en qué ciudad sería?',
  'Debe podar la frase repetida del caption aunque incluya abono/plan separe y conservar solo la pregunta nueva'
);

// 5. Memoria de Plan Separe (sin monto) y solicitud de datos de envío para evitar insistencia
const summaryMemory = extractSentInformationSummary([
  {
    sender_type: 'ai',
    content: 'Recuerda que puedes apartar tu favorita con plan separe dando un abono inicial.',
  },
  {
    sender_type: 'ai',
    content: 'Necesito tu nombre completo, dirección y teléfono para confirmar el envío.',
  },
]);
assert.ok(
  summaryMemory.some((s) => s.includes('Abono inicial / plan separe ya informado')),
  'Debe registrar Plan Separe aunque no lleve monto en $'
);
assert.ok(
  summaryMemory.some((s) => s.includes('Datos de envío/pedido ya solicitados')),
  'Debe registrar que ya se pidieron datos de envío'
);

console.log('✅ dashboard-tips-and-gallery-context.test.ts passed');
