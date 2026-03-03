import { redirect } from "next/navigation";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import PortfolioClient from "./PortfolioClient";

export default async function PortfolioPage() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("portfolio_entries")
    .select(`
      id,
      release_id,
      created_at,
      status,
      playtime_minutes,
      release:releases(
        id,
        display_title,
        platform_key,
        cover_url,
        release_date,
        game:games(
          id,
          canonical_title,
          cover_url,
          first_release_year
        )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return <PortfolioClient entries={[]} loadError={error.message} />;
  }

  return <PortfolioClient entries={(data ?? []) as any[]} loadError={null} />;
}
