"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProgressBlock, { type ProgressSignal } from "@/components/progress/ProgressBlock";
import { ArchetypeDetailDrawer } from "@/components/ArchetypeDetailDrawer";
import { buildPayloadFromArchetypes } from "@/lib/archetypes/build-payload";
import { getArchetypeCatalogEntry } from "@/lib/archetypes/catalog";
import type { ArchetypeScore } from "@/lib/archetypes/score";
import type { ArchetypesPayload } from "@/lib/archetypes/insights-types";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";

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

function pillStyle(bg: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: bg,
    fontSize: 12,
    fontWeight: 900 as const,
    color: "#0f172a",
    whiteSpace: "nowrap" as const,
  };
}

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

export default function GameHomePage() {
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

  // Identity strip + drawer: from GET /api/insights/archetypes (payload.archetypes, insight)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [insightsPayload, setInsightsPayload] = useState<{
    archetypes?: { top: ArchetypeScore[]; primary_era?: string | null; primary_archetype?: string | null };
  } | null>(null);
  const [archetypePayload, setArchetypePayload] = useState<ArchetypesPayload | null>(null);
  const [insight, setInsight] = useState<{ headline: string; subline: string; compact_tag: string } | null>(null);

  function openArchetypeDrawer(key: string) {
    setDrawerKey(key);
    setDrawerOpen(true);
  }

  async function loadArchetypes() {
    try {
      const base = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_BASE_URL ?? "");
      const res = await fetch(`${base}/api/insights/archetypes`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok || !data.payload) return;
      const p = data.payload;
      if (p.archetypes != null) {
        setInsightsPayload({
          archetypes: {
            ...p.archetypes,
            primary_era: p.archetypes.primary_era ?? null,
            primary_archetype: p.archetypes.primary_archetype ?? null,
          },
        });
        setArchetypePayload(buildPayloadFromArchetypes(p.archetypes));
      } else {
        setArchetypePayload(p as ArchetypesPayload);
      }
      if (data.insight && typeof data.insight === "object") {
        setInsight({
          headline: data.insight.headline ?? "",
          subline: data.insight.subline ?? "",
          compact_tag: data.insight.compact_tag ?? "",
        });
      }
    } catch {
      // ignore; drawer falls back to fixture-only
    }
  }

  async function load(cursor?: string | null) {
    const isAppend = Boolean(cursor);
    if (isAppend) setLoadingMore(true);
    else setLoading(true);
    setErr("");
    try {
      const mode = splitByPlatform ? "release" : "game";
      const url = cursor
        ? `/api/gamehome?mode=${mode}&cursor=${encodeURIComponent(cursor)}`
        : `/api/gamehome?mode=${mode}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (text.trim().startsWith("<")) throw new Error("Server returned HTML (auth redirect?)");
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      const arr = Array.isArray(data?.cards) ? data.cards : [];
      if (isAppend) {
        setCards((prev) => [...prev, ...arr]);
      } else {
        setCards(arr);
      }
      setNextCursor(data?.next_cursor ?? null);
      setHasMore(Boolean(data?.has_more));
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
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
    load();
  }, [splitByPlatform]);

  useEffect(() => {
    loadArchetypes();
  }, []);

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
  }, [cards, platform, source, status, updatedRecently, sort]);

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>Game Home</h1>
        <p style={{ color: "#64748b", marginBottom: 20 }}>
          Your cross-platform game library at a glance.
        </p>

        {err ? (
          <div
            style={{
              padding: 12,
              background: "#fee",
              border: "1px solid #fcc",
              borderRadius: 8,
              color: "#c00",
            }}
          >
            {err}
          </div>
        ) : null}

        {/* Identity strip: era chip + archetype chip + blended insight line; chips open drawer */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            Your style
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            {insightsPayload?.archetypes?.primary_era && (
              <button
                type="button"
                onClick={() => openArchetypeDrawer(`era_${insightsPayload.archetypes.primary_era}`)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "var(--archetype-era, #34d399)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                {getArchetypeCatalogEntry(`era_${insightsPayload.archetypes.primary_era}`)?.label ?? insightsPayload.archetypes.primary_era}
              </button>
            )}
            {insightsPayload?.archetypes?.primary_archetype && (
              <button
                type="button"
                onClick={() => openArchetypeDrawer(insightsPayload.archetypes!.primary_archetype!)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: getArchetypeCatalogEntry(insightsPayload.archetypes!.primary_archetype!)?.color_token ?? "#f8fafc",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                {getArchetypeCatalogEntry(insightsPayload.archetypes!.primary_archetype!)?.label ?? insightsPayload.archetypes!.primary_archetype}
              </button>
            )}
            {(insightsPayload?.archetypes?.top ?? []).map((a) =>
              a.key !== insightsPayload?.archetypes?.primary_archetype ? (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => openArchetypeDrawer(a.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  {a.tier && (
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
                      {a.tier === "core" ? "Core" : a.tier === "strong" ? "Strong" : "Emerging"} ·{" "}
                    </span>
                  )}
                  {a.name}
                </button>
              ) : null
            )}
          </div>
          {insight && (insight.headline || insight.subline || insight.compact_tag) && (
            <p style={{ marginTop: 10, fontSize: 14, color: "#64748b" }}>
              {insight.headline && <strong style={{ color: "#0f172a" }}>{insight.headline}</strong>}
              {insight.subline && ` · ${insight.subline}`}
              {insight.compact_tag && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>{insight.compact_tag}</span>
              )}
            </p>
          )}
        </section>

        <ArchetypeDetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          archetypeKey={drawerKey}
          archetypesTop={insightsPayload?.archetypes?.top ?? []}
        />

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Loading...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Platform:
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  {platforms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Source:
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  <option value="all">all</option>
                  <option value="Steam">Steam</option>
                  <option value="PSN">PSN</option>
                  <option value="Xbox">Xbox</option>
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Status:
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Sort:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  <option value="recent">Recent</option>
                  <option value="title">Title</option>
                </select>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={updatedRecently}
                  onChange={(e) => setUpdatedRecently(e.target.checked)}
                />
                Recently updated (3d)
              </label>

              <label
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={splitByPlatform}
                  onChange={(e) => setSplitByPlatform(e.target.checked)}
                />
                Split by platform
              </label>

              <div style={{ color: "#64748b", fontSize: 13 }}>
                Showing <b>{filtered.length}</b> / {cards.length}
              </div>
            </div>

            {/* Lanes (only show in game mode) */}
            {!splitByPlatform && continueCards.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Continue</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 16,
                  }}
                >
                  {continueCards.map((card: any) => {
                    const bestRel = bestRelease(card.releases ?? []);
                    const releaseId = bestRel?.release_id ?? null;
                    const platformKey = card?.platforms?.[0] ?? null;
                    const cover = resolveCoverUrl({
                      cover_url: card.cover_url,
                      platform_key: platformKey,
                    });
                    const fallback = getPlatformPlaceholder(platformKey);
                    if (!releaseId) return null;
                    return (
                      <Link key={releaseId} href={`/releases/${releaseId}`} style={{ display: "block" }}>
                        <div
                          style={{
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "rgba(24, 24, 27, 0.4)",
                            border: "1px solid rgba(39, 39, 42, 1)",
                          }}
                        >
                          <img
                            src={cover}
                            alt={card.title}
                            style={{
                              width: "100%",
                              aspectRatio: "16/9",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (img.src.endsWith(fallback)) return; // prevent infinite loop
                              img.src = fallback;
                            }}
                          />
                          <div style={{ padding: 12 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#a1a1aa",
                                marginTop: 4,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.platforms?.join(" • ")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {!splitByPlatform && playingCards.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Now Playing</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 16,
                  }}
                >
                  {playingCards.map((card: any) => {
                    const bestRel = bestRelease(card.releases ?? []);
                    const releaseId = bestRel?.release_id ?? null;
                    const platformKey = card?.platforms?.[0] ?? null;
                    const cover = resolveCoverUrl({
                      cover_url: card.cover_url,
                      platform_key: platformKey,
                    });
                    const fallback = getPlatformPlaceholder(platformKey);
                    if (!releaseId) return null;
                    return (
                      <Link key={releaseId} href={`/releases/${releaseId}`} style={{ display: "block" }}>
                        <div
                          style={{
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "rgba(24, 24, 27, 0.4)",
                            border: "1px solid rgba(39, 39, 42, 1)",
                          }}
                        >
                          <img
                            src={cover}
                            alt={card.title}
                            style={{
                              width: "100%",
                              aspectRatio: "16/9",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (img.src.endsWith(fallback)) return; // prevent infinite loop
                              img.src = fallback;
                            }}
                          />
                          <div style={{ padding: 12 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#a1a1aa",
                                marginTop: 4,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.platforms?.join(" • ")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {!splitByPlatform && (
              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>All Games</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 16,
                  }}
                >
                  {allCards.map((card: any) => {
                    const bestRel = bestRelease(card.releases ?? []);
                    const releaseId = bestRel?.release_id ?? null;
                    const platformKey = card?.platforms?.[0] ?? null;
                    const cover = resolveCoverUrl({
                      cover_url: card.cover_url,
                      platform_key: platformKey,
                    });
                    const fallback = getPlatformPlaceholder(platformKey);
                    if (!releaseId) return null;
                    return (
                      <Link key={releaseId} href={`/releases/${releaseId}`} style={{ display: "block" }}>
                        <div
                          style={{
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "rgba(24, 24, 27, 0.4)",
                            border: "1px solid rgba(39, 39, 42, 1)",
                          }}
                        >
                          <img
                            src={cover}
                            alt={card.title}
                            style={{
                              width: "100%",
                              aspectRatio: "16/9",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (img.src.endsWith(fallback)) return; // prevent infinite loop
                              img.src = fallback;
                            }}
                          />
                          <div style={{ padding: 12 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#a1a1aa",
                                marginTop: 4,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {card.platforms?.join(" • ")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {filtered.map((c, idx) => {
                const updated = timeAgo(c.lastSignalAt);
                const platformKey = splitByPlatform
                  ? (c.platform_key ?? null)
                  : (Array.isArray(c.platforms) ? c.platforms[0] : null) ?? null;
                const cover = resolveCoverUrl({
                  cover_url: c.cover_url,
                  platform_key: platformKey,
                });
                const fallback = getPlatformPlaceholder(platformKey);

                const hasSteam = Number(c.steam_playtime_minutes || 0) > 0;

                const hasPsn =
                  c.psn_playtime_minutes != null ||
                  c.psn_trophy_progress != null ||
                  (c as any).psn_last_updated_at != null;

                const hasXbox =
                  c.xbox_gamerscore_total != null ||
                  c.xbox_achievements_total != null ||
                  (c as any).xbox_last_updated_at != null;

                const showPsnTrophies = c.psn_trophy_progress != null;
                const showXboxGS = (c.xbox_gamerscore_total ?? 0) > 0;

                // Ensure unique key in both modes (append idx so same game on multiple platforms after "Show more" doesn't duplicate key)
                const baseKey = splitByPlatform
                  ? (c.release_id ?? `${c.title}-${idx}`)
                  : (c.game_id ?? c.release_id ?? `${c.title}-${idx}`);
                const uniqueKey = `${baseKey}-${idx}`;

                return (
                  <div
                    key={uniqueKey}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    {c.release_id ? (
                      <Link
                        href={`/releases/${c.release_id}`}
                        style={{
                          display: "block",
                          height: 140,
                          position: "relative",
                          overflow: "hidden",
                          cursor: "pointer",
                        }}
                      >
                        <img
                          src={cover || fallback}
                          alt={c.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src.endsWith(fallback)) return; // prevent infinite loop
                            img.src = fallback;
                          }}
                        />
                      </Link>
                    ) : (
                      <div
                        style={{
                          height: 140,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={cover || fallback}
                          alt={c.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src.endsWith(fallback)) return; // prevent infinite loop
                            img.src = fallback;
                          }}
                        />
                      </div>
                    )}

                    <div style={{ padding: 12 }}>
                      {/* Title */}
                      <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.25 }}>
                        {c.title}
                      </div>

                      {/* Platform(s) */}
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 4,
                          marginBottom: 10,
                        }}
                      >
                        {(Array.isArray((c as any).platforms)
                          ? (c as any).platforms
                          : [c.platform_label || c.platform_name || c.platform_key]
                        )
                          .filter(Boolean)
                          .map((p: string) => (
                            <span
                              key={p}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "#f1f5f9",
                                border: "1px solid #e5e7eb",
                                fontWeight: 700,
                                color: "#0f172a",
                              }}
                            >
                              {p}
                            </span>
                          ))}
                      </div>

                      {c.lastSignalAt && (
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                          Last activity: <b>{timeAgo(c.lastSignalAt)}</b>
                        </div>
                      )}

                      {/* indicator pills */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                        {/* Status (primary) */}
                        <span
                          style={{
                            ...pillStyle(
                              c.status === "completed"
                                ? "#ecfeff"
                                : c.status === "playing"
                                ? "#eef2ff"
                                : c.status === "wishlist"
                                ? "#f8fafc"
                                : "#fff7ed"
                            ),
                            fontWeight: 900,
                          }}
                        >
                          {c.status || "owned"}
                        </span>

                        {/* Sync signals */}
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#64748b" }}>
                          {hasSteam && <span>Steam</span>}
                          {hasPsn && <span>PSN</span>}
                          {hasXbox && <span>Xbox</span>}
                          {!hasSteam && !hasPsn && !hasXbox && (
                            <span style={{ color: "#b45309" }}>No sync signal</span>
                          )}
                        </div>
                      </div>

                      {/* details block */}
                      {(() => {
                        const signals: ProgressSignal[] = [];

                        if (hasSteam) {
                          signals.push({
                            source: "steam",
                            label: "Steam",
                            playtimeMinutes: c.steam_playtime_minutes,
                            lastUpdatedAt: c.lastSignalAt ?? null,
                          });
                        }

                        if (hasPsn) {
                          signals.push({
                            source: "psn",
                            label: "PSN",
                            progressPct: c.psn_trophy_progress ?? undefined,
                            earned: c.psn_trophies_earned ?? undefined,
                            total: c.psn_trophies_total ?? undefined,
                          });
                        }

                        return <ProgressBlock signals={signals} />;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div style={{ marginTop: 24, textAlign: "center" }}>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 700,
                    cursor: loadingMore ? "not-allowed" : "pointer",
                    color: "#0f172a",
                  }}
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
