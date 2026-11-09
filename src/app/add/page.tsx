"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BookForm, emptyValues, send, toBody, useErrorText } from "@/components/BookForm";
import { useLibrary } from "@/components/LibraryProvider";
import { useI18n } from "@/lib/i18n";

const LAST_SHELF = "biblioteca.lastShelf";

function AddBook() {
  const { ix, reload } = useLibrary();
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const errorText = useErrorText();

  // Start on: ?shelf= → the shelf used last time on this phone → the first book shelf.
  let remembered: number | undefined;
  try {
    remembered = Number(localStorage.getItem(LAST_SHELF)) || undefined;
  } catch {
    /* storage unavailable */
  }
  const bookShelves = ix.data.shelves.filter((s) => s.kind === "books");
  const fromQuery = Number(params.get("shelf")) || undefined;
  const shelfId = [fromQuery, remembered].find((id) => id && ix.shelf.get(id)?.kind === "books") ?? bookShelves[0]?.id;

  return (
    <main className="page">
      <h1 className="title">{t("addBook")}</h1>
      <BookForm
        initial={{
          ...emptyValues(params.get("title") ?? ""),
          // Suggest the theme of the last book on the starting shelf.
          themeChoice: String(ix.booksOf.get(shelfId)?.at(-1)?.themeId ?? ""),
        }}
        place={{ shelfId, afterBookId: undefined }}
        submitLabel={t("addBook")}
        onSubmit={async (v, place) => {
          const r = await send<{ id: number; message?: string }>("/api/books", "POST", {
            ...toBody(v),
            shelfId: place!.shelfId,
            ...(place!.afterBookId !== undefined ? { afterBookId: place!.afterBookId } : {}),
          });
          if (!r.ok) return errorText(r);
          try {
            localStorage.setItem(LAST_SHELF, String(place!.shelfId));
          } catch {
            /* storage unavailable */
          }
          await reload();
          router.push(`/book/${r.data!.id}`);
          return null;
        }}
      />
    </main>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddBook />
    </Suspense>
  );
}
