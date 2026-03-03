import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { loadIdentitySummary } from "@/lib/server/identity/loadIdentitySummary";

export const dynamic = "force-dynamic";

async function countPhysicalOwned(userId: string): Promise<number> {
  const candidates = [
    "portfolio_physical_items",
    "physical_items",
    "physical_games",
    "physical_collection_items",
    "user_physical_items",
  ];

  for (const table of candidates) {
    const { count, error } = await supabaseServer
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!error && typeof count === "number") return count;
  }

  return 0;
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();

  if (authErr || !auth?.user) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const userId = auth.user.id;

  const { signals, played_on } = await loadIdentitySummary(supabaseServer as any, userId);

  const digitalOwned =
    (typeof (signals as any)?.owned_games === "number" ? (signals as any).owned_games : null) ??
    (typeof (signals as any)?.owned_releases === "number" ? (signals as any).owned_releases : null) ??
    (typeof (signals as any)?.owned_entries === "number" ? (signals as any).owned_entries : 0);

  const platformsPlayed =
    typeof (signals as any)?.unique_platforms === "number"
      ? (signals as any).unique_platforms
      : Object.keys((played_on as any)?.by_kind ?? {}).length;

  const physicalOwned = await countPhysicalOwned(userId);

  return NextResponse.json({
    ok: true,
    digital_owned: digitalOwned ?? 0,
    physical_owned: physicalOwned,
    platforms_played: platformsPlayed,
  });
}
