import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  // Forward cookies so auth works (Supabase session cookies)
  const cookie = req.headers.get("cookie") ?? "";

  const res = await fetch(`${origin}/api/profile/me`, {
    method: "GET",
    headers: {
      cookie,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();

  // If downstream returned HTML, surface it cleanly
  if (text.trim().startsWith("<")) {
    return NextResponse.json(
      {
        error: "Downstream /api/profile/me returned HTML (auth redirect or route error).",
        status: res.status,
        snippet: text.slice(0, 200),
      },
      { status: 500 }
    );
  }

  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
