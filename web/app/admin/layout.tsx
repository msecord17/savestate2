import { redirect } from "next/navigation";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { adminClient } from "@/lib/supabase/admin-client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) redirect("/login");

  const admin = adminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", auth.user.id)
    .single();

  if (!data?.is_admin) redirect("/");

  return <>{children}</>;
}
