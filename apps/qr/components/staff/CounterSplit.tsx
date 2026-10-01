"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  FLOOR_HASH,
  PANE_QUERY,
  counterColumnShown,
  dropHandoffStash,
  nextLost,
  needsCanonicalSync,
  opensInPane,
  paneFocusAfterClose,
  paneFromHash,
  paneHistoryOp,
  paneOwned,
  paneSelectionFromHash,
  type LostKind,
} from "@/lib/floor-pane";
import { haptic } from "@/lib/haptics";
import { useCounterBellCover } from "./CounterBell";
import { useReaderCollectOptional } from "./ReaderCollectContext";
import type { TableHint } from "./TableNav";
import { TablePane } from "./TablePane";
import {
  TablePaneContext,
  type CloseReason,
  type PaneRow,
  type TablePaneApi,
} from "./TablePaneContext";

/**
 * Phase 2d · split (K24) — the counter screen's tablet split: ONE mounted tree around the counter's
 * zones (`.staff-split-main`) and the selected table's pane beside it (`TablePane`). CSS decides the
 * shape per width (`globals.css` "Phase 2d · split"); a rotation reflows, it never remounts the
 * boards (the bell's seam: no second provider, no board remount across a breakpoint).
 *
 * The selection is the URL HASH (`lib/floor-pane.ts`): seeded from `location.hash` after mount (the
 * server cannot see it), followed on `hashchange` (Back / Forward / a zone jump), written ONE entry
 * deep by `paneHistoryOp`. Ownership of the pushed entry is a ref ({hash, history.length}), because
 * Next drops custom `history.state`. Writes carry no `__NA`, so Next adopts the hash into its
 * canonical URL; a native fragment entry it never saw is synced on `hashchange`.
 */
/** `gen` names ONE selection of `id`: a new one per pick of a table not already shown (A → ✕ → A,
 *  A → B → A), kept by a re-tap of the table shown — a read belongs to a `gen`, never to an id. */
type Sel = { id: string; hint: TableHint | null; focus: number; gen: number };

const isSplit = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(PANE_QUERY).matches;
const urlWith = (hash: string) => `${location.pathname}${location.search}${hash}`;
const noopSubscribe = () => () => {};

export function CounterSplit({
  terminalReady,
  children,
}: {
  terminalReady: boolean;
  children: ReactNode;
}) {
  // SSR and the hydration frame: `unknown` (the server cannot see the hash) — no empty-state copy.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [sel, setSel] = useState<Sel | null>(null);
  const selRef = useRef<Sel | null>(null);
  const pushed = useRef<{ hash: string; len: number } | null>(null);
  const [rows, setRows] = useState<readonly PaneRow[]>([]);
  const rowsRef = useRef<readonly PaneRow[]>([]);
  const [lostWrite, setLostWrite] = useState<{
    sessionId: string;
    hint: TableHint;
    kind: LostKind;
  } | null>(null);
  // `?settle=1` (the order pad's Take payment, carried into the pane) — consumed ONCE.
  const [settleOnce, setSettleOnce] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<{ target: "card" | "floorHeading"; id: string } | null>(null);
  const [closeSeq, setCloseSeq] = useState(0);
  const focusSeq = useRef(0);
  const genSeq = useRef(0);
  // Phase 2d · Codex round 1 — a close is a move too: the floor, shown, takes its own `gen` from
  // the same count, so the API's `selectionGen` is new on EVERY move and never comes back.
  const [floorGen, setFloorGen] = useState(0);
  // ── Phase 2g · reader (D1) ── the pane no longer HOLDS a table whose reader collects, and no start
  // is refused for one: the collect lives in `ReaderCollectProvider` above every staff route, so a
  // switch, a close, Back, a mint landing — none of them stops its poll any more (P2em), and a lone
  // cashier takes the next walk-up while a guest fumbles a card (P2er · P2es retire with the holds).

  // Phase 2d · review fixes — below 48em a selected table covers the counter's column, and the
  // bell's visible half with it: the bell asks this at the instant of each ring (never captured —
  // a rotation reflows the split without a render).
  const bellCovered = useCallback(
    () => !counterColumnShown({ paneOpen: selRef.current !== null, split: isSplit() }),
    [],
  );
  useCounterBellCover(bellCovered);

  const hintFor = useCallback(
    (id: string): TableHint | null => rowsRef.current.find((r) => r.sessionId === id)?.hint ?? null,
    [],
  );

  /** Select `id` — the ONE admission point. `write` = apply the history op (a tap, a merge, a
   *  twin); a hash-driven selection never writes (the URL already names it: Back / Forward). */
  const select = useCallback(
    (id: string, hint: TableHint | null, opts: { write: boolean; focus: boolean }): void => {
      const from = selRef.current?.id ?? null;
      // A11Y-3 — the opener names the card that opened THIS selection. Any other way in (the reader
      // chip's View, `openSession` from the lane or the older-orders sheet, a hash) starts with none,
      // so a later ✕ lands on the new table's own card or the floor heading — never on the card of a
      // table opened before it. A card tap sets it again right after this (`openFromCard`).
      if (from !== id) opener.current = null;
      if (opts.write) {
        const currentHash = location.hash;
        const owned = paneOwned({
          pushed: pushed.current,
          currentHash,
          historyLength: history.length,
        });
        const op = paneHistoryOp({ from, to: id, currentHash, owned });
        if (op.op === "push" && op.hash) {
          history.pushState({}, "", urlWith(op.hash));
          pushed.current = { hash: op.hash, len: history.length };
        } else if (op.op === "replace" && op.hash) {
          history.replaceState({}, "", urlWith(op.hash));
          pushed.current = op.keepOwnership ? { hash: op.hash, len: history.length } : null;
        }
      }
      const next: Sel = {
        id,
        hint: hint ?? hintFor(id),
        focus: opts.focus ? ++focusSeq.current : (selRef.current?.focus ?? 0),
        gen: from === id && selRef.current ? selRef.current.gen : ++genSeq.current,
      };
      if (from === id && !opts.focus) return;
      selRef.current = next;
      setSel(next);
      setLostWrite((lw) => (lw?.sessionId === id ? null : lw));
    },
    [hintFor],
  );

  // ── Phase 2g · reader ── the bar's reader chip opens its table HERE at split width: a router push
  // of a hash on this same page fires no `hashchange`, so the chip's link alone could never select.
  const reader = useReaderCollectOptional();
  const registerPane = reader?.registerPane;
  useEffect(() => {
    if (!registerPane) return;
    return registerPane((id, name) => select(id, name, { write: true, focus: true }));
  }, [registerPane, select]);

  /** Close — instant: the selection goes null first, then the history walks back (only over an
   *  entry THIS mount pushed) or replaces to the floor heading. Focus lands after the render. */
  const close = useCallback((reason: CloseReason, via: "control" | "history") => {
    const cur = selRef.current;
    if (!cur) return;
    const active = document.activeElement;
    const focusInPane = paneRef.current?.contains(active) ?? false;
    const openerLive = opener.current?.isConnected ? opener.current : null;
    const card = document.querySelector(`.floor-card[data-session-id="${cur.id}"]`);
    const target = paneFocusAfterClose({
      via,
      reason,
      focusInPane,
      activeIsBody: active === document.body || active === null,
      cardInDom: openerLive !== null || card !== null,
    });
    pendingFocus.current = target === "stay" ? null : { target, id: cur.id };
    selRef.current = null;
    setSel(null);
    setFloorGen(++genSeq.current);
    // ── Phase 2d · Codex round 2 · pane ── a lost outcome STAYS: a close answers nothing about
    // it — it names a table the person left (a payment that may have to be collected again, a
    // dish that never saved), and the floor shows it at every width (`data-pane="lost"`). Only
    // going back to its table clears it (`select`), or a newer loss that outranks it (`nextLost`).
    // The paid card leaves with its table (✕, Escape, Back, Clear); a SWITCH keeps it.
    dropHandoffStash(cur.id);
    if (via === "control") {
      const currentHash = location.hash;
      const owned = paneOwned({
        pushed: pushed.current,
        currentHash,
        historyLength: history.length,
      });
      const op = paneHistoryOp({ from: cur.id, to: null, currentHash, owned });
      pushed.current = null;
      if (op.op === "back") history.back();
      else if (op.op === "replace") history.replaceState({}, "", urlWith(op.hash ?? FLOOR_HASH));
    }
    setCloseSeq((n) => n + 1);
  }, []);

  // Focus after a close, once the pane has re-rendered (the card beside it is back in the grid at
  // 48–64em). `preventScroll`: the floor never jumps under the person.
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    const openerLive = opener.current?.isConnected ? opener.current : null;
    opener.current = null;
    const card =
      openerLive ??
      document.querySelector<HTMLElement>(`.floor-card[data-session-id="${p.id}"]`) ??
      null;
    const heading = document.getElementById("floor-h");
    (p.target === "card" && card ? card : heading)?.focus({ preventScroll: true });
  }, [closeSeq]);

  // The hash: seeded after mount (scheduled — no synchronous setState in the effect), then followed.
  useEffect(() => {
    const seed = setTimeout(() => {
      const id = paneFromHash(location.hash);
      const sp = new URLSearchParams(location.search);
      const settle = sp.get("settle") === "1";
      if (settle) {
        // Consumed once: dropped from the URL (Next adopts the replace), kept for this selection.
        sp.delete("settle");
        const q = sp.toString();
        history.replaceState({}, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
      }
      if (id) {
        if (settle) setSettleOnce(id);
        select(id, null, { write: false, focus: true });
      }
    }, 0);
    const onHash = () => {
      // A native fragment entry Next never saw (the approvals circle): adopt it into Next's
      // canonical URL, or its next revalidating action re-pushes a stale `#table-*` entry.
      if (needsCanonicalSync(history.state)) history.replaceState({}, "", location.href);
      const cur = selRef.current?.id ?? null;
      const next = paneSelectionFromHash(location.hash, cur, isSplit());
      if (next === cur) return;
      if (next === null) close("user", "history");
      else select(next, null, { write: false, focus: true });
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      clearTimeout(seed);
      window.removeEventListener("hashchange", onHash);
    };
  }, [select, close]);

  const openFromCard = useCallback(
    (e: MouseEvent<HTMLElement>, sessionId: string, hint: TableHint) => {
      if (
        !opensInPane({
          split: isSplit(),
          button: e.button,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          defaultPrevented: e.defaultPrevented,
        })
      )
        return;
      e.preventDefault();
      select(sessionId, hint, { write: true, focus: true });
      haptic("pick"); // its visible half: the pane head and the card's cap, in the same frame
      opener.current = e.currentTarget;
    },
    [select],
  );

  const openSession = useCallback(
    (sessionId: string, hint: TableHint, opts?: { settle?: boolean }) => {
      if (!isSplit()) return false;
      // The `?settle=1` seed's in-place twin: kept for THIS selection, consumed once by the pane.
      if (opts?.settle) setSettleOnce(sessionId);
      select(sessionId, hint, { write: true, focus: true });
      return true;
    },
    [select],
  );

  const publishFloor = useCallback((next: readonly PaneRow[]) => {
    rowsRef.current = next;
    setRows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  // ONE identity for the mount: the pane's first-read effect lists it, so a new arrow per render
  // would re-read the table shown on every floor publish (and land a `closed` past the detail's
  // terminal hold, unmounting the reader panel before its #CODE card).
  const selectedNow = useCallback(() => selRef.current?.id ?? null, []);

  const api: TablePaneApi = {
    selectedId: sel?.id ?? null,
    selectionGen: sel ? sel.gen : floorGen,
    openFromCard,
    openSession,
    publishFloor,
  };

  return (
    <TablePaneContext.Provider value={api}>
      <div
        className="staff-col staff-col-dock staff-split"
        data-pane={!hydrated ? "unknown" : sel ? "open" : lostWrite ? "lost" : "empty"}
      >
        <div className="staff-split-main">{children}</div>
        <TablePane
          paneRef={paneRef}
          hydrated={hydrated}
          sel={sel}
          selectedNow={selectedNow}
          rows={rows}
          lostWrite={lostWrite}
          settleOnce={settleOnce}
          onSettleConsumed={() => setSettleOnce(null)}
          terminalReady={terminalReady}
          onClose={(reason) => close(reason, "control")}
          onSelect={(id, hint) => {
            select(id, hint, { write: true, focus: true });
            opener.current = null;
          }}
          onLostWrite={(sessionId, hint, kind) => {
            // Only an UNMOUNTED detail reports here (FloorDetailLive routes a refusal through this
            // only once it is no longer alive), so the report is always one no mounted region can
            // say — even when the same table is shown again (A → ✕ → A): that new detail never
            // issued the write. Never filtered by the selection. A payment's outranks a dish's.
            setLostWrite((prev) => nextLost(prev, { sessionId, hint, kind }));
          }}
        />
      </div>
    </TablePaneContext.Provider>
  );
}
