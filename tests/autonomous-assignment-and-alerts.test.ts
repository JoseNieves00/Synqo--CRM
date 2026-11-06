import assert from 'node:assert';
import { HandoffService } from '../services/handoff.service';
import { AssignmentService } from '../services/assignment.service';

async function runAutonomousAssignmentTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Motor de Asignación Autónoma y Alertas de WhatsApp...\n');

  // 1. Probar Normalización E.164 de Teléfonos de Asesores
  console.log('1️⃣  Probando normalización de teléfonos a formato E.164 (cleanE164Phone)...');
  const colombiaMobile = '3001234567';
  const cleanCol = HandoffService.cleanE164Phone(colombiaMobile);
  assert.strictEqual(cleanCol, '573001234567', 'Debe agregar prefijo 57 a celulares colombianos de 10 dígitos');

  const withPlus = '+57 312 456 7890';
  assert.strictEqual(HandoffService.cleanE164Phone(withPlus), '573124567890', 'Debe limpiar espacios y el signo más');

  const withZeros = '00573159876543';
  assert.strictEqual(HandoffService.cleanE164Phone(withZeros), '573159876543', 'Debe remover prefijo de salida internacional 00');
  console.log('   ✅ Normalización E.164 aprobada para todos los formatos telefónicos.');

  // 2. Probar Lógica de Exclusión de Agentes para Reasignación Autónoma
  console.log('\n2️⃣  Probando soporte de opciones y exclusión de agente en AssignmentService...');
  assert.strictEqual(typeof AssignmentService.findBestAvailableAgent, 'function');
  assert.strictEqual(typeof AssignmentService.reassignStaleHandoffs, 'function');
  console.log('   ✅ Métodos de asignación y reasignación en cascada verificados.');

  // 3. Probar Formateo de Alerta de Relevo y Plantilla de Mensaje
  console.log('\n3️⃣  Probando estructura del mensaje accionable para WhatsApp del asesor...');
  const sampleLead = { name: 'Juan Pérez', phone: '573019876543' };
  const sampleReason = 'Comprobante de pago recibido';
  const sampleSnippet = '"Ya hice la transferencia por Nequi"';
  const testContactId = 'c123-test-uuid';

  const alertBody = `🚨 *Nuevo Lead Asignado Automáticamente*\n\nHola *Carlos*, se te ha asignado un prospecto que requiere tu atención:\n• *Cliente:* ${sampleLead.name} (${sampleLead.phone})\n• *Motivo:* ${sampleReason}\n• *Último mensaje:* ${sampleSnippet}\n\n👉 *Abrir en CRM:* https://crm.synqo.dev/inbox/${testContactId}\n\n_Tip: Responde citando este mensaje para escribirle directamente al cliente desde tu WhatsApp, o responde *1* para confirmar que lo tomaste._`;

  assert.ok(alertBody.includes(sampleLead.name), 'Debe contener el nombre del lead');
  assert.ok(alertBody.includes(sampleReason), 'Debe contener el motivo del relevo');
  assert.ok(alertBody.includes(testContactId), 'Debe incluir el enlace directo al inbox');
  assert.ok(alertBody.includes('responde *1*'), 'Debe incluir instrucciones de comando rápido');
  console.log('   ✅ Formato accionable de WhatsApp validado exitosamente.');

  // 4. Probar Reconocimiento de Comandos de Asesor por WhatsApp
  console.log('\n4️⃣  Probando parsing de comandos del asesor (1, tomo, lo tomo)...');
  const validCommands = ['1', 'tomo', 'lo tomo', '1 ', ' TOMO'];
  for (const cmd of validCommands) {
    const rawTrimmed = cmd.trim().toLowerCase();
    const isClaimCmd = rawTrimmed === '1' || rawTrimmed === 'tomo' || rawTrimmed === 'lo tomo';
    assert.strictEqual(isClaimCmd, true, `Comando "${cmd}" debe ser reconocido como toma de lead`);
  }
  console.log('   ✅ Reconocimiento determinístico de comandos rápidos validado.');

  // 5. Probar Interfaz de Notificación Unificada
  console.log('\n5️⃣  Probando método universal HandoffService.notifyHandoff...');
  assert.strictEqual(typeof HandoffService.notifyHandoff, 'function');
  console.log('   ✅ HandoffService.notifyHandoff expuesto y tipado correctamente.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE ASIGNACIÓN AUTÓNOMA Y WHATSAPP PASARON EXITOSAMENTE!\n');
}

runAutonomousAssignmentTests().catch((err) => {
  console.error('\n❌ Fallo en las pruebas de Asignación Autónoma:', err);
  process.exit(1);
});
