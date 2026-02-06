import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

type ScoreBreakdown = {
  total_score: number;

  total_playtime_hours: number;
  total_playtime_points: number;

  total_games_owned: number;
  total_games_owned_points: number;

  completed_games: number;
  completed_points: number;

  unique_platforms: number;
  unique_platform_points: number;

  // Placeholder for later RA mastery integration
  ra_mastered_games: number;
  ra_mastered_points: number;

  weights: {
    playtime_per_hour: number;
    owned_per_game: number;
    completed_per_game: number;
    platform_per_unique: number;
    ra_mastered_per_game: number;
  };
};

export async function GET() {
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const user = userRes.user;

    // Pull portfolio entries + platform_key via releases join
    const { data, error } = await supabase
      .from("portfolio_entries")
      .select(
        `
          release_id,
          status,
          playtime_minutes,
          releases (
            platform_key
          )
        `
      )
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];

    // ---- Weights (tune later) ----
    const WEIGHTS = {
      playtime_per_hour: 1,       // 1 point per hour
      owned_per_game: 5,          // 5 points per game in library
      completed_per_game: 50,     // 50 points per completed game
      platform_per_unique: 25,    // 25 points per unique platform
      ra_mastered_per_game: 100,  // 100 points per mastered game (later)
    };

    // ---- Metrics ----
    const totalPlaytimeMinutes = rows.reduce((sum: number, r: any) => {
      return sum + Number(r?.playtime_minutes ?? 0);
    }, 0);

    const totalPlaytimeHours = Math.round((totalPlaytimeMinutes / 60) * 10) / 10;

    // “Owned games” = count of portfolio entries (unique releases)
    const uniqueReleaseIds = new Set<string>();
    for (const r of rows as any[]) {
      if (r?.release_id) uniqueReleaseIds.add(String(r.release_id));
    }
    const totalGamesOwned = uniqueReleaseIds.size;

    const completedGames = rows.filter((r: any) => r?.status === "completed").length;

    const uniquePlatforms = new Set<string>();
    for (const r of rows as any[]) {
      const k = r?.releases?.platform_key;
      if (k) uniquePlatforms.add(String(k));
    }
    const uniquePlatformCount = uniquePlatforms.size;

    const { data: raRows, error: raErr } = await supabase
      .from("ra_mastery")
      .select("mastered")
      .eq("user_id", user.id)
      .eq("mastered", true);

    if (raErr) {
      return NextResponse.json({ error: raErr.message }, { status: 500 });
    }

    const raMasteredGames = Array.isArray(raRows) ? raRows.length : 0;

    // ---- Points ----
    const playtimePoints = Math.round(totalPlaytimeHours * WEIGHTS.playtime_per_hour);
    const ownedPoints = totalGamesOwned * WEIGHTS.owned_per_game;
    const completedPoints = completedGames * WEIGHTS.completed_per_game;
    const platformPoints = uniquePlatformCount * WEIGHTS.platform_per_unique;
    const raMasteredPoints = raMasteredGames * WEIGHTS.ra_mastered_per_game;

    const totalScore =
      playtimePoints + ownedPoints + completedPoints + platformPoints + raMasteredPoints;

    const breakdown: ScoreBreakdown = {
      total_score: totalScore,

      total_playtime_hours: totalPlaytimeHours,
      total_playtime_points: playtimePoints,

      total_games_owned: totalGamesOwned,
      total_games_owned_points: ownedPoints,

      completed_games: completedGames,
      completed_points: completedPoints,

      unique_platforms: uniquePlatformCount,
      unique_platform_points: platformPoints,

      ra_mastered_games: raMasteredGames,
      ra_mastered_points: raMasteredPoints,

      weights: WEIGHTS,
    };

    return NextResponse.json({ ok: true, breakdown });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute score" }, { status: 500 });
  }
}
