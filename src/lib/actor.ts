import "server-only";
import type { Actor } from "./actions";

/**
 * Who is making a change. Until sign-in arrives (stage 5) changes are anonymous;
 * stage 5 resolves the signed-in user (accounts) or the chosen family member (passcode).
 */
export async function getActor(req: Request): Promise<Actor> {
  void req;
  return { userId: null };
}
