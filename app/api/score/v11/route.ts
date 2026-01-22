import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function logScaled(minutes: number, weight = 180) {
  const h = Math.max(0, minutes) / 60;
  return Math.round(weight * Math.log1p(h));
}

const STATUS_POINTS: Record<string, number> = {
  completed: 45,
  playing: 18,
  owned: 10,
  back_burner: 8,
  wishlist: 3,
  dropped: 0,
};

function daysBetween(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.floor(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

// Xbox “playtime estimate” per title.
// Philosophy: we don’t pretend this is real telemetry — it’s a proxy signal.
// Inputs: achievement % + gamerscore % + recency => minutes estimate.
// Output is capped so one title can’t explode the total.
function estimateXboxMinutesForTitle(t: {
  achievements_earned?: number | null;
  achievements_total?: number | null;
  gamerscore_earned?: number | null;
  gamerscore_total?: number | null;
  last_played_at?: string | null;
}) {
  const ae = Number(t.achievements_earned || 0);
  const at = Number(t.achievements_total || 0);
  const ge = Number(t.gamerscore_earned || 0);
  const gt = Number(t.gamerscore_total || 0);

  const achPct = at > 0 ? clamp(ae / at, 0, 1) : 0;
  const gsPct = gt > 0 ? clamp(ge / gt, 0, 1) : 0;

  // Base minutes: everybody gets *something* if they touched the title.
  // Then we scale up with completion-ish signals.
  let minutes =
    25 + // “you launched it”
    220 * achPct + // achievement progress tends to correlate with time
    260 * gsPct;   // gamerscore progress tends to correlate with time

  // Recency bump: recent play implies more “active time”
  const lp = t.last_played_at ? new Date(t.last_played_at).toISOString() : null;
  if (lp) {
    const d = daysBetween(lp, new Date().toISOString());
    if (d <= 7) minutes *= 1.55;
    else if (d <= 30) minutes *= 1.25;
    else if (d <= 120) minutes *= 1.05;
  }

  // If we have *any* earned gamerscore but totals are unknown, give a small nudge
  if (ge > 0 && gt === 0) minutes += 40;

  // Hard caps (per-title)
  minutes = clamp(minutes, 0, 2200); // max ~36h per title estimate
  return Math.round(minutes);
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  // 1) Portfolio (Steam playtime + completion statuses)
  // IMPORTANT: Only count playtime_minutes as Steam playtime when platform_key = 'steam'
  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select("release_id, status, playtime_minutes, releases:release_id(platform_key)")
    .eq("user_id", user.id);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const rows = Array.isArray(entries) ? entries : [];

  let completionPoints = 0;
  let completedCount = 0;
  const totalGames = rows.length;

  let totalSteamPlaytimeMinutes = 0;

  for (const r of rows as any[]) {
    const s = String(r.status || "owned");
    completionPoints += STATUS_POINTS[s] ?? 6;
    if (s === "completed") completedCount += 1;
    
    // Only count playtime_minutes as Steam if the release is a Steam release
    const platformKey = r?.releases?.platform_key;
    if (String(platformKey ?? "").toLowerCase() === "steam") {
      totalSteamPlaytimeMinutes += Number(r.playtime_minutes || 0);
    }
  }

  // 2) RetroAchievements (weighted)
  const { data: raRows, error: raErr } = await supabase
    .from("ra_game_progress")
    .select(
      "ra_game_id, points_total, points_earned, points_earned_hardcore, achievements_total, achievements_earned, achievements_earned_hardcore, percent_complete"
    )
    .eq("user_id", user.id);

  if (raErr) return NextResponse.json({ error: raErr.message }, { status: 500 });

  const ra = Array.isArray(raRows) ? raRows : [];

  let raPoints = 0;
  let raGamesTouched = 0;
  let raHardcoreBoost = 0;

  for (const g of ra as any[]) {
    const total = Number(g.points_total || 0);
    const earned = Number(g.points_earned || 0);
    const earnedHC = Number(g.points_earned_hardcore || 0);

    if (total > 0 || earned > 0) raGamesTouched += 1;

    const pct = clamp(Number(g.percent_complete || 0), 0, 100) / 100;

    const base = earned;
    const hardcore = Math.max(0, earnedHC - earned);
    raHardcoreBoost += hardcore;

    const weighted = base + 0.65 * hardcore;
    const withPct = weighted * (0.85 + 0.3 * pct);

    raPoints += Math.round(withPct);
  }

  // 2.5) PlayStation (PSN) signal
  const { data: psnRows, error: psnErr } = await supabase
    .from("psn_title_progress")
    .select("playtime_minutes, trophy_progress, trophies_earned, trophies_total")
    .eq("user_id", user.id);

  if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });

  const psn = Array.isArray(psnRows) ? psnRows : [];

  let psnPlaytimeMinutes = 0;
  const psnTitles = psn.length;

  let psnTrophySignal = 0;
  for (const t of psn as any[]) {
    psnPlaytimeMinutes += Number(t.playtime_minutes || 0);

    const pct =
      t.trophy_progress != null ? clamp(Number(t.trophy_progress), 0, 100) / 100 : null;

    if (pct != null) psnTrophySignal += Math.round(40 * pct);
  }

  // 2.6) Xbox (achievement + gamerscore + estimated playtime)
  const { data: xboxRows, error: xbErr } = await supabase
    .from("xbox_title_progress")
    .select("achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_played_at")
    .eq("user_id", user.id);

  if (xbErr) return NextResponse.json({ error: xbErr.message }, { status: 500 });

  const xb = Array.isArray(xboxRows) ? xboxRows : [];
  const xboxTitles = xb.length;

  let xboxAchievementsEarned = 0;
  let xboxAchievementsTotal = 0;
  let xboxGamerscoreEarned = 0;
  let xboxGamerscoreTotal = 0;

  let xboxPlaytimeMinutesEstimated = 0;

  for (const t of xb as any[]) {
    xboxAchievementsEarned += Number(t.achievements_earned || 0);
    xboxAchievementsTotal += Number(t.achievements_total || 0);
    xboxGamerscoreEarned += Number(t.gamerscore_earned || 0);
    xboxGamerscoreTotal += Number(t.gamerscore_total || 0);

    xboxPlaytimeMinutesEstimated += estimateXboxMinutesForTitle(t);
  }

  const achPct = xboxAchievementsTotal > 0 ? xboxAchievementsEarned / xboxAchievementsTotal : 0;
  const gsPct = xboxGamerscoreTotal > 0 ? xboxGamerscoreEarned / xboxGamerscoreTotal : 0;

  const xboxAchievementSignalRaw = Math.round(250 * (0.6 * achPct + 0.4 * gsPct));
  const xboxAchievementComponent = Math.round(120 * Math.log1p(Math.max(0, xboxAchievementSignalRaw) / 40));

  // Estimated “playtime” component: lighter than Steam/PSN so it can’t dominate
  const xboxPlaytimeComponent = logScaled(xboxPlaytimeMinutesEstimated, 120);

  // 4) Era bonuses
  const { data: eraRow } = await supabase
    .from("user_era_history")
    .select("era_bonus_points, confidence_bonus, eras")
    .eq("user_id", user.id)
    .maybeSingle();

  const eraBonus = Number((eraRow as any)?.era_bonus_points || 0);
  const eraConfidenceBonus = Number((eraRow as any)?.confidence_bonus || 0);

  // 5) Compute component scores
  const steamComponent = logScaled(totalSteamPlaytimeMinutes, 180);
  const completionComponent = completionPoints;

  const raComponent = Math.round(140 * Math.log1p(Math.max(0, raPoints) / 120));

  const psnPlaytimeComponent = logScaled(psnPlaytimeMinutes, 180);
  const psnTrophiesComponent = Math.round(90 * Math.log1p(Math.max(0, psnTrophySignal) / 40));

  const score =
    steamComponent +
    completionComponent +
    raComponent +
    psnPlaytimeComponent +
    psnTrophiesComponent +
    xboxAchievementComponent +
    xboxPlaytimeComponent +
    eraBonus;

  // 6) Confidence
  let confidence = 35;

  if (totalGames >= 20) confidence += 10;
  if (totalGames >= 60) confidence += 10;

  if (totalSteamPlaytimeMinutes >= 60 * 10) confidence += 10;
  if (totalSteamPlaytimeMinutes >= 60 * 50) confidence += 8;

  if (raGamesTouched >= 10) confidence += 8;
  if (raGamesTouched >= 30) confidence += 7;

  if (psnTitles >= 10) confidence += 6;
  if (psnTitles >= 30) confidence += 6;
  if (psnPlaytimeMinutes >= 60 * 10) confidence += 4;

  if (xboxTitles >= 10) confidence += 6;
  if (xboxTitles >= 30) confidence += 6;
  if (xboxPlaytimeMinutesEstimated >= 60 * 10) confidence += 4;

  if ((eraRow as any)?.eras && Array.isArray((eraRow as any).eras) && (eraRow as any).eras.length > 0) {
    confidence += 10;
  }

  confidence += eraConfidenceBonus;
  confidence = clamp(confidence, 0, 100);

  const xboxAchDetailParts: string[] = [];
  xboxAchDetailParts.push(`${xboxTitles} Xbox titles`);

  if (xboxAchievementsTotal > 0) {
    xboxAchDetailParts.push(`${xboxAchievementsEarned}/${xboxAchievementsTotal} achievements`);
  } else if (xboxAchievementsEarned > 0) {
    xboxAchDetailParts.push(`${xboxAchievementsEarned} achievements (total unknown)`);
  }

  if (xboxGamerscoreTotal > 0) {
    xboxAchDetailParts.push(`${xboxGamerscoreEarned}/${xboxGamerscoreTotal} gamerscore`);
  } else if (xboxGamerscoreEarned > 0) {
    xboxAchDetailParts.push(`${xboxGamerscoreEarned} gamerscore (total unknown)`);
  }

  const breakdown = {
    score_total: score,
    confidence,
    components: {
      steam_playtime: steamComponent,
      completion_status: completionComponent,
      retroachievements: raComponent,
      psn_playtime: psnPlaytimeComponent,
      psn_trophies: psnTrophiesComponent,
      xbox_achievements: xboxAchievementComponent,
      xbox_playtime: xboxPlaytimeComponent,
      era_bonus: eraBonus,
    },
    stats: {
      total_games: totalGames,
      completed_games: completedCount,
      steam_playtime_minutes: totalSteamPlaytimeMinutes,
      ra_games_touched: raGamesTouched,
      ra_points_raw: raPoints,
      ra_hardcore_delta_raw: raHardcoreBoost,
      psn_titles: psnTitles,
      psn_playtime_minutes: psnPlaytimeMinutes,
      psn_trophy_signal_raw: psnTrophySignal,
      xbox_titles: xboxTitles,
      xbox_achievements_earned: xboxAchievementsEarned,
      xbox_achievements_total: xboxAchievementsTotal,
      xbox_gamerscore_earned: xboxGamerscoreEarned,
      xbox_gamerscore_total: xboxGamerscoreTotal,
      xbox_playtime_minutes_estimated: xboxPlaytimeMinutesEstimated,
      xbox_achievement_signal_raw: xboxAchievementSignalRaw,
    },
    explain: [
      {
        label: "Steam playtime",
        points: steamComponent,
        detail: `${Math.round(totalSteamPlaytimeMinutes / 60)}h total playtime (log-scaled so big libraries don’t flatten everyone).`,
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
        label: "PlayStation playtime",
        points: psnPlaytimeComponent,
        detail: `${Math.round(psnPlaytimeMinutes / 60)}h total PSN playtime (log-scaled).`,
      },
      {
        label: "PlayStation trophies",
        points: psnTrophiesComponent,
        detail:
          psn.some((x: any) => x.trophy_progress != null)
            ? `Trophy progress contributes a light "completion signal" across titles.`
            : `Trophy progress not available yet — we'll enrich this with an additional PSN call.`,
      },
      {
        label: "Xbox achievements",
        points: xboxAchievementComponent,
        detail: xboxTitles > 0 ? `${xboxAchDetailParts.join(" • ")}.` : "No Xbox titles imported yet — run Xbox sync.",
      },
      {
        label: "Xbox playtime (estimated)",
        points: xboxPlaytimeComponent,
        detail:
          xboxTitles > 0
            ? `${Math.round(xboxPlaytimeMinutesEstimated / 60)}h estimated from achievement/gamerscore progress + recency. (This is a proxy, not official telemetry.)`
            : "No Xbox titles imported yet — run Xbox sync.",
      },
      {
        label: "Era history bonus",
        points: eraBonus,
        detail:
          (eraRow as any)?.eras && Array.isArray((eraRow as any).eras) && (eraRow as any).eras.length > 0
            ? `You claimed ${(eraRow as any).eras.length} eras — this adds “history points” + confidence.`
            : `Not filled out yet — take the 90-second era quiz to unlock this.`,
      },
    ],
  };

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
