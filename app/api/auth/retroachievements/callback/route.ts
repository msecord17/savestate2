import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../../lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const raUsername = (url.searchParams.get("u") || "").trim();

  if (!raUsername) {
    return NextResponse.redirect(`${origin}/profile?ra=error_missing_username`);
  }

  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.redirect(`${origin}/profile?ra=error_not_logged_in`);
  }

  const user = userRes.user;

  const { error: upsertErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    ra_username: raUsername,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return NextResponse.redirect(`${origin}/profile?ra=error_save_failed`);
  }

  return NextResponse.redirect(`${origin}/profile?ra=connected`);
}
