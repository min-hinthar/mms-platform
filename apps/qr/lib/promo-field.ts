import type { PromoReason } from "./cart";

/**
 * F20 — WHICH promo refusals belong to the code box.
 *
 * A refusal ABOUT THE CODE (it is not a code, it is switched off, not started, expired, used up,
 * already used at this table) is drawn under the promo box and tied to it — the `@mms/ui` Field's
 * note, `aria-describedby`, `aria-invalid` — because retyping the code is the way out. A refusal
 * about THE ORDER or the attempt (the order is under the code's minimum, already being paid,
 * someone is checking out, too many tries, a failure we cannot name) is not the box's fault and
 * retyping it changes nothing, so it stays in the view's one region as before; marking the box
 * invalid for it would tell the diner their code is wrong when it may be fine.
 *
 * ⚠️ AN UNMET MINIMUM IS THE ORDER'S (blind pass on #355). The code is good; the edits that meet the
 * minimum never touch the box, and a box refusal outlives them and a stage flip, so bound to the box
 * it stood under a code that now applies, marked invalid. The region's sentence is retired by a
 * change to the order's lines or to the view (Checkout's `promoSaid`).
 *
 * A `Record` over the whole union, so a reason added to `PromoReason` is a COMPILE error here until
 * someone decides which kind it is — never silently the region's by omission.
 */
const ON_THE_CODE: Readonly<Record<PromoReason, boolean>> = {
  invalid: true,
  inactive: true,
  not_started: true,
  expired: true,
  min_not_met: false,
  exhausted: true,
  session_limit: true,
  cart_closed: false,
  locked: false,
  rate_limited: false,
  error: false,
};

export function promoRefusalOnField(reason: PromoReason): boolean {
  return ON_THE_CODE[reason];
}
