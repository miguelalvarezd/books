import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { migrateDb } from "../scripts/migrate";
import { seedDb } from "../scripts/seed";
import { computeRoomLayout } from "@/lib/diagram-layout";
import { buildIndex, normalize, placementOf, searchBooks, type LibraryIndex } from "@/lib/library";
import { loadLibrary } from "@/lib/load";

let ix: LibraryIndex;

beforeAll(async () => {
  const db = await migrateDb("pglite:memory");
  await seedDb(db, readFileSync("seed/library.txt", "utf8"));
  ix = buildIndex(await loadLibrary(db));
});

const byTitle = (t: string) => ix.data.books.find((b) => b.title === t)!;

describe("search", () => {
  it("ignores accents and case", () => {
    expect(normalize("Héroe de las ERAS")).toBe("heroe de las eras");
    expect(searchBooks(ix, "heroe eras")[0].title).toBe("El Héroe de las Eras");
  });
  it("matches authors, series and themes", () => {
    expect(searchBooks(ix, "grisham")).toHaveLength(6);
    expect(searchBooks(ix, "hollister").length).toBe(9);
    expect(searchBooks(ix, "percy jackson").map((b) => b.seriesNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(searchBooks(ix, "crime").length).toBeGreaterThan(20); // English theme name
  });
  it("ranks title matches first", () => {
    expect(searchBooks(ix, "sidi")[0].title).toBe("Sidi");
  });
});

describe("placement", () => {
  it("gives room, bookcase, shelf, position and neighbours", () => {
    const p = placementOf(ix, byTitle("El Hobbit"));
    expect([p.room.name, p.bookcase.name, p.shelf.name]).toEqual(["Pasillo", "Derecha", "1"]);
    expect(p.multipleBookcases).toBe(true);
    expect([p.index, p.count]).toEqual([25, 29]);
    expect([p.left?.title, p.right?.title]).toEqual(["El Desván de Tesla", "Momo"]);
  });
});

describe("diagram layout", () => {
  it("draws exactly one rectangle per book in every room", () => {
    let drawn = 0;
    for (const r of ix.rooms) drawn += computeRoomLayout(ix, r.id).books.length;
    expect(drawn).toBe(ix.data.books.length);
  });
  it("is stable and keeps books inside their level", () => {
    const pasillo = ix.rooms[0].id;
    const a = computeRoomLayout(ix, pasillo);
    expect(computeRoomLayout(ix, pasillo)).toEqual(a);
    const levels = new Map(a.levels.map((l) => [l.shelfId, l]));
    for (const b of a.books) {
      const shelf = ix.shelf.get(b.shelfId)!;
      const lv = levels.get(shelf.frontOfShelfId ?? shelf.id)!;
      expect(b.x + b.w).toBeLessThanOrEqual(lv.x + lv.w + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(lv.y);
      expect(b.y + b.h).toBeCloseTo(lv.y + lv.h, 5);
    }
    // Two bookcases of 6 levels each, side by side, same height.
    expect(a.bookcases).toHaveLength(2);
    expect(a.bookcases[0].h).toBe(a.bookcases[1].h);
  });
});
