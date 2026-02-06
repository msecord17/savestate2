import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { cleanTitleForXboxIgdb, upsertGameIgdbFirst } from "@/lib/igdb/server";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import { recomputeArchetypesForUser } from "@/lib/insights/recompute";

type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
  /** From titles API: "Xbox 360" | "Xbox One" | "Xbox Series". Used for releases.platform_label and xbox_title_progress.title_platform. */
  platform_label?: string;
  achievements_earned?: number;
  achievements_total?: number;
  gamerscore_earned?: number;
  gamerscore_total?: number;
  last_played_at?: string | null;
};

function slugPlatformKey() {
  return "xbox";
}

/** Stable label for release and xbox_title_progress. Prefer API generation (360/One/Series), fallback "Xbox". */
function platformLabelForTitle(t: XboxTitle): string {
  const label = t.platform_label?.trim();
  if (label === "Xbox 360" || label === "Xbox One" || label === "Xbox Series") return label;
  return "Xbox";
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

    // Log for debugging - include full debug info from titles endpoint and one title sample (for platform_label / release creation)
    console.log(`[Xbox Sync] Fetched ${titles.length} titles from API`);
    if (titles.length > 0) {
      console.log(`[Xbox Sync] First title (for release creation / platform_label):`, JSON.stringify(titles[0]));
    }
    if (titlesJson?.debug) {
      console.log(`[Xbox Sync] Debug info from titles API:`, titlesJson.debug);
    }

    if (titles.length === 0) {
      return NextResponse.json({
        ok: true,
        imported: 0,
        updated: 0,
        total: 0,
        xuid,
        gamertag,
        warning: "No titles returned from Xbox API. This might mean: 1) No games with achievements, 2) API pagination issue, or 3) API returned empty response.",
        debug: {
          titlesJsonKeys: titlesJson ? Object.keys(titlesJson) : [],
          titlesApiDebug: titlesJson?.debug,
          rawResponse: titlesJson,
        },
      });
    }

    // Admin client for catalog writes
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;
    let errors: string[] = [];

    for (const t of titles) {
      const title = String(t.name || "").trim();
      if (!title) continue;

      const platformLabel = platformLabelForTitle(t);

      // titleId must be numeric for achievements API to work
      const rawTitleId = t.titleId || t.pfTitleId;
      const xboxTitleId = rawTitleId != null ? String(rawTitleId).trim() : "";
      
      // Skip if no valid numeric titleId (we can't fetch achievements without it)
      if (!xboxTitleId || isNaN(Number(xboxTitleId))) {
        console.warn(`[Xbox Sync] Skipping ${title} - no valid titleId (got: ${rawTitleId})`);
        continue;
      }

      // 1) Resolve platform external id = xboxTitleId
      // 2) Find release_external_ids(source, external_id) → release_id
      const { data: mapRow, error: mapErr } = await supabaseAdmin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", "xbox")
        .eq("external_id", xboxTitleId)
        .maybeSingle();

      if (mapErr) {
        errors.push(`release_external_ids lookup: ${mapErr.message}`);
        continue;
      }

      let releaseId: string | null = mapRow?.release_id ? String(mapRow.release_id) : null;
      let gameId: string | null = null;

      if (releaseId) {
        const { data: rel } = await supabaseAdmin
          .from("releases")
          .select("game_id")
          .eq("id", releaseId)
          .maybeSingle();
        gameId = rel?.game_id ?? null;
        // Backfill platform_label so re-syncs get 360/One/Series when we now have it
        await supabaseAdmin
          .from("releases")
          .update({ platform_label: platformLabel, updated_at: new Date().toISOString() })
          .eq("id", releaseId);
        updated += 1;
      }

      // 3) If no release: (1) game_id via IGDB (Xbox-cleaned title) (2) find by (platform_key, game_id) (3) insert with 23505 (4) upsert mapping; if mapped release_id differs, merge
      if (!releaseId) {
        try {
          const cleanedForIgdb = cleanTitleForXboxIgdb(title);
          const { game_id: gid } = await upsertGameIgdbFirst(supabaseAdmin, cleanedForIgdb, { platform_key: "xbox" });
          gameId = gid;
        } catch (e: any) {
          errors.push(`game for ${title}: ${e?.message || "unknown"}`);
          continue;
        }

        const { data: existingRelease, error: findErr } = await supabaseAdmin
          .from("releases")
          .select("id")
          .eq("platform_key", slugPlatformKey())
          .eq("game_id", gameId)
          .maybeSingle();

        if (findErr) {
          errors.push(`release lookup: ${findErr.message}`);
          continue;
        }

        if (existingRelease?.id) {
          releaseId = String(existingRelease.id);
        } else {
          // Fallback: find existing by (platform_key, display_title, platform_label) and attach game_id (avoid duplicate release)
          const { data: existingByTitle, error: titleErr } = await supabaseAdmin
            .from("releases")
            .select("id")
            .eq("platform_key", slugPlatformKey())
            .eq("display_title", title.trim())
            .eq("platform_label", platformLabel)
            .maybeSingle();

          if (!titleErr && existingByTitle?.id) {
            releaseId = String(existingByTitle.id);
            await supabaseAdmin
              .from("releases")
              .update({
                game_id: gameId,
                xbox_title_id: xboxTitleId,
                platform_label: platformLabel,
                updated_at: new Date().toISOString(),
              })
              .eq("id", releaseId);
          } else {
            const { data: newRelease, error: rErr } = await supabaseAdmin
              .from("releases")
              .insert({
                game_id: gameId,
                display_title: title,
                platform_name: "Xbox",
                platform_key: slugPlatformKey(),
                platform_label: platformLabel,
                cover_url: null,
                xbox_title_id: xboxTitleId,
              })
              .select("id")
              .single();

            if (rErr) {
              const code = (rErr as { code?: string })?.code;
              if (code === "23505") {
                const { data: raced } = await supabaseAdmin
                  .from("releases")
                  .select("id")
                  .eq("platform_key", slugPlatformKey())
                  .eq("game_id", gameId)
                  .maybeSingle();
                if (raced?.id) releaseId = String(raced.id);
                else {
                  errors.push(`release 23505 but no row for ${title}`);
                  continue;
                }
              } else {
                errors.push(`release insert ${title}: ${rErr?.message || "unknown"}`);
                continue;
              }
            } else if (newRelease?.id) {
              releaseId = String(newRelease.id);
              imported += 1;
            } else {
              errors.push(`release insert ${title}: no id returned`);
              continue;
            }
          }
        }

        await supabaseAdmin
          .from("release_external_ids")
          .upsert(releaseExternalIdRow(releaseId, "xbox", xboxTitleId), {
            onConflict: "source,external_id",
            ignoreDuplicates: true,
          });

        const { data: currentMap } = await supabaseAdmin
          .from("release_external_ids")
          .select("release_id")
          .eq("source", "xbox")
          .eq("external_id", xboxTitleId)
          .maybeSingle();

        if (currentMap?.release_id && String(currentMap.release_id) !== releaseId) {
          await mergeReleaseInto(supabaseAdmin, String(currentMap.release_id), releaseId);
          releaseId = String(currentMap.release_id);
        }
      }

      if (!releaseId) continue;

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

      // Write per-title Xbox progress (so score + played-on timeline can use generation)
      await supabaseUser
        .from("xbox_title_progress")
        .upsert(
          {
            user_id: user.id,
            title_id: xboxTitleId, // Must be numeric (validated above)
            title_name: title,
            title_platform: platformLabel, // "Xbox 360" | "Xbox One" | "Xbox Series" | "Xbox"
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

    try {
      await recomputeArchetypesForUser(supabaseUser, user.id);
    } catch {
      // Non-fatal: sync succeeded; archetype snapshot will refresh on next GET or recompute
    }

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: titles.length,
      processed: imported + updated,
      xuid,
      gamertag,
      errors: errors.length > 0 ? errors : undefined,
      warning: errors.length > 0 ? `${errors.length} titles failed to sync` : undefined,
      debug: {
        titlesApiDebug: titlesJson?.debug,
        titleNames: titles.map((t) => t.name),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
