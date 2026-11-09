import { getDb } from "@/db/client";
import { ActionError, markMissing, moveBook, returnBook, takeBook } from "@/lib/actions";
import { getActor } from "@/lib/actor";

const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);
const status = (v: unknown) =>
  v === "shelf" || v === "reading" || v === "lent" || v === "missing" ? v : undefined;
/** afterBookId: a book id, null (= first on the shelf) or absent (= last). */
const after = (v: unknown) => (v === null ? null : int(v));

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/actions">) {
  const { id } = await ctx.params;
  const bookId = Number(id);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid", message: "Bad JSON" }, { status: 400 });
  }
  const db = await getDb();
  const actor = await getActor(req);
  const expectedStatus = status(body.expectedStatus);

  try {
    switch (body.type) {
      case "take":
        if (body.kind !== "reading" && body.kind !== "lent") throw new ActionError("invalid", "kind");
        await takeBook(db, actor, {
          bookId,
          kind: body.kind,
          person: String(body.person ?? ""),
          roomId: int(body.roomId),
          expectedStatus,
        });
        break;
      case "return":
        await returnBook(db, actor, {
          bookId,
          toShelfId: int(body.toShelfId),
          afterBookId: "afterBookId" in body ? after(body.afterBookId) : undefined,
          expectedStatus,
        });
        break;
      case "move": {
        const toShelfId = int(body.toShelfId);
        if (!toShelfId) throw new ActionError("invalid", "toShelfId");
        await moveBook(db, actor, {
          bookId,
          toShelfId,
          afterBookId: "afterBookId" in body ? after(body.afterBookId) : undefined,
        });
        break;
      }
      case "missing":
        await markMissing(db, actor, { bookId, expectedStatus });
        break;
      default:
        throw new ActionError("invalid", "Unknown action");
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ActionError) {
      const code = { not_found: 404, conflict: 409, invalid: 400 }[err.code];
      return Response.json({ error: err.code, message: err.message, reason: err.reason }, { status: code });
    }
    throw err;
  }
}
