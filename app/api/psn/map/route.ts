import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { normalizePlatformLabel } from "@/lib/platforms";
import { igdbSearchBest } from "@/lib/igdb/server";

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

function cleanTitleForIgdb(title: string) {
  return deMashTitle(String(title || ""))
    .replace(/™|®/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(
      /:\s*(standard|deluxe|gold|ultimate|complete|anniversary|remastered|definitive|edition).*/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function upsertGameIgdbFirst(admin: any, titleName: string) {
  const raw = String(titleName || "").trim();
  if (!raw) throw new Error("titleName empty");

  const cleaned = cleanTitleForIgdb(raw);
  const hit = cleaned ? await igdbSearchBest(cleaned) : null;

  if (hit?.igdb_game_id) {
    const canonical = String(hit.title || raw).trim() || raw;
    const patch: any = {
      igdb_game_id: Number(hit.igdb_game_id),
      canonical_title: canonical,
      updated_at: nowIso(),
    };
    if (hit.summary != null) patch.summary = hit.summary;
    if (hit.developer != null) patch.developer = hit.developer;
    if (hit.publisher != null) patch.publisher = hit.publisher;
    if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
    if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
    if (hit.cover_url) patch.cover_url = hit.cover_url;

    const { data: existingByIgdb, error: findErr } = await admin
      .from("games")
      .select("id")
      .eq("igdb_game_id", Number(hit.igdb_game_id))
      .maybeSingle();

    if (findErr) throw new Error(`game lookup (igdb_game_id) failed: ${findErr.message}`);

    if (existingByIgdb?.id) {
      const { error: updErr } = await admin.from("games").update(patch).eq("id", existingByIgdb.id);
      if (updErr) throw new Error(`game update (igdb_game_id) failed: ${updErr.message}`);
      return String(existingByIgdb.id);
    }

    const { data: gameRow, error: gErr } = await admin
      .from("games")
      .upsert(patch, { onConflict: "canonical_title" })
      .select("id")
      .single();
    if (gErr || !gameRow?.id) throw new Error(`game upsert (canonical_title) failed: ${gErr?.message || "unknown"}`);
    return String(gameRow.id);
  }

  const { data: gameRow, error: gErr } = await admin
    .from("games")
    .upsert({ canonical_title: raw }, { onConflict: "canonical_title" })
    .select("id")
    .single();
  if (gErr || !gameRow?.id) throw new Error(`game upsert (canonical_title) failed: ${gErr?.message || "unknown"}`);
  return String(gameRow.id);
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

    // Create/find platform-specific release.
    // If platformLabel is null, we create a PSN release with platform_label = null
    // (and it won't conflict with your unique index because that index ignores null labels).
    let existingRelease: any = null;

    if (platformLabel) {
      const { data, error: findErr } = await supabaseAdmin
        .from("releases")
        .select("id, game_id")
        .eq("platform_key", "psn")
        .eq("display_title", titleName)
        .eq("platform_label", platformLabel)
        .maybeSingle();
      if (findErr) {
        skipped += 1;
        continue;
      }
      existingRelease = data ?? null;
    } else {
      // fallback match: title-only PSN releases with null label
      const { data, error: findErr } = await supabaseAdmin
        .from("releases")
        .select("id, game_id")
        .eq("platform_key", "psn")
        .eq("display_title", titleName)
        .is("platform_label", null)
        .maybeSingle();
      if (findErr) {
        skipped += 1;
        continue;
      }
      existingRelease = data ?? null;
    }

    let releaseId: string | null = existingRelease?.id ?? null;
    let gameId: string | null = existingRelease?.game_id ?? null;

    if (!releaseId) {
      try {
        gameId = await upsertGameIgdbFirst(supabaseAdmin, titleName);
      } catch {
        skipped += 1;
        continue;
      }

      const { data: newRelease, error: rErr } = await supabaseAdmin
        .from("releases")
        .insert({
          game_id: gameId,
          display_title: titleName,
          platform_key: "psn",
          platform_name: "PlayStation",
          platform_label: platformLabel, // can be null (unknown)
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

    // ✅ After creating/finding release, upsert the external-id mapping (idempotent)
    await supabaseAdmin
      .from("release_external_ids")
      .upsert(
        {
          release_id: releaseId,
          source: "psn",
          external_id: npid,
          external_id_type: npid.startsWith("synthetic:") ? "synthetic" : "np_communication_id",
        },
        { onConflict: "source,external_id" }
      );

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
