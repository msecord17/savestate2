import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureRaMappingForRelease } from "@/lib/ra/mapReleaseToRA";
import {
  EMU_HARDWARE_SLUGS,
  getPlatformSlugPatterns,
} from "@/lib/hardware/played-on-availability";
import { getDemoReleaseEditorial } from "@/lib/demo/release_demo_editorial";

export const dynamic = "force-dynamic";

async function fetchCommunitySnapshot(release_id: string) {
  try {
    const { data, error } = await supabaseServer.rpc("release_community_snapshot", {
      p_release_id: release_id,
    });

    if (error) return null;
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

function eraFromYear(year?: number | null): string | null {
  if (!year || !Number.isFinite(year)) return null;
  const y = Number(year);
  if (y <= 1982) return "Arcade Dawn";
  if (y <= 1989) return "8-bit Era";
  if (y <= 1995) return "16-bit Era";
  if (y <= 1999) return "32/64-bit Era";
  if (y <= 2008) return "PS2 Renaissance";
  if (y <= 2013) return "HD Rise";
  if (y <= 2019) return "Modern HD";
  return "Current Era";
}

function normalizePlatformKey(labelOrKey?: string | null): string | null {
  const s = String(labelOrKey ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (s.includes("genesis") || s.includes("mega drive") || s.includes("megadrive")) return "genesis";
  if (s.includes("snes") || s.includes("super nintendo") || s.includes("super famicom")) return "snes";
  if (s.includes("nes") || s.includes("famicom") || s.includes("nintendo entertainment system")) return "nes";
  if (s.includes("nintendo 64") || s.includes("n64")) return "n64";
  if (s.includes("game boy advance") || s.includes("gba")) return "gba";
  if (s.includes("game boy color") || s.includes("gbc")) return "gbc";
  if (s.includes("game boy") || s === "gb") return "gb";
  if (s.includes("playstation 5") || s.includes("ps5")) return "ps5";
  if (s.includes("playstation 4") || s.includes("ps4")) return "ps4";
  if (s.includes("playstation 3") || s.includes("ps3")) return "ps3";
  if (s.includes("playstation 2") || s.includes("ps2")) return "ps2";
  if (s.includes("playstation") || s.includes("psn")) return "ps";
  if (s.includes("steam")) return "steam";
  if (s.includes("pc") || s.includes("windows")) return "pc";
  if (s.includes("xbox series")) return "xsx";
  if (s.includes("xbox one")) return "xone";
  if (s.includes("xbox 360")) return "x360";
  if (s.includes("xbox")) return "xbox";
  return null;
}

async function fetchPlayedOnForUser(user_id: string, release_id: string) {
  // 1) Get rows from user_release_played_on
  const { data: rows, error: rowsErr } = await supabaseServer
    .from("user_release_played_on")
    .select("hardware_id, is_primary, source")
    .eq("user_id", user_id)
    .eq("release_id", release_id)
    .order("is_primary", { ascending: false });

  if (rowsErr) return { items: [] as any[] };

  const hardwareIds = (rows ?? [])
    .map((r) => r.hardware_id)
    .filter(Boolean) as string[];

  if (hardwareIds.length === 0) return { items: [] as any[] };

  // 2) Fetch hardware records (select * so we don't guess column names)
  const { data: hwRows } = await supabaseServer
    .from("hardware")
    .select("*")
    .in("id", hardwareIds);

  const hwById = new Map<string, any>();
  (hwRows ?? []).forEach((h: any) => hwById.set(h.id, h));

  // 3) Build display items with a "best effort" label
  const items = (rows ?? []).map((r: any) => {
    const hw = hwById.get(r.hardware_id);
    const label =
      hw?.display_name ??
      hw?.name ??
      hw?.label ??
      hw?.short_name ??
      hw?.slug ??
      r.hardware_id;

    return {
      hardware_id: r.hardware_id,
      label,
      is_primary: !!r.is_primary,
      source: r.source ?? null,
      slug: hw?.slug ?? null,
    };
  });

  return { items };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing release id in URL" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const user = userRes.user;

    // 1) Release + game metadata
    const { data: release, error: relErr } = await supabase
      .from("releases")
      .select(
        `
        id,
        display_title,
        platform_name,
        platform_key,
        platform_label,
        cover_url,
        steam_appid,
        created_at,
        updated_at,
        game_id,
        games (
          id,
          canonical_title,
          igdb_game_id,
          summary,
          genres,
          developer,
          publisher,
          first_release_year,
          cover_url
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

    const computed_platform_key =
      normalizePlatformKey((release as any)?.platform_label) ??
      normalizePlatformKey((release as any)?.platform_name) ??
      normalizePlatformKey((release as any)?.platform_key) ??
      (release as any)?.platform_key ??
      null;

    const gameId = (release as any)?.game_id ?? (release as any)?.games?.id ?? null;
    let editorialDb: any = null;
    if (gameId) {
      const { data: ed } = await supabaseServer
        .from("game_editorial")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();
      if (ed) {
        editorialDb = {
          tags: (ed as any).tags ?? [],
          summary: (ed as any).summary_override ?? (release as any)?.games?.summary ?? null,
          timeline: {
            era_label: (ed as any).era_label ?? null,
            era_blurb: (ed as any).era_blurb ?? null,
            released_text: (ed as any).released_text ?? null,
            released_blurb: (ed as any).released_blurb ?? null,
            same_year_text: (ed as any).same_year_text ?? null,
            released_label: (ed as any).released_text ?? null,
            released_note: (ed as any).released_blurb ?? null,
            same_year_label: (ed as any).same_year_text ?? null,
          },
          reputation: {
            score: (ed as any).metacritic_score ?? null,
            score_source_label: (ed as any).metacritic_platform
              ? `Metacritic (${(ed as any).metacritic_platform})`
              : null,
            critic_blurb: (ed as any).critic_blurb ?? null,
            blurb: (ed as any).critic_blurb ?? null,
            community_tags: (ed as any).community_tags ?? [],
            community_chips: Array.isArray((ed as any).community_tags) ? (ed as any).community_tags : [],
            community_blurb: (ed as any).community_blurb ?? null,
            legacy_impact: (ed as any).legacy_impact ?? null,
          },
          footnote: {
            title: (ed as any).footnote_title ?? "Cultural Footnote",
            body: (ed as any).cultural_footnote ?? null,
          },
        };
      }
    }
    // TEMP fallback so your demo games still show content until DB is filled
    const editorial = editorialDb ?? getDemoReleaseEditorial(release);

    // Auto-map RA if needed (only for RA-compatible platforms)
    const raAutoMapAttemptedAt = new Date().toISOString();
    let raAutoMap: any = null;

    if (String(release.platform_key ?? "").toLowerCase() !== "") {
      // only attempt for RA-compatible platforms
      raAutoMap = await ensureRaMappingForRelease({
        releaseId: id,
        displayTitle: String(release.display_title ?? ""),
        platformKey: release.platform_key,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        mapRelease: async ({ releaseId }) => {
          // Call your existing route internally (simple + uses your proven logic)
          const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
          const r = await fetch(`${base}/api/ra/map-release?release_id=${encodeURIComponent(releaseId)}`, { cache: "no-store" });
          const j = await r.json();
          return { ok: Boolean(j?.ok), ra_game_id: j?.ra_game_id ? Number(j.ra_game_id) : null, note: j?.note };
        },
      });
    }

    // 2) Portfolio status (optional but nice for Release page)
    const { data: portfolio } = await supabase
      .from("portfolio_entries")
      .select("status, playtime_minutes, updated_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    const { data: release_meta } = await supabaseServer
      .from("user_release_meta")
      .select("*")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    // 3) PSN progress for this release (can be multiple: base + DLC)
    const { data: psn, error: psnErr } = await supabase
      .from("psn_title_progress")
      .select(
        "title_name, title_platform, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at"
      )
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (psnErr) {
      // don’t fail the whole page if PSN table has no row
      // (maybeSingle returns error only on query problems)
      console.warn("psn progress read error:", psnErr.message);
    }

    // 4) Xbox progress for this release (can be multiple: base + DLC)
    const { data: xbox, error: xbErr } = await supabase
      .from("xbox_title_progress")
      .select(
        "title_name, title_platform, achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_updated_at"
      )
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (xbErr) {
      console.warn("xbox progress read error:", xbErr.message);
    }

    // 2.5) Steam progress for this release (robust resolution like achievements)
    let steam: any = null;

    // Primary: by release_id
    const { data: steamRow, error: steamErr } = await supabase
      .from("steam_title_progress")
      .select("steam_appid, playtime_minutes, last_updated_at, release_id")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[releases/id] steam lookup", {
      user_id: user.id,
      release_id: id,
      steam: steamRow,
      steamErr: steamErr?.message ?? null,
      steamErrCode: (steamErr as any)?.code ?? null,
      steamErrDetails: (steamErr as any)?.details ?? null,
      steamErrHint: (steamErr as any)?.hint ?? null,
    });
    
    // Check for RLS/permission errors
    if (steamErr) {
      const errMsg = String(steamErr.message ?? "").toLowerCase();
      if (errMsg.includes("permission") || errMsg.includes("policy") || errMsg.includes("rls") || (steamErr as any)?.code === "42501") {
        console.error("[releases/id] ⚠️ RLS BLOCKING STEAM QUERY:", {
          error: steamErr.message,
          code: (steamErr as any)?.code,
          hint: (steamErr as any)?.hint,
        });
      } else {
        console.warn("steam progress read error:", steamErr.message);
      }
    }
    
    // Verify release_id is populated if we got data
    if (steamRow && !steamRow.release_id) {
      console.warn("[releases/id] ⚠️ steam_title_progress row missing release_id:", {
        steam_appid: steamRow.steam_appid,
        playtime_minutes: steamRow.playtime_minutes,
      });
    }

    steam = steamRow ?? null;

    // If missing, resolve appid and re-query by steam_appid
    if (!steam) {
      let appid = "";

      // Fallback 1: release_external_ids mapping
      const { data: ext } = await supabase
        .from("release_external_ids")
        .select("external_id")
        .eq("release_id", id)
        .eq("source", "steam")
        .maybeSingle();

      if (ext?.external_id) appid = String(ext.external_id).trim();

      // Fallback 2: releases.steam_appid (if present)
      if (!appid && (release as any)?.steam_appid) {
        appid = String((release as any).steam_appid).trim();
      }

      // Fallback 3: if user has *any* steam progress rows for this release (rare edge), keep it
      // (not needed if we already tried by release_id, but harmless as an extra safety net)

      if (appid) {
        const { data: steamByApp } = await supabase
          .from("steam_title_progress")
          .select("steam_appid, playtime_minutes, last_updated_at")
          .eq("user_id", user.id)
          .eq("steam_appid", appid)
          .order("last_updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        steam = steamByApp ?? null;
      }
    }

    // ✅ HARD FALLBACK: if no steam_title_progress row exists, synthesize Steam signal from portfolio for Steam releases
    const isSteam = String((release as any)?.platform_key ?? "").toLowerCase() === "steam";
    const portfolioMinutes = portfolio?.playtime_minutes != null ? Number(portfolio.playtime_minutes) : null;

    if (isSteam && !steam && portfolioMinutes != null) {
      steam = {
        steam_appid: (release as any)?.steam_appid ?? null,
        playtime_minutes: portfolioMinutes,
        last_updated_at: portfolio?.updated_at ?? null,
        note: "fallback_from_portfolio",
      };
    }

    // IMPORTANT: portfolio_entries.playtime_minutes should ONLY be treated as Steam playtime
    // when the release itself is a Steam release. Filter it out for non-Steam releases.
    const portfolioData = portfolio
      ? {
          ...portfolio,
          playtime_minutes:
            String(release.platform_key ?? "").toLowerCase() === "steam"
              ? portfolio.playtime_minutes
              : null,
        }
      : null;

    // 5) RA progress for this release
    // Try achievement cache first (detailed data), fallback to game progress (synced data)
    let ra: any = null;

    // Primary: Check achievement cache (populated when achievements are loaded)
    const { data: raCache, error: raErr } = await supabase
      .from("ra_achievement_cache")
      .select("payload, fetched_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    if (raErr) {
      console.warn("[releases/id] RA cache read error:", raErr.message);
    }

    if (raCache?.payload) {
      const progress = raCache.payload.progress;
      if (progress?.numAchievements != null || progress?.numAwardedToUser != null) {
        ra = {
          numAwardedToUser: progress.numAwardedToUser ?? null,
          numAchievements: progress.numAchievements ?? null,
          last_updated_at: raCache.fetched_at ?? null,
          ra_status: raCache.payload.ra_status ?? null,
          ra_num_achievements: raCache.payload.ra_num_achievements ?? null,
        };
      } else if (raCache.payload.ra_status) {
        // Include status even if no progress data (e.g., "no_set" or "unmapped")
        ra = {
          numAwardedToUser: null,
          numAchievements: null,
          last_updated_at: raCache.fetched_at ?? null,
          ra_status: raCache.payload.ra_status ?? null,
          ra_num_achievements: raCache.payload.ra_num_achievements ?? null,
        };
      }
    }

    // Fallback: Check ra_game_progress via release_external_ids mapping (from sync)
    if (!ra) {
      const { data: raMapping } = await supabase
        .from("release_external_ids")
        .select("external_id")
        .eq("release_id", id)
        .eq("source", "ra")
        .maybeSingle();

      if (raMapping?.external_id) {
        const raGameId = Number(raMapping.external_id);
        if (isFinite(raGameId) && raGameId > 0) {
          const { data: raProgress } = await supabase
            .from("ra_game_progress")
            .select("achievements_earned, achievements_total, updated_at")
            .eq("user_id", user.id)
            .eq("ra_game_id", raGameId)
            .maybeSingle();

          if (raProgress) {
            // ra_game_progress is from sync, so if we have data, there's a set
            // We can't distinguish "no_set" from sync data, so we infer "has_set" if counts > 0
            const hasAchievements = (raProgress.achievements_total ?? 0) > 0;
            ra = {
              numAwardedToUser: raProgress.achievements_earned ?? null,
              numAchievements: raProgress.achievements_total ?? null,
              last_updated_at: raProgress.updated_at ?? null,
              // Infer status: if we have achievement counts from sync, assume "has_set"
              // Note: This is fallback data, so status might not be as accurate as cache
              ra_status: hasAchievements ? "has_set" : null,
              ra_num_achievements: raProgress.achievements_total ?? null,
            };
          }
        }
      }
    }

    const bestCover =
      (release as any)?.games?.cover_url ||
      (release as any)?.cover_url ||
      null;

    // 6) Played-on hardware for this release
    const { data: playedOnRows } = await supabase
      .from("user_release_played_on")
      .select("hardware_id, hardware:hardware_id(id, slug, display_name)")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("is_primary", { ascending: false });

    // 7) Physical ownership (portfolio_physical_items linked to this release)
    const { data: physicalRow } = await supabase
      .from("portfolio_physical_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .limit(1)
      .maybeSingle();

    const platformKey = String(computed_platform_key ?? (release as any)?.platform_key ?? "").toLowerCase();

    // Build played_on suggestions from platform
    const suggestions: Array<{ label: string; reason: "psn_platform" | "steam" | "xbox" | "era_default" }> = [];
    if (platformKey.includes("psn") || platformKey.includes("playstation")) {
      suggestions.push({ label: "PlayStation", reason: "psn_platform" });
    }
    if (platformKey === "steam") {
      suggestions.push({ label: "Steam Deck / PC", reason: "steam" });
    }
    if (["xbox", "x360", "xone", "xsx"].includes(platformKey)) {
      suggestions.push({ label: "Xbox", reason: "xbox" });
    }
    if (
      !suggestions.length &&
      ["snes", "nes", "n64", "gba", "gbc", "genesis", "ps1", "ps2", "dreamcast", "saturn"].some((k) =>
        platformKey.includes(k)
      )
    ) {
      suggestions.push({ label: "Retro device", reason: "era_default" });
    }

    // Playtime: prefer steam > psn > portfolio > manual
    let playtimeMinutes: number | null = null;
    let playtimeSource: "steam" | "psn" | "portfolio" | "manual" | null = null;
    if (steam?.playtime_minutes != null && Number(steam.playtime_minutes) > 0) {
      playtimeMinutes = Number(steam.playtime_minutes);
      playtimeSource = "steam";
    } else if (psn?.playtime_minutes != null && Number(psn.playtime_minutes) > 0) {
      playtimeMinutes = Number(psn.playtime_minutes);
      playtimeSource = "psn";
    } else if (portfolioData?.playtime_minutes != null && Number(portfolioData.playtime_minutes) > 0) {
      playtimeMinutes = Number(portfolioData.playtime_minutes);
      playtimeSource = "portfolio";
    } else if (portfolio?.playtime_minutes != null && Number(portfolio.playtime_minutes) > 0) {
      playtimeMinutes = Number(portfolio.playtime_minutes);
      playtimeSource = "manual";
    }

    // Completion: prefer psn > xbox > ra > steam (first with earned/total)
    type CompletionSource = "psn" | "xbox" | "ra" | "steam";
    let completionPercent: number | null = null;
    let completionEarned: number | null = null;
    let completionTotal: number | null = null;
    let completionLabel: "Trophies" | "Achievements" | null = null;
    let completionSource: CompletionSource | null = null;

    const candidates: Array<{
      source: CompletionSource;
      label: "Trophies" | "Achievements";
      earned: number | null;
      total: number | null;
    }> = [
      {
        source: "psn",
        label: "Trophies",
        earned: psn?.trophies_earned ?? null,
        total: psn?.trophies_total ?? null,
      },
      {
        source: "xbox",
        label: "Achievements",
        earned: xbox?.achievements_earned ?? null,
        total: xbox?.achievements_total ?? null,
      },
      {
        source: "ra",
        label: "Achievements",
        earned: ra?.numAwardedToUser ?? null,
        total: ra?.numAchievements ?? null,
      },
    ];
    for (const c of candidates) {
      if (c.total != null && c.total > 0) {
        completionEarned = c.earned ?? 0;
        completionTotal = c.total;
        completionPercent = Math.round(((c.earned ?? 0) / c.total) * 100);
        completionLabel = c.label;
        completionSource = c.source;
        break;
      }
    }

    const selectedHardwareIds = new Set(
      (playedOnRows ?? []).map((r: any) => r?.hardware?.id).filter(Boolean)
    );

    const playedOnItems = (playedOnRows ?? [])
      .filter((r: any) => r?.hardware?.id)
      .map((r: any) => ({
        hardware_id: r.hardware.id,
        label: r.hardware.display_name ?? r.hardware.slug ?? "Unknown",
        slug: r.hardware.slug ?? null,
        icon: (r.hardware as any)?.image_url ?? undefined,
      }));

    // Dedupe playedOnItems by hardware_id (keep first/canonical)
    const seenIds = new Set<string>();
    const dedupedPlayedOnItems = playedOnItems.filter((p: any) => {
      if (seenIds.has(p.hardware_id)) return false;
      seenIds.add(p.hardware_id);
      return true;
    });

    const { data: allHardware } = await supabaseServer
      .from("hardware")
      .select("id, slug, display_name")
      .order("display_name", { ascending: true });

    const hwRows = (allHardware ?? []) as Array<{ id: string; slug: string | null; display_name: string }>;

    function platformKeyFromLabel(key?: string | null, label?: string | null, name?: string | null) {
      const s = `${label ?? ""} ${name ?? ""} ${key ?? ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      if (s.includes("genesis") || s.includes("mega drive") || s.includes("megadrive")) return "genesis";
      if (s.includes("snes") || s.includes("super nintendo") || s.includes("super famicom")) return "snes";
      if (s.includes("nes") || s.includes("famicom") || s.includes("nintendo entertainment system")) return "nes";
      if (s.includes("nintendo 64") || /\bn64\b/.test(s)) return "n64";
      if (s.includes("jaguar")) return "jaguar";
      if (s.includes("steam")) return "steam";
      if (s.includes("windows") || /\bpc\b/.test(s)) return "pc";
      return (key ?? "").toLowerCase() || null;
    }

    const platformKeyNormalized = platformKeyFromLabel(
      (release as any)?.platform_key,
      (release as any)?.platform_label,
      (release as any)?.platform_name
    );

    const platformPatterns = getPlatformSlugPatterns(platformKeyNormalized ?? "");
    const availableIds = new Set<string>();

    for (const h of hwRows) {
      const slug = (h.slug ?? "").toLowerCase();
      const name = (h.display_name ?? "").toLowerCase();
      const matchesPlatform =
        platformPatterns.some((p) => p.test(slug) || p.test(name)) ||
        selectedHardwareIds.has(h.id); // never trap: always include user's existing selections
      if (matchesPlatform) availableIds.add(h.id);
    }

    const PLATFORM_SLUGS: Record<string, string[]> = {
      nes: ["nintendo-entertainment-system", "nintendo_entertainment_system"],
      snes: ["super-nintendo-entertainment-system", "super_nintendo_entertainment_system"],
      n64: ["nintendo-64", "nintendo_64"],
      genesis: ["sega-genesis", "sega-mega-drive", "sega_genesis", "sega_mega_drive"],
      jaguar: ["atari-jaguar", "atari_jaguar"],
    };
    const mustHaveSlugs = PLATFORM_SLUGS[platformKeyNormalized ?? ""] ?? [];
    for (const h of hwRows) {
      const slug = (h.slug ?? "").toLowerCase();
      if (mustHaveSlugs.includes(slug)) availableIds.add(h.id);
    }

    const availableHardware = hwRows
      .filter((h) => availableIds.has(h.id))
      .map((h) => ({
        hardware_id: h.id,
        label: h.display_name ?? h.slug ?? "Unknown",
        slug: h.slug ?? h.id,
      }));

    const emuSlugSet = new Set(EMU_HARDWARE_SLUGS.map((s) => s.toLowerCase().replace(/[-_]/g, "")));
    const emuHardware = hwRows
      .filter((h) => {
        const slug = (h.slug ?? "").toLowerCase().replace(/[-_]/g, "");
        return emuSlugSet.has(slug) || EMU_HARDWARE_SLUGS.some((s) => slug.includes(s.toLowerCase().replace(/[-_]/g, "")));
      })
      .map((h) => ({
        hardware_id: h.id,
        label: h.display_name ?? h.slug ?? "Unknown",
        slug: h.slug ?? h.id,
      }));

    const your_history = {
      in_catalog: !!portfolioData,
      activity_state: portfolioData?.status ?? null,

      played_on: {
        items: dedupedPlayedOnItems,
        can_add: true as const,
        available_hardware_ids: Array.from(availableIds),
        available_hardware: availableHardware,
        emu_hardware: emuHardware,
        ...(suggestions.length > 0 ? { suggestions } : {}),
      },

      ownership: {
        digital: portfolioData ? true : null,
        physical: physicalRow ? true : null,
        rented: null as boolean | null,
      },

      metrics: {
        playtime_minutes: playtimeMinutes,
        playtime_source: playtimeSource,

        completion: {
          percent: completionPercent,
          earned: completionEarned,
          total: completionTotal,
          label: completionLabel,
          source: completionSource,
        },
      },

      identity_tier: null as string | null,
    };

    const community_snapshot = await fetchCommunitySnapshot(id);
    const played_on = await fetchPlayedOnForUser(user.id, id);

    const year = (release as any)?.games?.first_release_year ?? null;

    // timeline + cultural: derive from editorial (already fetched above)
    let timeline: {
      era_label: string | null;
      era_blurb: string | null;
      released_text: string | null;
      released_blurb: string | null;
      same_year_text: string | null;
    } = {
      era_label: editorial?.timeline?.era_label ?? editorial?.timeline?.released_label ?? null,
      era_blurb: editorial?.timeline?.era_blurb ?? null,
      released_text: editorial?.timeline?.released_text ?? editorial?.timeline?.released_label ?? null,
      released_blurb: editorial?.timeline?.released_blurb ?? editorial?.timeline?.released_note ?? null,
      same_year_text: editorial?.timeline?.same_year_text ?? editorial?.timeline?.same_year_label ?? null,
    };
    if (!timeline.era_label && year != null) {
      timeline.era_label = eraFromYear(Number(year));
    }

    const rep = editorial?.reputation;
    let cultural: {
      metacritic_score: number | string | null;
      metacritic_platform: string | null;
      critic_blurb: string | null;
      community_tags: string[] | null;
      community_blurb: string | null;
      legacy_impact: string | null;
      cultural_footnote: string | null;
    } = {
      metacritic_score: rep?.score ?? null,
      metacritic_platform: rep?.score_source_label ?? null,
      critic_blurb: rep?.critic_blurb ?? rep?.blurb ?? null,
      community_tags: Array.isArray(rep?.community_tags) ? rep.community_tags : Array.isArray(rep?.community_chips) ? rep.community_chips : null,
      community_blurb: rep?.community_blurb ?? null,
      legacy_impact: rep?.legacy_impact ?? null,
      cultural_footnote: editorial?.footnote?.body ?? null,
    };

    // community: compute from portfolio_entries for this release
    let community: {
      avg_member_rating: number | null;
      in_libraries: number;
      completion_rate: number | null;
      playing_now: number;
      most_common_identity: string | null;
    } = {
      avg_member_rating: null,
      in_libraries: 0,
      completion_rate: null,
      playing_now: 0,
      most_common_identity: null,
    };
    try {
      const { data: peRows } = await supabaseServer
        .from("portfolio_entries")
        .select("user_id, status, rating, identity, identity_tier")
        .eq("release_id", id);

      const rows = (peRows ?? []) as Array<{ user_id: string; status: string | null; rating?: number | null; identity?: string | null; identity_tier?: string | null }>;
      const inLibraries = new Set(rows.map((r) => r.user_id)).size;
      const playingNow = rows.filter((r) => r.status === "playing").length;
      const started = rows.filter((r) => ["playing", "completed", "dropped"].includes(r.status ?? "")).length;
      const completed = rows.filter((r) => r.status === "completed").length;

      let ratings: number[] = [];
      const identities: string[] = [];
      for (const r of rows) {
        if (r.rating != null && Number.isFinite(r.rating)) ratings.push(Number(r.rating));
        const idVal = r.identity ?? r.identity_tier;
        if (idVal && String(idVal).trim()) identities.push(String(idVal).trim());
      }

      const avgRating =
        ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

      const identityCounts = new Map<string, number>();
      for (const id of identities) {
        identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1);
      }
      let mostCommon: string | null = null;
      let maxCount = 0;
      for (const [id, count] of identityCounts) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = id;
        }
      }

      community = {
        avg_member_rating: avgRating,
        in_libraries: inLibraries,
        completion_rate: started > 0 ? Math.round((completed / started) * 100) : null,
        playing_now: playingNow,
        most_common_identity: mostCommon,
      };
    } catch {
      /* fallback: try without rating/identity columns */
      try {
        const { data: peRows } = await supabaseServer
          .from("portfolio_entries")
          .select("user_id, status")
          .eq("release_id", id);

        const rows = (peRows ?? []) as Array<{ user_id: string; status: string | null }>;
        const inLibraries = new Set(rows.map((r) => r.user_id)).size;
        const playingNow = rows.filter((r) => r.status === "playing").length;
        const started = rows.filter((r) => ["playing", "completed", "dropped"].includes(r.status ?? "")).length;
        const completed = rows.filter((r) => r.status === "completed").length;

        community = {
          avg_member_rating: null,
          in_libraries: inLibraries,
          completion_rate: started > 0 ? Math.round((completed / started) * 100) : null,
          playing_now: playingNow,
          most_common_identity: null,
        };

        const { data: metaRows } = await supabaseServer
          .from("user_release_meta")
          .select("identity_tier")
          .eq("release_id", id);

        const tiers = (metaRows ?? []).map((m: any) => m?.identity_tier).filter(Boolean);
        if (tiers.length > 0) {
          const counts = new Map<string, number>();
          for (const t of tiers) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
          let top: string | null = null;
          let maxCount = 0;
          for (const [t, c] of counts) {
            if (c > maxCount) {
              maxCount = c;
              top = t;
            }
          }
          community.most_common_identity = top;
        }
      } catch {
        /* ignore */
      }
    }

    // release_versions: releases with same game_id (exclude current)
    let releaseVersions: Array<{
      id: string;
      display_title: string | null;
      platform_name: string | null;
      years_text: string | null;
      badge: string | null;
      blurb: string | null;
    }> = [];
    if (gameId) {
      try {
        const { data: versions } = await supabaseServer
          .from("releases")
          .select("id, display_title, platform_name, release_date, games(first_release_year)")
          .eq("game_id", gameId)
          .neq("id", id)
          .order("release_date", { ascending: true, nullsFirst: false });

        const versionIds = ((versions ?? []) as any[]).map((v) => v.id).filter(Boolean);
        let notesByRelease: Record<string, { badge?: string; blurb?: string }> = {};
        if (versionIds.length > 0) {
          const { data: notes } = await supabaseServer
            .from("release_notes")
            .select("release_id, badge, blurb")
            .in("release_id", versionIds);
          for (const n of notes ?? []) {
            const rid = (n as any).release_id;
            if (rid) notesByRelease[rid] = { badge: (n as any).badge, blurb: (n as any).blurb };
          }
        }

        const definitiveKeywords = /definitive|remaster|remastered|ultimate|goty|game of the year/i;
        const versList = (versions ?? []) as any[];
        releaseVersions = versList.map((v, idx) => {
          const note = notesByRelease[v.id] ?? {};
          let badge = note.badge ?? null;
          if (!badge) {
            const title = String(v.display_title ?? "").toLowerCase();
            if (definitiveKeywords.test(title)) badge = "Definitive";
            else if (idx === 0) badge = "Original";
          }
          const year = v.games?.first_release_year ?? (v.release_date ? new Date(v.release_date).getFullYear() : null);
          return {
            id: v.id,
            display_title: v.display_title ?? null,
            platform_name: v.platform_name ?? null,
            years_text: year != null ? String(year) : null,
            badge,
            blurb: note.blurb ?? null,
          };
        });
      } catch {
        /* table may not exist or columns differ */
      }
    }

    // related_games: from game_relations or fallback
    let relatedGames: Array<{ id: string; title: string | null; reason: string | null; cover_url?: string | null }> = [];
    if (gameId) {
      try {
        const { data: relations } = await supabaseServer
          .from("game_relations")
          .select("related_game_id, reason_label")
          .eq("game_id", gameId);

        const rels = (relations ?? []) as Array<{ related_game_id: string; reason_label: string | null }>;
        const currentPlatform = (release as any)?.platform_key ?? null;

        if (rels.length > 0) {
          for (const r of rels) {
            const rid = r.related_game_id;
            if (!rid) continue;
            const { data: relReleases } = await supabaseServer
              .from("releases")
              .select("id, display_title, platform_key, cover_url, games(cover_url)")
              .eq("game_id", rid)
              .order("created_at", { ascending: false });

            const candidates = (relReleases ?? []) as Array<{ id: string; display_title: string | null; platform_key: string | null; cover_url?: string | null; games?: { cover_url?: string | null } | null }>;
            const samePlatform = candidates.find((c) => c.platform_key === currentPlatform);
            const pick = samePlatform ?? candidates[0];
            if (pick) {
              const cover = (pick as any)?.cover_url ?? (pick as any)?.games?.cover_url ?? null;
              relatedGames.push({
                id: pick.id,
                title: pick.display_title ?? null,
                reason: r.reason_label ?? null,
                cover_url: cover ?? null,
              });
            }
          }
        } else {
          // Fallback: one same developer, one similar genre
          const game = (release as any)?.games;
          const developer = game?.developer ?? null;
          const genres = game?.genres;
          const genreList = Array.isArray(genres) ? genres.map((g: any) => (typeof g === "string" ? g : g?.name ?? "")).filter(Boolean) : [];

          if (developer) {
            const { data: devGames } = await supabaseServer
              .from("games")
              .select("id")
              .eq("developer", developer)
              .neq("id", gameId)
              .limit(1);

            if (devGames?.[0]?.id) {
              const { data: devRel } = await supabaseServer
                .from("releases")
                .select("id, display_title, cover_url, games(cover_url)")
                .eq("game_id", devGames[0].id)
                .limit(1)
                .maybeSingle();
              if (devRel) {
                const cover = (devRel as any)?.cover_url ?? (devRel as any)?.games?.cover_url ?? null;
                relatedGames.push({ id: devRel.id, title: devRel.display_title ?? null, reason: "Same developer", cover_url: cover ?? null });
              }
            }
          }

          if (genreList.length > 0 && relatedGames.length < 2) {
            const firstGenre = genreList[0];
            const { data: genreGames } = await supabaseServer
              .from("games")
              .select("id")
              .neq("id", gameId)
              .contains("genres", [firstGenre])
              .limit(1);

            if (genreGames?.[0]?.id) {
              const { data: genreRel } = await supabaseServer
                .from("releases")
                .select("id, display_title, cover_url, games(cover_url)")
                .eq("game_id", genreGames[0].id)
                .limit(1)
                .maybeSingle();
              if (genreRel && !relatedGames.some((rg) => rg.id === genreRel.id)) {
                const cover = (genreRel as any)?.cover_url ?? (genreRel as any)?.games?.cover_url ?? null;
                relatedGames.push({ id: genreRel.id, title: genreRel.display_title ?? null, reason: "Similar genre", cover_url: cover ?? null });
              }
            }
          }
        }
      } catch {
        /* table may not exist */
      }
    }

    const playedOnPayload = {
      ...played_on,
      available_hardware_ids: Array.from(availableIds),
      available_hardware: availableHardware,
      emu_hardware: emuHardware,
    };

    // Enrich editorial.related_games with id + cover_url by resolving titles to releases
    let finalRelatedGames = relatedGames;
    const editorialRg = editorial?.related_games;
    if (Array.isArray(editorialRg) && editorialRg.length > 0) {
      const normTitle = (s: string) =>
        (s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
      const enriched: Array<{ id?: string; title: string; reason: string; cover_url?: string | null }> = [];
      for (const rg of editorialRg) {
        const title = (rg?.title ?? "").toString().trim();
        const reason = (rg?.reason ?? "").toString().trim();
        if (!title) continue;
        let resolved: { id: string; cover_url: string | null } | null = null;
        try {
          const searchVariants = [title, normTitle(title)].filter(Boolean);
          for (const q of [...new Set(searchVariants)]) {
            if (resolved) break;
            const { data: rel } = await supabaseServer
              .from("releases")
              .select("id, cover_url, games(cover_url)")
              .ilike("display_title", q)
              .limit(1)
              .maybeSingle();
            if (rel) {
              const cover = (rel as any)?.cover_url ?? (rel as any)?.games?.cover_url ?? null;
              resolved = { id: rel.id, cover_url: cover };
            }
          }
          if (!resolved) {
            const escaped = title.replace(/[%_]/g, (c) => `\\${c}`);
            const { data: rel2 } = await supabaseServer
              .from("releases")
              .select("id, cover_url, games(cover_url)")
              .ilike("display_title", `%${escaped}%`)
              .limit(1)
              .maybeSingle();
            if (rel2) {
              const cover = (rel2 as any)?.cover_url ?? (rel2 as any)?.games?.cover_url ?? null;
              resolved = { id: rel2.id, cover_url: cover };
            }
          }
          if (!resolved) {
            let gm: { id: string } | null = null;
            const { data: gm1 } = await supabaseServer
              .from("games")
              .select("id")
              .ilike("canonical_title", title)
              .limit(1)
              .maybeSingle();
            if (gm1?.id) gm = gm1;
            if (!gm?.id) {
              const nt = normTitle(title);
              if (nt !== title) {
                const { data: gm2 } = await supabaseServer
                  .from("games")
                  .select("id")
                  .ilike("canonical_title", nt)
                  .limit(1)
                  .maybeSingle();
                if (gm2?.id) gm = gm2;
              }
            }
            if (!gm?.id) {
              const esc = title.replace(/[%_]/g, (c) => `\\${c}`);
              const { data: gm3 } = await supabaseServer
                .from("games")
                .select("id")
                .ilike("canonical_title", `%${esc}%`)
                .limit(1)
                .maybeSingle();
              if (gm3?.id) gm = gm3;
            }
            if (gm?.id) {
              const { data: rel3 } = await supabaseServer
                .from("releases")
                .select("id, cover_url, games(cover_url)")
                .eq("game_id", gm.id)
                .limit(1)
                .maybeSingle();
              if (rel3) {
                const cover = (rel3 as any)?.cover_url ?? (rel3 as any)?.games?.cover_url ?? null;
                resolved = { id: rel3.id, cover_url: cover };
              }
            }
          }
        } catch {
          /* ignore */
        }
        enriched.push({
          id: resolved?.id,
          title,
          reason,
          cover_url: resolved?.cover_url ?? null,
        });
      }
      finalRelatedGames = enriched;
    } else {
      finalRelatedGames = relatedGames;
    }

    const games = (release as any)?.games;
    const genresRaw = games?.genres;
    const genresNormalized: string[] = Array.isArray(genresRaw)
      ? genresRaw.map((g: any) => (typeof g === "string" ? g : g?.name ?? g?.label ?? "")).filter(Boolean)
      : typeof genresRaw === "string"
        ? genresRaw.split(/[,\|]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

    const signal_sources = [
      ra ? { key: "ra", label: "RetroAchievements", last_updated_at: (ra as any)?.last_updated_at ?? null } : null,
      psn ? { key: "psn", label: "PlayStation", last_updated_at: (psn as any)?.last_updated_at ?? null } : null,
      xbox ? { key: "xbox", label: "Xbox", last_updated_at: (xbox as any)?.last_updated_at ?? null } : null,
      steam ? { key: "steam", label: "Steam", last_updated_at: (steam as any)?.last_updated_at ?? null } : null,
      (portfolioData?.status || (playedOnPayload?.items?.length ?? 0) > 0 || release_meta)
        ? { key: "manual", label: "Manual", last_updated_at: null }
        : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        ok: true,
        release: {
          ...(release as any),
          platform_key: platformKeyNormalized ?? computed_platform_key ?? (release as any)?.platform_key,
          cover_url: bestCover,
          display_title_final: (release as any)?.display_title ?? games?.canonical_title ?? null,
          dev_final: games?.developer ?? null,
          pub_final: games?.publisher ?? null,
          genres_normalized: genresNormalized,
        },
        portfolio: portfolioData,
        signals: {
          steam: steam ?? null,
          psn: psn ?? null,
          xbox: xbox ?? null,
          ra: ra ?? null,
        },
        your_history,
        community_snapshot,
        played_on: playedOnPayload,
        release_meta: release_meta ?? null,
        timeline,
        cultural,
        community,
        release_versions: editorial?.release_versions ?? releaseVersions,
        related_games: finalRelatedGames,
        editorial: {
          ...(editorial ?? {}),
          release_versions: editorial?.release_versions ?? releaseVersions,
          related_games: finalRelatedGames,
        },
        signal_sources,
        debug: {
          raAutoMap,
          raAutoMapAttemptedAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load release" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
