import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

// Minimal shapes
type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
};

function guessPlatformKeyFromDevices(devices?: string[]) {
  const d = (devices || []).map((x) => String(x).toLowerCase());
  if (d.some((x) => x.includes("xboxone"))) return "xbox_one";
  if (d.some((x) => x.includes("scarlett") || x.includes("xboxseries"))) return "xbox_series";
  if (d.some((x) => x.includes("xbox360"))) return "xbox_360";
  return "xbox";
}

export async function POST() {
  try {
    // 1) User session
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 2) Read tokens we saved during callback
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("xbox_access_token, xbox_refresh_token, xbox_connected_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!profile?.xbox_connected_at) {
      return NextResponse.json({ error: "Xbox not connected" }, { status: 400 });
    }

    let accessToken = String(profile?.xbox_access_token || "").trim();
    const refreshToken = String(profile?.xbox_refresh_token || "").trim();

    if (!accessToken) {
      return NextResponse.json({ error: "Missing Xbox access token" }, { status: 400 });
    }

    // Pull titles from our internal endpoint (which does XSTS + title history)
    const origin = process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const titlesRes = await fetch(`${origin}/api/sync/xbox/titles`, { cache: "no-store" });
    const titlesText = await titlesRes.text();
    const titlesJson = titlesText ? JSON.parse(titlesText) : null;

    if (!titlesRes.ok) {
      return NextResponse.json(
        { error: titlesJson?.error || `Xbox titles failed (${titlesRes.status})`, detail: titlesJson },
        { status: 500 }
      );
    }

    const titles: XboxTitle[] = Array.isArray(titlesJson?.titles) ? titlesJson.titles : [];

    // 4) Service role client for catalog writes
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const t of titles) {
      const titleName = String(t.name || "").trim();
      if (!titleName) continue;

      const xboxTitleId = String(t.pfTitleId || t.titleId || "").trim() || null;
      const platformKey = guessPlatformKeyFromDevices(t.devices);

      // A) Find existing game by canonical_title, else create
      // Avoid unique constraint crash by upserting on canonical_title
      const { data: gRow, error: gErr } = await supabaseAdmin
        .from("games")
        .upsert(
          { canonical_title: titleName, updated_at: new Date().toISOString() },
          { onConflict: "canonical_title" }
        )
        .select("id")
        .single();

      if (gErr || !gRow?.id) {
        return NextResponse.json({ error: `Failed to upsert game for ${titleName}: ${gErr?.message}` }, { status: 500 });
      }

      const gameId = gRow.id;

      // B) Find existing release by xbox_title_id (if you have column) else by (game_id+platform_key)
      // If you don't have xbox_title_id column, we'll just key off (game/platform).
      // Adjust if your schema already has xbox_title_id.
      const { data: relExisting } = await supabaseAdmin
        .from("releases")
        .select("id")
        .eq("game_id", gameId)
        .eq("platform_key", platformKey)
        .maybeSingle();

      let releaseId = relExisting?.id ?? null;

      if (!releaseId) {
        const { data: newRel, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gameId,
            display_title: titleName,
            platform_name: "Xbox",
            platform_key: platformKey,
            // optional if you added a column:
            // xbox_title_id: xboxTitleId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (rErr || !newRel?.id) {
          return NextResponse.json({ error: `Failed to insert release for ${titleName}: ${rErr?.message}` }, { status: 500 });
        }

        releaseId = newRel.id;
        imported += 1;
      } else {
        updated += 1;
      }

      // C) Upsert portfolio entry (status owned) WITHOUT nuking manual edits
      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("status, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json({ error: `Failed to check portfolio entry for ${titleName}: ${exErr.message}` }, { status: 500 });
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          updated_at: new Date().toISOString(),
        });
        if (insErr) {
          return NextResponse.json({ error: `Failed to insert portfolio entry for ${titleName}: ${insErr.message}` }, { status: 500 });
        }
      }
    }

    // Stamp sync info
    const { error: stampErr } = await supabaseUser
      .from("profiles")
      .update({
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: titles.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (stampErr) {
      return NextResponse.json({ error: `Failed to update profile sync stamp: ${stampErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, imported, updated, total: titles.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
