import { getDb } from "@/db/client";
import { clientIp } from "@/lib/actor";
import { activeUsers, authConfig, checkPasscode } from "@/lib/auth";
import { handle, readJson } from "@/lib/http";

/** Step 1: the family code is right → here are the names to pick from. */
export async function POST(req: Request) {
  return handle(async () => {
    const db = await getDb();
    const body = await readJson(req);
    await checkPasscode(db, authConfig(), String(body.code ?? ""), clientIp(req));
    return { users: await activeUsers(db) };
  });
}
