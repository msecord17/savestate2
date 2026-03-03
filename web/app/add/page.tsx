// app/add/page.tsx
import { redirect } from "next/navigation";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import AddGamePageClient from "./AddGamePageClient";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const supabase = await supabaseRouteClient();
  const { data } = await supabase.auth.getUser();

  // You can relax this if you want /add visible to logged-out users
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent("/add")}`);
  }

  const params = searchParams ? await searchParams : {};
  return <AddGamePageClient initialQuery={(params as { q?: string }).q ?? ""} />;
}
