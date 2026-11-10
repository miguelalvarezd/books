import { getDb } from "@/db/client";
import { clearSessionCookie, readCookie } from "@/lib/actor";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth";

export async function POST(req: Request) {
  await deleteSession(await getDb(), readCookie(req, SESSION_COOKIE));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(req) } });
}
