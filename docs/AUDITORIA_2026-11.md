# Informe de auditoría y plan de mejora — Synqo CRM (nov-2026)

## Contexto

Synqo CRM ayuda a los asesores a atender WhatsApp (Meta Cloud API y Evolution) e Instagram con una IA que responde según el prompt de cada empresa, y pasa el chat a un humano cuando hace falta. Objetivo: que el CRM quite fricción frente a usar WhatsApp en el celular y que valga la pena entrar a atender desde ahí.
Revisé webhooks, servicios de IA, server actions, migraciones con RLS, componentes del inbox y manuales. Verifiqué en el código los hallazgos marcados con ✅.

---

## 1. Diagnóstico general (lo que estamos viendo desde el ángulo equivocado)

1. **Se construye en ancho, no en profundidad.** Hay agenda multiprofesional, portal de colaboradores, copilots, facturación, Instagram, pipeline… pero el inbox, que es el núcleo, todavía está por debajo de WhatsApp en lo básico:
   - no se ve el último mensaje en la lista;
   - no hay contador de no leídos ni ticks de entrega/lectura;
   - no se puede citar un mensaje;
   - no funciona en el celular;
   - solo se ven 50 chats.
   El asesor compara contra WhatsApp. Si el inbox pierde esa comparación, todo lo demás no importa.
2. **El prompt global tiene datos de un cliente concreto.** `services/openai.service.ts:656` ✅ incluye los precios de "cocinitas" ($360.000, $410.000, $550.000) para todas las empresas. La zona horaria de Bogotá también está fija (`:720`). Así no escala como multi-tenant: cada arreglo que se hace para un cliente termina contaminando a los demás.
3. **La IA se apaga para siempre.** Cuando un asesor responde, el chat queda sin IA y nada la vuelve a encender. El manual promete una pausa de 45 minutos, pero el código no la tiene. El asesor termina cargando chats que la IA podría seguir atendiendo.
4. **La IA trabaja contra el asesor en vez de con él.** No hay borradores de respuesta para aprobar, ni 👍/👎 sobre los mensajes de la IA, ni forma de ver por qué respondió algo. La única vía de corrección ("Dudas Detectadas") es solo para administradores, y al agente se le muestra un enlace que no le funciona (`InboxView.tsx:946` lleva a `/settings`, que lo redirige).
5. **Tres webhooks casi iguales que ya se separaron.** Meta, Evolution e Instagram repiten cerca del 70% de la lógica y ya se comportan distinto: la regex de "quiero un humano" solo existe en Meta, Instagram ignora el horario, etc. Cada bug hay que arreglarlo tres veces.
6. **Las métricas mienten.** Los KPIs del dashboard se calculan con los últimos 100 contactos (`dashboard/page.tsx:54`), así que no sirven para tomar decisiones.

---

## 2. Vulnerabilidades de seguridad (por severidad)

### Críticas — arreglar ya

| # | Hallazgo | Dónde | Arreglo |
|---|---|---|---|
| C1 ✅ | Server actions sin autenticación que usan `supabaseAdmin`: `approveSpecialist`, `listSpecialistsForAdmin` (devuelve PINs), `createStaffInvitation`. Cualquiera puede llamarlas, y encadenadas permiten tomar el portal de colaboradores de cualquier empresa. | `app/actions/staff.ts:582, 840, 862` | Borrarlas o protegerlas con `checkAdminAuth()`, y tomar el `orgId` de la sesión, no del parámetro. |
| C2 ✅ | Un admin de empresa puede poner su propia `evolution_api_url`. Si su org no tiene key, el sistema le envía la API key maestra del VPS a esa URL. Eso da control de todas las instancias de WhatsApp y además abre SSRF. | `app/actions/evolution.ts:90-105, 121-150` | Que solo el superadmin edite la URL. Nunca enviar la key global a una URL definida por un tenant. Validar https y que no sea IP privada. |
| C3 ✅ | El cron acepta el header `x-vercel-cron: 1`, que cualquiera puede falsificar. Con eso se disparan recordatorios y cancelaciones automáticas de citas. | `app/api/cron/appointment-reminders/route.ts:20-23` | Exigir únicamente `Authorization: Bearer CRON_SECRET`. |

### Altas

- **H1 ✅ IDOR entre empresas en "reportar retraso".** `appointment.service.ts:811-832` filtra solo por id, así que cualquiera puede modificar la cita de otra empresa y hacer que se le escriba al cliente de esa empresa. Arreglo: agregar `.eq('organization_id')` (y `specialist_id` cuando lo llama un colaborador).
- **H2. Bucket chat-media público.** Comprobantes de pago y documentos de clientes quedan accesibles con solo tener la URL. Arreglo: bucket privado, URLs firmadas y políticas en `storage.objects`.
- **H3 ✅ Webhooks de Meta e Instagram "fail-open".** Si no hay App Secret, procesan mensajes sin firma (`whatsapp/webhook/route.ts:115-137`). Cualquiera puede inyectar mensajes falsos y gastar tokens. Arreglo: responder 401 si no hay secreto.
- **H4. RLS de profiles con FOR ALL sin restringir columnas.** Un admin podría marcarse `is_super_admin`. Hoy no pasa por casualidad: la recursión de la política lo bloquea. Arreglo: funciones `SECURITY DEFINER` con `SET search_path`, más `REVOKE UPDATE` (o un trigger) sobre `is_super_admin`, `role` y `organization_id`.
- **H5 ✅ PIN de colaborador débil.** Son 4 dígitos guardados en texto plano (`staff.ts:117`). El rate limit es por código+IP, así que se evade rotando IPs, y el código de empresa es predecible. Arreglo: hashear el PIN, mínimo 6 dígitos, rate limit por organización y bloqueo tras varios intentos.

### Medias

- Cuentas de integración sin prueba de propiedad. Se puede reclamar el `instagram_account_id` o el `whatsapp_phone_number_id` de otra empresa (no hay UNIQUE). Arreglo: índice único y validar la propiedad con la Graph API.
- OAuth de Google sin nonce atado a la sesión (`auth/google/callback`).
- Agentes sin rol de admin pueden cambiar configuración global: `saveProductGallery` (sobrescribe `system_prompt`), `addCustomTemplate` y `saveOrganizationQuickReplies`. Además `markContactReactivationDismissed` no filtra por org.
- La validación de uploads se salta: las condiciones van con OR, y se usa el `file.type` del cliente con `upsert: true` (`chat.ts:236`).
- Secretos por defecto hardcodeados: `'synqo_evolution_master_secret'` ✅ (`verify-webhook.ts:58`), `'synqo-google-oauth-secret'` y `'synqo_webhook_2026'`. Además `ENCRYPTION_KEY` se usa para 4 cosas distintas, y el secreto de Evolution viaja en la query string. Arreglo: fallar si falta la variable de entorno y derivar claves por propósito con HKDF.
- Los agentes pueden leer con la anon key todas las columnas de organizations (tokens cifrados, prompt, facturación) y también `organization_payments`.
- Superadmin identificado por el email `admin@synqo.dev` en varios archivos y en una política RLS. Debería depender solo del flag `is_super_admin`.
- El lockout del login es solo de la app. Llamando directo a `/auth/v1/token` se evita. Arreglo: rate limits y CAPTCHA en Supabase Auth.

### Bajas

- El rate limit corre antes de verificar la firma ✅: un atacante puede "silenciar" el teléfono de un lead.
- `send_whatsapp_image` acepta cualquier URL, lo que permite SSRF desde el VPS. Existe `isValidMediaUrl`, pero no se usa.
- Falta `import 'server-only'` en `lib/supabase/admin.ts`.
- No hay CSP.
- `Permissions-Policy: microphone=()` puede bloquear la grabación de notas de voz.
- Hay un bypass de superadmin para tests fuera de producción (`superadmin.ts:55`).
- `get_auth_org_id` no tiene search_path fijo.

Lo que ya está bien (mantener): cifrado AES-GCM de tokens, HMAC con timingSafeEqual y secreto por org, deduplicación con UNIQUE, cookie de staff cifrada y revalidada en cada request, PBKDF2 para contraseñas de staff, invitaciones con token hasheado, timeouts de sesión y herramientas de IA acotadas a org+contacto en el servidor.

---

## 3. Errores lógicos y de flujo (bugs que el cliente nota)

1. **Recordatorios de citas rotos (crítico).** El cron corre 1 vez al día (`vercel.json`), pero la lógica espera correr cada 15-30 minutos. Consecuencia: una cita a las 14:00 nunca recibe recordatorio y se autocancela a las 08:00. Además los avisos se envían como texto libre fuera de la ventana de 24h, y Meta los rechaza.
2. **"Listo"/"Descartar" de recordatorios no funciona ✅.** `ChatWindow.tsx:566` y `RemindersDashboardWidget.tsx:66` pasan el `reminderId` donde la función espera el `contactId`.
3. **Respuestas dobles o fuera de turno:**
   - No se revisa el resultado del insert del mensaje entrante (si hay duplicado, la IA responde igual).
   - `is_ai_active` no se vuelve a leer justo antes de enviar, así que la IA puede contestar después de que el humano tomó el chat.
   - En `sendAgentMessage` se envía primero y se apaga la IA después.
   - En Evolution, el eco `fromMe` del propio bot puede pausar la IA.
4. **Mensajes perdidos:**
   - Solo se procesa `messages[0]` del webhook ✅ (los lotes se pierden).
   - Los mensajes que llegan con rate limit se descartan sin guardarse ✅.
   - Video, stickers y contactos se ignoran sin dejar rastro.
   - Si la IA falla en Evolution, el lead queda sin respuesta y nadie se entera.
5. **Ventana de 24h mal calculada.** `last_interaction_at` se actualiza también con los mensajes salientes. La sugerencia de reactivación aparece justo cuando ya no se puede enviar texto libre, y su texto es de un nicho específico ("modelos… medidas").
6. **Confirmar cita por regex.** `\bs[ií]\b` toma "si pero quiero cambiar" como confirmación y no reconoce "Sí".
7. **Errores de la IA:**
   - Typo `contactId` ✅ en lugar de `contact_id`: las dudas detectadas no se guardan.
   - El compilador menciona herramientas que no existen ✅ (`check_available_slots`).
   - Se envían links de Google Meet falsos ✅ (`openai.service.ts:912`).
   - La cuota de respaldo no corta nunca ✅.
   - El conteo de tokens tiene una condición de carrera.
   - `enabled_modules` nunca se consulta, así que todas las empresas reciben las herramientas de agenda.
   - La regex de guardrail apaga la IA con frases que el mismo prompt le pide decir ("déjame revisar").
   - Los mensajes de error que le llegan al cliente revelan que es una IA.
8. **Instagram:** no aplica el horario, ignora imágenes, y `send_whatsapp_image` intenta enviar a un `ig_…`.
9. **Sin cola, sin reintentos, sin maxDuration.** Si el `waitUntil` se corta, la respuesta se pierde. Las transcripciones y descargas corren antes del dedup, así que se repiten en cada reintento de Meta.
10. **El email de handoff se dispara en cada cambio de IA** (también cuando escribe un agente) y falla con `.single()` si la empresa tiene más de un admin.

---

## 4. Experiencia del asesor: qué agregar para que el CRM sea mejor que el celular

### Imprescindible (paridad con WhatsApp):
- Vista previa del último mensaje y contador de no leídos por chat (`read_at` ya existe en la base pero no se usa).
- Ticks de enviado/entregado/leído: guardar los statuses del webhook en vez de descartarlos.
- Responder citando y ver las reacciones entrantes.
- Composer multilínea (Shift+Enter) que permita seguir escribiendo mientras se envía. Hoy es un `<input>` que se deshabilita.
- Móvil/PWA: layout responsive (hoy la barra lateral y la lista tienen ancho fijo), manifest y Web Push para que lleguen avisos con la pestaña cerrada. Es la brecha más grande frente al celular.
- Paginación con scroll infinito y búsqueda en el servidor (por nombre, teléfono y contenido de mensajes). Hoy solo se ven 50 chats.
- Sonido opcional al recibir cualquier mensaje nuevo, no solo en handoffs.
- Que el agente aterrice en `/inbox` al iniciar sesión, no en el dashboard.

### Diferenciadores (la razón para preferir el CRM):
- Copiloto en el chat: la IA propone un borrador, y el asesor lo edita y envía con Tab/Enter. Es el mayor ahorro de tiempo posible.
- Pausa temporal de la IA (30 min, 2 h, hasta mañana) con reactivación automática. También auto-reactivar si el humano no responde en X minutos dentro del horario.
- Corregir a la IA desde el chat: botón "esto estuvo mal → respuesta correcta" que crea una entrada de conocimiento pendiente de aprobación del admin. Permitir que supervisores resuelvan Dudas Detectadas sin entrar a `/settings`.
- Transparencia: en cada mensaje de la IA, un ícono con las herramientas usadas, el motivo del handoff y el modelo.
- Etiquetas reales y timeline de notas internas (hoy es un solo campo de notas). Snooze de conversación y acciones masivas.
- Plantillas de Meta sincronizadas, con variables e idioma (hoy el idioma está fijo en 'es').
- Sandbox para "probar el bot" antes de activarlo, en el onboarding y al editar el prompt.
- Lead scoring automático: hoy la temperatura es un campo manual. Calcularla con señales como intención de compra, preguntas de precio y velocidad de respuesta.

### Dashboard útil:
Tiempo de primera respuesta y promedio, incumplimientos de SLA, tasa de resolución por IA, tasa de handoff y sus motivos, rendimiento por agente, valor ganado (`deal_value`), conversión por rango de fechas. Todo con agregados SQL sobre todos los datos, no sobre los últimos 100 contactos.

### Pipeline:
El drag & drop HTML5 no funciona en pantallas táctiles. Usar una librería con soporte táctil o un selector de etapa. El CSV debe exportar toda la base, como promete el manual.

---

## 5. Malas prácticas técnicas

- **Archivos enormes:** `ChatWindow.tsx` (1457 líneas), `openai.service.ts` (1244), `InboxView.tsx` (1177), `SettingsForm` (aprox. 2500). Conviene dividirlos por responsabilidad.
- **354 `as any`** aunque existe `lib/supabase/types.ts`. Regenerar los tipos con `supabase gen types` y quitar los casts.
- **Casi todo pasa por `supabaseAdmin`**, porque la RLS es recursiva. Eso hace que la seguridad dependa de que cada action recuerde filtrar por org (y C1, H1 y M3 son ejemplos de olvidos). Mejor arreglar la RLS y usar el cliente del usuario por defecto.
- **Estado en memoria en serverless** (limitador anti-ban de `lib/anti-ban/cadence.ts`): no funciona entre instancias. Moverlo a Upstash.
- **Observabilidad:** solo hay `console.*`. Falta Sentry y logs estructurados con `org_id` y `contact_id`, una tabla `ai_runs` (modelo, latencia, tokens, herramientas, failover, error) y un "dead letter" para respuestas fallidas, con aviso visible en el chat.
- **No hay `error.tsx` en ninguna ruta.**
- **Tests:** son scripts tsx que en parte golpean la base real y el LLM real. Falta probar webhooks, dedup, debounce, condiciones de carrera, ventanas del cron y guardrails. Recomiendo Vitest con mocks y una base Supabase local.
- **Documentación desalineada:** el manual dice "Z-API" pero el código usa Evolution, promete una pausa de 45 minutos que no existe, y no menciona el Embedded Signup. El README está vacío.
- **El getter de handoffs se llama en cada INSERT de mensaje** de toda la empresa y carga los mensajes sin límite (`chat.ts:431`). No va a escalar.

---

## 6. Hoja de ruta propuesta

- **Fase 0 — Seguridad crítica (COMPLETADA ✅):** C1, C2, C3, H1, H3; remoción de secretos por defecto hardcodeados; blindaje `server-only` en supabase admin; validación SSRF en `send_whatsapp_image`; aislamiento estricto por org y roles RBAC en actions de configuración M3.
- **Fase 1 — Bugs de cara al cliente (COMPLETADA ✅):**
  - Cron cada 15 minutos (`*/15 * * * *`) y auto-cancelación segura a 8h (exige `reminder_sent_at IS NOT NULL`).
  - Recordatorios con despacho de plantilla oficial Meta cuando la ventana de 24h está cerrada.
  - Corrección de parámetros y resolución bidireccional en acciones de "Listo" / "Descartar" de recordatorios.
  - Corrección de typo `contact_id` en `ai_knowledge_gaps` y nombre de herramienta `check_native_availability`.
  - Eliminación de enlaces inventados de Google Meet y corte estricto de cuota de respaldo OpenAI.
  - Eliminación de precios fijos de cocinitas y zona horaria dinámica por empresa en el prompt global.
  - Consulta de `enabled_modules` en webhooks y poda dinámica de herramientas de agenda.
  - Prevención de condición de carrera en takeover móvil de Evolution (`fromMe: true`) y desactivación de IA antes del envío de red.
  - Normalización de diacríticos y exclusión de cambio/cancelación en confirmación de citas.
  - Re-lectura de `is_ai_active` previa al envío para evitar dobles respuestas.
  - Persistencia de mensajes con rate limit y soporte de video, sticker y contactos en webhooks.
- **Fase 2 — Paridad con WhatsApp & Núcleo del Inbox (COMPLETADA ✅):**
  1. **Último mensaje y contador de no leídos:** Mostrar último mensaje recibido/enviado y badge de mensajes no leídos por chat en la lista del Inbox (`read_at` / unread count).
  2. **Ticks de entrega y lectura (Statuses):** Captura y persistencia de estados de entrega/lectura (enviado, entregado, leído) en mensajes en webhooks de Meta y Evolution.
  3. **Citar mensajes (Reply to message):** Posibilidad de responder citando un mensaje anterior en el chat con banner de contexto.
  4. **Composer multilínea:** Textarea expandible con `Shift+Enter` para saltos de línea y `Enter` para enviar, sin deshabilitar el input mientras despacha.
  5. **Descarga y reproducción de video:** Subida de videos entrantes a Storage y renderizado de reproductor de video nativo en el Inbox para asesores.
  6. **Pausas temporales de IA (Snooze):** Silenciar IA por 30m, 2h o hasta mañana con auto-reactivación al expirar.
  7. **Aterrizaje por rol:** Asesores y recepcionistas aterrizan en `/inbox` por defecto al iniciar sesión.
  8. **Adaptabilidad móvil e instalación PWA:** Navegación fluida en teléfonos móviles con cambio lista/chat y `manifest.json`.
  9. **Modal de edición de productos en catálogo:** Editar el nombre o modelo de fotos del catálogo visual sin tener que borrarlas y re-subirlas.
- **Fase 3 — Unificar el núcleo:** ✅ Completada
  - ✅ **Servicio Inbound Unificado (`services/inbound-core.service.ts`):** Unificación de `processInbound()` y `runAiWorker()` para Meta Cloud API, Evolution API e Instagram Direct, eliminando divergencias y lógica triplicada.
  - ✅ **Buffer Anti-ráfaga (Debounce 3.5s) y Dead-Letter Alerts:** Buffer contra mensajes divididos del usuario y registro de alertas y fallbacks en dead-letter.
  - ✅ **Extracción y Renderizado Visual de Citas (`@[Quote]`):** Soporte en Meta y Evolution con caja WhatsApp de contexto en burbujas y paso de contexto estructurado a la IA.
  - ✅ **Reacciones Emoji (0 Tokens):** Captura de reacciones en WhatsApp/Instagram, actualización en BD y Realtime, badge visual en esquina de burbuja sin consumo innecesario de tokens.
  - ✅ **Directorio Escalable en Inbox:** Botón "Cargar más conversaciones" (evitando sobrecarga de DOM) + Búsqueda global en Postgres vía `searchContactsGlobal`.
  - ✅ **Política Responsable de Almacenamiento (45 días):** Endpoint cron protegido `cleanup-storage` que elimina videos pesados en Supabase Storage tras 45 días conservándolos en WhatsApp.
  - ✅ **Observabilidad de IA (`ai_runs`):** Tabla de métricas por empresa (modelo, tokens prompt/completion, latencia, canal, estado).
  - ✅ **Seguridad RLS y Bloqueo de Escalación de Privilegios (H4):** Trigger `prevent_profile_privilege_escalation` en `profiles` con `SECURITY DEFINER`.
  - ✅ **Suite de Pruebas Automatizadas:** 17 suites ejecutándose y pasando al 100% en `npm test`.
- **Fase 4 — Diferenciadores:** copiloto de borradores, corrección desde el chat, transparencia de la IA, etiquetas y timeline, sandbox del bot, scoring automático, dashboard con KPIs reales, plantillas sincronizadas.

### Qué quitar o no seguir ampliando por ahora
No agregar más módulos (nuevos nichos, más canales) hasta cerrar las Fases 1 y 2. Revisar si el portal de colaboradores y los dos copilots internos se usan de verdad. Si no, congelarlos reduce superficie de ataque y mantenimiento.
