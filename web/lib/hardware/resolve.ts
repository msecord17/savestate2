import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedHardware = {
  id: string;
  slug: string | null;
  display_name: string;
  kind: string;
  manufacturer: string | null;
  model: string | null;
  era_key: string | null;
};

/**
 * Resolve hardware by slug (e.g. "nes", "retroid_pocket_4_pro") or alias (e.g. "NES", "RP4 Pro").
 * Tries slug first, then hardware_aliases.
 */
export async function resolveHardwareBySlugOrAlias(
  supabase: SupabaseClient,
  slugOrAlias: string | null | undefined
): Promise<ResolvedHardware | null> {
  const raw = (slugOrAlias ?? "").trim();
  if (!raw) return null;

  const slugLower = raw.toLowerCase();

  // 1) Try exact slug match
  const { data: bySlug } = await supabase
    .from("hardware")
    .select("id, slug, display_name, kind, manufacturer, model, era_key")
    .eq("slug", slugLower)
    .maybeSingle();

  if (bySlug) {
    return {
      id: bySlug.id,
      slug: bySlug.slug,
      display_name: bySlug.display_name,
      kind: bySlug.kind,
      manufacturer: bySlug.manufacturer,
      model: bySlug.model,
      era_key: bySlug.era_key,
    };
  }

  // 2) Try alias match (case-insensitive)
  const { data: aliasRows } = await supabase
    .from("hardware_aliases")
    .select("hardware_id, hardware:hardware_id(id, slug, display_name, kind, manufacturer, model, era_key)")
    .ilike("alias", raw)
    .limit(1);

  const byAlias = Array.isArray(aliasRows) ? aliasRows[0] : null;
  const hw = (byAlias as any)?.hardware;
  if (hw?.id) {
    return {
      id: hw.id,
      slug: hw.slug,
      display_name: hw.display_name,
      kind: hw.kind,
      manufacturer: hw.manufacturer,
      model: hw.model,
      era_key: hw.era_key,
    };
  }

  return null;
}
