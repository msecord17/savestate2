// app/api/ra/map-release/route.ts
import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { mapReleaseToRA } from "@/lib/ra/map-release";

export async function GET(req: Request) {
  const supabaseUser = await supabaseRouteClient();
  const { data: userRes } = await supabaseUser.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ ok: false, note: "Not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const releaseId = url.searchParams.get("release_id");
  const dryRun = url.searchParams.get("dry_run") === "1";

  if (!releaseId) return NextResponse.json({ ok: false, note: "Missing release_id" }, { status: 400 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await mapReleaseToRA(supabaseAdmin, releaseId, {
    dryRun,
    userId: userRes.user.id,
  });

  // Transform result to match existing API response format
  if (result.ok && result.ra_game_id) {
    return NextResponse.json({
      ok: true,
      mapped: !dryRun && result.note !== "Already mapped.",
      already_mapped: result.note === "Already mapped.",
      dry_run: dryRun,
      release_id: releaseId,
      ra_game_id: result.ra_game_id,
      ra_title: result.matched_title,
      score: result.confidence,
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
