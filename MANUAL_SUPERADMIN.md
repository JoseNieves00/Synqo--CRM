# 📘 Manual de Operaciones & Consola Super Admin — Synqo CRM

> **Documento Confidencial para el Propietario / Operador de Synqo (synqo.dev)**  
> Versión: 2.0 (Arquitectura Multinicho & Agendamiento Nativo)

---

## 1. Visión General de la Arquitectura

Synqo CRM es una plataforma **SaaS B2B Multi-Tenant (Multi-Inquilino)** diseñada para la captación, cualificación y cierre de prospectos a través de WhatsApp con Inteligencia Artificial autónoma (OpenAI GPT-4o), agendamiento nativo multi-profesional sin fricción, portal móvil para especialistas y gestión integral de ventas y pagos.

### Principios Fundamentales de la Plataforma
1. **Aislamiento Multi-Tenant Estricto:** Cada empresa (inquilino) cuenta con su propio espacio aislado en la base de datos PostgreSQL respaldado por Row Level Security (RLS). Ninguna empresa puede ver, modificar o acceder a los prospectos, conversaciones, citas o configuración de otra.
2. **Arquitectura Modular Multinicho (`enabled_modules`):** Cada empresa solo ve las funciones que su modelo de negocio requiere (servicios presenciales, academias, consultorios, e-commerce o venta B2B). Los módulos se activan selectivamente desde `/admin` o por base de datos sin duplicar código ni bifurcar proyectos.
3. **IA Centralizada con Control de Costos:** Tú operas y pagas una única cuenta en OpenAI. El CRM monitorea el consumo de tokens en tiempo real de cada cliente y corta el bot preventivamente si un cliente agota su cuota mensual, garantizando un margen bruto del **75% al 90%**.
4. **Credenciales Cifradas en Reposo:** Los tokens de WhatsApp, credenciales externas y secretos de webhook ingresados por cada empresa se almacenan cifrados con **AES-256-GCM** en Supabase.
5. **Cero Doble Reserva (Anti-Race Condition a Nivel DB):** El calendario nativo utiliza la extensión `btree_gist` de PostgreSQL con restricciones de exclusión temporal a nivel de base de datos. Es físicamente imposible que dos clientes reserven el mismo minuto con el mismo especialista o en la misma sala física, sin importar la concurrencia.
6. **Filosofía Hands-Free para Colaboradores:** Los especialistas (barberos, médicos, instructores) trabajan con sus manos y a menudo no pueden o no quieren tocar pantallas. La recepcionista mantiene el control total del flujo desde el CRM web y el portal móvil de colaborador se actualiza pasivamente en tiempo real.
7. **Protocolo Anti-Fraude en Pagos:** La IA tiene estrictamente prohibido dar por válido un pago o transferencia (Nequi, Daviplata, Bancolombia). Ante un comprobante, responde con naturalidad humana y realiza un relevo silencioso a un agente humano para verificar los extractos bancarios antes de confirmar la compra.

---

## 2. Consola Super Admin (`/admin`)

Como Super Administrador (`admin@synqo.dev` o el correo definido en `SUPER_ADMIN_EMAIL`), dispones de una consola exclusiva en `https://tudominio.com/admin`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CONSOLA SUPER ADMIN                             │
├─────────────┬─────────────┬──────────────┬──────────────┬──────────────┤
│  Empresas   │  Usuarios   │    Leads     │   Mensajes   │  Tokens IA   │
│ 12 Activas  │ 48 Usuarios │ 1,420 Totales│ 18,900 Chats │  1.4M Usados │
└─────────────┴─────────────┴──────────────┴──────────────┴──────────────┘
```

### Funciones Principales de la Consola:
1. **Aprovisionamiento Multinicho en 3 Pasos ("+ Nueva Empresa" - ProvisionWizard):**
   - **Paso 1 (Empresa & Detección Inteligente):** Escribe el nombre de la empresa y el sistema detecta automáticamente palabras clave del rubro (salud, estética, gimnasios, academias, inmobiliaria, etc.) sin obligar a encasillarla.
   - **Modelo de Precios a Medida (Fase Start-up):** Asignación manual de capacidad de conversaciones y usuarios (`Starter` ~400 chats, `Pro` ~1,200 chats, `Enterprise` ~3,000 chats) sin precios fijos en dólares visibles, cobrando según los módulos acordados.
   - **Paso 2 (Servicios & Nomenclatura 100% Personalizada):**
     - **Módulos Habilitados:** Enciende o apaga con 1 clic: *Agenda & Citas por WhatsApp*, *Portal Móvil de Colaboradores*, *Control de Espacios Físicos & Aforo* y *Cobros Rápidos (Quick Pay)*.
     - **Términos Condicionados:** Las preguntas de cómo llaman a sus colaboradores (*Doctores, Barberos, Agentes*) y a sus espacios (*Consultorios, Cabinas, Salones*) solo aparecen si los módulos respectivos están activos.
     - **Código de Empresa para Acceso Móvil:** Si se activa el portal de colaboradores, se genera o personaliza su código mnemotécnico alfanumérico único (ej. `EMPR1457`).
     - **Selección de Motor de WhatsApp:** Meta Cloud API oficial o Z-API Express QR.
   - **Paso 3 (Revisión & Envío Inmediato por WhatsApp):**
     - Botón destacado **"Copiar Mensaje para WhatsApp"** que genera un texto listo para enviar al cliente con URL de acceso (`https://crm.synqo.dev/login`), correo, contraseña temporal, código de equipo y lista de módulos habilitados.
2. **Edición Integral de Empresa (Modal de Tenant & Upgrades):**
   - **Nombre de la empresa:** Corrección de razón social o marca comercial.
   - **Nomenclatura Multi-Nicho Dinámica:** Edición de los nombres de colaboradores y espacios, sincronizados en tiempo real con los módulos activos.
   - **Ajustes de Capacidad y Asientos:** Aumentar usuarios (`max_users`) y límite mensual de tokens de IA.
     *(🛡️ **Blindaje de Seguridad:** El sistema bloquea reducciones de cupos de usuarios si son menores a la cantidad de miembros activos actuales).*
   - **Paquetes de Tokens Extra (Boosters Mensuales):** Botones rápidos para recargar saldo de tokens IA ante campañas de alta demanda sin forzar un upgrade de plan.
   - **Gestión Modular en Caliente:** Activa o desactiva cualquier módulo si el cliente amplía o ajusta su suscripción mensual.
   - **Cortesía Técnica de Soporte:** Opción para reiniciar el consumo acumulado de tokens a 0 en cualquier momento.
4. **Suspensión Inmediata por Morosidad (Toggle de Estado):**
   - Si un cliente se atrasa en el pago, haz clic en el botón de pausa.
   - **Efecto Inmediato:** Suspendes el acceso al CRM para todos los asesores de esa empresa **y** el webhook corta automáticamente las respuestas de IA para ese número de WhatsApp, impidiendo que consuman saldo en OpenAI.
5. **Monitor Global de Tokens:**
   - Visualizas en la tabla el consumo exacto de tokens de cada cliente, su barra de porcentaje y badges de advertencia (*"80%+"* o *"Agotado"*).
6. **Regeneración de Contraseña para Administradores (Icono de Llave):**
   - Si un dueño o administrador de empresa olvida su contraseña, pulsa el botón de llave en la fila de su empresa.
   - El sistema generará una nueva contraseña temporal segura con forzado de cambio de clave al iniciar sesión y botón de copiado rápido.
7. **Seguridad y Reseteo del Super Admin (Exclusivo por Terminal):**
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
2. **Aprovisionamiento con "Opción A" (Cortesía de Bienvenida) o Pago Anual:** 
   - **Plan Mensual:** Si el cliente inicia a mitad de mes (ej. día 20), el sistema fija el mes en curso como **cubierto por cortesía/setup**. Su primera mensualidad regular se programará para cobrarse entre el **1 y el 5 del mes siguiente**.
   - **Plan Anual:** Puedes pulsar el botón rápido **`⭐ Pago Anual (1 Año)`** en el modal de aprovisionamiento. Esto establece la cobertura inicial por 12 meses exactos (ej. hasta `2027-10`), aplicando la bonificación de 2 meses gratis contemplada en las Condiciones de Servicio.
3. **Entrega de Credenciales:** Le entregas el correo, la contraseña temporal y el **Código de Empresa** al dueño de la empresa.
4. **Ciclo Mensual de Cobranza (Día 1 al 5):**
   - **Día 1 al 5:** Período ordinario de pago. En `/admin` verás a la empresa en estado `Cobro Pendiente`.
   - **Día 6 al 9 (Período de Gracia):** Si no ha pagado, el CRM lo resalta en ámbar `Período Gracia` para que le recuerdes el pago.
   - **Día 10 (Suspensión Preventiva por Mora):** Si no paga al décimo día, el sistema o tú desde `/admin` aplican la suspensión preventiva:
     - **WhatsApp:** La IA se apaga de inmediato (0 costo en OpenAI). Los mensajes de leads se guardan en la base de datos sin responder para no perder ventas.
     - **CRM Web:** Los usuarios ven la pantalla de suspensión. El administrador del cliente tiene un botón directo para **descargar su respaldo completo de prospectos (CSV/Excel)** respetando la cláusula de propiedad de datos.
   - **Día 30 (Baja Definitiva):** Si transcurren 30 días en mora, el sistema sugiere la baja definitiva del servicio.
5. **Modal de Cobertura y Pago Simplificado (1 Clic):**
   - El CRM no actúa como sistema contable complejo (no requiere ingresar montos en dólares, métodos de pago ni notas que saturen la operación). Su función exclusiva es el **control de acceso, estado del servicio (Al día vs. Mora) y ciclo de tokens**.
   - Al pulsar **"Registrar Pago"** en `/admin`, dispones de:
     - **`[ Mes Actual ]`**: Marca el mes corriente como cubierto y al día.
     - **`[ +1 Mes Siguiente ]`**: Extiende la cobertura al mes entrante.
     - **`[ ⭐ Pago Anual Anticipado (12 meses) ]`**: Suma automáticamente 1 año completo a partir de hoy (ej. de `2026-10` a `2027-10`).
     - **Selector manual de mes (`type="month"`)**: Para coberturas trimestrales, semestrales o fechas personalizadas.
   - **Efectos Automáticos al Confirmar:**
     - La empresa queda marcada en verde como **`Al día (hasta YYYY-MM)`** (durante todo el período cubierto nunca entrará en mora ni generará alertas falsas).
     - Si estaba suspendida, se **reactiva al instante**.
     - El contador de tokens consumidos de OpenAI se **reinicia a 0** para el nuevo ciclo de servicio.

### Estructura de Planes y Márgenes Comerciales:

| Característica | 🟢 Starter (Validación) | 🚀 Pro (Recomendado) | 🏢 Enterprise (Escala) |
| :--- | :--- | :--- | :--- |
| **Identificador en BD** | `starter` *(o `core`)* | `pro` | `enterprise` |
| **Precio sugerido** | **$49 - $69 USD / mes** | **$99 - $129 USD / mes** | **$249 - $299 USD / mes** |
| **Público objetivo** | Profesional independiente o 1-2 asesores. | Empresa con equipo de ventas (3-5 personas). | Operación consolidada, turnos o multinicho. |
| **Usuarios / Asesores** | **Hasta 2 usuarios** | **Hasta 5 usuarios** | **Hasta 12 usuarios** |
| **Volumen de Tokens IA** | **500,000 tokens/mes** *(~350 - 500 chats)* | **2,500,000 tokens/mes** *(~1,800 - 2,500 chats)* | **7,500,000 tokens/mes** *(~5,000 - 7,500 chats)* |
| **Costo real de API para ti** | ~$0.85 USD | ~$4.20 USD | ~$12.50 USD |
| **Margen bruto para ti** | **> 98%** | **> 95%** | **> 95%** |
| **Calendario Nativo Propio** | Incluido (hasta 2 especialistas) | Incluido (hasta 5 especialistas) | Incluido (ilimitados según plan) |
| **Portal Móvil Colaborador** | Incluido | Incluido | Incluido |
| **Anti-No-Show WhatsApp** | Manual | **Automatizado (Cron 24h/8h)** | **Automatizado (Cron 24h/8h)** |
| **Kanban & Bandeja Realtime** | Incluido | Incluido | Incluido |
| **Exportación CSV / Excel** | — | **Incluido** | **Incluido** |
| **Soporte & Atención** | Correo estándar | Email prioritario comercial | • **Canal VIP WhatsApp (< 2h)**<br>• **Sesión de Onboarding (45 min)** |

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

# Cron Secret para Tareas en Segundo Plano (Anti-No-Show)
CRON_SECRET=synqo_cron_secure_token_produccion_2026
```

---

## 5. Vinculación de Webhooks (Meta Cloud API y Z-API)

Synqo cuenta con arquitectura desacoplada de mensajería dual. Dependiendo del motor asignado a cada empresa, los webhooks deben direccionarse de la siguiente manera:

### A. Meta WhatsApp Cloud API (Oficial Meta)
1. En el panel de **Meta Developers** (`developers.facebook.com`), navega a tu aplicación $\rightarrow$ **WhatsApp** $\rightarrow$ **Configuración**.
2. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://tudominio.com/api/whatsapp/webhook`
   - **Token de verificación:** El valor exacto configurado en tu variable de entorno `META_WEBHOOK_VERIFY_TOKEN`.
   - Pulsa **"Verificar y Guardar"**.
3. En **Administrar campos**, suscríbete al campo **`messages`**.

### B. Evolution API v2 (VPS Propio de la Empresa / WhatsApp Baileys)
1. **Infraestructura:** Corre de forma centralizada en el VPS de la empresa (`EVOLUTION_API_URL` y `EVOLUTION_API_KEY`).
2. **Autoconfiguración:** Synqo CRM registra y configura automáticamente los webhooks y las instancias de cada cliente con autenticación HMAC criptográfica.
3. **Endpoint de Webhook:**
   - **URL:** `https://tudominio.com/api/webhooks/whatsapp/evolution`
   - **Eventos:** `CONNECTION_UPDATE` (estados de conexión) y `MESSAGES_UPSERT` (mensajes y notas de voz entrantes).
4. **Relevo Humano:** Detecta automáticamente cuando un asesor interviene desde el celular físico (`fromMe: true`), pausando la IA y sincronizando el chat en tiempo real.
5. **Notas de Voz:** Transcripción automática con OpenAI Whisper para audios enviados por prospectos.
5. **Métodos de Vinculación para el Cliente Final:**
   - **Código QR:** Escaneo directo desde el monitor con rotación segura cada 20 segundos.
   - **Código por Teléfono (Pairing Code):** Generación de código de 8 dígitos para vincular el celular sin requerir cámara ni dos pantallas simultáneas.
   - **Sincronización Segura (Modelo C):** Opción bajo demanda en Ajustes e Inbox para importar hasta 50 chats recientes con la IA pausada preventivamente.

---

## 6. Vinculación de Cal.com (Opcional — Agendamiento Externo)

Para empresas que utilicen Cal.com en lugar del motor nativo:
1. **Credenciales Requeridas:**
   - **Cal.com API Key:** Generada en *Settings* $\rightarrow$ *Developer* $\rightarrow$ *API Keys*. Almacenada con cifrado AES-256-GCM.
   - **Tipo de Evento:** Slug o URL completa. El CRM auto-resuelve el ID mediante API v2 (`services/cal.service.ts`).

---

## 7. Arquitectura Modular Multinicho (`enabled_modules`)

Synqo permite atender múltiples verticales sin fragmentar la base de código mediante el campo JSON `enabled_modules` en la tabla `organizations`:

```json
{
  "native_calendar": true,
  "physical_rooms": true,
  "staff_mobile_portal": true,
  "anti_no_show": true,
  "quick_pay": true,
  "ad_attribution": true
}
```

### Blueprints Recomendados por Nicho:
1. **Servicios con Cita Presencial (Barberías, Salones de Belleza, Spas, Tatuadores):**
   - Habilitados: `native_calendar`, `staff_mobile_portal`, `anti_no_show`, `quick_pay`.
   - Deshabilitado: `physical_rooms` (a menos que tengan cabinas privadas exclusivas).
2. **Academias, Cursos y Talleres (Música, Baile, Artes Marciales, Fitness):**
   - Habilitados: `native_calendar`, `physical_rooms` (control de aforo por salón), `anti_no_show`.
3. **Salud y Consultorios (Médicos, Odontólogos, Psicólogos, Nutricionistas):**
   - Habilitados: `native_calendar`, `staff_mobile_portal`, `anti_no_show`, `physical_rooms` (consultorios).
4. **Venta de Productos y E-Commerce por WhatsApp:**
   - Habilitados: `quick_pay`, `ad_attribution`.
   - Deshabilitados: `native_calendar`, `physical_rooms`, `staff_mobile_portal`.
5. **Consultorías B2B e Inmobiliarias:**
   - Habilitados: `native_calendar`, `ad_attribution`.

---

## 8. Identificación Rápida y Portal de Colaboradores (`company_code` y PIN)

Para erradicar la fricción técnica con el personal operativo:
1. **Generación Automática del Código:** Toda empresa creada recibe un `company_code` único (ej. `EMPR1457`) generado deterministamente sin colisiones.
2. **Portal Móvil (`/colaborador`):**
   - El colaborador ingresa directamente con:
     - **Opción A:** Teléfono móvil registrado y contraseña personal.
     - **Opción B (Sin correo):** Código de Empresa (`EMPR1457`) + PIN personal de 4 dígitos.
3. **Mantenimiento del PIN:** Los administradores y superadministradores pueden restablecer el PIN de cualquier especialista en 1 clic desde la pestaña *Equipo & Usuarios*.

---

## 9. Motor de Agendamiento Nativo & Protección Contra Condiciones de Carrera (`btree_gist`)

El motor de agendamiento nativo de Synqo (`app/actions/calendar-admin.ts`, `services/appointment.service.ts`) no depende de servicios de terceros y está blindado contra sobreventa concurrente:

### Aislamiento GiST a Nivel de Base de Datos:
En `supabase/migrations/20261027050000_enable_btree_gist_and_anti_race_constraints.sql` se implementa la extensión `btree_gist`:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exclusión de colisión simultánea de especialista:
ALTER TABLE appointments ADD CONSTRAINT appointments_specialist_no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    specialist_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show'));
```
**Resultado:** Si dos clientes intentan reservar exactamente la misma fracción de segundo con el mismo barbero o doctor, el motor de PostgreSQL acepta la primera transacción y rechaza la segunda atómicamente, garantizando integridad absoluta.

---

## 10. Motor de Notificaciones Anti-No-Show y Cron Worker

El endpoint `/api/cron/appointment-reminders` opera como worker automatizado en segundo plano (invocado periódicamente por Vercel Cron o un cronjob externo).

### Configuración del Cron Job Gratuito (Sin límites de Vercel Hobby):
En cuentas **Vercel Hobby (Gratis)**, Vercel restringe los Cron Jobs a **1 sola ejecución diaria** y falla al desplegar con intervalos menores como `*/15 * * * *`. Por ello, hemos desvinculado los crons de `vercel.json` y habilitado soporte universal para ejecutores de cron gratuitos.

Los endpoints soportan autenticación tanto por cabecera (`Authorization: Bearer <CRON_SECRET>`) como por parámetro seguro en URL (`?secret=<CRON_SECRET>`):

#### Opción 1: cron-job.org (100% Gratis y Recomendado)
1. Crea una cuenta gratuita en [cron-job.org](https://cron-job.org).
2. **Tarea 1 — Recordatorios de Citas (Anti-No-Show):**
   - **URL:** `https://<TU_DOMINIO>/api/cron/appointment-reminders?secret=<TU_CRON_SECRET>`
   - **Frecuencia:** Cada 15 minutos (`*/15 * * * *`).
   - **Método:** `GET` o `POST`.
3. **Tarea 2 — Limpieza de Almacenamiento (Retención de 45 días):**
   - **URL:** `https://<TU_DOMINIO>/api/cron/cleanup-storage?secret=<TU_CRON_SECRET>`
   - **Frecuencia:** 1 vez al día (ej. 03:00 AM).
   - **Método:** `GET` o `POST`.

#### Opción 2: Supabase pg_cron + pg_net (Directamente en la base de datos)
Si prefieres no usar servicios externos, puedes programar las tareas directamente en Supabase SQL Editor usando el script listo en `supabase/migrations/20261106020000_enable_supabase_free_cron.sql`.

#### Opción 3: Crontab en tu Servidor VPS (Donde corre Evolution API)
Si ya tienes el VPS de Evolution API activo, puedes agregar las dos líneas en tu crontab de Linux:
```bash
crontab -e
# Agregar al final:
*/15 * * * * curl -s "https://<TU_DOMINIO>/api/cron/appointment-reminders?secret=<TU_CRON_SECRET>" > /dev/null 2>&1
0 3 * * * curl -s "https://<TU_DOMINIO>/api/cron/cleanup-storage?secret=<TU_CRON_SECRET>" > /dev/null 2>&1
```

### Reglas de Negocio del Motor Cron:
1. **Seguridad:** Requiere cabecera `Authorization: Bearer <CRON_SECRET>`.
2. **Ventana de 24 Horas:** Detecta citas pendientes entre las 23 y 25 horas siguientes y envía recordatorio interactivo por WhatsApp con botones `[Confirmar]` y `[Reagendar/Cancelar]`.
3. **Toque de Queda Nocturno de Cortesía (20:00 - 08:00):** Si el recordatorio de 24h cae en horas de la madrugada (ej. para una cita a las 09:00 AM del día siguiente), el cron anticipa el envío antes de las 20:00 para no perturbar al cliente.
4. **Cancelación Automática a 8 Horas:** Si una cita permanece en estado `pending_confirmation` a menos de 8 horas de su inicio, el motor la marca como `cancelled_unconfirmed`, libera el espacio en el calendario y notifica a la empresa para que otro cliente pueda tomar el turno.

---

## 11. Detección de Vacíos de Conocimiento de IA (`ai_knowledge_gaps`)

Para evitar que los bots alucinen o queden desactualizados:
1. **Detección Automática:** Cuando la IA recibe una pregunta que no figura en las instrucciones de la empresa, llama a la función interna `log_knowledge_gap`.
2. **Registro en BD:** Se guarda la pregunta exacta del cliente, el contexto del chat y la categoría tentativa en `ai_knowledge_gaps`.
3. **Visualización para el Cliente:** En `/settings` (pestaña *Dudas Detectadas*), el cliente ve las preguntas no respondidas y con 1 clic puede ingresar la respuesta oficial, la cual se anexa instantáneamente al prompt del asistente.

---

## 12. Cómputo Determinista de Festivos Colombianos (`lib/calendar/holidays.ts`)

Synqo incorpora un algoritmo matemático determinista con cero dependencias externas para bloquear automáticamente días feriados:
- **Festivos Fijos:** 1 de Enero, 1 de Mayo, 20 de Julio, 7 de Agosto, 8 de Diciembre, 25 de Diciembre.
- **Pascua y Semana Santa:** Algoritmo del Cómputo Eclesiástico de Gauss para Jueves y Viernes Santo.
- **Ley Emiliani (Ley 51 de 1983):** Traslado automático de festivos al lunes siguiente (Reyes Magos, San José, San Pedro y San Pablo, Asunción, Día de la Raza, Todos los Santos, Independencia de Cartagena, etc.).
- **Control:** Cada empresa puede activar o desactivar la bandera `block_holidays` según si opera en días festivos.

---

## 13. Comandos de Mantenimiento y Verificación

Desde la terminal del proyecto puedes ejecutar:

- **Ejecutar Suite Completa de Pruebas Automatizadas:**
  ```bash
  npm test
  ```
  *(Verifica criptografía, seguridad HMAC, RLS, límites de usuarios, tokens, portal de colaboradores y validaciones).*

- **Verificar Compilación y Tipado TypeScript:**
  ```bash
  npx tsc --noEmit
  npm run build
  ```

- **Aprovisionar Empresa desde la Terminal:**
  ```bash
  npx tsx scripts/create-company.ts --company="Nombre Empresa" --name="Nombre Admin" --email="admin@cliente.com" --password="Password123!" --plan=pro
  ```

- **Simular Cron de Recordatorios Anti-No-Show en Local:**
  ```bash
  curl -X POST http://localhost:3000/api/cron/appointment-reminders \
    -H "Authorization: Bearer synqo_cron_secure_token_produccion_2026"
  ```
