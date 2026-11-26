'use server';

import OpenAI from 'openai';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { AI_OPERATIONAL_CONFIG, getAiUtilityChain } from '@/lib/ai/config';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const gemini = geminiApiKey
  ? new OpenAI({
      apiKey: geminiApiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      maxRetries: 0,
      timeout: AI_OPERATIONAL_CONFIG.timeoutMs,
    })
  : null;

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openai = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey, timeout: AI_OPERATIONAL_CONFIG.fallbackTimeoutMs })
  : null;

export interface ProductAiSuggestion {
  name: string;
  description: string;
  keywords: string[];
  contextRule: string;
}

/**
 * Analiza una imagen o recurso visual (producto, servicio, ubicación, tabla de medidas, promo, etc.)
 * usando la cadena configurada en AI_UTILITY_MODEL y genera automáticamente título, descripción,
 * palabras clave y regla estricta de contexto para WhatsApp.
 */
export async function suggestProductCatalogAi(input: {
  productName?: string;
  description?: string;
  imageUrl?: string;
}): Promise<{ success: boolean; data?: ProductAiSuggestion; error?: string }> {
  try {
    const current = await getCurrentUserAndOrg();
    if (!current) {
      return { success: false, error: 'No autorizado' };
    }

    if (!gemini && !openai) {
      return { success: false, error: 'No hay proveedor de IA configurado (GEMINI_API_KEY o OPENAI_API_KEY).' };
    }

    const chain = getAiUtilityChain();
    const orgName = current.organization?.name || 'el negocio';
    const industry = current.organization?.industry_preset || 'comercial';

    const systemPrompt = `Eres un estratega experto en atención y ventas por WhatsApp para "${orgName}" (rubro: ${industry}).
Analiza la imagen y/o datos proporcionados (puede ser un producto, un servicio, un antes/después, una sede/mapa, una tabla de tallas/medidas, un catálogo o una promoción).
Genera un JSON válido para que la IA sepa exactamente qué es y en qué contexto enviarla SIN equivocarse:
1. "name": Título claro y corto (máx. 45 caracteres).
2. "description": Descripción breve y útil de 1-2 líneas para acompañar la imagen si hace falta.
3. "keywords": Lista de 6 a 10 palabras clave, sinónimos o intenciones reales que un cliente escribiría en WhatsApp cuando necesita ver esta imagen.
4. "contextRule": Regla precisa de uso en 1 frase: "Enviar solo cuando [condición exacta]. NO enviar si [contexto incorrecto o pregunta ambigua]."

Responde ÚNICAMENTE un JSON válido:
{
  "name": "...",
  "description": "...",
  "keywords": ["...", "..."],
  "contextRule": "..."
}`;

    const userContent: Array<any> = [];

    let textPrompt = `Analiza este producto:`;
    if (input.productName?.trim()) textPrompt += `\nNombre actual: "${input.productName.trim()}"`;
    if (input.description?.trim()) textPrompt += `\nDetalles: "${input.description.trim()}"`;

    userContent.push({ type: 'text', text: textPrompt });

    if (input.imageUrl && input.imageUrl.startsWith('http')) {
      userContent.push({
        type: 'image_url',
        image_url: { url: input.imageUrl },
      });
    }

    let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
    let lastError: any = null;

    for (const entry of chain) {
      const client = entry.provider === 'google' ? gemini : openai;
      if (!client) continue;
      try {
        completion = await client.chat.completions.create({
          model: entry.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('Ningún modelo utilitario disponible respondió.');
    }

    const rawOutput = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawOutput);

    return {
      success: true,
      data: {
        name: parsed.name || input.productName || 'Imagen de galería',
        description: parsed.description || input.description || '',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        contextRule: typeof parsed.contextRule === 'string' ? parsed.contextRule.trim() : '',
      },
    };
  } catch (err: any) {
    console.error('[SUGGEST PRODUCT CATALOG AI ERROR]', err);
    return { success: false, error: err?.message || 'Error al sugerir con IA' };
  }
}
