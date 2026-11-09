import { getDb } from "@/db/client";
import { ActionError } from "@/lib/actions";
import { getActor } from "@/lib/actor";
import { createPlace, deletePlace, reorderPlace, updatePlace, type ShelfFields } from "@/lib/admin";
import { handle, int, readJson } from "@/lib/http";

/** One endpoint for rooms, bookcases and shelves: { op, type, ... }. */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req);
    const db = await getDb();
    const actor = await getActor(req);
    const type = b.type;
    if (type !== "room" && type !== "bookcase" && type !== "shelf") throw new ActionError("invalid", "type");
    const shelf = (): ShelfFields => ({
      name: String(b.name ?? ""),
      kind: b.kind as ShelfFields["kind"],
      heightUnits: typeof b.heightUnits === "number" ? b.heightUnits : 1,
      frontOfShelfId: int(b.frontOfShelfId) ?? null,
    });
    switch (b.op) {
      case "create": {
        const id =
          type === "room"
            ? await createPlace(db, actor, { type, name: String(b.name ?? "") })
            : type === "bookcase"
              ? await createPlace(db, actor, { type, roomId: int(b.roomId) ?? 0, name: String(b.name ?? "") })
              : await createPlace(db, actor, { type, bookcaseId: int(b.bookcaseId) ?? 0, ...shelf() });
        return { id };
      }
      case "update": {
        const id = int(b.id);
        if (!id) throw new ActionError("invalid", "id");
        return type === "shelf"
          ? updatePlace(db, actor, { type, id, ...shelf() })
          : updatePlace(db, actor, { type, id, name: String(b.name ?? "") });
      }
      case "delete": {
        const id = int(b.id);
        if (!id) throw new ActionError("invalid", "id");
        return deletePlace(db, actor, { type, id });
      }
      case "move": {
        const id = int(b.id);
        if (!id || (b.dir !== 1 && b.dir !== -1)) throw new ActionError("invalid", "id/dir");
        return reorderPlace(db, { type, id, dir: b.dir });
      }
      default:
        throw new ActionError("invalid", "op");
    }
  });
}
