/**
 * Everything that changes where a book is. Each action runs in one transaction,
 * checks the book is in the state the person saw (so two phones can't lend the same
 * book twice), writes the loan history and an audit event.
 */
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Status = (typeof t.BOOK_STATUSES)[number];

export class ActionError extends Error {
  constructor(
    public code: "not_found" | "conflict" | "invalid",
    message: string,
    /** Key the app translates into a friendly message (see i18n `err_*`). */
    public reason?: string,
  ) {
    super(message);
  }
}

export interface Actor {
  userId: number | null;
  role?: "admin" | "member";
}

async function lockBook(tx: Tx, bookId: number) {
  const [book] = await tx.select().from(t.books).where(eq(t.books.id, bookId)).for("update");
  if (!book || book.deletedAt || book.homeShelfId == null) throw new ActionError("not_found", "Book not found");
  return { ...book, homeShelfId: book.homeShelfId };
}

function expect(book: { status: Status }, allowed: Status[], expected?: Status) {
  if (expected && book.status !== expected)
    throw new ActionError("conflict", `Book is now "${book.status}", not "${expected}"`);
  if (!allowed.includes(book.status))
    throw new ActionError("conflict", `Not allowed while the book is "${book.status}"`);
}

/** "Pasillo · Derecha · 1", for readable audit entries. */
export async function shelfPath(tx: Tx, shelfId: number) {
  const [row] = await tx
    .select({ room: t.rooms.name, bookcase: t.bookcases.name, shelf: t.shelves.name })
    .from(t.shelves)
    .innerJoin(t.bookcases, eq(t.bookcases.id, t.shelves.bookcaseId))
    .innerJoin(t.rooms, eq(t.rooms.id, t.bookcases.roomId))
    .where(eq(t.shelves.id, shelfId));
  if (!row) throw new ActionError("invalid", "Shelf not found");
  return `${row.room} · ${row.bookcase} · ${row.shelf}`;
}

async function log(tx: Tx, actor: Actor, action: string, bookId: number, data: Record<string, unknown>) {
  await tx.insert(t.events).values({ actorId: actor.userId, action, entityType: "book", entityId: bookId, data });
}

const cleanName = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Put `bookId` on `shelfId` right after `afterBookId` (null = first, undefined = last).
 * Renumbers the shelf 10, 20, 30… so positions stay simple.
 */
export async function placeOnShelf(tx: Tx, bookId: number, shelfId: number, afterBookId?: number | null) {
  const [shelf] = await tx.select().from(t.shelves).where(eq(t.shelves.id, shelfId));
  if (!shelf) throw new ActionError("invalid", "Shelf not found");
  if (shelf.kind !== "books") throw new ActionError("invalid", "That shelf doesn't hold books", "not_books_shelf");

  const row = await tx
    .select({ id: t.books.id, position: t.books.position })
    .from(t.books)
    .where(and(eq(t.books.homeShelfId, shelfId), ne(t.books.id, bookId), isNull(t.books.deletedAt)))
    .orderBy(asc(t.books.position), asc(t.books.id));
  let at = row.length;
  if (afterBookId === null) at = 0;
  else if (afterBookId !== undefined) {
    const i = row.findIndex((b) => b.id === afterBookId);
    if (i < 0) throw new ActionError("invalid", "That book isn't on this shelf");
    at = i + 1;
  }
  const order = [...row.slice(0, at).map((b) => b.id), bookId, ...row.slice(at).map((b) => b.id)];
  for (const [i, id] of order.entries()) {
    const position = (i + 1) * 10;
    const current = id === bookId ? undefined : row.find((b) => b.id === id)?.position;
    if (id === bookId || current !== position)
      await tx
        .update(t.books)
        .set(id === bookId ? { homeShelfId: shelfId, position } : { position })
        .where(eq(t.books.id, id));
  }
}

export interface TakeInput {
  bookId: number;
  kind: "reading" | "lent";
  person: string;
  roomId?: number | null;
  expectedStatus?: Status;
}

/** Take a book off its shelf: to read at home (with room) or lent to someone. */
export async function takeBook(db: Db, actor: Actor, input: TakeInput) {
  const person = cleanName(input.person);
  if (!person) throw new ActionError("invalid", "Who has the book?");
  if (input.kind === "reading" && !input.roomId) throw new ActionError("invalid", "Which room is it in?");
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId);
    expect(book, ["shelf", "missing"], input.expectedStatus);
    let roomName: string | null = null;
    if (input.kind === "reading") {
      const [room] = await tx.select().from(t.rooms).where(eq(t.rooms.id, input.roomId!));
      if (!room) throw new ActionError("invalid", "Room not found");
      roomName = room.name;
    }
    const now = new Date();
    await tx.insert(t.loans).values({
      bookId: book.id,
      kind: input.kind,
      person,
      roomId: input.kind === "reading" ? input.roomId! : null,
      startedAt: now,
      startedBy: actor.userId,
    });
    await tx
      .update(t.books)
      .set({
        status: input.kind,
        holder: person,
        statusRoomId: input.kind === "reading" ? input.roomId! : null,
        statusSince: now,
        updatedAt: now,
        updatedBy: actor.userId,
      })
      .where(eq(t.books.id, book.id));
    await log(tx, actor, input.kind === "reading" ? "take_reading" : "lend", book.id, {
      title: book.title,
      person,
      room: roomName,
      from: await shelfPath(tx, book.homeShelfId),
      wasMissing: book.status === "missing",
    });
  });
}

export interface ReturnInput {
  bookId: number;
  /** Omit to put it back on its own shelf. */
  toShelfId?: number;
  afterBookId?: number | null;
  expectedStatus?: Status;
}

/** Book goes back on a shelf: its own (default) or somewhere else, which becomes its new home. */
export async function returnBook(db: Db, actor: Actor, input: ReturnInput) {
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId);
    expect(book, ["reading", "lent", "missing"], input.expectedStatus);
    const now = new Date();
    const moved = input.toShelfId !== undefined && (input.toShelfId !== book.homeShelfId || input.afterBookId !== undefined);
    const from = await shelfPath(tx, book.homeShelfId);
    if (moved) await placeOnShelf(tx, book.id, input.toShelfId!, input.afterBookId);
    const shelfId = moved ? input.toShelfId! : book.homeShelfId;

    await tx
      .update(t.loans)
      .set({ endedAt: now, endedBy: actor.userId, returnedToShelfId: shelfId })
      .where(and(eq(t.loans.bookId, book.id), isNull(t.loans.endedAt)));
    await tx
      .update(t.books)
      .set({ status: "shelf", holder: null, statusRoomId: null, statusSince: null, updatedAt: now, updatedBy: actor.userId })
      .where(eq(t.books.id, book.id));
    await log(tx, actor, book.status === "missing" ? "found" : "return", book.id, {
      title: book.title,
      person: book.holder,
      from,
      to: moved ? await shelfPath(tx, shelfId) : from,
      moved,
    });
  });
}

export interface MoveInput {
  bookId: number;
  toShelfId: number;
  afterBookId?: number | null;
}

/** Change where a book belongs (it stays in whatever state it is). */
export async function moveBook(db: Db, actor: Actor, input: MoveInput) {
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId);
    const from = await shelfPath(tx, book.homeShelfId);
    await placeOnShelf(tx, book.id, input.toShelfId, input.afterBookId);
    await tx
      .update(t.books)
      .set({ updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(t.books.id, book.id));
    await log(tx, actor, "move", book.id, { title: book.title, from, to: await shelfPath(tx, input.toShelfId) });
  });
}

/** The book isn't where it should be and nobody has it. */
export async function markMissing(db: Db, actor: Actor, input: { bookId: number; expectedStatus?: Status }) {
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId);
    expect(book, ["shelf"], input.expectedStatus);
    const now = new Date();
    await tx
      .update(t.books)
      .set({ status: "missing", holder: null, statusRoomId: null, statusSince: now, updatedAt: now, updatedBy: actor.userId })
      .where(eq(t.books.id, book.id));
    await log(tx, actor, "missing", book.id, { title: book.title, from: await shelfPath(tx, book.homeShelfId) });
  });
}

/** Loan history of one book, newest first. */
export async function bookHistory(db: Db, bookId: number) {
  return db
    .select({
      id: t.loans.id,
      kind: t.loans.kind,
      person: t.loans.person,
      room: t.rooms.name,
      startedAt: t.loans.startedAt,
      endedAt: t.loans.endedAt,
    })
    .from(t.loans)
    .leftJoin(t.rooms, eq(t.rooms.id, t.loans.roomId))
    .where(eq(t.loans.bookId, bookId))
    .orderBy(sql`${t.loans.startedAt} desc`, sql`${t.loans.id} desc`);
}

/** Recent changes across the library. */
export async function recentActivity(db: Db, limit = 100) {
  return db
    .select({
      id: t.events.id,
      at: t.events.at,
      action: t.events.action,
      bookId: t.events.entityId,
      data: t.events.data,
      actor: t.users.name,
    })
    .from(t.events)
    .leftJoin(t.users, eq(t.users.id, t.events.actorId))
    .orderBy(sql`${t.events.id} desc`)
    .limit(limit);
}

/** Names used before, most recent first, for the "who" autocomplete. */
export async function knownPeople(db: Db) {
  const rows = await db
    .select({ person: t.loans.person, last: sql<string>`max(${t.loans.startedAt})`.as("last") })
    .from(t.loans)
    .groupBy(t.loans.person)
    .orderBy(sql`last desc`)
    .limit(200);
  const users = await db.select({ name: t.users.name }).from(t.users).where(eq(t.users.active, 1));
  const names = [...rows.map((r) => r.person), ...users.map((u) => u.name)];
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
