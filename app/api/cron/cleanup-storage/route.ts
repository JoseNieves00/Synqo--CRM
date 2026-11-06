import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseVideoMessageContent } from '@/lib/media/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Endpoint de Cron Worker para Retención Responsable de Almacenamiento (Política de 45 días)
 * Elimina videos pesados (.mp4, .mov, etc.) de Supabase Storage (bucket 'chat-media')
 * luego de 45 días para evitar costes de almacenamiento desmedidos, manteniendo
 * intacto el historial en el WhatsApp del cliente y asesor.
 *
 * Requiere cabecera obligatoria: Authorization: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  return handleCleanup(request);
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}

async function handleCleanup(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[CLEANUP STORAGE ALERT] CRON_SECRET no está configurado en el servidor.');
    return NextResponse.json({ error: 'Unauthorized: CRON_SECRET not configured' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const expectedHeader = `Bearer ${cronSecret}`;

  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized: Missing Authorization header' }, { status: 401 });
  }

  const authBuf = Buffer.from(authHeader, 'utf8');
  const expBuf = Buffer.from(expectedHeader, 'utf8');

  if (authBuf.length !== expBuf.length || !crypto.timingSafeEqual(authBuf, expBuf)) {
    return NextResponse.json({ error: 'Unauthorized: Invalid CRON_SECRET' }, { status: 401 });
  }

  try {
    const cutoffDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    // Consultar mensajes con video anteriores a 45 días en lotes de 100
    const { data: messages, error } = await (supabaseAdmin.from('messages') as any)
      .select('id, content')
      .lt('created_at', cutoffDate)
      .like('content', '%[Video:%')
      .limit(100);

    if (error) {
      console.error('[STORAGE CLEANUP ERROR] Error al consultar mensajes:', error);
      return NextResponse.json({ error: 'Error querying messages' }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay videos antiguos pendientes de limpieza (>45 días)',
        processedCount: 0,
        deletedFilesCount: 0,
      });
    }

    const pathsToDelete: string[] = [];
    const messageUpdates: Array<{ id: string; content: string }> = [];

    for (const msg of messages) {
      const parsed = parseVideoMessageContent(msg.content);
      if (!parsed || !parsed.url) continue;

      // Extraer ruta relativa dentro del bucket 'chat-media'
      // Formatos posibles: .../chat-media/orgId/filename.mp4 o con query params
      const splitUrl = parsed.url.split('/chat-media/');
      if (splitUrl.length > 1) {
        const filePath = decodeURIComponent(splitUrl[1].split('?')[0]);
        if (filePath) {
          pathsToDelete.push(filePath);
        }
      }

      messageUpdates.push({
        id: msg.id,
        content: '📹 [Video archivado en CRM tras 45 días — disponible en el dispositivo WhatsApp]',
      });
    }

    // 1. Eliminar archivos de Supabase Storage en lote
    let deletedFilesCount = 0;
    if (pathsToDelete.length > 0) {
      const { data: removeResult, error: removeErr } = await supabaseAdmin.storage
        .from('chat-media')
        .remove(pathsToDelete);

      if (removeErr) {
        console.error('[STORAGE CLEANUP ERROR] Fallo al eliminar archivos de Storage:', removeErr);
      } else {
        deletedFilesCount = removeResult?.length || pathsToDelete.length;
      }
    }

    // 2. Actualizar mensajes en base de datos para reflejar que el video fue archivado
    for (const update of messageUpdates) {
      await (supabaseAdmin.from('messages') as any)
        .update({ content: update.content })
        .eq('id', update.id);
    }

    return NextResponse.json({
      success: true,
      processedCount: messageUpdates.length,
      deletedFilesCount,
      cutoffDate,
    });
  } catch (err: any) {
    console.error('[STORAGE CLEANUP EXCEPTION]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
