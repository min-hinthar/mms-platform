import type { DictKey } from "./i18n";
import { REGISTER_SETTLING_COPY } from "./counter-pay-state";

/**
 * Session truth (the order-lifecycle audit's session stream, 2026-10-13): a diner is never silently
 * cut off, frozen or re-minted.
 *
 * ## The defect this module ends
 *
 * A table can stop answering a phone in four ways that no event reaches: a staff Clear
 * (`mms_clear_table` cancels the cart AND closes the session in one transaction), a Merge into
 * another table (the source cart cancelled, the source session closed), the 4-hour sweep, and the
 * table paying (the cart turns `paid`; the session lives on). The first three close the session, so
 * `is_member` is already false when Realtime authorizes the change and the phone gets no event at
 * all. Every later read then throws `cart_closed`, and `/menu` SWALLOWED it: the strip kept saying
 * "Mohinga is being made" over a dish the clear had voided, and the next tap re-minted the session
 * and announced "Your table sat idle too long" — false for a clear, a merge and a paid table — with
 * the tapped dish lost. A sticker-entered phone re-minted onto the SAME sticker, re-hosting a table
 * staff had just freed (M172).
 *
 * ## The mechanism, in four parts (each a value here, so `verify:slice` can falsify it)
 *
 *  1. `cartFate` — the ONE classification of what became of a cart, from the rows a member-gated
 *     server read sees (`counterPayOutcome`, lib/counter-pay). A clear is the one close that leaves
 *     a record (`qr_table_clears`); a merge leaves none, so it reads as the neutral `closed`.
 *  2. `afterFailedRead` — what the menu does with that answer: a dine-in table that ENDED is HELD
 *     (one persistent card that names the cause; nothing re-mints until the diner asks), a solo
 *     order re-mints with a sentence that names the cause, and an unknowable answer keeps today's
 *     recovery for a write and the honest floor (the last view) for a passive read.
 *  3. `dineinMintEntry` — the URL credential is single-use: once the server has accepted a dine-in
 *     code, every later mint re-joins by THAT code under J15 (a member re-joins; anyone else gets a
 *     bare host-start). No re-mint can provision a session at a sticker's table again (M172).
 *  4. The words — `mintNotice`, `endedWriteNotice`, `endCardWords`, `settleEdgeNotice` — so no path
 *     can say "idle" about a table that was cleared, merged or paid.
 */

/** Why a table's order ended, as far as the rows can tell (a merge is `closed` — no migration). */
export type TableEndReason = "cleared" | "expired" | "closed";

/** How a paid cart was paid (`counterPayOutcome`'s order read; `unknown` = no order row visible). */
export type PaidTender = "counter" | "card" | "unknown";

/**
 * What became of a cart, answered to a PROVEN MEMBER only (lib/counter-pay `counterPayOutcome`).
 * `unknown` is every answer that establishes nothing: a non-member, a missing cart, a failed read.
 *
 * A `paid` answer can be INCOMPLETE (`complete: false`, Codex round 2 on #361): the cart's `paid` is
 * established, but a read the details needed FAILED — the order row's tender, or whether this seat
 * may see the order. Its `tender: "unknown"` / `orderId: null` then mean "not known yet", never
 * "none" (the M116 rule: an unknowable read establishes nothing), and whoever holds it asks again on
 * the poll's cadence until the answer is whole (`endComplete`, `heldEndUpgrade`).
 */
export type CartOutcome =
  | { kind: "open" }
  | {
      kind: "paid";
      tender: PaidTender;
      orderId: string | null;
      sessionLive: boolean;
      complete: boolean;
    }
  | { kind: "ended"; why: TableEndReason }
  | { kind: "unknown" };

/** The terminal answers — the ones that never heal by waiting. */
export type TableEnd = Extract<CartOutcome, { kind: "paid" } | { kind: "ended" }>;

export function tableEnded(o: CartOutcome): o is TableEnd {
  return o.kind === "paid" || o.kind === "ended";
}

/**
 * Is this end the WHOLE answer? An `ended` always is (its cause is read before it is returned); a
 * `paid` one only when every read behind its details came back. The end poll keeps running for an
 * incomplete one — the receipt link or the tender arrives with the read that failed.
 */
export function endComplete(end: TableEnd): boolean {
  return end.kind === "ended" || end.complete;
}

/**
 * A later answer about an end already HELD (Codex round 2 on #361). An incomplete paid end takes the
 * fields the later answer resolved — a known value is never forgotten for an unknown one, since the
 * cart cannot un-pay — and nothing is said again (the hold spoke once). Null when nothing changes: a
 * complete end is final, and only a `paid` answer can fill a `paid` one.
 */
export function heldEndUpgrade(held: TableEnd, next: TableEnd): TableEnd | null {
  if (endComplete(held) || held.kind !== "paid" || next.kind !== "paid") return null;
  return {
    kind: "paid",
    tender: next.tender !== "unknown" ? next.tender : held.tender,
    orderId: next.orderId ?? held.orderId,
    sessionLive: next.sessionLive,
    complete: next.complete,
  };
}

/** The rows `counterPayOutcome` reads, already past the membership gate. */
export type CartFacts = {
  /** `qr_carts.status` — `open` | `paid` | `cancelled`. */
  cartStatus: string;
  /** The cart's `table_sessions` row, or null when it could not be found. */
  session: { status: string; expiresAt: string } | null;
  /** A `qr_table_clears` row names this session (the durable record `mms_clear_table` writes). */
  cleared: boolean;
  nowMs: number;
};

/** The session gate `is_member` applies (`status <> 'closed' and expires_at > now()`), exactly. */
export function sessionLive(s: CartFacts["session"], nowMs: number): boolean {
  return s !== null && s.status !== "closed" && Date.parse(s.expiresAt) > nowMs;
}

export type CartFate =
  | { kind: "open" }
  | { kind: "paid"; sessionLive: boolean }
  | { kind: "ended"; why: TableEndReason };

/**
 * The classification. Order is load-bearing:
 *  - PAID first: a paid table that staff then cleared ("Seat next party") paid — the diner's bill
 *    is the fact, and `sessionLive` says whether "Start a new order" can stay at that table.
 *  - OPEN only with a LIVE session: an open cart on a swept session is not an order anyone can add
 *    to (the sweep closes the session and leaves the cart `open`).
 *  - CLEARED before the clock: a clear row is a recorded act; an expiry is an inference.
 *  - EXPIRED is a session whose clock ran out (the sweep closes exactly these).
 *  - Anything else is CLOSED — a merge, which leaves no record of itself. The copy is neutral.
 */
export function cartFate(f: CartFacts): CartFate {
  const live = sessionLive(f.session, f.nowMs);
  if (f.cartStatus === "paid") return { kind: "paid", sessionLive: live };
  if (f.cartStatus === "open" && live) return { kind: "open" };
  if (f.cleared) return { kind: "ended", why: "cleared" };
  if (f.session !== null && !(Date.parse(f.session.expiresAt) > f.nowMs))
    return { kind: "ended", why: "expired" };
  return { kind: "ended", why: "closed" };
}

/**
 * What the menu does once a FAILED read has been explained.
 *
 *  - `hold`   — a dine-in table that ended: ONE persistent card names the cause, the order controls
 *               go inert, and nothing re-mints until the diner taps "Start a new order".
 *  - `remint` — a solo order that ended (pickup / scan-and-go have no table to clear and no party:
 *               a fresh basket is the only thing to offer, said with its cause), or a WRITE whose
 *               re-read failed for a reason we cannot see (the shipped recovery — a dead session is
 *               the one cause a re-mint repairs).
 *   - `stay`  — a passive read (focus, an echo, the poll) that failed for a reason we cannot see:
 *               the last good view stays, which is the honest floor.
 */
export function afterFailedRead(
  o: CartOutcome,
  s: { isGroup: boolean; write: boolean },
): "hold" | "remint" | "stay" {
  if (tableEnded(o)) return s.isGroup ? "hold" : "remint";
  return s.write ? "remint" : "stay";
}

/**
 * The light poll that notices a close no event carries (a clear, a merge and the sweep all close
 * the session first, so Realtime has nobody to deliver to). Dine-in only (only a table is closed by
 * someone else), only with a cart to watch, and never once the table has ended — `ended` meaning an
 * end whose answer is COMPLETE (`endComplete`): an incomplete paid end is still being asked about.
 * The effect also skips a tick while the page is hidden; the visibility re-read covers the return.
 */
export const END_POLL_MS = 60_000;

export function endPollDelayMs(s: {
  isGroup: boolean;
  hasCart: boolean;
  /** A COMPLETE end is held (`endComplete`) — an incomplete one keeps the poll. */
  ended: boolean;
}): number | null {
  return s.isGroup && s.hasCart && !s.ended ? END_POLL_MS : null;
}

/**
 * The dine-in mint's entry (`useTableSession`). Before a mint has been accepted, the URL decides:
 * the sticker / invite code (`?t=` / `?j=`), the picker's claim (`?table=N`), or the persisted key
 * marked `persisted` (J15). AFTER one has been accepted, the URL credential is spent: every later
 * mint — the recovery re-mint and "Start a new order" alike — re-joins by the ACCEPTED code, marked
 * `persisted`, so the server re-joins it only for a member of a live session and otherwise starts a
 * bare session. The sticker held in the page's props can no longer re-host a cleared table (M172),
 * a closed invite no longer answers "No table found for that code", and a claim is not re-made.
 */
export type AcceptedMint = {
  /** The join code the server answered with. */
  code: string;
  /** The URL credential and claim that mint was SENT with — the entry it spent. */
  forCode: string | null;
  forTable: number | null;
};

export function dineinMintEntry(s: {
  code: string | undefined;
  joinOnly: boolean;
  tableNumber: number | undefined;
  /** What a previous mint of this hook ACCEPTED (null before the first success). */
  accepted: AcceptedMint | null;
  /** The persisted dine-in key (localStorage), if any. */
  stored: string | undefined;
}): { qrCode?: string; tableNumber?: number; joinOnly?: true; persisted?: true } {
  // Spent only while it is the SAME entry: a new credential (a code typed into the join form, which
  // routes with a fresh `?j=` on this same page) is a new, explicit entry and is honoured.
  const spent =
    s.accepted !== null &&
    s.accepted.forCode === (s.code ?? null) &&
    s.accepted.forTable === (s.tableNumber ?? null);
  if (spent && s.accepted !== null) return { qrCode: s.accepted.code, persisted: true };
  const qrCode = s.code ?? s.stored;
  const persisted = !s.code && s.tableNumber == null && qrCode !== undefined;
  return {
    ...(qrCode !== undefined ? { qrCode } : {}),
    ...(s.tableNumber != null ? { tableNumber: s.tableNumber } : {}),
    ...(s.joinOnly && qrCode !== undefined ? { joinOnly: true as const } : {}),
    ...(persisted ? { persisted: true as const } : {}),
  };
}

/** The clause a refused write carries when the table has ended (and the inert controls' reason). */
export const CLOSED_ORDER_CLAUSE = "this order has closed";

/**
 * The correction for a write whose answer was LOST when the table turned out to have ended under it.
 *
 * ⚠️ NEVER "DIDN'T GO THROUGH" — the provider's own invariant: A THROW IS NOT PROOF THE WRITE DID NOT
 * LAND (the blind pass on #361, CRITICAL 1). `addItem` commits its line and only THEN reads the view,
 * so an Add racing a staff MERGE can land its line, have the merge re-parent that line onto the
 * target table's cart and cancel this one, and then throw `cart_closed` on its trailing read — with
 * the dish on the target table's order, cooking and charged there. A clear (which voids or cancels
 * it) and the sweep cannot be told apart from that by this phone either, and a paid table may have
 * taken the dish into its bill a beat before the register closed it. So every arm says the write is
 * UNCONFIRMED and names the one person who can see where it went: re-adding it is the one action that
 * can put it on two bills.
 *
 * A write refused BEFORE it left (the table already held) is a different sentence — nothing was
 * sent — and the provider says that one itself (`CLOSED_ORDER_CLAUSE`).
 */
export function endedWriteNotice(end: TableEnd, name?: string): string {
  if (end.kind === "paid")
    return `We couldn’t confirm ${name ?? "that"} — your table’s bill was paid just then.`;
  return `We couldn’t confirm ${name ?? "that"} — this table’s order has closed; ask our staff whether it made it onto your order before you add it again.`;
}

/**
 * The caption under a paid table's LAST kitchen view (the read is gone for good, `cart_closed`).
 *
 * It names when the last SUCCESSFUL read landed — `lastReadIso`, the applied view's DATABASE clock
 * (`getCartView.dbNow`) — never the settle moment: the view may predate a pocketed phone by an hour,
 * and "as it stood when your bill was paid" would then be a claim nothing proves (the blind pass on
 * #361, CRITICAL 2). `clock` formats the instant (the house's restaurant-zone wall clock); an
 * unreadable or absent instant says only what is certain.
 */
export function staleCaption(lastReadIso: string | null, clock: (iso: string) => string): string {
  const at = lastReadIso ? clock(lastReadIso) : "";
  return at ? `Last updated ${at} — this list won’t update here.` : "This list won’t update here.";
}

/**
 * Is keyboard focus ORPHANED — nowhere, on <body>, or left on a control that has just gone inert
 * under it (a natively `disabled` Add or Send, or one held `aria-disabled`)? The card a table that
 * ended draws takes focus only then (WCAG 2.4.3), and never from a live control the diner chose.
 */
export function focusOrphaned(active: Element | null, body: Element | null): boolean {
  if (!active || active === body) return true;
  if (active.getAttribute("aria-disabled") === "true") return true;
  return typeof (active as HTMLElement).matches === "function" && active.matches(":disabled");
}

/**
 * Finding 5 — does "Leave this table" take the Send from someone else? Only the host sends, so only
 * the host's leave strands a round, and only when the table's DURABLE party (`session_members`, via
 * `getSplitContext`) holds another seat. Presence is not the party: it is empty before the first
 * sync and drops a phone that is merely face down (Codex round 1 on #361). Unknown (`null`, a read
 * that has not landed or failed) claims nothing.
 */
export function leaveTakesTheSend(s: {
  role: "host" | "guest" | null;
  mySeat: string | null;
  partySeats: readonly string[] | null;
}): boolean {
  if (s.role !== "host" || s.partySeats === null) return false;
  return s.partySeats.some((seat) => seat !== s.mySeat);
}

/** The sentence the one live region says when a table is HELD — the card's own title. */
export function endedNewsKey(end: TableEnd): DictKey {
  return endCardWords(end).title;
}

/**
 * The card's words. The paid arms reuse the Bill's shipped close (`counterSettled*` / `billPaid*`)
 * so the menu and /cart can never describe one payment two ways; the three ends are this stream's.
 * `staffLine` is the quiet "Ask our staff" line — offered wherever the diner may still be at a table
 * that is no longer theirs (every end, and a paid table whose session has closed).
 */
export function endCardWords(end: TableEnd): {
  eyebrow: string;
  title: DictKey;
  body: DictKey | null;
  staffLine: boolean;
} {
  if (end.kind === "paid") {
    const staffLine = !end.sessionLive;
    if (end.tender === "counter")
      return {
        eyebrow: "Paid at the counter",
        title: "counterSettledTitle",
        body: "counterSettledBody",
        staffLine,
      };
    // `unknown` — the order row is not readable to this seat yet: the bill is paid (the cart says
    // so), and nothing is claimed about WHERE.
    return {
      eyebrow: "Paid",
      title: "billPaidTitle",
      body: end.tender === "card" ? "billPaidBody" : null,
      staffLine,
    };
  }
  if (end.why === "cleared")
    return {
      eyebrow: "Table closed",
      title: "tableClearedTitle",
      body: "tableClearedBody",
      staffLine: true,
    };
  if (end.why === "expired")
    return {
      eyebrow: "Timed out",
      title: "tableExpiredTitle",
      body: "tableExpiredBody",
      staffLine: true,
    };
  return {
    eyebrow: "Order closed",
    title: "tableClosedTitle",
    body: "tableClosedBody",
    staffLine: true,
  };
}

/** Where the paid card's "Track your order" goes — only to an order this seat may see. */
export function endTrackHref(end: TableEnd, cartId: string | null): string | null {
  if (end.kind !== "paid" || !end.orderId || !cartId) return null;
  return `/track?cart=${encodeURIComponent(cartId)}&paid=1`;
}

/**
 * The one sentence a new or re-joined mint earns, or null. NEVER "idle": a re-mint the diner did
 * not ask for names what we know about why the old order went, and a cause we do not know is said
 * as not knowing it.
 */
export function mintNotice(s: {
  /** No cart had been held before this one (the provider's first mint). */
  firstMint: boolean;
  /** This mint is the recovery after a failed write or a solo order that ended. */
  recovering: boolean;
  /** This mint is the diner's own "Start a new order". */
  restarted: boolean;
  /** The mint landed on a DIFFERENT cart than the one held before it. */
  newCart: boolean;
  /** The write that sent us here could not be confirmed — never invite its retry. */
  unconfirmed: boolean;
  /** The terminal answer that drove a solo re-mint, or null (the cause is not known). */
  cause: TableEnd | null;
  /** The server CREATED the session (or took a fresh table for this diner). */
  created: boolean;
  /** The entry came from the home card's resume affordance. */
  resume: boolean;
  /** The persisted dine-in key named a table that had ended, so a fresh one was started. */
  replacedStored: boolean;
}): { text: string; ms: number } | null {
  if (s.restarted) return { text: "Your new order is ready — add whatever you like.", ms: 3500 };
  if (s.recovering) {
    if (!s.newCart)
      return {
        text: s.unconfirmed
          ? "Reconnected to your table — check your order below."
          : "Reconnected to your table — please try that again.",
        ms: 3500,
      };
    const c = s.cause;
    const text =
      c === null
        ? "We couldn’t reach your last order — this is a new one."
        : c.kind === "paid"
          ? "That order’s already paid — this is a new one."
          : c.why === "expired"
            ? "Your last order timed out — this is a new one."
            : "Your last order was closed — this is a new one.";
    return { text, ms: 3500 };
  }
  if (s.firstMint && s.created && s.resume)
    return {
      text: "Your earlier visit at this table had ended — we’ve started a fresh one for you.",
      ms: 4200,
    };
  if (s.firstMint && s.created && s.replacedStored)
    return { text: "Your last table’s order had ended — this is a new one.", ms: 4200 };
  return null;
}

/**
 * The settlement freeze's edge sentences on /menu. While the self-serve split is parked
 * (`SURFACES.selfServeSplit`), nothing but the REGISTER takes the freeze (lib/counter-pay-state), so
 * "Your table is splitting the bill" described a door no phone can open — the register speaks its
 * own words, and a release without a payment is its own sentence, never "the split was called off".
 */
export function settleEdgeNotice(entering: boolean, selfServeSplitOpen: boolean): string {
  if (selfServeSplitOpen)
    return entering
      ? "Your table is splitting the bill — the order’s locked while everyone pays"
      : "The split was called off — you can edit the order again";
  return entering
    ? REGISTER_SETTLING_COPY
    : "The counter stopped taking payment — you can edit the order again";
}
