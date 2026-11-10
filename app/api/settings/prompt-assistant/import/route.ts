import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PROMPT_ASSISTANT_CONFIG, getAiUtilityChain } from '@/lib/ai/config';
import { createChatCompletionWithFallback, OpenAIService } from '@/services/openai.service';
import {
  applySpreadsheetColumnMapping,
  extractCatalogPdfText,
  matchImportedItemsWithGallery,
  parseCatalogSpreadsheet,
  type SpreadsheetColumnMapping,
} from '@/lib/ai/prompt-assistant/file-import';
import {
  getAssistantBudgetStatus,
  normalizeAssistantState,
  recordAssistantUsageInState,
} from '@/lib/ai/prompt-assistant/state';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
    }
    if (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('id, ai_provider, structured_prompt_data')
      .eq('id', profile.organization_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
    }

    const formData = await req.formData();
    const kind = String(formData.get('kind') || '').trim();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Falta adjuntar archivo.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'El archivo debe pesar menos de 5 MB.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const structured =
      org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
        ? org.structured_prompt_data
        : {};
    let state = normalizeAssistantState(structured.assistant, 'improve');
    const gallery = Array.isArray(structured.gallery) ? structured.gallery : [];

    // 1. Nota de voz del asistente
    if (kind === 'audio') {
      const budget = getAssistantBudgetStatus(state);
      if (budget.limitReached) {
        return NextResponse.json(
          { error: `Capacidad del asistente alcanzada (se renueva ${budget.resetHint}). Mientras tanto puedes escribir tu respuesta.` },
          { status: 429 }
        );
      }
      const mimeType = file.type || 'audio/webm';
      const text = await OpenAIService.transcribeAudio(buffer, mimeType);
      if (!text) {
        return NextResponse.json(
          { error: 'No se pudo transcribir el audio con claridad. Intenta grabar más cerca del micrófono o escribir.' },
          { status: 422 }
        );
      }
      // Registro interno aproximado de audio para tope anti-abuso (sin tocar cuota comercial del cliente)
      const estAudioTokens = Math.max(150, Math.ceil(buffer.length / 400));
      state = recordAssistantUsageInState(state, estAudioTokens, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
      await (supabaseAdmin.from('organizations') as any)
        .update({ structured_prompt_data: { ...structured, assistant: state }, updated_at: new Date().toISOString() })
        .eq('id', org.id);
      return NextResponse.json({ kind: 'audio', transcription: text });
    }

    // 2. Excel / CSV de catálogo (1 llamada mínima de mapeo + todas las filas en 0 tokens)
    if (kind === 'spreadsheet') {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xls')) {
        return NextResponse.json(
          { error: 'El formato .xls antiguo no es compatible. Guárdalo como .xlsx o .csv e intenta de nuevo.' },
          { status: 400 }
        );
      }
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
        return NextResponse.json(
          { error: 'Formato inválido. Sube un archivo .xlsx o .csv.' },
          { status: 400 }
        );
      }

      const parsed = await parseCatalogSpreadsheet(buffer, file.name, 500);
      if (parsed.headers.length === 0 || parsed.totalRows === 0) {
        return NextResponse.json(
          { error: 'No se encontraron filas de catálogo válidas en el archivo.' },
          { status: 422 }
        );
      }

      const budget = getAssistantBudgetStatus(state);
      if (budget.limitReached) {
        return NextResponse.json(
          { error: `Capacidad del asistente alcanzada (se renueva ${budget.resetHint}).` },
          { status: 429 }
        );
      }

      const llmRes = await createChatCompletionWithFallback({
        messages: [
          {
            role: 'system',
            content:
              'Mapea las columnas de este archivo de catálogo al esquema Synqo. Devuelve ÚNICAMENTE JSON válido: { "nameCol": string|null, "priceCol": string|null, "specsCol": string|null, "variantsCol": string|null, "includesCol": string|null } usando los nombres exactos de encabezado.',
          },
          {
            role: 'user',
            content: JSON.stringify({ headers: parsed.headers, sampleRows: parsed.sampleRows }),
          },
        ],
        temperature: 0.1,
        chainOverride: getAiUtilityChain(),
        aiProvider: org.ai_provider,
        organizationId: org.id,
        skipQuotaDeduction: true,
        responseFormat: { type: 'json_object' },
      });

      try {
        await (supabaseAdmin.from('ai_runs') as any).insert({
          organization_id: org.id,
          contact_id: null,
          channel: 'prompt_assistant',
          provider: llmRes.provider,
          model: llmRes.modelUsed,
          prompt_tokens: llmRes.promptTokens,
          completion_tokens: llmRes.completionTokens,
          total_tokens: llmRes.totalTokens,
          latency_ms: llmRes.latencyMs,
          status: 'success',
        });
      } catch {}

      state = recordAssistantUsageInState(state, llmRes.totalTokens, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
      await (supabaseAdmin.from('organizations') as any)
        .update({ structured_prompt_data: { ...structured, assistant: state } })
        .eq('id', org.id);

      let mapping: SpreadsheetColumnMapping = {
        nameCol: parsed.headers[0] || null,
        priceCol: parsed.headers[1] || null,
        specsCol: null,
        variantsCol: null,
        includesCol: null,
      };
      try {
        const raw = (llmRes.response.choices[0]?.message?.content || '{}')
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/i, '')
          .trim();
        const m = JSON.parse(raw);
        if (m && typeof m === 'object') {
          mapping = {
            nameCol: parsed.headers.includes(m.nameCol) ? m.nameCol : mapping.nameCol,
            priceCol: parsed.headers.includes(m.priceCol) ? m.priceCol : null,
            specsCol: parsed.headers.includes(m.specsCol) ? m.specsCol : null,
            variantsCol: parsed.headers.includes(m.variantsCol) ? m.variantsCol : null,
            includesCol: parsed.headers.includes(m.includesCol) ? m.includesCol : null,
          };
        }
      } catch {}

      const items = matchImportedItemsWithGallery(
        applySpreadsheetColumnMapping(parsed.allRows, mapping),
        gallery
      );

      return NextResponse.json({
        kind: 'spreadsheet',
        totalRows: parsed.totalRows,
        items,
        exceededInlineLimit: items.length > PROMPT_ASSISTANT_CONFIG.catalogInlineMax,
        catalogInlineMax: PROMPT_ASSISTANT_CONFIG.catalogInlineMax,
      });
    }

    // 3. PDF de catálogo (detección previa de PDF escaneado en 0 tokens + bloques para confirmar)
    if (kind === 'pdf') {
      const header = buffer.subarray(0, 5).toString('ascii');
      if (header !== '%PDF-') {
        return NextResponse.json({ error: 'El archivo no es un PDF válido.' }, { status: 400 });
      }

      const pdfRes = await extractCatalogPdfText(buffer, PROMPT_ASSISTANT_CONFIG.pdfMaxPages);
      if (pdfRes.isScanned) {
        return NextResponse.json(
          {
            kind: 'pdf',
            isScanned: true,
            error:
              'Este PDF parece escaneado como imagen (no tiene texto seleccionable). Para evitar errores, súbelo como Excel/CSV o carga las fotos en Galería.',
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        kind: 'pdf',
        isScanned: false,
        totalPages: pdfRes.totalPages,
        pagesProcessed: pdfRes.pagesProcessed,
        blocks: pdfRes.blocks,
      });
    }

    return NextResponse.json({ error: 'Tipo de archivo no soportado.' }, { status: 400 });
  } catch (err: any) {
    console.error('[PROMPT ASSISTANT IMPORT ERROR]', err);
    return NextResponse.json(
      { error: err?.message || 'Error procesando archivo.' },
      { status: 500 }
    );
  }
}
