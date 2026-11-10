/** Family members. Admins invite and deactivate; everyone can rename themselves. */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { ActionError, type Actor } from "./actions";
import type { AuthConfig } from "./auth";

const clean = (v: unknown, max = 60) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cleanEmail = (v: unknown) => {
  const e = clean(v, 200).toLowerCase();
  if (!e) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ActionError("invalid", "Bad email", "bad_email");
  return e;
};

export async function listUsers(db: Db) {
  return db
    .select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, active: t.users.active })
    .from(t.users)
    .orderBy(asc(t.users.active), asc(t.users.name));
}

async function assertUnique(db: Db, name: string, email: string | null, selfId?: number) {
  const notSelf = selfId ? ne(t.users.id, selfId) : undefined;
  const [byName] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(and(eq(t.users.active, 1), sql`lower(${t.users.name}) = lower(${name})`, notSelf));
  if (byName) throw new ActionError("conflict", "Name already exists", "name_taken");
  if (email) {
    const [byEmail] = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(sql`lower(${t.users.email}) = ${email}`, notSelf));
    if (byEmail) throw new ActionError("conflict", "Email already used", "email_taken");
  }
}

/** Accounts mode: admins invite by email. Passcode mode: anyone signed in can add a name. */
export async function createUser(db: Db, cfg: AuthConfig, actor: Actor, input: { name: unknown; email?: unknown }) {
  const name = clean(input.name);
  if (!name) throw new ActionError("invalid", "Missing name", "name_required");
  const email = cleanEmail(input.email);
  if (cfg.mode === "accounts") {
    if (actor.role !== "admin") throw new ActionError("invalid", "Only admins can invite", "admin_only");
    if (!email) throw new ActionError("invalid", "Email needed to sign in", "email_required");
  }
  await assertUnique(db, name, email);
  const [u] = await db.insert(t.users).values({ name, email }).returning({ id: t.users.id });
  await db.insert(t.events).values({ actorId: actor.userId, action: "user_create", entityType: "user", entityId: u.id, data: { name } });
  return u.id;
}

export async function updateUser(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: unknown; email?: unknown; role?: unknown; active?: unknown },
) {
  const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
  if (!u) throw new ActionError("not_found", "Not found");
  const isAdmin = actor.role === "admin";
  const self = actor.userId === id;
  if (!isAdmin && !(self && input.role === undefined && input.active === undefined && input.email === undefined))
    throw new ActionError("invalid", "Only admins can change this", "admin_only");

  const name = input.name !== undefined ? clean(input.name) : u.name;
  if (!name) throw new ActionError("invalid", "Missing name", "name_required");
  const email = input.email !== undefined ? cleanEmail(input.email) : u.email;
  const role = input.role === "admin" || input.role === "member" ? input.role : u.role;
  const active = input.active === undefined ? u.active : input.active ? 1 : 0;
  await assertUnique(db, name, email, id);

  // Never leave the family without an admin.
  if (u.role === "admin" && (role !== "admin" || active !== 1)) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.users)
      .where(and(eq(t.users.role, "admin"), eq(t.users.active, 1), ne(t.users.id, id)));
    if (n === 0) throw new ActionError("conflict", "Last admin", "last_admin");
  }
  await db.update(t.users).set({ name, email, role, active }).where(eq(t.users.id, id));
  if (active !== 1) await db.delete(t.sessions).where(eq(t.sessions.userId, id)); // sign them out everywhere
  await db.insert(t.events).values({ actorId: actor.userId, action: "user_update", entityType: "user", entityId: id, data: { name } });
}
