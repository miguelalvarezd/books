import { connection } from "next/server";
import { getDb } from "@/db/client";
import { loadLibrary } from "@/lib/load";

export async function GET() {
  await connection(); // always read live data, never prerender
  const data = await loadLibrary(await getDb());
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
