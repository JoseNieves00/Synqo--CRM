# Plan Pilares — Agente IA Autónomo + Organización de Clientes

Estado al **13 nov 2026**. Este documento registra las fases ejecutadas del plan acordado en chat
(tecnisismo del prompt, mejoras sin contradicciones, asistente de ayuda contextual y seguimientos
funcionales). No toca "ventas a medias" (decisión del usuario).

---

## Fase F1 — Anti-contradicción en el patcher ✅

Problema: al aceptar una mejora de 1 clic, si el cliente ya hablaba del tema **en prosa sin
encabezado**, la sección nueva se agregaba al FINAL del prompt → duplicación y contradicción
("pagos por Nequi" en el medio + "Medios de pago: transferencia" al final).

Implementado en `lib/ai/prompt-assistant/versions.ts`:

1. **`TOPIC_SIGNALS`** (regex por sección): precios/`$`, pago/transferencia/nequi, envío/domicilio,
   garantía, horario/asesor, seguimiento/recordatorio, etc.
2. **Inserción contextual**: `patchSectionInPrompt` ya no hace siempre append al final — inserta la
   nueva sección **justo después del párrafo con más señales del tema** (`findContextualAnchor`).
   Solo si el tema es totalmente nuevo va al final.
3. **`SECTION_HEADING_SYNONYMS` ampliados**: "¿Cómo pagamos?", "Formas de pago", "Nuestros
   productos", "Lista de precios", "Tiempos de entrega", "Horario de atención", "Notas
   adicionales", etc. → se actualizan **in-place** respetando el formato del cliente.
4. **`detectSectionOverlap(prompt, sectionId, sectionTitle?)`** → `{hasHeadingSection, headingTitle,
   topicMentioned, mentionExcerpt}`: expone dónde está el contenido existente.
5. `applySectionProposalAction` retorna **`insertionNote`** y el panel lo muestra: *"Ya hablabas de
   este tema en tu prompt (…): coloqué la mejora justo ahí, no al final"* — el cliente entiende que
   no se duplicó su contenido.

## Fase F2 — Des-tecnificar el prompt ✅

1. **F2.1 `lib/ai/prompt-compiler.ts`**: el texto compilado que ve el dueño **ya no contiene nombres
   de herramientas** (`check_native_availability`, `book_native_appointment`,
   `request_human_handoff`, `send_product_card`, `send_whatsapp_image`). Las directrices de cierre,
   relevo y venta visual ahora están en lenguaje natural; los nombres de tools viven solo en el
   **playbook base de runtime** (que el cliente nunca edita).
2. **F2.2 Galería fuera del texto editable**:
   - La fuente autoritativa es `structured_prompt_data.gallery` (ya existía).
   - `StructuredPromptWizard.compileAndPropagate` **ya no incrusta** la cola
     `=== CATÁLOGO VISUAL DE PRODUCTOS ===` en el prompt compilado: el dueño edita solo su texto,
     sin URLs crudas que pueda romper sin darse cuenta.
   - El runtime ya recibía la galería por el bloque dinámico (`buildDynamicContextBlock`) y el
     composer `composePlaybookAndBusinessPrompt` ya recortaba la cola — no se necesitó cambiarlos.
   - Parser legacy `resolveOrganizationGallery(org, systemPrompt)` **se conserva** para prompts
     antiguos que todavía llevan la cola embebida (se auto-migran al primer guardado del wizard).
   - `generateAutonomousReminderMessage` añade un **resumen compacto del catálogo** (top 10 +
     precios) al digest de recontacto, porque la cola ya no viaja en el prompt editable.
3. `evaluatePromptHealth` ya recibía `structured.gallery` (señal de catálogo lista).

## Fase F3 — Asistente de ayuda contextual ✅

`askAssistantHelpAction` (antes respondía solo con la guía genérica de 9 temas):

- Inyecta al system del LLM el **contexto real del negocio**: tamaño del prompt, estructura
  (`buildCompactPromptOutline`), nº de fotos en galería, proveedor de WhatsApp (Meta vs Evolution
  con su implicación de ventana 24h), y estado de seguimientos (interruptor maestro + secuencias
  configuradas — con aviso explícito cuando hay secuencias creadas pero el switch está apagado).
- Responde con lo específico del prompt del cliente, no con texto genérico.

## Fase F4 — Seguimientos funcionales ✅

Causas raíz de "solo hay cola programada y no llega el primer mensaje":

| Candado | Antes | Ahora |
|---|---|---|
| Switch maestro `follow_up_sequences.enabled` (default **false**) | Si creaste secuencias y no activaste el switch, NADA se enviaba sin ningún aviso | **Banner crítico** en Ajustes → Seguimientos: "Tienes N secuencias con mensajes configurados, pero el envío automático está APAGADO. Nada se está enviando." |
| Rama A congelaba recordatorios para siempre cuando `is_ai_active === false` | El asesor respondía manualmente → la IA se apaga → **su propio seguimiento quedaba pendiente eterno** | Nuevo candado puro `resolveFollowUpHoldReason` (`lib/leads/followup-gates.ts`): cancela en opt-out/cerrado/ganado/perdido, retiene mientras el cliente espera respuesta humana, y **ENVÍA en el resto aunque la IA esté apagada** |
| `minLeadScore` 25 filtraba el primer mensaje | Leads nuevos con score < 25 no recibían el paso configurado | `prioritizeReactivationQueue` gana `bypassMinScore`: los pasos **explícitamente configurados** (`item.step`) nunca se filtran por score (el modo autónomo sí conserva el umbral) |
| Meta-24h sin plantilla → pausa eterna | `paused:true` sin mecanismo de unpause | Al volver a escribir el lead, inbound despausa y limpia `pausedReason`/`follow_up_last_skipped`; la rama B reprograma desde el nuevo `last_interaction_at` |
| Observabilidad cero | Todos los saltos eran `continue` silenciosos | **Panel de salud** en Ajustes: enviados hoy vs tope, pendientes, retenidos (esperando asesor), pausados (ventana Meta) y score mínimo — vía `getFollowUpHealthAction` |

## Extras del mismo bloque

- **Reintentos diferidos de IA** (`services/ai-retry.service.ts` + migración
  `20261113120000_ai_retry_queue.sql` + wiring en cron `lead-reactivation`): si la respuesta ya
  estaba generada y el despacho al canal falló → se reenvía **sin gastar tokens**; si el worker de
  IA falló antes de responder → re-dispara el turno pendiente. Errores de credenciales (401/token
  expirado) no se reintentan (ya disparan su propia alerta). Guardas: opt-out, chat cerrado,
  atención humana, ventana Meta.

## Verificación

- `npm test` completo: **exit 0** (incluye las nuevas suites `tests/patcher-contextual.test.ts` y
  `tests/ai-retry-wiring.test.ts`).
- `npx tsc --noEmit`: limpio.

## Pendientes operativos

1. Aplicar migraciones en Supabase SQL Editor (las más recientes):
   `20261111130000`, `20261111140000` (si aplican a tu entorno) y **`20261113120000_ai_retry_queue.sql`**.
2. Confirmar en producción: org problemática usa **Meta o Evolution**, y si el **switch de
   secuencias** está activado (con el banner nuevo se ve de un vistazo).
