"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Disc, Gamepad2, HardDrive, MonitorPlay, Receipt } from "lucide-react";
import { useParams } from "next/navigation";
import ProgressBlock, { type ProgressSignal } from "@/components/progress/ProgressBlock";
import { PlayedOnPicker } from "./PlayedOnPicker";
import { PlayedOnChip } from "@/components/PlayedOnChip";
import AchievementsAccordionCard from "./AchievementsAccordionCard";
import AddToListMenu from "./AddToListMenu";
import IdentityTierMenu, { getIdentityTierColor } from "./IdentityTierMenu";
import StatusMenu from "./StatusMenu";
import BelowTheFold from "./BelowTheFold";
import { chipClass, chipClassAccent } from "@/lib/chipStyles";


type ReleaseDetail = {
  id: string;
  display_title: string | null;
  platform_name: string | null;
  platform_key: string | null;
  platform_label: string | null;
  cover_url: string | null;
  games: {
    id: string;
    canonical_title: string | null;
    igdb_game_id: number | null;
    summary: string | null;
    genres: any | null;
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
    cover_url: string | null;
  } | null;
};

type Signals = {
  steam: null | {
    steam_appid: string | null;
    playtime_minutes: number | null;
    last_updated_at: string | null;
  };
  psn: null | {
    title_name: string | null;
    title_platform: string | null;
    playtime_minutes: number | null;
    trophy_progress: number | null;
    trophies_earned: number | null;
    trophies_total: number | null;
    last_updated_at: string | null;
  };
  xbox: null | {
    title_name: string | null;
    title_platform: string | null;
    achievements_earned: number | null;
    achievements_total: number | null;
    gamerscore_earned: number | null;
    gamerscore_total: number | null;
    last_updated_at: string | null;
  };
  ra: null | {
    numAwardedToUser: number | null;
    numAchievements: number | null;
    ra_status?: "unmapped" | "no_set" | "has_set" | null;
    ra_num_achievements?: number | null;
    last_updated_at?: string | null;
  };
};

type Portfolio = null | {
  status: string | null;
  playtime_minutes: number | null; // you treat as Steam minutes today
  updated_at: string | null;
};

type Trophy = {
  trophyId: number;
  name: string;
  description: string;
  iconUrl: string | null;
  earned: boolean;
  earnedAt: string | null;
  rarity: number | null;
};

type Achievement = {
  achievement_id: string;
  achievement_name: string | null;
  achievement_description: string | null;
  gamerscore: number | null;
  achievement_icon_url: string | null;
  rarity_percentage: number | null;
  earned: boolean;
  earned_at: string | null;
};

type ApiPayload = {
  release: ReleaseDetail;
  portfolio: Portfolio;
  signals: Signals;
};

function pickPlaytimeMinutes(signals: any, portfolio: any): { minutes: number | null; source: string | null } {
  const steam = signals?.steam?.playtime_minutes;
  if (steam != null && Number(steam) > 0) return { minutes: Number(steam), source: "Steam" };

  const psn = signals?.psn?.playtime_minutes;
  if (psn != null && Number(psn) > 0) return { minutes: Number(psn), source: "PlayStation" };

  const p = portfolio?.playtime_minutes;
  if (p != null && Number(p) > 0) return { minutes: Number(p), source: "Portfolio" };

  return { minutes: null, source: null };
}

function pickCompletion(signals: any): {
  percent: number | null;
  earned: number | null;
  total: number | null;
  label: string | null;
  source: string | null;
} {
  // Prefer PSN trophies if present
  const psnEarned = signals?.psn?.trophies_earned;
  const psnTotal = signals?.psn?.trophies_total;
  if (psnEarned != null && psnTotal != null && Number(psnTotal) > 0) {
    const earned = Number(psnEarned);
    const total = Number(psnTotal);
    const percent = Math.round((earned / total) * 100);
    return { percent, earned, total, label: "Trophies", source: "PlayStation" };
  }

  // Then Xbox achievements
  const xbEarned = signals?.xbox?.achievements_earned;
  const xbTotal = signals?.xbox?.achievements_total;
  if (xbEarned != null && xbTotal != null && Number(xbTotal) > 0) {
    const earned = Number(xbEarned);
    const total = Number(xbTotal);
    const percent = Math.round((earned / total) * 100);
    return { percent, earned, total, label: "Achievements", source: "Xbox" };
  }

  // Then RetroAchievements
  const raEarned = signals?.ra?.numAwardedToUser;
  const raTotal = signals?.ra?.numAchievements;
  if (raEarned != null && raTotal != null && Number(raTotal) > 0) {
    const earned = Number(raEarned);
    const total = Number(raTotal);
    const percent = Math.round((earned / total) * 100);
    return { percent, earned, total, label: "Achievements", source: "RetroAchievements" };
  }

  return { percent: null, earned: null, total: null, label: null, source: null };
}

function minutesToRoundedHours(mins: number): number {
  return Math.round(mins / 60);
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

function pill(bg: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: bg,
    fontSize: 13,
    fontWeight: 900 as const,
    color: "#0f172a",
    whiteSpace: "nowrap" as const,
  };
}

function actionBtn(active: boolean) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: active ? "#0f172a" : "white",
    color: active ? "white" : "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}

function sortEarnedFirst<T extends { earned?: boolean; earned_at?: string | null; earnedAt?: string | null; name?: string | null; achievement_name?: string | null }>(
  items: T[]
) {
  return [...items].sort((a, b) => {
    const ea = Boolean(a.earned);
    const eb = Boolean(b.earned);
    if (ea !== eb) return ea ? -1 : 1;

    const da = a.earned_at ?? a.earnedAt ?? null;
    const db = b.earned_at ?? b.earnedAt ?? null;
    const ta = da ? new Date(da).getTime() : 0;
    const tb = db ? new Date(db).getTime() : 0;
    if (ta !== tb) return tb - ta;

    const na = (a.name ?? a.achievement_name ?? "").toLowerCase();
    const nb = (b.name ?? b.achievement_name ?? "").toLowerCase();
    return na.localeCompare(nb);
  });
}

function computeEarnedSummary(items: Array<{ earned?: boolean }>) {
  const total = items.length;
  const earned = items.filter((x) => Boolean(x.earned)).length;
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { total, earned, percent };
}

// Simple per-release cache (memory)
const psnTrophyCache = new Map<string, { fetchedAt: string; trophies: Trophy[] }>();

function cacheKey(releaseId: string) {
  return `psn_trophies:${releaseId}`;
}

function sortTrophiesEarnedFirst(items: Trophy[]): Trophy[] {
  return [...items].sort((a, b) => {
    const ae = a.earned ? 1 : 0;
    const be = b.earned ? 1 : 0;

    // earned first
    if (ae !== be) return be - ae;

    // within earned: most recently earned first
    if (a.earned && b.earned) {
      const at = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
      const bt = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
      if (at !== bt) return bt - at;
    }

    // within not-earned: stable order (by trophyId asc)
    return (a.trophyId ?? 0) - (b.trophyId ?? 0);
  });
}

export default function ReleaseDetailPage() {
  const params = useParams<{ id: string }>();
  const releaseId = params?.id;
  

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio>(null);
  const [psnGroups, setPsnGroups] = useState<any[]>([]);
  const [communitySnapshot, setCommunitySnapshot] = useState<any>(null);
  const [playedOn, setPlayedOn] = useState<{ items: any[] } | null>(null);
  const [releaseMeta, setReleaseMetaData] = useState<any>(null);
  const [releaseVersions, setReleaseVersions] = useState<any[]>([]);
  const [relatedGames, setRelatedGames] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any>(null);
  const [cultural, setCultural] = useState<any>(null);
  const [community, setCommunity] = useState<any>(null);
  const [editorial, setEditorial] = useState<any>(null);
  const [signalSources, setSignalSources] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Trophy dropdown state
  const [trophyOpen, setTrophyOpen] = useState(false);

  const [achievementOpen, setAchievementOpen] = useState(false);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementErr, setAchievementErr] = useState("");
  const [achievementData, setAchievementData] = useState<any | null>(null);

  // For actions
  const [myLists, setMyLists] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Trophy state (PSN) - for main column display
  const [psnTrophies, setPsnTrophies] = useState<Trophy[] | null>(null);
  const [psnTrophyErr, setPsnTrophyErr] = useState<string>("");
  const [psnTrophyLoading, setPsnTrophyLoading] = useState(false);
  const [psnTrophyNote, setPsnTrophyNote] = useState<string>("");

  // Achievement state (Xbox) - for main column display
  const [xboxAchievements, setXboxAchievements] = useState<Achievement[] | null>(null);
  const [xboxAchievementErr, setXboxAchievementErr] = useState<string>("");
  const [xboxAchievementLoading, setXboxAchievementLoading] = useState(false);
  const [xboxAchievementNote, setXboxAchievementNote] = useState<string>("");

  // RetroAchievements (RA)
  const [raAchievements, setRaAchievements] = useState<any[] | null>(null);
  const [raErr, setRaErr] = useState("");
  const [raLoading, setRaLoading] = useState(false);
  const [raNote, setRaNote] = useState("");
  const [raStatus, setRaStatus] = useState<"unmapped" | "no_set" | "has_set" | null>(null);
  const [raFetchedAt, setRaFetchedAt] = useState<string | null>(null);
  const [raGameId, setRaGameId] = useState<number | null>(null);

  // Achievement state (Steam) - for main column display
  const [steamAchievements, setSteamAchievements] = useState<Achievement[] | null>(null);
  const [steamAchievementErr, setSteamAchievementErr] = useState("");
  const [steamAchievementLoading, setSteamAchievementLoading] = useState(false);
  const [steamAchievementNote, setSteamAchievementNote] = useState("");

  const genresList = useMemo(() => {
    const g: any = release?.games?.genres;
    if (!g) return [];
    if (Array.isArray(g)) return g.filter(Boolean);
    if (typeof g === "string") return [g];
    return [];
  }, [release]);

  function minutesToHours(min: number | null | undefined) {
    const m = Number(min || 0);
    if (!isFinite(m) || m <= 0) return "0h";
    const h = Math.round((m / 60) * 10) / 10;
    return `${h}h`;
  }

  function pct(v: number | null | undefined) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return null;
    return Math.max(0, Math.min(100, n));
  }

  const platformLine = useMemo(() => {
    const label = (release as any)?.platform_label ?? null;
    const name = release?.platform_name ?? null;
    return (label || name) ?? "—";
  }, [release]);

  async function load() {
    if (!releaseId) return;

    try {
      setLoading(true);
      setErr("");

      console.log(`[ReleaseDetailPage] Loading release ${releaseId}`);
      const res = await fetch(`/api/releases/${releaseId}`, { cache: "no-store" });
      const text = await res.text();
      const data: ApiPayload | null = text ? JSON.parse(text) : null;

      console.log(`[ReleaseDetailPage] API response:`, { status: res.status, ok: res.ok, hasRelease: !!data?.release, platformKey: data?.release?.platform_key });

      if (!res.ok) throw new Error((data as any)?.error || `Failed (${res.status})`);

      const r: ReleaseDetail | null = data?.release ?? null;
      console.log(`[ReleaseDetailPage] Setting release:`, { id: r?.id, platform_key: r?.platform_key });
      setRelease(r);
      console.log("release.platform_key", r?.platform_key, "release.id", r?.id);
      console.log("signals.steam", (data as any)?.signals?.steam);
      setSignals((data?.signals ?? null) as Signals | null);
      setPortfolio((data?.portfolio ?? null) as Portfolio);
      setPsnGroups(Array.isArray((data as any)?.psnGroups) ? (data as any).psnGroups : []);
      setCommunitySnapshot((data as any)?.community_snapshot ?? null);
      setPlayedOn((data as any)?.played_on ?? null);
      setReleaseMetaData((data as any)?.release_meta ?? null);
      setReleaseVersions(Array.isArray((data as any)?.release_versions) ? (data as any).release_versions : []);
      setRelatedGames(Array.isArray((data as any)?.related_games) ? (data as any).related_games : []);
      setTimeline((data as any)?.timeline ?? null);
      setCultural((data as any)?.cultural ?? null);
      setCommunity((data as any)?.community ?? null);
      setEditorial((data as any)?.editorial ?? null);
      setSignalSources(Array.isArray((data as any)?.signal_sources) ? (data as any).signal_sources : []);
    } catch (e: any) {
      console.error(`[ReleaseDetailPage] Error loading release:`, e);
      setErr(e?.message || "Failed to load release");
      setRelease(null);
      setPortfolio(null);
      setSignals(null);
      setPsnGroups([]);
      setCommunitySnapshot(null);
      setPlayedOn(null);
      setReleaseMetaData(null);
      setReleaseVersions([]);
      setRelatedGames([]);
      setTimeline(null);
      setCultural(null);
      setCommunity(null);
      setEditorial(null);
      setSignalSources([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRelease() {
    if (!releaseId) return;
    const res = await fetch(`/api/releases/${releaseId}?_=${Date.now()}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setRelease(json?.release ?? null);
      setSignals((json?.signals ?? null) as Signals | null);
      setPortfolio((json?.portfolio ?? null) as Portfolio);
      setPsnGroups(Array.isArray(json?.psnGroups) ? json.psnGroups : []);
      setCommunitySnapshot(json?.community_snapshot ?? null);
      setPlayedOn(json?.played_on ?? null);
      setReleaseMetaData(json?.release_meta ?? null);
      setReleaseVersions(Array.isArray(json?.release_versions) ? json.release_versions : []);
      setRelatedGames(Array.isArray(json?.related_games) ? json.related_games : []);
      setTimeline(json?.timeline ?? null);
      setCultural(json?.cultural ?? null);
      setCommunity(json?.community ?? null);
      setEditorial(json?.editorial ?? null);
      setSignalSources(Array.isArray(json?.signal_sources) ? json.signal_sources : []);
    }
  }

  async function setReleaseMeta(patch: any) {
    await fetch("/api/portfolio/release-meta/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ release_id: releaseId, ...patch }),
    });
    await refreshRelease();
  }

  function toggleOwned(
    key: "owned_digital" | "owned_physical" | "owned_rented",
    current: boolean | null
  ) {
    const next = current === null ? true : current === true ? false : null;
    setReleaseMeta({ [key]: next });
  }

  async function loadAchievements() {
    if (!releaseId) return;

    try {
      setAchievementErr("");
      setAchievementLoading(true);

      const res = await fetch(`/api/releases/${releaseId}/achievements`, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      setAchievementData(data);
    } catch (e: any) {
      setAchievementErr(e?.message || "Failed to load achievements");
      setAchievementData(null);
    } finally {
      setAchievementLoading(false);
    }
  }

  async function loadPsnTrophies() {
    if (!releaseId) return;

    try {
      setPsnTrophyLoading(true);
      setPsnTrophyErr("");
      setPsnTrophyNote("");

      const res = await fetch(`/api/psn/trophies?release_id=${encodeURIComponent(releaseId)}`, {
        cache: "no-store",
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      const fetchedAt = new Date().toISOString();
      const trophies: Trophy[] = Array.isArray(data?.trophies) ? data.trophies : [];

      // sort before caching + rendering
      const sorted = sortTrophiesEarnedFirst(trophies);

      setPsnTrophyNote(data?.note || `Fresh • fetched ${new Date(fetchedAt).toLocaleString()}`);
      setPsnTrophies(sorted);

      // write caches
      psnTrophyCache.set(String(releaseId), { fetchedAt, trophies: sorted });
      try {
        localStorage.setItem(cacheKey(String(releaseId)), JSON.stringify({ fetchedAt, trophies: sorted }));
      } catch {
        // ignore quota issues
      }
    } catch (e: any) {
      setPsnTrophyErr(e?.message || "Failed to load trophies");
      setPsnTrophies(null);
    } finally {
      setPsnTrophyLoading(false);
    }
  }

  async function loadRaAchievements(force = false) {
    if (!releaseId) return;

    try {
      setRaLoading(true);
      setRaErr("");
      setRaNote("");

      const res = await fetch(
        `/api/ra/achievements?release_id=${encodeURIComponent(releaseId)}${force ? "&force=1" : ""}`,
        { cache: "no-store" }
      );
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setRaNote(data?.note || "");
      setRaStatus(data?.ra_status ?? null);
      setRaFetchedAt(data?.fetched_at ?? null);
      setRaGameId(data?.ra_game_id ?? null);
      setRaAchievements(Array.isArray(data?.achievements) ? data.achievements : []);
    } catch (e: any) {
      setRaErr(e?.message || "Failed to load RetroAchievements");
      setRaAchievements(null);
    } finally {
      setRaLoading(false);
    }
  }

  async function loadXboxAchievements() {
    if (!releaseId) return;

    try {
      setXboxAchievementLoading(true);
      setXboxAchievementErr("");
      setXboxAchievementNote("");

      const res = await fetch(`/api/releases/${releaseId}/achievements`, {
        cache: "no-store",
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        const errorMsg = data?.error || `Failed (${res.status})`;
        // Provide user-friendly error messages
        if (res.status === 401 || errorMsg.includes("authenticate") || errorMsg.includes("access token")) {
          throw new Error("Xbox authentication failed. Please reconnect your Xbox account in settings.");
        }
        throw new Error(errorMsg);
      }

      setXboxAchievementNote(data?.warning || data?.note || "");
      const achievements = Array.isArray(data?.achievements) ? data.achievements : [];
      setXboxAchievements(achievements);
    } catch (e: any) {
      console.error(`[loadXboxAchievements] Error:`, e);
      setXboxAchievementErr(e?.message || "Failed to load achievements");
      setXboxAchievements(null);
    } finally {
      setXboxAchievementLoading(false);
    }
  }

  async function loadSteamAchievements() {
    if (!releaseId) return;

    try {
      setSteamAchievementLoading(true);
      setSteamAchievementErr("");
      setSteamAchievementNote("");

      const res = await fetch(
        `/api/steam/achievements?release_id=${encodeURIComponent(releaseId)}`,
        { cache: "no-store" }
      );

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        const errorMsg = data?.error || `Failed (${res.status})`;
        if (res.status === 400 && String(errorMsg).toLowerCase().includes("steam not connected")) {
          throw new Error("Steam not connected. Add your Steam ID in profile/settings.");
        }
        throw new Error(errorMsg);
      }

      setSteamAchievementNote(data?.note || "");
      setSteamAchievements(Array.isArray(data?.achievements) ? data.achievements : []);
    } catch (e: any) {
      setSteamAchievementErr(e?.message || "Failed to load Steam achievements");
      setSteamAchievements(null);
    } finally {
      setSteamAchievementLoading(false);
    }
  }

  useEffect(() => {
    if (!releaseId) return;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        console.log(`[ReleaseDetailPage] Loading release ${releaseId}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const res = await fetch(`/api/releases/${releaseId}`, { 
          cache: "no-store",
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        const text = await res.text();
        const data: ApiPayload | null = text ? JSON.parse(text) : null;

        console.log(`[ReleaseDetailPage] API response:`, { 
          status: res.status, 
          ok: res.ok, 
          hasRelease: !!data?.release,
          platformKey: data?.release?.platform_key,
          error: (data as any)?.error 
        });

        if (!res.ok) throw new Error((data as any)?.error || `Failed (${res.status})`);

        const r: ReleaseDetail | null = data?.release ?? null;
        console.log(`[ReleaseDetailPage] Setting release:`, { id: r?.id, platform_key: r?.platform_key });
        setRelease(r);
        console.log("release.platform_key", r?.platform_key, "release.id", r?.id);
        setSignals((data?.signals ?? null) as Signals | null);
        setPortfolio((data?.portfolio ?? null) as Portfolio);
        setPsnGroups(Array.isArray((data as any)?.psnGroups) ? (data as any).psnGroups : []);
        setCommunitySnapshot((data as any)?.community_snapshot ?? null);
        setPlayedOn((data as any)?.played_on ?? null);
        setReleaseMetaData((data as any)?.release_meta ?? null);
        setReleaseVersions(Array.isArray((data as any)?.release_versions) ? (data as any).release_versions : []);
        setRelatedGames(Array.isArray((data as any)?.related_games) ? (data as any).related_games : []);
        setTimeline((data as any)?.timeline ?? null);
        setCultural((data as any)?.cultural ?? null);
        setCommunity((data as any)?.community ?? null);
        setEditorial((data as any)?.editorial ?? null);
        setSignalSources(Array.isArray((data as any)?.signal_sources) ? (data as any).signal_sources : []);
      } catch (e: any) {
        console.error(`[ReleaseDetailPage] Error loading release:`, e);
        setErr(e?.message || "Failed to load release");
        setRelease(null);
        setPortfolio(null);
        setSignals(null);
        setPsnGroups([]);
        setCommunitySnapshot(null);
        setPlayedOn(null);
        setReleaseMetaData(null);
      } finally {
        console.log(`[ReleaseDetailPage] Setting loading to false`);
        setLoading(false);
      }
    }

    load();
  }, [releaseId]);

  useEffect(() => {
    const fn = () => refreshRelease();
    window.addEventListener("gh:release_refresh", fn);
    return () => window.removeEventListener("gh:release_refresh", fn);
  }, [releaseId]);

  useEffect(() => {
    // auto-load trophies/achievements once per release page view
    if (!releaseId) return;
    if (!release) return;

    const key = String(release.platform_key || "").toLowerCase();
    
    // Auto-load PSN trophies for PSN releases
    if (key === "psn") {
      loadPsnTrophies();
    }
    
    // Auto-load Xbox achievements for Xbox releases (xbox, x360, xone, xsx)
    if (key === "xbox" || key === "x360" || key === "xone" || key === "xsx") {
      loadXboxAchievements();
    }

    // Auto-load Steam achievements for Steam releases
    if (key === "steam") {
      loadSteamAchievements();
    }

    // Note: RA achievements are loaded lazily when user clicks "Load" button.
    // This hydrates ra_achievement_cache, which then makes signals.ra show up on next page load.
    // This is consistent with Option A: mapping creates release_external_ids,
    // and first view of achievements hydrates the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId, release]);

  useEffect(() => {
    if (!releaseId) return;

    // 1) memory cache
    const mem = psnTrophyCache.get(String(releaseId));
    if (mem?.trophies?.length) {
      setPsnTrophies(mem.trophies);
      setPsnTrophyNote(`Cached • fetched ${new Date(mem.fetchedAt).toLocaleString()}`);
      return;
    }

    // 2) localStorage cache (optional)
    try {
      const raw = localStorage.getItem(cacheKey(String(releaseId)));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.trophies)) {
        setPsnTrophies(parsed.trophies);
        setPsnTrophyNote(`Cached • fetched ${new Date(parsed.fetchedAt).toLocaleString()}`);
        psnTrophyCache.set(String(releaseId), { fetchedAt: parsed.fetchedAt, trophies: parsed.trophies });
      }
    } catch {
      // ignore
    }
  }, [releaseId]);

  useEffect(() => {
    fetch("/api/lists", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMyLists(Array.isArray(d) ? d : []))
      .catch(() => setMyLists([]));
  }, []);

  async function saveStatus(nextStatus: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/portfolio/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId, status: nextStatus }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Saved ✅");
      setTimeout(() => setMsg(""), 900);
      await load(); // refresh entry/signals
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addToList(listId: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, release_id: releaseId }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Added to list ✅");
      setTimeout(() => setMsg(""), 900);
    } catch (e: any) {
      setMsg(e?.message || "Add failed");
    } finally {
      setSaving(false);
    }
  }

  const currentStatus = portfolio?.status ?? null;

  const statusUiValue =
    currentStatus === "completed"
      ? "played"
      : currentStatus === "back_burner"
        ? "backlog"
        : currentStatus ?? "";

  const platformKey = String(release?.platform_key || "").toLowerCase();
  const isSteamRelease = platformKey === "steam";

  // Canonical Steam playtime
  const steamMinutes = isSteamRelease ? Number((signals as any)?.steam?.playtime_minutes ?? 0) : 0;

  useEffect(() => {
    if (!release) return;
    console.log("[ReleasePage steam debug]", {
      releaseId,
      platform_key: release.platform_key,
      portfolio_playtime: (portfolio as any)?.playtime_minutes ?? null,
      signal_playtime: (signals as any)?.steam?.playtime_minutes ?? null,
      steamMinutes,
      signals_steam: (signals as any)?.steam ?? null,
    });
  }, [releaseId, release, portfolio, signals, steamMinutes]);
  
  // Check if this is an Xbox release (xbox, x360, xone, xsx)
  const isXboxRelease = platformKey === "xbox" || platformKey === "x360" || platformKey === "xone" || platformKey === "xsx";
  const psnMinutes = Number((signals as any)?.psn?.playtime_minutes ?? 0);
  const psnProgress = (signals as any)?.psn?.trophy_progress ?? null;

  // Temporary fix: show Steam if signal exists, even if platform_key isn't "steam"
  const hasSteamSignal = Boolean((signals as any)?.steam?.playtime_minutes != null);
  const hasSteam = hasSteamSignal && steamMinutes > 0;
  const hasPsn = !!signals?.psn;
  const hasXbox = !!signals?.xbox;

  // Calculate Steam achievement counts
  const steamAchievementsEarned = steamAchievements ? steamAchievements.filter((a) => a.earned).length : null;
  const steamAchievementsTotal = steamAchievements ? steamAchievements.length : null;

  const lastSignal = useMemo(() => {
    const a = portfolio?.updated_at ?? null;
    const b = signals?.psn?.last_updated_at ?? null;
    const c = signals?.xbox?.last_updated_at ?? null;
    const times = [a, b, c]
      .filter(Boolean)
      .map((x) => new Date(String(x)).getTime())
      .filter((t) => isFinite(t));
    if (!times.length) return null;
    const max = Math.max(...times);
    return timeAgo(new Date(max).toISOString());
  }, [signals]);

  const meta = releaseMeta ?? null;

  const playtime = pickPlaytimeMinutes(signals, portfolio);
  const hoursPlayed = playtime.minutes != null ? minutesToRoundedHours(playtime.minutes) : null;

  const completion = pickCompletion(signals);

  const replays = meta?.replays ?? null;

  // If you stored identity_tier in release_meta, keep this around for the header chip
  const identityTier = meta?.identity_tier ?? null;

  // Owned flags (manual)
  const ownedDigital = meta?.owned_digital ?? null;
  const ownedPhysical = meta?.owned_physical ?? null;
  const ownedRented = meta?.owned_rented ?? null;

  const inCatalog = !!portfolio;

  // Source-of-truth: API finals + editorial fallback (editorial from state)
  // title/cover from API finals (works even when release.games is empty)
  const title = release?.display_title_final ?? release?.display_title ?? release?.games?.canonical_title ?? "Untitled";
  const cover = release?.cover_url ?? "/images/placeholder-cover.png";

  // year/platform from existing (fine)
  const year = release?.games?.first_release_year ?? release?.first_release_year ?? null;
  const platform = release?.platform_label ?? release?.platform_name ?? null;

  // dev/pub from API finals (since games fields may be null)
  const developer = release?.dev_final ?? release?.games?.developer ?? null;
  const publisher = release?.pub_final ?? release?.games?.publisher ?? null;

  // summary: editorial > IGDB summary > null
  const summaryText = editorial?.summary ?? release?.games?.summary ?? null;

  // tags: editorial > genres_normalized > computed fallbacks
  const heroTags = (() => {
    const tags = Array.isArray(editorial?.tags) ? editorial.tags : [];
    const genres = Array.isArray(release?.genres_normalized) ? release.genres_normalized : [];
    const computed: string[] = [];

    const t = String(title).toLowerCase();
    const p = String(platform ?? "").toLowerCase();

    if (p.includes("snes") || p.includes("super nintendo")) computed.push("16-bit");
    if (p.includes("genesis") || p.includes("mega drive")) computed.push("16-bit");
    if (p.includes("nintendo 64") || p.includes("n64")) computed.push("3D Era");
    if (p.includes("game boy")) computed.push("Handheld");
    if (p.includes("ps5") || p.includes("playstation 5")) computed.push("Modern");
    if (t.includes("madden") || t.includes("nfl")) computed.push("Sports");

    // de-dupe + cap
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of [...tags, ...genres, ...computed]) {
      const s = String(x || "").trim();
      const k = s.toLowerCase();
      if (!s || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 6) break;
    }
    return out;
  })();

  const hasIgdbEnrichment =
    !!release?.games?.igdb_game_id &&
    (!!release?.games?.summary || (release?.genres_normalized?.length ?? 0) > 0);

  return (
    <div id="top" className="min-h-screen bg-[#0B0F14] text-[#EAF0FF]">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <Link href="/my-portfolio" style={{ color: "#2563eb" }}>
            ← Back to My Portfolio
          </Link>
          <Link href="/gamehome" style={{ color: "#2563eb" }}>
            GameHome →
          </Link>
        </div>

        {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}
        {err && (
          <div style={{ 
            background: "#fee2e2", 
            border: "2px solid #ef4444", 
            padding: 20, 
            borderRadius: 8,
            marginBottom: 20 
          }}>
            <div style={{ fontWeight: 900, marginBottom: 10, color: "#991b1b" }}>Error Loading Release</div>
            <div style={{ color: "#991b1b" }}>{err}</div>
            <div style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>
              Release ID: {releaseId || "none"}
            </div>
          </div>
        )}

        {!loading && release && (
          <div className="grid grid-cols-1 gap-6">
            {/* Hero */}
            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Cover */}
                <div
                  className="w-full md:w-[240px] h-[300px] md:h-[300px] rounded-2xl border border-[#25304A] bg-[#0B0F14] bg-center bg-cover shrink-0"
                  style={{ backgroundImage: `url(${cover})` }}
                  aria-label="Cover"
                />

                {/* Title + chips + summary */}
                <div className="min-w-0 flex-1">
                  <div className="text-4xl font-extrabold tracking-tight">{title}</div>

                  <div className="mt-2 text-sm opacity-75 flex flex-wrap gap-x-3 gap-y-1">
                    {year ? <span>{year}</span> : null}
                    {platform ? <span>• {platform}</span> : null}
                    {developer ? <span>• {developer}</span> : null}
                    {publisher && publisher !== developer ? <span>• {publisher}</span> : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {/* Platform chip */}
                    {platform ? <span className={chipClass}>{platform}</span> : null}

                    {/* IGDB chip (only when we have IGDB + genres or summary) */}
                    {hasIgdbEnrichment ? (
                      <span className={chipClass}>IGDB</span>
                    ) : null}

                    {/* Identity tier chip (manual) - uses same color as selected in Your History */}
                    {identityTier ? (
                      <span
                        className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs border hover:opacity-90 transition-colors"
                        style={{
                          borderColor: `${getIdentityTierColor(identityTier)}30`,
                          backgroundColor: `${getIdentityTierColor(identityTier)}15`,
                          color: getIdentityTierColor(identityTier),
                        }}
                      >
                        {identityTier}
                      </span>
                    ) : null}
                  </div>

                  {heroTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {heroTags.map((t: string) => (
                        <span
                          key={t}
                          className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-[#F1F5F9]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 text-base leading-relaxed text-[#B6C2E2]">
                    {summaryText ? summaryText : <span className="opacity-60">—</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* LEFT COLUMN */}
            <div className="space-y-6">
              {/* Left rail (Add to Story / Your History) */}
          <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
            {!inCatalog ? (
              <>
                <div className="text-2xl font-bold">Add This Game to Your Story</div>
                <div className="mt-1 text-sm opacity-70">
                  Track it, shape your identity, and see how it fits your journey.
                </div>

                <div className="mt-6 text-xs opacity-60">ACTIVITY STATE</div>

                <div className="grid gap-2.5 mt-2">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("played")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "completed"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Played
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("playing")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "playing"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Playing
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("backlog")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "back_burner"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Backlog
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("wishlist")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "wishlist"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Wishlist
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("owned")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "owned"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Owned
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveStatus("dropped")}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition
                        ${currentStatus === "dropped"
                          ? "border-[#FBBF24] bg-[rgba(251,191,36,0.12)] text-[#EAF0FF]"
                          : "border-[#25304A] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.09)]"}
                        ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Dropped
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <AddToListMenu releaseId={releaseId} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-2xl font-bold">Your History</div>
                  <div className="mt-1 text-sm opacity-70">
                    Your relationship with this game, across platforms and time.
                  </div>
                  {signalSources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {signalSources.map((s: any) => (
                        <span
                          key={s.key}
                          className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-[#F1F5F9]"
                          title={s.last_updated_at ? `Last updated: ${s.last_updated_at}` : undefined}
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                  {/* Left controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusMenu
                      value={statusUiValue}
                      onSelect={(v) => saveStatus(v)}
                      disabled={saving}
                    />

                    <IdentityTierMenu releaseId={releaseId} value={identityTier} />
                  </div>

                  {/* Right actions */}
                  <div className="flex items-center gap-2">
                    <AddToListMenu releaseId={releaseId} />

                    <button
                      type="button"
                      disabled
                      className="px-4 py-2 rounded-xl border border-[#5B3B00] bg-[rgba(251,191,36,0.12)] text-sm font-semibold text-[#FBBF24] opacity-60 cursor-not-allowed hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors"
                      title="Coming soon"
                    >
                      ⚡ Smart Playlist
                    </button>
                  </div>
                </div>

                {/* Figma-style stats block */}
                <div className="mt-8 grid grid-cols-12 gap-8">
                  <div className="col-span-12 md:col-span-4">
                    <div className="text-xs opacity-70">HOURS PLAYED</div>
                    <div className="mt-2 text-5xl font-semibold leading-none">
                      {hoursPlayed ?? "—"}
                    </div>
                    {playtime.source ? (
                      <div className="mt-2 text-xs opacity-60">Source: {playtime.source}</div>
                    ) : (
                      <div className="mt-2 text-xs opacity-60">
                        Connect Steam/PlayStation to auto-import playtime.
                      </div>
                    )}

                    <div className="mt-6 text-xs opacity-70">REPLAYS</div>
                    <div className="mt-2 text-4xl font-semibold leading-none">
                      {replays ?? "—"}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-sm underline opacity-80 hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors rounded px-1 -mx-1"
                      onClick={() => {
                        const v = window.prompt("How many replays? (leave blank to clear)", replays == null ? "" : String(replays));
                        if (v === null) return;
                        const n = v.trim() === "" ? null : Number(v);
                        if (n != null && (!Number.isFinite(n) || n < 0)) {
                          alert("Please enter a number 0 or higher (or leave blank to clear).");
                          return;
                        }
                        setReleaseMeta({ replays: n });
                      }}
                    >
                      + Add
                    </button>
                  </div>

                  <div className="col-span-12 md:col-span-4">
                    <div>
                      <div className="text-xs text-[#A8B0BF] uppercase tracking-wide mb-1">Completion</div>
                      <div className="text-3xl font-bold text-[#F1F5F9]">
                        {completion.percent != null ? `${completion.percent}%` : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gamepad2 size={14} className="text-[#A8B0BF]" />
                        <div className="text-xs text-[#A8B0BF]">
                          {completion.earned != null && completion.total != null
                            ? `${completion.earned} / ${completion.total} ${completion.label ?? "Trophies"}`
                            : "Connect platforms to track completion"}
                        </div>
                      </div>

                      <div className="w-full h-1.5 bg-[#1A1F29] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#F2B84B] to-[#F2C75C] rounded-full"
                          style={{ width: `${completion.percent ?? 0}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          document.getElementById("achievements")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="mt-2 inline-block text-sm text-[#A8B0BF] hover:text-[#F1F5F9] hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors underline underline-offset-4 rounded px-1 -mx-1"
                      >
                        View all trophies & achievements
                      </button>
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-4">
                    <PlayedOnPicker
                      releaseId={releaseId}
                      selected={playedOn?.items ?? []}
                      availableHardware={playedOn?.available_hardware ?? []}
                      emuHardware={playedOn?.emu_hardware ?? []}
                      onChanged={refreshRelease}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-4">
                    <div className="pt-6 border-t border-[#222833]">
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-[#A8B0BF] uppercase tracking-wide">Owned</div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleOwned("owned_digital", ownedDigital)}
                            className={`p-1.5 rounded-md transition-colors hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 ${
                              ownedDigital === true
                                ? "bg-[#F2B84B]/20 text-[#F2B84B]"
                                : "bg-transparent text-[#6B7280] hover:text-[#A8B0BF]"
                            }`}
                            title="Digital"
                          >
                            <HardDrive size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleOwned("owned_physical", ownedPhysical)}
                            className={`p-1.5 rounded-md transition-colors hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 ${
                              ownedPhysical === true
                                ? "bg-[#F2B84B]/20 text-[#F2B84B]"
                                : "bg-transparent text-[#6B7280] hover:text-[#A8B0BF]"
                            }`}
                            title="Physical"
                          >
                            <Disc size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleOwned("owned_rented", ownedRented)}
                            className={`p-1.5 rounded-md transition-colors hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 ${
                              ownedRented === true
                                ? "bg-[#F2B84B]/20 text-[#F2B84B]"
                                : "bg-transparent text-[#6B7280] hover:text-[#A8B0BF]"
                            }`}
                            title="Rental"
                          >
                            <Receipt size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

              <BelowTheFold
                release={release}
                portfolio={portfolio ?? undefined}
                signals={signals ?? undefined}
                editorial={editorial}
                community={community ?? undefined}
              />

              {false && (
              <>
              {/* Signals (hidden for now — conflicts with Figma layout) */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Signals</div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <ProgressBlock
                    signals={[
                      ...(isSteamRelease && signals?.steam
                        ? [
                            {
                              source: "steam" as const,
                              label: "Steam",
                              playtimeMinutes: signals?.steam?.playtime_minutes ?? undefined,
                              earned: steamAchievementsEarned ?? undefined,
                              total: steamAchievementsTotal ?? undefined,
                            },
                          ]
                        : []),
                      ...(signals?.psn
                        ? [
                            {
                              source: "psn" as const,
                              label: "PlayStation",
                              playtimeMinutes: signals?.psn?.playtime_minutes ?? undefined,
                              earned: signals?.psn?.trophies_earned ?? undefined,
                              total: signals?.psn?.trophies_total ?? undefined,
                            },
                          ]
                        : []),
                      ...(signals?.ra
                        ? [
                            {
                              source: "ra" as const,
                              label: "RetroAchievements",
                              earned: signals?.ra?.numAwardedToUser ?? undefined,
                              total: signals?.ra?.numAchievements ?? undefined,
                              ra_status: signals?.ra?.ra_status ?? undefined,
                              lastUpdatedAt: signals?.ra?.last_updated_at ?? null,
                            },
                          ]
                        : []),
                    ]}
                  />

                  {/* PSN progress bar */}
                  {signals?.psn && pct(signals?.psn?.trophy_progress) != null ? (
                    <div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: "#e5e7eb",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: 10,
                            width: `${pct(signals?.psn?.trophy_progress)}%`,
                            background: "#0f172a",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Xbox */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>Xbox</div>
                    <div style={{ color: "#0f172a", textAlign: "right" }}>
                      {signals?.xbox ? (
                        <>
                          <div>
                            {signals?.xbox?.gamerscore_total ? (
                              <span>
                                ✖︎ {signals?.xbox?.gamerscore_earned ?? 0}/{signals?.xbox?.gamerscore_total}
                              </span>
                            ) : (
                              <span style={{ color: "#64748b" }}>✖︎ —</span>
                            )}
                          </div>
                          <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                            {signals?.xbox?.achievements_total ? (
                              <span>
                                🏅 {signals?.xbox?.achievements_earned ?? 0}/{signals?.xbox?.achievements_total}
                              </span>
                            ) : (
                              <span>🏅 —</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#64748b" }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </>
              )}

              {false && (
              <>
              {/* Old trophies section hidden — replaced by AchievementsAccordionCard */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 900 }}>Trophies</div>

                  <button
                    onClick={async () => {
                      const next = !trophyOpen;
                      setTrophyOpen(next);
                      if (next && !psnTrophies && !psnTrophyLoading) {
                        await loadPsnTrophies();
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {trophyOpen ? "Hide" : "View"}
                  </button>
                </div>

                {trophyOpen && (
                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "white",
                      overflow: "hidden",
                    }}
                  >
                    {psnTrophyLoading && (
                      <div style={{ padding: 12, color: "#64748b" }}>
                        Loading trophies…
                      </div>
                    )}

                    {psnTrophyErr && (
                      <div style={{ padding: 12, color: "#b91c1c" }}>
                        {psnTrophyErr}
                      </div>
                    )}

                    {!psnTrophyLoading && !psnTrophyErr && psnTrophies && (() => {
                      const psnTrophiesSorted = sortEarnedFirst(psnTrophies);
                      return (
                        <div style={{ padding: 12 }}>
                          <TrophyList trophies={psnTrophiesSorted} />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              </>
              )}

              {/* Achievements (lazy) - show for any release with Xbox signal data */}
              {signals?.xbox && (signals.xbox.achievements_total != null || signals.xbox.gamerscore_total != null) && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>Achievements</div>

                    <button
                      onClick={async () => {
                        const next = !achievementOpen;
                        setAchievementOpen(next);
                        if (next && !achievementData && !achievementLoading) {
                          await loadAchievements();
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {achievementOpen ? "Hide" : "View"}
                    </button>
                  </div>

                  {achievementOpen && (
                    <div
                      style={{
                        marginTop: 10,
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        background: "white",
                        overflow: "hidden",
                      }}
                    >
                      {achievementLoading && <div style={{ padding: 12, color: "#64748b" }}>Loading achievements…</div>}
                      {achievementErr && <div style={{ padding: 12, color: "#b91c1c" }}>{achievementErr}</div>}

                      {!achievementLoading && !achievementErr && achievementData && (
                        <div style={{ padding: 12 }}>
                          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                            {achievementData.cached ? "Cached" : "Fresh"} • fetched{" "}
                            {achievementData.fetched_at ? new Date(achievementData.fetched_at).toLocaleString() : ""}
                            {achievementData.title_id && (
                              <> • Title ID: {achievementData.title_id}</>
                            )}
                          </div>

                          {achievementData.achievements && Array.isArray(achievementData.achievements) && achievementData.achievements.length > 0 ? (
                            <AchievementList achievements={achievementData.achievements} earned={achievementData.earned || []} />
                          ) : (
                            <div style={{ color: "#64748b", padding: 12 }}>
                              No achievements found. This might mean the game has no achievements, or they haven't been loaded yet.
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!achievementLoading && !achievementErr && !achievementData && (
                        <div style={{ padding: 12, color: "#64748b" }}>
                          Click "View" to load achievements.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6">
            {/* GameHome Community Snapshot */}
            {(() => {
              const cs = communitySnapshot;
              const avgRating =
                cs?.avg_member_rating != null ? Number(cs.avg_member_rating).toFixed(1) : "—";
              const inLibraries =
                cs?.in_libraries != null ? Number(cs.in_libraries).toLocaleString() : "—";
              const completionRate =
                cs?.completion_rate != null ? `${cs.completion_rate}%` : "—";
              const playingNow =
                cs?.playing_now != null ? Number(cs.playing_now).toLocaleString() : "—";
              const mostCommonIdentity = cs?.most_common_identity ?? "—";

              return (
                <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
                  <div style={{ fontWeight: 1000, marginBottom: 10 }}>GameHome Community Snapshot</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>In libraries</div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{inLibraries}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Completion rate</div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{completionRate}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Playing now</div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{playingNow}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Avg rating</div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{avgRating}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Most common identity</div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{mostCommonIdentity}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {false && (
            <>
            {/* Signals (hidden for now — replaced by summary inside Your History + Achievements accordion) */}
            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div style={{ fontWeight: 1000, marginBottom: 10 }}>Signals</div>

              {(() => {
                const progressSignals: ProgressSignal[] = [];

                if (signals?.steam) {
                  progressSignals.push({
                    source: "steam",
                    label: "Steam",
                    playtimeMinutes: signals.steam.playtime_minutes ?? portfolio?.playtime_minutes ?? undefined,
                    progressPct:
                      steamAchievementsTotal != null && steamAchievementsTotal > 0
                        ? Math.round(
                            ((steamAchievementsEarned ?? 0) / steamAchievementsTotal) * 100
                          )
                        : undefined,
                    earned: steamAchievementsEarned ?? undefined,
                    total: steamAchievementsTotal ?? undefined,
                    lastUpdatedAt: signals.steam.last_updated_at ?? null,
                  });
                }

                if (signals?.psn) {
                  progressSignals.push({
                    source: "psn",
                    label: "PlayStation",
                    progressPct: signals.psn.trophy_progress ?? undefined,
                    earned: signals.psn.trophies_earned ?? undefined,
                    total: signals.psn.trophies_total ?? undefined,
                    playtimeMinutes: signals.psn.playtime_minutes ?? undefined,
                    lastUpdatedAt: signals.psn.last_updated_at ?? null,
                  });
                }

                if (signals?.xbox) {
                  progressSignals.push({
                    source: "xbox",
                    label: "Xbox",
                    earned: signals.xbox.achievements_earned ?? undefined,
                    total: signals.xbox.achievements_total ?? undefined,
                    scoreEarned: signals.xbox.gamerscore_earned ?? undefined,
                    scoreTotal: signals.xbox.gamerscore_total ?? undefined,
                    lastUpdatedAt: signals.xbox.last_updated_at ?? null,
                  });
                }

                if (signals?.ra) {
                  progressSignals.push({
                    source: "ra",
                    label: "RetroAchievements",
                    progressPct:
                      signals.ra.numAchievements != null && signals.ra.numAchievements > 0
                        ? Math.round(
                            ((signals.ra.numAwardedToUser ?? 0) /
                              signals.ra.numAchievements) *
                              100
                          )
                        : undefined,
                    earned: signals.ra.numAwardedToUser ?? undefined,
                    total: signals.ra.numAchievements ?? undefined,
                    ra_status: signals.ra.ra_status ?? undefined,
                    lastUpdatedAt: signals.ra.last_updated_at ?? null,
                  });
                }

                return <ProgressBlock signals={progressSignals} />;
              })()}
            </div>
            </>
            )}

            {false && (
            <>
            {/* OLD TROPHIES UI (disabled - replaced by AchievementsAccordionCard) */}
            {/* Trophies (PSN) */}
            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Trophies (PlayStation)</div>

                <button
                  type="button"
                  onClick={loadPsnTrophies}
                  disabled={psnTrophyLoading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {psnTrophyLoading ? "Loading…" : psnTrophies ? "Refresh" : "Load trophies"}
                </button>
              </div>

              {psnTrophyErr ? (
                <div style={{ color: "#b91c1c", marginTop: 6 }}>{psnTrophyErr}</div>
              ) : null}

              {psnTrophyNote ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>{psnTrophyNote}</div>
              ) : null}

              {(psnTrophies?.length ?? -1) === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No trophies found for this release yet.
                </div>
              ) : null}

              {(psnTrophies?.length ?? 0) > 0 ? (() => {
                const psnTrophiesSorted = sortEarnedFirst(psnTrophies!);
                const psnTrophySummary = computeEarnedSummary(psnTrophiesSorted);
                return (
                  <>
                    {/* Summary row */}
                    {psnTrophySummary ? (
                      <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
                        Earned <b>{psnTrophySummary.earned}</b> / {psnTrophySummary.total} • <b>{psnTrophySummary.percent}%</b>
                      </div>
                    ) : null}

                    {/* Trophy grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 10,
                        marginTop: 10,
                      }}
                    >
                      {psnTrophiesSorted.map((t) => (
                      <div
                        key={t.trophyId}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                          background: t.earned ? "#f8fafc" : "white",
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          {t.iconUrl ? (
                            <img
                              src={t.iconUrl}
                              alt={t.name ?? "Trophy"}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : null}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                              {t.name ?? "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                              {t.earned ? " • ✅" : ""}
                            </div>
                          </div>

                          <div style={{ color: "#334155", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                            {t.description ?? "—"}
                          </div>

                          {t.earned && t.earnedAt ? (
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                              Earned: {new Date(t.earnedAt).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                );
              })() : null}
            </div>
            </>
            )}

            {false && (
            <>
            {/* OLD ACHIEVEMENTS UI (disabled - replaced by AchievementsAccordionCard) */}
            {/* Achievements (Xbox) - only show for Xbox releases */}
            {isXboxRelease && (
            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Achievements (Xbox)</div>

                <button
                  type="button"
                  onClick={loadXboxAchievements}
                  disabled={xboxAchievementLoading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {xboxAchievementLoading ? "Loading…" : xboxAchievements ? "Refresh" : "Load achievements"}
                </button>
              </div>

              {xboxAchievementErr ? (
                <div style={{ 
                  color: "#b91c1c", 
                  marginTop: 6, 
                  padding: 12, 
                  background: "#fee2e2", 
                  borderRadius: 8,
                  border: "1px solid #fca5a5"
                }}>
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>Error loading achievements</div>
                  <div>{xboxAchievementErr}</div>
                  {xboxAchievementErr.includes("authentication") || xboxAchievementErr.includes("reconnect") ? (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <Link href="/xbox-connect" style={{ color: "#2563eb", textDecoration: "underline" }}>
                        Reconnect Xbox account →
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {xboxAchievementNote ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>{xboxAchievementNote}</div>
              ) : null}

              {/* Always show status message */}
              {xboxAchievementLoading ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>Loading achievements...</div>
              ) : xboxAchievementErr ? null : xboxAchievements === null ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  Click "Load achievements" to fetch achievements.
                </div>
              ) : (xboxAchievements?.length ?? 0) === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No achievements found for this release yet.
                </div>
              ) : null}

              {(xboxAchievements?.length ?? 0) > 0 ? (() => {
                const xboxAchievementsSorted = sortEarnedFirst(xboxAchievements!);
                const xboxSummary = computeEarnedSummary(xboxAchievementsSorted);
                return (
                  <>
                    {/* Summary row */}
                    {xboxSummary ? (
                      <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
                        Earned <b>{xboxSummary.earned}</b> / {xboxSummary.total} • <b>{xboxSummary.percent}%</b>
                      </div>
                    ) : null}

                    {/* Achievement grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 10,
                        marginTop: 10,
                      }}
                    >
                      {xboxAchievementsSorted.map((a) => (
                      <div
                        key={a.achievement_id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                          background: a.earned ? "#f8fafc" : "white",
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          {a.achievement_icon_url ? (
                            <img
                              src={a.achievement_icon_url}
                              alt={a.achievement_name ?? "Achievement"}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : null}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                              {a.achievement_name ?? "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                              {a.gamerscore ? `${a.gamerscore}G` : ""}
                              {a.earned ? " • ✅" : ""}
                            </div>
                          </div>

                          <div style={{ color: "#334155", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                            {a.achievement_description ?? "—"}
                          </div>

                          {a.rarity_percentage != null ? (
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                              {a.rarity_percentage.toFixed(1)}% of players have this
                            </div>
                          ) : null}

                          {a.earned_at ? (
                            <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                              Earned: {new Date(a.earned_at).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    </div>
                  </>
                );
              })() : null}
            </div>
          )}
            </>
            )}

            {false && (
            <>
            {/* OLD RETROACHIEVEMENTS UI (disabled - replaced by AchievementsAccordionCard) */}
          {/* RetroAchievements (RA) */}
            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Achievements (RetroAchievements)</div>
                  {raGameId ? (
                    <a
                      href={`https://retroachievements.org/game/${raGameId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, textDecoration: "underline", opacity: 0.8, color: "#2563eb" }}
                    >
                      View on RetroAchievements
                    </a>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => loadRaAchievements(false)}
                    disabled={raLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {raLoading ? "Loading…" : raAchievements ? "Refresh (cached)" : "Load"}
                  </button>

                  <button
                    type="button"
                    onClick={() => loadRaAchievements(true)}
                    disabled={raLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    title="Forces a fresh pull from RA API"
                  >
                    Force refresh
                  </button>
                </div>
              </div>

              {raErr ? <div style={{ color: "#b91c1c", marginTop: 6 }}>{raErr}</div> : null}
              {raNote ? <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>{raNote}</div> : null}

              {/* Show status messages */}
              {!raErr && raStatus === "unmapped" && (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  Not mapped
                </div>
              )}
              {!raErr && raStatus === "no_set" && (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No set exists yet (community-created)
                  {raFetchedAt && (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>
                      • Checked {raFetchedAt ? new Date(raFetchedAt as string).toLocaleDateString() : ""}
                    </span>
                  )}
                </div>
              )}

              {(raAchievements?.length ?? -1) === 0 && raStatus !== "unmapped" && raStatus !== "no_set" ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No RetroAchievements found for this release yet.
                </div>
              ) : null}

              {(raAchievements?.length ?? 0) > 0 ? (() => {
                const raAchievementsSorted = sortEarnedFirst(raAchievements!);
                const raSummary = computeEarnedSummary(raAchievementsSorted);
                return (
                  <>
                    {raSummary ? (
                      <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
                        Earned <b>{raSummary.earned}</b> / {raSummary.total} • <b>{raSummary.percent}%</b>
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 10,
                        marginTop: 10,
                      }}
                    >
                      {raAchievementsSorted.map((a: any) => (
                          <div
                            key={a.achievement_id || a.id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 12,
                              padding: 10,
                              background: a.earned ? "#f8fafc" : "white",
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            {a.achievement_icon_url ? (
                              <div
                                style={{
                                  width: 64,
                                  height: 64,
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  flexShrink: 0,
                                  background: "#f1f5f9",
                                }}
                              >
                                <img
                                  src={a.achievement_icon_url}
                                  alt={a.achievement_name ?? "Achievement"}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onError={(e) => {
                                    // Fallback if image fails to load
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              </div>
                            ) : null}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                  {a.achievement_name || a.title || "—"}
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                                  {a.gamerscore != null ? `${a.gamerscore} pts` : a.points != null ? `${a.points} pts` : ""}
                                </div>
                              </div>

                              <div style={{ fontSize: 12, fontWeight: 900, color: a.earned ? "#166534" : "#64748b", marginTop: 4 }}>
                                {a.earned ? "Earned ✅" : "Not earned"}
                              </div>

                              <div style={{ color: "#334155", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                                {a.achievement_description || a.description || "—"}
                              </div>

                              {a.earned && a.earned_at ? (
                                <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                                  Earned: {new Date(a.earned_at).toLocaleString()}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                );
              })() : null}
            </div>
            </>
            )}

            {false && (
            <>
            {/* OLD STEAM ACHIEVEMENTS UI (disabled - replaced by AchievementsAccordionCard) */}
            {/* Achievements (Steam) - only show for Steam releases */}
            {isSteamRelease && (
              <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Achievements (Steam)</div>

                  <button
                    type="button"
                    onClick={loadSteamAchievements}
                    disabled={steamAchievementLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {steamAchievementLoading ? "Loading…" : steamAchievements ? "Refresh" : "Load achievements"}
                  </button>
                </div>

                {steamAchievementErr ? (
                  <div style={{ color: "#b91c1c", marginTop: 6 }}>{steamAchievementErr}</div>
                ) : null}

                {steamAchievementNote ? (
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>{steamAchievementNote}</div>
                ) : null}

                {steamAchievementLoading ? (
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>Loading achievements…</div>
                ) : (steamAchievements?.length ?? 0) === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    No Steam achievements found for this app.
                  </div>
                ) : null}

                {(steamAchievements?.length ?? 0) > 0 ? (() => {
                  const steamAchievementsSorted = sortEarnedFirst(steamAchievements!);
                  const steamSummary = computeEarnedSummary(steamAchievementsSorted);
                  return (
                    <>
                      {steamSummary ? (
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
                          Earned <b>{steamSummary.earned}</b> / {steamSummary.total} • <b>{steamSummary.percent}%</b>
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                          gap: 10,
                          marginTop: 10,
                        }}
                      >
                        {steamAchievementsSorted.map((a: any) => (
                        <div
                          key={a.achievement_id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 12,
                            padding: 10,
                            background: a.earned ? "#f8fafc" : "white",
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#f8fafc",
                              overflow: "hidden",
                              flexShrink: 0,
                            }}
                          >
                            {a.achievement_icon_url ? (
                              <img
                                src={a.achievement_icon_url}
                                alt={a.achievement_name ?? "Achievement"}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : null}
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                {a.achievement_name ?? "—"}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                                {a.earned ? " • ✅" : ""}
                              </div>
                            </div>

                            <div style={{ color: "#334155", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                              {a.achievement_description ?? "—"}
                            </div>

                            {a.earned && a.earned_at ? (
                              <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                                Earned: {new Date(a.earned_at).toLocaleString()}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      </div>
                    </>
                  );
                })() : null}
              </div>
            )}
            </>
            )}

            {/* TODO slots (we'll wire these next): Tags, Media, Related games, etc */}
            {/* Trophy groups (only shown if game has DLC with separate trophy lists) */}
            {psnGroups.length > 0 && (
              <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
                <div style={{ fontWeight: 1000, marginBottom: 10 }}>DLC Trophy Progress</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {psnGroups.map((g: any) => (
                    <span
                      key={String(g.trophy_group_id)}
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        color: "#0f172a",
                        fontWeight: 800,
                      }}
                      title={g.trophy_group_name || `Group ${g.trophy_group_id}`}
                    >
                      🏆 {g.progress != null ? `${Math.round(Number(g.progress))}%` : "—"}{" "}
                      <span style={{ color: "#64748b", fontWeight: 700 }}>
                        ({g.earned ?? 0}/{g.total ?? 0})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Achievements (details / deep dive) - near bottom */}
            {releaseId && (
              <div id="achievements" className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
                <AchievementsAccordionCard releaseId={releaseId} signals={signals} />
              </div>
            )}

            <div className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Next: tags (emoji), developer/publisher pages, and media carousel like GameTrack.
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrophyList({ trophies }: { trophies: Trophy[] }) {
  const items = Array.isArray(trophies) ? trophies : [];
  if (!items.length) return <div style={{ color: "#64748b" }}>No trophies returned.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((t) => (
        <div
          key={t.trophyId}
          style={{
            opacity: t.earned ? 1 : 0.4,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {t.iconUrl && (
            <img src={t.iconUrl} width={40} height={40} />
          )}

          <div>
            <div style={{ fontWeight: 700 }}>
              {t.name}
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {t.description}
            </div>

            {t.earned ? (
              <div style={{ fontSize: 12, color: "#16a34a" }}>
                Earned {t.earnedAt ? `• ${new Date(t.earnedAt).toLocaleDateString()}` : ""}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Not earned
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AchievementList({ achievements, earned }: { achievements: any[]; earned: any[] }) {
  const earnedSet = new Set(
    (earned || [])
      .map((a: any) => String(a?.achievement_id ?? ""))
      .filter(Boolean)
  );

  const items = Array.isArray(achievements) ? achievements : [];
  if (!items.length) return <div style={{ color: "#64748b" }}>No achievements returned.</div>;

  // Merge earned status from both earned array and earned field
  const itemsWithEarned = items.map((a: any) => {
    const key = String(a?.achievement_id ?? "");
    const isEarned = earnedSet.has(key) || Boolean(a?.earned);
    return { ...a, earned: isEarned };
  });

  const sortedItems = sortEarnedFirst(itemsWithEarned);
  const summary = computeEarnedSummary(sortedItems);

  return (
    <div>
      {summary ? (
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
          Earned <b>{summary.earned}</b> / {summary.total} • <b>{summary.percent}%</b>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        {sortedItems.map((a: any) => {
        const key = String(a?.achievement_id ?? "");
        // Use the merged earned status from sorting
        const isEarned = Boolean(a.earned);

        const name = a?.achievement_name ?? "Untitled achievement";
        const description = a?.achievement_description ?? "";
        const gamerscore = a?.gamerscore != null ? Number(a.gamerscore) : null;
        const rarity = a?.rarity_percentage != null ? Number(a.rarity_percentage) : null;
        const icon = a?.achievement_icon_url ?? null;

        return (
          <div
            key={key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: 10,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: isEarned ? "#f0fdf4" : "#fff",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                flexShrink: 0,
              }}
            >
              {icon ? (
                <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                  {name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {gamerscore != null && (
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
                      ✖︎ {gamerscore}G
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 900, color: isEarned ? "#166534" : "#64748b" }}>
                    {isEarned ? "Earned" : "Not earned"}
                  </div>
                </div>
              </div>

              {description ? (
                <div style={{ marginTop: 4, color: "#334155", lineHeight: 1.4, fontSize: 13 }}>
                  {description}
                </div>
              ) : null}

              {isEarned && a?.earned_at ? (
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                  Unlocked: {new Date(a.earned_at).toLocaleString()}
                </div>
              ) : null}

              {rarity != null && (
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                  {rarity.toFixed(2)}% of players have this
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
