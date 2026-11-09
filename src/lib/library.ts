/** Indexes and lookups over the catalog. Pure functions, shared by client and tests. */
import type { Book, Bookcase, LibraryData, Room, Shelf, Theme } from "./types";

export interface LibraryIndex {
  data: LibraryData;
  room: Map<number, Room>;
  bookcase: Map<number, Bookcase>;
  shelf: Map<number, Shelf>;
  theme: Map<number, Theme>;
  book: Map<number, Book>;
  /** Rooms in order. */
  rooms: Room[];
  /** Bookcases of a room, left → right. */
  bookcasesOf: Map<number, Bookcase[]>;
  /** Shelves of a bookcase, top → bottom (front rows included). */
  shelvesOf: Map<number, Shelf[]>;
  /** Front row standing in front of a shelf, if any. */
  frontRowOf: Map<number, Shelf>;
  /** Books whose home is a shelf, left → right (books that are out included). */
  booksOf: Map<number, Book[]>;
  /** Precomputed, accent-free search text per book. */
  searchText: Map<number, { title: string; rest: string }>;
}

const bySort = <T extends { sort: number; id: number }>(a: T, b: T) => a.sort - b.sort || a.id - b.id;

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim();
}

function group<K, V>(items: V[], key: (v: V) => K): Map<K, V[]> {
  const m = new Map<K, V[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function buildIndex(data: LibraryData): LibraryIndex {
  const shelvesOf = group(data.shelves, (s) => s.bookcaseId);
  shelvesOf.forEach((l) => l.sort(bySort));
  const bookcasesOf = group(data.bookcases, (b) => b.roomId);
  bookcasesOf.forEach((l) => l.sort(bySort));
  const booksOf = group(data.books, (b) => b.homeShelfId);
  booksOf.forEach((l) => l.sort((a, b) => a.position - b.position || a.id - b.id));
  const frontRowOf = new Map<number, Shelf>();
  for (const s of data.shelves) if (s.frontOfShelfId) frontRowOf.set(s.frontOfShelfId, s);

  const theme = new Map(data.themes.map((t) => [t.id, t]));
  const searchText = new Map<number, { title: string; rest: string }>();
  for (const b of data.books) {
    const th = b.themeId ? theme.get(b.themeId) : undefined;
    searchText.set(b.id, {
      title: normalize(b.title),
      rest: normalize([b.author, b.series, th?.nameEs, th?.nameEn].filter(Boolean).join(" ")),
    });
  }

  return {
    data,
    room: new Map(data.rooms.map((r) => [r.id, r])),
    bookcase: new Map(data.bookcases.map((b) => [b.id, b])),
    shelf: new Map(data.shelves.map((s) => [s.id, s])),
    theme,
    book: new Map(data.books.map((b) => [b.id, b])),
    rooms: [...data.rooms].sort(bySort),
    bookcasesOf,
    shelvesOf,
    frontRowOf,
    booksOf,
    searchText,
  };
}

/** Search title, author, series and theme. Every word must match somewhere. */
export function searchBooks(ix: LibraryIndex, query: string, limit = 50): Book[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored: { b: Book; score: number }[] = [];
  for (const b of ix.data.books) {
    const st = ix.searchText.get(b.id)!;
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (st.title.startsWith(w)) score += 6;
      else if (st.title.includes(` ${w}`)) score += 4;
      else if (st.title.includes(w)) score += 3;
      else if (st.rest.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ b, score });
  }
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      (x.b.series ?? "").localeCompare(y.b.series ?? "") ||
      (x.b.seriesNumber ?? 0) - (y.b.seriesNumber ?? 0) ||
      x.b.title.localeCompare(y.b.title, "es"),
  );
  return scored.slice(0, limit).map((s) => s.b);
}

export interface Placement {
  room: Room;
  bookcase: Bookcase;
  shelf: Shelf;
  /** 1-based position from the left on the home shelf. */
  index: number;
  count: number;
  left: Book | null;
  right: Book | null;
  /** True if the room has more than one bookcase (so the bookcase name matters). */
  multipleBookcases: boolean;
}

/** Where a book belongs: room, bookcase, shelf, position and neighbours. */
export function placementOf(ix: LibraryIndex, book: Book): Placement {
  const shelf = ix.shelf.get(book.homeShelfId)!;
  const bookcase = ix.bookcase.get(shelf.bookcaseId)!;
  const room = ix.room.get(bookcase.roomId)!;
  const row = ix.booksOf.get(shelf.id) ?? [];
  const i = row.findIndex((b) => b.id === book.id);
  return {
    room,
    bookcase,
    shelf,
    index: i + 1,
    count: row.length,
    left: row[i - 1] ?? null,
    right: row[i + 1] ?? null,
    multipleBookcases: (ix.bookcasesOf.get(room.id)?.length ?? 0) > 1,
  };
}

export function countBooksInRoom(ix: LibraryIndex, roomId: number): number {
  let n = 0;
  for (const bc of ix.bookcasesOf.get(roomId) ?? [])
    for (const s of ix.shelvesOf.get(bc.id) ?? []) n += ix.booksOf.get(s.id)?.length ?? 0;
  return n;
}
