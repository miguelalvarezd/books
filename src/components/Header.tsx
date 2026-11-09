"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const path = usePathname();
  const tab = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} className="tab" aria-current={match(path) ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <header className="header">
      <nav className="tabs" aria-label={t("appName")}>
        {tab("/", t("search"), (p) => p === "/" || p.startsWith("/book"))}
        {tab("/browse", t("browse"), (p) => p.startsWith("/browse") || p.startsWith("/room") || p.startsWith("/shelf"))}
      </nav>
      <button
        className="lang"
        onClick={() => setLocale(locale === "es" ? "en" : "es")}
        lang={locale === "es" ? "en" : "es"}
      >
        {t("switchLanguage")}
      </button>
    </header>
  );
}
