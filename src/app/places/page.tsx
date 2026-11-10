"use client";
import Link from "next/link";
import { useState } from "react";
import { send, useErrorText } from "@/components/BookForm";
import { useLibrary } from "@/components/LibraryProvider";
import { Modal } from "@/components/Modal";
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { Shelf, ShelfKind, Theme } from "@/lib/types";

type Editing =
  | { type: "room"; id?: number }
  | { type: "bookcase"; id?: number; roomId: number }
  | { type: "shelf"; id?: number; bookcaseId: number }
  | { type: "theme"; id: number };

const KINDS: ShelfKind[] = ["books", "toys", "notes", "albums", "other"];

/** Rooms → bookcases → shelves, plus themes. Every change goes through a dialog. */
export default function PlacesPage() {
  const { ix } = useLibrary();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);

  const shelfLabel = (s: Shelf) => {
    const n = ix.booksOf.get(s.id)?.length ?? 0;
    const kind = s.kind === "books" ? t("booksCount", { n }) : t(`kind_${s.kind}` as MessageKey);
    const front = s.frontOfShelfId ? ` · ${t("frontRow")}` : "";
    const tall = s.heightUnits > 1 ? ` · ×${s.heightUnits}` : "";
    return `${kind}${front}${tall}`;
  };

  return (
    <main className="page">
      <p className="crumbs">
        <Link href="/browse">{t("rooms")}</Link>
      </p>
      <h1 className="title">{t("places")}</h1>
      <p className="muted">{t("placesHint")}</p>
      <Link href="/qr" className="btn btn-block btn-link">
        {t("printQr")}
      </Link>
      <button className="btn btn-block" onClick={() => setEditing({ type: "room" })}>
        + {t("addRoom")}
      </button>

      {ix.rooms.map((r) => (
        <section key={r.id} className="tree-room">
          <EditRow title={r.name} level={1} onEdit={() => setEditing({ type: "room", id: r.id })} />
          {(ix.bookcasesOf.get(r.id) ?? []).map((bc) => (
            <div key={bc.id} className="tree-case">
              <EditRow title={bc.name} level={2} onEdit={() => setEditing({ type: "bookcase", id: bc.id, roomId: r.id })} />
              <ul className="list tree-shelves">
                {(ix.shelvesOf.get(bc.id) ?? []).map((s) => (
                  <li key={s.id}>
                    <EditRow
                      title={`${t("shelf")} ${s.name}`}
                      sub={shelfLabel(s)}
                      level={3}
                      onEdit={() => setEditing({ type: "shelf", id: s.id, bookcaseId: bc.id })}
                    />
                  </li>
                ))}
              </ul>
              <button className="btn btn-small" onClick={() => setEditing({ type: "shelf", bookcaseId: bc.id })}>
                + {t("addShelf")}
              </button>
            </div>
          ))}
          <button className="btn btn-small" onClick={() => setEditing({ type: "bookcase", roomId: r.id })}>
            + {t("addBookcase")}
          </button>
        </section>
      ))}

      <h2 className="h2">{t("themes")}</h2>
      <ul className="list">
        {[...ix.data.themes]
          .sort((a, b) => (locale === "es" ? a.nameEs : a.nameEn).localeCompare(locale === "es" ? b.nameEs : b.nameEn))
          .map((th) => (
            <li key={th.id}>
              <EditRow
                title={locale === "es" ? th.nameEs : th.nameEn}
                sub={locale === "es" ? th.nameEn : th.nameEs}
                level={3}
                onEdit={() => setEditing({ type: "theme", id: th.id })}
              />
            </li>
          ))}
      </ul>

      {editing?.type === "theme" ? (
        <ThemeDialog theme={ix.theme.get(editing.id)!} onClose={() => setEditing(null)} />
      ) : editing ? (
        <PlaceDialog editing={editing} onClose={() => setEditing(null)} />
      ) : null}
    </main>
  );
}

function EditRow({ title, sub, level, onEdit }: { title: string; sub?: string; level: 1 | 2 | 3; onEdit: () => void }) {
  const { t } = useI18n();
  const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "span";
  return (
    <div className={`edit-row lvl${level}`}>
      <div className="edit-row-text">
        <Tag className="edit-row-title">{title}</Tag>
        {sub && <span className="row-sub">{sub}</span>}
      </div>
      <button className="btn btn-small" onClick={onEdit} aria-label={`${t("edit")}: ${title}`}>
        {t("edit")}
      </button>
    </div>
  );
}

function PlaceDialog({ editing, onClose }: { editing: Exclude<Editing, { type: "theme" }>; onClose: () => void }) {
  const { ix, reload } = useLibrary();
  const { t } = useI18n();
  const errorText = useErrorText();
  const shelf = editing.type === "shelf" && editing.id ? ix.shelf.get(editing.id) : undefined;
  const existingName =
    editing.id == null
      ? ""
      : editing.type === "room"
        ? ix.room.get(editing.id)?.name
        : editing.type === "bookcase"
          ? ix.bookcase.get(editing.id)?.name
          : shelf?.name;
  const [name, setName] = useState(existingName ?? "");
  const [kind, setKind] = useState<ShelfKind>(shelf?.kind ?? "books");
  const [height, setHeight] = useState(shelf?.heightUnits ?? 1);
  const [frontOf, setFrontOf] = useState(shelf?.frontOfShelfId ? String(shelf.frontOfShelfId) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = editing.id == null;
  const title = {
    room: isNew ? t("addRoom") : existingName,
    bookcase: isNew ? t("addBookcase") : existingName,
    shelf: isNew ? t("addShelf") : `${t("shelf")} ${existingName}`,
  }[editing.type]!;

  // Shelves this one could stand in front of: back rows in the same bookcase without a front row.
  const backRows =
    editing.type === "shelf"
      ? (ix.shelvesOf.get(editing.bookcaseId) ?? []).filter(
          (s) =>
            s.id !== editing.id &&
            !s.frontOfShelfId &&
            s.kind === "books" &&
            (!ix.frontRowOf.get(s.id) || ix.frontRowOf.get(s.id)!.id === editing.id),
        )
      : [];
  const verticalWord = editing.type === "bookcase";

  const run = async (body: Record<string, unknown>, close = true) => {
    setBusy(true);
    setError(null);
    const r = await send("/api/places", "POST", { type: editing.type, ...body });
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    await reload();
    if (close) onClose();
  };

  const save = () => {
    if (!name.trim()) return setError(t("required"));
    const shelfFields =
      editing.type === "shelf"
        ? { kind, heightUnits: frontOf ? 1 : height, frontOfShelfId: frontOf ? Number(frontOf) : null }
        : {};
    const parent =
      editing.type === "bookcase" ? { roomId: editing.roomId } : editing.type === "shelf" ? { bookcaseId: editing.bookcaseId } : {};
    void run(isNew ? { op: "create", name, ...parent, ...shelfFields } : { op: "update", id: editing.id, name, ...shelfFields });
  };

  if (confirmDelete)
    return (
      <Modal title={`${t("delete")}: ${title}`} onClose={onClose}>
        <p>{t("deletePlaceText", { name: title })}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button className="btn btn-danger" disabled={busy} onClick={() => void run({ op: "delete", id: editing.id })}>
            {busy ? t("saving") : t("deleteConfirm")}
          </button>
          <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
            {t("cancel")}
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>{t("name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {editing.type === "shelf" && (
          <>
            <label className="field">
              <span>{t("kind")}</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as ShelfKind)} disabled={!!frontOf}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind_${k}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("frontOf")}</span>
              <select
                value={frontOf}
                onChange={(e) => {
                  setFrontOf(e.target.value);
                  if (e.target.value) setKind("books");
                }}
              >
                <option value="">{t("notFront")}</option>
                {backRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t("shelf")} {s.name}
                  </option>
                ))}
              </select>
            </label>
            {!frontOf && (
              <label className="field">
                <span>{t("height")}</span>
                <select value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </button>
          {!isNew && (
            <div className="two-buttons">
              <button type="button" className="btn" disabled={busy} onClick={() => void run({ op: "move", id: editing.id, dir: -1 }, false)}>
                {verticalWord ? `← ${t("moveLeft")}` : `↑ ${t("moveUp")}`}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void run({ op: "move", id: editing.id, dir: 1 }, false)}>
                {verticalWord ? `${t("moveRight")} →` : `↓ ${t("moveDown")}`}
              </button>
            </div>
          )}
          {!isNew && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              {t("delete")}
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ThemeDialog({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const { reload } = useLibrary();
  const { t } = useI18n();
  const errorText = useErrorText();
  const [es, setEs] = useState(theme.nameEs);
  const [en, setEn] = useState(theme.nameEn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t("editTheme")} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!es.trim()) return setError(t("required"));
          setBusy(true);
          const r = await send(`/api/themes/${theme.id}`, "PATCH", { nameEs: es, nameEn: en });
          setBusy(false);
          if (!r.ok) return setError(errorText(r));
          await reload();
          onClose();
        }}
      >
        <label className="field">
          <span>{t("lang_es")}</span>
          <input value={es} onChange={(e) => setEs(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("lang_en")}</span>
          <input value={en} onChange={(e) => setEn(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
