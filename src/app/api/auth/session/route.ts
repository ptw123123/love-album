import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromCookieHeader,
  verifySessionCookie,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return NextResponse.json({ ok: false });

    const cookieHeader = req.headers.get("cookie");
    const value = getSessionFromCookieHeader(cookieHeader);
    if (!value) return NextResponse.json({ ok: false });

    const payload = await verifySessionCookie(value, secret);
    if (!payload) return NextResponse.json({ ok: false });

    return NextResponse.json({ ok: true, user: payload.user });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
