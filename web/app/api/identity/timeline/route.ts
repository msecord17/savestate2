import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { ORIGIN_BUCKET_META, ORIGIN_BUCKET_ORDER } from "@/lib/identity/era";
import { normalizeTimeline } from "@/lib/identity/normalize-timeline";
import { normalizeOriginTimeline } from "@/lib/identity/normalizeOriginTimeline";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";

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

  const { origin } = normalizeTimeline(payload);
  const { stats, standouts } = normalizeOriginTimeline(origin);
  const s = stats ?? {};
  const so = standouts ?? {};

  const buckets = ORIGIN_BUCKET_ORDER.filter((k) => k !== "unknown");

  const eraStats = buckets.map((key) => ({
    key,
    games: Number((s[key] as { games?: number })?.games ?? 0),
    releases: Number((s[key] as { releases?: number })?.releases ?? 0),
  }));
  eraStats.sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return b.releases - a.releases;
  });
  const rankByKey: Record<string, number> = {};
  eraStats.forEach((s, i) => {
    rankByKey[s.key] = i + 1;
  });

  const eras: EraTimelineItem[] = buckets.map((bucketKey) => {
    const meta = ORIGIN_BUCKET_META[bucketKey];
    const games = Number((s[bucketKey] as { games?: number })?.games ?? 0);
    const releases = Number((s[bucketKey] as { releases?: number })?.releases ?? 0);
    const notableList = Array.isArray(so[bucketKey]) ? so[bucketKey]! : [];
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
      era: bucketKey,
      label: meta?.title ?? bucketKey,
      years: meta?.sub ?? "",
      rank: rankByKey[bucketKey] ?? 0,
      games,
      releases,
      topSignals: [],
      notable,
    };
  });

  if (sortOrder === "chronological") {
    eras.sort((a, b) => {
      const ia = ORIGIN_BUCKET_ORDER.indexOf(a.era);
      const ib = ORIGIN_BUCKET_ORDER.indexOf(b.era);
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
