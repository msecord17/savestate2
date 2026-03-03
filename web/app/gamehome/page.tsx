"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProgressBlock, { type ProgressSignal } from "@/components/progress/ProgressBlock";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";
import { IdentityStrip } from "@/app/components/identity/IdentityStrip";
import { PlayedOnSummaryChip } from "@/components/identity/PlayedOnSummaryChip";
import { EraTimeline } from "@/components/identity/EraTimeline";
import { buildTimelineEras } from "@/lib/identity/timeline-view";
import { eraLabel, eraYears, mergeEraBucketsByCanonical } from "@/lib/identity/eras";
import { buildEraSnapshot } from "@/lib/identity/eraSnapshot";
import { TopSignalsRow } from "@/app/components/identity/TopSignalsRow";
import { EvolutionLine } from "@/app/components/identity/EvolutionLine";
import { ArchetypeDrawer } from "@/app/components/identity/ArchetypeDrawer";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import type { IdentitySummaryApiResponse } from "@/lib/identity/types";
import { originBucketFromYear } from "@/lib/identity/era";
import { releaseHref } from "@/lib/routes";
import { ARCHETYPE_THEME, ERA_THEME, STRENGTH_LABELS } from "@/lib/identity/strip-themes";
import type { IdentitySignal } from "@/lib/identity/types";
import {
  UserRound,
  Compass,
  CheckCircle2,
  Waves,
  Gamepad,
  Gamepad2,
  Disc,
  Disc3,
  Joystick,
  Sparkles,
  Monitor,
  Trophy,
  Anchor,
  ArrowUpRight,
  Layers,
  Bookmark,
  Sprout,
  Archive,
  Clock,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { fetchGameHome, fetchIdentitySummary } from "@/src/core/api";
import { motion, useReducedMotion } from "framer-motion";

const ICON_MAP: Record<string, LucideIcon> = {
  UserRound,
  Compass,
  CheckCircle2,
  Waves,
  Gamepad,
  Gamepad2,
  Disc,
  Disc3,
  Joystick,
  Sparkles,
  Monitor,
  Trophy,
  Archive,
  Clock,
  Layers,
  Playstation: Gamepad2, // lucide has no Playstation; use Gamepad2
};

function iconFor(name: string): React.ReactNode {
  const Icon = ICON_MAP[name] ?? UserRound;
  return <Icon className="h-4 w-4" />;
}

const EVOLUTION_ICON_MAP: Record<string, LucideIcon> = {
  checkCircle: CheckCircle2,
  compass: Compass,
  sparkles: Sparkles,
  anchor: Anchor,
  arrowUpRight: ArrowUpRight,
  layers: Layers,
  bookmark: Bookmark,
  seedling: Sprout,
};

function evolutionIconFor(iconKey: string): React.ReactNode {
  const Icon = EVOLUTION_ICON_MAP[iconKey] ?? Sparkles;
  return <Icon className="h-4 w-4" />;
}

import { tokens } from "@/src/design";

type Card = {
  // game mode
  game_id?: string;
  platforms?: string[];

  // release mode
  release_id?: string;
  platform_key?: string | null;
  platform_name?: string | null;
  platform_label?: string | null;

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

  sources: string[];
  lastSignalAt: string | null;

  /** First release year (game or release); used for era filter. */
  first_release_year?: number | null;
};

function minutesToHours(min: number) {
  const h = Math.round((min / 60) * 10) / 10;
  if (!isFinite(h) || h <= 0) return "0h";
  return `${h}h`;
}


function timeAgo(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function HomeCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden",
        "rounded-[var(--radius-xl)] border border-border",
        "bg-card/60 backdrop-blur",
        "shadow-[0_20px_80px_rgba(0,0,0,0.45)]",
        "before:absolute before:inset-0 before:pointer-events-none before:content-['']",
        "before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_40%)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{children}</div>;
}

/** Gold primary CTA (Figma style) */
const goldBtn =
  "h-10 px-5 rounded-[var(--radius)] bg-[#F2C14E] text-black font-medium hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";

function normalizeSourceKey(s: string) {
  const x = String(s || "").toLowerCase();
  if (x === "steam") return "steam";
  if (x === "psn" || x === "playstation") return "psn";
  if (x === "xbox") return "xbox";
  return x;
}

function cardPlatformLabel(c: any) {
  return (
    (c.platform_label && String(c.platform_label)) ||
    (c.platform_name && String(c.platform_name)) ||
    (c.platform_key && String(c.platform_key)) ||
    "Unknown"
  );
}

function byLastSignalDesc(a: any, b: any) {
  const ta = a?.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
  const tb = b?.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
  return tb - ta;
}

// Pick the "best" release from a game's releases array
// Prefers: most recent signal > has cover > first one
function bestRelease(releases: any[]): any | null {
  if (!Array.isArray(releases) || releases.length === 0) return null;
  
  // Sort by: has signal (most recent first), then has cover, then first
  const sorted = [...releases].sort((a, b) => {
    const aTime = a?.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
    const bTime = b?.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    
    const aHasCover = a?.cover_url ? 1 : 0;
    const bHasCover = b?.cover_url ? 1 : 0;
    return bHasCover - aHasCover;
  });
  
  return sorted[0];
}

// Get platform-specific placeholder (matches resolveCoverUrl logic)
function getPlatformPlaceholder(platformKey: string | null | undefined): string {
  const key = (platformKey ?? "").toLowerCase();
  
  if (key.includes("steam")) return "/placeholders/platform/steam.png";
  if (key.includes("psn") || key.includes("playstation")) return "/placeholders/platform/psn.png";
  if (key.includes("xbox")) return "/placeholders/platform/xbox.png";
  
  if (key === "snes") return "/placeholders/platform/snes.png";
  if (key === "nes") return "/placeholders/platform/nes.png";
  if (key === "n64") return "/placeholders/platform/n64.png";
  if (key === "gba") return "/placeholders/platform/gba.png";
  if (key === "gb") return "/placeholders/platform/gb.png";
  if (key === "gbc") return "/placeholders/platform/gbc.png";
  if (key === "genesis" || key === "md") return "/placeholders/platform/genesis.png";
  
  return "/placeholders/platform/unknown.png";
}

type HomeSectionKey =
  | "daily_spark"
  | "recommended"
  | "current_focus"
  | "from_your_circle"
  | "platform_affinity"
  | "activity_snapshot";

const HOME_SECTIONS_DEFAULT: Record<HomeSectionKey, boolean> = {
  daily_spark: true,
  recommended: true,
  current_focus: true,
  from_your_circle: true,
  platform_affinity: true,
  activity_snapshot: true,
};

function fmtInt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}
function fmtCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default function GameHomePage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // filters
  const [platform, setPlatform] = useState<string>("all");
  const [source, setSource] = useState<string>("all"); // all|Steam|PSN|Xbox
  const [status, setStatus] = useState<string>("all");
  const [updatedRecently, setUpdatedRecently] = useState<boolean>(false);
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [splitByPlatform, setSplitByPlatform] = useState<boolean>(false);
  const [eraFilter, setEraFilter] = useState<string | null>(null);
  const [eraDrawerOpen, setEraDrawerOpen] = useState(false);
  const toggleEra = (era: string) => {
    setEraFilter((prev) => {
      const next = prev === era ? null : era;
      setEraDrawerOpen(next !== null);
      return next;
    });
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Identity from GET /api/identity/summary — computed archetypes (lib/identity/archetypes.ts), not fixtures. */
  const [identitySummary, setIdentitySummary] = useState<IdentitySummaryApiResponse | null>(null);
  /** True once the identity summary fetch has settled (success or failure). Used to show "Identity couldn't load" on hosted when API fails. */
  const [identityLoadDone, setIdentityLoadDone] = useState(false);
  /** HTTP status when identity summary fetch failed (401, 500, etc.) so we can show a hint. */
  const [identityErrorStatus, setIdentityErrorStatus] = useState<number | null>(null);
  /** Request aborted due to timeout so we can show "Request timed out". */
  const [identityTimedOut, setIdentityTimedOut] = useState(false);
  /** Increment to re-run identity summary fetch (e.g. after Retry). */
  const [identityRetryKey, setIdentityRetryKey] = useState(0);
  /** Keys of cards just loaded (for fade-up animation on pagination). Cleared after ~500ms. */
  const [newCardKeys, setNewCardKeys] = useState<Set<string>>(new Set());
  const reducedMotion = useReducedMotion();

  /** Connection status from /api/users/me/connections */
  const [connections, setConnections] = useState<{
    platforms: { key: string; label: string; connected: boolean; sync_status?: string | null; last_sync_run_at?: string | null }[];
    last_synced_at: string | null;
  } | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [homeSections, setHomeSections] =
    useState<Record<HomeSectionKey, boolean>>(HOME_SECTIONS_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gh_home_sections");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setHomeSections((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gh_home_sections", JSON.stringify(homeSections));
    } catch {}
  }, [homeSections]);

  const identityChips = useMemo(() => {
    if (identityLoadDone && !identitySummary) {
      const sub = identityTimedOut
        ? "Request timed out"
        : identityErrorStatus === 401
          ? "Log in on this site"
          : identityErrorStatus === 500
            ? "Server env or DB issue"
            : identityErrorStatus != null
              ? `Error ${identityErrorStatus}`
              : "Check login and network";
      return [
        {
          key: "identity-failed",
          label: "Identity couldn't load",
          sub,
          disabled: true,
        },
      ];
    }
    const prim = identitySummary?.primary_archetype;
    const era = identitySummary?.era_affinity;
    if (identitySummary && prim && era) {
      const eraTheme = ERA_THEME[era.key];
      const archTheme = ARCHETYPE_THEME[prim.key];
      const archIcon = archTheme?.icon ?? prim.icon;
      const archLabel = archTheme?.shortLabel ?? prim.name;
      return [
        {
          key: "arch",
          label: archLabel,
          sub: STRENGTH_LABELS[prim.strength],
          icon: iconFor(archIcon),
          kind: "archetype" as const,
          tier: prim.strength,
        },
        {
          key: "era",
          label: eraTheme?.label ?? era.name,
          sub: era.one_liner,
          icon: iconFor(eraTheme?.icon ?? era.icon),
          kind: "era" as const,
          eraKey: era.key,
        },
        ...(identitySummary?.evolution
          ? [
              {
                key: "evo",
                label: identitySummary.evolution?.tag ?? "",
                sub: identitySummary.evolution?.note ?? "",
                icon: iconFor("Sparkles"),
                kind: "evolution" as const,
              },
            ]
          : []),
      ];
    }
    return [
      {
        key: "loading1",
        label: "Loading…",
        sub: " ",
        disabled: true,
      },
    ];
  }, [identitySummary, identityLoadDone, identityErrorStatus, identityTimedOut]);

  /** Top signals (max 5) from summary for the row; convert to IdentitySignal for drawer compatibility. */
  const topSignalsDetail = useMemo(() => {
    if (!identitySummary?.top_signals?.length) return null;
    const sourceFor = (key: string): IdentitySignal["source"] => {
      if (key === "ownership" || key === "curation") return key;
      if (key === "play_evidence" || key === "completion") return "play";
      return "time";
    };
    const signals: IdentitySignal[] = identitySummary.top_signals.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.value,
      source: sourceFor(s.key),
      note: s.note,
    }));
    return { signals };
  }, [identitySummary]);

  const evo = identitySummary?.evolution ?? null;

  const LOAD_TIMEOUT_MS = 15_000;

  async function load(cursor?: string | null) {
    const isAppend = Boolean(cursor);
    if (isAppend) setLoadingMore(true);
    else setLoading(true);
    setErr("");
    try {
      const mode = splitByPlatform ? "release" : "game";
      const fetchPromise = fetchGameHome(mode, cursor ?? null);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), LOAD_TIMEOUT_MS)
      );
      const { items, next_cursor, has_more } = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof fetchGameHome>>;
      if (isAppend) {
        setCards((prev) => [...prev, ...(items as Card[])]);
        const keys = new Set(
          (items as any[]).map((i) => String(i.game_id ?? i.release_id ?? "")).filter(Boolean)
        );
        setNewCardKeys(keys);
      } else {
        setCards(items as Card[]);
        setNewCardKeys(new Set());
      }
      setNextCursor(next_cursor);
      setHasMore(has_more);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (nextCursor == null || loadingMore) return;
    await load(nextCursor);
  }

  useEffect(() => {
    fetch("/api/users/me/identity", { cache: "no-store", credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          setUnauthorized(true);
          setLoading(false);
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  async function loadConnections() {
    try {
      const res = await fetch("/api/users/me/connections", {
        cache: "no-store",
        credentials: "include",
      });

      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }

      const j = await res.json().catch(() => ({}));
      if (j?.ok === false) {
        setErr(j?.error || "Failed to load connections");
        return;
      }

      // Normalize whatever shape the API returns into what GameHome expects
      const rawPlatforms = Array.isArray(j?.platforms) ? j.platforms : [];
      const platforms = rawPlatforms.map((p: any) => ({
        key: String(p.key),
        label: String(p.label ?? p.key),
        connected: !!p.connected,
        sync_status: p.sync_status ?? p.status ?? null,
        last_sync_run_at: p.last_sync_run_at ?? p.last_sync ?? null,
      }));

      const lastSynced =
        j?.last_synced_at ??
        platforms
          .map((p: any) => p.last_sync_run_at)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ??
        null;

      setConnections({ platforms, last_synced_at: lastSynced });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load connections");
    }
  }

  useEffect(() => {
    if (!authChecked || unauthorized) return;
    loadConnections();
  }, [authChecked, unauthorized]);

  const SYNC_ENDPOINTS: Record<string, string> = {
    steam: "/api/sync/steam-thin",
    ra: "/api/sync/retroachievements",
  };

  async function syncPlatform(key: string) {
    const url = (SYNC_ENDPOINTS as any)[key];
    if (!url) return;

    setSyncing((s) => ({ ...s, [key]: true }));
    setErr("");

    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || res.statusText || "Sync failed");
      }

      // Refresh the "last synced" + per-platform status
      await loadConnections();

      // Refresh identity + library cards so the page reflects new data
      setIdentityRetryKey((k) => k + 1);
      await load(null);
    } catch (e: any) {
      setErr(e?.message ?? "Sync failed");
      // Still refresh connections so "syncing" doesn't get stuck in UI
      await loadConnections();
    } finally {
      setSyncing((s) => ({ ...s, [key]: false }));
    }
  }

  useEffect(() => {
    if (!authChecked || unauthorized) return;
    load();
  }, [authChecked, unauthorized, splitByPlatform]);

  useEffect(() => {
    if (!authChecked || unauthorized) return;
    setIdentityLoadDone(false);
    setIdentityErrorStatus(null);
    setIdentityTimedOut(false);
    let cancelled = false;
    fetchIdentitySummary()
      .then(({ data, errorStatus, timedOut }) => {
        if (!cancelled) {
          setIdentitySummary(data ?? null);
          setIdentityErrorStatus(errorStatus ?? null);
          setIdentityTimedOut(timedOut ?? false);
          setIdentityLoadDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIdentityErrorStatus(null);
          setIdentityTimedOut(false);
          setIdentityLoadDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, unauthorized, identityRetryKey]);

  useEffect(() => {
    if (newCardKeys.size === 0) return;
    const t = setTimeout(() => setNewCardKeys(new Set()), 500);
    return () => clearTimeout(t);
  }, [newCardKeys]);

  const platforms = useMemo(() => {
    const set = new Set<string>();

    for (const c of cards as any[]) {
      if (Array.isArray(c.platforms)) {
        c.platforms.forEach((p: string) => set.add(p));
      } else {
        // release mode cards
        const label = c.platform_label || c.platform_name || c.platform_key;
        if (label) set.add(String(label));
      }
    }

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [cards]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) set.add(String(c.status || "owned"));
    return ["all", ...Array.from(set).sort()];
  }, [cards]);

  // Derive lanes (only for game mode, not release mode)
  const continueCards = useMemo(() => {
    if (splitByPlatform) return []; // Only show lanes in game mode
    return [...cards]
      .filter((c: any) => c.game_id && ((c?.steam_playtime_minutes ?? 0) > 0 || c?.lastSignalAt))
      .sort(byLastSignalDesc)
      .slice(0, 20);
  }, [cards, splitByPlatform]);

  const playingCards = useMemo(() => {
    if (splitByPlatform) return []; // Only show lanes in game mode
    return [...cards]
      .filter((c: any) => c.game_id && String(c?.status ?? "").toLowerCase() === "playing")
      .sort(byLastSignalDesc);
  }, [cards, splitByPlatform]);

  const continueIds = useMemo(() => new Set(continueCards.map((c: any) => c.game_id).filter(Boolean)), [continueCards]);
  const playingIds = useMemo(() => new Set(playingCards.map((c: any) => c.game_id).filter(Boolean)), [playingCards]);

  const allCards = useMemo(() => {
    if (splitByPlatform) return []; // Only show lanes in game mode
    return [...cards]
      .filter((c: any) => c.game_id && !continueIds.has(c.game_id) && !playingIds.has(c.game_id))
      .sort(byLastSignalDesc);
  }, [cards, continueIds, playingIds, splitByPlatform]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const recentWindowMs = 1000 * 60 * 60 * 24 * 3; // 3 days

    let out = cards.slice();

    if (platform !== "all") {
      if (splitByPlatform) {
        out = out.filter((c: any) => {
          const label = c.platform_label || c.platform_name || c.platform_key || "";
          return String(label) === platform;
        });
      } else {
        out = out.filter((c) => Array.isArray(c.platforms) && c.platforms.includes(platform));
      }
    }

    if (source !== "all") {
      // In release-mode (splitByPlatform), "Source" should mean the release's platform_key.
      // In game-mode, keep current behavior: "this game has signals from X".
      if (splitByPlatform) {
        const want = normalizeSourceKey(source);
        out = out.filter((c: any) => normalizeSourceKey(c.platform_key) === want);
      } else {
        out = out.filter((c) => Array.isArray(c.sources) && c.sources.includes(source));
      }
    }

    if (status !== "all") {
      out = out.filter((c) => String(c.status || "owned") === status);
    }

    if (eraFilter) {
      out = out.filter((c) => originBucketFromYear(c.first_release_year) === eraFilter);
    }

    if (updatedRecently) {
      out = out.filter((c) => {
        if (!c.lastSignalAt) return false;
        const t = new Date(c.lastSignalAt).getTime();
        return isFinite(t) && now - t <= recentWindowMs;
      });
    }

    if (sort === "recent") {
      out.sort((a, b) => {
        const ta = a.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
        const tb = b.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
        return tb - ta;
      });
    } else {
      out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    return out;
  }, [cards, platform, source, status, eraFilter, updatedRecently, sort]);

  const eraDetailNotableGames = useMemo(() => {
    if (!eraFilter) return [];
    return filtered
      .slice(0, 5)
      .map((c) => ({
        title: c.title,
        platform: c.platform_label || c.platform_name || c.platform_key || null,
      }));
  }, [eraFilter, filtered]);

  const totalReleasesAll = (cards?.length ?? 0) || 1;
  const eraProfile = eraFilter
    ? {
        owned_releases: filtered.length,
        share_pct: filtered.length / totalReleasesAll,
      }
    : null;

  const archetypeSnapshot =
    eraFilter
      ? buildEraSnapshot({
          seed: identitySummary?.primary_archetype?.key ?? "gamehome",
          eraKey: eraFilter,
          eraLabel: eraLabel(eraFilter),
          eraYears: eraYears(eraFilter),
          archetypeName: identitySummary?.primary_archetype?.name ?? null,
          ownedReleases: eraProfile?.owned_releases ?? null,
          sharePct: eraProfile?.share_pct ?? null,
          notableGames: eraDetailNotableGames,
        })
      : "";

  const eras = useMemo(() => {
    return buildTimelineEras({
      stats: mergeEraBucketsByCanonical(
        identitySummary?.identity_signals?.era_buckets ??
          identitySummary?.era_buckets ??
          undefined
      ),
    });
  }, [
    identitySummary?.identity_signals?.era_buckets,
    identitySummary?.era_buckets,
  ]);

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <HomeCard className="max-w-md p-6">
            <div className="text-lg font-semibold">GameHome</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to see your library and start building your gaming identity.
            </p>
            <div className="mt-5">
              <Link href="/login?next=/gamehome" className={goldBtn}>
                Continue to login
              </Link>
            </div>
          </HomeCard>
        </div>
      </div>
    );
  }

  const connectedCount = connections?.platforms?.filter((p) => p.connected).length ?? 0;
  const noPlatformsConnected = !!connections && connectedCount === 0;
  const somePlatformsConnected = !!connections && connectedCount > 0;

  // identity shortcuts (your API already returns identity.primary_archetype etc.)
  const identity = (identitySummary as any)?.identity ?? identitySummary ?? null;
  const arch = identity?.primary_archetype ?? identity?.archetype ?? null;
  const archName = arch?.name ?? "Your Identity";
  const archKey = String(arch?.key ?? "your_identity").toUpperCase();
  const archOneLiner = arch?.one_liner ?? "Connect platforms to generate your identity.";

  // score display (if lifetime_score is 0..1 today, this makes it look like "points")
  const scoreRaw: number | null = typeof identity?.lifetime_score === "number" ? identity.lifetime_score : null;
  const scorePoints = scoreRaw == null ? null : Math.max(0, Math.round(scoreRaw * 22000));
  const scoreText = scorePoints == null ? "—" : fmtInt(scorePoints);

  // quick stats
  const totalMinutes =
    cards.reduce((sum, c) => sum + (Number(c.steam_playtime_minutes ?? 0) || 0) + (Number(c.psn_playtime_minutes ?? 0) || 0), 0) || 0;
  const hoursText = totalMinutes > 0 ? fmtCompact(totalMinutes / 60) : "0";

  const doneCount = cards.filter((c) => String(c.status || "").toLowerCase() === "done").length;
  const donePct = cards.length ? Math.round((doneCount / cards.length) * 100) : 0;

  // recent activity rows
  const recentActivity = [...cards]
    .filter((c) => !!c.lastSignalAt)
    .sort(byLastSignalDesc)
    .slice(0, 5);

  // platform affinity cards (simple + good-looking; wire "years/completion" later)
  const platformAffinity = (() => {
    const map: Record<string, number> = {};
    for (const c of cards) {
      const sources = Array.isArray(c.sources) ? c.sources : [];
      for (const s of sources) {
        const k = normalizeSourceKey(s);
        map[k] = (map[k] || 0) + 1;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => ({
        key: k,
        label:
          k === "steam" ? "PC" :
          k === "psn" ? "PlayStation" :
          k === "xbox" ? "Xbox" :
          k === "ra" ? "RetroAchievements" :
          k.toUpperCase(),
        games: n,
      }));
  })();

  // recommended: just pick something plausible from your lanes
  const recommended = playingCards[0] ?? continueCards[0] ?? allCards[0] ?? null;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-6 py-10 space-y-8">
        {/* header row */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">GameHome</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your cross-platform game library at a glance.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCustomizeOpen(true)}
            className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card/40 px-3 py-2 text-sm text-foreground/90 hover:bg-card/60 transition"
          >
            <Plug className="h-4 w-4 text-muted-foreground" />
            Customize Home
          </button>
        </div>

        {/* HERO */}
        <HomeCard className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <Kicker>{archKey}</Kicker>

              <div className="mt-3 flex items-center gap-3">
                <div className="h-12 w-12 rounded-[var(--radius)] bg-[#F2C14E]/15 border border-[#F2C14E]/20 flex items-center justify-center">
                  <span className="text-[#F2C14E]">{iconFor(String(arch?.icon ?? "Archive"))}</span>
                </div>
                <div className="text-3xl font-semibold tracking-tight">{archName}</div>
              </div>

              <p className="mt-3 text-base text-foreground/85 max-w-xl">
                {archOneLiner}
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <Kicker>Era dominance</Kicker>
                  <div className="mt-1 text-sm text-foreground/90">
                    {(identitySummary as any)?.top_era?.label ?? identity?.era_affinity?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <Kicker>Completion rate</Kicker>
                  <div className="mt-1 text-sm text-foreground/90">{donePct ? `${donePct}%` : "—"}</div>
                </div>
                <div>
                  <Kicker>Replay style</Kicker>
                  <div className="mt-1 text-sm text-foreground/90">
                    {identity?.era_affinity?.one_liner ? "Era-driven" : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="md:pl-10 md:border-l md:border-border/60">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Trophy className="h-4 w-4" />
              Lifetime score
            </div>

              <div className="mt-2 text-4xl font-semibold tracking-tight text-[#F2C14E]">
                {scoreText}
              </div>

            <div className="mt-2 text-sm text-muted-foreground">
              {somePlatformsConnected && connections?.last_synced_at
                ? `Last synced ${timeAgo(connections.last_synced_at) ?? "—"}`
                : "Connect platforms to deepen your story."}
            </div>

              <div className="mt-6 grid grid-cols-3 gap-6">
                <div>
                  <Kicker>Games</Kicker>
                  <div className="mt-1 text-lg font-semibold">{fmtInt(cards.length)}</div>
                </div>
                <div>
                  <Kicker>Hours</Kicker>
                  <div className="mt-1 text-lg font-semibold">{hoursText}</div>
                </div>
                <div>
                  <Kicker>Done</Kicker>
                  <div className="mt-1 text-lg font-semibold">{donePct ? `${donePct}%` : "—"}</div>
                </div>
              </div>

              <div className="mt-6">
                <Link href="/timeline" className="text-sm text-[#F2C14E] hover:underline">
                  See breakdown
                </Link>
              </div>
            </div>
          </div>
        </HomeCard>

        {/* PRE-CONNECT CTA */}
        {noPlatformsConnected && (
          <HomeCard className="p-7">
            <div className="text-lg font-semibold">Deepen your Gamer Life Score</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your platforms to unlock more of your story.
            </p>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Steam", "PlayStation", "Xbox", "Discord"].map((label) => (
                <Link
                  key={label}
                  href="/connect"
                  className="rounded-[var(--radius-lg)] border border-border bg-card/40 px-4 py-5 text-center hover:bg-card/60 transition"
                >
                  <div className="text-sm font-semibold">{label}</div>
                </Link>
              ))}
            </div>
          </HomeCard>
        )}

        {/* POST-CONNECT MODULES */}
        {somePlatformsConnected && (
          <>
            {/* Daily Spark */}
            {homeSections.daily_spark && (
              <HomeCard className="p-7 flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-[var(--radius-lg)] bg-[#F2C14E]/10 border border-[#F2C14E]/15 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-[#F2C14E]" />
                  </div>
                  <div>
                    <Kicker>Daily spark</Kicker>
                    <div className="mt-1 text-lg font-semibold">
                      This 1997 RPG changed turn-based combat forever.
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Hint: you&apos;ve played 3 from this series.
                    </div>
                  </div>
                </div>

                <button type="button" className="rounded-[var(--radius)] border border-border bg-card/50 px-5 py-2 text-sm hover:bg-card/70 transition">
                  Reveal
                </button>
              </HomeCard>
            )}

            {/* Recommended */}
            {homeSections.recommended && (
              <HomeCard className="p-7">
                <Kicker>Recommended for you</Kicker>
                <div className="mt-2 flex flex-col md:flex-row md:items-center gap-6">
                  <div className="h-20 w-16 rounded-[var(--radius-lg)] overflow-hidden border border-border bg-card/60 shrink-0">
                  <img
                    src={
                      resolveCoverUrl({ cover_url: recommended?.cover_url ?? null, game_cover_url: recommended?.cover_url ?? null }) ||
                      getPlatformPlaceholder(recommended?.platform_key ?? null)
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-semibold">{recommended?.title ?? "Persona 4 Golden"}</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You return to PS2-era RPGs more than any other genre. This is one you haven&apos;t logged yet.
                    </p>
                    <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                      <li>Era overlap</li>
                      <li>Genre affinity</li>
                      <li>Completion-style match</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6">
                  <button type="button" className={`w-full ${goldBtn}`}>
                    Add to Backlog
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <button type="button" className="text-sm text-[#F2C14E] hover:underline">
                    Why this pick?
                  </button>
                </div>
              </HomeCard>
            )}

            {/* Your Platforms */}
            {homeSections.platform_affinity && (
              <div className="space-y-4">
                <div className="text-xl font-semibold">Your Platforms</div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {platformAffinity.map((p) => (
                    <HomeCard key={p.key} className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-[var(--radius)] bg-card/60 border border-border flex items-center justify-center">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-semibold">{p.label}</div>
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Years Active</span>
                        <span className="text-foreground/90">—</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Games</span>
                        <span className="text-foreground/90">{fmtInt(p.games)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Completion</span>
                        <span className="text-foreground/90">—</span>
                      </div>
                      </div>
                    </HomeCard>
                  ))}
                </div>
              </div>
            )}

            {/* Activity */}
            {homeSections.activity_snapshot && (
              <div className="space-y-4">
                <div className="text-xl font-semibold">Activity</div>

                <HomeCard className="p-0">
                  <div className="divide-y divide-border/60">
                    {recentActivity.length === 0 ? (
                      <div className="p-6 text-sm text-muted-foreground">
                        No recent activity yet. Sync Steam / PSN / Xbox / RA to start building your timeline.
                      </div>
                    ) : (
                      recentActivity.map((c) => (
                        <div key={c.release_id ?? c.title} className="p-5 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-[#F2C14E]/10 border border-border flex items-center justify-center">
                              <span className="h-2 w-2 rounded-full bg-[#F2C14E]" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{c.title}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                Updated from {Array.isArray(c.sources) ? c.sources.join(", ") : "signals"}
                              </div>
                            </div>
                          </div>

                          <div className="text-sm text-muted-foreground shrink-0">
                            {timeAgo(c.lastSignalAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </HomeCard>

                <Link href="/timeline" className="text-sm text-muted-foreground hover:underline">
                  View full activity →
                </Link>
              </div>
            )}
          </>
        )}

        {/* Recall hook */}
        <HomeCard className="p-5">
          <Link href="/platforms/n64" className="text-sm text-[#F2C14E] hover:underline">
            Recall your N64 era →
          </Link>
        </HomeCard>

        {/* (Optional) keep your existing "identity strip + library UI" below, but put it in a card so it doesn't ruin the vibe */}
        <HomeCard className="p-6">
          {err && (
            <div className="mb-4 rounded-[var(--radius)] border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {err}
            </div>
          )}

          <IdentityStrip chips={identityChips} onOpenDrawer={() => setDrawerOpen(true)} />

          {/* keep your old TODO blocks / filters / grid below as you wire them; at least they're visually contained */}
          <div className="mt-4 text-sm text-muted-foreground">
            Explore + filters + grid live here (keep wiring). When you&apos;re ready, we can move the grid to a dedicated /explore page.
          </div>

          {hasMore && (
            <div className="mt-5">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-[var(--radius)] border border-border bg-card/50 px-4 py-2 text-sm hover:bg-card/70 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </HomeCard>

        <ArchetypeDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          detail={identitySummary?.drawer ?? null}
          evolution={evo}
          primaryEra={identitySummary?.era_affinity?.key}
        />

        <EraDetailDrawer
          open={eraDrawerOpen}
          onOpenChange={setEraDrawerOpen}
          eraKey={eraFilter}
          eraLabel={eraFilter ? eraLabel(eraFilter) : ""}
          eraYears={eraFilter ? eraYears(eraFilter) : "—"}
          interpretation="This era holds a strong place in your library. You collect across platforms and editions."
          signalChips={["Library depth", "Era focus", "Multi-platform"]}
          notableGames={eraDetailNotableGames}
          eraProfile={eraProfile}
          archetypeSnapshot={archetypeSnapshot}
          primaryArchetypeKey={identitySummary?.primary_archetype?.key}
        />

        {/* Customize modal */}
        {customizeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCustomizeOpen(false)}
            />
            <HomeCard className="relative w-full max-w-xl p-0">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="text-lg font-semibold">Customize Your Home</div>
                <button
                  type="button"
                  onClick={() => setCustomizeOpen(false)}
                  className="rounded-[var(--radius)] border border-border bg-card/40 px-3 py-1.5 text-sm hover:bg-card/60"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-3">
                {(
                  [
                    ["daily_spark", "Daily Spark"],
                    ["recommended", "Recommended"],
                    ["current_focus", "Current Focus"],
                    ["from_your_circle", "From Your Circle"],
                    ["platform_affinity", "Platform Affinity"],
                    ["activity_snapshot", "Activity Snapshot"],
                  ] as Array<[HomeSectionKey, string]>
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-card/40 px-4 py-3">
                    <div className="text-sm font-medium">{label}</div>
                    <input
                      type="checkbox"
                      checked={!!homeSections[key]}
                      onChange={(e) => setHomeSections((s) => ({ ...s, [key]: e.target.checked }))}
                      className="h-4 w-4 accent-[#F2C14E]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setHomeSections(HOME_SECTIONS_DEFAULT)}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Reset to Default
                </button>
              <button type="button" onClick={() => setCustomizeOpen(false)} className={goldBtn}>
                Save Changes
              </button>
              </div>
            </HomeCard>
          </div>
        )}
      </div>
    </div>
  );
}
