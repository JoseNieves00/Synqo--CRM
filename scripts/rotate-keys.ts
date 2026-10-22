import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Cargar variables de entorno locales
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OLD_KEY_RAW = process.env.ENCRYPTION_KEY_OLD || '';
const NEW_KEY_RAW = process.env.ENCRYPTION_KEY_NEW || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ FATAL: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.');
  process.exit(1);
}

if (!OLD_KEY_RAW || !NEW_KEY_RAW) {
  console.error('❌ FATAL: Debes definir ENCRYPTION_KEY_OLD y ENCRYPTION_KEY_NEW en tus variables de entorno.');
  console.error('Ejemplo: ENCRYPTION_KEY_OLD=clave1 ENCRYPTION_KEY_NEW=clave2 npm run rotate-keys');
  process.exit(1);
}

function deriveKey(rawKey: string): Buffer {
  if (rawKey.length === 64) {
    return Buffer.from(rawKey, 'hex');
  }
  const buf = Buffer.from(rawKey, 'utf8');
  if (buf.length === 32) {
    return buf;
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

const keyOld = deriveKey(OLD_KEY_RAW);
const keyNew = deriveKey(NEW_KEY_RAW);

function decryptWithKey(cipherPayload: string, key: Buffer): string {
  if (!cipherPayload || !cipherPayload.startsWith('enc:')) {
    return cipherPayload;
  }
  const parts = cipherPayload.split(':');
  if (parts.length !== 4) {
    throw new Error('Formato cifrado inválido o corrupto');
  }

  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), {
    authTagLength: 16,
  });
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  let dec = decipher.update(dataHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

function encryptWithKey(plainText: string, key: Buffer): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: 16,
  });

  let enc = cipher.update(plainText, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${tag}:${enc}`;
}

async function runKeyRotation() {
  console.log('🔄 Iniciando rotación de llaves criptográficas para Synqo CRM...');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, whatsapp_access_token, cal_api_key');

  if (error || !orgs) {
    console.error('❌ Error al consultar organizaciones:', error?.message);
    process.exit(1);
  }

  console.log(`📋 Se identificaron ${orgs.length} organizaciones.`);
  let rotatedCount = 0;

  for (const org of orgs) {
    try {
      let newWhatsAppToken = org.whatsapp_access_token;
      let newCalApiKey = org.cal_api_key;

      if (org.whatsapp_access_token) {
        const plain = decryptWithKey(org.whatsapp_access_token, keyOld);
        newWhatsAppToken = encryptWithKey(plain, keyNew);
      }

      if (org.cal_api_key) {
        const plainCal = decryptWithKey(org.cal_api_key, keyOld);
        newCalApiKey = encryptWithKey(plainCal, keyNew);
      }

      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          whatsapp_access_token: newWhatsAppToken,
          cal_api_key: newCalApiKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', org.id);

      if (updateError) {
        console.error(`❌ Falló actualización en organización ${org.id}:`, updateError.message);
      } else {
        rotatedCount++;
        console.log(`✅ Organización rotada exitosamente: ${org.name} (${org.id})`);
      }
    } catch (e: any) {
      console.error(`❌ Error procesando organización ${org.id}:`, e.message);
    }
  }

  console.log(`\n🎉 Rotación de credenciales completada: ${rotatedCount}/${orgs.length} organizaciones actualizadas.`);
  console.log('⚠️ IMPORTANTE: Recuerda actualizar la variable ENCRYPTION_KEY en Vercel/Producción con el nuevo valor.');
}

runKeyRotation().catch((err) => {
  console.error('❌ Error fatal durante la ejecución:', err);
  process.exit(1);
});

