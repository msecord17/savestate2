import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { psnAuthorizeFromNpsso, psnGetTitleTrophyDetails } from "@/lib/psn/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing release id" }, { status: 400 });
    }

    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Get release to check platform_key
    const { data: release } = await supabase
      .from("releases")
      .select("platform_key")
      .eq("id", id)
      .maybeSingle();

    if (!release || release.platform_key !== "psn") {
      return NextResponse.json({ trophies: [] });
    }

    // Get np_communication_id from psn_title_progress
    const { data: psnRows, error: psnErr } = await supabase
      .from("psn_title_progress")
      .select("np_communication_id, title_platform")
      .eq("user_id", user.id)
      .eq("release_id", id)
      .limit(1)
      .maybeSingle();

    if (psnErr || !psnRows?.np_communication_id) {
      return NextResponse.json({ trophies: [] });
    }

    const npCommunicationId = String(psnRows.np_communication_id);
    const trophyTitlePlatform = String(psnRows.title_platform ?? "PS5").trim() || "PS5";

    // Get NPSSO for authorization
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("psn_npsso, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr || !profile?.psn_npsso) {
      return NextResponse.json({ error: "PSN not connected" }, { status: 400 });
    }

    const authorization = await psnAuthorizeFromNpsso(String(profile.psn_npsso));
    const accountId = String(profile?.psn_account_id ?? "me");

    const { titleTrophies, earnedTrophies } = await psnGetTitleTrophyDetails(
      authorization,
      accountId,
      npCommunicationId,
      trophyTitlePlatform
    );

    // Merge earned into trophy list by trophyId
    const earnedMap = new Map<number, any>();
    for (const t of earnedTrophies ?? []) {
      if (typeof t?.trophyId === "number") {
        earnedMap.set(t.trophyId, t);
      }
    }

    const merged = (titleTrophies ?? []).map((t: any) => {
      const earned = earnedMap.get(t.trophyId);
      return {
        trophyId: t.trophyId,
        name: t.trophyName ?? "",
        description: t.trophyDetail ?? "",
        iconUrl: t.trophyIconUrl ?? null,
        earned: Boolean(earned?.earned),
        earnedAt: earned?.earnedDateTime ?? null,
        rarity: t.trophyEarnedRate ?? t.trophyRare ?? null,
      };
    });

    return NextResponse.json({ trophies: merged });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load trophies" }, { status: 500 });
  }
}
