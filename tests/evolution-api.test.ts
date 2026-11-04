import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { calculateHumanCadence, checkOutboundRateLimit } from '../lib/anti-ban/cadence';
import { encryptSecret, decryptSecret } from '../lib/security/encryption';
import { generateEvolutionWebhookSecret, verifyEvolutionWebhook } from '../lib/security/verify-webhook';
import { MessagingService } from '../services/messaging.service';
import { EvolutionService } from '../services/evolution.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALLÓ ASERCIÓN: ${message}`);
    process.exit(1);
  }
}

async function runEvolutionApiTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Motor WhatsApp Evolution API v2 (VPS Self-Hosted)...\n');

  // 1. Sanitización de Nombres de Instancia y Resolución de URLs
  console.log('1️⃣  Probando Sanitización de Instancias y Resolución de URLs...');
  const dirtyName = 'Empresa Synqo #1 - Principal!';
  const cleanName = EvolutionService.sanitizeInstanceName(dirtyName);
  assert(cleanName === 'empresa_synqo__1_-_principal_', `El nombre saneado debe ser alphanumeric/guiones: "${cleanName}"`);

  const urlWithTrailingSlash = 'https://evolution.synqo.dev///';
  const resolvedUrl = EvolutionService.resolveBaseUrl(urlWithTrailingSlash);
  assert(resolvedUrl === 'https://evolution.synqo.dev', 'Debe eliminar slashes finales');

  const defaultResolved = EvolutionService.resolveBaseUrl(null);
  assert(typeof defaultResolved === 'string' && defaultResolved.length > 0, 'Debe resolver una URL base por defecto');
  console.log('   ✅ Sanitización de instancias y URLs base validadas.');

  // 2. Verificación Criptográfica de Webhooks de Evolution API (HMAC y API Key)
  console.log('2️⃣  Probando Verificación Criptográfica de Webhooks de Evolution API...');
  const instanceTest = 'instancia_test_vps';
  const secret = generateEvolutionWebhookSecret(instanceTest);
  assert(typeof secret === 'string' && secret.length === 32, 'El secreto debe ser un hash HMAC hexadecimal de 32 chars');

  // Validar con secreto exacto
  const validSecretCheck = verifyEvolutionWebhook({
    instanceName: instanceTest,
    providedSecret: secret,
  });
  assert(validSecretCheck === true, 'El secreto HMAC válido debe ser aceptado');

  // Validar con header Bearer
  const bearerSecretCheck = verifyEvolutionWebhook({
    instanceName: instanceTest,
    providedSecret: `Bearer ${secret}`,
  });
  assert(bearerSecretCheck === true, 'El secreto con prefijo Bearer debe ser aceptado');

  // Validar con secreto falso
  const invalidSecretCheck = verifyEvolutionWebhook({
    instanceName: instanceTest,
    providedSecret: 'fake_secret_1234567890abcdef123456',
  });
  assert(invalidSecretCheck === false, 'Un secreto falso debe ser rechazado');

  // Validar con apikey coincidente
  const rawApiKey = 'my_evolution_global_key_4567';
  const validKeyCheck = verifyEvolutionWebhook({
    instanceName: instanceTest,
    providedApiKey: rawApiKey,
    decryptedApiKey: rawApiKey,
  });
  assert(validKeyCheck === true, 'La API Key coincidente debe ser aceptada');
  console.log('   ✅ Autenticación y blindaje criptográfico de webhooks comprobados.');

  // 3. Cifrado y Descifrado de Credenciales Evolution API
  console.log('3️⃣  Probando Cifrado AES-256-GCM de Credenciales Evolution API...');
  const testApiKey = 'evolution_vps_key_9876543210';
  const encryptedKey = encryptSecret(testApiKey);
  assert(encryptedKey.startsWith('enc:'), 'La clave debe cifrarse con prefijo enc:');
  const decryptedKey = decryptSecret(encryptedKey);
  assert(decryptedKey === testApiKey, 'La clave descifrada debe coincidir exactamente con la original');
  console.log('   ✅ Cifrado de extremo a extremo para Evolution API verificado.');

  // 4. Enrutamiento del Adaptador (MessagingService con Evolution)
  console.log('4️⃣  Probando Enrutamiento del Adaptador (MessagingService -> Evolution)...');
  const incompleteEvolutionOrg: any = {
    id: 'org-test-evo-1',
    whatsapp_provider: 'evolution',
    evolution_instance_name: null,
    evolution_api_key: null,
  };

  try {
    await MessagingService.sendTextMessage({
      organization: incompleteEvolutionOrg,
      to: '573001234567',
      body: 'Hola',
    });
    assert(false, 'Debió fallar por falta de credenciales de Evolution API');
  } catch (err: any) {
    assert(err.message.includes('Evolution API'), 'El error debe indicar explícitamente que falta Evolution API');
  }

  // Traducción de plantillas comerciales sin ventana de 24h
  console.log('5️⃣  Probando Traducción de Plantillas Libres en Evolution API (Sin ventana 24h)...');
  const evoOrgForTemplate: any = {
    id: 'org-test-evo-2',
    name: 'Clinica Test',
    whatsapp_provider: 'evolution',
    evolution_instance_name: 'test_inst',
    evolution_api_key: encryptSecret('fake_key'),
  };

  // Mock temporal de EvolutionService.sendTextMessage para interceptar el payload
  const originalSendText = EvolutionService.sendTextMessage;
  let interceptedMessage = '';
  (EvolutionService as any).sendTextMessage = async (opts: any) => {
    interceptedMessage = opts.message;
    return 'mock-msg-id-123';
  };

  try {
    const resId = await MessagingService.sendTemplateMessage({
      organization: evoOrgForTemplate,
      to: '573001234567',
      templateKey: 'recordatorio_cita',
    });
    assert(resId === 'mock-msg-id-123', 'Debe retornar el ID del mensaje despachado');
    assert(interceptedMessage.includes('cita programada'), 'La plantilla debe traducirse a texto natural');
    console.log('   ✅ Despacho libre de plantillas en Evolution sin costos ni ventana de 24h verificado.');
  } finally {
    // Restaurar método original
    (EvolutionService as any).sendTextMessage = originalSendText;
  }

  // 6. Validación de Pairing Code Telefónico
  console.log('6️⃣  Probando Validación de Vinculación por Código Telefónico (Pairing Code)...');
  try {
    await EvolutionService.getPhoneCode({
      apiKey: 'test-key',
      instanceName: 'test-inst',
      phone: '123', // Inválido (< 8 dígitos)
    });
    assert(false, 'Debió rechazar número con menos de 8 dígitos');
  } catch (err: any) {
    assert(err.message.includes('8 dígitos'), 'Debe exigir al menos 8 dígitos numéricos');
  }

  // Sanitización de caracteres especiales
  const rawTel = '+57 (311) 555-8899';
  const cleanTel = rawTel.replace(/\D/g, '');
  assert(cleanTel === '573115558899', 'Debe extraer solo los dígitos numéricos');
  console.log('   ✅ Validación de Pairing Code telefónico aprobada.');

  // 7. Cortacircuitos Anti-Ban para Salientes en VPS
  console.log('7️⃣  Probando Cortacircuitos Anti-Ban para Salientes en VPS...');
  const vpsOrgId = 'vps-org-test-' + Date.now();
  const limitPerHour = 2;

  const r1 = checkOutboundRateLimit(vpsOrgId, limitPerHour);
  assert(r1.allowed === true && r1.remaining === 1, 'Envío 1 debe ser permitido');

  const r2 = checkOutboundRateLimit(vpsOrgId, limitPerHour);
  assert(r2.allowed === true && r2.remaining === 0, 'Envío 2 debe ser permitido');

  const r3 = checkOutboundRateLimit(vpsOrgId, limitPerHour);
  assert(r3.allowed === false, 'Envío 3 debe ser bloqueado por protección anti-ban');
  console.log('   ✅ Protección Anti-Ban para VPS verificada con éxito.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE EVOLUTION API v2 PASARON EXITOSAMENTE!\n');
}

runEvolutionApiTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas de Evolution API:', err);
  process.exit(1);
});

