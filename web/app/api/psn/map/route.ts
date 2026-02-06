import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { normalizePlatformLabel } from "@/lib/platforms";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";
import { releaseExternalIdRow } from "@/lib/release-external-ids";

function nowIso() {
  return new Date().toISOString();
}

function isBadLabel(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return !s || s === "playstation";
}

// Split CamelCase / mashed titles (TigerWoodsPGATOUR07 → Tiger Woods PGA TOUR 07)
function deMashTitle(s: string) {
  return (s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

export async function POST() {
  const supabaseUser = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: psnRows, error: psnErr } = await supabaseUser
    .from("psn_title_progress")
    .select("np_communication_id, title_name, title_platform, release_id")
    .eq("user_id", user.id);

  if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });

  const rows = Array.isArray(psnRows) ? psnRows : [];

  let created = 0;
  let mapped = 0;
  let updated = 0;
  let skipped = 0;
  let remapped = 0;

  const samplePsn = rows.slice(0, 5).map((r: any) => r.title_name).filter(Boolean);

  for (const r of rows as any[]) {
    const titleName = String(r.title_name || "").trim();
    const npid = String(r.np_communication_id || "").trim();
    if (!titleName || !npid) {
      skipped += 1;
      continue;
    }

    const platformLabel = normalizePlatformLabel(r.title_platform);

    // ✅ Mapping-first: resolve release_id via release_external_ids before creating anything
    {
      const { data: ext, error: extErr } = await supabaseAdmin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", "psn")
        .eq("external_id", npid)
        .maybeSingle();

      if (extErr) {
        skipped += 1;
        continue;
      }

      const mappedReleaseId = ext?.release_id ? String(ext.release_id) : null;
      if (mappedReleaseId) {
        // Ensure psn_title_progress points at the mapped release (idempotent)
        const { error: mapErr } = await supabaseUser
          .from("psn_title_progress")
          .update({ release_id: mappedReleaseId, last_updated_at: nowIso() })
          .eq("user_id", user.id)
          .eq("np_communication_id", npid);

        if (mapErr) {
          skipped += 1;
          continue;
        }

        mapped += 1;
        continue;
      }
    }

    // If already mapped, validate/fix the release platform labeling
    if (r.release_id) {
      const { data: rel, error: relErr } = await supabaseAdmin
        .from("releases")
        .select("id, platform_key, platform_name, platform_label, display_title")
        .eq("id", r.release_id)
        .maybeSingle();

      if (relErr || !rel?.id) {
        skipped += 1;
        continue;
      }

      // Fix bad labels (null / "PlayStation") to specific label if we have one
      if (platformLabel && isBadLabel(rel.platform_label)) {
        const { error: updErr } = await supabaseAdmin
          .from("releases")
          .update({
            platform_key: "psn",
            platform_name: "PlayStation",
            platform_label: platformLabel,
          })
          .eq("id", rel.id);

        if (!updErr) updated += 1;
      }

      // OPTIONAL: if release label is different than PSN label, remap to the correct release
      // (this is what stops PS5/PS4 getting mixed)
      if (platformLabel && rel.platform_label && String(rel.platform_label) !== platformLabel) {
        // find the correct PSN release for (title + label)
        const { data: correct } = await supabaseAdmin
          .from("releases")
          .select("id")
          .eq("platform_key", "psn")
          .eq("display_title", titleName)
          .eq("platform_label", platformLabel)
          .maybeSingle();

        if (correct?.id) {
          const { error: mapErr } = await supabaseUser
            .from("psn_title_progress")
            .update({ release_id: correct.id, last_updated_at: nowIso() })
            .eq("user_id", user.id)
            .eq("np_communication_id", npid);

          if (!mapErr) remapped += 1;
        }
      }

      skipped += 1;
      continue;
    }

    // One release per (platform_key, game_id): resolve game via IGDB, then find/create release
    let gameId: string | null = null;
    try {
      const { game_id } = await upsertGameIgdbFirst(supabaseAdmin, titleName, { platform: "psn" });
      gameId = game_id;
    } catch {
      skipped += 1;
      continue;
    }

    const { data: existingRelease, error: findErr } = await supabaseAdmin
      .from("releases")
      .select("id")
      .eq("platform_key", "psn")
      .eq("game_id", gameId)
      .maybeSingle();

    if (findErr) {
      skipped += 1;
      continue;
    }

    let releaseId: string | null = existingRelease?.id ?? null;

    if (!releaseId) {
      // DB may have releases_platform_title_label_unique; find by title+label and reuse
      const titleQ = supabaseAdmin
        .from("releases")
        .select("id")
        .eq("platform_key", "psn")
        .eq("display_title", titleName);
      const { data: existingByTitle } =
        platformLabel != null && platformLabel !== ""
          ? await titleQ.eq("platform_label", platformLabel).maybeSingle()
          : await titleQ.is("platform_label", null).maybeSingle();

      if (existingByTitle?.id) {
        releaseId = existingByTitle.id;
        await supabaseAdmin
          .from("releases")
          .update({ game_id: gameId, updated_at: nowIso() })
          .eq("id", releaseId);
      } else {
        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gameId,
            display_title: titleName,
            platform_key: "psn",
            platform_name: "PlayStation",
            platform_label: platformLabel,
            cover_url: null,
          })
          .select("id")
          .single();

        if (rErr || !newRelease?.id) {
          skipped += 1;
          continue;
        }

        releaseId = newRelease.id;
        created += 1;
      }
    }

    if (!releaseId) {
      skipped += 1;
      continue;
    }

    // ✅ After creating/finding release, upsert the external-id mapping (idempotent)
    await supabaseAdmin
      .from("release_external_ids")
      .upsert(releaseExternalIdRow(releaseId, "psn", npid), { onConflict: "source,external_id" });

    const { error: mapErr } = await supabaseUser
      .from("psn_title_progress")
      .update({
        release_id: releaseId,
        last_updated_at: nowIso(),
      })
      .eq("user_id", user.id)
      .eq("np_communication_id", npid);

    if (mapErr) {
      skipped += 1;
      continue;
    }

    mapped += 1;

    // Ensure portfolio entry exists
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
        updated_at: nowIso(),
      });
    }
  }

  // Correct debug: re-query after mapping
  const { count: releasesTotal } = await supabaseAdmin
    .from("releases")
    .select("*", { count: "exact", head: true });

  const { count: psnUnmappedAfter } = await supabaseUser
    .from("psn_title_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("release_id", null);

  return NextResponse.json({
    ok: true,
    created,
    mapped,
    remapped,
    updated,
    skipped,
    debug: {
      psn_total: rows.length,
      psn_unmapped: psnUnmappedAfter ?? null,
      releases_total: releasesTotal ?? null,
      sample_psn: samplePsn,
    },
  });
}
