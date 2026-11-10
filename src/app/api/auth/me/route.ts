import { connection } from "next/server";
import { currentUser } from "@/lib/actor";
import { authConfig } from "@/lib/auth";

/** Who am I, and which sign-in methods does the login screen offer. */
export async function GET(req: Request) {
  await connection();
  const cfg = authConfig();
  const user = await currentUser(req);
  return Response.json(
    {
      mode: cfg.mode,
      user,
      methods: {
        passcode: cfg.mode === "passcode" && !!cfg.passcode,
        google: cfg.mode === "accounts" && !!cfg.google,
        email: cfg.mode === "accounts" && !!cfg.email,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
