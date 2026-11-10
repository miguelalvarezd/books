"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

/** Top bar (name + language) and a bottom tab bar within thumb reach. */
export function Header() {
  const { t, locale, setLocale } = useI18n();
  const path = usePathname();
  const tab = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} className="tab" aria-current={match(path) ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          {t("appName")}
        </Link>
        <Link href="/add" className="btn btn-small btn-add" aria-current={path === "/add" ? "page" : undefined}>
          + {t("add")}
        </Link>
        <button
          className="lang"
          onClick={() => setLocale(locale === "es" ? "en" : "es")}
          aria-label={t("switchLanguage")}
          lang={locale === "es" ? "en" : "es"}
        >
          {t("switchShort")}
        </button>
      </header>
      <nav className="tabs" aria-label={t("appName")}>
        {tab("/", t("search"), (p) => p === "/" || p.startsWith("/book"))}
        {tab("/browse", t("browse"), (p) => p.startsWith("/browse") || p.startsWith("/room") || p.startsWith("/shelf"))}
        {tab("/out", t("out"), (p) => p.startsWith("/out"))}
        {tab("/activity", t("activity"), (p) => p.startsWith("/activity"))}
      </nav>
    </>
  );
}
