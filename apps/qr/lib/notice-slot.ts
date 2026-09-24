/**
 * Phase 1c — the precedence of the diner's ONE notice slot.
 *
 * `TableCartProvider` owns a single polite live region (the Toast) and every cart sentence goes
 * through it. Until Phase 1c it was last-caller-wins, which was fine while every caller spoke one
 * visible sentence per event. It stops being fine the moment claims are spoken at the TAP: a quiet
 * "Mohinga added" arriving on the heels of "Aung added Tea" would erase the tablemate's news before
 * anyone read it, and a queued claim landing a beat after a refusal would un-say the correction.
 *
 * Every notice is one of three kinds:
 *   • a CLAIM — the diner's own change, said on their behalf (may be QUIET: spoken, not drawn);
 *   • a CORRECTION — a retraction or a diagnosis of a write that did not land as claimed;
 *   • NEWS — anything else: a peer's add, a lock, a release, a reconnect.
 * Claims may be quiet. Corrections and news are always visible.
 *
 * `admitNotice` rules, IN ORDER:
 *   1. an empty slot → show;
 *   2. a correction over an IDENTICAL correction → extend (the timer resets; the node is not
 *      re-keyed, so five refused taps under one lock speak ONE sentence);
 *      a correction over a correction of the same FAMILY for a different dish → generalize: say
 *      the family's unnamed sentence, which covers both (blind review — "Tea didn't go through"
 *      replacing "Mohinga didn't go through" a beat later left Mohinga's claim unretracted);
 *      any other correction → show (a correction is never held back);
 *   3. a claim over a correction → defer (a retracted claim must not erase its own retraction);
 *   4. a quiet line over visible text → defer (a quiet line must not blank visible text early);
 *   5. anything else → show.
 *
 * ⚠️ NEWS IS NEVER DEFERRED. The lock-RELEASE banner ("The order’s unlocked — you can edit again")
 * directly contradicts the refusal it follows, and a diner who is not told keeps believing the cart
 * is frozen. `TableCartProvider.test.tsx` pins it: "STILL announces the release, even right after a
 * refusal explained the lock". Widening rule 3 to every non-correction would break exactly that.
 *
 * The deferred slot is ONE deep, newest wins, and is shown when the current notice's window ends.
 * `purgesDeferred` drops a waiting claim whenever a correction arrives: the claim may be the one the
 * correction retracts, and a retracted claim spoken afterwards is a lie. NEWS drops a waiting
 * VISIBLE claim too (blind review): drawn after the news it would be the last word on screen while
 * older than it — a deferred "Added to your order" under an honest "we couldn't confirm all of
 * them" summary. A waiting QUIET claim survives news: it is a late spoken confirmation of the
 * diner's own tap, and the row already shows the truth. The cost is sometimes losing a claim for a
 * DIFFERENT dish — losing a confirmation is the safe direction.
 */

export type NoticeKind = "claim" | "correction" | "news";

export type SlotNotice = {
  text: string;
  my?: string;
  quiet: boolean;
  kind: NoticeKind;
  /** A named correction's unnamed FAMILY sentence (`refusedWriteNotice` / `unconfirmedWriteNotice`),
   *  said instead when two dishes' corrections of one family collide (rule 2). */
  family?: { text: string; my?: string };
};

export function admitNotice(
  current: SlotNotice | null,
  incoming: SlotNotice,
): "show" | "extend" | "defer" | "generalize" {
  if (current === null) return "show";
  if (incoming.kind === "correction") {
    if (current.kind !== "correction") return "show";
    if (current.text === incoming.text && current.my === incoming.my) return "extend";
    const fam = incoming.family;
    if (fam && current.text === fam.text && current.my === fam.my) return "extend";
    if (fam && current.family?.text === fam.text && current.family.my === fam.my)
      return "generalize";
    return "show";
  }
  if (incoming.kind === "claim" && current.kind === "correction") return "defer";
  if (incoming.quiet && !current.quiet) return "defer";
  return "show";
}

/** Does `incoming` drop the notice waiting in the one-deep deferred slot? A correction drops a
 *  claim; news drops a VISIBLE claim. */
export function purgesDeferred(incoming: SlotNotice, deferred: SlotNotice): boolean {
  if (deferred.kind !== "claim") return false;
  if (incoming.kind === "correction") return true;
  return incoming.kind === "news" && !deferred.quiet;
}
