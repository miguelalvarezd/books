/**
 * Geometry for the room diagram. One rectangle per book, in the real count and order.
 * Sizes are pseudo-random but seeded by book id, so the picture is stable between visits.
 */
import type { LibraryIndex } from "./library";
import type { ShelfKind } from "./types";

export const DIAGRAM = {
  unit: 56, // px per shelf height unit
  board: 4, // shelf board thickness
  side: 8, // bookcase side panel
  gap: 4, // gap between bookcases standing side by side
  inset: 4, // space between side panel and first book
  bookGap: 0.8,
  top: 22, // room above the bookcases for the highlight marker
  label: 30, // bookcase name under each bookcase
  minInner: 200,
} as const;

export interface LevelBox {
  shelfId: number;
  name: string;
  kind: ShelfKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hasFrontRow: boolean;
}
export interface BookBox {
  id: number;
  shelfId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  front: boolean;
  out: boolean;
  themeId: number | null;
  tone: number; // 0..1, small colour variation
}
export interface BookcaseBox {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RoomLayout {
  width: number;
  height: number;
  bookcases: BookcaseBox[];
  levels: LevelBox[];
  books: BookBox[];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bookWidth = (id: number) => 7 + rng(id * 7919)() * 6;

export function computeRoomLayout(ix: LibraryIndex, roomId: number): RoomLayout {
  const D = DIAGRAM;
  const cases = ix.bookcasesOf.get(roomId) ?? [];
  const showLabels = cases.length > 1;

  // All bookcases in a room share one width: the widest row in the room.
  let inner: number = D.minInner;
  for (const bc of cases)
    for (const s of ix.shelvesOf.get(bc.id) ?? []) {
      const row = ix.booksOf.get(s.id) ?? [];
      const w = row.reduce((acc, b) => acc + bookWidth(b.id) + D.bookGap, 0) + 2 * D.inset;
      inner = Math.max(inner, w);
    }
  inner = Math.ceil(inner);
  const caseW = inner + 2 * D.side;

  const bookcases: BookcaseBox[] = [];
  const levels: LevelBox[] = [];
  const books: BookBox[] = [];
  let maxH = 0;

  cases.forEach((bc, ci) => {
    const x0 = ci * (caseW + D.gap);
    const backRows = (ix.shelvesOf.get(bc.id) ?? []).filter((s) => !s.frontOfShelfId);
    let y = D.top + D.board;
    for (const s of backRows) {
      const units = Math.max(1, s.heightUnits);
      const h = units * D.unit + (units - 1) * D.board; // a double level absorbs the missing board
      const front = ix.frontRowOf.get(s.id);
      const lv: LevelBox = {
        shelfId: s.id,
        name: s.name,
        kind: s.kind,
        x: x0 + D.side,
        y,
        w: inner,
        h,
        hasFrontRow: !!front && (ix.booksOf.get(front.id)?.length ?? 0) > 0,
      };
      levels.push(lv);

      const place = (shelfId: number, isFront: boolean) => {
        let x = lv.x + D.inset + (isFront ? 3 : 0);
        for (const b of ix.booksOf.get(shelfId) ?? []) {
          const r = rng(b.id * 104729 + (isFront ? 17 : 0));
          const w = bookWidth(b.id);
          const frac = isFront ? 0.4 + r() * 0.18 : 0.62 + r() * 0.3;
          const bh = Math.min(h - 4, D.unit) * frac;
          books.push({
            id: b.id,
            shelfId,
            x,
            y: y + h - bh,
            w,
            h: bh,
            front: isFront,
            out: b.status !== "shelf",
            themeId: b.themeId,
            tone: r(),
          });
          x += w + D.bookGap;
        }
      };
      if (s.kind === "books") place(s.id, false);
      if (front) place(front.id, true);
      y += h + D.board;
    }
    const caseH = y - D.top;
    bookcases.push({ id: bc.id, name: bc.name, x: x0, y: D.top, w: caseW, h: caseH });
    maxH = Math.max(maxH, y);
  });

  return {
    width: Math.max(0, cases.length * (caseW + D.gap) - D.gap),
    height: maxH + (showLabels ? D.label : 4),
    bookcases,
    levels,
    books,
  };
}
