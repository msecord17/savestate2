import { NextResponse } from "next/server";

function getPublicOrigin(req: Request) {
  const h = req.headers;

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (host) return `${proto}://${host}`;

  // Fallback (dev usually)
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const origin = getPublicOrigin(req);

  const returnTo = `${origin}/api/auth/steam/callback`;
  const steamOpenId = "https://steamcommunity.com/openid/login";

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return NextResponse.redirect(`${steamOpenId}?${params.toString()}`);
}
