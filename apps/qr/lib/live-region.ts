/**
 * T33 — ARBITRATION for the one polite live region, because a single slot means the LAST writer
 * wins and the last writer is not always the one worth hearing.
 *
 * ## The defect, measured rather than reasoned about
 *
 * `flash` is one slot: it cancels both timers and replaces the text. On the taps that produce a
 * refusal, TWO things want that slot in the same beat, and they arrive in the wrong order:
 *
 *   1. `publishRefusal` speaks the specific sentence — synchronously, inside the catch.
 *   2. The lock/settle transition effect speaks the generic banner — deferred through
 *      `void Promise.resolve().then(...)`, so it lands AFTER.
 *
 * They collide precisely because they share a cause: the re-read that DIAGNOSES the refusal is the
 * same read that flips `locked`/`settling` through `applyView`. A jsdom probe against HEAD measured
 * the outcome exactly — the region ends up holding
 *
 *     "Someone is checking out — the order’s locked"          ← the banner
 *
 * where the diner needed
 *
 *     "That didn’t go through — the order’s locked while someone checks out."   ← the refusal
 *
 * The second names the VERDICT, and through `YourUsual` it also names the DISH. The first names
 * neither. So this is not two notices competing for attention; it is a strictly less informative
 * sentence about the SAME FACT overwriting a strictly more informative one, at the last hop, on the
 * exact input that produced it.
 *
 * ## Why the rule is "already explained", not "priority"
 *
 * A priority ladder would answer "which of these two is more important", and that framing is wrong:
 * the banner is not less important, it is REDUNDANT here. It exists for the diner who did nothing —
 * a peer takes the lock while they browse, every Add goes inert, and without it the surface changes
 * under them silently (W9b filed exactly that for the settle freeze). That diner still needs it.
 *
 * What has changed is only this: a diner who just tried to write and was told why has ALREADY been
 * told, with more detail. So the question is not rank, it is redundancy — and redundancy is decided
 * by whether the fact was explained, which is a fact about what was said, not about who said it.
 */

/** The two independent ways this cart goes read-only. They are separate axes, never one flag. */
export type FreezeAxis = "locked" | "settling";

/**
 * The freeze a refusal has just explained to the diner, or `null` when none has been.
 *
 * ⚠️ It is an AXIS, not a boolean, and that is the whole reason this is not one flag: a refusal that
 * named the LOCK has said nothing about a settle freeze. `inertReason`'s docblock fixes settling as
 * the widest and longest-lived state — "the one with somewhere for the diner to go" — so silencing
 * the settle banner because a lock was explained would drop the more consequential of the two.
 */
export type ExplainedFreeze = FreezeAxis | null;

/**
 * Should the freeze-transition banner stay silent?
 *
 * Three rules, and each is falsifiable on its own:
 *
 *  1. **A RELEASE always speaks.** "You can edit again" is new information that no refusal carries —
 *     a refusal asserts the opposite. Suppressing it strands a diner believing the cart is still
 *     frozen, which is the OVER-BLOCKING direction this repo has paid for before (the delivery app's
 *     `computeDeliveryGate`, where a bare `!gate.isOpen` disabled Place Order for a whole valid
 *     window). Under-speaking a redundant banner costs nothing; under-speaking a release costs the
 *     diner their order.
 *  2. **Entering a freeze is silent only when the SAME axis was explained.** That refusal already
 *     names this freeze and additionally names what the diner was trying to do.
 *  3. **Anything else speaks.** A refusal about the other axis does not cover this fact.
 *
 * ⚠️ PRECEDENCE, NOT EQUALITY — and the blind pass on this PR is why. The first draft suppressed
 * only an EXACT axis match, which is wrong in the cell where both freezes enter on ONE applied view
 * (reachable: `locked_at` and `settle_at` are independent columns with no mutual exclusion).
 * `classifyRefusedWrite` tests settling FIRST, so the refusal there explains `settling` — and an
 * equality rule then let the LOCK banner through, which runs before the settle callback and ends up
 * as the surviving sentence. The diff would have swapped the region from the WIDER banner to the
 * NARROWER one while still erasing the refusal: worse than doing nothing, on the cell the fixture
 * called the real shape.
 *
 * So the rank mirrors `inertReason`'s documented order — settling is wider than locked, "the state
 * that outlives the other and the one with somewhere for the diner to go". A refusal that explained
 * the WIDER freeze has already told the diner the strongest true thing; a narrower banner adds
 * nothing. A refusal that explained the NARROWER one has not, so the wider banner still speaks.
 *
 * ⚠️ THE CALLER MUST CLEAR `explained` ON BOTH BOUNDS, and neither is optional:
 *   • per WRITE (`forgetRefusal`, T31's discipline) — because the latch can be set from a recovery
 *     read that LOST the screen (`applyView` returns false; the refusal is still classified from
 *     what that read observed). Then the freeze it names is not in the rendered state at all, no
 *     release edge can ever fire for it, and without this clear the next genuine freeze is
 *     announced to NOBODY. A first draft deleted this clear because its mutant survived; the
 *     fixture was degenerate, not the rule unreachable — the separating input is an overtaken
 *     recovery read.
 *   • per FACT (the release edge) — because a peer releasing and re-locking with no write in
 *     between would otherwise leave a stale axis silencing a banner nobody explained.
 */
export function freezeBannerSuppressed(input: {
  axis: FreezeAxis;
  /** `true` when the cart is entering this freeze; `false` for the release edge. */
  entering: boolean;
  explained: ExplainedFreeze;
}): boolean {
  // Rule 1, first and alone — so no later branch can ever silence a release.
  if (!input.entering) return false;
  if (input.explained === null) return false;
  // Rules 2 and 3, by RANK rather than equality — see the precedence note above. A refusal that
  // explained a freeze at least as wide as this banner's has already said the stronger true thing.
  return freezeRank(input.explained) >= freezeRank(input.axis);
}

/**
 * How WIDE a freeze is, mirroring `inertReason`'s precedence exactly.
 *
 * ⚠️ THIS IS NOT AN ARBITRARY ORDER and must not drift from `inertReason`'s: that function resolves
 * one cart carrying both freezes into ONE sentence, settling first, on the stated grounds that it is
 * the state which outlives the other. If these two disagreed, the same cart would get its sentence
 * from one ranking and its silence from another.
 */
function freezeRank(axis: FreezeAxis): number {
  return axis === "settling" ? 2 : 1;
}

/**
 * The axis a classified refusal explains, or `null` when it explains no freeze at all.
 *
 * ⚠️ DERIVED FROM THE CAUSE, never from the cart's current flags. The cause is what was SPOKEN; the
 * flags are what is true now, and the two can disagree by a tick — which is the entire class of bug
 * this slice sits in. `unknown` explains nothing: its sentence ("the order below is up to date")
 * names no freeze, so it must not silence either banner.
 */
export function explainedByRefusal(cause: "frozen" | "settling" | "unknown"): ExplainedFreeze {
  if (cause === "frozen") return "locked";
  if (cause === "settling") return "settling";
  return null;
}
