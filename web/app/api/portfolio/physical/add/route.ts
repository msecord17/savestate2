import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { normalizeKind } from "@/lib/portfolio/physical/normalizeKind";
import { normalizeCondition } from "@/lib/portfolio/physical/normalizeCondition";

const ALLOWED_KINDS = ["game", "system", "accessory", "other"] as const;

async function getAccessTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();

  // Older auth-helpers style
  const direct = jar.get("sb-access-token")?.value;
  if (direct) return direct;

  // Newer @supabase/ssr style often stores JSON in a cookie ending with "-auth-token"
  // e.g. sb-<project-ref>-auth-token = {"access_token":"...","refresh_token":"..."}
  for (const c of jar.getAll()) {
    if (!c.name.endsWith("-auth-token")) continue;
    try {
      const parsed = JSON.parse(c.value);
      const token = parsed?.access_token;
      if (typeof token === "string" && token.length > 20) return token;
    } catch {
      // ignore
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    let user: { id: string };

    const token =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      (await getAccessTokenFromCookies());

    if (token) {
      const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
      if (userErr || !userData?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      user = userData.user;
    } else {
      // Fallback: @supabase/ssr stores session in chunked cookies; use route client to read it
      const supabase = await supabaseRouteClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        return NextResponse.json({ error: "Unauthorized (missing token)" }, { status: 401 });
      }
      user = auth.user;
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    // Be generous in what you accept (client drift happens)
    const rawKind =
      body.kind ??
      body.item_kind ??
      body.itemKind ??
      body.type ??
      body.item_type ??
      body.itemType;

    const rawCondition =
      body.condition ??
      body.item_condition ??
      body.itemCondition;

    const kind = normalizeKind(rawKind);
    const condition = normalizeCondition(rawCondition);

    const title = String(body.title ?? "").trim();
    const platform_key = (body.platform_key ?? body.platform ?? null)?.toString().trim() || null;
    const quantity = Number.isFinite(Number(body.quantity)) ? Math.max(1, Number(body.quantity)) : 1;
    const notes = (body.notes ?? null)?.toString().trim() || null;
    const release_id = (body.release_id ?? null)?.toString().trim() || null;

    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("portfolio_physical_items")
      .insert({
        user_id: user.id,
        kind,
        title,
        platform_key,
        quantity,
        condition,
        notes,
        release_id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          allowed_kinds: ALLOWED_KINDS,
          allowed_conditions: ["new", "like_new", "good", "fair", "poor"],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
