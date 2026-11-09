import "server-only";
import type { Db } from "@/db/client";
import { knownPeople } from "./actions";
import * as t from "@/db/schema";
import type { LibraryData } from "./types";

/** Reads the whole catalog. ~600 books ≈ 100 KB of JSON (≈ 20 KB gzipped). */
export async function loadLibrary(db: Db): Promise<LibraryData> {
  const [rooms, bookcases, shelves, themes, books, people] = await Promise.all([
    db.select({ id: t.rooms.id, name: t.rooms.name, sort: t.rooms.sort }).from(t.rooms),
    db
      .select({ id: t.bookcases.id, roomId: t.bookcases.roomId, name: t.bookcases.name, sort: t.bookcases.sort })
      .from(t.bookcases),
    db
      .select({
        id: t.shelves.id,
        bookcaseId: t.shelves.bookcaseId,
        name: t.shelves.name,
        sort: t.shelves.sort,
        heightUnits: t.shelves.heightUnits,
        kind: t.shelves.kind,
        frontOfShelfId: t.shelves.frontOfShelfId,
      })
      .from(t.shelves),
    db.select({ id: t.themes.id, nameEs: t.themes.nameEs, nameEn: t.themes.nameEn }).from(t.themes),
    db
      .select({
        id: t.books.id,
        title: t.books.title,
        author: t.books.author,
        language: t.books.language,
        themeId: t.books.themeId,
        series: t.books.series,
        seriesNumber: t.books.seriesNumber,
        notes: t.books.notes,
        homeShelfId: t.books.homeShelfId,
        position: t.books.position,
        status: t.books.status,
        holder: t.books.holder,
        statusRoomId: t.books.statusRoomId,
        statusSince: t.books.statusSince,
      })
      .from(t.books),
    knownPeople(db),
  ]);
  return {
    rooms,
    bookcases,
    shelves,
    themes,
    books: books.map((b) => ({ ...b, statusSince: b.statusSince?.toISOString() ?? null })),
    people,
  };
}
