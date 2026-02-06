import { NextResponse } from "next/server";

function mask(s: string) {
  if (!s) return "";
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 4)}...${s.slice(-4)} (len=${s.length})`;
}

export async function GET() {
  const id = process.env.XBOX_CLIENT_ID || "";
  const secret = process.env.XBOX_CLIENT_SECRET || "";
  const redirect = process.env.XBOX_REDIRECT_URI || "";

  return NextResponse.json({
    hasId: !!id,
    hasSecret: !!secret,
    clientId: mask(id),
    clientSecret: mask(secret),
    redirect,
    nodeEnv: process.env.NODE_ENV,
  });
}
