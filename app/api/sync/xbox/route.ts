import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function slugPlatformKey() {
  return "xbox";
}

function clampTitle(s: string) {
  return (s || "").trim().slice(0, 220);
}

export async function POST() {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Service role client for catalog writes
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Pull xbox titles we already ingested
    // Expecting xbox_title_progress columns like: user_id, title_id, title_name, last_played_at?, playtime_minutes?
    const { data: titles, error: tErr } = await supabaseUser
      .from("xbox_title_progress")
      .select("*")
      .eq("user_id", user.id);

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const rows = Array.isArray(titles) ? titles : [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, imported: 0, updated: 0, total: 0, note: "No xbox titles found to map." });
    }

    let imported = 0;
    let updated = 0;

    for (const x of rows) {
      const xboxTitleId = String(x.title_id ?? x.xbox_title_id ?? "").trim();
      const title = clampTitle(String(x.title_name ?? x.name ?? `Xbox Title ${xboxTitleId || "Unknown"}`));

      if (!title) continue;

      // Use whatever you have available; OK if null.
      const playtimeMinutes = Number(x.playtime_minutes ?? x.playtime_forever_minutes ?? 0) || 0;
      const lastPlayedAt =
        x.last_played_at ? new Date(x.last_played_at).toISOString() : null;

      // 2) Find existing release for this xbox title id (if you store one)
      // If you DON'T have a dedicated column, we'll match by title + platform.
      // Prefer exact ID match if you have it.
      let releaseId: string | null = null;

      if (xboxTitleId) {
        const { data: relById } = await supabaseAdmin
          .from("releases")
          .select("id")
          .eq("platform_key", slugPlatformKey())
          .eq("xbox_title_id", xboxTitleId)
          .maybeSingle();

        releaseId = relById?.id ?? null;
      }

      // 3) Create game + release if missing
      if (!releaseId) {
        // A) upsert game by canonical_title (your schema has unique canonical_title)
        const { data: existingGame } = await supabaseAdmin
          .from("games")
          .select("id")
          .eq("canonical_title", title)
          .maybeSingle();

        let gameId = existingGame?.id ?? null;

        if (!gameId) {
          const { data: newGame, error: gErr } = await supabaseAdmin
            .from("games")
            .insert({ canonical_title: title })
            .select("id")
            .single();

          if (gErr || !newGame?.id) {
            // if insert failed because of a race, re-fetch
            const { data: fallbackGame } = await supabaseAdmin
              .from("games")
              .select("id")
              .eq("canonical_title", title)
              .maybeSingle();

            if (!fallbackGame?.id) {
              return NextResponse.json({ error: `Failed to insert game for ${title}: ${gErr?.message || "unknown"}` }, { status: 500 });
            }
            gameId = fallbackGame.id;
          } else {
            gameId = newGame.id;
          }
        }

        // B) insert release
        const insertPayload: any = {
          game_id: gameId,
          display_title: title,
          platform_name: "Xbox",
          platform_key: slugPlatformKey(),
        };

        // If you added xbox_title_id column on releases, store it.
        if (xboxTitleId) insertPayload.xbox_title_id = xboxTitleId;

        const { data: newRel, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert(insertPayload)
          .select("id")
          .single();

        if (rErr || !newRel?.id) {
          return NextResponse.json({ error: `Failed to insert release for ${title}: ${rErr?.message || "unknown"}` }, { status: 500 });
        }

        releaseId = newRel.id;
        imported += 1;
      } else {
        updated += 1;
      }

      // 4) Upsert into portfolio_entries WITHOUT clobbering manual status/rating
      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id, status, rating, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json({ error: `Failed checking portfolio entry for ${title}: ${exErr.message}` }, { status: 500 });
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          playtime_minutes: playtimeMinutes,
          last_played_at: lastPlayedAt,
          updated_at: new Date().toISOString(),
        });

        if (insErr) {
          return NextResponse.json({ error: `Failed to insert portfolio entry for ${title}: ${insErr.message}` }, { status: 500 });
        }
      } else {
        const currentPlay = Number(existingEntry.playtime_minutes || 0);
        const nextPlay = Math.max(currentPlay, playtimeMinutes);

        let nextLast = existingEntry.last_played_at as string | null;
        if (lastPlayedAt) {
          if (!nextLast || new Date(lastPlayedAt) > new Date(nextLast)) nextLast = lastPlayedAt;
        }

        const patch: any = {
          playtime_minutes: nextPlay,
          last_played_at: nextLast,
          updated_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabaseUser
          .from("portfolio_entries")
          .update(patch)
          .eq("user_id", user.id)
          .eq("release_id", releaseId);

        if (updErr) {
          return NextResponse.json({ error: `Failed to update portfolio entry for ${title}: ${updErr.message}` }, { status: 500 });
        }
      }
    }

    // 5) Stamp profile sync time
    const { error: profErr } = await supabaseUser
      .from("profiles")
      .update({
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: rows.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profErr) {
      return NextResponse.json({ error: `Failed to update profile: ${profErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, imported, updated, total: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
