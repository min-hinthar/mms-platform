"use client";
import { useCallback, useLayoutEffect, useRef, type FocusEvent } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@mms/ui";
import type { FloorTable } from "@/lib/floor-types";
import { createFlipGuard, tableStrip, type FlipGuard } from "@/lib/floor-rows";
import { floorTone, type FloorTone } from "@/lib/floor-tone";
import { al, floorStatusKey } from "@/lib/staff-labels";
import { tf } from "@/lib/i18n/fill";
import { ts } from "@/lib/i18n/staff";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useCounterMint, type MintNotice } from "./CounterMint";

/**
 * Phase 2d · floor — THE TABLE STRIP: the room's map AND its one-tap start (owner decision 5c).
 *
 * One tile per active registered table, from the SAME snapshot the cards render, so a tile and its
 * card never disagree. A FREE tile is a button — the number over "Start" on a dashed seat-shaped
 * edge — and one tap starts the table through the screen's ONE mint lock (`useCounterMint`). An
 * OCCUPIED tile is a link to the table: the number over a glyph, its tone (`floorTone`) carried by a
 * bottom bar AND the glyph (never colour alone), and the ask — a table waiting to pay at the counter
 * — the one filled tile.
 *
 * THE FLIP GUARD. A tile that turned free within `FLIP_GUARD_MS` ignores a tap: another tablet
 * cleared that table between polls, and the person was reaching for the occupied tile to OPEN it.
 * The flip is recorded when it commits (a layout effect — before the browser paints the new tile, so
 * no tap can land between the two).
 *
 * FOCUS ACROSS A FLIP. A tile that changes element type (button ↔ link) on a poll would drop focus
 * to <body>. The strip remembers the focused tile and, when that element was REPLACED under it (and
 * only then — a person who tapped elsewhere is not pulled back), focuses the new tile for the same
 * number, without scrolling.
 *
 * The strip mounts NO live region: a refusal is handed to the board's one region (`onNotice`).
 */
const GLYPH: Record<FloorTone, IconName> = {
  ask: "receipt",
  inflight: "card",
  live: "cart",
  rest: "people",
  done: "check",
  returned: "undo",
};

/** The occupied tile's name: "View — Table 7 · Pay at counter" — the status word the chip shows. */
function occupiedSubject(lang: StaffLang, n: number, table: FloorTable): string {
  const word = ts(lang, floorStatusKey(table.status, table.refund?.state ?? null));
  return `${tf(lang, "floor.table", { id: String(n) })} · ${word}`;
}

export function TableStrip({
  registry,
  tables,
  lang,
  onNotice,
}: {
  registry: readonly number[];
  tables: readonly FloorTable[];
  lang: StaffLang;
  /** The board's ONE region: a refusal lands there; `null` clears it (a new tap). */
  onNotice: (n: MintNotice | null) => void;
}) {
  const { minting, held, isBusy, run } = useCounterMint();
  const tiles = tableStrip(registry, tables);
  const listRef = useRef<HTMLUListElement>(null);

  // ── the flip guard ── (the memory and its clock live in `createFlipGuard`; the strip only asks)
  const flip = useRef<FlipGuard | null>(null);
  useLayoutEffect(() => {
    flip.current ??= createFlipGuard();
    flip.current.observe(tiles);
  });

  // ── focus across a flip ──
  const focused = useRef<{ el: HTMLElement; n: number } | null>(null);
  const onFocus = (e: FocusEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tile]");
    focused.current = el ? { el, n: Number(el.dataset.tile) } : null;
  };
  // Focus moving somewhere REAL forgets the tile; a blur with nowhere to go (the element was
  // removed, or the page lost focus) keeps it, so the effect below can tell the two apart.
  const onBlur = (e: FocusEvent<HTMLUListElement>) => {
    if (e.relatedTarget !== null) focused.current = null;
  };
  useLayoutEffect(() => {
    const f = focused.current;
    if (f === null || f.el.isConnected) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const next = listRef.current?.querySelector<HTMLElement>(`[data-tile="${f.n}"]`) ?? null;
    if (next === null) {
      focused.current = null;
      return;
    }
    next.focus({ preventScroll: true });
    focused.current = { el: next, n: f.n };
  });

  const tapFree = useCallback(
    (n: number) => {
      // The tap-time guards: the flip here, then one start at a time on the whole screen — which
      // the lock alone admits (a refused tap changes nothing; a start clears the last notice).
      if (flip.current !== null && !flip.current.allows(n)) return;
      run(
        `table-${n}`,
        { kind: "table", tableNumber: n },
        { onStart: () => onNotice(null), onRefusal: onNotice },
      );
    },
    [onNotice, run],
  );
  const tapOccupied = useCallback(
    (e: { preventDefault: () => void }) => {
      // A tap is navigation — but never while a start is held: a landed start's push must not be
      // raced by a second route the person did not wait for.
      if (isBusy()) e.preventDefault();
    },
    [isBusy],
  );

  if (tiles.length === 0) return null; // an empty registry is no strip — never a dead control

  return (
    // The visible label names the LIST (not a wrapping group as well — one name, heard once).
    <div className="floor-strip-wrap">
      <p id="floor-strip-h" className="floor-strip-label">
        <Chrome lang={lang} k="floor.strip.label" />
      </p>
      <ul
        ref={listRef}
        role="list"
        aria-labelledby="floor-strip-h"
        className="floor-strip"
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {tiles.map(({ n, table }) => (
          <li key={n}>
            {table === null ? (
              <FreeTile
                n={n}
                lang={lang}
                held={held}
                busy={minting === `table-${n}`}
                onTap={() => tapFree(n)}
              />
            ) : (
              <OccupiedTile n={n} table={table} lang={lang} held={held} onTap={tapOccupied} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FreeTile({
  n,
  lang,
  held,
  busy,
  onTap,
}: {
  n: number;
  lang: StaffLang;
  held: boolean;
  busy: boolean;
  onTap: () => void;
}) {
  const { aria } = al(lang, {
    kind: "verb",
    verb: "floor.verb.start",
    subject: tf(lang, "floor.table", { id: String(n) }),
  });
  return (
    <button
      type="button"
      className="floor-tile staff-press"
      data-free=""
      data-tile={n}
      aria-label={aria}
      aria-disabled={held || undefined}
      aria-busy={busy || undefined}
      onClick={onTap}
    >
      <span className="floor-tile-n">{n}</span>
      <span className="floor-tile-verb">
        <Chrome lang={lang} k="floor.verb.start" />
      </span>
    </button>
  );
}

function OccupiedTile({
  n,
  table,
  lang,
  held,
  onTap,
}: {
  n: number;
  table: FloorTable;
  lang: StaffLang;
  held: boolean;
  onTap: (e: { preventDefault: () => void }) => void;
}) {
  const tone = floorTone(table.status, table.refund?.state ?? null);
  const { aria } = al(lang, {
    kind: "subject",
    verb: "floor.verb.view",
    subject: occupiedSubject(lang, n, table),
  });
  return (
    <Link
      href={`/staff/table/${table.sessionId}`}
      className="floor-tile staff-press"
      data-tone={tone}
      data-tile={n}
      data-session-id={table.sessionId}
      aria-label={aria}
      aria-disabled={held || undefined}
      onClick={onTap}
    >
      <span className="floor-tile-n">{n}</span>
      <Icon name={GLYPH[tone]} size={18} strokeWidth={2.25} className="floor-tile-glyph" />
    </Link>
  );
}
