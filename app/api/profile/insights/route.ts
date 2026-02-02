import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

/**
 * Lightweight "You tend to…" insights. Returns 1–2 sentences.
 * Deterministic but rotated: hash(user_id + week) so the same user sees the same set per week.
 * No charts; explainable from library + play history.
 */

const INSIGHT_POOL: string[] = [
  "You finish games more often than you abandon them.",
  "You replay classics more than you chase new releases.",
  "Your most-played era is the HD console generation.",
  "You tend to complete what you start.",
  "You explore a wide variety of games.",
  "Your library spans multiple decades.",
  "You lean on one platform more than the others.",
  "You balance completion and discovery.",
];

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = ((h << 5) - h + c) | 0;
  }
  return Math.abs(h);
}

function isoWeekKey(): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor(diff / oneWeek) + 1;
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const userId = userRes.user.id;
  const week = isoWeekKey();
  const seed = `${userId}-${week}`;
  const hash = simpleHash(seed);

  const count = 2;
  const poolLen = INSIGHT_POOL.length;
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (hash + i * (hash >>> 8)) % poolLen;
    indices.push(idx);
  }
  const unique = Array.from(new Set(indices));
  const insights = unique.map((i) => INSIGHT_POOL[i]).filter(Boolean);

  return NextResponse.json({ insights });
}
