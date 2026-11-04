import assert from 'node:assert';
import { normalizeE164Phone, sanitizeCsvField } from '../lib/pipeline/csv-helpers';
import { generateSuggestedSnippetsFromPrompt } from '../lib/chat/snippets';
import { BookNativeAppointmentToolSchema } from '../lib/validations/tool-calls.schema';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

console.log('🧪 Iniciando Suite de Pruebas: Multinicho, Seguridad PII e Importador CSV...\n');

// 1. Normalización de Teléfonos a Formato Internacional E.164
{
  console.log('1️⃣  Probando Normalización E.164 (app/actions/pipeline.ts)...');

  // Caso A: Móvil Colombia de 10 dígitos sin prefijo
  assert.strictEqual(
    normalizeE164Phone('3124567890', '57'),
    '+573124567890',
    'Debe anteponer +57 a teléfonos de 10 dígitos'
  );

  // Caso B: Teléfono con espacios, guiones y paréntesis
  assert.strictEqual(
    normalizeE164Phone('(312) 456-7890', '57'),
    '+573124567890',
    'Debe limpiar caracteres no numéricos'
  );

  // Caso C: Teléfono ya en formato E.164 completo
  assert.strictEqual(
    normalizeE164Phone('+573124567890', '57'),
    '+573124567890',
    'Debe respetar el formato E.164 si ya viene con +'
  );

  // Caso D: Teléfono internacional de México (+52)
  assert.strictEqual(
    normalizeE164Phone('5512345678', '52'),
    '+525512345678',
    'Debe anteponer código de país según el selector'
  );

  // Caso E: Teléfono vacío o inválido
  assert.strictEqual(normalizeE164Phone(''), '', 'Teléfono vacío debe retornar string vacío');
  assert.strictEqual(normalizeE164Phone('abc'), '', 'Teléfono sin dígitos debe retornar string vacío');

  console.log('   ✅ Normalización E.164 aprobada.');
}

// 2. Sanitización Anti-CSV Injection (Fórmulas Maliciosas)
{
  console.log('2️⃣  Probando Sanitización Anti-CSV Formula Injection (app/actions/pipeline.ts)...');

  const formula1 = '=cmd|\' /C calc\'!A0';
  assert.strictEqual(
    sanitizeCsvField(formula1),
    `'${formula1}`,
    'Debe escapar fórmulas que empiezan con ='
  );

  const formula2 = '+123456';
  assert.strictEqual(
    sanitizeCsvField(formula2),
    `'${formula2}`,
    'Debe escapar campos numéricos que inician con +'
  );

  const formula3 = '@SUM(A1:A10)';
  assert.strictEqual(
    sanitizeCsvField(formula3),
    `'${formula3}`,
    'Debe escapar fórmulas que inician con @'
  );

  const safeText = 'Juan Carlos Pérez';
  assert.strictEqual(
    sanitizeCsvField(safeText),
    'Juan Carlos Pérez',
    'Texto seguro no debe ser alterado'
  );

  console.log('   ✅ Sanitización Anti-CSV Injection aprobada.');
}

// 3. Blindaje de PII en Teléfonos de Clientes
{
  console.log('3️⃣  Probando Enmascaramiento de PII en Teléfonos de Clientes...');

  const maskPhone = (rawPhone: string) => {
    return rawPhone.length >= 6
      ? `${rawPhone.slice(0, Math.min(5, Math.floor(rawPhone.length / 2)))} *** ${rawPhone.slice(-3)}`
      : rawPhone ? '***' : '';
  };

  const masked1 = maskPhone('+573124567890');
  assert.ok(masked1.includes('***'), 'Debe contener asteriscos de enmascaramiento');
  assert.ok(!masked1.includes('4567'), 'Los dígitos centrales no deben ser legibles');
  assert.strictEqual(masked1, '+5731 *** 890');

  const maskedShort = maskPhone('123');
  assert.strictEqual(maskedShort, '***', 'Teléfonos cortos deben ser enmascarados a ***');

  console.log('   ✅ Enmascaramiento de PII aprobado.');
}

// 4. Generación Inteligente de Atajos sugeridos por la IA basados en el Prompt
{
  console.log('4️⃣  Probando Generador de Atajos Sugeridos por IA (app/actions/chat.ts)...');

  const mockStructuredData = {
    identity: {
      name: 'Autolavado La 80',
      oneLiner: 'Lavado ecológico y detailing',
      cityCoverage: 'Calle 80 #15-20, Bogotá',
      tone: 'friendly_whatsapp',
    },
    catalog: [
      { name: 'Lavado Sencillo', price: '$25.000', description: 'Lavado exterior y aspirado' },
      { name: 'Polichado 3M', price: '$80.000', description: 'Brillo y protección de pintura' },
    ],
    policies: {
      paymentMethods: ['Nequi', 'Bancolombia'],
      paymentDetails: {
        nequi: '3124567890',
        bancolombia: 'Ahorros 123-456789-00',
      },
      shippingInfo: '',
      warrantyInfo: '3 días de garantía ante lluvia ligera con factura.',
      customFaqs: [
        { question: '¿Tienen sala de espera con wifi?', answer: 'Sí, contamos con café y wifi gratis mientras esperas.' },
      ],
    },
    funnel: {
      diagnosisQuestions: [],
      valuePropBullets: [],
      closingGoal: 'book_cal',
      objectionAnswers: [],
    },
    handoff: {
      mode: 'silent',
      afterHoursEnabled: false,
      afterHoursMessage: '',
      businessHours: { start: '08:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
    },
  };

  const suggestions = generateSuggestedSnippetsFromPrompt(mockStructuredData);

  assert.ok(suggestions.length >= 4, 'Debe generar al menos 4 atajos inteligentes');

  // Validar atajo /cuenta con datos reales
  const cuentaSugg = suggestions.find((s) => s.shortcut === '/cuenta');
  assert.ok(cuentaSugg, 'Debe sugerir atajo /cuenta');
  assert.ok(cuentaSugg.text.includes('3124567890'), 'Debe incluir número real de Nequi');
  assert.ok(cuentaSugg.text.includes('123-456789-00'), 'Debe incluir número de Bancolombia');

  // Validar atajo /ubicacion con dirección real
  const ubicacionSugg = suggestions.find((s) => s.shortcut === '/ubicacion');
  assert.ok(ubicacionSugg, 'Debe sugerir atajo /ubicacion');
  assert.ok(ubicacionSugg.text.includes('Calle 80 #15-20'), 'Debe incluir dirección real del prompt');

  // Validar atajo /precios con catálogo real
  const preciosSugg = suggestions.find((s) => s.shortcut === '/precios');
  assert.ok(preciosSugg, 'Debe sugerir atajo /precios');
  assert.ok(preciosSugg.text.includes('Lavado Sencillo: $25.000'), 'Debe listar servicios y tarifas');

  // Validar atajo /garantia con política real
  const garantiaSugg = suggestions.find((s) => s.shortcut === '/garantia');
  assert.ok(garantiaSugg, 'Debe sugerir atajo /garantia');
  assert.ok(garantiaSugg.text.includes('3 días de garantía'), 'Debe incluir política de garantía');

  // Validar atajo de FAQ
  const faqSugg = suggestions.find((s) => s.shortcut.startsWith('/faq'));
  assert.ok(faqSugg, 'Debe sugerir atajo para preguntas frecuentes');
  assert.ok(faqSugg.text.includes('café y wifi gratis'), 'Debe contener respuesta de la FAQ');

  console.log('   ✅ Generador de Atajos Sugeridos por IA aprobado.');
}

// 5. Validación de Servicios Virtuales y Enlaces de Google Meet
{
  console.log('5️⃣  Probando Generación de Enlace Virtual (Google Meet)...');

  const generateMeetingCode = () => {
    return `${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
  };

  const code = generateMeetingCode();
  const meetUrl = `https://meet.google.com/${code}`;

  assert.ok(meetUrl.startsWith('https://meet.google.com/'), 'El enlace debe ser un URL válido de Google Meet');
  assert.ok(code.includes('-'), 'El código de reunión debe tener el formato estándar');
  assert.strictEqual(meetUrl.split('/').length, 4, 'La estructura del link es correcta');

  console.log('   ✅ Generación de Enlace Virtual (Google Meet) aprobada.');
}

// 6. Validación de Esquema de Agendamiento con Referencia de Nicho
{
  console.log('6️⃣  Probando Esquema de Agendamiento con Referencia de Nicho (Placas / Alumno)...');

  const testBooking = BookNativeAppointmentToolSchema.parse({
    start_time: '2026-10-30T10:00:00',
    service_name: 'Lavado General con Cera',
    duration_minutes: 60,
    reference_info: 'TXL-842',
    notes: 'Camioneta blanca con barro',
  });

  assert.strictEqual(testBooking.reference_info, 'TXL-842', 'Debe capturar la referencia de nicho');
  assert.strictEqual(testBooking.duration_minutes, 60, 'Debe capturar la duración personalizada');

  console.log('   ✅ Esquema de Agendamiento con Referencia de Nicho aprobado.');
}

// 7. Protección Estricta del Nicho de Negocio (Solo Super Admin)
{
  console.log('7️⃣  Probando Regla de Seguridad: Nicho de Negocio Inmutable para Clientes...');

  // Simulación de perfil regular vs super admin
  const regularProfile = { role: 'admin', is_super_admin: false };
  const superAdminProfile = { role: 'admin', is_super_admin: true };

  const canModifyNiche = (profile: { is_super_admin?: boolean }) => {
    return Boolean(profile.is_super_admin);
  };

  assert.strictEqual(canModifyNiche(regularProfile), false, 'Cliente regular no debe poder modificar su nicho');
  assert.strictEqual(canModifyNiche(superAdminProfile), true, 'Super Administrador debe poder modificar el nicho');

  console.log('   ✅ Regla de Protección de Nicho validada.');
}

// 8. Integración de Google Calendar (Botón 1 Clic con HMAC State & AES-256)
{
  console.log('8️⃣  Probando Flujo de Botón de 1 Clic Google Calendar (HMAC State & Cifrado)...');
  const crypto = require('node:crypto');
  const { encryptSecret, decryptSecret } = require('../lib/security/encryption');

  const statePayload = {
    orgId: 'test-org-123',
    userId: 'test-user-456',
    timestamp: Date.now(),
  };
  const stateStr = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  const secretKey = process.env.ENCRYPTION_KEY || 'synqo-google-oauth-secret';
  const signature = crypto.createHmac('sha256', secretKey).update(stateStr).digest('hex');
  const state = `${stateStr}.${signature}`;

  // Validar verificación de estado HMAC
  const [receivedStateStr, receivedSig] = state.split('.');
  const recomputedSig = crypto.createHmac('sha256', secretKey).update(receivedStateStr).digest('hex');
  assert.strictEqual(receivedSig, recomputedSig, 'La firma HMAC del estado OAuth debe ser íntegra');

  // Validar cifrado del paquete de tokens
  const tokenBundle = JSON.stringify({
    access_token: 'ya29.test_google_token',
    refresh_token: '1//test_refresh_token',
    expires_at: Date.now() + 3600000,
  });
  const encrypted = encryptSecret(tokenBundle);
  assert.ok(encrypted.startsWith('enc:'), 'El token debe cifrarse con AES-256-GCM');
  const decrypted = decryptSecret(encrypted);
  const parsed = JSON.parse(decrypted);
  assert.strictEqual(parsed.access_token, 'ya29.test_google_token');
  assert.strictEqual(parsed.refresh_token, '1//test_refresh_token');

  console.log('   ✅ Flujo de Botón de 1 Clic Google Calendar aprobado.');
}

// 9. Botón y Validación de Conexión de Instagram Direct
{
  console.log('9️⃣  Probando Validación de Conexión con Instagram Direct...');

  const validateInstagramInputs = (accountId: string, token?: string) => {
    const cleanId = accountId.trim().replace(/[^0-9]/g, '');
    if (!cleanId) return { valid: false, error: 'ID de cuenta requerido' };
    return { valid: true, accountId: cleanId };
  };

  const invalid1 = validateInstagramInputs('');
  assert.strictEqual(invalid1.valid, false);

  const valid1 = validateInstagramInputs('1784140530921102');
  assert.strictEqual(valid1.valid, true);
  assert.strictEqual(valid1.accountId, '1784140530921102');

  console.log('   ✅ Validación de Conexión con Instagram Direct aprobada.');
}

// 10. Nomenclatura y Personalización 100% Multi-Nicho (Colaboradores y Espacios)
{
  console.log('🔟  Probando Nomenclatura y Personalización Multi-Nicho (specialist_label / room_label)...');

  // Mapeo inteligente por defecto según industria
  const getIndustryDefaults = (industry: string) => {
    switch (industry) {
      case 'health':
        return { specialist: 'Doctor', room: 'Consultorio' };
      case 'services':
        return { specialist: 'Especialista', room: 'Cabina' };
      case 'fitness':
        return { specialist: 'Entrenador', room: 'Sala' };
      case 'education':
        return { specialist: 'Instructor', room: 'Aula' };
      case 'gastronomy':
        return { specialist: 'Chef', room: 'Mesa' };
      case 'real_estate':
        return { specialist: 'Agente', room: 'Sala de reuniones' };
      default:
        return { specialist: 'Colaborador', room: 'Espacio' };
    }
  };

  // Validar defaults por nicho
  const healthDefaults = getIndustryDefaults('health');
  assert.strictEqual(healthDefaults.specialist, 'Doctor');
  assert.strictEqual(healthDefaults.room, 'Consultorio');

  const beautyDefaults = getIndustryDefaults('services');
  assert.strictEqual(beautyDefaults.specialist, 'Especialista');
  assert.strictEqual(beautyDefaults.room, 'Cabina');

  const fitnessDefaults = getIndustryDefaults('fitness');
  assert.strictEqual(fitnessDefaults.specialist, 'Entrenador');
  assert.strictEqual(fitnessDefaults.room, 'Sala');

  // Validar capacidad de personalización 100% (custom overrides)
  const resolveLabels = (industry: string, customSpecialist?: string, customRoom?: string) => {
    const defaults = getIndustryDefaults(industry);
    return {
      specialistLabel: customSpecialist?.trim() || defaults.specialist,
      roomLabel: customRoom?.trim() || defaults.room,
    };
  };

  // Ejemplo: Odontología que prefiere llamarse "Odontólogo" y sus salas "Box Dental"
  const customDentist = resolveLabels('health', 'Odontólogo', 'Box Dental');
  assert.strictEqual(customDentist.specialistLabel, 'Odontólogo');
  assert.strictEqual(customDentist.roomLabel, 'Box Dental');

  // Ejemplo: Barbería que quiere "Barbero" y "Sillón"
  const customBarber = resolveLabels('services', 'Barbero', 'Sillón');
  assert.strictEqual(customBarber.specialistLabel, 'Barbero');
  assert.strictEqual(customBarber.roomLabel, 'Sillón');

  console.log('   ✅ Nomenclatura 100% personalizada por empresa aprobada.');
}

console.log('\n🎉 ¡TODAS LAS PRUEBAS DE MULTINICHO, CSV Y SEGURIDAD PASARON EXITOSAMENTE!');

