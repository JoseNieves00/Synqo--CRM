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
   - Plan comercial asignado: `Core` (Inicial), `Pro` (Comercial) o `Enterprise`.
   - Límite de Asientos autorizados (`max_users`): Define cuántos asesores puede dar de alta la empresa en su equipo (ej. 3, 5, 10).
2. **Edición Dinámica de Cupos de Asientos:**
   - Puedes aumentar o reducir los asientos autorizados en cualquier momento con el botón de edición rápida (icono de lápiz) sin tocar la base de datos.
3. **Suspensión Inmediata por Morosidad (Toggle de Estado):**
   - Si un cliente se atrasa en el pago, haz clic en el botón de pausa.
   - **Efecto Inmediato:** Suspendes el acceso al CRM para todos los asesores de esa empresa **y** el webhook corta automáticamente las respuestas de IA para ese número de WhatsApp, impidiendo que consuman saldo en OpenAI.
4. **Monitor Global de Tokens:**
   - Visualizas en la tabla el consumo exacto de tokens de cada cliente, su barra de porcentaje y badges de advertencia (*"80%+"* o *"Agotado"*).

---

## 3. Modelo de Negocio y Cobro

Dado que la facturación inicial es **manual (asistida)**:

### Flujo de Venta y Activación:
1. **Cierre de Venta:** Cobras la mensualidad o anualidad por transferencia bancaria directa o enlace de pago (Stripe Payment Link, Wompi o MercadoPago).
2. **Aprovisionamiento:** Entras a `/admin`, creas la empresa y defines su cuota de usuarios según el plan pactado.
3. **Entrega de Credenciales:** Le entregas el correo y la contraseña temporal al dueño de la empresa.
4. **Renovación Mensual:** Si el cliente renueva, mantiene su servicio activo. Si no paga tras el periodo de gracia, lo suspendes con 1 clic desde `/admin`.

### Estructura de Planes y Márgenes Comerciales:

| Característica | 🟢 Starter (Validación) | 🚀 Pro (Recomendado) | 🏢 Enterprise (Escala) |
| :--- | :--- | :--- | :--- |
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
| **Diferenciadores Clave** | Soporte por ticket/email estándar | Soporte por email prioritario | • **Grupo VIP de WhatsApp con SLA < 2h**<br>• **Sesión de Capacitación en Vivo (45 min)** para asesores<br>• **Exportación Masiva de Leads & Historial** (CSV/Excel)<br>• Facturación corporativa anual/local |

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

- **Verificar Compilación y Tipado:**
  ```bash
  npm run typecheck
  npm run build
  ```

