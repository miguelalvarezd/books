import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { handle, readJson } from "@/lib/http";
import { updateUser } from "@/lib/users";

export async function PATCH(req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const actor = await getActor(req);
    const b = await readJson(req);
    await updateUser(await getDb(), actor, Number(id), { name: b.name, email: b.email, role: b.role, active: b.active });
  });
}
