/**
 * W7a — the pure receipt model (M46: decision logic lives in lib/). One derivation shared by the
 * /track receipt actions, the session-less `?r=` artifact view, and the receipt email — so the
 * three surfaces can never disagree about what a receipt shows.
 *
 * Money discipline: every amount is the fulfillment-time snapshot rendered VERBATIM — nothing here
 * recomputes a total. The M7 rule is structural: line amounts are qty × unit price and tax is ONE
 * order-level row (per-line tax_cents can differ from the aggregate by a rounding cent — charge is
 * correct; a receipt must not surface the mismatch).
 */

export type ReceiptBreakdownish = {
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
};

export type ReceiptRow = {
  key: string;
  label: string;
  amountCents: number;
  /** Rendered with a leading − (the discount row). */
  negative?: boolean;
  grand?: boolean;
};

/** The breakdown rows, zero-gated exactly like the /account history card: subtotal always,
 *  discount/service/tax/tip only when charged, total last.
 *
 *  ⚠️ W16a — the service charge is RETIRED for NEW orders (totals mint serviceChargeCents = 0), but
 *  the `> 0`-gated service row and SERVICE_CHARGE_DISCLOSURE below MUST STAY: receipts render the
 *  fulfillment-time SNAPSHOT, and orders settled before 2026-08-15 carry a real charge that owes
 *  its SB-1524 explanation forever. Do not "clean up" this branch — it is historical rendering,
 *  not a live fee. */
export function buildReceiptRows(b: ReceiptBreakdownish, totalCents: number): ReceiptRow[] {
  const rows: ReceiptRow[] = [{ key: "subtotal", label: "Subtotal", amountCents: b.subtotalCents }];
  if (b.discountCents > 0)
    rows.push({ key: "discount", label: "Discount", amountCents: b.discountCents, negative: true });
  if (b.serviceChargeCents > 0)
    rows.push({ key: "service", label: "Service charge (5%)", amountCents: b.serviceChargeCents });
  if (b.taxCents > 0) rows.push({ key: "tax", label: "Tax", amountCents: b.taxCents });
  if (b.tipCents > 0) rows.push({ key: "tip", label: "Tip", amountCents: b.tipCents });
  rows.push({ key: "total", label: "Total", amountCents: totalCents, grand: true });
  return rows;
}

/** SB-1524: the disclosure must ride the artifact whenever the fee does (DESIGN-RESEARCH names
 *  "fees that surface only on the emailed receipt" as the north-star teardown's failure mode —
 *  here it's the inverse guard: the fee never surfaces WITHOUT its explanation). */
export function serviceDisclosed(b: ReceiptBreakdownish): boolean {
  return b.serviceChargeCents > 0;
}

/** Verbatim from the checkout's one disclosure element — the receipt repeats the charge, so it
 *  repeats the explanation, word for word. */
export const SERVICE_CHARGE_DISCLOSURE =
  "A 5% service charge supports fair kitchen wages and is shared with the team (CA SB-1524). It " +
  "is not a tip — anything extra above is yours to give. Card fees are built into menu prices; we " +
  "never add a surcharge on debit.";

const TZ = "America/Los_Angeles"; // the restaurant's clock — the same TZ rule as every date surface
const fmtFull = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function receiptDateLabel(iso: string): string {
  return fmtFull.format(new Date(iso));
}

/** Tender vocabulary — includes the register's card-present reader (the history card predates
 *  W6c and still says only Card/Cash; the receipt must not misname a reader tap as online card). */
export function tenderLabel(tender: string): string {
  if (tender === "card") return "Card";
  if (tender === "cash") return "Cash";
  if (tender === "terminal") return "Card · reader";
  return tender;
}

/* W23b — `receiptStatusLabel` moved to `lib/refund-view.ts`. It now takes a RefundSummary rather
 * than a boolean, because a partial refund is a third state and a boolean could not express it —
 * which is precisely how a partially-refunded order came to print "Paid in full". Keeping the
 * function here would have made this module import the refund model it exists beneath. */

export const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** W22r — destination vocabulary, the Bill's exact headings (DESIGN-LANGUAGE §8: "At your table /
 *  To-go / Grocery"). One naming, receipt and email included. */
export function fulfillmentLabel(f: string): string {
  if (f === "togo") return "To-go";
  if (f === "grocery") return "Grocery";
  return "At your table";
}

/** Fixed destination order — the Bill's: table food first, then the bag, then the shelf. */
const FULFILLMENT_ORDER = ["dinein", "togo", "grocery"] as const;

export type ReceiptLineGroup<T> = {
  key: string;
  /** null when the whole order is one destination — headings only when the basket spans 2+
   *  (the Bill rule; a lone "At your table" header over every line is noise, not clarity). */
  label: string | null;
  lines: T[];
};

/** W22r — group receipt lines by destination, preserving each group's internal order (the
 *  deterministic `.order("id")` read). Unknown fulfillment values fold into the table group
 *  (the DB default) rather than minting a phantom heading. */
export function groupReceiptLines<T extends { fulfillment: string }>(
  lines: readonly T[],
): ReceiptLineGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const l of lines) {
    const key = FULFILLMENT_ORDER.includes(l.fulfillment as (typeof FULFILLMENT_ORDER)[number])
      ? l.fulfillment
      : "dinein";
    const b = buckets.get(key);
    if (b) b.push(l);
    else buckets.set(key, [l]);
  }
  const present = FULFILLMENT_ORDER.filter((k) => buckets.has(k));
  const multi = present.length > 1;
  return present.map((k) => ({
    key: k,
    label: multi ? fulfillmentLabel(k) : null,
    lines: buckets.get(k)!,
  }));
}
