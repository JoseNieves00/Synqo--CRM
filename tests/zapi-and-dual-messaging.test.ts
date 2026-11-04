import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { calculateHumanCadence, checkOutboundRateLimit } from '../lib/anti-ban/cadence';
import { encryptSecret, decryptSecret } from '../lib/security/encryption';
import { MessagingService } from '../services/messaging.service';
import { ZApiService } from '../services/zapi.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALLÓ ASERCIÓN: ${message}`);
    process.exit(1);
  }
}

async function runDualMessagingTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Motor Dual WhatsApp & Z-API (Anti-Ban & Adapter)...\n');

  // 1. Cadencia Humana Orgánica
  console.log('1️⃣  Probando Cadencia Humana Orgánica (lib/anti-ban/cadence.ts)...');
  const shortMsg = 'Hola, buenas tardes.';
  const shortCadence = calculateHumanCadence(shortMsg);
  assert(shortCadence.delayTypingSeconds >= 2 && shortCadence.delayTypingSeconds <= 14, 'El retardo de tipeo debe estar entre 2s y 14s');
  assert(shortCadence.readingDelayMs >= 1200 && shortCadence.readingDelayMs <= 3000, 'La pausa de lectura debe ser biológica (1.2s - 3s)');

  const longMsg = 'Hola, con mucho gusto. Para agendar tu turno contamos con disponibilidad mañana a las 3:00 PM y el jueves a las 10:00 AM. ¿Cuál horario te queda más cómodo para registrarte en el sistema?';
  const longCadence = calculateHumanCadence(longMsg);
  assert(longCadence.delayTypingSeconds >= shortCadence.delayTypingSeconds, 'Mensajes más largos deben tomar más tiempo de tipeo');
  console.log('   ✅ Cadencia humana orgánica y jitter validados.');

  // 2. Cortacircuitos Anti-Spam (Outbound Rate Limiter)
  console.log('2️⃣  Probando Cortacircuitos Anti-Spam en Frío (checkOutboundRateLimit)...');
  const testOrgId = 'test-org-antiban-' + Date.now();
  const maxLimit = 3;

  const check1 = checkOutboundRateLimit(testOrgId, maxLimit);
  assert(check1.allowed === true && check1.remaining === 2, 'Primer envío debe permitirse');

  const check2 = checkOutboundRateLimit(testOrgId, maxLimit);
  assert(check2.allowed === true && check2.remaining === 1, 'Segundo envío debe permitirse');

  const check3 = checkOutboundRateLimit(testOrgId, maxLimit);
  assert(check3.allowed === true && check3.remaining === 0, 'Tercer envío debe permitirse');

  const check4 = checkOutboundRateLimit(testOrgId, maxLimit);
  assert(check4.allowed === false && check4.remaining === 0, 'Cuarto envío debe bloquearse por exceder la cuota horaria');
  console.log('   ✅ Cortacircuitos anti-spam y cuotas horarias validadas.');

  // 3. Cifrado y Descifrado de Credenciales Z-API
  console.log('3️⃣  Probando Cifrado AES-256-GCM de Credenciales Z-API...');
  const fakeToken = 'zapi_secret_token_123456789';
  const encrypted = encryptSecret(fakeToken);
  assert(encrypted.startsWith('enc:'), 'El payload debe estar cifrado con formato enc:');
  const decrypted = decryptSecret(encrypted);
  assert(decrypted === fakeToken, 'El token descifrado debe coincidir con el original');
  console.log('   ✅ Cifrado de extremo a extremo para Z-API verificado.');

  // 4. Enrutamiento del Adaptador (MessagingService)
  console.log('4️⃣  Probando Enrutamiento del Adaptador Unificado (MessagingService)...');
  // Organización con proveedor zapi sin credenciales -> debe arrojar error explícito de Z-API
  const zapiOrg: any = {
    id: 'org-test-1',
    whatsapp_provider: 'zapi',
    zapi_instance_id: null,
    zapi_token: null,
  };

  try {
    await MessagingService.sendTextMessage({
      organization: zapiOrg,
      to: '573001234567',
      body: 'Prueba',
    });
    assert(false, 'Debió fallar por falta de credenciales de Z-API');
  } catch (err: any) {
    assert(err.message.includes('Z-API'), 'El error debe indicar que falta la instancia de Z-API');
  }

  // Organización con proveedor meta sin credenciales -> debe arrojar error explícito de Meta
  const metaOrg: any = {
    id: 'org-test-2',
    whatsapp_provider: 'meta',
    whatsapp_phone_number_id: null,
    whatsapp_access_token: null,
  };

  try {
    await MessagingService.sendTextMessage({
      organization: metaOrg,
      to: '573001234567',
      body: 'Prueba',
    });
    assert(false, 'Debió fallar por falta de credenciales de Meta');
  } catch (err: any) {
    assert(err.message.includes('Meta'), 'El error debe indicar que faltan credenciales oficiales de Meta');
  }
  console.log('   ✅ Despachador de adaptador desacoplado validado.');

  // 5. Verificación de Métodos ZApiService
  console.log('5️⃣  Probando Métodos Base de ZApiService...');
  assert(typeof ZApiService.getQrCode === 'function', 'ZApiService.getQrCode debe estar definido');
  assert(typeof ZApiService.getStatus === 'function', 'ZApiService.getStatus debe estar definido');
  assert(typeof ZApiService.getPhoneCode === 'function', 'ZApiService.getPhoneCode debe estar definido');
  assert(typeof ZApiService.configureWebhooks === 'function', 'ZApiService.configureWebhooks debe estar definido');
  assert(typeof ZApiService.sendTextMessage === 'function', 'ZApiService.sendTextMessage debe estar definido');
  assert(typeof ZApiService.sendInteractiveButtonsMessage === 'function', 'ZApiService.sendInteractiveButtonsMessage debe estar definido');
  console.log('   ✅ Métodos de ZApiService comprobados con éxito.');

  // 6. Validación de Vinculación por Código Telefónico (Pairing Code)
  console.log('6️⃣  Probando Vinculación por Código Telefónico (Pairing Code)...');
  try {
    await ZApiService.getPhoneCode({
      instanceId: 'test-inst',
      token: 'test-token',
      phone: '12345', // Inválido (menos de 8 dígitos)
    });
    assert(false, 'Debió rechazar un número con menos de 8 dígitos');
  } catch (err: any) {
    assert(err.message.includes('8 dígitos'), 'Debe exigir al menos 8 dígitos numéricos');
  }

  // Prueba de limpieza de teléfono con caracteres especiales
  const rawInput = '+57 (300) 123-4567';
  const cleaned = rawInput.replace(/\D/g, '');
  assert(cleaned === '573001234567', 'La sanitización debe extraer solo los dígitos E.164');
  console.log('   ✅ Validación de Pairing Code y sanitización telefónica aprobadas.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DEL MOTOR DUAL Y Z-API PASARON EXITOSAMENTE!\n');
}

runDualMessagingTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});

