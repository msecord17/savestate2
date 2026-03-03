// app/api/public/profile/[username]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { loadIdentitySummary } from "@/lib/server/identity/loadIdentitySummary";
import { unwrapOriginTimeline } from "@/lib/identity/unwrapOriginTimeline";

export const dynamic = "force-dynamic";

type SafePublicUser = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  discord_handle?: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ username: string }> }
) {
  try {
    const { username: raw } = await ctx.params;
    const username = decodeURIComponent(raw ?? "").trim();

    if (!username) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // 1) Find profile (case-insensitive exact match via ilike)
    const { data: profile, error: profErr } = await supabaseServer
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, discord_handle, public_discord, profile_public, profile_visibility, profile_sharing, gamer_score_v11")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // 2) Determine if viewer is owner (before visibility gate)
    let viewerId: string | null = null;
    try {
      const routeSupabase = await supabaseRouteClient();
      const { data: auth } = await routeSupabase.auth.getUser();
      viewerId = auth?.user?.id ?? null;
    } catch {
      // ignore
    }
    const isOwner = !!(viewerId && profile.user_id && viewerId === profile.user_id);

    // 3) Visibility gate (non-owner): profile_public + profile_visibility
    if (!isOwner) {
      if (profile.profile_public !== true) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      const vis = (profile.profile_visibility ?? "public") as string;
      if (vis === "private") {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
    }

    // 4) Build safe public user object (NO internal IDs)
    const user: SafePublicUser = {
      username: profile.username ?? username,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      ...(profile.public_discord ? { discord_handle: profile.discord_handle ?? null } : {}),
    };

    // 5) Identity summary
    const { identity: buildResult, signals, played_on, played_on_by_era } = await loadIdentitySummary(
      supabaseServer as any,
      profile.user_id,
      { lifetimeScoreOverride: (profile as any)?.gamer_score_v11 ?? null }
    );
    const flat = (buildResult as any)?.summary ?? buildResult;
    if ((profile as any)?.gamer_score_v11 != null) {
      (flat as any).lifetime_score = (profile as any).gamer_score_v11;
      (flat as any).score_total = (profile as any).gamer_score_v11;
    }
    if (signals && typeof signals === "object") {
      (flat as any).totals = {
        owned_games: (signals as any).owned_games ?? (signals as any).owned_releases ?? 0,
        owned_releases: (signals as any).owned_releases ?? (signals as any).owned_entries ?? 0,
        minutes_played: (signals as any).minutes_played ?? 0,
        achievements_earned: (signals as any).achievements_earned ?? 0,
        achievements_total: (signals as any).achievements_total ?? 0,
      };
    }

    // 6) Timeline via PUBLIC SAFE RPC (username-based)
    const { data: timeline, error: tlErr } = await supabaseServer.rpc("get_public_origin_timeline", {
      p_username: profile.username ?? username,
    });

    // If timeline fails for any reason, don't break the page — just return empty.
    const safeTimeline = tlErr || !timeline ? { stats: {}, standouts: {} } : unwrapOriginTimeline(timeline);

    // 7) Apply per-section privacy toggles
    const sharing = (profile.profile_sharing ?? {}) as Record<string, boolean>;
    function allowed(key: string, defaultValue = true): boolean {
      if (isOwner) return true;
      const v = sharing[key];
      return typeof v === "boolean" ? v : defaultValue;
    }

    const out = {
      ok: true,
      isOwner,
      user,
      identity: allowed("show_score") || allowed("show_archetypes") ? flat : null,
      top_era: allowed("show_timeline") ? (buildResult as any)?.top_era ?? null : null,
      era_buckets: allowed("show_timeline") ? (buildResult as any)?.era_buckets ?? null : null,
      archetypes: allowed("show_archetypes") ? (buildResult as any)?.archetypes ?? null : null,
      timeline:
        allowed("show_timeline") || allowed("show_recent_activity")
          ? safeTimeline
          : { stats: {}, standouts: {} },
      played_on: allowed("show_played_on") ? played_on : null,
      played_on_by_era: allowed("show_played_on") ? (played_on_by_era ?? {}) : {},
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
