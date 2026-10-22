import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { supabaseAdmin } from '../lib/supabase/admin';
import { decryptSecret } from '../lib/security/encryption';

/**
 * Script de diagnóstico y prueba en vivo de WhatsApp Cloud API (Meta Graph v20.0)
 * Sin requerir OpenAI ni Cal.com.
 * 
 * Uso:
 *   npx tsx scripts/test-whatsapp.ts
 * O pasando credenciales directamente:
 *   npx tsx scripts/test-whatsapp.ts "PHONE_NUMBER_ID" "ACCESS_TOKEN" [OPTIONAL_RECIPIENT_PHONE]
 */
async function main() {
  console.log('📱 [TEST WHATSAPP CLOUD API] Iniciando prueba de conexión con Meta...\n');

  let phoneId = process.argv[2];
  let accessToken = process.argv[3];
  const testRecipient = process.argv[4];

  if (!phoneId || !accessToken) {
    const { data: org, error } = await (supabaseAdmin.from('organizations') as any)
      .select('name, whatsapp_phone_number_id, whatsapp_access_token')
      .not('whatsapp_phone_number_id', 'is', null)
      .not('whatsapp_access_token', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
      console.log('ℹ️  No se encontraron credenciales de WhatsApp guardadas en la base de datos.');
      console.log('👉 Puedes ejecutarlas pasando los parámetros por comando:');
      console.log('   npx tsx scripts/test-whatsapp.ts "104589234812345" "EAAG..." ["573001234567"]\n');
      return;
    }

    phoneId = org.whatsapp_phone_number_id;
    accessToken = decryptSecret(org.whatsapp_access_token);
    console.log(`🏢 Empresa detectada en BD: "${org.name}"`);
  }

  const cleanPhoneId = phoneId.trim().replace(/[^0-9]/g, '');
  const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, '');

  console.log(`🆔 Phone Number ID: ${cleanPhoneId}`);
  console.log(`🔑 Access Token: ${cleanToken.slice(0, 10)}...${cleanToken.slice(-6)}\n`);

  try {
    // 1. Consultar estado del número en Meta Graph API
    console.log('1️⃣  Consultando registro y calidad de la línea en Meta Graph API v20.0...');
    const metaUrl = `https://graph.facebook.com/v20.0/${cleanPhoneId}?fields=verified_name,display_phone_number,code_verification_status,quality_rating,platform_type`;
    
    const res = await fetch(metaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Error devuelto por Meta Graph API:');
      console.error(`   Código: ${data.error?.code || res.status}`);
      console.error(`   Tipo: ${data.error?.type || 'OAuthException'}`);
      console.error(`   Mensaje: ${data.error?.message || 'Error desconocido'}`);
      if (data.error?.error_user_title) {
        console.error(`   Detalle: ${data.error.error_user_title} - ${data.error.error_user_msg}`);
      }
      return;
    }

    console.log('   ✅ ¡Conexión con Meta exitosa!');
    console.log(`   🏷️  Nombre verificado: ${data.verified_name || '(No verificado aún)'}`);
    console.log(`   📞 Número en pantalla: ${data.display_phone_number || cleanPhoneId}`);
    console.log(`   🛡️  Estado de código: ${data.code_verification_status || 'VERIFIED'}`);
    console.log(`   ⭐ Calidad de línea (Quality Rating): ${data.quality_rating || 'GREEN'}`);
    console.log(`   🌐 Plataforma: ${data.platform_type || 'CLOUD_API'}\n`);

    // 2. Si se proporcionó un número de prueba, enviar un mensaje
    if (testRecipient) {
      const cleanTo = testRecipient.replace(/[^0-9]/g, '');
      console.log(`2️⃣  Enviando mensaje de prueba a: +${cleanTo}...`);

      const sendUrl = `https://graph.facebook.com/v20.0/${cleanPhoneId}/messages`;
      const sendRes = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'text',
          text: {
            preview_url: false,
            body: '🤖 [Synqo CRM] ¡Prueba de conexión exitosa con Meta WhatsApp Cloud API!',
          },
        }),
      });

      const sendData = await sendRes.json();
      if (sendRes.ok) {
        console.log(`   🎉 Mensaje enviado exitosamente! WAMID: ${sendData.messages?.[0]?.id}`);
      } else {
        console.error('   ⚠️ Error al enviar mensaje:', sendData.error?.message);
        console.log('   💡 Recuerda: Si han pasado más de 24h desde el último mensaje del lead, Meta exige usar una plantilla oficial pre-aprobada.');
      }
    } else {
      console.log('💡 Para probar el envío de un mensaje directo a tu celular:');
      console.log(`   npx tsx scripts/test-whatsapp.ts "${cleanPhoneId}" "${cleanToken}" "573XXXXXXXXX"\n`);
    }

    console.log('✅ WhatsApp Cloud API está listo y operativo para Synqo CRM.');
  } catch (err: any) {
    console.error('\n❌ Error de red al conectar con Meta:', err.message);
  }
}

main();

