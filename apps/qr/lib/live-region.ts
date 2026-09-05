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

import type { PublishableRefusal } from "./cart-freeze";

/** The two independent ways this cart goes read-only. They are separate axes, never one flag. */
export type FreezeAxis = "locked" | "settling";

/**
 * The freeze a refusal has just explained to the diner, or `null` when none has been.
 *
 * ⚠️ It is an AXIS, not a boolean, and that is the whole reason this is not one flag: a refusal that
 * named the LOCK has said nothing about a settle freeze. `inertReason`'s docblock fixes settling as
 * the widest and longest-lived state — "the one with somewhere for the diner to go" — so silencing
 * the settle banner because a lock was explained would drop the more consequential of the two.
 *
 * ⚠️ AND THE LOCK ARM CARRIES ITS ATTRIBUTION, because the sentence does (Codex round 2 on #256,
 * P2). `refusedWriteClause` renders a `frozen` refusal through `inertReason({ lockedByYou:
 * refusal.freeze === "self" })`, so the region ends up holding EITHER "the order’s locked while you
 * check out" OR "…while someone checks out". An axis-only latch treats those two as one fact and
 * silences the banner for the other one — reachable on a single applied view: the recovery read
 * classifies a SELF-held lock, loses the screen to a newer view carrying a PEER-held lock, and
 * `locked` goes false→true exactly once with the peer's ownership. The effect composes the peer
 * banner, the latch suppresses it, and the diner is left reading that THEY are checking out while
 * the lockbar names someone else. The reverse handoff misreports the same way.
 *
 * `self` is a boolean and not the `CartFreeze` itself on purpose: the sentence splits exactly there
 * — `"self"` is the viewer, `"peer"` and `"held"` are both "someone" — so a finer latch would claim
 * a distinction the copy never makes.
 */
export type ExplainedFreeze = { axis: "settling" } | { axis: "locked"; self: boolean } | null;

/**
 * The freeze the diner can act on RIGHT NOW — both axes, plus who holds the lock.
 *
 * `lockedByYou` mirrors the provider's own binding of that name (and `cartFreeze(...) === "self"`,
 * which is what produced the refusal's attribution), so the latch and the sentence fork on one fact.
 */
export type LiveFreeze = { locked: boolean; settling: boolean; lockedByYou: boolean };

/**
 * Does the freeze a refusal explained STILL hold, given what is on screen right now?
 *
 * ⚠️ THIS EXISTS BECAUSE A `viewIsCurrent` SNAPSHOT IS NOT A CURRENCY CHECK (Codex round 1 on #256,
 * P1). The first fix for the overtaken-read hole passed `applyView`'s return value from
 * `explainCaught` down to `publishRefusal`. That answers "did my read win **when it landed**" — and
 * between then and the caller resuming from `await explainCaught(...)`, another mutation's view can
 * apply and take the screen. The flag still reads `true`, the rendered cart is editable, and the
 * latch claims a freeze nobody can see: the same silence one microtask further out.
 *
 * So currency is asked AT PUBLISH TIME, against the freeze the caller can read synchronously from
 * the refs `applyView` writes from the very view it applies. A latch is a claim about what the diner
 * SEES; the only honest source for that is what is on screen when the claim is made.
 */
export function explanationHolds(explained: ExplainedFreeze, current: LiveFreeze): ExplainedFreeze {
  if (explained === null) return null;
  if (explained.axis === "settling") return current.settling ? explained : null;
  // ⚠️ OWNERSHIP IS PART OF THE FACT, NOT A DETAIL OF IT (Codex round 2, P2). `locked` staying true
  // across a handoff does not mean the explanation still describes the screen: the refusal named a
  // holder, and a lock that changed hands makes that sentence wrong in the one way the diner can
  // check — against the lockbar beside it. Compared as the single boolean the copy forks on.
  return current.locked && current.lockedByYou === explained.self ? explained : null;
}

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
 * ⚠️ THE LATCH'S BOUND IS THE FACT, NOT THE WRITE — and an earlier draft of this docblock said the
 * opposite (Codex round 2 on #256, P3). It required a per-WRITE clear beside `lastRefusalRef` in
 * `forgetRefusal`, justified by a recovery read that LOST the screen latching a freeze no release
 * edge could ever retire. That hole is real, and it is closed at the SOURCE instead: `publishRefusal`
 * runs `explanationHolds` against the refs `applyView` writes, so an explanation the rendered cart
 * does not carry is never latched in the first place. `forgetRefusal` therefore does not clear this
 * ref, deliberately, and its own docblock records that arc — a contract here demanding otherwise
 * would read as a bug in the caller and invite the clear back.
 *
 * What the caller DOES still owe is the per-FACT clear at each release edge, scoped to that axis:
 * a peer releasing and re-locking with no write in between would otherwise leave a stale
 * explanation silencing a banner nobody explained.
 */
export function freezeBannerSuppressed(input: {
  axis: FreezeAxis;
  /** `true` when the cart is entering this freeze; `false` for the release edge. */
  entering: boolean;
  explained: ExplainedFreeze;
  /** The freeze state AFTER this transition — what the diner can act on now. */
  current: LiveFreeze;
}): boolean {
  // ⚠️ RULE 1, MADE PRECISE — and its own test is what forced this. A release was unconditionally
  // exempt, on the grounds that "you can edit again" is new information no refusal carries. That is
  // the RIGHT reason and it was attached to the wrong predicate: the axes are independent, so a
  // pay-lock can lift while the table still settles, and THAT release restores nothing. It cannot
  // strand anyone, because the diner still cannot edit either way — and it was overwriting a refusal
  // that names both the verdict and the live reason.
  //
  // So a release speaks whenever the diner's ability to act CHANGED, or whenever they hold no live
  // explanation. It is silent only when the cart is still frozen on an axis a refusal has already
  // explained — which is the same redundancy test as the entering case, not a weakening of rule 1.
  if (!input.entering) return explanationHolds(input.explained, input.current) !== null;
  // ⚠️ THE ENTERING EDGE ASKS THE SAME CURRENCY QUESTION (Codex round 2, P2). Reading `explained`
  // raw here trusted a latch that publish time had checked and a release edge had not yet retired —
  // and a lock changing HANDS retires nothing, because `locked` never goes false. Both edges now
  // suppress only on an explanation that still describes what the diner sees.
  const held = explanationHolds(input.explained, input.current);
  if (held === null) return false;
  // Rules 2 and 3, by RANK rather than equality — see the precedence note above. A refusal that
  // explained a freeze at least as wide as this banner's has already said the stronger true thing.
  return freezeRank(held.axis) >= freezeRank(input.axis);
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
 * The freeze a classified refusal explains, or `null` when it explains no freeze at all.
 *
 * ⚠️ DERIVED FROM THE REFUSAL, never from the cart's current flags. The refusal is what was SPOKEN;
 * the flags are what is true now, and the two can disagree by a tick — which is the entire class of
 * bug this slice sits in. `unknown` explains nothing: its sentence ("the order below is up to date")
 * names no freeze, so it must not silence either banner.
 *
 * ⚠️ AND IT TAKES THE WHOLE REFUSAL, NOT THE CAUSE STRING, so the attribution is read from
 * `refusal.freeze` — the same field `refusedWriteClause` renders the sentence from. A caller passing
 * ownership in beside the cause would be the second computation of one fact, which is the drift
 * shape W17 named and the reason `viewerHoldsLock` was taken off `refusedWriteClause`.
 */
export function explainedByRefusal(refusal: PublishableRefusal): ExplainedFreeze {
  if (refusal.cause === "frozen") return { axis: "locked", self: refusal.freeze === "self" };
  if (refusal.cause === "settling") return { axis: "settling" };
  return null;
}
