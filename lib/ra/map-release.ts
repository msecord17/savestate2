// lib/ra/map-release.ts
import type { SupabaseClient } from "@supabase/supabase-js";

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
    .replace(/['']/g, "")
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

async function getRaGameListCached(
  supabaseAdmin: SupabaseClient,
  raConsoleId: number,
  raUsername: string,
  raApiKey: string
) {
  const CACHE_DAYS = 7;

  const { data: cached } = await supabaseAdmin
    .from("ra_game_list_cache")
    .select("fetched_at, payload")
    .eq("console_id", raConsoleId)
    .maybeSingle();

  if (cached?.fetched_at) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    if (ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000) {
      return cached.payload;
    }
  }

  const url =
    `https://retroachievements.org/API/API_GetGameList.php` +
    `?z=${encodeURIComponent(raUsername)}` +
    `&y=${encodeURIComponent(raApiKey)}` +
    `&i=${raConsoleId}&f=1`;

  const list = await raFetchJson(url);

  await supabaseAdmin
    .from("ra_game_list_cache")
    .upsert({
      console_id: raConsoleId,
      fetched_at: new Date().toISOString(),
      payload: list,
    });

  return list;
}

/**
 * Attempts to map a SaveState release -> RetroAchievements game id by:
 * - Reading the release (title/platform)
 * - Resolving RA system id from platform label/key
 * - Searching RA games and picking best match
 * - Writing release_external_ids(source='ra', external_id=raGameId)
 *
 * Returns: { ok, ra_game_id?, note?, confidence?, matched_title? }
 *
 * NOTE: This file should contain the *same logic* you already have in /api/ra/map-release,
 * just moved into a reusable function.
 */
export async function mapReleaseToRA(
  supabaseAdmin: SupabaseClient,
  releaseId: string,
  opts?: { 
    dryRun?: boolean;
    userId?: string;
    raUsername?: string;
    raApiKey?: string;
  }
): Promise<{
  ok: boolean;
  ra_game_id: number | null;
  note?: string;
  confidence?: number;
  matched_title?: string;
}> {
  const dryRun = Boolean(opts?.dryRun);

  // 0) Already mapped?
  const { data: existing } = await supabaseAdmin
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  const existingId = existing?.external_id ? Number(existing.external_id) : null;
  if (existingId && Number.isFinite(existingId)) {
    return { ok: true, ra_game_id: existingId, note: "Already mapped." };
  }

  // 1) Load release metadata (title + platform)
  const { data: rel, error: relErr } = await supabaseAdmin
    .from("releases")
    .select("id, display_title, platform_key, platform_label, platform_name")
    .eq("id", releaseId)
    .maybeSingle();

  if (relErr) return { ok: false, ra_game_id: null, note: relErr.message };
  if (!rel) return { ok: false, ra_game_id: null, note: "Release not found." };

  const title = String(rel.display_title ?? "").trim();
  if (!title) return { ok: false, ra_game_id: null, note: "Missing release title." };

  // 2) Resolve RA Console ID directly (no API call needed)
  const raConsoleId = resolveRaConsoleId(
    rel.platform_key,
    rel.platform_name,
    rel.platform_label
  );

  if (!raConsoleId) {
    return {
      ok: false,
      ra_game_id: null,
      note: `Could not resolve RA system id for '${rel.platform_label ?? rel.platform_name ?? rel.platform_key}'.`,
    };
  }

  // 3) Load RA credentials (service creds preferred, else from opts, else from user_ra_connections if userId provided)
  let raUsername = String(process.env.RA_USERNAME ?? "").trim();
  let raApiKey = String(process.env.RA_WEB_API_KEY ?? "").trim();

  // If no service creds, try opts
  if (!raUsername || !raApiKey) {
    raUsername = (opts as any)?.raUsername?.trim?.() ?? "";
    raApiKey = (opts as any)?.raApiKey?.trim?.() ?? "";
  }

  // If still no creds and userId provided, load from user_ra_connections
  if ((!raUsername || !raApiKey) && opts?.userId) {
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("user_ra_connections")
      .select("ra_username, ra_api_key")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (connErr) {
      return { ok: false, ra_game_id: null, note: connErr.message };
    }

    raUsername = String(conn?.ra_username ?? "").trim();
    raApiKey = String(conn?.ra_api_key ?? "").trim();
  }

  if (!raUsername || !raApiKey) {
    return {
      ok: false,
      ra_game_id: null,
      note: "RetroAchievements not connected yet.",
    };
  }

  // 4) Get game list for that system (cached 7 days)
  let gameList: any[] = [];

  try {
    const list = await getRaGameListCached(
      supabaseAdmin,
      raConsoleId,
      raUsername,
      raApiKey
    );
    gameList = Array.isArray(list) ? list : [];
  } catch (e: any) {
    return {
      ok: false,
      ra_game_id: null,
      note: `Failed to fetch RA games: ${e?.message || "unknown error"}`,
    };
  }

  // 5) Best match by score (using normalized title for better matching)
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

  // Tune threshold as you test. Pokemon titles are usually pretty matchable.
  if (!best || bestScore < 0.72) {
    return {
      ok: true,
      ra_game_id: null,
      confidence: bestScore,
      matched_title: best ? (best.Title ?? best.title ?? "") : null,
      note: "No confident match. Improve platform mapping, title normalization, or lower threshold.",
    };
  }

  const raGameId = String(best?.ID ?? best?.id ?? "").trim();
  if (!raGameId) {
    return { ok: false, ra_game_id: null, note: "Matched game had no ID?" };
  }

  const matchedTitle = best.Title ?? best.title ?? "";

  // 6) Write mapping
  if (!dryRun) {
    const { error: insErr } = await supabaseAdmin.from("release_external_ids").upsert(
      {
        release_id: releaseId,
        source: "ra",
        external_id: raGameId,
      },
      { onConflict: "release_id,source" }
    );

    if (insErr) {
      return { ok: false, ra_game_id: null, note: insErr.message };
    }
  }

  return {
    ok: true,
    ra_game_id: Number(raGameId),
    confidence: bestScore,
    matched_title: matchedTitle,
    note: dryRun ? "Dry run success (not written)." : "Mapped.",
  };
}
