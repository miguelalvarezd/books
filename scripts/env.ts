/**
 * Loads .env.local and .env (if present) for the command-line scripts, the same files
 * Next.js reads. Variables already set in the shell win.
 */
import { existsSync, readFileSync } from "node:fs";

/** Minimal KEY=value parser (also used on Node versions without process.loadEnvFile). */
function loadEnv(file: string) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnv(file);

const url = process.env.DATABASE_URL?.trim();
if (url) {
  // Tolerate a pasted "psql '…'" command or surrounding quotes.
  process.env.DATABASE_URL = url.replace(/^psql\s+/, "").replace(/^['"]|['"]$/g, "");
}

/** Print an error with its underlying cause (drizzle wraps the real database error). */
export function explain(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  while (e) {
    const ev = e as { message?: unknown; error?: unknown; cause?: unknown };
    parts.push(typeof ev.message === "string" && ev.message ? ev.message : String(e));
    e = ev.cause ?? (ev.error && ev.error !== e ? ev.error : undefined);
  }
  const text = parts.join("\n  caused by: ");
  const hints: string[] = [];
  if (/password authentication failed/i.test(text)) hints.push("The password in DATABASE_URL is wrong — copy the connection string again.");
  if (/ENOTFOUND|getaddrinfo/i.test(text)) hints.push("The host in DATABASE_URL can't be found — check the connection string.");
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET/i.test(text)) hints.push("Couldn't open a connection to Neon — check your internet/VPN and the connection string.");
  if (/permission denied/i.test(text)) hints.push("This database role can't create tables — use the owner role from the Neon console.");
  return hints.length ? `${text}\n\nHint: ${hints.join(" ")}` : text;
}
