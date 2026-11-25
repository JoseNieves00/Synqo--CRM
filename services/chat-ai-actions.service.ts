import { supabaseAdmin } from '@/lib/supabase/admin';
import { OpenAIService } from '@/services/openai.service';

export class ChatAiActionsService {
  static async generateSummary(orgId: string, contactId: string) {
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, organization_id, custom_fields')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single();

    if (!contact) throw new Error('Contacto no encontrado');

    const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
      .select('sender_type, content, created_at')
      .eq('contact_id', contactId)
      .in('sender_type', ['lead', 'ai', 'agent_manual'])
      .order('created_at', { ascending: false })
      .limit(30);

    const chronological = rawMessages ? [...rawMessages].reverse() : [];
    const summary = await OpenAIService.generateDealSummary(chronological);

    const summaryData = {
      ...summary,
      generated_at: new Date().toISOString(),
    };

    const currentCustom = (contact.custom_fields as Record<string, any>) || {};
    const updatedCustom = {
      ...currentCustom,
      ai_summary: summaryData,
      ...(summary.product_interest ? { product_interest: summary.product_interest } : {}),
      ...(summary.pain_point ? { pain_point: summary.pain_point } : {}),
      ...(summary.purchasing_power ? { purchasing_power: summary.purchasing_power } : {}),
    };

    await (supabaseAdmin.from('contacts') as any)
      .update({
        custom_fields: updatedCustom,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    return summaryData;
  }

  static async generateDraftReply(orgId: string, contactId: string): Promise<{ draft: string }> {
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single();

    if (!contact) throw new Error('Contacto no encontrado');

    const { data: organization } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, structured_prompt_data, system_prompt, ai_provider')
      .eq('id', orgId)
      .single();

    const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(8);

    const history = (rawMessages || []).reverse();
    if (history.length === 0) {
      return { draft: `¡Hola ${contact.name || ''}! ¿Cómo podemos apoyarte el día de hoy?` };
    }

    const draft = await OpenAIService.generateDraftCopilotReply({
      organizationId: orgId,
      contactId,
      leadName: contact.name,
      history,
      organization,
    });

    return { draft };
  }

  static async generateReactivationSuggestion(orgId: string, contactId: string): Promise<{
    success: boolean;
    detectedInterest?: string;
    suggestedMessage?: string;
    alternativeHook?: string;
    error?: string;
  }> {
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, pipeline_stage, custom_fields')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single();

    if (!contact) throw new Error('Contacto no encontrado');

    const { data: organization } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, structured_prompt_data, system_prompt, ai_provider')
      .eq('id', orgId)
      .single();

    const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
      .select('id, sender_type, content, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(12);

    const history = (rawMessages || []).reverse();

    try {
      const result = await OpenAIService.generateReactivationHook({
        organizationId: orgId,
        contactId,
        leadName: contact.name,
        history,
        organization,
        contactCustomFields: contact.custom_fields,
      });

      return {
        success: true,
        detectedInterest: result.detectedInterest,
        suggestedMessage: result.suggestedMessage,
        alternativeHook: result.alternativeHook,
      };
    } catch (err: any) {
      console.error('[GENERATE REACTIVATION AI ERROR]', err);
      return {
        success: false,
        error: err?.message || 'Error al generar sugerencia de reactivación',
      };
    }
  }
}
