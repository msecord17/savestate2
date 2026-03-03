import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const id = cookieStore.get("gh_quiz_session")?.value ?? null;
  if (!id) return NextResponse.json({ ok: true, claimed: false });

  const { error } = await supabaseServer
    .from("quiz_sessions")
    .update({ user_id: user.id })
    .eq("id", id)
    .is("user_id", null);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, claimed: true });
}
