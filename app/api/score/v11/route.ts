import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function logScaled(minutes: number, weight = 180) {
  // gentle log curve: 0..∞ minutes -> 0..~1000+
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
  const totalGames = rows.length;

  let totalSteamPlaytimeMinutes = 0;

  for (const r of rows) {
    const s = String((r as any).status || "owned");
    completionPoints += STATUS_POINTS[s] ?? 6;
    if (s === "completed") completedCount += 1;
    totalSteamPlaytimeMinutes += Number((r as any).playtime_minutes || 0);
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
    const hardcore = Math.max(0, earnedHC - earned); // only extra hardcore delta
    raHardcoreBoost += hardcore;

    const weighted = base + 0.65 * hardcore;
    const withPct = weighted * (0.85 + 0.3 * pct); // 0.85x..1.15x

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

  // 2.6) Xbox (playtime + optional achievement signal)
  // IMPORTANT: we select "*" so we don't crash if your column names differ.
  // 5) Xbox (achievement + gamerscore signal; playtime not available yet)
const { data: xboxRows, error: xbErr } = await supabase
.from("xbox_title_progress")
.select("achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_played_at")
.eq("user_id", user.id);

if (xbErr) return NextResponse.json({ error: xbErr.message }, { status: 500 });

const xb = Array.isArray(xboxRows) ? xboxRows : [];

let xboxTitles = xb.length;
let xboxAchievementsEarned = 0;
let xboxAchievementsTotal = 0;
let xboxGamerscoreEarned = 0;
let xboxGamerscoreTotal = 0;

for (const t of xb as any[]) {
xboxAchievementsEarned += Number(t.achievements_earned || 0);
xboxAchievementsTotal += Number(t.achievements_total || 0);
xboxGamerscoreEarned += Number(t.gamerscore_earned || 0);
xboxGamerscoreTotal += Number(t.gamerscore_total || 0);
}

// Small “completion-ish” signal from achievements + gamerscore completion ratio
const achPct =
xboxAchievementsTotal > 0 ? xboxAchievementsEarned / xboxAchievementsTotal : 0;

const gsPct =
xboxGamerscoreTotal > 0 ? xboxGamerscoreEarned / xboxGamerscoreTotal : 0;

// Keep this light so it doesn't dominate (same philosophy as PS trophies)
const xboxAchievementSignalRaw =
Math.round(250 * (0.6 * achPct + 0.4 * gsPct)); // 0..250ish

const xboxAchievementComponent =
Math.round(120 * Math.log1p(Math.max(0, xboxAchievementSignalRaw) / 40));

// No playtime in schema yet
const xboxPlaytimeMinutes = 0;
const xboxPlaytimeComponent = 0;


  // 4) Era bonuses (magic onboarding)
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

  // RA points can be huge; compress so it doesn't dominate
  const raComponent = Math.round(140 * Math.log1p(Math.max(0, raPoints) / 120));

  // PSN: use a slightly lower weight than Steam so multi-platform folks don’t inflate too hard
  const psnPlaytimeComponent = logScaled(psnPlaytimeMinutes);

  // Optional small trophy seasoning: at most +120 (academic-lite, not “trophy sweats win”)
  const psnTrophiesComponent = Math.round(90 * Math.log1p(Math.max(0, psnTrophySignal) / 40));

  // Xbox components already calculated above (xboxPlaytimeComponent and xboxAchievementComponent)

  // Total score
  const score =
    steamComponent +
    completionComponent +
    raComponent +
    psnPlaytimeComponent +
    psnTrophiesComponent +
    xboxPlaytimeComponent + 
    xboxAchievementComponent + // ✅ add
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
  if (xboxPlaytimeMinutes >= 60 * 10) confidence += 4;

  if ((eraRow as any)?.eras && Array.isArray((eraRow as any).eras) && (eraRow as any).eras.length > 0) {
    confidence += 10;
  }

  confidence += eraConfidenceBonus;
  confidence = clamp(confidence, 0, 100);

  const breakdown = {
    score_total: score,
    confidence,
    components: {
      steam_playtime: steamComponent,
      completion_status: completionComponent,
      retroachievements: raComponent,
      psn_playtime: psnPlaytimeComponent,
      psn_trophies: psnTrophiesComponent,
      xbox_playtime: xboxPlaytimeComponent,
      xbox_achievements: xboxAchievementComponent,
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
      xbox_playtime_minutes: xboxPlaytimeMinutes,
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
          psn.some((x) => x.trophy_progress != null)
            ? `Trophy progress contributes a light "completion signal" across titles.`
            : `Trophy progress not available yet — we'll enrich this with an additional PSN call.`,
      },
      {
        label: "Xbox achievements",
        points: xboxAchievementComponent,
        detail: (() => {
          const achStr =
            xboxAchievementsTotal > 0
              ? `${xboxAchievementsEarned}/${xboxAchievementsTotal}`
              : `${xboxAchievementsEarned}`;

          const gsStr =
            xboxGamerscoreTotal > 0
              ? `${xboxGamerscoreEarned}/${xboxGamerscoreTotal}`
              : `${xboxGamerscoreEarned}`;

          return xboxTitles > 0
            ? `${xboxTitles} Xbox titles • ${achStr} achievements • ${gsStr} gamerscore.`
            : "No Xbox titles imported yet — run Xbox sync.";
        })(),
      },
      {
        label: "Xbox playtime",
        points: 0,
        detail: "Xbox playtime isn't available yet — the current Xbox title feed doesn't include time played. (Next step: add a second Xbox stats call + store minutes.)",
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

  // Cache to profiles for fast rendering/sharing
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
