"use client";

import { useEffect, useState } from "react";
import type { PublicProfilePayload } from "@/lib/public-profile";
import { getTimelineStatsAndStandouts } from "@/lib/identity/normalize-timeline";
import IdentityShareCard from "@/components/identity/IdentityShareCard";

function payloadToShareData(payload: PublicProfilePayload) {
  const { user, identity } = payload;
  const t = payload?.timeline ?? payload;
  const { stats } = getTimelineStatsAndStandouts(payload);
  const eras = (t as { eras?: Array<{ era: string; games: number; releases: number }> })?.eras ?? [];
  const eraBuckets =
    identity.era_buckets ??
    identity.era_buckets_legacy ??
    (Object.keys(stats).length > 0 ? stats : eras.length > 0 ? Object.fromEntries(eras.map((e) => [e.era, { games: e.games, releases: e.releases }])) : {});
  return {
    username: user.username,
    lifetime_score: identity.lifetime_score,
    archetypes: [
      {
        key: identity.archetype.key,
        label: identity.archetype.label,
        strength: identity.archetype.strength,
      },
    ],
    top_signals: identity.top_signals.slice(0, 4).map((s) => ({ ...s, value: "—" })),
    identity_signals: {
      owned_games: identity.totals.owned_games,
      owned_releases: identity.totals.owned_releases,
      unique_platforms: 0,
      minutes_played: identity.totals.minutes_played,
      achievements_earned: identity.totals.achievements_earned,
      achievements_total: identity.totals.achievements_total,
      era_buckets: eraBuckets,
    },
  };
}

export function ShareCardPageClient({ username }: { username: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "404" | "private">("loading");
  const [payload, setPayload] = useState<PublicProfilePayload | null>(null);

  useEffect(() => {
    if (!username) {
      setStatus("404");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/public/profile/${encodeURIComponent(username)}`);
      const json = (await res.json()) as
        | PublicProfilePayload
        | { error: string }
        | { private: true };
      if (cancelled) return;
      if (json && "private" in json && json.private) {
        setStatus("private");
        return;
      }
      if (json && "error" in json) {
        setStatus("404");
        return;
      }
      if (json && "ok" in json && json.ok === true && "user" in json) {
        setPayload(json as PublicProfilePayload);
        setStatus("ok");
        return;
      }
      setStatus("404");
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/60">
        Loading…
      </div>
    );
  }
  if (status === "404") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Profile not found
      </div>
    );
  }
  if (status === "private") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/80">
        This profile is private
      </div>
    );
  }
  if (!payload) return null;

  return (
    <div className="min-h-screen bg-black text-white">
      <IdentityShareCard data={payloadToShareData(payload)} />
    </div>
  );
}
