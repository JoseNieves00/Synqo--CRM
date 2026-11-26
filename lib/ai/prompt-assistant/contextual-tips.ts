import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import {
  getSmartCommercialSuggestions,
  type SmartSuggestionItem,
} from './smart-suggestions';

export interface ContextualTipsInput {
  orgName: string;
  preset: IndustryPreset | string;
  currentPrompt: string;
  galleryCount: number;
  galleryMissingContextCount: number;
  followUpEnabled: boolean;
  activeFollowUpCount: number;
  pendingGaps: string[];
  recentHandoffReasons: string[];
  hasPaymentAccounts: boolean;
  hasBusinessHours: boolean;
}

const VALID_SECTIONS = new Set<SmartSuggestionItem['sectionTarget']>([
  'cierre',
  'politicas',
  'tono',
  'adicional',
  'faq',
  'seguimiento',
]);

export function filterSuggestionsByContext(
  items: SmartSuggestionItem[],
  ctx: Pick<ContextualTipsInput, 'preset' | 'currentPrompt'>
): SmartSuggestionItem[] {
  const lowerPrompt = (ctx.currentPrompt || '').toLowerCase();
  const isProductsOnly = String(ctx.preset) === 'products';

  return items.filter((item) => {
    const text = `${item.title} ${item.description} ${item.instructionToApply}`.toLowerCase();
    if (
      isProductsOnly &&
      /\b(agend|cita|google meet|calendario|no-show|reprogram)\b/i.test(text)
    ) {
      return false;
    }
    if (
      /\b(abono|anticipo|separe)\b/i.test(text) &&
      /\b(abono|anticipo|plan separe)\b/i.test(lowerPrompt)
    ) {
      return false;
    }
    if (
      /\b(doble alternativa|dos opciones)\b/i.test(text) &&
      /\b(doble alternativa|dos opciones concretas)\b/i.test(lowerPrompt)
    ) {
      return false;
    }
    if (
      /\b(garant[ií]a)\b/i.test(text) &&
      /\b(garant[ií]a)\b/i.test(lowerPrompt)
    ) {
      return false;
    }
    if (
      /\b(horario)\b/i.test(text) &&
      /\b(horario|lunes a|atendemos de)\b/i.test(lowerPrompt)
    ) {
      return false;
    }
    return true;
  });
}

async function callGroqJson(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = (process.env.GROQ_ASSISTANT_MODEL || 'llama-3.3-70b-versatile').trim();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 750,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(8500),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function callGeminiJson(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  ).trim();
  if (!apiKey) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 750,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(8500),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function parseAiTipsJson(raw: string | null): SmartSuggestionItem[] {
  if (!raw) return [];
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.tips) ? parsed.tips : Array.isArray(parsed) ? parsed : [];
    const out: SmartSuggestionItem[] = [];

    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (!t?.title || !t?.instructionToApply) continue;
      const section = VALID_SECTIONS.has(t.sectionTarget) ? t.sectionTarget : 'adicional';
      out.push({
        id: `ai-tip-${i}-${String(t.title).slice(0, 20).replace(/\W+/g, '').toLowerCase()}`,
        category: 'nicho',
        categoryLabel: 'Tip IA Contextual',
        badge: String(t.badge || '💡 Sugerencia IA').slice(0, 24),
        title: String(t.title).trim().slice(0, 70),
        description: String(t.description || '').trim().slice(0, 160),
        instructionToApply: String(t.instructionToApply).trim().slice(0, 500),
        sectionTarget: section,
      });
    }
    return out.slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Genera 1 a 3 tips funcionales 100% personalizados usando Groq (si GROQ_API_KEY existe)
 * con fallback automático a Gemini, analizando prompt, chats reales, seguimientos y galería.
 */
export async function buildContextualAssistantTips(
  ctx: ContextualTipsInput
): Promise<{ tips: SmartSuggestionItem[]; engine: 'groq' | 'gemini' | 'fallback' }> {
  const isNewUser = (ctx.currentPrompt || '').trim().length < 220;

  const systemPrompt = [
    'Eres el consultor experto de Synqo CRM para mejorar bots comerciales de WhatsApp.',
    'Tu tarea es devolver JSON válido con la forma: {"tips": [{"badge": "🎯 ...", "title": "...", "description": "...", "instructionToApply": "...", "sectionTarget": "cierre|politicas|tono|adicional|faq|seguimiento"}]}.',
    'REGLAS ESTRICTAS:',
    '1. Devuelve máximo 3 tips ordenados del más urgente/impactante al menos urgente.',
    '2. Verifica el PROMPT ACTUAL: NUNCA sugieras algo que el negocio ya tenga configurado.',
    '3. Si el tipo de negocio es "products", PROHIBIDO sugerir citas, agenda o Google Meet.',
    '4. Si hay preguntas reales sin responder (pendingGaps) o motivos de relevo (recentHandoffReasons), priorízalos.',
    '5. Si followUpEnabled es false o activeFollowUpCount es 0, incluye un tip práctico de seguimiento.',
    '6. Si es usuario nuevo (prompt corto/vacío), enfócate en cimientos clave (qué vende + precios, horarios, medios de pago).',
    '7. En "description" explica en 1 frase por qué le sirve según sus datos reales; en "instructionToApply" escribe la regla exacta lista para insertar en su prompt.',
  ].join('\n');

  const userPrompt = JSON.stringify({
    negocio: ctx.orgName,
    tipoNegocio: ctx.preset,
    usuarioNuevo: isNewUser,
    galeriaFotos: ctx.galleryCount,
    fotosSinReglaContexto: ctx.galleryMissingContextCount,
    seguimientosActivos: ctx.followUpEnabled ? ctx.activeFollowUpCount : 0,
    tieneCuentasPago: ctx.hasPaymentAccounts,
    tieneHorarios: ctx.hasBusinessHours,
    preguntasRealesSinRespuesta: ctx.pendingGaps.slice(0, 5),
    motivosRelevoHumanoRecientes: ctx.recentHandoffReasons.slice(0, 5),
    promptActualExtracto: (ctx.currentPrompt || '').slice(0, 2200),
  });

  try {
    const groqRaw = await callGroqJson(systemPrompt, userPrompt);
    const groqTips = filterSuggestionsByContext(parseAiTipsJson(groqRaw), ctx);
    if (groqTips.length > 0) {
      return { tips: groqTips, engine: 'groq' };
    }
  } catch {
    // fallback a Gemini
  }

  try {
    const geminiRaw = await callGeminiJson(systemPrompt, userPrompt);
    const geminiTips = filterSuggestionsByContext(parseAiTipsJson(geminiRaw), ctx);
    if (geminiTips.length > 0) {
      return { tips: geminiTips, engine: 'gemini' };
    }
  } catch {
    // fallback determinístico
  }

  const fallback = filterSuggestionsByContext(
    getSmartCommercialSuggestions({
      preset: (ctx.preset || 'custom') as IndustryPreset,
      currentPrompt: ctx.currentPrompt,
      hasCatalog: ctx.galleryCount > 0,
    }),
    ctx
  ).slice(0, 3);

  return { tips: fallback, engine: 'fallback' };
}
