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
    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('gif')
      ? 'gif'
      : 'jpg';

    const safeMime = mimeType || 'image/jpeg';
    const filePath = `${organizationId}/${contactId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    const res = await fetch(`${supabaseUrl}/storage/v1/object/chat-media/${filePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': safeMime,
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[STORAGE UPLOAD INCOMING CHAT MEDIA ERROR]', res.status, errText);
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/chat-media/${filePath}`;
  } catch (err: any) {
    console.error('[UPLOAD INCOMING MEDIA EXCEPTION]', err);
    return null;
  }
}
