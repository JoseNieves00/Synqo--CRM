import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Sube una imagen o archivo multimedia entrante al bucket `chat-media` de Supabase Storage
 * y devuelve la URL pública del CDN.
 */
export async function uploadIncomingChatMedia({
  buffer,
  mimeType,
  organizationId,
  contactId,
}: {
  buffer: Buffer;
  mimeType: string;
  organizationId: string;
  contactId: string;
}): Promise<string | null> {
  try {
    const rawMime = (mimeType || 'application/octet-stream').toLowerCase();
    // Limpiar directivas extras como '; codecs=opus' que rompen el validador MIME de Supabase Storage
    const safeMime = rawMime.split(';')[0].trim();

    let ext = 'ogg';
    if (safeMime.includes('png')) ext = 'png';
    else if (safeMime.includes('webp')) ext = 'webp';
    else if (safeMime.includes('gif')) ext = 'gif';
    else if (safeMime.includes('pdf')) ext = 'pdf';
    else if (safeMime.includes('audio/mp4') || safeMime.includes('audio/m4a') || safeMime.includes('m4a')) ext = 'm4a';
    else if (safeMime.includes('audio/mpeg') || safeMime.includes('mp3')) ext = 'mp3';
    else if (safeMime.includes('audio/wav') || safeMime.includes('wav')) ext = 'wav';
    else if (safeMime.includes('audio/webm')) ext = 'webm';
    else if (safeMime.includes('audio/aac') || safeMime.includes('aac')) ext = 'aac';
    else if (safeMime.includes('audio/ogg') || safeMime.includes('opus')) ext = 'ogg';
    else if (safeMime.includes('video/mp4')) ext = 'mp4';
    else if (safeMime.includes('quicktime') || safeMime.includes('mov')) ext = 'mov';
    else if (safeMime.includes('video/webm')) ext = 'webm';
    else if (safeMime.includes('video/3gpp') || safeMime.includes('3gp')) ext = '3gp';
    else if (safeMime.startsWith('image/')) ext = 'jpg';

    const cleanSafeMime = safeMime.startsWith('audio/') || safeMime.startsWith('video/') || safeMime.startsWith('image/') || safeMime === 'application/pdf'
      ? safeMime
      : (ext === 'ogg' ? 'audio/ogg' : 'application/octet-stream');

    const filePath = `${organizationId}/${contactId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(filePath, buffer, {
        contentType: cleanSafeMime,
        upsert: true,
      });

    if (uploadError) {
      console.error('[STORAGE UPLOAD INCOMING CHAT MEDIA ERROR]', uploadError);
      return null;
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    return publicData.publicUrl;
  } catch (err: any) {
    console.error('[UPLOAD INCOMING MEDIA EXCEPTION]', err);
    return null;
  }
}
