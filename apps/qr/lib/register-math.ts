import { dayStartIso } from "./day-window";
import { tipWithinAmountCap } from "./tip";
import { SETTLE_TTL_MS } from "./lock-ttl";
// Register money math (W6a) — pure, no I/O, mutation-tested via verify:slice. Three concerns:
// the day summary (Z-report-lite buckets), the counter's change arithmetic, and (Phase 2c) what the
// cashier counts at the drawer — the quick-cash notes, the tender's readout, keep-the-change and the
// paid card's rows. Every value is integer CENTS. The charge itself is NEVER computed here —
// getCartTotals owns it; this module only aggregates already-settled orders and helps a cashier
// count drawer change. Nothing below reaches a Server Action as an amount.

export type DayOrderRow = {
  tender: string;
  total_cents: number;
  status: string;
  /** W17c-2 — recorded cash tips. Optional so a caller that hasn't widened its SELECT reads 0
   *  rather than NaN; the register's own query does select it. */
  tip_cents?: number | null;
};

export type DaySummary = {
  cashCount: number;
  cashCents: number;
  cardCount: number;
  cardCents: number;
  /** W6c: card-present on the counter reader (tender='terminal') — its own bucket, never folded
   *  into online card: the register reconciles the READER's takings against Stripe's Terminal
   *  view, and a merged column hides a mis-tendered order. */
  terminalCount: number;
  terminalCents: number;
  /** Orders whose STATUS moved to refunded — counted apart, never netted into the buckets above.
   *  (Line-level partial refunds leave status='paid' — M2 — so this is honest only as a status
   *  split, and the UI labels it that way rather than claiming a net drawer figure.) */
  refundedCount: number;
  refundedCents: number;
  /** W17c-2 — the tip portion of `cashCents`, NOT a separate bucket to add to it. Cash tips are
   *  money in the same drawer, so the drawer figure must already include them; this says how much
   *  of it belongs to the team. Reported apart because "count the drawer" and "what were we
   *  tipped" are different questions asked by different people. */
  cashTipCents: number;
  /** M218 — cash handed BACK from the drawer today (the `tender = 'cash'` ledger rows). It is not a
   *  bucket and it is not inside `cashCents`: a line refund leaves `status = 'paid'` and
   *  `total_cents` untouched, so the takings above stay GROSS and this is what left the till after
   *  them. Until M218 a cash refund could not be recorded at all, so this was structurally 0 and
   *  the drawer overstated itself by every hand-back of the day. */
  cashRefundedCents: number;
  /** Today's NET cash movement: gross cash less what went back out. SIGNED, deliberately — refund
   *  an earlier service day's cash order on a slow morning and the true movement is negative, which
   *  is a fact about the till a manager needs. Flooring it at zero (the first draft did) would
   *  overstate the reconciliation by the entire deficit and read as if nothing were missing.
   *
   *  It is NOT "what is physically in the drawer": that needs an opening float this app does not
   *  carry. Named once here rather than subtracted at each surface — two screens doing their own
   *  arithmetic is how a money value drifts. */
  cashNetCents: number;
};

/** Bucket a day's orders by tender. Only status='paid' rows count toward a tender bucket — a
 *  refunded order's money is NOT in the drawer, and silently folding it in overstates the day. */
export function summarizeDay(rows: DayOrderRow[], cashRefundedCents = 0): DaySummary {
  const s: DaySummary = {
    cashCount: 0,
    cashCents: 0,
    cardCount: 0,
    cardCents: 0,
    terminalCount: 0,
    terminalCents: 0,
    refundedCount: 0,
    refundedCents: 0,
    cashTipCents: 0,
    // Defaulted so a caller that has not widened its read gets today's honest 0 rather than NaN —
    // the same posture `tip_cents` takes on the row type above.
    cashRefundedCents: Math.max(0, cashRefundedCents),
    cashNetCents: 0,
  };
  for (const r of rows) {
    if (r.status === "refunded") {
      s.refundedCount += 1;
      s.refundedCents += r.total_cents;
      continue;
    }
    if (r.status !== "paid") continue;
    if (r.tender === "cash") {
      s.cashCount += 1;
      s.cashCents += r.total_cents;
      // Already INSIDE total_cents (the RPC folds the tip into the order total) — this is a
      // breakdown of the drawer, never an addition to it.
      s.cashTipCents += r.tip_cents ?? 0;
    } else if (r.tender === "terminal") {
      s.terminalCount += 1;
      s.terminalCents += r.total_cents;
    } else {
      s.cardCount += 1;
      s.cardCents += r.total_cents;
    }
  }
  // Derived last, from the two figures above, so it can never disagree with them. NOT floored:
  // see the field's docblock — a negative day is a real shape (an earlier day's cash order refunded
  // this morning), and clamping it to zero tells a manager the till balances when it is short by
  // exactly the amount hidden (Codex round 1 on #286, P1).
  s.cashNetCents = s.cashCents - s.cashRefundedCents;
  return s;
}

/** Change due on a cash tender — display-only cashier arithmetic (the ledger never sees it).
 *  A short tender is 0 change, never negative (the UI separately flags "not enough"). */
export function changeDue(totalCents: number, tenderedCents: number): number {
  return Math.max(0, tenderedCents - totalCents);
}

/** The UTC instant of the CURRENT Los Angeles calendar day's midnight. A4·1 (K31): the derivation
 *  moved to `lib/day-window.ts`'s `dayStartIso`, which takes the ZONE, because the KDS served rail
 *  needed the same floor from `pickup_config.tz` and a second implementation would be a second
 *  "today". A4·3 (Codex round 1 on #283): the register reads that configured zone too, through
 *  `lib/service-day.ts`'s `readServiceDay` — no surface floors on this LA instance any more. It
 *  stays as the rule applied to LA for `register-math.test.ts`'s DST pins; DST-correctness is
 *  verified there, never by a fixed-offset subtraction here. */
export function laDayStartIso(now: Date): string {
  return dayStartIso(now.toISOString(), "America/Los_Angeles");
}

// ── Phase 2c · register ── the cash moment (DESIGN-LANGUAGE §29) ──────────────────────────────────

/** The house's notes, $1 to $100 — the round-ups a guest actually hands over. A PARAMETER of
 *  `quickCashTenders`, defaulted, so a custom ladder can prove the sort (see its test). */
export const CASH_LADDER_CENTS: readonly number[] = [100, 500, 1000, 2000, 5000, 10000];

/**
 * The quick-cash chips after "Exact": the next THREE notes a guest is likely to hand over for `due`
 * (owner decision: exact + round-ups, as Square and Toast do — $13.47 → $14 · $15 · $20). The Exact
 * chip is rendered from `due` itself, never returned here.
 *
 * Each pass walks the ladder from the smallest note, offering the next multiple ABOVE the floor
 * (`floor(floor/d)+1`, so a note never equals the floor — that would be Exact twice). The $1 step is
 * skipped when the floor is already whole dollars ($20.00 is never offered $21). When a pass yields
 * fewer than three (every note rounds to the same value — $99.50 → $100 six times), the next pass
 * climbs from the highest note found. Sorted at the end: only a ladder whose steps do not divide one
 * another can produce them out of order. Integer cents only; `[]` for anything that is not a
 * positive whole number of cents.
 */
export function quickCashTenders(
  dueCents: number,
  ladder: readonly number[] = CASH_LADDER_CENTS,
  max = 3,
): number[] {
  if (!Number.isSafeInteger(dueCents) || dueCents <= 0) return [];
  const notes: number[] = [];
  let floor = dueCents;
  for (let pass = 0; pass < max && notes.length < max; pass++) {
    for (const d of ladder) {
      if (notes.length >= max) break;
      if (d === ladder[0] && floor % d === 0) continue;
      const c = (Math.floor(floor / d) + 1) * d;
      if (!notes.includes(c)) notes.push(c);
    }
    floor = notes[notes.length - 1] ?? floor;
  }
  return notes.sort((a, b) => a - b);
}

/** What the tendered figure says against what is due. */
export type TenderState =
  | { kind: "none" }
  | { kind: "exact" }
  | { kind: "change"; changeCents: number }
  | { kind: "short"; shortCents: number };

/**
 * The sheet's readout (and the paid card's last row). No tender — empty, zero, or not a whole number
 * of cents — says NOTHING: the tender is optional (owner decision), so an untouched field must never
 * read "Short" and block a cashier who simply did not type one. The change arm CALLS `changeDue`, so
 * the one change rule (never negative) is the one this reads.
 */
export function tenderState(dueCents: number, tenderedCents: number | null): TenderState {
  if (tenderedCents == null || !Number.isSafeInteger(tenderedCents) || tenderedCents <= 0)
    return { kind: "none" };
  if (tenderedCents === dueCents) return { kind: "exact" };
  if (tenderedCents > dueCents)
    return { kind: "change", changeCents: changeDue(dueCents, tenderedCents) };
  return { kind: "short", shortCents: dueCents - tenderedCents };
}

/**
 * Why the cash Settle refuses right now, or null (§22: a rule that gates a money action is ONE
 * binding — the button's `aria-disabled`, its `aria-describedby` and its handler all read this).
 *
 *  - `tipCap` — the tip is over the house ceiling (`tipWithinAmountCap`, named once in lib/tip), or
 *    it could not be read as an amount although it holds digits (`null`: more than seven whole-dollar
 *    digits — past any cap, so never read as a zero tip). It outranks `short`: the tip is the line
 *    to fix first, and the short figure depends on it.
 *  - `short` — a tender WAS entered and is less than what is due. Tendered is optional; it blocks
 *    only when it says the drawer would be short.
 */
export function cashSettleBlocked(
  tipCents: number | null,
  tender: TenderState,
): "tipCap" | "short" | null {
  if (tipCents == null || !tipWithinAmountCap(tipCents)) return "tipCap";
  if (tender.kind === "short") return "short";
  return null;
}

/**
 * "Keep the change as tip": the tip that would make the tender exact — `tendered − total`, where
 * `total` is the PRE-tip total the sheet quotes. Offered only while change is actually owed (the
 * over-tender is MORE than the tip already typed) and only when the settle would accept it (inside
 * the house cap). It is a FILL: the component writes it into the tip field, where it stays visible
 * and editable in the Settle label before anything is recorded — it never commits.
 */
export function changeAsTipCents(
  totalCents: number,
  tenderedCents: number | null,
  tipCents: number,
): number | null {
  if (tenderedCents == null || !Number.isSafeInteger(tenderedCents) || tenderedCents <= 0)
    return null;
  const keep = tenderedCents - totalCents;
  if (!(keep > tipCents)) return null;
  return tipWithinAmountCap(keep) ? keep : null;
}

export type HandoffRow = { k: "total" | "tip" | "tendered" | "change" | "collect"; cents: number };

/**
 * The paid card's receipt rows, in reading order and zero-gated: the persisted ALL-IN total always;
 * the tip when one was recorded; the tender when one was entered; then — from `tenderState` against
 * that total — the change (0 on an exact tender: the cashier reads "Change $0.00" before closing the
 * drawer) or what is still to collect (a belt: the compare-and-swap and the short-block make it
 * unreachable in normal flow). Nothing after the total when no tender was entered.
 */
export function handoffRows(
  totalCents: number,
  tipCents: number | null,
  tenderedCents: number | null,
): HandoffRow[] {
  const rows: HandoffRow[] = [{ k: "total", cents: totalCents }];
  if (tipCents != null && tipCents > 0) rows.push({ k: "tip", cents: tipCents });
  if (tenderedCents == null) return rows;
  const tender = tenderState(totalCents, tenderedCents);
  if (tender.kind === "none") return rows;
  rows.push({ k: "tendered", cents: tenderedCents });
  if (tender.kind === "short") rows.push({ k: "collect", cents: tender.shortCents });
  else rows.push({ k: "change", cents: tender.kind === "change" ? tender.changeCents : 0 });
  return rows;
}

// ── The quote (Phase 2c · register, critic finding: the figure moved UNDER an open sheet) ─────────
/**
 * The figure a settle confirm QUOTES — frozen when the confirm OPENS, so the amount the cashier reads
 * (and counts change against) never moves under their hands. The prop behind it is live: the page
 * re-reads its detail ~0.4s after any realtime change, sheet open or not, so a guest adding a drink
 * from their phone used to turn "Take $42.10 · Change $7.90" into "Take $46.10 · Change $3.90" with
 * no announcement — and the tap then QUOTED the new figure, so the server's compare-and-swap passed
 * a total recorded after $7.90 had already been handed back. Frozen, the tap sends what was READ.
 *
 * `basis` is the live figure the quote was last reconciled with — equal to `cents`, except for the
 * beat after a server `moved` refusal: the sheet then quotes the SERVER's figure while the prop still
 * reads what the refused tap read, until the page's re-read lands. Not optimistic — that figure is
 * what the server just derived — and the next tap is compared again regardless.
 */
export type SettleQuote = {
  cents: number;
  basis: number;
  /** Phase 2c · review (R1) — set when a server refusal raised this quote: the page's read clock at
   *  that moment (the last detail read STARTED). A committed read with a LATER ticket began after
   *  the refusal, so its figure — whatever it is — is the newer truth (`reconcileQuote`). Absent on
   *  a quote frozen at open, and on a refusal from a caller with no read clock. */
  raisedAt?: number;
};

/**
 * Opening a confirm freezes the live figure — unless the live figure still reads the basis of a quote
 * a server refusal replaced (the re-read has not landed), when the server's figure stands.
 */
export function openQuote(prev: SettleQuote | null, liveCents: number): SettleQuote {
  if (prev && liveCents === prev.basis) return prev;
  return { cents: liveCents, basis: liveCents };
}

/**
 * The live figure caught up with the quote (the re-read after a refusal landed): the quote's basis
 * becomes its own figure, so a LATER move back to the old figure reads as the move it is. Returns
 * the SAME object when nothing changes (a render-time adjustment must be able to tell).
 *
 * Phase 2c · review (R1) — the figure alone cannot tell "no re-read yet" from "a re-read that
 * returned the basis": a guest who adds a drink (the server refuses at $42.65) and removes it
 * before the page re-reads brings the live figure back to $42.10 — the basis — and the quote stuck
 * on a total that no longer existed. So a refusal carries the page's read clock (`raisedAt`), and a
 * committed read whose ticket is LATER (it began after the refusal) settles the quote too: its basis
 * becomes its own figure, and a live figure that differs is then a drift the sheet says. A read
 * already in the air when the refusal came back (ticket ≤ `raisedAt`) settles nothing — it may
 * predate the move. `readTicket` defaults to 0: a caller with no read clock keeps the figure rule.
 */
export function reconcileQuote(
  q: SettleQuote | null,
  liveCents: number,
  readTicket = 0,
): SettleQuote | null {
  if (q && liveCents === q.cents && q.basis !== q.cents) return { cents: q.cents, basis: q.cents };
  if (q && q.basis !== q.cents && q.raisedAt !== undefined && readTicket > q.raisedAt)
    return { cents: q.cents, basis: q.cents };
  return q;
}

/**
 * The live figure moved off the quote while the confirm was open: `from` is what the cashier read,
 * `to` the figure the page now holds. Null while the live figure is the quote, or still the basis a
 * refusal left (the page has not re-read yet — the server's figure IS the newer one).
 */
export function quoteDrift(
  q: SettleQuote | null,
  liveCents: number,
): { from: number; to: number } | null {
  if (!q || liveCents === q.cents || liveCents === q.basis) return null;
  return { from: q.cents, to: liveCents };
}

// ── Phase 2c · review (R2) — a cash settle whose outcome is unknown ─────────────────────────────
/**
 * How long a cash settle whose response was lost may still LAND. `settleCash` holds the settle
 * freeze from its acquire until its `finally`, and `mms_fulfill_cash_order` checks only
 * `status = 'open'`, so nothing on the server bounds the function's own life (no `maxDuration` is
 * configured — the platform default is the ceiling, and it cannot be measured from here). The one
 * lifetime the system itself gives a settle attempt is its freeze's: past `SETTLE_TTL_MS` another
 * settle may take the table (`acquireSettlement` treats the freeze as abandoned) and the console
 * already tells staff a register attempt is over (`settle.inflight.register`'s {n} minutes). So
 * that is the bound — ONE binding, never a second number. It errs LONG, deliberately: a bound too
 * short lets a late-landing settle's close bounce the cashier to the floor mid-sheet (the money
 * risk the hold exists for), while one too long only keeps a hedged "most likely" sentence armed.
 */
export const SETTLE_MAY_LAND_MS = SETTLE_TTL_MS;

/**
 * The page's "a cash settle's outcome is unknown" mark (`since`, device ms when the page learned
 * the response was lost — later than the settle's start, so the bound only errs long) after a
 * committed detail read. A read that STARTED after the settle could last land and still shows the
 * cart OPEN proves it never landed: the mark clears (null), and a later `closed` is the ordinary
 * close it looks like. A read that started earlier, or shows the cart paid or gone, proves nothing.
 */
export function settleUnknownAfterRead(
  since: number | null,
  read: { startedAtMs: number; cartOpen: boolean },
): number | null {
  if (since === null) return null;
  return read.cartOpen && read.startedAtMs > since + SETTLE_MAY_LAND_MS ? null : since;
}
