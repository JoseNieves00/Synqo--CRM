# 🚀 Guía Rápida de Despliegue en Vercel (Producción) - Synqo CRM

Esta guía detalla los pasos exactos para desplegar **Synqo CRM (`synqo.dev`)** en Vercel de forma segura y con alta disponibilidad.

---

## 1. Requisitos Previos

Antes de comenzar, asegúrate de tener:
- Una cuenta en [Vercel](https://vercel.com).
- Un proyecto activo en [Supabase](https://supabase.com).
- Tu App configurada en [Meta for Developers](https://developers.facebook.com).
- Tu clave maestra de [OpenAI](https://platform.openai.com) con saldo disponible.

---

## 2. Conectar el Repositorio a Vercel

1. Entra a tu dashboard de [Vercel](https://vercel.com) y haz clic en **"Add New... → Project"**.
2. Conecta tu cuenta de GitHub / GitLab y selecciona el repositorio de `CRM synqo.dev`.
3. Selecciona la rama de producción (ej. `Dev` o `main`).
4. **Configuración de Build:**
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `./` (raíz)
   - **Build Command:** `npm run build` (por defecto)
   - **Install Command:** `npm install` (por defecto)

---

## 3. Variables de Entorno en Vercel (Environment Variables)

En la sección **"Environment Variables"** de Vercel, copia y pega las siguientes variables para los entornos **Production**, **Preview** y **Development**:

| Variable | Tipo / Valor Requerido | Descripción |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | URL pública de tu instancia de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Clave pública anónima de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | **Secreto:** Clave con privilegios administrativos (Service Role) |
| `SUPABASE_WEBHOOK_SECRET` | Texto aleatorio seguro (ej. 32 chars) | Secreto para autenticar webhooks internos de Supabase |
| `ENCRYPTION_KEY` | Hexadecimal de 64 caracteres (32 bytes) | Clave maestra para cifrado **AES-256-GCM** de tokens en reposo |
| `OPENAI_API_KEY` | `sk-proj-...` | Clave de OpenAI para inferencias y failover de emergencia |
| `GEMINI_API_KEY` | `AIzaSy...` | Clave de Google AI Studio (Gemini 2.0 / 1.5 Flash - Motor Primario $0) |
| `SUPER_ADMIN_EMAIL` | `admin@synqo.dev` (o tu email) | Correo con privilegios máximos y exención de cobros |
| `CRON_SECRET` | Texto aleatorio seguro | Token secreto para proteger `/api/cron/appointment-reminders` |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` *(Opcional)* | Client ID de Google OAuth para vinculación con 1 Clic |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxx` *(Opcional)* | Client Secret de Google OAuth para Meet y Calendar |
| `NEXT_PUBLIC_APP_URL` | `https://tu-dominio.com` | URL base de la aplicación en producción |
| `META_APP_SECRET` | `a1b2c3d4...` | App Secret de tu app en Meta for Developers (para firma HMAC) |
| `META_WEBHOOK_VERIFY_TOKEN` | Texto aleatorio seguro | Token secreto para el handshake inicial con Meta |
| `NEXT_PUBLIC_META_APP_ID` | `123456789...` *(Opcional)* | App ID de Meta para Embedded Signup |
| `NEXT_PUBLIC_META_CONFIG_ID` | `xxxx...` *(Opcional)* | Configuration ID de Meta para Embedded Signup |
| `UPSTASH_REDIS_REST_URL` | `https://xxxx.upstash.io` *(Opcional)* | URL de Upstash Redis para Rate Limiting distribuido |
| `UPSTASH_REDIS_REST_TOKEN` | `Axxx...` *(Opcional)* | Token de Upstash Redis |
| `RESEND_API_KEY` | `re_xxxx...` *(Opcional)* | Clave de Resend para alertas por correo al administrador |

> [!TIP]
> **¿Cómo generar una clave segura para `ENCRYPTION_KEY`?**
> Abre tu terminal y ejecuta:
> ```bash
> openssl rand -hex 32
> ```
> El resultado (64 caracteres) es tu clave de cifrado de grado militar.

---

## 4. Ejecutar Migraciones SQL en Supabase

Antes o justo después de desplegar, entra a tu proyecto en **Supabase → SQL Editor** y ejecuta los scripts de la carpeta `supabase/migrations/` en orden cronológico si aún no los has aplicado:

1. `20261020000000_init_crm_schema.sql` (Esquema base, RLS y roles)
2. `20261020010000_add_super_admin_and_seats.sql` (Control de asientos y Super Admin)
3. `20261020020000_add_token_tracking.sql` (Monitoreo de tokens)
4. `20261021000000_allow_starter_plan_type.sql` (Soporte de plan Starter)
5. `20261021010000_add_manual_billing_and_mora_system.sql` (Ciclo de mora y cobranza)
6. `20261022000000_add_cal_com_enabled.sql` (Compatibilidad de módulo externo)
7. `20261022010000_enable_rls_on_payments.sql` (Blindaje RLS en pagos)
8. `20261022020000_add_whatsapp_app_secret.sql` (Secreto por tenant)
9. `20261026010000_add_whatsapp_templates.sql` (Plantillas HSM)
10. `20261026020000_add_agent_assignment_and_presence.sql` (Asignación multiagente y presencia)
11. `20261027010000_add_support_tickets_system.sql` (Sistema de tickets y soporte)
12. `20261027020000_add_ai_knowledge_gaps_and_multiniche.sql` (Brechas de conocimiento y presets de nicho)
13. `20261027030000_add_native_calendar_and_staff_portal.sql` (Calendario nativo, aforos, citas y portal móvil)
14. `20261027040000_add_staff_invitations_and_password_auth.sql` (Invitaciones QR seguras y auth de colaboradores)
15. `20261027050000_enable_btree_gist_and_anti_race_constraints.sql` (Restricciones atómicas anti-colisión en DB)
16. `20261029010000_add_niche_reference_and_virtual_meetings.sql` (Referencias personalizadas y reuniones virtuales Meet)
17. `20261029020000_add_instagram_inbox_and_google_calendar_settings.sql` (Inbox Instagram Direct y Google Calendar Sync)
18. `20261030010000_add_dual_engine_tokens_and_backup.sql` (Métricas duales Gemini / OpenAI y cuota de backup)
19. `20261030020000_add_zapi_whatsapp_provider.sql` (Soporte Z-API Express QR y protección anti-ban)
20. `20261103010000_add_custom_labels_to_organizations.sql` (Nomenclatura multi-nicho personalizable)
21. `20261103020000_add_soft_delete_to_contacts.sql` (Papelera y soft-delete de contactos)
22. `20261104010000_add_evolution_whatsapp_provider.sql` (Soporte Evolution API v2 para VPS propio, QR, pairing code y sync)
23. `20261104020000_purge_zapi_finalize_evolution.sql` (Depuración total de Z-API y consolidación Evolution API + Meta)

---

## 5. Configurar Webhooks con tu Dominio de Producción

Una vez que Vercel termine el despliegue y te asigne tu dominio (ej. `https://crm-synqo.vercel.app` o tu dominio propio `https://synqo.dev`):

### A. Webhook de WhatsApp Meta Cloud API (si usas Meta):
1. Ve a **[Meta for Developers](https://developers.facebook.com) → Tu App → WhatsApp → Configuration**.
2. En **Callback URL**, escribe:
   ```text
   https://tu-dominio.com/api/whatsapp/webhook
   ```
3. En **Verify Token**, escribe el valor de `META_WEBHOOK_VERIFY_TOKEN`.
4. En **Webhook fields**, suscríbete a `messages`.

### B. Webhook de Evolution API v2 (VPS Propio):
Synqo CRM autoconfigura los webhooks en el VPS automáticamente al vincular WhatsApp o guardar credenciales.
La URL destino oficial en Synqo CRM es:
```text
https://tu-dominio.com/api/webhooks/whatsapp/evolution
```

### C. Webhook de Meta Instagram Direct (opcional):
1. En **Meta for Developers → Instagram → Configuration**.
2. **Callback URL:** `https://tu-dominio.com/api/instagram/webhook`
3. **Verify Token:** El valor de `META_WEBHOOK_VERIFY_TOKEN`.
4. En **Subscription fields**, suscríbete a `messages`.

### D. Webhook de Supabase (Alertas de Relevo Humano):
1. Ve a **Supabase → Database → Webhooks → Create a new webhook**.
2. **Name:** `handoff-alerts`
3. **Table:** `contacts` | **Events:** `UPDATE` | **Method:** `POST`
4. **URL:** `https://tu-dominio.com/api/webhooks/supabase-handoff`
5. **HTTP Headers:** `x-supabase-webhook-secret: <SUPABASE_WEBHOOK_SECRET>`

---

## 6. Automatización (pg_cron en Supabase, NO Vercel Cron)

Los crons **no corren en Vercel** (`vercel.json` está vacío a propósito): están programados en la base de datos con `pg_cron + pg_net` vía la migración `20261111100000_schedule_core_crons.sql`:

- **`/api/cron/lead-reactivation`** — cada 15 min: recontacto autónomo por score, recálculo de lead score, **reintentos diferidos de IA** (cola `ai_retry_queue`), auto-clasificación, auditorías pasivas y digest.
- **`/api/cron/appointment-reminders`** — cada 15 min: recordatorios de citas (toque de queda nocturno) y liberación de citas no confirmadas.
- **`/api/cron/cleanup-storage`** — diario 03:00 UTC: retención de media.

**Configuración única (SQL Editor en Supabase, obligatoria):**

```sql
select vault.create_secret('https://TU-DOMINIO-PRODUCCION.com', 'synqo_app_url');
select vault.create_secret('<valor de CRON_SECRET>', 'synqo_cron_secret');
```

Si estos secretos **no existen, los crons se omiten** — ya no es silencioso: la omisión queda registrada en la tabla `cron_job_log` y es visible en el panel `/admin` (SuperAdmin → "Salud de Automatización"). La autenticación de los endpoints es exclusivamente `Authorization: Bearer CRON_SECRET` (o `?secret=`).

Verificación manual local o contra producción: `npx tsx scripts/verify-crons.ts`.

---

## 7. Dominio Personalizado y SSL

1. En tu proyecto de Vercel, ve a **Settings → Domains**.
2. Agrega tu dominio (ej. `app.synqo.dev` o `crm.tuempresa.com`).
3. Agrega el registro `CNAME` o `A` en tu proveedor DNS (Cloudflare, GoDaddy, Namecheap).
4. Vercel aprovisionará el certificado **SSL (HTTPS)** automáticamente en menos de 2 minutos.

---

## 8. Checklist de Verificación Post-Deploy

- [ ] Inicia sesión en `/login` con tu usuario Super Admin (`admin@synqo.dev`).
- [ ] Entra a `/admin` y confirma que la empresa de demo aparezca con la insignia `👑 Super Admin` y `Cuenta Exenta`.
- [ ] Entra a `/settings` y confirma que los inputs de WhatsApp tengan el botón de visibilidad de contraseña y que Cal.com solo se muestre si está activo.
- [ ] Envía un mensaje de prueba al WhatsApp del CRM y confirma que responda en menos de 2 segundos.

