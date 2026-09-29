/**
 * Phase 2d · split (K24) — the counter's tablet split, as pure decisions.
 *
 * On a tablet the counter screen (`/staff?floor=1`) becomes a master-detail: the floor in the main
 * column, the SELECTED table in a pane beside it. The selection lives in the URL HASH
 * (`/staff?floor=1#table-<uuid>`) — Back fires `hashchange`, a reload keeps it, a link can name it,
 * and no route or layout changes. Everything the components decide about that hash, the history
 * entries, the focus after a close and the pane's words is here, so a VALUE can falsify each rule
 * (verify:slice mutates this module).
 *
 * The hash carries a session UUID and nothing else: it grants no authority. Every read the pane makes
 * is `getTableDetail`, staff-gated on the server, and every write is the existing gated action.
 */
import { STAFF_DOOR_TARGET } from "./staff-door";
import type { LiveBoardState } from "./live-connection";
import type { Handoff } from "./register-ui";
import type { StaffKey } from "./i18n/staff";

/** Side by side from here (JS reads it at CLICK time). Parity-tested against globals.css. */
export const PANE_QUERY = "(min-width: 48em)";
/** The pane column is ALWAYS there from here (the empty state). CSS-only; parity-tested. */
export const PANE_IDLE_QUERY = "(min-width: 64em)";

/** The floor's own heading — the hash a close leaves behind when it cannot walk back. */
export const FLOOR_HASH = "#floor-h";

const TABLE_HASH = /^#table-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `#table-<uuid>` → the session id (lowercased); anything else → null. */
export function paneFromHash(raw: string): string | null {
  const m = TABLE_HASH.exec(raw);
  return m ? m[1]!.toLowerCase() : null;
}

export function paneHash(id: string): `#table-${string}` {
  return `#table-${id}`;
}

/** The counter screen with this table open beside the floor. `settle` asks the pane to land on the
 *  payment section once (the order pad's Take payment), then the param is dropped. */
export function paneUrl(id: string, opts: { settle?: boolean } = {}): string {
  return `${STAFF_DOOR_TARGET.counter}${opts.settle ? "&settle=1" : ""}${paneHash(id)}`;
}

/**
 * The selection a hash names. A table hash → its id; '' or the floor heading → none; any OTHER hash
 * (a zone jump such as the approvals circle's `#appr-h`) keeps the current table at split width — a
 * manager approving a void for Table 7 keeps Table 7 beside the queue — and clears it below 48em,
 * where the pane covers the whole column and the zone could not be seen.
 */
export function paneSelectionFromHash(
  hash: string,
  current: string | null,
  split: boolean,
): string | null {
  const id = paneFromHash(hash);
  if (id !== null) return id;
  if (hash === "" || hash === "#" || hash === FLOOR_HASH) return null;
  return split ? current : null;
}

/** Did THIS mount push the entry we are on? Next drops custom `history.state`, so ownership is the
 *  hash AND the history length recorded at the push — the hash alone matches a re-pushed copy. */
export function paneOwned(p: {
  pushed: { hash: string; len: number } | null;
  currentHash: string;
  historyLength: number;
}): boolean {
  return p.pushed !== null && p.pushed.hash === p.currentHash && p.pushed.len === p.historyLength;
}

export type PaneHistoryOp = {
  op: "none" | "push" | "replace" | "back";
  hash?: string;
  keepOwnership: boolean;
};

/**
 * One entry deep (owner decision 5c): opening a table PUSHES one entry, switching tables REPLACES
 * it, closing walks BACK over it — only when this mount pushed it; otherwise it replaces to the
 * floor heading (never to an empty hash, and never a same-hash neighbour: two neighbouring entries
 * with one hash hang the view-transition library for ~4s on Back).
 */
export function paneHistoryOp(i: {
  from: string | null;
  to: string | null;
  currentHash: string;
  owned: boolean;
}): PaneHistoryOp {
  if (i.from === i.to) return { op: "none", keepOwnership: true };
  if (i.to !== null && i.currentHash === paneHash(i.to)) return { op: "none", keepOwnership: true };
  if (i.to !== null && i.from === null)
    return { op: "push", hash: paneHash(i.to), keepOwnership: false };
  if (i.to !== null) return { op: "replace", hash: paneHash(i.to), keepOwnership: i.owned };
  if (i.owned) return { op: "back", keepOwnership: false };
  return { op: "replace", hash: FLOOR_HASH, keepOwnership: false };
}

/** A history entry Next never saw (a native fragment jump: its state carries no `__NA`) must be
 *  adopted into Next's canonical URL, or the next revalidating action re-pushes a stale URL. */
export function needsCanonicalSync(state: unknown): boolean {
  return !(
    typeof state === "object" &&
    state !== null &&
    Boolean((state as { __NA?: unknown }).__NA)
  );
}

/**
 * Is the counter's own column on screen? Below 48em a selected table TAKES the column (the floor and
 * the lane stay mounted and polling, just not displayed — `globals.css` "Phase 2d · split"), so the
 * floor card's ring and chip and the lane card's badge are not there to see. The bell reads this at
 * the instant of a ring: sound is never the only feedback (§15).
 */
export function counterColumnShown(p: { paneOpen: boolean; split: boolean }): boolean {
  return !p.paneOpen || p.split;
}

/** A card tap opens in the pane only at split width, for a plain primary click nobody handled. */
export function opensInPane(e: {
  split: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    e.split &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey &&
    !e.defaultPrevented
  );
}

/** Escape closes the pane — never over a sheet that handled it, mid-composition (a Burmese IME),
 *  or from inside a field the person is typing in. */
export function paneEscapeCloses(k: {
  key: string;
  defaultPrevented: boolean;
  isComposing: boolean;
  targetEditable: boolean;
}): boolean {
  return k.key === "Escape" && !k.defaultPrevented && !k.isComposing && !k.targetEditable;
}

/** A read (or a live pane's `closed`) applies only to the table still selected. */
export function acceptPaneRead(requested: string, selected: string | null): boolean {
  return requested === selected;
}

/**
 * Where focus goes after the pane closes. A CLEARED table's card is still in the DOM until the
 * floor's next poll, so focus goes to the floor heading, never onto a card about to vanish. A close
 * by a control lands on the table's card (else the heading). A close by history (Back) moves focus
 * only when it was inside the pane or already lost to <body> — never away from where the person is.
 */
export function paneFocusAfterClose(i: {
  via: "control" | "history";
  reason: "user" | "cleared";
  focusInPane: boolean;
  activeIsBody: boolean;
  cardInDom: boolean;
}): "card" | "floorHeading" | "stay" {
  if (i.reason === "cleared") return "floorHeading";
  if (i.via === "history" && !i.focusInPane && !i.activeIsBody) return "stay";
  return i.cardInDom ? "card" : "floorHeading";
}

/** The freeze is ONE fact on the counter screen: the pane speaks its own only while the floor's
 *  region is not already speaking it (the lane's rule, ExpoBoard). The line always SHOWS. */
export function paneFreezeSpoken(floor: LiveBoardState | undefined): boolean {
  return floor !== "not_updating";
}

/** A first read that failed, by CAUSE. Neither sends anyone to paper: that is the whole-screen
 *  shell's sentence, and the floor beside the pane may be live. */
export function paneFailKeys(cause: "outage" | "unknown"): { title: StaffKey; sub: StaffKey } {
  return cause === "outage"
    ? { title: "out.shell.title", sub: "out.tail.reconnecting" }
    : { title: "floor.pane.fail.title", sub: "out.tail.reconnecting" };
}

/**
 * What the pane's ONE region says while no detail (which carries its own) is mounted. A lost write
 * outranks (it is about a table the person already left); then the read's own state. Loading is
 * said only when the head does not already carry it: a tapped card names the table at once, so the
 * head's sr-only "Loading…" never renders and focus lands on a bare name over a skeleton — while a
 * deep link's unnamed head IS the loading line, and saying it again would say it twice.
 */
export function paneStatusSays(p: {
  lost: boolean;
  read: "loading" | "closed" | "fail" | null;
  headNamed: boolean;
}): "lost" | "loading" | "closed" | "fail" | null {
  if (p.lost) return "lost";
  if (p.read === "loading") return p.headNamed ? "loading" : null;
  return p.read;
}

/** A closed table's LIVE namesake on the floor (a new party at Table 7), for "Open the current
 *  Table 7". Never the closed session itself; never for a counter order (`reg-` names no place). */
export function liveTwinOf(
  closed: { sessionId: string; label: string },
  live: ReadonlyArray<{ sessionId: string; label: string }>,
): string | null {
  if (closed.label.startsWith("reg-")) return null;
  const twin = live.find((t) => t.label === closed.label && t.sessionId !== closed.sessionId);
  return twin ? twin.sessionId : null;
}

/** The paid card follows its table across a switch: this tab's sessionStorage, `mms-*:{id}`. */
export function handoffStashKey(sessionId: string): string {
  return `mms-handoff:${sessionId}`;
}

const cents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * The stash, validated field by field in register's CANONICAL shape (plan: register × tablet-split).
 * DISPLAY-ONLY: it re-renders the server's settle result verbatim and authorizes nothing, so
 * anything malformed is simply no card.
 */
export function parseHandoffStash(raw: string | null): Handoff | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.orderId !== "string" || o.orderId === "") return null;
  if (!cents(o.totalCents)) return null;
  if (o.tipCents !== null && !cents(o.tipCents)) return null;
  if (o.tenderedCents !== null && !cents(o.tenderedCents)) return null;
  if (typeof o.isCounter !== "boolean") return null;
  if (o.cartId !== null && (typeof o.cartId !== "string" || o.cartId === "")) return null;
  return {
    orderId: o.orderId,
    totalCents: o.totalCents,
    tipCents: o.tipCents as number | null,
    tenderedCents: o.tenderedCents as number | null,
    isCounter: o.isCounter,
    cartId: o.cartId as string | null,
  };
}

/**
 * Where a way back to a table goes, decided at TAP time: the pane on the counter screen at split
 * width, the full table page below it. `settle` lands on the payment section once (either way).
 */
export function tableDestination(id: string, opts: { split: boolean; settle?: boolean }): string {
  if (opts.split) return paneUrl(id, { settle: opts.settle });
  return `/staff/table/${id}${opts.settle ? "?settle=1" : ""}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session = (): Store | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // deliberate: a blocked storage accessor THROWS in some privacy modes
  }
};

/** Write the paid card for its table. Every storage failure is a deliberate swallow: the card on
 *  screen is in-memory state; the stash only lets it follow the table across a switch. */
export function stashHandoff(sessionId: string, h: Handoff, store: Store | null = session()): void {
  try {
    store?.setItem(handoffStashKey(sessionId), JSON.stringify(h));
  } catch {
    /* deliberate: quota or privacy mode — the in-memory card still shows */
  }
}

export function readHandoffStash(
  sessionId: string,
  store: Store | null = session(),
): Handoff | null {
  try {
    return parseHandoffStash(store?.getItem(handoffStashKey(sessionId)) ?? null);
  } catch {
    return null; // deliberate: unreadable storage is no card
  }
}

export function dropHandoffStash(sessionId: string, store: Store | null = session()): void {
  try {
    store?.removeItem(handoffStashKey(sessionId));
  } catch {
    /* deliberate: nothing to remove from storage that cannot be read */
  }
}
