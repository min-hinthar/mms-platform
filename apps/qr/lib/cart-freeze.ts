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
