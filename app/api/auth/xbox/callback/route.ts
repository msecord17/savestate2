import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const code = url.searchParams.get("code") || "";
  if (!code) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_missing_code`);
  }

  const publicKey = process.env.OPENXBL_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_missing_public_key`);
  }

  // Must be logged into your app to attach Xbox to a user
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_not_logged_in`);
  }

  // Claim the code to get the user's X-Authorization key
  const claimRes = await fetch("https://xbl.io/app/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, app_key: publicKey }),
  });

  const claimText = await claimRes.text();
  const claimJson = claimText ? JSON.parse(claimText) : null;

  if (!claimRes.ok) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_claim_failed`);
  }

  // The "secret key" is what we store and send as X-Authorization on API calls.
  const xblKey =
    claimJson?.secret_key || claimJson?.key || claimJson?.authorization || claimJson?.token || null;

  if (!xblKey) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_no_key_returned`);
  }

  const user = userRes.user;

  const { error: upErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    xbox_xbl_key: String(xblKey),
    xbox_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (upErr) {
    return NextResponse.redirect(`${origin}/xbox-connect?xbox=error_save_failed`);
  }

  return NextResponse.redirect(`${origin}/xbox-connect?xbox=connected`);
}
