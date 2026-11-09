import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { LibraryProvider } from "@/components/LibraryProvider";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biblioteca",
  description: "Dónde está cada libro · Where every book is",
  appleWebApp: { capable: true, title: "Biblioteca" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1917" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>
        <I18nProvider>
          <Header />
          <LibraryProvider>{children}</LibraryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
