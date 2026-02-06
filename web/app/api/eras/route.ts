import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../lib/supabase/route-client";

type EraKey =
  | "nes" | "snes" | "n64" | "gc" | "wii"
  | "genesis" | "saturn" | "dreamcast"
  | "ps1" | "ps2" | "ps3" | "ps4" | "ps5"
  | "xbox" | "x360" | "xone" | "xsx"
  | "pc_90s" | "pc_00s" | "pc_modern"
  | "handheld_gb" | "handheld_gba" | "handheld_ds" | "handheld_psp" | "handheld_modern";

type EraEntry = {
  key: EraKey;
  label: string;
  fromYear: number;
  toYear: number;
  intensity: "dabble" | "regular" | "obsessed";
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// “Magic” scoring: eras add points + confidence.
// This is intentionally a “reward for history”, not a skill metric.
function computeEraBonuses(eras: EraEntry[]) {
  let points = 0;
  let confidence = 0;

  for (const e of eras) {
    const years = clamp((e.toYear ?? e.fromYear) - e.fromYear + 1, 0, 60);

    const intensityMult =
      e.intensity === "obsessed" ? 1.0 :
      e.intensity === "regular" ? 0.65 :
      0.35;

    // Points: years * intensity with a gentle cap per era
    const eraPoints = Math.round(Math.min(220, years * 12 * intensityMult));
    points += eraPoints;

    // Confidence: more eras + more years = higher confidence
    confidence += Math.round(Math.min(10, years / 4) * intensityMult);
  }

  // Extra confidence for multi-era breadth
  if (eras.length >= 5) confidence += 8;
  if (eras.length >= 8) confidence += 10;

  return {
    era_bonus_points: clamp(points, 0, 1200),
    confidence_bonus: clamp(confidence, 0, 35),
  };
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_era_history")
    .select("eras, era_bonus_points, confidence_bonus, updated_at")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    eras: data?.eras ?? [],
    era_bonus_points: data?.era_bonus_points ?? 0,
    confidence_bonus: data?.confidence_bonus ?? 0,
    updated_at: data?.updated_at ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eras = Array.isArray(body?.eras) ? (body.eras as EraEntry[]) : [];

  // Basic sanitize
  const safe = eras
    .filter((e) => e && typeof e.key === "string")
    .map((e) => ({
      key: e.key,
      label: String(e.label ?? e.key),
      fromYear: clamp(Number(e.fromYear || 1990), 1970, new Date().getFullYear()),
      toYear: clamp(Number(e.toYear || e.fromYear || 1990), 1970, new Date().getFullYear()),
      intensity: (e.intensity === "obsessed" || e.intensity === "regular" || e.intensity === "dabble")
        ? e.intensity
        : "regular",
    }));

  const bonuses = computeEraBonuses(safe);

  const { error: upErr } = await supabase.from("user_era_history").upsert({
    user_id: userRes.user.id,
    eras: safe,
    era_bonus_points: bonuses.era_bonus_points,
    confidence_bonus: bonuses.confidence_bonus,
    updated_at: new Date().toISOString(),
  });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    era_bonus_points: bonuses.era_bonus_points,
    confidence_bonus: bonuses.confidence_bonus,
  });
}
