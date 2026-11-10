"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BookForm, send, toBody, useErrorText, valuesFromBook } from "@/components/BookForm";
import { useLibrary } from "@/components/LibraryProvider";
import { Modal } from "@/components/Modal";
import { useI18n } from "@/lib/i18n";

export default function EditBookPage() {
  const { id } = useParams<{ id: string }>();
  const { ix, reload } = useLibrary();
  const { t } = useI18n();
  const router = useRouter();
  const errorText = useErrorText();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const book = ix.book.get(Number(id));
  if (!book)
    return (
      <main className="page">
        <p>{t("notFound")}</p>
      </main>
    );

  return (
    <main className="page">
      <h1 className="title">{t("editBook")}</h1>
      <BookForm
        key={book.id}
        initial={valuesFromBook(book)}
        bookId={book.id}
        submitLabel={t("save")}
        onSubmit={async (v) => {
          const r = await send(`/api/books/${book.id}`, "PATCH", toBody(v));
          if (!r.ok) return errorText(r);
          await reload();
          router.push(`/book/${book.id}`);
          return null;
        }}
      />
      <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
        {t("deleteBook")}
      </button>
      {confirmDelete && (
        <Modal title={t("deleteBook")} onClose={() => setConfirmDelete(false)}>
          <p>{t("deleteBookText", { t: book.title })}</p>
          {deleteError && (
            <p className="error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="modal-buttons">
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await send(`/api/books/${book.id}`, "DELETE");
                setBusy(false);
                if (!r.ok) return setDeleteError(errorText(r));
                router.push("/");
                await reload();
              }}
            >
              {busy ? t("saving") : t("deleteConfirm")}
            </button>
            <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
              {t("cancel")}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
