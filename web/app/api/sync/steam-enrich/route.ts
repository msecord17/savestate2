import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_ATTEMPT_COUNT = 3;
const IGDB_CONCURRENCY = 3;

function nowIso() {
  return new Date().toISOString();
}

const NON_GAME_CONTENT_TYPES = ["app", "tool"];

function isNonGameContentType(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return NON_GAME_CONTENT_TYPES.includes(v);
}

type Candidate = {
  release_id: string;
  display_title: string;
  cover_url: string | null;
  game_id: string | null;
  playtime_minutes: number;
  last_played_at: string | null;
  game_cover_url: string | null;
  game_igdb_game_id: number | null;
  state_has_igdb: boolean;
  state_has_cover: boolean;
  attempt_count: number;
  content_type: string | null;
};

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const url = new URL(req.url);
    const limitParam = Math.min(
      Math.max(1, Number(url.searchParams.get("limit") || DEFAULT_LIMIT)),
      MAX_LIMIT
    );
    const limit = limitParam;
    const cursor = (url.searchParams.get("cursor") ?? "").trim() || null;
    const mode = (url.searchParams.get("mode") ?? "priority").toLowerCase();
    const modeValid = mode === "priority" || mode === "longtail" ? mode : "priority";
    const force = url.searchParams.get("force") === "1";

    // 1) User's portfolio release_ids
    const { data: portfolioRows, error: portErr } = await supabaseAdmin
      .from("portfolio_entries")
      .select("release_id, playtime_minutes, last_played_at")
      .eq("user_id", user.id);

    if (portErr) {
      return NextResponse.json({ error: portErr.message }, { status: 500 });
    }
    const portfolioByRelease = new Map<
      string,
      { playtime_minutes: number; last_played_at: string | null }
    >();
    for (const row of portfolioRows ?? []) {
      const rid = (row as any)?.release_id;
      if (rid) {
        portfolioByRelease.set(String(rid), {
          playtime_minutes: Number((row as any).playtime_minutes ?? 0),
          last_played_at: (row as any).last_played_at ?? null,
        });
      }
    }
    const userReleaseIds = Array.from(portfolioByRelease.keys());
    if (userReleaseIds.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: modeValid,
        processed: 0,
        enriched: 0,
        skipped: 0,
        failed: 0,
        next_cursor: null,
        has_more: false,
      });
    }

    // 2) Steam releases in user's portfolio with games (content_type for non-game skip)
    const { data: releaseRows, error: relErr } = await supabaseAdmin
      .from("releases")
      .select("id, display_title, cover_url, game_id, games ( id, cover_url, igdb_game_id, content_type )")
      .eq("platform_key", "steam")
      .in("id", userReleaseIds);

    if (relErr) {
      return NextResponse.json({ error: relErr.message }, { status: 500 });
    }

    const releaseIds = (releaseRows ?? []).map((r: any) => r?.id).filter(Boolean) as string[];
    const stateByRelease = new Map<string, { has_igdb: boolean; has_cover: boolean; attempt_count: number }>();
    if (releaseIds.length > 0) {
      const { data: stateRows } = await supabaseAdmin
        .from("release_enrichment_state")
        .select("release_id, has_igdb, has_cover, attempt_count")
        .in("release_id", releaseIds);
      for (const row of stateRows ?? []) {
        const r = row as any;
        if (r?.release_id) {
          stateByRelease.set(String(r.release_id), {
            has_igdb: r.has_igdb === true,
            has_cover: r.has_cover === true,
            attempt_count: Math.max(0, Number(r.attempt_count ?? 0)),
          });
        }
      }
    }

    let candidates: Candidate[] = [];
    for (const r of releaseRows ?? []) {
      const release = r as any;
      const releaseId = String(release?.id ?? "");
      if (!releaseId) continue;

      const state = stateByRelease.get(releaseId);
      const hasIgdb = state?.has_igdb === true;
      const hasCover = state?.has_cover === true;
      if (hasIgdb && hasCover) continue;

      const attemptCount = state?.attempt_count ?? 0;
      if (!force && attemptCount >= MAX_ATTEMPT_COUNT) continue;

      const portfolio = portfolioByRelease.get(releaseId);
      const gamesRow = Array.isArray(release.games) ? release.games[0] : release.games;
      const contentType = gamesRow?.content_type ?? (release as any).content_type ?? null;
      if (isNonGameContentType(contentType)) continue;

      candidates.push({
        release_id: releaseId,
        display_title: String(release.display_title ?? "").trim() || "Untitled",
        cover_url: release.cover_url ?? null,
        game_id: release.game_id ?? null,
        playtime_minutes: portfolio?.playtime_minutes ?? 0,
        last_played_at: portfolio?.last_played_at ?? null,
        game_cover_url: gamesRow?.cover_url ?? null,
        game_igdb_game_id:
          gamesRow?.igdb_game_id != null ? Number(gamesRow.igdb_game_id) : null,
        state_has_igdb: hasIgdb,
        state_has_cover: hasCover,
        attempt_count: attemptCount,
        content_type: contentType,
      });
    }

    // 3) Order and paginate
    if (modeValid === "priority") {
      candidates.sort((a, b) => {
        const pa = a.playtime_minutes;
        const pb = b.playtime_minutes;
        if (pb !== pa) return pb - pa;
        const la = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
        const lb = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
        return lb - la;
      });
    } else {
      candidates.sort((a, b) => (a.release_id < b.release_id ? -1 : a.release_id > b.release_id ? 1 : 0));
      if (cursor) {
        candidates = candidates.filter((c) => c.release_id > cursor);
      }
    }
    const batch = candidates.slice(0, limit);
    const hasMore = candidates.length > limit;
    const nextCursor = batch.length > 0 ? batch[batch.length - 1].release_id : null;

    let processed = 0;
    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    async function enrichOne(c: Candidate): Promise<"enriched" | "skipped" | "failed"> {
      const title = c.display_title;
      if (!title) return "skipped";

      try {
        const { game_id: resolvedGameId, igdb_game_id: resolvedIgdbId } = await upsertGameIgdbFirst(
          supabaseAdmin,
          title,
          { platform: "steam" }
        );

        const updates: { game_id?: string; cover_url?: string; updated_at: string } = {
          updated_at: nowIso(),
        };
        if (!c.game_id) {
          updates.game_id = resolvedGameId;
        }
        const { data: gameRow } = await supabaseAdmin
          .from("games")
          .select("cover_url")
          .eq("id", resolvedGameId)
          .maybeSingle();
        const gameCover = (gameRow as any)?.cover_url ?? null;
        if (!c.cover_url && gameCover) {
          updates.cover_url = gameCover;
        }

        if (Object.keys(updates).length > 1) {
          await supabaseAdmin
            .from("releases")
            .update(updates)
            .eq("id", c.release_id);
        }

        const now = nowIso();
        const hasIgdb = resolvedIgdbId != null;
        const hasCover = Boolean(c.cover_url || gameCover || c.game_cover_url);

        await supabaseAdmin
          .from("release_enrichment_state")
          .upsert(
            {
              release_id: c.release_id,
              source: "steam",
              has_igdb: hasIgdb,
              has_cover: hasCover,
              updated_at: now,
              last_attempt_at: now,
            },
            { onConflict: "release_id" }
          );
        return "enriched";
      } catch (e: any) {
        const errMsg = e?.message ?? String(e);
        const now = nowIso();
        const attemptCount = c.attempt_count + 1;
        await supabaseAdmin
          .from("release_enrichment_state")
          .update({
            attempt_count: attemptCount,
            last_error: errMsg,
            last_attempt_at: now,
            updated_at: now,
          })
          .eq("release_id", c.release_id);
        return "failed";
      }
    }

    for (let i = 0; i < batch.length; i += IGDB_CONCURRENCY) {
      const chunk = batch.slice(i, i + IGDB_CONCURRENCY);
      const results = await Promise.all(chunk.map((c) => enrichOne(c)));
      for (const r of results) {
        processed += 1;
        if (r === "enriched") enriched += 1;
        else if (r === "skipped") skipped += 1;
        else failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: modeValid,
      processed,
      enriched,
      skipped,
      failed,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Enrichment failed" },
      { status: 500 }
    );
  }
}
