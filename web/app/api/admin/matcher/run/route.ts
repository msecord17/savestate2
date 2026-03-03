/**
 * POST /api/admin/matcher/run?limit=50
 *
 * Matcher worker: pull unlocked rows from game_match_queue, run deterministic IGDB matching,
 * write game_master_mappings, attach releases to matched game, then remove from queue or mark attempts/last_error.
 */

import { NextResponse } from "next/server";
import {
  igdbSearchBest,
  igdbFetchGameById,
  normalizeCanonicalTitle,
} from "@/lib/igdb/server";
import { upsertGameExternalId, gameExternalIdRow } from "@/lib/game-external-ids";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

const MATCHER_AUTO_APPROVED_THRESHOLD = 0.92;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/** Sanity: do not auto-confirm if best hit title is empty or year is in the future. */
function passesSanityCheck(hit: { title?: string | null; first_release_year?: number | null } | null): boolean {
  if (!hit?.title || String(hit.title).trim().length === 0) return false;
  const year = hit.first_release_year != null ? Number(hit.first_release_year) : null;
  if (year != null && (year < 1970 || year > new Date().getFullYear() + 1)) return false;
  return true;
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const admin = adminClient();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const now = new Date().toISOString();
  const lockThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();

  // Pull unlocked rows (or rows locked too long ago), ordered by priority desc
  const { data: rows, error: fetchErr } = await admin
    .from("game_match_queue")
    .select("id, source, external_id, priority, attempts")
    .or(`locked_at.is.null,locked_at.lt.${lockThreshold}`)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const queueRows = (rows ?? []) as Array<{
    id: string;
    source: string;
    external_id: string;
    priority: number;
    attempts: number;
  }>;

  if (queueRows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      auto_approved: 0,
      needs_review: 0,
      errors: 0,
      message: "No unlocked rows in game_match_queue.",
    });
  }

  // Lock selected rows
  await admin
    .from("game_match_queue")
    .update({ locked_at: now, updated_at: now })
    .in(
      "id",
      queueRows.map((r) => r.id)
    );

  let processed = 0;
  let autoApproved = 0;
  let needsReview = 0;
  let errors = 0;
  const processedIds: string[] = [];
  const errorUpdates: Array<{ id: string; last_error: string }> = [];

  for (const row of queueRows) {
    const { id: queueId, source, external_id } = row;

    try {
      const { data: refRow } = await admin
        .from("game_external_refs")
        .select("raw_title, normalized_title, platform_key")
        .eq("source", source)
        .eq("external_id", String(external_id))
        .maybeSingle();

      const rawTitle = (refRow?.raw_title ?? refRow?.normalized_title ?? String(external_id)).trim();
      if (!rawTitle) {
        errorUpdates.push({ id: queueId, last_error: "Missing title in game_external_refs" });
        errors += 1;
        continue;
      }

      const platformHint = refRow?.platform_key ?? source;
      const { hit, confidence, candidates } = await igdbSearchBest(rawTitle, {
        rawTitle: rawTitle,
        useGameTitleAlias: true,
        platformHint,
      }, admin);

      const method = "fuzzy";
      const matched_name = hit?.title ?? null;
      const matched_year = hit?.first_release_year ?? null;
      const igdb_game_id = hit?.igdb_game_id != null ? Number(hit.igdb_game_id) : null;
      const autoConfirm =
        confidence >= MATCHER_AUTO_APPROVED_THRESHOLD &&
        igdb_game_id != null &&
        passesSanityCheck(hit ?? null);
      const status = autoConfirm ? "confirmed" : "needs_review";

      const meta = {
        raw_title: rawTitle,
        confidence,
        ...(candidates?.length > 0 && {
          candidates: candidates.slice(0, 10).map((c) => ({
            igdb_game_id: c.hit.igdb_game_id,
            title: c.hit.title,
            score: c.score,
            cover_url: c.hit.cover_url ?? null,
            first_release_year: c.hit.first_release_year ?? null,
          })),
        }),
      };

      await admin.from("game_master_mappings").upsert(
        {
          source,
          external_id: String(external_id),
          igdb_game_id,
          status,
          confidence,
          method,
          matched_name,
          matched_year,
          meta,
          ...(igdb_game_id != null && { matched_at: now }),
          updated_at: now,
          ...(autoConfirm && { confirmed_at: now }),
        },
        { onConflict: "source,external_id" }
      );

      if (status === "confirmed") autoApproved += 1;
      else needsReview += 1;

      let resolvedGameId: string | null = null;
      if (igdb_game_id != null) {
        const { data: extRow } = await admin
          .from("game_external_ids")
          .select("game_id")
          .eq("source", source)
          .eq("external_id", String(external_id))
          .maybeSingle();
        const placeholderGameId = extRow?.game_id ? String(extRow.game_id) : null;

        const fullHit = await igdbFetchGameById(igdb_game_id);
        const metaHit = fullHit ?? hit!;
        const canonicalTitle = metaHit?.title
          ? normalizeCanonicalTitle(String(metaHit.title).trim())
          : rawTitle;

        const { data: existingByIgdb } = await admin
          .from("games")
          .select("id")
          .eq("igdb_game_id", igdb_game_id)
          .maybeSingle();

        if (existingByIgdb?.id && placeholderGameId && existingByIgdb.id !== placeholderGameId) {
          resolvedGameId = existingByIgdb.id;
          await admin
            .from("releases")
            .update({ game_id: existingByIgdb.id, updated_at: now })
            .eq("game_id", placeholderGameId);
          await admin
            .from("game_external_ids")
            .update({ game_id: existingByIgdb.id })
            .eq("source", source)
            .eq("external_id", String(external_id));
          await admin.from("games").delete().eq("id", placeholderGameId);
          await admin
            .from("games")
            .update({
              canonical_title: canonicalTitle,
              summary: metaHit?.summary ?? null,
              developer: metaHit?.developer ?? null,
              publisher: metaHit?.publisher ?? null,
              first_release_year: metaHit?.first_release_year ?? null,
              cover_url: metaHit?.cover_url ?? null,
              igdb_category: metaHit?.category ?? null,
              genres: Array.isArray(metaHit?.genres) ? metaHit.genres : null,
              updated_at: now,
            })
            .eq("id", existingByIgdb.id);
        } else if (placeholderGameId) {
          resolvedGameId = placeholderGameId;
          await admin
            .from("games")
            .update({
              igdb_game_id,
              canonical_title: canonicalTitle,
              summary: metaHit?.summary ?? null,
              developer: metaHit?.developer ?? null,
              publisher: metaHit?.publisher ?? null,
              first_release_year: metaHit?.first_release_year ?? null,
              cover_url: metaHit?.cover_url ?? null,
              igdb_category: metaHit?.category ?? null,
              genres: Array.isArray(metaHit?.genres) ? metaHit.genres : null,
              match_status: "auto_matched",
              match_confidence: confidence,
              match_method: "matcher",
              matched_at: now,
              updated_at: now,
            })
            .eq("id", placeholderGameId);
          await upsertGameExternalId(
            admin,
            gameExternalIdRow(placeholderGameId, source, String(external_id), {
              match_source: "matcher",
              confidence,
            })
          );
        } else {
          const { data: inserted } = await admin
            .from("games")
            .insert({
              canonical_title: canonicalTitle,
              igdb_game_id,
              summary: metaHit?.summary ?? null,
              developer: metaHit?.developer ?? null,
              publisher: metaHit?.publisher ?? null,
              first_release_year: metaHit?.first_release_year ?? null,
              cover_url: metaHit?.cover_url ?? null,
              igdb_category: metaHit?.category ?? null,
              match_status: "auto_matched",
              match_confidence: confidence,
              match_method: "matcher",
              matched_at: now,
              updated_at: now,
            })
            .select("id")
            .single();
          if (inserted?.id) {
            resolvedGameId = inserted.id;
            await upsertGameExternalId(
              admin,
              gameExternalIdRow(inserted.id, source, String(external_id), {
                match_source: "matcher",
                confidence,
              })
            );
          }
        }
        if (resolvedGameId && autoConfirm) {
          await admin
            .from("game_master_mappings")
            .update({
              canonical_game_id: resolvedGameId,
              updated_at: now,
            })
            .eq("source", source)
            .eq("external_id", String(external_id));
        }

        const hitCategory = metaHit?.category ?? hit?.category ?? null;
        const isNonGame = hitCategory != null && Number(hitCategory) !== 0;
        if (confidence < 0.8) {
          await admin.from("igdb_match_issues").insert({
            source,
            external_id: String(external_id),
            game_id: resolvedGameId,
            igdb_game_id,
            confidence,
            issue_type: "low_confidence",
            evidence: meta,
          });
        }
        if (isNonGame) {
          await admin.from("igdb_match_issues").insert({
            source,
            external_id: String(external_id),
            game_id: resolvedGameId,
            igdb_game_id,
            confidence,
            issue_type: "non_game_suspected",
            evidence: { ...meta, igdb_category: hitCategory },
          });
        }
      }

      processed += 1;
      processedIds.push(queueId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errorUpdates.push({ id: queueId, last_error: msg });
      errors += 1;
    }
  }

  if (processedIds.length > 0) {
    await admin.from("game_match_queue").delete().in("id", processedIds);
  }

  for (const { id, last_error } of errorUpdates) {
    const r = queueRows.find((x) => x.id === id);
    await admin
      .from("game_match_queue")
      .update({
        attempts: (r?.attempts ?? 0) + 1,
        last_error,
        locked_at: null,
        updated_at: now,
      })
      .eq("id", id);
  }

  return NextResponse.json({
    ok: true,
    processed,
    auto_approved: autoApproved,
    needs_review: needsReview,
    errors,
    message: `Processed ${processed} from queue; ${autoApproved} auto_approved, ${needsReview} needs_review, ${errors} errors.`,
  });
}
