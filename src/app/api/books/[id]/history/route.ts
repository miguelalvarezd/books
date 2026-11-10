import { getDb } from "@/db/client";
import { bookHistory } from "@/lib/actions";
import { getActor } from "@/lib/actor";
import { handle } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/books/[id]/history">) {
  const { id } = await ctx.params;
  return handle(async () => {
    await getActor(req);
    return bookHistory(await getDb(), Number(id));
  });
}
