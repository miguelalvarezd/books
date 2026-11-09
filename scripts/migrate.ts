/**
 * Applies every pending migration in ./drizzle to DATABASE_URL.
 * Safe to run repeatedly: applied migrations are recorded in drizzle.__drizzle_migrations.
 * Runs automatically on each Vercel deploy (see package.json "vercel-build").
 */
import { createDb } from "../src/db/client";

export async function migrateDb(url = process.env.DATABASE_URL) {
  const db = await createDb(url);
  if (url?.startsWith("pglite:")) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: "./drizzle" });
  } else {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
  }
  return db;
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrateDb()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
