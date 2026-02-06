import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";
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
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Load RA creds from profiles
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("ra_username, ra_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const raUsername = String(profile?.ra_username ?? "").trim();
    const raApiKey = String(profile?.ra_api_key ?? "").trim();

    if (!raUsername || !raApiKey) {
      return NextResponse.json(
        { error: "RetroAchievements not connected (missing ra_username / ra_api_key in profiles)" },
        { status: 400 }
      );
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

      return NextResponse.json({
        ok: true,
        imported: 0,
        note: "No RA games returned (new account / API mismatch / privacy).",
      });
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
      return NextResponse.json({ error: upErr.message }, { status: 500 });
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

    return NextResponse.json({
      ok: true,
      imported: rows.length,
      username: raUsername,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "RA sync failed" }, { status: 500 });
  }
}
