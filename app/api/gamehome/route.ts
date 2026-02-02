import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type ReleaseCard = {
  release_id: string;
  game_id: string | null;
  title: string;

  platform_key: string | null;
  platform_name: string | null;
  platform_label: string | null;
  cover_url: string | null;

  status: string;

  // Steam signal comes from portfolio_entries.playtime_minutes (for now)
  steam_playtime_minutes: number;

  // PSN
  psn_playtime_minutes: number | null;
  psn_trophy_progress: number | null;
  psn_trophies_earned: number | null;
  psn_trophies_total: number | null;
  psn_last_updated_at: string | null;

  // Xbox
  xbox_achievements_earned: number | null;
  xbox_achievements_total: number | null;
  xbox_gamerscore_earned: number | null;
  xbox_gamerscore_total: number | null;
  xbox_last_updated_at: string | null;

  // RA
  ra_achievements_earned: number | null;
  ra_achievements_total: number | null;

  sources: string[];
  lastSignalAt: string | null;
};

type GameCard = {
  game_id: string;
  title: string;
  cover_url: string | null;
  status: string;

  steam_playtime_minutes: number;
  psn_playtime_minutes: number | null;
  psn_trophy_progress: number | null;
  psn_trophies_earned: number | null;
  psn_trophies_total: number | null;

  xbox_achievements_earned: number | null;
  xbox_achievements_total: number | null;
  xbox_gamerscore_earned: number | null;
  xbox_gamerscore_total: number | null;

  ra_achievements_earned: number | null;
  ra_achievements_total: number | null;

  platforms: string[];
  sources: string[];
  lastSignalAt: string | null;

  releases: ReleaseCard[];
};

function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

const STATUS_RANK: Record<string, number> = {
  playing: 5,
  completed: 4,
  back_burner: 3,
  owned: 2,
  wishlist: 1,
  dropped: 0,
};

function bestStatus(statuses: string[]) {
  let best = "owned";
  let bestRank = -1;
  for (const s of statuses) {
    const key = String(s || "owned");
    const r = STATUS_RANK[key] ?? 2;
    if (r > bestRank) {
      bestRank = r;
      best = key;
    }
  }
  return best;
}

function platformChip(platform_key: string | null, platform_label: string | null, platform_name: string | null) {
  if (platform_label && platform_label.trim()) return platform_label.trim();
  if (platform_name && platform_name.trim()) return platform_name.trim();
  if (!platform_key) return "Unknown";
  if (platform_key === "psn") return "PlayStation";
  if (platform_key === "xbox") return "Xbox";
  if (platform_key === "steam") return "Steam";
  return platform_key.toUpperCase();
}

function reduceToGameCards(releaseCards: ReleaseCard[], gameCoversByGameId: Map<string, string | null>): GameCard[] {
  const byGame = new Map<string, ReleaseCard[]>();

  for (const r of releaseCards) {
    if (!r.game_id) continue;
    const gid = String(r.game_id);
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid)!.push(r);
  }

  const out: GameCard[] = [];

  for (const [game_id, rels] of byGame.entries()) {
    const titles = rels.map((x) => x.title).filter(Boolean);
    const title = titles.sort((a, b) => a.length - b.length)[0] ?? rels[0]?.title ?? "Untitled";

    // Cover precedence: game.cover_url (IGDB canonical) first, then release.cover_url (platform fallback)
    const gameCover = gameCoversByGameId.get(game_id) ?? null;
    const releaseCover = rels.find((x) => x.cover_url)?.cover_url ?? null;
    const cover_url = gameCover ?? releaseCover ?? null;
    const status = bestStatus(rels.map((x) => x.status));

    const platforms = uniq(
      rels.map((x) => platformChip(x.platform_key, x.platform_label, x.platform_name))
    ).sort((a, b) => a.localeCompare(b));

    const sources = uniq(rels.flatMap((x) => x.sources ?? []));

    let lastSignalAt: string | null = null;
    for (const r of rels) lastSignalAt = maxIso(lastSignalAt, r.lastSignalAt);

    const steam_playtime_minutes = rels.reduce((acc, x) => acc + (x.steam_playtime_minutes || 0), 0);

    const psnPlay = rels.reduce((acc, x) => acc + Number(x.psn_playtime_minutes || 0), 0);
    const psn_playtime_minutes = psnPlay > 0 ? psnPlay : null;

    const psnProgressMax = rels
      .map((x) => x.psn_trophy_progress)
      .filter((v) => v != null)
      .reduce((m, v) => Math.max(m, Number(v)), -1);
    const psn_trophy_progress = psnProgressMax >= 0 ? psnProgressMax : null;

    let psn_trophies_earned: number | null = null;
    let psn_trophies_total: number | null = null;
    for (const r of rels) {
      const tot = r.psn_trophies_total ?? null;
      if (tot != null && (psn_trophies_total == null || tot > psn_trophies_total)) {
        psn_trophies_total = Number(tot);
        psn_trophies_earned = r.psn_trophies_earned != null ? Number(r.psn_trophies_earned) : null;
      }
    }

    let xbox_achievements_earned: number | null = null;
    let xbox_achievements_total: number | null = null;
    let xbox_gamerscore_earned: number | null = null;
    let xbox_gamerscore_total: number | null = null;

    for (const r of rels) {
      const tot = r.xbox_gamerscore_total ?? null;
      if (tot != null && (xbox_gamerscore_total == null || tot > xbox_gamerscore_total)) {
        xbox_gamerscore_total = Number(tot);
        xbox_gamerscore_earned = r.xbox_gamerscore_earned != null ? Number(r.xbox_gamerscore_earned) : null;
        xbox_achievements_total = r.xbox_achievements_total != null ? Number(r.xbox_achievements_total) : null;
        xbox_achievements_earned = r.xbox_achievements_earned != null ? Number(r.xbox_achievements_earned) : null;
      }
    }

    let ra_achievements_earned: number | null = null;
    let ra_achievements_total: number | null = null;
    for (const r of rels) {
      const tot = r.ra_achievements_total ?? null;
      if (tot != null && (ra_achievements_total == null || tot > ra_achievements_total)) {
        ra_achievements_total = Number(tot);
        ra_achievements_earned = r.ra_achievements_earned != null ? Number(r.ra_achievements_earned) : null;
      }
    }

    out.push({
      game_id,
      title,
      cover_url,
      status,

      steam_playtime_minutes,
      psn_playtime_minutes,
      psn_trophy_progress,
      psn_trophies_earned,
      psn_trophies_total,

      xbox_achievements_earned,
      xbox_achievements_total,
      xbox_gamerscore_earned,
      xbox_gamerscore_total,

      ra_achievements_earned,
      ra_achievements_total,

      platforms,
      sources,
      lastSignalAt,
      releases: rels,
    });
  }

  return out;
}

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "game";
  const cursorParam = url.searchParams.get("cursor") ?? "";
  const offset = Math.max(0, parseInt(cursorParam, 10) || 0);

  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select(
      `
      release_id,
      status,
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
          cover_url
        )
      )
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("release_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const rows = Array.isArray(entries) ? entries : [];
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const releaseIds = pageRows.map((r: any) => r?.release_id).filter(Boolean);

  const psnByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: psnRows, error: pErr } = await supabase
      .from("psn_title_progress")
      .select("release_id, title_name, title_icon_url, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!pErr && Array.isArray(psnRows)) {
      for (const p of psnRows as any[]) if (p?.release_id) psnByRelease[String(p.release_id)] = p;
    }
  }

  const xboxByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: xbRows, error: xErr } = await supabase
      .from("xbox_title_progress")
      .select("release_id, achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_updated_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!xErr && Array.isArray(xbRows)) {
      for (const x of xbRows as any[]) if (x?.release_id) xboxByRelease[String(x.release_id)] = x;
    }
  }

  const raByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: raRows, error: rErr } = await supabase
      .from("ra_achievement_cache")
      .select("release_id, payload, fetched_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!rErr && Array.isArray(raRows)) {
      for (const r of raRows as any[]) {
        if (r?.release_id) raByRelease[String(r.release_id)] = r;
      }
    }
  }

  // 3B) Steam progress (by release_id)
  const steamByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: stRows, error: sErr } = await supabase
      .from("steam_title_progress")
      .select("release_id, steam_appid, playtime_minutes, last_updated_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!sErr && Array.isArray(stRows)) {
      for (const s of stRows as any[]) {
        if (s?.release_id) steamByRelease[String(s.release_id)] = s;
      }
    }
  }

  const releaseCards = pageRows
    .map((r: any) => {
      const rel = r?.releases;
      if (!rel?.id) return null;

      const rid = String(rel.id);
      const psn = psnByRelease[rid] ?? null;
      const xb = xboxByRelease[rid] ?? null;
      const steam = steamByRelease[rid] ?? null;
      const ra = raByRelease[rid]?.payload ?? null;

      const raAchievements = Array.isArray(ra?.achievements) ? ra.achievements : [];
      const raEarned = raAchievements.filter((a: any) => a?.earned).length;
      const raTotal = raAchievements.length;

      // Only count Steam playtime for Steam releases
      const steamMinutes =
        String(rel.platform_key ?? "").toLowerCase() === "steam"
          ? Number(steam?.playtime_minutes ?? 0)
          : 0;

      const sources: string[] = [];
      if (String(rel.platform_key ?? "").toLowerCase() === "steam") sources.push("Steam");
      if (psn) sources.push("PSN");
      if (xb) sources.push("Xbox");
      if (raTotal > 0) sources.push("RA");

      const psnUpdated = toIsoOrNull(psn?.last_updated_at);
      const xbUpdated = toIsoOrNull(xb?.last_updated_at);
      const steamUpdated = toIsoOrNull(steam?.last_updated_at);
      const entryUpdated = toIsoOrNull(r?.updated_at);
      const raUpdated = toIsoOrNull(raByRelease[rid]?.fetched_at);

      let lastSignalAt: string | null = null;
      // Use the most recent signal across all sources (including portfolio entry stamp)
      lastSignalAt = maxIso(lastSignalAt, psnUpdated);
      lastSignalAt = maxIso(lastSignalAt, xbUpdated);
      lastSignalAt = maxIso(lastSignalAt, steamUpdated);
      lastSignalAt = maxIso(lastSignalAt, raUpdated);
      if (steamMinutes > 0) lastSignalAt = maxIso(lastSignalAt, entryUpdated);

      const gameCover = (rel as any)?.games?.cover_url ?? null;
      const releaseCover = rel.cover_url ?? null;
      // Cover precedence: game.cover_url (IGDB canonical) first, then release, then psn icon
      const cover_url = gameCover ?? releaseCover ?? psn?.title_icon_url ?? null;
      
      return {
        release_id: rid,
        game_id: rel.game_id ?? null,
        title: String(rel.display_title ?? "Untitled"),
        platform_key: rel.platform_key ?? null,
        platform_name: rel.platform_name ?? null,
        platform_label: rel.platform_label ?? null,
        cover_url,

        status: String(r?.status ?? "owned"),
        steam_playtime_minutes: steamMinutes,

        psn_playtime_minutes: psn?.playtime_minutes != null ? Number(psn.playtime_minutes) : null,
        psn_trophy_progress: psn?.trophy_progress != null ? Number(psn.trophy_progress) : null,
        psn_trophies_earned: psn?.trophies_earned != null ? Number(psn.trophies_earned) : null,
        psn_trophies_total: psn?.trophies_total != null ? Number(psn.trophies_total) : null,
        psn_last_updated_at: psnUpdated,

        xbox_achievements_earned: xb?.achievements_earned != null ? Number(xb.achievements_earned) : null,
        xbox_achievements_total: xb?.achievements_total != null ? Number(xb.achievements_total) : null,
        xbox_gamerscore_earned: xb?.gamerscore_earned != null ? Number(xb.gamerscore_earned) : null,
        xbox_gamerscore_total: xb?.gamerscore_total != null ? Number(xb.gamerscore_total) : null,
        xbox_last_updated_at: xbUpdated,

        ra_achievements_earned: raTotal > 0 ? raEarned : null,
        ra_achievements_total: raTotal > 0 ? raTotal : null,

        sources,
        lastSignalAt,
      } as ReleaseCard;
    })
    .filter((c): c is ReleaseCard => c !== null);

  const nextCursor = hasMore ? String(offset + PAGE_SIZE) : null;

  if (mode === "release") {
    return NextResponse.json({
      ok: true,
      mode,
      total: releaseCards.length,
      cards: releaseCards,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  }

  // Build map of game_id -> game.cover_url for fallback in reduceToGameCards
  const gameCoversByGameId = new Map<string, string | null>();
  for (const r of pageRows) {
    const rel = r?.releases;
    if (rel?.game_id && (rel as any)?.games?.cover_url) {
      const gameId = String(rel.game_id);
      const gameCover = (rel as any).games.cover_url;
      if (!gameCoversByGameId.has(gameId)) {
        gameCoversByGameId.set(gameId, gameCover);
      }
    }
  }

  const gameCards = reduceToGameCards(releaseCards, gameCoversByGameId);
  return NextResponse.json({
    ok: true,
    mode,
    total: gameCards.length,
    cards: gameCards,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}
