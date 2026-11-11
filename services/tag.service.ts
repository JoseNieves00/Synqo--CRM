import { supabaseAdmin } from '@/lib/supabase/admin';
import { TAG_COLORS, type TagColor } from '@/lib/crm/constants';

export { TAG_COLORS, type TagColor };

/** Máximo de etiquetas que la IA puede crear por organización (evita explosión de variantes). */
const MAX_AI_CREATED_TAGS_PER_ORG = 40;

export function normalizeTagName(raw: string): string {
  const clean = String(raw || '')
    .replace(/[#"'`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function pickColor(name: string): TagColor {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export class TagService {
  /** Busca etiquetas por nombre (case-insensitive) y crea las que falten. */
  static async ensureTags(params: {
    organizationId: string;
    names: string[];
    createdByAi: boolean;
  }): Promise<Array<{ id: string; name: string }>> {
    const names = Array.from(
      new Map(params.names.map((n) => normalizeTagName(n)).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()
    );
    if (names.length === 0) return [];

    const { data: existing } = await (supabaseAdmin.from('tags') as any)
      .select('id, name, created_by_ai')
      .eq('organization_id', params.organizationId);

    const byLower = new Map<string, { id: string; name: string }>(
      (existing || []).map((t: any) => [String(t.name).toLowerCase(), { id: t.id, name: t.name }])
    );
    let aiCreatedCount = (existing || []).filter((t: any) => t.created_by_ai).length;

    const result: Array<{ id: string; name: string }> = [];
    for (const name of names) {
      const found = byLower.get(name.toLowerCase());
      if (found) {
        result.push(found);
        continue;
      }
      if (params.createdByAi && aiCreatedCount >= MAX_AI_CREATED_TAGS_PER_ORG) continue;
      const { data: created, error } = await (supabaseAdmin.from('tags') as any)
        .insert({
          organization_id: params.organizationId,
          name,
          color: pickColor(name),
          created_by_ai: params.createdByAi,
        })
        .select('id, name')
        .single();
      if (created) {
        result.push(created);
        byLower.set(name.toLowerCase(), created);
        if (params.createdByAi) aiCreatedCount++;
      } else if (error && (error as any).code === '23505') {
        // Carrera: otra petición la creó; releer
        const { data: again } = await (supabaseAdmin.from('tags') as any)
          .select('id, name')
          .eq('organization_id', params.organizationId)
          .ilike('name', name)
          .maybeSingle();
        if (again) result.push(again);
      }
    }
    return result;
  }

  /** Asigna etiquetas a contactos (idempotente). */
  static async addTagsToContacts(params: {
    organizationId: string;
    contactIds: string[];
    tagIds: string[];
    source: 'human' | 'ai';
  }): Promise<number> {
    const rows = params.contactIds.flatMap((contactId) =>
      params.tagIds.map((tagId) => ({
        contact_id: contactId,
        tag_id: tagId,
        organization_id: params.organizationId,
        source: params.source,
      }))
    );
    if (rows.length === 0) return 0;
    const { error } = await (supabaseAdmin.from('contact_tags') as any).upsert(rows, {
      onConflict: 'contact_id,tag_id',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Error asignando etiquetas: ${error.message}`);
    return rows.length;
  }

  /**
   * Etiquetado autónomo desde la conversación (herramienta update_lead_profile).
   * Best effort: nunca interrumpe el flujo de la IA.
   */
  static async applyAiTags(organizationId: string, contactId: string, names: string[] | undefined | null): Promise<string[]> {
    try {
      if (!names || names.length === 0) return [];
      const tags = await this.ensureTags({ organizationId, names: names.slice(0, 3), createdByAi: true });
      if (tags.length === 0) return [];
      await this.addTagsToContacts({
        organizationId,
        contactIds: [contactId],
        tagIds: tags.map((t) => t.id),
        source: 'ai',
      });
      return tags.map((t) => t.name);
    } catch (err: any) {
      console.warn('[TAG SERVICE] applyAiTags falló', err?.message || err);
      return [];
    }
  }

  /** Nombres de etiquetas existentes de la organización (para que la IA reutilice en vez de crear variantes). */
  static async listTagNames(organizationId: string, limit = 25): Promise<string[]> {
    const { data } = await (supabaseAdmin.from('tags') as any)
      .select('name')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    return (data || []).map((t: any) => t.name);
  }
}
