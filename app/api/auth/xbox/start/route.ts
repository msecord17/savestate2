import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const publicKey = process.env.OPENXBL_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "Missing OPENXBL_PUBLIC_KEY in env" }, { status: 500 });
  }

  // OpenXBL expects your app's callback URL to be configured in their dashboard.
  // We'll still send users to the standard auth entry point.
  const authUrl = `https://xbl.io/app/auth/${encodeURIComponent(publicKey)}`;

  // Optional: keep a return target for your UI
  const redirectTo = `${origin}/xbox-connect`;
  return NextResponse.redirect(`${authUrl}?redirect=${encodeURIComponent(redirectTo)}`);
}
