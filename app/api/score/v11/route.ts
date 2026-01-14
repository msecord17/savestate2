import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function logScaledMinutes(minutes: number) {
  // gentle log curve: 0..∞ minutes -> 0..~1100
  const h = Math.max(0, minutes) / 60;
  return Math.round(180 * Math.log1p(h));
}

function logScaledScore(n: number) {
  // generic log scaler: 0..∞ -> 0..~1000ish
  return Math.round(220 * Math.log1p(Math.max(0, n) / 50));
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
  if (!userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  // ─────────────────────────────────────────────────────────────
  // 1) Portfolio (Steam playtime + completion statuses)
  // ─────────────────────────────────────────────────────────────
  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select("release_id, status, playtime_minutes")
    .eq("user_id", user.id);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const rows = Array.isArray(entries) ? entries : [];

  let completionPoints = 0;
  let completedCount = 0;
  const totalGames = rows.length;

  let totalPlaytimeMinutes = 0;

  for (const r of rows) {
    const s = String(r.status || "owned");
    completionPoints += STATUS_POINTS[s] ?? 6;
    if (s === "completed") completedCount += 1;
    totalPlaytimeMinutes += Number(r.playtime_minutes || 0);
  }

  // ─────────────────────────────────────────────────────────────
  // 2) RetroAchievements (weighted)
  // ─────────────────────────────────────────────────────────────
  const { data: raRows, error: raErr } = await supabase
    .from("ra_game_progress")
    .select(
      "ra_game_id, points_total, points_earned, points_earned_hardcore, achievements_total, achievements_earned, achievements_earned_hardcore, percent_complete"
    )
    .eq("user_id", user.id);

  if (raErr) return NextResponse.json({ error: raErr.message }, { status: 500 });

  const ra = Array.isArray(raRows) ? raRows : [];

  let raPointsRaw = 0;
  let raGamesTouched = 0;
  let raHardcoreBoostRaw = 0;

  for (const g of ra) {
    const total = Number(g.points_total || 0);
    const earned = Number(g.points_earned || 0);
    const earnedHC = Number(g.points_earned_hardcore || 0);

    if (total > 0 || earned > 0) raGamesTouched += 1;

    const pct = clamp(Number(g.percent_complete || 0), 0, 100) / 100;

    const base = earned;
    const hardcoreDelta = Math.max(0, earnedHC - earned); // only extra hardcore delta
    raHardcoreBoostRaw += hardcoreDelta;

    const weighted = base + 0.65 * hardcoreDelta;
    const withPct = weighted * (0.85 + 0.3 * pct); // 0.85x..1.15x

    raPointsRaw += Math.round(withPct);
  }

  // Compress so RA doesn’t dominate
  const raComponent = Math.round(140 * Math.log1p(Math.max(0, raPointsRaw) / 120));

  // ─────────────────────────────────────────────────────────────
  // 2.5) PlayStation (PSN) signal
  // ─────────────────────────────────────────────────────────────
  const { data: psnRows, error: psnErr } = await supabase
    .from("psn_title_progress")
    .select("playtime_minutes, trophy_progress, trophies_earned, trophies_total")
    .eq("user_id", user.id);

  if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });

  const psn = Array.isArray(psnRows) ? psnRows : [];

  let psnPlaytimeMinutes = 0;
  let psnTitles = psn.length;

  let psnTrophySignal = 0; // 0..ish points
  for (const t of psn) {
    psnPlaytimeMinutes += Number(t.playtime_minutes || 0);

    const pct =
      t.trophy_progress != null
        ? clamp(Number(t.trophy_progress), 0, 100) / 100
        : null;

    // If we have trophy progress, count it; otherwise ignore (we'll improve later)
    if (pct != null) {
      psnTrophySignal += Math.round(40 * pct); // 0..40 per title max (gentle)
    }
  }

  // PSN: use a slightly lower weight than Steam so multi-platform folks don't inflate too hard
  const psnPlaytimeComponent = logScaledMinutes(psnPlaytimeMinutes);

  // Optional small trophy seasoning: at most +120 (academic-lite, not "trophy sweats win")
  const psnTrophiesComponent = Math.round(90 * Math.log1p(Math.max(0, psnTrophySignal) / 40));

  // ─────────────────────────────────────────────────────────────
  // 3) Era bonuses (magic onboarding)
  // ─────────────────────────────────────────────────────────────
  const { data: eraRow } = await supabase
    .from("user_era_history")
    .select("era_bonus_points, confidence_bonus, eras")
    .eq("user_id", user.id)
    .maybeSingle();

  const eraBonus = Number(eraRow?.era_bonus_points || 0);
  const eraConfidenceBonus = Number(eraRow?.confidence_bonus || 0);
  const erasCount =
    eraRow?.eras && Array.isArray(eraRow.eras) ? Number(eraRow.eras.length) : 0;

  // ─────────────────────────────────────────────────────────────
  // 4) Xbox (gamerscore + achievements from xbox_title_progress)
  // ─────────────────────────────────────────────────────────────
  const { data: profRow } = await supabase
    .from("profiles")
    .select("xbox_gamerscore")
    .eq("user_id", user.id)
    .maybeSingle();

  const xboxGamerscoreProfile = Number(profRow?.xbox_gamerscore || 0);

  const { data: xboxRows, error: xbErr } = await supabase
    .from("xbox_title_progress")
    .select("title_id, gamerscore_earned, gamerscore_total, achievements_earned, achievements_total, last_played_at")
    .eq("user_id", user.id);

  if (xbErr) return NextResponse.json({ error: xbErr.message }, { status: 500 });

  const xb = Array.isArray(xboxRows) ? xboxRows : [];

  let xboxTitlesTouched = 0;
  let xboxGamerscoreEarned = 0;
  let xboxGamerscoreTotal = 0;
  let xboxAchievementsEarned = 0;
  let xboxAchievementsTotal = 0;

  for (const t of xb) {
    xboxTitlesTouched += 1;
    xboxGamerscoreEarned += Number(t.gamerscore_earned || 0);
    xboxGamerscoreTotal += Number(t.gamerscore_total || 0);
    xboxAchievementsEarned += Number(t.achievements_earned || 0);
    xboxAchievementsTotal += Number(t.achievements_total || 0);
  }

  // Prefer sum(earned) if present; fall back to profile gamerscore
  const xboxGamerscoreUsed =
    xboxGamerscoreEarned > 0 ? xboxGamerscoreEarned : xboxGamerscoreProfile;

  const xboxCompletionRatio =
    xboxGamerscoreTotal > 0 ? clamp(xboxGamerscoreEarned / xboxGamerscoreTotal, 0, 1) : null;

  // Xbox component:
  // - base from gamerscore (log scaled)
  // - plus a modest completion seasoning if totals are known
  const xboxBase = logScaledScore(xboxGamerscoreUsed);
  const xboxSeasoning =
    xboxCompletionRatio === null ? 0 : Math.round(180 * xboxCompletionRatio); // up to +180
  const xboxComponent = xboxBase + xboxSeasoning;

  // ─────────────────────────────────────────────────────────────
  // 5) Compute total score components
  // ─────────────────────────────────────────────────────────────
  const steamComponent = logScaledMinutes(totalPlaytimeMinutes);
  const completionComponent = completionPoints;

  const score =
    steamComponent +
    completionComponent +
    raComponent +
    psnPlaytimeComponent +
    psnTrophiesComponent +
    xboxComponent +
    eraBonus;

  // ─────────────────────────────────────────────────────────────
  // 6) Confidence
  // ─────────────────────────────────────────────────────────────
  let confidence = 35;

  if (totalGames >= 20) confidence += 10;
  if (totalGames >= 60) confidence += 10;

  if (totalPlaytimeMinutes >= 60 * 10) confidence += 10; // 10h
  if (totalPlaytimeMinutes >= 60 * 50) confidence += 8;  // 50h

  if (raGamesTouched >= 10) confidence += 8;
  if (raGamesTouched >= 30) confidence += 7;

  // PSN confidence bump if connected and has some titles
  if (psnTitles >= 10) confidence += 6;
  if (psnTitles >= 30) confidence += 6;
  if (psnPlaytimeMinutes >= 60 * 10) confidence += 4;

  // Xbox confidence bump if connected and has some titles
  if (xboxTitlesTouched >= 10) confidence += 7;
  if (xboxTitlesTouched >= 30) confidence += 5;
  if (xboxGamerscoreUsed >= 500) confidence += 3;

  if (erasCount > 0) confidence += 10;

  confidence += eraConfidenceBonus;
  confidence = clamp(confidence, 0, 100);

  // ─────────────────────────────────────────────────────────────
  // 7) Breakdown + explanations
  // ─────────────────────────────────────────────────────────────
  const breakdown = {
    score_total: score,
    confidence,
    components: {
      steam_playtime: steamComponent,
      completion_status: completionComponent,
      retroachievements: raComponent,
      psn_playtime: psnPlaytimeComponent,
      psn_trophies: psnTrophiesComponent,
      xbox: xboxComponent,
      era_bonus: eraBonus,
    },
    stats: {
      total_games: totalGames,
      completed_games: completedCount,
      steam_playtime_minutes: totalPlaytimeMinutes,

      ra_games_touched: raGamesTouched,
      ra_points_raw: raPointsRaw,
      ra_hardcore_delta_raw: raHardcoreBoostRaw,

      psn_titles: psnTitles,
      psn_playtime_minutes: psnPlaytimeMinutes,
      psn_trophy_signal_raw: psnTrophySignal,

      xbox_titles_touched: xboxTitlesTouched,
      xbox_gamerscore_used: xboxGamerscoreUsed,
      xbox_gamerscore_earned: xboxGamerscoreEarned,
      xbox_gamerscore_total: xboxGamerscoreTotal,
      xbox_achievements_earned: xboxAchievementsEarned,
      xbox_achievements_total: xboxAchievementsTotal,
    },
    explain: [
      {
        label: "Steam playtime",
        points: steamComponent,
        detail: `${Math.round(totalPlaytimeMinutes / 60)}h total playtime (log-scaled so huge libraries don’t delete everyone else).`,
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
          psn.some((x) => x.trophy_progress != null)
            ? `Trophy progress contributes a light "completion signal" across titles.`
            : `Trophy progress not available yet — we'll enrich this with an additional PSN call.`,
      },
      {
        label: "Xbox",
        points: xboxComponent,
        detail:
          xboxTitlesTouched === 0 && xboxGamerscoreUsed === 0
            ? `Not connected yet — connect Xbox to add gamerscore + achievements to your score.`
            : `Using gamerscore (${xboxGamerscoreUsed}) + achievement completion seasoning${
                xboxCompletionRatio !== null
                  ? ` (${Math.round(xboxCompletionRatio * 100)}% of known gamerscore earned)`
                  : ""
              }.`,
      },
      {
        label: "Era history bonus",
        points: eraBonus,
        detail:
          erasCount > 0
            ? `You claimed ${erasCount} eras — this adds “history points” + confidence.`
            : `Not filled out yet — take the 90-second era quiz to unlock this.`,
      },
    ],
  };

  // ─────────────────────────────────────────────────────────────
  // 8) Persist to profiles for fast rendering
  // ─────────────────────────────────────────────────────────────
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
