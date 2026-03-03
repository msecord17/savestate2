import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

/**
 * PATCH /api/profile/public – set public profile fields (username, display_name, discord_handle, profile_public).
 * Auth required. Updates the current user's profiles row.
 *
 * Username: single source of truth for /u/[username]. User-chosen only; never derive from Discord.
 * Uniqueness is enforced (case-insensitive); 409 if taken.
 */
export async function PATCH(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  let body: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    discord_handle?: string | null;
    profile_public?: boolean;
    public_discord?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Username: user-set only; never copy from discord_handle or other providers.
  const username =
    body.username !== undefined
      ? (body.username === null || body.username === "" ? null : String(body.username).trim())
      : undefined;
  const display_name =
    body.display_name !== undefined
      ? (body.display_name === null || body.display_name === "" ? null : String(body.display_name))
      : undefined;
  const avatar_url =
    body.avatar_url !== undefined
      ? (body.avatar_url === null || body.avatar_url === "" ? null : String(body.avatar_url))
      : undefined;
  const discord_handle =
    body.discord_handle !== undefined
      ? (body.discord_handle === null || body.discord_handle === "" ? null : String(body.discord_handle))
      : undefined;
  const profile_public =
    body.profile_public !== undefined ? Boolean(body.profile_public) : undefined;
  const public_discord =
    body.public_discord !== undefined ? Boolean(body.public_discord) : undefined;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (username !== undefined) updates.username = username;
  if (display_name !== undefined) updates.display_name = display_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (discord_handle !== undefined) updates.discord_handle = discord_handle;
  if (profile_public !== undefined) updates.profile_public = profile_public;
  if (public_discord !== undefined) updates.public_discord = public_discord;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userRes.user.id);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
