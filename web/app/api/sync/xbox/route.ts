import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { recordSyncEnd, recordSyncStart } from "@/lib/sync/record-run";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import { getOrCreateGameForSync, upsertGameMasterMappingIngest } from "@/lib/sync-game-resolve";
import { isXboxNonGame } from "@/lib/igdb/server";
import { recomputeArchetypesForUser } from "@/lib/insights/recompute";

type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
  /** From titles API: "Xbox 360" | "Xbox One" | "Xbox Series". Used for releases.platform_label and xbox_title_progress.title_platform. */
  platform_label?: string;
  /** When false, treat as app: content_type='app', skip IGDB, exclude from identity. */
  isGame?: boolean;
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
  let runId: string | null = null;
  const start = Date.now();
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;
    runId = await recordSyncStart(supabaseServer, user.id, "xbox");
    const endRun = async (
      status: "ok" | "error",
      opts?: { errorMessage?: string; resultJson?: unknown }
    ) => {
      await recordSyncEnd(supabaseServer, runId, status, {
        durationMs: Date.now() - start,
        errorMessage: opts?.errorMessage ?? undefined,
        resultJson: opts?.resultJson ?? undefined,
      });
    };

    // Confirm token exists (best early debug signal)
    const { data: prof, error: pErr } = await supabaseUser
      .from("profiles")
      .select("xbox_access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) {
      await endRun("error", { errorMessage: pErr.message, resultJson: { error: pErr.message, detail: pErr.message } });
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const tokenLen = String(prof?.xbox_access_token ?? "").length;
    if (!prof?.xbox_access_token) {
      const errMsg = "Xbox not connected";
      await endRun("error", { errorMessage: errMsg, resultJson: { error: errMsg, detail: { tokenLen } } });
      return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
    }

    // Forward cookies so /api/xbox/titles sees the logged-in user
    const h = await headers();
    const cookie = h.get("cookie") ?? "";
    const origin = new URL(req.url).origin;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25_000);

    let titlesRes: Response;
    try {
      titlesRes = await fetch(`${origin}/api/xbox/titles`, {
        method: "GET",
        headers: {
          cookie,
          accept: "application/json",
          "content-type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (e: any) {
      const errMsg =
        e?.name === "AbortError"
          ? "Xbox titles timed out"
          : `Xbox titles fetch failed: ${e?.message ?? "unknown"}`;
      await endRun("error", { errorMessage: errMsg, resultJson: { error: errMsg } });
      return NextResponse.json({ ok: false, error: errMsg }, { status: 504 });
    } finally {
      clearTimeout(t);
    }

    const titlesText = await titlesRes.text();

    // HTML response means auth/cookies/redirect happened
    if (titlesText.trim().startsWith("<")) {
      const errMsg = "Xbox titles returned HTML";
      const detail = { status: titlesRes.status, tokenLen, html_snippet: titlesText.slice(0, 200) };
      await endRun("error", { errorMessage: errMsg, resultJson: { error: errMsg, detail } });
      return NextResponse.json(
        {
          error: `Xbox titles returned HTML (status ${titlesRes.status})`,
          hint: "Usually means cookies not forwarded or titles route redirected to login.",
          debug: detail,
        },
        { status: 500 }
      );
    }

    const titlesJson = safeJson(titlesText);
    if (!titlesRes.ok) {
      const errMsg = titlesJson?.error || `Xbox titles failed (${titlesRes.status})`;
      const detail = titlesJson ?? titlesText.slice(0, 200);
      await endRun("error", { errorMessage: errMsg, resultJson: { error: errMsg, detail } });
      const status = titlesRes.status === 401 || titlesRes.status === 400 ? titlesRes.status : 500;
      return NextResponse.json(
        {
          ok: false,
          error: errMsg,
          detail,
          debug: { status: titlesRes.status, tokenLen },
        },
        { status }
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
      const payload = {
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
      };
      await endRun("ok", { resultJson: payload });
      return NextResponse.json(payload);
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
      const isApp = t?.isGame === false || isXboxNonGame(title);

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
        const updatePayload: Record<string, unknown> = { platform_label: platformLabel, updated_at: new Date().toISOString() };
        if (isApp) updatePayload.content_type = "app";
        await supabaseAdmin.from("releases").update(updatePayload).eq("id", releaseId);
        if (isApp && gameId) await supabaseAdmin.from("games").update({ content_type: "app", updated_at: new Date().toISOString() }).eq("id", gameId);
        updated += 1;
      }

      // 3) If no release: upsert mapping metadata, then resolve game_id (game_external_refs + game_match_queue; no IGDB inline). Apps get content_type='app'.
      if (!releaseId) {
        await upsertGameMasterMappingIngest(supabaseAdmin, {
          source: "xbox",
          external_id: xboxTitleId,
          source_title: title,
          source_platform: platformLabel,
        });
        try {
          const res = await getOrCreateGameForSync(supabaseAdmin, {
            source: "xbox",
            external_id: xboxTitleId,
            raw_title: title,
            platform_key: "xbox",
            isApp,
          });
          gameId = res.game_id;
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
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (isApp) patch.content_type = "app";
          if (Object.keys(patch).length > 1) await supabaseAdmin.from("releases").update(patch).eq("id", releaseId);
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
            const patch: Record<string, unknown> = {
              game_id: gameId,
              xbox_title_id: xboxTitleId,
              platform_label: platformLabel,
              updated_at: new Date().toISOString(),
            };
            if (isApp) patch.content_type = "app";
            await supabaseAdmin.from("releases").update(patch).eq("id", releaseId);
          } else {
            const releaseInsert: Record<string, unknown> = {
              game_id: gameId,
              display_title: title,
              platform_name: "Xbox",
              platform_key: slugPlatformKey(),
              platform_label: platformLabel,
              cover_url: null,
              xbox_title_id: xboxTitleId,
            };
            if (isApp) releaseInsert.content_type = "app";
            const { data: newRelease, error: rErr } = await supabaseAdmin
              .from("releases")
              .insert(releaseInsert)
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
      const profPayload = {
        ok: true,
        imported,
        updated,
        total: titles.length,
        xuid,
        gamertag,
        warning: `Profile stamp failed: ${profErr.message}`,
      };
      await endRun("ok", { resultJson: profPayload });
      // don’t fail the whole sync if stamping fails
      return NextResponse.json(profPayload);
    }

    try {
      await recomputeArchetypesForUser(supabaseUser, user.id);
    } catch {
      // Non-fatal: sync succeeded; archetype snapshot will refresh on next GET or recompute
    }

    const payload = {
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
    };
    await endRun("ok", { resultJson: payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    const errMsg = e?.message ?? "Xbox sync failed";
    await recordSyncEnd(supabaseServer, runId, "error", {
      durationMs: Date.now() - start,
      errorMessage: errMsg,
      resultJson: { error: errMsg, detail: e?.stack ?? errMsg },
    });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
