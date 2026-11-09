"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Diagram } from "@/components/Diagram";
import { useLibrary } from "@/components/LibraryProvider";
import { useFormat } from "@/components/useFormat";
import { useI18n } from "@/lib/i18n";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const room = ix.room.get(Number(id));
  if (!room)
    return (
      <main className="page">
        <p>{t("notFound")}</p>
      </main>
    );
  const cases = ix.bookcasesOf.get(room.id) ?? [];

  return (
    <main className="page">
      <p className="crumbs">
        <Link href="/browse">{t("rooms")}</Link>
      </p>
      <h1 className="title">{room.name}</h1>
      <p className="muted">{t("tapBook")}</p>
      <Diagram roomId={room.id} />
      {cases.map((bc) => (
        <section key={bc.id}>
          {cases.length > 1 && <h2 className="h2">{bc.name}</h2>}
          <ul className="list">
            {(ix.shelvesOf.get(bc.id) ?? [])
              .filter((s) => s.kind === "books")
              .map((s) => (
                <li key={s.id}>
                  <Link href={`/shelf/${s.id}`} className="row">
                    <span className="row-title">{fmt.shelfName(s)}</span>
                    <span className="row-sub">
                      {(ix.booksOf.get(s.id)?.length ?? 0) === 0
                        ? t("empty")
                        : t("booksCount", { n: ix.booksOf.get(s.id)!.length })}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
