# Biblioteca

Family library tracker: where every book lives, who is reading it, and who borrowed it. Spanish and English, built for phones.

- **Find a book:** search by title, author, series or theme; the room diagram highlights its exact spot.
- **Take, lend, put back:** every move goes through a confirmation that shows where the book belongs.
- **Out & history:** who has what, and a log of every change with who made it.
- **Edit everything:** books, rooms, bookcases, shelves (incl. front rows) and themes.
- **Sign-in:** a family code, or invite-only Google / email accounts.
- **Backups:** CSV and full JSON exports, plus a weekly automatic backup.
- **QR codes:** one per bookcase, ready to print.

Stack: Next.js on Vercel · Neon Postgres · Drizzle migrations.

- Setup and deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Database and how it changes: [`docs/SCHEMA.md`](docs/SCHEMA.md)
- Initial catalog: [`seed/library.txt`](seed/library.txt)

```sh
npm install
DATABASE_URL=pglite:./.pglite npm run db:seed
DATABASE_URL=pglite:./.pglite AUTH_MODE=off npm run dev
npm test
```
