import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function normTitle(s: string) {
  return (s || "")
    .toLowerCase()
    // remove trademark symbols
    .replace(/[™®©]/g, "")
    // remove bracket/paren suffixes like "(PS4)", "(SNES)", "[Demo]"
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    // common edition words that mess up matching
    .replace(/\b(remastered|definitive|complete|ultimate|edition|bundle|pack|collection)\b/g, " ")
    // punctuation -> spaces
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string) {
  return new Set(normTitle(s).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export async function POST() {
  const FORCE_REMAP = false; // flip to true if you want to remap everything
  const CREATE_MISSING = true; // your "Option #1": create catalog items if no match

  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // admin client for creating catalog rows
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load PSN titles
    const { data: psnRows, error: psnErr } = await supabaseUser
      .from("psn_title_progress")
      .select("np_communication_id, title_name, title_platform, release_id")
      .eq("user_id", user.id);

    if (psnErr) {
      return NextResponse.json({ error: psnErr.message }, { status: 500 });
    }

    const psn = Array.isArray(psnRows) ? psnRows : [];
    const psn_total = psn.length;

    // 2) Load releases
    const { data: relRows, error: relErr } = await supabaseAdmin
      .from("releases")
      .select("id, game_id, display_title, platform_key, platform_name");

    if (relErr) {
      return NextResponse.json({ error: relErr.message }, { status: 500 });
    }

    const releases = Array.isArray(relRows) ? relRows : [];
    const releases_total = releases.length;

    // 3) Build release index
    const index = new Map<string, any[]>();
    for (const r of releases) {
      const key = normTitle(r.display_title || "");
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(r);
    }

    // 4) Decide which PSN rows need mapping
    const need = psn.filter((p: any) => FORCE_REMAP || !p.release_id);
    const psn_unmapped = need.length;

    let mapped = 0;
    let created = 0;
    let skipped = 0;

    const sample_psn = psn.slice(0, 5).map((p: any) => p.title_name);
    const sample_release = releases.slice(0, 5).map((r: any) => r.display_title);

    // 5) For each unmapped PSN title, find best release match
    for (const row of need as any[]) {
      const titleName = String(row.title_name || "").trim();
      const commId = String(row.np_communication_id || "").trim();
      if (!titleName || !commId) {
        skipped++;
        continue;
      }

      const n = normTitle(titleName);
      const tset = tokenSet(titleName);

      // A) exact normalized match candidates
      const exact = index.get(n) ?? [];

      // Prefer PSN-ish platforms if possible
      const preferPsn = (r: any) => {
        const k = String(r.platform_key || "").toLowerCase();
        return k.includes("ps") || k.includes("playstation") || k === "psn";
      };

      let best: any = null;
      let bestScore = 0;

      const consider = (r: any, score: number) => {
        // tiny platform preference boost
        const boost = preferPsn(r) ? 0.06 : 0;
        const s = score + boost;
        if (s > bestScore) {
          bestScore = s;
          best = r;
        }
      };

      // A1) exact matches get strong score
      for (const r of exact) consider(r, 1.0);

      // B) if no exact match, do token similarity scan (bounded)
      if (!best) {
        // Scan: only releases whose normalized title shares first token (cheap filter)
        const firstTok = n.split(" ")[0];
        for (const r of releases) {
          const rt = String(r.display_title || "");
          const rn = normTitle(rt);
          if (!rn) continue;
          if (firstTok && !rn.startsWith(firstTok)) continue;

          const score = jaccard(tset, tokenSet(rt));
          if (score > 0.72) consider(r, score); // only consider decent overlaps
        }
      }

      // Threshold: only map if we’re confident
      const THRESH = 0.82;

      if (best && bestScore >= THRESH) {
        const { error: upErr } = await supabaseUser
          .from("psn_title_progress")
          .update({
            release_id: best.id,
            last_updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("np_communication_id", commId);

        if (!upErr) mapped++;
        else skipped++;
        continue;
      }

      // C) If still no match, optionally create a new release+game
      if (CREATE_MISSING) {
        // upsert game by canonical_title (unique)
        const { data: gRow, error: gErr } = await supabaseAdmin
          .from("games")
          .upsert({ canonical_title: titleName }, { onConflict: "canonical_title" })
          .select("id")
          .single();

        if (gErr || !gRow?.id) {
          skipped++;
          continue;
        }

        const { data: rRow, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gRow.id,
            display_title: titleName,
            platform_name: "PlayStation",
            platform_key: "psn",
            cover_url: null,
          })
          .select("id")
          .single();

        if (rErr || !rRow?.id) {
          skipped++;
          continue;
        }

        const { error: linkErr } = await supabaseUser
          .from("psn_title_progress")
          .update({
            release_id: rRow.id,
            last_updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("np_communication_id", commId);

        if (!linkErr) created++;
        else skipped++;
      } else {
        skipped++;
      }
    }

    // When nothing needs mapping, report skipped = psn_total so UX isn't weird
    if (psn_unmapped === 0) {
      skipped = psn_total;
    }

    return NextResponse.json({
      ok: true,
      created,
      mapped,
      skipped,
      debug: {
        psn_total,
        psn_unmapped,
        releases_total,
        sample_psn,
        sample_release,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN map failed" }, { status: 500 });
  }
}
