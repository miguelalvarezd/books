import { appOrigin, cookieHeader } from "@/lib/actor";
import { authConfig, googleAuthUrl, newToken } from "@/lib/auth";

export async function GET(req: Request) {
  const cfg = authConfig();
  if (cfg.mode !== "accounts" || !cfg.google) return new Response("Google sign-in is off", { status: 404 });
  const state = newToken();
  const headers = new Headers({ Location: googleAuthUrl(cfg, `${appOrigin(req)}/api/auth/google/callback`, state) });
  headers.append("Set-Cookie", cookieHeader(req, "bib_oauth_state", state, 600));
  return new Response(null, { status: 302, headers });
}
