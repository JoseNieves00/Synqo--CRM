# 📘 Manual de Operaciones & Consola Super Admin — Synqo CRM

> **Documento Confidencial para el Propietario / Operador de Synqo (synqo.dev)**  
> Versión: 1.0 (Producción Comercial)

---

## 1. Visión General de la Arquitectura

Synqo CRM es una plataforma **SaaS B2B Multi-Tenant (Multi-Inquilino)** diseñada para la captación, cualificación y cierre de prospectos a través de WhatsApp con Inteligencia Artificial autónoma (OpenAI GPT-4o) y agendamiento sincronizado con Cal.com.

### Principios Fundamentales de la Plataforma
1. **Aislamiento Multi-Tenant:** Cada empresa (inquilino) cuenta con su propio espacio aislado en la base de datos PostgreSQL. Ninguna empresa puede ver o acceder a los prospectos, conversaciones ni ajustes de otra.
2. **IA Centralizada con Control de Costos:** Tú operas y pagas una única cuenta en OpenAI. El CRM monitorea el consumo de tokens en tiempo real de cada cliente y corta el bot preventivamente si un cliente agota su cuota mensual, garantizando un margen bruto del **75% al 90%**.
3. **Credenciales Cifradas en Reposo:** Los tokens de WhatsApp y las API Keys de Cal.com ingresados por cada empresa se almacenan cifrados con **AES-256-GCM** en Supabase.
4. **Registro Privado Asistido:** No existe auto-registro público en la web. Solo tú, como Super Administrador, puedes crear empresas, asignarles cupos de asesores y activarlas tras confirmar su pago.

---

## 2. Consola Super Admin (`/admin`)

Como Super Administrador (`admin@synqo.dev` o el correo definido en `SUPER_ADMIN_EMAIL`), dispones de una consola exclusiva en `https://tudominio.com/admin`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CONSOLA SUPER ADMIN                             │
├─────────────┬─────────────┬──────────────┬──────────────┬──────────────┤
│  Empresas   │  Usuarios   │    Leads     │   Mensajes   │  Tokens IA   │
│ 12 Activas  │ 48 Asientos │ 1,420 Totales│ 18,900 Chats │  1.4M Usados │
└─────────────┴─────────────┴──────────────┴──────────────┴──────────────┘
```

### Funciones Principales de la Consola:
1. **Aprovisionamiento de Nuevas Empresas ("+ Nueva Empresa"):**
   - Nombre de la empresa (ej. *Inmobiliaria Horizonte*).
   - Nombre y correo del Administrador del cliente (ej. *gerencia@horizonte.com*).
   - Contraseña inicial del cliente.
   - Plan comercial asignado: `Starter` (Validación comercial - 2 asientos), `Pro` (Comercial recomendado - 5 asientos) o `Enterprise` (Corporativo - 12 asientos).
   - Límite de Asientos autorizados (`max_users`): Define cuántos asesores puede dar de alta la empresa en su equipo (2 para Starter, 5 para Pro, 12 para Enterprise, o el cupo negociado).
2. **Edición Dinámica de Cupos de Asientos:**
   - Puedes aumentar o reducir los asientos autorizados en cualquier momento con el botón de edición rápida (icono de lápiz) sin tocar la base de datos.
3. **Suspensión Inmediata por Morosidad (Toggle de Estado):**
   - Si un cliente se atrasa en el pago, haz clic en el botón de pausa.
   - **Efecto Inmediato:** Suspendes el acceso al CRM para todos los asesores de esa empresa **y** el webhook corta automáticamente las respuestas de IA para ese número de WhatsApp, impidiendo que consuman saldo en OpenAI.
4. **Monitor Global de Tokens:**
   - Visualizas en la tabla el consumo exacto de tokens de cada cliente, su barra de porcentaje y badges de advertencia (*"80%+"* o *"Agotado"*).
5. **Regeneración de Contraseña para Administradores (Icono de Llave):**
   - Si un dueño o administrador de empresa olvida su contraseña, pulsa el botón de llave en la fila de su empresa.
   - El sistema generará una nueva contraseña temporal segura con forzado de cambio de clave al iniciar sesión y botón de copiado rápido.
6. **Seguridad y Reseteo del Super Admin (Exclusivo por Terminal):**
   - Por protocolo de máxima seguridad, la contraseña del **Super Administrador** (`admin@synqo.dev`) está bloqueada en la web y el botón de llave está desactivado para su propia cuenta, evitando bloqueos accidentales.
   - Si requieres cambiar la contraseña del Super Admin, se realiza exclusivamente desde la consola del servidor:
     ```bash
     # Asignar una contraseña personalizada:
     npx tsx scripts/reset-superadmin.ts "TuNuevaClave123!"

     # O restablecer la clave maestra por defecto:
     npm run reset-superadmin
     ```
   - El script restablece el acceso directamente en Supabase Auth, desactiva cualquier bandera de bloqueo temporal y asegura los privilegios maestros (`is_super_admin: true`).

---

## 3. Modelo de Negocio y Cobro

Dado que la facturación inicial es **manual (asistida)**:

### Flujo de Venta y Activación:
1. **Cierre de Venta:** Cobras el Setup (50% anticipo, 50% al entregar) por transferencia bancaria directa o enlace de pago (Stripe Payment Link, Wompi o MercadoPago).
2. **Aprovisionamiento con "Opción A" (Cortesía de Bienvenida):** 
   - Si el cliente inicia a mitad de mes (ej. día 20), el sistema fija el mes en curso como **cubierto por cortesía/setup**.
   - Su primera mensualidad regular se programará para cobrarse entre el **1 y el 5 del mes siguiente**.
3. **Entrega de Credenciales:** Le entregas el correo y la contraseña temporal al dueño de la empresa.
4. **Ciclo Mensual de Cobranza (Día 1 al 5):**
   - **Día 1 al 5:** Período ordinario de pago. En `/admin` verás a la empresa en estado `Cobro Pendiente`.
   - **Día 6 al 9 (Período de Gracia):** Si no ha pagado, el CRM lo resalta en ámbar `Período Gracia` para que le recuerdes el pago.
   - **Día 10 (Suspensión Preventiva por Mora):** Si no paga al décimo día, el sistema o tú desde `/admin` aplican la suspensión preventiva:
     - **WhatsApp:** La IA se apaga de inmediato (0 costo en OpenAI). Los mensajes de leads se guardan en la base de datos sin responder para no perder ventas.
     - **CRM Web:** Los usuarios ven la pantalla de suspensión. El administrador del cliente tiene un botón directo para **descargar su respaldo completo de prospectos (CSV/Excel)** respetando la cláusula de propiedad de datos.
   - **Día 30 (Baja Definitiva):** Si transcurren 30 días en mora, el sistema sugiere la baja definitiva del servicio.
5. **Registro de Pago en 1 Clic:**
   - Cuando el cliente te envíe el comprobante de transferencia o pague por link, pulsas **"Registrar Pago"** en `/admin`.
   - **Efectos Automáticos:**
     - El mes queda marcado como pagado.
     - Si estaba suspendida, se **reactiva al instante**.
     - Los tokens de OpenAI se **reinician a 0** para el nuevo ciclo mensual.
     - Se guarda el recibo en el historial contable (`organization_payments`).

### Estructura de Planes y Márgenes Comerciales:

| Característica | 🟢 Starter (Validación) | 🚀 Pro (Recomendado) | 🏢 Enterprise (Escala) |
| :--- | :--- | :--- | :--- |
| **Identificador en BD** | `starter` *(o `core` por compatibilidad)* | `pro` | `enterprise` |
| **Precio sugerido** | **$49 - $69 USD / mes** | **$99 - $129 USD / mes** | **$249 - $299 USD / mes** |
| **Público objetivo** | Negocio unipersonal o 1-2 asesores validando canal. | Empresa con equipo de ventas activo (3-5 personas). | Operación consolidada con turnos o equipo comercial grande. |
| **Usuarios / Asesores** | **Hasta 2 usuarios** | **Hasta 5 usuarios** | **Hasta 12 usuarios** |
| **Volumen de Tokens IA** | **500,000 tokens/mes** *(~350 - 500 chats)* | **2,500,000 tokens/mes** *(~1,800 - 2,500 chats)* | **7,500,000 tokens/mes** *(~5,000 - 7,500 chats)* |
| **Costo real de API para ti** | ~$0.85 USD | ~$4.20 USD | ~$12.50 USD |
| **Margen bruto para ti** | **> 98%** | **> 95%** | **> 95%** |
| **Prompt de IA** | 100% Editable y personalizable | 100% Editable y personalizable | 100% Editable y personalizable |
| **Cal.com / Agendamiento** | Incluido | Incluido | Incluido |
| **Kanban & Bandeja Realtime** | Incluido | Incluido | Incluido |
| **Alertas Sonoras y Push** | Incluido | Incluido | Incluido |
| **Exportación CSV / Excel** | — | **Incluido** *(Descarga directa de leads filtrados)* | **Incluido** *(Historial masivo completo)* |
| **Soporte & Atención** | Soporte por ticket y correo estándar | Soporte por email prioritario comercial | • **Grupo VIP de WhatsApp con SLA < 2h**<br>• **Sesión de Capacitación en Vivo (45 min)** para asesores<br>• Facturación corporativa anual / local |

#### Detalle de Planes para el Cliente (según `/settings`):
- **Plan Starter (Validación):**
  - **Ideal para:** Profesionales independientes o startups validando su primer canal de atención y captación en WhatsApp.
  - **Incluye:** 2 asientos de equipo, 500k tokens IA, prompt 100% personalizable, agendamiento Cal.com, alertas push y soporte técnico estándar.
- **Plan Pro (Comercial — Recomendado):**
  - **Ideal para:** Empresas en crecimiento con 3 a 5 vendedores activos que requieren exportar prospectos y responder con mayor volumen de mensajes sin interrupciones.
  - **Incluye:** 5 asientos de equipo, 2.5M tokens IA, exportación de contactos a CSV / Excel, agendamiento Cal.com y soporte prioritario.
- **Plan Enterprise (Corporativo):**
  - **Ideal para:** Operaciones comerciales consolidadas, múltiples turnos o agencias con más de 10 asesores.
  - **Incluye:** 12 asientos de equipo, 7.5M tokens IA, exportación masiva completa, canal VIP exclusivo de WhatsApp con atención inmediata (< 2 horas) y sesión de onboarding personalizada de 45 minutos.

---

## 4. Despliegue en Producción (Vercel)

El proyecto está diseñado para desplegarse de manera nativa en **Vercel**:

### Variables de Entorno Requeridas en Vercel:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Super Admin Principal
SUPER_ADMIN_EMAIL=admin@synqo.dev

# Seguridad Criptográfica (Clave de 32 bytes en hex)
ENCRYPTION_KEY=tu_clave_hex_de_64_caracteres

# OpenAI (Motor Centralizado)
OPENAI_API_KEY=sk-proj-...

# Meta WhatsApp Webhook
META_APP_SECRET=tu_app_secret_de_meta
META_WEBHOOK_VERIFY_TOKEN=synqo_secure_verify_token_2026
```

---

## 5. Vinculación del Webhook con Meta Cloud API

1. En el panel de **Meta Developers** de tu aplicación, navega a **WhatsApp** → **Configuración**.
2. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://tudominio.com/api/whatsapp/webhook`
   - **Token de verificación:** El mismo valor que pusiste en `META_WEBHOOK_VERIFY_TOKEN`.
   - Pulsa **"Verificar y Guardar"**.
3. En **Administrar campos**, suscríbete al campo **`messages`**.

---

## 6. Comandos de Mantenimiento y Verificación

Desde la terminal del proyecto puedes ejecutar:

- **Ejecutar Suite de Pruebas Automatizadas:**
  ```bash
  npm test
  ```
  *(Verifica criptografía, seguridad HMAC, RLS, límites de asientos, tokens y perfiles).*

- **Simular Conversación en Tiempo Real (Prueba Local):**
  ```bash
  npm run simulate "Mensaje del prospecto para probar la IA"
  ```

- **Aprovisionar Empresa desde la Terminal:**
  ```bash
  npx tsx scripts/create-company.ts --company="Nombre Empresa" --name="Nombre Admin" --email="admin@cliente.com" --password="Password123!" --plan=starter
  ```
  *(Planes admitidos en `--plan`: `starter`, `pro`, `enterprise`)*.

- **Verificar Compilación y Tipado:**
  ```bash
  npm run typecheck
  npm run build
  ```

---

## 7. Sincronización de Base de Datos (Migración de Planes)

Si deseas sincronizar el enum de la base de datos de Supabase para que admita `starter` de forma nativa además de `core`:

1. Abre el **SQL Editor** en tu panel de Supabase.
2. Ejecuta el script ubicado en `supabase/migrations/20261021000000_allow_starter_plan_type.sql`:
   ```sql
   ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_type_check;
   ALTER TABLE organizations ADD CONSTRAINT organizations_plan_type_check 
     CHECK (plan_type IN ('starter', 'core', 'pro', 'enterprise'));

   UPDATE organizations SET plan_type = 'starter' WHERE plan_type = 'core';
   ALTER TABLE organizations ALTER COLUMN plan_type SET DEFAULT 'starter';
   ```
*(Nota: El sistema en el código ya cuenta con fallback automático, por lo que las funciones siguen operando con total estabilidad aun antes de ejecutar este script).*

---

## 8. Sincronización de Base de Datos (Cobranza Manual y Pagos)

Para habilitar las columnas de ciclo de facturación y el libro contable de pagos manuales en Supabase:

1. Abre el **SQL Editor** en Supabase.
2. Ejecuta el script ubicado en `supabase/migrations/20261021010000_add_manual_billing_and_mora_system.sql`:
   ```sql
   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paid_until_month TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM');
   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_due_day INT DEFAULT 5;
   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

   CREATE TABLE IF NOT EXISTS organization_payments (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
       amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
       currency TEXT NOT NULL DEFAULT 'USD',
       period_month TEXT NOT NULL,
       payment_method TEXT NOT NULL DEFAULT 'transferencia',
       notes TEXT,
       registered_by UUID REFERENCES auth.users(id),
       created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
   );
   ```
*(Nota: El código cuenta con protección y fallbacks activos, por lo que todas las funciones de `/admin` y el CRM operan de manera segura con o sin la migración ejecutada).*

