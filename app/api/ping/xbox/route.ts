import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasId: !!process.env.XBOX_CLIENT_ID,
    hasSecret: !!process.env.XBOX_CLIENT_SECRET,
    secretLen: (process.env.XBOX_CLIENT_SECRET || "").length,
    redirect: process.env.XBOX_REDIRECT_URI || null,
  });
}
