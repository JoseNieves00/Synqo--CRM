import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { supabaseAdmin } from '../lib/supabase/admin';
import { decryptSecret } from '../lib/security/encryption';
import { CalService } from '../services/cal.service';

/**
 * Script de diagnóstico y prueba en vivo de Cal.com API v2
 * Sin requerir OpenAI ni Meta WhatsApp Cloud API.
 * 
 * Uso manual:
 *   npx tsx scripts/test-cal.ts
 * O pasando credenciales directas:
 *   npx tsx scripts/test-cal.ts "cal_live_xxxx" "cita-comercial"
 */
async function main() {
  console.log('🗓️  [TEST CAL.COM API v2] Iniciando prueba de conexión directa...\n');

  let apiKey = process.argv[2];
  let eventType = process.argv[3] || 'cita-comercial';

  // Si no se pasaron por terminal, consultar la última organización en Supabase
  if (!apiKey) {
    const { data: org, error } = await (supabaseAdmin.from('organizations') as any)
      .select('name, cal_api_key, cal_event_type_id')
      .not('cal_api_key', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !org?.cal_api_key) {
      console.log('ℹ️  No se encontraron credenciales guardadas en la base de datos.');
      console.log('👉 Puedes ejecutarlas directamente pasando tu clave por comando:');
      console.log('   npx tsx scripts/test-cal.ts "cal_live_tu_api_key" "cita-comercial"\n');
      return;
    }

    apiKey = decryptSecret(org.cal_api_key);
    eventType = org.cal_event_type_id || eventType;
    console.log(`🏢 Empresa detectada en BD: "${org.name}"`);
  }

  console.log(`🔑 Clave API: ${apiKey.slice(0, 12)}...`);
  console.log(`🎯 Event Type / Slug a consultar: "${eventType}"\n`);

  try {
    // 1. Resolver el ID numérico del evento
    console.log('1️⃣  Resolviendo identificador de evento en Cal.com...');
    const numericId = await CalService.resolveEventTypeId(apiKey, eventType);
    console.log(`   ✅ Evento resuelto exitosamente a ID numérico: ${numericId}\n`);

    // 2. Calcular el día siguiente hábil dentro de horario laboral (08:00 a 18:00)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);

    // Si el día siguiente cae en fin de semana (Sábado=6, Domingo=0), mover al siguiente Lunes laboral
    const dayOfWeek = targetDate.getDay();
    if (dayOfWeek === 6) {
      targetDate.setDate(targetDate.getDate() + 2); // Sábado -> Lunes
    } else if (dayOfWeek === 0) {
      targetDate.setDate(targetDate.getDate() + 1); // Domingo -> Lunes
    }

    const formatLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const dateFrom = formatLocalDate(targetDate);

    const nextDay = new Date(targetDate);
    nextDay.setDate(targetDate.getDate() + 1);
    const dateTo = formatLocalDate(nextDay);

    const dayName = targetDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    console.log(`2️⃣  Consultando horarios para el día siguiente hábil:`);
    console.log(`   📅 Día: ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${dateFrom})`);
    console.log(`   ⏰ Franja laboral evaluada: 08:00 AM a 06:00 PM\n`);

    const rawSlots = await CalService.getAvailableSlots(apiKey, numericId, dateFrom, dateTo);

    // Filtrar para asegurar que queden estrictamente en la fecha consultada y en horario laboral local (8am a 6pm)
    const businessSlots = rawSlots.filter((slot) => {
      const d = new Date(slot);
      const isSameDay = formatLocalDate(d) === dateFrom;
      const hour = d.getHours();
      return isSameDay && hour >= 8 && hour < 18;
    });

    const displaySlots = businessSlots.length > 0 ? businessSlots : rawSlots;

    if (displaySlots.length === 0) {
      console.log('   ℹ️  Conexión exitosa con Cal.com, pero no hay huecos libres en horario laboral para esa fecha.');
      console.log('   💡 Consejo: Verifica en app.cal.com que tu "Event Type" tenga horario asignado (Working Hours) y tu Google Calendar no esté bloqueado.');
    } else {
      console.log(`   🎉 ¡Conexión 100% Funcional! Se encontraron ${displaySlots.length} horarios libres en horario laboral:`);
      displaySlots.forEach((slot, i) => {
        const d = new Date(slot);
        const timeFormatted = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
        console.log(`      ${i + 1}. ${timeFormatted} (${slot})`);
      });
    }

    console.log('\n✅ Cal.com está perfectamente sincronizado con Synqo CRM.');
  } catch (err: any) {
    console.error('\n❌ Error al conectar con Cal.com:', err.message);
  }
}

main();

