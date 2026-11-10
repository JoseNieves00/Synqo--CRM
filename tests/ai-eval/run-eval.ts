import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { OpenAIService } from '../../services/openai.service';
import { calculateTurnCostUsd, AI_OPERATIONAL_CONFIG } from '../../lib/ai/config';
import { buildSalesPlaybook } from '../../lib/ai/sales-playbook';
import { supabaseAdmin } from '../../lib/supabase/admin';
import { EVAL_SCENARIOS, ECOMMERCE_ORG_FIXTURE, CLINIC_ORG_FIXTURE } from './scenarios';

async function get14DayBaselineCostUsd(): Promise<{ avgCostPerTurn: number; avgPromptTokens: number; turnsSampled: number }> {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await (supabaseAdmin.from('ai_runs') as any)
      .select('model, prompt_tokens, completion_tokens, status')
      .gte('created_at', since)
      .in('status', ['success', 'fallback'])
      .limit(500);

    if (!data || data.length === 0) {
      return { avgCostPerTurn: 0.001128, avgPromptTokens: 7000, turnsSampled: 0 };
    }

    let sumCost = 0;
    let sumPrompt = 0;
    for (const r of data) {
      sumCost += calculateTurnCostUsd({
        model: r.model,
        promptTokens: r.prompt_tokens || 0,
        completionTokens: r.completion_tokens || 0,
      });
      sumPrompt += r.prompt_tokens || 0;
    }

    return {
      avgCostPerTurn: sumCost / data.length,
      avgPromptTokens: Math.round(sumPrompt / data.length),
      turnsSampled: data.length,
    };
  } catch {
    return { avgCostPerTurn: 0.001128, avgPromptTokens: 7000, turnsSampled: 0 };
  }
}

async function runEval() {
  console.log('\n🧪 [SYNQO AI EVAL] Ejecutando evaluación completa de calidad, tools, categorización y costo...\n');

  // 1. Verificar tamaño del Playbook (objetivo <= 1.5k tokens)
  const playbookText = buildSalesPlaybook({ hasCalendar: false });
  const estimatedPlaybookTokens = Math.ceil(playbookText.length / 4);
  console.log(`📏 Playbook genérico (sin calendario): ${playbookText.length} chars (~${estimatedPlaybookTokens} tokens estimados)`);
  if (estimatedPlaybookTokens > 1500) {
    console.error(`❌ El playbook excede 1.500 tokens (~${estimatedPlaybookTokens}).`);
    process.exit(1);
  }

  // 2. Obtener línea base de costo últimos 14 días
  const baseline = await get14DayBaselineCostUsd();
  console.log(
    `💰 Línea base últimos 14d (${baseline.turnsSampled} turnos): avgPrompt=${baseline.avgPromptTokens} tokens | costo/turno=$${baseline.avgCostPerTurn.toFixed(6)} USD\n`
  );

  let passedCount = 0;
  let totalCostUsd = 0;
  let totalPrompt = 0;
  let totalLatency = 0;
  let tempTotal = 0;
  let tempCorrect = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const sc of EVAL_SCENARIOS) {
    const org = sc.promptType === 'clinic' ? CLINIC_ORG_FIXTURE : ECOMMERCE_ORG_FIXTURE;
    try {
      const res = await OpenAIService.simulateSandboxMessage({
        systemPrompt: org.system_prompt,
        userMessage: sc.userMessage,
        history: sc.history || [],
        organization: org,
        enableDryRunTools: true,
        enabledModules: { native_calendar: false },
      });

      const trace = res.dryRunTrace!;
      const outcome = sc.check(res.reply, trace);

      totalCostUsd += trace.costUsd;
      totalPrompt += trace.promptTokens;
      totalLatency += trace.latencyMs;

      if (sc.expectedTemperature) {
        tempTotal++;
        if (trace.leadProfileUpdate?.temperature === sc.expectedTemperature) {
          tempCorrect++;
        }
      }

      if (outcome.passed) {
        passedCount++;
        console.log(
          `  ✅ [${sc.id}] ${sc.name} | ${trace.provider}:${trace.modelUsed} | ${trace.latencyMs}ms | ${trace.promptTokens}in/${trace.completionTokens}out ($${trace.costUsd.toFixed(5)})`
        );
      } else {
        failures.push({ id: sc.id, reason: outcome.reason || 'Falló validación' });
        console.log(
          `  ❌ [${sc.id}] ${sc.name} -> ${outcome.reason} | Reply: "${res.reply.slice(0, 120)}"`
        );
      }
    } catch (err: any) {
      failures.push({ id: sc.id, reason: err?.message || 'Excepción en escenario' });
      console.log(`  ❌ [${sc.id}] ERROR: ${err?.message || err}`);
    }
  }

  const totalScenarios = EVAL_SCENARIOS.length;
  const avgEvalCost = totalCostUsd / totalScenarios;
  const avgEvalPrompt = Math.round(totalPrompt / totalScenarios);
  const avgEvalLatency = Math.round(totalLatency / totalScenarios);
  const tempAccuracy = tempTotal > 0 ? Math.round((tempCorrect / tempTotal) * 100) : 100;
  const budgetCap = baseline.avgCostPerTurn * 1.1;

  console.log('\n📊 === RESUMEN EVAL ===');
  console.log(`   Escenarios aprobados: ${passedCount}/${totalScenarios} (Mínimo requerido: 13/${totalScenarios})`);
  console.log(`   Precisión categoría IA (hot/warm/cold): ${tempCorrect}/${tempTotal} (${tempAccuracy}%)`);
  console.log(`   Latencia promedio: ${avgEvalLatency} ms`);
  console.log(`   Tokens entrada promedio/turno: ${avgEvalPrompt} (Base anterior: ${baseline.avgPromptTokens})`);
  console.log(`   Costo promedio/turno eval: $${avgEvalCost.toFixed(6)} USD (Presupuesto máx +10%: $${budgetCap.toFixed(6)} USD)`);
  console.log(`   Config activa: chain=${JSON.stringify(AI_OPERATIONAL_CONFIG.historyLimit)} history, maxToolRounds=${AI_OPERATIONAL_CONFIG.maxToolRounds}\n`);

  if (passedCount < 13) {
    console.error(`❌ EVAL FALLIDO: Solo pasaron ${passedCount}/${totalScenarios} (mínimo 13). Detalles:`, failures);
    process.exit(1);
  }

  if (baseline.turnsSampled > 0 && avgEvalCost > budgetCap) {
    console.error(
      `❌ PRESUPUESTO EXCEDIDO: Costo eval ($${avgEvalCost.toFixed(6)}) supera línea base +10% ($${budgetCap.toFixed(6)}).`
    );
    process.exit(1);
  }

  console.log('🎉 ¡EVAL APROBADO EN CALIDAD Y COSTO!\n');
}

runEval().catch((err) => {
  console.error('❌ Error fatal en eval:', err);
  process.exit(1);
});
