// app/api/ra/map/route.ts
import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";

function resolveRaConsoleId(platformKeyRaw: string | null, platformNameRaw: string | null, platformLabelRaw: string | null) {
  const s = `${platformKeyRaw ?? ""} ${platformNameRaw ?? ""} ${platformLabelRaw ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // RetroAchievements Console IDs (these are the canonical IDs used by RA's API)
  // If any of these are wrong, it's a 30-second fix: just update the number.
  const map: Array<[RegExp, number]> = [
    [/(\bsnes\b|\bsuper nintendo\b|\bsuper nes\b)/, 3],
    [/(\bnes\b|\bnintendo entertainment system\b)/, 7],
    [/(\bn64\b|\bnintendo 64\b)/, 2],
    [/(\bgbc\b|\bgame boy color\b)/, 6],
    [/(\bgb\b|\bgame boy\b)/, 4],
    [/(\bgba\b|\bgame boy advance\b)/, 5],
    [/(\bgenesis\b|\bmega drive\b|\bmd\b)/, 1],
    [/(\bmastersystem\b|\bmaster system\b|\bsms\b)/, 11],
    [/(\bgame gear\b|\bgg\b)/, 15],
    [/(\bplaystation\b|\bps1\b|\bpsx\b)/, 12],
    [/(\bps2\b|\bplaystation 2\b)/, 21],
    [/(\bpc engine\b|\bturbografx\b|\btg16\b)/, 8],
    [/(\bneo geo pocket\b|\bngp\b)/, 14],
    [/(\blynx\b)/, 13],
    [/(\bvirtual boy\b)/, 28],
    [/(\bsaturn\b)/, 39],
    [/(\bdreamcast\b)/, 40],
    // add more as you expand
  ];

  for (const [re, id] of map) {
    if (re.test(s)) return id;
  }
  return null;
}

export async function POST(req: Request) {
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

  // Parse cursor from request (optional)
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = 100; // Process 100 at a time

  // Get existing RA mappings to skip already-mapped releases
  const { data: existingMappings } = await supabaseAdmin
    .from("release_external_ids")
    .select("release_id")
    .eq("source", "ra");

  const mappedReleaseIds = new Set(
    (existingMappings || []).map((m: any) => m.release_id)
  );

  // Query unmapped releases with RA-compatible platforms
  // Use cursor for pagination (if provided, start after that release_id)
  let query = supabaseAdmin
    .from("releases")
    .select("id, display_title, platform_key, platform_name, platform_label")
    .not("display_title", "is", null)
    .limit(limit + 1); // Fetch one extra to know if there's more

  if (cursor) {
    query = query.gt("id", cursor); // Start after cursor
  }

  const { data: releases, error: releasesErr } = await query.order("id", { ascending: true });

  if (releasesErr) {
    return NextResponse.json({ error: releasesErr.message }, { status: 500 });
  }

  // Filter to only unmapped releases that have a resolvable RA console ID
  const unmappedReleases = (releases || []).filter((r: any) => {
    if (mappedReleaseIds.has(r.id) || !r.display_title) return false;
    const consoleId = resolveRaConsoleId(r.platform_key, r.platform_name, r.platform_label);
    return consoleId !== null;
  });

  // Check if there are more to process
  const hasMore = (releases || []).length > limit;
  const nextCursor = hasMore && unmappedReleases.length > 0 
    ? unmappedReleases[unmappedReleases.length - 1].id 
    : null;

  // Process the releases (limit to actual limit)
  const toProcess = unmappedReleases.slice(0, limit);

  let mapped = 0;
  let skipped = 0;
  let errors: Array<{ title: string; reason: string; details?: string }> = [];

  // Process each release
  for (const release of toProcess) {
    try {
      const result = await mapSingleRelease(
        release.id,
        release.display_title,
        release.platform_key,
        release.platform_name,
        release.platform_label,
        supabaseUser,
        supabaseAdmin,
        user.id
      );
      
      if (result.mapped) {
        mapped += 1;
      } else if (result.already_mapped) {
        skipped += 1;
      } else if (result.error) {
        errors.push({
          title: release.display_title,
          reason: result.error,
          details: result.details,
        });
        skipped += 1;
      } else {
        // No match found - categorize the reason
        const reason = result.reason || "No confident match found";
        errors.push({
          title: release.display_title,
          reason,
          details: result.details,
        });
        skipped += 1;
      }
    } catch (e: any) {
      errors.push({
        title: release.display_title,
        reason: "Exception during mapping",
        details: e?.message || "unknown error",
      });
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: toProcess.length,
    mapped,
    skipped,
    errors: errors.slice(0, 20), // Limit error output but show more than before
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}

// Inline version of map-release logic (simplified)
async function mapSingleRelease(
  releaseId: string,
  title: string,
  platformKey: string | null,
  platformName: string | null,
  platformLabel: string | null,
  supabaseUser: any,
  supabaseAdmin: any,
  userId: string
): Promise<{ 
  mapped: boolean; 
  already_mapped: boolean; 
  error?: string;
  reason?: string;
  details?: string;
}> {
  // Check if already mapped
  const { data: existing } = await supabaseAdmin
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  if (existing?.external_id) {
    return { mapped: false, already_mapped: true };
  }

  // Get RA credentials
  let raUsername = String(process.env.RA_USERNAME ?? "").trim();
  let raApiKey = String(process.env.RA_WEB_API_KEY ?? "").trim();

  if (!raUsername || !raApiKey) {
    const { data: conn } = await supabaseUser
      .from("user_ra_connections")
      .select("ra_username, ra_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    raUsername = String(conn?.ra_username ?? "").trim();
    raApiKey = String(conn?.ra_api_key ?? "").trim();
  }

  if (!raUsername || !raApiKey) {
    return { 
      mapped: false, 
      already_mapped: false, 
      error: "No RA credentials",
      reason: "Missing credentials",
    };
  }

  // Resolve RA Console ID directly (no API call needed)
  const raConsoleId = resolveRaConsoleId(platformKey, platformName, platformLabel);
  if (!raConsoleId) {
    return { 
      mapped: false, 
      already_mapped: false, 
      error: `Could not resolve RA system id for '${platformLabel ?? platformName ?? platformKey}'.`,
      reason: "System mismatch - platform not supported by RA",
      details: `Platform: ${platformKey || "unknown"}`,
    };
  }

  // Fetch games
  const gamesUrl = `https://retroachievements.org/API/API_GetGameList.php?z=${encodeURIComponent(raUsername)}&y=${encodeURIComponent(raApiKey)}&i=${raConsoleId}&f=1`;
  let gameList: any;
  try {
    const r = await fetch(gamesUrl, { cache: "no-store" });
    const text = await r.text();
    gameList = JSON.parse(text);
  } catch (e: any) {
    return { 
      mapped: false, 
      already_mapped: false, 
      error: `Failed to fetch games: ${e?.message}`,
      reason: "RA API error",
      details: e?.message,
    };
  }

  // Check if game list is empty
  if (!Array.isArray(gameList) || gameList.length === 0) {
    return {
      mapped: false,
      already_mapped: false,
      error: "No games found for this system",
      reason: "No search results",
      details: `System ID: ${raConsoleId}`,
    };
  }

  function normalizeTitleForRa(title: string) {
    return title
      .replace(/\(.*?\)/g, "")        // remove (USA), (Rev 1), etc
      .replace(/\[.*?\]/g, "")        // remove [!], [T+Eng], etc
      .replace(/:\s*.*edition.*/i, "")// strip special editions
      .replace(/\s+-\s+.*/g, "")      // strip trailing "- blah"
      .replace(/™|®/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Simple title matching (reuse normTitle and titleScore from map-release if needed)
  function normTitle(s: string) {
    return (s || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/['']/g, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[:,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleScore(a: string, b: string) {
    const A = new Set(normTitle(a).split(" ").filter(Boolean));
    const B = new Set(normTitle(b).split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / Math.max(A.size, B.size);
  }

  // Find best match (using normalized title for better matching)
  const normalizedTitle = normalizeTitleForRa(title);
  let best: any = null;
  let bestScore = 0;

  for (const g of Array.isArray(gameList) ? gameList : []) {
    const gTitle = String(g?.Title ?? g?.title ?? "");
    const normalizedGTitle = normalizeTitleForRa(gTitle);
    // Use normalized title for matching, but keep original for display
    const s = titleScore(normalizedTitle, normalizedGTitle);
    if (s > bestScore) {
      bestScore = s;
      best = g;
    }
  }

  if (!best || bestScore < 0.72) {
    return { 
      mapped: false, 
      already_mapped: false,
      reason: "Low confidence match",
      details: best 
        ? `Best match: "${best.Title ?? best.title}" (score: ${(bestScore * 100).toFixed(0)}%, threshold: 72%)`
        : "No matches found in RA database",
    };
  }

  const raGameId = String(best?.ID ?? best?.id ?? "").trim();
  if (!raGameId) {
    return { 
      mapped: false, 
      already_mapped: false, 
      error: "Matched game had no ID",
      reason: "Data integrity issue",
    };
  }

  // Upsert mapping
  const { error: mapErr } = await supabaseAdmin.from("release_external_ids").upsert(
    {
      release_id: releaseId,
      source: "ra",
      external_id: raGameId,
    },
    { onConflict: "release_id,source" }
  );

  if (mapErr) {
    return { mapped: false, already_mapped: false, error: mapErr.message };
  }

  return { mapped: true, already_mapped: false };
}
