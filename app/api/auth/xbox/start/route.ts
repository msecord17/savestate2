import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const clientId = process.env.XBOX_CLIENT_ID;
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Missing XBOX_CLIENT_ID" }, { status: 500 });
  }

  // Use Live.com OAuth (consumer) for Xbox scope support
  const authUrl = new URL("https://login.live.com/oauth20_authorize.srf");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);

  // This is the key change:
  authUrl.searchParams.set("scope", "XboxLive.signin offline_access");

  // simple state for MVP
  authUrl.searchParams.set("state", "savestate");

  return NextResponse.redirect(authUrl.toString());
}
