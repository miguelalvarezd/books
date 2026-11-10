import { getDb } from "@/db/client";
import { getActor } from "@/lib/actor";
import { authConfig } from "@/lib/auth";
import { handle, readJson } from "@/lib/http";
import { createUser, listUsers } from "@/lib/users";

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await getActor(req);
    const users = await listUsers(await getDb());
    // Only admins see email addresses.
    return actor.role === "admin" ? users : users.map((u) => ({ ...u, email: null }));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await getActor(req);
    const body = await readJson(req);
    return { id: await createUser(await getDb(), authConfig(), actor, { name: body.name, email: body.email }) };
  });
}
