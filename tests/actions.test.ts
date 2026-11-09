import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { bookHistory, knownPeople, markMissing, moveBook, recentActivity, returnBook, takeBook } from "@/lib/actions";
import { migrateDb } from "../scripts/migrate";
import { seedDb } from "../scripts/seed";

let db: Db;
const actor = { userId: null };
const seed = readFileSync("seed/library.txt", "utf8");

beforeEach(async () => {
  db = await migrateDb("pglite:memory");
  await seedDb(db, seed);
});

const book = async (title: string) => (await db.select().from(t.books).where(eq(t.books.title, title)))[0];
const room = async (name: string) => (await db.select().from(t.rooms).where(eq(t.rooms.name, name)))[0];
const shelfTitles = async (shelfId: number) =>
  (
    await db
      .select({ title: t.books.title })
      .from(t.books)
      .where(eq(t.books.homeShelfId, shelfId))
      .orderBy(asc(t.books.position))
  ).map((b) => b.title);

describe("take and return", () => {
  it("reading at home records who and where, and returns to the same spot", async () => {
    const b = await book("Sidi");
    const salon = await room("Salón Sótano");
    await takeBook(db, actor, { bookId: b.id, kind: "reading", person: " Mamá ", roomId: salon.id, expectedStatus: "shelf" });

    const out = await book("Sidi");
    expect([out.status, out.holder, out.statusRoomId]).toEqual(["reading", "Mamá", salon.id]);

    await returnBook(db, actor, { bookId: b.id, expectedStatus: "reading" });
    const back = await book("Sidi");
    expect([back.status, back.holder, back.homeShelfId, back.position]).toEqual(["shelf", null, b.homeShelfId, b.position]);

    const h = await bookHistory(db, b.id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ kind: "reading", person: "Mamá", room: "Salón Sótano" });
    expect(h[0].endedAt).not.toBeNull();
    expect((await recentActivity(db)).map((e) => e.action).slice(0, 2)).toEqual(["return", "take_reading"]);
  });

  it("refuses to lend a book that is already out (two phones at once)", async () => {
    const b = await book("El Hobbit");
    await takeBook(db, actor, { bookId: b.id, kind: "lent", person: "Lucía", expectedStatus: "shelf" });
    await expect(
      takeBook(db, actor, { bookId: b.id, kind: "lent", person: "Pedro", expectedStatus: "shelf" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(takeBook(db, actor, { bookId: b.id, kind: "reading", person: "x" })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("returning somewhere else makes that the new home, at the chosen spot", async () => {
    const b = await book("Elantris");
    const target = await book("El Hobbit");
    await takeBook(db, actor, { bookId: b.id, kind: "lent", person: "Ana" });
    await returnBook(db, actor, { bookId: b.id, toShelfId: target.homeShelfId, afterBookId: target.id });
    const titles = await shelfTitles(target.homeShelfId);
    expect(titles.slice(titles.indexOf("El Hobbit"), titles.indexOf("El Hobbit") + 3)).toEqual([
      "El Hobbit",
      "Elantris",
      "Momo",
    ]);
    expect((await recentActivity(db))[0]).toMatchObject({ action: "return", data: { moved: true } });
  });

  it("suggests names used before, most recent first, without duplicates", async () => {
    await takeBook(db, actor, { bookId: (await book("Sidi")).id, kind: "lent", person: "Lucía" });
    await takeBook(db, actor, { bookId: (await book("Momo")).id, kind: "lent", person: "Pedro" });
    await takeBook(db, actor, { bookId: (await book("Elantris")).id, kind: "lent", person: "lucía" });
    const names = await knownPeople(db);
    expect(names.map((n) => n.toLowerCase())).toEqual(["lucía", "pedro"]);
  });
});

describe("move and missing", () => {
  it("moves to the start of another shelf and renumbers", async () => {
    const b = await book("Momo");
    const dest = await book("Sidi");
    await moveBook(db, actor, { bookId: b.id, toShelfId: dest.homeShelfId, afterBookId: null });
    const titles = await shelfTitles(dest.homeShelfId);
    expect(titles[0]).toBe("Momo");
    const positions = (await db.select().from(t.books).where(eq(t.books.homeShelfId, dest.homeShelfId))).map((r) => r.position).sort((a, c) => a - c);
    expect(positions.slice(0, 3)).toEqual([10, 20, 30]);
  });

  it("can't place books on a toys shelf", async () => {
    const [toys] = await db.select().from(t.shelves).where(eq(t.shelves.kind, "toys"));
    await expect(moveBook(db, actor, { bookId: (await book("Momo")).id, toShelfId: toys.id })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("missing → found puts it back on its shelf", async () => {
    const b = await book("Momo");
    await markMissing(db, actor, { bookId: b.id, expectedStatus: "shelf" });
    expect((await book("Momo")).status).toBe("missing");
    await returnBook(db, actor, { bookId: b.id, expectedStatus: "missing" });
    expect((await book("Momo")).status).toBe("shelf");
    expect((await recentActivity(db))[0].action).toBe("found");
  });
});
