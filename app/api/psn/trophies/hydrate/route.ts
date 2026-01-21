import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import {
  psnAuthorizeFromNpsso,
  psnAccountIdFromOnlineId,
} from "@/lib/psn/server";
import { getUserTrophiesEarnedForTitle, getTitleTrophies } from "psn-api";
import { getUserTrophyGroupsForTitle } from "@/lib/psn/server"; // you export this already

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const release_id = String(body?.release_id ?? "").trim();
    if (!release_id) {
      return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
    }

    // service role for trophy upserts
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load profile creds
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("psn_npsso, psn_online_id, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const npsso = String(profile?.psn_npsso ?? "").trim();
    const onlineId = String(profile?.psn_online_id ?? "").trim();
    if (!npsso) return NextResponse.json({ error: "PSN not connected (missing NPSSO)" }, { status: 400 });
    if (!onlineId) return NextResponse.json({ error: "Missing psn_online_id (save PSN username in profile)" }, { status: 400 });

    // Resolve authorization + real accountId
    const authorization = await psnAuthorizeFromNpsso(npsso);

    let accountId = profile?.psn_account_id ? String(profile.psn_account_id) : "";
    if (!accountId) {
      accountId = await psnAccountIdFromOnlineId(authorization, onlineId);
      await supabaseUser
        .from("profiles")
        .update({ psn_account_id: accountId, updated_at: nowIso() })
        .eq("user_id", user.id);
    }

    // Resolve np_communication_id + platform from psn_title_progress for this release
    const { data: tp, error: tpErr } = await supabaseUser
      .from("psn_title_progress")
      .select("np_communication_id, title_platform")
      .eq("user_id", user.id)
      .eq("release_id", release_id)
      .maybeSingle();

    if (tpErr) return NextResponse.json({ error: tpErr.message }, { status: 500 });

    const npCommunicationId = String(tp?.np_communication_id ?? "").trim();
    const trophyTitlePlatform = String(tp?.title_platform ?? "PS5").trim() || "PS5";
    if (!npCommunicationId) {
      return NextResponse.json({ error: "No np_communication_id found for this release_id" }, { status: 400 });
    }

    // Important: PS4/PS3/Vita often require npServiceName: "trophy"
    const opts = {
      npServiceName: (trophyTitlePlatform.includes("PS5") ? undefined : "trophy") as
        | "trophy"
        | "trophy2"
        | undefined,
    };

    // 1) Groups (includes "default" base game)
    const groups = await getUserTrophyGroupsForTitle(
      authorization.accessToken,
      accountId,
      npCommunicationId
    );

    // Always include "default" even if groups endpoint is weird
    const groupIds = new Set<string>(["default"]);
    if (Array.isArray(groups)) {
      for (const g of groups) {
        const gid = String(g?.trophyGroupId ?? "").trim();
        if (gid) groupIds.add(gid);
      }
    }

    let upserted = 0;

    for (const trophyGroupId of groupIds) {
      // 2) Trophy list for group
      const titleTrophiesRes = await getTitleTrophies(
        authorization,
        npCommunicationId,
        trophyGroupId,
        opts
      );

      const titleTrophies = Array.isArray((titleTrophiesRes as any)?.trophies)
        ? (titleTrophiesRes as any).trophies
        : [];

      // 3) Earned list for group
      const earnedRes = await getUserTrophiesEarnedForTitle(
        authorization,
        accountId,
        npCommunicationId,
        trophyGroupId,
        opts
      );

      const earnedTrophies = Array.isArray((earnedRes as any)?.trophies)
        ? (earnedRes as any).trophies
        : [];

      const earnedById = new Map<number, any>();
      for (const e of earnedTrophies) {
        const tid = Number(e?.trophyId);
        if (Number.isFinite(tid)) earnedById.set(tid, e);
      }

      // 4) Upsert trophies into cache
      for (const t of titleTrophies) {
        const trophyId = Number(t?.trophyId);
        if (!Number.isFinite(trophyId)) continue;

        const earned = earnedById.get(trophyId);
        const isEarned = Boolean(earned?.earned);

        const row = {
          user_id: user.id,
          release_id,
          np_communication_id: npCommunicationId,
          trophy_group_id: trophyGroupId,
          trophy_id: trophyId,

          trophy_name: t?.trophyName ?? null,
          trophy_detail: t?.trophyDetail ?? null,
          trophy_type: t?.trophyType ?? null,
          trophy_icon_url: t?.trophyIconUrl ?? null,

          earned: isEarned,
          earned_at: earned?.earnedDateTime ? new Date(earned.earnedDateTime).toISOString() : null,

          updated_at: nowIso(),
        };

        const { error: upErr } = await supabaseAdmin
          .from("psn_trophies")
          .upsert(row, {
            onConflict: "user_id,np_communication_id,trophy_group_id,trophy_id",
          });

        if (!upErr) upserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      release_id,
      npCommunicationId,
      groups: Array.from(groupIds),
      upserted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to hydrate trophies" }, { status: 500 });
  }
}
