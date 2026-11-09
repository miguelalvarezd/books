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
    out: "Fuera",
    activity: "Historial",
    switchShort: "EN",
    actTakeRead: "Me lo llevo a leer",
    actLend: "Prestar",
    actReturn: "Devolver a su sitio",
    actFound: "Lo he encontrado",
    actMove: "Cambiar de sitio",
    actMissing: "No lo encuentro",
    cancel: "Cancelar",
    confirm: "Confirmar",
    whoReads: "¿Quién lo va a leer?",
    whoBorrows: "¿A quién se lo prestas?",
    whichRoom: "¿En qué habitación estará?",
    chooseRoom: "Elige habitación",
    nameHint: "Escribe el nombre; aparecen los ya usados.",
    takeTitleRead: "Llevarse a leer",
    takeTitleLend: "Prestar libro",
    takingFrom: "Lo sacas de",
    rememberSpot: "Fíjate en su hueco: cuando lo devuelvas tiene que volver aquí.",
    returnTitle: "Devolver a su sitio",
    foundTitle: "Libro encontrado",
    putItOn: "Colócalo en",
    doneInPlace: "Hecho, está en su sitio",
    putElsewhere: "Lo he puesto en otro sitio",
    whereNow: "¿Dónde lo has puesto?",
    pickShelf: "Estante",
    pickPosition: "Posición",
    atStart: "Al principio del estante",
    afterBook: "Después de «{t}»",
    atEnd: "Al final del estante",
    newPlaceIs: "Su nuevo sitio será",
    moveTitle: "Cambiar de sitio",
    moveConfirm: "Guardar nuevo sitio",
    missingTitle: "¿No lo encuentras?",
    missingText: "Se marcará como no encontrado. Cuando aparezca, pulsa «Lo he encontrado».",
    missingConfirm: "Marcar como no encontrado",
    saving: "Guardando…",
    conflict: "Alguien acaba de cambiar este libro. Se ha actualizado; revisa y vuelve a intentarlo.",
    failed: "No se pudo guardar. Comprueba la conexión e inténtalo de nuevo.",
    required: "Falta este dato.",
    history: "Historial de préstamos",
    noHistory: "Nunca ha salido de su estante.",
    loanRead: "{who} lo leyó · {room}",
    loanReadNow: "{who} lo está leyendo · {room}",
    loanLent: "Prestado a {who}",
    loanLentNow: "Prestado a {who} (aún no ha vuelto)",
    nothingOut: "Todos los libros están en su sitio.",
    outTitle: "Libros fuera de su sitio",
    missingGroup: "No encontrados",
    noActivity: "Aún no hay cambios.",
    ev_take_reading: "{who} se llevó a leer «{t}» ({room})",
    ev_lend: "«{t}» prestado a {who}",
    ev_return: "«{t}» devuelto a {to}",
    ev_found: "«{t}» encontrado y colocado en {to}",
    ev_move: "«{t}» cambiado de {from} a {to}",
    ev_missing: "«{t}» marcado como no encontrado",
    ev_import: "Biblioteca importada ({n} libros)",
    by: "por {who}",
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
    out: "Out",
    activity: "History",
    switchShort: "ES",
    actTakeRead: "Take it to read",
    actLend: "Lend",
    actReturn: "Put it back",
    actFound: "I found it",
    actMove: "Move to another shelf",
    actMissing: "I can't find it",
    cancel: "Cancel",
    confirm: "Confirm",
    whoReads: "Who's going to read it?",
    whoBorrows: "Who are you lending it to?",
    whichRoom: "Which room will it be in?",
    chooseRoom: "Choose a room",
    nameHint: "Type a name; names used before appear.",
    takeTitleRead: "Take to read",
    takeTitleLend: "Lend book",
    takingFrom: "You're taking it from",
    rememberSpot: "Note the gap: it has to come back to this spot.",
    returnTitle: "Put it back",
    foundTitle: "Book found",
    putItOn: "Put it on",
    doneInPlace: "Done, it's in its place",
    putElsewhere: "I put it somewhere else",
    whereNow: "Where did you put it?",
    pickShelf: "Shelf",
    pickPosition: "Position",
    atStart: "At the start of the shelf",
    afterBook: "After “{t}”",
    atEnd: "At the end of the shelf",
    newPlaceIs: "Its new place will be",
    moveTitle: "Move to another shelf",
    moveConfirm: "Save new place",
    missingTitle: "Can't find it?",
    missingText: "It will be marked as not found. When it turns up, tap “I found it”.",
    missingConfirm: "Mark as not found",
    saving: "Saving…",
    conflict: "Someone just changed this book. It's been refreshed; check and try again.",
    failed: "Couldn't save. Check the connection and try again.",
    required: "This is needed.",
    history: "Loan history",
    noHistory: "It has never left its shelf.",
    loanRead: "{who} read it · {room}",
    loanReadNow: "{who} is reading it · {room}",
    loanLent: "Lent to {who}",
    loanLentNow: "Lent to {who} (not back yet)",
    nothingOut: "Every book is in its place.",
    outTitle: "Books away from their shelf",
    missingGroup: "Not found",
    noActivity: "No changes yet.",
    ev_take_reading: "{who} took “{t}” to read ({room})",
    ev_lend: "“{t}” lent to {who}",
    ev_return: "“{t}” put back on {to}",
    ev_found: "“{t}” found and put on {to}",
    ev_move: "“{t}” moved from {from} to {to}",
    ev_missing: "“{t}” marked as not found",
    ev_import: "Library imported ({n} books)",
    by: "by {who}",
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
