import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const clientId = process.env.XBOX_CLIENT_ID;
  const redirectUri =
    process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/profile?error=missing_xbox_client_id`
    );
  }

  // Use the consumer authority for personal Microsoft accounts
  const authorizeUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    // NOTE: Keep it minimal & valid. We can add more later.
    scope: "XboxLive.signin offline_access",
    state: "savestate",
    prompt: "select_account",
  });

  return NextResponse.redirect(`${authorizeUrl}?${params.toString()}`);
}
