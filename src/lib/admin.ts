/**
 * Adding, editing and removing books and places (rooms, bookcases, shelves).
 * Rule: nothing can be deleted while it still holds something, so no book is ever lost.
 */
import { and, asc, count, eq, isNull, max, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { ActionError, placeOnShelf, shelfPath, type Actor, type Tx } from "./actions";

type Lang = (typeof t.LANGUAGES)[number];
type ShelfKind = (typeof t.SHELF_KINDS)[number];

const name = (v: unknown, what = "name") => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s) throw new ActionError("invalid", `Missing ${what}`);
  if (s.length > 200) throw new ActionError("invalid", `${what} is too long`);
  return s;
};
const optText = (v: unknown, maxLen = 200) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, maxLen) : null;
};

async function log(tx: Tx, actor: Actor, action: string, entityType: string, entityId: number, data: object) {
  await tx.insert(t.events).values({ actorId: actor.userId, action, entityType, entityId, data });
}

// ───────────────────────────── Books ─────────────────────────────

export interface BookFields {
  title: string;
  author?: string | null;
  language?: string;
  /** Existing theme id, or a new theme to create, or null for none. */
  theme?: { id: number } | { nameEs: string; nameEn: string } | null;
  series?: string | null;
  seriesNumber?: number | null;
  notes?: string | null;
}

async function resolveTheme(tx: Tx, theme: BookFields["theme"]): Promise<number | null> {
  if (!theme) return null;
  if ("id" in theme) {
    const [row] = await tx.select({ id: t.themes.id }).from(t.themes).where(eq(t.themes.id, theme.id));
    if (!row) throw new ActionError("invalid", "Theme not found");
    return row.id;
  }
  const nameEs = name(theme.nameEs, "theme");
  const nameEn = optText(theme.nameEn) ?? nameEs;
  const [existing] = await tx.select({ id: t.themes.id }).from(t.themes).where(eq(t.themes.nameEs, nameEs));
  if (existing) return existing.id;
  const [row] = await tx.insert(t.themes).values({ nameEs, nameEn }).returning({ id: t.themes.id });
  return row.id;
}

async function bookValues(tx: Tx, f: BookFields) {
  const language = (f.language ?? "es") as Lang;
  if (!t.LANGUAGES.includes(language)) throw new ActionError("invalid", "Unknown language");
  const n = f.seriesNumber;
  if (n != null && (!Number.isFinite(n) || n < 0 || n > 10000)) throw new ActionError("invalid", "Bad series number");
  return {
    title: name(f.title, "title"),
    author: optText(f.author),
    language,
    themeId: await resolveTheme(tx, f.theme),
    series: optText(f.series),
    seriesNumber: optText(f.series) ? (n ?? null) : null,
    notes: optText(f.notes, 2000),
  };
}

export async function createBook(
  db: Db,
  actor: Actor,
  input: BookFields & { shelfId: number; afterBookId?: number | null },
): Promise<number> {
  return db.transaction(async (tx) => {
    const values = await bookValues(tx, input);
    const [row] = await tx
      .insert(t.books)
      .values({ ...values, homeShelfId: input.shelfId, position: 0, createdBy: actor.userId, updatedBy: actor.userId })
      .returning({ id: t.books.id });
    await placeOnShelf(tx, row.id, input.shelfId, input.afterBookId);
    await log(tx, actor, "book_create", "book", row.id, { title: values.title, to: await shelfPath(tx, input.shelfId) });
    return row.id;
  });
}

export async function updateBook(db: Db, actor: Actor, bookId: number, input: BookFields) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(t.books)
      .where(and(eq(t.books.id, bookId), isNull(t.books.deletedAt)))
      .for("update");
    if (!before) throw new ActionError("not_found", "Book not found");
    const values = await bookValues(tx, input);
    await tx
      .update(t.books)
      .set({ ...values, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(t.books.id, bookId));
    const changed = Object.fromEntries(
      Object.entries(values)
        .filter(([k, v]) => before[k as keyof typeof before] !== v)
        .map(([k, v]) => [k, { from: before[k as keyof typeof before], to: v }]),
    );
    await log(tx, actor, "book_update", "book", bookId, { title: values.title, changed });
  });
}

/** Removes a book from the app. Its loan history stays in the database. */
export async function deleteBook(db: Db, actor: Actor, bookId: number) {
  return db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(t.books)
      .where(and(eq(t.books.id, bookId), isNull(t.books.deletedAt)))
      .for("update");
    if (!book) throw new ActionError("not_found", "Book not found");
    if (book.status === "reading" || book.status === "lent")
      throw new ActionError("conflict", "Put the book back before deleting it", "put_back_first");
    await tx.update(t.books).set({ deletedAt: new Date(), updatedBy: actor.userId }).where(eq(t.books.id, bookId));
    await log(tx, actor, "book_delete", "book", bookId, {
      title: book.title,
      from: book.homeShelfId ? await shelfPath(tx, book.homeShelfId) : null,
    });
  });
}

// ───────────────────────────── Places ─────────────────────────────

export type PlaceType = "room" | "bookcase" | "shelf";

const nextSort = async (tx: Tx, table: typeof t.rooms | typeof t.bookcases | typeof t.shelves, where?: ReturnType<typeof eq>) => {
  const [row] = await tx.select({ m: max(table.sort) }).from(table).where(where);
  return (row?.m ?? -1) + 1;
};

const liveBooksOn = async (tx: Tx, shelfId: number) =>
  (
    await tx
      .select({ n: count() })
      .from(t.books)
      .where(and(eq(t.books.homeShelfId, shelfId), isNull(t.books.deletedAt)))
  )[0].n;

export interface ShelfFields {
  name: string;
  kind?: ShelfKind;
  heightUnits?: number;
  /** Make this shelf the front row of another shelf in the same bookcase. */
  frontOfShelfId?: number | null;
}

async function shelfValues(tx: Tx, bookcaseId: number, f: ShelfFields, selfId?: number) {
  const kind = (f.kind ?? "books") as ShelfKind;
  if (!t.SHELF_KINDS.includes(kind)) throw new ActionError("invalid", "Unknown shelf kind");
  const heightUnits = f.heightUnits ?? 1;
  if (!Number.isInteger(heightUnits) || heightUnits < 1 || heightUnits > 6)
    throw new ActionError("invalid", "Height must be 1–6");
  let frontOfShelfId: number | null = null;
  if (f.frontOfShelfId) {
    const [back] = await tx.select().from(t.shelves).where(eq(t.shelves.id, f.frontOfShelfId));
    if (!back || back.bookcaseId !== bookcaseId) throw new ActionError("invalid", "Back row must be in the same bookcase");
    if (back.frontOfShelfId) throw new ActionError("invalid", "A front row can't have its own front row");
    if (back.id === selfId) throw new ActionError("invalid", "A shelf can't be in front of itself");
    const [other] = await tx
      .select({ id: t.shelves.id })
      .from(t.shelves)
      .where(eq(t.shelves.frontOfShelfId, back.id));
    if (other && other.id !== selfId) throw new ActionError("invalid", "That shelf already has a front row", "front_row_taken");
    if (kind !== "books") throw new ActionError("invalid", "A front row holds books");
    frontOfShelfId = back.id;
  }
  return { name: name(f.name), kind, heightUnits, frontOfShelfId };
}

export async function createPlace(
  db: Db,
  actor: Actor,
  input:
    | { type: "room"; name: string }
    | { type: "bookcase"; roomId: number; name: string }
    | ({ type: "shelf"; bookcaseId: number } & ShelfFields),
): Promise<number> {
  return db.transaction(async (tx) => {
    let id: number;
    let label: string;
    if (input.type === "room") {
      label = name(input.name);
      [{ id }] = await tx
        .insert(t.rooms)
        .values({ name: label, sort: await nextSort(tx, t.rooms) })
        .returning({ id: t.rooms.id });
    } else if (input.type === "bookcase") {
      const [room] = await tx.select().from(t.rooms).where(eq(t.rooms.id, input.roomId));
      if (!room) throw new ActionError("invalid", "Room not found");
      label = `${room.name} · ${name(input.name)}`;
      [{ id }] = await tx
        .insert(t.bookcases)
        .values({ roomId: room.id, name: name(input.name), sort: await nextSort(tx, t.bookcases, eq(t.bookcases.roomId, room.id)) })
        .returning({ id: t.bookcases.id });
    } else {
      const [bc] = await tx.select().from(t.bookcases).where(eq(t.bookcases.id, input.bookcaseId));
      if (!bc) throw new ActionError("invalid", "Bookcase not found");
      const values = await shelfValues(tx, bc.id, input);
      [{ id }] = await tx
        .insert(t.shelves)
        .values({ ...values, bookcaseId: bc.id, sort: await nextSort(tx, t.shelves, eq(t.shelves.bookcaseId, bc.id)) })
        .returning({ id: t.shelves.id });
      label = await shelfPath(tx, id);
    }
    await log(tx, actor, "place_create", input.type, id, { name: label });
    return id;
  });
}

export async function updatePlace(
  db: Db,
  actor: Actor,
  input: { type: "room" | "bookcase"; id: number; name: string } | ({ type: "shelf"; id: number } & ShelfFields),
) {
  return db.transaction(async (tx) => {
    if (input.type === "shelf") {
      const [s] = await tx.select().from(t.shelves).where(eq(t.shelves.id, input.id));
      if (!s) throw new ActionError("not_found", "Shelf not found");
      const values = await shelfValues(tx, s.bookcaseId, input, s.id);
      if (values.kind !== "books" && (await liveBooksOn(tx, s.id)) > 0)
        throw new ActionError("conflict", "Move the books off this shelf first", "shelf_not_empty");
      const [front] = await tx.select().from(t.shelves).where(eq(t.shelves.frontOfShelfId, s.id));
      if (front && values.frontOfShelfId) throw new ActionError("invalid", "This shelf has a front row of its own", "has_front_row");
      await tx.update(t.shelves).set(values).where(eq(t.shelves.id, s.id));
    } else {
      const table = input.type === "room" ? t.rooms : t.bookcases;
      const res = await tx.update(table).set({ name: name(input.name) }).where(eq(table.id, input.id)).returning({ id: table.id });
      if (!res.length) throw new ActionError("not_found", "Not found");
    }
    const label = input.type === "shelf" ? await shelfPath(tx, input.id) : name(input.name);
    await log(tx, actor, "place_update", input.type, input.id, { name: label });
  });
}

export async function deletePlace(db: Db, actor: Actor, input: { type: PlaceType; id: number }) {
  return db.transaction(async (tx) => {
    let label: string;
    if (input.type === "room") {
      const [room] = await tx.select().from(t.rooms).where(eq(t.rooms.id, input.id));
      if (!room) throw new ActionError("not_found", "Not found");
      const [{ n }] = await tx.select({ n: count() }).from(t.bookcases).where(eq(t.bookcases.roomId, room.id));
      if (n > 0) throw new ActionError("conflict", "Remove its bookcases first", "has_bookcases");
      const [{ r }] = await tx.select({ r: count() }).from(t.books).where(and(eq(t.books.statusRoomId, room.id), isNull(t.books.deletedAt)));
      if (r > 0) throw new ActionError("conflict", "Someone is reading a book in this room", "room_in_use");
      label = room.name;
      await tx.delete(t.rooms).where(eq(t.rooms.id, room.id));
    } else if (input.type === "bookcase") {
      const [bc] = await tx.select().from(t.bookcases).where(eq(t.bookcases.id, input.id));
      if (!bc) throw new ActionError("not_found", "Not found");
      const [{ n }] = await tx.select({ n: count() }).from(t.shelves).where(eq(t.shelves.bookcaseId, bc.id));
      if (n > 0) throw new ActionError("conflict", "Remove its shelves first", "has_shelves");
      label = bc.name;
      await tx.delete(t.bookcases).where(eq(t.bookcases.id, bc.id));
    } else {
      const [s] = await tx.select().from(t.shelves).where(eq(t.shelves.id, input.id));
      if (!s) throw new ActionError("not_found", "Not found");
      if ((await liveBooksOn(tx, s.id)) > 0) throw new ActionError("conflict", "Move the books off this shelf first", "shelf_not_empty");
      const [front] = await tx.select().from(t.shelves).where(eq(t.shelves.frontOfShelfId, s.id));
      if (front) throw new ActionError("conflict", "Remove its front row first", "has_front_row");
      label = await shelfPath(tx, s.id);
      // Deleted books keep their history but no longer point at this shelf.
      await tx.update(t.books).set({ homeShelfId: null }).where(eq(t.books.homeShelfId, s.id));
      await tx.update(t.loans).set({ returnedToShelfId: null }).where(eq(t.loans.returnedToShelfId, s.id));
      await tx.delete(t.shelves).where(eq(t.shelves.id, s.id));
    }
    await log(tx, actor, "place_delete", input.type, input.id, { name: label });
  });
}

/** Move a room / bookcase / shelf one step up (-1) or down (+1) among its siblings. */
export async function reorderPlace(db: Db, input: { type: PlaceType; id: number; dir: -1 | 1 }) {
  return db.transaction(async (tx) => {
    const siblings = async () => {
      if (input.type === "room")
        return tx.select({ id: t.rooms.id }).from(t.rooms).orderBy(asc(t.rooms.sort), asc(t.rooms.id));
      if (input.type === "bookcase") {
        const [bc] = await tx.select().from(t.bookcases).where(eq(t.bookcases.id, input.id));
        if (!bc) throw new ActionError("not_found", "Not found");
        return tx
          .select({ id: t.bookcases.id })
          .from(t.bookcases)
          .where(eq(t.bookcases.roomId, bc.roomId))
          .orderBy(asc(t.bookcases.sort), asc(t.bookcases.id));
      }
      const [s] = await tx.select().from(t.shelves).where(eq(t.shelves.id, input.id));
      if (!s) throw new ActionError("not_found", "Not found");
      return tx
        .select({ id: t.shelves.id })
        .from(t.shelves)
        .where(eq(t.shelves.bookcaseId, s.bookcaseId))
        .orderBy(asc(t.shelves.sort), asc(t.shelves.id));
    };
    const ids = (await siblings()).map((r) => r.id);
    const i = ids.indexOf(input.id);
    const j = i + input.dir;
    if (i < 0) throw new ActionError("not_found", "Not found");
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const table = input.type === "room" ? t.rooms : input.type === "bookcase" ? t.bookcases : t.shelves;
    for (const [k, id] of ids.entries()) await tx.update(table).set({ sort: k }).where(eq(table.id, id));
  });
}

export async function updateTheme(db: Db, actor: Actor, input: { id: number; nameEs: string; nameEn: string }) {
  return db.transaction(async (tx) => {
    const nameEs = name(input.nameEs, "theme");
    const nameEn = optText(input.nameEn) ?? nameEs;
    const [clash] = await tx
      .select({ id: t.themes.id })
      .from(t.themes)
      .where(and(eq(t.themes.nameEs, nameEs), sql`${t.themes.id} <> ${input.id}`));
    if (clash) throw new ActionError("conflict", "Another theme already has that name", "theme_exists");
    const res = await tx.update(t.themes).set({ nameEs, nameEn }).where(eq(t.themes.id, input.id)).returning({ id: t.themes.id });
    if (!res.length) throw new ActionError("not_found", "Theme not found");
    await log(tx, actor, "theme_update", "theme", input.id, { name: nameEs });
  });
}
