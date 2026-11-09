import { getDb } from "@/db/client";
import { bookHistory } from "@/lib/actions";

export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]/history">) {
  const { id } = await ctx.params;
  const rows = await bookHistory(await getDb(), Number(id));
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
