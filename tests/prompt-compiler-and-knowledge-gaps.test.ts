import assert from 'node:assert';
import {
  INDUSTRY_BLUEPRINTS,
  compileStructuredPrompt,
  appendKnowledgeToPrompt,
  IndustryPreset,
} from '../lib/ai/prompt-compiler';

async function runPromptAndKnowledgeGapTests() {
  console.log('\n🚀 Iniciando Suite de Pruebas: Compilador Multinicho, Blueprints y Vacíos de Conocimiento...\n');

  // 1. Probar que las 5 industrias modelo generen estructuras completas
  console.log('1️⃣  Probando generación de los 5 Blueprints de Industria...');
  const presets: IndustryPreset[] = ['services', 'ecommerce', 'health', 'real_estate', 'gastronomy'];

  for (const preset of presets) {
    const generator = INDUSTRY_BLUEPRINTS[preset];
    assert.ok(generator, `Generador para ${preset} debe existir`);

    const data = generator('Empresa de Prueba ' + preset);
    assert.strictEqual(data.preset, preset, `Preset debe coincidir con ${preset}`);
    assert.ok(data.catalog.length > 0, `Catálogo de ${preset} debe tener al menos 1 producto`);
    assert.ok(data.funnel.diagnosisQuestions.length > 0, `Diagnóstico de ${preset} debe tener preguntas`);
    assert.ok(data.policies.paymentMethods.length > 0, `Políticas de ${preset} deben tener métodos de pago`);

    const compiledXml = compileStructuredPrompt(data);
    assert.ok(compiledXml.includes('<perfil_empresa>'), `XML de ${preset} debe tener <perfil_empresa>`);
    assert.ok(compiledXml.includes('<catalogo_oferta>'), `XML de ${preset} debe tener <catalogo_oferta>`);
    assert.ok(compiledXml.includes('<ruta_de_compra>'), `XML de ${preset} debe tener <ruta_de_compra>`);
    assert.ok(compiledXml.includes('<politicas_y_faq>'), `XML de ${preset} debe tener <politicas_y_faq>`);
    assert.ok(compiledXml.includes('<reglas_estrictas>'), `XML de ${preset} debe tener <reglas_estrictas>`);
    assert.ok(compiledXml.includes('BLINDAJE FINANCIERO'), `XML de ${preset} debe incluir reglas de blindaje financiero`);

    console.log(`   ✅ Blueprint "${preset}" compilado exitosamente con delimitadores XML.`);
  }

  // 2. Probar anexado atómico de respuestas en el bloque <politicas_y_faq>
  console.log('\n2️⃣  Probando Bucle de Aprendizaje (appendKnowledgeToPrompt)...');
  const baseData = INDUSTRY_BLUEPRINTS.ecommerce('Tienda Filippo');
  const baseXml = compileStructuredPrompt(baseData);

  const newQuestion = '¿Tienen servicio de entrega contra entrega en Bucaramanga?';
  const newAnswer = 'Sí, enviamos a Bucaramanga con pago contra entrega en 2 a 3 días hábiles.';

  const updatedXml = appendKnowledgeToPrompt(baseXml, newQuestion, newAnswer);

  assert.ok(updatedXml.includes(newQuestion), 'El prompt actualizado debe contener la nueva pregunta');
  assert.ok(updatedXml.includes(newAnswer), 'El prompt actualizado debe contener la nueva respuesta');
  assert.ok(updatedXml.indexOf(newQuestion) < updatedXml.indexOf('</politicas_y_faq>'), 'La pregunta debe insertarse dentro de <politicas_y_faq>');
  console.log('   ✅ Aprendizaje continuo verificado: La Q&A fue inyectada en <politicas_y_faq>.');

  // 3. Probar anexado en prompts legacy o texto libre sin etiquetas XML
  console.log('\n3️⃣  Probando fallback de aprendizaje en prompts sin XML...');
  const legacyPrompt = 'Eres un asesor de ventas de una ferretería.';
  const updatedLegacy = appendKnowledgeToPrompt(legacyPrompt, '¿Venden cemento gris?', 'Sí, bulto de 50kg a $32.000 COP.');
  assert.ok(updatedLegacy.includes('¿Venden cemento gris?'), 'Debe anexar pregunta en prompt legacy');
  assert.ok(updatedLegacy.includes('$32.000 COP'), 'Debe anexar respuesta en prompt legacy');
  console.log('   ✅ Fallback para prompts de texto libre verificado con éxito.');

  // 4. Probar configuración de Relevo Silencioso (Silent Handoff)
  console.log('\n4️⃣  Probando directriz de Relevo Silencioso en el System Prompt...');
  const silentData = INDUSTRY_BLUEPRINTS.services('Agencia Synqo');
  silentData.handoff.mode = 'silent';
  const silentXml = compileStructuredPrompt(silentData);
  assert.ok(silentXml.includes('relevo silencioso (request_human_handoff), NO agregues mensajes largos'), 'Debe incluir directriz de silencio');

  const messageData = INDUSTRY_BLUEPRINTS.services('Agencia Synqo');
  messageData.handoff.mode = 'message';
  const messageXml = compileStructuredPrompt(messageData);
  assert.ok(messageXml.includes('indícale al cliente de forma natural que vas a consultar el dato'), 'Debe incluir directriz con mensaje de espera');
  console.log('   ✅ Directrices de Relevo Silencioso vs Mensaje verificadas.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE PROMPT COMPILER, MULTINICHO Y GAPS PASARON EXITOSAMENTE!\n');
}

runPromptAndKnowledgeGapTests().catch((err) => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

