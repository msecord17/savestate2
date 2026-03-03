import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Accept whatever your quiz page sends; store whole payload.
  const payload = body ?? {};

  // Identify user if logged in
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  const { data, error } = await supabaseServer
    .from("quiz_sessions")
    .insert({
      user_id: user?.id ?? null,
      payload,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const quizSessionId = data?.id;
  if (!quizSessionId) {
    return NextResponse.json({ ok: false, error: "Insert succeeded but no session id" }, { status: 500 });
  }

  const intent = String(payload?.intent ?? "create_account");
  const redirect = user
    ? intent === "connect_platforms"
      ? "/connect"
      : "/gamehome"
    : "/onboarding/create-account";
  const res = NextResponse.json({
    ok: true,
    quiz_session_id: quizSessionId,
    redirect,
  });

  // Save session id for later claim/association
  res.cookies.set("gh_quiz_session", quizSessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });

  return res;
}
