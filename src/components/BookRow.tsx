"use client";
import Link from "next/link";
import { useFormat } from "./useFormat";
import type { Book } from "@/lib/types";

/** One book in a list: title, author, where it belongs, and a badge when it's not there. */
export function BookRow({ book, showPlace = true }: { book: Book; showPlace?: boolean }) {
  const fmt = useFormat();
  const p = fmt.placement(book);
  return (
    <li>
      <Link href={`/book/${book.id}`} className="row">
        <span className="row-title">{book.title}</span>
        {(book.author || fmt.seriesText(book)) && (
          <span className="row-sub">{[book.author, fmt.seriesText(book)].filter(Boolean).join(" · ")}</span>
        )}
        {showPlace && <span className="row-place">{fmt.placeText(p)}</span>}
        {book.status !== "shelf" && <span className={`badge badge-${book.status}`}>{fmt.statusText(book)}</span>}
      </Link>
    </li>
  );
}
