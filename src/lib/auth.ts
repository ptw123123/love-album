/**
 * 简单会话：仅用户名登录，cookie 带签名，middleware 校验
 * 依赖环境变量：SESSION_SECRET（启用登录时必填）
 * 合法用户：ptw、jj
 */

const COOKIE_NAME = "love_album_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET 未设置或过短（至少 16 位）");
  }
  return s;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SessionPayload = {
  user: string;
  exp: number;
};

export function getCookieName(): string {
  return COOKIE_NAME;
}

export async function createSessionCookie(username: string): Promise<string> {
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload: SessionPayload = { user: username, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

function decodeBase64Url(b64: string): string {
  const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64url").toString("utf-8");
  }
  return atob(base64);
}

/** 在 Edge（middleware）或 Node 中校验 cookie 值，返回 payload 或 null */
export async function verifySessionCookie(
  cookieValue: string,
  secret?: string
): Promise<SessionPayload | null> {
  try {
    const [payloadB64, sigHex] = cookieValue.split(".");
    if (!payloadB64 || !sigHex) return null;
    const s = secret ?? getSecret();
    const expectedSig = await hmacSign(payloadB64, s);
    if (expectedSig !== sigHex) return null;
    const payload = JSON.parse(decodeBase64Url(payloadB64)) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromCookieHeader(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === COOKIE_NAME);
  return match?.[1] ?? null;
}

const ALLOWED_USERS = ["ptw", "jj"];

export function checkUsername(username: string): boolean {
  const u = username.trim().toLowerCase();
  return ALLOWED_USERS.includes(u);
}
