"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "es" | "en";

const dict = {
  es: {
    appName: "Biblioteca",
    search: "Buscar",
    searchPlaceholder: "Título, autor, serie o tema",
    searchHint: "Escribe para buscar entre {n} libros.",
    results: "{n} resultados",
    oneResult: "1 resultado",
    noResults: "Ningún libro coincide con «{q}».",
    browse: "Explorar",
    rooms: "Habitaciones",
    booksCount: "{n} libros",
    shelf: "Estante",
    frontRow: "fila delantera",
    position: "nº {i} de {n} desde la izquierda",
    between: "Entre",
    and: "y",
    firstOnShelf: "Primero del estante, antes de",
    lastOnShelf: "Último del estante, después de",
    onlyOnShelf: "Único libro del estante",
    location: "Ubicación",
    belongsOn: "Su sitio",
    author: "Autor",
    series: "Serie",
    theme: "Tema",
    language: "Idioma",
    notes: "Notas",
    status: "Dónde está ahora",
    status_shelf: "En su estante",
    status_reading: "Leyéndolo {who} · {room}",
    status_lent: "Prestado a {who}",
    status_missing: "No encontrado",
    since: "desde el {date}",
    loading: "Cargando la biblioteca…",
    error: "No se pudo cargar la biblioteca.",
    retry: "Reintentar",
    notFound: "No existe.",
    back: "Atrás",
    diagramLabel: "Esquema de {room}. El libro resaltado está en {where}.",
    diagramRoom: "Esquema de {room}.",
    kind_toys: "Juguetes",
    kind_notes: "Apuntes",
    kind_albums: "Álbumes de fotos",
    kind_other: "Otros",
    empty: "Vacío",
    lang_es: "Español",
    lang_en: "Inglés",
    lang_fr: "Francés",
    lang_de: "Alemán",
    lang_other: "Otro",
    switchLanguage: "English",
    tapBook: "Toca un libro del esquema o elige un estante.",
    zoomIn: "Ampliar",
    zoomOut: "Ver estantería entera",
  },
  en: {
    appName: "Library",
    search: "Search",
    searchPlaceholder: "Title, author, series or theme",
    searchHint: "Type to search {n} books.",
    results: "{n} results",
    oneResult: "1 result",
    noResults: "No book matches “{q}”.",
    browse: "Browse",
    rooms: "Rooms",
    booksCount: "{n} books",
    shelf: "Shelf",
    frontRow: "front row",
    position: "no. {i} of {n} from the left",
    between: "Between",
    and: "and",
    firstOnShelf: "First on the shelf, before",
    lastOnShelf: "Last on the shelf, after",
    onlyOnShelf: "Only book on the shelf",
    location: "Location",
    belongsOn: "Belongs on",
    author: "Author",
    series: "Series",
    theme: "Theme",
    language: "Language",
    notes: "Notes",
    status: "Where it is now",
    status_shelf: "On its shelf",
    status_reading: "{who} is reading it · {room}",
    status_lent: "Lent to {who}",
    status_missing: "Not found",
    since: "since {date}",
    loading: "Loading the library…",
    error: "Couldn't load the library.",
    retry: "Try again",
    notFound: "Not found.",
    back: "Back",
    diagramLabel: "Diagram of {room}. The highlighted book is on {where}.",
    diagramRoom: "Diagram of {room}.",
    kind_toys: "Toys",
    kind_notes: "School notes",
    kind_albums: "Photo albums",
    kind_other: "Other",
    empty: "Empty",
    lang_es: "Spanish",
    lang_en: "English",
    lang_fr: "French",
    lang_de: "German",
    lang_other: "Other",
    switchLanguage: "Español",
    tapBook: "Tap a book in the diagram or pick a shelf.",
    zoomIn: "Zoom in",
    zoomOut: "Show whole bookcase",
  },
} as const;

export type MessageKey = keyof (typeof dict)["es"];

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = "biblioteca.locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved preference after hydration
      if (saved === "es" || saved === "en") setLocaleState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let s: string = dict[locale][key];
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
