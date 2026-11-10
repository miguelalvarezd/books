import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { updateTheme } from "@/lib/admin";
import { handle, readJson } from "@/lib/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/themes/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const b = await readJson(req);
    return updateTheme(await getDb(), await getActor(req), {
      id: Number(id),
      nameEs: String(b.nameEs ?? ""),
      nameEn: String(b.nameEn ?? ""),
    });
  });
}
