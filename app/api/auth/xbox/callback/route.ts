import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  if (err) {
    return NextResponse.redirect(
      `${origin}/profile?error=${encodeURIComponent(err)}&detail=${encodeURIComponent(errDesc || "")}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/profile?error=missing_code`);
  }

  const clientId = process.env.XBOX_CLIENT_ID!;
  const clientSecret = process.env.XBOX_CLIENT_SECRET!;
  const redirectUri = process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/profile?error=missing_xbox_env`);
  }

  // IMPORTANT: consumer token endpoint (live.com)
  const tokenRes = await fetch("https://login.live.com/oauth20_token.srf", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
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

  if (!tokenRes.ok || !tokenJson?.access_token) {
    return NextResponse.redirect(
      `${origin}/profile?error=token_exchange_failed&detail=${encodeURIComponent(tokenText)}`
    );
  }

  const accessToken = String(tokenJson.access_token);
  const refreshToken = String(tokenJson.refresh_token || "");
  const expiresIn = Number(tokenJson.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();

  if (!userRes?.user) {
    return NextResponse.redirect(`${origin}/profile?error=not_logged_in`);
  }

  const user = userRes.user;

  const { error: upErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    xbox_connected_at: new Date().toISOString(),
    xbox_access_token: accessToken,
    xbox_refresh_token: refreshToken || null,
    xbox_access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (upErr) {
    return NextResponse.redirect(`${origin}/profile?error=save_failed&detail=${encodeURIComponent(upErr.message)}`);
  }

  return NextResponse.redirect(`${origin}/profile?xbox=connected`);
}
