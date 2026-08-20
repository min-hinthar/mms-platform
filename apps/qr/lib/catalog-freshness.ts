/**
 * W22c — what a refreshed menu is allowed to SAY it found. PURE, mirroring `refund-view.ts` and
 * `dropped-view.ts`: the decisions live here so the rules can carry `verify:slice` mutants, and the
 * gesture component stays plumbing.
 *
 * ── Why the outcome is a union and not a list of changes ─────────────────────────────────────────
 * `router.refresh()` returns `void` and cannot report failure. So freshness is not something this
 * module may INFER from the data it is handed — it has to be PROVEN by the caller (a render stamp
 * that changed) and, separately, the data has to be trustworthy. Both can fail, and each failure
 * has to answer "we could not check", never "nothing changed" and never a change list.
 *
 * ⚠️ THE RULE THIS MODULE EXISTS FOR. A failed catalog read produces an EMPTY next snapshot. Diffed
 * naively against a full previous one, every dish on the menu reads as newly sold out — and the app
 * would announce, to every diner in the room at once, that the entire restaurant has run out. That
 * is the delivery repo's "a failure must never read as empty" rule arriving at a brand-new
 * boundary, and it is the single most consequential line in this file.
 *
 * ── What it will not say ─────────────────────────────────────────────────────────────────────────
 *   • No price DELTAS. W17b ships a live staff price editor, so prices really do move mid-service —
 *     but the server owns the number and a client-stated "+$1.00" starts an argument the client
 *     cannot win. A count is honest; a delta is a claim.
 *   • No "just" sold out. `sold_out_at` is not in the menu page's select, so recency is not a fact
 *     this module holds. "now" is true relative to what the diner was looking at; "just" would not be.
 */

/** The comparable shape of one catalog row. Deliberately tiny: this module never sees a price it
 *  could print, only whether one moved. */
export type CatalogRow = { id: string; name: string; soldOut: boolean; priceCents: number };

export type FreshnessOutcome =
  /** A server render landed and the catalog is trustworthy, but nothing the diner cares about moved. */
  | { state: "unchanged" }
  /** A server render landed and these things moved. */
  | { state: "changed"; soldOut: string[]; restocked: string[]; priceChanges: number }
  /** We could not verify freshness — no render landed, or the snapshot cannot be trusted. NEVER
   *  collapse this into `unchanged`: "we couldn't check" and "nothing changed" are different
   *  sentences, and only one of them is true when the wifi drops. */
  | { state: "unverified" };

/**
 * Diff two catalog snapshots.
 *
 * `advanced` is the caller's PROOF that a server render actually happened (a render stamp that
 * changed). Without it the tree is whatever it already was, so any diff would be against ourselves.
 */
export function catalogFreshness(
  prev: CatalogRow[],
  next: CatalogRow[],
  advanced: boolean,
): FreshnessOutcome {
  if (!advanced) return { state: "unverified" };
  // ⚠️ See the header. An empty catalog after a non-empty one is a failed read, not a sold-out
  // restaurant — and `is_active = true` filtering means it could not mean that even if it were.
  if (next.length === 0 && prev.length > 0) return { state: "unverified" };

  const before = new Map(prev.map((r) => [r.id, r]));
  const soldOut: string[] = [];
  const restocked: string[] = [];
  let priceChanges = 0;
  for (const row of next) {
    const was = before.get(row.id);
    if (!was) continue; // a NEW dish is not a change the diner was promised anything about
    if (!was.soldOut && row.soldOut) soldOut.push(row.name);
    if (was.soldOut && !row.soldOut) restocked.push(row.name);
    if (was.priceCents !== row.priceCents) priceChanges += 1;
  }
  if (soldOut.length === 0 && restocked.length === 0 && priceChanges === 0)
    return { state: "unchanged" };
  return { state: "changed", soldOut, restocked, priceChanges };
}

/** "Mohinga", "Mohinga and Tea Leaf Salad", "Mohinga, Tea Leaf Salad and 2 more" — the list stays
 *  readable aloud, so it caps at two names and counts the rest. */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The one sentence the refresh announces. Spoken into the view's existing live region — this never
 * mints a second one (QA-CHECKLIST §A).
 */
export function freshnessSentence(outcome: FreshnessOutcome): string {
  if (outcome.state === "unverified")
    return "We couldn’t reach the menu just now — this is still the version you had.";
  if (outcome.state === "unchanged") return "Menu is up to date.";
  const parts: string[] = [];
  if (outcome.soldOut.length > 0)
    parts.push(
      `${nameList(outcome.soldOut)} ${outcome.soldOut.length === 1 ? "is" : "are"} sold out now.`,
    );
  if (outcome.restocked.length > 0)
    parts.push(
      `${nameList(outcome.restocked)} ${outcome.restocked.length === 1 ? "is" : "are"} back on.`,
    );
  // A COUNT, never a delta — see the header.
  if (outcome.priceChanges > 0)
    parts.push(`${outcome.priceChanges} price${outcome.priceChanges === 1 ? "" : "s"} updated.`);
  return parts.join(" ");
}
