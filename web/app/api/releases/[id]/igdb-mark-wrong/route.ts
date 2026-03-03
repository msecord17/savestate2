import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * POST /api/releases/[id]/igdb-mark-wrong
 * Mark current IGDB match as wrong: clear game.igdb_game_id and write reject rule(s).
 * Admin only.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const { id: releaseId } = await ctx.params;
    if (!releaseId) {
      return NextResponse.json({ error: "Missing release id" }, { status: 400 });
    }

    const admin = adminClient();

    const { data: release, error: relErr } = await admin
      .from("releases")
      .select("id, platform_key, game_id")
      .eq("id", releaseId)
      .maybeSingle();

    if (relErr || !release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const gameId = (release as any)?.game_id;
    if (!gameId) {
      return NextResponse.json({ error: "Release has no game" }, { status: 400 });
    }

    const { data: game, error: gameErr } = await admin
      .from("games")
      .select("id, igdb_game_id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameErr || !game?.igdb_game_id) {
      return NextResponse.json(
        { error: "Game has no IGDB match to reject" },
        { status: 400 }
      );
    }

    const igdbGameId = Number(game.igdb_game_id);
    const platformKey = String((release as any)?.platform_key ?? "").trim();

    const { data: extRows } = await admin
      .from("release_external_ids")
      .select("source, external_id, platform_key")
      .eq("release_id", releaseId);

    const now = new Date().toISOString();
    const inserted: Array<{ platform_key: string; external_id: string }> = [];

    for (const row of extRows ?? []) {
      const pk = String((row?.platform_key ?? platformKey) || "").trim();
      const extId = String(row?.external_id ?? "").trim();
      if (!pk || !extId) continue;

      try {
        await admin.from("igdb_match_rejects").insert({
          platform_key: pk,
          external_id: extId,
          igdb_game_id: igdbGameId,
          release_id: releaseId,
          created_by: gate.user?.email ?? null,
        });
      } catch {
        /* duplicate ok */
      }
      inserted.push({ platform_key: pk, external_id: extId });
    }

    if (inserted.length === 0 && platformKey) {
      const extId = releaseId;
      try {
        await admin.from("igdb_match_rejects").insert({
          platform_key: platformKey,
          external_id: releaseId,
          igdb_game_id: igdbGameId,
          release_id: releaseId,
          created_by: gate.user?.email ?? null,
        });
      } catch {
        /* duplicate ok */
      }
      inserted.push({ platform_key: platformKey, external_id: extId });
    }

    await admin
      .from("games")
      .update({
        igdb_game_id: null,
        updated_at: now,
        match_status: "rejected",
        match_method: "mark_wrong",
      })
      .eq("id", gameId);

    return NextResponse.json({
      ok: true,
      cleared: true,
      reject_rules: inserted,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
