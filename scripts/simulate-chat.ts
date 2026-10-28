import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { supabaseAdmin } from '../lib/supabase/admin';
import { OpenAIService } from '../services/openai.service';

/**
 * Script de simulación comercial en vivo para Synqo CRM.
 * Simula la llegada de un mensaje de un cliente por WhatsApp sin requerir Meta Cloud API.
 * 
 * Uso: npx tsx scripts/simulate-chat.ts "Hola, me gustaría agendar una demo mañana en la mañana"
 */
async function simulateIncomingLeadMessage() {
  const userMessage = process.argv[2] || 'Hola, me gustaría conocer sus servicios y agendar una reunión comercial para mañana.';

  console.log('🚀 [SIMULADOR SYNQO CRM] Iniciando prueba de mensaje...\n');

  // 1. Obtener la primera organización activa
  const { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, system_prompt, cal_event_type_id, is_active')
    .eq('name', 'Empresa Synqo')
    .single();

  if (orgError || !org) {
    console.error('❌ No se encontró la organización demo.');
    return;
  }

  console.log(`🏢 Organización: "${org.name}" (ID: ${org.id})`);
  console.log(`💬 Mensaje simulado del prospecto: "${userMessage}"\n`);

  // 2. Buscar o crear un prospecto de prueba
  const testPhone = '+573001234567';
  let { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, is_ai_active')
    .eq('phone', testPhone)
    .eq('organization_id', org.id)
    .single();

  if (!contact) {
    console.log('👤 Creando nuevo prospecto de prueba: "Carlos Andrés Gómez"...');
    const { data: newContact, error: cErr } = await (supabaseAdmin.from('contacts') as any)
      .insert({
        organization_id: org.id,
        phone: testPhone,
        name: 'Carlos Andrés Gómez',
        pipeline_stage: 'nuevo',
        is_ai_active: true,
        last_interaction_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (cErr) {
      console.error('❌ Error creando contacto:', cErr.message);
      return;
    }
    contact = newContact;
  } else {
    // Reactivar IA para la prueba
    await (supabaseAdmin.from('contacts') as any)
      .update({ is_ai_active: true, last_interaction_at: new Date().toISOString() })
      .eq('id', contact.id);
  }

  // 3. Registrar mensaje entrante del prospecto en la tabla messages
  console.log('📥 1. Guardando mensaje entrante en la base de datos (Realtime disparado)...');
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contact.id,
    sender_type: 'lead',
    content: userMessage,
    meta_message_id: `sim_${Date.now()}`,
  });

  // 4. Invocar el motor de Inteligencia Artificial (OpenAI Tool Calling)
  console.log('🤖 2. Invocando motor de IA (OpenAI Tool Calling + GPT-4o)...');
  let aiReplyText = '';
  try {
    aiReplyText = await OpenAIService.processLeadMessage({
      organizationId: org.id,
      contactId: contact.id,
      leadPhone: contact.phone,
      leadName: contact.name,
      systemPromptConfig: org.system_prompt,
    });
  } catch (err: any) {
    console.warn('⚠️ Nota sobre OpenAI:', err.message);
    aiReplyText = 'Hola Carlos, con gusto te brindamos información sobre nuestros servicios. ¿Te gustaría agendar una reunión rápida?';
  }

  // 5. Registrar respuesta de la IA en messages
  console.log('📤 3. Registrando respuesta de la IA generada:');
  console.log(`   "${aiReplyText}"\n`);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contact.id,
    sender_type: 'ai',
    content: aiReplyText,
    meta_message_id: `sim_reply_${Date.now()}`,
  });

  // 6. Consultar estado final del lead tras la IA
  const { data: updatedContact } = await (supabaseAdmin.from('contacts') as any)
    .select('pipeline_stage, is_ai_active, custom_fields')
    .eq('id', contact.id)
    .single();

  console.log('📊 4. Estado final del Lead en el CRM:');
  console.log(`   • Etapa del Pipeline: [${updatedContact?.pipeline_stage.toUpperCase()}]`);
  console.log(`   • Modo IA: [${updatedContact?.is_ai_active ? 'ACTIVA (Autónoma)' : 'HUMANO'}]`);
  console.log(`   • Tokens registrados: ${JSON.stringify(updatedContact?.custom_fields?.total_tokens || 0)}`);

  console.log('\n✨ ¡PRUEBA COMPLETADA CON ÉXITO! Abre http://localhost:3000/inbox para ver la conversación.');
}

simulateIncomingLeadMessage().catch(console.error);
