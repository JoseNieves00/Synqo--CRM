import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService } from '@/services/whatsapp.service';
import { encryptSecret } from '@/lib/security/encryption';
import { revalidatePath } from 'next/cache';

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Endpoint del backend para Meta WhatsApp Embedded Signup.
 * Recibe el código de autorización generado en el navegador del cliente tras completar
 * el flujo guiado oficial de Meta ("Conectar con Facebook / WhatsApp").
 *
 * 1. Valida que el usuario sea administrador de la organización.
 * 2. Intercambia el código por un Access Token con Meta Graph API.
 * 3. Obtiene el token de larga duración (~60 días / permanente).
 * 4. Suscribe la WABA a los webhooks de Synqo CRM (subscribed_apps).
 * 5. Identifica el Phone Number ID comercial del cliente.
 * 6. Cifra el token con AES-256-GCM y lo persiste en la base de datos de la organización.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verificar perfil y rol de administrador
    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && !profile.is_super_admin)) {
      return NextResponse.json(
        { error: 'Solo los administradores pueden vincular credenciales de WhatsApp.' },
        { status: 403 }
      );
    }

    const orgId = profile.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: 'Organización no encontrada.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { code, phoneNumberId: passedPhoneId, wabaId: passedWabaId } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'El código de autorización de Meta es obligatorio.' },
        { status: 400 }
      );
    }

    // 1. Intercambiar código por Access Token
    console.log(`[EMBEDDED SIGNUP] Iniciando intercambio de código para org ${orgId}...`);
    const tokenResult = await WhatsAppService.exchangeCodeForToken(code);
    let accessToken = tokenResult.accessToken;

    // 2. Intentar obtener token de larga duración
    accessToken = await WhatsAppService.getLongLivedToken(accessToken);

    // 3. Obtener o inferir WABA ID
    let wabaId = passedWabaId;
    if (!wabaId) {
      const debugInfo = await WhatsAppService.debugToken(accessToken);
      if (debugInfo.wabaIds && debugInfo.wabaIds.length > 0) {
        wabaId = debugInfo.wabaIds[0];
      }
    }

    // 4. Suscribir la WABA a webhooks de Synqo
    let subscribed = false;
    if (wabaId) {
      subscribed = await WhatsAppService.subscribeWabaApp(wabaId, accessToken);
    }

    // 5. Determinar el Phone Number ID
    let phoneNumberId = passedPhoneId;
    let phoneDetails: {
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    } | null = null;

    if (!phoneNumberId && wabaId) {
      const numbers = await WhatsAppService.getWabaPhoneNumbers(wabaId, accessToken);
      if (numbers.length > 0) {
        phoneNumberId = numbers[0].id;
        phoneDetails = numbers[0];
      }
    } else if (phoneNumberId) {
      phoneDetails = await WhatsAppService.getPhoneNumberDetails(phoneNumberId, accessToken);
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        {
          error:
            'No se detectó ningún número de WhatsApp Business configurado en la cuenta de Meta. Completa el registro del número en el Administrador de WhatsApp de Meta y vuelve a intentarlo.',
        },
        { status: 422 }
      );
    }

    // 6. Cifrar token con AES-256-GCM
    const encryptedToken = encryptSecret(accessToken);

    // Si Meta App Secret está configurado en el servidor, cifrarlo también para la org
    const serverAppSecret = process.env.META_APP_SECRET;
    const encryptedAppSecret = serverAppSecret ? encryptSecret(serverAppSecret) : null;

    // 7. Persistir en la tabla organizations
    const updatePayload: Record<string, any> = {
      whatsapp_phone_number_id: phoneNumberId.trim().replace(/[^0-9]/g, ''),
      whatsapp_access_token: encryptedToken,
      updated_at: new Date().toISOString(),
    };

    if (encryptedAppSecret) {
      updatePayload.whatsapp_app_secret = encryptedAppSecret;
    }

    const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
      .update(updatePayload)
      .eq('id', orgId);

    if (updateError) {
      console.error('[EMBEDDED SIGNUP DB ERROR]', updateError);
      return NextResponse.json(
        { error: `Error guardando credenciales en base de datos: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log(
      `[EMBEDDED SIGNUP SUCCESS] Org ${orgId} vinculada exitosamente con WhatsApp Phone ID: ${phoneNumberId}`
    );

    revalidatePath('/settings');

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business vinculado exitosamente con Synqo CRM.',
      phoneNumberId,
      displayPhoneNumber: phoneDetails?.display_phone_number || null,
      verifiedName: phoneDetails?.verified_name || null,
      wabaId: wabaId || null,
      webhooksSubscribed: subscribed,
    });
  } catch (err: any) {
    console.error('[EMBEDDED SIGNUP ENDPOINT ERROR]', err);
    return NextResponse.json(
      { error: err?.message || 'Error interno procesando vinculación de WhatsApp Embedded Signup.' },
      { status: 500 }
    );
  }
}
