import { getActor } from "@/lib/actor";
import { AuthError } from "@/lib/auth";
import { identifyFromPhoto } from "@/lib/identify";

/** Body: { image: "<base64 JPEG>" } (resized on the phone to ≤ 1280 px). */
export async function POST(req: Request) {
  try {
    await getActor(req);
  } catch (err) {
    if (err instanceof AuthError) return Response.json({ error: "auth" }, { status: err.status });
    throw err;
  }
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "not_configured" }, { status: 501 });
  let image = "";
  try {
    image = String((await req.json()).image ?? "");
  } catch {
    /* handled below */
  }
  image = image.replace(/^data:image\/\w+;base64,/, "");
  if (!image || image.length > 4_000_000) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    return Response.json(await identifyFromPhoto(image));
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
