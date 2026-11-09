"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Diagram } from "@/components/Diagram";
import { useLibrary } from "@/components/LibraryProvider";
import { useFormat } from "@/components/useFormat";
import { useI18n, type MessageKey } from "@/lib/i18n";

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const book = ix.book.get(Number(id));

  if (!book)
    return (
      <main className="page">
        <p>{t("notFound")}</p>
      </main>
    );

  const p = fmt.placement(book);
  const neighbours =
    p.left && p.right ? (
      <>
        {t("between")} <Link href={`/book/${p.left.id}`}>{p.left.title}</Link> {t("and")}{" "}
        <Link href={`/book/${p.right.id}`}>{p.right.title}</Link>
      </>
    ) : p.right ? (
      <>
        {t("firstOnShelf")} <Link href={`/book/${p.right.id}`}>{p.right.title}</Link>
      </>
    ) : p.left ? (
      <>
        {t("lastOnShelf")} <Link href={`/book/${p.left.id}`}>{p.left.title}</Link>
      </>
    ) : (
      t("onlyOnShelf")
    );

  const theme = fmt.themeName(book.themeId);
  const series = fmt.seriesText(book);

  return (
    <main className="page">
      <h1 className="title">{book.title}</h1>
      {book.author && <p className="author">{book.author}</p>}

      <section className={`status status-${book.status}`} aria-label={t("status")}>
        <span className="status-label">{t("status")}</span>
        <span className="status-value">
          {fmt.statusText(book)}
          {book.status !== "shelf" && book.statusSince && ` · ${t("since", { date: fmt.date(book.statusSince) })}`}
        </span>
      </section>

      <section aria-label={t("belongsOn")}>
        <h2 className="h2">{t("belongsOn")}</h2>
        <p className="where">
          <Link href={`/shelf/${p.shelf.id}`}>{fmt.placeText(p)}</Link>
          <br />
          <span className="muted">{t("position", { i: p.index, n: p.count })}</span>
          <br />
          <span className="muted">{neighbours}</span>
        </p>
        <Diagram roomId={p.room.id} highlightId={book.id} />
      </section>

      <dl className="facts">
        {series && (
          <>
            <dt>{t("series")}</dt>
            <dd>{series}</dd>
          </>
        )}
        {theme && (
          <>
            <dt>{t("theme")}</dt>
            <dd>{theme}</dd>
          </>
        )}
        <dt>{t("language")}</dt>
        <dd>{t(`lang_${book.language}` as MessageKey)}</dd>
        {book.notes && (
          <>
            <dt>{t("notes")}</dt>
            <dd>{book.notes}</dd>
          </>
        )}
      </dl>
    </main>
  );
}
