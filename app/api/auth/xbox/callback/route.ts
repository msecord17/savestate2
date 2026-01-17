import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const doneUrl = `${origin}/profile`;

  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  if (err) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", err);
    if (errDesc) out.searchParams.set("detail", errDesc);
    return NextResponse.redirect(out.toString());
  }

  if (!code) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "missing_code");
    return NextResponse.redirect(out.toString());
  }

  // Must be logged into YOUR app to attach tokens
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "not_logged_in_to_app");
    return NextResponse.redirect(out.toString());
  }

  const user = userRes.user;

  const clientId = process.env.XBOX_CLIENT_ID || "";
  const clientSecret = process.env.XBOX_CLIENT_SECRET || "";
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId || !clientSecret) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "missing_xbox_env");
    return NextResponse.redirect(out.toString());
  }

  // Exchange code -> token
  const tokenRes = await fetch(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        // NOTE: scopes not required here, only on /authorize
      }).toString(),
    }
  );

  const tokenText = await tokenRes.text();
  let tokenJson: any = null;
  try {
    tokenJson = tokenText ? JSON.parse(tokenText) : null;
  } catch {
    tokenJson = null;
  }

  if (!tokenRes.ok) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "token_exchange_failed");
    out.searchParams.set("detail", tokenText.slice(0, 700));
    return NextResponse.redirect(out.toString());
  }

  const accessToken = String(tokenJson?.access_token ?? "").trim();
  const refreshToken = String(tokenJson?.refresh_token ?? "").trim();

  if (!accessToken) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "missing_access_token");
    out.searchParams.set("detail", tokenText.slice(0, 700));
    return NextResponse.redirect(out.toString());
  }

  // Save tokens to profiles
  const { error: upErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    xbox_access_token: accessToken,
    xbox_refresh_token: refreshToken || null,
    xbox_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (upErr) {
    const out = new URL(doneUrl);
    out.searchParams.set("error", "profile_upsert_failed");
    out.searchParams.set("detail", upErr.message);
    return NextResponse.redirect(out.toString());
  }

  // success
  const out = new URL(doneUrl);
  out.searchParams.set("xbox", "connected");
  return NextResponse.redirect(out.toString());
}
