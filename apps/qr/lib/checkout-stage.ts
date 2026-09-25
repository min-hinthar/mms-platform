import type { CartItem } from "@mms/db";

/**
 * W12 — the two-moment checkout's ONE behavioral rule, kept pure so it can be pinned by a unit
 * test (the repo has no .test.tsx runner — decision logic lives in lib/, the W10d M46 rule).
 *
 * The dine-in cart opens on the moment the diner is most likely in:
 *  - anything still DRAFT → the Order moment (they're building a round — steppers, Send);
 *  - everything with the kitchen → the Bill moment (the mid-meal settle-nudge journey lands
 *    ready to pay, not back on a spent ordering screen).
 * An empty cart answers "order" but never renders a stage (the empty state returns first).
 * The diner can flip stages freely afterward — this only picks the landing.
 */
export type CheckoutStage = "order" | "bill";

export function initialStage(items: ReadonlyArray<Pick<CartItem, "lineState">>): CheckoutStage {
  if (items.length === 0) return "order";
  return items.some((i) => i.lineState === "draft") ? "order" : "bill";
}

/**
 * W12 review HIGH — what "Send to kitchen" actually SENDS. `mms_fire_cart` fires ONLY
 * fulfillment='dinein' drafts (to-go waits for checkout / make-it-now; grocery never fires), so
 * the CTA count, its render gate, and the View-bill promotion must bind to this predicate — an
 * all-drafts count promises sends the server will not perform, and a lone to-go/grocery draft
 * would pin the promotion forever. Counted in UNITS (qty), matching the header cart badge.
 */
export function kitchenDraftQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment === "dinein")
    .reduce((a, i) => a + i.qty, 0);
}

/**
 * W19 — what the Bill moment must WARN about (owner: "What if customers forget to send items to
 * kitchen and move forward to pay?"). Every still-draft FOOD line (dinein + togo, never grocery) is
 * charged at pay and then fired by `mms_fire_pending_food` the moment the payment lands — money is
 * safe, but the kitchen only starts those dishes AFTER payment, so the diner deserves to be told
 * before the charge, not discover it on the tracker.
 *
 * Deliberately a DIFFERENT predicate from `kitchenDraftQty` (dinein-only, bound to what the host's
 * Send button fires): a lone to-go draft is also charged-then-fired and deserves the same notice.
 * Counted in UNITS (qty), matching the badge and the send count.
 */
export function unsentFoodQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment !== "grocery")
    .reduce((a, i) => a + i.qty, 0);
}

/**
 * Phase 1b (owner, 2026-09-23: "only fulfilled orders on the bill should be payable … customers
 * should only checkout after bill is finalized" → "Everything sent") — at a dine-in table the bill
 * can be paid only once every dish the table can SEND has gone to the kitchen. Binds to the same
 * predicate as the Send CTA (`kitchenDraftQty`: dinein drafts, what `mms_fire_cart` fires), so every
 * line that blocks Pay is a line the host can clear with one tap. To-go drafts at a dine-in table
 * are not sendable (they fire at checkout) and so never block.
 *
 * ⚠️ ONLY WHEN SOMEONE CAN SEND (blind pass on #301). Only the host fires the table, and a table can
 * have NO host: a staff-started session mints `host_seat: null`, and a diner arriving by invite link
 * (`joinOnly`) never claims it. Gating that table would leave nobody able to send and so nobody able
 * to pay. Without a host the pre-1b behaviour stands: pay, and the drafts fire when it lands.
 *
 * The same binding on both sides: `create-intent` (and `openSettlement`) refuse on it server-side,
 * and the Bill's Pay control reads it to say why before the diner taps. Pickup and scan-and-go have
 * no send step — paying IS ordering — so it never applies there.
 */
export function payBlockedByUnsent(
  mode: string | null | undefined,
  kitchenDraftUnits: number,
  hostPresent: boolean,
): boolean {
  return mode === "dinein" && hostPresent && kitchenDraftUnits > 0;
}

/** The same count from raw `qr_cart_items` rows (`state`, not the view's `lineState`) — the server
 *  gate's input. */
export function kitchenDraftUnitsFromRows(
  rows: ReadonlyArray<{ state: string; fulfillment: string; qty: number }>,
): number {
  return rows
    .filter((r) => r.state === "draft" && r.fulfillment === "dinein")
    .reduce((a, r) => a + r.qty, 0);
}

// ── Phase 2c · gate ──
/**
 * The staff settle gate (owner decision 3, 2026-09-24: "every settle door refuses while dine-in
 * dishes are unsent") — the COUNTER half of `payBlockedByUnsent`, and deliberately a delegation, not
 * a copy: the rule is stated once, above, where its mutants live.
 *
 * The console can ALWAYS send (the table page's Send fires every dine-in draft, a diner's round
 * included), so the hostless exemption does not apply at the register: `hostPresent` is `true` by
 * construction here. A staff-started table with no host is exactly the table whose dishes nobody
 * else will send — the case the gate exists for.
 *
 * Read by the three staff settle doors on the server (`settleCash`, `closeSecureTab`,
 * `settleCard` — under the freeze, from `kitchenDraftUnits`), by the table page's pre-tap reason
 * (`FloorDetailLive`, from `detail.send.sendable`) and by the order pad's Take payment (`padSettle`).
 * `sendableUnits` is the same count on every side: `kitchenDraftUnitsFromRows`.
 */
export function staffSettleBlockedByUnsent(
  mode: string | null | undefined,
  sendableUnits: number,
): boolean {
  return payBlockedByUnsent(mode, sendableUnits, true);
}
