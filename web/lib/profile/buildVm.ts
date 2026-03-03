/**
 * Build profile view model from identity/summary or public profile payload.
 * Shared by /profile (logged-in) and /u/[username] (public).
 */

import {
  buildTimelineEras,
  unwrapTimeline,
  type TimelineShape,
} from "@/lib/identity/timeline-view";
import type { MostPlayedOn } from "@/lib/identity/getMostPlayedOn";
import type { ArchetypeDetail } from "@/lib/identity/types";

/** User shape compatible with both identity/summary and public profile. */
export type ProfileUser = {
  user_id?: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  discord_handle?: string | null;
};

export type TimelineEra = ReturnType<typeof buildTimelineEras>[number];

export type ProfileVm = {
  user: ProfileUser;
  archetypes: Array<{ key: string; label: string; strength: string }>;
  primaryArchetype: { key: string; label: string; strength: string; one_liner?: string } | null;
  topEraKey: string | null;
  eraBuckets: Record<string, { games: number; releases: number }>;
  lifetimeScore: number | null;
  drawerDetail: ArchetypeDetail | null;
  playedOn: {
    total_releases: number;
    top_device: { slug: string; display_name: string; source?: string } | null;
    by_kind: Record<string, number>;
  } | null;
  mostPlayedOn: MostPlayedOn | null;
  notableGames: Array<{ release_id: string; title: string; cover_url: string | null }>;
  timeline: TimelineShape;
  eras: TimelineEra[];
};

function pickNotableFromTimeline(timeline: any): ProfileVm["notableGames"] {
  const standoutsByEra = timeline?.standouts ?? {};
  const all = Object.values(standoutsByEra).flatMap((x: any) => (Array.isArray(x) ? x : []));

  const scored = all
    .filter((s: any) => s?.release_id)
    .map((s: any) => ({
      ...s,
      _score:
        (s.cover_url ? 1000 : 0) +
        (typeof s.minutes_played === "number" ? Math.min(999, s.minutes_played) : 0) +
        (typeof s.earned === "number" ? s.earned * 5 : 0),
    }))
    .sort((a: any, b: any) => (b._score ?? 0) - (a._score ?? 0));

  // de-dupe by release_id
  const seen = new Set<string>();
  const unique = scored.filter((s: any) => {
    const id = String(s.release_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique.slice(0, 12).map((s: any) => ({
    release_id: String(s.release_id),
    title: s.title ?? s.display_title ?? "Untitled",
    cover_url: s.cover_url ?? s.game_cover_url ?? null,
    played_on: s.played_on ?? null,
    earned: s.earned ?? null,
    total: s.total ?? null,
    minutes_played: s.minutes_played ?? null,
  }));
}

/** Payload from /api/identity/summary or /api/public/profile/[username]. */
export type ProfilePayload = {
  user?: ProfileUser | { user_id?: string; username?: string; display_name?: string; avatar_url?: string | null; discord_handle?: string | null };
  identity?: Record<string, unknown>;
  top_era?: string | { key?: string } | null;
  era_buckets?: Record<string, { games: number; releases: number }>;
  archetypes?: Array<{ key: string; label: string; strength: string }>;
  timeline?: { stats?: Record<string, { games: number; releases: number }>; standouts?: Record<string, unknown[]> } | { eras?: Array<{ era: string }> };
  played_on?: ProfileVm["playedOn"];
  notable_games?: ProfileVm["notableGames"];
  [key: string]: unknown;
};

export function buildVm(data: ProfilePayload): ProfileVm {
  const d = data as Record<string, unknown>;
  const identity = d.identity as Record<string, unknown> | undefined;
  const archetypes = (d.archetypes ?? identity?.archetypes ?? []) as ProfileVm["archetypes"];
  const primaryArchetype =
    (identity?.archetype as ProfileVm["primaryArchetype"]) ??
    (archetypes[0]
      ? {
          key: archetypes[0].key,
          label: archetypes[0].label,
          strength: archetypes[0].strength,
          one_liner: "",
        }
      : null);
  const topEra =
    (typeof d.top_era === "string" ? d.top_era : (d.top_era as { key?: string })?.key) ??
    (typeof identity?.top_era === "string" ? identity.top_era : (identity?.top_era as { key?: string })?.key) ??
    ((d.timeline as any)?.eras?.length
      ? (d.timeline as any).eras[(d.timeline as any).eras.length - 1]?.era ?? null
      : null);
  const topEraKey = topEra ?? null;
  const eraBuckets =
    (d.era_buckets ?? identity?.era_buckets ?? {}) as ProfileVm["eraBuckets"];
  const lifetimeScore =
    identity?.lifetime_score != null ? Number(identity.lifetime_score) : null;
  const drawerDetail =
    (identity?.drawer as ArchetypeDetail) ??
    (primaryArchetype && Array.isArray(identity?.top_signals)
      ? {
          key: primaryArchetype.key,
          name: primaryArchetype.label,
          tier: primaryArchetype.strength as "emerging" | "strong" | "core",
          oneLiner: primaryArchetype.one_liner ?? "",
          description: "Based on connected platforms and activity.",
          signals: (identity.top_signals as Array<{ key: string; label: string }>).map((s) => ({
            key: s.key,
            label: s.label,
            value: 0,
            source: "time" as const,
            note: undefined,
          })),
          nextSteps: [],
        }
      : null);
  const timeline = unwrapTimeline(data);
  const eras = buildTimelineEras(data);

  const mostPlayedOn = (identity?.most_played_on ?? d.most_played_on) as MostPlayedOn | null;

  const rawUser = d.user as ProfileUser | undefined;
  const user: ProfileUser = rawUser
    ? {
        user_id: rawUser.user_id,
        username: rawUser.username ?? "",
        display_name: rawUser.display_name ?? rawUser.username ?? "",
        avatar_url: rawUser.avatar_url ?? null,
        discord_handle: rawUser.discord_handle ?? null,
      }
    : { username: "", display_name: "", avatar_url: null };

  const rawNotable = (d.notable_games ?? []) as ProfileVm["notableGames"];

  const notableFromTimeline = pickNotableFromTimeline(timeline);
  const notableFromEras = (eras ?? [])
    .flatMap((e: any) => e?.standouts ?? [])
    .slice(0, 12)
    .map((s: any) => ({
      release_id: String(s.release_id),
      title: s.title ?? "Untitled",
      cover_url: s.cover_url ?? null,
      played_on: s.played_on ?? null,
      earned: s.earned ?? null,
      total: s.total ?? null,
      minutes_played: s.minutes_played ?? null,
    }));

  const notableGames =
    rawNotable.length > 0
      ? rawNotable
      : notableFromTimeline.length > 0
        ? notableFromTimeline
        : notableFromEras;

  return {
    user,
    archetypes,
    primaryArchetype,
    topEraKey,
    eraBuckets,
    lifetimeScore,
    drawerDetail,
    playedOn: (d.played_on ?? null) as ProfileVm["playedOn"],
    mostPlayedOn: mostPlayedOn ?? null,
    notableGames,
    timeline,
    eras,
  };
}
