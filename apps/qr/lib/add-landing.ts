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
 * One rule, both paths. Pure, so it can carry a mutant. (The correction used to live in a `.tsx`,
 * which nothing could guard at all; since M46 a component CAN be tested and mutated, but a pure
 * module is still the right home — it is finer-grained and needs no render to falsify.)
 *
 * ⚠️ THIS DESCRIBES AN ANNOUNCEMENT, NEVER AN AMOUNT. Every price is server-derived and the view is
 * already applied by the time either caller asks, so a wrong answer here is a wrong sentence in the
 * live region — not a wrong charge.
 */

/** Just enough of a cart line to attribute units of one dish. `id` is load-bearing: without line
 *  identity a peer's line of the SAME dish is indistinguishable from the diner's own. */
export type LineUnits = { id: string; menuItemId: string; qty: number };

/**
 * The per-line maximum, mirrored from the column CHECK (`qty between 1 and 99`,
 * `20260619000100_cart_item_qty_cap.sql`). It is the ONLY reason `mms_cart_item_inc_qty` ever
 * short-fills, which is what makes it evidence rather than an inference — see `classifyAddLanding`.
 */
export const LINE_QTY_MAX = 99;

export type AddLanding = {
  /** Units attributed to THIS tap. Zero when nothing landed or nothing can be attributed. */
  landed: number;
  /**
   * `full` — everything asked for arrived. `partial` — some did, fewer than asked, and the shortfall
   * is attributable to this tap. `unknown` — a write we cannot see moved this dish inside our round
   * trip, and the difference no longer describes what the diner just did.
   *
   * ⚠️ `none` MEANS "THE NET DELTA WAS ZERO", NOT "NOTHING ARRIVED" — this docblock said the latter,
   * and every copy of the claim downstream came from here (Codex rounds 3-4 on #255). Three
   * different things produce it and the outcome cannot tell them apart: the line is at
   * `LINE_QTY_MAX`; the add matched a COMPED sibling and succeeded as a no-op (OPEN-ITEMS T25); or a
   * write we cannot see RESTORED the line to its pre-add quantity, so `dishDeltas` — which tests
   * `d > 0` and `d < 0` and does nothing at `d === 0` — sees our landed add cancel out (OPEN-ITEMS
   * T43). `addShortfallNotice` has always been honest about this ("WHY is not knowable here"); the
   * type's own docstring was not, and the recovery path in `TableCartProvider` reads `none` as
   * `landed: false` on that strength. The cap is NOT established by `none`.
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
): { grew: { by: number; to: number }[]; shrank: boolean } {
  const ofDish = (rows: readonly LineUnits[]) => rows.filter((r) => r.menuItemId === menuItemId);
  const was = new Map(ofDish(before).map((r) => [r.id, r.qty]));
  const now = new Map(ofDish(after).map((r) => [r.id, r.qty]));
  const grew: { by: number; to: number }[] = [];
  let shrank = false;
  for (const [id, qty] of now) {
    const d = qty - (was.get(id) ?? 0);
    if (d > 0) grew.push({ by: d, to: qty });
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
  const only = grew[0];
  if (!only) return { landed: 0, outcome: shrank ? "unknown" : "none" };
  if (only.by >= input.requested) return { landed: only.by, outcome: "full" };
  // ⚠️ A SHORTFALL IS ONLY A CAP IF THE LINE IS AT THE CAP (Codex round 3 on #250). Line identity
  // separates a PEER's row from ours, but it cannot separate two writes to the SAME row: an
  // authorized host editing this very line during our add moves it under us, so from a client
  // snapshot of 10 the host can set 9, our 5 lands, the line reads 14 — a net growth of 4 against a
  // request of 5, with nothing capped and everything having worked. `mms_cart_item_inc_qty` ONLY
  // short-fills at the column maximum, so the resulting quantity is the evidence; the delta alone
  // is an inference, and inferring here is what produced every fabricated cap sentence in this PR.
  if (only.to >= LINE_QTY_MAX) return { landed: only.by, outcome: "partial" };
  return { landed: only.by, outcome: "unknown" };
}

/**
 * The correction for an optimistic announce the server did not honour — or `null` when there is
 * nothing honest to say.
 *
 * ⚠️ IT STATES NO COUNT, AND THAT IS THE POINT (Codex round 4 on #250). A resulting quantity of 99
 * proves the line is CAPPED; it does not make the delta attributable to this add. An authorized host
 * editing the same row during the round trip moves it under us — from a snapshot of 97 the host sets
 * 98, our request for five lands one at 99, and the delta reads 2. "Added 2" would then be wrong
 * about the only number it states. Line identity separates a peer's ROW from ours and cannot
 * separate two writes to the SAME row, so the count is knowable only from the mutation itself.
 *
 * Every round of review on this module removed one inference — basket → dish → line → line-at-the-cap
 * → and now the count itself. What survives is what the data actually proves: something did not fit,
 * or nothing landed.
 */
export function addShortfallNotice(outcome: AddLanding["outcome"]): string | null {
  // At the cap, and we KNOW it: the resulting quantity is server truth, so naming the maximum is a
  // fact rather than an inference.
  if (outcome === "partial") return "Some of that couldn’t be added — that line is at our 99 max";
  // Nothing landed. WHY is not knowable here: the line may be at the maximum, or the add may have
  // matched a comped sibling (`insertOrIncLine` does not filter `comped`; `mms_cart_item_inc_qty`
  // excludes comped rows and still answers success — OPEN-ITEMS T25). So the sentence states the
  // outcome and stops, which is the one thing that is true in both cases.
  if (outcome === "none") return "Nothing was added — your order below is up to date";
  // `full` needs no correction, and `unknown` has nothing honest to say.
  return null;
}
