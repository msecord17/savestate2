import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { psnAuthorizeFromNpsso, psnGetTitleTrophyDetails } from "@/lib/psn/server";

// Pick a PSN title row for this release that can actually hydrate trophies.
// Prefer real npCommunicationId rows (not synthetic:...)
function pickHydratablePsnRow(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Prefer real IDs (Sony npCommunicationId) over synthetic keys
  const real = rows.filter((r) => {
    const id = String(r?.np_communication_id || "").trim();
    return id && !id.startsWith("synthetic:");
  });

  const candidates = (real.length ? real : rows).slice();

  // Prefer PS5, then PS4, then others, and newest updated
  const rankPlatform = (p: string) => {
    const s = (p || "").toUpperCase();
    if (s.includes("PS5")) return 3;
    if (s.includes("PS4")) return 2;
    if (s.includes("PS3")) return 1;
    return 0;
  };

  candidates.sort((a, b) => {
    const pa = rankPlatform(String(a?.title_platform || ""));
    const pb = rankPlatform(String(b?.title_platform || ""));
    if (pb !== pa) return pb - pa;

    const ta = a?.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
    const tb = b?.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
    return tb - ta;
  });

  return candidates[0];
}

function normalizePsnTrophyPlatform(raw: string | null | undefined): "PS5" | "PS4" | "PS3" {
  const s = String(raw ?? "").toUpperCase();
  // Some rows contain composite strings like "PS5/PS4" or "PS4 | PS5"
  if (s.includes("PS3")) return "PS3";
  if (s.includes("PS4")) return "PS4";
  return "PS5";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const releaseId = url.searchParams.get("release_id");

    if (!releaseId || releaseId === "undefined") {
      return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
    }

    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Need NPSSO to call psn-api
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("psn_npsso, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const npsso = String(profile?.psn_npsso ?? "").trim();
    if (!npsso) {
      return NextResponse.json({ error: "PSN not connected (missing NPSSO)" }, { status: 400 });
    }

    // Find PSN rows mapped to this release. There can be multiple (base + DLC).
    const { data: psnRows, error: psnErr } = await supabase
      .from("psn_title_progress")
      .select("np_communication_id, title_name, title_platform, last_updated_at, playtime_minutes, trophy_progress, trophies_earned, trophies_total")
      .eq("user_id", user.id)
      .eq("release_id", releaseId);

    if (psnErr) return NextResponse.json({ error: psnErr.message }, { status: 500 });

    const picked = pickHydratablePsnRow(psnRows as any[]);
    if (!picked) {
      return NextResponse.json({
        ok: true,
        release_id: releaseId,
        note: "No PSN title rows found for this release yet.",
        trophies: [],
      });
    }

    const npCommunicationId = String(picked.np_communication_id || "").trim();
    // psn-api is picky about this param; normalize to supported values
    const trophyTitlePlatform = normalizePsnTrophyPlatform(picked.title_platform);

    // If the id is synthetic, we can't hydrate trophy details from Sony.
    if (!npCommunicationId || npCommunicationId.startsWith("synthetic:")) {
      return NextResponse.json({
        ok: true,
        release_id: releaseId,
        note:
          "This release is mapped to a synthetic PSN key (Sony did not provide a stable npCommunicationId). Trophy hydration requires a real npCommunicationId.",
        picked: {
          title_name: picked.title_name,
          title_platform: picked.title_platform,
          np_communication_id: npCommunicationId,
        },
        trophies: [],
      });
    }

    // Authorize and fetch trophy details
    const authorization = await psnAuthorizeFromNpsso(npsso);

    // IMPORTANT: accountId
    // psn-api supports "me" for many endpoints. If this ever fails, we’ll add real accountId resolution.
    const accountId = String(profile?.psn_account_id ?? "me");

    // Some titles are only available on PS4 or PS5; retry if Sony returns "Resource not found"
    const platformAttempts: Array<"PS5" | "PS4" | "PS3"> =
      trophyTitlePlatform === "PS4" ? ["PS4", "PS5"] : trophyTitlePlatform === "PS3" ? ["PS3"] : ["PS5", "PS4"];

    let titleTrophies: any[] | null = null;
    let earnedTrophies: any[] | null = null;
    let lastErr: any = null;

    for (const p of platformAttempts) {
      try {
        const res = await psnGetTitleTrophyDetails(authorization, accountId, npCommunicationId, p);
        titleTrophies = res.titleTrophies ?? null;
        earnedTrophies = res.earnedTrophies ?? null;
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? "");
        if (/resource not found/i.test(msg)) {
          continue; // try next platform
        }
        throw e;
      }
    }

    if (lastErr && (!titleTrophies || !earnedTrophies)) {
      throw lastErr;
    }

    // Merge earned into trophy list by trophyId
    const earnedById = new Map<number, any>();
    for (const e of earnedTrophies ?? []) {
      if (typeof e?.trophyId === "number") earnedById.set(e.trophyId, e);
    }

    const merged = (titleTrophies ?? []).map((t: any) => {
      const earned = earnedById.get(t.trophyId);
      return {
        trophyId: t.trophyId,
        name: t.trophyName ?? "",
        description: t.trophyDetail ?? "",
        iconUrl: t.trophyIconUrl ?? null,
        // THIS is the important part:
        earned: Boolean(earned?.earned),
        earnedAt: earned?.earnedDateTime ?? null,
        // optional: include rarity if present
        rarity: t.trophyEarnedRate ?? t.trophyRare ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      trophies: merged,
      // also return playtime/progress for convenient UI display
      playtime_minutes: picked?.playtime_minutes != null ? Number(picked.playtime_minutes) : null,
      trophy_progress: picked?.trophy_progress != null ? Number(picked.trophy_progress) : null,
      trophies_earned: picked?.trophies_earned != null ? Number(picked.trophies_earned) : null,
      trophies_total: picked?.trophies_total != null ? Number(picked.trophies_total) : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch trophies" }, { status: 500 });
  }
}
