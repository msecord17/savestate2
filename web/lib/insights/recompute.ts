/**
 * Shared recompute: stats → archetypes → snapshot + history. Used by POST /api/insights/recompute,
 * GET /api/insights/archetypes (when stale), and sync routes after completion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserStats } from "@/lib/insights/user-stats";
import { computeArchetypes } from "@/lib/archetypes/score";
import { buildPayloadFromArchetypes } from "@/lib/archetypes/build-payload";
import type { ArchetypesPayload } from "@/lib/archetypes/insights-types";
import type { UserStats } from "@/lib/insights/user-stats";
import type { EraKey } from "@/lib/insights/user-stats";

export const SNAPSHOT_VERSION = "v0";

export type SnapshotPayload = {
  version: string;
  computed_at: string;
  stats: UserStats;
  archetypes: {
    primary_archetype: string | null;
    primary_era: EraKey | null;
    top: Array<{ key: string; name: string; tier: string | null; reasons: unknown[] }>;
    all: unknown[];
  };
};

/**
 * Compute user stats, score archetypes, store snapshot + history (keep last 10), return legacy payload.
 * Call after sync (PSN/Steam/Xbox/RA) or from POST /api/insights/recompute.
 */
export async function recomputeArchetypesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ArchetypesPayload> {
  const stats = await getUserStats(supabase, userId);
  const archetypes = computeArchetypes(stats);

  const computedAt = new Date().toISOString();
  const payload: SnapshotPayload = {
    version: SNAPSHOT_VERSION,
    computed_at: computedAt,
    stats,
    archetypes,
  };

  await supabase
    .from("user_archetype_snapshots")
    .upsert(
      {
        user_id: userId,
        version: SNAPSHOT_VERSION,
        payload,
        computed_at: computedAt,
      },
      { onConflict: "user_id" }
    );

  await supabase.from("user_archetype_snapshots_history").insert({
    user_id: userId,
    computed_at: computedAt,
    payload,
  });

  const { data: ids } = await supabase
    .from("user_archetype_snapshots_history")
    .select("id")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .limit(10);

  const keepIds = (ids ?? []).map((r) => r.id);
  if (keepIds.length > 0) {
    await supabase
      .from("user_archetype_snapshots_history")
      .delete()
      .eq("user_id", userId)
      .not("id", "in", `(${keepIds.join(",")})`);
  }

  return buildPayloadFromArchetypes(archetypes);
}
