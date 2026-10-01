"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Button, Sheet } from "@mms/ui";
import { getOldestCounterOrders } from "@/lib/floor";
import { track } from "@/lib/bounded-write";
import type { CounterFloorRow } from "@/lib/floor-types";
import type { CounterCursor } from "@/lib/register-queue";
import type { KdsThresholds } from "@/lib/kitchen-types";
import { PANE_QUERY, opensInPane } from "@/lib/floor-pane";
import type { StaffLang } from "@/lib/staff-lang";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";
import { CounterOrderCard } from "./CounterOrderCard";
import { sheetCloseLabel } from "./SheetCloseLabel";

/** `focusAt`'s sentinel for the status line (no row to focus — a retried page one came back empty). */
const FOCUS_STATUS = -1;

/** One sheet row: the order as the floor draws it, and the DB clock its page was judged on. */
type Item = { order: CounterFloorRow; serverNow: string };

/**
 * What the sheet is doing. `loading` is the first page (or its retry), `more` a later page; a
 * failure keeps the cursor it failed on (`after`), so Try again re-asks for exactly that page and the
 * rows already shown stay put.
 */
type Phase =
  // `retry` — page one asked again from a failure: its Try again stays in the slot (busy), so the
  // button that holds focus is never removed under it (Phase 2g review, A11Y-8).
  | { kind: "loading"; retry?: boolean }
  | { kind: "more" }
  | { kind: "ready" }
  | { kind: "failed"; after: CounterCursor | null };

/**
 * Phase 2g · P2fz — EVERY open counter order, oldest first. The floor's counter read keeps the
 * newest forty (`REGISTER_QUEUE_CAP`), so the orders it drops — the oldest, almost always food nobody
 * came for (P2fk) — had no view at all; this sheet is that view, opened from the floor's "See the
 * oldest orders" door.
 *
 *  - Reads `getOldestCounterOrders` — a gated Server Action over the floor's own predicate,
 *    keyset-paged on `(created_at, session_id)` — page one on open. The parent mounts the sheet
 *    fresh on EVERY open (keyed), so a reopen is a fresh read: an order paid or removed since is
 *    gone, never a stale row. It is never on the floor's 5-second poll.
 *  - "Show more" APPENDS the next page, read from the cursor the server returned with the last page
 *    (its last row), and moves focus to the first new row — the rows already read stay where they
 *    were, and a keyboard or screen-reader user lands on what arrived.
 *  - Each row is the floor's own card (`CounterOrderCard`, `opens="page"`): a plain click at split
 *    width opens the order in the counter's PANE and closes the sheet (`onPaneOpen`, the parent's);
 *    below 48em, or a modified click, it is the real link to the order's page. Either way the place
 *    it lands is where the order is paid for or, if nobody is coming, removed (the no-show).
 *  - ONE status region in the sheet: loading, the outage sentence, the end of the list. Try again
 *    and Show more sit OUTSIDE it (no control inside a live region). A refused session or a locked
 *    console leaves exactly as the floor does (`location.assign`). No animation of its own.
 */
export function CounterOlderSheet({
  open,
  onOpenChange,
  onPaneOpen,
  onCloseAutoFocus,
  lang,
  thresholds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A row asked to open in the pane (split width, plain click) — the parent opens it and closes
   *  (unmounts) the sheet, so focus lands on the pane, not back on the door. */
  onPaneOpen: (sessionId: string) => void;
  /** The parent's close-restore (the door, or the floor heading when the door has gone). */
  onCloseAutoFocus: (event: Event) => void;
  lang: StaffLang;
  thresholds: KdsThresholds;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<CounterCursor | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // The tap-time guard: two taps inside one frame both read the render before `phase` moved.
  const inFlight = useRef(false);
  // A page that lands after the sheet unmounted (the action has no AbortController) must not set
  // state; re-armed at setup, because StrictMode replays the effect as cleanup → setup.
  const alive = useRef(true);
  const listRef = useRef<HTMLUListElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // Index of the first row a "Show more" appended: focus moves there once it has rendered.
  const focusAt = useRef<number | null>(null);

  // Reads one page and applies it. Every state write is AFTER the await (the caller sets the busy
  // phase), so the mount effect below starts a read without a synchronous render of its own. The
  // ONE re-entry guard is here, on the ref: a second tap in the same frame reads the render from
  // before the first, so only the ref knows a page is already out.
  const request = useCallback(async (after: CounterCursor | null, retried = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Phase 2h (9d) — on the stall ledger until it answers (a hung read holds the action queue).
      const res = await track(getOldestCounterOrders({ after }));
      if (!alive.current) return;
      if (!res.ok) {
        // The floor poll's verdicts, the floor's exits.
        if (res.reason === "locked") {
          window.location.assign("/staff/lock");
          return;
        }
        if (res.reason === "signin") {
          window.location.assign("/staff/login");
          return;
        }
        setPhase({ kind: "failed", after });
        return;
      }
      const page = res.rows.map((order) => ({ order, serverNow: res.serverNow }));
      if (after === null) {
        // A RETRIED page one: the Try again that held focus leaves with the failure — focus moves to
        // the first row, or to the status line when there is none (never dropped to the sheet).
        if (retried) focusAt.current = page.length > 0 ? 0 : FOCUS_STATUS;
        setItems(page);
      } else
        setItems((cur) => {
          // APPENDED, never replaced — and focus goes to the first new row once it is drawn.
          focusAt.current = page.length > 0 ? cur.length : null;
          return [...cur, ...page];
        });
      setNext(res.more ? res.next : null);
      setPhase({ kind: "ready" });
    } catch (e) {
      // A dropped socket is not a verdict on the orders: say so, keep what is shown, offer the retry.
      console.error("[CounterOlderSheet] page read failed", e);
      if (alive.current) setPhase({ kind: "failed", after });
    } finally {
      inFlight.current = false;
    }
  }, []);

  // A tap: the busy phase first (Show more reads busy at once), then the read (which refuses a
  // second one while a page is out).
  const load = (after: CounterCursor | null, retried = false) => {
    setPhase(after === null ? { kind: "loading", retry: retried } : { kind: "more" });
    void request(after, retried);
  };

  // Page one, once per mount (the parent remounts the sheet on every open; the initial phase is
  // already "loading"). Scheduled, not called in the effect body: the read's state lands from a
  // callback (no synchronous setState in an effect — `CounterSplit`'s hash seed does the same).
  useEffect(() => {
    alive.current = true;
    const first = setTimeout(() => void request(null), 0);
    return () => {
      clearTimeout(first);
      alive.current = false;
    };
  }, [request]);

  // After an append, focus the first new row's card (its link).
  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    if (at === FOCUS_STATUS) statusRef.current?.focus();
    else listRef.current?.querySelectorAll<HTMLElement>(":scope > li > a")[at]?.focus();
  }, [items]);

  const openRow = (sessionId: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const split = typeof window.matchMedia === "function" && window.matchMedia(PANE_QUERY).matches;
    if (
      !opensInPane({
        split,
        button: e.button,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
      })
    )
      return; // the real link: the order's own page (a phone, a new tab)
    e.preventDefault();
    onPaneOpen(sessionId);
  };

  const busy = phase.kind === "loading" || phase.kind === "more";
  const status =
    phase.kind === "loading" || phase.kind === "more" ? (
      <Chrome lang={lang} k="floor.counter.older.loading" />
    ) : phase.kind === "failed" ? (
      <span style={{ color: "var(--warn)" }}>
        <Chrome lang={lang} k="floor.counter.older.outage" />
      </span>
    ) : items.length === 0 ? (
      <Chrome lang={lang} k="floor.counter.older.none" />
    ) : next === null ? (
      <Chrome lang={lang} k="floor.counter.older.end" />
    ) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      closeLabel={sheetCloseLabel(lang)}
      onCloseAutoFocus={onCloseAutoFocus}
      title={<Chrome lang={lang} k="floor.counter.older.title" echo="stack" />}
    >
      <div style={{ marginTop: "var(--s2)" }}>
        <p style={sub}>
          <Chrome lang={lang} k="floor.counter.older.sub" echo="stack" />
        </p>
        <ul
          ref={listRef}
          role="list"
          aria-label={sx(lang, "floor.counter.older.a11y.list")}
          style={list}
        >
          {items.map((it) => (
            <li key={it.order.sessionId}>
              <CounterOrderCard
                order={it.order}
                serverNow={it.serverNow}
                lang={lang}
                thresholds={thresholds}
                frozen={false}
                opens="page"
                onOpen={openRow(it.order.sessionId)}
              />
            </li>
          ))}
        </ul>
        {/* The sheet's ONE region: what the list is doing, or that it is all there is. */}
        <p role="status" style={region} ref={statusRef} tabIndex={-1}>
          {status}
        </p>
        {phase.kind === "failed" || (phase.kind === "loading" && phase.retry === true) ? (
          <Button
            variant="secondary"
            block
            busy={phase.kind === "loading"}
            onClick={() => {
              if (phase.kind === "failed") load(phase.after, phase.after === null);
            }}
          >
            <Chrome lang={lang} k="floor.counter.older.retry" echo="stack" />
          </Button>
        ) : next !== null || phase.kind === "more" ? (
          <Button
            variant="secondary"
            block
            busy={busy}
            onClick={() => {
              if (next !== null) load(next);
            }}
          >
            <Chrome lang={lang} k="floor.counter.older.more" echo="stack" />
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

const sub: CSSProperties = { margin: 0, fontSize: "var(--fs-sm)", color: "var(--t2)" };
const list: CSSProperties = {
  listStyle: "none",
  margin: "var(--s3) 0 0",
  padding: 0,
  display: "grid",
  gap: "var(--s3)",
};
const region: CSSProperties = {
  margin: "var(--s3) 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
