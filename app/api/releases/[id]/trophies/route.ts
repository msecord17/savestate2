import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { psnAuthorizeFromNpsso, psnGetTitleTrophyDetails } from "@/lib/psn/server";

// Cache TTL: 12 hours (tune later)
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function isFresh(iso: string | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: releaseId } = await ctx.params;
    if (!releaseId || releaseId === "undefined") {
      return NextResponse.json({ error: "Missing release id" }, { status: 400 });
    }

    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 1) Find PSN mappings for this release (can be multiple: base + DLC)
    const { data: psnRows, error: psnErr } = await supabaseUser
      .from("psn_title_progress")
      .select("np_communication_id, title_platform, title_name, last_updated_at")
      .eq("user_id", user.id)
      .eq("release_id", releaseId);

    if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });
    const rows = Array.isArray(psnRows) ? psnRows : [];

    const withIds = rows.filter((r) => r?.np_communication_id);
    if (!withIds.length) {
      return NextResponse.json({ error: "No PSN mapping for this release yet." }, { status: 404 });
    }

    // Prefer:
    // 1) non-synthetic ids
    // 2) PS5 platform when present
    // 3) newest updated
    function scoreRow(r: any) {
      const id = String(r.np_communication_id || "");
      const plat = String(r.title_platform || "");
      const isSynthetic = id.startsWith("synthetic:");
      const isPs5 = plat.toUpperCase().includes("PS5");
      const ts = r.last_updated_at ? new Date(r.last_updated_at).getTime() : 0;
      return (isSynthetic ? 0 : 1000) + (isPs5 ? 100 : 0) + Math.min(ts / 1_000_000_000, 50);
    }

    withIds.sort((a, b) => scoreRow(b) - scoreRow(a));

    const chosen = withIds[0];
    const npCommunicationId = String(chosen.np_communication_id);
    const trophyTitlePlatform = String(chosen.title_platform ?? "PS4").trim() || "PS4";

    const choices = withIds.slice(0, 8).map((r) => ({
      np_communication_id: r.np_communication_id,
      title_platform: r.title_platform,
      title_name: r.title_name,
      last_updated_at: r.last_updated_at,
    }));

    // 2) Try cache first
    const { data: cache, error: cErr } = await supabaseUser
      .from("psn_trophy_cache")
      .select("trophies, earned, fetched_at")
      .eq("user_id", user.id)
      .eq("release_id", releaseId)
      .eq("np_communication_id", npCommunicationId)
      .maybeSingle();

    if (!cErr && cache?.fetched_at && isFresh(cache.fetched_at)) {
      return NextResponse.json({
        ok: true,
        cached: true,
        npCommunicationId,
        trophyTitlePlatform,
        trophies: cache.trophies,
        earned: cache.earned,
        fetched_at: cache.fetched_at,
        choices,
      });
    }

    // 3) Need NPSSO to call PSN
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("psn_npsso, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const npsso = String(profile?.psn_npsso ?? "").trim();
    if (!npsso) {
      return NextResponse.json({ error: "PSN not connected (missing NPSSO)" }, { status: 400 });
    }

    // 4) Call PSN API via psn-api wrapper
    const authorization = await psnAuthorizeFromNpsso(npsso);

    // accountId: your wrapper currently uses "me" a lot, but trophy-earned needs a real accountId in some cases.
    // If you stored psn_account_id, use it; else fall back to "me".
    const accountId = String(profile?.psn_account_id ?? "me");

    const { titleTrophies, earnedTrophies } = await psnGetTitleTrophyDetails(
      authorization,
      accountId,
      npCommunicationId,
      trophyTitlePlatform
    );

    // 5) Upsert cache
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabaseAdmin.from("psn_trophy_cache").upsert(
      {
        user_id: user.id,
        release_id: releaseId,
        np_communication_id: npCommunicationId,
        trophy_title_platform: trophyTitlePlatform,
        trophies: titleTrophies ?? [],
        earned: earnedTrophies ?? [],
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,release_id,np_communication_id" }
    );

    return NextResponse.json({
      ok: true,
      cached: false,
      npCommunicationId,
      trophyTitlePlatform,
      trophies: titleTrophies ?? [],
      earned: earnedTrophies ?? [],
      fetched_at: new Date().toISOString(),
      choices,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load trophies" }, { status: 500 });
  }
}
