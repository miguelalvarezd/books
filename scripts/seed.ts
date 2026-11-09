/**
 * One-time import of seed/library.txt into an EMPTY database.
 * Refuses to run if any rooms or books already exist, so it can never overwrite real data.
 */
import { readFileSync } from "node:fs";
import { count, eq } from "drizzle-orm";
import type { Db } from "../src/db/client";
import * as t from "../src/db/schema";
import { parseSeed } from "../src/db/seed-parser";
import { migrateDb } from "./migrate";

export async function seedDb(db: Db, text: string) {
  const [{ n: existing }] = await db.select({ n: count() }).from(t.rooms);
  if (existing > 0) throw new Error("Database already has data — seed only runs on an empty database.");

  const rooms = parseSeed(text);
  const now = new Date();
  let total = 0;

  await db.transaction(async (tx) => {
    const themeIds = new Map<string, number>();
    const themeId = async (th: { es: string; en: string } | null) => {
      if (!th) return null;
      const known = themeIds.get(th.es);
      if (known) return known;
      const [row] = await tx.insert(t.themes).values({ nameEs: th.es, nameEn: th.en }).returning({ id: t.themes.id });
      themeIds.set(th.es, row.id);
      return row.id;
    };

    for (const [ri, r] of rooms.entries()) {
      const [room] = await tx.insert(t.rooms).values({ name: r.name, sort: ri }).returning({ id: t.rooms.id });
      for (const [bi, b] of r.bookcases.entries()) {
        const [bc] = await tx
          .insert(t.bookcases)
          .values({ roomId: room.id, name: b.name, sort: bi })
          .returning({ id: t.bookcases.id });
        const shelfIds = new Map<string, number>();
        for (const [si, s] of b.shelves.entries()) {
          const [sh] = await tx
            .insert(t.shelves)
            .values({ bookcaseId: bc.id, name: s.name, sort: si, kind: s.kind, heightUnits: s.heightUnits })
            .returning({ id: t.shelves.id });
          shelfIds.set(s.name, sh.id);
          const rows = [];
          for (const [pi, book] of s.books.entries()) {
            rows.push({
              title: book.title,
              author: book.author,
              language: book.language,
              series: book.series,
              seriesNumber: book.seriesNumber,
              themeId: await themeId(book.theme),
              homeShelfId: sh.id,
              position: (pi + 1) * 10,
              status: book.status,
              statusSince: book.status === "shelf" ? null : now,
            });
          }
          if (rows.length) await tx.insert(t.books).values(rows);
          total += rows.length;
        }
        for (const s of b.shelves)
          if (s.frontOf)
            await tx
              .update(t.shelves)
              .set({ frontOfShelfId: shelfIds.get(s.frontOf)! })
              .where(eq(t.shelves.id, shelfIds.get(s.name)!));
      }
    }
    await tx.insert(t.events).values({
      action: "import",
      entityType: "library",
      data: { source: "seed/library.txt", books: total },
    });
  });
  return total;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  (async () => {
    const db = await migrateDb();
    const n = await seedDb(db, readFileSync("seed/library.txt", "utf8"));
    console.log(`Imported ${n} books.`);
    process.exit(0);
  })().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
