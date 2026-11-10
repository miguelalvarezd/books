import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { deleteBook, updateBook } from "@/lib/admin";
import { handle, readJson } from "@/lib/http";
import { bookFields } from "@/lib/parse";

export async function PATCH(req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateBook(await getDb(), await getActor(req), Number(id), bookFields(await readJson(req))));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => deleteBook(await getDb(), await getActor(req), Number(id)));
}
