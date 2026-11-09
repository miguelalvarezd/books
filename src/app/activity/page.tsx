"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormat } from "@/components/useFormat";
import { useI18n, type MessageKey } from "@/lib/i18n";

interface Event {
  id: number;
  at: string;
  action: string;
  bookId: number | null;
  actor: string | null;
  data: Record<string, unknown> | null;
}

export default function ActivityPage() {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    fetch("/api/activity", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const describe = (e: Event) => {
    const d = e.data ?? {};
    const key = `ev_${e.action}` as MessageKey;
    return t(key, {
      t: String(d.title ?? ""),
      who: String(d.person ?? "?"),
      room: String(d.room ?? "?"),
      from: String(d.from ?? "?"),
      to: String(d.to ?? "?"),
      n: String(d.books ?? ""),
      name: String(d.name ?? ""),
    });
  };
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="page">
      <h1 className="title">{t("activity")}</h1>
      {events === null ? (
        <p className="muted">{t("loading")}</p>
      ) : events.length === 0 ? (
        <p className="muted">{t("noActivity")}</p>
      ) : (
        <ul className="list">
          {events.map((e) => {
            const text = describe(e);
            const sub = `${fmt.date(e.at)} · ${time(e.at)}${e.actor ? ` · ${t("by", { who: e.actor })}` : ""}`;
            return (
              <li key={e.id}>
                {e.bookId ? (
                  <Link href={`/book/${e.bookId}`} className="row">
                    <span className="row-title">{text}</span>
                    <span className="row-sub">{sub}</span>
                  </Link>
                ) : (
                  <div className="row">
                    <span className="row-title">{text}</span>
                    <span className="row-sub">{sub}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
