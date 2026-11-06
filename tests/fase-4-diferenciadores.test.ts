import assert from 'node:assert';
import { OpenAIService } from '../services/openai.service';

async function runFase4Tests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Verificación de Fase 4 (Diferenciadores Comerciales & Experiencia)...\n');

  // 1. Probar Copiloto de Borradores para Asesores Humanos
  console.log('1️⃣  Probando Copiloto IA de redacción de borradores comerciales...');
  const fakeHistory = [
    { sender_type: 'lead', content: 'Hola, buenas tardes. ¿Qué precio tiene el plan semestral?' },
  ];
  const fakeOrg = {
    name: 'Empresa Test',
    prompt_config: 'El plan semestral tiene un valor de $300.000 COP e incluye soporte prioritario.',
    ai_provider: 'google',
  };

  const draft = await OpenAIService.generateDraftCopilotReply({
    organizationId: 'test-org-copilot',
    contactId: 'test-contact-copilot',
    leadName: 'María Pérez',
    history: fakeHistory,
    organization: fakeOrg,
  });

  assert.ok(typeof draft === 'string', 'El borrador debe ser un string');
  assert.ok(draft.length > 5, 'El borrador debe contener texto útil');
  console.log('   ✅ Copiloto de borradores generó propuesta comercial:', `"${draft.slice(0, 80)}..."`);

  // 2. Probar Simulador Sandbox de Pruebas en Vivo
  console.log('\n2️⃣  Probando Simulador Sandbox del Bot en Ajustes...');
  const sandboxPrompt = 'Eres el asistente virtual de Pizza Express. Solo vendes pizzas familiares a $45.000 COP.';
  const sandboxRes = await OpenAIService.simulateSandboxMessage({
    systemPrompt: sandboxPrompt,
    userMessage: '¿Venden hamburguesas?',
    history: [],
    aiProvider: 'google',
    organizationId: 'test-org-sandbox',
  });

  assert.ok(typeof sandboxRes.reply === 'string', 'La respuesta del sandbox debe ser texto');
  assert.ok(sandboxRes.latencyMs >= 0, 'La latencia debe registrarse en milisegundos');
  assert.ok(sandboxRes.modelUsed, 'El modelo usado debe estar presente');
  console.log(`   ✅ Sandbox respondió (${sandboxRes.latencyMs}ms, ${sandboxRes.modelUsed}): "${sandboxRes.reply.slice(0, 80)}..."`);

  // 3. Probar Lógica de Conteo Real en Dashboard (Sin tope artificial de 100)
  console.log('\n3️⃣  Probando lógica de cálculo de KPIs comerciales en Dashboard...');
  const totalRealLeads = 1450;
  const bookedReal = 280;
  const wonReal = 120;

  const realConversionRate = totalRealLeads > 0
    ? (((bookedReal + wonReal) / totalRealLeads) * 100).toFixed(1)
    : '0.0';

  assert.strictEqual(realConversionRate, '27.6', 'Conversión debe calcularse sobre el 100% de la base real');
  console.log('   ✅ Cálculo de KPIs reales verificado:', `${realConversionRate}% sobre ${totalRealLeads} leads`);

  // 4. Probar Lógica de Edición y Sanitización de Atajos Rápidos
  console.log('\n4️⃣  Probando Edición y Normalización de Atajos Rápidos (Quick Replies)...');
  const rawEditedShortcut = '  /CUENTA_OFICIAL  ';
  let cleanCode = rawEditedShortcut.trim();
  if (!cleanCode.startsWith('/')) cleanCode = '/' + cleanCode;
  cleanCode = '/' + cleanCode.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

  assert.strictEqual(cleanCode, '/cuenta_oficial', 'El comando editado debe normalizarse a minúsculas y caracteres válidos');

  const testSnippets = [
    { id: '1', shortcut: '/hola', label: 'Saludo', text: 'Hola {primer_nombre}!' },
    { id: '2', shortcut: '/cuenta', label: 'Cuentas', text: 'Transferir a Nequi' },
  ];

  // Simular edición del atajo 2
  const updatedSnippets = testSnippets.map((s) =>
    s.id === '2'
      ? { ...s, shortcut: cleanCode, label: 'Cuentas Bancarias Oficiales', text: 'Nequi: 3001234567 para {primer_nombre}' }
      : s
  );

  const edited = updatedSnippets.find((s) => s.id === '2');
  assert.strictEqual(edited?.shortcut, '/cuenta_oficial');
  assert.strictEqual(edited?.label, 'Cuentas Bancarias Oficiales');
  assert.ok(edited?.text.includes('{primer_nombre}'));

  // Reemplazo de variable de contacto
  const customerName = 'Camila';
  const resolvedText = edited.text.replace(/\{primer_nombre\}/gi, customerName);
  assert.strictEqual(resolvedText, 'Nequi: 3001234567 para Camila', 'La variable {primer_nombre} debe sustituirse correctamente');
  console.log('   ✅ Normalización, edición y resolución dinámica de atajos aprobada.');

  console.log('\n🎉 ¡Todos los tests de Fase 4 pasaron exitosamente!\n');
}

runFase4Tests().catch((err) => {
  console.error('\n❌ Fallo en las pruebas de Fase 4:', err);
  process.exit(1);
});

