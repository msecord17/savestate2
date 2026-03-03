import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayedOnSummary = {
  total_releases: number;
  top_device: {
    slug: string;
    display_name: string;
    kind: "console" | "handheld" | "arcade" | "computer" | "other";
    era_key: string;
    releases: number;
    source?: "manual" | "ra" | string;
  } | null;
  by_kind: Record<string, number>;
  handheld_share?: number;
};

const KINDS = ["console", "handheld", "arcade", "computer", "other"] as const;
function normalizeKind(k: string | null): "console" | "handheld" | "arcade" | "computer" | "other" {
  const s = String(k ?? "").toLowerCase().trim();
  return KINDS.includes(s as any) ? (s as any) : "other";
}

export async function loadPlayedOnSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<PlayedOnSummary> {
  const { data: rows, error } = await supabase
    .from("user_release_played_on")
    .select(
      "source, hardware:hardware_id (slug, display_name, kind, era_key)"
    )
    .eq("user_id", userId)
    .eq("is_primary", true);

  if (error) throw error;

  type Row = {
    source?: string | null;
    hardware?: {
      slug: string | null;
      display_name: string | null;
      kind: string | null;
      era_key: string | null;
    } | null;
  };
  const items = (rows ?? []) as unknown as Row[];

  const total_releases = items.length;

  // Group by hardware slug (or id) to count releases per device
  const bySlug = new Map<
    string,
    { slug: string; display_name: string; kind: string; era_key: string; count: number; sources: Set<string> }
  >();

  for (const r of items) {
    const hw = r.hardware;
    if (!hw?.slug) continue;
    const slug = hw.slug;
    const existing = bySlug.get(slug);
    if (existing) {
      existing.count += 1;
      if (r.source) existing.sources.add(r.source);
    } else {
      bySlug.set(slug, {
        slug,
        display_name: hw.display_name ?? slug,
        kind: hw.kind ?? "other",
        era_key: hw.era_key ?? "",
        count: 1,
        sources: r.source ? new Set([r.source]) : new Set(),
      });
    }
  }

  // Top device = most releases
  let top_device: PlayedOnSummary["top_device"] = null;
  if (bySlug.size > 0) {
    const sorted = [...bySlug.values()].sort((a, b) => b.count - a.count);
    const t = sorted[0];
    const source = t.sources.size > 0 ? [...t.sources][0] : undefined;
    top_device = {
      slug: t.slug,
      display_name: t.display_name,
      kind: normalizeKind(t.kind),
      era_key: t.era_key ?? "",
      releases: t.count,
      source,
    };
  }

  // by_kind
  const by_kind: Record<string, number> = {};
  for (const r of items) {
    const k = normalizeKind(r.hardware?.kind ?? null);
    by_kind[k] = (by_kind[k] ?? 0) + 1;
  }

  // handheld_share
  const handheldCount = by_kind["handheld"] ?? 0;
  const handheld_share =
    total_releases > 0 ? Math.round((handheldCount / total_releases) * 1000) / 1000 : undefined;

  return {
    total_releases,
    top_device,
    by_kind,
    handheld_share,
  };
}
