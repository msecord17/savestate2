import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { igdbSearchBest } from "@/lib/igdb/server";

function slugPlatformKey() {
  return "psn";
}

async function findOrCreateGameId(supabaseAdmin: any, title: string) {
  // 1) Try find by canonical_title
  const { data: existing } = await supabaseAdmin
    .from("games")
    .select("id")
    .eq("canonical_title", title)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // 2) Insert new
  const { data: inserted, error } = await supabaseAdmin
    .from("games")
    .insert({ canonical_title: title })
    .select("id")
    .single();

  // Handle unique collision in case of race
  if (error) {
    const { data: retry } = await supabaseAdmin
      .from("games")
      .select("id")
      .eq("canonical_title", title)
      .maybeSingle();
    if (retry?.id) return retry.id as string;

    throw new Error(error.message);
  }

  return inserted.id as string;
}

export async function POST() {
  try {
    // Logged-in user
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Needs service role for catalog writes
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(url, serviceKey);

    // Pull PSN sync rows for this user
    const { data: psnRows, error: psnErr } = await supabaseUser
      .from("psn_title_progress")
      .select("np_communication_id, title_name, title_platform, playtime_minutes, trophies_earned, trophies_total")
      .eq("user_id", user.id);

    if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });

    const rows = Array.isArray(psnRows) ? psnRows : [];
    if (rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No PSN titles found for this user. Run PSN sync first.",
      }, { status: 400 });
    }

    let mapped = 0;
    let updated = 0;
    let portfolioUpserts = 0;

    for (const t of rows) {
      const npId = String(t.np_communication_id || "").trim();
      if (!npId) continue;

      const title = String(t.title_name || "").trim() || `PSN Title ${npId}`;
      const platformName = "PlayStation";
      const platformKey = slugPlatformKey();

      // A) Does a release already exist for this PSN title?
      const { data: existingRelease } = await supabaseAdmin
        .from("releases")
        .select("id, game_id, cover_url")
        .eq("psn_np_communication_id", npId)
        .maybeSingle();

      let releaseId: string | null = existingRelease?.id ?? null;
      let gameId: string | null = existingRelease?.game_id ?? null;

      // B) If missing, create game + release
      if (!releaseId) {
        gameId = await findOrCreateGameId(supabaseAdmin, title);

        // Try IGDB enrichment (cover + metadata)
        const hit = await igdbSearchBest(title);

        // Update game metadata lightly (only if blank-ish)
        if (hit?.igdb_game_id) {
          await supabaseAdmin
            .from("games")
            .update({
              igdb_game_id: hit.igdb_game_id,
              summary: hit.summary ?? null,
              genres: hit.genres ?? null,
              developer: hit.developer ?? null,
              publisher: hit.publisher ?? null,
              first_release_year: hit.first_release_year ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", gameId);
        }

        const coverUrl = hit?.cover_url ?? null;

        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gameId,
            display_title: title,
            platform_name: platformName,
            platform_key: platformKey,
            psn_np_communication_id: npId,
            cover_url: coverUrl,
          })
          .select("id")
          .single();

        if (rErr || !newRelease?.id) {
          return NextResponse.json(
            { error: `Failed to insert PSN release for ${title}: ${rErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        releaseId = newRelease.id;
        mapped += 1;
      } else {
        // C) Update title/platform fields if needed (safe)
        await supabaseAdmin
          .from("releases")
          .update({
            display_title: title,
            platform_name: platformName,
            platform_key: platformKey,
            updated_at: new Date().toISOString(),
          })
          .eq("id", releaseId);

        updated += 1;
      }

      // D) Upsert into portfolio_entries so PSN titles show on My Portfolio / GameHome
      // Don’t overwrite user edits: only increase playtime if larger.
      const incomingPlaytime = Number(t.playtime_minutes || 0);

      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("playtime_minutes, status, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json({ error: exErr.message }, { status: 500 });
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          playtime_minutes: incomingPlaytime,
          last_played_at: null,
          updated_at: new Date().toISOString(),
        });

        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
        portfolioUpserts += 1;
      } else {
        const current = Number(existingEntry.playtime_minutes || 0);
        const nextPlaytime = Math.max(current, incomingPlaytime);

        if (nextPlaytime !== current) {
          const { error: updErr } = await supabaseUser
            .from("portfolio_entries")
            .update({
              playtime_minutes: nextPlaytime,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id)
            .eq("release_id", releaseId);

          if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mapped,
      updated,
      portfolioUpserts,
      totalPsnTitles: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN map failed" }, { status: 500 });
  }
}
