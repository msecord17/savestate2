/**
 * Shared logic for public profile: resolve username → payload or private/notFound.
 * Used by GET /api/public/profile?username= and GET /api/public/profile/[username].
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ORIGIN_BUCKET_META, ORIGIN_BUCKET_ORDER } from "@/lib/identity/era";
import { normalizeTimeline } from "@/lib/identity/normalize-timeline";
import { normalizeTopEraForProfile } from "@/lib/identity/era-mapping";
import { summaryFromCollectorArchetypes, type GetIdentitySignalsJson } from "@/lib/identity/compute";
import { computeCollectorArchetypes } from "@/lib/identity/collector-archetypes";

function isProbablyNotAGameTitle(title: string): boolean {
  const t = (title || "").toLowerCase().trim();
  if (!t) return true;

  // ultra-common non-game/app media garbage (you mentioned Amazon Instant Video etc)
  const banned = [
    "amazon instant video",
    "netflix",
    "hulu",
    "youtube",
    "spotify",
    "prime video",
    "disney+",
    "twitch",
    "browser",
    "calculator",
    "settings",
    "system",
    "media player",
    "music",
    "video",
    "app",
  ];

  // If the whole title is basically an app name or contains obvious app keywords
  return banned.some((kw) => t === kw || t.includes(kw));
}

function cleanReleaseList<T extends { release_id: string; title: string; cover_url: string | null }>(
  items: T[],
  limit: number
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const it of items) {
    const id = String(it.release_id ?? "").trim();
    const title = String(it.title ?? "").trim();

    if (!id) continue;
    if (!title) continue;
    if (isProbablyNotAGameTitle(title)) continue;
    if (seen.has(id)) continue;

    seen.add(id);
    out.push(it);
    if (out.length >= limit) break;
  }

  return out;
}

function toPlatformCounts(raw: Record<string, number> | unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v))
  );
}

function platformVibe(platformCounts: Record<string, number>): string {
  const entries = Object.entries(platformCounts).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (entries.length === 0) return "Multi-platform";
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [topKey, topVal] = sorted[0];
  const second = sorted[1]?.[1] ?? 0;
  if (topVal > 0 && topVal > second * 1.5) {
    const label: Record<string, string> = {
      psn: "PlayStation-first",
      xbox: "Xbox-first",
      steam: "Steam-first",
      ra: "RetroAchievements",
    };
    return label[topKey] ?? "Multi-platform";
  }
  return "Multi-platform";
}

/** Public profile API success response (200 body). */
export type PublicProfilePayload = {
  ok: true;
  /** True when the viewer is the profile owner (from /api/public/profile/[username]). */
  isOwner?: boolean;
  user: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    discord_handle: string | null; // null unless public
  };
  identity: {
    lifetime_score: number;
    archetype: {
      key: string;
      label: string;
      strength: "emerging" | "strong" | "core";
      one_liner: string;
    };
    top_era: { key: string; legacy_key?: string | null; label: string; years: string } | null;
    top_signals: Array<{ key: string; label: string }>;
    era_buckets: Record<string, { games: number; releases: number }>;
    era_buckets_timeline?: Record<string, { games: number; releases: number }>;
    era_buckets_legacy: Record<string, { games: number; releases: number }>;
    era_entropy: number;
    totals: {
      owned_games: number;
      owned_releases: number;
      minutes_played: number;
      achievements_earned: number;
      achievements_total: number;
    };
  };
  timeline: {
    mode: "dominance";
    eras: Array<{
      era: string;
      label: string;
      years: string;
      rank: number;
      games: number;
      releases: number;
      topSignals: Array<{ key: string; label: string }>;
      notable: Array<{ release_id: string; title: string; cover_url: string | null }>;
    }>;
  };
  notable_games: Array<{ release_id: string; title: string; cover_url: string | null }>;
  /** Played-on summary (top device, by_kind). From loadPlayedOnSummary. */
  played_on?: {
    total_releases: number;
    top_device: { slug: string; display_name: string; source?: string } | null;
    by_kind: Record<string, number>;
  } | null;
};

export type GetPublicProfileResult =
  | { notFound: true }
  | { private: true }
  | PublicProfilePayload;

export async function getPublicProfileByUsername(
  admin: SupabaseClient,
  rawUsername: string
): Promise<GetPublicProfileResult> {
  const trimmed = rawUsername.trim();
  if (!trimmed) return { notFound: true };

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, user_id, username, display_name, avatar_url, discord_handle, public_discord, profile_public, gamer_score_v11")
    .ilike("username", trimmed)
    .maybeSingle();

  if (profileErr || !profile) return { notFound: true };
  if (!profile.profile_public) return { private: true };

  const userId = (profile.id ?? profile.user_id) as string;
  if (!userId) return { notFound: true };
  const username = String(profile.username ?? trimmed);
  const displayName = String(profile.display_name ?? username);
  const avatarUrl = profile.avatar_url != null ? String(profile.avatar_url) : null;
  const includeDiscord = !!profile.public_discord && profile.discord_handle != null;
  const discordHandle = includeDiscord ? String(profile.discord_handle) : null;

  let lifetimeScore =
    profile.gamer_score_v11 != null && Number.isFinite(Number(profile.gamer_score_v11))
      ? Math.round(Number(profile.gamer_score_v11))
      : 0;

  let primaryArchetype = "Explorer";
  let primaryArchetypeKey = "explorer";
  let strength: "emerging" | "strong" | "core" = "emerging";
  let dominantEra = "Modern Era";
  let dominantEraKey = "modern";
  let topSignals: Array<{ key: string; label: string }> = [];
  let totals = {
    owned_games: 0,
    owned_releases: 0,
    minutes_played: 0,
    achievements_earned: 0,
    achievements_total: 0,
  };

  const { data: signalsJson, error: sigErr } = await admin.rpc("get_identity_signals", {
    p_user_id: userId,
  });

  const signals = signalsJson as GetIdentitySignalsJson | null;
  const eraBucketsLegacy = (signals?.era_buckets ?? {}) as Record<
    string,
    { games: number; releases: number }
  >;
  const eraBucketsTimeline = (signals?.era_buckets_timeline ?? {}) as Record<
    string,
    { games: number; releases: number }
  >;
  const eraBuckets =
    Object.keys(eraBucketsTimeline).length > 0 ? eraBucketsTimeline : eraBucketsLegacy;
  const eraEntropy = (signals?.era_entropy_timeline ?? signals?.era_entropy ?? 0) as number;

  if (!sigErr && signalsJson != null) {
    const json = signalsJson as GetIdentitySignalsJson;
    totals = {
      owned_games: Number(json.owned_games ?? 0),
      owned_releases: Number(json.owned_releases ?? json.owned_entries ?? 0),
      minutes_played: Number(json.minutes_played ?? 0),
      achievements_earned: Number(json.achievements_earned ?? 0),
      achievements_total: Number(json.achievements_total ?? 0),
    };
    const platformCounts = toPlatformCounts(json?.platform_counts);
    const collectorArchetypes = computeCollectorArchetypes(
      { identity_signals: json ?? undefined },
      platformCounts
    );
    const primaryEraKey = json?.primary_era_key ?? json?.top_era_weighted;
    const eraKey = primaryEraKey ? String(primaryEraKey).trim() || "unknown" : "unknown";
    const summary = summaryFromCollectorArchetypes(collectorArchetypes, eraKey);
    primaryArchetype = summary.primary_archetype?.name ?? "Explorer";
    primaryArchetypeKey = summary.primary_archetype?.key ?? "explorer";
    const str = summary.primary_archetype?.strength ?? "emerging";
    strength = str === "core" || str === "strong" ? str : "emerging";
    dominantEraKey = summary.era_affinity?.key ?? primaryEraKey ?? "unknown";
    dominantEra = summary.era_affinity?.name ?? "Modern Era";
    if (lifetimeScore === 0 && summary.lifetime_score != null) {
      lifetimeScore = Math.round(summary.lifetime_score * 100);
    }
    topSignals = (summary.top_signals ?? []).slice(0, 5).map((t) => ({
      key: t.key,
      label: t.label,
    }));
  }

  const { data: timelinePayload, error: timelineErr } = await admin.rpc("get_public_origin_timeline", {
    p_username: username,
  });
  if (timelineErr) throw timelineErr;
  const { origin } = normalizeTimeline(timelinePayload);
  const stats = origin.stats;
  const standouts = origin.standouts;
  const buckets = ORIGIN_BUCKET_ORDER.filter((k) => k !== "unknown");

  const eraStats = buckets.map((key) => {
    const s = stats[key] as { games?: number; releases?: number } | undefined;
    return {
      key,
      games: Number(s?.games ?? 0),
      releases: Number(s?.releases ?? 0),
    };
  });
  eraStats.sort((a, b) => b.games - a.games);
  const rankByKey: Record<string, number> = {};
  eraStats.forEach((s, i) => {
    rankByKey[s.key] = i + 1;
  });

  const eras: PublicProfilePayload["timeline"]["eras"] = buckets.map((bucketKey, idx) => {
    const s = stats[bucketKey] as { games?: number; releases?: number } | undefined;
    const meta = ORIGIN_BUCKET_META[bucketKey];
    const games = Number(s?.games ?? 0);
    const releases = Number(s?.releases ?? 0);
    const list = (Array.isArray(standouts[bucketKey]) ? standouts[bucketKey]! : []) as Array<{
      release_id?: unknown;
      title?: unknown;
      cover_url?: unknown;
    }>;
    const notableRaw = list.map((n) => ({
      release_id: String(n.release_id ?? ""),
      title: String(n.title ?? "Untitled"),
      cover_url: (n.cover_url as string | null) ?? null,
    }));
    const notable = cleanReleaseList(notableRaw, 6);
    return {
      era: bucketKey,
      label: meta?.title ?? bucketKey,
      years: meta?.sub ?? "",
      rank: rankByKey[bucketKey] ?? idx + 1,
      games,
      releases,
      topSignals: [],
      notable,
    };
  });
  const canonicalOrder = [...eras].sort((a, b) => {
    const ia = ORIGIN_BUCKET_ORDER.indexOf(a.era);
    const ib = ORIGIN_BUCKET_ORDER.indexOf(b.era);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const { data: recentRows } = await admin
    .from("portfolio_entries")
    .select(
      `
    release_id,
    updated_at,
    created_at,
    releases:releases (
      display_title,
      title,
      cover_url
    )
  `
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(6);

  const notable_games: PublicProfilePayload["notable_games"] = (recentRows ?? [])
    .filter((row: any) => row?.releases != null)
    .map((row: any) => {
      const r = row?.releases;
      const title = r?.display_title ?? r?.title ?? "Untitled";
      const cover_url = r?.cover_url ?? null;
      return {
        release_id: String(row?.release_id ?? ""),
        title: String(title),
        cover_url,
      };
    });

  const notable_games_cleaned = cleanReleaseList(notable_games, 6);

  const oneLiner =
    strength === "core"
      ? `Your library is defined by ${primaryArchetype}.`
      : strength === "strong"
        ? `Your library leans ${primaryArchetype}.`
        : `Your library shows emerging ${primaryArchetype} traits.`;

  const timelineTopEraKey = eraStats[0]?.key ?? null;
  const topEraKey =
    (signals?.top_era_timeline ??
      signals?.primary_era_key_timeline ??
      signals?.top_era_weighted ??
      signals?.top_era ??
      signals?.primary_era_key ??
      timelineTopEraKey ??
      "unknown") as string;

  const topEra = normalizeTopEraForProfile(topEraKey);

  const payload: PublicProfilePayload = {
    ok: true,
    user: {
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
      discord_handle: discordHandle,
    },
    identity: {
      lifetime_score: lifetimeScore,
      archetype: {
        key: primaryArchetypeKey,
        label: primaryArchetype,
        strength,
        one_liner: oneLiner,
      },
      top_era: topEra.key !== "unknown"
        ? { key: topEra.key, legacy_key: topEra.legacy_key, label: topEra.label, years: topEra.years }
        : null,
      top_signals: topSignals,
      era_buckets: eraBuckets,
      era_buckets_legacy: eraBucketsLegacy,
      era_entropy: eraEntropy,
      totals,
    },
    timeline: { mode: "dominance", eras: canonicalOrder },
    notable_games: notable_games_cleaned,
  };

  return payload;
}
