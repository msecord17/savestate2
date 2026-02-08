import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { ORIGIN_ORDER } from "@/lib/identity/era";
import { ERA_META } from "@/lib/identity/eras";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";

/** Payload from get_origin_timeline RPC: stats and standouts per origin_bucket */
type OriginTimelinePayload = {
  stats?: Record<string, { games: number; releases: number }> | null;
  standouts?: Record<
    string,
    Array<{
      release_id: string;
      title: string;
      cover_url: string | null;
      played_on: string | null;
      earned?: number;
      total?: number;
      minutes_played?: number;
      score?: number;
    }>
  > | null;
};

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const userId = userRes.user.id;

  const url = new URL(req.url);
  const sortOrder = (url.searchParams.get("sort") || "dominance") as "dominance" | "chronological";

  const { data: payload, error: rpcErr } = await supabaseServer.rpc("get_origin_timeline", {
    p_user_id: userId,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const pl = (payload ?? null) as OriginTimelinePayload | null;
  const stats = pl?.stats ?? {};
  const standouts = pl?.standouts ?? {};

  const bucketKeys = Object.keys(stats).filter((k) => k !== "unknown");
  const eraStats = bucketKeys.map((key) => ({
    key,
    games: Number((stats[key] as { games?: number })?.games ?? 0),
    releases: Number((stats[key] as { releases?: number })?.releases ?? 0),
  }));
  eraStats.sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return b.releases - a.releases;
  });
  const rankByKey: Record<string, number> = {};
  eraStats.forEach((s, i) => {
    rankByKey[s.key] = i + 1;
  });

  const eras: EraTimelineItem[] = eraStats.map(({ key, games, releases }) => {
    const meta = ERA_META[key as keyof typeof ERA_META];
    const notableList = Array.isArray(standouts[key]) ? standouts[key]! : [];
    const notable = notableList.slice(0, 3).map((n) => ({
      release_id: String(n.release_id ?? ""),
      title: String(n.title ?? "Untitled"),
      cover_url: n.cover_url ?? null,
      played_on: n.played_on ?? null,
      earned: n.earned != null ? Number(n.earned) : undefined,
      total: n.total != null ? Number(n.total) : undefined,
      minutes_played: n.minutes_played != null ? Number(n.minutes_played) : undefined,
    }));

    return {
      era: key,
      label: meta?.label ?? key,
      years: meta?.years ?? "",
      rank: rankByKey[key] ?? 0,
      games,
      releases,
      topSignals: [],
      notable,
    };
  });

  if (sortOrder === "chronological") {
    eras.sort((a, b) => {
      const ia = ORIGIN_ORDER.indexOf(a.era);
      const ib = ORIGIN_ORDER.indexOf(b.era);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  } else {
    eras.sort((a, b) => a.rank - b.rank);
  }

  const body: TimelineResponse = {
    ok: true,
    user_id: userId,
    mode: "release_year",
    eras,
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
