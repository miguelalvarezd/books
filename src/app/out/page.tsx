"use client";
import { BookRow } from "@/components/BookRow";
import { useLibrary } from "@/components/LibraryProvider";
import { useI18n } from "@/lib/i18n";
import type { Book } from "@/lib/types";

/** Every book that isn't on its shelf, grouped by who has it; "not found" last. */
export default function OutPage() {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const out = ix.data.books.filter((b) => b.status !== "shelf");
  const groups = new Map<string, Book[]>();
  for (const b of out) {
    const key = b.status === "missing" ? "" : (b.holder ?? "?");
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "es")));

  return (
    <main className="page">
      <h1 className="title">{t("outTitle")}</h1>
      {out.length === 0 && <p className="muted">{t("nothingOut")}</p>}
      {keys.map((k) => (
        <section key={k || "missing"}>
          <h2 className="h2">
            {k || t("missingGroup")} ({groups.get(k)!.length})
          </h2>
          <ul className="list">
            {groups
              .get(k)!
              .sort((a, b) => (a.statusSince ?? "").localeCompare(b.statusSince ?? ""))
              .map((b) => (
                <BookRow key={b.id} book={b} />
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
