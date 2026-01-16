import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ version: "profile-me-v3", user: null, profile: null });
  }

  const user = userRes.user;

  // 1) Try read
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // 2) If missing, try create
  if (!existing) {
    const now = new Date().toISOString();
    const { error: insErr } = await supabase.from("profiles").insert({
      user_id: user.id,
      created_at: now,
      updated_at: now,
    });

    if (insErr) {
      return NextResponse.json(
        {
          version: "profile-me-v3",
          user: { id: user.id, email: user.email },
          profile: null,
          error: `Failed to create profile row: ${insErr.message}`,
        },
        { status: 500 }
      );
    }
  }

  // 3) Re-read
  const { data: profile, error: sel2Err } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (sel2Err) {
    return NextResponse.json(
      {
        version: "profile-me-v3",
        user: { id: user.id, email: user.email },
        profile: null,
        error: `Failed to load profile row: ${sel2Err.message}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    version: "profile-me-v3",
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
  });
}
