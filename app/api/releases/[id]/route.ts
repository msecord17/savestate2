import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type Ctx = { params: Promise<{ id: string }> };

function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing release id in URL" }, { status: 400 });
    }

    const supabase = await supabaseRouteClient();

    // Who is asking? (optional — if not logged in we still return the public release)
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;

    // 1) Release + game metadata (your existing select, plus platform_label)
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

    // If not logged in, return public-only data (no entry/signals)
    if (!user) {
      return NextResponse.json({
        release,
        entry: null,
        signals: { steam: null, psn: null, xbox: null },
      });
    }

    // 2) User entry for this release (status/rating/playtime, etc)
    const { data: entry, error: entErr } = await supabase
      .from("portfolio_entries")
      .select("user_id, release_id, status, rating, playtime_minutes, updated_at, created_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    if (entErr) {
      // don’t hard-fail; still return release + signals
      // (but do surface error if you want)
    }

    // 3) PSN signal (by release_id)
    const { data: psn, error: psnErr } = await supabase
      .from("psn_title_progress")
      .select("playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    if (psnErr) {
      // ignore per-row failures; keep payload stable
    }

    // 4) Xbox signal (by release_id)
    const { data: xbox, error: xbErr } = await supabase
      .from("xbox_title_progress")
      .select("achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_updated_at")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .maybeSingle();

    if (xbErr) {
      // ignore per-row failures; keep payload stable
    }

    // PSN trophy group chips (only if user is logged in + this release has PSN progress)
    let psnGroups: any[] = [];
    let npId: string | null = null;
    let psnRow: any = null;

    if (user?.id) {
      // find np_communication_id linked to this release for this user
      const { data: psnRowData, error: psnErr } = await supabase
        .from("psn_title_progress")
        .select("np_communication_id")
        .eq("user_id", user.id)
        .eq("release_id", id)
        .maybeSingle();

      psnRow = psnRowData;
      npId = String(psnRow?.np_communication_id ?? "").trim() || null;

      if (npId) {
        const { data: groups } = await supabase
          .from("psn_trophy_group_progress")
          .select("trophy_group_id, trophy_group_name, trophy_group_icon_url, progress, earned, total")
          .eq("user_id", user.id)
          .eq("np_communication_id", npId)
          .order("trophy_group_id", { ascending: true });

        psnGroups = Array.isArray(groups) ? groups : [];
      }
    }

    // ✅ KEY FIX:
    // Only treat portfolio_entries.playtime_minutes as STEAM playtime if this release is a Steam release.
    // This prevents PSN/Xbox releases from incorrectly showing "Steam playtime".
    const steamSignal =
      String(release.platform_key || "").toLowerCase() === "steam"
        ? {
            playtime_minutes: Number(entry?.playtime_minutes ?? 0),
            last_updated_at: toIsoOrNull(entry?.updated_at ?? null),
          }
        : null;

    return NextResponse.json({
      release,
      entry: entry ?? null,
      psnGroups,
      signals: {
        steam: steamSignal,
        psn: psn
          ? {
              playtime_minutes: psn.playtime_minutes != null ? Number(psn.playtime_minutes) : null,
              trophy_progress: psn.trophy_progress != null ? Number(psn.trophy_progress) : null,
              trophies_earned: psn.trophies_earned != null ? Number(psn.trophies_earned) : null,
              trophies_total: psn.trophies_total != null ? Number(psn.trophies_total) : null,
              last_updated_at: toIsoOrNull(psn.last_updated_at),
            }
          : null,
        xbox: xbox
          ? {
              achievements_earned: xbox.achievements_earned != null ? Number(xbox.achievements_earned) : null,
              achievements_total: xbox.achievements_total != null ? Number(xbox.achievements_total) : null,
              gamerscore_earned: xbox.gamerscore_earned != null ? Number(xbox.gamerscore_earned) : null,
              gamerscore_total: xbox.gamerscore_total != null ? Number(xbox.gamerscore_total) : null,
              last_updated_at: toIsoOrNull(xbox.last_updated_at),
            }
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load release" }, { status: 500 });
  }
}
