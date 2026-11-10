import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { buildSalesPlaybook } from '../lib/ai/sales-playbook';
import {
  resolveOrganizationGallery,
  findGalleryProductMatch,
  buildProductCardCaption,
  findHallucinatedPrices,
} from '../lib/ai/product-gallery';
import {
  LEAD_TEMPERATURE_ORDER,
  LEAD_TEMPERATURE_META,
  normalizeFollowUpSettings,
  interpolateFollowUpText,
  resolveLeadTemperature,
  resolveProductInterest,
} from '../lib/ai/follow-up-types';
import { resolveInboundThumbnailMessage } from '../lib/media/inbound-thumbnail';
import {
  isExplicitHumanHandoffRequest,
  isOptOutMessage,
} from '../services/inbound-core.service';
import { LeadReactivationService } from '../services/reactivation.service';
import { OpenAIService } from '../services/openai.service';
import { getDashboardMetrics } from '../app/actions/dashboard';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runTests() {
  console.log('\n🚀 Iniciando Suite E2E: IA Autónoma, Galería Visual, Seguimientos & Dashboard Real...\n');

  // 1. Neutralidad multi-nicho y cero modelos hardcodeados fuera de config.ts (M1 & M2)
  console.log('1️⃣  Verificando 0 palabras de negocio y 0 modelos hardcodeados en motor de IA...');
  const coreFiles = [
    'services/openai.service.ts',
    'services/inbound-core.service.ts',
    'lib/ai/sales-playbook.ts',
  ];
  const forbiddenPatterns = [
    /cocinita/i,
    /neverita/i,
    /peque(?:ño|ños|ña|ñas)/i,
    /plan\s*separe/i,
    /madera\s*mdf/i,
    /gpt-4o-mini/i,
    /gemini-/i,
  ];

  for (const relPath of coreFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.ok(
        !pat.test(content),
        `${relPath} no debe contener patrón hardcodeado: ${pat.source}`
      );
    }
  }

  // Verificar que vercel.json siga vacío porque los crons viven en cron-job.org
  const vercelJsonRaw = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8').trim();
  const vercelJson = JSON.parse(vercelJsonRaw || '{}');
  assert.ok(!vercelJson.crons || vercelJson.crons.length === 0, 'vercel.json debe mantenerse sin crons (se usa cron-job.org)');
  console.log('   ✅ Motor 100% neutral multi-tenant y crons desacoplados de Vercel.');

  // 2. Presupuesto de tokens del Playbook y modularidad de calendario (M2)
  console.log('2️⃣  Verificando Playbook compacto (<= 1.500 tokens) y tools condicionales...');
  const playbookNoCal = buildSalesPlaybook({ hasCalendar: false });
  const estimatedTokensNoCal = Math.ceil(playbookNoCal.length / 4);
  assert.ok(
    estimatedTokensNoCal <= 1500,
    `Playbook sin calendario debe medir <= 1.500 tokens estimados (actual: ${estimatedTokensNoCal})`
  );
  assert.ok(!playbookNoCal.includes('book_native_appointment'), 'Playbook sin calendario no debe incluir tools de agenda');

  const playbookWithCal = buildSalesPlaybook({ hasCalendar: true });
  assert.ok(playbookWithCal.includes('book_native_appointment'), 'Playbook con calendario debe incluir book_native_appointment');
  assert.ok(playbookWithCal.includes('check_native_availability'), 'Playbook con calendario debe incluir check_native_availability');
  console.log(`   ✅ Playbook verificado (~${estimatedTokensNoCal} tokens sin calendario).`);

  // 3. Galería de productos, ficha foto+precio+medidas y validador de precios (M3 & T1)
  console.log('3️⃣  Verificando resolución de galería, caption oficial y detección de precios inventados...');
  const mockOrg = {
    structured_prompt_data: {
      gallery: [
        {
          id: 'prod-1',
          name: 'Cocina + Nevera',
          url: 'https://cdn.example.com/cocina-nevera.jpg',
          price: '489000',
          keywords: ['nevera', 'grande'],
        },
        {
          id: 'prod-2',
          name: 'Escritorio Infantil',
          url: 'https://cdn.example.com/escritorio.jpg',
          price: '295000',
          keywords: ['estudio'],
        },
      ],
      catalog: [
        {
          name: 'Cocina + Nevera',
          price: '489000',
          description: 'Modelo "Chef Deluxe" de 102 cm alto x 90 cm ancho.',
          keywords: ['chef'],
        },
      ],
    },
  };
  const gallery = resolveOrganizationGallery(mockOrg, 'Envío nacional: $25.000');
  assert.strictEqual(gallery.items.length, 2);
  assert.ok(gallery.allowedUrls.has('https://cdn.example.com/cocina-nevera.jpg'));
  assert.ok(gallery.knownPrices.has(489000));
  assert.ok(gallery.knownPrices.has(25000));

  const matched = findGalleryProductMatch(gallery.items, 'quiero ver la chef deluxe con nevera');
  assert.strictEqual(matched?.id, 'prod-1', 'Debe encontrar por nombre/keyword/alias del catálogo');

  const caption = buildProductCardCaption({
    name: matched!.name,
    price: matched!.price,
    details: 'Medidas: 102 cm alto x 90 cm ancho · Envío a todo el país.',
  });
  assert.ok(caption.includes('Cocina + Nevera · $489.000'), `Caption inválido: ${caption}`);
  assert.ok(caption.includes('102 cm alto'), 'Caption debe conservar medidas');

  assert.deepStrictEqual(
    findHallucinatedPrices('La Cocina + Nevera vale $489.000 y el envío $25.000 (total $514.000).', gallery.knownPrices),
    [],
    'No debe marcar como inventados precios reales ni su suma directa'
  );
  const badPrices = findHallucinatedPrices('Te queda en $399.000 en promoción.', gallery.knownPrices);
  assert.deepStrictEqual(badPrices, [399000], 'Debe detectar precio inventado $399.000');
  console.log('   ✅ Ficha de producto y validador anti-alucinación de precios OK.');

  // 4. Reglas de relevo humano y opt-out (M5)
  console.log('4️⃣  Verificando regex de relevo humano y opt-out...');
  assert.strictEqual(
    isExplicitHumanHandoffRequest('Es para una persona de 5 años, ¿qué tamaño recomiendan?'),
    false,
    '"persona de 5 años" NO debe disparar handoff falso'
  );
  assert.strictEqual(
    isExplicitHumanHandoffRequest('Quiero hablar con un asesor humano por favor'),
    true,
    'Solicitud explícita de asesor SÍ debe disparar handoff'
  );
  assert.strictEqual(isOptOutMessage('No me escriban más por favor, gracias'), true);
  assert.strictEqual(isOptOutMessage('Me interesa mucho, ¿cómo pago contraentrega?'), false);
  console.log('   ✅ Handoff sin falsos positivos y detección opt-out verificados.');

  // 5. Utilidades de Seguimiento y Categorización Unificada (T1 & T2)
  console.log('5️⃣  Verificando normalización de secuencias e interpolación de mensajes...');
  const normalized = normalizeFollowUpSettings({
    enabled: true,
    dailyCap: 9999,
    sequences: {
      hot_unclosed: {
        enabled: true,
        steps: [
          {
            delayValue: 2,
            delayUnit: 'hours',
            text: '¡Hola {primer_nombre}! Recuerda que con {empresa} tenemos pago contraentrega para {producto}.',
          },
        ],
      },
    },
  });
  assert.strictEqual(normalized.dailyCap, 500, 'dailyCap debe acotarse al máximo seguro de 500');
  assert.strictEqual(normalized.sequences.hot_unclosed.steps.length, 1);

  const msgNamed = interpolateFollowUpText(normalized.sequences.hot_unclosed.steps[0].text, {
    contactName: 'Laura Gómez',
    productName: 'Cocina + Nevera',
    companyName: 'Mi Tienda',
  });
  assert.strictEqual(
    msgNamed,
    '¡Hola Laura! Recuerda que con Mi Tienda tenemos pago contraentrega para Cocina + Nevera.'
  );

  const msgPhoneOnly = interpolateFollowUpText('¡Hola {nombre}! Seguimos atentos.', {
    contactName: '+573001112233',
  });
  assert.strictEqual(msgPhoneOnly, '¡Hola! Seguimos atentos.', 'No debe saludar con el teléfono');

  assert.strictEqual(resolveLeadTemperature({ lead_temperature: 'hot', temperature: 'warm' }), 'hot');
  assert.strictEqual(resolveLeadTemperature({ temperature: 'warm' }), 'warm');
  assert.strictEqual(
    resolveProductInterest({ ai_summary: { product_of_interest: 'Escritorio' }, product_interest: 'Otro' }),
    'Escritorio'
  );
  console.log('   ✅ Seguimientos e interpolación verificados.');

  // Verificación estructural de cierre automático ante respuesta del cliente en inbound-core
  const inboundSource = fs.readFileSync(path.join(process.cwd(), 'services/inbound-core.service.ts'), 'utf8');
  assert.ok(
    inboundSource.includes("status: 'cancelled'") && inboundSource.includes('follow_up'),
    'inbound-core.service.ts debe cancelar seguimientos pendientes cuando el cliente responde'
  );
  assert.ok(
    inboundSource.includes('reminderCreatedThisTurn') && inboundSource.includes(".lt('created_at', aiTurnStartIso)") && inboundSource.includes('scheduledThisTurn'),
    'inbound-core.service.ts NO debe autocancelar un recordatorio agendado por schedule_follow_up en el mismo turno ni dejarlo cancelado por trigger SQL'
  );

  // Verificación de filtro por_responder sin falsos positivos donde la IA ya respondió o está atendiendo
  const chatTsSource = fs.readFileSync(path.join(process.cwd(), 'app/actions/chat.ts'), 'utf8');
  assert.ok(
    chatTsSource.includes('buildPorResponderOrFilter') &&
      chatTsSource.includes('is_ai_active.eq.false') &&
      chatTsSource.includes('last_message_sender.eq.lead') &&
      !chatTsSource.includes(".or('waiting_since.not.is.null,unread_count.gt.0,custom_fields->>unattended_handoff.eq.true')"),
    'por_responder debe filtrar únicamente mensajes sin respuesta del sistema, relevos humanos o espera prolongada >3m'
  );

  // 6. Pruebas de Integración en Supabase (Organización efímera aislada + Auditoría Dashboard Empresa Synqo)
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasSupabase) {
    console.log('⚠️  Saltando pruebas en vivo de Supabase (faltan variables de entorno).');
    return;
  }

  console.log('6️⃣  Ejecutando prueba de cron en organización efímera aislada (sin tocar clientes reales)...');
  let tempOrgId: string | null = null;
  try {
    const pastIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const pastDueIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: tempOrg, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
      .insert({
        name: `__E2E_TEST_ORG_${Date.now()}__`,
        whatsapp_provider: 'meta',
        whatsapp_phone_number_id: 'e2e-dummy-phone-id',
        whatsapp_access_token: 'e2e-dummy-token',
        is_active: true,
        business_hours: {
          enabled: true,
          days: [1, 2, 3, 4, 5, 6, 7],
          start: '00:00',
          end: '23:59',
        },
        appointment_settings: {
          follow_up_sequences: {
            enabled: true,
            dailyCap: 15,
            sequences: {
              hot_unclosed: {
                enabled: true,
                steps: [
                  {
                    id: 'step-1',
                    delayValue: 1,
                    delayUnit: 'hours',
                    text: 'Hola {primer_nombre}, contamos con pago contraentrega.',
                    // Sin metaTemplateName intencionalmente para validar skip fuera de 24h Meta
                  },
                ],
              },
            },
          },
        },
      })
      .select('id')
      .single();

    if (orgErr || !tempOrg?.id) {
      throw new Error(`No se pudo crear org efímera de prueba: ${orgErr?.message}`);
    }
    tempOrgId = tempOrg.id;

    // Contacto 1: Meta fuera de 24h sin plantilla -> debe saltarse y marcar meta_outside_24h_no_template
    // Contacto 2: opted_out = true -> NO debe recibir mensajes ni marcarse skip de plantilla
    // Contacto 3: follow_up.paused = true + recordatorio vencido -> cancela recordatorio y no envía
    const { data: insertedContacts, error: cInsErr } = await (supabaseAdmin.from('contacts') as any)
      .insert([
        {
          organization_id: tempOrgId,
          phone: '+573990001001',
          name: 'Cliente Ventana Cerrada',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'calificado',
          is_ai_active: true,
          last_interaction_at: pastIso,
          custom_fields: {
            lead_temperature: 'hot',
            follow_up: {
              category: 'hot_unclosed',
              currentStepIndex: 0,
              nextSendAt: pastDueIso,
            },
          },
        },
        {
          organization_id: tempOrgId,
          phone: '+573990001002',
          name: 'Cliente OptOut',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'calificado',
          is_ai_active: false,
          last_interaction_at: pastIso,
          custom_fields: {
            lead_temperature: 'cold',
            opted_out: true,
            follow_up: {
              category: 'hot_unclosed',
              currentStepIndex: 0,
              nextSendAt: pastDueIso,
            },
          },
        },
        {
          organization_id: tempOrgId,
          phone: '+573990001003',
          name: 'Cliente Pausado',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'calificado',
          is_ai_active: true,
          last_interaction_at: pastIso,
          custom_fields: {
            lead_temperature: 'hot',
            follow_up: {
              category: 'hot_unclosed',
              currentStepIndex: 0,
              nextSendAt: pastDueIso,
              paused: true,
            },
          },
        },
      ])
      .select('id, phone');

    if (cInsErr) throw new Error(`Error creando contactos efímeros: ${cInsErr.message}`);
    const c3Row = (insertedContacts || []).find((c: any) => c.phone === '+573990001003');
    let remId: string | null = null;
    if (c3Row?.id) {
      const { data: remRow } = await (supabaseAdmin.from('scheduled_reminders') as any)
        .insert({
          contact_id: c3Row.id,
          scheduled_for: pastDueIso,
          reminder_type: 'reactivation',
          status: 'pending',
        })
        .select('id')
        .single();
      remId = remRow?.id || null;
    }

    const cronRes = await LeadReactivationService.processAutonomousLeadReactivations(tempOrgId!);
    assert.ok(
      cronRes.skippedNoTemplateCount >= 1,
      `Cron debe reportar al menos 1 lead saltado por ventana 24h sin plantilla Meta (reportó: ${cronRes.skippedNoTemplateCount})`
    );

    const { data: afterContacts } = await (supabaseAdmin.from('contacts') as any)
      .select('phone, custom_fields')
      .eq('organization_id', tempOrgId);

    const c1 = (afterContacts || []).find((c: any) => c.phone === '+573990001001');
    const c2 = (afterContacts || []).find((c: any) => c.phone === '+573990001002');
    const c3 = (afterContacts || []).find((c: any) => c.phone === '+573990001003');

    assert.strictEqual(
      c1?.custom_fields?.follow_up_last_skipped,
      'meta_outside_24h_no_template',
      'Contacto fuera de 24h en Meta debe marcar follow_up_last_skipped = meta_outside_24h_no_template'
    );
    assert.ok(!c2?.custom_fields?.follow_up_last_skipped, 'Contacto opt-out no debe procesarse');
    assert.ok(!c3?.custom_fields?.follow_up_last_skipped, 'Contacto pausado no debe procesarse');

    if (remId) {
      const { data: remAfter } = await (supabaseAdmin.from('scheduled_reminders') as any)
        .select('status')
        .eq('id', remId)
        .single();
      assert.strictEqual(remAfter?.status, 'cancelled', 'Recordatorio de contacto pausado debe cancelarse automáticamente');
    }
    console.log('   ✅ Comportamiento real del cron verificado (Meta >24h skip, opt-out y pausa).');

    // Enriquecer org efímera con venta IA, lead tibio y perdido + 1 ai_run para auditar cálculo exacto del Dashboard
    const nowIso = new Date().toISOString();
    await (supabaseAdmin.from('contacts') as any).insert([
      {
        organization_id: tempOrgId,
        phone: '+573990001004',
        name: 'Cliente Ganado IA',
        channel: 'whatsapp',
        conversation_status: 'closed',
        pipeline_stage: 'ganado',
        deal_value: 489000,
        closed_at: nowIso,
        close_reason: 'venta_ia',
        is_ai_active: true,
        last_interaction_at: nowIso,
        custom_fields: { lead_temperature: 'hot', order: { total: 489000, created_by: 'ai' } },
      },
      {
        organization_id: tempOrgId,
        phone: '+573990001005',
        name: 'Cliente Perdido Tibio',
        channel: 'whatsapp',
        conversation_status: 'closed',
        pipeline_stage: 'perdido',
        closed_at: nowIso,
        close_reason: 'Muy costoso',
        is_ai_active: false,
        last_interaction_at: nowIso,
        custom_fields: { lead_temperature: 'warm', lost_reason: 'Muy costoso' },
      },
    ]);

    const firstContactId = c3Row?.id || null;
    if (firstContactId) {
      await (supabaseAdmin.from('ai_runs') as any).insert({
        organization_id: tempOrgId,
        contact_id: firstContactId,
        channel: 'whatsapp',
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt_tokens: 2000,
        completion_tokens: 100,
        total_tokens: 2100,
        latency_ms: 850,
        status: 'success',
      });
    }

    const tempMetrics = await getDashboardMetrics('month', tempOrgId!);
    assert.ok(tempMetrics, 'getDashboardMetrics debe retornar métricas en org efímera');
    assert.strictEqual(tempMetrics!.totalContacts, 5);
    assert.strictEqual(tempMetrics!.wonInPeriod, 1);
    assert.strictEqual(tempMetrics!.salesRevenueInPeriod, 489000);
    assert.strictEqual(tempMetrics!.aiPerformance.aiWonSalesCount, 1);
    assert.strictEqual(tempMetrics!.categories.hot, 3);
    assert.strictEqual(tempMetrics!.categories.warm, 1);
    assert.strictEqual(tempMetrics!.categories.cold, 1);
    assert.strictEqual(tempMetrics!.categories.buyers, 1);
    assert.strictEqual(tempMetrics!.lostReasons[0]?.reason, 'Muy costoso');
    assert.strictEqual(tempMetrics!.costs.totalTokensPeriod, firstContactId ? 2100 : 0);
    assert.strictEqual(tempMetrics!.conversionRatePct, 20); // 1 / 5 nuevos = 20%
    assert.ok(tempMetrics!.followUp.skippedNoTemplateCount >= 1);
    assert.strictEqual(
      tempMetrics!.needsHumanCount,
      0,
      'Leads atendidos por IA o en espera normal no deben disparar falsas alarmas de atención humana'
    );

    // Agregar 1 lead respondido por IA con unread_count viejo (falso positivo histórico) + 1 relevo real + 1 histórico sin categoría
    const { data: extraContacts } = await (supabaseAdmin.from('contacts') as any)
      .insert([
        {
          organization_id: tempOrgId,
          phone: '+573990001006',
          name: 'Falso Positivo Unread IA',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'nuevo',
          is_ai_active: true,
          unread_count: 3,
          last_message_sender: 'ai',
          last_interaction_at: nowIso,
          custom_fields: { lead_temperature: 'warm' },
        },
        {
          organization_id: tempOrgId,
          phone: '+573990001007',
          name: 'Relevo Humano Real',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'calificado',
          is_ai_active: false,
          last_message_sender: 'lead',
          last_interaction_at: nowIso,
          custom_fields: { unattended_handoff: true, lead_temperature: 'hot' },
        },
        {
          organization_id: tempOrgId,
          phone: '+573990001008',
          name: 'Histórico Sin Categoría',
          channel: 'whatsapp',
          conversation_status: 'open',
          pipeline_stage: 'nuevo',
          is_ai_active: true,
          last_interaction_at: nowIso,
          custom_fields: {},
        },
      ])
      .select('id, phone');

    const unclassifiedLead = (extraContacts || []).find((c: any) => c.phone === '+573990001008');
    if (unclassifiedLead?.id) {
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: unclassifiedLead.id,
        organization_id: tempOrgId,
        sender_type: 'lead',
        content: 'Quiero pagar hoy mismo, ¿me das tu número de Nequi o Bancolombia por favor?',
        channel: 'whatsapp',
      });
    }

    const metricsWithHuman = await getDashboardMetrics('month', tempOrgId!);
    assert.strictEqual(
      metricsWithHuman!.needsHumanCount,
      1,
      'Solo el chat con relevo humano real debe aparecer en needsHumanCount (ignorando el chat ya respondido por IA aunque tenga unread_count)'
    );

    const batchRes = await OpenAIService.classifyUnclassifiedContactsBatch(tempOrgId!, 10);
    assert.ok(batchRes.processed >= 1, 'Clasificador batch debe procesar el contacto histórico sin categoría');
    assert.strictEqual(batchRes.remaining, 0, 'No deben quedar contactos sin clasificar tras el lote');

    if (unclassifiedLead?.id) {
      const { data: classifiedContact } = await (supabaseAdmin.from('contacts') as any)
        .select('pipeline_stage, custom_fields')
        .eq('id', unclassifiedLead.id)
        .single();
      const classifiedTemp = resolveLeadTemperature(classifiedContact?.custom_fields);
      assert.ok(
        classifiedTemp === 'hot' ||
          classifiedTemp === 'qualified_doubt' ||
          classifiedTemp === 'warm' ||
          classifiedTemp === 'cold',
        `Contacto histórico debe quedar con lead_temperature válida (obtuvo: ${classifiedTemp})`
      );
    }

    console.log('   ✅ Métricas realistas (needsHumanCount vs falsos positivos) y clasificador batch verificados.');
  } finally {
    if (tempOrgId) {
      await (supabaseAdmin.from('ai_runs') as any).delete().eq('organization_id', tempOrgId);
      const { data: tempContacts } = await (supabaseAdmin.from('contacts') as any)
        .select('id')
        .eq('organization_id', tempOrgId);
      const cIds = (tempContacts || []).map((c: any) => c.id);
      if (cIds.length > 0) {
        await (supabaseAdmin.from('messages') as any).delete().in('contact_id', cIds);
        await (supabaseAdmin.from('scheduled_reminders') as any).delete().in('contact_id', cIds);
        await (supabaseAdmin.from('contacts') as any).delete().in('id', cIds);
      }
      await (supabaseAdmin.from('messages') as any).delete().eq('organization_id', tempOrgId);
      await (supabaseAdmin.from('organizations') as any).delete().eq('id', tempOrgId);
    }
  }

  // 7. Auditoría Dashboard vs Conteos Directos SQL en Empresa Synqo (solo lectura)
  console.log('7️⃣  Auditando getDashboardMetrics("month") vs consultas directas Supabase (Empresa Synqo)...');
  const { data: synqoOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name')
    .eq('name', 'Empresa Synqo')
    .single();

  if (synqoOrg?.id) {
    const metrics = await getDashboardMetrics('month', synqoOrg.id);
    assert.ok(metrics, 'getDashboardMetrics debe retornar métricas para Empresa Synqo');

    const [directContactsRes, directRunsRes] = await Promise.all([
      (supabaseAdmin.from('contacts') as any)
        .select('id, pipeline_stage, deal_value, closed_at, updated_at, created_at, custom_fields')
        .eq('organization_id', synqoOrg.id)
        .is('deleted_at', null),
      (supabaseAdmin.from('ai_runs') as any)
        .select('total_tokens')
        .eq('organization_id', synqoOrg.id)
        .gte('created_at', metrics!.sinceIso)
        .limit(5000),
    ]);

    const directContacts = directContactsRes.data || [];
    const directRuns = directRunsRes.data || [];

    assert.strictEqual(metrics!.totalContacts, directContacts.length, 'totalContacts debe coincidir con SQL directo');

    const funnelSum =
      metrics!.funnelCounts.nuevo +
      metrics!.funnelCounts.calificado +
      metrics!.funnelCounts.cita_agendada +
      metrics!.funnelCounts.ganado +
      metrics!.funnelCounts.perdido;
    assert.strictEqual(funnelSum, metrics!.totalContacts, 'Suma del embudo debe coincidir con totalContacts');

    const catSum =
      metrics!.categories.hot +
      metrics!.categories.qualifiedDoubt +
      metrics!.categories.warm +
      metrics!.categories.cold +
      metrics!.categories.unclassified;
    assert.strictEqual(catSum, metrics!.totalContacts, 'Suma de categorías debe coincidir con totalContacts');

    const expectedWonInPeriod = directContacts.filter((c: any) => {
      const closedTime = c.closed_at || c.custom_fields?.closed_at || c.updated_at;
      return c.pipeline_stage === 'ganado' && closedTime && closedTime >= metrics!.sinceIso;
    }).length;
    assert.strictEqual(metrics!.wonInPeriod, expectedWonInPeriod, 'wonInPeriod debe coincidir con conteo directo');

    assert.strictEqual(metrics!.costs.totalRunsPeriod, directRuns.length, 'totalRunsPeriod debe coincidir con ai_runs');
    console.log(
      `   ✅ Dashboard auditado: ${metrics!.totalContacts} contactos, ${metrics!.wonInPeriod} ganados en periodo, ${metrics!.costs.totalRunsPeriod} runs.`
    );
  } else {
    console.log('   ℹ️  No se encontró org "Empresa Synqo"; auditoría en vivo omitida.');
  }

  // 8. Clasificación 4 niveles, neutralidad multi-nicho y extracción segura de miniaturas (SSRF guard)
  console.log('8️⃣  Verificando 4 niveles de calificación, neutralidad multi-nicho y SSRF en miniaturas...');
  assert.deepStrictEqual(
    LEAD_TEMPERATURE_ORDER,
    ['hot', 'qualified_doubt', 'warm', 'cold'],
    'LEAD_TEMPERATURE_ORDER debe exponer los 4 niveles esperados'
  );
  for (const temp of LEAD_TEMPERATURE_ORDER) {
    assert.ok(LEAD_TEMPERATURE_META[temp]?.label, `Falta metadata para temperatura ${temp}`);
  }
  assert.strictEqual(
    resolveLeadTemperature({ lead_temperature: 'qualified_doubt' }),
    'qualified_doubt'
  );

  const normalized4 = normalizeFollowUpSettings({
    enabled: true,
    sequences: {
      qualified_doubt: {
        enabled: true,
        steps: [{ id: 'qd1', delayValue: 6, delayUnit: 'hours', text: '¿Tienes alguna duda puntual sobre {producto}?' }],
      },
    },
  });
  assert.strictEqual(
    LeadReactivationService.resolveSequenceCategory(
      { pipeline_stage: 'calificado', custom_fields: { lead_temperature: 'qualified_doubt' } },
      normalized4
    ),
    'qualified_doubt',
    'Debe usar secuencia qualified_doubt cuando está activa con pasos'
  );

  const normalizedFallback = normalizeFollowUpSettings({ enabled: true });
  assert.strictEqual(
    LeadReactivationService.resolveSequenceCategory(
      { pipeline_stage: 'calificado', custom_fields: { lead_temperature: 'qualified_doubt' } },
      normalizedFallback
    ),
    'warm',
    'Sin pasos configurados en qualified_doubt, debe caer limpiamente a warm'
  );

  const neutralText = interpolateFollowUpText('Hola {nombre}, seguimos atentos a {producto} en {empresa}', {
    contactName: 'Sofía',
    productName: resolveProductInterest({ ai_summary: { product_of_interest: 'Valoración Odontológica' } }),
    companyName: 'Clínica Sonrisa',
  });
  assert.ok(neutralText.includes('Valoración Odontológica'), 'Debe interpolar interés de cualquier nicho');

  const safeBlockedMsg = await resolveInboundThumbnailMessage({
    organizationId: '00000000-0000-0000-0000-000000000000',
    contactKey: 'ssrf-test',
    text: 'Hola quiero info sobre http://127.0.0.1/admin',
    thumbnailUrl: 'http://127.0.0.1/secret.png',
    sourceUrl: 'http://localhost:8080/internal',
  });
  assert.ok(
    !safeBlockedMsg.startsWith('[IMAGEN:'),
    'URLs internas (127.0.0.1/localhost) nunca deben resolverse ni formatearse como imagen SSRF'
  );
  assert.ok(
    safeBlockedMsg.includes('Hola quiero info'),
    'Debe preservar el texto original del cliente cuando se rechaza una URL privada'
  );

  console.log('   ✅ 4 niveles de calificación, neutralidad multi-nicho y SSRF guard en miniaturas verificados.');

  console.log('\n🎉 Todas las pruebas E2E de IA Autónoma, Cron y Dashboard pasaron exitosamente.\n');
}

runTests().catch((err) => {
  console.error('❌ Error en suite E2E:', err);
  process.exit(1);
});
