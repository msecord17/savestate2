"use client";

import React, { useMemo, useState } from "react";

type Props = {
  releaseId: string;
  signals: any;
};

type SourceKey = "psn" | "xbox" | "steam" | "ra";

type LoadState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  items: any[] | null;
  raw: any | null;
};

function firstArrayDeep(obj: any, depth = 0): any[] | null {
  if (!obj || depth > 6) return null;

  if (Array.isArray(obj)) return obj;

  if (typeof obj !== "object") return null;

  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (Array.isArray(v)) return v;
  }

  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    const found = firstArrayDeep(v, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractItems(payload: any): any[] {
  if (!payload) return [];
  // common keys
  const keys = ["trophies", "achievements", "items", "data", "list"];
  for (const k of keys) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
  }
  const deep = firstArrayDeep(payload);
  return Array.isArray(deep) ? deep : [];
}

function pickName(item: any): string {
  return (
    item?.name ??
    item?.title ??
    item?.trophy_name ??
    item?.trophyName ??
    item?.achievementName ??
    item?.displayName ??
    item?.label ??
    "Unnamed"
  );
}

function pickDesc(item: any): string | null {
  const d =
    item?.description ??
    item?.detail ??
    item?.desc ??
    item?.trophy_detail ??
    item?.achievementDescription ??
    null;
  if (typeof d === "string" && d.trim()) return d.trim();
  return null;
}

function isEarned(item: any): boolean {
  // try a bunch of common fields
  if (item?.earned === true) return true;
  if (item?.isEarned === true) return true;
  if (item?.unlocked === true) return true;
  if (item?.achieved === true) return true;
  if (item?.earnedDateTime) return true;
  if (item?.earned_at) return true;
  if (item?.earnedAt) return true;
  if (item?.unlockTime) return true;
  if (item?.dateEarned) return true;
  if (typeof item?.progress === "number" && item.progress >= 100) return true;
  return false;
}

function pickIcon(item: any): string | null {
  const url =
    item?.iconUrl ??
    item?.icon_url ??
    item?.achievement_icon_url ??
    item?.achievementIconUrl ??
    null;
  if (typeof url === "string" && url.trim()) return url.trim();
  return null;
}

function pickEarnedAt(item: any): string | null {
  const d =
    item?.earned_at ??
    item?.earnedAt ??
    item?.earnedDateTime ??
    item?.unlockTime ??
    item?.dateEarned ??
    null;
  if (typeof d === "string" && d.trim()) return d.trim();
  return null;
}

function hasSignalForSource(key: SourceKey, signals: any): boolean {
  if (!signals) return false;
  if (key === "psn") return !!signals.psn;
  if (key === "xbox") return !!signals.xbox;
  if (key === "steam") return !!signals.steam;
  if (key === "ra") return !!signals.ra;
  return false;
}

function summaryForSource(key: SourceKey, signals: any): { line: string; sub?: string } {
  if (key === "psn") {
    const e = signals?.psn?.trophies_earned;
    const t = signals?.psn?.trophies_total;
    const p = signals?.psn?.trophy_progress;
    if (e != null && t != null) return { line: `${e} / ${t} Trophies`, sub: p != null ? `${p}%` : undefined };
    return { line: "No trophy summary yet" };
  }

  if (key === "xbox") {
    const e = signals?.xbox?.achievements_earned;
    const t = signals?.xbox?.achievements_total;
    if (e != null && t != null) return { line: `${e} / ${t} Achievements` };
    return { line: "No achievement summary yet" };
  }

  if (key === "steam") {
    const mins = signals?.steam?.playtime_minutes;
    if (mins != null) return { line: `Steam linked`, sub: `${Math.round(Number(mins) / 60)}h played` };
    return { line: "Steam not linked (or no data yet)" };
  }

  // ra
  const e = signals?.ra?.numAwardedToUser;
  const t = signals?.ra?.numAchievements;
  if (e != null && t != null) return { line: `${e} / ${t} Achievements` };
  return { line: "No RetroAchievements set yet" };
}

export default function AchievementsAccordionCard({ releaseId, signals }: Props) {
  const allSources = useMemo(
    () =>
      [
        { key: "psn" as const, title: "PlayStation Trophies", url: `/api/psn/trophies?release_id=${encodeURIComponent(releaseId)}` },
        { key: "xbox" as const, title: "Xbox Achievements", url: `/api/releases/${encodeURIComponent(releaseId)}/achievements` },
        { key: "steam" as const, title: "Steam Achievements", url: `/api/steam/achievements?release_id=${encodeURIComponent(releaseId)}` },
        { key: "ra" as const, title: "RetroAchievements", url: `/api/ra/achievements?release_id=${encodeURIComponent(releaseId)}` },
      ] as const,
    [releaseId]
  );

  const sources = useMemo(
    () => allSources.filter((src) => hasSignalForSource(src.key, signals)),
    [allSources, signals]
  );

  const [state, setState] = useState<Record<SourceKey, LoadState>>({
    psn: { open: false, loading: false, error: null, items: null, raw: null },
    xbox: { open: false, loading: false, error: null, items: null, raw: null },
    steam: { open: false, loading: false, error: null, items: null, raw: null },
    ra: { open: false, loading: false, error: null, items: null, raw: null },
  });

  async function toggle(key: SourceKey, url: string) {
    const cur = state[key];
    const nextOpen = !cur.open;

    setState((s) => ({
      ...s,
      [key]: { ...s[key], open: nextOpen, error: null },
    }));

    // only fetch when opening the first time
    if (nextOpen && !cur.items && !cur.loading) {
      setState((s) => ({
        ...s,
        [key]: { ...s[key], loading: true, error: null },
      }));

      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = json?.error || `Request failed (${res.status})`;
          setState((s) => ({
            ...s,
            [key]: { ...s[key], loading: false, error: msg, raw: json, items: [] },
          }));
          return;
        }

        const items = extractItems(json);

        setState((s) => ({
          ...s,
          [key]: { ...s[key], loading: false, error: null, raw: json, items },
        }));
      } catch (e: any) {
        setState((s) => ({
          ...s,
          [key]: { ...s[key], loading: false, error: e?.message || "Network error", items: [] },
        }));
      }
    }
  }

  return (
    <div id="achievements" className="rounded-2xl border border-[#25304A] bg-[#121826] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Trophies & Achievements</div>
          <div className="mt-1 text-sm opacity-70">
            Summary up top. Full lists live here when you expand a section.
          </div>
        </div>
        <a href="#top" className="text-sm underline opacity-70">
          Back to top
        </a>
      </div>

      <div className="mt-6 space-y-3">
        {sources.length === 0 ? (
          <div className="text-sm text-[#A8B0BF] py-4">
            No trophy or achievement data for this release yet. Connect your accounts and sync to see progress here.
          </div>
        ) : null}
        {sources.map((src) => {
          const s = state[src.key];
          const summary = summaryForSource(src.key, signals);

          return (
            <div key={src.key} className="rounded-xl border border-[#25304A] bg-[#0F1624]">
              <button
                type="button"
                className="w-full px-4 py-4 flex items-center justify-between"
                onClick={() => toggle(src.key, src.url)}
              >
                <div className="text-left">
                  <div className="font-medium">{src.title}</div>
                  <div className="mt-1 text-sm opacity-70">
                    {summary.line}
                    {summary.sub ? <span className="opacity-60"> • {summary.sub}</span> : null}
                  </div>
                </div>
                <div className="text-sm opacity-70">{s.open ? "Hide" : "View"}</div>
              </button>

              {s.open ? (
                <div className="px-4 pb-4">
                  {s.loading ? (
                    <div className="text-sm opacity-70">Loading…</div>
                  ) : s.error ? (
                    <div className="text-sm text-red-300">Error: {s.error}</div>
                  ) : (s.items?.length ?? 0) === 0 ? (
                    <div className="text-sm opacity-70">
                      No items found yet. (Either not connected, not mapped, or the endpoint returned no list.)
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-[#A8B0BF] mb-3">
                        Showing first {Math.min(200, s.items!.length)} of {s.items!.length}
                      </div>
                      <div className="space-y-3">
                        {s.items!.slice(0, 200).map((item: any, idx: number) => {
                          const name = pickName(item);
                          const desc = pickDesc(item);
                          const earned = isEarned(item);
                          const icon = pickIcon(item);
                          const earnedAt = pickEarnedAt(item);

                          return (
                            <div
                              key={idx}
                              className={`rounded-xl border p-4 flex items-start gap-4 transition-colors ${
                                earned
                                  ? "border-[#F2B84B]/40 bg-[#F2B84B]/10"
                                  : "border-[#25304A] bg-[#0B0F14] opacity-80"
                              }`}
                            >
                              {icon ? (
                                <div className="w-12 h-12 rounded-xl shrink-0 overflow-hidden border border-white/10 bg-white/5">
                                  <img src={icon} alt="" className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded-xl shrink-0 border border-white/10 bg-white/5 flex items-center justify-center">
                                  <div
                                    className={`h-3 w-3 rounded-full ${
                                      earned ? "bg-[#F2B84B]/80" : "bg-white/30"
                                    }`}
                                    title={earned ? "Earned" : "Not earned"}
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[#F1F5F9]">{name}</div>
                                {desc ? <div className="text-sm text-[#A8B0BF] mt-1 leading-relaxed">{desc}</div> : null}
                                <div className="mt-2 text-xs text-[#A8B0BF]">
                                  {earned ? (
                                    <span className="text-[#F2B84B]">
                                      Earned
                                      {earnedAt ? ` • ${new Date(earnedAt).toLocaleDateString()}` : ""}
                                    </span>
                                  ) : (
                                    <span>Not earned</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
