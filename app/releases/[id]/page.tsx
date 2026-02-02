"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ProgressBlock, { type ProgressSignal } from "@/components/progress/ProgressBlock";


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

function chip() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    fontSize: 12,
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

  const title = useMemo(() => {
    return release?.display_title ?? release?.games?.canonical_title ?? "Untitled";
  }, [release]);

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
    } catch (e: any) {
      console.error(`[ReleaseDetailPage] Error loading release:`, e);
      setErr(e?.message || "Failed to load release");
      setRelease(null);
      setPortfolio(null);
      setSignals(null);
      setPsnGroups([]);
    } finally {
      setLoading(false);
    }
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
      } catch (e: any) {
        console.error(`[ReleaseDetailPage] Error loading release:`, e);
        setErr(e?.message || "Failed to load release");
        setRelease(null);
        setPortfolio(null);
        setSignals(null);
        setPsnGroups([]);
      } finally {
        console.log(`[ReleaseDetailPage] Setting loading to false`);
        setLoading(false);
      }
    }

    load();
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

  // Backloggd-ish “quick actions”
  const currentStatus = String(portfolio?.status ?? "owned");

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

  return (
    <div style={{ padding: 24 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          {/* Left rail (Backloggd-ish controls) */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              background: "white",
              padding: 14,
              height: "fit-content",
              position: "sticky",
              top: 16,
            }}
          >
            {/* cover */}
            <div
              style={{
                width: "100%",
                height: 360,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: (() => {
                  const coverUrl = release.games?.cover_url ?? release.cover_url;
                  const cover =
                    coverUrl &&
                    !coverUrl.includes("unknown.png") &&
                    !coverUrl.includes("placeholder")
                      ? coverUrl
                      : "/images/placeholder-cover.png";
                  return `center / cover no-repeat url(${cover})`;
                })(),
                marginBottom: 12,
              }}
              aria-label="Cover"
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("played")}
                  style={actionBtn(currentStatus === "played")}
                >
                  Played
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("playing")}
                  style={actionBtn(currentStatus === "playing")}
                >
                  Playing
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("backlog")}
                  style={actionBtn(currentStatus === "backlog")}
                >
                  Backlog
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("wishlist")}
                  style={actionBtn(currentStatus === "wishlist")}
                >
                  Wishlist
                </button>
              </div>

              {/* Secondary statuses (optional but useful) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("owned")}
                  style={actionBtn(currentStatus === "owned")}
                >
                  Owned
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("dropped")}
                  style={actionBtn(currentStatus === "dropped")}
                >
                  Dropped
                </button>
              </div>

              {/* Add to list */}
              {myLists.length > 0 && (
                <select
                  defaultValue=""
                  disabled={saving}
                  onChange={(e) => {
                    const listId = e.target.value;
                    if (!listId) return;
                    addToList(listId);
                    e.currentTarget.value = "";
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                  }}
                >
                  <option value="">Add to list…</option>
                  {myLists.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {(l.title ?? l.name) || "Untitled list"}
                    </option>
                  ))}
                </select>
              )}

              {msg ? <div style={{ color: "#64748b", fontSize: 13 }}>{msg}</div> : null}

              {/* Signals */}
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
                              playtimeMinutes: signals.steam.playtime_minutes ?? undefined,
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
                              playtimeMinutes: signals.psn.playtime_minutes ?? undefined,
                              earned: signals.psn.trophies_earned ?? undefined,
                              total: signals.psn.trophies_total ?? undefined,
                            },
                          ]
                        : []),
                      ...(signals?.ra
                        ? [
                            {
                              source: "ra" as const,
                              label: "RetroAchievements",
                              earned: signals.ra.numAwardedToUser ?? undefined,
                              total: signals.ra.numAchievements ?? undefined,
                              ra_status: signals.ra.ra_status ?? undefined,
                              lastUpdatedAt: signals.ra.last_updated_at ?? null,
                            },
                          ]
                        : []),
                    ]}
                  />

                  {/* PSN progress bar */}
                  {signals?.psn && pct(signals.psn.trophy_progress) != null ? (
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
                            width: `${pct(signals.psn.trophy_progress)}%`,
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
                            {signals.xbox.gamerscore_total ? (
                              <span>
                                ✖︎ {signals.xbox.gamerscore_earned ?? 0}/{signals.xbox.gamerscore_total}
                              </span>
                            ) : (
                              <span style={{ color: "#64748b" }}>✖︎ —</span>
                            )}
                          </div>
                          <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                            {signals.xbox.achievements_total ? (
                              <span>
                                🏅 {signals.xbox.achievements_earned ?? 0}/{signals.xbox.achievements_total}
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

              {/* Trophies (lazy) */}
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
          </div>

          {/* Main panel (Minimap-ish metadata + content) */}
          <div style={{ display: "grid", gap: 16 }}>
            {/* Header */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 1000, lineHeight: 1.1 }}>{title}</div>

                  <div style={{ color: "#64748b", marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={chip()}>{platformLine}</span>
                    {release.games?.first_release_year ? <span style={chip()}>{release.games.first_release_year}</span> : null}
                    {release.games?.igdb_game_id ? <span style={chip()} title="Metadata enriched from IGDB">IGDB</span> : null}
                    {lastSignal ? <span style={chip()}>Last signal: {lastSignal}</span> : null}
                  </div>
                </div>

                {/* Tiny stats pills like Backloggd */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {hasSteamSignal && steamMinutes > 0 && (() => {
                    const steamSummary = steamAchievements && steamAchievements.length > 0 ? computeEarnedSummary(steamAchievements) : null;
                    return (
                      <span style={pill("#ecfeff")}>
                        Steam {minutesToHours(steamMinutes)}
                        {steamSummary ? ` • ${steamSummary.earned}/${steamSummary.total} (${steamSummary.percent}%)` : ""}
                      </span>
                    );
                  })()}

                  {psnMinutes > 0 && (
                    <span style={pill("#f0f9ff")}>
                      PSN {minutesToHours(psnMinutes)}
                    </span>
                  )}

                  {psnProgress != null && (() => {
                    const psnTrophySummary = psnTrophies && psnTrophies.length > 0 ? computeEarnedSummary(psnTrophies) : null;
                    return (
                      <span style={pill("#f0f9ff")}>
                        PSN trophies {Math.round(Number(psnProgress))}%
                        {psnTrophySummary ? ` • ${psnTrophySummary.earned}/${psnTrophySummary.total} (${psnTrophySummary.percent}%)` : ""}
                      </span>
                    );
                  })()}

                  {hasXbox && signals.xbox?.gamerscore_total != null && Number(signals.xbox.gamerscore_total) > 0 ? (() => {
                    const xboxSummary = xboxAchievements && xboxAchievements.length > 0 ? computeEarnedSummary(xboxAchievements) : null;
                    const xboxAchievementsPercent = signals.xbox?.achievements_total != null && Number(signals.xbox.achievements_total) > 0
                      ? Math.round(((signals.xbox.achievements_earned ?? 0) / Number(signals.xbox.achievements_total)) * 100)
                      : null;
                    return (
                      <span style={pill("#f0fdf4")}>
                        Xbox GS {signals.xbox.gamerscore_earned ?? 0}/{signals.xbox.gamerscore_total}
                        {xboxSummary ? ` • ${xboxSummary.earned}/${xboxSummary.total} (${xboxSummary.percent}%)` : xboxAchievementsPercent != null ? ` • ${signals.xbox.achievements_earned ?? 0}/${signals.xbox.achievements_total} (${xboxAchievementsPercent}%)` : ""}
                      </span>
                    );
                  })() : null}

                  {raAchievements && raAchievements.length > 0 && (() => {
                    const raSummary = computeEarnedSummary(raAchievements);
                    return (
                      <span style={pill("#fef3c7")}>
                        RA {raSummary.earned}/{raSummary.total} ({raSummary.percent}%)
                      </span>
                    );
                  })()}

                  {!hasSteam && !hasPsn && !hasXbox && !raAchievements ? <span style={pill("#fff7ed")}>No sync signal</span> : null}
                </div>
              </div>
            </div>

            {/* Two-column content like Minimap */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16 }}>
              {/* Summary */}
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>Summary</div>
                <div style={{ color: "#334155", lineHeight: 1.6 }}>
                  {release.games?.summary ?? "—"}
                </div>
              </div>

              {/* Info (developer/publisher/platforms/genres) */}
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                  height: "fit-content",
                }}
              >
                <div style={{ fontWeight: 1000, marginBottom: 10 }}>Information</div>

                <div style={{ display: "grid", gap: 10, color: "#0f172a" }}>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Developer:</b>{" "}
                    {release.games?.developer ?? "—"}
                  </div>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Publisher:</b>{" "}
                    {release.games?.publisher ?? "—"}
                  </div>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Platform:</b> {platformLine}
                  </div>

                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Genres:</b>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {genresList.length ? (
                        genresList.map((g: string) => (
                          <span key={g} style={chip()}>
                            {g}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signals detail panel (explicitly shows what’s wired) */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
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

            {/* Trophies (PSN) */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
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

              {psnTrophies && psnTrophies.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No trophies found for this release yet.
                </div>
              ) : null}

              {psnTrophies && psnTrophies.length > 0 ? (() => {
                const psnTrophiesSorted = sortEarnedFirst(psnTrophies);
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

            {/* Achievements (Xbox) - only show for Xbox releases */}
            {isXboxRelease && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
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
              ) : xboxAchievements.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No achievements found for this release yet.
                </div>
              ) : null}

              {xboxAchievements && xboxAchievements.length > 0 ? (() => {
                const xboxAchievementsSorted = sortEarnedFirst(xboxAchievements);
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

          {/* RetroAchievements (RA) */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
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
                      • Checked {new Date(raFetchedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}

              {raAchievements && raAchievements.length === 0 && raStatus !== "unmapped" && raStatus !== "no_set" ? (
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                  No RetroAchievements found for this release yet.
                </div>
              ) : null}

              {raAchievements && raAchievements.length > 0 ? (() => {
                const raAchievementsSorted = sortEarnedFirst(raAchievements);
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

            {/* Achievements (Steam) - only show for Steam releases */}
            {isSteamRelease && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                }}
              >
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
                ) : steamAchievements && steamAchievements.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    No Steam achievements found for this app.
                  </div>
                ) : null}

                {steamAchievements && steamAchievements.length > 0 ? (() => {
                  const steamAchievementsSorted = sortEarnedFirst(steamAchievements);
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

            {/* TODO slots (we’ll wire these next): Tags, Media, Related games, etc */}
            {/* Trophy groups (only shown if game has DLC with separate trophy lists) */}
            {psnGroups.length > 0 && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                }}
              >
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

            <div style={{ color: "#64748b", fontSize: 13 }}>
              Next: tags (emoji), developer/publisher pages, and media carousel like GameTrack.
            </div>
          </div>
        </div>
      )}
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
