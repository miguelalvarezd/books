import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { AuthError } from "@/lib/auth";
import { booksCsv } from "@/lib/backup";

export async function GET(req: Request) {
  try {
    await getActor(req);
  } catch (err) {
    if (err instanceof AuthError) return Response.json({ error: "auth" }, { status: err.status });
    throw err;
  }
  const csv = await booksCsv(await getDb());
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblioteca-books-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
