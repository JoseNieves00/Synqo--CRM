# Informe de estado y plan de ejecución — Pilar IA + Organización de clientes (nov-2026)

Complementa `docs/AUDITORIA_2026-11.md` (fases 0–4 completadas). Este informe cubre los **2 pilares activos**:

1. **Pilar 1 — Agente IA autónomo**: contacto, recontacto por score, asistente de prompts, autonomía real.
2. **Pilar 2 — Organización de clientes**: estandarización de categorías, destino de "ventas a medias".

Estado de salud verificado hoy: `npm run typecheck` ✅ · suites `lead-score`, `prompt-assistant`, `inbox-reorganization`, `prompt-compiler` ✅ · git limpio en `3de1f04`.

---

## PARTE 1 — Cómo estamos

### 1.1 Pilar IA: lo que ya funciona bien (no tocar)

El pipeline inbound está en muy buen estado defensivo y ya supera la auditoría de inicios de mes:

- **Flujo unificado**: `services/inbound-core.service.ts` atiende Meta, Evolution e Instagram con dedup, lock atómico (`try_acquire_ai_lock`), debounce anti-ráfaga (3.5–9s), re-chequeo de `is_ai_active` antes de enviar y patrón outbox (`sending → sent/failed`). Cada corrida queda auditada en `ai_runs`.
- **12 herramientas del agente** (`lib/validations/tool-calls.schema.ts`): tarjetas de producto, imágenes, actualización de perfil, agenda, pedidos, handoff, knowledge gaps y cambio de etapa.
- **Catálogo de imágenes integrado al prompt** (`lib/ai/product-gallery.ts`): fusión galería+catálogo, matching por scoring, validador de **precios alucinados** con re-generación, despacho de media nativa con interceptor anti-fuga.
- **Recontacto autónomo real**: pg_cron cada 15 min → `/api/cron/lead-reactivation` con ventana Meta de 24h correctamente anclada en `last_lead_message_at`, cola priorizada por score (`lib/leads/reactivation-priority.ts`), mín. score 25, cadencia autónoma máx. 2 toques por ciclo ajustada a horario humano.
- **Lead score** (`lib/leads/lead-score.ts`): 0–100, temperatura como base, recencia/engagement/follow-up como ajustes, `ganado/perdido → null`, `opted_out → 0`.
- **Asistente de prompts** (`app/actions/prompt-assistant.ts` + `lib/ai/prompt-assistant/*`): diseño *zero-destruction* (parche por sección que respeta el formato nativo del cliente), versionado con rollback, presupuesto propio de tokens sin descontarle al cliente, auditoría pasiva diaria de conversaciones, import Excel/CSV/PDF sin IA.
- **Handoff**: regex determinística + tool con modo silent, takeover móvil, anti-spam 10 min, alerta WhatsApp accionable, SLA en cascada.

### 1.2 Pilar IA: debilidades y huecos (lo que falta)

| # | Debilidad | Dónde | Impacto |
|---|---|---|---|
| A1 | **Sin reintento diferido**: si la IA falla, el run se registra en `ai_runs` pero nadie reintenta ni avisa al asesor con urgencia | `services/openai.service.ts` | Cliente se queda sin respuesta; autonomía se rompe en silencio |
| A2 | **Fallback único y con cupo**: cadena `gemini-3.5-flash-lite → gpt-4o-mini` con backup gated a 25k tokens; si se agota, no hay tercer proveedor | `lib/ai/config.ts` | Cortes de atención cuando hay volumen |
| A3 | **Máx. 3 rondas de tool y maxTokens 600**: flujos de agenda complejos se quedan cortos; respuestas largas se truncan | `lib/ai/config.ts` | Menor tasa de resolución por IA |
| A4 | **Secretos de cron en Vault sin alerta**: si `synqo_app_url`/`synqo_cron_secret` no existen, la reactivación se omite en silencio (`RAISE NOTICE`) | `supabase/migrations/20261111100000_schedule_core_crons.sql` | Riesgo operativo: recontacto muerto sin que nadie lo sepa |
| A5 | **Sin override de cadena por organización**: todas las orgs usan la misma cadena global | `lib/ai/config.ts` | No se puede dar mejor modelo a clientes premium |
| A6 | **Suites live no aptas para CI**: 2 suites golpean Supabase y OpenAI reales (gastan tokens) | `tests/ai-audit-instagram-and-handoff.test.ts`, `tests/handoff-reminders-and-takeover.test.ts` | No hay red de seguridad en cada deploy |
| A7 | **Sin tests del loop de tools ni de `MessagingService`** (rondas, regen de precios, despacho Evolution vs Meta) | — | Bugs de autonomía solo se detectan en producción |
| A8 | **Asistente de prompts**: la auditoría pasiva detecta problemas pero falta cerrar el bucle con propuestas accionables priorizadas por impacto en conversión | `lib/ai/prompt-assistant/conversation-audit.ts` | El prompt "envejece" sin corrección |

### 1.3 Pilar Organización: lo que encontramos

Tu intuición es **correcta**: hay fragmentación. Un cliente se clasifica simultáneamente con **5 ejes** definidos en archivos distintos:

| Eje | Valores | Fuente |
|---|---|---|
| `pipeline_stage` (DB enum) | nuevo / calificado / cita_agendada / ganado / perdido | `20261020000000_init_crm_schema.sql:11` |
| Temperatura (IA) | hot / qualified_doubt / warm / cold | `lib/ai/follow-up-types.ts:6` |
| Categoría de seguimiento | hot_unclosed / qualified_doubt / warm / unresponsive / post_order | `lib/ai/follow-up-types.ts:8-13` |
| Estado de conversación (inbox) | open / waiting_customer / snoozed / closed + 5 vistas | `lib/inbox/buckets.ts` |
| Sub-buckets de "Seguimiento" | **ventas_a_medias** / compromisos / por_reactivar | `lib/inbox/buckets.ts:13` |

**Problemas concretos encontrados:**

1. **"Ventas a medias" NO es un estado de cliente** — es una etiqueta derivada solo del inbox ("negocio a medio cerrar": hot/con dudas/etapa calificado/cotización enviada). No existe en la DB ni en la página de clientes. Decidir su destino es una decisión de producto, no un bug.
2. **5 copias de las etiquetas de etapas** en `services/contact.service.ts:57`, `components/crm/crm-ui-helpers.ts:37`, `components/dashboard/TopPropensityWidget.tsx:22`, `components/pipeline/KanbanBoard.tsx:160` (inline) y `EditStageLabelsModal.tsx` — con textos y colores distintos entre módulos.
3. **BUG REAL — etiquetas personalizadas ignoradas**: la escritura guarda en `organizations.appointment_settings.stage_labels` (`app/actions/pipeline.ts:138`) pero `app/actions/crm.ts:89-100` lee una columna `organizations.stage_labels` **que no existe en ninguna migración**. Consecuencia: **/clientes y /campanas siempre muestran las etiquetas genéricas y olvidan los nombres personalizados de la empresa**.
4. **3 implementaciones paralelas de los contadores del inbox** (`lib/inbox/buckets.ts`, `app/actions/chat.ts:1408-1432`, RPC `inbox_counts()` en migración) con reglas *ligeramente distintas* — los badges pueden no coincidir con la lista.
5. **Lista de etapas duplicada 5 veces** (DB enum, `types.ts`, `tool-calls.schema.ts`, `customer-filters.ts:23`, `pipeline.ts:226`) — agregar una etapa rompe silenciosamente el esquema de tools de la IA o los filtros.
6. **Metadatos de temperatura duplicados 3 veces** con labels/íconos distintos (`follow-up-types.ts:22`, `crm-ui-helpers.ts:45`, `CustomersDirectoryClient.tsx:527`).
7. **Doble señal de "comprador"**: tabla `orders` vs legacy `custom_fields.order` (`app/actions/dashboard.ts:294`, `lib/crm/customer-filters.ts:78`).
8. Los sub-buckets de seguimiento están definidos dos veces (`buckets.ts:13` y `chat.ts:1372`) y la guía del asistente renombra `compromisos` a "Seguimientos programados" (`guide.ts:21`) — drift etiqueta/clave.

---

## PARTE 2 — Plan de ejecución con objetivos medibles

### Fase A — Estandarización de la organización (semana 1–2) · Pilar 2

| # | Tarea | Archivos | Criterio de hecho |
|---|---|---|---|
| A-1 | **Fuente única de taxonomía**: crear `lib/crm/constants.ts` con `PIPELINE_STAGES` (claves+labels+colores), `LEAD_TEMPERATURES` y derivar de ahí: z.enum de tools, `customer-filters.ts`, `pipeline.ts:226`, `STAGE_LABELS_DEFAULT`, mapa inline de TopPropensityWidget y KanbanBoard | 7 archivos arriba | `grep` no encuentra definiciones duplicadas; typecheck + suites verdes |
| A-2 | **Fix stage_labels**: migración `ALTER TABLE organizations ADD COLUMN stage_labels JSONB` + backfill desde `appointment_settings`, o cambiar la lectura de `crm.ts` a `appointment_settings->stage_labels` | `app/actions/crm.ts`, migración | /clientes y /campanas respetan los nombres personalizados de la org (test) |
| A-3 | **Paridad de contadores del inbox**: elegir `buckets.ts` como regla canónica y regenerar el RPC `inbox_counts()` + filtros de `chat.ts` desde la misma definición | `buckets.ts`, `chat.ts`, migración | Test de paridad: contadores == tamaño real de lista para las 5 vistas |
| A-4 | **Unificar "comprador"**: `orders` como única fuente; backfill de legacy `custom_fields.order` a `orders`; deprecación del legacy | migración, `dashboard.ts`, `customer-filters.ts` | Backfill ejecutado; filtros consultan solo `orders` |
| A-5 | **Decisión de producto — destino de "ventas a medias"** (ver §3 abajo) | — | Categoría implementada y documentada en la guía |

**KPI de Fase A**: 0 definiciones duplicadas de taxonomía (auditable con grep) + bug de etiquetas cerrado.

### Fase B — Confiabilidad del agente (semanas 2–3) · Pilar 1

> **✅ Ejecutada el 11-nov-2026** (compromisos B-1, A4→B-4 y B-3). Implementado en commit de hoy:
> - **B-1 Reintentos diferidos**: migración `20261111130000_ai_retry_queue_and_cron_log.sql` (tabla `ai_retry_queue` con RLS) + `services/ai-retry.service.ts`. Fallo de despacho → `resend` (reenvía la respuesta ya generada, 0 tokens); fallo fatal de generación → `regenerate` (re-ejecuta el worker con sus defensas). Backoff 90s→4min, máx. 2 intentos, ventana Meta 24h respetada, escalada al asesor (mensaje en chat + badge + alerta SuperAdmin). Procesada con prioridad en el cron de reactivación. Test: `tests/ai-retry-queue.test.ts`.
> - **B-4 Salud de crons**: `cron_job_log` registra invocaciones y omisiones; `synqo_invoke_cron` ya no omite en silencio cuando faltan secretos de Vault; panel "Salud de Automatización" en `/admin` (SuperAdmin) con última ejecución, errores 24h y omisiones por Vault. `scripts/verify-crons.ts` ahora cubre `lead-reactivation` (401 sin auth + 200 con auth + POST).
> - **B-3 Límites de autonomía**: rondas de tool 3→5 automáticamente cuando el turno involucra agenda nativa (`AI_MAX_TOOL_ROUNDS_CALENDAR`); `maxTokens` del turno configurable (`AI_MAX_TURN_OUTPUT_TOKENS`, default 600).
> - **B+ Auto-recuperación de la IA tras SLA vencido (11-nov)**: migración `20261111140000_ai_auto_resume_after_sla.sql` (columna `organizations.ai_auto_resume_minutes`, default 30, 0=off). Cierra el callejón sin salida del handoff: si ningún asesor responde ni tras la reasignación, la IA retoma la atención (nota de auditoría, limpia badge, encola respuesta vía cola de reintentos). Guardas: no retoma comprobantes de pago (`handoff_reason='payment_receipt'`), opt-outs ni cerrados. Nunca retoma antes del SLA de reasignación. Test: `tests/ai-auto-resume.test.ts`.

| # | Tarea | Detalle | Criterio de hecho |
|---|---|---|---|
| B-2 | **Cadena con 3er proveedor / override por org**: modelo de respaldo independiente del cupo de backup; `model_chain` configurable por organización | `lib/ai/config.ts`, `organizations` | 0 respuestas perdidas por agotamiento de cupo en 30 días |
| B-5 | **Tests no-live del loop de tools y MessagingService** (Vitest con mocks de OpenAI/Messaging) | `tests/` | Suite CI-safe sin llamadas de red; cubre rondas de tools, regen de precios, handoff, fallbacks |

**KPIs de Fase B** (medir sobre `ai_runs`): tasa de éxito del agente ≥ **98%** · latencia p95 < **12s**.

### Fase C — Autonomía y calidad de atención (semanas 3–6) · Pilar 1

| # | Tarea | Detalle |
|---|---|---|
| C-1 | **Dashboard de atención con datos reales**: % resueltas solo por IA, % handoff y motivos, tiempo de primera respuesta, tasa de respuesta a recontactos por banda de score — agregados SQL sobre `ai_runs` + `messages` | Ya no depende de suites live |
| C-2 | **Cerrar el bucle del asistente de prompts**: la auditoría pasiva pasa de "detectar" a "proponer" — propuesta accionable priorizada por impacto (gap frecuente → sección del prompt) con diff y aplicación de un clic | Reusa `applySectionProposalAction` existente |
| C-3 | **Onboarding guiado del prompt**: checklist de salud (galería con precios, pagos, horarios, handoff) bloqueante antes de activar el bot en producción; sandbox obligatorio | Reusa `evaluatePromptHealth` + `BotSandboxModal` |
| C-4 | **Tuning de cadencia con datos**: ajustar los umbrales de `evaluateAutonomousCadenceSlot` según la tasa de respuesta real a recontactos (por industria) | Experimento A/B por org |

> **✅ C-2 + C-3 ejecutadas el 11-nov-2026** (asistente ↔ autonomía cerrado de punta a punta):
> - **Compuerta de readiness en runtime**: `lib/ai/prompt-assistant/readiness.ts` clasifica el prompt en `empty` / `weak` / `ready`. Si está vacío, `processLeadMessage` NO llama al LLM ni improvisa con el playbook genérico: devuelve respuesta vacía (el run se registra como `skipped`, el contacto queda en "por responder") y deja **una sola** nota de sistema al asesor (`notifyPromptGateOnce` con dedupe `custom_fields.prompt_gate_notified`). El bot se recupera automáticamente en cuanto el negocio completa su prompt.
> - **Bloque defensivo para prompts débiles**: si el prompt existe pero le faltan catálogo/pagos/relevo, `composePlaybookAndBusinessPrompt` inyecta `<modo_seguro_onboarding prioridad="MAXIMA">` que prohíbe inventar precios/promesas/fechas y obliga a ofrecer relevo a un asesor. La señal de catálogo se evalúa sobre el texto completo (la galería vive en la cola que siempre viaja al contexto de runtime). Prompts `ready` no se tocan → prompt caching intacto.
> - **Contrato de comportamiento (0 tokens, determinístico)**: `buildBehaviorContract` traduce el prompt a 12 conductas concretas ("catálogo con precios exactos", "medios de pago", "cuándo pasa a un asesor", etc.) con **evidencia de la línea real del prompt**, y `buildMissingBehaviorProposals` genera propuestas ejecutables con placeholders rellenables para cada faltante. Se expone en el bootstrap del asistente y se renderiza en el tab de insights: "¿Qué hará tu bot realmente?" con tarjeta ✓/✗ y aplicación de **1 clic** reutilizando `applySectionProposalAction`.
> - **Fuente única de señales**: `SECTION_SIGNALS` compartida entre `health.ts` y el contrato (elimina la duplicación de regexes auditada).
> - Test: `tests/prompt-readiness.test.ts` (7 bloques: clasificación, contrato, propuestas, blindaje runtime, compuerta, fuente única, UI).

**KPIs objetivo de Fase C** (medibles en dashboard, baseline la semana 1):
- **Tasa de resolución por IA** ≥ **75%** de conversaciones sin handoff en orgs con salud de prompt ≥90% (baseline a medir).
- **Tiempo de primera respuesta** < **60s** en horario laboral.
- **Tasa de respuesta a recontacto** ≥ **25%** para score ≥70 (primer toque) — baseline a medir.
- **% prompts con salud ≥90%** ≥ **80%** de orgs activas.

### Deuda heredada de la auditoría anterior que sigue abierta (no bloquea, pero agendar)

- H2: bucket `chat-media` público → URLs firmadas (comprobantes de pago expuestos).
- H5: PIN de colaborador en texto plano → hashear + 6 dígitos.
- Métricas de conversión por rango de fechas con agregados SQL completos.

---

## PARTE 3 — Decisión pendiente: destino de "ventas a medias"

Tres opciones, con recomendación:

1. **(Recomendada) Categoría de cliente unificada derivada**: mantener `pipeline_stage`, temperatura y score como ejes canológicos (son inputs, no categorías), y agregar un **campo derivado de solo-lectura `customer_category`** calculado en SQL/TS que los traduce a lenguaje de negocio: `Nuevo → Atendido por IA → Interesado → Negociación (hoy "ventas a medias") → Con cita → Cliente → Perdido`. Se muestra igual en inbox, clientes, dashboard y campañas; se puede ordenar/filtrar y entra al score. "Ventas a medias" deja de ser un concepto paralelo y se vuelve el nombre del punto de la categoría.
   - Coste: bajo — es derivado, no migra datos, y unifica la nomenclatura en un solo módulo de constantes (Fase A-1).
2. **Promover a etapa del pipeline**: agregar `negociacion` al enum DB. Más honesto comercialmente, pero toca el enum, el schema de tools de la IA, filtros, imports y todos los mapas — mayor coste y riesgo de regresión.
3. **Dejarlo como sub-bucket del inbox** solo renombrado y con fuente única. Menor esfuerzo, pero no resuelve la inconsistencia entre módulos.

---

## Resumen ejecutivo

- **El motor IA está maduro**: pipeline defendido, recontacto autónomo con score y ventana 24h correctos, asistente de prompts bien diseñado. Lo que falta es **resiliencia** (reintentos, tercer proveedor, salud de crons) y **medición** (KPIs de atención) para garantizar autonomía real.
- **La organización de clientes necesita consolidación, no rediseño**: la taxonomía de DB es correcta; el problema es la **duplicación en 5+ lugares** y un bug real que ignora las etiquetas personalizadas en /clientes y /campanas.
- **Secuencia recomendada**: Fase A (semana 1–2) → Fase B (semanas 2–3) → Fase C (semanas 3–6). Así el pilar de organización queda limpio antes de meter todo el esfuerzo en la autonomía de la IA.
