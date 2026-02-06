import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await supabaseRoute();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Send user somewhere useful after login
  return NextResponse.redirect(new URL("/my-portfolio", req.url));
}
