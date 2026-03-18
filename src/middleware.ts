import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromCookieHeader,
  getCookieName,
  verifySessionCookie,
} from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")))
    return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon"))
    return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    if (pathname === "/login") {
      const cookieHeader = req.headers.get("cookie");
      const value = cookieHeader
        ?.split(";")
        .map((c) => c.trim().split("="))
        .find(([n]) => n === getCookieName())?.[1];
      if (value && process.env.SESSION_SECRET) {
        const payload = await verifySessionCookie(value, process.env.SESSION_SECRET);
        if (payload) {
          return NextResponse.redirect(new URL("/", req.url));
        }
      }
    }
    return NextResponse.next();
  }

  if (!process.env.SESSION_SECRET) {
    return NextResponse.next();
  }

  const cookieHeader = req.headers.get("cookie");
  const value = getSessionFromCookieHeader(cookieHeader);
  if (!value) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const payload = await verifySessionCookie(value, process.env.SESSION_SECRET);
  if (!payload) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|webp)$).*)"],
};
