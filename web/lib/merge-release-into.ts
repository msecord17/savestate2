import { releaseExternalIdRow } from "@/lib/release-external-ids";

/**
 * Merge loser release into winner: move portfolio + signals + release_external_ids to winner, then delete loser.
 * Used when the anchored release_external_ids row points to a different release_id than the one we just created.
 */
export async function mergeReleaseInto(admin: any, winnerId: string, loserId: string) {
  const tablesWithReleaseId = [
    "portfolio_entries",
    "psn_title_progress",
    "xbox_title_progress",
    "steam_title_progress",
    "ra_achievement_cache",
  ] as const;
  for (const table of tablesWithReleaseId) {
    await admin.from(table).update({ release_id: winnerId }).eq("release_id", loserId);
  }
  // release_enrichment_state is keyed by release_id; drop loser row (winner may already have one)
  await admin.from("release_enrichment_state").delete().eq("release_id", loserId);
  const { data: extRows } = await admin
    .from("release_external_ids")
    .select("source, external_id")
    .eq("release_id", loserId);
  if (Array.isArray(extRows) && extRows.length) {
    for (const x of extRows as { source: string; external_id: string }[]) {
      await admin
        .from("release_external_ids")
        .upsert(releaseExternalIdRow(winnerId, x.source, x.external_id), {
          onConflict: "source,external_id",
        });
    }
    await admin.from("release_external_ids").delete().eq("release_id", loserId);
  }
  await admin.from("releases").delete().eq("id", loserId);
}
