"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLibrary } from "./LibraryProvider";
import { useFormat } from "./useFormat";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { computeRoomLayout, DIAGRAM, rng, type LevelBox } from "@/lib/diagram-layout";

interface Props {
  roomId: number;
  highlightId?: number;
  /** Scroll to this bookcase (used by the QR codes). */
  focusBookcaseId?: number;
  /** Tap a book to open it (default true). */
  interactive?: boolean;
}

const PAD = 10;

/** Room drawn as it really is: bookcases side by side, one rectangle per book, highlight on one. */
export function Diagram({ roomId, highlightId, focusBookcaseId, interactive = true }: Props) {
  const { ix } = useLibrary();
  const { t } = useI18n();
  const fmt = useFormat();
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => computeRoomLayout(ix, roomId), [ix, roomId]);
  const target = highlightId != null ? layout.books.find((b) => b.id === highlightId) : undefined;
  const room = ix.room.get(roomId);

  // Default zoom: one bookcase fills the screen width. "Zoom in" shows books at full size.
  const [boxW, setBoxW] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const caseW = layout.bookcases[0]?.w ?? layout.width;
  const fit = boxW ? Math.min(1, (boxW - 2 * PAD) / caseW) : 0.4;
  const scale = zoomed ? 1 : fit;

  // Scroll so the highlighted book is in the middle of the visible area.
  const first = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !boxW) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = 0;
    const focus = !target && focusBookcaseId ? layout.bookcases.find((b) => b.id === focusBookcaseId) : undefined;
    if (focus) x = PAD + focus.x * scale - Math.max(0, (el.clientWidth - focus.w * scale) / 2);
    if (target) {
      // Show the whole bookcase that holds the book when it fits; otherwise centre the book.
      const bc = layout.bookcases.find((b) => target.x >= b.x && target.x < b.x + b.w);
      x =
        bc && bc.w * scale <= el.clientWidth
          ? PAD + bc.x * scale - (el.clientWidth - bc.w * scale) / 2
          : PAD + (target.x + target.w / 2) * scale - el.clientWidth / 2;
    }
    el.scrollTo({ left: Math.max(0, x), behavior: reduce || first.current ? "auto" : "smooth" });
    first.current = false;
  }, [target, scale, boxW, layout, focusBookcaseId]);

  if (!room) return null;
  const highlighted = highlightId != null ? ix.book.get(highlightId) : undefined;
  const label = highlighted
    ? t("diagramLabel", { room: room.name, where: fmt.placeText(fmt.placement(highlighted)) })
    : t("diagramRoom", { room: room.name });

  return (
    <figure className="diagram">
      <div className="diagram-scroll" ref={scroller}>
        <div className="diagram-inner" style={{ padding: `0 ${PAD}px` }}>
        <svg
          width={layout.width * scale}
          height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={label}
          className={target ? "has-hl" : undefined}
        >
          {layout.bookcases.map((bc) => (
            <g key={bc.id}>
              <rect className="case" x={bc.x} y={bc.y} width={bc.w} height={bc.h} rx={2} />
              {layout.bookcases.length > 1 && (
                <text className="case-label" x={bc.x + bc.w / 2} y={bc.y + bc.h + 24} textAnchor="middle" style={{ fontSize: 13 / Math.max(scale, 0.6) }}>
                  {bc.name}
                </text>
              )}
            </g>
          ))}
          {layout.levels.map((lv) => (
            <Level key={lv.shelfId} lv={lv} scale={scale} label={lv.kind === "books" ? "" : t(`kind_${lv.kind}` as MessageKey)} />
          ))}
          {layout.books.map((b) => {
            const hue = ((b.themeId ?? 0) * 47) % 360;
            const cls = [
              "bk",
              b.front ? "front" : "",
              b.out ? "out" : "",
              b.id === highlightId ? "hl" : "",
              !b.front && layout.levels.find((l) => l.shelfId === b.shelfId)?.hasFrontRow ? "behind" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <rect
                key={b.id}
                className={cls}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={1}
                style={{ "--h": hue, "--t": Math.round(b.tone * 14 - 7) } as React.CSSProperties}
                onClick={interactive ? () => router.push(`/book/${b.id}`) : undefined}
              />
            );
          })}
          {target && (
            <g className="marker" aria-hidden>
              <rect className="bk hl top" x={target.x} y={target.y} width={target.w} height={target.h} rx={1} />
              <path
                d={`M ${target.x + target.w / 2 - 7} ${target.y - 14} h 14 l -7 9 z`}
                className="arrow"
              />
            </g>
          )}
        </svg>
        </div>
      </div>
      {fit < 1 && (
        <button className="btn btn-small" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed}>
          {zoomed ? t("zoomOut") : t("zoomIn")}
        </button>
      )}
    </figure>
  );
}

function Level({ lv, label, scale }: { lv: LevelBox; label: string; scale: number }) {
  const items: React.ReactNode[] = [];
  const r = rng(lv.shelfId * 31337);
  if (lv.kind === "notes") {
    for (let x = lv.x + 6; x < lv.x + lv.w - 20; x += 22)
      items.push(<rect key={x} className="thing" x={x} y={lv.y + 8} width={18} height={lv.h - 8} rx={2} />);
  } else if (lv.kind === "albums") {
    for (let x = lv.x + 6; x < lv.x + lv.w - 70; x += 80)
      for (let k = 0; k < 3; k++)
        items.push(
          <rect key={`${x}-${k}`} className="thing" x={x} y={lv.y + lv.h - 12 * (k + 1)} width={70} height={11} rx={1} />,
        );
  } else if (lv.kind === "toys" || lv.kind === "other") {
    for (let x = lv.x + 10; x < lv.x + lv.w - 40; x += 40 + r() * 30) {
      const s = 14 + r() * 24;
      items.push(
        r() > 0.5 ? (
          <circle key={x} className="thing" cx={x + s / 2} cy={lv.y + lv.h - s / 2} r={s / 2} />
        ) : (
          <rect key={x} className="thing" x={x} y={lv.y + lv.h - s} width={s} height={s} rx={4} />
        ),
      );
    }
  }
  return (
    <g>
      <rect className="level" x={lv.x} y={lv.y} width={lv.w} height={lv.h} />
      {items}
      {label && (
        <text className="level-label" x={lv.x + lv.w / 2} y={lv.y + DIAGRAM.unit * 0.45} textAnchor="middle" style={{ fontSize: 13 / scale }}>
          {label}
        </text>
      )}
    </g>
  );
}
