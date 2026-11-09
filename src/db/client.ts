/**
 * Database connection.
 *
 * - Production / Vercel: DATABASE_URL is a Neon connection string.
 *   We use the Neon serverless Pool (WebSocket), which supports transactions.
 * - Local development & tests: DATABASE_URL=pglite:./.pglite (a folder) or
 *   pglite:memory runs a real Postgres in-process with no server to install.
 */
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

let cached: Db | undefined;

export async function createDb(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const target = url.slice("pglite:".length);
    const client = target === "memory" ? new PGlite() : new PGlite(target);
    // Both drivers expose the same query builder; the cast keeps one Db type.
    return drizzle(client, { schema }) as unknown as Db;
  }
  return drizzleNeon(new Pool({ connectionString: url }), { schema });
}

export async function getDb(): Promise<Db> {
  cached ??= await createDb();
  return cached;
}
