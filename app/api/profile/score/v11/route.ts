import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../../lib/supabase/route-client";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function logScaled(minutes: number) {
  // gentle log curve: 0..∞ minutes -> 0..~1000
  const h = Math.max(0, minutes) / 60;
  return Math.round(180 * Math.log1p(h)); // ~ 0.. 800ish for big libraries
}

const STATUS_POINTS: Record<string, number> = {
  completed: 45,
  playing: 18,
  owned: 10,
  back_burner: 8,
  wishlist: 3,
  dropped: 0,
};

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  // 1) Portfolio (Steam playtime + completion statuses)
  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select("release_id, status, playtime_minutes")
    .eq("user_id", user.id);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const rows = Array.isArray(entries) ? entries : [];

  let completionPoints = 0;
  let completedCount = 0;
  let totalGames = rows.length;

  let totalPlaytimeMinutes = 0;

  for (const r of rows) {
    const s = String(r.status || "owned");
    completionPoints += STATUS_POINTS[s] ?? 6;
    if (s === "completed") completedCount += 1;
    totalPlaytimeMinutes += Number(r.playtime_minutes || 0);
  }

  // 2) RetroAchievements (weighted)
  const { data: raRows, error: raErr } = await supabase
    .from("ra_game_progress")
    .select("ra_game_id, points_total, points_earned, points_earned_hardcore, achievements_total, achievements_earned, achievements_earned_hardcore, percent_complete")
    .eq("user_id", user.id);

  if (raErr) return NextResponse.json({ error: raErr.message }, { status: 500 });

  const ra = Array.isArray(raRows) ? raRows : [];

  let raPoints = 0;
  let raGamesTouched = 0;
  let raHardcoreBoost = 0;

  for (const g of ra) {
    const total = Number(g.points_total || 0);
    const earned = Number(g.points_earned || 0);
    const earnedHC = Number(g.points_earned_hardcore || 0);

    if (total > 0 || earned > 0) raGamesTouched += 1;

    // Weighted: earned points matter, hardcore matters more, completion % adds seasoning
    const pct = clamp(Number(g.percent_complete || 0), 0, 100) / 100;

    const base = earned;
    const hardcore = Math.max(0, earnedHC - earned); // only extra hardcore delta
    raHardcoreBoost += hardcore;

    // add: base points + 0.65 * hardcore delta + small completion multiplier
    const weighted = base + 0.65 * hardcore;
    const withPct = weighted * (0.85 + 0.3 * pct); // 0.85x..1.15x

    raPoints += Math.round(withPct);
  }

  // 3) Era bonuses (magic onboarding)
  const { data: eraRow } = await supabase
    .from("user_era_history")
    .select("era_bonus_points, confidence_bonus, eras")
    .eq("user_id", user.id)
    .maybeSingle();

  const eraBonus = Number(eraRow?.era_bonus_points || 0);
  const eraConfidenceBonus = Number(eraRow?.confidence_bonus || 0);

  // 4) Compute component scores
  const steamComponent = logScaled(totalPlaytimeMinutes);
  const completionComponent = completionPoints;

  // RA points can be huge; compress slightly so it doesn’t dominate
  const raComponent = Math.round(140 * Math.log1p(Math.max(0, raPoints) / 120));

  // Total
  const score = steamComponent + completionComponent + raComponent + eraBonus;

  // 5) Confidence
  // Core signal: do we have playtime? do we have RA? do we have era history?
  let confidence = 35; // baseline
  if (totalGames >= 20) confidence += 10;
  if (totalGames >= 60) confidence += 10;

  if (totalPlaytimeMinutes >= 60 * 10) confidence += 10; // 10h
  if (totalPlaytimeMinutes >= 60 * 50) confidence += 8;  // 50h
  if (raGamesTouched >= 10) confidence += 8;
  if (raGamesTouched >= 30) confidence += 7;

  if ((eraRow?.eras && Array.isArray(eraRow.eras) && eraRow.eras.length > 0)) confidence += 10;

  confidence += eraConfidenceBonus;
  confidence = clamp(confidence, 0, 100);

  const breakdown = {
    score_total: score,
    confidence,
    components: {
      steam_playtime: steamComponent,
      completion_status: completionComponent,
      retroachievements: raComponent,
      era_bonus: eraBonus,
    },
    stats: {
      total_games: totalGames,
      completed_games: completedCount,
      steam_playtime_minutes: totalPlaytimeMinutes,
      ra_games_touched: raGamesTouched,
      ra_points_raw: raPoints,
      ra_hardcore_delta_raw: raHardcoreBoost,
    },
    explain: [
      {
        label: "Steam playtime",
        points: steamComponent,
        detail: `${Math.round(totalPlaytimeMinutes / 60)}h total playtime (log-scaled so 500h doesn’t delete everyone else).`,
      },
      {
        label: "Completion status",
        points: completionComponent,
        detail: `${completedCount} completed • ${totalGames} total • statuses contribute per game.`,
      },
      {
        label: "RetroAchievements",
        points: raComponent,
        detail: `${raGamesTouched} RA games touched • Hardcore weighted extra • completion % adds a small multiplier.`,
      },
      {
        label: "Era history bonus",
        points: eraBonus,
        detail: (eraRow?.eras && Array.isArray(eraRow.eras) && eraRow.eras.length > 0)
          ? `You claimed ${eraRow.eras.length} eras — this adds “history points” + confidence.`
          : `Not filled out yet — take the 90s quiz to unlock this.`,
      },
    ],
  };

  // Optional: cache to profiles for fast profile rendering/sharing
  await supabase
    .from("profiles")
    .update({
      gamer_score_v11: score,
      gamer_score_v11_confidence: confidence,
      gamer_score_v11_breakdown: breakdown,
      gamer_score_v11_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  return NextResponse.json(breakdown);
}
