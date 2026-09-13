/**
 * A4·3 · M204 — the settled list's VIEW rules, pure, in `lib/` so a value test can hold them.
 *
 * The console READS THE RECEIPT: every row, mark and status it shows comes from the same
 * derivations the guest's artifact renders (`receipt-view.ts` · `refund-view.ts`), so the two can
 * never disagree about what an order was. What this module adds is only the bilingual half — the
 * dictionary key for each receipt row, tender and refund state — and `settled-view.test.ts` pins
 * every English value to the receipt's own string, so a reworded row on the artifact reddens
 * here rather than drifting.
 */
import type { StaffKey } from "./i18n/staff";
import type { ReceiptRow } from "./receipt-view";
import type { RefundSummary } from "./refund-view";

/** The settled read's cap (a "use server" module may export only actions, so it lives here). A
 *  FULL page says so (`truncated`) instead of passing part off as the whole day. */
export const SETTLED_CAP = 50;

/** `buildReceiptRows` + `buildRefundRows` produce exactly these eight keys. */
export const RECEIPT_ROW_KEY = {
  subtotal: "floor.settled.row.subtotal",
  discount: "floor.settled.row.discount",
  service: "floor.settled.row.service",
  tax: "floor.settled.row.tax",
  tip: "floor.settled.row.tip",
  total: "floor.settled.row.total",
  // The row shares the floor's own word for the state (`floor.status.refunded`): one Burmese for
  // "Refunded" on this screen, whether it marks a card, a line or a receipt row.
  refunded: "floor.status.refunded",
  net: "floor.settled.row.net",
} as const satisfies Record<string, StaffKey>;

/** The dictionary key for a receipt row, or null for a key this map does not know — the caller
 *  then prints the row's own English label rather than inventing a word. */
export function receiptRowKey(row: ReceiptRow): StaffKey | null {
  return (RECEIPT_ROW_KEY as Record<string, StaffKey>)[row.key] ?? null;
}

/** The receipt's destination headings (`fulfillmentLabel`), keyed — shown only when an order spans
 *  two or more, the Bill rule `groupReceiptLines` already applies. */
export const GROUP_KEY = {
  dinein: "floor.settled.group.dinein",
  togo: "floor.settled.group.togo",
  grocery: "floor.settled.group.grocery",
} as const satisfies Record<string, StaffKey>;

export function groupKey(fulfillment: string): StaffKey | null {
  return (GROUP_KEY as Record<string, StaffKey>)[fulfillment] ?? null;
}

/** The receipt's tender vocabulary (`tenderLabel`), keyed. Cash and the reader reuse the takings
 *  zone's words — one Burmese per tender on the counter screen. */
export const TENDER_KEY = {
  card: "floor.settled.tender.card",
  cash: "reg.day.cash",
  terminal: "reg.day.terminal",
} as const satisfies Record<string, StaffKey>;

export function tenderKey(tender: string): StaffKey | null {
  return (TENDER_KEY as Record<string, StaffKey>)[tender] ?? null;
}

/**
 * The order's settled-state line, by refund state. `none` and `partial` carry the tender in an
 * `{x}` slot and mirror `receiptStatusLabel` word for word (pinned). `full` does NOT mirror it: the
 * artifact says "returned to you", and on the manager's screen "you" is the wrong person.
 */
export function settledStatusKey(summary: RefundSummary): StaffKey {
  if (summary.state === "full") return "floor.settled.status.full";
  if (summary.state === "partial") return "floor.settled.status.partial";
  return "floor.settled.status.paid";
}

/** The collapsed row's chip (`refundChipLabel`), keyed — null when nothing came back. */
export function settledChipKey(summary: RefundSummary): StaffKey | null {
  if (summary.state === "full") return "floor.status.refunded";
  if (summary.state === "partial") return "floor.settled.chip.partial";
  return null;
}

/** The refund reasons `refundLineInput` accepts, each a dictionary key. `sold_out` and `other`
 *  are the loss sheet's own words — the code is the DB's, so the word is the dictionary's, once. */
export const REFUND_REASON_KEY = {
  unhappy: "floor.refund.reason.unhappy",
  wrong_item: "floor.refund.reason.wrongItem",
  // W23a — listed high because if it is ever common it is the one refund reason with a cheap
  // structural fix (86 the dish and the next order never happens).
  sold_out: "table.loss.reason.soldOut",
  too_slow: "floor.refund.reason.tooSlow",
  duplicate: "floor.refund.reason.duplicate",
  other: "table.loss.reason.other",
} as const satisfies Record<string, StaffKey>;

export type RefundReason = keyof typeof REFUND_REASON_KEY;
export const REFUND_REASONS = Object.keys(REFUND_REASON_KEY) as RefundReason[];

const CLOCK = new Map<string, Intl.DateTimeFormat>();

/**
 * The wall-clock time an order settled, in the SERVICE zone (the same `pickup_config.tz` the day
 * floor uses) — "12:41 PM". Latin in both tongues: a clock is matched against a printed receipt.
 * Formatted on the server, where the zone is known; the tablet's own zone is not the restaurant's.
 */
export function settledClock(iso: string, tz: string): string {
  let f = CLOCK.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    CLOCK.set(tz, f);
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? f.format(new Date(ms)) : "";
}
