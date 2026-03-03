import { NextResponse } from "next/server";
import { getPublicProfilePayload } from "@/lib/public-profile/server";

const CACHE_MAX_AGE = 5 * 60;
const STALE_WHILE_REVALIDATE = 10 * 60;

/** GET /api/profile/:username – no auth. 404 if username not found; 200 { private: true } if profile is private. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ username: string }> }
) {
  const { username: raw } = await context.params;
  const rawUsername = decodeURIComponent(raw ?? "").trim();

  if (!rawUsername) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const result = await getPublicProfilePayload(rawUsername);

  if ("error" in result && result.error === "Not found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if ("private" in result && result.private) {
    return NextResponse.json(
      { private: true },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    },
  });
}
