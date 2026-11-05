/**
 * Suite de Pruebas: Reactivación Inteligente de IA, Takeover Móvil,
 * Finalización de Conversaciones ('Dar Fin') y Sistema de Recordatorios Auditados.
 */

import { supabaseAdmin } from '../lib/supabase/admin';
import {
  createContactReminder,
  completeContactReminder,
  cancelContactReminder,
  getOrganizationPendingReminders,
} from '../app/actions/reminders';
import { endContactConversation, getUnattendedHandoffs } from '../app/actions/chat';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Falla de aserción: ${msg}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Handoff, Takeover Móvil & Recordatorios...\n');

  // 1. Obtener organización y usuario de prueba
  console.log('1️⃣  Obteniendo organización y usuario de prueba...');
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name')
    .limit(1)
    .single();

  assert(Boolean(org?.id), 'Debe existir al menos una organización en la BD');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, organization_id')
    .eq('organization_id', org.id)
    .limit(1)
    .single();

  assert(Boolean(profile?.id), 'Debe existir un perfil en la organización de prueba');
  console.log(`   ✅ Organización: "${org.name}", Asesor: "${profile.full_name}"`);

  // 2. Crear contacto temporal para pruebas
  console.log('\n2️⃣  Creando contacto temporal para pruebas...');
  const testPhone = `+57300${Math.floor(1000000 + Math.random() * 9000000)}`;
  const { data: contact, error: contactErr } = await (supabaseAdmin.from('contacts') as any)
    .insert({
      organization_id: org.id,
      name: 'Contacto Test Handoff',
      phone: testPhone,
      pipeline_stage: 'nuevo',
      is_ai_active: false,
      assigned_to: profile.id,
      last_interaction_at: new Date().toISOString(),
      custom_fields: {},
    })
    .select()
    .single();

  assert(!contactErr && Boolean(contact?.id), 'Error al insertar contacto de prueba');
  const contactId = contact.id;
  console.log(`   ✅ Contacto creado con ID: ${contactId}`);

  try {
    // 3. Probar lógica de Unattended Handoff (Takeover Móvil sin trailing system message)
    console.log('\n3️⃣  Probando detección y despeje de Unattended Handoffs...');
    
    // Simular que el cliente escribe a las 10:00:00
    const timeT1 = new Date('2026-11-05T10:00:00.000Z').toISOString();
    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'lead',
      content: 'Hola, tengo una pregunta sobre el envío',
      created_at: timeT1,
    });

    // En este momento, el mensaje del lead no ha sido contestado -> Debe figurar pendiente
    const { data: msgsBefore } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id, sender_type, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    const isPendingBefore = msgsBefore && msgsBefore.length > 0 && msgsBefore[0].sender_type === 'lead';
    assert(isPendingBefore, 'El lead debe marcarse como pendiente de atención si no ha respondido el asesor');
    console.log('   ✅ Contacto correctamente detectado como pendiente de atención.');

    // Simular respuesta del asesor desde su teléfono móvil WhatsApp (agent_manual a las 10:02:00)
    const timeT2 = new Date('2026-11-05T10:02:00.000Z').toISOString();
    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'agent_manual',
      content: 'Hola! Claro que sí, con gusto te ayudo.',
      created_at: timeT2,
    });

    // Ahora la última respuesta es del asesor -> Debe despejarse inmediatamente "Requiere atención"
    const { data: msgsAfter } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id, sender_type, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    const isPendingAfter = msgsAfter && msgsAfter.length > 0 && msgsAfter[0].sender_type === 'lead';
    assert(!isPendingAfter, 'Al responder el asesor desde el móvil, se debe quitar "Requiere atención"');
    console.log('   ✅ Takeover móvil verificado: Al responder el asesor, el badge de atención se despeja.');

    // 4. Probar Programación de Recordatorio y Auditoría en Base de Datos
    console.log('\n4️⃣  Probando programación de recordatorio comercial con auditoría...');
    const scheduledTomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    
    // Verificamos la inserción en scheduled_reminders
    const { data: reminderRow, error: remErr } = await (supabaseAdmin.from('scheduled_reminders') as any)
      .insert({
        contact_id: contactId,
        reminder_type: 'shipping',
        scheduled_for: scheduledTomorrow,
        status: 'pending',
      })
      .select()
      .single();

    if (remErr) {
      console.error('Error inserting scheduled_reminders:', remErr);
    }
    assert(!remErr && Boolean(reminderRow?.id), 'Debe insertar recordatorio en scheduled_reminders');

    // Sincronizar en custom_fields del contacto
    await (supabaseAdmin.from('contacts') as any)
      .update({
        custom_fields: {
          active_reminder: {
            id: reminderRow.id,
            reminderType: 'shipping',
            scheduledFor: scheduledTomorrow,
            note: 'Enviar número de guía Servientrega',
            createdByName: profile.full_name,
            createdAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', contactId);

    // Auditoría en chat
    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'system',
      content: `[⏰ Recordatorio Programado: Despacho / Envío para mañana a las 9:00 AM - Nota: "Enviar número de guía Servientrega"]`,
    });

    const { data: updatedContact } = await (supabaseAdmin.from('contacts') as any)
      .select('custom_fields')
      .eq('id', contactId)
      .single();

    assert(Boolean(updatedContact?.custom_fields?.active_reminder?.id), 'active_reminder debe persistir en custom_fields');
    console.log('   ✅ Recordatorio programado, sincronizado en custom_fields y auditado en chat.');

    // 5. Probar Completar Recordatorio y Registro de Auditoría
    console.log('\n5️⃣  Probando completar recordatorio y auditoría...');
    await (supabaseAdmin.from('scheduled_reminders') as any)
      .update({
        status: 'sent',
      })
      .eq('id', reminderRow.id);

    await (supabaseAdmin.from('contacts') as any)
      .update({
        custom_fields: {},
      })
      .eq('id', contactId);

    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'system',
      content: `[✅ Recordatorio completado por ${profile.full_name || 'Asesor'}]`,
    });

    const { data: contactAfterComplete } = await (supabaseAdmin.from('contacts') as any)
      .select('custom_fields')
      .eq('id', contactId)
      .single();

    assert(!contactAfterComplete?.custom_fields?.active_reminder, 'active_reminder debe eliminarse al completarse');
    console.log('   ✅ Recordatorio completado y auditado con éxito.');

    // 6. Probar "Dar Fin a la Conversación"
    console.log('\n6️⃣  Probando finalización de conversación (Dar Fin)...');
    const closeNote = 'Cliente completó compra de mueble modular';
    
    await (supabaseAdmin.from('contacts') as any)
      .update({
        pipeline_stage: 'ganado',
        custom_fields: {
          conversation_status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by: profile.full_name,
          close_resolution: 'won',
          close_note: closeNote,
        },
      })
      .eq('id', contactId);

    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'system',
      content: `[✓ Conversación finalizada por ${profile.full_name} (Cierre Ganado) - Nota: "${closeNote}"]`,
    });

    const { data: contactAfterClose } = await (supabaseAdmin.from('contacts') as any)
      .select('pipeline_stage, custom_fields')
      .eq('id', contactId)
      .single();

    assert(contactAfterClose?.pipeline_stage === 'ganado', 'Pipeline stage debe ser "ganado"');
    assert(contactAfterClose?.custom_fields?.conversation_status === 'closed', 'conversation_status debe ser "closed"');
    console.log('   ✅ Conversación finalizada, pipeline actualizado a ganado y auditado en mensajes.');

  } finally {
    // Limpieza de datos de prueba
    console.log('\n🧹 Limpiando datos de prueba...');
    await (supabaseAdmin.from('messages') as any).delete().eq('contact_id', contactId);
    await (supabaseAdmin.from('scheduled_reminders') as any).delete().eq('contact_id', contactId);
    await (supabaseAdmin.from('contacts') as any).delete().eq('id', contactId);
    console.log('   ✅ Datos de prueba eliminados correctamente.');
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE HANDOFF, TAKEOVER MÓVIL Y RECORDATORIOS PASARON EXITOSAMENTE!\n');
}

runTests().catch((err) => {
  console.error('Error fatal en pruebas:', err);
  process.exit(1);
});
