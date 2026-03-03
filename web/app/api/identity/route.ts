import { NextResponse } from "next/server";

/** GET /api/identity → redirect to /api/identity/summary */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextUrl = new URL(req.url);
  nextUrl.pathname = "/api/identity/summary";
  nextUrl.search = url.search;

  return NextResponse.redirect(nextUrl, 307);
}
