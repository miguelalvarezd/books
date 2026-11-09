"use client";
import { useCallback } from "react";
import { useLibrary } from "./LibraryProvider";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { placementOf, type Placement } from "@/lib/library";
import type { Book, Shelf } from "@/lib/types";

/** Human-readable labels for places, themes and status, in the current language. */
export function useFormat() {
  const { ix } = useLibrary();
  const { t, locale } = useI18n();

  const shelfName = useCallback(
    (s: Shelf) => {
      if (s.kind !== "books") return t(`kind_${s.kind}` as MessageKey);
      const base = `${t("shelf")} ${s.name}`;
      return s.frontOfShelfId ? `${base} (${t("frontRow")})` : base;
    },
    [t],
  );

  /** "Pasillo · Derecha · Estante 2" — the bookcase only when the room has several. */
  const placeText = useCallback(
    (p: Placement) =>
      [p.room.name, p.multipleBookcases ? p.bookcase.name : null, shelfName(p.shelf)].filter(Boolean).join(" · "),
    [shelfName],
  );

  const shelfPath = useCallback(
    (s: Shelf) => {
      const bc = ix.bookcase.get(s.bookcaseId)!;
      const room = ix.room.get(bc.roomId)!;
      const multiple = (ix.bookcasesOf.get(room.id)?.length ?? 0) > 1;
      return [room.name, multiple ? bc.name : null, shelfName(s)].filter(Boolean).join(" · ");
    },
    [ix, shelfName],
  );

  const themeName = useCallback(
    (id: number | null) => {
      const th = id ? ix.theme.get(id) : undefined;
      return th ? (locale === "es" ? th.nameEs : th.nameEn) : null;
    },
    [ix, locale],
  );

  const date = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );

  const statusText = useCallback(
    (b: Book) => {
      switch (b.status) {
        case "reading":
          return t("status_reading", {
            who: b.holder ?? "?",
            room: (b.statusRoomId && ix.room.get(b.statusRoomId)?.name) || "?",
          });
        case "lent":
          return t("status_lent", { who: b.holder ?? "?" });
        case "missing":
          return t("status_missing");
        default:
          return t("status_shelf");
      }
    },
    [ix, t],
  );

  const placement = useCallback((b: Book) => placementOf(ix, b), [ix]);

  const seriesText = (b: Book) =>
    b.series ? (b.seriesNumber != null ? `${b.series} #${b.seriesNumber}` : b.series) : null;

  return { shelfName, placeText, shelfPath, themeName, statusText, date, placement, seriesText };
}
