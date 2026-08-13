// Register money math (W6a) — pure, no I/O, mutation-tested via verify:slice. Two concerns:
// the day summary (Z-report-lite buckets) and the counter's change arithmetic. Every value is
// integer CENTS. The charge itself is NEVER computed here — getCartTotals owns it; this module
// only aggregates already-settled orders and helps a cashier count drawer change.

export type DayOrderRow = {
  tender: string;
  total_cents: number;
  status: string;
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
};

/** Bucket a day's orders by tender. Only status='paid' rows count toward a tender bucket — a
 *  refunded order's money is NOT in the drawer, and silently folding it in overstates the day. */
export function summarizeDay(rows: DayOrderRow[]): DaySummary {
  const s: DaySummary = {
    cashCount: 0,
    cashCents: 0,
    cardCount: 0,
    cardCents: 0,
    terminalCount: 0,
    terminalCents: 0,
    refundedCount: 0,
    refundedCents: 0,
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
    } else if (r.tender === "terminal") {
      s.terminalCount += 1;
      s.terminalCents += r.total_cents;
    } else {
      s.cardCount += 1;
      s.cardCents += r.total_cents;
    }
  }
  return s;
}

/** Change due on a cash tender — display-only cashier arithmetic (the ledger never sees it).
 *  A short tender is 0 change, never negative (the UI separately flags "not enough"). */
export function changeDue(totalCents: number, tenderedCents: number): number {
  return Math.max(0, tenderedCents - totalCents);
}

/** The UTC instant of the CURRENT Los Angeles calendar day's midnight — the day window every
 *  register summary is scoped to. DST-correct by construction: the LA calendar date comes from a
 *  timezone-aware format, and the candidate offsets (PDT −7 / PST −8) are verified by formatting
 *  the candidate instant BACK into LA and demanding hour 0 — never a device-clock or fixed-offset
 *  subtraction (the two-clock duration class in LEARNINGS). */
export function laDayStartIso(now: Date): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number) as [number, number, number];
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours));
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        hour12: false,
      }).format(candidate),
    );
    if (hour % 24 === 0) return candidate.toISOString();
  }
  // Unreachable (LA is always −7 or −8), kept so the fn totals — PST, the standard offset.
  return new Date(Date.UTC(y, m - 1, d, 8)).toISOString();
}
