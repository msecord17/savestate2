import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

function getBaseUrl(req: Request) {
  // Prefer explicit config in dev/prod
  const envBase = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envBase) return envBase;

  // Fallback: derive from request headers (works on Vercel)
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/my-portfolio";

  if (code) {
    const supabase = await supabaseRoute();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const safe = nextPath.startsWith("/") && !nextPath.startsWith("//");
  const destPath = safe ? nextPath : "/my-portfolio";

  const base = getBaseUrl(req);
  return NextResponse.redirect(new URL(destPath, base));
}
