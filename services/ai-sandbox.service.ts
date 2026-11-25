import OpenAI from 'openai';
import {
  SendWhatsAppImageToolSchema,
  SendProductCardToolSchema,
  UpdateLeadProfileToolSchema,
  ScheduleFollowUpToolSchema,
  CreateOrderToolSchema,
} from '@/lib/validations/tool-calls.schema';
import {
  formatImageMessageContent,
  stripRedundantCatalogListAfterCards,
  extractSentInformationSummary,
} from '@/lib/media/format';
import {
  AI_OPERATIONAL_CONFIG,
  AiChainEntry,
  AiProviderType,
  calculateTurnCostUsd,
  getAiChatChain,
} from '@/lib/ai/config';
import { composePlaybookAndBusinessPrompt } from '@/lib/ai/sales-playbook';
import {
  buildProductCardCaption,
  findGalleryProductMatch,
  findHallucinatedPrices,
  formatGalleryPrice,
  resolveOrganizationGallery,
} from '@/lib/ai/product-gallery';
import {
  buildDynamicContextBlock,
  createChatCompletionWithFallback,
  EvalDryRunTrace,
  getAvailableTools,
} from './openai.service';

export interface SimulateSandboxMessageParams {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string; productCards?: any[] }>;
  aiProvider?: string | null;
  organizationId?: string;
  organization?: any;
  enableDryRunTools?: boolean;
  enabledModules?: any;
  leadProfileContext?: {
    name?: string;
    stage?: string;
    temperature?: string;
    interest?: string;
  };
}

export class AiSandboxService {
  static async simulateSandboxMessage(params: SimulateSandboxMessageParams): Promise<{
    reply: string;
    modelUsed: string;
    provider: AiProviderType;
    latencyMs: number;
    dryRunTrace?: EvalDryRunTrace;
  }> {
    const startTime = Date.now();
    const { items: galleryItems, knownPrices } = resolveOrganizationGallery(params.organization, params.systemPrompt);

    const staticSystem = params.enableDryRunTools
      ? composePlaybookAndBusinessPrompt({
          businessPrompt: params.systemPrompt,
          hasCalendar: Boolean(params.enabledModules?.native_calendar),
          paymentAccounts: params.organization?.appointment_settings?.payment_accounts,
          shippingSettings: params.organization?.appointment_settings?.shipping_settings,
        })
      : params.systemPrompt;

    const pseudoDbMessages = [
      ...params.history.map((h, i) => {
        let content = h.content;
        if (h.role === 'assistant' && Array.isArray((h as any).productCards) && (h as any).productCards.length > 0) {
          const firstCard = (h as any).productCards[0];
          content = formatImageMessageContent(firstCard.url || '', firstCard.caption || `${firstCard.name} · ${firstCard.price}`);
        }
        return {
          sender_type: h.role === 'user' ? 'lead' : 'ai',
          content,
          created_at: new Date(Date.now() - (params.history.length - i + 1) * 60000).toISOString(),
        };
      }),
      {
        sender_type: 'lead',
        content: params.userMessage,
        created_at: new Date().toISOString(),
      },
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: staticSystem },
      ...params.history.map((h) => {
        if (h.role === 'assistant' && Array.isArray((h as any).productCards) && (h as any).productCards.length > 0) {
          const cardNames = (h as any).productCards
            .map((c: any) => `"${c.name} · ${formatGalleryPrice(c.price)}"`)
            .join(', ');
          const cardMarker = `[Tarjeta visual de producto ya enviada y vista por el cliente: ${cardNames}. Prohibido repetir este marcador o sus especificaciones.]`;
          return {
            role: 'assistant' as const,
            content: `${cardMarker}\n${h.content}`.trim(),
          };
        }
        return {
          role: h.role as 'user' | 'assistant',
          content: h.content,
        };
      }),
      { role: 'user', content: params.userMessage },
    ];

    const rawStoredCatalog = Array.isArray(params.organization?.structured_prompt_data?.catalog)
      ? params.organization.structured_prompt_data.catalog
      : [];
    const overflowCatalog = rawStoredCatalog.length > 15 ? rawStoredCatalog.slice(15, 100) : [];
    const sentInformationSummary = extractSentInformationSummary(pseudoDbMessages);
    const lastAssistantMsg = [...params.history].reverse().find((m) => m.role === 'assistant');
    const lastAssistantText = lastAssistantMsg?.content || null;

    if (params.enableDryRunTools) {
      messages.push({
        role: 'system',
        content: buildDynamicContextBlock({
          orgTimezone: params.organization?.business_hours?.timezone || AI_OPERATIONAL_CONFIG.defaultTimezone,
          contactData: {
            name: params.leadProfileContext?.name,
            pipeline_stage: params.leadProfileContext?.stage || 'nuevo',
            custom_fields: {
              lead_temperature: params.leadProfileContext?.temperature,
              product_interest: params.leadProfileContext?.interest,
            },
          },
          leadName: params.leadProfileContext?.name,
          galleryItems,
          extendedCatalog: overflowCatalog,
          lastAssistantText,
          sentInformationSummary,
          stageLabels: (params.organization?.appointment_settings as any)?.stage_labels,
          stageCriteria: (params.organization?.appointment_settings as any)?.stage_criteria,
          history: pseudoDbMessages,
          organization: params.organization,
        }),
      });
    }

    const activeTools = params.enableDryRunTools ? getAvailableTools(params.enabledModules ?? { native_calendar: false }) : undefined;
    const maxRounds = params.enableDryRunTools ? AI_OPERATIONAL_CONFIG.maxToolRounds : 1;

    const trace: EvalDryRunTrace = {
      reply: '',
      modelUsed: '',
      provider: 'google',
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      toolCallsExecuted: [],
      productCardsSent: [],
      leadProfileUpdate: null,
      orderCreated: null,
      followUpScheduled: null,
      handoffRequested: null,
    };

    let activeRoundChain: AiChainEntry[] | undefined = undefined;

    for (let round = 0; round < maxRounds; round++) {
      const useTools = Boolean(activeTools && round < maxRounds - 1);
      const { response, modelUsed, provider } = await createChatCompletionWithFallback({
        messages,
        tools: activeTools,
        toolChoice: activeTools ? (useTools ? 'auto' : 'none') : undefined,
        temperature: 0.3,
        aiProvider: params.aiProvider,
        organizationId: params.enableDryRunTools ? undefined : params.organizationId,
        chainOverride: activeRoundChain,
      });

      if (!activeRoundChain && params.enableDryRunTools) {
        activeRoundChain = [
          { provider, model: modelUsed },
          ...getAiChatChain(params.aiProvider).filter(
            (e) => !(e.provider === provider && e.model === modelUsed) && (provider !== 'openai' || e.provider === 'openai')
          ),
        ];
      }

      trace.modelUsed = modelUsed;
      trace.provider = provider;
      if (response.usage) {
        const pt = response.usage.prompt_tokens || 0;
        const ct = response.usage.completion_tokens || 0;
        const cached =
          (response.usage as any)?.prompt_tokens_details?.cached_tokens ||
          (response.usage as any)?.cached_tokens ||
          0;
        trace.promptTokens += pt;
        trace.completionTokens += ct;
        trace.cachedTokens += cached;
        trace.costUsd += calculateTurnCostUsd({ model: modelUsed, promptTokens: pt, cachedTokens: cached, completionTokens: ct });
      }

      const message = response.choices[0]?.message;
      if (!message?.tool_calls || message.tool_calls.length === 0) {
        trace.reply = (message?.content || '').trim() || 'Sin respuesta generada.';
        break;
      }

      messages.push(message);
      for (const tc of message.tool_calls) {
        const fn = tc.function.name;
        let args: any = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {}

        let resultPayload: any = { status: 'dry_run_ok' };

        if (fn === 'send_product_card') {
          const parsed = SendProductCardToolSchema.safeParse(args);
          if (!parsed.success) {
            resultPayload = { status: 'validation_error', error: parsed.error.message };
          } else {
            const matched = findGalleryProductMatch(galleryItems, parsed.data.product_name_or_id, parsed.data.image_role);
            if (!matched) {
              resultPayload = { status: 'not_found' };
            } else {
              const caption = buildProductCardCaption({
                name: matched.name,
                price: matched.price,
                details: parsed.data.details,
              });
              trace.productCardsSent.push({ name: matched.name, price: matched.price, caption, url: matched.url });
              resultPayload = {
                status: 'sent',
                product: matched.name,
                price: formatGalleryPrice(matched.price),
                caption,
                already_visible_in_card: true,
                message:
                  'Tarjeta visual despachada con foto oficial, precio y detalles. Si el cliente formuló una duda, contexto o inquietud (ej: estatura, medidas, edad, gusto, idoneidad o uso), DEBES RESPONDER PRIMERO a su inquietud con asesoría honesta, cercana y empática orientada al modelo ideal. PROHIBIDO escribir "[Foto oficial enviada]" y PROHIBIDO transcribir en bloque fichas técnicas mecánicas redundantes; concluye con una alternativa de micro-avance hacia la compra o apartado.',
              };
            }
          }
        } else if (fn === 'send_whatsapp_image') {
          const parsedImg = SendWhatsAppImageToolSchema.safeParse(args);
          if (parsedImg.success) {
            trace.productCardsSent.push({
              name: parsedImg.data.caption || 'Imagen',
              caption: parsedImg.data.caption || '',
              url: parsedImg.data.image_url,
            });
            resultPayload = { status: 'sent', image_url: parsedImg.data.image_url };
          } else {
            resultPayload = { status: 'validation_error', error: parsedImg.error.message };
          }
        } else if (fn === 'update_lead_profile') {
          const parsed = UpdateLeadProfileToolSchema.safeParse(args);
          if (parsed.success) {
            trace.leadProfileUpdate = parsed.data;
            resultPayload = { status: 'updated', ...parsed.data };
          } else {
            resultPayload = { status: 'validation_error' };
          }
        } else if (fn === 'schedule_follow_up') {
          const parsed = ScheduleFollowUpToolSchema.safeParse(args);
          if (parsed.success) {
            trace.followUpScheduled = {
              date: parsed.data.date || `+${parsed.data.delay_hours || 24}h`,
              reason: parsed.data.reason,
            };
            resultPayload = { status: 'scheduled', ...parsed.data };
          }
        } else if (fn === 'create_order') {
          const parsed = CreateOrderToolSchema.safeParse(args);
          if (parsed.success) {
            trace.orderCreated = parsed.data;
            resultPayload = { status: 'order_created', total: parsed.data.total };
          } else {
            resultPayload = { status: 'validation_error', error: parsed.error.message };
          }
        } else if (fn === 'request_human_handoff') {
          const handoffReason = String(args.reason || 'Asesor requerido');
          const isPurchaseOrSepareIntent =
            /(apartar|separe|abono|abonar|comprar|reserva(r|ndo)?|ordenar|interes.*compra)/i.test(handoffReason) &&
            !/(comprobante|recibo|voucher|transferido|consignaci[oó]n|captura|humano|asesor|hablar con|persona|queja|reclamo)/i.test(handoffReason);
          if (isPurchaseOrSepareIntent) {
            resultPayload = {
              status: 'handoff_rejected_closing_required',
              instructions_for_assistant:
                'PROHIBIDO desviar al asesor. Si el producto no está definido, extráelo primero con gancho de plan separe. Si ya está claro en contexto, cotiza el total con opción de separe, envía cuentas y pide datos de orden.',
            };
          } else {
            trace.handoffRequested = { reason: handoffReason };
            resultPayload = { status: 'handoff_business_hours' };
          }
        }

        trace.toolCallsExecuted.push({ name: fn, args, status: resultPayload.status || 'ok' });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultPayload) });
      }
    }

    // Validador de precios en Dry-Run también
    if (params.enableDryRunTools && trace.reply) {
      const badPrices = findHallucinatedPrices(trace.reply, knownPrices);
      if (badPrices.length > 0) {
        trace.reply += `\n\n[⚠️ Alerta Sandbox: posible precio fuera de catálogo (${badPrices.join(', ')})]`;
      }
    }

    // Blindaje Determinístico: Poda de ecos de tarjetas, prefijos internos y listas redundantes en Sandbox
    if (trace.reply) {
      trace.reply = trace.reply
        .replace(/^\[(?:Foto oficial enviada|Imagen enviada|Tarjeta visual)[^\]]*\]:?\s*/gim, '')
        .replace(/\[(?:Foto oficial enviada|Imagen enviada)\]:?\s*/gi, '')
        .trim();

      if (trace.productCardsSent.length > 0 || sentInformationSummary.length > 0) {
        trace.reply = stripRedundantCatalogListAfterCards(trace.reply);

        const lines = trace.reply.split('\n');
        const cleanedLines = lines.filter((l) => {
          const trimmed = l.trim();
          if (!trimmed) return true;
          if (/\$\s*\d+[\d.,]*/.test(trimmed) && (trimmed.includes('·') || trimmed.includes('-') || trimmed.length < 50)) {
            return false;
          }
          if (/^\s*[-*•]?\s*medidas?\s*:\s*\d+/i.test(trimmed)) {
            return false;
          }
          return true;
        });
        const reassembled = cleanedLines.join('\n').trim();
        if (reassembled.length >= 10) {
          trace.reply = reassembled;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    trace.latencyMs = latencyMs;

    return {
      reply: trace.reply || 'Sin respuesta generada.',
      modelUsed: trace.modelUsed || 'default',
      provider: trace.provider,
      latencyMs,
      ...(params.enableDryRunTools ? { dryRunTrace: trace } : {}),
    };
  }
}
