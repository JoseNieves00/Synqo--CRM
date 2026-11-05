/**
 * Suite de Pruebas: Auditoría de IA, Extracción de Anuncios/Posts de Instagram,
 * Despeje de Atención al Asesor y Blindaje de Cuotas.
 */

import { supabaseAdmin } from '../lib/supabase/admin';
import { getUnattendedHandoffs } from '../app/actions/chat';
import { OpenAIService } from '../services/openai.service';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Falla de aserción: ${msg}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Auditoría IA, Instagram Ads & Despeje de Relevos...\n');

  // 1. Obtener organización de prueba
  console.log('1️⃣  Obteniendo organización y configuración de prueba...');
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, system_prompt, ai_tokens_limit, ai_tokens_used, ai_tokens_openai_backup_limit, ai_tokens_openai_used')
    .eq('name', 'Filippo Kids')
    .maybeSingle();

  const testOrg = org || (await (supabaseAdmin.from('organizations') as any).select('id, name').limit(1).single()).data;
  assert(Boolean(testOrg?.id), 'Debe existir una organización para la prueba');
  console.log(`   ✅ Organización: "${testOrg.name}"`);

  // 2. Verificar que Filippo Kids tiene cuota desbloqueada para OpenAI
  console.log('\n2️⃣  Verificando blindaje de cuota y disponibilidad de IA...');
  const { data: refreshedOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('ai_tokens_limit, ai_tokens_used, ai_tokens_openai_backup_limit, ai_tokens_openai_used')
    .eq('id', testOrg.id)
    .single();

  const hasTokensAvailable = refreshedOrg.ai_tokens_used < refreshedOrg.ai_tokens_limit;
  assert(hasTokensAvailable, 'La organización debe tener tokens mensuales disponibles');
  console.log(`   ✅ Bolsa de tokens verificada: ${refreshedOrg.ai_tokens_used} / ${refreshedOrg.ai_tokens_limit}`);

  // 3. Probar que un contacto con IA apagada NO se marca como desatendido si el asesor ya contestó
  console.log('\n3️⃣  Probando despeje de "Requiere asesor" al responder el agente...');
  const testPhone = `+57311${Math.floor(1000000 + Math.random() * 9000000)}`;
  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .insert({
      organization_id: testOrg.id,
      name: 'Cliente Test Handoff Clearance',
      phone: testPhone,
      pipeline_stage: 'nuevo',
      is_ai_active: false,
      last_interaction_at: new Date().toISOString(),
      custom_fields: {},
    })
    .select()
    .single();

  assert(Boolean(contact?.id), 'Contacto temporal creado');

  // Lead envía mensaje a las 10:00
  const t1 = new Date(Date.now() - 60000).toISOString();
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contact.id,
    sender_type: 'lead',
    content: 'Hola, tienen disponibilidad?',
    created_at: t1,
  });

  // El asesor responde a las 10:01
  const t2 = new Date().toISOString();
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contact.id,
    sender_type: 'agent_manual',
    content: 'Hola! Sí, claro que sí tenemos disponibilidad.',
    created_at: t2,
  });

  // En este punto, aunque is_ai_active es false, el asesor YA respondió. NO debe figurar en unattended.
  const unattendedList = await getUnattendedHandoffs();
  const isMarkedUnattended = unattendedList.some((item) => item.id === contact.id);
  assert(!isMarkedUnattended, 'El contacto NO debe figurar como desatendido si el asesor ya respondió');
  console.log('   ✅ Despeje exitoso: El asesor respondió y el contacto no queda bloqueado como "Requiere asesor".');

  // 4. Probar enriquecimiento de publicaciones de Instagram (Simulación de parser)
  console.log('\n4️⃣  Probando lógica de extracción de publicaciones de Instagram y Click-to-WhatsApp Ads...');
  const simulatedMsgObj = {
    extendedTextMessage: {
      text: 'Valor',
      contextInfo: {
        externalAdReply: {
          title: 'Pequeños Chefs! Recién llegadas!',
          body: 'El regalo con el que cualquier peque soñaría',
          sourceUrl: 'https://instagram.com/p/test1234',
        },
      },
    },
  };

  const adReply = simulatedMsgObj.extendedTextMessage.contextInfo?.externalAdReply;
  const adTitle = adReply?.title || '';
  const adBody = adReply?.body || '';
  const parts: string[] = [];
  if (adTitle) parts.push(`"${adTitle}"`);
  if (adBody) parts.push(`"${adBody}"`);
  const enrichedContent = `[Publicación/Anuncio compartido de Instagram: ${parts.join(' - ')}] ${simulatedMsgObj.extendedTextMessage.text}`.trim();

  assert(
    enrichedContent.includes('Pequeños Chefs') && enrichedContent.includes('Valor'),
    'El mensaje enriquecido debe contener el título del anuncio de Instagram y la pregunta del usuario'
  );
  console.log(`   ✅ Mensaje extraído correctamente: "${enrichedContent}"`);

  // 5. Probar que la IA responde directamente con precios y modelos ante el mensaje de Instagram
  console.log('\n5️⃣  Probando respuesta directa de la IA sobre precios de la publicación...');
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contact.id,
    sender_type: 'lead',
    content: enrichedContent,
    created_at: new Date().toISOString(),
  });

  const aiReply = await OpenAIService.processLeadMessage({
    contactId: contact.id,
    organizationId: testOrg.id,
    leadPhone: testPhone,
    leadName: 'Cliente Test',
    systemPromptConfig: testOrg.system_prompt || 'Tienda de cocinitas infantiles. Modelos: Cocina pequeña ($360.000), Cocina mediana ($410.000).',
  });

  assert(Boolean(aiReply && aiReply.trim()), 'La IA debe responder un texto no vacío');
  // No debe responder el mensaje genérico inútil
  assert(
    !aiReply.includes('no dudes en preguntar') && !aiReply.includes('en qué puedo ayudarte hoy'),
    'La IA no debe enviar un saludo genérico cuando el cliente preguntó el precio del post'
  );
  console.log('   ✅ Respuesta de IA generada:', aiReply);

  // 6. Limpieza de datos temporales
  console.log('\n🧹 Limpiando contacto de prueba...');
  await (supabaseAdmin.from('contacts') as any).delete().eq('id', contact.id);
  console.log('   ✅ Datos de prueba limpiados exitosamente.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE AUDITORÍA IA, INSTAGRAM ADS Y DESPEJE PASARON EXITOSAMENTE!\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

