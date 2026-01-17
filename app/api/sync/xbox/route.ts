import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
  achievements_earned?: number;
  achievements_total?: number;
  gamerscore_earned?: number;
  gamerscore_total?: number;
  last_played_at?: string | null;
};

function slugPlatformKey() {
  return "xbox";
}

function safeJson(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Confirm token exists (best early debug signal)
    const { data: prof, error: pErr } = await supabaseUser
      .from("profiles")
      .select("xbox_access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const tokenLen = String(prof?.xbox_access_token ?? "").length;
    if (!prof?.xbox_access_token) {
      return NextResponse.json(
        { error: "Missing xbox_access_token (connect Xbox first).", debug: { tokenLen } },
        { status: 400 }
      );
    }

    // Forward cookies so /api/xbox/titles sees the logged-in user
    const h = await headers();
    const cookie = h.get("cookie") ?? "";
    const origin = new URL(req.url).origin;

    const titlesRes = await fetch(`${origin}/api/xbox/titles`, {
      method: "GET",
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
    });

    const titlesText = await titlesRes.text();

    // HTML response means auth/cookies/redirect happened
    if (titlesText.trim().startsWith("<")) {
      return NextResponse.json(
        {
          error: `Xbox titles returned HTML (status ${titlesRes.status})`,
          hint: "Usually means cookies not forwarded or titles route redirected to login.",
          debug: { status: titlesRes.status, tokenLen, html_snippet: titlesText.slice(0, 200) },
        },
        { status: 500 }
      );
    }

    const titlesJson = safeJson(titlesText);
    if (!titlesRes.ok) {
      return NextResponse.json(
        {
          error: titlesJson?.error || `Xbox titles failed (${titlesRes.status})`,
          detail: titlesJson ?? titlesText.slice(0, 200),
          debug: { status: titlesRes.status, tokenLen },
        },
        { status: 500 }
      );
    }

    const titles: XboxTitle[] = Array.isArray(titlesJson?.titles) ? titlesJson.titles : [];
    const xuid = titlesJson?.xuid ?? null;
    const gamertag = titlesJson?.gamertag ?? null;

    // Admin client for catalog writes
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const t of titles) {
      const title = String(t.name || "").trim();
      if (!title) continue;

      const xboxTitleId = String(t.titleId || t.pfTitleId || "").trim();

      // Find existing release
      let existingRelease: any = null;

      if (xboxTitleId) {
        const { data } = await supabaseAdmin
          .from("releases")
          .select("id, game_id")
          .eq("xbox_title_id", xboxTitleId)
          .maybeSingle();
        existingRelease = data ?? null;
      }

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

      // Create if missing
      if (!releaseId) {
        const { data: gameRow, error: gErr } = await supabaseAdmin
          .from("games")
          .upsert({ canonical_title: title }, { onConflict: "canonical_title" })
          .select("id")
          .single();

        if (gErr || !gameRow?.id) {
          return NextResponse.json(
            { error: `Failed to upsert game for ${title}: ${gErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        const releaseInsert: any = {
          game_id: gameRow.id,
          display_title: title,
          platform_name: "Xbox",
          platform_key: slugPlatformKey(),
          cover_url: null,
        };
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

      // Portfolio entry (don’t overwrite manual edits)
      const { data: existingEntry } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (!existingEntry) {
        await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          updated_at: new Date().toISOString(),
        });
      }

      // Write per-title Xbox progress (so score can use it)
      // NOTE: your xbox_title_progress table uses: title_id, title_name, achievements_*, gamerscore_*, last_played_at, release_id
      await supabaseUser
        .from("xbox_title_progress")
        .upsert(
          {
            user_id: user.id,
            title_id: xboxTitleId || title, // fallback if no ID
            title_name: title,
            title_platform: "Xbox",
            achievements_earned: t.achievements_earned ?? null,
            achievements_total: t.achievements_total ?? null,
            gamerscore_earned: t.gamerscore_earned ?? null,
            gamerscore_total: t.gamerscore_total ?? null,
            last_played_at: t.last_played_at ?? null,
            last_updated_at: new Date().toISOString(),
            release_id: releaseId,
          },
          { onConflict: "user_id,title_id" }
        );
    }

    // Stamp profile
    const { error: profErr } = await supabaseUser
      .from("profiles")
      .update({
        xbox_xuid: xuid ?? null, // if you have xbox_xuid, prefer this
        xbox_gamertag: gamertag ?? null, // optional if you added
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: titles.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profErr) {
      // don’t fail the whole sync if stamping fails
      return NextResponse.json({
        ok: true,
        imported,
        updated,
        total: titles.length,
        xuid,
        gamertag,
        warning: `Profile stamp failed: ${profErr.message}`,
      });
    }

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: titles.length,
      xuid,
      gamertag,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
