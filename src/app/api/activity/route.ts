import { getDb } from "@/db/client";
import { recentActivity } from "@/lib/actions";

export async function GET() {
  const rows = await recentActivity(await getDb(), 150);
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
