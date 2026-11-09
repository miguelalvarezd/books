# Database schema and how it changes

The schema lives in [`src/db/schema.ts`](../src/db/schema.ts). Every change goes through a numbered migration in [`drizzle/`](../drizzle), committed to git.

## Tables

| Table | What it holds |
|---|---|
| `rooms` | Pasillo, Habitación 2, Pasillo Sótano, Salón Sótano… |
| `bookcases` | Furniture inside a room, ordered left → right |
| `shelves` | Levels of a bookcase, ordered top → bottom. `height_units` (the toys level is 2), `kind` (books / toys / notes / albums / other), `front_of_shelf_id` for front rows like 2B and 5B |
| `themes` | The groups the library is organized by, in Spanish and English |
| `books` | Title, author, language, theme, series and number, **home shelf + position** (where it belongs), and **current state**: `shelf`, `reading` (who and in which room), `lent` (who), `missing` |
| `loans` | Every time a book leaves its shelf, reading at home or lent out. Rows are never deleted |
| `users` | Family members (used by both sign-in modes) |
| `events` | Audit log: who did what, with before/after data |

## Changing the schema

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description`. This writes `drizzle/000N_short_description.sql`.
3. Commit both files. On the next Vercel deploy, `vercel-build` applies the new migration before building.

Rules that keep old data and old backups valid:

- **Only add.** New columns are nullable or have a default. New tables are fine.
- **Never rename or drop a column in place.** Add the new one, copy the data in the same migration, and leave the old one unused.
- **Lists of values are plain text columns,** not Postgres enums, so adding a value (a new shelf kind, say) needs no data migration.

## Local database

`DATABASE_URL=pglite:./.pglite` runs a real Postgres inside Node, stored in the `.pglite` folder. Nothing to install. `pglite:memory` keeps it in memory (used by the tests).
