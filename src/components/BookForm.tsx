"use client";
import { useMemo, useState } from "react";
import { useLibrary } from "./LibraryProvider";
import { PlacePicker, usePlaceText, type Place } from "./PlacePicker";
import { useFormat } from "./useFormat";
import { photoToBase64, send } from "@/lib/api";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { normalize } from "@/lib/library";
import type { Book } from "@/lib/types";

const LANGS = ["es", "en", "fr", "de", "other"] as const;

export interface BookFormValues {
  title: string;
  author: string;
  language: string;
  themeChoice: string; // "" none, "new", or theme id
  newThemeEs: string;
  newThemeEn: string;
  series: string;
  seriesNumber: string;
  notes: string;
}

export const emptyValues = (title = ""): BookFormValues => ({
  title,
  author: "",
  language: "es",
  themeChoice: "",
  newThemeEs: "",
  newThemeEn: "",
  series: "",
  seriesNumber: "",
  notes: "",
});

export const valuesFromBook = (b: Book): BookFormValues => ({
  title: b.title,
  author: b.author ?? "",
  language: b.language,
  themeChoice: b.themeId ? String(b.themeId) : "",
  newThemeEs: "",
  newThemeEn: "",
  series: b.series ?? "",
  seriesNumber: b.seriesNumber != null ? String(b.seriesNumber) : "",
  notes: b.notes ?? "",
});

/** JSON body for POST /api/books and PATCH /api/books/[id]. */
export function toBody(v: BookFormValues) {
  const n = v.seriesNumber.trim() === "" ? null : Number(v.seriesNumber.replace(",", "."));
  return {
    title: v.title,
    author: v.author,
    language: v.language,
    theme:
      v.themeChoice === "new"
        ? { nameEs: v.newThemeEs, nameEn: v.newThemeEn }
        : v.themeChoice
          ? { id: Number(v.themeChoice) }
          : null,
    series: v.series,
    seriesNumber: Number.isFinite(n) ? n : null,
    notes: v.notes,
  };
}

interface Props {
  initial: BookFormValues;
  /** Present when adding: where the new book goes. */
  place?: Place;
  bookId?: number;
  submitLabel: string;
  onSubmit: (values: BookFormValues, place?: Place) => Promise<string | null>;
}

/** Shared add/edit form. Native inputs, big targets, errors announced. */
export function BookForm({ initial, place: initialPlace, bookId, submitLabel, onSubmit }: Props) {
  const { ix } = useLibrary();
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const placeText = usePlaceText();
  const [v, setV] = useState(initial);
  const [place, setPlace] = useState(initialPlace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [photoState, setPhotoState] = useState<"idle" | "reading" | "failed">("idle");
  const set = (k: keyof BookFormValues) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  const themes = useMemo(
    () =>
      [...ix.data.themes].sort((a, b) =>
        (locale === "es" ? a.nameEs : a.nameEn).localeCompare(locale === "es" ? b.nameEs : b.nameEn, locale),
      ),
    [ix, locale],
  );

  // Warn about an existing book with the same title (when adding or retitling).
  const similar = useMemo(() => {
    const n = normalize(v.title);
    if (n.length < 3) return [];
    return ix.data.books.filter((b) => b.id !== bookId && ix.searchText.get(b.id)!.title === n).slice(0, 3);
  }, [ix, v.title, bookId]);

  const titleMissing = tried && !v.title.trim();
  const themeMissing = tried && v.themeChoice === "new" && !v.newThemeEs.trim();

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoState("reading");
    try {
      const image = await photoToBase64(file);
      const res = await fetch("/api/books/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setV((cur) => ({
        ...cur,
        title: d.title ?? cur.title,
        author: d.author ?? cur.author,
        language: d.language ?? cur.language,
        series: d.series ?? cur.series,
        seriesNumber: d.seriesNumber != null ? String(d.seriesNumber) : cur.seriesNumber,
      }));
      setPhotoState("idle");
    } catch {
      setPhotoState("failed");
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (!v.title.trim() || (v.themeChoice === "new" && !v.newThemeEs.trim())) return;
        setBusy(true);
        setError(await onSubmit(v, place));
        setBusy(false);
      }}
    >
      {ix.data.features.photo && (
        <div className="photo">
          <label className="btn btn-file">
            {photoState === "reading" ? t("reading") : t("fromPhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              disabled={photoState === "reading"}
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
          </label>
          <small className="muted" role="status">
            {photoState === "failed" ? t("photoFailed") : t("fromPhotoHint")}
          </small>
        </div>
      )}

      <label className="field">
        <span>{t("title")}</span>
        <input value={v.title} onChange={set("title")} aria-invalid={titleMissing || undefined} autoCapitalize="sentences" />
        {titleMissing && <small className="error">{t("required")}</small>}
      </label>
      {similar.length > 0 && (
        <p className="hint" role="status">
          {t("similar")}{" "}
          {similar.map((b, i) => (
            <span key={b.id}>
              {i > 0 && "; "}
              <a href={`/book/${b.id}`} target="_blank" rel="noreferrer">
                {b.title}
              </a>{" "}
              ({fmt.placeText(fmt.placement(b))})
            </span>
          ))}
        </p>
      )}

      <label className="field">
        <span>
          {t("author")} <small className="muted">({t("optional")})</small>
        </span>
        <input value={v.author} onChange={set("author")} autoCapitalize="words" />
      </label>

      <label className="field">
        <span>{t("language")}</span>
        <select value={v.language} onChange={set("language")}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang_${l}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{t("theme")}</span>
        <select value={v.themeChoice} onChange={set("themeChoice")}>
          <option value="">{t("noTheme")}</option>
          {themes.map((th) => (
            <option key={th.id} value={th.id}>
              {locale === "es" ? th.nameEs : th.nameEn}
            </option>
          ))}
          <option value="new">{t("newTheme")}</option>
        </select>
      </label>
      {v.themeChoice === "new" && (
        <div className="indent">
          <label className="field">
            <span>{t("newThemeEs")}</span>
            <input value={v.newThemeEs} onChange={set("newThemeEs")} aria-invalid={themeMissing || undefined} />
            {themeMissing && <small className="error">{t("required")}</small>}
          </label>
          <label className="field">
            <span>{t("newThemeEn")}</span>
            <input value={v.newThemeEn} onChange={set("newThemeEn")} />
          </label>
        </div>
      )}

      <div className="two">
        <label className="field">
          <span>
            {t("series")} <small className="muted">({t("optional")})</small>
          </span>
          <input value={v.series} onChange={set("series")} />
        </label>
        <label className="field narrow">
          <span>Nº</span>
          <input
            value={v.seriesNumber}
            onChange={set("seriesNumber")}
            inputMode="decimal"
            aria-label={t("seriesNumber")}
            disabled={!v.series.trim()}
          />
        </label>
      </div>

      <label className="field">
        <span>
          {t("notes")} <small className="muted">({t("optional")})</small>
        </span>
        <textarea value={v.notes} onChange={set("notes")} rows={2} />
      </label>

      {place && (
        <section>
          <h2 className="h2">{t("placeOnShelf")}</h2>
          <PlacePicker bookId={-1} value={place} onChange={setPlace} />
          <p className="spot">
            {t("placeItOn")} <strong>{placeText(place)}</strong>
          </p>
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t("saving") : submitLabel}
      </button>
    </form>
  );
}

/** Turn an API failure into a message. */
export function useErrorText() {
  const { t } = useI18n();
  return (r: { status: number; data: unknown }) => {
    const reason = (r.data as { reason?: string } | null)?.reason;
    if (reason) return t(`err_${reason}` as MessageKey);
    return r.status === 409 ? t("conflict") : t("failed");
  };
}

export { send };
