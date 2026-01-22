import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing release id in URL" }, { status: 400 });
    }

    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 1) Release + game metadata
    const { data: release, error: relErr } = await supabase
      .from("releases")
      .select(
        `
        id,
        display_title,
        platform_name,
        platform_key,
        platform_label,
        cover_url,
        created_at,
        updated_at,
        game_id,
        games (
          id,
          canonical_title,
          igdb_game_id,
          summary,
          genres,
          developer,
          publisher,
          first_release_year
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500 });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    // 2) Portfolio status (optional but nice for Release page)
    const { data: portfolio } = await supabase
      .from("portfolio_entries")
      .select("status, playtime_minutes, updated_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    // 3) PSN progress for this release (can be multiple: base + DLC)
    const { data: psn, error: psnErr } = await supabase
      .from("psn_title_progress")
      .select(
        "title_name, title_platform, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at"
      )
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (psnErr) {
      // don’t fail the whole page if PSN table has no row
      // (maybeSingle returns error only on query problems)
      console.warn("psn progress read error:", psnErr.message);
    }

    // 4) Xbox progress for this release (can be multiple: base + DLC)
    const { data: xbox, error: xbErr } = await supabase
      .from("xbox_title_progress")
      .select(
        "title_name, title_platform, achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_updated_at"
      )
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (xbErr) {
      console.warn("xbox progress read error:", xbErr.message);
    }

    // IMPORTANT: portfolio_entries.playtime_minutes should ONLY be treated as Steam playtime
    // when the release itself is a Steam release. Filter it out for non-Steam releases.
    const portfolioData = portfolio
      ? {
          ...portfolio,
          playtime_minutes:
            String(release.platform_key ?? "").toLowerCase() === "steam"
              ? portfolio.playtime_minutes
              : null,
        }
      : null;

    return NextResponse.json({
      ok: true,
      release,
      portfolio: portfolioData,
      signals: {
        psn: psn ?? null,
        xbox: xbox ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load release" },
      { status: 500 }
    );
  }
}
