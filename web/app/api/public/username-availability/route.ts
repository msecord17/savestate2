import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CACHE_MAX_AGE = 60; // 1 min
const STALE_WHILE_REVALIDATE = 5 * 60;

const RESERVED = new Set([
  "api",
  "u",
  "admin",
  "settings",
  "login",
  "logout",
  "signup",
  "account",
  "profile",
  "public",
  "releases",
  "games",
  "static",
  "images",
  "assets",
  "favicon",
]);

function validateFormat(username: string): string | null {
  // Must match DB check:
  // - starts with letter
  // - 3–24 chars total
  // - letters/numbers/underscore
  // - no double underscores
  // - cannot end with underscore
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(username)) {
    return "Username must be 3–24 chars, start with a letter, and use only letters, numbers, underscores.";
  }
  if (username.includes("__")) return "Username cannot contain double underscores.";
  if (username.endsWith("_")) return "Username cannot end with an underscore.";
  return null;
}

/** GET /api/public/username-availability?username=... */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("username") ?? "").trim();

  if (!raw) {
    return NextResponse.json(
      { ok: true, available: false, reason: "Missing username" },
      { status: 200 }
    );
  }

  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (RESERVED.has(lower)) {
    return NextResponse.json(
      { ok: true, available: false, reason: "Reserved" },
      {
        status: 200,
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  }

  const formatErr = validateFormat(normalized);
  if (formatErr) {
    return NextResponse.json(
      { ok: true, available: false, reason: formatErr },
      { status: 200 }
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Case-insensitive + trimmed match (matches your unique index strategy)
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("username", normalized)
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Database error" },
      { status: 500 }
    );
  }

  const available = !data || data.length === 0;

  return NextResponse.json(
    { ok: true, available },
    {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      },
    }
  );
}
