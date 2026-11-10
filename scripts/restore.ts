import "./env";
/**
 * Restores a backup file into an EMPTY database (e.g. a new Neon project).
 *   DATABASE_URL=… npm run db:restore -- backups/2026-11-10.json
 * Runs all migrations first, so backups made by older versions of the app still load.
 */
import { readFileSync } from "node:fs";
import { restoreBackup } from "../src/lib/backup";
import { explain } from "./env";
import { migrateDb } from "./migrate";

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run db:restore -- <backup.json>");
  const backup = JSON.parse(readFileSync(file, "utf8"));
  await restoreBackup(await migrateDb(), backup);
  console.log("Restored:", backup.counts);
  process.exit(0);
})().catch((err) => {
  console.error(explain(err));
  process.exit(1);
});
