import { getDb } from "@/db/client";
import { appOrigin, sessionCookie } from "@/lib/actor";
import { redeemEmailLink } from "@/lib/auth";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const session = token ? await redeemEmailLink(await getDb(), token, req.headers.get("user-agent")) : null;
  const headers = new Headers({ Location: `${appOrigin(req)}${session ? "/" : "/?login=link_expired"}` });
  if (session) headers.append("Set-Cookie", sessionCookie(req, session));
  return new Response(null, { status: 303, headers });
}
