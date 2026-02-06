import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  // We keep this dead simple: send user to RA, then come back to our callback with `u=USERNAME`
  // In practice you’ll want OAuth-style proof. For MVP testing, username-based connect is fine.
  // If you already had a stronger RA flow earlier, tell me and we’ll restore that exact version.

  const returnTo = `${origin}/api/auth/retroachievements/callback`;
  const raLoginUrl = `${origin}/retroachievements-connect?returnTo=${encodeURIComponent(returnTo)}`;

  // If you don't have a dedicated UI page, we'll add one in Step 2C.
  return NextResponse.redirect(raLoginUrl);
}
