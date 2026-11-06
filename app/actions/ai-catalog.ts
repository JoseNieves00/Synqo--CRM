'use server';

import OpenAI from 'openai';
import { getCurrentUserAndOrg } from '@/app/actions/auth';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const gemini = geminiApiKey
  ? new OpenAI({
      apiKey: geminiApiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
  : null;

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

export interface ProductAiSuggestion {
  name: string;
  description: string;
  keywords: string[];
}

/**
 * Analiza un producto (texto o imagen multimodal) usando Gemini 1.5 Flash (Free Tier)
 * y genera automáticamente el nombre comercial, descripción vendedora y palabras clave de WhatsApp.
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

    const client = gemini || openai;
    if (!client) {
      return { success: false, error: 'No hay proveedor de IA configurado (GEMINI_API_KEY o OPENAI_API_KEY).' };
    }

    const model = gemini ? 'gemini-1.5-flash' : 'gpt-4o-mini';

    const systemPrompt = `Eres un estratega experto en ventas por WhatsApp y comercio conversacional.
Tu objetivo es analizar la foto y/o el nombre de un producto y generar su ficha de catálogo optimizada para WhatsApp.
Genera un objeto JSON con:
1. "name": Nombre comercial claro y atractivo (máximo 40 caracteres, ej: "Cocina Mediana con Nevera").
2. "description": Descripción vendedora de 2 líneas adaptada a WhatsApp (destaca qué incluye, materiales o beneficio).
3. "keywords": Lista de 6 a 10 sinónimos coloquiales, modismos, colores, medidas o frases cortas que los compradores reales escribirían en WhatsApp para preguntar por este producto (ej: ["mediana", "con nevera", "80cm", "rosada", "cocinita", "de madera", "de juguete"]).

Responde ÚNICAMENTE un JSON válido con este formato:
{
  "name": "...",
  "description": "...",
  "keywords": ["...", "..."]
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

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const rawOutput = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawOutput);

    return {
      success: true,
      data: {
        name: parsed.name || input.productName || 'Producto',
        description: parsed.description || input.description || '',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      },
    };
  } catch (err: any) {
    console.error('[SUGGEST PRODUCT CATALOG AI ERROR]', err);
    return { success: false, error: err?.message || 'Error al sugerir con IA' };
  }
}
