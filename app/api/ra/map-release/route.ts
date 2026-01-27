// app/api/ra/map-release/route.ts
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

function normTitle(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/\([^)]*\)/g, " ") // remove parenthetical
    .replace(/\[[^\]]*\]/g, " ") // remove bracketed
    .replace(/[:,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// very simple token overlap score (0..1)
function titleScore(a: string, b: string) {
  const A = new Set(normTitle(a).split(" ").filter(Boolean));
  const B = new Set(normTitle(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

async function raFetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`RA JSON parse failed: ${text.slice(0, 200)}`);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const releaseId = url.searchParams.get("release_id");
  const dryRun = url.searchParams.get("dry_run") === "1";

  if (!releaseId) {
    return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
  }

  const supabaseUser = await supabaseRouteClient();
  const { data: userRes } = await supabaseUser.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // service role so we can safely upsert mappings
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 0) Already mapped?
  const { data: existing } = await supabaseAdmin
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  if (existing?.external_id) {
    return NextResponse.json({
      ok: true,
      already_mapped: true,
      ra_game_id: existing.external_id,
    });
  }

  // 1) Load release title + platform
  const { data: rel, error: relErr } = await supabaseAdmin
    .from("releases")
    .select("id, display_title, platform_key, platform_name, platform_label")
    .eq("id", releaseId)
    .maybeSingle();

  if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500 });
  if (!rel?.display_title) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  const title = String(rel.display_title);
  const normalizedTitle = normalizeTitleForRa(title);
  
  // Resolve RA Console ID directly (no API call needed)
  const raConsoleId = resolveRaConsoleId(
    rel.platform_key,
    rel.platform_name,
    rel.platform_label
  );

  if (!raConsoleId) {
    return NextResponse.json({
      ok: false,
      note: `Could not resolve RA system id for '${rel.platform_label ?? rel.platform_name ?? rel.platform_key}'.`,
    });
  }

  // 3) Resolve RA system id by name
  // You *can* cache this list in DB later; for now keep it simple.
  // RA docs: “All Systems” endpoint exists. :contentReference[oaicite:2]{index=2}
  // 2) Resolve RA creds (service creds preferred, else user creds)
  let raUsername = String(process.env.RA_USERNAME ?? "").trim();
  let raApiKey = String(process.env.RA_WEB_API_KEY ?? "").trim();

  if (!raUsername || !raApiKey) {
    const { data: conn, error: connErr } = await supabaseUser
      .from("user_ra_connections")
      .select("ra_username, ra_api_key")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });

    raUsername = String(conn?.ra_username ?? "").trim();
    raApiKey = String(conn?.ra_api_key ?? "").trim();
  }

  if (!raUsername || !raApiKey) {
    return NextResponse.json(
      { error: "RetroAchievements credentials missing. Set RA_USERNAME/RA_WEB_API_KEY or connect RA for this user." },
      { status: 400 }
    );
  }

  // 2) Fetch game list for that system
  // RA docs: “All Games for System” endpoint exists; optionally filter to only games with achievements. :contentReference[oaicite:3]{index=3}
  // f=1 -> only games that have achievements (if supported by endpoint).
  const gamesUrl =
    `https://retroachievements.org/API/API_GetGameList.php` +
    `?z=${encodeURIComponent(raUsername)}&y=${encodeURIComponent(raApiKey)}` +
    `&i=${encodeURIComponent(String(raConsoleId))}` +
    `&f=1`;

  const gameList = await raFetchJson(gamesUrl); // array of {ID, Title, ...}

  // 4) Best match by score (using normalized title for better matching)
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

  // Tune threshold as you test. Pokemon titles are usually pretty matchable.
  if (!best || bestScore < 0.72) {
    return NextResponse.json({
      ok: true,
      mapped: false,
      systemId: raConsoleId,
      best_guess: best ? { id: best.ID ?? best.id, title: best.Title ?? best.title, score: bestScore } : null,
      note: "No confident match. Improve platform mapping, title normalization, or lower threshold.",
    });
  }

  const raGameId = String(best?.ID ?? best?.id ?? "").trim();
  if (!raGameId) {
    return NextResponse.json({ ok: false, note: "Matched game had no ID?" }, { status: 500 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      mapped: false,
      dry_run: true,
      systemId: raConsoleId,
      match: { ra_game_id: raGameId, ra_title: best.Title ?? best.title, score: bestScore },
    });
  }

  // 5) Upsert mapping
  const { error: mapErr } = await supabaseAdmin.from("release_external_ids").upsert(
    {
      release_id: releaseId,
      source: "ra",
      external_id: raGameId,
    },
    { onConflict: "release_id,source" }
  );

  if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mapped: true,
    release_id: releaseId,
    ra_game_id: raGameId,
    ra_title: best.Title ?? best.title,
    score: bestScore,
    systemId: raConsoleId,
  });
}
