import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { EvolutionService } from '@/services/evolution.service';
import { uploadIncomingChatMedia } from '@/lib/media/storage';
import { formatAudioMessageContent, parseAudioMessageContent } from '@/lib/media/format';
import { decryptSecret } from '@/lib/security/encryption';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('messageId');
    const isDownload = searchParams.get('download') === '1' || searchParams.get('download') === 'true';

    if (!messageId) {
      return NextResponse.json({ error: 'messageId es requerido' }, { status: 400 });
    }

    // 1. Obtener mensaje
    const { data: message, error: msgError } = await (supabaseAdmin.from('messages') as any)
      .select('id, content, contact_id, organization_id, meta_message_id, created_at')
      .eq('id', messageId)
      .maybeSingle();

    if (msgError || !message) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
    }

    let audioUrl: string | null = null;
    let transcription = '';

    const parsed = parseAudioMessageContent(message.content);
    if (parsed.isAudio && parsed.url) {
      audioUrl = parsed.url;
      transcription = parsed.transcription || '';
    } else {
      // Intentar extraer URL directa de storage si existe en el texto
      const urlMatch = message.content.match(/(https?:\/\/[^\s\]\)]+(?:chat-media|\.(?:ogg|opus|mp3|wav|m4a|webm))[^\s\]\)]*)/i);
      if (urlMatch) {
        audioUrl = urlMatch[1];
      }
    }

    // 2. Si no tiene audioUrl pero tiene meta_message_id, recuperar desde Evolution API
    if (!audioUrl && message.meta_message_id && message.organization_id) {
      try {
        const { data: org } = await (supabaseAdmin.from('organizations') as any)
          .select('id, evolution_api_url, evolution_api_key, evolution_instance_name')
          .eq('id', message.organization_id)
          .maybeSingle();

        if (org?.evolution_instance_name) {
          const finalApiKey = org.evolution_api_key ? decryptSecret(org.evolution_api_key) : (process.env.EVOLUTION_API_KEY || '');
          const finalApiUrl = org.evolution_api_url || process.env.EVOLUTION_API_URL || '';

          const mediaData = await EvolutionService.getBase64Audio({
            apiUrl: finalApiUrl,
            apiKey: finalApiKey,
            instanceName: org.evolution_instance_name,
            messageId: message.meta_message_id,
          });

          if (mediaData?.base64) {
            const buffer = Buffer.from(mediaData.base64, 'base64');
            const cleanMime = mediaData.mimetype || 'audio/ogg';

            const uploadedUrl = await uploadIncomingChatMedia({
              buffer,
              mimeType: cleanMime,
              organizationId: message.organization_id,
              contactId: message.contact_id || 'general',
            });

            if (uploadedUrl) {
              audioUrl = uploadedUrl;
              // Extraer transcripción previa si la tenía
              const transMatch = message.content.match(/"([^"]+)"/);
              transcription = transMatch ? transMatch[1] : '';

              const updatedContent = formatAudioMessageContent(uploadedUrl, transcription || undefined);
              await (supabaseAdmin.from('messages') as any)
                .update({ content: updatedContent })
                .eq('id', message.id);
            }
          }
        }
      } catch (recoverErr) {
        console.warn('[RECOVER AUDIO WARN]', recoverErr);
      }
    }

    if (!audioUrl) {
      return NextResponse.json({ error: 'Audio no disponible para este mensaje' }, { status: 404 });
    }

    // 3. Si se solicita descarga directa en binario (attachment)
    if (isDownload) {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return NextResponse.redirect(audioUrl);
      }

      const audioBuffer = await audioRes.arrayBuffer();
      const contentType = audioRes.headers.get('content-type') || 'audio/ogg';
      const fileExt = contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : 'ogg';
      const filename = `nota_de_voz_${message.id.slice(0, 8)}.${fileExt}`;

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    return NextResponse.json({
      success: true,
      url: audioUrl,
      transcription,
    });
  } catch (err: any) {
    console.error('[API MEDIA AUDIO ERROR]', err);
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 });
  }
}
