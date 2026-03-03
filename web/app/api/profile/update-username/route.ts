import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(username)) {
    return "Username must be 3–24 chars, start with a letter, and use only letters, numbers, underscores.";
  }
  if (username.includes("__")) return "Username cannot contain double underscores.";
  if (username.endsWith("_")) return "Username cannot end with an underscore.";
  return null;
}

function mapDbErrorToMessage(err: any): string {
  const msg = String(err?.message ?? "");
  const code = String(err?.code ?? "");

  // Unique violation (Postgres)
  if (code === "23505") return "That username is already taken.";

  // Check constraint violation (Postgres)
  if (code === "23514") return "That username is invalid.";

  // Your custom cooldown trigger error (common patterns)
  // If you used a RAISE EXCEPTION with a custom message, it will show up in msg.
  if (msg.toLowerCase().includes("cooldown")) {
    return "You can only change your username once every 30 days.";
  }

  // Fallback
  return "Could not update username. Please try again.";
}

/** POST /api/profile/update-username  body: { username: string } (auth required) */
export async function POST(req: Request) {
  const cookieStore = await cookies();

  // ✅ SSR client to read session cookie
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = String(body?.username ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing username" }, { status: 400 });
  }

  const lower = raw.toLowerCase();
  if (RESERVED.has(lower)) {
    return NextResponse.json({ ok: false, error: "That username is reserved." }, { status: 400 });
  }

  const formatErr = validateFormat(raw);
  if (formatErr) {
    return NextResponse.json({ ok: false, error: formatErr }, { status: 400 });
  }

  // ✅ Service role client to bypass RLS and ensure write succeeds
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load current username so we can short-circuit (saving the same name should succeed)
  const { data: existing, error: existingErr } = await admin
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr || !existing) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  const current = String(existing.username ?? "").trim();
  if (current && current.toLowerCase() === raw.toLowerCase()) {
    // No change needed
    return NextResponse.json({ ok: true, username: current });
  }

  // Attempt update; DB constraints/triggers enforce:
  // - case-insensitive uniqueness
  // - cooldown
  // - format checks (if you created them in DB)
  const { data: updated, error: updateErr } = await admin
    .from("profiles")
    .update({ username: raw })
    .eq("user_id", user.id)
    .select("username")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ ok: false, error: mapDbErrorToMessage(updateErr) }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username: updated?.username ?? raw });
}
