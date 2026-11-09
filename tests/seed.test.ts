import { readFileSync } from "node:fs";
import { asc, count, eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as t from "../src/db/schema";
import { parseSeed, parseSeries } from "../src/db/seed-parser";
import { migrateDb } from "../scripts/migrate";
import { seedDb } from "../scripts/seed";

const text = readFileSync("seed/library.txt", "utf8");

describe("seed parser", () => {
  it("parses series numbers", () => {
    expect(parseSeries("Mistborn #2")).toEqual({ series: "Mistborn", seriesNumber: 2 });
    expect(parseSeries("Agatha Raisin")).toEqual({ series: "Agatha Raisin", seriesNumber: null });
    expect(parseSeries("")).toEqual({ series: null, seriesNumber: null });
  });

  it("has the expected layout and counts", () => {
    const rooms = parseSeed(text);
    expect(rooms.map((r) => r.name)).toEqual(["Pasillo", "Habitación 2", "Pasillo Sótano", "Salón Sótano"]);
    const shelf = (room: string, bc: string, name: string) =>
      rooms.find((r) => r.name === room)!.bookcases.find((b) => b.name === bc)!.shelves.find((s) => s.name === name)!;

    // Upstairs, as shelved (reorganization-plan-v2) plus books found in the export.
    expect(shelf("Pasillo", "Derecha", "1").books).toHaveLength(29);
    expect(shelf("Pasillo", "Derecha", "2").books).toHaveLength(49);
    expect(shelf("Pasillo", "Derecha", "2B").books).toHaveLength(0);
    expect(shelf("Pasillo", "Derecha", "3").books).toHaveLength(26);
    expect(shelf("Pasillo", "Izquierda", "4").books).toHaveLength(81); // 61 + 20 unknown
    expect(shelf("Pasillo", "Izquierda", "5").books).toHaveLength(51);
    expect(shelf("Pasillo", "Izquierda", "5B").books).toHaveLength(29);
    expect(shelf("Pasillo", "Izquierda", "6").books).toHaveLength(41);
    expect(shelf("Pasillo", "Izquierda", "7").books).toHaveLength(41);
    expect(shelf("Pasillo", "Izquierda", "8").books).toHaveLength(25);
    expect(shelf("Habitación 2", "Estantería", "1").books).toHaveLength(8);

    // Sótano (sotano-shelf-plan), Klassen included as missing.
    expect([1, 2, 3, 4, 5].map((i) => shelf("Pasillo Sótano", "Estantería", String(i)).books.length)).toEqual([
      18, 29, 15, 17, 17,
    ]);
    expect([1, 2, 3].map((i) => shelf("Salón Sótano", "Estantería", String(i)).books.length).reduce((a, b) => a + b)).toBe(117);

    // Layout: each Pasillo bookcase is 6 levels tall.
    for (const bc of rooms[0].bookcases) {
      const units = bc.shelves.filter((s) => !s.frontOf).reduce((a, s) => a + s.heightUnits, 0);
      expect(units).toBe(6);
    }
  });
});

describe("seed into Postgres", () => {
  it("imports everything once and refuses a second import", async () => {
    const db = await migrateDb("pglite:memory");
    const n = await seedDb(db, text);
    expect(n).toBe(593);

    const [{ c }] = await db.select({ c: count() }).from(t.books);
    expect(c).toBe(593);

    const missing = await db.select().from(t.books).where(eq(t.books.status, "missing"));
    expect(missing.map((b) => b.title)).toEqual(["El puente a Belle Island"]);

    const fronts = await db.select().from(t.shelves).where(isNotNull(t.shelves.frontOfShelfId));
    expect(fronts.map((s) => s.name).sort()).toEqual(["2B", "5B"]);

    // Books keep their left → right order.
    const [ps1] = await db.select().from(t.shelves).where(eq(t.shelves.name, "1")).limit(1);
    const firstBooks = await db
      .select({ title: t.books.title })
      .from(t.books)
      .where(eq(t.books.homeShelfId, ps1.id))
      .orderBy(asc(t.books.position))
      .limit(2);
    expect(firstBooks.map((b) => b.title)).toEqual(["El Imperio Final", "El Pozo de la Ascensión"]);

    await expect(seedDb(db, text)).rejects.toThrow(/already has data/);
  });
});
