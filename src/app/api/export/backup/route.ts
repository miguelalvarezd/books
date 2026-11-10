import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { AuthError } from "@/lib/auth";
import { exportBackup } from "@/lib/backup";

/** Full backup as a downloadable JSON file. Admins only (it contains email addresses). */
export async function GET(req: Request) {
  try {
    const actor = await getActor(req);
    if (actor.role !== "admin") throw new AuthError(403);
  } catch (err) {
    if (err instanceof AuthError) return Response.json({ error: "auth" }, { status: err.status });
    throw err;
  }
  const backup = await exportBackup(await getDb());
  const day = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblioteca-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
