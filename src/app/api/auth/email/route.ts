import { getDb } from "@/db/client";
import { appOrigin } from "@/lib/actor";
import { authConfig, createEmailLink, sendLoginEmail } from "@/lib/auth";
import { handle, readJson } from "@/lib/http";

/** Sends a sign-in link. Always answers the same way, so it can't reveal who is invited. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const cfg = authConfig();
    const email = String(body.email ?? "");
    const link = await createEmailLink(await getDb(), cfg, email);
    if (link) {
      const url = `${appOrigin(req)}/api/auth/email/verify?token=${link.token}`;
      await sendLoginEmail(cfg, email.trim(), url, body.locale === "en" ? "en" : "es");
    }
    return { ok: true };
  });
}
