/**
 * J4 (residual) — the ONE binding that answers "may this viewer edit this cart?", and it answers it
 * the way the SERVER does.
 *
 * ## The asymmetry this exists to close
 *
 * All ELEVEN server-side refusals in `cart.ts` test bare `locked`, none comparing the holder to the
 * caller. The shapes (the count is measured by `scripts/check-freeze-parity.mjs`, which names the
 * whole set in EXPECTED_SUBJECTS — do not transcribe it from here):
 *
 *     if (locked) throw new Error("Order is locked while someone checks out");
 *     if (locked) return { ok: false, reason: "locked" };
 *     if (locked || settling) return { ok: false, reason: "locked" };
 *     if (authz.locked || authz.settling) return { ok: false };
 *
 * The client gate was strictly narrower — `lockedByPeer = locked && lockedBy && mySeat && lockedBy
 * !== mySeat` — so the set {locked, and the holder is ME} rendered FULLY EDITABLE while the server
 * refused every write. `changeQty` flips optimistically, the server throws, the catch swallows it
 * ("Locked or no-longer-open — refresh() below re-syncs"), and `refresh()` snaps the value back with
 * no explanation. That is J4's clause (b) verbatim: "a frozen cart renders fully editable and every
 * edit silently no-ops."
 *
 * W9b's exclusion was deliberate and right for the case it named — a diner standing on their own pay
 * step holds their own lock, and telling them "someone's checking out" would be a lie about
 * themselves. What it missed is that "don't say a peer has it" and "let them edit" are different
 * decisions, and it made both.
 *
 * ## The routes that reach a self-held lock on the review step
 *
 * One of them needs no error at all:
 *
 *   1. TWO TABS ON ONE DEVICE. `getCallerUid` resolves the anon session from cookies (`authz.ts`),
 *      so both tabs share a uid and tab B's review step has `lockedBy === mySeat`.
 *   2. `editOrder` with `reason: "error"` — falls through deliberately (only `superseded` is an
 *      established fact) and lands on review with the lock still held.
 *   3. `reason: "rate_limited"` — `releasePayLock` short-circuits before any write.
 *   4. A null attempt token (deployment skew) — `releasePayAttempt` releases nothing, and
 *      `classifyZeroRow` answers `unknown`, which also falls through.
 *
 * `releasePayLock`'s own docblock says the thing to avoid is "dropping the diner on a review step
 * that will refuse every edit". Routes 2–4 do exactly that, and route 1 does it with nothing wrong.
 *
 * ## Why this is a module and not three lines in the component
 *
 * `Checkout.tsx` has no test runner (there is not one `.test.tsx` in the app) and sits outside
 * `check-money-coverage`'s MONEY_PATHS and outside `verify:slice`'s mutant set — a rule written
 * there cannot be guarded at all. That is the W17 lesson, and it is why `effectiveTipRate` and
 * `tipPresets` are pure modules too.
 *
 * ## What is deliberately NOT here
 *
 * `settling` is absent. The split freeze does not share this defect: a settling cart is routed to a
 * different surface entirely (`Checkout.tsx` renders the split board when `isGroup && settling &&
 * splitContext`, and `cart/page.tsx` refuses a settling cart with no split context), so it never
 * reaches the editable-looking review step this binding guards. Folding it in would widen the blast
 * radius across the split flow to restate a rule that is already enforced by routing.
 */

/**
 * Who holds the pay-window lock, from the viewer's side.
 *
 * `held` is the honest fourth answer, not a padding case: the holder or the viewer's own seat can be
 * unknown (a read that came back thin), and a viewer who does not know their own seat cannot claim
 * the lock belongs to a peer OR to themselves. It blocks edits like the others — matching the
 * server, which does not care who is asking — but attributes the lock to nobody.
 */
export type CartFreeze = "peer" | "self" | "held" | null;

/** The lock facts a viewer has. All three come from ONE `getCartView` call, so they cannot disagree. */
export type FreezeInput = {
  locked: boolean;
  lockedBy: string | null;
  mySeat: string | null;
};

/**
 * Resolve the lock into the viewer's four cases.
 *
 * ⚠️ THE ORDER OF THE GUARDS IS THE RULE. `locked` is tested FIRST and alone, so this function can
 * never answer "editable" for a cart the server has frozen — every later branch only decides WHOSE
 * lock it is, never WHETHER there is one. Attribution is a copy decision; blocking is not.
 */
export function cartFreeze({ locked, lockedBy, mySeat }: FreezeInput): CartFreeze {
  if (!locked) return null;
  // Unattributable: we know the cart is frozen but not by whom, or we do not know our own seat.
  // Blocks edits exactly like the rest — a lock we cannot explain is still a lock.
  if (!lockedBy || !mySeat) return "held";
  return lockedBy === mySeat ? "self" : "peer";
}

/**
 * Does this freeze stop edits? Every non-null value does, which is the whole point.
 *
 * This mirrors `cart.ts`'s bare `locked` exactly. If a future edit narrows the server guard to
 * something like `if (locked && lockedBy !== uid)`, this function becomes WRONG in the
 * over-blocking direction — and `scripts/check-freeze-parity.mjs` fails on that edit specifically,
 * because over-blocking a money surface is the failure this repo has paid for before (the delivery
 * app's `computeDeliveryGate`, where a bare `!gate.isOpen` folded into a submit gate disabled Place
 * Order for an entire valid window with no escape).
 */
export function freezeBlocksEdits(freeze: CartFreeze): boolean {
  return freeze !== null;
}

/**
 * Does this freeze stop the PAYMENT? Only a peer's — and that is a different predicate on purpose.
 *
 * ⚠️ THE TIP IS NOT A CART WRITE (Codex round 2 on #246). `selectPresetTip` sets local state and the
 * rate rides into create-intent as `tipRate`; NO server mutation refuses it on `locked`. Gating the
 * tip chips on `freezeBlocksEdits` therefore blocked a control the server never blocks, and left a
 * self-frozen diner able to pay — Pay is their escape hatch — but only with whatever tip happened to
 * be selected. That is the over-blocking direction `check-freeze-parity.mjs`'s docblock names as
 * equally expensive, arriving through a control that was never a cart write in the first place.
 *
 * The server's own line is `acquireCartLock`'s `.or("locked.eq.false,locked_by.eq.<uid>,…")`: the
 * SAME uid re-acquires by design, so a self-held lock is not a refusal of the payment. Only a fresh
 * lock held by someone else produces `held_by_other` → 409.
 *
 * `held` does NOT block either, and that is deliberate rather than an oversight: an unattributable
 * lock MIGHT be a peer's, and if it is, create-intent answers 409 with a server-authored sentence.
 * Under-blocking here costs one honest refusal; over-blocking tells a diner who can pay that they
 * cannot. This is exactly the gate the Pay CTA has always used — extracted and named, not widened.
 */
export function freezeBlocksPayment(freeze: CartFreeze): boolean {
  return freeze === "peer";
}

/**
 * The freeze a viewer should SEE while their own payment request is in flight.
 *
 * ⚠️ SUPPRESS ONLY A LOCK THIS REQUEST TOOK (Codex round 2 on #246 — a regression the round-1 fix
 * introduced, not a pre-existing one). `continueToPayment` sets its in-flight flag, calls
 * create-intent — which ACQUIRES the lock — then refreshes, so `locked = true, lockedBy = me` lands
 * while the step is still "review". Painting a `--warn` bar there, under a CTA reading "Starting
 * checkout…", warns the diner about themselves. That much the round-1 fix got right.
 *
 * What it got wrong is that `in flight AND self` also matches a self lock that was ALREADY there —
 * the two-tabs-on-one-device case this whole slice exists for. Tab B's Pay CTA is deliberately live
 * (see `freezeBlocksPayment`), so pressing it flipped the freeze to null instantly: the bar vanished,
 * every edit control came back, and the live region announced "the order's unlocked" while the other
 * tab's lock was still held and every write would still be refused. A suppression that fires before
 * the request has acquired anything is a claim about the server made from a client flag.
 *
 * So the freeze as it stood WHEN THE REQUEST STARTED decides: only a cart that was editable then can
 * have been frozen by us since. Anything else keeps its bar for the whole round trip.
 */
export function visibleFreeze({
  freeze,
  payRequestInFlight,
  freezeAtRequestStart,
}: {
  freeze: CartFreeze;
  payRequestInFlight: boolean;
  freezeAtRequestStart: CartFreeze;
}): CartFreeze {
  const ourNewLock =
    payRequestInFlight && freeze === "self" && !freezeBlocksEdits(freezeAtRequestStart);
  return ourNewLock ? null : freeze;
}

/**
 * The sentence for a freeze — and the vocabulary it may NOT borrow.
 *
 * ⚠️ `self` MUST NOT SAY "another tab took over". That is `superseded`, a DIFFERENT fact, and
 * `classifyZeroRow` exists precisely to keep the two apart: a zero-row release is reachable from an
 * ordinary declined card (the webhook calls `releaseCartLock(cartId, null)` cart-wide while the
 * Element stays mounted), so claiming supersession there tells the diner something false AND blocks
 * them from editing a cart that is genuinely editable. That is the fabricated-diagnosis class M116
 * and M119 spent four PRs removing.
 *
 * These three fields prove exactly one thing about a self lock: this order is held, and the holder
 * is this seat. They cannot prove which tab, whether a payment is in flight, or that anything was
 * taken over. So the copy says only that, and points at the way out.
 *
 * `canRelease` says whether THIS viewer holds an attempt token it could release with. It changes
 * only the `self` sentence, and only between "here is the way out" and "it frees itself shortly" —
 * never into a claim about who else is involved.
 *
 * Returns null for an editable cart — there is nothing to announce.
 */
export function freezeNotice(
  freeze: CartFreeze,
  peerName: string | null,
  canRelease: boolean,
): string | null {
  switch (freeze) {
    case "peer":
      return `${peerName ?? "Someone"} is checking out — the order’s locked for a moment.`;
    case "self":
      // ⚠️ TWO SENTENCES, BECAUSE THE WAY OUT IS NOT ALWAYS AVAILABLE (Codex P2 on #246).
      //
      // Releasing a lock requires naming the ATTEMPT that took it (`releasePayAttempt` fails closed
      // without an era, by design — M124). A diner reaches a self-held freeze in two situations
      // that differ exactly there: the tab that MINTED the attempt still holds the token and can
      // release, while a SECOND tab on the same device never had one — same uid from the cookie
      // session, so it sees the lock as its own and cannot name it.
      //
      // The second tab must not release anyway: the first may be mid-checkout behind a live Payment
      // Element, and unfreezing the cart under it is the peer-mutation hole the lock exists to
      // close. So the copy has to differ, or the button promises something that cannot happen —
      // which is worse than no button, and was the shipped state of the first draft.
      return canRelease
        ? "Your checkout still has this order held — reopen it to make changes."
        : "Another checkout on this device is holding this order. It frees up on its own shortly.";
    case "held":
      return "This order’s locked while a checkout finishes.";
    default:
      return null;
  }
}

/**
 * The sentence for a Reopen attempt that did not unlock the order.
 *
 * ⚠️ A RECOVERY CONTROL THAT REPORTS NOTHING IS THE DEFECT THIS PR IS ABOUT (Codex round 3 on #246).
 * `releasePayLock` answers five distinct facts and `reopenOrder` rendered only one of them, so a
 * rate-limited or failed release changed the button to "Reopening…" and back with the bar still up
 * and nothing said — a silent no-op on the one control offered as the way out, which is J4's clause
 * (b) reappearing on the fix for J4's clause (b).
 *
 * Each arm says only what its reason establishes, and none of them borrows another's:
 *
 * - `superseded` — the one TERMINAL fact. `classifyZeroRow` reaches it only for a lock that is still
 *   fresh and stamped with a DIFFERENT era, so another attempt genuinely holds this cart. The caller
 *   also drops the attempt token here, because it provably matches no row and never will.
 * - `not_held` — our attempt released nothing AND no fresh lock of ours exists (the row is unlocked,
 *   or its lock has aged past the TTL, which `acquireCartLock` treats as takeable). Both halves of
 *   the sentence are established; neither claims who else is involved.
 * - `rate_limited` — the server said so, in those words.
 * - `error` / `unknown` — OUR outage, not a fact about the diner's tab. It says so, and points at
 *   the TTL, which is the backstop that actually exists.
 *
 * Returns null for a release that landed: the refreshed cart is the message.
 */
export function reopenFailureNotice(
  outcome: { released: true } | { released: false; reason: string },
): string | null {
  if (outcome.released) return null;
  switch (outcome.reason) {
    case "superseded":
      return "Another tab took over this checkout — that one is paying. This order unlocks when it finishes.";
    case "not_held":
      return "That checkout is already over. If the order still shows as locked, it clears on its own in a moment.";
    case "rate_limited":
      return "That was a lot of changes at once — give it a moment, then try again.";
    default:
      return "Couldn\u2019t reopen the order just now — try again in a moment. It also unlocks on its own shortly.";
  }
}
