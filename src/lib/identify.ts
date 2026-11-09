import "server-only";

export interface Identified {
  title: string | null;
  author: string | null;
  language: string | null;
  series: string | null;
  seriesNumber: number | null;
}

const PROMPT = `This is a photo of a book cover or spine. Read what is printed on it and reply with ONLY a JSON object:
{"title": string|null, "author": string|null, "language": "es"|"en"|"fr"|"de"|"other"|null, "series": string|null, "seriesNumber": number|null}
- title: as printed, in its original language (no subtitle unless it's part of the title).
- author: full name(s) as printed; join several with " & ".
- language: the language the book is written in.
- series / seriesNumber: only if printed on the book.
Use null for anything you can't read. No other text.`;

/** Reads title/author from a photo with Claude. Only used when ANTHROPIC_API_KEY is set. */
export async function identifyFromPhoto(base64Jpeg: string): Promise<Identified> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Photo identification is not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return parseIdentified(text);
}

export function parseIdentified(text: string): Identified {
  const m = text.match(/\{[\s\S]*\}/);
  let o: Record<string, unknown> = {};
  try {
    o = m ? JSON.parse(m[0]) : {};
  } catch {
    /* unreadable answer: everything null */
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const lang = str(o.language);
  return {
    title: str(o.title),
    author: str(o.author),
    language: lang && ["es", "en", "fr", "de", "other"].includes(lang) ? lang : null,
    series: str(o.series),
    seriesNumber: typeof o.seriesNumber === "number" && Number.isFinite(o.seriesNumber) ? o.seriesNumber : null,
  };
}
