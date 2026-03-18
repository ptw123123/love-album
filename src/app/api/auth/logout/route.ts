import { NextRequest, NextResponse } from "next/server";
import { getCookieName } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const isHttps = new URL(req.url).protocol === "https:";
  res.cookies.set(getCookieName(), "", {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
