import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { recordSyncEnd, recordSyncStart } from "@/lib/sync/record-run";
import { recomputeArchetypesForUser } from "@/lib/insights/recompute";

type RARecentGame = {
  GameID?: number;
  gameId?: number;

  NumPossibleAchievements?: number;
  numPossibleAchievements?: number;

  NumAchieved?: number;
  numAchieved?: number;

  NumAchievedHardcore?: number;
  numAchievedHardcore?: number;

  PossibleScore?: number;
  possibleScore?: number;

  ScoreAchieved?: number;
  scoreAchieved?: number;

  ScoreAchievedHardcore?: number;
  scoreAchievedHardcore?: number;
};

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pick<T = any>(obj: any, a: string, b: string): T | undefined {
  return (obj?.[a] ?? obj?.[b]) as T | undefined;
}

async function fetchRAJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`RA returned non-JSON. First 120 chars: ${text.slice(0, 120)}`);
  }

  if (!res.ok) throw new Error(`RA request failed (${res.status})`);
  return data;
}

// Pull up to N recent games (paged)
async function getRecentGames(opts: { username: string; apiKey: string; max: number }) {
  const { username, apiKey, max } = opts;

  const out: RARecentGame[] = [];
  let offset = 0;

  while (out.length < max) {
    const count = Math.min(50, max - out.length);

    const url =
      `https://retroachievements.org/API/API_GetUserRecentlyPlayedGames.php` +
      `?u=${encodeURIComponent(username)}` +
      `&y=${encodeURIComponent(apiKey)}` +
      `&c=${encodeURIComponent(String(count))}` +
      `&o=${encodeURIComponent(String(offset))}`;

    const page = await fetchRAJson(url);
    const arr: RARecentGame[] = Array.isArray(page) ? page : [];

    if (arr.length === 0) break;

    out.push(...arr);
    offset += arr.length;

    if (arr.length < count) break;
  }

  return out;
}

export async function POST() {
  let runId: string | null = null;
  const start = Date.now();
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;
    runId = await recordSyncStart(supabaseServer, user.id, "ra");
    const endRun = async (
      status: "ok" | "error",
      opts?: { errorMessage?: string; resultJson?: unknown }
    ) => {
      await recordSyncEnd(supabaseServer, runId, status, {
        durationMs: Date.now() - start,
        errorMessage: opts?.errorMessage ?? undefined,
        resultJson: opts?.resultJson ?? undefined,
      });
    };

    // Load RA creds + default hardware from profiles
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("ra_username, ra_api_key, default_ra_hardware_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) {
      await endRun("error", { errorMessage: pErr.message, resultJson: { error: pErr.message, detail: pErr.message } });
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const raUsername = String(profile?.ra_username ?? "").trim();
    const raApiKey = String(profile?.ra_api_key ?? "").trim();

    if (!raUsername || !raApiKey) {
      const errMsg = "RetroAchievements not connected (missing ra_username / ra_api_key in profiles)";
      await endRun("error", { errorMessage: errMsg, resultJson: { error: errMsg, detail: errMsg } });
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    const recent = await getRecentGames({ username: raUsername, apiKey: raApiKey, max: 200 });

    const nowIso = new Date().toISOString();

    if (recent.length === 0) {
      await supabase
        .from("profiles")
        .update({
          ra_last_synced_at: nowIso,
          ra_last_sync_count: 0,
          updated_at: nowIso,
        })
        .eq("user_id", user.id);

      const payload = {
        ok: true,
        imported: 0,
        note: "No RA games returned (new account / API mismatch / privacy).",
      };
      await endRun("ok", { resultJson: payload });
      return NextResponse.json(payload);
    }

    // Normalize for your score route fields
    const rows = recent
      .map((g) => {
        const ra_game_id = toNum(pick(g, "GameID", "gameId"));

        const achievements_total = toNum(pick(g, "NumPossibleAchievements", "numPossibleAchievements"));
        const achievements_earned = toNum(pick(g, "NumAchieved", "numAchieved"));
        const achievements_earned_hardcore = toNum(pick(g, "NumAchievedHardcore", "numAchievedHardcore"));

        const points_total = toNum(pick(g, "PossibleScore", "possibleScore"));
        const points_earned = toNum(pick(g, "ScoreAchieved", "scoreAchieved"));
        const points_earned_hardcore = toNum(pick(g, "ScoreAchievedHardcore", "scoreAchievedHardcore"));

        const pct =
          achievements_total > 0 ? (achievements_earned / achievements_total) * 100 : 0;

        return {
          user_id: user.id,
          ra_game_id,

          points_total,
          points_earned,
          points_earned_hardcore,

          achievements_total,
          achievements_earned,
          achievements_earned_hardcore,

          percent_complete: clamp(Math.round(pct * 10) / 10, 0, 100),

          updated_at: nowIso,
        };
      })
      .filter((r) => r.ra_game_id > 0);

    // Upsert (requires unique on user_id, ra_game_id)
    const { error: upErr } = await supabase
      .from("ra_game_progress")
      .upsert(rows, { onConflict: "user_id,ra_game_id" });

    if (upErr) {
      await endRun("error", { errorMessage: upErr.message, resultJson: { error: upErr.message, detail: upErr.message } });
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // Auto-default played-on for each mapped release (idempotent; skips if manual/RA primary exists)
    const defaultHardwareId = profile?.default_ra_hardware_id ?? null;
    if (defaultHardwareId) {
      const raGameIds = [...new Set(rows.map((r) => String(r.ra_game_id)))];
      const { data: mappings } = await supabase
        .from("release_external_ids")
        .select("release_id, external_id")
        .eq("source", "ra")
        .in("external_id", raGameIds);

      for (const m of mappings ?? []) {
        const { error: rpcErr } = await supabase.rpc("ensure_played_on_primary", {
          p_user_id: user.id,
          p_release_id: m.release_id,
          p_hardware_id: defaultHardwareId,
          p_source: "ra_default",
        });
        if (rpcErr) console.warn(`ensure_played_on_primary(${m.release_id}):`, rpcErr.message);
      }
    }

    await supabase
      .from("profiles")
      .update({
        ra_last_synced_at: nowIso,
        ra_last_sync_count: rows.length,
        updated_at: nowIso,
      })
      .eq("user_id", user.id);

    try {
      await recomputeArchetypesForUser(supabase, user.id);
    } catch {
      // Non-fatal: sync succeeded; archetype snapshot will refresh on next GET or recompute
    }

    const payload = {
      ok: true,
      imported: rows.length,
      username: raUsername,
    };
    await endRun("ok", { resultJson: payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    const errMsg = e?.message ?? "RA sync failed";
    await recordSyncEnd(supabaseServer, runId, "error", {
      durationMs: Date.now() - start,
      errorMessage: errMsg,
      resultJson: { error: errMsg, detail: e?.stack ?? errMsg },
    });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
