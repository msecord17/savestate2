import { createClient } from "@supabase/supabase-js";

const RA_PLATFORMS = new Set([
  "nes","snes","n64","gb","gbc","gba","genesis","sms","gg","ps1","ps2","psp",
  "saturn","dc","arcade","pcengine","segacd","32x","ngp","ngpc",
]);

function normTitle(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[:\-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRACompatiblePlatform(platform_key: string | null) {
  return platform_key ? RA_PLATFORMS.has(platform_key.toLowerCase()) : false;
}

/**
 * Attempts to ensure release_external_ids has source='ra' for this release.
 * Returns { ok, mapped, ra_game_id, note }
 */
export async function ensureRaMappingForRelease(opts: {
  releaseId: string;
  // used for matching
  displayTitle: string;
  platformKey: string | null;

  // Supabase creds (service role recommended)
  supabaseUrl: string;
  serviceRoleKey: string;

  // Your internal mapping function / API call wrapper:
  // Provide a function that returns { ok, ra_game_id, note }
  // (you likely already have this logic in /api/ra/map-release)
  mapRelease: (args: { releaseId: string }) => Promise<{ ok: boolean; ra_game_id?: number | null; note?: string }>;
}) {
  const { releaseId, platformKey } = opts;

  if (!isRACompatiblePlatform(platformKey)) {
    return { ok: true, mapped: false, ra_game_id: null, note: "Platform not RA-compatible." };
  }

  const supabaseAdmin = createClient(opts.supabaseUrl, opts.serviceRoleKey);

  // 1) Already mapped?
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  if (exErr) return { ok: false, mapped: false, ra_game_id: null, note: exErr.message };

  const existingId = existing?.external_id ? Number(existing.external_id) : null;
  if (existingId && Number.isFinite(existingId)) {
    return { ok: true, mapped: false, ra_game_id: existingId, note: "Mapping already exists." };
  }

  // 2) Try mapping
  const res = await opts.mapRelease({ releaseId });

  if (!res.ok || !res.ra_game_id) {
    return { ok: false, mapped: false, ra_game_id: null, note: res.note || "Mapping failed." };
  }

  // (Your mapRelease route likely writes release_external_ids already.
  // If it doesn't, you can upsert here — but sounds like yours does.)
  return { ok: true, mapped: true, ra_game_id: res.ra_game_id, note: "Mapped on-demand." };
}
