import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;

  // Proxy to the real implementation
  const res = await fetch(`${origin}/api/psn/map`, {
    method: "POST",
    headers: {
      // forward cookies so auth works
      cookie: req.headers.get("cookie") ?? "",
      accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
