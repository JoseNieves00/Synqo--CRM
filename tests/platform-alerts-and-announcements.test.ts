import assert from 'node:assert';
import {
  PlatformAlertsConfig,
  PlatformAnnouncement,
  PlatformEventLogItem,
  DEFAULT_PLATFORM_ALERTS_CONFIG,
  normalizePlatformAlertsConfig,
  isWithinQuietHours,
} from '../lib/monitoring/platform-alerts';
import {
  PlatformAlertService,
  buildSuperAdminDigestText,
} from '../services/platform-alert.service';

async function runPlatformAlertsSuite() {
  console.log('\n🔔 Iniciando Suite: Centro de Alertas Ops & Anuncios SuperAdmin...\n');

  // 1. Normalización de configuración y defaults
  const cfgDefault = normalizePlatformAlertsConfig({});
  assert.strictEqual(cfgDefault.enabled, true, 'enabled debe ser true por defecto');
  assert.strictEqual(cfgDefault.notifyOnTicket, true, 'notifyOnTicket debe ser true por defecto');
  assert.strictEqual(cfgDefault.notifyOnDisconnect, true, 'notifyOnDisconnect debe ser true por defecto');
  assert.strictEqual(cfgDefault.notifyOnBillingDelinquency, true, 'notifyOnBillingDelinquency debe ser true');
  assert.strictEqual(cfgDefault.quietHoursEnabled, false, 'quietHoursEnabled false por defecto');
  assert.strictEqual(cfgDefault.quietHoursStart, '22:00');
  assert.strictEqual(cfgDefault.quietHoursEnd, '07:00');
  console.log('   ✅ Normalización de configuración y defaults seguros comprobada.');

  // 2. Horario de silencio con cruce de medianoche en Bogotá
  const cfgQuiet: PlatformAlertsConfig = {
    ...DEFAULT_PLATFORM_ALERTS_CONFIG,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  };

  const nightDate = new Date('2026-11-10T23:30:00-05:00');
  assert.strictEqual(isWithinQuietHours(cfgQuiet, nightDate, 'America/Bogota'), true, '23:30 en silencio');

  const earlyDate = new Date('2026-11-10T03:15:00-05:00');
  assert.strictEqual(isWithinQuietHours(cfgQuiet, earlyDate, 'America/Bogota'), true, '03:15 en silencio');

  const dayDate = new Date('2026-11-10T14:00:00-05:00');
  assert.strictEqual(isWithinQuietHours(cfgQuiet, dayDate, 'America/Bogota'), false, '14:00 no debe estar en silencio');
  console.log('   ✅ Horario de silencio (no molestar) con cruce de medianoche validado.');

  // 3. Formato y legibilidad del digest de SuperAdmin
  const digest = buildSuperAdminDigestText({
    activeOrgs: 15,
    disconnectedOrgs: [{ name: 'Filippo Kids' }],
    openTicketsCount: 2,
    highUsageOrgs: [
      { name: 'Empresa Synqo', pct: 85, used: 425000, limit: 500000 },
    ],
  });
  assert.ok(digest.includes('Resumen Plataforma Synqo (SuperAdmin)'));
  assert.ok(digest.includes('Empresas activas: 15'));
  assert.ok(digest.includes('Filippo Kids'));
  assert.ok(digest.includes('Empresa Synqo: 85%'));
  console.log('   ✅ Digest de plataforma por WhatsApp verificado.');

  // 4. Subcomandos de WhatsApp para SuperAdmin
  const disconnectedReport = await PlatformAlertService.getDisconnectedChannelsReport();
  assert.ok(typeof disconnectedReport === 'string');

  const ticketsReport = await PlatformAlertService.getOpenTicketsReport();
  assert.ok(typeof ticketsReport === 'string');

  const tokensReport = await PlatformAlertService.getPlatformTokensReport();
  assert.ok(typeof tokensReport === 'string');
  console.log('   ✅ Sub-comandos #desconectados, #tickets y #consumo verificados.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE ALERTAS SUPERADMIN Y COMUNICADOS PASARON CON ÉXITO!\n');
}

runPlatformAlertsSuite().catch((err) => {
  console.error('❌ Error en suite de alertas SuperAdmin:', err);
  process.exit(1);
});
