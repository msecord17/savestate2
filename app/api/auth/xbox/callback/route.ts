import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  // Handle Microsoft returning an error
  const oauthError = url.searchParams.get("error");
  const oauthErrorDesc = url.searchParams.get("error_description");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/profile?error=xbox_oauth_${encodeURIComponent(oauthError)}&detail=${encodeURIComponent(
        oauthErrorDesc || ""
      )}`
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/profile?error=missing_code`);
  }

  const clientId = process.env.XBOX_CLIENT_ID || "";
  const clientSecret = process.env.XBOX_CLIENT_SECRET || "";
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/profile?error=missing_xbox_env`);
  }

  // IMPORTANT: consumers endpoint for personal MS accounts
  const tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

  try {
    // Exchange code -> Microsoft access token (properly form-encoded)
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: "XboxLive.signin offline_access",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const tokenText = await tokenRes.text();
    const tokenJson = tokenText ? JSON.parse(tokenText) : null;

    if (!tokenRes.ok) {
      // Bounce back with detail for debugging
      return NextResponse.redirect(
        `${origin}/profile?error=token_exchange_failed&detail=${encodeURIComponent(
          tokenText || ""
        )}`
      );
    }

    const accessToken = tokenJson?.access_token as string | undefined;
    const refreshToken = tokenJson?.refresh_token as string | undefined;

    if (!accessToken) {
      return NextResponse.redirect(`${origin}/profile?error=missing_access_token`);
    }

    // Must be logged into your app to attach Xbox to user
    const supabase = await supabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();

    if (!userRes?.user) {
      return NextResponse.redirect(`${origin}/profile?error=not_logged_in`);
    }

    const user = userRes.user;

    // Store tokens (MVP). You can encrypt later.
    const { error: upErr } = await supabase.from("profiles").upsert({
      user_id: user.id,
      xbox_connected_at: new Date().toISOString(),
      xbox_access_token: accessToken,
      xbox_refresh_token: refreshToken ?? null,
      xbox_last_synced_at: null,
      xbox_last_sync_count: null,
      updated_at: new Date().toISOString(),
    });

    if (upErr) {
      return NextResponse.redirect(
        `${origin}/profile?error=save_failed&detail=${encodeURIComponent(upErr.message)}`
      );
    }

    return NextResponse.redirect(`${origin}/profile?xbox=connected`);
  } catch (e: any) {
    return NextResponse.redirect(
      `${origin}/profile?error=callback_exception&detail=${encodeURIComponent(
        e?.message || String(e)
      )}`
    );
  }
}
