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
| `OPENAI_API_KEY` | `sk-proj-...` | Clave maestra central de OpenAI para todos los agentes comerciales |
| `SUPER_ADMIN_EMAIL` | `admin@synqo.dev` (o tu email) | Correo con privilegios máximos y exención de cobros |
| `META_APP_SECRET` | `a1b2c3d4...` | App Secret de tu app en Meta for Developers (para firma HMAC) |
| `META_WEBHOOK_VERIFY_TOKEN` | Texto aleatorio seguro | Token secreto para el handshake inicial con Meta |
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
3. `20261020020000_add_token_tracking.sql` (Monitoreo de tokens OpenAI)
4. `20261021000000_allow_starter_plan_type.sql` (Soporte de plan Starter)
5. `20261021010000_add_manual_billing_and_mora_system.sql` (Ciclo de mora y cobranza)
6. `20261022000000_add_cal_com_enabled.sql` (Módulo Cal.com opcional por empresa)
7. `20261022010000_enable_rls_on_payments.sql` (Blindaje RLS en pagos)

---

## 5. Configurar Webhooks con tu Dominio de Vercel

Una vez que Vercel termine el despliegue y te asigne tu dominio (ej. `https://crm-synqo.vercel.app` o tu dominio propio `https://app.synqo.dev`):

### A. Webhook de WhatsApp en Meta for Developers:
1. Ve a **[Meta for Developers](https://developers.facebook.com) → Tu App → WhatsApp → Configuration**.
2. En **Callback URL**, escribe:
   ```text
   https://tu-dominio.vercel.app/api/whatsapp/webhook
   ```
3. En **Verify Token**, escribe exactamente el mismo valor que pusiste en `META_WEBHOOK_VERIFY_TOKEN`.
4. Haz clic en **Verify and Save**.
5. En **Webhook fields**, suscríbete a:
   - ✅ `messages`

### B. Webhook de Supabase (Alertas de Relevo Humano y Citas):
1. Ve a **Supabase → Database → Webhooks → Create a new webhook**.
2. **Name:** `handoff-alerts`
3. **Table:** `contacts`
4. **Events:** `UPDATE`
5. **Method:** `POST`
6. **URL:** `https://tu-dominio.vercel.app/api/webhooks/supabase-handoff`
7. **HTTP Headers:**
   - Name: `x-supabase-webhook-secret`
   - Value: El mismo valor que pusiste en `SUPABASE_WEBHOOK_SECRET`

---

## 6. Dominio Personalizado y SSL

1. En tu proyecto de Vercel, ve a **Settings → Domains**.
2. Agrega tu dominio (ej. `app.synqo.dev` o `crm.tuempresa.com`).
3. Agrega el registro `CNAME` o `A` en tu proveedor DNS (Cloudflare, GoDaddy, Namecheap).
4. Vercel aprovisionará el certificado **SSL (HTTPS)** automáticamente en menos de 2 minutos.

---

## 7. Checklist de Verificación Post-Deploy

- [ ] Inicia sesión en `/login` con tu usuario Super Admin (`admin@synqo.dev`).
- [ ] Entra a `/admin` y confirma que la empresa de demo aparezca con la insignia `👑 Super Admin` y `Cuenta Exenta`.
- [ ] Entra a `/settings` y confirma que los inputs de WhatsApp tengan el botón de visibilidad de contraseña y que Cal.com solo se muestre si está activo.
- [ ] Envía un mensaje de prueba al WhatsApp del CRM y confirma que responda en menos de 2 segundos.

