/**
 * T21(c) — how many units of THIS dish actually landed, and what to say about it.
 *
 * `add` announces optimistically ("Added 5 to your order") before the server answers, because the
 * cart bar has to respond to the tap. When the server caps the merge at the 99-unit line maximum,
 * that sentence is an overstatement and has to be corrected. Two paths need the correction and only
 * one had it:
 *
 *   • the SUCCESS path corrected, but counted BASKET-WIDE — `view.items.reduce(…) - beforeUnits`.
 *     Any concurrent peer write inside the round trip skews it: a tablemate removing one unit of
 *     THEIR line makes `landed = requested - 1` and fires "Added 4 — that line is now at our 99 max"
 *     on a dish nowhere near the cap. That is a fabricated diagnosis, and it needs no near-cap line
 *     to reach, which makes it strictly more likely than the case the row was filed for.
 *   • the RECOVERY path (the write committed but the trailing read failed) counted per item, but
 *     only to decide whether anything landed at all, and then returned silently — so a partial fill
 *     left the optimistic "Added 5" standing as the last thing said.
 *
 * One rule, both paths, counted PER MENU ITEM. Pure, so it can carry a mutant — the correction lived
 * in a `.tsx`, and this app has no component test runner, so it could not be guarded at all.
 *
 * ⚠️ THIS DESCRIBES AN ANNOUNCEMENT, NEVER AN AMOUNT. Every price is server-derived and the view is
 * already applied by the time either caller asks, so a wrong answer here is a wrong sentence in the
 * live region — not a wrong charge.
 */

/** Just enough of a cart line to count units of one dish. */
export type LineUnits = { menuItemId: string; qty: number };

export type AddLanding = {
  /** Units of `menuItemId` gained. Negative is possible — a peer can remove while we add. */
  landed: number;
  /**
   * `full` — everything asked for arrived. `partial` — some did, fewer than asked. `none` — nothing
   * did. `unknown` — the count went DOWN, so a concurrent write moved this dish and the difference
   * describes the table, not this tap.
   */
  outcome: "full" | "partial" | "none" | "unknown";
};

const unitsOf = (rows: readonly LineUnits[], menuItemId: string) =>
  rows.reduce((a, r) => a + (r.menuItemId === menuItemId ? r.qty : 0), 0);

/**
 * Compare the same dish before and after. `requested` is what the diner asked for, so it bounds
 * `full`; anything above it (a peer adding the same dish in the window) still reads `full`, because
 * over-reporting our own tap is the one direction that cannot mislead them about their own action.
 */
export function classifyAddLanding(input: {
  before: readonly LineUnits[];
  after: readonly LineUnits[];
  menuItemId: string;
  requested: number;
}): AddLanding {
  const landed = unitsOf(input.after, input.menuItemId) - unitsOf(input.before, input.menuItemId);
  if (landed < 0) return { landed, outcome: "unknown" };
  if (landed === 0) return { landed, outcome: "none" };
  return { landed, outcome: landed >= input.requested ? "full" : "partial" };
}

/**
 * The correction, in the two strings the success path already shipped — kept verbatim, because they
 * are the copy a diner and a screen reader have been hearing.
 *
 * `landed === 0` is only ever spoken where the CAP is proven (see `add`'s success path). In the
 * recovery path a zero is indistinguishable from a write that never committed, so it must stay a
 * refusal there — saying "already at our 99 max" about a write we cannot confirm is the M116
 * fabricated-diagnosis class, and the asymmetry between the two callers is deliberate.
 */
export function partialAddNotice(landed: number): string {
  return landed === 0
    ? "That line is already at our 99 max"
    : `Added ${landed} — that line is now at our 99 max`;
}
