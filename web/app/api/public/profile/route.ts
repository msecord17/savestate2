import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim() ?? "";

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  // Rewrite to the canonical path route
  const nextUrl = new URL(req.url);
  nextUrl.pathname = `/api/public/profile/${encodeURIComponent(username)}`;
  nextUrl.search = "";

  return NextResponse.redirect(nextUrl, 307);
}
