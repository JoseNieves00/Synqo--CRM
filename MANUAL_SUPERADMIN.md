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
1. **Aprovisionamiento de Nuevas Empresas ("+ Nueva Empresa"):**
   - Nombre de la empresa (ej. *Barbería Elite Club*, *Academia de Baile Ritmo Latino*).
   - Nombre y correo del Administrador del cliente (ej. *gerencia@empresa.com*).
   - Contraseña inicial del cliente.
   - Plan comercial asignado: `Starter` (Validación comercial - 2 usuarios), `Pro` (Comercial recomendado - 5 usuarios) o `Enterprise` (Corporativo - 12 usuarios).
   - Límite de Usuarios autorizados (`max_users`): Define cuántos asesores puede dar de alta la empresa en su equipo (2 para Starter, 5 para Pro, 12 para Enterprise, o el cupo negociado).
   - **Código de Empresa Autogenerado (`company_code`):** El sistema asigna un código mnemotécnico alfanumérico único (ej. `EMPR1457`) que sirve de identificador rápido para el portal de colaboradores.
2. **Edición Integral de Empresa (Modal de Tenant & Upgrades):**
   - **Nombre de la empresa:** Corrección de razón social, marca o erratas ortográficas.
   - **Upgrades y Downgrades de Plan:** Cambiar en caliente entre `Starter`, `Pro` y `Enterprise` con botón de 1 clic para *sincronizar los cupos recomendados del plan* (usuarios y tokens).
   - **Límite de Usuarios:** Aumentar o ajustar cupos de asesores por ventas de *add-ons* de usuarios.  
     *(🛡️ **Blindaje de Seguridad:** El sistema bloquea reducciones de cupos de usuarios si son menores a la cantidad de miembros activos actuales, impidiendo estados huérfanos o usuarios bloqueados).*
   - **Paquetes de Tokens Extra (Boosters Mensuales):** Botones rápidos de 1 clic `[ ⭐ +1M Tokens (Booster) ]` y `[ +500k Tokens ]` para recargar saldo de WhatsApp IA ante campañas de alta demanda sin forzar un upgrade de plan.
   - **Regla de Negocio de Boosters:** Los tokens extra aplican **únicamente para el mes en curso**. Al registrar el pago de renovación mensual en `/admin`, el sistema reinicia el consumo a 0 y **restablece automáticamente el límite a la cuota base del plan** (`500k`, `2.5M` o `7.5M`), evitando que el cliente conserve saldo extra de por vida de forma gratuita.
   - **Cortesía Técnica de Soporte:** Opción para reiniciar el consumo acumulado de tokens a 0 en cualquier momento sin esperar a fin de mes.
3. **Gestión de Módulos Habilitados (`enabled_modules`):**
   - Permite activar o desactivar módulos en caliente por empresa según el nicho contratado:
     - `native_calendar`: Habilita la pestaña y motor de citas propio.
     - `physical_rooms`: Activa la gestión de salones, cabinas o espacios físicos.
     - `staff_mobile_portal`: Permite acceso de especialistas a `/colaborador`.
     - `anti_no_show`: Activa recordatorios automáticos por WhatsApp a 24 horas y cancelación a 8 horas.
     - `quick_pay`: Generación de órdenes rápidas y verificación humana de pagos.
     - `ad_attribution`: Rastreo de campañas de Meta Ads (CTWA).
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

## 5. Vinculación del Webhook con Meta Cloud API

1. En el panel de **Meta Developers** de tu aplicación, navega a **WhatsApp** → **Configuración**.
2. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://tudominio.com/api/whatsapp/webhook`
   - **Token de verificación:** El mismo valor que pusiste en `META_WEBHOOK_VERIFY_TOKEN`.
   - Pulsa **"Verificar y Guardar"**.
3. En **Administrar campos**, suscríbete al campo **`messages`**.

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

El endpoint `/api/cron/appointment-reminders` opera como worker automatizado en segundo plano (invocado cada 15 o 30 minutos por Vercel Cron o cronjob externo).

### Configuración en `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/appointment-reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
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
