import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export default async function ProfileRedirect() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) redirect("/login?next=/profile");

  const { data: prof } = await supabaseServer
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const username = prof?.username?.trim();
  if (!username) redirect("/settings?tab=profile");

  redirect(`/users/${encodeURIComponent(username)}`);
}
