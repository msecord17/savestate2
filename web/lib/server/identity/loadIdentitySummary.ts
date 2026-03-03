import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIdentityFromSignals } from "@/lib/identity/buildIdentity";
import { getPlayedOnSummary } from "@/lib/identity/getPlayedOnSummary";
import { getMostPlayedOn } from "@/lib/identity/getMostPlayedOn";
import { getPlayedOnByEra } from "@/lib/identity/getPlayedOnByEra";

export type IdentitySignals = any;

export async function loadIdentitySummary(
  supabase: SupabaseClient,
  userId: string,
  opts?: { lifetimeScoreOverride?: number | null }
) {
  // NOTE: this RPC name should match what your /api/identity/summary route used already.
  // If your RPC is named differently, rename it here ONCE and both routes stay aligned.
  const { data, error } = await supabase.rpc("get_identity_signals", { p_user_id: userId });

  if (error) throw error;
  const signals: IdentitySignals = data;

  const [played_on, most_played_on, played_on_by_era] = await Promise.all([
    getPlayedOnSummary(supabase, userId, 3),
    getMostPlayedOn(supabase, userId, 3),
    getPlayedOnByEra(supabase, userId, 3).catch(() => ({}) as Record<string, never>),
  ]);
  const identity = buildIdentityFromSignals(signals, played_on, most_played_on);

  // Ensure identity.summary has archetype + top_era (flat = summary is what APIs send as "identity")
  const archetypes = identity.archetypes ?? [];
  const primary = archetypes[0] ?? null;
  const summary = identity.summary as Record<string, unknown> | undefined;
  const top_era = summary?.top_era ?? (identity as Record<string, unknown>).top_era;

  if (summary) {
    const existing = summary.archetype ?? summary.primary_archetype;
    const fallback = primary
      ? { key: primary.key, label: primary.label, strength: primary.strength, one_liner: primary.reasons?.[0] ?? "" }
      : null;
    const archetype = (existing ?? fallback) as Record<string, unknown> | null;
    if (archetype && !archetype.label && archetype.name) archetype.label = archetype.name;
    summary.archetype = archetype;
    summary.top_era = summary.top_era ?? top_era;
  }

  // Mirror root fields into identity so older UI (identity.archetype, identity.top_era) still works
  const id = identity as Record<string, unknown>;
  if (!id.archetype && primary) id.archetype = primary;
  if (!id.top_era && top_era != null) id.top_era = top_era;

  // Ensure the displayed lifetime score matches what you store on profiles when available.
  if (opts?.lifetimeScoreOverride != null) {
    (identity as any).lifetime_score = opts.lifetimeScoreOverride;
    (identity as any).score_total = opts.lifetimeScoreOverride; // in case UI uses this name
  }

  (identity as Record<string, unknown>).most_played_on = most_played_on;
  if (summary) (summary as Record<string, unknown>).most_played_on = most_played_on;

  return { signals, identity, played_on, played_on_by_era };
}
