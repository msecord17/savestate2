import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function decodePart(part: string) {
  part = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = part.length % 4;
  if (pad) part += "=".repeat(4 - pad);
  const json = Buffer.from(part, "base64").toString("utf8");
  return JSON.parse(json);
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("xbox_access_token")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = String(profile?.xbox_access_token ?? "");
  if (!token) return NextResponse.json({ error: "No xbox_access_token" }, { status: 400 });

  const parts = token.split(".");
  if (parts.length < 2) {
    return NextResponse.json({ ok: true, kind: "opaque", token_len: token.length });
  }

  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);

  return NextResponse.json({
    ok: true,
    token_len: token.length,
    header: { alg: header.alg, typ: header.typ, kid: header.kid },
    payload: {
      iss: payload.iss,
      aud: payload.aud,
      tid: payload.tid,
      scp: payload.scp,
      exp: payload.exp,
      ver: payload.ver,
    },
  });
}
