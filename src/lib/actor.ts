import "server-only";
import { getDb } from "@/db/client";
import type { Actor } from "./actions";
import { AuthError, SESSION_COOKIE, SESSION_DAYS, authConfig, sessionUser, type SessionUser } from "./auth";

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Public base URL, for links in emails and OAuth redirects. */
export function appOrigin(req: Request) {
  const cfg = authConfig();
  if (cfg.appUrl) return cfg.appUrl;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function cookieHeader(req: Request, name: string, value: string, maxAgeSeconds: number) {
  const secure = appOrigin(req).startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
export const sessionCookie = (req: Request, token: string) =>
  cookieHeader(req, SESSION_COOKIE, token, SESSION_DAYS * 86_400);
export const clearSessionCookie = (req: Request) => cookieHeader(req, SESSION_COOKIE, "", 0);

/** Writes must come from the app's own pages (blocks cross-site requests). */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw new AuthError(403);
}

export async function currentUser(req: Request): Promise<SessionUser | null> {
  return sessionUser(await getDb(), readCookie(req, SESSION_COOKIE));
}

/** Who is making this request. Throws AuthError(401) when nobody is signed in. */
export async function getActor(req: Request): Promise<Actor> {
  assertSameOrigin(req);
  const user = await currentUser(req);
  if (user) return { userId: user.id, role: user.role };
  if (authConfig().mode === "off") return { userId: null, role: "admin" };
  throw new AuthError(401);
}
