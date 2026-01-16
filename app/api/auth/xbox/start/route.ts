import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const clientId = process.env.XBOX_CLIENT_ID;
  const redirectUri = process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Missing XBOX_CLIENT_ID" }, { status: 500 });
  }

  // IMPORTANT: Use the CONSUMER endpoint (live.com), not Azure AD tenant endpoints.
  const authUrl = new URL("https://login.live.com/oauth20_authorize.srf");

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "XboxLive.signin offline_access");
  authUrl.searchParams.set("state", "savestate");

  // Force account picker (so it doesn't silently reuse prior session)
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString());
}
