import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { getOrCreateProvisionalGameAndEnqueue, getOrCreateGameForXboxApp } from "@/lib/provisional-game";
import { isXboxNonGame } from "@/lib/igdb/server";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import {
  lookupGameId,
  upsertGameExternalId,
  gameExternalIdRow,
} from "@/lib/game-external-ids";

// If you already use another key format, keep consistent with your other platforms:
function slugPlatformKey() {
  return "xbox";
}

// Optional: cover art (may or may not work for every title, but cheap win)
// If you have a known reliable URL pattern in your data, use it instead.
// We’ll fall back to IGDB anyway.
function xboxFallbackCover(titleIdOrPf?: string | null) {
  if (!titleIdOrPf) return null;
  // Placeholder pattern; not guaranteed. Keep it null-safe.
  return null;
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

    // 2) Load Xbox titles you already synced
    const { data: titles, error: tErr } = await supabaseUser
      .from("xbox_title_progress")
      .select(
        "id, title_name, title_id, pf_title_id, playtime_minutes, last_played_at, release_id, title_platform"
      )
      .eq("user_id", user.id)
      .order("last_played_at", { ascending: false });

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const rows = Array.isArray(titles) ? titles : [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, imported: 0, updated: 0, total: 0 });
    }

    // 3) Admin client for catalog writes (games/releases)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const r of rows) {
      const title = String(r.title_name || "").trim();
      const titleId = (r.title_id ?? null) as string | null;
      const pfTitleId = (r.pf_title_id ?? null) as string | null;
      const playtimeMinutes = Number(r.playtime_minutes || 0);
      const lastPlayedAt = (r.last_played_at ?? null) as string | null;
      const isApp = isXboxNonGame(title);

      if (!title) continue;

      // A) Ensure we have a release_id (map title -> release)
      let releaseId: string | null = r.release_id ?? null;

      if (!releaseId) {
        const key = pfTitleId || titleId;

        // 1) Resolve release by external ID mapping first
        if (key) {
          const { data: mapRow } = await supabaseAdmin
            .from("release_external_ids")
            .select("release_id")
            .eq("source", "xbox")
            .eq("external_id", key)
            .maybeSingle();
          if (mapRow?.release_id) releaseId = String(mapRow.release_id);
        }

        // 2) Fallback: find existing release by xbox_title_id on releases
        if (!releaseId && key) {
          const { data: existingRelease } = await supabaseAdmin
            .from("releases")
            .select("id, game_id, cover_url")
            .eq("xbox_title_id", key)
            .maybeSingle();
          if (existingRelease?.id) releaseId = existingRelease.id;
        }

        // 3) If still missing, resolve game_id (apps: content_type='app' no enqueue; games: provisional + enqueue)
        if (!releaseId) {
          let gameId: string;
          const xboxExternalId = pfTitleId || titleId;
          try {
            if (xboxExternalId) {
              const existingGameId = await lookupGameId(supabaseAdmin, "xbox", xboxExternalId);
              if (existingGameId) {
                gameId = existingGameId;
                if (isApp) await supabaseAdmin.from("games").update({ content_type: "app", updated_at: new Date().toISOString() }).eq("id", existingGameId);
              } else if (isApp) {
                const res = await getOrCreateGameForXboxApp(supabaseAdmin, {
                  source: "xbox",
                  external_id: xboxExternalId,
                  title,
                });
                gameId = res.game_id;
              } else {
                const res = await getOrCreateProvisionalGameAndEnqueue(supabaseAdmin, {
                  source: "xbox",
                  external_id: xboxExternalId,
                  title,
                });
                gameId = res.game_id;
              }
            } else {
              const syntheticId = `xbox-import:${(pfTitleId || titleId || title).toString().slice(0, 120)}`;
              const res = isApp
                ? await getOrCreateGameForXboxApp(supabaseAdmin, { source: "xbox", external_id: syntheticId, title })
                : await getOrCreateProvisionalGameAndEnqueue(supabaseAdmin, { source: "xbox", external_id: syntheticId, title });
              gameId = res.game_id;
            }
          } catch (e) {
            return NextResponse.json(
              { error: `Failed to create/find game for ${title}: ${(e as Error)?.message || "unknown"}` },
              { status: 500 }
            );
          }

          const xboxKey = pfTitleId || titleId || null;
          const platformLabel =
            r.title_platform && ["Xbox 360", "Xbox One", "Xbox Series"].includes(String(r.title_platform))
              ? String(r.title_platform)
              : "Xbox";

          // Prefer (platform_key, game_id); fallback: find by (platform_key, display_title, platform_label) and attach game_id (avoid duplicate release)
          const { data: existingByPlatformGame } = await supabaseAdmin
            .from("releases")
            .select("id")
            .eq("platform_key", slugPlatformKey())
            .eq("game_id", gameId)
            .maybeSingle();

          if (existingByPlatformGame?.id) {
            releaseId = String(existingByPlatformGame.id);
            if (xboxKey) {
              const patch: Record<string, unknown> = {
                xbox_title_id: xboxKey,
                display_title: title,
                platform_label: platformLabel,
                cover_url: xboxFallbackCover(xboxKey),
                updated_at: new Date().toISOString(),
              };
              if (isApp) patch.content_type = "app";
              await supabaseAdmin.from("releases").update(patch).eq("id", releaseId);
            }
          } else {
            // Fallback: existing release by (platform_key, display_title, platform_label) — attach game_id
            const { data: existingByTitle } = await supabaseAdmin
              .from("releases")
              .select("id")
              .eq("platform_key", slugPlatformKey())
              .eq("display_title", title.trim())
              .eq("platform_label", platformLabel)
              .maybeSingle();

            if (existingByTitle?.id) {
              releaseId = String(existingByTitle.id);
              const patch: Record<string, unknown> = {
                game_id: gameId,
                xbox_title_id: xboxKey,
                display_title: title,
                platform_label: platformLabel,
                cover_url: xboxFallbackCover(xboxKey),
                updated_at: new Date().toISOString(),
              };
              if (isApp) patch.content_type = "app";
              await supabaseAdmin.from("releases").update(patch).eq("id", releaseId);
            } else {
              const insertPayload: Record<string, unknown> = {
                game_id: gameId,
                display_title: title,
                platform_name: "Xbox",
                platform_key: slugPlatformKey(),
                platform_label: platformLabel,
                xbox_title_id: xboxKey,
                cover_url: xboxFallbackCover(xboxKey),
              };
              if (isApp) insertPayload.content_type = "app";
              const { data: newRelease, error: rErr } = await supabaseAdmin
                .from("releases")
                .insert(insertPayload)
                .select("id, cover_url")
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
                  else
                    return NextResponse.json(
                      { error: `Release 23505 but no row for ${title}` },
                      { status: 500 }
                    );
                } else {
                  return NextResponse.json(
                    { error: `Failed to insert release for ${title}: ${(rErr as Error)?.message || "unknown"}` },
                    { status: 500 }
                  );
                }
              } else if (newRelease?.id) {
                releaseId = String(newRelease.id);
                imported += 1;
              } else {
                return NextResponse.json(
                  { error: `Failed to insert release for ${title}: no id returned` },
                  { status: 500 }
                );
              }
            }
          }

          // Write release_external_ids (ignoreDuplicates so anchored mapping wins); if mapped release_id differs, merge
          if (key && releaseId) {
            await supabaseAdmin
              .from("release_external_ids")
              .upsert(releaseExternalIdRow(releaseId, "xbox", key), {
                onConflict: "source,external_id",
                ignoreDuplicates: true,
              });

            const { data: currentMap } = await supabaseAdmin
              .from("release_external_ids")
              .select("release_id")
              .eq("source", "xbox")
              .eq("external_id", key)
              .maybeSingle();

            if (currentMap?.release_id && String(currentMap.release_id) !== releaseId) {
              await mergeReleaseInto(supabaseAdmin, String(currentMap.release_id), releaseId);
              releaseId = String(currentMap.release_id);
            }
          }

          // Enqueue for resolver when igdb_game_id IS NULL (skip for apps — they are not games)
          if (!isApp) {
            const { data: gameRow } = await supabaseAdmin
              .from("games")
              .select("id, igdb_game_id")
              .eq("id", gameId)
              .maybeSingle();
            if (!gameRow?.igdb_game_id && gameId) {
              await supabaseAdmin.from("game_match_attempts").insert({
                source: "xbox",
                external_id: key || `xbox:${gameId}`,
                title_used: title,
                game_id: gameId,
                outcome: "pending",
              });
            }
          }

          // 4) Save mapping back to xbox_title_progress
          await supabaseUser
            .from("xbox_title_progress")
            .update({ release_id: releaseId, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("id", r.id);
        } else {
          updated += 1;

          // Save mapping if we found it
          await supabaseUser
            .from("xbox_title_progress")
            .update({ release_id: releaseId, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("id", r.id);
        }
      }

      // B) Upsert into portfolio_entries
      if (!releaseId) continue;

      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("status, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json(
          { error: `Failed to check existing portfolio entry for ${title}: ${exErr.message}` },
          { status: 500 }
        );
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
          return NextResponse.json(
            { error: `Failed to insert portfolio entry for ${title}: ${insErr.message}` },
            { status: 500 }
          );
        }
      } else {
        // Don’t overwrite user-chosen status; only increase playtime / move last_played forward
        const currentPlay = Number(existingEntry.playtime_minutes || 0);
        const nextPlay = Math.max(currentPlay, playtimeMinutes);

        let nextLast = (existingEntry.last_played_at as string | null) ?? null;
        if (lastPlayedAt) {
          if (!nextLast || new Date(lastPlayedAt) > new Date(nextLast)) nextLast = lastPlayedAt;
        }

        const { error: updErr } = await supabaseUser
          .from("portfolio_entries")
          .update({
            playtime_minutes: nextPlay,
            last_played_at: nextLast,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("release_id", releaseId);

        if (updErr) {
          return NextResponse.json(
            { error: `Failed to update portfolio entry for ${title}: ${updErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Stamp profile for visibility
    await supabaseUser
      .from("profiles")
      .update({
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: rows.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true, imported, updated, total: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox import failed" }, { status: 500 });
  }
}
