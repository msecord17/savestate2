import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const clientId = process.env.XBOX_CLIENT_ID!;
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  const authorize = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "XboxLive.signin offline_access",
    state: "savestate",
  });

  return NextResponse.redirect(`${authorize}?${params.toString()}`);
}
