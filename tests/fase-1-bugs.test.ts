import assert from 'node:assert';
import { supabaseAdmin } from '../lib/supabase/admin';
import { completeContactReminder, cancelContactReminder } from '../app/actions/reminders';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { checkBackupTokenQuota } from '../lib/monitoring/token-tracker';
import { isWithin24HourWindow } from '../services/contact.service';

async function runFase1Tests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Verificación de Fase 1 (Bugs de Cara al Cliente)...\n');

  // 1. Probar que Google Meet no genera enlaces falsos aleatorios
  console.log('1️⃣  Probando eliminación de enlaces Google Meet ficticios...');
  const fakeMeet = GoogleCalendarService.generateDefaultMeetLink();
  assert.strictEqual(fakeMeet, null, 'generateDefaultMeetLink debe retornar null y no enlaces ficticios');
  console.log('   ✅ Eliminación de enlaces inventados de Meet verificada.');

  // 2. Probar Regex de Confirmación de Cita (Anti-Falsos Positivos)
  console.log('\n2️⃣  Probando regex refinada de confirmación de citas...');
  const confirmationPattern = /\b(si|confirmo|confirmado|confirmada|confirmar|alla\s+(estoy|nos\s+vemos|estare)|asistire|listo\s+confirmo)\b/i;
  const negationOrChangePattern = /\b(pero|cambiar|cambio|cancelar|cancela|otra fecha|otro dia|otra hora|no puedo|no voy|no llego|reprogramar|posponer)\b/i;
  const normalize = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const validConfirmations = [
    'Sí confirmo',
    'si por favor',
    'confirmado',
    'listo confirmo mi turno',
    'allá nos vemos',
    'asistiré',
    'sí',
  ];

  for (const text of validConfirmations) {
    const norm = normalize(text);
    const isConfirm = confirmationPattern.test(norm) && !negationOrChangePattern.test(norm);
    assert.strictEqual(isConfirm, true, `Debe confirmar el mensaje: "${text}"`);
  }

  const falsePositivesToReject = [
    'Sí, pero quiero cambiar la fecha',
    'si pero no puedo a esa hora',
    'si pero cancela por favor',
    'si pero me queda difícil ese día, reprogramar',
    'Sí, pero no llego a tiempo',
  ];

  for (const text of falsePositivesToReject) {
    const norm = normalize(text);
    const isConfirm = confirmationPattern.test(norm) && !negationOrChangePattern.test(norm);
    assert.strictEqual(isConfirm, false, `NO debe confirmar si hay intención de cambio o cancelación: "${text}"`);
  }
  console.log('   ✅ Filtro anti-falsos positivos de confirmación de citas aprobado.');

  // 3. Probar Guardrail Silencioso de IA (Anti-Apagado Involuntario)
  console.log('\n3️⃣  Probando regex refinada de guardrail silencioso...');
  const handoffPattern = /(asesor (se pondr[aá]|humano|comercial)|notificado a (nuestro|un) (asesor|equipo)|(transferir|transferirte|comunicarte|pasarte) con un (asesor|humano|agente|compañero)|pausad[ao] mis respuestas|consultar con (gerencia|bodega|despachos|el equipo) y (te responder[aá]|un asesor))/i;

  const innocentPhrases = [
    '¡Hola! Claro que sí, déjame revisar el catálogo para confirmarte los colores disponibles.',
    'Dame unos minutos mientras busco la información en el sistema.',
    'Déjame consultar la disponibilidad para ese modelo.',
    'Ya mismo te confirmo los precios de envío.',
  ];

  for (const phrase of innocentPhrases) {
    const isHandoff = handoffPattern.test(phrase);
    assert.strictEqual(isHandoff, false, `No debe clasificar como handoff una frase inocente: "${phrase}"`);
  }

  const trueHandoffPhrases = [
    'Un asesor comercial se pondrá en contacto contigo en breve.',
    'He transferido este chat con un asesor humano para que te asista.',
    'He notificado a nuestro equipo para que te atiendan directamente.',
    'Voy a consultar con bodega y un asesor se comunicará contigo.',
  ];

  for (const phrase of trueHandoffPhrases) {
    const isHandoff = handoffPattern.test(phrase);
    assert.strictEqual(isHandoff, true, `Debe detectar handoff real: "${phrase}"`);
  }
  console.log('   ✅ Blindaje del guardrail contra apagado involuntario de IA aprobado.');

  // 4. Probar Ventana de 24 Horas de Meta (Integridad de Inbound vs Outbound)
  console.log('\n4️⃣  Probando cálculo estricto de la ventana de 24 horas de Meta...');
  const now = Date.now();
  const insideWindow = new Date(now - 12 * 3600 * 1000).toISOString();
  const outsideWindow = new Date(now - 25 * 3600 * 1000).toISOString();

  assert.strictEqual(isWithin24HourWindow(insideWindow), true, '12h atrás debe estar dentro de la ventana de 24h');
  assert.strictEqual(isWithin24HourWindow(outsideWindow), false, '25h atrás debe estar fuera de la ventana de 24h');
  assert.strictEqual(isWithin24HourWindow(null), false, 'Sin interacción previa debe estar fuera de la ventana');
  console.log('   ✅ Integridad de la ventana de 24 horas verificada.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE FASE 1 PASARON EXITOSAMENTE!\n');
}

runFase1Tests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS DE FASE 1:', err);
  process.exit(1);
});
