"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useLibrary } from "@/components/LibraryProvider";
import { useI18n } from "@/lib/i18n";

interface Card {
  key: string;
  title: string;
  subtitle: string;
  url: string;
}

/** Printable sheet: one QR per bookcase (opens that bookcase) plus one for the whole app. */
export default function QrPage() {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const [origin, setOrigin] = useState("");
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the public address is only known in the browser
    setOrigin(window.location.origin);
  }, []);

  const cards: Card[] = origin
    ? [
        { key: "home", title: t("appName"), subtitle: t("qrHome"), url: `${origin}/` },
        ...ix.rooms.flatMap((r) => {
          const cases = ix.bookcasesOf.get(r.id) ?? [];
          return cases.map((bc) => ({
            key: `bc-${bc.id}`,
            title: cases.length > 1 ? `${r.name} · ${bc.name}` : r.name,
            subtitle: t("qrBookcase"),
            url: `${origin}/room/${r.id}?bc=${bc.id}`,
          }));
        }),
      ]
    : [];
  const urls = cards.map((c) => c.url).join("|");

  useEffect(() => {
    if (!urls) return;
    let alive = true;
    Promise.all(
      urls.split("|").map((u) => QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M" })),
    ).then((list) => {
      if (alive) setSvgs(Object.fromEntries(urls.split("|").map((u, i) => [u, list[i]])));
    });
    return () => {
      alive = false;
    };
  }, [urls]);

  return (
    <main className="page qr-page">
      <div className="no-print">
        <h1 className="title">{t("qrTitle")}</h1>
        <p className="muted">{t("qrIntro")}</p>
        <button className="btn btn-primary btn-block" onClick={() => window.print()}>
          {t("print")}
        </button>
      </div>
      <div className="qr-grid">
        {cards.map((c) => (
          <figure key={c.key} className="qr-card">
            <div
              className="qr-img"
              role="img"
              aria-label={`QR: ${c.title}`}
              dangerouslySetInnerHTML={{ __html: svgs[c.url] ?? "" }}
            />
            <figcaption>
              <strong>{c.title}</strong>
              <span>{c.subtitle}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
