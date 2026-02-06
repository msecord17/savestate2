// app/api/ra/map/route.ts
import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { mapReleaseToRA } from "@/lib/ra/map-release";

// Keep your platform->RA console mapping helper here (or import it)
// This is only used to decide if a release is RA-compatible.
function resolveRaConsoleId(
  platformKeyRaw: string | null,
  platformNameRaw: string | null,
  platformLabelRaw: string | null
) {
  const s = `${platformKeyRaw ?? ""} ${platformNameRaw ?? ""} ${platformLabelRaw ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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
  ];

  for (const [re, id] of map) {
    if (re.test(s)) return id;
  }
  return null;
}

const LIMIT = 100;
const DEFAULT_PAGES = 5;

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

  // Load RA creds for this user (required for mapping)
  const { data: conn, error: connErr } = await supabaseUser
    .from("user_ra_connections")
    .select("ra_username, ra_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });
  if (!conn?.ra_username || !conn?.ra_api_key) {
    return NextResponse.json({ error: "RetroAchievements not connected yet." }, { status: 400 });
  }

  const raUsername = String(conn.ra_username).trim();
  const raApiKey = String(conn.ra_api_key).trim();

  const url = new URL(req.url);
  let cursor = url.searchParams.get("cursor");
  const pages = Math.max(1, Math.min(Number(url.searchParams.get("pages") ?? DEFAULT_PAGES), 25));

  const totals = {
    scanned: 0,
    candidates: 0,
    mapped: 0,
    already_mapped: 0,
    no_match: 0,
    skipped: 0,
    errors: [] as Array<{ release_id: string; title: string; reason: string; details?: string }>,
  };

  let hasMore = true;
  let lastCursorUsed: string | null = cursor;

  for (let page = 0; page < pages; page++) {
    // ── RUN ONE PAGE ──
    // 1) Fetch a SCAN PAGE (limit+1) ordered by id
    let q = supabaseAdmin
      .from("releases")
      .select("id, display_title, platform_key, platform_name, platform_label")
      .not("display_title", "is", null)
      .order("id", { ascending: true })
      .limit(LIMIT + 1);

    if (cursor) q = q.gt("id", cursor);

    const { data: pageRows, error: pageErr } = await q;
    if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });

    const rows = Array.isArray(pageRows) ? pageRows : [];
    hasMore = rows.length > LIMIT;

    // Only process the first LIMIT rows (the +1 row is just for hasMore)
    const scanWindow = rows.slice(0, LIMIT);

    // IMPORTANT: if scanWindow empty, break
    if (scanWindow.length === 0) {
      hasMore = false;
      break;
    }

    // Cursor MUST advance based on scan position, not on filtered/mapped subset
    const nextCursor = scanWindow.length ? scanWindow[scanWindow.length - 1].id : null;

    let scanned = scanWindow.length;
    let candidates = 0;
    let mapped = 0;
    let alreadyMapped = 0;
    let noMatch = 0;
    let skipped = 0;

    for (const r of scanWindow) {
      const title = String(r.display_title ?? "").trim();
      if (!title) {
        skipped += 1;
        continue;
      }

      // Only attempt mapping if platform is RA-compatible
      const consoleId = resolveRaConsoleId(r.platform_key, r.platform_name, r.platform_label);
      if (!consoleId) {
        skipped += 1;
        continue;
      }

      candidates += 1;

      try {
        const result = await mapReleaseToRA(supabaseAdmin, r.id, {
          raUsername,
          raApiKey,
          dryRun: false,
        });

        if (result.ok && result.ra_game_id) {
          // If mapReleaseToRA returns "Already mapped." it will still be ok+ra_game_id
          // so rely on the note to count it separately.
          if (result.note === "Already mapped.") alreadyMapped += 1;
          else mapped += 1;
        } else if (result.ok && !result.ra_game_id) {
          // “No confident match” style
          noMatch += 1;
          if (totals.errors.length < 50) {
            totals.errors.push({
              release_id: r.id,
              title,
              reason: result.note || "No confident match",
              details: result.confidence != null ? `Confidence ${(result.confidence * 100).toFixed(0)}%` : undefined,
            });
          }
        } else {
          if (totals.errors.length < 50) {
            totals.errors.push({
              release_id: r.id,
              title,
              reason: result.note || "Mapping failed",
            });
          }
        }
      } catch (e: any) {
        if (totals.errors.length < 50) {
          totals.errors.push({
            release_id: r.id,
            title,
            reason: "Exception during mapping",
            details: e?.message || "unknown error",
          });
        }
      }
    }

    // Accumulate totals
    totals.scanned += scanned;
    totals.candidates += candidates;
    totals.mapped += mapped;
    totals.already_mapped += alreadyMapped;
    totals.no_match += noMatch;
    totals.skipped += skipped;

    // Update cursor for next loop
    cursor = nextCursor;
    lastCursorUsed = cursor;

    // If no more items, break
    if (!hasMore) {
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    ...totals,
    cursor_used: url.searchParams.get("cursor") ?? null,
    next_cursor: lastCursorUsed,
    has_more: hasMore,
    pages_run: pages,
  });
}