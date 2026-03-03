import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { adminClient } from "@/lib/supabase/admin-client";

export async function requireAdmin() {
  // 1) Must be logged in (uses anon key + cookies)
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }

  // 2) Must be admin (we can safely check with service-role server-side)
  const admin = adminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (error || !data?.is_admin) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, user };
}
