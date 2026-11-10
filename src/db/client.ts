/**
 * Database connection.
 *
 * - Production / Vercel and the command-line scripts: DATABASE_URL is a Neon connection
 *   string (use the pooled one, host contains "-pooler"). We connect with node-postgres
 *   over plain TCP + TLS: works on any Node version and network, and supports transactions.
 * - Local development & tests: DATABASE_URL=pglite:./.pglite (a folder) or
 *   pglite:memory runs a real Postgres in-process with no server to install.
 */
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

let cached: Db | undefined;

export async function createDb(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error("DATABASE_URL is not set (put it in .env.local in the repo folder, or Vercel → Environment Variables)");
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const target = url.slice("pglite:".length);
    const client = target === "memory" ? new PGlite() : new PGlite(target);
    // Both drivers expose the same query builder; the cast keeps one Db type.
    return drizzle(client, { schema }) as unknown as Db;
  }
  if (!/^postgres(ql)?:\/\//.test(url))
    throw new Error("DATABASE_URL must start with postgresql:// (copy the connection string from Neon)");
  const pool = new Pool({
    // Neon strings say sslmode=require; node-postgres already treats that as verify-full,
    // so spell it out to keep its deprecation warning quiet.
    connectionString: url.replace(/([?&])sslmode=require\b/, "$1sslmode=verify-full"),
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  return drizzlePg(pool, { schema });
}

export async function getDb(): Promise<Db> {
  cached ??= await createDb();
  return cached;
}
