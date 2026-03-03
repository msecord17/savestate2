import { NextRequest, NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";

type HardwareRow = {
  id: string;
  slug: string | null;
  display_name: string;
  kind?: string | null;
  is_modern_retro_handheld?: boolean | null;
};

/**
 * Returns hardware eligible for "Played On" pills (native platforms) and
 * handheld dropdown (modern retro handhelds for emulation).
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const platformKey = (req.nextUrl.searchParams.get("platformKey") ?? "").trim().toLowerCase();

  // When no platformKey, return empty pills but still handheld dropdown (emulation is platform-agnostic)
  const { data: allHardware, error } = await supabaseServer
    .from("hardware")
    .select("id, slug, display_name, kind, is_modern_retro_handheld")
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (allHardware ?? []) as HardwareRow[];

  // Handheld dropdown: modern retro handhelds (emulation-capable)
  const handheldDropdown = rows
    .filter((h) => h.is_modern_retro_handheld === true)
    .map((h) => ({
      id: h.id,
      slug: h.slug ?? h.id,
      display_name: h.display_name,
    }));

  // Eligible pills: hardware that natively runs this platform (exclude handhelds; those go in dropdown)
  const eligiblePills = platformKey
    ? filterEligibleForPlatform(rows, platformKey)
    .filter((h) => !h.is_modern_retro_handheld)
    .map((h) => ({
      id: h.id,
      slug: h.slug ?? h.id,
      display_name: h.display_name,
    }))
    : [];

  return NextResponse.json({
    ok: true,
    eligiblePills,
    handheldDropdown,
  });
}

function filterEligibleForPlatform(
  rows: HardwareRow[],
  platformKey: string
): HardwareRow[] {
  const slug = (h: HardwareRow) => (h.slug ?? "").toLowerCase();
  const name = (h: HardwareRow) => (h.display_name ?? "").toLowerCase();

  // PlayStation family
  if (
    /psn|ps4|ps5|ps3|ps2|ps1|psp|playstation/.test(platformKey) ||
    platformKey.includes("playstation")
  ) {
    return rows.filter(
      (h) =>
        /^ps[1-5]|psp|psvita|playstation/.test(slug(h)) ||
        /playstation|ps[1-5]|psp/.test(name(h))
    );
  }

  // Xbox family
  if (/xbox|x360|xone|xsx/.test(platformKey)) {
    return rows.filter(
      (h) => /xbox|x360|xone|xsx|series\s*x/.test(slug(h)) || /xbox|series\s*x/.test(name(h))
    );
  }

  // Steam / PC
  if (platformKey === "steam" || platformKey === "pc") {
    return rows.filter(
      (h) =>
        /steam|steam_deck|pc|windows/.test(slug(h)) || /steam|deck|pc|windows/.test(name(h))
    );
  }

  // Retro: exact or close slug match (snes, nes, n64, gba, genesis, etc.)
  const norm = platformKey.replace(/[^a-z0-9]/g, "");
  return rows.filter((h) => {
    const s = slug(h).replace(/[^a-z0-9]/g, "");
    const n = name(h).replace(/[^a-z0-9]/g, "");
    return (
      s === norm ||
      s.includes(norm) ||
      n.includes(norm) ||
      (norm.length >= 2 && (s.startsWith(norm) || n.startsWith(norm)))
    );
  });
}
