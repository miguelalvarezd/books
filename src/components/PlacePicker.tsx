"use client";
import { useLibrary } from "./LibraryProvider";
import { useFormat } from "./useFormat";
import { useI18n } from "@/lib/i18n";

export interface Place {
  shelfId: number;
  /** null = first on the shelf, undefined = last. */
  afterBookId: number | null | undefined;
}

/** Choose a shelf (grouped by room) and where on it, with plain native selects. */
export function PlacePicker({ bookId, value, onChange }: { bookId: number; value: Place; onChange: (p: Place) => void }) {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const row = (ix.booksOf.get(value.shelfId) ?? []).filter((b) => b.id !== bookId);
  const posValue = value.afterBookId === undefined ? "end" : value.afterBookId === null ? "start" : String(value.afterBookId);

  return (
    <div className="fields">
      <label className="field">
        <span>{t("pickShelf")}</span>
        <select
          value={value.shelfId}
          onChange={(e) => onChange({ shelfId: Number(e.target.value), afterBookId: undefined })}
        >
          {ix.rooms.map((r) => (
            <optgroup key={r.id} label={r.name}>
              {(ix.bookcasesOf.get(r.id) ?? []).flatMap((bc) =>
                (ix.shelvesOf.get(bc.id) ?? [])
                  .filter((s) => s.kind === "books")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {fmt.shelfPath(s)}
                    </option>
                  )),
              )}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t("pickPosition")}</span>
        <select
          value={posValue}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...value, afterBookId: v === "end" ? undefined : v === "start" ? null : Number(v) });
          }}
        >
          <option value="end">{t("atEnd")}</option>
          <option value="start">{t("atStart")}</option>
          {row.map((b) => (
            <option key={b.id} value={b.id}>
              {t("afterBook", { t: b.title })}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Readable "after X" description of a chosen place. */
export function usePlaceText() {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  return (p: Place) => {
    const shelf = ix.shelf.get(p.shelfId)!;
    const where =
      p.afterBookId === undefined
        ? t("atEnd")
        : p.afterBookId === null
          ? t("atStart")
          : t("afterBook", { t: ix.book.get(p.afterBookId)?.title ?? "?" });
    return `${fmt.shelfPath(shelf)} — ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
  };
}
