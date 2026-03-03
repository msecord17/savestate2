import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { loadIdentitySummary } from "@/lib/server/identity/loadIdentitySummary";

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
      .select("gamer_score_v11")
      .eq("user_id", user.id)
      .maybeSingle();

    const summary = await loadIdentitySummary(supabaseServer as any, user.id, {
      lifetimeScoreOverride: (profile as any)?.gamer_score_v11 ?? null,
    });

    const id = summary.identity as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      identity: summary.identity,
      top_era: id?.top_era ?? null,
      era_buckets: id?.era_buckets ?? null,
      archetypes: id?.archetypes ?? null,
      timeline: id?.timeline ?? null,
      played_on: summary.played_on ?? null,
      played_on_by_era: summary.played_on_by_era ?? {},
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
