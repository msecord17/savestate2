// app/api/identity/summary/route.ts
import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { loadIdentitySummary } from "@/lib/server/identity/loadIdentitySummary";
import { normalizeTimeline } from "@/lib/identity/normalize-timeline";
import { normalizeOriginTimeline } from "@/lib/identity/normalizeOriginTimeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, gamer_score_v11")
      .eq("user_id", user.id)
      .maybeSingle();

    const { identity, played_on, played_on_by_era } = await loadIdentitySummary(supabaseServer as any, user.id, {
      lifetimeScoreOverride: (profile as any)?.gamer_score_v11 ?? null,
    });

    // Timeline: same as GameHome + /u/ — get_origin_timeline RPC → stats + standouts
    let timeline: { stats: Record<string, { games: number; releases: number }>; standouts: Record<string, unknown[]> } | null = null;
    const { data: timelinePayload, error: timelineErr } = await supabaseServer.rpc("get_origin_timeline", {
      p_user_id: user.id,
    });
    if (!timelineErr && timelinePayload) {
      const { origin } = normalizeTimeline(timelinePayload);
      const { stats, standouts } = normalizeOriginTimeline(origin);
      timeline = { stats: stats ?? {}, standouts: standouts ?? {} };
    }

    const flat = (identity as any)?.summary ?? identity;

    return NextResponse.json({
      ok: true,
      user: {
        user_id: user.id,
        username: (profile as any)?.username ?? null,
        display_name: (profile as any)?.display_name ?? null,
        avatar_url: (profile as any)?.avatar_url ?? null,
      },
      identity: flat,
      top_era: (identity as any)?.top_era ?? null,
      era_buckets: (identity as any)?.era_buckets ?? null,
      archetypes: (identity as any)?.archetypes ?? null,
      timeline: timeline ?? { stats: {}, standouts: {} },
      played_on,
      played_on_by_era: played_on_by_era ?? {},
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
