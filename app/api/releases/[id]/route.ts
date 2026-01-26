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
        steam_appid,
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

    // 2.5) Steam progress for this release (robust resolution like achievements)
    let steam: any = null;

    // Primary: by release_id
    const { data: steamRow, error: steamErr } = await supabase
      .from("steam_title_progress")
      .select("steam_appid, playtime_minutes, last_updated_at, release_id")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[releases/id] steam lookup", {
      user_id: user.id,
      release_id: id,
      steam: steamRow,
      steamErr: steamErr?.message ?? null,
      steamErrCode: (steamErr as any)?.code ?? null,
      steamErrDetails: (steamErr as any)?.details ?? null,
      steamErrHint: (steamErr as any)?.hint ?? null,
    });
    
    // Check for RLS/permission errors
    if (steamErr) {
      const errMsg = String(steamErr.message ?? "").toLowerCase();
      if (errMsg.includes("permission") || errMsg.includes("policy") || errMsg.includes("rls") || (steamErr as any)?.code === "42501") {
        console.error("[releases/id] ⚠️ RLS BLOCKING STEAM QUERY:", {
          error: steamErr.message,
          code: (steamErr as any)?.code,
          hint: (steamErr as any)?.hint,
        });
      } else {
        console.warn("steam progress read error:", steamErr.message);
      }
    }
    
    // Verify release_id is populated if we got data
    if (steamRow && !steamRow.release_id) {
      console.warn("[releases/id] ⚠️ steam_title_progress row missing release_id:", {
        steam_appid: steamRow.steam_appid,
        playtime_minutes: steamRow.playtime_minutes,
      });
    }

    steam = steamRow ?? null;

    // If missing, resolve appid and re-query by steam_appid
    if (!steam) {
      let appid = "";

      // Fallback 1: release_external_ids mapping
      const { data: ext } = await supabase
        .from("release_external_ids")
        .select("external_id")
        .eq("release_id", id)
        .eq("source", "steam")
        .maybeSingle();

      if (ext?.external_id) appid = String(ext.external_id).trim();

      // Fallback 2: releases.steam_appid (if present)
      if (!appid && (release as any)?.steam_appid) {
        appid = String((release as any).steam_appid).trim();
      }

      // Fallback 3: if user has *any* steam progress rows for this release (rare edge), keep it
      // (not needed if we already tried by release_id, but harmless as an extra safety net)

      if (appid) {
        const { data: steamByApp } = await supabase
          .from("steam_title_progress")
          .select("steam_appid, playtime_minutes, last_updated_at")
          .eq("user_id", user.id)
          .eq("steam_appid", appid)
          .order("last_updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        steam = steamByApp ?? null;
      }
    }

    // ✅ HARD FALLBACK: if no steam_title_progress row exists, synthesize Steam signal from portfolio for Steam releases
    const isSteam = String((release as any)?.platform_key ?? "").toLowerCase() === "steam";
    const portfolioMinutes = portfolio?.playtime_minutes != null ? Number(portfolio.playtime_minutes) : null;

    if (isSteam && !steam && portfolioMinutes != null) {
      steam = {
        steam_appid: (release as any)?.steam_appid ?? null,
        playtime_minutes: portfolioMinutes,
        last_updated_at: portfolio?.updated_at ?? null,
        note: "fallback_from_portfolio",
      };
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
        steam: steam ?? null,
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
