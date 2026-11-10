import { getDb } from "@/db/client";
import { clientIp, sessionCookie } from "@/lib/actor";
import { authConfig, passcodeSignIn } from "@/lib/auth";
import { handle, int, readJson } from "@/lib/http";

/** Step 2: code + who you are → signed in on this phone. */
export async function POST(req: Request) {
  let token = "";
  const res = await handle(async () => {
    const body = await readJson(req);
    token = await passcodeSignIn(await getDb(), authConfig(), {
      code: String(body.code ?? ""),
      ip: clientIp(req),
      userId: int(body.userId),
      newName: typeof body.newName === "string" ? body.newName : undefined,
      userAgent: req.headers.get("user-agent"),
    });
  });
  if (res.ok && token) res.headers.append("Set-Cookie", sessionCookie(req, token));
  return res;
}
