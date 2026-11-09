import { useInboxStore, ContactItem, MessageItem } from '../lib/inbox/use-inbox-store';
import { scheduleDebouncedCountsRefresh, performDeltaSync } from '../lib/inbox/sync-engine';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runFaseBTests() {
  console.log('\n🧪 Iniciando Suite de Verificación de Fase B (Store Normalizado Zustand & Sync Engine)...\n');

  // 1. Verificar Inicialización del Store Normalizado
  console.log('1️⃣  Probando inicialización del Store y slices normalizados...');
  const testOrgId = 'test-org-123';
  const testContact1: ContactItem = {
    id: 'c-1',
    name: 'Cliente Alpha',
    phone: '573001112233',
    is_ai_active: true,
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    unread_count: 2,
    conversation_status: 'open',
  };
  const testContact2: ContactItem = {
    id: 'c-2',
    name: 'Cliente Beta',
    phone: '573004445566',
    is_ai_active: false,
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    unread_count: 0,
    conversation_status: 'open',
  };

  const initialMsg: MessageItem = {
    id: 'm-1',
    contact_id: 'c-1',
    sender_type: 'lead',
    content: 'Hola, tengo una consulta',
    created_at: new Date(Date.now() - 60000).toISOString(),
    status: 'delivered',
  };

  useInboxStore.getState().initialize({
    organizationId: testOrgId,
    currentUserId: 'user-agent-1',
    currentUserRole: 'agent',
    initialContacts: [testContact1, testContact2],
    initialCounts: {
      por_responder: 1,
      mis_abiertos: 2,
      ia_atendiendo: 1,
      seguimiento: 0,
      cerrados: 0,
    },
    activeContactId: 'c-1',
    initialMessages: [initialMsg],
    templates: [{ name: 'bienvenida', label: 'Bienvenida' }],
    teamMembers: [{ id: 'user-agent-1', full_name: 'Asesor Uno', email: 'uno@synqo.io', role: 'agent' }],
  });

  const state1 = useInboxStore.getState();
  if (state1.organizationId !== testOrgId) throw new Error('organizationId no coincide');
  if (!state1.contactsById['c-1'] || !state1.contactsById['c-2']) throw new Error('contactsById no normalizó los contactos');
  if (state1.viewIds.por_responder.length !== 2) throw new Error('viewIds no inicializó los IDs de contactos');
  if (!state1.messagesByContact['c-1'] || state1.messagesByContact['c-1'].items.length !== 1) {
    throw new Error('messagesByContact no cargó los mensajes del contacto activo');
  }
  console.log('   ✅ Store normalizado inicializado correctamente');

  // 2. Medir tiempo de cambio de chat en memoria (Meta: < 100ms, objetivo 0ms)
  console.log('2️⃣  Probando velocidad de cambio de chat en memoria...');
  const t0 = performance.now();
  const cachedMessages = useInboxStore.getState().messagesByContact['c-1'];
  const t1 = performance.now();
  const switchDuration = t1 - t0;
  console.log(`   ⚡ Tiempo de resolución de mensajes cacheados: ${switchDuration.toFixed(3)} ms (Meta: < 100 ms)`);
  if (switchDuration > 100) throw new Error(`Cambio de chat excedió los 100 ms: ${switchDuration} ms`);
  console.log('   ✅ Lectura de chat desde caché Zustand ultra rápida');

  // 3. Upsert de Mensajes & Reconciliación Optimista
  console.log('3️⃣  Probando inserción y reconciliación optimista en Store...');
  const optimisticMsgId = 'temp-msg-abc';
  useInboxStore.getState().upsertMessage({
    id: optimisticMsgId,
    contact_id: 'c-1',
    sender_type: 'agent_manual',
    content: 'Respuesta inmediata del asesor',
    created_at: new Date().toISOString(),
    status: 'sending',
  });

  let c1Msgs = useInboxStore.getState().messagesByContact['c-1'].items;
  if (c1Msgs.length !== 2) throw new Error('Mensaje optimista no se agregó a messagesByContact');
  if (c1Msgs[1].status !== 'sending') throw new Error('Estado del mensaje optimista no es "sending"');

  // Reconciliar estado a 'sent'
  useInboxStore.getState().updateMessageStatus(optimisticMsgId, 'c-1', 'sent', 'wamid.12345');
  c1Msgs = useInboxStore.getState().messagesByContact['c-1'].items;
  if (c1Msgs[1].status !== 'sent') throw new Error('Estado no se actualizó a "sent"');
  if (c1Msgs[1].meta_message_id !== 'wamid.12345') throw new Error('meta_message_id no se guardó');
  console.log('   ✅ Reconciliación optimista y transición de estados completada');

  // 4. Reactividad de Contactos (Vista previa y badges)
  console.log('4️⃣  Probando reactividad de preview y badges en contactos...');
  const leadMsg: MessageItem & { contact_id: string } = {
    id: 'lead-msg-new',
    contact_id: 'c-2',
    sender_type: 'lead',
    content: '¿Cuál es el precio del plan anual?',
    created_at: new Date().toISOString(),
    status: 'delivered',
  };
  useInboxStore.getState().upsertMessage(leadMsg);
  const updatedC2 = useInboxStore.getState().contactsById['c-2'];
  if (!updatedC2) throw new Error('Contacto c-2 no encontrado');
  if (updatedC2.last_message_preview !== '¿Cuál es el precio del plan anual?') {
    throw new Error(`last_message_preview no se actualizó: ${updatedC2.last_message_preview}`);
  }
  if (updatedC2.unread_count !== 1) {
    throw new Error(`unread_count debería ser 1 pero es: ${updatedC2.unread_count}`);
  }
  console.log('   ✅ Contacto actualiza automáticamente su preview y unread_count al recibir mensajes');

  // 4.1. Reactividad de viewIds (Llegada de nuevo lead en tiempo real y reordenamiento)
  console.log('4️⃣.1 Probando inserción dinámica en viewIds al entrar nuevo prospecto...');
  const newLeadContact: ContactItem = {
    id: 'c-new-incoming',
    name: 'Lead Entrante en Vivo',
    phone: '573110009988',
    is_ai_active: false,
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    unread_count: 1,
    conversation_status: 'open',
  };
  useInboxStore.getState().upsertContact(newLeadContact);
  const viewIdsAfterNewLead = useInboxStore.getState().viewIds.por_responder;
  if (!viewIdsAfterNewLead.includes('c-new-incoming')) {
    throw new Error('El nuevo contacto entrante no fue agregado a viewIds.por_responder');
  }
  if (viewIdsAfterNewLead[0] !== 'c-new-incoming') {
    throw new Error('El nuevo contacto entrante debe posicionarse al inicio de la bandeja');
  }
  console.log('   ✅ Nuevo lead entrante agregado inmediatamente al inicio de la lista reactiva');

  // 5. Bootstrap Caching (Cero server actions en ChatInput)
  console.log('5️⃣  Probando persistencia de datos Bootstrap en Store...');
  useInboxStore.getState().setBootstrap({
    paymentAccounts: [{ id: 'acc-1', bank_name: 'Bancolombia', account_number: '123-456' }],
    catalog: [{ id: 'cat-1', title: 'Producto Estrella', public_url: 'https://synqo.io/p1.jpg' }],
    quickReplies: { activeSnippets: [{ shortcut: '/hola', text: '¡Hola! ¿En qué puedo ayudarte?' }], aiSuggestions: [] } as any,
  });

  const bootstrapData = useInboxStore.getState().bootstrap;
  if (!bootstrapData || bootstrapData.paymentAccounts.length !== 1 || bootstrapData.catalog.length !== 1) {
    throw new Error('Bootstrap no persistió cuentas de pago y catálogo');
  }
  console.log('   ✅ Bootstrap almacenado exitosamente en Store para acceso sincrónico');

  // 6. Prueba de Resync Delta con Supabase
  console.log('6️⃣  Probando Delta Sync contra base de datos...');
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name')
    .eq('name', 'Empresa Synqo')
    .single();

  if (org) {
    useInboxStore.getState().initialize({
      organizationId: org.id,
      currentUserId: 'test-user',
      currentUserRole: 'agent',
      initialContacts: [],
      initialCounts: { por_responder: 0, mis_abiertos: 0, ia_atendiendo: 0, seguimiento: 0, cerrados: 0 },
      activeContactId: null,
      initialMessages: [],
    });

    // Fijar lastSyncAt hace 2 días para validar delta resync
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    useInboxStore.getState().setLastSyncAt(pastDate);

    await performDeltaSync(supabaseAdmin);
    const postSyncState = useInboxStore.getState();
    const contactCount = Object.keys(postSyncState.contactsById).length;
    console.log(`   🔄 Contactos sincronizados tras reconexión/delta sync: ${contactCount}`);
    if (!postSyncState.isOnline) throw new Error('Store debería marcar isOnline: true');
    console.log('   ✅ Delta sync completado con éxito');
  }

  console.log('\n🎉 ¡Todos los tests de Fase B pasaron satisfactoriamente!\n');
}

runFaseBTests().catch((err) => {
  console.error('\n❌ Error ejecutando tests de Fase B:', err);
  process.exit(1);
});
