"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { Icon, type IconName } from "@mms/ui";
import { type FloorTable, tableDisplay } from "@/lib/floor-types";
import {
  createFlipGuard,
  FLIP_GUARD_MS,
  owedSendUnits,
  stripKey,
  tableStrip,
  type FlipGuard,
} from "@/lib/floor-rows";
import { floorTone, type FloorTone } from "@/lib/floor-tone";
import { al } from "@/lib/staff-labels";
import { tf } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { useCounterMint, type MintNotice } from "./CounterMint";
import { useTablePane } from "./TablePaneContext";
// ── Phase 2h ──
import { ReloadButton } from "./ReloadOffer";

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
 * no tap can land between the two). Phase 2d · review — and the window is SAID: the tile is held
 * (`aria-disabled`, the dim every held start control wears — never a native disable) for exactly
 * the window, so the refused tap is no longer a tile that looks ready and does nothing.
 *
 * FOCUS ACROSS A FLIP. A tile that changes element type (button ↔ link) on a poll would drop focus
 * to <body>. The strip remembers the focused tile and, when that element was REPLACED under it (and
 * only then — a person who tapped elsewhere, or clicked something that takes no focus, is not pulled
 * back), focuses the new tile for the same number, without scrolling.
 *
 * THE OWED MARK AND THE KEY. A table owing a Send (the card's "not sent", `owedSendUnits`) wears a
 * warn dot in its tile's corner and says it in the tile's name; under the strip, the KEY
 * (`stripKey`) prints what each glyph on screen means, in the tile's own words — so a person who has
 * never used a POS can read a taken table without opening it. The key is `aria-hidden`: every
 * tile's name already says its word.
 *
 * The strip mounts NO live region: a refusal is handed to the board's one region (`onNotice`).
 *
 * Phase 2h (S2 critic D1) — a table start still unanswered past the bound (`waiting`) is said in the
 * board's region ("no answer yet … reload the page"), and the console is installed standalone (no
 * browser reload): the strip offers the reload at its head, under that region, until the late
 * answer lands.
 */
const GLYPH: Record<FloorTone, IconName> = {
  ask: "receipt",
  inflight: "card",
  live: "cart",
  rest: "people",
  done: "check",
  returned: "undo",
};

export function TableStrip({
  registry,
  tables,
  lang,
  onNotice,
  onWait,
}: {
  registry: readonly number[];
  tables: readonly FloorTable[];
  lang: StaffLang;
  /** The board's ONE region: a refusal lands there; `null` clears it (a new tap). */
  onNotice: (n: MintNotice | null) => void;
  /** Phase 2h · integration b — whether the strip's OWN (table) start is still unanswered past the
   *  bound: the board keeps that start's waiting line standing (no dwell) while it is. */
  onWait?: (waits: boolean) => void;
}) {
  const { minting, held, startHeld, waiting, isBusy, run } = useCounterMint();
  const tiles = tableStrip(registry, tables);
  // Phase 2h · integration b — the wait the strip OWNS (a table start's; a Walk-up's is the Start
  // zone's): its reload stands at the strip's head, and the board's line stands while it lasts.
  const tableWaits = waiting?.startsWith("table-") ?? false;
  useEffect(() => {
    onWait?.(tableWaits);
  }, [onWait, tableWaits]);
  const listRef = useRef<HTMLUListElement>(null);

  // ── the flip guard ── (the memory and its clock live in `createFlipGuard`; the strip only asks)
  const flip = useRef<FlipGuard | null>(null);
  // Phase 2d · review — the tiles inside their window, held until it closes (docblock). A tile
  // that flips again restarts its own timer; the timers die with the strip.
  const [settling, setSettling] = useState<ReadonlySet<number>>(() => new Set());
  const settleTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useLayoutEffect(() => {
    flip.current ??= createFlipGuard();
    const flipped = flip.current.observe(tiles);
    if (flipped.length === 0) return;
    setSettling((prev) => new Set([...prev, ...flipped]));
    for (const n of flipped) {
      clearTimeout(settleTimers.current.get(n));
      settleTimers.current.set(
        n,
        setTimeout(() => {
          settleTimers.current.delete(n);
          setSettling((prev) => {
            const next = new Set(prev);
            next.delete(n);
            return next;
          });
        }, FLIP_GUARD_MS),
      );
    }
  }, [tiles]); // a fresh array per render — `observe` is idempotent, it only acts on a change
  useEffect(() => {
    const timers = settleTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // ── focus across a flip ──
  const focused = useRef<{ el: HTMLElement; n: number } | null>(null);
  const onFocus = (e: FocusEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tile]");
    focused.current = el ? { el, n: Number(el.dataset.tile) } : null;
  };
  // Focus moving somewhere REAL forgets the tile. A blur with nowhere to go is one of three things,
  // told apart once the event has finished (a microtask): the tile was REMOVED (disconnected — keep
  // it, the effect below restores focus), the page lost focus (the tile is still the active element
  // — keep it), or the person clicked something that takes no focus (the tile is still here and
  // focus is not — forget it, or the next flip would pull them back).
  const onBlur = (e: FocusEvent<HTMLUListElement>) => {
    if (e.relatedTarget !== null) {
      focused.current = null;
      return;
    }
    const el = e.target as HTMLElement;
    queueMicrotask(() => {
      if (focused.current?.el !== el) return;
      if (el.isConnected && document.activeElement !== el) focused.current = null;
    });
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
        { onStart: () => onNotice(null), onRefusal: onNotice, onResolved: () => onNotice(null) },
      );
    },
    [onNotice, run],
  );
  // ── Phase 2d · split ── the counter's pane, when the strip sits on the counter screen.
  const pane = useTablePane();
  const tapOccupied = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, table: FloorTable) => {
      // A tap is navigation — but never while a start is held: a landed start's push must not be
      // raced by a second route the person did not wait for.
      if (isBusy()) {
        e.preventDefault();
        return;
      }
      // Phase 2d · split — at split width the table opens in the pane beside the floor.
      pane?.openFromCard(e, table.sessionId, {
        counter: false,
        display: tableDisplay(table).text,
      });
    },
    [isBusy, pane],
  );

  if (tiles.length === 0) return null; // an empty registry is no strip — never a dead control
  const key = stripKey(tiles);

  return (
    // The visible label names the LIST (not a wrapping group as well — one name, heard once).
    <div className="floor-strip-wrap">
      {tableWaits && (
        <div style={reloadRow}>
          <ReloadButton lang={lang} />
        </div>
      )}
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
                held={startHeld || settling.has(n)}
                busy={minting === `table-${n}`}
                onTap={() => tapFree(n)}
              />
            ) : (
              <OccupiedTile n={n} table={table} lang={lang} held={held} onTap={tapOccupied} />
            )}
          </li>
        ))}
      </ul>
      {key.entries.length > 0 || key.owed ? (
        <p className="floor-key" aria-hidden="true">
          {key.entries.map(({ tone, k }) => (
            <span key={k} className="floor-key-item" data-tone={tone}>
              <Icon name={GLYPH[tone]} size={16} strokeWidth={2.25} className="floor-key-glyph" />
              <Chrome lang={lang} k={k} />
            </span>
          ))}
          {key.owed ? (
            <span className="floor-key-item">
              <span className="floor-owed-dot" />
              <Chrome lang={lang} k="floor.key.notSent" />
            </span>
          ) : null}
        </p>
      ) : null}
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
        {/* The primitive Button's busy shape: the kit's spinner beside the KEPT label, at full ink
            (`.floor-tile[aria-busy]`), so the one tile starting stands out from the held ones. */}
        {busy ? <span className="ui-btn-spinner" aria-hidden /> : null}
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
  onTap: (e: MouseEvent<HTMLAnchorElement>, table: FloorTable) => void;
}) {
  const tone = floorTone(table.status, table.refund?.state ?? null);
  // Phase 2d · review — the `tile` arm: its `visible` IS the number rendered below ("View — Table 7
  // · Pay at counter", and "· 2 not sent" when a Send is owed — the mark is aria-hidden).
  const { visible, aria } = al(lang, {
    kind: "tile",
    n,
    status: table.status,
    refundState: table.refund?.state ?? null,
    notSent: owedSendUnits(table),
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
      onClick={(e) => onTap(e, table)}
    >
      <span className="floor-tile-n">{visible}</span>
      <Icon name={GLYPH[tone]} size={18} strokeWidth={2.25} className="floor-tile-glyph" />
      {owedSendUnits(table) > 0 ? <span className="floor-owed-dot" aria-hidden /> : null}
    </Link>
  );
}

// Phase 2h — the reload offered under the board's region, spaced off the strip label below it.
const reloadRow: CSSProperties = { display: "flex", margin: "0 0 var(--s2)" };
