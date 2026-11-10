import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { handle } from "@/lib/http";
import { loadLibrary } from "@/lib/load";

export async function GET(req: Request) {
  await connection(); // always read live data, never prerender
  const res = await handle(async () => {
    await getActor(req);
    return loadLibrary(await getDb());
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
