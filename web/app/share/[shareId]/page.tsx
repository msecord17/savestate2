import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ShareWithTimeline from "./ShareWithTimeline";

/**
 * Public share page (no auth). Validates share_id then renders identity card + timeline
 * via client fetch to GET /api/identity/share/[shareId].
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (!shareId?.trim()) return notFound();

  const admin = supabaseServer;
  const { data: share } = await admin
    .from("user_identity_shares")
    .select("share_id")
    .eq("share_id", shareId.trim())
    .maybeSingle();

  if (!share) return notFound();

  return <ShareWithTimeline shareId={shareId.trim()} />;
}
