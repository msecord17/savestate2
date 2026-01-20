import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type ReleaseCard = {
  release_id: string;
  game_id: string | null;
  title: string;

  platform_key: string | null;     // psn, xbox, steam, etc
  platform_name: string | null;    // PlayStation, Xbox, etc (generic)
  platform_label: string | null;   // PS5, PS4, etc (specific)
  cover_url: string | null;

  status: string;

  steam_playtime_minutes: number;

  psn_playtime_minutes: number | null;
  psn_trophy_progress: number | null;
  psn_trophies_earned: number | null;
  psn_trophies_total: number | null;
  psn_last_updated_at: string | null;

  xbox_achievements_earned: number | null;
  xbox_achievements_total: number | null;
  xbox_gamerscore_earned: number | null;
  xbox_gamerscore_total: number | null;
  xbox_last_updated_at: string | null;

  sources: string[];        // ["Steam","PSN","Xbox"]
  lastSignalAt: string | null;
};

type GameCard = {
  // One card per game
  game_id: string;
  title: string;

  cover_url: string | null; // best available
  status: string;           // best/most “active” status across releases

  // aggregated
  steam_playtime_minutes: number;
  psn_playtime_minutes: number | null;
  psn_trophy_progress: number | null;
  psn_trophies_earned: number | null;
  psn_trophies_total: number | null;

  xbox_achievements_earned: number | null;
  xbox_achievements_total: number | null;
  xbox_gamerscore_earned: number | null;
  xbox_gamerscore_total: number | null;

  // UI helpers
  platforms: string[];      // ["PS5","PS4","Xbox","Steam"]
  sources: string[];        // ["Steam","PSN","Xbox"]
  lastSignalAt: string | null;

  // for “split by platform” drilldown later
  releases: ReleaseCard[];
};

function normTitle(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[:'".,!?()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// Prefer a “more active” status if any release has it.
// Tune this later, but this is a sane baseline.
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

function platformChip(platform_key: string | null, platform_label: string | null) {
  // Prefer specific label (PS5/PS4) when present
  if (platform_label && platform_label.trim()) return platform_label.trim();
  if (!platform_key) return "Unknown";

  // Friendly labels
  if (platform_key === "psn") return "PlayStation";
  if (platform_key === "xbox") return "Xbox";
  if (platform_key === "steam") return "Steam";
  return platform_key.toUpperCase();
}

function reduceToGameCards(releaseCards: ReleaseCard[]): GameCard[] {
  const byGame = new Map<string, ReleaseCard[]>();

  for (const r of releaseCards) {
    if (!r.game_id) continue; // if we don’t have game_id, we can’t safely group
    const gid = String(r.game_id);
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid)!.push(r);
  }

  const out: GameCard[] = [];

  for (const [game_id, rels] of byGame.entries()) {
    // best title: choose the shortest non-empty (usually canonical-ish),
    // fallback to first.
    const titles = rels.map((x) => x.title).filter(Boolean);
    const title =
      titles.sort((a, b) => a.length - b.length)[0] ?? rels[0]?.title ?? "Untitled";

    // cover: first non-null
    const cover_url = rels.find((x) => x.cover_url)?.cover_url ?? null;

    // status: best ranked
    const status = bestStatus(rels.map((x) => x.status));

    // platforms: unique chips
    const platforms = uniq(
      rels.map((x) => platformChip(x.platform_key, x.platform_label))
    ).sort((a, b) => a.localeCompare(b));

    // sources: union
    const sources = uniq(rels.flatMap((x) => x.sources ?? []));

    // timestamps: max across releases
    let lastSignalAt: string | null = null;
    for (const r of rels) lastSignalAt = maxIso(lastSignalAt, r.lastSignalAt);

    // Aggregation rules:
    // - playtime: sum steam across releases (steam should basically be one release anyway)
    // - psn: sum playtime across PS releases, trophy progress choose max progress
    // - xbox: sum earned/total across releases (not perfect but pragmatic), or choose max totals
    const steam_playtime_minutes = rels.reduce((acc, x) => acc + (x.steam_playtime_minutes || 0), 0);

    const psnPlay = rels.reduce((acc, x) => acc + (Number(x.psn_playtime_minutes || 0)), 0);
    const psn_playtime_minutes = psnPlay > 0 ? psnPlay : null;

    const psnProgressMax = rels
      .map((x) => x.psn_trophy_progress)
      .filter((v) => v != null)
      .reduce((m, v) => Math.max(m, Number(v)), -1);
    const psn_trophy_progress = psnProgressMax >= 0 ? psnProgressMax : null;

    // If you have earned/total per-title, “best” is: pick the row with the highest total trophies
    let psn_trophies_earned: number | null = null;
    let psn_trophies_total: number | null = null;
    for (const r of rels) {
      const tot = r.psn_trophies_total ?? null;
      if (tot != null && (psn_trophies_total == null || tot > psn_trophies_total)) {
        psn_trophies_total = Number(tot);
        psn_trophies_earned = r.psn_trophies_earned != null ? Number(r.psn_trophies_earned) : null;
      }
    }

    // Xbox: same idea: pick the row with the highest gamerscore_total as the representative
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

      platforms,
      sources,
      lastSignalAt,
      releases: rels,
    });
  }

  return out;
}

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  // mode: "game" (default) or "release"
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "game";

  // 1) portfolio entries + releases
  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select(
      `
      release_id,
      status,
      playtime_minutes,
      releases:release_id (
        id,
        game_id,
        display_title,
        platform_key,
        platform_name,
        platform_label,
        cover_url
      )
    `
    )
    .eq("user_id", user.id);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const rows = Array.isArray(entries) ? entries : [];
  const releaseIds = rows.map((r: any) => r?.release_id).filter(Boolean);

  // 2) PSN progress (by release_id)
  const psnByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: psnRows, error: pErr } = await supabase
      .from("psn_title_progress")
      .select("release_id, title_name, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!pErr && Array.isArray(psnRows)) {
      for (const p of psnRows as any[]) {
        if (p?.release_id) psnByRelease[String(p.release_id)] = p;
      }
    }
  }

  // 3) Xbox progress (by release_id)
  const xboxByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: xbRows, error: xErr } = await supabase
      .from("xbox_title_progress")
      .select("release_id, title_name, achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_updated_at")
      .eq("user_id", user.id)
      .in("release_id", releaseIds);

    if (!xErr && Array.isArray(xbRows)) {
      for (const x of xbRows as any[]) {
        if (x?.release_id) xboxByRelease[String(x.release_id)] = x;
      }
    }
  }

  // 4) Release-level cards (lossless)
  const releaseCards = rows
    .map((r: any) => {
      const rel = r?.releases;
      if (!rel?.id) return null;

      const rid = String(rel.id);
      const title = String(rel.display_title ?? "Untitled");

      const psn = psnByRelease[rid] ?? null;
      const xb = xboxByRelease[rid] ?? null;

      // portfolio_entries.playtime_minutes should ONLY count as Steam time for Steam releases
      const steamMinutes =
        rel.platform_key === "steam" ? Number(r?.playtime_minutes || 0) : 0;

      // Sources in *release mode* should be deterministic by platform_key.
      // Otherwise filters get weird when a platform has no progress row yet.
      const sources: string[] = [];
      if (rel.platform_key === "steam") sources.push("Steam");
      if (rel.platform_key === "psn") sources.push("PSN");
      if (rel.platform_key === "xbox") sources.push("Xbox");

      // Optional: if you want "signal-based" sources too, keep these,
      // but they're not required once platform_key drives it.
      if (steamMinutes > 0 && !sources.includes("Steam")) sources.push("Steam");
      if (psn && !sources.includes("PSN")) sources.push("PSN");
      if (xb && !sources.includes("Xbox")) sources.push("Xbox");

      const psnUpdated = toIsoOrNull(psn?.last_updated_at);
      const xbUpdated = toIsoOrNull(xb?.last_updated_at);

      let lastSignalAt: string | null = null;
      lastSignalAt = maxIso(lastSignalAt, psnUpdated);
      lastSignalAt = maxIso(lastSignalAt, xbUpdated);

      return {
        release_id: rid,
        game_id: rel.game_id ?? null,
        title,
        platform_key: rel.platform_key ?? null,
        platform_name: rel.platform_name ?? null,
        platform_label: rel.platform_label ?? null,
        cover_url: rel.cover_url ?? null,

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

        sources,
        lastSignalAt,
      } as ReleaseCard;
    })
    .filter((c): c is ReleaseCard => c !== null);

  if (mode === "release") {
    return NextResponse.json({ ok: true, mode, total: releaseCards.length, cards: releaseCards });
  }

  // default: game mode
  const gameCards = reduceToGameCards(releaseCards);

  return NextResponse.json({
    ok: true,
    mode,
    total: gameCards.length,
    cards: gameCards,
  });
}
