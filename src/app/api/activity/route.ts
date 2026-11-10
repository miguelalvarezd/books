import { getDb } from "@/db/client";
import { recentActivity } from "@/lib/actions";
import { getActor } from "@/lib/actor";
import { handle } from "@/lib/http";

export async function GET(req: Request) {
  return handle(async () => {
    await getActor(req);
    return recentActivity(await getDb(), 150);
  });
}
