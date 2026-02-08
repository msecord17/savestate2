/**
 * Step 3: Resolver job. Deterministic, repeatable.
 * - Groups provisional games by canonical_title (and optionally platform family).
 * - Runs IGDB matching once per group; picks best match deterministically.
 * - Sets games.igdb_game_id only from accepted match; merges duplicate games.
 *
 * POST ?limit=100 — process up to N pending match attempts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { igdbSearchBest, igdbFetchGameById, normalizeCanonicalTitle } from "@/lib/igdb/server";

const RESOLVER_CONFIDENCE_GATE = 0.84;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const admin = adminClient();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const { data: attempts, error: aErr } = await admin
    .from("game_match_attempts")
    .select("id, game_id, source, external_id, title_used")
    .eq("outcome", "pending")
    .not("game_id", "is", null)
    .limit(limit * 2);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  const attemptList = (attempts ?? []) as Array<{ id: string; game_id: string; source: string; external_id: string; title_used: string | null }>;
  if (attemptList.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      accepted: 0,
      merged: 0,
      message: "No pending match attempts.",
    });
  }

  const gameIds = [...new Set(attemptList.map((a) => a.game_id).filter(Boolean))];
  const { data: games, error: gErr } = await admin
    .from("games")
    .select("id, canonical_title, igdb_game_id, match_status")
    .in("id", gameIds);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const gameRows = (games ?? []) as Array<{ id: string; canonical_title: string | null; igdb_game_id: number | null; match_status: string | null }>;

  const byTitle = new Map<string, string[]>();
  for (const g of gameRows) {
    if (g.igdb_game_id != null) continue;
    const title = (g.canonical_title || "").trim() || `unknown:${g.id}`;
    const norm = normalizeCanonicalTitle(title);
    if (!byTitle.has(norm)) byTitle.set(norm, []);
    byTitle.get(norm)!.push(g.id);
  }

  let processed = 0;
  let accepted = 0;
  let merged = 0;
  const now = new Date().toISOString();

  for (const [canonicalTitle, clusterGameIds] of byTitle) {
    if (processed >= limit) break;
    if (clusterGameIds.length === 0) continue;

    const firstAttempt = attemptList.find((a) => clusterGameIds.includes(a.game_id));
    const platformHint = firstAttempt?.source ?? undefined;
    const { hit, confidence, candidates } = await igdbSearchBest(canonicalTitle, { rawTitle: canonicalTitle, platformHint });

    const attemptIdsForCluster = attemptList.filter((a) => clusterGameIds.includes(a.game_id)).map((a) => a.id);

    if (confidence < RESOLVER_CONFIDENCE_GATE || !hit?.igdb_game_id) {
      await admin
        .from("game_match_attempts")
        .update({
          outcome: "rejected",
          confidence,
          reasons_json: candidates?.length ? { candidates: candidates.slice(0, 5).map((c) => ({ igdb_game_id: c.hit.igdb_game_id, title: c.hit.title, score: c.score })) } : null,
          resolved_at: now,
        })
        .in("id", attemptIdsForCluster);
      if (firstAttempt && (platformHint || firstAttempt.external_id)) {
        const { data: oneRelease } = await admin
          .from("releases")
          .select("id, platform_key")
          .eq("game_id", clusterGameIds[0])
          .limit(1)
          .maybeSingle();
        await admin.from("igdb_match_review_queue").insert({
          platform_key: platformHint ?? oneRelease?.platform_key ?? "catalog",
          external_id: firstAttempt.external_id ?? null,
          release_id: (oneRelease as { id?: string } | null)?.id ?? null,
          raw_title: canonicalTitle,
          cleaned_title: canonicalTitle,
          suggested_igdb_game_id: hit?.igdb_game_id ?? null,
          confidence,
          reason: "below_threshold",
          status: "pending",
        });
      }
      processed += clusterGameIds.length;
      continue;
    }

    const igdbId = Number(hit.igdb_game_id);
    const fullHit = await igdbFetchGameById(igdbId);
    const meta = fullHit || hit;

    const score = (id: string) => {
      const g = gameRows.find((r) => r.id === id);
      return g ? 1 : 0;
    };
    clusterGameIds.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    const winnerId = clusterGameIds[0]!;
    const loserIds = clusterGameIds.slice(1);

    const patch: Record<string, unknown> = {
      igdb_game_id: igdbId,
      match_status: "auto_matched",
      match_confidence: confidence,
      match_method: "resolve_provisional",
      matched_at: now,
      updated_at: now,
    };
    if (meta.title) patch.canonical_title = normalizeCanonicalTitle(meta.title);
    if (meta.summary != null) patch.summary = meta.summary;
    if (meta.developer != null) patch.developer = meta.developer;
    if (meta.publisher != null) patch.publisher = meta.publisher;
    if (meta.first_release_year != null) patch.first_release_year = meta.first_release_year;
    if (meta.cover_url) patch.cover_url = meta.cover_url;
    if (Array.isArray(meta.genres) && meta.genres.length) patch.genres = meta.genres;
    if (meta.category != null) patch.igdb_category = meta.category;

    const { data: existingByIgdb } = await admin.from("games").select("id").eq("igdb_game_id", igdbId).maybeSingle();
    if (existingByIgdb?.id && existingByIgdb.id !== winnerId) {
      const { error: repointErr } = await admin.from("releases").update({ game_id: existingByIgdb.id, updated_at: now }).eq("game_id", winnerId);
      if (repointErr) {
        processed += clusterGameIds.length;
        continue;
      }
      await admin.from("game_external_ids").update({ game_id: existingByIgdb.id }).eq("game_id", winnerId);
      await admin.from("games").delete().eq("id", winnerId);
      for (const lid of loserIds) {
        await admin.from("releases").update({ game_id: existingByIgdb.id, updated_at: now }).eq("game_id", lid);
        await admin.from("game_external_ids").update({ game_id: existingByIgdb.id }).eq("game_id", lid);
        await admin.from("games").delete().eq("id", lid);
      }
      merged += clusterGameIds.length;
    } else {
      const { error: updErr } = await admin.from("games").update(patch).eq("id", winnerId);
      if (updErr) {
        processed += clusterGameIds.length;
        continue;
      }
      accepted += 1;
      for (const loserId of loserIds) {
        const { error: repointErr } = await admin.from("releases").update({ game_id: winnerId, updated_at: now }).eq("game_id", loserId);
        if (!repointErr) {
          await admin.from("game_external_ids").update({ game_id: winnerId }).eq("game_id", loserId);
          await admin.from("games").delete().eq("id", loserId);
          merged += 1;
        }
      }
    }

    await admin
      .from("game_match_attempts")
      .update({
        outcome: "accepted",
        igdb_game_id_candidate: igdbId,
        confidence,
        reasons_json: candidates?.length ? { candidates: candidates.slice(0, 5).map((c) => ({ igdb_game_id: c.hit.igdb_game_id, title: c.hit.title, score: c.score })) } : null,
        resolved_at: now,
      })
      .in("id", attemptIdsForCluster);

    processed += clusterGameIds.length;
  }

  return NextResponse.json({
    ok: true,
    processed,
    accepted,
    merged,
    message: `Processed ${processed} attempts; ${accepted} accepted; ${merged} games merged.`,
  });
}
