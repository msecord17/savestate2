import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
};

function slugPlatformKey() {
  return "xbox";
}

export async function POST(req: Request) {
  try {
    // 1) Must be logged in (this is the "real" user request)
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 2) Call our internal titles endpoint BUT forward cookies so it remains "logged in"
    const h = await headers();
    const cookie = h.get("cookie") ?? "";

    const origin = new URL(req.url).origin; // ✅ always correct in Vercel + local
    const titlesRes = await fetch(`${origin}/api/xbox/titles`, {
      method: "GET",
      headers: {
        cookie, // ✅ critical
        accept: "application/json",
      },
      cache: "no-store",
    });

    const titlesText = await titlesRes.text();

    // Helpful error if we got HTML back
    if (titlesText.trim().startsWith("<")) {
      return NextResponse.json(
        {
          error: `Xbox titles returned HTML (status ${titlesRes.status}). This almost always means auth cookies weren't applied or you hit a redirect.`,
          status: titlesRes.status,
          html_snippet: titlesText.slice(0, 200),
        },
        { status: 500 }
      );
    }

    let titlesJson: any = null;
    try {
      titlesJson = titlesText ? JSON.parse(titlesText) : null;
    } catch {
      return NextResponse.json(
        {
          error: `Xbox titles returned non-JSON (status ${titlesRes.status}).`,
          status: titlesRes.status,
          snippet: titlesText.slice(0, 200),
        },
        { status: 500 }
      );
    }

    if (!titlesRes.ok) {
      return NextResponse.json(
        { error: titlesJson?.error || `Xbox titles failed (${titlesRes.status})`, detail: titlesJson },
        { status: 500 }
      );
    }

    const titles: XboxTitle[] = Array.isArray(titlesJson?.titles) ? titlesJson.titles : [];
    const xuid = titlesJson?.xuid ?? null;
    const gamertag = titlesJson?.gamertag ?? null;
    const gamerscore = titlesJson?.gamerscore ?? null;

    // 3) Admin client for catalog writes (games/releases)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const t of titles) {
      const title = String(t.name || "").trim();
      if (!title) continue;

      // A) Prefer stable xbox title ids when present
      const xboxTitleId = (t.titleId || t.pfTitleId || "").toString().trim();

      // B) Find existing release by xbox_title_id if you have that column
      // If you don't have a column yet, we fall back to canonical title matching.
      let existingRelease: any = null;

      if (xboxTitleId) {
        const { data } = await supabaseAdmin
          .from("releases")
          .select("id, game_id")
          .eq("xbox_title_id", xboxTitleId)
          .maybeSingle();
        existingRelease = data ?? null;
      }

      // fallback: title match
      if (!existingRelease) {
        const { data } = await supabaseAdmin
          .from("releases")
          .select("id, game_id")
          .eq("platform_key", slugPlatformKey())
          .eq("display_title", title)
          .maybeSingle();
        existingRelease = data ?? null;
      }

      let releaseId: string | null = existingRelease?.id ?? null;
      let gameId: string | null = existingRelease?.game_id ?? null;

      // C) Create if missing: game + release
      if (!releaseId) {
        // Upsert game by canonical_title if you have unique constraint on canonical_title
        const { data: gameRow, error: gErr } = await supabaseAdmin
          .from("games")
          .upsert(
            { canonical_title: title },
            { onConflict: "canonical_title" }
          )
          .select("id")
          .single();

        if (gErr || !gameRow?.id) {
          return NextResponse.json(
            { error: `Failed to upsert game for ${title}: ${gErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        gameId = gameRow.id;

        const releaseInsert: any = {
          game_id: gameId,
          display_title: title,
          platform_name: "Xbox",
          platform_key: slugPlatformKey(),
          cover_url: null,
        };

        // only set if your schema has the column
        if (xboxTitleId) releaseInsert.xbox_title_id = xboxTitleId;

        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert(releaseInsert)
          .select("id")
          .single();

        if (rErr || !newRelease?.id) {
          return NextResponse.json(
            { error: `Failed to insert release for ${title}: ${rErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        releaseId = newRelease.id;
        imported += 1;
      } else {
        updated += 1;
      }

      // D) Add to portfolio_entries (do NOT overwrite manual status)
      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json(
          { error: `Failed to check portfolio entry for ${title}: ${exErr.message}` },
          { status: 500 }
        );
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          updated_at: new Date().toISOString(),
        });

        if (insErr) {
          return NextResponse.json(
            { error: `Failed to insert portfolio entry for ${title}: ${insErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // 4) Stamp profile
    const { error: profErr } = await supabaseUser
      .from("profiles")
      .update({
        xbox_xbl_key: xuid ?? null,
        xbox_gamerscore: gamerscore ?? null,
        // achievements count can be added later
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: titles.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profErr) {
      return NextResponse.json({ error: `Failed to update profile stamp: ${profErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: titles.length,
      xuid,
      gamertag,
      gamerscore,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
