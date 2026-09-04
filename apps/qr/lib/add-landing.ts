/**
 * T21(c) — how many units of THIS dish actually landed, and what to say about it.
 *
 * `add` announces optimistically ("Added 5 to your order") before the server answers, because the
 * cart bar has to respond to the tap. When the server caps the merge at the 99-unit line maximum,
 * that sentence is an overstatement and has to be corrected. Two paths need the correction and only
 * one had it:
 *
 *   • the SUCCESS path corrected, but counted BASKET-WIDE — `view.items.reduce(…) - beforeUnits`.
 *     Any concurrent peer write inside the round trip skewed it: a tablemate removing one unit of
 *     THEIR line made `landed = requested - 1` and fired "Added 4 — that line is now at our 99 max"
 *     on a dish nowhere near the cap. That needs no near-cap line to reach, which makes it strictly
 *     more likely than the case the row was filed for.
 *   • the RECOVERY path (the write committed but the trailing read failed) counted per dish, but
 *     only to decide whether anything landed at all, and then returned silently — so a partial fill
 *     left the optimistic "Added 5" standing as the last thing said.
 *
 * One rule, both paths. Pure, so it can carry a mutant — the correction lived in a `.tsx`, and this
 * app has no component test runner, so it could not be guarded at all.
 *
 * ⚠️ THIS DESCRIBES AN ANNOUNCEMENT, NEVER AN AMOUNT. Every price is server-derived and the view is
 * already applied by the time either caller asks, so a wrong answer here is a wrong sentence in the
 * live region — not a wrong charge.
 */

/** Just enough of a cart line to attribute units of one dish. `id` is load-bearing: without line
 *  identity a peer's line of the SAME dish is indistinguishable from the diner's own. */
export type LineUnits = { id: string; menuItemId: string; qty: number };

export type AddLanding = {
  /** Units attributed to THIS tap. Zero when nothing landed or nothing can be attributed. */
  landed: number;
  /**
   * `full` — everything asked for arrived. `partial` — some did, fewer than asked, and the shortfall
   * is attributable to this tap. `none` — nothing arrived and nothing else moved, so the cap is
   * established. `unknown` — a write we cannot see moved this dish inside our round trip, and the
   * difference no longer describes what the diner just did.
   */
  outcome: "full" | "partial" | "none" | "unknown";
};

/**
 * Per-line change for one dish. A line absent from `before` counts as growth from zero — that is how
 * an add lands when no sibling matches the merge key.
 */
function dishDeltas(
  before: readonly LineUnits[],
  after: readonly LineUnits[],
  menuItemId: string,
): { grew: number[]; shrank: boolean } {
  const ofDish = (rows: readonly LineUnits[]) => rows.filter((r) => r.menuItemId === menuItemId);
  const was = new Map(ofDish(before).map((r) => [r.id, r.qty]));
  const now = new Map(ofDish(after).map((r) => [r.id, r.qty]));
  const grew: number[] = [];
  let shrank = false;
  for (const [id, qty] of now) {
    const d = qty - (was.get(id) ?? 0);
    if (d > 0) grew.push(d);
    else if (d < 0) shrank = true;
  }
  // A line that disappeared shrank to nothing.
  for (const [id, qty] of was) if (!now.has(id) && qty > 0) shrank = true;
  return { grew, shrank };
}

/**
 * Compare the same dish before and after, and either attribute the change to THIS tap or refuse to.
 *
 * ⚠️ ONE DISH IS SEVERAL LINES, AND A PEER'S LINE IS NOT OURS (Codex round 1 on #250).
 * `insertOrIncLine` merges only into a row matching on seat AND `added_by` AND fulfillment AND notes
 * AND price, so a tablemate ordering the same dish has their own row — and summing the dish
 * conflates the two. That re-creates, one level down, the very defect this module exists to remove:
 * our five units land in full while a peer decrements theirs by one, the sum reads four, and
 * "Added 4 — that line is now at our 99 max" describes a cap that never happened. The first fix
 * moved the count from the basket to the dish; the dish was still not the line.
 *
 * So the count is ATTRIBUTED, not summed. An add grows exactly one line, or creates one:
 *
 *   • exactly one line of this dish grew → that growth is ours, and the number is exact;
 *   • two or more grew → one of them is a peer's and nothing here can say which;
 *   • nothing grew but something shrank → our add is invisible in the difference, so the cap is
 *     NOT established and claiming it would be a fabricated diagnosis.
 *
 * The last two answer `unknown`, and `unknown` is spoken as silence. An unattributable difference
 * deserves nothing said about it rather than something said wrongly.
 */
export function classifyAddLanding(input: {
  before: readonly LineUnits[];
  after: readonly LineUnits[];
  menuItemId: string;
  requested: number;
}): AddLanding {
  const { grew, shrank } = dishDeltas(input.before, input.after, input.menuItemId);
  if (grew.length > 1) return { landed: 0, outcome: "unknown" };
  const landed = grew[0] ?? 0;
  if (landed === 0) return { landed: 0, outcome: shrank ? "unknown" : "none" };
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
