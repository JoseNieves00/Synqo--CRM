import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LeadReactivationService } from '../services/reactivation.service';
import { MessagingService } from '../services/messaging.service';
import { supabaseAdmin } from '../lib/supabase/admin';

test('1. appointment-reminders NO debe invocar ni importar LeadReactivationService', () => {
  const filePath = path.join(process.cwd(), 'app/api/cron/appointment-reminders/route.ts');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert.ok(
    !code.includes('LeadReactivationService'),
    'appointment-reminders no debe contener ninguna referencia a LeadReactivationService'
  );
  assert.ok(
    !code.includes('processAutonomousLeadReactivations'),
    'appointment-reminders no debe ejecutar processAutonomousLeadReactivations'
  );
});

test('2. dispatchFollowUpStep concurrentes en el mismo instante deben enviar EXACTAMENTE 1 mensaje', async () => {
  // Crear ID UUID válido
  const testContactId = crypto.randomUUID();
  const testPhone = `57300999${Math.floor(1000 + Math.random() * 9000)}`;

  let textSendsCount = 0;
  let mediaSendsCount = 0;
  const originalSendText = MessagingService.sendTextMessage;
  const originalSendMedia = MessagingService.sendMediaMessage;

  (MessagingService as any).sendTextMessage = async () => {
    textSendsCount++;
    await new Promise((r) => setTimeout(r, 120));
    return 'fake-msg-id-123';
  };

  (MessagingService as any).sendMediaMessage = async () => {
    mediaSendsCount++;
    await new Promise((r) => setTimeout(r, 80));
    return 'fake-media-id-123';
  };

  try {
    // Insertar contacto en base de datos para pruebas
    const { error: insErr } = await (supabaseAdmin.from('contacts') as any).insert({
      id: testContactId,
      organization_id: 'da8cb0c8-f326-4f0c-873b-7bf73319be83', // Filippo Kids (válida)
      name: 'Test Concurrency',
      phone: testPhone,
      is_ai_active: true,
      pipeline_stage: 'nuevo',
      custom_fields: {},
      conversation_status: 'open',
    });

    assert.ifError(insErr);

    const orgMock = {
      id: 'da8cb0c8-f326-4f0c-873b-7bf73319be83',
      name: 'Empresa Test',
      whatsapp_provider: 'evolution',
    };

    const contactMock = {
      id: testContactId,
      name: 'Test Concurrency',
      phone: testPhone,
      custom_fields: {},
    };

    // Disparar 2 ejecuciones concurrentes al mismo tiempo (simulando 2 crons en paralelo)
    const [res1, res2] = await Promise.all([
      LeadReactivationService.dispatchFollowUpStep({
        org: orgMock,
        contact: contactMock,
        bodyMessage: 'Hola, prueba de concurrencia única',
        imageUrls: ['https://example.com/cocina.jpg', 'https://example.com/cocina.jpg'], // duplicada a propósito
        stepLabel: 'Prueba Concurrente',
      }),
      LeadReactivationService.dispatchFollowUpStep({
        org: orgMock,
        contact: contactMock,
        bodyMessage: 'Hola, prueba de concurrencia única',
        imageUrls: ['https://example.com/cocina.jpg'],
        stepLabel: 'Prueba Concurrente',
      }),
    ]);

    // Uno debe ser exitoso (sent = true) y el otro debe ser abortado/bloqueado
    const sentCount = (res1.sent ? 1 : 0) + (res2.sent ? 1 : 0);
    assert.strictEqual(sentCount, 1, `Exactamente 1 de los 2 procesos debe enviar (res1: ${res1.sent}, res2: ${res2.sent})`);

    // Validar que la API de texto se llamó exactamente 1 sola vez
    assert.strictEqual(textSendsCount, 1, `sendTextMessage debió ejecutarse exactamente 1 vez (se ejecutó: ${textSendsCount})`);

    // Validar que la imagen se deduplicó y se envió solo 1 vez
    assert.strictEqual(mediaSendsCount, 1, `sendMediaMessage debió ejecutarse exactamente 1 vez por imagen deduplicada (se ejecutó: ${mediaSendsCount})`);

    console.log('   ✅ Blindaje de concurrencia verificado: 2 crons simultáneos resultan en EXACTAMENTE 1 mensaje y 1 imagen.');
  } finally {
    // Restaurar métodos originales y limpiar
    (MessagingService as any).sendTextMessage = originalSendText;
    (MessagingService as any).sendMediaMessage = originalSendMedia;

    await (supabaseAdmin.from('messages') as any).delete().eq('contact_id', testContactId);
    await (supabaseAdmin.from('contacts') as any).delete().eq('id', testContactId);
  }
});
