/** Parses seed/library.txt (format documented at the top of that file). */
import { BOOK_STATUSES, LANGUAGES, SHELF_KINDS } from "./schema";

type Lang = (typeof LANGUAGES)[number];
type ShelfKind = (typeof SHELF_KINDS)[number];
type Status = (typeof BOOK_STATUSES)[number];

export interface SeedBook {
  title: string;
  author: string | null;
  language: Lang;
  series: string | null;
  seriesNumber: number | null;
  theme: { es: string; en: string } | null;
  status: Status;
}
export interface SeedShelf {
  name: string;
  kind: ShelfKind;
  heightUnits: number;
  frontOf: string | null;
  books: SeedBook[];
}
export interface SeedBookcase {
  name: string;
  shelves: SeedShelf[];
}
export interface SeedRoom {
  name: string;
  bookcases: SeedBookcase[];
}

function attrs(parts: string[], line: number) {
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(/^(\w+)=(.*)$/);
    if (!m) throw new Error(`Line ${line}: expected key=value, got "${p}"`);
    out[m[1]] = m[2].trim();
  }
  return out;
}

export function parseSeries(raw: string): { series: string | null; seriesNumber: number | null } {
  const s = raw.trim();
  if (!s) return { series: null, seriesNumber: null };
  const m = s.match(/^(.*?)\s*#(\d+(?:\.\d+)?)$/);
  if (m) return { series: m[1].trim(), seriesNumber: Number(m[2]) };
  return { series: s, seriesNumber: null };
}

export function parseSeed(text: string): SeedRoom[] {
  const rooms: SeedRoom[] = [];
  let room: SeedRoom | undefined;
  let bookcase: SeedBookcase | undefined;
  let shelf: SeedShelf | undefined;
  let theme: SeedBook["theme"] = null;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const n = i + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    if (line.startsWith("=== ")) {
      if (!bookcase) throw new Error(`Line ${n}: shelf outside a bookcase`);
      const [name, ...rest] = line.slice(4).split("|").map((s) => s.trim());
      const a = attrs(rest, n);
      const kind = (a.kind ?? "books") as ShelfKind;
      if (!SHELF_KINDS.includes(kind)) throw new Error(`Line ${n}: unknown kind "${kind}"`);
      shelf = {
        name,
        kind,
        heightUnits: a.height ? Number(a.height) : 1,
        frontOf: a.front ?? null,
        books: [],
      };
      bookcase.shelves.push(shelf);
      theme = null;
    } else if (line.startsWith("== ")) {
      if (!room) throw new Error(`Line ${n}: bookcase outside a room`);
      bookcase = { name: line.slice(3).trim(), shelves: [] };
      room.bookcases.push(bookcase);
      shelf = undefined;
    } else if (line.startsWith("= ")) {
      room = { name: line.slice(2).trim(), bookcases: [] };
      rooms.push(room);
      bookcase = undefined;
      shelf = undefined;
    } else if (line.startsWith("@ ")) {
      const [es, en] = line.slice(2).split("|").map((s) => s.trim());
      if (!es || !en) throw new Error(`Line ${n}: theme needs "es | en"`);
      theme = { es, en };
    } else {
      if (!shelf) throw new Error(`Line ${n}: book outside a shelf`);
      if (shelf.kind !== "books") throw new Error(`Line ${n}: book on a "${shelf.kind}" shelf`);
      const [title, author = "", lang = "es", series = "", ...rest] = line
        .split("|")
        .map((s) => s.trim());
      if (!title) throw new Error(`Line ${n}: missing title`);
      if (!LANGUAGES.includes(lang as Lang)) throw new Error(`Line ${n}: unknown language "${lang}"`);
      const a = attrs(rest, n);
      const status = (a.status ?? "shelf") as Status;
      if (!BOOK_STATUSES.includes(status)) throw new Error(`Line ${n}: unknown status "${status}"`);
      shelf.books.push({
        title,
        author: author || null,
        language: lang as Lang,
        ...parseSeries(series),
        theme,
        status,
      });
    }
  });

  // Validate front-row references within each bookcase.
  for (const r of rooms)
    for (const b of r.bookcases)
      for (const s of b.shelves)
        if (s.frontOf && !b.shelves.some((o) => o.name === s.frontOf))
          throw new Error(`Shelf "${s.name}" in ${r.name}/${b.name}: front=${s.frontOf} not found`);

  return rooms;
}
