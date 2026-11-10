import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import { takeBook, returnBook } from "@/lib/actions";
import { createBook, deleteBook } from "@/lib/admin";
import { booksCsv, exportBackup, loansCsv, restoreBackup, SCHEMA_VERSION, toCsv, type Backup } from "@/lib/backup";
import { passcodeSignIn, authConfig, sessionUser } from "@/lib/auth";
import { migrateDb } from "../scripts/migrate";
import { seedDb } from "../scripts/seed";

const seed = readFileSync("seed/library.txt", "utf8");
const strip = (b: Backup) => ({ ...b, exportedAt: "" });

async function busyLibrary() {
  const db = await migrateDb("pglite:memory");
  await seedDb(db, seed);
  const token = await passcodeSignIn(db, authConfig({ AUTH_MODE: "passcode", FAMILY_PASSCODE: "x", DATABASE_URL: "p" }), {
    code: "x",
    ip: "1",
    newName: "Miguel",
  });
  const me = (await sessionUser(db, token))!;
  const actor = { userId: me.id, role: me.role };
  const [sidi] = await db.select().from(t.books).where(eq(t.books.title, "Sidi"));
  const [salon] = await db.select().from(t.rooms).where(eq(t.rooms.name, "Salón Sótano"));
  await takeBook(db, actor, { bookId: sidi.id, kind: "reading", person: "Mamá", roomId: salon.id });
  await returnBook(db, actor, { bookId: sidi.id });
  await takeBook(db, actor, { bookId: sidi.id, kind: "lent", person: 'Lucía "la vecina"; 2º' });
  const id = await createBook(db, actor, { title: "Borrable", shelfId: sidi.homeShelfId! });
  await deleteBook(db, actor, id);
  return db;
}

describe("backup", () => {
  it("round-trips everything into an empty database, ids included", async () => {
    const a = await busyLibrary();
    const backup = JSON.parse(JSON.stringify(await exportBackup(a))) as Backup; // as if read from a file
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.counts).toMatchObject({ books: 594, loans: 2, users: 1 });
    expect(backup.tables).not.toHaveProperty("sessions");

    const b = await migrateDb("pglite:memory");
    await restoreBackup(b, backup);
    expect(strip(JSON.parse(JSON.stringify(await exportBackup(b))))).toEqual(strip(backup));

    // New rows continue after the restored ids.
    const [{ id }] = await b.insert(t.rooms).values({ name: "Nueva" }).returning({ id: t.rooms.id });
    expect(id).toBe(Math.max(...backup.tables.rooms.map((r) => r.id as number)) + 1);

    await expect(restoreBackup(b, backup)).rejects.toThrow(/not empty/);
  });

  it("loads a backup made before later migrations (missing columns get defaults)", async () => {
    const backup = JSON.parse(JSON.stringify(await exportBackup(await busyLibrary()))) as Backup;
    backup.schemaVersion = "0000_initial";
    for (const row of backup.tables.books) delete row.deletedAt;
    const db = await migrateDb("pglite:memory");
    await restoreBackup(db, backup);
    const [{ n }] = await db.select({ n: t.books.id }).from(t.books).limit(1);
    expect(n).toBeGreaterThan(0);
  });

  it("refuses files from a newer version or that aren't backups", async () => {
    const db = await migrateDb("pglite:memory");
    await expect(restoreBackup(db, { format: "x" } as unknown as Backup)).rejects.toThrow(/Not a Biblioteca/);
    const fake = { format: "biblioteca-backup", schemaVersion: "9999_future", tables: {} } as unknown as Backup;
    await expect(restoreBackup(db, fake)).rejects.toThrow(/newer version/);
  });
});

describe("csv", () => {
  it("quotes separators and quotes, and starts with a BOM", () => {
    expect(toCsv(["a", "b"], [['x;y', 'say "hi"']])).toBe('﻿a;b\r\n"x;y";"say ""hi"""\r\n');
  });
  it("exports books in shelf order and loans with names", async () => {
    const db = await busyLibrary();
    const books = (await booksCsv(db)).split("\r\n");
    expect(books[0]).toContain("title;author");
    expect(books).toHaveLength(593 + 2); // header + books + trailing empty
    expect(books[1]).toContain("Astérix el galo");
    const loans = (await loansCsv(db)).split("\r\n");
    expect(loans).toHaveLength(2 + 2);
    expect(loans[1]).toContain('"Lucía ""la vecina""; 2º"');
    expect(loans[1]).toContain("Miguel");
  });
});
