import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  // Handle OAuth errors FIRST (this fixes your current invalid_scope redirect loop)
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  if (err) {
    return NextResponse.redirect(
      `${origin}/profile?error=${encodeURIComponent(err)}&error_description=${encodeURIComponent(errDesc || "")}`
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/profile?error=missing_code`);
  }

  const clientId = process.env.XBOX_CLIENT_ID;
  const clientSecret = process.env.XBOX_CLIENT_SECRET;
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/profile?error=missing_xbox_env`);
  }

  // Exchange code for Live.com tokens (NOT microsoftonline v2 token endpoint)
  const tokenRes = await fetch("https://login.live.com/oauth20_token.srf", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  const tokenText = await tokenRes.text();
  let tokenJson: any = null;
  try {
    tokenJson = tokenText ? JSON.parse(tokenText) : null;
  } catch {
    tokenJson = null;
  }

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${origin}/profile?error=token_exchange_failed&detail=${encodeURIComponent(tokenText || "")}`
    );
  }

  // Must be logged into your app to attach Xbox tokens to this user
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();

  if (!userRes?.user) {
    return NextResponse.redirect(`${origin}/profile?error=not_logged_in`);
  }

  const user = userRes.user;

  // Store tokens for MVP (later: encrypt / separate table)
  const { error: upErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    xbox_access_token: tokenJson?.access_token ?? null,
    xbox_refresh_token: tokenJson?.refresh_token ?? null,
    xbox_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (upErr) {
    return NextResponse.redirect(
      `${origin}/profile?error=save_failed&detail=${encodeURIComponent(upErr.message)}`
    );
  }

  return NextResponse.redirect(`${origin}/profile?xbox=connected`);
}
