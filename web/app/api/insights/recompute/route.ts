import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { getUserStats } from "@/lib/insights/user-stats";
import { computeArchetypes } from "@/lib/archetypes/score";

export async function POST(req: Request) {
  const supabaseUser = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes?.user) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const userId = userRes.user.id;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const stats = await getUserStats(admin, userId);
  const archetypes = computeArchetypes(stats);

  const payload = {
    version: "v0",
    computed_at: new Date().toISOString(),
    stats,
    archetypes,
  };

  const { error: upErr } = await admin
    .from("user_archetype_snapshots")
    .upsert(
      { user_id: userId, version: "v0", payload, computed_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, payload });
}
