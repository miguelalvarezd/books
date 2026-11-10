import "server-only";
import type { BookFields } from "./admin";
import { int, num } from "./http";

/** Book fields from a JSON body; validation of values happens in admin.ts. */
export function bookFields(b: Record<string, unknown>): BookFields {
  const th = b.theme as Record<string, unknown> | null | undefined;
  return {
    title: String(b.title ?? ""),
    author: typeof b.author === "string" ? b.author : null,
    language: typeof b.language === "string" ? b.language : "es",
    theme: !th
      ? null
      : int(th.id)
        ? { id: int(th.id)! }
        : { nameEs: String(th.nameEs ?? ""), nameEn: String(th.nameEn ?? "") },
    series: typeof b.series === "string" ? b.series : null,
    seriesNumber: num(b.seriesNumber) ?? null,
    notes: typeof b.notes === "string" ? b.notes : null,
  };
}
