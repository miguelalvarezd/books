import { readFileSync } from "node:fs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { takeBook } from "@/lib/actions";
import { createBook, createPlace, deleteBook, deletePlace, reorderPlace, updateBook, updatePlace, updateTheme } from "@/lib/admin";
import { parseIdentified } from "@/lib/identify";
import { loadLibrary } from "@/lib/load";
import { migrateDb } from "../scripts/migrate";
import { seedDb } from "../scripts/seed";

let db: Db;
const actor = { userId: null };

beforeEach(async () => {
  db = await migrateDb("pglite:memory");
  await seedDb(db, readFileSync("seed/library.txt", "utf8"));
});

const bookBy = async (title: string) => (await db.select().from(t.books).where(eq(t.books.title, title)))[0];
const titlesOn = async (shelfId: number) =>
  (
    await db
      .select({ title: t.books.title })
      .from(t.books)
      .where(and(eq(t.books.homeShelfId, shelfId), isNull(t.books.deletedAt)))
      .orderBy(asc(t.books.position))
  ).map((r) => r.title);

describe("books", () => {
  it("adds a book after a given book, with a new theme", async () => {
    const hobbit = await bookBy("El Hobbit");
    const id = await createBook(db, actor, {
      title: "  El Silmarillion ",
      author: "J.R.R. Tolkien",
      theme: { nameEs: "Tolkien", nameEn: "Tolkien" },
      shelfId: hobbit.homeShelfId!,
      afterBookId: hobbit.id,
    });
    const titles = await titlesOn(hobbit.homeShelfId!);
    expect(titles[titles.indexOf("El Hobbit") + 1]).toBe("El Silmarillion");
    const [b] = await db.select().from(t.books).where(eq(t.books.id, id));
    expect(b.status).toBe("shelf");
    const [theme] = await db.select().from(t.themes).where(eq(t.themes.id, b.themeId!));
    expect(theme.nameEs).toBe("Tolkien");
  });

  it("renames an unknown comic and logs what changed", async () => {
    const b = await bookBy("Desconocido #3");
    await updateBook(db, actor, b.id, { title: "El ordenador ¡qué horror!", author: "Francisco Ibáñez", series: "Mortadelo y Filemón", theme: { id: b.themeId! } });
    const after = (await db.select().from(t.books).where(eq(t.books.id, b.id)))[0];
    expect([after.title, after.author, after.homeShelfId, after.position]).toEqual([
      "El ordenador ¡qué horror!",
      "Francisco Ibáñez",
      b.homeShelfId,
      b.position,
    ]);
    const [ev] = await db.select().from(t.events).where(eq(t.events.action, "book_update"));
    expect(ev.data).toMatchObject({ changed: { title: { from: "Desconocido #3", to: "El ordenador ¡qué horror!" } } });
  });

  it("deletes softly, keeps history, and refuses while lent", async () => {
    const b = await bookBy("Sidi");
    await takeBook(db, actor, { bookId: b.id, kind: "lent", person: "Ana" });
    await expect(deleteBook(db, actor, b.id)).rejects.toMatchObject({ code: "conflict" });
    const m = await bookBy("Momo");
    await deleteBook(db, actor, m.id);
    const lib = await loadLibrary(db);
    expect(lib.books.find((x) => x.id === m.id)).toBeUndefined();
    expect(lib.books).toHaveLength(592);
  });

  it("rejects empty titles", async () => {
    const b = await bookBy("Momo");
    await expect(updateBook(db, actor, b.id, { title: "   " })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("places", () => {
  it("creates a room, bookcase and shelves with a front row, then reorders", async () => {
    const roomId = await createPlace(db, actor, { type: "room", name: "Dormitorio" });
    const bcId = await createPlace(db, actor, { type: "bookcase", roomId, name: "Mesilla" });
    const s1 = await createPlace(db, actor, { type: "shelf", bookcaseId: bcId, name: "1" });
    const s1b = await createPlace(db, actor, { type: "shelf", bookcaseId: bcId, name: "1B", frontOfShelfId: s1 });
    const s2 = await createPlace(db, actor, { type: "shelf", bookcaseId: bcId, name: "2", kind: "toys", heightUnits: 2 });
    await expect(
      createPlace(db, actor, { type: "shelf", bookcaseId: bcId, name: "x", frontOfShelfId: s1 }),
    ).rejects.toMatchObject({ code: "invalid" });

    await reorderPlace(db, { type: "shelf", id: s2, dir: -1 });
    const order = (await db.select().from(t.shelves).where(eq(t.shelves.bookcaseId, bcId)).orderBy(asc(t.shelves.sort))).map((s) => s.id);
    expect(order).toEqual([s1, s2, s1b]);
  });

  it("never deletes a place that still holds something", async () => {
    const hobbit = await bookBy("El Hobbit");
    await expect(deletePlace(db, actor, { type: "shelf", id: hobbit.homeShelfId! })).rejects.toMatchObject({ code: "conflict" });
    const [pasillo] = await db.select().from(t.rooms).where(eq(t.rooms.name, "Pasillo"));
    await expect(deletePlace(db, actor, { type: "room", id: pasillo.id })).rejects.toMatchObject({ code: "conflict" });
    // 2B is empty: it can go, then the back row could get a new front row.
    const [s2b] = await db.select().from(t.shelves).where(eq(t.shelves.name, "2B"));
    await deletePlace(db, actor, { type: "shelf", id: s2b.id });
    await expect(updatePlace(db, actor, { type: "shelf", id: hobbit.homeShelfId!, name: "1", kind: "toys" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("a shelf with only deleted books can be removed", async () => {
    const roomId = await createPlace(db, actor, { type: "room", name: "Trastero" });
    const bcId = await createPlace(db, actor, { type: "bookcase", roomId, name: "Caja" });
    const s = await createPlace(db, actor, { type: "shelf", bookcaseId: bcId, name: "1" });
    const id = await createBook(db, actor, { title: "Viejo", shelfId: s });
    await deleteBook(db, actor, id);
    await deletePlace(db, actor, { type: "shelf", id: s });
    const [b] = await db.select().from(t.books).where(eq(t.books.id, id));
    expect([b.homeShelfId, b.deletedAt !== null]).toEqual([null, true]);
  });

  it("renames themes in both languages", async () => {
    const [th] = await db.select().from(t.themes).where(eq(t.themes.nameEs, "Fantasía"));
    await updateTheme(db, actor, { id: th.id, nameEs: "Fantasía y aventura", nameEn: "Fantasy & adventure" });
    const [after] = await db.select().from(t.themes).where(eq(t.themes.id, th.id));
    expect(after.nameEn).toBe("Fantasy & adventure");
  });
});

describe("photo answer parsing", () => {
  it("keeps only valid fields", () => {
    expect(parseIdentified('Sure! {"title":"Momo","author":"Michael Ende","language":"es","series":null,"seriesNumber":null}')).toEqual({
      title: "Momo",
      author: "Michael Ende",
      language: "es",
      series: null,
      seriesNumber: null,
    });
    expect(parseIdentified("no idea").title).toBeNull();
    expect(parseIdentified('{"title":" ","language":"klingon"}')).toMatchObject({ title: null, language: null });
  });
});
