import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function getPublicOrigin(req: Request) {
  const h = req.headers;

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (host) return `${proto}://${host}`;

  return new URL(req.url).origin;
}

function extractSteamId(claimedId: string) {
  // claimedId: https://steamcommunity.com/openid/id/7656119...
  const parts = claimedId.split("/");
  return parts[parts.length - 1] || null;
}

export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const url = new URL(req.url);
  const search = url.searchParams;

  const claimedId = search.get("openid.claimed_id") || "";
  if (!claimedId) {
    return NextResponse.redirect(`${origin}/profile?steam=error_missing_claimed_id`);
  }

  // 1) Verify OpenID with Steam (check_authentication)
  const verifyParams = new URLSearchParams();
  for (const [k, v] of search.entries()) {
    if (k.startsWith("openid.")) verifyParams.set(k, v);
  }
  verifyParams.set("openid.mode", "check_authentication");

  const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });

  const verifyText = await verifyRes.text();
  if (!verifyText.includes("is_valid:true")) {
    return NextResponse.redirect(`${origin}/profile?steam=error_invalid`);
  }

  // 2) Extract SteamID64
  const steamId = extractSteamId(claimedId);
  if (!steamId) {
    return NextResponse.redirect(`${origin}/profile?steam=error_bad_steamid`);
  }

  // 3) Must be logged in to your app to attach Steam to a user
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.redirect(`${origin}/profile?steam=error_not_logged_in`);
  }

  const user = userRes.user;

  // 4) Save Steam connection
  const { error: upsertErr } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      steam_id: steamId,
      steam_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertErr) {
    return NextResponse.redirect(`${origin}/profile?steam=error_save_failed`);
  }

  return NextResponse.redirect(`${origin}/profile?steam=connected`);
}
