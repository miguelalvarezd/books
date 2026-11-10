/**
 * Sign-in for the family. Two modes, chosen with AUTH_MODE:
 *  - "accounts": each person signs in with Google or an email link. Invite-only: the email must
 *    belong to an active family member (ADMIN_EMAIL is let in the first time and becomes admin).
 *  - "passcode": one family code (FAMILY_PASSCODE), then each person picks their name.
 * Both modes use the same users and sessions, so switching modes loses nothing.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { ActionError } from "./actions";

export type AuthMode = "accounts" | "passcode" | "off";

export interface AuthConfig {
  mode: AuthMode;
  passcode: string | null;
  adminEmail: string | null;
  google: { clientId: string; clientSecret: string } | null;
  email: { resendKey: string; from: string } | null;
  appUrl: string | null;
}

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const local = (env.DATABASE_URL ?? "").startsWith("pglite:");
  let mode = (env.AUTH_MODE ?? "passcode") as AuthMode;
  if (!["accounts", "passcode", "off"].includes(mode)) mode = "passcode";
  if (mode === "off" && !local) mode = "passcode"; // "off" is only for a local database
  return {
    mode,
    passcode: env.FAMILY_PASSCODE?.trim() || null,
    adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    email: env.RESEND_API_KEY && env.EMAIL_FROM ? { resendKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null,
    appUrl: env.APP_URL?.replace(/\/$/, "") || null,
  };
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Sign in required" : "Not allowed");
  }
}

// ───────────── tokens & sessions ─────────────

export const SESSION_COOKIE = "bib_session";
export const SESSION_DAYS = 180;
const DAY = 86_400_000;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Db, userId: number, method: string, userAgent?: string | null) {
  const token = newToken();
  await db.insert(t.sessions).values({
    tokenHash: hashToken(token),
    userId,
    method,
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return token;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string | null;
  role: "admin" | "member";
  locale: string;
}

/** The user behind a session token, or null. Extends the session while it is being used. */
export async function sessionUser(db: Db, token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ s: t.sessions, u: t.users })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.tokenHash, hashToken(token)), gt(t.sessions.expiresAt, new Date())));
  if (!row || row.u.active !== 1) return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > DAY)
    await db
      .update(t.sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) })
      .where(eq(t.sessions.id, row.s.id));
  return { id: row.u.id, name: row.u.name, email: row.u.email, role: row.u.role, locale: row.u.locale };
}

export async function deleteSession(db: Db, token: string | null | undefined) {
  if (token) await db.delete(t.sessions).where(eq(t.sessions.tokenHash, hashToken(token)));
}

// ───────────── rate limiting ─────────────

const LIMITS = {
  passcode: { max: 8, window: 15 * 60_000, lock: 15 * 60_000 },
  email: { max: 5, window: 60 * 60_000, lock: 60 * 60_000 },
};

async function assertNotLocked(db: Db, key: string) {
  const [row] = await db.select().from(t.authAttempts).where(eq(t.authAttempts.key, key));
  if (row?.lockedUntil && row.lockedUntil > new Date()) throw new ActionError("conflict", "Too many attempts", "too_many");
}

async function recordAttempt(db: Db, key: string, kind: keyof typeof LIMITS) {
  const L = LIMITS[kind];
  const now = new Date();
  const [row] = await db.select().from(t.authAttempts).where(eq(t.authAttempts.key, key));
  if (!row || now.getTime() - row.windowStart.getTime() > L.window) {
    await db
      .insert(t.authAttempts)
      .values({ key, failures: 1, windowStart: now, lockedUntil: null })
      .onConflictDoUpdate({ target: t.authAttempts.key, set: { failures: 1, windowStart: now, lockedUntil: null } });
    return;
  }
  const failures = row.failures + 1;
  await db
    .update(t.authAttempts)
    .set({ failures, lockedUntil: failures >= L.max ? new Date(now.getTime() + L.lock) : null })
    .where(eq(t.authAttempts.key, key));
}

const clearAttempts = (db: Db, key: string) => db.delete(t.authAttempts).where(eq(t.authAttempts.key, key));

// ───────────── passcode mode ─────────────

function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a.trim().toLowerCase()).digest();
  const hb = createHash("sha256").update(b.trim().toLowerCase()).digest();
  return timingSafeEqual(ha, hb);
}

/** Checks the family code; counts failures per IP and locks after too many. */
export async function checkPasscode(db: Db, cfg: AuthConfig, code: string, ip: string) {
  if (cfg.mode !== "passcode" || !cfg.passcode) throw new ActionError("invalid", "Passcode sign-in is off", "not_configured");
  const key = `passcode:${ip}`;
  await assertNotLocked(db, key);
  if (!sameSecret(code ?? "", cfg.passcode)) {
    await recordAttempt(db, key, "passcode");
    throw new ActionError("invalid", "Wrong code", "wrong_code");
  }
  await clearAttempts(db, key);
}

export async function activeUsers(db: Db) {
  return db
    .select({ id: t.users.id, name: t.users.name })
    .from(t.users)
    .where(eq(t.users.active, 1))
    .orderBy(t.users.name);
}

/** Code + (existing person | new name) → session token. The very first person becomes admin. */
export async function passcodeSignIn(
  db: Db,
  cfg: AuthConfig,
  input: { code: string; ip: string; userId?: number; newName?: string; userAgent?: string | null },
) {
  await checkPasscode(db, cfg, input.code, input.ip);
  let userId = input.userId;
  if (!userId) {
    const name = (input.newName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) throw new ActionError("invalid", "Missing name", "name_required");
    const [clash] = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(eq(t.users.active, 1), sql`lower(${t.users.name}) = lower(${name})`));
    if (clash) throw new ActionError("conflict", "Name already exists", "name_taken");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.users);
    [{ id: userId }] = await db
      .insert(t.users)
      .values({ name, role: n === 0 ? "admin" : "member" })
      .returning({ id: t.users.id });
  } else {
    const [u] = await db.select().from(t.users).where(and(eq(t.users.id, userId), eq(t.users.active, 1)));
    if (!u) throw new ActionError("invalid", "Unknown person", "unknown_user");
  }
  return createSession(db, userId, "passcode", input.userAgent);
}

// ───────────── accounts mode ─────────────

/** Active family member with this email; ADMIN_EMAIL is created as admin on first sign-in. */
export async function userForEmail(db: Db, cfg: AuthConfig, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return null;
  const [u] = await db.select().from(t.users).where(sql`lower(${t.users.email}) = ${email}`);
  if (u) return u.active === 1 ? u : null;
  if (cfg.adminEmail && email === cfg.adminEmail) {
    const [created] = await db
      .insert(t.users)
      .values({ name: email.split("@")[0], email, role: "admin" })
      .returning();
    return created;
  }
  return null;
}

/** Creates a 20-minute single-use link. Returns null (silently) when the email isn't invited. */
export async function createEmailLink(db: Db, cfg: AuthConfig, email: string) {
  if (cfg.mode !== "accounts" || !cfg.email) throw new ActionError("invalid", "Email sign-in is off", "not_configured");
  const key = `email:${email.trim().toLowerCase()}`;
  await assertNotLocked(db, key);
  await recordAttempt(db, key, "email"); // every request counts: max 5 an hour per address
  const user = await userForEmail(db, cfg, email);
  if (!user) return null;
  const token = newToken();
  await db.insert(t.loginTokens).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + 20 * 60_000),
  });
  return { token, user };
}

export async function redeemEmailLink(db: Db, token: string, userAgent?: string | null) {
  const [row] = await db
    .update(t.loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(t.loginTokens.tokenHash, hashToken(token)), isNull(t.loginTokens.usedAt), gt(t.loginTokens.expiresAt, new Date())),
    )
    .returning();
  if (!row) return null;
  const [u] = await db.select().from(t.users).where(and(eq(t.users.id, row.userId), eq(t.users.active, 1)));
  if (!u) return null;
  return createSession(db, u.id, "email", userAgent);
}

export async function sendLoginEmail(cfg: AuthConfig, to: string, link: string, locale: "es" | "en") {
  const es = locale === "es";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.email!.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.email!.from,
      to,
      subject: es ? "Entrar en la Biblioteca" : "Sign in to the Library",
      text: es
        ? `Pulsa este enlace para entrar (caduca en 20 minutos):\n\n${link}\n\nSi no lo has pedido tú, ignora este correo.`
        : `Tap this link to sign in (it expires in 20 minutes):\n\n${link}\n\nIf you didn't ask for it, ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

// ───────────── Google ─────────────

export function googleAuthUrl(cfg: AuthConfig, redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: cfg.google!.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/**
 * Exchanges the code for an ID token. The token comes straight from Google over TLS
 * (not via the browser), so its claims can be read without checking the signature.
 */
export async function googleEmail(cfg: AuthConfig, code: string, redirectUri: string, fetcher = fetch) {
  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.google!.clientId,
      client_secret: cfg.google!.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return null;
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")) as {
    email?: string;
    email_verified?: boolean;
    aud?: string;
    iss?: string;
  };
  if (claims.aud !== cfg.google!.clientId) return null;
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return null;
  if (!claims.email || !claims.email_verified) return null;
  return claims.email.toLowerCase();
}
