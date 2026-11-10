import "server-only";
import { ActionError } from "./actions";

/** Run a handler; turn ActionErrors into 400/404/409 JSON responses. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return Response.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof ActionError) {
      const status = { not_found: 404, conflict: 409, invalid: 400 }[err.code];
      return Response.json({ error: err.code, message: err.message, reason: err.reason }, { status });
    }
    throw err;
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    if (v && typeof v === "object") return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new ActionError("invalid", "Bad JSON");
}

export const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === null ? null : undefined);
