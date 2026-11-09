"use client";
import { useEffect, useState } from "react";
import { useFormat } from "./useFormat";
import { useI18n } from "@/lib/i18n";

interface Loan {
  id: number;
  kind: "reading" | "lent";
  person: string;
  room: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** Loan history of a book. `version` changes whenever the book changes, to refetch. */
export function BookHistory({ bookId, version }: { bookId: number; version: string }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const [loans, setLoans] = useState<Loan[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/books/${bookId}/history`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Loan[]) => alive && setLoans(rows))
      .catch(() => alive && setLoans([]));
    return () => {
      alive = false;
    };
  }, [bookId, version]);

  if (!loans) return null;
  return (
    <section>
      <h2 className="h2">{t("history")}</h2>
      {loans.length === 0 ? (
        <p className="muted">{t("noHistory")}</p>
      ) : (
        <ul className="list">
          {loans.map((l) => {
            const open = !l.endedAt;
            const vars = { who: l.person, room: l.room ?? "?" };
            const text =
              l.kind === "reading"
                ? t(open ? "loanReadNow" : "loanRead", vars)
                : t(open ? "loanLentNow" : "loanLent", vars);
            return (
              <li key={l.id} className="row">
                <span className="row-title">{text}</span>
                <span className="row-sub">
                  {fmt.date(l.startedAt)}
                  {l.endedAt && ` → ${fmt.date(l.endedAt)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
