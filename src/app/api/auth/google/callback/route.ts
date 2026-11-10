import { getDb } from "@/db/client";
import { appOrigin, cookieHeader, readCookie, sessionCookie } from "@/lib/actor";
import { authConfig, createSession, googleEmail, userForEmail } from "@/lib/auth";

export async function GET(req: Request) {
  const cfg = authConfig();
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const fail = (reason: string) => {
    const headers = new Headers({ Location: `${origin}/?login=${reason}` });
    headers.append("Set-Cookie", cookieHeader(req, "bib_oauth_state", "", 0));
    return new Response(null, { status: 303, headers });
  };
  if (cfg.mode !== "accounts" || !cfg.google) return fail("off");
  const state = url.searchParams.get("state");
  if (!state || state !== readCookie(req, "bib_oauth_state")) return fail("expired");
  const code = url.searchParams.get("code");
  if (!code) return fail("cancelled");

  const email = await googleEmail(cfg, code, `${origin}/api/auth/google/callback`);
  if (!email) return fail("google_failed");
  const db = await getDb();
  const user = await userForEmail(db, cfg, email);
  if (!user) return fail("not_invited");

  const token = await createSession(db, user.id, "google", req.headers.get("user-agent"));
  const headers = new Headers({ Location: `${origin}/` });
  headers.append("Set-Cookie", sessionCookie(req, token));
  headers.append("Set-Cookie", cookieHeader(req, "bib_oauth_state", "", 0));
  return new Response(null, { status: 303, headers });
}
