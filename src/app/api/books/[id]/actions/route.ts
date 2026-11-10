import { getDb } from "@/db/client";
import { ActionError, markMissing, moveBook, returnBook, takeBook } from "@/lib/actions";
import { getActor } from "@/lib/actor";
import { handle, int, readJson } from "@/lib/http";

const status = (v: unknown) =>
  v === "shelf" || v === "reading" || v === "lent" || v === "missing" ? v : undefined;
/** afterBookId: a book id, null (= first on the shelf) or absent (= last). */
const after = (v: unknown) => (v === null ? null : int(v));

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/actions">) {
  const { id } = await ctx.params;
  const bookId = Number(id);
  return handle(async () => {
    const actor = await getActor(req);
    const body = await readJson(req);
    const db = await getDb();
    const expectedStatus = status(body.expectedStatus);
    switch (body.type) {
      case "take":
        if (body.kind !== "reading" && body.kind !== "lent") throw new ActionError("invalid", "kind");
        return takeBook(db, actor, {
          bookId,
          kind: body.kind,
          person: String(body.person ?? ""),
          roomId: int(body.roomId),
          expectedStatus,
        });
      case "return":
        return returnBook(db, actor, {
          bookId,
          toShelfId: int(body.toShelfId),
          afterBookId: "afterBookId" in body ? after(body.afterBookId) : undefined,
          expectedStatus,
        });
      case "move": {
        const toShelfId = int(body.toShelfId);
        if (!toShelfId) throw new ActionError("invalid", "toShelfId");
        return moveBook(db, actor, {
          bookId,
          toShelfId,
          afterBookId: "afterBookId" in body ? after(body.afterBookId) : undefined,
        });
      }
      case "missing":
        return markMissing(db, actor, { bookId, expectedStatus });
      default:
        throw new ActionError("invalid", "Unknown action");
    }
  });
}
