import assert from 'node:assert';
import { supabaseAdmin } from '../lib/supabase/admin';
import {
  getCompanyFullConfigAction,
  updateCompanyPromptAction,
  updateCompanyPipelineAction,
  updateCompanyFollowUpAction,
} from '../app/actions/superadmin';

async function runTest() {
  console.log('🧪 Iniciando pruebas del Configurador Remoto del Super Admin...');

  // 1. Obtener una organización existente de prueba
  const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name')
    .limit(1)
    .single();

  assert(!orgErr && org, 'Debe existir al menos una organización en la base de datos');
  console.log(`🏢 Empresa de prueba seleccionada: ${org.name} (${org.id})`);

  // 2. getCompanyFullConfigAction
  console.log('1️⃣  Probando getCompanyFullConfigAction...');
  const fullConfig = await getCompanyFullConfigAction(org.id);
  assert(fullConfig.organization.id === org.id, 'La organización retornada debe coincidir');
  assert(Array.isArray(fullConfig.profiles), 'profiles debe ser un array');
  assert(typeof fullConfig.followUpSettings === 'object', 'followUpSettings debe ser un objeto normalizado');
  assert(typeof fullConfig.stageLabels === 'object', 'stageLabels debe ser un objeto');
  assert(typeof fullConfig.stageCriteria === 'object', 'stageCriteria debe ser un objeto');
  console.log('   ✅ Lectura remota completa exitosa.');

  // 3. updateCompanyPromptAction con aiProvider
  console.log('2️⃣  Probando updateCompanyPromptAction con aiProvider...');
  const testPrompt = `Prompt remoto de prueba - ${Date.now()}`;
  await updateCompanyPromptAction({
    organizationId: org.id,
    systemPrompt: testPrompt,
    aiProvider: 'google',
  });

  const { data: orgAfterPrompt } = await (supabaseAdmin.from('organizations') as any)
    .select('system_prompt, ai_provider')
    .eq('id', org.id)
    .single();

  assert.strictEqual(orgAfterPrompt.system_prompt, testPrompt, 'El prompt debe haberse actualizado');
  assert.strictEqual(orgAfterPrompt.ai_provider, 'google', 'El ai_provider debe haberse actualizado');
  console.log('   ✅ Actualización remota de Prompt y Cerebro IA exitosa.');

  // 4. updateCompanyPipelineAction
  console.log('3️⃣  Probando updateCompanyPipelineAction (stage_labels y stage_criteria)...');
  const testLabels = {
    new_lead: 'Primer Contacto Remoto',
    won: 'Venta Ganada Remota',
  };
  const testCriteria = {
    new_lead: 'El cliente saluda o pregunta por el servicio',
    won: 'El cliente transfirió o acordó cita presencial',
  };

  const pipeRes = await updateCompanyPipelineAction({
    organizationId: org.id,
    stageLabels: testLabels,
    stageCriteria: testCriteria,
  });

  assert(pipeRes.success, 'La acción de pipeline debe ser exitosa');
  assert.strictEqual(pipeRes.stageLabels.new_lead, 'Primer Contacto Remoto');
  assert.strictEqual(pipeRes.stageCriteria.won, 'El cliente transfirió o acordó cita presencial');

  const { data: orgAfterPipe } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', org.id)
    .single();

  const savedPipeSettings = orgAfterPipe.appointment_settings as any;
  assert.strictEqual(savedPipeSettings.stage_labels?.new_lead, 'Primer Contacto Remoto');
  assert.strictEqual(savedPipeSettings.stage_criteria?.won, 'El cliente transfirió o acordó cita presencial');
  console.log('   ✅ Actualización remota de Pipeline y Criterios IA exitosa.');

  // 5. updateCompanyFollowUpAction (Sincronizado con appointment_settings.follow_up_sequences)
  console.log('4️⃣  Probando updateCompanyFollowUpAction en appointment_settings.follow_up_sequences...');
  const fuRes = await updateCompanyFollowUpAction({
    organizationId: org.id,
    followUpSettings: {
      enabled: true,
      dailyCap: 75,
      prioritizeByScore: true,
    },
  });

  assert(fuRes.success, 'La acción de follow-up debe ser exitosa');
  assert.strictEqual(fuRes.followUpSettings.enabled, true);
  assert.strictEqual(fuRes.followUpSettings.dailyCap, 75);
  assert.strictEqual(fuRes.followUpSettings.prioritizeByScore, true);

  const { data: orgAfterFu } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', org.id)
    .single();

  const savedFuSettings = (orgAfterFu.appointment_settings as any)?.follow_up_sequences;
  assert.strictEqual(savedFuSettings.enabled, true, 'El switch enabled debe estar en true');
  assert.strictEqual(savedFuSettings.dailyCap, 75, 'El dailyCap debe ser 75');
  assert.strictEqual(savedFuSettings.prioritizeByScore, true, 'prioritizeByScore debe ser true');
  console.log('   ✅ Actualización remota de Seguimientos en appointment_settings verificada exitosamente.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DEL CONFIGURADOR REMOTO DEL SUPER ADMIN PASARON CON ÉXITO!');
}

runTest().catch((err) => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
