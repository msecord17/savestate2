/**
 * User stats aggregator — one spine query + signal queries, one payload.
 * Minimal and "always works" even when some platforms have sparse data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type UserStats = {
  totalReleases: number;
  platformCounts: Record<string, number>;
  totalPlaytimeMinutes: number;

  trophiesEarned: number;
  trophiesTotal: number;

  achievementsEarned: number;
  achievementsTotal: number;

  raEarned: number;
  raTotal: number;

  eraCounts: Record<string, number>;
};

export type EraKey =
  | "early"   // atari/early home computing
  | "nes"
  | "snes"
  | "ps1"
  | "ps2"
  | "ps3_360"
  | "wii"
  | "modern"
  | "unknown";

function inferEraFromYear(y: number | null): EraKey {
  if (y == null || !Number.isFinite(y)) return "unknown";
  const yr = Number(y);
  if (yr <= 1985) return "early";
  if (yr <= 1990) return "nes";
  if (yr <= 1995) return "snes";
  if (yr <= 2000) return "ps1";
  if (yr <= 2006) return "ps2";
  if (yr <= 2012) return "ps3_360";
  if (yr <= 2016) return "wii";
  return "modern";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizePlatformKey(key: string | null | undefined): string {
  const k = String(key ?? "").toLowerCase();
  if (k === "steam" || k === "psn" || k === "xbox" || k === "ra" || k === "retroachievements")
    return k === "retroachievements" ? "ra" : k;
  return k || "unknown";
}

/** One portfolio → releases → games join; keep payload slim. */
type PortfolioRow = {
  release_id: string;
  releases: {
    id: string;
    platform_key: string | null;
    game_id: string | null;
    games: { id: string; first_release_year: number | null } | null;
  } | null;
};

/**
 * Pull the user's releases + games release-year and platform key.
 * Then aggregate signals from PSN, Xbox, Steam, RA (table names adapted to this codebase).
 */
export async function getUserStats(
  admin: SupabaseClient,
  userId: string
): Promise<UserStats> {
  const { data: rows, error } = await admin
    .from("portfolio_entries")
    .select(
      `
      release_id,
      releases:release_id (
        id,
        platform_key,
        game_id,
        games:game_id (
          id,
          first_release_year
        )
      )
    `
    )
    .eq("user_id", userId);

  if (error) throw new Error(`getUserStats portfolio: ${error.message}`);

  const platformCounts: Record<string, number> = {};
  const eraCounts: Record<string, number> = {};
  let totalReleases = 0;
  const releaseIds: string[] = [];

  for (const r of (rows ?? []) as PortfolioRow[]) {
    const rel = r?.releases;
    if (!rel?.id) continue;

    totalReleases += 1;
    releaseIds.push(r.release_id);

    const pk = normalizePlatformKey(rel.platform_key);
    platformCounts[pk] = (platformCounts[pk] ?? 0) + 1;

    const yr = (rel.games as { first_release_year?: number } | null)?.first_release_year ?? null;
    const era = inferEraFromYear(typeof yr === "number" ? yr : null);
    eraCounts[era] = (eraCounts[era] ?? 0) + 1;
  }

  // ---- Signals (trophy/achievement/playtime totals). Friction point: table/column names may differ.
  // If Cursor or the DB can't find them: keep these as 0; eras + platform diversity above are unchanged.
  // Patch the signal queries later; no need to block archetype/era/explorer scoring.
  let trophiesEarned = 0;
  let trophiesTotal = 0;
  try {
    if (releaseIds.length > 0) {
      const { data } = await admin
        .from("psn_title_progress")
        .select("trophies_earned, trophies_total")
        .eq("user_id", userId)
        .in("release_id", releaseIds);
      for (const x of data ?? []) {
        trophiesEarned += Number((x as { trophies_earned?: number }).trophies_earned ?? 0);
        trophiesTotal += Number((x as { trophies_total?: number }).trophies_total ?? 0);
      }
    }
  } catch {
    // ignore
  }

  let achievementsEarned = 0;
  let achievementsTotal = 0;
  try {
    if (releaseIds.length > 0) {
      const { data } = await admin
        .from("xbox_title_progress")
        .select("achievements_earned, achievements_total")
        .eq("user_id", userId)
        .in("release_id", releaseIds);
      for (const x of data ?? []) {
        achievementsEarned += Number((x as { achievements_earned?: number }).achievements_earned ?? 0);
        achievementsTotal += Number((x as { achievements_total?: number }).achievements_total ?? 0);
      }
    }
  } catch {
    // ignore
  }

  let raEarned = 0;
  let raTotal = 0;
  try {
    if (releaseIds.length > 0) {
      const { data } = await admin
        .from("ra_achievement_cache")
        .select("payload")
        .eq("user_id", userId)
        .in("release_id", releaseIds);
      for (const row of data ?? []) {
        const achievements = Array.isArray((row as { payload?: { achievements?: { earned?: boolean }[] } }).payload?.achievements)
          ? (row as { payload: { achievements: { earned?: boolean }[] } }).payload.achievements
          : [];
        raTotal += achievements.length;
        raEarned += achievements.filter((a) => a?.earned).length;
      }
    }
  } catch {
    // ignore
  }

  let totalPlaytimeMinutes = 0;
  try {
    if (releaseIds.length > 0) {
      const { data: steamRows } = await admin
        .from("steam_title_progress")
        .select("playtime_minutes")
        .eq("user_id", userId)
        .in("release_id", releaseIds);
      for (const x of steamRows ?? []) {
        totalPlaytimeMinutes += Number((x as { playtime_minutes?: number }).playtime_minutes ?? 0);
      }
      const { data: psnRows } = await admin
        .from("psn_title_progress")
        .select("playtime_minutes")
        .eq("user_id", userId)
        .in("release_id", releaseIds);
      for (const x of psnRows ?? []) {
        totalPlaytimeMinutes += Number((x as { playtime_minutes?: number }).playtime_minutes ?? 0);
      }
    }
  } catch {
    // ignore
  }

  // Ensure all era keys exist with 0
  const allEras: EraKey[] = ["early", "nes", "snes", "ps1", "ps2", "ps3_360", "wii", "modern", "unknown"];
  for (const e of allEras) {
    if (!(e in eraCounts)) eraCounts[e] = 0;
  }

  return {
    totalReleases,
    platformCounts,
    totalPlaytimeMinutes,
    trophiesEarned,
    trophiesTotal,
    achievementsEarned,
    achievementsTotal,
    raEarned,
    raTotal,
    eraCounts,
  };
}

export function getCompletionRate(stats: UserStats): number {
  const earned = stats.trophiesEarned + stats.achievementsEarned + stats.raEarned;
  const total = stats.trophiesTotal + stats.achievementsTotal + stats.raTotal;
  return total > 0 ? clamp(earned / total, 0, 1) : 0;
}
