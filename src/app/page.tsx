"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BookRow } from "@/components/BookRow";
import { Diagram } from "@/components/Diagram";
import { useLibrary } from "@/components/LibraryProvider";
import { useFormat } from "@/components/useFormat";
import { useI18n } from "@/lib/i18n";
import { searchBooks } from "@/lib/library";

export default function SearchPage() {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const [q, setQ] = useState("");
  const results = useMemo(() => searchBooks(ix, q), [ix, q]);
  const top = results[0];

  return (
    <main className="page">
      <label htmlFor="q" className="visually-hidden">
        {t("search")}
      </label>
      <input
        id="q"
        type="search"
        className="search"
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
        autoFocus
      />

      {!q.trim() && <p className="muted">{t("searchHint", { n: ix.data.books.length })}</p>}

      {q.trim() && (
        <>
          <p className="muted" aria-live="polite">
            {results.length === 0
              ? t("noResults", { q: q.trim() })
              : results.length === 1
                ? t("oneResult")
                : t("results", { n: results.length })}
          </p>
          {results.length === 0 && (
            <Link href={`/add?title=${encodeURIComponent(q.trim())}`} className="btn btn-block btn-link">
              + {t("addThis", { q: q.trim() })}
            </Link>
          )}
          {top && (
            <section aria-label={top.title}>
              <p className="where">
                <strong>{top.title}</strong> — {fmt.placeText(fmt.placement(top))}
              </p>
              <Diagram roomId={fmt.placement(top).room.id} highlightId={top.id} />
            </section>
          )}
          <ul className="list">
            {results.map((b) => (
              <BookRow key={b.id} book={b} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
