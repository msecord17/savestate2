import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import {
  eraBucketFromYear,
  ERA_ORDER,
  ERA_LABELS,
  ERA_YEARS,
} from "@/lib/identity/era";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";

const TIMELINE_PAGE_SIZE = 2000;

/** Platform key → display label for Top platform signal */
const PLATFORM_LABELS: Record<string, string> = {
  psn: "PlayStation",
  steam: "Steam",
  xbox: "Xbox",
  ra: "RetroAchievements",
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gba: "GBA",
  gb: "Game Boy",
  gbc: "GBC",
  genesis: "Genesis",
  md: "Genesis",
};

/** Early/retro eras for "Deep cut" fill signal */
const EARLY_RETRO_ERAS = new Set([
  "early_arcade_pre_crash",
  "8bit_home",
  "16bit",
  "32_64bit",
]);

/** Played-on generation eras (hardware you played on). Same payload shape as release-year. */
const PLAYED_ON_ORDER: string[] = [
  "early_retro",
  "ps2_ogxbox_gc",
  "ps3_360_wii",
  "ps4_xbox_one_switch",
  "modern",
  "pc",
  "xbox_hd",
  "unknown_played_on",
];

const PLAYED_ON_LABELS: Record<string, string> = {
  early_retro: "Early / Retro",
  ps2_ogxbox_gc: "PS2 / OG Xbox / GC",
  ps3_360_wii: "PS3 / 360 / Wii",
  ps4_xbox_one_switch: "PS4 / Xbox One / Switch",
  modern: "Modern",
  pc: "PC",
  xbox_hd: "Xbox (HD / Modern)",
  unknown_played_on: "Other",
};

const PLAYED_ON_YEARS: Record<string, string> = {
  early_retro: "—",
  ps2_ogxbox_gc: "—",
  ps3_360_wii: "—",
  ps4_xbox_one_switch: "—",
  modern: "—",
  pc: "—",
  xbox_hd: "—",
  unknown_played_on: "—",
};

/** PSN title_platform (e.g. PS3, PS4, PS5, Vita) → played_on era key */
const PSN_GENERATION_TO_ERA: Record<string, string> = {
  PS3: "ps3_360_wii",
  PS4: "ps4_xbox_one_switch",
  PS5: "modern",
  Vita: "ps3_360_wii",
  PlayStation: "ps4_xbox_one_switch",
};

/**
 * Derive played_on era from signal presence (PSN > Xbox > Steam > RA).
 * Generation from psn_title_progress.title_platform and xbox if available.
 */
function derivePlayedOnEra(
  psn: { title_platform?: string | null } | undefined,
  xb: { title_platform?: string | null } | undefined,
  hasSteam: boolean,
  hasRa: boolean
): string {
  if (psn) {
    const tp = (psn.title_platform ?? "PlayStation").toString().trim();
    return PSN_GENERATION_TO_ERA[tp] ?? PSN_GENERATION_TO_ERA["PlayStation"] ?? "ps4_xbox_one_switch";
  }
  if (xb) {
    const tp = (xb.title_platform ?? "Xbox").toString().trim();
    if (tp && tp !== "Xbox" && (tp.toLowerCase().includes("360") || tp.toLowerCase().includes("one") || tp.toLowerCase().includes("series"))) {
      if (tp.toLowerCase().includes("360")) return "ps3_360_wii";
      if (tp.toLowerCase().includes("one")) return "ps4_xbox_one_switch";
      return "modern";
    }
    return "xbox_hd";
  }
  if (hasSteam) return "pc";
  if (hasRa) return "early_retro";
  return "unknown_played_on";
}

type ReleaseRow = {
  release_id: string;
  game_id: string | null;
  title: string;
  platform_key: string | null;
  platform_label: string;
  /** game_cover ?? release_cover ?? null; UI uses game > release > placeholder */
  cover_url: string | null;
  first_release_year: number | null;
  /** For topSignals / standout */
  trophies_earned: number;
  trophies_total: number;
  ra_earned: number;
  ra_total: number;
  steam_minutes: number;
  psn_minutes: number;
  /** Set when lens=played_on_gen: era key from signal platform + generation */
  played_on_era?: string;
};

/** Standout order: minutes_played desc, achievements_earned desc, achievement_ratio desc, title asc */
function sortForStandout(a: ReleaseRow, b: ReleaseRow): number {
  const aMinutes = a.steam_minutes + a.psn_minutes;
  const bMinutes = b.steam_minutes + b.psn_minutes;
  if (bMinutes !== aMinutes) return bMinutes - aMinutes;

  const aEarned = a.trophies_earned + a.ra_earned;
  const bEarned = b.trophies_earned + b.ra_earned;
  if (bEarned !== aEarned) return bEarned - aEarned;

  const aTotal = a.trophies_total + a.ra_total;
  const bTotal = b.trophies_total + b.ra_total;
  const aRatio = aTotal > 0 ? (a.trophies_earned + a.ra_earned) / aTotal : 0;
  const bRatio = bTotal > 0 ? (b.trophies_earned + b.ra_earned) / bTotal : 0;
  if (bRatio !== aRatio) return bRatio - aRatio;

  return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
}

function platformLabel(pk: string | null, pl: string | null, pn: string | null): string {
  if (pl?.trim()) return pl.trim();
  if (pn?.trim()) return pn.trim();
  if (!pk) return "Unknown";
  return PLATFORM_LABELS[pk] ?? pk.toUpperCase();
}

/** Per-platform stats for tie-breaker: minutes + achievements (normalized). */
function platformTieBreaker(row: ReleaseRow): number {
  const minutes = row.steam_minutes + row.psn_minutes;
  const achievements = row.trophies_earned + row.ra_earned;
  return minutes + achievements * 10; // weight achievements for tie-break
}

type BuildTopSignalsResult = {
  signals: Array<{ key: string; label: string }>;
  titles_with_achievements?: number;
};

/**
 * Build topSignals (3 max): Top platform (tie-break: minutes + achievements),
 * Achievements (only rows with achievements_total > 0; omit chip if 0 titles),
 * Playtime; fill with Library-heavy / Sampler / Deep cut.
 */
function buildTopSignals(
  eraKey: string,
  rows: ReleaseRow[],
  games: number,
  releases: number
): BuildTopSignalsResult {
  const signals: Array<{ key: string; label: string }> = [];
  let titles_with_achievements: number | undefined;

  // 1) Top platform: group by platform_key; tie-breaker = minutes + achievements
  const byPlatform = new Map<
    string,
    { count: number; tieBreaker: number }
  >();
  for (const r of rows) {
    const pk = r.platform_key ?? "unknown";
    const prev = byPlatform.get(pk) ?? { count: 0, tieBreaker: 0 };
    byPlatform.set(pk, {
      count: prev.count + 1,
      tieBreaker: prev.tieBreaker + platformTieBreaker(r),
    });
  }
  const platformEntries = Array.from(byPlatform.entries());
  platformEntries.sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].tieBreaker - a[1].tieBreaker;
  });
  const topPlatform = platformEntries[0]?.[0] ?? null;
  if (topPlatform) {
    signals.push({
      key: "top_platform",
      label: `Top platform: ${PLATFORM_LABELS[topPlatform] ?? topPlatform}`,
    });
  }

  // 2) Achievements: only rows where achievements_total > 0; compute titles_with_achievements
  let earned = 0;
  let total = 0;
  let titlesWithAchievements = 0;
  for (const r of rows) {
    const rowTotal = r.trophies_total + r.ra_total;
    if (rowTotal <= 0) continue;
    titlesWithAchievements += 1;
    earned += r.trophies_earned + r.ra_earned;
    total += r.trophies_total + r.ra_total;
  }
  if (titlesWithAchievements > 0) {
    titles_with_achievements = titlesWithAchievements;
    if (total > 0) {
      signals.push({ key: "achievements", label: `Achievements: ${earned}/${total}` });
    }
  }

  // 3) Playtime: Xh if minutes > 0
  let minutes = 0;
  for (const r of rows) {
    minutes += r.steam_minutes + r.psn_minutes;
  }
  if (minutes > 0) {
    const hours = Math.round(minutes / 60);
    signals.push({ key: "playtime", label: `Playtime: ${hours}h` });
  }

  // Fill empty slots (3 max)
  if (signals.length < 3 && releases >= 25) {
    signals.push({ key: "library_heavy", label: "Library-heavy" });
  }
  if (signals.length < 3 && earned === 0 && minutes === 0 && releases >= 10) {
    signals.push({ key: "sampler", label: "Sampler" });
  }
  if (signals.length < 3 && EARLY_RETRO_ERAS.has(eraKey) && games >= 10) {
    signals.push({ key: "deep_cut", label: "Deep cut" });
  }

  return {
    signals: signals.slice(0, 3),
    titles_with_achievements: titles_with_achievements === 0 ? undefined : titles_with_achievements,
  };
}

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const userId = userRes.user.id;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "release_year") as "release_year" | "played_on_gen";
  const sortOrder = (url.searchParams.get("sort") || "dominance") as "dominance" | "chronological";

  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select(
      `
      release_id,
      playtime_minutes,
      updated_at,
      releases:release_id (
        id,
        game_id,
        display_title,
        platform_key,
        platform_name,
        platform_label,
        cover_url,
        games:game_id (
          id,
          cover_url,
          first_release_year
        )
      )
    `
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(TIMELINE_PAGE_SIZE);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const rows = Array.isArray(entries) ? entries : [];
  const releaseIds = rows.map((r: any) => r?.release_id).filter(Boolean);

  const psnByRelease: Record<string, any> = {};
  const xboxByRelease: Record<string, any> = {};
  const raByRelease: Record<string, any> = {};
  const steamByRelease: Record<string, any> = {};

  if (releaseIds.length) {
    const [psnRes, xbRes, raRes, stRes] = await Promise.all([
      supabase
        .from("psn_title_progress")
        .select("release_id, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at, title_platform")
        .eq("user_id", userId)
        .in("release_id", releaseIds),
      supabase
        .from("xbox_title_progress")
        .select("release_id, achievements_earned, gamerscore_earned, last_updated_at, title_platform")
        .eq("user_id", userId)
        .in("release_id", releaseIds),
      supabase
        .from("ra_achievement_cache")
        .select("release_id, payload, fetched_at")
        .eq("user_id", userId)
        .in("release_id", releaseIds),
      supabase
        .from("steam_title_progress")
        .select("release_id, playtime_minutes, last_updated_at")
        .eq("user_id", userId)
        .in("release_id", releaseIds),
    ]);

    for (const p of psnRes.data ?? []) if (p?.release_id) psnByRelease[String(p.release_id)] = p;
    for (const x of xbRes.data ?? []) if (x?.release_id) xboxByRelease[String(x.release_id)] = x;
    for (const r of raRes.data ?? []) if (r?.release_id) raByRelease[String(r.release_id)] = r;
    for (const s of stRes.data ?? []) if (s?.release_id) steamByRelease[String(s.release_id)] = s;
  }

  const releaseRows: ReleaseRow[] = rows
    .map((r: any) => {
      const rel = r?.releases;
      if (!rel?.id) return null;
      const rid = String(rel.id);
      const psn = psnByRelease[rid];
      const xb = xboxByRelease[rid];
      const steam = steamByRelease[rid];
      const ra = raByRelease[rid]?.payload;
      const raAchievements = Array.isArray(ra?.achievements) ? ra.achievements : [];
      const raEarned = raAchievements.filter((a: any) => a?.earned).length;
      const raTotal = raAchievements.length;
      const steamMinutes =
        String(rel.platform_key ?? "").toLowerCase() === "steam"
          ? Number(steam?.playtime_minutes ?? 0)
          : 0;
      const psnMinutes = Number(psn?.playtime_minutes ?? 0);
      const hasSteam =
        !!steam ||
        (String(rel.platform_key ?? "").toLowerCase() === "steam" && Number(r?.playtime_minutes ?? 0) > 0);

      const first_release_year =
        (rel as any)?.games?.first_release_year != null
          ? Number((rel as any).games.first_release_year)
          : null;
      const gameCover = (rel as any)?.games?.cover_url ?? null;
      const cover_url = gameCover ?? rel.cover_url ?? null;

      const row: ReleaseRow = {
        release_id: rid,
        game_id: rel.game_id ?? null,
        title: String(rel.display_title ?? "Untitled"),
        platform_key: rel.platform_key ?? null,
        platform_label: platformLabel(rel.platform_key, rel.platform_label, rel.platform_name),
        cover_url,
        first_release_year,
        trophies_earned: Number(psn?.trophies_earned ?? 0),
        trophies_total: Number(psn?.trophies_total ?? 0),
        ra_earned: raEarned,
        ra_total: raTotal,
        steam_minutes: steamMinutes,
        psn_minutes: psnMinutes,
      };

      if (mode === "played_on_gen") {
        const playedOnEra = derivePlayedOnEra(psn, xb, hasSteam, !!raByRelease[rid]);
        row.played_on_era = playedOnEra;
      }

      return row;
    })
    .filter((c): c is ReleaseRow => c !== null);

  // Single base: owned_with_era equivalent. All era card counts and era detail (notable) use this.
  const byEra = new Map<string, ReleaseRow[]>();
  const getEraKey = (row: ReleaseRow): string | null => {
    if (mode === "played_on_gen") {
      const era = row.played_on_era ?? "unknown_played_on";
      return era === "unknown_played_on" ? null : era;
    }
    const era = eraBucketFromYear(row.first_release_year);
    return era === "unknown" ? null : era;
  };

  for (const row of releaseRows) {
    const era = getEraKey(row);
    if (!era) continue;
    if (!byEra.has(era)) byEra.set(era, []);
    byEra.get(era)!.push(row);
  }

  // Standout order: minutes desc, achievements_earned desc, achievement_ratio desc, title asc
  for (const [, list] of byEra) {
    list.sort(sortForStandout);
  }

  const eraOrder = mode === "played_on_gen" ? PLAYED_ON_ORDER : ERA_ORDER;
  const eraLabels = mode === "played_on_gen" ? PLAYED_ON_LABELS : ERA_LABELS;
  const eraYears = mode === "played_on_gen" ? PLAYED_ON_YEARS : ERA_YEARS;

  const eraKeys = Array.from(byEra.keys());
  const eraStats = eraKeys.map((key) => {
    const list = byEra.get(key) ?? [];
    const gameIds = new Set(list.map((r) => r.game_id).filter(Boolean));
    return {
      key,
      games: gameIds.size,
      releases: list.length,
    };
  });
  eraStats.sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return b.releases - a.releases;
  });
  const rankByKey: Record<string, number> = {};
  eraStats.forEach((s, i) => {
    rankByKey[s.key] = i + 1;
  });

  const eras: EraTimelineItem[] = eraStats.map(({ key, games, releases }) => {
    const list = byEra.get(key) ?? [];
    const notable = list.slice(0, 3).map((row) => ({
      release_id: row.release_id,
      title: row.title,
      cover_url: row.cover_url,
    }));
    const { signals: topSignals, titles_with_achievements } = buildTopSignals(
      key,
      list,
      games,
      releases
    );

    const item: EraTimelineItem = {
      era: key,
      label: eraLabels[key] ?? key,
      years: eraYears[key] ?? "—",
      rank: rankByKey[key] ?? 0,
      games,
      releases,
      topSignals,
      notable,
    };
    if (titles_with_achievements != null) {
      item.titles_with_achievements = titles_with_achievements;
    }
    return item;
  });

  if (sortOrder === "chronological") {
    eras.sort((a, b) => {
      const ia = eraOrder.indexOf(a.era);
      const ib = eraOrder.indexOf(b.era);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  } else {
    eras.sort((a, b) => a.rank - b.rank);
  }

  // Debug: played_on platform counts + top title_platform values (confirm bucketing)
  const steamFallbackRids = new Set(
    rows
      .filter(
        (r: any) =>
          String(r?.releases?.platform_key ?? "").toLowerCase() === "steam" &&
          Number(r?.playtime_minutes ?? 0) > 0 &&
          !steamByRelease[String(r?.releases?.id)]
      )
      .map((r: any) => String(r?.releases?.id))
  );
  const playedOnCounts = { psn: 0, xbox: 0, steam: 0, ra: 0, none: 0 };
  for (const rid of releaseIds) {
    const psn = psnByRelease[rid];
    const xb = xboxByRelease[rid];
    const steam = steamByRelease[rid];
    const hasSteam = !!steam || steamFallbackRids.has(rid);
    if (psn) playedOnCounts.psn += 1;
    else if (xb) playedOnCounts.xbox += 1;
    else if (hasSteam) playedOnCounts.steam += 1;
    else if (raByRelease[rid]) playedOnCounts.ra += 1;
    else playedOnCounts.none += 1;
  }
  const psnPlatformCounts: Record<string, number> = {};
  for (const p of Object.values(psnByRelease) as any[]) {
    const tp = (p?.title_platform ?? "(null)").toString().trim();
    psnPlatformCounts[tp] = (psnPlatformCounts[tp] ?? 0) + 1;
  }
  const psnTitlePlatformTop = Object.entries(psnPlatformCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([platform, count]) => ({ platform, count }));
  const xboxPlatformCounts: Record<string, number> = {};
  for (const x of Object.values(xboxByRelease) as any[]) {
    const tp = (x?.title_platform ?? "(null)").toString().trim();
    xboxPlatformCounts[tp] = (xboxPlatformCounts[tp] ?? 0) + 1;
  }
  const xboxTitlePlatformTop = Object.entries(xboxPlatformCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([platform, count]) => ({ platform, count }));

  console.log(JSON.stringify({ mode, erasCount: eras.length }));

  const body: TimelineResponse = {
    ok: true,
    user_id: userId,
    mode,
    eras,
    debug: {
      playedOnCounts,
      psnTitlePlatformTop,
      xboxTitlePlatformTop,
    },
  };
  return NextResponse.json(body);
}
