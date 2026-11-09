"use client";
import { useId, useState } from "react";
import { Diagram } from "./Diagram";
import { useLibrary } from "./LibraryProvider";
import { Modal } from "./Modal";
import { PlacePicker, usePlaceText, type Place } from "./PlacePicker";
import { useFormat } from "./useFormat";
import { useI18n } from "@/lib/i18n";
import { presentNeighbours } from "@/lib/library";
import type { Book } from "@/lib/types";

type Flow = "read" | "lend" | "return" | "move" | "missing" | null;

/** Buttons for what can be done with a book now, each behind a confirmation dialog. */
export function BookActions({ book, onChanged }: { book: Book; onChanged: () => void }) {
  const { t } = useI18n();
  const [flow, setFlow] = useState<Flow>(null);
  const close = () => setFlow(null);
  const done = () => {
    setFlow(null);
    onChanged();
  };

  return (
    <div className="actions">
      {book.status === "shelf" ? (
        <>
          <button className="btn btn-primary" onClick={() => setFlow("read")}>
            {t("actTakeRead")}
          </button>
          <button className="btn btn-primary" onClick={() => setFlow("lend")}>
            {t("actLend")}
          </button>
          <button className="btn" onClick={() => setFlow("move")}>
            {t("actMove")}
          </button>
          <button className="btn" onClick={() => setFlow("missing")}>
            {t("actMissing")}
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" onClick={() => setFlow("return")}>
            {book.status === "missing" ? t("actFound") : t("actReturn")}
          </button>
          <button className="btn" onClick={() => setFlow("move")}>
            {t("actMove")}
          </button>
        </>
      )}

      {(flow === "read" || flow === "lend") && <TakeDialog book={book} kind={flow} onClose={close} onDone={done} />}
      {flow === "return" && <ReturnDialog book={book} onClose={close} onDone={done} />}
      {flow === "move" && <MoveDialog book={book} onClose={close} onDone={done} />}
      {flow === "missing" && <MissingDialog book={book} onClose={close} onDone={done} />}
    </div>
  );
}

/** POST an action; on conflict reload the catalog so the screen shows the truth. */
function useSubmit(book: Book, onDone: () => void) {
  const { t } = useI18n();
  const { reload } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${book.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedStatus: book.status }),
      });
      if (res.status === 409) {
        setError(t("conflict"));
        await reload();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      await reload();
      onDone();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy, error };
}

function SpotText({ book, label }: { book: Book; label: string }) {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const p = fmt.placement(book);
  const n = presentNeighbours(ix, book);
  return (
    <p className="spot">
      {label} <strong>{fmt.placeText(p)}</strong>
      {(n.left || n.right) && (
        <>
          <br />
          {n.left && n.right ? (
            <>
              {t("between")} <em>{n.left.title}</em> {t("and")} <em>{n.right.title}</em>
            </>
          ) : n.right ? (
            <>
              {t("firstOnShelf")} <em>{n.right.title}</em>
            </>
          ) : (
            <>
              {t("lastOnShelf")} <em>{n.left!.title}</em>
            </>
          )}
        </>
      )}
    </p>
  );
}

function Buttons({
  busy,
  error,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onConfirm?: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-buttons">
        <button type={onConfirm ? "button" : "submit"} className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? t("saving") : confirmLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </>
  );
}

function TakeDialog({ book, kind, onClose, onDone }: { book: Book; kind: "read" | "lend"; onClose: () => void; onDone: () => void }) {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const { submit, busy, error } = useSubmit(book, onDone);
  const [person, setPerson] = useState("");
  const [roomId, setRoomId] = useState("");
  const [tried, setTried] = useState(false);
  const listId = useId();
  const reading = kind === "read";
  const missingPerson = tried && !person.trim();
  const missingRoom = tried && reading && !roomId;

  return (
    <Modal title={`${reading ? t("takeTitleRead") : t("takeTitleLend")}: ${book.title}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!person.trim() || (reading && !roomId)) return;
          void submit({ type: "take", kind: reading ? "reading" : "lent", person, roomId: reading ? Number(roomId) : null });
        }}
      >
        <SpotText book={book} label={t("takingFrom")} />
        <p className="hint">{t("rememberSpot")}</p>
        <label className="field">
          <span>{reading ? t("whoReads") : t("whoBorrows")}</span>
          <input
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            list={listId}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={missingPerson || undefined}
            aria-describedby={`${listId}-hint`}
          />
          <small id={`${listId}-hint`} className="muted">
            {missingPerson ? t("required") : t("nameHint")}
          </small>
          <datalist id={listId}>
            {ix.data.people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        {reading && (
          <label className="field">
            <span>{t("whichRoom")}</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-invalid={missingRoom || undefined}>
              <option value="">{t("chooseRoom")}</option>
              {ix.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {missingRoom && <small className="muted">{t("required")}</small>}
          </label>
        )}
        <Buttons busy={busy} error={error} confirmLabel={t("confirm")} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function ReturnDialog({ book, onClose, onDone }: { book: Book; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const placeText = usePlaceText();
  const { submit, busy, error } = useSubmit(book, onDone);
  const [elsewhere, setElsewhere] = useState(false);
  const [place, setPlace] = useState<Place>({ shelfId: book.homeShelfId, afterBookId: undefined });
  const title = `${book.status === "missing" ? t("foundTitle") : t("returnTitle")}: ${book.title}`;

  if (elsewhere)
    return (
      <Modal title={title} onClose={onClose}>
        <p className="spot">{t("whereNow")}</p>
        <PlacePicker bookId={book.id} value={place} onChange={setPlace} />
        <p className="spot">
          {t("newPlaceIs")} <strong>{placeText(place)}</strong>
        </p>
        <Buttons
          busy={busy}
          error={error}
          confirmLabel={t("confirm")}
          onConfirm={() =>
            void submit({
              type: "return",
              toShelfId: place.shelfId,
              ...(place.afterBookId !== undefined ? { afterBookId: place.afterBookId } : {}),
            })
          }
          onCancel={() => setElsewhere(false)}
        />
      </Modal>
    );

  return (
    <Modal title={title} onClose={onClose}>
      <SpotText book={book} label={t("putItOn")} />
      <Diagram roomId={fmt.placement(book).room.id} highlightId={book.id} interactive={false} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-buttons">
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit({ type: "return" })}>
          {busy ? t("saving") : t("doneInPlace")}
        </button>
        <button className="btn" disabled={busy} onClick={() => setElsewhere(true)}>
          {t("putElsewhere")}
        </button>
        <button className="btn btn-quiet" disabled={busy} onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </Modal>
  );
}

function MoveDialog({ book, onClose, onDone }: { book: Book; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const placeText = usePlaceText();
  const { submit, busy, error } = useSubmit(book, onDone);
  const [place, setPlace] = useState<Place>({ shelfId: book.homeShelfId, afterBookId: undefined });
  return (
    <Modal title={`${t("moveTitle")}: ${book.title}`} onClose={onClose}>
      <PlacePicker bookId={book.id} value={place} onChange={setPlace} />
      <p className="spot">
        {t("newPlaceIs")} <strong>{placeText(place)}</strong>
      </p>
      <Buttons
        busy={busy}
        error={error}
        confirmLabel={t("moveConfirm")}
        onConfirm={() =>
          void submit({
            type: "move",
            toShelfId: place.shelfId,
            ...(place.afterBookId !== undefined ? { afterBookId: place.afterBookId } : {}),
          })
        }
        onCancel={onClose}
      />
    </Modal>
  );
}

function MissingDialog({ book, onClose, onDone }: { book: Book; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { submit, busy, error } = useSubmit(book, onDone);
  return (
    <Modal title={`${t("missingTitle")} ${book.title}`} onClose={onClose}>
      <p>{t("missingText")}</p>
      <Buttons
        busy={busy}
        error={error}
        confirmLabel={t("missingConfirm")}
        onConfirm={() => void submit({ type: "missing" })}
        onCancel={onClose}
      />
    </Modal>
  );
}
