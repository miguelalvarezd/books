/**
 * Full backup (JSON) and readable exports (CSV).
 *
 * A backup records the schema version it was made at. Restoring runs every migration
 * first, then loads the rows: because migrations only ever add columns (with defaults),
 * an old backup always fits a newer database.
 */
import { asc, getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import journal from "../../drizzle/meta/_journal.json";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { loadLibrary } from "./load";
import { buildIndex, placementOf } from "./library";

export const BACKUP_FORMAT = "biblioteca-backup";
/** Migrations applied by this version of the app, in order. */
export const MIGRATIONS = journal.entries.map((e) => e.tag);
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1];

/** Tables in a backup, parents before children. Sessions and login tokens are never exported. */
const TABLES = {
  users: t.users,
  rooms: t.rooms,
  bookcases: t.bookcases,
  shelves: t.shelves,
  themes: t.themes,
  books: t.books,
  loans: t.loans,
  events: t.events,
} as const;
type TableName = keyof typeof TABLES;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: string;
  exportedAt: string;
  counts: Record<string, number>;
  tables: Record<TableName, Record<string, unknown>[]>;
}

export async function exportBackup(db: Db): Promise<Backup> {
  const tables = {} as Backup["tables"];
  const counts: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLES) as [TableName, PgTable][]) {
    const idCol = getTableColumns(table).id;
    const rows = await db
      .select()
      .from(table)
      .orderBy(asc(idCol));
    tables[name] = rows as Record<string, unknown>[];
    counts[name] = rows.length;
  }
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts, tables };
}

export class RestoreError extends Error {}

/** Loads a backup into an EMPTY, fully migrated database. Ids are kept. */
export async function restoreBackup(db: Db, backup: Backup) {
  if (backup?.format !== BACKUP_FORMAT) throw new RestoreError("Not a Biblioteca backup file");
  if (!MIGRATIONS.includes(backup.schemaVersion))
    throw new RestoreError(`Backup is from a newer version (${backup.schemaVersion}); update the app first`);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.rooms);
  const [{ u }] = await db.select({ u: sql<number>`count(*)::int` }).from(t.users);
  if (n > 0 || u > 0) throw new RestoreError("Database is not empty — restore only into an empty database");

  await db.transaction(async (tx) => {
    for (const [name, table] of Object.entries(TABLES) as [TableName, PgTable][]) {
      const cols = getTableColumns(table);
      const rows = (backup.tables[name] ?? []).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          const col = cols[key as keyof typeof cols];
          if (!col) throw new RestoreError(`Unknown column ${name}.${key}`);
          out[key] = col.columnType === "PgTimestamp" && typeof value === "string" ? new Date(value) : value;
        }
        // Front rows point at another shelf: insert without the link, set it after.
        if (name === "shelves") out.frontOfShelfId = null;
        return out;
      });
      for (let i = 0; i < rows.length; i += 500)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(table).overridingSystemValue().values(rows.slice(i, i + 500) as any);
      if (name === "shelves")
        for (const s of backup.tables.shelves.filter((s) => s.frontOfShelfId))
          await tx
            .update(t.shelves)
            .set({ frontOfShelfId: s.frontOfShelfId as number })
            .where(sql`${t.shelves.id} = ${s.id as number}`);
      // Make new ids continue after the restored ones.
      const tableName = getTableName(table);
      await tx.execute(
        sql.raw(
          `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1, false)`,
        ),
      );
    }
  });
}

// ───────────────────────────── CSV ─────────────────────────────

/** Semicolon-separated with a BOM: opens directly in Excel (Spanish locale) and Google Sheets. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export async function booksCsv(db: Db) {
  const ix = buildIndex(await loadLibrary(db));
  const rows = [...ix.data.books]
    .map((b) => ({ b, p: placementOf(ix, b) }))
    .sort((x, y) => x.p.room.sort - y.p.room.sort || x.p.bookcase.sort - y.p.bookcase.sort || x.p.shelf.sort - y.p.shelf.sort || x.p.index - y.p.index)
    .map(({ b, p }) => {
      const th = b.themeId ? ix.theme.get(b.themeId) : undefined;
      return [
        b.id,
        b.title,
        b.author,
        b.language,
        th?.nameEs,
        th?.nameEn,
        b.series,
        b.seriesNumber,
        p.room.name,
        p.bookcase.name,
        p.shelf.name,
        p.index,
        b.status,
        b.holder,
        b.statusRoomId ? ix.room.get(b.statusRoomId)?.name : null,
        b.statusSince,
        b.notes,
      ];
    });
  return toCsv(
    ["id", "title", "author", "language", "theme_es", "theme_en", "series", "series_number", "room", "bookcase", "shelf", "position_from_left", "status", "holder", "reading_in_room", "status_since", "notes"],
    rows,
  );
}

export async function loansCsv(db: Db) {
  const rows = await db.execute<{
    id: number;
    book_id: number;
    title: string;
    kind: string;
    person: string;
    room: string | null;
    started_at: string;
    ended_at: string | null;
    started_by: string | null;
    ended_by: string | null;
  }>(sql`
    SELECT l.id, l.book_id, b.title, l.kind, l.person, r.name AS room,
           l.started_at, l.ended_at, su.name AS started_by, eu.name AS ended_by
    FROM loans l
    JOIN books b ON b.id = l.book_id
    LEFT JOIN rooms r ON r.id = l.room_id
    LEFT JOIN users su ON su.id = l.started_by
    LEFT JOIN users eu ON eu.id = l.ended_by
    ORDER BY l.started_at DESC, l.id DESC`);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Record<string, unknown>[];
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
  return toCsv(
    ["id", "book_id", "title", "kind", "person", "room", "started_at", "ended_at", "started_by", "ended_by"],
    list.map((r) => [
      r.id as number,
      r.book_id as number,
      r.title as string,
      r.kind as string,
      r.person as string,
      r.room as string | null,
      iso(r.started_at),
      iso(r.ended_at),
      r.started_by as string | null,
      r.ended_by as string | null,
    ]),
  );
}
