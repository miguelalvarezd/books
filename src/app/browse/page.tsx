"use client";
import Link from "next/link";
import { useLibrary } from "@/components/LibraryProvider";
import { useI18n } from "@/lib/i18n";
import { countBooksInRoom } from "@/lib/library";

export default function BrowsePage() {
  const { ix } = useLibrary();
  const { t } = useI18n();
  return (
    <main className="page">
      <h1 className="title">{t("rooms")}</h1>
      <ul className="list">
        {ix.rooms.map((r) => (
          <li key={r.id}>
            <Link href={`/room/${r.id}`} className="row">
              <span className="row-title">{r.name}</span>
              <span className="row-sub">{t("booksCount", { n: countBooksInRoom(ix, r.id) })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
