import { getDb } from "@/db/client";
import { ActionError } from "@/lib/actions";
import { getActor } from "@/lib/actor";
import { createBook } from "@/lib/admin";
import { handle, int, readJson } from "@/lib/http";
import { bookFields } from "@/lib/parse";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const shelfId = int(body.shelfId);
    if (!shelfId) throw new ActionError("invalid", "shelfId");
    const afterBookId = body.afterBookId === null ? null : int(body.afterBookId);
    const id = await createBook(await getDb(), await getActor(req), { ...bookFields(body), shelfId, afterBookId });
    return { id };
  });
}
