import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import {
  authConfig,
  checkPasscode,
  createEmailLink,
  createSession,
  deleteSession,
  googleEmail,
  passcodeSignIn,
  redeemEmailLink,
  sessionUser,
  userForEmail,
} from "@/lib/auth";
import { createUser, updateUser } from "@/lib/users";
import { migrateDb } from "../scripts/migrate";

let db: Db;
beforeEach(async () => {
  db = await migrateDb("pglite:memory");
});

const passcodeCfg = authConfig({ AUTH_MODE: "passcode", FAMILY_PASSCODE: "Quijote 1605", DATABASE_URL: "postgres://x" });
const accountsCfg = authConfig({
  AUTH_MODE: "accounts",
  ADMIN_EMAIL: "Miguel@Example.com",
  RESEND_API_KEY: "k",
  EMAIL_FROM: "Biblioteca <b@example.com>",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "sec",
  DATABASE_URL: "postgres://x",
});

describe("config", () => {
  it("never allows AUTH_MODE=off outside a local database", () => {
    expect(authConfig({ AUTH_MODE: "off", DATABASE_URL: "postgresql://neon" }).mode).toBe("passcode");
    expect(authConfig({ AUTH_MODE: "off", DATABASE_URL: "pglite:memory" }).mode).toBe("off");
  });
});

describe("passcode mode", () => {
  it("first person becomes admin, the next a member; sessions work and end", async () => {
    const t1 = await passcodeSignIn(db, passcodeCfg, { code: " quijote 1605", ip: "1", newName: "Miguel" });
    const t2 = await passcodeSignIn(db, passcodeCfg, { code: "Quijote 1605", ip: "1", newName: "Mamá" });
    expect((await sessionUser(db, t1))?.role).toBe("admin");
    expect((await sessionUser(db, t2))).toMatchObject({ name: "Mamá", role: "member" });
    await expect(passcodeSignIn(db, passcodeCfg, { code: "Quijote 1605", ip: "1", newName: "mamá" })).rejects.toMatchObject({
      reason: "name_taken",
    });
    await deleteSession(db, t2);
    expect(await sessionUser(db, t2)).toBeNull();
    expect(await sessionUser(db, "made-up")).toBeNull();
  });

  it("locks an IP after repeated wrong codes", async () => {
    for (let i = 0; i < 8; i++)
      await expect(checkPasscode(db, passcodeCfg, "wrong", "9.9.9.9")).rejects.toMatchObject({ reason: "wrong_code" });
    await expect(checkPasscode(db, passcodeCfg, "Quijote 1605", "9.9.9.9")).rejects.toMatchObject({ reason: "too_many" });
    await expect(checkPasscode(db, passcodeCfg, "Quijote 1605", "8.8.8.8")).resolves.toBeUndefined();
  });

  it("deactivating someone signs them out everywhere", async () => {
    const tAdmin = await passcodeSignIn(db, passcodeCfg, { code: "Quijote 1605", ip: "1", newName: "Miguel" });
    const tNacho = await passcodeSignIn(db, passcodeCfg, { code: "Quijote 1605", ip: "1", newName: "Nacho" });
    const admin = (await sessionUser(db, tAdmin))!;
    const nacho = (await sessionUser(db, tNacho))!;
    await expect(updateUser(db, { userId: nacho.id, role: "member" }, admin.id, { active: false })).rejects.toMatchObject({
      reason: "admin_only",
    });
    await expect(updateUser(db, { userId: admin.id, role: "admin" }, admin.id, { role: "member" })).rejects.toMatchObject({
      reason: "last_admin",
    });
    await updateUser(db, { userId: admin.id, role: "admin" }, nacho.id, { active: false });
    expect(await sessionUser(db, tNacho)).toBeNull();
    // Anyone can rename themselves.
    await updateUser(db, { userId: admin.id, role: "admin" }, admin.id, { name: "Miguel Á." });
    expect((await sessionUser(db, tAdmin))?.name).toBe("Miguel Á.");
  });
});

describe("accounts mode", () => {
  it("lets ADMIN_EMAIL in first, then only invited emails", async () => {
    expect(await userForEmail(db, accountsCfg, "stranger@example.com")).toBeNull();
    const admin = await userForEmail(db, accountsCfg, "miguel@example.com");
    expect(admin).toMatchObject({ role: "admin", email: "miguel@example.com" });
    await expect(createUser(db, accountsCfg, { userId: admin!.id, role: "member" }, { name: "Marta", email: "m@x.es" })).rejects.toMatchObject({
      reason: "admin_only",
    });
    await expect(createUser(db, accountsCfg, { userId: admin!.id, role: "admin" }, { name: "Marta" })).rejects.toMatchObject({
      reason: "email_required",
    });
    await createUser(db, accountsCfg, { userId: admin!.id, role: "admin" }, { name: "Marta", email: "Marta@X.es" });
    expect(await userForEmail(db, accountsCfg, "marta@x.es")).toMatchObject({ name: "Marta", role: "member" });
  });

  it("email links work once and only for invited people", async () => {
    expect(await createEmailLink(db, accountsCfg, "nobody@example.com")).toBeNull();
    const link = await createEmailLink(db, accountsCfg, "miguel@example.com");
    const session = await redeemEmailLink(db, link!.token);
    expect((await sessionUser(db, session))?.email).toBe("miguel@example.com");
    expect(await redeemEmailLink(db, link!.token)).toBeNull();
  });

  it("limits email requests per address", async () => {
    for (let i = 0; i < 5; i++) await createEmailLink(db, accountsCfg, "spam@example.com");
    await expect(createEmailLink(db, accountsCfg, "spam@example.com")).rejects.toMatchObject({ reason: "too_many" });
  });

  it("reads a verified email from Google and rejects anything else", async () => {
    const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
    const fake = (claims: object) => (async () => new Response(JSON.stringify({ id_token: idToken(claims) }))) as typeof fetch;
    const good = { aud: "cid", iss: "https://accounts.google.com", email: "Miguel@Example.com", email_verified: true };
    expect(await googleEmail(accountsCfg, "c", "r", fake(good))).toBe("miguel@example.com");
    expect(await googleEmail(accountsCfg, "c", "r", fake({ ...good, aud: "other" }))).toBeNull();
    expect(await googleEmail(accountsCfg, "c", "r", fake({ ...good, email_verified: false }))).toBeNull();
  });

  it("expired sessions don't count", async () => {
    const u = await userForEmail(db, accountsCfg, "miguel@example.com");
    const token = await createSession(db, u!.id, "google");
    await db.update(t.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(t.sessions.userId, u!.id));
    expect(await sessionUser(db, token)).toBeNull();
  });
});
