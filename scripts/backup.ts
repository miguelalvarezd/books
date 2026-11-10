/**
 * Writes a full backup of DATABASE_URL to a JSON file.
 *   npm run db:backup -- backups/2026-11-10.json
 * Used by the weekly GitHub Action (.github/workflows/backup.yml).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createDb } from "../src/db/client";
import { exportBackup } from "../src/lib/backup";

(async () => {
  const out = process.argv[2] ?? `backups/${new Date().toISOString().slice(0, 10)}.json`;
  const backup = await exportBackup(await createDb());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(backup, null, 1));
  console.log(`Backup written to ${out}:`, backup.counts);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
