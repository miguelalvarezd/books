"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BookRow } from "@/components/BookRow";
import { useLibrary } from "@/components/LibraryProvider";
import { useFormat } from "@/components/useFormat";
import { useI18n } from "@/lib/i18n";

export default function ShelfPage() {
  const { id } = useParams<{ id: string }>();
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const shelf = ix.shelf.get(Number(id));
  if (!shelf)
    return (
      <main className="page">
        <p>{t("notFound")}</p>
      </main>
    );
  const room = ix.room.get(ix.bookcase.get(shelf.bookcaseId)!.roomId)!;
  const books = ix.booksOf.get(shelf.id) ?? [];

  // Group consecutive books with the same theme under one heading.
  const groups: { themeId: number | null; books: typeof books }[] = [];
  for (const b of books) {
    const last = groups[groups.length - 1];
    if (last && last.themeId === b.themeId) last.books.push(b);
    else groups.push({ themeId: b.themeId, books: [b] });
  }

  return (
    <main className="page">
      <p className="crumbs">
        <Link href="/browse">{t("rooms")}</Link> › <Link href={`/room/${room.id}`}>{room.name}</Link>
      </p>
      <h1 className="title">{fmt.shelfPath(shelf)}</h1>
      <p className="muted">{books.length === 0 ? t("empty") : t("booksCount", { n: books.length })}</p>
      {groups.map((g, i) => (
        <section key={i}>
          {g.themeId && <h2 className="h2">{fmt.themeName(g.themeId)}</h2>}
          <ol className="list">
            {g.books.map((b) => (
              <BookRow key={b.id} book={b} showPlace={false} />
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
