import { NextRequest, NextResponse } from "next/server";
import {
  checkUsername,
  createSessionCookie,
  getCookieName,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";

    if (!username) {
      return NextResponse.json(
        { error: "请填写用户名" },
        { status: 400 }
      );
    }

    if (!checkUsername(username)) {
      return NextResponse.json(
        { error: "用户名不对哦～" },
        { status: 401 }
      );
    }

    const value = await createSessionCookie(username.trim().toLowerCase());
    const res = NextResponse.json({ ok: true, user: username });
    const isHttps = new URL(req.url).protocol === "https:";
    res.cookies.set(getCookieName(), value, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
