#!/usr/bin/env node
/**
 * verify:slice — the pre-PR mechanical gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * Across W9a and W8, three adversarial review rounds each returned BLOCK, and nearly every finding
 * reduced to one thing: **a guard was written and never made to fail.** A green test file was shipped
 * as proof. Examples that actually happened, all caught late and expensively:
 *   • a randomised "property" that asserted `total === net + service + tax + tip` — literally the
 *     function's own return expression, so it survived every charge mutation;
 *   • split fixtures with `discountCents: 0` everywhere, so deleting the discount allocation entirely
 *     was invisible;
 *   • even-mode tested with equal seat ownership, making it indistinguishable from by-person;
 *   • an ESLint rule proven for one selector shape while a real violation survived in another.
 *
 * A multi-agent review finds these. It also costs ~1M tokens and 30-55 minutes. Mutation testing finds
 * the same class in ~2 minutes for free. So: run this FIRST, and let the review spend its attention on
 * what only a reader can judge — reachability, copy honesty, cross-surface coupling.
 *
 * WHAT IT DOES
 * ------------
 *   1. the standard gate (lint · typecheck · build · test)          [skip with --no-gate]
 *   2. a mutation battery over the money/authority modules — each mutation is applied, the suite that
 *      OWNS it must go red, then the file is restored. A SURVIVING mutant is a failure.
 *   3. the orphan-suite guard (mirrors ci.yml, so it fails here rather than on the runner)
 *
 * ADDING A MUTANT
 * ---------------
 * Add a row to MUTANTS. `find` must match EXACTLY ONCE in `file` — if it matches zero times the script
 * FAILS rather than skipping, because a silently-stale mutant is the same rot it exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { envFailures } from "./check-test-env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QR = path.join(ROOT, "apps/qr");

/**
 * Each mutant is a semantic change a real refactor could plausibly make. `suite` is the test file
 * that must catch it — keeping them one-to-one means a failure names the guard that is too weak,
 * not just "something broke".
 */
const MUTANTS = [
  // ── the charge authority ────────────────────────────────────────────────────────────────────────
  {
    id: "totals/tax-on-undiscounted-base",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "tax stops honouring the discount (CDTFA: tax is on the DISCOUNTED taxable base)",
    find: "Math.round((taxableBaseCents - discOnTaxableCents) * taxRate())",
    replace: "Math.round(taxableBaseCents * taxRate())",
  },
  {
    id: "totals/promo-clamped-before-the-reward",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "M22 — restores promo-first ordering. The combined discount and the diner's total are IDENTICAL either way, so nothing about the charge reddens; what changes is which instrument absorbs the clamp. Promo-first clamps the destructible one: a reward coupon is single-use and `mms_redeem_cart_reward` burns it in full, so every discarded cent is gone permanently for that diner, while a clamped promo code costs the same one redemption either way (its budget is a COUNT, consumed by `p_discount_cents > 0`). CASE B and the order-independence sweep are what tell the two apart",
    find: "  const rewardCents = Math.min(rewardCentsRaw, subtotalCents);",
    replace:
      "  const rewardCents = Math.min(rewardCentsRaw, Math.max(subtotalCents - Math.min(promoCentsRaw, subtotalCents), 0));",
  },
  {
    id: "totals/promo-contribution-reports-its-raw-face",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "M22, Codex round 1 P2 — `promoCents` is what fulfillment consumes a redemption ON. Report the RAW promo instead of the post-reward contribution and the consumption predicate is back to believing a promo delivered when it delivered nothing — the exact hole `p_promo_cents` was added to close, reopened one layer up where the SQL gate cannot see it",
    find: "    promoCents,",
    replace: "    promoCents: promoCentsRaw,",
  },
  {
    id: "totals/reward-face-collapses-to-the-clamped-amount",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "M22 — the disclosure's only input. Derive the FACE from the clamp and it equals the applied amount by construction, so the shortfall is always 0 and the surface goes permanently silent in exactly the case it exists for: a coupon larger than the basket, burned in full at fulfillment with the diner never told",
    find: "    rewardFaceCents: Math.max(rewardCentsRaw, 0),",
    replace: "    rewardFaceCents: rewardCents,",
  },
  {
    id: "totals/shortfall-gated-on-the-applied-not-the-attachment",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "M22, Codex round 1 P1 — the gate must be ATTACHMENT. Gating on the applied amount goes silent exactly where the whole coupon is at risk: a basket voided or comped away under an attached coupon drops `rewardCents` to 0 while `qr_carts.applied_reward_id` still holds an unredeemed reward a settle would burn in full — and the applied row keys on the same value, so the Remove control disappears with the warning. This mutant restores the first draft's inverted gate",
    find: "  if (totals.rewardFaceCents <= 0) return 0;",
    replace: "  if (totals.rewardCents <= 0) return 0;",
  },
  {
    id: "totals/grocery-in-tip-gate",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "W16a/M26 — grocery lines must not open the tip ask: the restaurantBase reduce is the tip gate's only input",
    find: '(i.fulfillment === "grocery" ? 0 : Number(i.unitPriceCents) * i.qty)',
    replace: "Number(i.unitPriceCents) * i.qty",
  },
  {
    id: "totals/second-discount-clamp-order",
    // M22 rewrote this one. It used to mutate the REWARD clamp, because the reward went second; the
    // reward now goes FIRST and the promo takes the remainder, so the second clamp — the one that
    // keeps the combined discount inside the chargeable base — is the promo's. Same rule, new owner:
    // a STALE mutant is a failure, not a skip, so it moves rather than being deleted.
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "the SECOND discount must clamp to what REMAINS after the first, or the combined discount exceeds the subtotal and the total goes negative",
    find: "Math.min(promoCentsRaw, Math.max(subtotalCents - rewardCents, 0))",
    replace: "Math.min(promoCentsRaw, subtotalCents)",
  },
  {
    id: "totals/rounding-inside-the-ratio",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "a transposed paren leaves a FRACTIONAL discount and moves the charge by 1¢",
    find: "Math.round(discountCents * (taxableBaseCents / subtotalCents))",
    replace: "Math.round(discountCents * taxableBaseCents) / subtotalCents",
  },
  {
    id: "totals/tip-on-subtotal",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "the tip rides the NET, not the pre-discount subtotal",
    find: "Math.round(netCents * tipRate)",
    replace: "Math.round(subtotalCents * tipRate)",
  },
  {
    id: "totals/comped-lines-charged",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "S2.3 — a comped line is a committed $0 decision and must leave every base",
    find: 'i.state !== "voided" && !i.comped',
    replace: 'i.state !== "voided"',
  },

  // ── the per-seat split charge (what each card is actually billed) ────────────────────────────────
  {
    id: "split/discount-limb-deleted",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "per-seat discount feeds baseCents AND the net that weights service",
    find: "const discount = allocate(grand.discountCents, subtotal);",
    replace: "const discount = subtotal.map(() => 0);",
  },
  {
    id: "split/even-mode-broken",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "even mode must ignore ownership — needs a LOPSIDED fixture to be visible",
    find: "const subWeights = even\n    ? seats.map(() => 1)\n    :",
    replace: "const subWeights = false\n    ? seats.map(() => 1)\n    :",
  },
  {
    id: "split/unassigned-dropped",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "an unowned line must be spread, not dropped — needs a MIXED owned/unassigned fixture",
    find: "(ownedSub[i] ?? 0) + unassignedSub / n",
    replace: "(ownedSub[i] ?? 0)",
  },
  {
    id: "split/service-by-subtotal",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "service is weighted by NET; separating it needs a non-proportional discount",
    find: "const service = allocate(grand.serviceChargeCents, net);",
    replace: "const service = allocate(grand.serviceChargeCents, subtotal);",
  },
  {
    id: "split/tax-by-subtotal",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "a seat owning only exempt lines must not be taxed on the aggregate",
    find: "const tax = allocate(grand.taxCents, taxWeights);",
    replace: "const tax = allocate(grand.taxCents, subWeights);",
  },
  {
    id: "split/allocate-tiebreak",
    file: "apps/qr/lib/split-math.ts",
    suite: "lib/split-math.test.ts",
    why: "largest-remainder must be deterministic — mms_fulfill_split_order raises on a sum drift",
    find: ".sort((a, b) => b.frac - a.frac || a.i - b.i)",
    replace: ".sort((a, b) => a.frac - b.frac || a.i - b.i)",
  },

  // ── the tax engine ──────────────────────────────────────────────────────────────────────────────
  {
    id: "tax/rate-drift",
    file: "apps/qr/lib/tax.ts",
    suite: "lib/tax.test.ts",
    why: "the L.A rate must be pinned on the TS side (the SQL half is pinned in supabase/tests/)",
    find: "const RATE = 0.105;",
    replace: "const RATE = 0.104;",
  },

  {
    id: "tax/cold-food-togo-taxable",
    file: "apps/qr/lib/tax.ts",
    suite: "lib/tax.test.ts",
    why: "CDTFA — cold food is exempt to-go; this is the only category a diner can flip",
    find: '    case "cold_food":\n    case "beverage_cold":\n      return dineIn;',
    replace: '    case "cold_food":\n    case "beverage_cold":\n      return true;',
  },

  // ── the line-authority gate ─────────────────────────────────────────────────────────────────────
  {
    id: "permissions/post-fire-diner-edit",
    file: "apps/qr/lib/permissions.ts",
    suite: "lib/permissions.test.ts",
    why: "post-fire is staff-only — this is what stops a guest mutating a fired ticket",
    find: 'if (lineState !== "draft") return false;',
    replace: 'if (lineState === "voided") return false;',
  },
  {
    id: "permissions/comped-mutable",
    file: "apps/qr/lib/permissions.ts",
    suite: "lib/permissions.test.ts",
    why: "a comped line is immutable to EVERYONE, staff included",
    find: "if (comped) return false;",
    replace: "if (false) return false;",
  },
  {
    id: "permissions/cross-owner-guard",
    file: "apps/qr/lib/permissions.ts",
    suite: "lib/permissions.test.ts",
    why: "a guest may edit only their OWN line",
    find: 'return actor.role === "host" || actor.isOwner;',
    replace: "return true;",
  },
  // W9c — not money, but the one SAFETY rule in the diner path: an allergy note that cannot be
  // carried into a reorder must be dropped and disclosed, never shortened. "Just truncate it" is the
  // plausible future edit, so it is the mutation that has to stay red.
  // ── W16c — the confirm step's copy (the numbers + the owner's own words) ────────────────────────
  {
    id: "confirm-copy/amount-dropped-from-the-proceed-button",
    file: "apps/qr/lib/confirm-copy.ts",
    suite: "lib/confirm-copy.test.ts",
    why: "W16c, re-homed by Phase 1b — the last thing under the diner's thumb must name the sum it charges. The pay confirm is retired, so that job is the Pay button's own label (`payProceedLabel`); a bare 'Pay' is a charge that never showed what it charges",
    find: "  return `Pay ${dollars(amountCents)}`;",
    replace: '  return "Pay";',
  },
  {
    id: "confirm-copy/owner-verbatim-string-swapped",
    file: "apps/qr/lib/confirm-copy.ts",
    suite: "lib/confirm-copy.test.ts",
    why: "W16c, re-homed by Phase 1b — Min's OWN Burmese from the W16 directive now rides the send's success line (`sentCopy`), the moment its completed-action statement is true; a silent swap to another key is exactly the drift the pin exists to catch",
    find: '    my: t("my", "sentConfirmed"),',
    replace: '    my: t("my", "confirmCancel"),',
  },
  // ── W19 — the forgot-to-send notice (pay-with-drafts is supported, but INFORMED) ────────────────
  {
    id: "confirm-copy/unsent-items-silenced-in-the-charge-confirm",
    file: "apps/qr/lib/confirm-copy.ts",
    suite: "lib/confirm-copy.test.ts",
    why: "W19, re-homed by Phase 1b — a diner who forgot to send can pay; the charge INCLUDES the drafts and the kitchen only starts them after payment. The note above the Pay button (`unsentPayNote`) naming them is what turns that from a surprise into a choice — silencing it is the plausible 'tidy the pay step' edit",
    find: "  if (unsent <= 0) return null;",
    replace: "  return null;",
  },
  // ── Phase 1b — "Everything sent": a dine-in bill is payable only once every dish is sent ────────
  {
    id: "checkout-stage/pay-gate-blocks-every-door",
    file: "apps/qr/lib/checkout-stage.ts",
    suite: "lib/checkout-stage.test.ts",
    why: "Phase 1b — the gate is a DINE-IN rule. Pickup and scan-and-go have no send step (paying IS ordering), so dropping the mode check refuses every pickup and market payment at create-intent: a revenue outage behind a rule that was only ever meant for tables",
    find: '  return mode === "dinein" && hostPresent && kitchenDraftUnits > 0;',
    replace: "  return hostPresent && kitchenDraftUnits > 0;",
  },
  {
    id: "checkout-stage/pay-gate-strands-a-hostless-table",
    file: "apps/qr/lib/checkout-stage.ts",
    suite: "lib/checkout-stage.test.ts",
    why: "Phase 1b blind pass — only the host can send, and a staff-started table whose diners all arrived by invite link has NO host. Gating it leaves nobody able to send and so nobody able to pay by card: the table is stranded at the Pay button with staff as the only way out",
    find: '  return mode === "dinein" && hostPresent && kitchenDraftUnits > 0;',
    replace: '  return mode === "dinein" && kitchenDraftUnits > 0;',
  },
  {
    id: "checkout-stage/pay-gate-counts-unsendable-lines",
    file: "apps/qr/lib/checkout-stage.ts",
    suite: "lib/checkout-stage.test.ts",
    why: "Phase 1b — the gate must count only what Send can clear (dinein drafts). Counting a to-go draft — which fires at checkout, not on Send — locks Pay behind a line no button can ever unlock: the table cannot pay at all",
    find: '    .filter((r) => r.state === "draft" && r.fulfillment === "dinein")',
    replace: '    .filter((r) => r.state === "draft")',
  },
  // ── Phase 1b — the browser's Back walks Order → Bill → Pay (lib/checkout-history.ts) ─────────
  {
    id: "checkout-history/back-from-pay-stays-on-pay",
    file: "apps/qr/lib/checkout-history.ts",
    suite: "lib/checkout-history.test.ts",
    why: "Phase 1b — Back from the pay step must LEAVE through editOrder, which releases the pay-window lock. Answering 'none' leaves the screen on Pay while the URL says Bill, and the next Back leaves /cart holding the lock — freezing the whole table's cart until the TTL, the exact defect the in-page back control exists to prevent",
    find: '    return s.busy ? "restore" : "leavePay";',
    replace: '    return "none";',
  },
  {
    id: "checkout-history/back-mid-charge-releases-the-lock",
    file: "apps/qr/lib/checkout-history.ts",
    suite: "lib/checkout-history.test.ts",
    why: "Phase 1b — while a PaymentIntent confirm is in flight, Back must be refused: leaving runs editOrder, and releasing the lock under a live authorization lets the table edit the cart out from under the charge (W9b)",
    find: '    return s.busy ? "restore" : "leavePay";',
    replace: '    return "leavePay";',
  },
  {
    id: "checkout-history/forward-walks-past-the-undo-window",
    file: "apps/qr/lib/checkout-history.ts",
    suite: "lib/checkout-history.test.ts",
    why: "Phase 1b — the Forward button must honour the Bill door the View-bill button keeps shut during the send's undo window; ignoring it opens the Bill (and its Pay CTA) over dishes that may still be pulled back",
    find: '  if (s.hash === "#bill") return s.stage === "bill" ? "none" : s.canBill ? "toBill" : "restore";',
    replace: '  if (s.hash === "#bill") return s.stage === "bill" ? "none" : "toBill";',
  },
  {
    id: "checkout-stage/unsent-count-narrowed-to-dinein",
    file: "apps/qr/lib/checkout-stage.ts",
    suite: "lib/checkout-stage.test.ts",
    why: "W19 — unsentFoodQty must count togo drafts too (mms_fire_pending_food fires dinein AND togo): narrowing it to kitchenDraftQty's dinein-only predicate under-counts, so a lone to-go draft pays unwarned — the exact gap the notice exists to close",
    find: '    .filter((i) => i.lineState === "draft" && i.fulfillment !== "grocery")',
    replace: '    .filter((i) => i.lineState === "draft" && i.fulfillment === "dinein")',
  },
  // ── W17a — the POS price seam stays UNFACTORED, and the toggle stays TAX-ONLY ───────────────────
  {
    id: "order-lines/pos-price-marked-up",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-price.test.ts",
    why: "W17a — re-introducing a markup at the ONE seam that mints unit prices charges every diner above the POS price the register rings (W16a shipped exactly this: dine-in \u00d71.15). The owner's rule is the bare POS price, so a factor here must be red",
    find: "    unitPriceCents: item.base_price_cents + addCents,",
    replace:
      "    unitPriceCents: Math.round(((item.base_price_cents + addCents) * 1.15) / 25) * 25,",
  },
  {
    id: "cart/toggle-re-prices-the-line",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-toggle.test.ts",
    why: "W17a — a dinein\u2194togo flip must move the routing TAG and the per-line tax, never the charged amount. Forwarding any p_unit_price_cents re-prices a line the diner already saw, and the SQL coalesce then makes it durable",
    find: "    p_fulfillment: input.fulfillment,\n  });",
    replace: "    p_fulfillment: input.fulfillment,\n    p_unit_price_cents: 1234,\n  });",
  },
  {
    id: "cart/toggle-swallows-a-refusal",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-toggle.test.ts",
    why: "M100 — mms_set_line_fulfillment's mode gate answers not_dinein_session, and this line is the only thing carrying that verdict out of the RPC. A caller that reports every refusal as ok tells the diner their tap landed while the row never moved — the blocked-write-reads-as-success shape, one process boundary out from the .update() lesson",
    // The bare `if (data !== "ok") …` line occurs TWICE in cart.ts (the toggle and makeItNow); the
    // `return { ok: true };` suffix is what makes this one unique. Measured, not assumed.
    find: '  if (data !== "ok") return { ok: false, reason: data ?? "error" };\n  return { ok: true };',
    replace: '  if (data !== "ok") return { ok: true };\n  return { ok: true };',
  },
  {
    id: "cart/make-it-now-swallows-a-refusal",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-toggle.test.ts",
    why: "M107 — mms_fire_line's mode gate is the only thing stopping an UNPAID pickup cart putting food on the KDS (kitchen.ts reads carts in open+paid). A caller that reports every refusal as ok hands the diner a fired-looking line the kitchen never got, and hides the guard's verdict from the one surface that could show it",
    find: '  if (data !== "ok") return { ok: false, reason: data ?? "error" };\n  // No touchCart: mms_fire_line\'s write',
    replace: '  if (data !== "ok") return { ok: true };\n  // No touchCart: mms_fire_line\'s write',
  },
  {
    id: "ttl/recheck-waits-the-shortest-axis",
    file: "apps/qr/lib/lock-ttl.ts",
    suite: "lib/lock-ttl.test.ts",
    why: "T20 \u2014 a cart that is BOTH locked and settling stays frozen until both have lapsed, so a re-read scheduled at the SHORTER horizon finds it still frozen and buys nothing but a round trip. Taking the min turns the one scheduled re-read \u2014 the whole point of the fix \u2014 back into a poll that has to fire twice before it can ever see a changed answer",
    find: "  return Math.max(locked ? CART_LOCK_TTL_MS : 0, settling ? SETTLE_TTL_MS : 0);",
    replace:
      "  return Math.min(\n    locked ? CART_LOCK_TTL_MS : Infinity,\n    settling ? SETTLE_TTL_MS : Infinity,\n  );",
  },
  {
    id: "ttl/recheck-arms-on-an-editable-cart",
    file: "apps/qr/lib/lock-ttl.ts",
    suite: "lib/lock-ttl.test.ts",
    why: 'T20 \u2014 the null arm is what keeps this a SCHEDULED re-read rather than a poll. Answering a delay for an unfrozen cart arms a timer on every cart in the app, which is the design `recheckLock` explicitly declined on the checkout side ("without inventing a timer or a poll") and would re-read every diner\'s cart on a fixed cadence for no reason',
    find: "  if (!locked && !settling) return null;",
    replace: "  if (!locked && !settling) return CART_LOCK_TTL_MS;",
  },
  {
    id: "freeze/lock-banner-shadows-the-way-out",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'T22(d) \u2014 THIS IS THE SHIPPED DEFECT, restored as a precedence flip. A cart can read locked AND settling at once (abortSettlement releases `settle_at`, reads the shares, then `refreeze`s with no `locked` predicate \u2014 a tablemate taking the pay lock in that window leaves both true, and `assertCartMember` reports both on one view). Ranking the lock first shows a banner with NO control and shadows the settle banner, the one element on /menu carrying "Pay your share \u2192" \u2014 telling the diner to wait on the surface that had somewhere to send them, while the Add pills two elements away already say the table is paying. Settling wins for `inertReason`\u2019s reason: it is the wider truth and the one with somewhere to go',
    find: '  if (s.settling && s.cartId) return "settle";\n  if (s.locked) return "lock";',
    replace: '  if (s.locked) return "lock";\n  if (s.settling && s.cartId) return "settle";',
  },
  {
    id: "landing/units-summed-instead-of-attributed",
    file: "apps/qr/lib/add-landing.ts",
    suite: "lib/add-landing.test.ts",
    why: 'T21(c) + Codex round 1 on #250 \u2014 the defect this module was written to remove, one level down. A dish is SEVERAL lines (`insertOrIncLine` merges only into a row matching on seat AND `added_by` AND fulfillment AND notes AND price), so summing the dish conflates a peer\u2019s line with the diner\u2019s own: two lines growing at once yields an inflated number ("Added 3" when one unit landed), and there is no way from totals alone to say which growth was ours. An add grows exactly ONE line, so attribution is the only count that can be spoken',
    find: '  if (grew.length > 1) return { landed: 0, outcome: "unknown" };',
    replace: '  if (grew.length > 1 && false) return { landed: 0, outcome: "unknown" };',
  },
  {
    id: "landing/a-partial-fill-reads-as-full",
    file: "apps/qr/lib/add-landing.ts",
    suite: "lib/add-landing.test.ts",
    why: 'T21(c) \u2014 THIS IS THE SHIPPED RECOVERY-PATH DEFECT, restored. Treating any positive increase as a full landing returns silently on a capped merge, so the optimistic "Added 5 to your order" stays the last thing the diner and the screen reader heard while the applied view shows one unit. The amounts are server-derived and correct; the SENTENCE is the lie',
    find: '  if (only.by >= input.requested) return { landed: only.by, outcome: "full" };',
    replace: '  return { landed: only.by, outcome: "full" };',
  },
  {
    id: "landing/an-unattributable-count-is-spoken",
    file: "apps/qr/lib/add-landing.ts",
    suite: "lib/add-landing.test.ts",
    why: 'T21(c), Codex round 4 on #250 \u2014 a resulting quantity of 99 proves the line is CAPPED; it does not make the delta attributable to this add. An authorized host editing the same row during the round trip moves it under us: from a client snapshot of 97 the host sets 98, our request for five lands ONE unit at 99, and the delta reads 2 \u2014 so "Added 2" is wrong about the only number it states. Line identity separates a peer\u2019s ROW from ours and cannot separate two writes to the SAME row, so the count is knowable only from the mutation itself. The copy states the outcome and stops',
    find: '  if (outcome === "partial") return "Some of that couldn\u2019t be added \u2014 that line is at our 99 max";',
    replace: '  if (outcome === "partial") return "Added 1 \u2014 that line is now at our 99 max";',
  },
  {
    id: "landing/a-cap-inferred-from-the-delta-alone",
    file: "apps/qr/lib/add-landing.ts",
    suite: "lib/add-landing.test.ts",
    why: 'T21(c), Codex round 3 on #250 \u2014 line identity separates a PEER\u2019s row from ours, but it cannot separate two writes to the SAME row. An authorized host editing this line during our add moves it under us: from a client snapshot of 10 the host sets 9, our 5 lands, the line reads 14 \u2014 a net growth of 4 against a request of 5 with NOTHING capped and everything having worked, and "Added 4 \u2014 that line is now at our 99 max" is then false in both halves. `mms_cart_item_inc_qty` only short-fills at the column maximum, so the RESULTING quantity is the evidence; the delta alone is an inference, and inferring is what produced every fabricated cap sentence in this PR',
    find: '  if (only.to >= LINE_QTY_MAX) return { landed: only.by, outcome: "partial" };\n  return { landed: only.by, outcome: "unknown" };',
    replace: '  return { landed: only.by, outcome: "partial" };',
  },
  {
    id: "landing/a-peer-removal-reported-as-a-cap",
    file: "apps/qr/lib/add-landing.ts",
    suite: "lib/add-landing.test.ts",
    why: "T21(c) \u2014 when NOTHING of ours grew and a line of this dish shrank, our add is invisible in the difference and the cap is NOT established: a peer removed units inside our round trip. Answering `none` hands it to `addShortfallNotice`, which then states an outcome about a write we never confirmed \u2014 about a dish that just got smaller, and about a write we never confirmed. `unknown` exists so the one state we cannot explain stays unexplained",
    find: '  if (!only) return { landed: 0, outcome: shrank ? "unknown" : "none" };',
    replace: '  if (!only) return { landed: 0, outcome: "none" };',
  },
  {
    id: "view/a-committed-write-reports-failure",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-view-read.test.ts",
    why: 'T21(a), and the half a blind adversarial pass had to find \u2014 making the READ throw was right, letting that throw escape a MUTATION was not. `addItem`/`setQty` commit the row and only THEN render a view, so a failure there says nothing about whether the tap landed, and every consumer reads a rejection as "the write failed": /grocery rolls its optimistic list back to the pre-tap snapshot, leaving the basket at 2 while the server holds 3 and checkout charges 3 \u2014 the exact divergence that file\u2019s own comment forbids, from the opposite direction \u2014 and KioskMenu leaves the sheet open with "something went wrong", so the operator re-taps an add that already committed and the guest is charged twice',
    find: "    return null; // written, unreadable — NEVER a refused write",
    replace: '    throw new Error("cart view unreadable");',
  },
  {
    id: "view/line-read-failure-reads-as-an-empty-cart",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-view-read.test.ts",
    why: 'T21(a) \u2014 THIS IS THE SHIPPED DEFECT, restored. postgrest RESOLVES on failure (the service client never calls `.throwOnError()`), so a dropped socket, a statement timeout, a pool error and a 42703 all arrive as `{ data: null, error }` \u2014 and `rows ?? []` turns that into an EMPTY ITEM LIST returned as server truth. The totals come from a SECOND read that does bind and throw, so the two disagree: the kiosk review renders the empty list above a live total with `loadFailed` false, suppressing its own honest failure screen, and the provider applies the blank cart under a valid view ticket with the optimistic "Added to your order" still on screen',
    find: "  if (rowsErr) throw UNAVAILABLE();",
    replace: "  if (rowsErr) void rowsErr;",
  },
  {
    id: "view/unreadable-cart-answers-a-verdict",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-view-read.test.ts",
    why: 'T21(a) \u2014 the SHAPE is the routing, not just the throw. `/cart` reaches its outage screen only through `e instanceof AuthzError && e.code === "unavailable"`; any other error falls to the arm that tells the diner their order "isn\u2019t available on this device. Start from the menu." \u2014 blaming their device, implying the order is gone, offering no retry. That is the audit\u2019s worst-rated copy and the exact sentence W10a exists to have deleted, so a bare Error here re-ships it while every "we throw on failure" assertion stays green',
    find: "  if (cartErr) throw UNAVAILABLE();",
    replace: '  if (cartErr) throw new Error("cart read failed");',
  },
  {
    id: "name/a-tablemate-can-name-themselves-the-reader",
    file: "apps/qr/lib/peer-name.ts",
    suite: "lib/peer-name.test.ts",
    why: 'T20 \u2014 presence names are peer-supplied with almost no filtering by design (`setName` clamps length only, `cleanPresence` strips control characters), and the pay-lock banner puts one into a sentence ABOUT THE READER. Passing the name through unnarrowed restores "You is checking out \u2014 the order\u2019s locked for a moment": the seat comparison keeps the app\u2019s BELIEF right while the sentence still opens with the word the impersonation is built on',
    find: '  if (latin !== "" && FIRST_OR_SECOND_PERSON.has(latin)) return "Someone";',
    replace: '  if (latin === "\\u0000") return "Someone";',
  },
  {
    id: "name/a-non-latin-name-is-erased",
    file: "apps/qr/lib/peer-name.ts",
    suite: "lib/peer-name.test.ts",
    why: 'T20 (Codex round 2 on #249) \u2014 THIS IS THE SHIPPED DEFECT, restored, and it is the one the impostor defence caused. Judging blankness on the LETTERS-ONLY projection collapses every name written in Burmese, Chinese or any non-Latin script to "" and answers "Someone" \u2014 in a bilingual EN/MY app, on the lock banner AND on every peer avatar\u2019s accessible label. A guard against one contrived name that silently misnames the ordinary guest, on the banner and in the live region that read `lockedByName`. Blankness belongs to the TRIMMED name; the projection exists only to recognise the Latin spellings that would read as the reader',
    find: '  const trimmed = (name ?? "").trim();\n  if (trimmed === "") return "Someone";',
    replace:
      '  const trimmed = (name ?? "").trim();\n  if (trimmed.toLowerCase().replace(/[^a-z]/g, "") === "") return "Someone";',
  },
  {
    id: "read/reaching-the-server-narrows-to-ours",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "T26, and it fails in the OPPOSITE direction to its sibling \u2014 which is the point of pinning both. T20's re-arm chain asks `readReachedServer`, and an overtaken read still proves the cart is reachable. Narrowing it to `applied` kills the chain whenever a concurrent read or mutation wins the race, on a cart that is still frozen and whose unchanged axes therefore never re-run the effect: the permanently dead /menu T20 exists to fix, restored by a one-word edit that reads like a tightening",
    find: '  return o !== "failed";',
    replace: '  return o === "applied";',
  },
  {
    id: "written/an-overtaken-read-is-threaded-anyway",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 3 on #251, P1) \u2014 a ticketed read can come back, establish perfectly well whether the write landed, AND still lose the screen to a view applied after it was issued. The verdict is a fact about the moment we looked; the ROWS may predate the winner. Dropping the gate threads that stale snapshot into the next queued write, and `setQty` is ABSOLUTE \u2014 the recovery saw 3, a host set 5, and the next decrement sends 2 instead of 4, silently reverting them. It is the same wrong-number defect as discarding a refusal's view, reached from the opposite side, which is why both directions are pinned",
    find: "  const view = viewIsCurrent ? reread : null;",
    replace: "  const view = reread;",
  },
  {
    id: "written/a-refused-writes-view-is-discarded",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 2 on #251, P1) \u2014 a refusal is ESTABLISHED by a successful recovery read, so it holds the freshest cart anyone has, and `AddButton` threads it into the next queued op. Withholding it sends that op to a LOCAL `itemsRef` synced in a passive effect, which inside a promise chain still holds the pre-write list \u2014 and `setQty` is ABSOLUTE, so a stale baseline is a WRONG NUMBER, not a lost tap: a host moving a line 3 \u2192 5 during the refused write makes the next decrement send 2 instead of 4 and silently overwrite them",
    find: '  return r.state === "unconfirmed" ? null : r.view;',
    replace: '  return r.state === "applied" ? r.view : null;',
  },
  {
    id: "written/an-unsent-write-borrows-the-unconfirmed-sentence",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 6 on #251, P1) \u2014 the two sentences are NOT interchangeable and only one may invite a retry. `unconfirmed` means the request LEFT and may have landed, so 'try that again' there can charge the dish twice; `unsent` means a queued absolute setQty had no trustworthy baseline and was never sent, where the retry is the correct offer and nothing can double. Collapsing them either strands the diner on a tap that vanished with no explanation, or invites the exact retry the rest of this slice exists to prevent",
    find: '  return "We couldn\u2019t reach your order \u2014 nothing changed. Try that again in a moment.";',
    replace: '  return "We couldn\u2019t confirm that \u2014 check your order below.";',
  },
  {
    id: "written/the-unconfirmed-notice-asserts-a-currency-it-lacks",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 1 on #251, P2) \u2014 this sentence RETRACTS an optimistic 'Added to your order', and it is reached on both ways into `unconfirmed`. On one of them the re-read FAILED, so there is no current list: borrowing `refusedWriteNotice`'s 'the order below is up to date' tells the diner the cart they are looking at is settled when we cannot see it \u2014 a fabricated verdict wearing the copy of an honest one, in the one live region an SR user has",
    find: '  return \"We couldn\u2019t confirm that \u2014 check your order below.\";',
    replace: '  return \"We couldn\u2019t confirm that \u2014 the order below is up to date.\";',
  },
  {
    id: "written/an-unreadable-cart-reads-as-a-refusal",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 3 on #250, P1) \u2014 THIS IS THE SHIPPED DEFECT, restored. A response lost after the row committed is indistinguishable from a refusal, and answering `refused` is what let `YourUsual` set `doneCount` back to the item and re-add a dish that had already landed: a duplicate line on a real bill from a tap that worked. The two ways to be wrong are not symmetric \u2014 a lost dish costs the diner a tap, a duplicate costs them money",
    find: '  if (reread === null) return { state: "unconfirmed" };',
    replace: '  if (reread === null) return { state: "refused" };',
  },
  {
    id: "written/an-ambiguous-delta-reads-as-a-refusal",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 (Codex round 4 on #250, P1) \u2014 the sentinel was wrong even when NOTHING was broken. The re-read succeeded; only the attribution failed, because a peer touched the same dish in the same window. Calling that a refusal sends `YourUsual` down the retry arm on a healthy connection, so the duplicate charge no longer needs an outage to reach \u2014 it needs a busy table, which is the normal case this app is for",
    find: '  if (landed === null) return { state: "unconfirmed" };',
    replace: '  if (landed === null) return { state: "refused" };',
  },
  {
    id: "written/an-unconfirmed-write-becomes-retryable",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 \u2014 `mayRetry` is the single gate on re-sending a write, and `refused` is the only state where the cart was actually READ and found not to contain it. Widening it to everything-but-applied puts `unconfirmed` back on the retry path, which is the duplicate charge again \u2014 this time entered through the predicate rather than the classifier, so pinning the classifier alone would not catch it",
    find: '  return r.state === "refused";',
    replace: '  return r.state !== "applied";',
  },
  {
    id: "written/an-unconfirmed-write-may-be-announced",
    file: "apps/qr/lib/write-outcome.ts",
    suite: "lib/write-outcome.test.ts",
    why: "T26 \u2014 `mayClaimLanding` and `mayRetry` answer false together for `unconfirmed` and are still not the same question: it means BOTH 'do not re-send' and 'do not claim it'. Collapsing the claim half to not-refused makes a write nobody could see into a spoken success in the one live region an SR user has \u2014 the fabricated-diagnosis class M116 and T14 exist to remove, arriving from the honest direction this time",
    find: 'export function mayClaimLanding<V>(r: WriteResult<V>): boolean {\n  return r.state === "applied";\n}',
    replace:
      'export function mayClaimLanding<V>(r: WriteResult<V>): boolean {\n  return r.state !== "refused";\n}',
  },
  {
    id: "seq/a-stale-read-overwrites-a-newer-view",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "T21(b) partial \u2014 the watermark is the only thing making the cart view monotonic. Several concurrent getCartView calls are in flight at once with no cancellation between them, so accepting a ticket that is merely NOT AHEAD of the screen lets the slower of two reads win: a read that observed `locked: true` lands after one that observed the lock released, puts the freeze back, and the /menu surface stays dead for another full TTL with no event able to clear it",
    find: "  if (seq <= s.applied) return false;\n  s.applied = seq;\n  return true;",
    replace: "  s.applied = seq;\n  return true;",
  },
  {
    id: "seq/a-read-in-flight-reserves-the-screen",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "T21(b) partial, Codex round 2 on #249 \u2014 refusing on the newest ISSUED rather than the newest APPLIED lets a read that FAILS suppress an earlier read that SUCCEEDED. That is T20's own bug restored: the scheduled re-read observes the lock expired, a visibility refresh issued moments later 503s and applies nothing, and the good observation is discarded anyway \u2014 leaving /menu frozen for another full window with nothing able to clear it",
    find: "  if (seq <= s.applied) return false;",
    replace: "  if (seq !== s.issued) return false;",
  },
  {
    id: "seq/a-mutations-view-stops-invalidating-reads",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "T21(b) partial \u2014 a mutation's view must outrank the reads ALREADY IN FLIGHT when it lands, because any of them may have read its rows before the write committed. Applying it without moving the watermark leaves those older reads valid, and the next one to land undoes the add the diner just watched appear \u2014 the optimistic-doctrine snap-back this provider exists to avoid, and the one error here that touches money because the diner re-adds",
    find: "  if (seq === undefined) {\n    s.applied = s.issued;\n    return true;\n  }",
    replace: "  if (seq === undefined) {\n    return true;\n  }",
  },
  {
    id: "freeze/self-drops-to-editable",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "J4 (residual) \u2014 this IS the shipped defect, restored. `cart.ts` refuses on bare `locked` at eleven mutations with no comparison to the caller, so a lock held by the viewer's OWN seat froze every write while `lockedByPeer` left every control live: the diner taps, the value flips optimistically, the server throws, the catch swallows it, and `refresh()` snaps it back with no explanation. Reachable with nothing wrong \u2014 two tabs on one device share a uid, so tab B sees `lockedBy === mySeat`",
    find: '  return lockedBy === mySeat ? "self" : "peer";',
    replace: '  return lockedBy === mySeat ? null : "peer";',
  },
  {
    id: "freeze/held-drops-to-editable",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "J4 (residual) \u2014 a lock we cannot attribute is still a lock. `cart/page.tsx` nulls the split context on ANY read failure, and W9b's own comment records that sourcing the seat from it once left `lockedByPeer` permanently false on a dine-in group cart. Answering `null` here re-opens that exact silent-refusal screen on the path most likely to produce it",
    find: '  if (!lockedBy || !mySeat) return "held";',
    replace: "  if (!lockedBy || !mySeat) return null;",
  },
  {
    id: "freeze/blocking-narrowed-to-peer",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "J4 (residual) \u2014 the parity rule itself. Blocking must mirror the server's bare `locked`; narrowing it to `peer` is precisely the `lockedByPeer` predicate whose asymmetry with `cart.ts` is the defect. The unit test asserts this as a truth table against the server's own predicate rather than a list of return values, so this mutant reddens the parity case, not just one row",
    find: "  return freeze !== null;",
    replace: '  return freeze === "peer";',
  },
  {
    id: "freeze/promises-a-reopen-it-cannot-do",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'Codex P2 on #246 \u2014 the escape hatch that was not one. `releasePayAttempt` fails closed without an era (M124, deliberate: the other tab may be behind a live Payment Element), and a SECOND tab on the same device never minted one \u2014 it shares the uid from the cookie session, so it sees the lock as its own and cannot name it. Ignoring `canRelease` restores a sentence that tells that diner to "reopen it" beside a button that can only call refresh(). A control that looks like the way out and is not is worse than no control, and it was the shipped state of this PR\'s first draft',
    find: "      return canRelease",
    replace:
      '      return true\n        ? "Your checkout still has this order held \u2014 reopen it to make changes."\n        : false',
  },
  {
    id: "freeze/self-claims-a-takeover",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "M116/M119 on a new surface. `superseded` is established ONLY by a release that succeeded and matched nothing (`classifyZeroRow`), and it is reachable from an ordinary declined card \u2014 the webhook calls `releaseCartLock(cartId, null)` cart-wide while the Element stays mounted. These three fields prove the cart is held by this seat and nothing more, so borrowing that vocabulary tells the diner something false AND implies a state they cannot exit",
    find: '        ? "Your checkout still has this order held \u2014 reopen it to make changes."',
    replace: '        ? "Another tab took over this checkout \u2014 reopen the order to edit it."',
  },
  {
    id: "freeze/tip-follows-the-edit-gate",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "Codex round 2 on #246 \u2014 the OVER-blocking direction, which this repo has paid for before (the delivery app's `computeDeliveryGate`, where a bare `!gate.isOpen` folded into a submit gate disabled Place Order for an entire valid window). The tip is not a cart write: `selectPresetTip` sets local state and the rate rides into create-intent as `tipRate`, so no server mutation refuses it on `locked`. Widening this to the edit gate leaves a self-frozen diner able to pay \u2014 `acquireCartLock` lets the same uid re-acquire, so Pay is their escape hatch \u2014 but only with whatever tip happened to be selected",
    find: '  return freeze === "peer";\n}\n\n/**\n * The freeze a viewer should SEE',
    replace: "  return freeze !== null;\n}\n\n/**\n * The freeze a viewer should SEE",
  },
  {
    id: "freeze/suppresses-a-preexisting-self-lock",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "Codex round 2 on #246 \u2014 the residue of round 1's own fix. The in-flight flag goes true BEFORE create-intent acquires anything, so `in flight AND self` also matches the self lock that was already there: the two-tabs-on-one-device case this slice exists for. Tab B's Pay CTA is deliberately live, so one press hid the lockbar, re-enabled every edit control and announced \"the order's unlocked\" while the other tab still held the lock and every write would still be refused \u2014 a claim about the server made from a client flag",
    find: '    payRequestInFlight && freeze === "self" && !freezeBlocksEdits(freezeAtRequestStart);',
    replace: '    payRequestInFlight && freeze === "self";',
  },
  {
    id: "refusal/every-refusal-reads-as-unreachable",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'T14 \u2014 THIS IS THE SHIPPED DEFECT, restored. `TableCartProvider`\'s `add`/`setItemQty` catches flashed "Reconnecting to your table\u2026" and re-minted the table session for EVERY throw, while `add`\'s own comment listed "a refused write (cart locked, a stale/invalid modifier selection)" among the causes. Collapsing every arm into the one that re-mints is precisely that: a diner whose tablemate is checking out is told their connection dropped and watches a recovery for a session that was never broken',
    find: '  if (!reread.ok) return { cause: "unreachable" };',
    replace:
      '  if (!reread.ok) return { cause: "unreachable" };\n  return { cause: "unreachable" };',
  },
  {
    id: "refusal/remint-runs-on-a-cart-it-just-read",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "T14 \u2014 the RECOVERY is a stronger claim than the sentence: it says we know what is wrong and this fixes it. Every arm but `unreachable` has just proved the session works by reading the cart through it, so re-minting there repairs a problem that does not exist \u2014 and the `cartId`-diff effect then announces the session was renewed or restarted, a second false statement",
    find: '  return refusal.cause === "unreachable";',
    replace: '  return refusal.cause !== "frozen";',
  },
  {
    id: "refusal/precedence-disagrees-with-inertReason",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'T14 (adversarial round 1 on #248) \u2014 the two modules that describe one frozen cart must rank its freezes the SAME way. `inertReason` is documented "settling \u2192 locked \u2192 minting, deliberately widest-first", and `AddButton`/`ItemSheet`/`YourUsual` all render it; a classifier that tested `locked` first handed the same locked-and-settling cart a different freeze from the controls beside it, so which story the diner got depended on which surface spoke last. The first draft of this PR shipped exactly that disagreement',
    find: '  if (reread.settling) return { cause: "settling" };\n  const freeze = cartFreeze(reread.freeze);',
    replace:
      '  const freeze = cartFreeze(reread.freeze);\n  if (freezeBlocksEdits(freeze) && freeze !== null) return { cause: "frozen", freeze };\n  if (reread.settling) return { cause: "settling" };\n  const _unused = 0;\n  void _unused;',
  },
  {
    id: "refusal/unknown-manufactures-a-freeze",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "T14 \u2014 the fabrication in the other direction. The refusal was real but this client cannot see why (a sold-out line, a stale modifier, a line owned by someone else); answering `frozen` puts a lock sentence over a cart nobody locked, and tells the diner to wait for something that will never lift",
    find: '  return { cause: "unknown" };',
    replace: '  return { cause: "frozen", freeze: "held" };',
  },
  {
    id: "refusal/lock-clause-forks-from-inertReason",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'T14/T32 \u2014 the "name it ONCE" rule applied to copy. /menu speaks `inertReason` from `AddButton` and `ItemSheet` (the disabled control\'s accessible name) and, since T32, from `YourUsual`, which composes THIS clause. A hand-written lock clause gives one frozen cart two vocabularies on one screen. The replacement is also lowercase and period-free, so it satisfies the shape contract and reddens only the AGREEMENT assertion \u2014 which is the point: a fork that looks like a clause is the one a shape check cannot see',
    find: '      return inertReason({\n        minting: false,\n        locked: true,\n        lockedByYou: refusal.freeze === "self",\n        settling: false,\n      })!;',
    replace:
      '      return refusal.freeze === "self" ? "another checkout on this device is holding this order" : "someone is checking out";',
  },
  {
    id: "refusal/unknown-borrows-the-reconnect-sentence",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: 'T14 \u2014 the fabrication isolated to the copy. "Reconnecting" is established ONLY by a re-read that failed, and it is the sentence that accompanies a session re-mint. Saying it for a write refused on a cart we just READ tells the diner their connection is at fault and invites them to wait for a recovery that is not running. Since T30 the reconnect sentence has no publishable arm at all, which makes borrowing it strictly worse: it names a recovery the diner will never see happen',
    find: '      return "the order below is up to date";',
    replace: '      return "we\u2019re reconnecting to your table";',
  },
  // ── M46 / T18: the /menu freeze WIRING, in `.tsx` ────────────────────────────────────────────
  //
  // ⚠️ THE FIRST NON-`lib/` MUTANT TARGETS. Everything above mutates a pure module; these two are
  // React components, and they are here because the rules below live ONLY in them. `mayRetry`,
  // `recoveredWrite`, `refusalNeedsRemint` and `refusedWriteNotice` are each pinned in `lib/` — the
  // code that CALLS them was invisible to every check until this PR: no vitest config matched
  // `.test.tsx`, `check-money-coverage` skipped the suffix, and `check-child-freeze` never opens a
  // component that imports the cart actions from the React context rather than from `lib/`.
  //
  // Each `find` is ONE self-contained line that DECLARES its subject. Deliberately not a span
  // across a comment: three anchors in this file have already gone stale that way, because an edit
  // to prose between two statements breaks a matcher about neither of them.
  {
    id: "refusal/notice-forks-from-the-clause",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "T32 \u2014 the whole slice in one line. The notice must be ONE template over the clause, because a second caller (`YourUsual`) appends the clause into a sentence of its own; the moment the notice re-derives its own text, the two renderings can drift and the diner hears one verdict twice. The replacement is the per-arm switch that shipped before this PR",
    find: "  return `${opener} \u2014 ${refusedWriteClause(refusal)}.`;",
    replace:
      '  return refusal.cause === "frozen" ? "That didn\u2019t go through \u2014 the order\u2019s locked while someone checks out." : `${opener} \u2014 ${refusedWriteClause(refusal)}.`;',
  },
  {
    id: "t33/release-loses-its-exemption",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: "T33 rule 1, and the OVER-BLOCKING direction \u2014 the expensive one here. \"You can edit again\" is new information no refusal carries (a refusal asserts the opposite), so a diner who is never told the cart reopened keeps believing it is frozen and nothing else on /menu corrects them. This is the shape `check-freeze-parity`'s docblock names as equally costly to under-blocking, and the delivery app's `computeDeliveryGate` is the war story",
    find: "  if (!input.entering) return explanationHolds(input.explained, input.current) !== null;",
    replace: "  if (!input.entering) return false;",
  },
  {
    id: "t33/suppression-goes-axis-blind",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: 'T33 rules 2-3 \u2014 the reason `explained` is an AXIS and not a boolean. A refusal that named the LOCK has said nothing about a settle freeze, and `inertReason` fixes settling as the widest, longest-lived state ("the one with somewhere for the diner to go"), so an axis-blind suppression silences the banner for the MORE consequential freeze because the lesser one had been explained',
    find: "  return freezeRank(held.axis) >= freezeRank(input.axis);",
    replace: "  return true;",
  },
  {
    id: "t33/entering-a-freeze-is-never-suppressed",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: "T33 in reverse \u2014 the whole slice, deleted. With this the banner always speaks and the measured defect returns verbatim: the generic sentence overwrites the specific one a microtask later, on exactly the taps that produce a refusal",
    find: "  return freezeRank(held.axis) >= freezeRank(input.axis);",
    replace: "  return false;",
  },
  {
    id: "t33/unknown-explains-a-freeze",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: 'T33 \u2014 `unknown`\'s clause is "the order below is up to date", which names NO freeze, so it must not silence a banner about one. Mapping it to an axis is the fabricated-diagnosis class arriving through arbitration instead of copy: a diner told nothing about a freeze, because a sentence that never mentioned it is treated as having explained it',
    find: '  if (refusal.cause === "settling") return { axis: "settling" };\n  return null;',
    replace:
      '  if (refusal.cause === "settling") return { axis: "settling" };\n  return { axis: "locked", self: false };',
  },
  {
    id: "t33/lock-banner-ignores-arbitration",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: 'T33 at the wiring \u2014 the rule can be perfect and unconsulted. Without this call the lock banner takes the slot unconditionally, which is the measured HEAD behaviour: the region ends up holding "Someone is checking out \u2014 the order\'s locked" where the diner needed the sentence naming the verdict and the dish',
    find: '        freezeBannerSuppressed({\n          axis: "locked",\n          entering: locked,',
    replace:
      '        false \u0026\u0026 freezeBannerSuppressed({\n          axis: "locked",\n          entering: locked,',
  },
  {
    id: "t33/settle-banner-reads-the-lock-axis",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T33 \u2014 the axis is read at the CALL SITE, so a correct rule can still be asked the wrong question. Its fixture had to be found: the first draft settled a cart with `locked:false`, so the lock release edge cleared `explained` first and this mutant SURVIVED against it. The separating input keeps the pay-lock held while the table starts splitting, which is also the real shape",
    find: '          axis: "settling",\n          entering: settling,',
    replace: '          axis: "locked",\n          entering: settling,',
  },
  {
    id: "t33/refusal-records-no-axis",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T33 \u2014 the arbitration has nothing to read if the refusal does not say what it explained, so the banner speaks and the defect returns. Derived from the CAUSE and not from the cart's flags on purpose: the cause is what was SPOKEN, the flags are what is true now, and the two disagreeing by a tick is the class this slice sits in",
    find: "      explainedFreezeRef.current = explanationHolds(explainedByRefusal(refusal), {",
    replace: "      explainedFreezeRef.current = explanationHolds(null, {",
  },
  {
    id: "t33/latch-survives-an-overtaken-read",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T33's CRITICAL (blind pass on this PR). `explainCaught` classifies from the read it made EVEN WHEN `applyView` rejected it \u2014 deliberately, since the refusal is a fact about the moment it looked. Latching that freeze is a different claim: that the diner can SEE it. Drop the gate and an overtaken read latches a freeze the rendered state never carries, so no release edge can ever fire for it and the NEXT genuine lock is announced to nobody \u2014 the W9b silence, caused by the arbitration meant to prevent it",
    find: "        locked: freezeRef.current.locked,\n        settling: settlingRef.current,",
    replace: "        locked: true,\n        settling: true,",
  },
  {
    id: "t33/settle-release-stops-clearing-the-fact",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: 'T33 \u2014 the SETTLE twin of the release bound, which shipped with neither mutant nor test until the blind pass named it (HIGH). Its lock counterpart had both, so this line could be deleted with the whole gate green \u2014 on the axis this module calls the more consequential of the two. Drop it and a split called off then re-opened leaves a stale "settling" silencing a banner nobody explained',
    find: '    if (!settling \u0026\u0026 explainedFreezeRef.current?.axis === "settling")\n      explainedFreezeRef.current = null;',
    replace: "",
  },
  {
    id: "t33/precedence-collapses-to-equality",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: "T33 \u2014 the cell an equality rule got wrong (blind pass, HIGH). Both freezes can enter on ONE applied view (`locked_at` and `settle_at` are independent columns) and `classifyRefusedWrite` tests settling FIRST, so the refusal explains `settling`. Under equality the LOCK banner is let through, and because its effect is declared first its callback runs first \u2014 so the region swaps from the WIDER banner to the NARROWER one while the refusal is still erased, which is worse than not arbitrating at all",
    find: "  return freezeRank(held.axis) >= freezeRank(input.axis);",
    replace: "  return held.axis === input.axis;",
  },
  {
    id: "t33/release-invites-editing-while-settling",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: 'The release copy must be true of BOTH axes (blind pass, MEDIUM). A pay-lock can lift while the table is still splitting, and "you can edit again" is then false \u2014 every `addItem`/`setQty` still refuses on `settling`. Rule 1 PINS the release as always-spoken, so without this branch the slice would have guarded a false sentence IN rather than merely left it standing',
    find: '        ? "The pay-lock lifted \u2014 the order stays locked while your table splits the bill"',
    replace: '        ? "The order\u2019s unlocked \u2014 you can edit again"',
  },
  {
    id: "t33/latch-ignores-the-lock-holder",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: 'T33\'s ATTRIBUTION half (Codex round 2 on #256, P2). `refusedWriteClause` renders a frozen refusal through `inertReason({ lockedByYou: refusal.freeze === "self" })`, so the region holds either "the order\u2019s locked while you check out" or "\u2026while someone checks out". `locked` never goes false across a handoff, so no release edge retires the latch \u2014 an axis-only test then silences the banner for the OTHER holder and leaves the diner reading that THEY are checking out while the lockbar names someone else',
    find: "  return current.locked \u0026\u0026 current.lockedByYou === explained.self ? explained : null;",
    replace: "  return current.locked ? explained : null;",
  },
  {
    id: "t33/entering-trusts-a-stale-latch",
    file: "apps/qr/lib/live-region.ts",
    suite: "lib/live-region.test.ts",
    why: "T33 \u2014 currency is asked on BOTH edges or on neither (Codex round 2, P2). The entering branch read `explained` raw, trusting a latch that publish time had checked and a release edge had not yet retired; a lock changing HANDS retires nothing, because `locked` never goes false. Restore the raw read and the ownership rule above becomes decorative on the exact edge that speaks",
    find: "  const held = explanationHolds(input.explained, input.current);",
    replace: "  const held = input.explained;",
  },
  {
    id: "t33/publish-forgets-whose-lock-it-is",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T33 at the SOURCE of the latch \u2014 the rule can be right and asked with the wrong ownership. Through `cartFreeze`, the same function that gave the refusal its attribution inside `classifyRefusedWrite`, so both sides fork on one derivation; hardcode it and a self-held lock's refusal latches nothing and is overwritten by its own banner a microtask later",
    find: '        lockedByYou: cartFreeze(freezeRef.current) === "self",\n      });',
    replace: "        lockedByYou: false,\n      });",
  },
  {
    id: "m224/refused-qty-edit-claims-it-landed",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "M224 itself \u2014 the whole defect was a comment-only `catch { }`, so a refused edit reported success to the chain and the number simply snapped back with no lockbar and no sentence, on the screen where the diner is about to pay. Claiming the landing is exactly that silence, restored: every refusal arm goes quiet at once while the accepted-write case stays green",
    find: "        return false;\n      }\n    });\n    qtyChain.current.set(id, write);",
    replace: "        return true;\n      }\n    });\n    qtyChain.current.set(id, write);",
  },
  {
    id: "m224/unreadable-cart-gets-a-verdict",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "T30 at the /cart seam. A diagnosis read that never reached the server has established NOTHING a diner may be told \u2014 `explainCaught` narrows the same arm away on /menu, and `PublishableRefusal` is what makes speaking it a compile error there. Hand it any cause and an offline phone is told its edit was refused, when all we know is that we cannot see the cart; the optimistic number has already reverted, which is the honest floor",
    find: "        return null; // unreachable \u2014 establishes nothing a diner may be told (T30)",
    replace: '        return { cause: "unknown" };',
  },
  {
    id: "m224/diagnosis-forgets-the-view-it-read",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The classification is read off the view this call OBSERVED, kept even when the read loses the screen \u2014 the refusal is a fact about the moment we looked. Drop the capture and every refusal degrades to the unpublishable arm, so the screen goes silent again on exactly the window M224 was filed for",
    find: "          seen.view = v;\n          return v;",
    replace: "          return v;",
  },
  {
    id: "t33/cart-banner-overwrites-the-refusal",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "T33 ported to /cart, and the collision is WORSE here than on /menu: the re-read that diagnoses the refusal is the read that flips `locked`, so this effect runs on the refusal's own view. (WHY it wins the slot is not established by anything here — this mutant proves only that it does.) Unconsulted, the region ends up holding the generic banner \u2014 a strictly less informative sentence about the same fact, with the diner never learning their tap was refused",
    find: "    const suppressed = freezeBannerSuppressed({",
    replace: "    const suppressed =\n      false &&\n      freezeBannerSuppressed({",
  },
  {
    id: "t33/cart-release-stops-clearing-the-fact",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "T33's STALENESS BOUND on /cart, and the only shape that reaches it: `explanationHolds` cannot catch a peer who releases and re-locks with no write in between, because at the publish moment and at every banner moment the lock is genuinely true. Only the release EDGE can retire the fact. Drop it and the re-lock is silenced by an explanation for a freeze that had already ended \u2014 a banner about a fact nobody explained, with every control dead again",
    find: '    if (held.axis === "locked" && !locked) {\n      explainedFreezeRef.current = null;\n      return;\n    }',
    replace: '    if (held.axis === "locked" && !locked) {\n      return;\n    }',
  },
  {
    id: "m230/toggle-drops-its-refusal",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'M224\'s silence on the pill beside the stepper. The result of `setLineFulfillment` was DROPPED entirely \u2014 the whole return value, not just a field \u2014 so a `busy` refusal in the same peer-lock window re-grouped the line optimistically, snapped it back, and said nothing. The control being "draft-only" is a statement about the RENDER gate, and that gate reads `lineState` from the last view',
    find: '        refused = !r.ok && r.reason === "busy";\n      } catch {\n        // Authz / rate-limit / transport.',
    replace:
      "        refused = false;\n      } catch {\n        // Authz / rate-limit / transport.",
  },
  {
    id: "m230/toggle-fabricates-a-diagnosis",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'The NARROWING is the rule, not the diagnosis. `busy` is the server\'s own "locked || settling", so a re-read classifies a freeze it actually asserted; `not_yours` is an ownership fact the re-read never establishes, and `error` / an RPC-named code carry no freeze at all. Widen the predicate and a line the kitchen fired mid-tap is explained as a LOCK \u2014 the M116/T14 fabricated diagnosis, on the screen that just removed it',
    find: '        refused = !r.ok && r.reason === "busy";\n      } catch {\n        // Authz / rate-limit / transport.',
    replace:
      "        refused = !r.ok;\n      } catch {\n        // Authz / rate-limit / transport.",
  },
  {
    id: "m230/make-now-drops-its-refusal",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'The same drop on "Send to kitchen now". Its comment claimed a refusal "just no-ops back to server truth on refresh \u2014 the control is draft-only, so no error UI is needed"; that is true of the render gate and false of the window, which is exactly the reasoning M224 was filed against',
    find: '        accepted = r.ok;\n        refused = !r.ok && r.reason === "busy";\n      } catch {\n        refused = true;\n      }\n      if (refused) {\n        // A fired line',
    replace:
      "        accepted = r.ok;\n        refused = !r.ok && false;\n      } catch {\n        refused = true;\n      }\n      if (refused) {\n        // A fired line",
  },
  {
    id: "m224/refusal-loses-the-settle-recovery",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The CRITICAL both reviewers found independently on round 1. A cart the register has settled makes the write AND the diagnosis read throw \u2014 `assertCartMember` answers `cart_closed` forever after, and `setLineFulfillment`/`makeItNow` have no `cart_closed` REASON so a closed cart is a throw there too. Without this call the refusal path returns null and does nothing, stranding the diner on an editable bill for a paid order with no exit; every one of those taps used to end in `refresh()`, whose failed arm asks the one question that separates a settled cart from a blip",
    find: "      if (!seen.view) {\n        onReadFailed();",
    replace: "      if (!seen.view) {",
  },
  {
    id: "m224/a-thrown-write-is-assumed-refused",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "A rejected Server Action never proved the mutation failed \u2014 `setQty`'s `if (!affected) throw` sits AFTER the RPC and discards its `{ error }`, and a response can be lost once the statement has committed. Drop the landing check and a write the diner can SEE in the list is announced as \"That didn't go through\", which is the direction they cannot recover from. The comparison is forgeable only the SAFE way (a peer writing the same value buys silence), which is why it may decide this and never the sentence",
    find: "      if (landed(seen.view.items)) return null;",
    replace: "",
  },
  {
    id: "m224/refusal-names-a-freeze-the-screen-moved-past",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'A ticketed read can come back, diagnose perfectly, and still LOSE the screen. /menu publishes the observed classification anyway and is right to \u2014 its sentence is a 2600 ms toast. Here it is persistent text beside live controls, so an overtaken "someone is checking out" sits under an unlocked cart with no release edge left to retire it. `freezeFactsRef` is whichever view WON',
    find: "      const f = freezeFactsRef.current;\n      return classifyRefusedWrite({",
    replace: "      const f = seen.view;\n      return classifyRefusedWrite({",
  },
  {
    id: "m186/a-resting-barcode-bills-again",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "M186's reported bug, restored EXACTLY as it shipped: the stamp refreshed only when the gate emitted, so the window measured time since the last ANNOUNCEMENT rather than time since the barcode was last SEEN, and one item resting in front of the camera re-opened it every 1500ms. Computed, not remembered: ten seconds of dwell at 60fps is SEVEN announcements, each of which was a charge before the basket-backed rule took the money decision off the clock",
    find: "  const next: ScanGate = { code, seenAt: now };",
    replace:
      "  const next: ScanGate = { code, seenAt: gate.code === code && now - gate.seenAt < SCAN_QUIET_MS ? gate.seenAt : now };",
  },
  {
    id: "m186/a-re-present-stops-counting",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "The other direction: a real gap in the decode stream means the page's answer may have changed (the line was removed, the queue drained), so it is worth re-asking. Collapse the gap test and the throttle goes permanently silent on a barcode it has seen once \u2014 the shopper who removes a line and re-scans it gets nothing",
    find: "  if (now - gate.seenAt >= SCAN_QUIET_MS) return { emit: true, next };",
    replace: "  if (false) return { emit: true, next };",
  },
  {
    id: "m186/a-different-item-waits-its-turn",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "Two different items in quick succession is the normal shopping motion. Fold the identity test into the timer and the second item is swallowed for a second and a half, which reads to the shopper as the scanner having missed it",
    find: "  if (gate.code !== code) return { emit: true, next };",
    replace: "  if (false) return { emit: true, next };",
  },
  {
    id: "m186/a-quiet-window-collapses",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "The one number that decides when a gap in the decode stream counts as the barcode having left. Shrink it to 100ms and a single dropped frame re-announces \u2014 the shape the whole of M186 is about. Every other assertion reads the constant symbolically and stays green under it, which is why one fixture spells the milliseconds out",
    find: "export const SCAN_QUIET_MS = 1500;",
    replace: "export const SCAN_QUIET_MS = 100;",
  },
  {
    id: "m186/a-quiet-window-swallows-the-shop",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "The same constant in the other direction \u2014 a minute-long window means a shopper who removes a line and re-scans it stands there with nothing happening. A bound is only pinned when BOTH directions redden",
    find: "export const SCAN_QUIET_MS = 1500;",
    replace: "export const SCAN_QUIET_MS = 60_000;",
  },
  {
    id: "m186/b-a-second-of-the-same-item-is-billed-again",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "The charge rule itself. Blind the classifier to the basket's own lines and every sighting of a barcode already in the basket becomes a fresh charge \u2014 which is the M186 double-bill restored through the front door, and the one the clock could never close because a camera cannot tell a resting jar from a second identical jar",
    find: "  const line = basket.lines.find((l) => l.barcode === barcode);",
    replace: "  const line = basket.lines.find(() => false);",
  },
  {
    id: "m186/b-an-offline-repeat-is-billed-again",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "A scan waiting in the offline queue is already charged for \u2014 it just has no line yet. Drop the queue from the classifier and a second sighting while the radio is dead enqueues the same barcode twice, and both land at replay",
    find: '  if (basket.queued.includes(barcode)) return { kind: "repeat", where: "queued" };',
    replace: '  if (false) return { kind: "repeat", where: "queued" };',
  },
  {
    id: "m186/b-a-failed-read-lets-a-repeat-through",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "`scanAdd` answers `lines: null` when the post-write read fails \u2014 the charge landed and the server view cannot prove it. `billed` is the only record left, so dropping it means the ONE case where the basket looks empty of an item it is already paying for is also the one case that bills again",
    find: '  if (basket.billed.includes(barcode)) return { kind: "repeat", where: "unconfirmed" };',
    replace: '  if (false) return { kind: "repeat", where: "unconfirmed" };',
  },
  {
    id: "m186/b-a-new-item-is-refused-as-a-repeat",
    file: "apps/qr/lib/scan-gate.ts",
    suite: "lib/scan-gate.test.ts",
    why: "The under-bill direction, and the reason M186's first fix was rejected: refusing to charge is still a wrong number, and it is the kind nobody notices until the receipt. Classify a genuinely new barcode as a repeat and the shopper walks out with an item the basket never charged for",
    find: '  return { kind: "add" };',
    replace: '  return { kind: "repeat", where: "unconfirmed" };',
  },
  {
    id: "m224/refusal-is-published-in-the-view-commit",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The a11y half, and the one a DOM-text assertion cannot see. The view that diagnoses the refusal can REPLACE the live region's subtree \u2014 a refused removal of the last unit renders the empty-cart return, a settling refusal swaps the review region for the settlement one \u2014 and a polite region announces a CHANGE to an existing node, never content that was present when the node mounted. Publishing in that commit puts the text on screen and says nothing to a screen reader",
    find: '    // "this is deliberately a later commit" rather than suppressing the rule that noticed.\n    const frame = requestAnimationFrame(() => {',
    replace:
      '    // "this is deliberately a later commit" rather than suppressing the rule that noticed.\n    const frame = ((cb) => (cb(), 0))(() => {',
  },
  {
    id: "m224/an-unknown-refusal-erases-the-pay-error",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The region renders `payError ?? status`, so clearing it unconditionally traded \u201cCouldn\u2019t start checkout\u201d \u2014 actionable, about money \u2014 for \u201cWe couldn\u2019t confirm that \u2014 the order below is up to date\u201d, on a screen whose checkout is broken. A FREEZE supersedes a pay error (the diner cannot retry the payment while frozen, which is the lock edge\u2019s own stated reasoning); an `unknown` hedge has no such claim",
    find: '      if (pendingRefusal.refusal.cause !== "unknown") setPayError(null);',
    replace: "      setPayError(null);",
  },
  {
    id: "m224/a-superseded-refusal-outlives-its-cart",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "A refusal that a LATER accepted edit has demonstrably superseded is the one thing in this slot that is no longer true \u2014 an `unknown` hedge in particular would sit under a cart the diner has since edited twice. It clears only the refusal it published, never the slot, because `status` also carries the promo result and the freeze banner",
    find: "      if (accepted) {\n        supersedeRefusals(gesture);",
    replace: "      if (accepted) {",
  },
  {
    id: "m224/accepted-write-skips-the-re-read",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The re-sync that replaces the optimistic number with server truth and re-derives the totals. Nothing pinned it before the blind pass on this PR said so, so deleting it was a silent regression with every mutant green",
    find: "        supersedeRefusals(gesture);\n        await refresh();",
    replace: "        supersedeRefusals(gesture);",
  },
  {
    id: "t33/cart-suppression-lift-is-not-an-edge",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "`classifyRefusedWrite` tests settling FIRST, so a cart under BOTH freezes gets the settle explanation, which outranks and silences the lock banner. Call the split off with the pay lock still held and `announced` never changes \u2014 the lock notice existed throughout \u2014 so a bare `prev === announced` return leaves the region asserting the table is still paying. The freeze that ENDED and the freeze that REMAINS are different facts",
    find: "    if (prev === announced && !(wasSuppressed && !suppressed && announced)) return;",
    replace: "    if (prev === announced) return;",
  },
  {
    id: "m227/counter-ask-stops-outranking-reads-in-flight",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'M227\'s first named wiring fact. `askCounter` writes a server-CONFIRMED `counterRequestedAt` OUTSIDE any read, so a read ISSUED BEFORE the tap and resolving after it re-asserts null \u2014 the counter card vanishes under the diner while the register is expecting them. Until `Checkout.test.tsx` existed this deletion left the whole gate green, which is why M225 was closed "fixed, not kept"',
    find: "      confirmedWrite(viewSeqRef.current);\n      setCounterAt(r.counterRequestedAt);",
    replace: "      setCounterAt(r.counterRequestedAt);",
  },
  {
    id: "m227/counter-withdrawal-stops-outranking-reads-in-flight",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'The same barrier on the way back, and it fails in the opposite direction: an older read restores an ask the diner has just withdrawn, flipping the screen to "We\'ll settle up at the counter" on a cart with no ask. Both directions are pinned because one passing does not imply the other',
    find: "      confirmedWrite(viewSeqRef.current);\n      setCounterAt(null);",
    replace: "      setCounterAt(null);",
  },
  {
    id: "m227/check-again-narrows-reaching-to-winning",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'M227\'s third named fact. "Did we hear back" is `readReachedServer`, and it is TRUE for an overtaken read \u2014 collapsing that to `applied` lights "Couldn\'t check just now" over a read that did check, a fabricated diagnosis of the M116/T14 class on the one control whose whole job is to answer that question honestly',
    find: "      if (!readReachedServer(outcome))",
    replace: '      if (outcome !== "applied")',
  },
  {
    id: "m227/freeze-recheck-stops-re-arming",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "M227's fourth named fact, and the reason the ticket was safe to add at all: a lock EXPIRES by the passage of time with no row write, so no realtime event corrects a cached `true`, and the visibility backstop never fires for a tab that stays open \u2014 which IS the /cart case. Stop re-arming and the T24 ordering cost has nothing left to heal it",
    find: "          if (!cancelled && readReachedServer(settled)) arm();",
    replace: "          if (!cancelled && readReachedServer(settled)) return;",
  },
  {
    id: "m224/superseded-diagnosis-publishes-anyway",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 2 P2. `qtyChain` orders the WRITES for one line; it does not order a refused tap's DIAGNOSIS \u2014 a separate round trip \u2014 against the next tap's success. Clearing only an already-DISPLAYED refusal cannot reach it, because at the moment the accepted write clears, the older diagnosis has published nothing yet. Drop the watermark check and it lands afterwards with \u201cWe couldn\u2019t confirm that\u201d over a cart the diner has just edited twice",
    find: "      if (!refusal) return;\n      if (lastAcceptedGesture.current > gesture) return;",
    replace: "      if (!refusal) return;",
  },
  {
    id: "m224/any-acceptance-drops-the-diagnosis",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 3 P2, the IN-FLIGHT half. Round 2 asked \u201cdid anything land while I was diagnosing\u201d, and this is that question restored: with two lines there are two chains, so an edit tapped EARLIER can answer while a later tap is still being diagnosed \u2014 and its success says nothing about the later refusal. Sample the watermark for any change instead of comparing it to THIS gesture and the refusal is dropped in silence, with no edge that would ever bring it back",
    find: "      if (lastAcceptedGesture.current > gesture) return;",
    replace: "      if (lastAcceptedGesture.current > 0) return;",
  },
  {
    id: "m224/a-dropped-refusal-leaves-its-banner-unsaid",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 6 P2. `announceRefusal` latches at PARK time, which SUPPRESSES the lock-entry banner \u2014 so a refusal that is then dropped at publish leaves the diner with nothing describing a live lock. The lock-edge effect cannot rescue it: it keys on `announced`, and the reaching path is exactly the one where the freeze NEVER changes (same lock held while a later view confirms the write). The region is empty beside dead controls",
    find: "        setFreezeRepublish((n) => n + 1);\n",
    replace: "",
  },
  {
    id: "m224/republish-speaks-a-stale-freeze",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 7 P2. The republish keys on the DROP, not on the freeze \u2014 deliberately, so ordinary transitions stay the edge effect's \u2014 but that exclusion means a value closed over at schedule time survives the whole gap. Release the lock between the drop frame and the republish frame and a stale \u201csomeone is checking out\u201d lands over the edge effect's correct \u201cyou can edit again\u201d, beside live controls. The ref is the freeze as it is NOW",
    find: "      const msg = freezeMessageRef.current;",
    replace: "      const msg = freezeMessage;",
  },
  {
    id: "m224/republish-invents-a-release",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The republish owes a banner only when something is FROZEN at FIRE time. Drop the guard and the callback writes whatever `freezeMessageRef` holds \u2014 including NULL on a cart whose freeze ended inside the gap, blanking the region over the edge effect\u2019s correct sentence. The guard is what makes the drop defer to the edge effect instead of fighting it",
    find: "      if (msg === null) return;",
    replace: "",
  },
  {
    id: "m224/republish-leaves-the-pay-error-masking",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 7 P2. Every affected region renders `payError ?? status`, and the ordinary lock-edge announcement clears the error before writing. The republish did not, so a failed checkout kept masking the lock explanation beside dead controls \u2014 the diner sees a stale pay error and no reason the cart is inert",
    find: "      setPayError(null);\n      setStatus(msg);",
    replace: "      setStatus(msg);",
  },
  {
    id: "m224/parked-sentence-is-not-re-derived",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 5 P2, and the mutation IS the evasion that looks right. Comparing CAUSES passes every shape test and still ships the bug: attribution lives inside the freeze, not the cause, so a lock that moved self\u2192peer inside the park\u2192publish gap is still `frozen` and still prints \u201cwhile you check out\u201d beside a tablemate\u2019s lock. The comparison has to be on the SENTENCE, which is the only thing a diner sees",
    find: "      if (pendingRefusal.landed(f.items) || refusedWriteNotice(fresh) !== notice) {",
    replace:
      "      if (pendingRefusal.landed(f.items) || fresh.cause !== pendingRefusal.refusal.cause) {",
  },
  {
    id: "m224/parked-hedge-ignores-a-confirming-view",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 5 P2, the other half. Round 4 published the `unknown` hedge unconditionally under a comment claiming no later view could falsify it \u2014 untrue: a view that shows the requested value falsifies it exactly, and \u201cWe couldn\u2019t confirm that\u201d then prints beside the quantity the diner asked for. Drop the landing re-test and the park\u2192publish gap is unguarded again",
    find: "      if (pendingRefusal.landed(f.items) || refusedWriteNotice(fresh) !== notice) {",
    replace: "      if (refusedWriteNotice(fresh) !== notice) {",
  },
  {
    id: "m224/a-parked-refusal-outlives-its-freeze",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 4 P2. Parking and publishing are two moments, and a BACKGROUNDED TAB throttles frames far enough apart for the peer to finish \u2014 so the release edge writes \u201cyou can edit again\u201d and a callback still holding the old verdict overwrites it with \u201cthe order\u2019s locked\u201d beside controls that are live. The guard keeps its SHAPE under this mutation and loses its EFFECT, which is the evasion to falsify: dropping the `return` clears the park and publishes anyway",
    find: "      if (pendingRefusal.landed(f.items) || refusedWriteNotice(fresh) !== notice) {",
    replace: "      if (false) {",
  },
  {
    id: "m224/an-older-success-retires-a-newer-refusal",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 3 P2, the SHOWN half and the one a diner sees. A write on line A that commits before a peer takes the lock but answers late is, by tap order, OLDER than the line-B tap the lock refused \u2014 so retiring on acceptance alone erases a sentence that is still true of the cart on screen. `qtyChain` cannot save this: it orders one line's writes, and the two taps are on two lines",
    find: "      if (refused !== null && refused > gesture) return;\n      clearShownRefusal();",
    replace: "      clearShownRefusal();",
  },
  {
    id: "m230/a-rejected-toggle-counts-as-accepted",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: 'Codex round 3 P2. `accepted` and `refused` answer different questions: the server saying yes, versus our being able to NAME a reason. A `{ ok: false, reason: "not_yours" }` is neither \u2014 it stays silent (M230), but counting it as an accepted edit retires a refusal the diner is still reading and drags the watermark past a diagnosis still in flight',
    find: "      if (accepted) supersedeRefusals(gesture);\n      // The re-sync runs either way",
    replace: "      supersedeRefusals(gesture);\n      // The re-sync runs either way",
  },
  {
    id: "m230/a-rejected-make-now-counts-as-accepted",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The same fix on the pill's twin, pinned separately because it IS separate code \u2014 a mutation that deletes only `makeNow`'s guard leaves every toggle case green, which is exactly how this arm shipped unguarded the first time",
    find: "      if (accepted) supersedeRefusals(gesture);\n      await refresh();\n    });\n  }",
    replace: "      supersedeRefusals(gesture);\n      await refresh();\n    });\n  }",
  },
  {
    id: "m224/an-accepted-edit-leaves-a-parked-refusal",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "The other half of the same finding: a refusal already PARKED for publication is superseded by an accepted edit too, not only one already on screen. Without this line the frame fires after the success and speaks a refusal about a write two taps old",
    find: "    setPendingRefusal(null); // a parked publish is superseded too, not just a landed one",
    replace: "",
  },
  {
    id: "m224/settle-release-leaves-its-refusal-standing",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Codex round 2 P2, and the mirror of round 1's fix. That one handled settling ending with the pay lock still HELD, where the lock banner takes the slot. When nothing outlives it, `announced` is false before and after, so the lock edge never fires and \u201cthe order\u2019s locked while your table pays\u201d is left standing on a review view the diner can now edit",
    find: "    if (announcedRef.current) return;\n    const frame = requestAnimationFrame(clearShownRefusal);",
    replace:
      "    if (announcedRef.current) return;\n    const frame = requestAnimationFrame(() => {});",
  },
  {
    id: "t33/lock-banner-forgets-whose-lock-it-is",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T33 at the BANNER \u2014 the other end of the same comparison. `lockedByYou` here is the RENDERED binding `msg` was composed from, so the suppression is asked about the very sentence that would take the slot; hardcode it and a self-held lock's refusal is overwritten while the peer twin stays green",
    find: "          current: { locked, settling: settlingRef.current, lockedByYou },",
    replace: "          current: { locked, settling: settlingRef.current, lockedByYou: false },",
  },
  {
    id: "t33/release-stops-clearing-the-fact",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: 'T33\'s STALENESS BOUND, and the only one \u2014 a per-write clear beside `lastRefusalRef` was written first and its mutant SURVIVED, because `explained` is non-null only while the freeze it names is true and the sole way out of that freeze is this edge. Drop it and a peer releasing then re-locking leaves a stale "locked" silencing a banner about a freeze nobody explained, reachable with no write in between',
    find: '    if (!locked \u0026\u0026 explainedFreezeRef.current?.axis === "locked") explainedFreezeRef.current = null;',
    replace: "",
  },
  {
    id: "refusal/unknown-borrows-the-assertive-opener",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "The blind adversarial pass on this PR reversed a draft that made this exact edit. `refused` means the re-read succeeded and the write was not in it \u2014 true of the STATE, false of `setItemQty`'s PATH, which establishes it by comparing ONE absolute value (`line?.qty === qty`) that an authorized host writing the same line inside the round trip forges into a false negative. That case carries no lock and no settle, so it lands on `unknown` \u2014 the one arm with no server statement behind it, and the only one that may not assert the verdict",
    // ⚠️ ANCHORED ON THE TERNARY LINE ALONE, NOT ON `const opener = …`. The first draft matched the
    // whole declaration on ONE line and went STALE in the same PR that added it: `pnpm format` ran
    // AFTER the red-first probe and wrapped the declaration, so the mutant matched 0× on its own
    // commit. Choose an anchor from the FORMATTED text, and re-probe after formatting.
    find: '    refusal.cause === "unknown" ? "We couldn\u2019t confirm that" : "That didn\u2019t go through";',
    replace: '    "That didn\u2019t go through";',
  },
  {
    id: "refusal/clause-ships-a-whole-sentence",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "T32 AT ITS SOURCE, and the mutant this PR exists for \u2014 the clause is a FRAGMENT that its callers finish. Ship a whole sentence from one arm and `refusedWriteNotice` says the verdict twice while `YourUsual` says it three times. Caught by all three shape predicates (lowercase-initial, no terminal period, and does not contain the verdict), so any one of them going decorative is visible",
    find: "      return inertReason({ minting: false, locked: false, settling: true })!;",
    replace:
      '      return "That didn\u2019t go through \u2014 the order\u2019s locked while your table pays.";',
  },
  {
    id: "refusal/attribution-forks-from-the-classified-freeze",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "T32 \u2014 this PR MOVED attribution from a caller-supplied `viewerHoldsLock` parameter to a value derived from the classification, so the rule needs its own mutant or the move is unguarded. Collapsing it tells a diner holding their OWN pay lock that `someone` is checking out \u2014 true of a stranger, false of them, and the M116 fabricated-diagnosis shape on the one arm where the app knows better",
    find: '        lockedByYou: refusal.freeze === "self",',
    replace: "        lockedByYou: false,",
  },
  {
    id: "perf/context-remints-every-render",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "M192 \u2014 THE SHIPPED DEFECT, restored. `MenuBrowser` consumes this context and owns the ~97-card menu grid with no `React.memo` on the cards, so while the value was a fresh literal every render, each of ELEVEN pieces of provider state reconciled every card \u2014 a framer-motion button, a `next/image` and a recomputed badge list, ~97 times, roughly six times per Add tap, and again on every category tab, diet pill and search keystroke. Spreading `ctxValue` at the Provider typechecks perfectly and is value-identical, so nothing but an identity assertion can see it",
    find: "    <Ctx.Provider value={ctxValue}>",
    replace: "    <Ctx.Provider value={{ ...ctxValue }}>",
  },
  {
    id: "perf/memo-defeated-by-an-unstable-dep",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "M192, THE SUBTLER HALF \u2014 and the one that actually shipped alongside the memo. A `useMemo` on the context value is worth nothing if a DEPENDENCY re-mints, and this is how it happens: an object literal built in the render body. `me` was exactly that, so the memo was in place and every consumer still re-rendered. Same class as the `lastRefusalClause` inline arrow the comment above its `useCallback` warns about \u2014 a reviewer reading the memo sees a memo; only the identity assertion sees the miss",
    find: "  const me = useMemo(\n    () => (session ? { seat: session.seat, name } : null),\n    [session?.seat, name, session],\n  );",
    replace: "  const me = session ? { seat: session.seat, name } : null;",
  },
  {
    id: "perf/echo-window-allows-a-negative-delay",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "The CLAMP, isolated \u2014 the other two arithmetic mutants replace the WHOLE return expression, so neither of them falsifies the floor on its own, and the docblock calls it load-bearing (blind adversarial pass on #287). Past the deadline the inner term goes negative; the runtime happens to clamp a negative `setTimeout` delay to 0, so the behaviour survives by luck rather than by the rule, and a reader who deletes `Math.max` sees nothing change. The intent has to be readable HERE, not inferred from what a browser does",
    find: "  return Math.max(0, Math.min(ECHO_COALESCE_MS, ECHO_MAX_WAIT_MS - waitedMs));",
    replace: "  return Math.min(ECHO_COALESCE_MS, ECHO_MAX_WAIT_MS - waitedMs);",
  },
  {
    id: "perf/echo-window-is-a-pure-debounce",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "M193's DEADLINE, and the half a burst-then-wait fixture cannot see. Drop the max-wait term and the coalescer becomes a pure trailing debounce: `clearTimeout` re-arms from zero on every event, so a stream whose gaps stay under 150 ms postpones the read FOREVER. That read is a RECOVERY path (the \u201cwritten, unreadable\u201d heal via `viewAfterWrite`, and T14's stale-freeze correction riding the `qr_carts` UPDATE), and two concurrent mutators on one cart is enough to hold the gap that tight \u2014 so the failure lands exactly when a table needs it most. Only a SUSTAINED-stream fixture separates the two",
    find: "  return Math.max(0, Math.min(ECHO_COALESCE_MS, ECHO_MAX_WAIT_MS - waitedMs));",
    replace: "  return ECHO_COALESCE_MS;",
  },
  {
    id: "perf/echo-window-loses-its-quiet-period",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "The OTHER term. Keep only the deadline and a fresh burst gets a 600 ms delay \u2014 which sounds conservative and is the opposite: nothing collapses, because the first event of every burst waits the whole budget while each later one re-arms, so the tap-to-screen latency the coalescer was tuned for becomes four times worse on the peer's phone. A fixture that only ever asserts \u201ceventually re-reads\u201d scores this green",
    find: "  return Math.max(0, Math.min(ECHO_COALESCE_MS, ECHO_MAX_WAIT_MS - waitedMs));",
    replace: "  return Math.max(0, ECHO_MAX_WAIT_MS - waitedMs);",
  },
  {
    id: "perf/echo-deadline-rides-the-wall-clock",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "M226(c) \u2014 the SHIPPED bug, restored. The deadline is an ELAPSED DURATION and a wall clock cannot measure one: an NTP correction or a manual set moves `Date.now()` backward mid-burst, `waitedMs` goes negative, `ECHO_MAX_WAIT_MS - waitedMs` then exceeds the quiet period, and `Math.min` picks the quiet period on EVERY event. The deadline stops binding and a stream whose gaps stay under 150 ms re-arms forever \u2014 the starvation `ECHO_MAX_WAIT_MS` exists to prevent, brought back by a clock that went backwards. Only a fixture that JUMPS the system clock separates the two, because `vi.setSystemTime` moves `Date.now()` and leaves `performance.now()` alone (measured, not assumed)",
    find: "    if (since.current === null) since.current = performance.now();\n    const delay = echoDelayMs(performance.now() - since.current);",
    replace:
      "    if (since.current === null) since.current = Date.now();\n    const delay = echoDelayMs(Date.now() - since.current);",
  },
  {
    id: "perf/echo-deadline-mixes-two-clocks",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "BOTH ENDS MUST READ THE SAME CLOCK, and a half-applied fix is the likeliest way this regresses \u2014 someone swaps the measurement and not the anchor. `performance.now()` counts from the page's time origin and `Date.now()` from the epoch, so the subtraction is not a duration at all: `waitedMs` lands in the trillions, the deadline term goes hugely negative, `Math.max` clamps to 0, and every echo fires its own ~7-round-trip `getCartView`. The coalescer is not merely weakened, it is inverted",
    find: "    const delay = echoDelayMs(performance.now() - since.current);",
    replace: "    const delay = echoDelayMs(Date.now() - since.current);",
  },
  {
    id: "read/ticketed-read-mints-after-the-await",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "M225. The ticket must be taken BEFORE the await or it records ARRIVAL order wearing a ticket's clothes \u2014 the later-arriving read gets the higher number and wins exactly as it did unticketed, which is the defect, not the fix. Nothing about the shape looks wrong; only an interleaving where issue order and arrival order disagree can tell them apart",
    find: '  const seq = issueRead(s);\n  let view: T;\n  try {\n    view = await read();\n  } catch {\n    return "failed";\n  }',
    replace:
      '  let view: T;\n  try {\n    view = await read();\n  } catch {\n    return "failed";\n  }\n  const seq = issueRead(s);',
  },
  {
    id: "read/ticketed-read-applies-a-refused-view",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "The GATE. Keep the call (so the watermark still moves and a name-only reader sees `acceptView` right there) but stop acting on its answer, and every view applies in arrival order \u2014 an older read re-asserting `locked: false` over a corrected `true` on a cart a peer is checking out. /cart has no scheduled freeze re-check to heal that",
    find: '  if (!acceptView(s, seq)) return "overtaken";\n  apply(view);',
    replace: "  acceptView(s, seq);\n  apply(view);",
  },
  {
    id: "read/a-failed-read-claims-it-reached-the-server",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: 'The three states collapse to two in the WRONG direction. `"overtaken"` reads as success through `readReachedServer`, so a read that never came back would report the cart as reachable \u2014 and /cart\'s two recovery controls ("Check again", the reopen path) would fall silent on exactly the outage they exist to name, which is the defect Codex round 5 on #246 removed. It also moves nothing: the watermark stays put either way, so only the OUTCOME separates them',
    find: '  } catch {\n    return "failed";\n  }',
    replace: '  } catch {\n    return "overtaken";\n  }',
  },
  {
    id: "read/a-confirmed-write-stops-outranking-reads-in-flight",
    file: "apps/qr/lib/view-seq.ts",
    suite: "lib/view-seq.test.ts",
    why: "M225's other half, and the one a reader is likeliest to call decoration \u2014 the function body is one line and the call sites look like bookkeeping. /cart's counter-ask writes a server-CONFIRMED `counterRequestedAt` outside any read; a read issued before that tap carries a lower ticket and, without this, lands afterwards with its own pre-ask value. The diner's own tap undone by an older answer to a question nobody re-asked",
    find: "export function confirmedWrite(s: ViewSeq): void {\n  acceptView(s);\n}",
    replace: "export function confirmedWrite(_s: ViewSeq): void {}",
  },
  {
    id: "perf/echo-burst-anchor-never-resets",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "The coalescer dies after its FIRST burst. With the anchor left standing, every later event measures its wait from a deadline that expired minutes ago, `echoDelayMs` answers 0, and each echo fires its own read \u2014 M193 restored through the fix for it. Its separating fixture had to be found: two bursts a tick apart give the same delay either way, so the first draft of that test was green against this mutation and only an IDLE GAP between them tells them apart",
    find: "      since.current = null; // the burst is over; the next event starts a fresh deadline",
    replace: "      // the burst is over; the next event starts a fresh deadline",
  },
  {
    id: "perf/echo-cleanup-outlives-the-cart",
    file: "apps/qr/lib/echo-refresh.ts",
    suite: "lib/echo-refresh.test.tsx",
    why: "Codex round 2 on #275 (P2), now guarded where it lives. An empty dep list clears only on UNMOUNT \u2014 and the /menu subtree stays mounted when the same client switches table or re-mints a session, so a pending echo kept the OLD `refresh` closure, fired after the NEW cart's first read, took a fresher sequence ticket for the PREVIOUS cart (still readable, so `readIsOurs` has no reason to discard it) and painted one cart's items, totals and freeze over another's",
    find: "      since.current = null;\n    },\n    [refresh],",
    replace: "      since.current = null;\n    },\n    [],",
  },
  {
    id: "perf/echo-refresh-fires-per-event",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "M193 AT THE /menu CALL SITE \u2014 the shipped defect, restored. One add writes to BOTH watched tables (the `qr_cart_items` INSERT and `touchCart`'s `qr_carts` UPDATE), so a single tap echoed back at least twice and each echo ran its own `getCartView`: ~7 sequential DB round trips apiece. Measured in production 2026-09-09: four `POST /cart` inside four seconds from ONE tap, fanned out to every phone at the table. The un-coalesced form is behaviourally correct \u2014 it re-reads MORE, never less \u2014 so only a call-count assertion falsifies it. The WINDOW itself now lives in `lib/echo-refresh.ts` and is mutated there; this is the wiring, which is the half a pure module can never prove",
    find: "      scheduleEchoRefresh();\n      if (",
    replace: "      void refresh();\n      if (",
  },
  {
    id: "refusal/usual-gets-the-whole-sentence",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T32 AT THE BOUNDARY \u2014 and this is where drift can actually happen, so this is where it is mutated. Both functions take the same argument, so latching the SENTENCE typechecks perfectly and restores the exact defect: `YourUsual` appends it to a sentence that already opens with the same verdict. No matcher over `YourUsual` can see this \u2014 the consumer mocks its context, so only the provider's own boundary assertion falsifies it",
    find: "      lastRefusalRef.current = refusedWriteClause(refusal);",
    replace: "      lastRefusalRef.current = refusedWriteNotice(refusal);",
  },
  {
    id: "refusal/latch-outlives-its-write",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T31 \u2014 a cause belongs to the write that established it. The latch has ONE writer and, before this PR, ZERO clears, so a consumer reading it after an unrelated later write was handed the previous refusal's reason and announced it as this dish's. Dropping the entry clear restores exactly that",
    // ⚠️ RE-ANCHORED BY T33, which added a comment INSIDE this function and so broke an anchor that
    // spanned the whole body. It now names the declaration plus the live statement — unique
    // (`lastRefusalRef.current = null` appears exactly once) and load-bearing, rather than a shape
    // any future comment can invalidate. `verify:slice` caught the staleness, which is the rule
    // working: a STALE mutant is a FAILURE, not a skip.
    find: "  const forgetRefusal = useCallback(() => {\n    lastRefusalRef.current = null;",
    replace: "  const forgetRefusal = useCallback(() => {",
  },
  {
    id: "refusal/unreadable-cart-yields-a-list",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T30 \u2014 what makes the explicit `fresh = null` and the `&& refusal` narrowing load-bearing rather than decorative. With a list here the unreachable arm classifies as a REFUSAL whose cause is null, the publish is skipped, and the optimistic \u201cAdded to your order\u201d stands as the diner's last word over a write nobody could see",
    find: "        fresh = null;\n        refusal = classifyRefusedWrite({ ok: false });",
    replace:
      "        fresh = itemsRef.current;\n        refusal = classifyRefusedWrite({ ok: false });",
  },
  {
    id: "usual/reconstructs-the-refusal-prefix",
    file: "apps/qr/components/menu/YourUsual.tsx",
    suite: "components/menu/YourUsual.test.tsx",
    why: "T32's UNDEFEATABLE EVASION, made falsifiable. A guard banning the import is beaten by hand-writing the producer's prefix in the template \u2014 it calls nothing banned and ships the exact defect. Only comparing the announced string against the producer's real output can see it, which is why the guard is behavioural and this mutant reconstructs the prefix byte-for-byte",
    find: "              ? `${landed}${item.name} didn\u2019t go through \u2014 ${clause}.`",
    replace:
      "              ? `${landed}${item.name} didn\u2019t go through. That didn\u2019t go through \u2014 ${clause}.`",
  },
  {
    id: "refusal/remint-restored-unconditionally",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18 — THE M116/T14 DEFECT, RESTORED IN THE ONE PLACE THAT STILL SHIPS IT. `explainCaught` re-mints the table session only on the arm whose re-read FAILED; every other arm has just proved the session works by reading the cart through it. Re-minting unconditionally tells a diner whose tablemate is checking out that their connection dropped, and makes them watch a recovery for a session that was never broken. The rule is pinned in lib; this is the call site, and deleting the condition here left the whole gate green before this suite existed",
    find: "      if (refusalNeedsRemint(refusal)) {",
    replace: "      if (true) {",
  },
  {
    id: "refusal/committed-write-downgraded-to-unconfirmed",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T26/T18 — `viewAfterWrite` returns null only AFTER the row committed, so a null mutation view plus a failed re-read leaves us without a VIEW, not without a verdict. Downgrading it to `unconfirmed` retracts a true success notice and makes `YourUsual` tell the diner a dish it had just added could not be confirmed (Codex round 4 on #251). `applied` with `view: null` says exactly what is known: it landed, and there is nothing safe to thread onward",
    find: '          if (reread.outcome !== "applied") return { state: "applied", view: null };',
    replace: '          if (reread.outcome !== "applied") return { state: "unconfirmed" };',
  },
  {
    id: "refusal/unconfirmed-retraction-goes-silent",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18 (Codex round 1 on #251, P2) — both writes flash their outcome OPTIMISTICALLY on tap, so publishing nothing on `unconfirmed` is not neutrality: it leaves standing a claim `mayClaimLanding` forbids. `AddButton` and `ItemSheet` never speak after the provider, so for them the optimistic sentence was the only one the diner ever heard. A predicate that bars a claim is worth nothing if the claim is already on screen and the code merely declines to retract it",
    // Phase 1c · add-feedback — RE-ANCHORED, same mutation: the retraction now names the dish when it
    // can and is flashed as a CORRECTION; silencing the whole call is still the defect.
    find: '      flash(name ? namedUnconfirmedWriteNotice(name) : unconfirmedWriteNotice(), 3000, undefined, {\n        kind: "correction",\n        family: name ? { text: unconfirmedWriteNotice() } : undefined,\n      });',
    replace: "      void [name, namedUnconfirmedWriteNotice, unconfirmedWriteNotice];",
  },
  {
    id: "refusal/unconfirmed-lent-a-refusals-sentence",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18 — `publishUnconfirmed` deliberately does NOT write `lastRefusalRef`, which means “a refusal the caller decided is real” and is carried into `YourUsual`'s copy. Lending an unconfirmed write a refusal's cause attaches a diagnosis to a write nobody established anything about — the fabricated-diagnosis class, arriving through the retraction built to prevent it",
    // Phase 1c · add-feedback — RE-ANCHORED, same mutation: the callback now takes the dish `name`.
    find: "  const publishUnconfirmed = useCallback(\n    (name?: string) => {",
    replace:
      "  const publishUnconfirmed = useCallback(\n    (name?: string) => {\n      lastRefusalRef.current = unconfirmedWriteNotice();",
  },
  {
    id: "refusal/settle-freeze-never-classified",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18 — `settling` is a second freeze axis with its own clause (“the order’s locked while your table pays”), and `classifyRefusedWrite` tests it FIRST to match `inertReason`'s precedence. Dropping it from the re-read hands a settling cart the generic “we couldn’t confirm that”, so the diner is never told the one thing that explains the refusal and when it lifts",
    find: "          settling: v.settling,",
    replace: "          settling: false,",
  },
  {
    id: "refusal/recovery-view-discarded",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18/T26 (Codex round 2 on #251, P1) — a refusal is ESTABLISHED BY this read, so it holds the freshest cart anyone has. Discarding it sends `AddButton` back to `itemsRef`, a LOCAL ref synced in a passive effect that inside a promise chain still holds the pre-write list — and `setQty` is ABSOLUTE, so a stale baseline writes a WRONG NUMBER over a concurrent host edit rather than losing a tap",
    find: "        fresh = v.items;",
    replace: "        fresh = [];",
  },
  {
    id: "refusal/qty-refusal-goes-unpublished",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "The blind adversarial pass on #252 (CRITICAL) \u2014 the stepper's refusal was pinned by NOTHING: its test asserted a phrase no producible refusal contains, and what satisfied the regex was the lock-transition banner landing in the same single slot. \u26a0\ufe0f THE FIND SPANS THE WHOLE if/else PAIR, and the #254 blind pass is why: the first draft cut only the `if`, leaving `});` followed by a bare `else` \u2014 a SyntaxError. `suitePasses` is an exit-code check, so a file that will not PARSE reddens the suite and scores `caught` while proving nothing. A mutation must remain valid code or it measures the parser",
    find: '        if (result.state === "refused" && refusal) publishRefusal(refusal);\n        else if (result.state === "unconfirmed") publishUnconfirmed();\n        return result;',
    replace:
      '        if (result.state === "unconfirmed") publishUnconfirmed();\n        return result;',
  },
  {
    id: "refusal/add-refusal-goes-unpublished",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "The SIBLING the #252 retarget left uncovered, found by the #254 blind pass. `add`'s publish fork is textually identical to `setItemQty`'s, so one anchor could never cover both \u2014 and after the retarget NEITHER was covered, on the exact line whose own note says the stepper's refusal had been pinned by nothing. This one is anchored through `add`'s interleaved comment, which is what makes it unique; the sibling spans its own if/else pair instead",
    // Phase 1c · add-feedback — RE-ANCHORED, same mutation: the fork now carries `opts?.name` (the
    // corrections name the dish) and its interleaved comment was reworded. Still drops the refusal
    // publish and keeps the unconfirmed arm.
    find: '        if (result.state === "refused" && refusal) publishRefusal(refusal, opts?.name);\n        // The optimistic claim is still standing \u2014 ours, or the one the caller spoke at the tap;\n        // retract it rather than let an outcome that may not claim a landing stand as one.\n        else if (result.state === "unconfirmed") publishUnconfirmed(opts?.name);',
    replace: '        if (result.state === "unconfirmed") publishUnconfirmed(opts?.name);',
  },
  {
    id: "refusal/qty-landing-becomes-a-presence-test",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "T18 — `setQty` is absolute, which is what makes its recovery attribution exact: the line sits AT `qty`, or is gone when the tap was a remove. Weakening that to “the line exists” reports every refused decrement as a landing, so the stepper keeps a quantity the server rejected and the next queued write derives from it",
    find: "          landed: fresh === null ? null : qty <= 0 ? line === undefined : line?.qty === qty,",
    replace: "          landed: fresh === null ? null : line !== undefined,",
  },
  {
    id: "usual/committed-write-retried",
    file: "apps/qr/components/menu/YourUsual.tsx",
    suite: "components/menu/YourUsual.test.tsx",
    why: "T18/T26 — THE DUPLICATE CHARGE. This loop used to test `res === null`, and null meant BOTH “refused” and “committed, view unreadable”, so a dish that HAD landed took the refusal arm, set the resume index to itself, and the diner's retry added it a second time: a real line on a real bill from a tap that worked. `mayRetry` is true for `refused` alone — the one state where the cart was read and the dish was not in it",
    find: "        if (!mayRetry(res)) {",
    replace: '        if (res.state === "applied") {',
  },
  {
    id: "usual/prefix-credits-a-dish-nobody-saw",
    file: "apps/qr/components/menu/YourUsual.tsx",
    suite: "components/menu/YourUsual.test.tsx",
    why: "T18 (Codex round 2 on #251, P2) — the partial-add prefix may name only a dish PROVEN to have landed, across invocations. It fired on `i > 0` alone, so it credited the first dish even when that dish was the unconfirmed one; subtracting only THIS pass's tally then re-created the same false claim one attempt later, because a resumed pass starts at zero. The dishes before index `i` span both passes, so the unseen among them do too",
    find: "          const confirmed = i - unseenCount - unseen;",
    replace: "          const confirmed = i;",
  },
  {
    id: "usual/suppression-outlives-its-cart",
    file: "apps/qr/components/menu/YourUsual.tsx",
    suite: "components/menu/YourUsual.test.tsx",
    why: "T18 (Codex round 5 on #251, P2) — retry suppression must never outlive the cart it was reasoning about. `explainCaught`'s unreachable arm calls `revalidate()`, which can return a FRESH cart id containing none of these dishes; the counters used to survive that, so the CTA sat disabled reading “Added ✓” over an empty cart with no way back",
    find: "  const ofThisCart = progress.cart === cartId;",
    replace: "  const ofThisCart = true;",
  },
  {
    id: "freeze/reopen-failure-goes-silent",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "Codex round 3 on #246 \u2014 the recovery control's own silent no-op. `releasePayLock` answers five distinct facts and `reopenOrder` rendered only `superseded`, so a rate-limited or failed release flipped the button to \"Reopening\u2026\" and back with the lockbar still up and nothing said. That is J4's clause (b) \u2014 a control that accepts a tap and discards it \u2014 reappearing on the very control built to fix J4's clause (b). Returning null for a non-success outcome restores exactly that",
    find: "  if (outcome.released) return null;\n  switch (outcome.reason) {",
    replace:
      '  if (outcome.released) return null;\n  if (outcome.reason !== "superseded") return null;\n  switch (outcome.reason) {',
  },
  {
    id: "freeze/reopen-failure-claims-a-takeover",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "M116/M119 on the recovery sentence. `superseded` is the ONLY reason `classifyZeroRow` establishes a live successor for \u2014 it requires a lock that is still fresh AND stamped with a different era. A rate-limit or a transport failure is OUR outage and establishes nothing about anyone's tab, so borrowing the takeover sentence there tells the diner a live successor is paying when the truth is that our request did not go through",
    find: '    case "rate_limited":\n      return "That was a lot of changes at once',
    replace:
      '    case "rate_limited":\n      return "Another tab took over this checkout. That was a lot of changes at once',
  },
  {
    id: "settle/pay-lock-term-has-no-way-out",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: 'M197 \u2014 THE SHIPPED DEFECT, restored. `acquireSettlement` gated on a bare `.eq("locked", false)` with no staleness escape, while `acquireCartLock` has always had one \u2014 so `releaseCartLock`\'s promise that a declined attempt stays frozen only "until the diner ends the attempt or the TTL does" was false for cash, Terminal, tab-close and split. One diner declining a card and walking out froze every other tender on the table permanently. The equality typechecks and reads as a tightening, which is why only a statement-shape assertion catches it',
    find: "    .or(`locked.eq.false,and(locked_at.lte.${lockCutoff},live_payment_intent_id.is.null)`)",
    replace: '    .eq("locked", false)',
  },
  {
    id: "settle/staleness-not-gated-on-the-link",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M197, THE OTHER DIRECTION \u2014 and the expensive one. Flattening the `and(...)` into two independent disjuncts is a one-character edit that reads as the same rule and is the double charge: `locked_at` is refreshed only by `acquireCartLock`, so a diner still feeding cards into a DECLINED intent has a stale era, and `live_payment_intent_id.is.null` as a bare disjunct then matches every unlinked row regardless of age. Settlement collects through a different channel (cash, a Terminal tap, split shares), so taking the lock on age alone can collect twice",
    find: "    .or(`locked.eq.false,and(locked_at.lte.${lockCutoff},live_payment_intent_id.is.null)`)",
    replace:
      "    .or(`locked.eq.false,locked_at.lte.${lockCutoff},live_payment_intent_id.is.null`)",
  },
  {
    id: "settle/unreadable-cart-reads-as-closed",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M119's shape, in the one function whose whole job is to say WHY a settlement was refused. The diagnostic read discarded its error, so postgrest's `{ data: null, error }` made `cart?.status !== \"open\"` true and the answer `closed` \u2014 an outage told staff a live table was no longer open, which is a dead end where the truth is a retry",
    find: '  if (readError) return "unavailable";',
    replace: "  void readError;",
  },
  {
    id: "settle/stale-lock-hides-behind-locked",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: 'M197 \u2014 the arm that makes the exit reachable. Collapsing `locked_stale` into `locked` leaves every caller unable to tell "a diner is paying right now" from "an attempt was abandoned an hour ago", so `acquireSettlementSuperseding` never supersedes and the deadlock is exactly as it was, with a wider union to disguise it',
    find: '  return stale && cart.live_payment_intent_id ? "locked_stale" : "locked";',
    replace: '  return "locked";',
  },
  {
    id: "settle/missing-era-judged-stale",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: 'M197 \u2014 unjudgeable must fail CLOSED. A locked row with no `locked_at` is a state `acquireCartLock` never writes, so it means something we do not understand; treating a missing era as "old enough" would hand the table\'s tender to a settlement on the strength of an absent fact, which is the fabricated-diagnosis class (M116/M119) applied to a lock',
    find: "  const stale = !!cart.locked_at && cart.locked_at <= lockCutoff;",
    replace: "  const stale = !cart.locked_at || cart.locked_at <= lockCutoff;",
  },
  {
    id: "settle/superseder-gets-the-wrong-argument",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 3 P1 \u2014 THE SHIPPED DEFECT, and it was introduced by the previous round's fix. The seam took `(id, classify)` and defaulted to the CART-level `supersedeCartIntent`, so passing the diagnosed intent id typechecked (both are `string`) and in production looked up a cart named `pi_...`, found none, returned `cleared` WITHOUT CALLING STRIPE \u2014 after which this path cleared the real cart's pin and link and let staff settle over a still-confirmable intent. Swapping the two named arguments restores exactly that, and only an assertion on WHICH slot each value lands in can see it",
    find: "    const outcome = await supersede(cartId, live);",
    replace: "    const outcome = await supersede(live, cartId);",
  },
  {
    id: "settle/claim-admits-the-same-owner-twice",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "Codex round 3 P1 — the mutex that was not one. The CLAIM never carried a `settle_by.eq.<owner>` disjunct, and since A3 neither does `acquireSettlement`: two concurrent takeovers by one staff member (both passing `caller.uid`, before A3) BOTH matched — the first wrote `settle_by`, the second sailed through on that very term — and each minted its own Stripe charge, since the off-session idempotency key is deliberately per-attempt. The owner is request-unique now, so the arm would be unreachable rather than wrong; it stays out",
    find: "    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`);\n  return { claimed: (count ?? 0) > 0, error };",
    replace:
      "    .or(`settle_at.is.null,settle_by.eq.${owner},settle_at.lte.${settleCutoff}`);\n  return { claimed: (count ?? 0) > 0, error };",
  },
  {
    id: "settle/manual-capture-cancelled-anyway",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 3 P1 \u2014 a status is a SNAPSHOT, and the DB claim cannot stop a Payment Element the diner already has mounted from confirming with its existing client secret. So a hold read as `requires_action` can become `requires_capture` between the retrieve and the cancel, and Stripe still permits cancelling that: staff would revoke an authorization the guest had just given. Refusing on the intent's own `capture_method` is a fact about the intent rather than a race-able reading of it",
    find: '  if (live.capture_method === "manual" || metadata?.kind === "pickup_manual") return "captured";',
    replace: '  if (metadata?.kind === "pickup_manual") return "captured";',
  },
  {
    id: "settle/throw-after-claim-strands-the-freeze",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "A3 · M201 — the line four review rounds could not write. Codex rounds 8/10/11/12/13 on #275 each falsified a release here while `staff-cart.ts` passed a SHARED staff uid (by owner: a same-staff sibling's row was byte-identical; by owner+era: create-share-intent rode a freeze it never wrote; by cart: everyone), so the claimed freeze was HELD to the settle TTL. Every caller now mints a per-request uuid, so `settle_by = owner` names this request's freeze and no other — and holding it strands the table for the TTL over a step that never ran. This mutant is the old behaviour, so it cannot come back as a 'simplification'",
    find: '    if (claimHeld && predecessorDead) await releaseOwn(cartId, owner, "post-claim-throw");',
    replace: "    if (claimHeld && predecessorDead) void owner;",
  },
  {
    id: "settle/stale-pin-settles-anyway",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 3 P2. Logging a failed `releaseByIntent` and returning `acquired` hands the caller straight to `getCartTotals`, which reads the pin STILL on the row — so the table settles at the cancelled attempt's frozen discount, which is the exact defect clearing the pin exists to prevent. The intent is already dead, so refusing costs one more tap and protects the amount",
    find: '      await releaseOwn(cartId, owner, "pin-clear-failed");\n      return "unavailable";\n    }\n    // The freeze is already ours',
    replace: '      return "acquired";\n    }\n    // The freeze is already ours',
  },
  {
    id: "settle/stand-down-strands-its-probe-freeze",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 6 P2 — and a direct consequence of round 5's fix. `acquireSettlement` is a MUTATING update: answering `acquired` means it has already written `settle_at`/`settle_by`. Suppressing only the returned verdict left that write behind with nothing to release it, so the action reported a retryable failure while the table stayed frozen for the settle TTL — worst for the Terminal settle, whose every retry carries a fresh attempt id and therefore meets its own orphan as `settling_other`",
    find: "  const { error: err } = await releaseSettlementFor(cartId, probe);",
    replace: "  const err = null as ReleaseError;",
  },
  {
    id: "settle/stand-down-probes-under-the-callers-uid",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "The probe's uniqueness is load-bearing. `releaseSettlementFor` is scoped by `settle_by`, so only a uuid nobody else can hold makes the release provably ours — under the caller's uid it could null the WINNER's freeze, the very request we stood down for. (Before A3 it also had to dodge `acquireSettlement`'s same-owner arm; that arm is gone, and the scoping argument stands on its own)",
    find: "  const probe = crypto.randomUUID();",
    replace: "  const probe = cartId;",
  },
  {
    id: "settle/no-intent-branch-promoted-to-acquired",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: 'Codex round 5 P1 \u2014 the THIRD consecutive round in which a fix moved this hole instead of closing it, and the branch I had argued was safe. The reasoning that failed: "no claim was attempted here, so the loser-rides-the-winner sequence cannot arise". It can, because THE WINNER MAKES THIS BRANCH REACHABLE \u2014 request A claims, cancels and clears the link, so request B (same staff uid, moments behind) reads null precisely BECAUSE A cleared it, never attempts a claim, and falls through here. `collapse` then passed on the `acquired` that `acquireSettlement` grants via its `settle_by.eq.<uid>` arm, and both minted an off-session PaymentIntent under a per-attempt key',
    find: "    if (!live) return await standDown(cartId);",
    replace: "    if (!live) return collapse(await acquireSettlement(cartId, uid));",
  },
  {
    id: "settle/no-live-stand-down-rejection-escapes-the-try",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 8 on #275, P2. `return standDown(cartId)` without `await` returns the promise and EXITS THE TRY before it settles, so the catch never converts a rejection into `unavailable` \u2014 `standDown` awaits `acquireSettlement`, which throws on a serviceClient construction or network failure. The staff Server Action then REJECTS rather than answering retryably, and both `settleCash` and `closeSecureTab` set `busy` before awaiting with no catch, so the control latches on a dead screen. The mutant is the exact 'redundant await' cleanup a future reader would make",
    find: "    if (!live) return await standDown(cartId);",
    replace: "    if (!live) return standDown(cartId);",
  },
  {
    id: "settle/lost-claim-stand-down-rejection-escapes-the-try",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 8 on #275, P2. `return standDown(cartId)` without `await` returns the promise and EXITS THE TRY before it settles, so the catch never converts a rejection into `unavailable` \u2014 `standDown` awaits `acquireSettlement`, which throws on a serviceClient construction or network failure. The staff Server Action then REJECTS rather than answering retryably, and both `settleCash` and `closeSecureTab` set `busy` before awaiting with no catch, so the control latches on a dead screen. The mutant is the exact 'redundant await' cleanup a future reader would make",
    find: "    if (!claimed) return await standDown(cartId); // await load-bearing \u2014 see the !live branch",
    replace: "    if (!claimed) return standDown(cartId);",
  },
  {
    id: "settle/release-scope-admits-any-cart-intent",
    file: "apps/qr/lib/settle-release-scope.ts",
    suite: "lib/settle-release-scope.test.ts",
    why: "Codex round 8 on #275, P1 \u2014 THE SHIPPED DEFECT, restated as a plausible tightening. Keying on `cartId` reads like a guard and admits the entire DINER single-pay population, which is exactly who reached the old unconditional release: a diner's declined card would once again null a `settle_at` it never held, while `closeSecureTab` names that freeze (not its per-attempt idempotency key) as the concurrent double-charge guard",
    find: '  if (meta.closedBy !== "staff") return null;',
    replace: "  if (meta.cartId == null) return null;",
  },
  {
    id: "settle/release-scope-takes-the-attribution-id",
    file: "apps/qr/lib/settle-release-scope.ts",
    suite: "lib/settle-release-scope.test.ts",
    why: "`closedByStaffId` is WHO GETS CREDIT for the close; the freeze is held under the per-request `settleAttempt`. Falling back to it looks like resilience and is the silent-no-op failure: the scoped release would match zero rows forever, so the freeze it exists to return would never come back and every table healed only on the TTL — a bug that looks exactly like working code",
    find: "  const owner = meta.settleAttempt;",
    replace: "  const owner = meta.settleAttempt ?? meta.closedByStaffId;",
  },
  {
    id: "settle/release-scope-accepts-a-non-uuid-owner",
    file: "apps/qr/lib/settle-release-scope.ts",
    suite: "lib/settle-release-scope.test.ts",
    why: "`qr_carts.settle_by` is a `uuid` column, so a non-uuid owner is a PostgREST 22P02 ERROR, not a predicate that matches zero rows. Dropping the shape check turns a fail-closed skip into a failed request on every malformed intent",
    find: "  return UUID.test(trimmed) ? trimmed : null;",
    replace: "  return trimmed.length > 0 ? trimmed : null;",
  },
  {
    id: "settle/ambiguous-claim-left-for-the-ttl",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "A3 · M201 (b) — Codex round 10 on #275 asked for this cleanup and round 11 showed it was a REGRESSION while the owner was `caller.uid`: a release from request B whose claim errored matched same-staff request A's live claim and stripped A's mutex mid-charge. With a per-request uuid that sibling row cannot exist, and the orphan this cleanup closes — a claim whose response was lost, holding `settle_by = owner` with no same-owner arm for a retry to reclaim it — blocked every tender for the settle TTL. Leaving it is the old cost, not the safe side",
    find: '      await releaseOwn(cartId, owner, "ambiguous-claim");',
    replace: "      void owner;",
  },
  {
    id: "settle/ambiguous-probe-acquire-strands-the-freeze",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 9 on #275, P2. `acquireSettlement` ends its UPDATE with `if (error) throw error`, so a transport failure AFTER Postgres applied it rejects while the row already carries `settle_by = probe`. Only this scope knows the probe \u2014 the caller's catch sees the rejection but not the uuid \u2014 so rethrowing here strands an orphan freeze that blocks the next tap as `settling_other` until the TTL. The release must run on EVERY outcome, which is safe precisely because it is scoped to a uuid nobody else can hold: it matches our row when we took the freeze and zero rows when we did not, including when we cannot tell which happened",
    find: "        error: e instanceof Error ? e.message : String(e),\n      },\n    );\n  }",
    replace:
      "        error: e instanceof Error ? e.message : String(e),\n      },\n    );\n    throw e;\n  }",
  },
  {
    id: "settle/stand-down-flattens-the-diagnosis",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: 'The over-blocking direction of the same rule. Refusing the GRANT must not flatten every diagnosis: staff still need to learn that the table closed, or that a colleague holds the freeze, or the screen says "try again" forever against a cart that will never come back. Standing down withholds promotion, it does not withhold the answer',
    find: '    if (r !== "acquired") verdict = collapse(r);',
    replace: "    void r;",
  },
  {
    id: "settle/lost-claim-promoted-to-acquired",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 4 P1 \u2014 the round-3 fix MOVED this hole rather than closing it. Dropping `settle_by.eq.<uid>` from the CLAIM stopped two same-staff takeovers both winning it; the loser then re-asked through `acquireSettlement`, whose predicate still carries that arm \u2014 and the winner has by then CLEARED THE LINK, which is exactly what opens the lock arm for the loser. Both answer `acquired`, both mint an off-session PaymentIntent, and that idempotency key is deliberately per-attempt, so the guest is charged twice off one staff member double-tapping",
    find: "    if (!claimed) return await standDown(cartId); // await load-bearing \u2014 see the !live branch",
    replace: "    if (!claimed) return collapse(await acquireSettlement(cartId, uid));",
  },
  {
    id: "charge/rejected-request-reads-as-unknown",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "Codex round 4 P2. `paymentIntents.create` answers `resource_missing` when the stored customer or payment method has been deleted: Stripe RECEIVED the request and rejected it, so no intent exists and nothing can be captured later. Folding that back into `unknown` makes `closeSecureTab` HOLD the settlement freeze for the full TTL \u2014 blocking cash, another card and every cart edit \u2014 over a charge that provably never happened, and tells staff the outcome is ambiguous when it is not",
    find: '  if (err.code === "resource_missing") return "no_method";',
    replace: "  void err.code;",
  },
  {
    id: "settle/cancels-without-claiming",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "M197, Codex round 2 P1 — THE SHIPPED TOCTOU. Until the claim lands this path holds NO mutex: between the acquire that answered `locked_stale` and the Stripe cancel, the diner can call create-intent, re-acquire the pay lock with a fresh era and link a live intent. The old code read the row FRESH and cancelled whatever it named — killing a resumed checkout — and the second acquire then refused staff anyway, so it destroyed a payment and gained nothing. create-intent's own use of the same supersede is safe precisely because it already holds the lock",
    find: "    const { claimed, error: claimErr } = await claimStaleSettlement(cartId, owner, live);",
    replace: "    const { claimed, error: claimErr } = { claimed: true, error: null };",
  },
  {
    id: "settle/refused-supersede-releases-a-charging-predecessor",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 1 on A3, P1 — the REVERSE of the mutant that stood here. The first A3 draft gave a claimed freeze back on a refused supersede, reasoning that a request-unique owner made the release safe; it is safe against the SIBLING-request hole (M201) and wrong for the reason the hold always existed: reaching this arm means the diner's pay lock is stale, so the claimed freeze is the only thing `paymentInFlightReason` still honours, and `captured` means the predecessor is charging with its webhook not yet landed. Releasing let a diner edit the cart, or the counter clear the table, before the webhook snapshotted the order — a captured payment with no fulfillable order. Held to the TTL under the unique owner, the next attempt is refused as `settling_other` and cannot double-mint",
    find: '      holdClaimed(cartId, owner, "supersede-refused", outcome);',
    replace: "      await releaseSettlementFor(cartId, owner);",
  },
  {
    id: "settle/throw-before-the-predecessor-is-dead-releases-the-freeze",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 1 on A3, P1 — the post-claim catch's other half. A throw from the supersede step itself (Stripe unreachable mid-cancel) leaves the predecessor's state UNKNOWN, and an unknown predecessor may be charging; releasing the claimed freeze there is the same captured-with-no-order window as the refused arm. Only a throw AFTER the intent is proven cancelled may give the freeze back",
    find: '    else if (claimHeld) holdClaimed(cartId, owner, "post-claim-throw", "unknown");',
    replace: '    else if (claimHeld) await releaseOwn(cartId, owner, "post-claim-throw");',
  },
  {
    id: "terminal/processing-read-as-paid",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "Codex round 1 on A3, P2. `processing` is provisional — the charge can still fail — and folding it into `too_late` makes the poll answer `succeeded` with a dollar total, which the register latches into its recording phase: staff leave the panel on a false payment verdict. `succeeded` is reserved for Stripe's terminal status; processing keeps collecting",
    find: '    if (status === "processing") return "processing";',
    replace: '    if (status === "processing") return "too_late";',
  },
  {
    id: "terminal/sibling-poll-abandons-own-attempt",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "Codex round 1 on A3, P2. Two polls of one attempt overlap as the freeze ages out: both extend zero rows, the first re-acquires, the second is refused because `acquireSettlement` has no same-owner arm (by design). Reading the refusal as another owner cancels a valid reader payment the first poll had just resumed. The ownership READ is what separates the two without restoring the arm",
    find: '  if (held) {\n    console.warn("[terminal] a sibling poll of this attempt holds the freeze — still ours", {',
    replace:
      '  if (false) {\n    console.warn("[terminal] a sibling poll of this attempt holds the freeze — still ours", {',
  },
  {
    id: "split/abort-proceeds-over-a-stale-foreign-freeze",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "Codex round 1 on A3, P1. `captureAllIfReady` proceeds on a STALE non-null freeze once every share is authorized, so an abort that walks past a stale foreign marker without clearing it races a late authorization webhook: the capture passes the gate while the abort cancels holds and deletes the ledger — money taken, no order. The stale-only clear is what shuts the gate before anything destructive",
    find: "      const { released: cleared, error: clearErr } = await releaseStaleSettlement(id);",
    replace:
      "      const { released: cleared, error: clearErr } = { released: true, error: null };",
  },
  {
    id: "settle/cancelled-attempt-keeps-its-promo-pin",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "M197, Codex round 2 P1. M70's rule is that a pin outlives the lock because a captured-but-unfulfilled predecessor still reconciles against it \u2014 a reason that is SPENT once we have established this intent is cancelled. Leaving the pin makes `getCartTotals` hand staff the frozen discount instead of re-evaluating a promotion that may have expired or hit its redemption cap, so the table is collected at a price it no longer earns",
    find: "    const { error: pinErr } = await releaseByIntent(cartId, live);",
    replace: "    const pinErr = null;",
  },
  {
    id: "settle/supersede-throw-escapes-the-action",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "Codex round 2, P2. `readLiveIntent` rethrows its postgrest error and `getStripe()` throws on a missing or mode-mismatched key, and both callers are Server Actions that set `busy` before awaiting with no catch of their own \u2014 so an escaping rejection latches the staff control instead of rendering the retryable sentence this union exists to carry. A failure to establish anything is `unavailable`, never a verdict",
    find: "    const live = await readLiveIntent(cartId);",
    replace: '    const live = await readLiveIntent(cartId).catch(() => "pi_x");',
  },
  {
    id: "settle/captured-attempt-still-superseded",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "M197 \u2014 THE ARM THAT COSTS MONEY. `captured` means the abandoned attempt's card is charged or charging and the webhook is about to fulfil. Returning anything that lets the caller proceed puts cash in the drawer on top of a real charge: the guest is collected twice and waits on a manual refund. This is `split-hold.ts`'s asymmetry \u2014 refusing a settlement that could have proceeded is a retry; permitting one that could not is money",
    find: '      return outcome === "captured" ? "paying" : "unavailable";',
    replace: '      return "locked";',
  },
  {
    id: "settle/unknown-outcome-proceeds-to-settle",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "M119's rule one hop out, RE-AIMED at the worse failure once the refusal arms merged (Codex round 2 restructure). `unknown` means we could not reach Stripe to judge the abandoned attempt. Narrowing this gate to `captured` does not merely mislabel that \u2014 it lets the unknown outcome FALL THROUGH to the pin clear and answer `acquired`, so staff settle a table on an attempt whose PaymentIntent may be live, holding a freeze we never established we were entitled to. A transport failure is not a verdict, and it is certainly not permission",
    find: '    if (outcome !== "cleared") {',
    replace: '    if (outcome === "captured") {',
  },
  {
    id: "settle/supersede-runs-on-every-settle",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "M197 \u2014 the guard that keeps the ordinary path one statement. Widening the early return puts a Stripe retrieve in front of every cash settle at the counter, and cancels nothing (there is no abandoned attempt on an unlocked cart) \u2014 a latency cost paid on the fastest operation staff run, to no end. Reaching Stripe only on `locked_stale` is the rule",
    find: '  if (first !== "locked_stale") return first;',
    replace: '  if (first === "acquired") return first;',
  },
  {
    id: "settle/same-owner-arm-returns",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "A3 · M201 — THE arm, restored. `settle_by.eq.<owner>` was a re-open door for the host's split that the counter inherited by passing a shared staff uid: two same-staff requests both matched — the second on the freeze the first had just written — and `closeSecureTab` minted two off-session PaymentIntents under per-attempt keys. Four consecutive fixes each MOVED that hole because the arm stayed. It reads as a harmless convenience and is the double-mint",
    find: "    .or(`settle_at.is.null,settle_at.lte.${cutoff}`);",
    replace: "    .or(`settle_at.is.null,settle_by.eq.${owner},settle_at.lte.${cutoff}`);",
  },
  {
    id: "settle/extend-not-scoped-to-the-owner",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "A3 · M203 — the unscoped extend kept alive WHATEVER freeze the row held: a share route extending a staff settle's freeze after a takeover, or the Terminal poll refreshing a cash settle's mutex over its own dead attempt. `settle_by = owner` is what makes 'extend' mean 'extend MINE'",
    find: '    .eq("settle_by", owner)\n    .gt("settle_at", cutoff);',
    replace: '    .gt("settle_at", cutoff);',
  },
  {
    id: "settle/extend-reports-nothing",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "A3 · M203 — the old `Promise<void>` restated as a constant. A zero-row update is `{ error: null }` in postgrest, so `extended: true` on every call is exactly the silence that hid a lost mutex mid-collect on the Terminal and let create-share-intent hand out a client secret over a freeze it no longer had",
    find: "  return { extended: (count ?? 0) > 0, error };",
    replace: "  return { extended: true, error };",
  },
  {
    id: "settle/settled-cart-release-admits-an-open-cart",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "A3 · M202 — the seventeenth unconditional release. `releaseSettlementOfSettledCart` is sound ONLY because a cart that is no longer open can have no successor freeze (`acquireSettlement` requires `status = 'open'`); the invariant lives in the predicate so a call on an open cart matches zero rows instead of stripping a live mutex. Drop the `.neq` and it is `releaseSettlement(cartId)` by another name",
    find: '    .eq("id", cartId)\n    .neq("status", "open");',
    replace: '    .eq("id", cartId);',
  },
  {
    id: "settle/release-for-claims-released-on-zero-rows",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "A3 · M202 — `released` is a FACT some callers act on: the split abort must not cancel holds and delete rows past a claim it did not land, and the Terminal poll wants a lost mutex told apart from a healthy one. Answering `true` on zero rows is the old `{ error: null }` silence with a new name",
    find: '    .eq("settle_by", owner);\n  return { released: (count ?? 0) > 0, error };',
    replace: '    .eq("settle_by", owner);\n  return { released: true, error };',
  },
  {
    id: "settle/diagnosing-acquire-throw-strands-the-freeze",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "A3 · M201 (c), Codex round 12 on #275 — the third settlement write outside any catch. `acquireSettlement` throws AFTER its UPDATE may have applied, so the row can carry `settle_by = owner` while the Server Action rejects; the Terminal, whose every retry carries a fresh attempt id, then met its own orphan as `settling_other` until the TTL. The release is safe on every outcome for the stand-down's reason: the owner is unique, so the scope reaches our row or nothing",
    find: '    await releaseOwn(cartId, owner, "diagnosing-acquire-threw");',
    replace: "    void owner;",
  },
  {
    id: "settle/post-claim-release-not-scoped-to-the-owner",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/settle-takeover.test.ts",
    why: "A3 · M202 — the scoping IS the property. A release keyed on the cart id matches everyone (a successor's live freeze included), and a release keyed on any constant matches two concurrent requests on one cart. Only the caller's request-unique owner, passed straight through, names exactly one request's freeze",
    find: "    const { error } = await releaseSettlementFor(cartId, owner);",
    replace: "    const { error } = await releaseSettlementFor(cartId, cartId);",
  },
  {
    id: "settle/release-scope-reads-the-shared-uid",
    file: "apps/qr/lib/settle-release-scope.ts",
    suite: "lib/settle-release-scope.test.ts",
    why: "A3 · M201 — the residual that row named, restored as a 'legacy fallback'. `closedByUid` is the staff auth uid, shared by every request that person makes, so a DELAYED decline releasing under it can strip a same-staff retry's LIVE freeze. Reading it 'only when settleAttempt is absent' is exactly when an old-deploy intent would reach it — the one-deploy transition heals on the TTL instead",
    find: "  const owner = meta.settleAttempt;",
    replace: "  const owner = meta.settleAttempt ?? meta.closedByUid;",
  },
  {
    id: "settle/cash-owner-is-the-callers-uid",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "A3 · M201 — the shipped defect, restored on the cash path. Under `caller.uid` two same-staff requests are byte-identical on the row; cash survived only because the settle RPC de-duplicates downstream, which is not a mutex. Provenance is `caller.staffId` on the order; the freeze owner must be something no other request can hold",
    find: '  const attempt = crypto.randomUUID();\n  const freeze = await acquireSettlementSuperseding(cart.id, attempt);\n  if (freeze !== "acquired") {',
    replace:
      '  const attempt = caller.uid;\n  const freeze = await acquireSettlementSuperseding(cart.id, attempt);\n  if (freeze !== "acquired") {',
  },
  {
    id: "settle/tab-close-owner-is-the-callers-uid",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "A3 · M201 — the shipped defect, restored on the path where it was MONEY. Under `caller.uid` a same-staff double-tap both acquired, and each request minted its own off-session PaymentIntent under a per-attempt idempotency key: the guest was charged twice off one thumb. The parsed guard binds the acquire's argument to a `crypto.randomUUID()` declaration; `caller.uid` is a different binding",
    find: '  const attempt = crypto.randomUUID();\n  const freeze = await acquireSettlementSuperseding(cart.id, attempt);\n  if (freeze !== "acquired")\n    return {',
    replace:
      '  const attempt = caller.uid;\n  const freeze = await acquireSettlementSuperseding(cart.id, attempt);\n  if (freeze !== "acquired")\n    return {',
  },
  {
    id: "settle/cash-release-not-scoped",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "A3 · M202 — `settleCash`'s `finally` releasing under the CART id matches whatever freeze the row holds by then: on a slow settle that is a successor's live mutex. The value test asserts the release names the SAME owner the acquire minted; a constant satisfies neither that nor the parsed binding guard",
    find: "    await releaseSettlementFor(cart.id, attempt);\n  }\n}\n\nexport type CloseSecureTabResult",
    replace:
      "    await releaseSettlementFor(cart.id, cart.id);\n  }\n}\n\nexport type CloseSecureTabResult",
  },
  {
    id: "settle/tab-close-stamps-the-staff-uid",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "A3 · M201 — the webhook's decline arm scopes its release by `settleAttempt` (`settle-release-scope.ts`). Stamping the staff uid there instead of the request's owner makes that release match zero rows forever (the freeze is held under the uuid), so a declined tab close heals only on the TTL — and if the scope ever read a shared owner again, it would be the delayed-decline residual M201 named",
    find: "          settleAttempt: attempt,\n        },",
    replace: "          settleAttempt: caller.uid,\n        },",
  },
  {
    id: "terminal/collect-extend-not-scoped",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "A3 · M203 — the poll's extend under the CART id refreshes whatever freeze the row holds: after a takeover that is a cash settle's mutex, kept alive by a reader that no longer owns the table. The extend must name this attempt, so that 'nothing extended' means 'we lost it'",
    find: '  const { extended, error: extErr } = await extendSettlementFor(cartId, attempt);\n  if (extended) return { ok: true, state: "collecting" };',
    replace:
      '  const { extended, error: extErr } = await extendSettlementFor(cartId, cartId);\n  if (extended) return { ok: true, state: "collecting" };',
  },
  {
    id: "terminal/lost-mutex-keeps-collecting",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "A3 · M203 — the old silent no-op, dressed as 'no error means fine'. `extended: false` with no error is precisely the lost mutex: the reader still prompting for a table this attempt no longer holds, while a cash settle can proceed beside it. Treating it as `collecting` is the double-collect the row describes",
    find: '  if (extended) return { ok: true, state: "collecting" };',
    replace: '  if (extended || !extErr) return { ok: true, state: "collecting" };',
  },
  {
    id: "terminal/extend-outage-read-as-lost-mutex",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: 'Blind pass on A3, CRITICAL 2 — the first draft. `extendSettlementFor` answers `{ extended: false, error }` on a PostgREST hiccup, and reading that as a lost mutex cancels a live tap mid-interaction and tells staff the hold "was lost … being settled another way": a fabricated diagnosis over an outage. An error is a poll miss; only zero rows WITHOUT an error is a fact about the freeze',
    find: '  if (extErr) {\n    console.error("[terminal] settlement extend failed mid-collect — an outage, not a lost mutex", {',
    replace:
      '  if (extErr && extErr.message === "") {\n    console.error("[terminal] settlement extend failed mid-collect — an outage, not a lost mutex", {',
  },
  {
    id: "terminal/cancel-refusal-read-as-paid",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: 'Blind pass on A3, CRITICAL 1 — the first draft. Stripe answers `payment_intent_unexpected_state` for an already-CANCELED intent exactly as for a SUCCEEDED one (two tablets polling one attempt is enough), so reading a refused cancel as "the tap won" reports `succeeded` with a dollar total for money never taken. The re-read\'s `canceled` arm is the only thing between a refused cancel and a false paid state',
    find: '    if (status === "canceled") return "canceled";',
    replace: '    if (status === "canceled") return "too_late";',
  },
  {
    id: "terminal/aged-out-freeze-abandoned-without-reacquire",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "Blind pass on A3, open question made a rule. A freeze that aged past the TTL with NOBODY taking it (a backgrounded tablet) is a stale row this attempt still names; abandoning the guest's live tap there is the over-block. The re-acquire under the same attempt succeeds on exactly that row and refuses when a colleague holds it fresh — it is what separates 'aged out' from 'taken', and skipping it turns every stale freeze into a cancelled payment",
    find: "    back = await acquireSettlement(cartId, attempt);",
    replace: '    back = "settling_other";',
  },
  {
    id: "split/abort-refreezes-what-it-never-released",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "Blind pass on A3 — the comment said 'restores the exact pre-abort state', and with `released: false` the pre-abort state had NO host freeze. Refreezing unconditionally invents one over a null claim, or overwrites a stale Terminal attempt's owner so that attempt's next poll meets a lost mutex and cancels its PaymentIntent. Restore only what this abort lifted",
    find: "    const refreezeErr = lifted ? await refreeze(db, id, uid) : null;",
    replace: "    const refreezeErr = await refreeze(db, id, uid);",
  },
  {
    id: "terminal/canceled-poll-keeps-the-freeze",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "Codex round 3 on A3, P2 — a poll that retrieved the intent before staff cancelled it can re-acquire the freeze cancel just released, off a stale `requires_payment_method` snapshot; the next tick sees `canceled` and, without this scoped release, the successfully cancelled table stays frozen for the TTL. Dropping it restores exactly that",
    find: '    const { error: relErr } = await releaseSettlementFor(cartId, attempt);\n    if (relErr)\n      console.error("[terminal] canceled-poll release failed", { cartId, message: relErr.message });\n    return { ok: true, state: "canceled" };',
    replace: '    return { ok: true, state: "canceled" };',
  },
  {
    id: "split/abort-forgets-the-stale-clear-it-made",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "Codex round 2 on A3, P2 — the stale clear lifts the marker exactly as the host-scoped release does, and a share-read failure right after it must restore what THIS request took: without it the cart sits at settle_at null over an intact ledger, the board unmounts, pending intents authorize with nothing to capture them, and the authorized shares block cash settlement and the table",
    find: "      if (cleared) lifted = true;\n",
    replace: "",
  },
  {
    id: "split-settle/lost-settlement-still-captures",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "Codex round 2 on A3, P1 — `captureAllIfReady` gates on a NON-NULL settle_at, so a share authorizing after a cash/reader settle took the table would capture every split payer under the counter's fresh freeze while staff collect the whole bill. The ownership re-read after a zero-row extend is the only thing that tells 'aged out' from 'taken'; skipping its refusal is the double charge",
    find: "    if (row?.settle_at != null && row.settle_by !== owner) {",
    replace: "    if (false) {",
  },
  {
    id: "split-settle/extend-outage-swallowed",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "Codex round 2 on A3, P1 (the outage arm) — an unreadable freeze is neither a lost settlement nor a live one; 200-ACKing it lets Stripe stop redelivering an authorization the ledger never saw extended, and the very next line's re-read runs against a database that just failed",
    find: "  if (extErr) throw new Error(`onShareAuthorized: extend failed — ${extErr.message}`);",
    replace: "  if (extErr) return;",
  },
  {
    id: "split/abort-ignores-a-foreign-freeze",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "A3 · M202 — the abort's claim is a COUNTED scoped release, and `released: false` with a FRESH freeze on the row means someone else holds the table: proceeding cancels holds and deletes the ledger under a staff settle's mutex, which is what the by-cart release used to do by nulling it first. Inverting the branch skips the one read that separates 'already gone' from 'somebody else's'",
    find: "  if (!released) {\n    const { data: row, error: rowErr } = await db",
    replace: "  if (released) {\n    const { data: row, error: rowErr } = await db",
  },
  {
    id: "split-settle/extend-under-the-row-not-the-share",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "A3 · M203 — the share's authorization extends the freeze the share was MINTED against (`settleOwner`, stamped by create-share-intent), or nothing. Extending under the cart id is the old 'ride whatever the row holds now' — after a takeover, a staff settle's freeze kept alive by a diner's card",
    find: "  const { extended, error: extErr } = await extendSettlementFor(cartId, owner);",
    replace: "  const { extended, error: extErr } = await extendSettlementFor(cartId, cartId);",
  },
  {
    id: "share-intent/extends-under-the-payer-not-the-host",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "A3 · M203 — the freeze belongs to the HOST who opened the split (`settleBy`), never to the seat paying its share. Extending under the payer's uid matches zero rows on every real table, so every share would 409 — or, if the payer happened to be the host, would pass for the wrong reason. The owner is the one authz handed back",
    find: "await extendSettlementFor(cartId, settleBy);",
    replace: "await extendSettlementFor(cartId, uid);",
  },
  {
    id: "share-intent/extend-nothing-still-mints",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "A3 · M203 — THE root of that row. Minting after an extend that matched nothing hands the payer a confirmable client secret over a freeze the host no longer holds: an abort or a staff takeover in the gap, and the share's hold lands on a table being settled another way. The refusal is the whole point of extending FIRST",
    find: '    if (!extended)\n      return NextResponse.json(\n        { error: "The split was closed or taken over — refresh and try again." },\n        { status: 409 },\n      );',
    replace: "",
  },
  {
    id: "queue/saturated-read-claims-empty",
    file: "apps/qr/lib/queue-window.ts",
    suite: "lib/queue-window.test.ts",
    why: "M180 \u2014 THE SHIPPED DEFECT, restored. `clearTable` leaves fired lines on a cancelled cart forever and nothing prunes them, so the KDS's oldest-first `limit(500)` eventually returns 500 rows that are ALL dead; `sessionIds` empties and the queue answers `ok: true` with zero tickets \u2014 an empty board over a room of cooking food, the exact lie the file's own W10b comment says it refuses. Expo is the same shape at 200",
    find: '  return rowsRead >= cap ? "cannot-say" : "empty";',
    replace: '  return "empty";',
  },
  {
    id: "queue/never-claims-empty",
    file: "apps/qr/lib/queue-window.ts",
    suite: "lib/queue-window.test.ts",
    why: "THE OVER-BLOCKING DIRECTION, and it is not the lesser evil \u2014 it fires every quiet morning. A rule that refused to claim `empty` whenever nothing was live would freeze BOTH boards on their last-known queue permanently, so the kitchen reads yesterday's tickets as current. `check-freeze-parity`'s docblock and the delivery repo's `computeDeliveryGate` both record what a gate that is right about its own case and wrong about the valid one costs",
    find: '  return rowsRead >= cap ? "cannot-say" : "empty";',
    replace: '  return "cannot-say";',
  },
  {
    id: "queue/cap-hardcoded-not-read",
    file: "apps/qr/lib/queue-window.ts",
    suite: "lib/queue-window.test.ts",
    why: "The two boards have DIFFERENT caps \u2014 the kitchen's 500 and expo's 200 \u2014 so a rule that hardcoded either would be decorative on the other surface it governs while reading as correct on both. The parameter is the whole reason one module serves two callers",
    find: '  return rowsRead >= cap ? "cannot-say" : "empty";',
    replace: '  return rowsRead >= 500 ? "cannot-say" : "empty";',
  },
  {
    id: "queue/unreadable-clock-floors-at-1970",
    file: "apps/qr/lib/queue-window.ts",
    suite: "lib/queue-window.test.ts",
    why: "A bound that silently stops bounding is worse than none, because nothing looks wrong. `Date.parse` answers NaN for a malformed server timestamp, and the tempting `|| 0` fallback yields a 1970 floor that admits every row ever written \u2014 i.e. exactly the unbounded read this function replaces, restored under a name that says it is bounded",
    find: "  const basis = Number.isFinite(now) ? now : Date.now();",
    replace: "  const basis = Number.isFinite(now) ? now : 0;",
  },
  {
    id: "lock/refusal-release-not-era-scoped",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M153 \u2014 create-intent's six refusal exits (a sold-out line, a filled pickup slot, a missing pickup contact) release the pay lock, and the predicate used to be `locked_by = uid` ALONE. `acquireCartLock` deliberately lets the SAME diner re-acquire with a fresh era, so a losing overlapping attempt's refusal released the WINNER's lock and dropped a cart back to editable underneath a mounted Payment Element \u2014 the peer-mutation-during-checkout hole the lock exists to close, opened by its own release",
    find: '    .update({ locked: false, locked_at: null, locked_by: null })\n    .eq("id", cartId)\n    .eq("locked_by", uid)\n    .eq("locked_at", era);',
    replace:
      '    .update({ locked: false, locked_at: null, locked_by: null })\n    .eq("id", cartId)\n    .eq("locked_by", uid);',
  },
  {
    id: "lock/refusal-release-clears-the-pin",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M123(a\u2032) \u2014 the ONE thing `releaseCartLockFor` must NOT copy from `releasePayAttempt`. These callers exit ABOVE `mms_pin_promo_grant`, so any pin on the row belongs to a PREDECESSOR, and a predecessor's captured-but-unfulfilled PaymentIntent still reconciles against it (M70: the pin has to outlive the lock). PR #244 shipped exactly this widening and reverted it \u2014 Codex P1 and the blind adversarial pass agreed independently that it traded a lesser defect for a worse one",
    find: '  if (!era) return null;\n  const db = serviceClient();\n  const { error } = await db\n    .from("qr_carts")\n    .update({ locked: false, locked_at: null, locked_by: null })',
    replace:
      '  if (!era) return null;\n  const db = serviceClient();\n  const { error } = await db\n    .from("qr_carts")\n    .update({ promo_granted_cents: null, locked: false, locked_at: null, locked_by: null })',
  },
  {
    id: "lock/refusal-release-no-era-releases-anyway",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M153 \u2014 the fail-closed arm, same rule as `releasePayAttempt`. A caller that cannot name its attempt cannot show the lock is its own, so it issues no statement at all and the TTL is the backstop. Removing the guard sends a null era into the filter, which is an argument about how nulls compare rather than a decision anyone made",
    find: "): Promise<ReleaseError> {\n  if (!era) return null;\n  const db = serviceClient();",
    replace: "): Promise<ReleaseError> {\n  const db = serviceClient();",
  },
  {
    id: "lock/attempt-token-dropped",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M124 \u2014 without the era term the predicate is `mms_release_promo_grant_for_holder`'s again: `locked_by = uid` alone, which cannot tell one diner's two tabs apart. `acquireCartLock` lets the SAME uid re-acquire with a fresh era, so an abandoned tab's late pagehide beacon satisfies it against the LIVE tab and clears its pin. Landing between capture and the fulfilment webhook, the re-derive drops the discount and strands a charged card with no order",
    // ⚠️ ANCHORED ON THE `count: "exact"` PAYLOAD, not on the two `.eq` terms alone. M153 gave
    // `releaseCartLockFor` the identical trailing predicate, at which point the shorter pattern
    // matched TWICE and this mutant went STALE — which is the gate doing its job: a `find` that
    // matches two statements would mutate whichever the replace happened to reach, so the mutant
    // would stop naming the rule it was written for.
    find: '      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid)\n    .eq("locked_at", era);',
    replace: '      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid);',
  },
  {
    id: "lock/grant-dropped-from-payload",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M123(a\u2032) \u2014 the pin rides in the SAME payload as the lock deliberately. Drop it and every predicate assertion stays green while the statement releases a lock over a LIVE pin: `acquireSettlement` gates on the raw `locked` column, so that state is exactly what admits cash / Terminal / split, each deriving from `getCartTotals`, which returns the pin outright. The stale discount is charged, recorded, and burns a promo redemption the basket never earned",
    find: '      {\n        promo_granted_cents: null,\n        live_payment_intent_id: null,\n        locked: false,\n        locked_at: null,\n        locked_by: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid)',
    replace:
      '      {\n        live_payment_intent_id: null,\n        locked: false,\n        locked_at: null,\n        locked_by: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid)',
  },
  {
    id: "lock/no-token-releases-anyway",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M124 \u2014 the fail-closed arm. A caller with no era cannot show WHICH attempt it is: an old client bundle mid-deploy, or a forged/unparseable token normalized to null. Releasing on that basis re-creates the defect the era exists to close, so the only safe answer is to issue no statement at all and let the lock TTL be the backstop",
    find: "  if (!era) return { released: false, error: null };",
    replace: "  if (!era) era = null as unknown as string;",
  },
  {
    id: "pay-attempt/zero-row-assumed-superseded",
    file: "apps/qr/lib/pay-attempt.ts",
    suite: "lib/pay-attempt.test.ts",
    why: 'M124, Codex round 2 on #244 \u2014 a zero-row match is NOT proof another tab took over. The predicate is `locked_by = uid AND locked_at = era`; it fails whenever any term stopped holding. The reachable counter-example is an ordinary DECLINED CARD: the webhook\'s payment_failed arm calls `releaseCartLock(cartId, null)` cart-wide, nulling `locked_at`, while `PaymentSection.confirm()` keeps the same Element mounted \u2014 so "Edit order" matches nothing. Assuming supersession there tells the diner something false AND blocks them from editing an order that is genuinely editable: the fabricated-diagnosis class M116/M119 removed. The reason has to be READ',
    find: "  return { released: false, reason: await zeroRow() };",
    replace: '  return { released: false, reason: "superseded" };',
  },
  {
    id: "pay-attempt/null-era-reads-as-successor",
    file: "apps/qr/lib/pay-attempt.ts",
    suite: "lib/pay-attempt.test.ts",
    why: 'M124, Codex round 3 on #244 \u2014 a caller that cannot name its attempt issued NO write (releasePayAttempt short-circuits on a null era), which happens whenever deployment skew hands a client bundle a 200 from a build predating the token. Without this guard the comparison runs anyway, every real `locked_at` differs from null, and the diner\'s OWN fresh lock is reported as a successor \u2014 the terminal "another tab took over" screen on a cart nobody took over, contradicting the fail-closed-with-TTL-backstop contract documented one function above',
    find: '  if (!ourEra) return "unknown";',
    replace: "",
  },
  {
    id: "pay-attempt/stale-lock-reads-as-successor",
    file: "apps/qr/lib/pay-attempt.ts",
    suite: "lib/pay-attempt.test.ts",
    why: "M124 \u2014 a lock past CART_LOCK_TTL_MS is not a live successor: `acquireCartLock`'s own staleness disjunct would let anyone take it over, so nobody is mid-checkout behind it. Counting it as supersession blocks a diner from editing a cart the server itself considers free \u2014 over-blocking, which this repo has paid for as dearly as under-blocking",
    find: '  if (nowMs - at >= ttlMs) return "not_held";',
    replace: "",
  },
  {
    id: "pay-attempt/outage-reported-as-supersession",
    file: "apps/qr/lib/pay-attempt.ts",
    suite: "lib/pay-attempt.test.ts",
    why: 'M124 \u2014 the release has THREE outcomes and the checkout renders a sentence from them, so an outage must never be reported as "another tab took over this checkout" (the fabricated-diagnosis class M116/M119 removed). Testing `released` first answers `released: true` for a driver that reports BOTH a match and an error \u2014 an incoherent result whose only safe reading is "we do not know". Precisely: the ordering does not change the ordinary failed write (count null + error still lands on the error arm either way); it is the both-set case that flips, and an outcome nobody can explain must fail closed rather than confirm a release',
    find: '  if (res.error) return { released: false, reason: "error" };',
    replace: "  if (res.released) return { released: true };",
  },
  {
    id: "pay-attempt/echo-passed-through",
    file: "apps/qr/lib/pay-attempt.ts",
    suite: "lib/pay-attempt.test.ts",
    why: "M124 \u2014 the echoed token must be re-emitted by the SERVER, not passed through. `lock.ts`'s own rule is that every value reaching a PostgREST filter is server-derived; more concretely, `acquireCartLock` stores the millisecond `...000Z` spelling, and an offset spelling of the same instant is a different STRING. Passing the client's spelling through makes the match depend on how the client happened to serialize",
    find: "  return new Date(ms).toISOString();",
    replace: "  return raw;",
  },
  {
    id: "cart/promo-write-ignores-the-pay-lock",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M70 (Codex round 2 P1) \u2014 the `locked || settling` refusal is read at authz time and TWO awaited RPCs run before the write, so a tablemate can take the pay lock and pin the grant inside that window. A write gated only on `status = 'open'` then clears a LIVE attempt's pin: the PaymentIntent was minted under the old code, the webhook re-derives under the new one, and `reconcile_mismatch` lands after the card is charged. The freeze has to be re-tested in the statement that writes",
    find: "    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n",
    replace: "",
  },
  {
    id: "cart/promo-write-ignores-the-settlement-freeze",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M70 \u2014 the split-tender freeze is the OTHER half of the same window, and it is table-wide: every member's cart is frozen while the table pays in turn. Dropping this term lets a promo change land mid-settlement, against holds already authorized under the old code",
    find: "    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)",
    replace: "    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)",
  },
  {
    id: "cart/promo-lock-check-ignores-the-ttl",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M70 \u2014 the OVER-BLOCKING direction, and the one a tightening review invites. A lock is only real while `locked_at` is inside CART_LOCK_TTL (authz.ts:168-175); gating on the bare `locked` column freezes the promo field for five minutes after an abandoned pay screen, on a cart every other surface treats as editable. Over-blocking is as expensive as under-blocking",
    find: "`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`",
    replace: "`locked.eq.false`",
  },
  {
    id: "cart/promo-refusal-fabricates-a-diagnosis",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M116/M119, on a new surface \u2014 three different facts land on the same zero row count (closed \u00b7 a tablemate holds the pay lock \u00b7 the table is settling). Answering `cart_closed` for all three tells a diner whose tablemate is merely mid-checkout that their order is no longer open. The reason has to be READ, not assumed",
    find: "if ((count ?? 0) === 0) return { ok: false, reason: await refusedPromoReason(input.cartId) };",
    replace: 'if ((count ?? 0) === 0) return { ok: false, reason: "cart_closed" };',
  },
  {
    id: "cart/promo-diagnosis-read-swallows-its-error",
    file: "apps/qr/lib/promo-refusal.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M119 \u2014 the diagnosis read's OWN fabricated diagnosis. Unbound, a failed read makes `cart` null, `!cart` true, and the answer `cart_closed`: an outage reaches the diner as a fact about their order. `error` is the honest fourth outcome, and `maybeSingle` is what makes `error` mean exactly one thing",
    find: '  if (error) return "error";\n',
    replace: "",
  },
  {
    id: "reorder/mode-fork-collapses-to-dinein",
    file: "apps/qr/lib/reorder.ts",
    suite: "lib/reorder-mode.test.ts",
    why: "W17a — reorder's session-mode fork is the re-added line's routing TAG and, through it, its tax. Collapsing it taxes every pickup reorder of a COLD dish that CDTFA Reg 1603 exempts to-go",
    find: '          fulfillment: dineIn ? "dinein" : "togo",',
    replace: '          fulfillment: "dinein" as const,',
  },
  // ── W17c-4 — tip transparency: two buckets, never blended ──────────────────────────────────────
  {
    id: "tip-report/shared-pool-credited-to-a-person",
    file: "apps/qr/lib/tip-report.ts",
    suite: "lib/tip-report.test.ts",
    why: "W17c-4 — a tip on an order NOBODY settled (the guest paid on their own phone) has no one to credit. Folding it into a person's column puts money in their name that nobody handed them, on the one screen staff will read as an authoritative statement of what they earned",
    find: "    if (r.settled_by) {",
    replace: "    if (true) {",
  },
  {
    id: "tip-report/self-scope-zeroes-the-shared-pool",
    file: "apps/qr/lib/tip-report.ts",
    suite: "lib/tip-report.test.ts",
    why: "W17c-4 review HIGH — the first version scoped the QUERY, which made a null settled_by structurally impossible for a server: every one of them was shown 'guests tipped $0.00 on their phones' as FACT, under a promise that nothing on the screen is an estimate. A privacy filter had become a lie about money",
    find: "    unattributedCents: report.unattributedCents,\n    unattributedCount: report.unattributedCount,",
    replace: "    unattributedCents: 0,\n    unattributedCount: 0,",
  },
  {
    id: "tip-report/self-headline-includes-the-shared-pool",
    file: "apps/qr/lib/tip-report.ts",
    suite: "lib/tip-report.test.ts",
    why: "W17c-4 — a server's headline is THEIR money. Summing a colleague's or the shared pool's into it tells someone money is theirs that isn't, on the screen they read as a statement of their pay",
    find: "    attributedCents: mineCents,",
    replace: "    attributedCents: report.attributedCents,",
  },
  {
    id: "tip-report/refunded-tip-counted",
    file: "apps/qr/lib/tip-report.ts",
    suite: "lib/tip-report.test.ts",
    why: "W17c-4 — a refunded order's money is not in the drawer and its tip is not in anyone's pocket; counting it overstates what a person earned and it is THEIR pay the number describes",
    find: '    if (r.status !== "paid") continue;',
    replace: "",
  },
  {
    id: "tip-report/negative-tip-deducts",
    file: "apps/qr/lib/tip-report.ts",
    suite: "lib/tip-report.test.ts",
    why: "W17c-4 — the DB CHECK makes a negative tip unreachable through the app, but if one ever lands in the data it must not silently REDUCE someone's column below what they were actually handed",
    find: "    if (tip <= 0) continue;",
    replace: "",
  },
  // ── W17c-3 — the kiosk tip crosses to the counter as an INTENT ─────────────────────────────────
  {
    id: "kiosk-tip/write-not-status-guarded",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/kiosk-tip.test.ts",
    why: "W17c-3 — without `status=open` IN the UPDATE, a settle landing between the authz check and the write repoints the tip a cashier is already counting against; the check above it is a read that can go stale",
    find: '    .eq("id", cartId)\n    .eq("status", "open")\n    .select("id");',
    replace: '    .eq("id", cartId)\n    .select("id");',
  },
  {
    id: "kiosk-tip/blocked-write-reads-as-ok",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/kiosk-tip.test.ts",
    why: 'W17c-3 review MED — `.update()` returns no row count, so the status predicate can correctly BLOCK the write and the action still answers ok, claiming an intent nobody recorded. The same trap applyPromo closes with `.select("id")`',
    find: "  if (!data || data.length === 0) return { ok: false };",
    replace: "",
  },
  {
    id: "kiosk-tip/movable-while-settling",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/kiosk-tip.test.ts",
    why: "W17c-3 — a tip that can move while the cart is locked or settling changes the number under a cashier mid-count, or under a diner mid-card-payment",
    find: "    if (authz.locked || authz.settling) return { ok: false };",
    replace: "",
  },
  // ── W17c-2 — the cash tip: the one figure on the money path a human supplies ────────────────────
  {
    id: "cash-tip/not-recorded",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/cash-tip.test.ts",
    why: "W17c-2 — reverting the tip to a hardcoded 0 puts cash tips back off the books: the drawer no longer reconciles against the day summary by exactly the tips taken, and nobody can answer what the team was tipped",
    find: "      p_tip_cents: tipCents,",
    replace: "      p_tip_cents: 0,",
  },
  {
    id: "track/breakdown-drops-the-tip",
    file: "apps/qr/lib/track-order.ts",
    suite: "lib/track-order.test.ts",
    why: "W22r — the /track slip renders the order's breakdown VERBATIM through one shared mapper (three read paths depend on it). Zeroing a carried cent field renders a receipt that disagrees with the charge while every other suite stays green — the exact silent-drift class the shared shape exists to kill",
    find: "      tipCents: data.tip_cents ?? 0,",
    replace: "      tipCents: 0,",
  },
  {
    id: "cash-tip/collected-total-drops-the-tip",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/cash-tip.test.ts",
    why: "W17c-2→W21d — the collected amount is read back from the PERSISTED order row (a raced duplicate settle early-returns the FIRST order without this request's tip; echoing request arithmetic quotes money the ledger never recorded). Ignoring the row resurrects exactly that echo — the change helper, tab-close audit row and analytics quote a figure qr_orders doesn't hold",
    find: "    const collectedCents = orderRow?.total_cents ?? totals.totalCents + tipCents;",
    replace: "    const collectedCents = totals.totalCents + tipCents;",
  },
  {
    id: "cash-tip/counted-as-extra-drawer-money",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "W17c-2 — the RPC folds the tip INTO the order total, so cashCents already contains it. Adding it again overstates the drawer by exactly the tips and sends a cashier hunting for money that was never missing",
    find: "      s.cashTipCents += r.tip_cents ?? 0;",
    replace: "      s.cashCents += r.tip_cents ?? 0;\n      s.cashTipCents += r.tip_cents ?? 0;",
  },
  // ── W17c — the tip ask (a chip's label is a promise about what the server will charge) ──────────
  {
    id: "tip/preset-over-the-server-cap-offered",
    file: "apps/qr/lib/tip.ts",
    suite: "lib/tip.test.ts",
    why: "W17c — a chip whose rate exceeds the SPLIT path's 0.5 ceiling (qr_cart_shares.tip_rate CHECK) 400s the share mint: the diner taps a tip and the payment fails, which reads as a broken app rather than a bound. Today's 15/20/30 ladder clears it, so this guards whoever changes the ladder next",
    find: "    .filter((p) => p.rate <= TIP_RATE_MAX);",
    replace: "    ;",
  },
  {
    id: "tip/house-ladder-drifts",
    file: "apps/qr/lib/tip.ts",
    suite: "lib/tip.test.ts",
    why: "W17c-3 — the ladder is the OWNER'S (15/20/30, 2026-08-16). A drifted rate silently changes what every guest is asked for on every surface, and the chip keeps its old label while charging the new number",
    find: "export const TIP_LADDER = [0.15, 0.2, 0.3] as const;",
    replace: "export const TIP_LADDER = [0.15, 0.2, 0.25] as const;",
  },
  // (W18: the three round-up mutants retired WITH their feature — owner: "never capped or round
  //  up". The frozen-rate lesson they guarded is recorded in CLAUDE.md's money-path rules.)
  {
    id: "tip/amount-cap-dropped",
    file: "apps/qr/lib/tip.ts",
    suite: "lib/tip.test.ts",
    why: "W19 — the custom tip's only remaining ceiling is the $1,000 amount gate create-intent runs on the derived cents (the schema rate bound is just a transport rail). Dropping it lets a hostile/raw POST mint an arbitrarily large PaymentIntent through the tip field — the exact vector the old 1.0 rate cap existed to close",
    find: "  return tipCents <= TIP_AMOUNT_MAX_CENTS;",
    replace: "  return true;",
  },
  // ── W21 — the pickup contact gate (a refusal rule on the charge boundary) ───────────────────────
  {
    id: "pickup-contact/digit-floor-dropped",
    file: "apps/qr/lib/pickup-contact.ts",
    suite: "lib/pickup-contact.test.ts",
    why: "W21 — the phone SHAPE alone accepts '-------' (7 separator chars, 0 digits); the digit floor is what makes the required field a real contact instead of a keyboard mash. Watched red before registration.",
    find: "  return (p.match(/[0-9]/g) ?? []).length >= 7;",
    replace: "  return true;",
  },
  // ── W23c — the authorization window: capture what was made, cancel the rest (registry M69) ─────
  {
    id: "manual-capture/partial-becomes-full",
    file: "apps/qr/lib/manual-capture.ts",
    suite: "lib/manual-capture.test.ts",
    why: "W23c — the reduced total IS the charge. Capturing the authorization instead bills a pickup guest in full for a basket the kitchen could not fill, and then needs the refund this whole track exists to avoid — with the money already gone and only the slow remedy left.",
    find: "    amountCents: liveTotalCents,",
    replace: "    amountCents: authorizedCents,",
  },
  {
    id: "manual-capture/nothing-left-still-charges",
    file: "apps/qr/lib/manual-capture.ts",
    suite: "lib/manual-capture.test.ts",
    why: "W23c — when NOTHING survives, the hold must be cancelled rather than captured: a cancelled authorization leaves no trace on the guest's statement, while a capture-then-refund leaves 'we took your money and gave it back' and a week of waiting. Dropping the arm charges for an order with no food in it at all.",
    find: '  if (liveTotalCents <= 0) return { action: "cancel", reason: "nothing_left" };',
    replace: '  if (false) return { action: "cancel", reason: "nothing_left" };',
  },
  {
    id: "manual-capture/over-authorized-clamps-instead-of-refusing",
    file: "apps/qr/lib/manual-capture.ts",
    suite: "lib/manual-capture.test.ts",
    why: "W23c — a live total ABOVE the hold means the basket moved in a way this path does not model. Clamping to the authorization charges a number nobody derived and hides the discrepancy; Stripe would reject an over-capture anyway, so the choice is between a decision with a reason and an unexplained API error on a money path.",
    find: '  if (liveTotalCents > authorizedCents) return { action: "cancel", reason: "over_authorized" };',
    replace: "  liveTotalCents = Math.min(liveTotalCents, authorizedCents);",
  },
  {
    id: "manual-capture/mode-widens-past-pickup",
    file: "apps/qr/lib/manual-capture.ts",
    suite: "lib/manual-capture.test.ts",
    why: "W23c — pickup is the one mode where the guest pays before the food exists. Widening to dine-in puts a hold on a table that already settles after the meal, and to scan-and-go puts one on goods the shopper is standing there holding — both are worse service bought with no risk removed.",
    find: '  return mode === "pickup";',
    replace: '  return mode !== "dinein";',
  },
  {
    id: "manual-capture-run/captures-on-unreadable-void",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c — the availability read has just said the kitchen cannot fill this basket, and the void that would remove those lines failed. Capturing anyway bills the FULL hold for food that does not exist — the exact charge this path was built to prevent — where leaving the authorization standing costs nothing and lets Stripe redeliver.",
    find: '    return { kind: "retry", note: "precheck failed" };',
    replace: '    console.error("[manual-capture] proceeding despite precheck failure");',
  },
  {
    id: "manual-capture-run/totals-read-before-the-void",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c — the ORDER is the money rule. A total re-derived before the voids still contains the dish the kitchen ran out of, so the capture charges for it and the whole slice silently reverts to the behaviour it replaced. Re-running the read afterwards is what makes the tip recompute against the reduced base too.",
    find: "  const gone = read.lines;",
    replace: "  const gone = [] as typeof read.lines;",
  },
  {
    id: "manual-capture-run/unreadable-catalog-reads-as-available",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex #203 P1) — the pre-mint gate fails OPEN on purpose, because blocking every diner on a catalog blip is worse than a rare refund. Here that same silence captures the FULL hold for a basket that may hold a dish nobody can make. A failure must never read as empty; retrying costs nothing, since the authorization stands untouched.",
    find: '  if (!read.ok) return { kind: "retry", note: "catalog unreadable" };',
    replace: '  if (false) return { kind: "retry", note: "catalog unreadable" };',
  },
  {
    id: "manual-capture-run/precheck-skipped-when-nothing-to-void",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex #203 P1) — the precheck IS the proof that the cart is still open and this payer still holds its lock, and a hold can outlive its basket whether or not a dish ran out. Running it only when there is something to drop leaves the ordinary all-available capture with no check at all: a stale lock taken over by another payer, or a cart settled by cash out of band, would still be captured.",
    find: "    p_menu_ids: gone.map((g) => g.id),",
    replace: "    p_menu_ids: [],",
  },
  {
    id: "manual-capture-run/attempt-era-not-carried",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex #204 round 2) — `acquireCartLock` lets the SAME diner reacquire, so a re-checkout (a different tip, say) puts a second authorization over one cart while the FIRST one's webhook still names a valid lock holder. The attempt stamp is the only thing separating the eras; without it the older hold captures its own amount and tip against the successor attempt's basket.",
    find: "    p_attempt: orNull(attempt),\n    // W23d",
    replace: '    p_attempt: "" as unknown as string,\n    // W23d',
  },
  {
    id: "manual-capture-run/failed-cancel-acknowledged",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex round 2) — a swallowed cancel ends the event forever with the hold still standing, tying up the guest's available funds for days on a card they may need, for an order they are not getting. Cancellation is idempotent and no money has moved, so retrying is free; acknowledging is the only irreversible choice available here.",
    find: '    if (!(await cancelHold(intentId, plan.reason))) return { kind: "retry", note: "cancel failed" };',
    replace: "    await cancelHold(intentId, plan.reason);",
  },
  {
    id: "manual-capture-run/lock-released-on-lost-lock",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex round 2) — the lock-lost branch must NOT release: that lock belongs to another payer's live settlement now, and clearing it would unfreeze a cart mid-payment for somebody else. Releasing on outcomes we own is right; releasing on this one hands another diner's basket to whoever asks next.",
    find: '    return { kind: "canceled", reason: "lock lost to another payer" };',
    replace:
      '    await releaseOurLock(cartId, payerUid);\n    return { kind: "canceled", reason: "lock lost to another payer" };',
  },
  {
    id: "manual-capture-run/redelivery-recaptures",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c — Stripe redelivers for 72h, and the event body is a snapshot of a moment that may already be spent. Without the live status guard a second delivery re-voids a basket whose money has already moved, and tries to capture an intent that is no longer capturable.",
    find: '  if (live.status !== "requires_capture")',
    replace: "  if (false)",
  },
  // ── W23d — telling the diner what the settlement dropped (registry M71) ────────────────────────
  {
    id: "manual-capture-run/cancels-without-recording-why",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: 'W23d — the ORDER between the verdict and the Stripe cancel is the rule. A failed cancel is retryable (the intent is still requires_capture); a lost verdict is not, because the moment the hold is cancelled every redelivery short-circuits on the live-status guard and the write never runs again. Cancel-then-mark therefore strands the guest on "your payment is safe, show this screen to staff" — for a hold nobody took — on one transient DB failure.',
    find: '    if (!(await markCanceled(intentId, cartId, plan.reason, payerUid, attempt)))\n      return { kind: "retry", note: "verdict not recorded" };\n    if (!(await cancelHold(intentId, plan.reason))) return { kind: "retry", note: "cancel failed" };',
    replace:
      '    if (!(await cancelHold(intentId, plan.reason))) return { kind: "retry", note: "cancel failed" };\n    if (!(await markCanceled(intentId, cartId, plan.reason, payerUid, attempt)))\n      return { kind: "retry", note: "verdict not recorded" };',
  },
  {
    id: "manual-capture-run/drop-not-attributed-to-its-attempt",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: 'W23d — without the intent on each dropped row the fulfillment snapshot can only join on cart_id, and a cancelled all-dropped attempt deliberately leaves its cart OPEN. The guest re-orders into that same cart, pays, and their new receipt, email, /account card and /track slip all print "sold out before we could make it" about dishes the order never contained — a fabricated fact on a durable money artifact.',
    // Anchored on the closing `});` so it names the PRECHECK call: `markCanceled` passes the same
    // parameter name a few lines down, and an ambiguous pattern is a STALE mutant, not a skip.
    find: "    p_intent: intentId,\n  });",
    replace: "    p_intent: null as unknown as string,\n  });",
  },
  {
    id: "manual-capture-run/every-cancel-blamed-on-a-shortage",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23d — the four cancel arms are four different events, and the copy for each is only correct for its own. Recording them all as `nothing_left` tells a guest whose promo lapsed (registry M70, lines still available) that everything they ordered sold out — a fabricated explanation on the one screen they read to find out where their money went.",
    find: '    if (!(await markCanceled(intentId, cartId, "cart_not_open", payerUid, attempt)))',
    replace: '    if (!(await markCanceled(intentId, cartId, "nothing_left", payerUid, attempt)))',
  },
  {
    id: "manual-capture-run/recorded-cancellation-still-captures",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: 'W23d (Codex #205 P1) — the durability rule writes the verdict BEFORE the Stripe cancel, so a failed cancel leaves a row saying "no payment was taken" over an intent that is still capturable, with the diner already reading that sentence. Re-deriving a plan on the redelivery can answer CAPTURE — `over_authorized` fires when the live total outgrew the hold, and a staff price edit between deliveries brings it back under. A recorded cancellation has to be TERMINAL for the intent, or the durability rule manufactures the exact claim it was meant to make honest.',
    find: "  if (prior) {",
    replace: "  if (false) {",
  },
  {
    id: "manual-capture-run/unreadable-ledger-reads-as-no-cancellation",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: 'W23d — an unreadable cancellation ledger is not "no cancellation". Treating it as absence lets a blip re-open the capture path on an intent this app has already told the guest was not charged. Retrying costs nothing; the authorization stands untouched until Stripe redelivers.',
    find: '    return { kind: "retry", note: "cancellation ledger unreadable" };',
    replace: "    /* proceed as if no cancellation were recorded */",
  },
  {
    id: "manual-capture-run/superseded-retry-clears-another-lock",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23d — the resume path inherits the -2 arm's asymmetry: a `superseded` verdict means the lock belongs to a LATER attempt, and releasing it here would unfreeze a cart mid-payment for somebody else. The first pass gets this right; the retry has to as well, or the bug simply moves to the redelivery.",
    find: '    if (prior.reason !== "superseded") await releaseOurLock(cartId, payerUid);',
    replace: "    await releaseOurLock(cartId, payerUid);",
  },
  {
    id: "dropped-view/cartless-cancel-invents-an-explanation",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: "W23d (Codex #205 round 2) — the cartless branch cancels a hold for a reason the app cannot describe: the authorization arrived with no basket. It shares the unknown-code copy deliberately, because inventing a distinct explanation for a state whose whole problem is missing information is the fabrication this module refuses everywhere else. Splitting them means writing a sentence nothing can verify.",
    find: '    case "no_cart":\n    default:',
    replace:
      '    case "no_cart":\n      return { heading: "Your order was not found", body: "We could not match this payment to an order, so we stopped." };\n    default:',
  },
  {
    id: "dropped-view/timed-out-screen-claims-a-completed-payment",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: 'W23d (adversarial review, HIGH) — every give-up arm on the tracker, visible and spoken, leads with a completed payment ("Your payment went through", "Your payment is safe"). Under manual capture that is false until the order lands, and PaySuccess beside them now says the card is only authorized — so leaving these alone put two contradictory money claims on ONE screen. The claim is named once here precisely so a future edit to either sentence cannot drift from the state it describes.',
    find: '  return notYetCharged ? "Your card is authorized, not charged yet" : "Your payment went through";',
    replace: '  return "Your payment went through";',
  },
  {
    id: "dropped-view/zero-total-claims-everything-sold-out",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: 'W23d (Codex #205 round 2) — `nothing_left` is `liveTotalCents <= 0`, NOT "every line was voided". A promo or reward clamped to the remaining subtotal can zero a basket that still has dishes on it, with OR without a shortage — and the snapshot carries only what was REMOVED, never how many lines the order started with, so "everything sold out" is a claim this module can never verify in any branch. The shortage is still told, by the dropped list\'s own count heading, which states exactly what is known.',
    find: '        heading: "There was nothing left to charge for",',
    replace: '        heading: "Everything on your order sold out",',
  },
  {
    id: "dropped-view/closed-cart-claimed-as-settled",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: "W23d (adversarial review, HIGH) — the precheck answers -1 for ANY non-open cart, and `qr_carts.status` is ('open','paid','cancelled') — every merge/void path writes 'cancelled'. Asserting the settled reading alone tells a guest whose order was CANCELLED that it \"went through another way\", pointing them at a receipt for an order that does not exist, on the one screen they opened to find out where their money went.",
    find: '        heading: "This order was already closed",',
    replace: '        heading: "This order was already settled",',
  },
  {
    id: "dropped-view/superseded-claims-a-successor-payment",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: 'W23d (Codex #205 P2) — `superseded` proves only that the cart\'s lock no longer matches this attempt, which also covers a released lock, a takeover by another payer, and a newer checkout that was abandoned. Telling the guest their order "was paid for again" asserts an order that may never have been placed — the same fabricated-explanation defect as blaming a shortage on the over_authorized arm.',
    find: '        heading: "This payment was replaced",',
    replace: '        heading: "A newer payment took over — we kept it",',
  },
  {
    id: "dropped-view/cancelled-screen-promises-updates",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: 'W23d — the tracker\'s trailing helper paragraph defaults to "Status updates here as the kitchen works on it — keep this open", and with no order every predicate above it is false. That string sat directly under a card saying the payment was cancelled. The replacement lives in this module precisely so the rule (promise no update, name no control that is not on the screen) has a test the component could never carry.',
    find: '  "Nothing else will happen on this screen — there’s no order to follow. Start a new one whenever you’re ready.";',
    replace:
      '  "Status updates here as the kitchen works on it — keep this open, or use Refresh above.";',
  },
  {
    id: "dropped-view/corrupt-snapshot-reads-as-nothing-dropped",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: 'W23d — `count` comes from the RAW array length so a malformed element degrades to "2 dishes sold out" rather than to silence. Counting only the well-formed lines makes a corrupt snapshot indistinguishable from an order where nothing happened, which is exactly the false claim this slice removes. Same rule as availability-read\'s outcome, one layer in: a failure must never read as empty.',
    find: "  return { count: raw.length, lines };",
    replace: "  return { count: lines.length, lines };",
  },
  {
    id: "dropped-view/lapsed-promo-blamed-on-a-shortage",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: "W23d — the `over_authorized` arm fires with the lines still AVAILABLE (mms_promo_discount drops a promotion on `valid_until`, purely on time). Giving it the shortage copy states a reason that is affirmatively false, on a money surface, in the case a guest is most likely to query.",
    find: '        heading: "Your total changed before we could take it",',
    replace: '        heading: "Everything on your order sold out",',
  },
  {
    id: "dropped-view/unknown-reason-reaches-the-guest-raw",
    file: "apps/qr/lib/dropped-view.ts",
    suite: "lib/dropped-view.test.ts",
    why: "W23d — the allowlist is what stops the first reason someone adds on the SQL side reaching a diner as raw column text. Passing the value straight through makes the copy layer trust a database string it has never seen.",
    find: '  return KNOWN_REASONS.has(raw as SettleCancelReason) ? (raw as SettleCancelReason) : "unknown";',
    replace: "  return raw as SettleCancelReason;",
  },
  {
    id: "dropped-read/failed-read-reads-as-no-cancellation",
    file: "apps/qr/lib/dropped-read.ts",
    suite: "lib/dropped-read.test.ts",
    why: 'W23d — `error` and `undecided` both mean "the tracker says nothing new", so only the OUTCOME separates them. Collapsing a failed read into `undecided` lets a transient blip stand in for an answer on the one screen that decides whether a guest is told their money moved.',
    find: '    return { state: "error" };',
    replace: '    return { state: "undecided" };',
  },
  {
    id: "dropped-read/verdict-not-scoped-to-the-caller",
    file: "apps/qr/lib/dropped-read.ts",
    suite: "lib/dropped-read.test.ts",
    why: "W23d — `payer_uid = p_uid` IS the authorization; the PaymentIntent id is a lookup, never a credential. Passing a different value hands the verdict for somebody else's hold to whoever holds the URL.",
    find: "    p_uid: uid,",
    replace: '    p_uid: "",',
  },
  {
    id: "manual-capture-mode/flag-off-still-reads-the-cart",
    file: "apps/qr/lib/manual-capture-mode.ts",
    suite: "lib/manual-capture-mode.test.ts",
    why: "W23d — the flag check comes FIRST so /track costs exactly what it costs today while PICKUP_MANUAL_CAPTURE is dark. Reading first and checking afterwards still answers false, so nothing but the call count can catch it — and it puts a database round-trip on the hottest post-payment page for every diner, for a feature nobody has enabled.",
    find: '  if (process.env.PICKUP_MANUAL_CAPTURE !== "1" || !cartId) return false;',
    replace: "  if (!cartId) return false;",
  },
  {
    id: "manual-capture-mode/unreadable-cart-claims-manual-capture",
    file: "apps/qr/lib/manual-capture-mode.ts",
    suite: "lib/manual-capture-mode.test.ts",
    why: 'W23d — this boolean decides whether the arrival screen may say "Paid". FALSE is today\'s behaviour exactly, so failing toward it costs a manual-capture diner a few seconds of premature copy; failing the other way strips the celebration off an automatic-capture payment that really did go through, on every blip.',
    find: '    if (error) console.error("[manual-capture] mode read failed", error.message);\n    return false;',
    replace:
      '    if (error) console.error("[manual-capture] mode read failed", error.message);\n    return true;',
  },
  // ── W22e — what the app is allowed to call "your usual" ───────────────────────────────────────
  {
    id: "your-usual/one-sitting-mistaken-for-a-habit",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: 'W22e — an occurrence is a distinct DAY, not an order. The session mints a fresh cart after every payment, so a second dine-in round or a forgotten drink is a second order id an hour later — counting orders crowns a dish after ONE sitting, which is exactly the claim `ArrivalBeat` is careful to avoid next door ("two orders in one sitting are two orders"). On a personal card it reads far worse than on an aggregate, because the diner knows perfectly well they have only been in once.',
    find: "      seen.days.add(day);",
    replace: "      seen.days.add(row.orderId);",
  },
  {
    id: "your-usual/pair-invented-from-two-separate-habits",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: "W22e — the copy joins two dishes with a `+`, which ASSERTS they were ordered together. If Mohinga rode orders A and B while Tea rode C and D, they are two separate habits and the `+` states a meal that never happened. Dropping the co-occurrence test turns the card into the most confident kind of fabrication: specific, plausible, and about the diner themselves.",
    find: "    if (together >= MIN_DISTINCT_DAYS) {",
    replace: "    if (together >= 0) {",
  },
  {
    id: "your-usual/sold-out-dish-offered-back",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: "W22e — availability is filtered BEFORE ranking for two reasons, and this mutant breaks both. Offering an 86'd dish is the W23a anti-pattern the app already paid for (assemble an order around something gone, meet the refusal at the last tap), and filtering afterwards would ALSO let the sold-out favourite crowd out the runner-up — so the diner gets nothing instead of the dish they could actually have had.",
    find: "    catalog.filter((c) => !c.soldOut && !c.needsChoice).map((c) => [c.id, c]),",
    replace: "    catalog.map((c) => [c.id, c]),",
  },
  {
    id: "your-usual/required-choice-dish-offered-for-one-tap",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: 'W22e (adversarial review, HIGH — this shipped in the first commit). The card adds with NO modifiers, and `priceItem` runs with `enforceCardinality`, which THROWS for any dish holding a `min_select >= 1` group. Seven seeded dishes qualify — including Burmese Milk Tea via its required `drink_temp` group, which made the proposal\'s own canonical example ("Mohinga + Tea") the broken case. The menu row already knows and renders a "Choose" pill instead of Add; dropping this filter offers a one-tap button that cannot work, and the failure surfaces as a misdiagnosed session error.',
    find: "    catalog.filter((c) => !c.soldOut && !c.needsChoice).map((c) => [c.id, c]),",
    replace: "    catalog.filter((c) => !c.needsChoice).map((c) => [c.id, c]),",
  },
  {
    id: "your-usual/restaurant-day-replaced-by-utc-day",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: 'W22e — days are counted in the RESTAURANT\'s timezone. An 8pm dinner in Covina is already tomorrow in UTC, so a UTC day key splits one evening across two days and hands out a "usual" after a single sitting — the very thing counting days instead of orders exists to prevent.',
    find: '  return Number.isNaN(t) ? "" : LA_DAY.format(new Date(t));',
    replace: '  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);',
  },
  {
    id: "your-usual/window-unbounded",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: 'W22e (adversarial review, LOW — a SURVIVING mutant at 3650 days proved this bound was pinned by nothing). The window is what keeps "usual" describing who the diner is NOW rather than who they were last year. It is an honesty bound like the threshold, and it needs the same assertion.',
    find: "export const USUAL_WINDOW_DAYS = 90;",
    replace: "export const USUAL_WINDOW_DAYS = 3650;",
  },
  {
    id: "your-usual/recency-tracks-the-oldest-day",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: 'W22e (adversarial review, LOW — this SURVIVED the first fixture). Rule 3 breaks ties on the most recent order; tracking the oldest silently inverts it to "least recently ordered". The original fixture gave the two dishes DISJOINT date ranges, so min and max produced the same verdict — a degenerate fixture, which is precisely what a surviving mutant means. The ranges now overlap so the two disagree.',
    find: "      if (row.orderedAt > seen.newest) seen.newest = row.orderedAt;",
    replace: "      if (row.orderedAt < seen.newest) seen.newest = row.orderedAt;",
  },
  {
    id: "your-usual/tie-broken-by-database-row-order",
    file: "apps/qr/lib/menu/your-usual.ts",
    suite: "lib/menu/your-usual.test.ts",
    why: "W22e — when two dishes sit at the same count, whichever the database happened to return first is not a preference, it is an accident of row order. Recency is a fact the history actually holds, so it is the tiebreak. (The third rung, name, exists because the first version returned a non-zero value for genuinely equal entries. A comparator MUST answer 0 for equals; returning -1 makes the result implementation-defined — measured on this V8 it REVERSES the input, while a correct 0 preserves insertion order. Either way the order would be a sort artifact rather than a fact, so equal entries now land alphabetically.)",
    find: "        b[1].newest.localeCompare(a[1].newest) ||",
    replace: "        0 ||",
  },
  // ── W22c — what a pulled-down menu is allowed to SAY it found ─────────────────────────────────
  {
    id: "catalog-freshness/failed-read-announced-as-a-sold-out-restaurant",
    file: "apps/qr/lib/catalog-freshness.ts",
    suite: "lib/catalog-freshness.test.ts",
    why: 'W22c — THE rule this module exists for. A failed catalog read yields an EMPTY next snapshot; diffed naively against a full previous one, every dish reads as newly sold out and the pull announces to every diner in the room at once that the whole restaurant has run out. `is_active = true` filtering means an empty catalog could not mean that even if the read had succeeded. The delivery repo\'s "a failure must never read as empty" rule, arriving at a brand-new boundary.',
    find: '  if (next.length === 0 && prev.length > 0) return { state: "unverified" };',
    replace: "",
  },
  {
    id: "catalog-freshness/unproven-refresh-claimed-as-unchanged",
    file: "apps/qr/lib/catalog-freshness.ts",
    suite: "lib/catalog-freshness.test.ts",
    why: 'W22c — `router.refresh()` returns void and cannot report failure, so a render that never landed and a render that landed with nothing new produce the SAME tree. Only the caller\'s stamp separates them. Collapsing the unproven case into `unchanged` turns "we could not reach the menu" into "your menu is up to date" on the one gesture a diner uses when they suspect it is not.',
    find: '  if (!proof.advanced) return { state: "unverified" };',
    replace: '  if (!proof.advanced) return { state: "unchanged" };',
  },
  {
    id: "catalog-freshness/stale-render-treated-as-a-live-read",
    file: "apps/qr/lib/catalog-freshness.ts",
    suite: "lib/catalog-freshness.test.ts",
    why: 'W22c (adversarial review, HIGH — this shipped in the first commit). A RENDER THAT LANDED IS NOT A READ THAT SUCCEEDED. /menu serves a last-good catalog when the live read fails (W10a), and that stale render still advances the render stamp — so `advanced` alone certified a render where the database was never reached, putting the DegradedStrip and a toast reading "Menu is up to date." on screen together. Worse: `readLastGoodCatalog` is per-INSTANCE module state bounded by traffic rather than a TTL, so a refresh landing on another warm instance can serve an OLDER cache than the diner already had and diff it into "Mohinga is back on." about a dish that is still 86\'d — the gesture causing the exact last-tap refusal it exists to prevent.',
    find: '  if (!proof.trusted) return { state: "unverified" };',
    replace: "",
  },
  {
    id: "catalog-freshness/new-dish-announced-as-restocked",
    file: "apps/qr/lib/catalog-freshness.ts",
    suite: "lib/catalog-freshness.test.ts",
    why: "W22c — a dish absent from the previous snapshot was never shown to this diner as sold out, so it cannot have come BACK for them. Treating an unseen id as restocked makes every catalog addition read as good news the diner was waiting for, which is a recognition claim the module has nothing behind.",
    find: "    if (!was) continue; // a NEW dish is not a change the diner was promised anything about",
    replace:
      "    if (!was) {\n      if (!row.soldOut) restocked.push(row.name);\n      continue;\n    }",
  },
  // ── W22f — what the diner's phone is allowed to make a NOISE about ────────────────────────────
  {
    id: "chime/silence-turned-on-by-default",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: 'W22f — the whole opt-in promise, in one comparison. An unset preference must read as OFF: a guest who has never been asked is sitting in a dining room with other people, and a sound cannot be un-played. Loosening the exact-value check to "anything that is not 0" turns every phone that has never touched the setting on.',
    find: '    return store?.getItem(SOUND_KEY) === "1";',
    replace: '    return store?.getItem(SOUND_KEY) !== "0";',
  },
  {
    id: "chime/broken-store-read-as-consent",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: 'W22f — private mode, partitioned storage and a locked-down browser all THROW on read. Failing toward "on" would make the one setting whose entire purpose is consent behave as though consent had been given, on precisely the devices where it could not have been. Same direction the delivery repo\'s "a failure must never read as empty" rule points, applied to a preference.',
    find: "    // A disabled or partitioned store is not consent. Rule 1.\n    return false;",
    replace: "    return true;",
  },
  {
    id: "chime/enabled-collapsed-into-armed",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: "W22f — enabled and armed fail for DIFFERENT reasons and neither implies the other. A diner can have sound on from a previous session while this session's AudioContext was never unlocked (no gesture yet, or the resume was refused). Dropping `armed` does NOT throw — `chime` returns on a null context and its body is wrapped — it schedules notes into a SUSPENDED context, which the browser then plays whenever that context is later resumed: a kitchen bell ringing minutes late, on an unrelated tap, for an order already eaten. A chime out of its moment is worse than silence, which is why this gate is separate. (An earlier version of this `why` claimed a throw; corrected in review.)",
    find: "  return opts.enabled && opts.armed;",
    replace: "  return opts.enabled;",
  },
  {
    id: "chime/diner-phone-as-loud-as-the-kitchen",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: "W22f — 0.8 is the KDS default: a working device on a hot line that a cook must hear across the room. This is someone's phone at a table with other people at it. The level is the difference between a sound the diner hears and a sound their whole table hears, and it is a policy, not a magic number — so it gets an assertion.",
    find: "export const CHIME_LEVEL = 0.22;",
    replace: "export const CHIME_LEVEL = 0.8;",
  },
  {
    id: "chime/pay-rises-instead-of-resolving",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: "W22f — the two moments are ONE phrase across the meal: `sent` lifts G5→C6 and `paid` comes back C6→G5. If pay rises too, the pair stops reading as a beginning and an end and becomes two unrelated beeps — the difference between a restaurant's sound and an app's notification tone.",
    find: "    { freq: 784, at: 0.28, dur: 0.4 }, // G5 — resolves home",
    replace: "    { freq: 1319, at: 0.28, dur: 0.4 }, // E6",
  },
  {
    id: "chime/an-error-moment-grows-back",
    file: "apps/qr/lib/chime.ts",
    suite: "lib/chime.test.ts",
    why: "W22f — rule 3, and the one rule here that a future edit is most likely to break kindly. A sound on failure turns a recoverable, private problem into a public one: the whole table looks over at someone whose card just declined. Errors are read, not heard — the vocabulary is closed at two moments and the test pins the exact key list rather than a count, so an added moment cannot slip in under a rename.",
    find: "  ],\n};\n\nexport type ChimeMoment",
    replace: "  ],\n  error: [{ freq: 440, at: 0, dur: 0.3 }],\n};\n\nexport type ChimeMoment",
  },
  {
    id: "live-order/resume-link-poses-as-a-fresh-payment",
    file: "apps/qr/lib/live-order.ts",
    suite: "lib/live-order.test.ts",
    why: 'W22f (adversarial review, HIGH — this shipped long before W22f and W22f made it audible). Every link this module builds is a RESUME — the live chip, the tray, /account "Today" — but it wears Stripe\'s own `payment_intent` + `redirect_status=succeeded` shape because that is what resolves the tracker. `resume=1` is the ONLY thing separating the two, so dropping it makes /track replay the whole arrival celebration on a tap that moved no money: confetti, the celebrate haptic, "Payment confirmed", and the pay chime — announcing a payment that happened hours earlier. Worse, because the chip is a client-side link the document survives, so the resume was the one path where that chime was reliably audible while the real payment path (a Stripe hard-navigation into a gesture-less document) could not play it at all.',
    find: "&redirect_status=succeeded&resume=1${cart}",
    replace: "&redirect_status=succeeded${cart}",
  },
  {
    id: "order-lines/reassigned-line-absorbs-another-diner-add",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-seat.test.ts",
    why: "M87 (Codex round 2) — the merge key must be the diner who ADDED the line, not only the seat that currently owns it. The split UI reassigns `by_seat` to whoever will pay, so after Ben's dish is moved onto Ana's share, Ana adding the same dish matches Ben's row on `by_seat` and bumps its qty — while the cart trigger pins `added_by` to Ben. Ana's addition then exists nowhere, and a dish she really chose never reaches her history. Failing toward silence rather than a false claim, but silence is the whole feature.",
    find: '    bySeat === null ? siblingQuery.is("added_by", null) : siblingQuery.eq("added_by", bySeat);',
    replace: "    siblingQuery;",
  },
  {
    id: "order-lines/second-add-keeps-the-stale-price",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-seat.test.ts",
    why: "M104 — `priceItem` re-derives the live price on every add, and on the MERGE branch that value was computed and then discarded: `mms_cart_item_inc_qty` carries no price and only bumps qty. So a manager raising a price mid-visit left the diner's second add charged at the first add's snapshot, and a manager LOWERING one charged MORE than the menu was showing. Up to 98 units can ride one stale snapshot (the qty cap), the wrong price freezes verbatim into qr_order_items, and nothing downstream notices because create-intent and the webhook reconcile both derive from the same corrupted row. It also falsifies menu-price.ts's own promise that the new price takes effect on the next add everywhere at once.",
    find: '  siblingQuery = siblingQuery.eq("unit_price_cents", line.unitPriceCents);',
    replace: "  siblingQuery = siblingQuery;",
  },
  // ── W23b — the refund a guest can actually see (registry M2) ───────────────────────────────────
  {
    id: "refund-view/partial-reads-as-paid-in-full",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "W23b — THE shipped defect, in one line. `receiptStatusLabel` took a boolean, a partial refund is a third state, and a boolean cannot hold three: every part-returned order printed 'Paid in full · Card' with every line at full price, on the receipt, the /track slip, the /account card and the emailed copy. Collapsing partial back into 'none' restores exactly that.",
    find: '  if (amount > 0)\n    return { state: "partial", refundedCents: amount, netPaidCents: totalCents - amount };',
    replace:
      '  if (false)\n    return { state: "partial", refundedCents: amount, netPaidCents: totalCents - amount };',
  },
  {
    id: "refund-view/status-refunded-shows-zero-back",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "W23b — a full refund issued from the Stripe DASHBOARD writes no ledger row, and every pre-W23b refund predates the column, so status='refunded' with refunded_cents=0 is a real shape. Reporting '$0.00 came back' on it is a lie in the guest's favour, which is still a lie on a money surface — and the one they would take to their bank.",
    find: "    const shown = Math.max(amount, totalCents);",
    replace: "    const shown = amount;",
  },
  {
    id: "refund-view/zero-order-reads-as-refunded",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "W23b — `amount >= total` is trivially true at 0 >= 0, so without the `total > 0` guard a fully comped $0 table gets a receipt stamped 'Refunded — this charge was returned to you' for a charge that never happened. A comped guest reading that has been told their comp was a refund.",
    find: "  const fullByAmount = totalCents > 0 && amount >= totalCents;",
    replace: "  const fullByAmount = amount >= totalCents;",
  },
  {
    id: "refund-view/full-refund-loses-its-chip",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "W23b (Codex round 2 on #201) — summarizeRefund answers `full` on refunded_cents >= total, which happens BEFORE the charge.refunded webhook flips the status, and /account's history read filters status='paid' — so a WHOLLY returned order legitimately appears in that list in the `full` state. Dropping the full arm restores the collapsed card claiming 'Paid · Card' over money that had entirely gone back, for as long as the webhook was delayed.",
    find: '  if (summary.state === "full") return "Refunded";',
    replace: '  if (false) return "Refunded";',
  },
  {
    id: "refund-view/refund-row-not-negative",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "W23b — every surface renders `negative` as the leading minus. Without it the refunded row reads as ANOTHER charge stacked under the total, which is the precise opposite of what happened, and the 'You paid' row below it then looks like arithmetic that does not add up.",
    find: '    { key: "refunded", label: "Refunded", amountCents: summary.refundedCents, negative: true },',
    replace: '    { key: "refunded", label: "Refunded", amountCents: summary.refundedCents },',
  },
  {
    id: "track-order/refund-not-carried",
    file: "apps/qr/lib/track-order.ts",
    suite: "lib/track-order.test.ts",
    why: "W23b — a partial refund leaves qr_orders.status at 'paid', so refunded_cents is the ONLY signal the live tracker has that money came back. Dropping it here restores the exact bug on the surface a diner is most likely to be looking at when it happens.",
    find: "    refund: summarizeRefund(data.total_cents, data.refunded_cents ?? 0, data.status),",
    replace: "    refund: summarizeRefund(data.total_cents, 0, data.status),",
  },
  {
    id: "track-order/line-refund-not-carried",
    file: "apps/qr/lib/track-order.ts",
    suite: "lib/track-order.test.ts",
    why: "W23b — Stripe knows the charge, not the line; qr_order_items.refunded_cents is the only attribution that exists. Zeroing it leaves a receipt that says money came back but cannot say for WHICH dish, which is the question the guest asks first.",
    find: "      refundedCents: it.refunded_cents ?? 0,",
    replace: "      refundedCents: 0,",
  },
  // ── W23a — the 86 gate: the only thing between an unavailable dish and a charge ─────────────────
  {
    id: "availability/delisted-item-still-sellable",
    file: "apps/qr/lib/availability.ts",
    suite: "lib/availability.test.ts",
    why: "W23a — the diner menu filters is_active at QUERY time, which is a fact about a page that may be minutes old; without the server-side half a stale phone (or a forged POST) pays for a dish that was pulled from the menu. Drops the delisted arm from the ONE sellability predicate, so BOTH halves of the gate (add-time and charge-time) go blind at once — which is exactly why it is one function.",
    find: "  return !i.is_sold_out && i.is_active;",
    replace: "  return !i.is_sold_out;",
  },
  {
    id: "availability/gate-widens-past-draft",
    file: "apps/qr/lib/availability.ts",
    suite: "lib/availability.test.ts",
    why: "W23a — `permissions.ts` lets a diner mutate a DRAFT line and nothing else, so blocking a fired/served line tells a dine-in table to 'remove it to keep going' about a line they cannot remove: a table that just ATE the last portion could not pay at all, with no remedy on the screen. It is also the wrong question — a fired line is already made, so the 86 does not threaten it.",
    find: '    (l) => l.state === "draft" && l.menu_item_id != null && FOOD_FULFILLMENTS.has(l.fulfillment),',
    replace:
      '    (l) => l.state !== "voided" && l.menu_item_id != null && FOOD_FULFILLMENTS.has(l.fulfillment),',
  },
  {
    id: "availability/missing-catalog-row-slips",
    file: "apps/qr/lib/availability.ts",
    suite: "lib/availability.test.ts",
    why: "W23a — `qr_cart_items.menu_item_id` is a SOFT ref (text, no FK), so a deleted menu row leaves a dangling line pointing at a dish that cannot be made. Treating 'no catalog row' as sellable is the same failure as treating a failed read as empty: absence answers 'fine' when it means 'unknown'.",
    find: "    if (sellable.has(id) || seen.has(id)) continue;",
    replace: "    if (!catalogName.has(id) || sellable.has(id) || seen.has(id)) continue;",
  },
  {
    id: "availability/grocery-blocked-like-food",
    file: "apps/qr/lib/availability.ts",
    suite: "lib/availability.test.ts",
    why: "W23a — grocery is self-scanned and already in the shopper's hands; blocking a paid basket because a grocery SKU carries a sold-out flag refuses money for goods the shopper is physically holding",
    find: 'const FOOD_FULFILLMENTS = new Set(["dinein", "togo"]);',
    replace: 'const FOOD_FULFILLMENTS = new Set(["dinein", "togo", "grocery"]);',
  },
  {
    id: "order-lines/sold-out-item-still-priced",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-availability.test.ts",
    why: "W23a — `priceItem` is the ONE place a unit price is minted (diner add, staff add, kiosk, reorder), so it is the one place every add path can be refused. Without it a diner assembles a whole order around a dish the kitchen already said no to, and only meets the refusal at the Pay button — the worst moment to learn it.",
    find: "  if (!itemSellable(item))",
    replace: "  if (false)",
  },
  {
    id: "menu-availability/role-floor-drops-away",
    file: "apps/qr/lib/menu-availability.ts",
    suite: "lib/menu-availability.test.ts",
    why: "W23a — a Server Action is a public POST endpoint and the console's UI gating is cosmetic; without the staff floor any signed-in diner could take every dish off the menu, which is a denial-of-service on the whole night's revenue",
    find: 'const gate = await staffGate("server", AVAILABILITY_OUTAGE);',
    replace: 'const gate = { ok: true, caller: { staffId: "anon" } } as const;',
  },
  {
    id: "menu-availability/stamp-outlives-its-flag",
    file: "apps/qr/lib/menu-availability.ts",
    suite: "lib/menu-availability.test.ts",
    why: "W23a — the owner chose a MANUAL 86 lifetime, so `sold_out_at` is the only signal a flag has outlived its shift; leaving the old timestamp on the way back to available makes an available dish read 'sold out since 6:40pm' forever",
    find: "      sold_out_at: soldOut ? at : null,",
    replace: "      sold_out_at: at,",
  },
  {
    id: "menu-availability/ledger-time-drifts-from-stamp",
    file: "apps/qr/lib/menu-availability.ts",
    suite: "lib/menu-availability.test.ts",
    why: "W23a — the owner chose a MANUAL 86 lifetime, so `sold_out_at` is the only signal a flag has outlived its shift and the ledger is the only account of who set it. Minting a second clock for the ledger row lets the two disagree about when the cook decided, which is the drift the 'name it ONCE' rule exists to stop.",
    find: "    changed_at: at,",
    replace: "    changed_at: new Date(Date.now() + 60_000).toISOString(),",
  },
  {
    id: "menu-availability/zero-row-flip-reads-as-success",
    file: "apps/qr/lib/menu-availability.ts",
    suite: "lib/menu-availability.test.ts",
    why: 'W23a — `.update()` returns no row count, so without the `.select("id")` verdict a flip that matched NOTHING answers ok: the cook is told the dish is off, diners keep ordering it, and the ledger records a decision that never landed',
    find: "  if (!written) {",
    replace: "  if (false) {",
  },
  // ── W17b — the price editor: the ONE human-entered amount in the app ────────────────────────────
  {
    id: "menu-price/role-floor-drops-to-server",
    file: "apps/qr/lib/menu-price.ts",
    suite: "lib/menu-price.test.ts",
    why: "W17b — the console's UI gating is cosmetic; a Server Action is a public POST endpoint. Dropping the floor to the default lets any signed-in server (or a forged POST from one) reprice the menu every future guest pays",
    find: 'const gate = await staffGate("manager", PRICE_OUTAGE);',
    replace: "const gate = await staffGate();",
  },
  {
    id: "menu-price/zero-row-update-reads-as-success",
    file: "apps/qr/lib/menu-price.ts",
    suite: "lib/menu-price.test.ts",
    why: 'W17b — `.update()` returns no row count, so without the `.select("id")` verdict a write that matched NOTHING answers ok: the manager is told the price changed, the guests keep paying the old one, and the ledger records a change that never happened',
    find: "  if (!written) {",
    replace: "  if (false) {",
  },
  {
    id: "menu-price/transport-failure-reads-as-missing-dish",
    file: "apps/qr/lib/menu-price.ts",
    suite: "lib/menu-price.test.ts",
    why: "W17b — postgrest-js RESOLVES a transport failure into { data: null, error }, so skipping the error branch turns a network blip into the confident verdict 'that dish is no longer on the menu' about a dish that is right there",
    find: '  if (readErr) {\n    console.error("[menu-price] read failed", readErr.message);\n    return { ok: false, error: PRICE_OUTAGE };\n  }',
    replace: "",
  },
  {
    id: "menu-price/price-write-not-compare-and-swapped",
    file: "apps/qr/lib/menu-price.ts",
    suite: "lib/menu-price.test.ts",
    why: "W17b review MED — keyed on id alone, two managers on two tablets both land their write and the SECOND records a ledger row saying it changed the price FROM a value that was already gone. The live price is still whoever wrote last; the LEDGER is what breaks, and reconstructing 'from what?' is the only reason it exists",
    find: '    .eq("base_price_cents", before.base_price_cents)',
    replace: "",
  },
  {
    id: "menu-price/unrecorded-change-swallowed",
    file: "apps/qr/lib/menu-price.ts",
    suite: "lib/menu-price.test.ts",
    why: "W17b — a price change with no record of who made it is the one thing the ledger exists to prevent; swallowing the insert error hands back a clean success and the manager walks away believing their name is in the log",
    find: "  if (auditErr) {",
    replace: "  if (false) {",
  },
  // ── M3 — faithful reorder (option ids beside the labels) ────────────────────────────────────────
  {
    id: "order-lines/option-ids-not-threaded",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-options.test.ts",
    why: "a dropped p_option_ids quietly ships label-only lines forever — reorder degrades to the base dish with no visible failure",
    find: "...(line.optionIds && line.optionIds.length ? { p_option_ids: line.optionIds } : {}),",
    replace: "",
  },
  {
    id: "reorder/stored-ids-ignored",
    file: "apps/qr/lib/reorder-options.ts",
    suite: "lib/reorder-options.test.ts",
    why: "reading every historical line as id-less kills the faithful path entirely — every reorder silently regresses to the base-dish guess",
    find: 'return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];',
    replace: "return [];",
  },
  {
    id: "reorder/vanished-option-silent",
    file: "apps/qr/lib/reorder-options.ts",
    suite: "lib/reorder-options.test.ts",
    why: "a vanished option must be DISCLOSED — a partial dish reported as faithful lets the diner assume their usual arrived",
    find: "return honoredCount < storedCount;",
    replace: "return false;",
  },
  {
    // M3 review MED-2 — the docstring promised this mutant; without it, "simplifying" the legacy
    // branch to `false` survives the battery and every pre-M3 order's base-dish fallback goes
    // undisclosed.
    id: "reorder/legacy-reset-lost",
    file: "apps/qr/lib/reorder-options.ts",
    suite: "lib/reorder-options.test.ts",
    why: "a labels-only legacy line returns as the BASE dish — dropping its disclosure tells the diner their usual arrived",
    find: "if (storedCount === 0) return originalHadOptionLabels;",
    replace: "if (storedCount === 0) return false;",
  },
  {
    id: "reorder-notes/truncate-instead-of-drop",
    file: "apps/qr/lib/reorder-notes.ts",
    suite: "lib/reorder-notes.test.ts",
    why: "a cut allergy list reads as complete and is not — over-cap notes DROP, never truncate",
    find: "if (s.length > NOTES_MAX) return { carry: false, dropped: true };",
    replace: "if (s.length > NOTES_MAX) return { carry: true, note: s.slice(0, NOTES_MAX) };",
  },
  {
    // A DIFFERENT rule from the one above — the earlier pair shared a `find`, so the second killed on
    // the same assertion and proved nothing extra. This one guards the trim-before-measure order: with
    // it reversed, trailing whitespace alone pushes a valid note over the cap and silently drops it.
    id: "reorder-notes/measure-before-trim",
    file: "apps/qr/lib/reorder-notes.ts",
    suite: "lib/reorder-notes.test.ts",
    why: "trailing spaces must not push a within-cap allergy note over the limit",
    find: 'const s = typeof raw === "string" ? raw.trim() : "";',
    replace: 'const s = typeof raw === "string" ? raw : "";',
  },
  // ── the charge authority's honesty (W10c/M30) ───────────────────────────────────────────────────
  // Not arithmetic: these pin that the totals engine REFUSES to answer when a read failed. postgrest
  // resolves a network failure to `{ data: null, error }`, so dropping either throw doesn't crash —
  // it silently returns a confident wrong number on the money path.
  {
    id: "totals/unreadable-cart-as-empty",
    file: "apps/qr/lib/totals.ts",
    suite: "lib/totals.test.ts",
    why: "an unreadable cart must never be priced as an EMPTY cart (zeros into the webhook's tamper check)",
    find: "if (rowsError) throw new Error(`getCartTotals: cart items unreadable — ${rowsError.message}`);",
    replace: "if (false && rowsError) throw new Error('unreachable');",
  },
  {
    id: "totals/unreadable-discount-as-zero",
    file: "apps/qr/lib/totals.ts",
    suite: "lib/totals.test.ts",
    why: "an unreadable promo discount must never fall back to 0 — that overcharges the diner by the discount they can see",
    find: "  if (discountError)\n    throw new Error(`getCartTotals: promo discount unreadable — ${discountError.message}`);",
    replace: "  if (false && discountError) throw new Error('unreachable');",
  },
  {
    id: "totals/unreadable-reward-as-zero",
    file: "apps/qr/lib/totals.ts",
    suite: "lib/totals.test.ts",
    why: "the third money rule needs its own mutant — an unreadable reward coupon is not a zero reward",
    find: "  if (rewardError)\n    throw new Error(`getCartTotals: reward discount unreadable — ${rewardError.message}`);",
    replace: "  if (false && rewardError) throw new Error('unreachable');",
  },
  {
    id: "split-settle/authorized-cannot-follow-failed",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "a declined share must be able to come back — pending-only leaves a LIVE hold on a share the board calls declined, and capture gated forever",
    find: '    .in("status", ["pending", "failed"])\n    .select("id");',
    replace: '    .eq("status", "pending")\n    .select("id");',
  },
  {
    id: "split/abort-cancels-only-authorized",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "M40 — a share's ROW STATUS is not its PaymentIntent's status; skipping pending/failed/canceled abandons a live hold on a diner's card for the ~7-day authorization window, one line before the row that names it is deleted",
    find: 'if (!s.stripe_payment_intent_id || s.status === "captured") continue;',
    replace: 'if (!s.stripe_payment_intent_id || s.status !== "authorized") continue;',
  },
  {
    id: "split/abort-delete-error-swallowed",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "postgrest resolves a transport failure into { data: null, error } — an unchecked ledger DELETE reports a clean abort over rows that still exist and whose holds were just cancelled",
    find: '    console.error("[split] abort ledger delete failed", deleteErr);\n    throw new Error(',
    replace:
      '    console.error("[split] abort ledger delete failed", deleteErr);\n    void String(',
  },
  {
    id: "split/abort-captured-ignores-the-payment-intent",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "a $0 by-person seat is auto-settled to captured with a NULL PI — reading status alone lets that sentinel impersonate taken money and permanently refuses abort, re-open, cash-settle and clear-table",
    find: "  if ((shares ?? []).some((s) => s.capture_started_at != null)) {",
    replace: "  if (false) {",
  },
  {
    id: "split/abort-skips-the-post-delete-release",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "the cancel loop runs off a snapshot; SharePay mints on mount, so a share claimed mid-abort is destroyed with its brand-new PaymentIntent never released",
    find: "    const outcome = await releaseHold(pi);\n    // A PI claimed inside the abort window",
    replace: '    const outcome = "released";\n    // A PI claimed inside the abort window',
  },
  {
    id: "route/claim-asks-for-a-representation",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "the 2026-07-08 outage shape — an `.or()` mutation asking for return=representation is re-projected by PostgREST 14 and 42703s EVERY share mint; this exact revert was made by a reviewer and the whole suite stayed green",
    find: '        { count: "exact" },\n      )\n      .eq("id", share.id)',
    replace: '      )\n      .eq("id", share.id)',
  },
  {
    id: "route/mints-over-an-unknown-hold",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "the claim overwrites stripe_payment_intent_id, the only record of the replaced intent — minting when its state could not be established strands a live ~7-day authorization nothing can find",
    find: '      if (outcome === "unknown") {',
    replace: "      if (false) {",
  },
  {
    id: "route/repoints-a-succeeded-intent",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "payment_intent_unexpected_state also means SUCCEEDED — repointing the row there charges the seat a second time",
    find: '      if (outcome === "captured") {',
    replace: "      if (false) {",
  },
  {
    id: "route/cancels-the-payers-own-hold",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "two same-key requests get the SAME PaymentIntent back; if the twin claimed the row and the payer authorized, cancelling it voids the payer's live hold and gates capture for the whole table",
    find: "      const stillOurs = nowErr != null || now?.stripe_payment_intent_id === intent.id;",
    replace: "      const stillOurs = false;",
  },
  {
    id: "pay-guard/read-error-fails-open",
    file: "apps/qr/lib/pay-guard.ts",
    suite: "lib/pay-guard.test.ts",
    why: "the shared money mutex — a dropped read error means an unreadable share table reads as 'no money in flight', green-lighting cash settle and clear-table over captured cards awaiting fulfillment",
    find: '  if (error) {\n    console.error("[pay-guard] in-flight share read failed", { cartId: cart.id, error });\n    return "split_in_progress";\n  }',
    replace:
      '  if (error) console.error("[pay-guard] in-flight share read failed", { cartId: cart.id, error });',
  },
  {
    id: "pay-guard/counts-the-zero-seat",
    file: "apps/qr/lib/pay-guard.ts",
    suite: "lib/pay-guard.test.ts",
    why: "a $0 by-person seat is captured with a NULL PaymentIntent — counting it returns split_in_progress with no TTL escape, permanently refusing cash-settle, clear-table, voids and comps",
    find: '    .in("status", ["authorized", "captured"])\n    .not("stripe_payment_intent_id", "is", null);',
    replace: '    .in("status", ["authorized", "captured"]);',
  },
  {
    id: "split-board/finishing-up-over-a-canceled-share",
    file: "apps/qr/lib/split-board.ts",
    suite: "lib/split-board.test.ts",
    why: "captureAllIfReady gates on every(authorized|captured), so a canceled share blocks capture — counting it as 'in' makes the board say 'finishing up…' over a table that cannot finish, and speaks it into the live region",
    find: '    shares.length > 0 && shares.every((s) => s.status === "authorized" || s.status === "captured")',
    replace:
      '    shares.length > 0 && shares.every((s) => s.status !== "pending" && s.status !== "failed")',
  },
  {
    id: "split-hold/retrieve-failure-rounds-to-released",
    file: "apps/qr/lib/split-hold.ts",
    suite: "lib/split.test.ts",
    why: "the inner fail-closed arm: cancel refused AND the follow-up retrieve threw, so the hold's state is unknown — rounding it to released is how a live authorization gets forgotten by the write that destroys its only pointer",
    find: '      if ((retrieveError as { code?: string }).code === "resource_missing") return "gone";\n      return "unknown";',
    replace:
      '      if ((retrieveError as { code?: string }).code === "resource_missing") return "gone";\n      return "released";',
  },
  {
    id: "split/open-probe-counts-the-zero-seat",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "the same $0 sentinel on the re-open side — without the narrowing a table where one diner ordered nothing can never re-open its split",
    find: '    .in("status", ["authorized", "captured"])\n    .not("stripe_payment_intent_id", "is", null)\n    .limit(1);',
    replace: '    .in("status", ["authorized", "captured"])\n    .limit(1);',
  },
  {
    id: "split/open-captured-is-not-fatal",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "a re-open that discovers a SUCCEEDED PaymentIntent must refuse — bucketing it with 'unknown' logs a real charge as a stranded hold and inserts a fresh share set the table pays a second time",
    find: '    if (outcome === "captured") {\n      // Money moved on a row we were about to replace.',
    replace: "    if (false) {\n      // Money moved on a row we were about to replace.",
  },
  {
    id: "split/abort-mark-unscoped",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "the IDENTITY predicate on abort's captured repair mark — without it one abort rewrites every share row in the database (the class split-settle.test.ts records as having already cost a review round)",
    find: '        .eq("stripe_payment_intent_id", s.stripe_payment_intent_id)\n        .neq("status", "captured");',
    replace: '        .neq("status", "captured");',
  },
  {
    id: "split-settle/failed-mark-keeps-the-stamp",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "W11 review HIGH — an issuer declining the CAPTURE lands in onShareFailed with the stamp still set; a stamped share permanently blocks the abort that is now the table's only exit",
    find: '    .update({ status: "failed", capture_started_at: null, updated_at: new Date().toISOString() })',
    replace: '    .update({ status: "failed", updated_at: new Date().toISOString() })',
  },
  {
    id: "split/open-releases-a-stamped-share",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "W11 review HIGH — the re-open's release loop cancelling a stamped share's PI re-introduces the release-A-then-meet-captured-B race in the sibling exit",
    find: "    if (row.capture_started_at != null) {\n      // W11 (M45): a stamped share",
    replace: "    if (false) {\n      // W11 (M45): a stamped share",
  },
  {
    id: "rewards/summary-error-reads-as-empty-state",
    file: "apps/qr/lib/rewards.ts",
    suite: "lib/rewards-summary.test.ts",
    why: 'T12 \u2014 W9c/J8 restored on the /account hub. `getRewardsState` is the full hub read \u2014 stars, lifetime spend and tier all on one screen. A swallowed RPC error leaves `summary` null, the `?? 0` fallbacks below render, and a diner sitting on Gold is shown an authoritative-looking ZEROED hub: 0 Stars, $0 lifetime, tier `new`. `TierUpCelebration` then banks that fabricated rank in localStorage as its baseline, so the NEXT healthy visit fires a full-screen "Tier unlocked" for a climb that never happened',
    find: '  if (summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed", summaryErr);\n    return null;\n  }',
    replace:
      '  if (false && summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed", summaryErr);\n    return null;\n  }',
  },
  {
    id: "rewards/summary-error-reads-as-empty-badge",
    file: "apps/qr/lib/rewards.ts",
    suite: "lib/rewards-summary.test.ts",
    why: 'T12 \u2014 W9c/J8 restored on the persistent header. `getRewardsBadge` rides EVERY route, so this one shows the fabrication on every screen the diner opens. A swallowed RPC error leaves `summary` null, the `?? 0` fallbacks below render, and a diner sitting on Gold is shown an authoritative-looking ZEROED hub: 0 Stars, $0 lifetime, tier `new`. `TierUpCelebration` then banks that fabricated rank in localStorage as its baseline, so the NEXT healthy visit fires a full-screen "Tier unlocked" for a climb that never happened',
    find: '  if (summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed (badge)", summaryErr);\n    return null;\n  }',
    replace:
      '  if (false && summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed (badge)", summaryErr);\n    return null;\n  }',
  },
  {
    id: "rewards/summary-error-reads-as-empty-progress",
    file: "apps/qr/lib/rewards.ts",
    suite: "lib/rewards-summary.test.ts",
    why: 'T12 \u2014 W9c/J8 restored on the /track success moment. `getRewardsProgress` is read the instant a payment lands, which is exactly when a diner looks at their Star count. A swallowed RPC error leaves `summary` null, the `?? 0` fallbacks below render, and a diner sitting on Gold is shown an authoritative-looking ZEROED hub: 0 Stars, $0 lifetime, tier `new`. `TierUpCelebration` then banks that fabricated rank in localStorage as its baseline, so the NEXT healthy visit fires a full-screen "Tier unlocked" for a climb that never happened',
    find: '  if (summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed (progress)", summaryErr);\n    return null;\n  }',
    replace:
      '  if (false && summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed (progress)", summaryErr);\n    return null;\n  }',
  },
  {
    id: "rewards/summary-guard-narrowed-to-missing-row",
    file: "apps/qr/lib/rewards.ts",
    suite: "lib/rewards-summary.test.ts",
    why: "T12 \u2014 the OVER-blocking direction of the same rule. The guard is on the ERROR deliberately: a brand-new diner legitimately has NO summary row, and the `?? 0` fallbacks are exactly what renders their first visit. Narrowing it to the missing row blanks the rewards affordance for every diner who has not ordered yet \u2014 the state the feature exists to open, reported as an outage",
    find: '  if (summaryErr) {\n    console.error("[rewards] mms_rewards_summary failed (badge)", summaryErr);\n    return null;\n  }\n  const s = (summary ?? {}) as { stars?: number; tier_id?: string };',
    replace:
      '  if (summaryErr || !summary) {\n    console.error("[rewards] mms_rewards_summary failed (badge)", summaryErr);\n    return null;\n  }\n  const s = (summary ?? {}) as { stars?: number; tier_id?: string };',
  },
  {
    id: "rewards/history-payer-read-unscoped",
    file: "apps/qr/lib/rewards.ts",
    suite: "lib/orders-payers.test.ts",
    why: "W11 M29 — the payers id-read IS the union's authorization; without the uid scope every diner's order ids flow into this caller's account history",
    find: '    .from("qr_order_payers")\n    .select("order_id")\n    .eq("payer_uid", user.id)',
    replace: '    .from("qr_order_payers")\n    .select("order_id")',
  },
  {
    id: "orders/payer-probe-authorizes-everyone",
    file: "apps/qr/lib/orders.ts",
    suite: "lib/orders-payers.test.ts",
    why: "W11 M29 — the payers probe IS the authorization; without the uid half, any signed-in visitor gets the full tracker for any order id they can guess",
    find: '        .eq("order_id", orderId)\n        .eq("payer_uid", user.id)\n        .limit(1)\n        .maybeSingle();\n      if (payerProbeErr) {',
    replace:
      '        .eq("order_id", orderId)\n        .limit(1)\n        .maybeSingle();\n      if (payerProbeErr) {',
  },
  {
    id: "split/open-never-pins",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "W11 M1/M25 — an unpinned settlement silently degrades the SQL reconcile to the old tautology; the pin write must happen and must fail closed",
    find: "  const pinned = breakdowns.reduce((a, b) => a + b.baseCents, 0);",
    replace: "  const pinned = null as unknown as number;",
  },
  {
    id: "split/pin-failure-opens-anyway",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "W11 M1/M25 — a dropped pin-write error opens an unpinned settlement",
    find: "  if (pinError) {\n    const { error: releaseErr } = await releaseSettlementFor(id, uid);",
    replace:
      "  if (false) {\n    const { error: releaseErr } = await releaseSettlementFor(id, uid);",
  },
  {
    id: "split/abort-ignores-the-capture-claim",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "W11 M45 — an abort blind to the stamp releases sibling holds and then meets the captured share too late",
    find: "  if ((shares ?? []).some((s) => s.capture_started_at != null)) {",
    replace: "  if (false) {",
  },
  {
    id: "split-settle/captures-before-stamping",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle-capture.test.ts",
    why: "W11 M45 — the stamp is the serialization token; a capture that runs unstamped is invisible to the exits, which is the race itself",
    find: "    if (stampError)\n      throw new Error(\n        `captureAllIfReady: capture-claim stamp failed for ${s.stripe_payment_intent_id} — ${stampError.message}`,\n      );",
    replace: '    if (stampError) console.error("stamp failed", stampError);',
  },
  {
    id: "split-settle/canceled-mark-keeps-the-stamp",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle-capture.test.ts",
    why: "W11 M45 — a canceled share keeping its stamp permanently blocks the abort that is now the table's only way forward",
    find: "        ...(succeeded ? {} : { capture_started_at: null }),",
    replace: "        ...(succeeded ? {} : {}),",
  },
  {
    id: "split-settle/fulfill-regrows-a-derived-expectation",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle-capture.test.ts",
    why: "W11 M1/M25 — the reconcile lives in SQL against the pinned constant; a caller-derived second argument reappearing is the documented regression",
    find: '  const { data: orderId, error } = await db.rpc("mms_fulfill_split_order", {\n    p_cart_id: cartId,\n  });',
    replace:
      '  const { data: orderId, error } = await db.rpc("mms_fulfill_split_order", {\n    p_cart_id: cartId,\n    p_expected_total_cents: shares.reduce((a, s) => a + s.amount_cents, 0),\n  } as never);',
  },
  {
    id: "split/open-unknown-hold-proceeds",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "round 3 — a re-open is optional, so an unestablishable hold must refuse, not delete the only row that records it; abort's log-and-proceed is for the EXIT path only",
    find: '      throw new Error("Couldn’t start the split — please try again");\n    }\n  }\n  // Two statements rather than one',
    replace: "      continue;\n    }\n  }\n  // Two statements rather than one",
  },
  {
    id: "split/open-second-pass-captured-reinserts-nothing",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "round 3 — round 2's captured/unknown discipline applied to the FIRST pass but not its sibling: a capture landing inside the delete window was logged as a 'hold' and a fresh payable set inserted over money already taken",
    find: '    if (outcome === "captured") {\n      // ⚠️ W10d round-3 review',
    replace: "    if (false) {\n      // ⚠️ W10d round-3 review",
  },
  {
    id: "route/unreadable-reread-picks-the-destructive-branch",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "round 3 — a null re-read made the pointer comparison read as 'not ours', cancelling an intent that may be the payer's live authorization; not knowing means not cancelling",
    find: "      const stillOurs = nowErr != null || now?.stripe_payment_intent_id === intent.id;",
    replace: "      const stillOurs = now?.stripe_payment_intent_id === intent.id;",
  },
  {
    id: "split/open-replaces-without-releasing",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "a re-open deletes the prior share set; a pending/failed row can sit over a LIVE authorization whenever its webhook is delayed, and past the TTL the re-open is the table's only forward exit",
    find: "    const outcome = await releaseHold(row.stripe_payment_intent_id);",
    replace: '    const outcome = "released";',
  },
  {
    id: "split/open-replace-error-swallowed",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "a silently-failed replace leaves the OLD share rows in place and inserts a second full set beside them — two ledgers for one table, both frozen",
    find: '    console.error("[split] open could not clear the prior share set", replacedErr);\n    throw new Error("Could not start the split");',
    replace: '    console.error("[split] open could not clear the prior share set", replacedErr);',
  },
  {
    id: "split-hold/unexpected-state-read-as-dead",
    file: "apps/qr/lib/split-hold.ts",
    suite: "lib/split.test.ts",
    why: "payment_intent_unexpected_state is ALSO Stripe's code for a SUCCEEDED PaymentIntent (captureAllIfReady retrieves on it for that reason) — treating it as already-dead deletes a share whose card was really charged",
    find: '    if (code !== "payment_intent_unexpected_state") return "unknown";',
    replace:
      '    if (code !== "payment_intent_unexpected_state") return "unknown";\n    return "released";',
  },
  {
    id: "split-hold/unknown-rounds-to-released",
    file: "apps/qr/lib/split-hold.ts",
    suite: "lib/split.test.ts",
    why: "a 429/5xx/timeout tells us nothing about the hold — rounding it to released is how a live authorization gets forgotten by the write that immediately overwrites or deletes its only pointer",
    find: '    if (code !== "payment_intent_unexpected_state") return "unknown";',
    replace: '    if (code !== "payment_intent_unexpected_state") return "released";',
  },
  {
    id: "split-intent/key-ignores-the-attempt",
    file: "apps/qr/lib/split-intent-key.ts",
    suite: "lib/split-intent-key.test.ts",
    why: "M39 — without the replaced-intent term, Stripe replays the PaymentIntent the route just canceled, so a declined payer retrying at the same tip is dead for the full 24h key window",
    find: "  return `share_${shareId}_${amountCents}_${attempt}`;",
    replace: "  void attempt;\n  return `share_${shareId}_${amountCents}`;",
  },
  {
    id: "split-settle/mark-not-scoped-to-its-payment-intent",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "the IDENTITY predicate — without it a webhook event rewrites EVERY share row in the database, across every cart and table (a reviewer removed it from both marks and the suite stayed 16/16 green)",
    find: '    .eq("stripe_payment_intent_id", piId)\n    // ⚠️ W10c pre-merge review — `failed` MUST be here, and `.select()` MUST be chained.',
    replace:
      '    .eq("id", "id")\n    // ⚠️ W10c pre-merge review — `failed` MUST be here, and `.select()` MUST be chained.',
  },
  {
    id: "split-settle/revives-a-dead-payment-intent",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "a stale redelivery must not re-open a share whose PI is dead — the all-authorized gate would pass again and CAPTURE every other payer against an order that can never be fulfilled",
    find: '  if (pi.status !== "requires_capture" && pi.status !== "succeeded") {',
    replace: "  if (false) {",
  },
  {
    id: "split-settle/mark-without-readback",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "postgrest returns data:null for an UPDATE without .select(), so the 0-row check degrades to constant noise and 'marked nothing' stops being distinguishable from success",
    find: '    .in("status", ["pending", "failed"])\n    .select("id");',
    replace: '    .in("status", ["pending", "failed"]);',
  },
  {
    id: "split-settle/failed-marks-a-live-attempt",
    file: "apps/qr/lib/split-settle.ts",
    suite: "lib/split-settle.test.ts",
    why: "only requires_payment_method may mark a share failed — a 3DS step-up parks the PI at requires_action, and a redelivery there used to kill the share mid-challenge",
    find: '  if (pi.status !== "requires_payment_method") {',
    replace:
      '  if (["succeeded", "requires_capture", "processing", "canceled"].includes(pi.status)) {',
  },
  {
    id: "totals/rpc-discounts-dropped",
    file: "apps/qr/lib/totals.ts",
    suite: "lib/totals.test.ts",
    why: "totals.ts owns the WIRING of the two RPC discounts into computeTotals — totals-math.test pins the arithmetic, nothing else pins this",
    find: "    discount ?? 0,\n    reward ?? 0,",
    replace: "    0,\n    0,",
  },
  {
    id: "register-math/unfinished-orders-counted-as-drawer-money",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "W6a — a pending/settling order is not money in the drawer; counting it overstates the Z-report the manager reconciles cash against",
    find: '    if (r.status !== "paid") continue;',
    replace: "",
  },
  {
    id: "refund-view/cash-refund-told-to-wait-for-a-card",
    file: "apps/qr/lib/refund-view.ts",
    suite: "lib/refund-view.test.ts",
    why: "M218 — the partial-refund note is the guest's answer to 'where did my money go'. Ignoring the tender tells someone who was handed cash from the till to wait for a card credit that will never arrive, on /track, on the durable receipt and in the email. The branch had never fired for cash before, because `refunded_cents` on a cash order was structurally 0",
    find: '  return tender === "cash"',
    replace: "  return false",
  },
  {
    id: "register-math/drawer-net-ignores-what-went-back",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "M218 (Codex round 1 on #286, P1) — the net is SIGNED. Flooring it at zero hides a day that gave back more cash than it took (an earlier service day's order refunded this morning), reporting a till that balances while it is short by exactly the hidden amount",
    find: "  s.cashNetCents = s.cashCents - s.cashRefundedCents;",
    replace: "  s.cashNetCents = Math.max(0, s.cashCents - s.cashRefundedCents);",
  },
  {
    id: "refund-ledger/drawer-nets-card-refunds-too",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M218 — a card refund goes back through the processor and never opens the drawer; folding it in under-reports the till by exactly the card refunds, and the manager counting cash comes up long with nothing on screen to explain it",
    find: '  return rows.reduce((a, r) => (r.tender === "cash" ? a + r.amountCents : a), 0);',
    replace: "  return rows.reduce((a, r) => a + r.amountCents, 0);",
  },
  {
    id: "refund-ledger/latest-refund-becomes-last-seen",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M219 — the settled list dates an order by its LATEST refund; taking whichever row arrived last stamps an order with an older instant and reorders the day",
    find: "    if (prev === undefined || Date.parse(r.createdAt) > Date.parse(prev))\n      latest.set(r.orderId, r.createdAt);",
    replace: "    latest.set(r.orderId, r.createdAt);",
  },
  {
    id: "register-math/change-goes-negative",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "W6a — a short tender must read 0 change with an explicit not-enough flag, never a negative the UI could render as change OWED to the house",
    find: "  return Math.max(0, tenderedCents - totalCents);",
    replace: "  return tenderedCents - totalCents;",
  },
  {
    id: "register-math/unknown-tender-lands-in-the-cash-drawer",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "W6a — if a tender is ever added and this module lags, overstating the CASH drawer is the harmful direction (the manager counts real bills against it)",
    find: '    if (r.tender === "cash") {',
    replace: '    if (r.tender !== "card") {',
  },
  {
    id: "staff-cart/cardinality-quietly-lenient-again",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "W6a/K17 — reverting to the lenient add ships modifier-less required items: the customer is quoted a curry with a style, the kitchen gets one without",
    find: "      { enforceCardinality: true },",
    replace: "      { enforceCardinality: false },",
  },
  {
    id: "staff-cart/mode-fork-collapses-to-dinein",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "W17a — the fork is the routing TAG, and with it the per-line tax (cold food is taxable dine-in, exempt to-go). Collapsing it taxes every counter/pickup register add as if the guest were eating in",
    find: '    const staffFulfillment = dineIn ? ("dinein" as const) : ("togo" as const);',
    replace: '    const staffFulfillment = "dinein" as const;',
  },
  {
    id: "staff-cart/qty-collapses-to-one",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "W6a — dropping the qty forward silently turns '3 × curry' into one unit while the cashier quotes three; the cash reconcile then charges for one",
    find: "      null,\n      qty,\n      addKey,\n    );",
    replace: "      null,\n      1,\n      addKey,\n    );",
  },
  {
    id: "register/name-write-ignores-cart-status",
    file: "apps/qr/lib/register.ts",
    suite: "lib/register.test.ts",
    why: "W6a — without the open guard the action renames an already-SETTLED order's cart (the next order on that session inherits a stranger's call-out)",
    find: '    .eq("session_id", sessionId)\n    .eq("status", "open")\n    .select("id");',
    replace: '    .eq("session_id", sessionId)\n    .select("id");',
  },
  {
    // FOLLOWED THE RULE to its new home. The kiosk and the board had hand-copied token checks; both
    // now share `lib/device-auth.ts`, so this mutant moved with the predicate rather than being
    // deleted when it went STALE — a stale mutant is a failure, and "the code moved" is the one
    // reason it is tempting to just drop one.
    id: "device-auth/unset-token-answers-open",
    file: "apps/qr/lib/device-auth.ts",
    suite: "lib/device-auth.test.ts",
    why: "W6b — an UNSET device token must mean the surface is OFF, not open. Degrading to authorized lets any visitor mint kiosk sessions, fire the reset with an empty string, and read the board feed; it is also the shape a 'make it work on a fresh device' change would reach for first",
    find: '  if (!expected) return { ok: false, reason: "not_configured" };',
    replace: '  if (!expected) return { ok: true, via: "token" };',
  },
  {
    id: "device-auth/staff-lookup-runs-for-every-wrong-token",
    file: "apps/qr/lib/device-auth.ts",
    suite: "lib/device-auth.test.ts",
    why: "the cookie pre-check is the only thing keeping the original 'an invalid token costs nothing' property alive now that a staff session is a second credential — without it, an anonymous client hammering /kiosk?k=wrong buys a getUser() round-trip plus a staff row read on every request",
    find: "  if (!(await hasSessionCookie())) {",
    replace: "  if (false) {",
  },
  {
    // The board's poll decisions moved OUT of ReadyBoard.tsx to be mutable at all: a component in
    // this app cannot be tested (vitest is node-env, `*.test.ts` only), so three defects lived in
    // that logic at once with the whole suite green. These two mutants are the standing proof that
    // the extraction bought something.
    // MOVED THREE TIMES, never deleted. blacklist -> 503-only whitelist -> both statuses -> exact
    // (status, reason) pairs, as three Codex rounds each showed the previous version still able to
    // blank a live board on some refusal our route never sent. A
    // stale mutant is a failure, and "the code moved" is the one reason it is tempting to drop one.
    id: "board-poll/unnamed-refusal-is-a-verdict",
    file: "apps/qr/lib/board-poll.ts",
    suite: "lib/board-poll.test.ts",
    why: 'a refusal counts only when it NAMES a device reason we know. Trusting the STATUS alone de-authorizes a live board on any 401/503 that did not come from our route — Vercel deployment protection answers 401 with HTML on a protected preview, a platform throttle answers 503 with an error page, an upstream may send `{error:"Service unavailable"}`, and a transient reason the API gains later is the shape most likely to be new. W10b one layer out: the failure mode of an answer we do not recognise must be a board that stays up',
    find:
      "  if (body && expected !== undefined && expected === body.reason)\n" +
      "    // `expected` is the value from DEVICE_REFUSALS, not `body.reason` — so the reason carried\n" +
      "    // forward is one this client has actually matched, never an arbitrary string off the wire.\n" +
      '    return { kind: "verdict", reason: expected, message };',
    replace:
      "  if (status === 401 || status === 503)\n" +
      '    return { kind: "verdict", reason: expected ?? "denied", message };',
  },
  {
    id: "board-poll/no-snapshot-board-claims-it-is-connecting",
    file: "apps/qr/lib/board-poll.ts",
    suite: "lib/board-poll.test.ts",
    why: "a board that BOOTED into an outage has no snapshot to keep, so folding it back to `loading` leaves it on 'Connecting…' indefinitely above a Ready column promising 'Ready orders light up here' — the screen asserts two false things and the floor is told nothing",
    find: '  if (fails < BOARD_FAIL_THRESHOLD) return prev.kind === "offline" ? prev : { kind: "loading" };',
    replace: '  return prev.kind === "offline" ? prev : { kind: "loading" };',
  },
  {
    id: "kiosk/reset-not-scoped-to-kiosk-sessions",
    file: "apps/qr/lib/kiosk.ts",
    suite: "lib/kiosk.test.ts",
    why: "W6b — without the prefix predicate the device token closes ANY session id it is handed (a diner table, a staff counter order) and cancels its cart",
    find: '    .like("qr_code", `${KIOSK_PREFIX}%`)\n',
    replace: "",
  },
  {
    id: "kiosk/reset-ignores-counter-settle-freeze",
    file: "apps/qr/lib/kiosk.ts",
    suite: "lib/kiosk.test.ts",
    why: "W6b — settleCash freezes the cart (settle_at via acquireSettlement) BEFORE totals derive; without this predicate an idle reset cancels the cart mid-settle and destroys an order money is moving on",
    find: "    .or(`settle_at.is.null,settle_at.lt.${settleCutoff}`)\n",
    replace: "",
  },
  {
    id: "terminal/unset-reader-answers-open",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c — an unset STRIPE_TERMINAL_READER_ID must mean the Card settle is OFF; degrading past the gate freezes the cart and mints a PI no reader will ever collect",
    find: "  if (!readerId) return { ok: false, error: READER_UNSET };\n",
    replace: "",
  },
  {
    id: "terminal/freeze-not-acquired-before-mint",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c \u2014 the settlement freeze is the double-collect mutex; minting the reader PI on an unfrozen cart lets a diner's phone payment capture during the collect window. \u26a0\ufe0f RE-ANCHORED BY M197, which moved this call from `acquireSettlement` to `acquireSettlementSuperseding` \u2014 `check:mutant-anchors` reported it STALE, which is the rule working: a stale mutant is a FAILURE, not a skip, and an un-re-anchored one would have left the mutex unguarded at the exact call the change touched",
    find: "  const freeze = await acquireSettlementSuperseding(cart.id, attemptId);",
    replace:
      '  const freeze = "acquired" as Awaited<ReturnType<typeof acquireSettlementSuperseding>>;',
  },
  {
    id: "terminal/success-releases-the-freeze",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c — the success path must HOLD the freeze (the webhook fulfill is the terminal state); releasing on hand-off reopens the capture→webhook double-collect window closeSecureTab exists to close",
    find: "  return { ok: true, paymentIntentId: intentId, totalCents: amount };",
    replace:
      "  await releaseSettlementFor(cart.id, attemptId);\n  return { ok: true, paymentIntentId: intentId, totalCents: amount };",
  },
  {
    id: "terminal/decline-not-released-at-observation",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c review — a decline whose freeze waits for the webhook strands the register: the pre-check refuses every retry AND the cash fallback with false 'paying on their phone' copy until the delivery lands (or the 10-min TTL)",
    find: '    const { error: relErr } = await releaseSettlementFor(cartId, attempt);\n    if (relErr)\n      console.error("[terminal] decline release failed", { cartId, message: relErr.message });',
    replace:
      '    const relErr = null as { message: string } | null;\n    if (relErr)\n      console.error("[terminal] decline release failed", { cartId, message: relErr.message });',
  },
  {
    id: "terminal/recording-window-stops-extending",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c review — captured-but-unfulfilled is the window where the freeze matters MOST (money moved, cart open); if the poll stops extending there, a delayed webhook past the TTL hands the cart to a cash settle and the guest is double-charged",
    find: '    const { extended, error: extErr } = await extendSettlementFor(cartId, attempt);\n    if (!extended)\n      console.error("[terminal] captured attempt no longer holds the settlement freeze", {',
    replace:
      '    const { extended, error: extErr } = { extended: true, error: null as { message: string } | null };\n    if (!extended)\n      console.error("[terminal] captured attempt no longer holds the settlement freeze", {',
  },
  {
    id: "grocery-queue/terminal-does-not-flush",
    file: "apps/qr/lib/grocery-queue.ts",
    suite: "lib/grocery-queue.test.ts",
    why: "W7b — a terminal cart's queued scans must die with it: replaying them into the re-minted fresh basket charges it for the dead basket's scans",
    find: '    else if (verdict === "terminal") {\n      flushCart(cartId);\n      break;\n    }',
    replace: '    else if (verdict === "terminal") {\n      break;\n    }',
  },
  {
    id: "grocery-queue/rejected-retries-forever",
    file: "apps/qr/lib/grocery-queue.ts",
    suite: "lib/grocery-queue.test.ts",
    why: "W7b — a definitive catalog refusal (unknown/unavailable/weighed) must DEQUEUE; classifying it retryable replays a dead scan forever and burns the drain on it",
    find: '  if (REJECT_REASONS.has(result.reason)) return "rejected";\n',
    replace: "",
  },
  {
    id: "grocery-queue/enqueue-mints-its-own-id",
    file: "apps/qr/lib/grocery-queue.ts",
    suite: "lib/grocery-queue.test.ts",
    why: "W7b review HIGH — the queued entry must reuse the LIVE attempt's scan id; a fresh id minted at enqueue time crosses idempotency keys, so a committed-but-unanswered live add and its replay BOTH land (double-charge)",
    find: "  const entry: QueuedScan = { scanId, cartId, barcode, queuedAt: now };",
    replace:
      "  const entry: QueuedScan = { scanId: crypto.randomUUID(), cartId, barcode, queuedAt: now };",
  },
  {
    id: "order-lines/scan-id-not-threaded-on-insert",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-scan.test.ts",
    why: "W7b — the scan-event id must reach the SQL on the fresh-insert branch, or a replayed lost-response scan inserts a second line the shopper is charged for",
    find: "      ...(line.notes ? { p_notes: line.notes } : {}),\n      ...(scanId ? { p_scan_id: scanId } : {}),\n",
    replace: "      ...(line.notes ? { p_notes: line.notes } : {}),\n",
  },
  {
    id: "order-lines/scan-id-not-threaded-on-inc",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-scan.test.ts",
    why: "W7b — the scan-event id must reach the SQL on the inc-sibling branch, or a replayed lost-response scan is a silent qty+1 (the exact double-charge the queue exists to prevent)",
    find: "      // Spread-only-when-set (the p_notes deploy-order pattern): a DB without 20260813210000 still\n      // resolves every live caller. A duplicate scan_id makes the RPC a silent no-op (not an error).\n      ...(scanId ? { p_scan_id: scanId } : {}),\n",
    replace: "",
  },
  {
    id: "grocery/scan-id-dropped",
    file: "apps/qr/lib/grocery.ts",
    suite: "lib/grocery-scan.test.ts",
    why: "W7b — scanAdd is the queue's only door into the dedupe; dropping the forward turns every replay back into a fresh, fully-honored add",
    find: "      1,\n      input.scanId,\n    );",
    replace: "      1,\n    );",
  },
  {
    id: "live-intent/captured-is-cancelable",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "M151 — the whole rule. A successor that may cancel a `succeeded`/`processing` intent cancels a charge the guest already paid: money gone, no order, and the reconcile that would have caught it never runs because the intent is now `canceled`. This is the verdict every other guard in the slice trusts",
    find: '    case "succeeded":\n    case "processing":\n      return "captured";\n    default:',
    replace:
      '    case "succeeded":\n    case "processing":\n      return "cancelable";\n    default:',
  },
  {
    id: "live-intent/unknown-status-fails-open",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "M151 — the fail-CLOSED default. A Stripe status this module has never seen must refuse the successor (a retry), never license a cancel (a real charge, possibly). Flip it and the next status Stripe ships is treated as safe to cancel until someone notices",
    find: '    default:\n      return "captured";\n  }',
    replace: '    default:\n      return "cancelable";\n  }',
  },
  {
    id: "live-intent/refused-cancel-rounds-to-cleared",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "M151 — Stripe REFUSED the cancel with a state error and the re-read still says cancelable: we do not know what the intent is, so we must not clear the link and let the pin be replaced under it. Rounding that to `cleared` is M152(b) reintroduced through the fix for it (the split-hold.ts lesson, one module over)",
    find: '  // Still cancelable yet Stripe refused — do not guess.\n  return "unknown";\n}',
    replace: '  // Still cancelable yet Stripe refused — do not guess.\n  return "cleared";\n}',
  },
  {
    id: "live-intent/transport-failure-reads-as-cleared",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "M151 — a 429/5xx/timeout on the cancel says NOTHING about the intent (M119's rule: an outage is not a verdict). Reporting it as cleared drops the link on an intent that may be live and chargeable — the exact overlap M151 names",
    find: '  if (input.code !== "payment_intent_unexpected_state") return "unknown";',
    replace: '  if (input.code !== "payment_intent_unexpected_state") return "cleared";',
  },
  {
    id: "lock/link-write-not-era-scoped",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M151 — the link write must name the intent under the ERA that minted it. Without the era term a request whose lock was taken over mid-mint still links its intent over the winner's, and the winner's own link write then reads as a conflict — two live intents, one cart, the M151 overlap with the fix's own write as the cause",
    find: '    .eq("locked_at", era)\n    .or(`live_payment_intent_id.is.null,live_payment_intent_id.eq.${intentId}`);',
    replace: "    .or(`live_payment_intent_id.is.null,live_payment_intent_id.eq.${intentId}`);",
  },
  {
    id: "lock/link-write-overwrites-a-live-link",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M151 (blind pass on #257, guard integrity) — the link write must refuse when the row still names a DIFFERENT intent. That state is reachable (an unlink that errored; the `canceled` webhook racing the successor's unlink), and in it the stale-grant release was already refused, so the row carries the PREDECESSOR's grant and this mint's amount was derived from it. Overwrite the link and fulfilment reconciles that stale grant — M70's original charge; refuse and the caller cancels its own mint",
    find: '    .eq("locked_at", era)\n    .or(`live_payment_intent_id.is.null,live_payment_intent_id.eq.${intentId}`);',
    replace: '    .eq("locked_at", era);',
  },
  {
    id: "lock/intent-release-frees-the-successor-lock",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M151 (blind pass on #257, CRITICAL 4) — the `canceled` webhook's release clears the pin and the link, NEVER the lock: it can land between a successor's Stripe cancel of the predecessor and its unlink, when the row still names the predecessor but the lock is the successor's. Null the lock there and the successor's era-scoped link write matches zero rows, it cancels the intent it just minted, and the only diner checking out is told someone else is",
    find: '      {\n        promo_granted_cents: null,\n        live_payment_intent_id: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("live_payment_intent_id", intentId);',
    replace:
      '      {\n        promo_granted_cents: null,\n        live_payment_intent_id: null,\n        locked: false,\n        locked_at: null,\n        locked_by: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("live_payment_intent_id", intentId);',
  },
  {
    id: "lock/release-by-intent-not-intent-keyed",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M151/M124 — the `payment_intent.canceled` release is keyed on the INTENT so a late delivery can never reach a successor. Drop the key and a stale cancellation clears the lock, pin and link of whatever attempt owns the cart NOW — the successor-era confusion M124 filed, on the one path that was supposed to be immune by construction",
    find: '      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("live_payment_intent_id", intentId);',
    replace: '      { count: "exact" },\n    )\n    .eq("id", cartId);',
  },
  {
    id: "lock/attempt-release-keeps-the-link",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M151 — the client exits clear lock, pin AND link in ONE payload. Drop the link and the cart keeps naming an intent the diner just cancelled: every later `applyPromo` is refused as `locked` until the next checkout, on a cart that is unlocked and editable — the over-blocking direction, and invisible to every predicate test",
    find: '        live_payment_intent_id: null,\n        locked: false,\n        locked_at: null,\n        locked_by: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid)',
    replace:
      '        locked: false,\n        locked_at: null,\n        locked_by: null,\n      },\n      { count: "exact" },\n    )\n    .eq("id", cartId)\n    .eq("locked_by", uid)',
  },
  {
    id: "supersede/captured-still-unlinks",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/supersede.test.ts",
    why: "M152(b) — the link may be dropped ONLY after the intent it names is dead at Stripe. Drop it on `captured` too and the very next statement in create-intent releases the pin under a charge whose webhook is merely late: charged card, no order — the defect, restored by the step meant to close it",
    find: '  if (outcome !== "cleared") return outcome;',
    replace: "",
  },
  {
    id: "supersede/superseded-hold-leaves-no-record",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/supersede.test.ts",
    why: "M151 (blind pass on #257, CRITICAL 3) — a pickup hold cancelled EAGERLY by a successor owes the `superseded` ledger row the capture cron used to write lazily. Skip it and the cron meets a dead intent, answers `already`, writes nothing, and the diner's /track polls 'authorized' forever over a hold Stripe released minutes ago — W23d's strand, reopened by the fix that made supersession eager",
    find: "  if (cancelledHold) await recordSupersededHold(live, cartId, cancelledHold);\n",
    replace:
      "  if (cancelledHold && Math.random() > 2) await recordSupersededHold(live, cartId, cancelledHold);\n",
  },
  {
    id: "supersede/client-exit-releases-a-captured-intent",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/supersede.test.ts",
    why: "M151 — 'Edit order' and the beacon must REFUSE when this attempt's intent captured: the card is charged or charging and the webhook is about to fulfil. Release anyway and the cart unfreezes under a live charge — the peer-mutation hole the lock exists to close, opened from the diner's own back button",
    find: '    if (outcome === "captured") return { released: false, error: null, reason: "paying" };',
    replace: "",
  },
  {
    id: "supersede/client-exit-reads-unscoped",
    file: "apps/qr/lib/supersede.ts",
    suite: "lib/supersede.test.ts",
    why: "M124 — the client exit reads the intent SCOPED to seat and era, so a superseded tab reads null and cancels nothing that is not its own. Read unscoped and a stale tab's 'Edit order' cancels the LIVE tab's intent mid-checkout — the M124 beacon defect, now with a Stripe cancel attached",
    find: "    live = await readLiveIntentFor(cartId, uid, era);",
    replace: "    live = await readLiveIntent(cartId);",
  },
  {
    id: "cart/promo-write-ignores-the-live-intent",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M152(a) — the code write's freeze predicate is deliberately TTL-aware, so five minutes after a captured intent whose webhook is late, a tablemate's code passes it and nulls the pin that capture reconciles against. The `is null` term is the only thing standing between that and a charged card with no order",
    find: '    .is("live_payment_intent_id", null);',
    replace: ";",
  },
  {
    id: "cart/promo-diagnosis-ignores-the-live-intent",
    file: "apps/qr/lib/promo-refusal.ts",
    suite: "lib/cart-promo-freeze.test.ts",
    why: "M152(a) — the refusal's DIAGNOSIS. With the write correctly refused, a reason read that does not know about the link falls through to `cart_closed` on an open cart: a fabricated diagnosis on a money surface, the M116/M119 class this repo spent four PRs removing",
    find: '  if (cart.live_payment_intent_id) return "locked";',
    replace: "",
  },
  {
    id: "ticket-names/hole-rule-substitutes-english",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: 'P1 — a null Burmese slot must STAY null so the renderer can mark the English fallback lang="en" and keep the body face. Pre-substitute the English into the Burmese array and every option without name_my is typeset in Padauk and announced as Burmese on the ticket, the rail and the expo — the design panel rejected two drafts for exactly this',
    find: '  return ids.map((id, i) => catalogNameMy(nameMyById.get(id), labels[i] ?? ""));\n',
    replace:
      '  return ids.map((id, i) => catalogNameMy(nameMyById.get(id), labels[i] ?? "") ?? labels[i] ?? null);\n',
  },
  {
    id: "ticket-names/mismatch-pairs-by-position",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: "P1 — labels and option ids are parallel arrays from ONE `chosen` list; unequal lengths mean a legacy `[]` row or a partial write, and a prefix pairing attaches the first option's Burmese to whatever label sits first — a wrong allergy-adjacent label on the line Mom reads",
    find: "  if (ids.length !== labels.length) return labels.map(() => null);\n",
    replace: "",
  },
  {
    id: "ticket-names/english-name-my-claimed-as-burmese",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: "P1 — a name_my equal to the snapshot name adds no second tongue; the script rule already stops a Latin duplicate, so the case this clause owns is a Burmese-only catalog row stored twice, which would otherwise print the same Burmese twice (once as its own English echo)",
    find: "  if (my === en.trim()) return null;\n",
    replace: "",
  },
  {
    id: "ticket-names/rail-key-splits-on-burmese",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: "P1 — the All-Day rail's key is the ENGLISH label. Let Burmese into it and a legacy row beside a fresh one becomes two rows of 1: the wok's obligation under-reports by exactly the split, on the number the rail exists to state",
    find: "    const key = allDayKey(l);\n",
    replace: "    const key = l.nameMy ?? allDayKey(l);\n",
  },
  {
    id: "ticket-names/rail-forgets-later-burmese",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: "P1 — a rail row carries the MOST Burmese known for its key. Drop the fill and a row whose first line was a legacy (English-only) row stays English for the whole shift although every later line knew the Burmese",
    find: "    if (cur.nameMy === null && l.nameMy !== null) cur.nameMy = l.nameMy;\n",
    replace: "",
  },
  {
    id: "ticket-names/latin-name-my-claimed-as-burmese",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: 'P1 — a name_my with no Myanmar-script character is not Burmese whatever it differs from (a romanisation, a brand-plus-size string). Without the script test it ships under lang="my" in Padauk and flips the whole line into the Burmese branch. None of prod\'s 531 live names trips it today; the belt is for the next import',
    find: "  if (!MYANMAR_SCRIPT.test(my)) return null;\n",
    replace: "",
  },
  {
    id: "ticket-text/hole-typesets-english-as-burmese",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: 'P1 (blind pass on #258) — the RENDER half of the hole rule. The data layer keeps a null slot null; the renderer must wrap the English fallback lang="en". `{my ?? en}` here puts English as bare text under the parent\'s lang="my" — typeset in Padauk, announced as Burmese on the rail and the expo — with every data-layer guard green',
    find: '            {my !== null ? my : <span lang="en">{en}</span>}\n',
    replace: "            {my ?? en}\n",
  },
  {
    id: "ticket-text/rail-fallback-unmarked",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: 'P1 — the rail\'s dish-name fallback is a site where the text IS the accessible name (no aria-label shadows it): an unmarked English name under lang="my" is read to a screen reader as Burmese',
    find: '        {row.nameMy !== null ? row.nameMy : <span lang="en">{row.name}</span>}\n',
    replace: "        {row.nameMy ?? row.name}\n",
  },
  {
    id: "ticket-text/english-only-line-grows-an-echo",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: 'P1 — "an English-only line mounts exactly its pre-P1 elements" is a BRANCH, not CSS gating: the echo and the Burmese modifier line are emitted only when the name has Burmese. Take that branch unconditionally and every English dish gains an empty 30px Padauk line and a duplicate name',
    find: '      {line.nameMy !== null ? (\n        <>\n          <p className="kds-line-name" lang="my">\n',
    replace: '      {true ? (\n        <>\n          <p className="kds-line-name" lang="my">\n',
  },
  // ── P2 · the staff device locale ────────────────────────────────────────────────────────────────
  {
    id: "staff-lang/default-flips-to-english",
    file: "apps/qr/lib/staff-lang.ts",
    suite: "lib/staff-lang.test.ts",
    why: "P2 — an ABSENT cookie must be Burmese. The pilot's two primary readers are Burmese-first; defaulting to English means the console silently reverts for exactly the people it was built for, and nobody discovers it until someone finds the control",
    find: '  return value === "en" ? "en" : STAFF_LANG_DEFAULT;',
    replace: '  return value === "my" ? "my" : "en";',
  },
  {
    id: "staff-lang/lax-parse-admits-any-value",
    file: "apps/qr/lib/staff-lang.ts",
    suite: "lib/staff-lang.test.ts",
    why: 'P2 — a cookie jar is not a trusted input: it carries whatever a previous build or a hand-edit left behind, including the RETIRED `mms_locale` values. A prefix match reads as "a bit more forgiving" and admits "EU", "english" and a truncated chunk',
    find: '  return value === "en" ? "en" : STAFF_LANG_DEFAULT;',
    replace: '  return value?.toLowerCase().startsWith("e") ? "en" : STAFF_LANG_DEFAULT;',
  },
  {
    id: "staff-lang/query-loses-to-cookie",
    file: "apps/qr/lib/staff-lang.ts",
    suite: "lib/staff-lang.test.ts",
    why: "P2 — the wall TV's bookmark carries `?lang=` beside its `?k=` device token, and that URL IS the screen's configuration surface: a smart-TV browser is the device most likely to lose a cookie between shifts. Drop the query and the TV cannot be configured at all",
    find: '  if (query === "en" || query === "my") return query;',
    replace: "",
  },
  {
    id: "staff-lang/cookie-path-scoped-to-staff",
    file: "apps/qr/lib/staff-lang.ts",
    suite: "lib/staff-lang.test.ts",
    why: "P2 — `/board` is NOT under `/staff`, and the lock cookie next door IS path-scoped, so copying that instinct is the natural mistake. It starves the wall TV while every `/staff` page keeps working — a failure with no symptom anywhere a `/staff` test would look",
    find: '    path: "/",',
    replace: '    path: "/staff",',
  },
  {
    id: "fill/count-not-localized",
    file: "apps/qr/lib/i18n/fill.ts",
    suite: "lib/i18n/fill.test.ts",
    why: "P2 — the owner chose Burmese numerals in prose counts (2026-09-05). The rule lives in ONE function precisely so it cannot drift; bypass it and every count on the console silently reverts to Latin while the sentence around it stays Burmese",
    find: "    return COUNT_SLOTS.has(name) ? localizeCount(raw, lang) : String(raw);",
    replace: "    return String(raw);",
  },
  {
    id: "fill/identifier-localized-as-a-count",
    file: "apps/qr/lib/i18n/fill.ts",
    suite: "lib/i18n/fill.test.ts",
    why: "P2 — the OTHER direction, and the one that misleads a person holding a physical object: a table number is read off a tent card and a pickup code off a printed slip, both Latin. Localize them and the screen stops matching the thing in the room",
    find: 'const COUNT_SLOTS = new Set(["n", "total"]);',
    replace: 'const COUNT_SLOTS = new Set(["n", "total", "id"]);',
  },
  {
    id: "chrome/english-mode-mounts-a-pair",
    file: "apps/qr/components/staff/Chrome.tsx",
    suite: "components/staff/Chrome.test.tsx",
    why: 'P2 — "an English console is byte-identical to before" is a BRANCH, not CSS gating. P1 shipped that exact claim described the wrong way. Take the pair branch unconditionally and every English staff screen grows an empty Padauk span',
    find: '  if (lang === "en") return <>{en}</>;',
    replace: "",
  },
  {
    id: "chrome/echo-nested-under-my",
    file: "apps/qr/components/staff/Chrome.tsx",
    suite: "components/staff/Chrome.test.tsx",
    why: "P2 — the English echo is a SIBLING of the Burmese span, never a child. Nested, it is typeset in Padauk and announced as Burmese: P1's hole rule one tier up, at the chrome instead of the dish name. ⚠️ The first cut of this mutant DELETED `{my}` instead of nesting the echo, so it proved the Burmese half was rendered and said nothing at all about the rule it is named for — the exact `verify:slice` failure mode LEARNINGS #60 is about. It now performs the nesting",
    find: `    <span className={echo === "stack" ? "chrome-pair" : "chrome-pair chrome-pair-inline"}>
      {my}`,
    replace: `    <span lang="my" className="chrome-my">
      {renderMyTemplate(k, vars, lang)}`,
  },
  {
    id: "chrome/burmese-half-dropped",
    file: "apps/qr/components/staff/Chrome.tsx",
    suite: "components/staff/Chrome.test.tsx",
    why: "P2 — an echoed pair that renders only its English half looks correct to the author testing in English and silently un-translates the surface for the reader it was written for",
    find: '      {my}\n      {echo === "inline" && " · "}',
    replace: '      {echo === "inline" && " · "}',
  },
  {
    id: "chrome/outage-twin-never-reached",
    file: "apps/qr/components/staff/Chrome.tsx",
    suite: "components/staff/Chrome.test.tsx",
    why: "P2 — the staff sentences with an authored Burmese twin, shown when a write fails mid-service or (M209) when the caller's authority could not be checked. Every one arrives as a plain English string, so the swap happens at the render site or nowhere; skip it and the tablet tells a Burmese-reading cook in English that nothing was saved. A7b turned the single comparison into a MAP because the second sentence was invisible in Burmese exactly because a second arm had to be remembered — so the mutant now empties the lookup rather than falsifying one condition",
    find: '  const twin = lang === "my" ? OUTAGE_TWINS.get(error) : undefined;',
    replace: "  const twin = undefined;",
  },
  {
    id: "chrome/param-typeset-as-burmese",
    file: "apps/qr/components/staff/Chrome.tsx",
    suite: "components/staff/Chrome.test.tsx",
    why: "P2 — a Latin value interpolated into a Burmese sentence (a dish name, a table number, a money figure) must be marked lang=en, or it is typeset in Padauk AND loses the overflow-wrap reset that keeps `$42.10` from breaking mid-amount",
    find: "    return HAS_LATIN.test(value) ? (",
    replace: "    return false ? (",
  },
  {
    id: "staff-labels/line-label-uses-english-name",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: "P2 — WCAG 2.5.3 on the tap Mom makes most. The visible label is the catalog Burmese; build the accessible name from the English snapshot and the button reads ပြီးပြီ while announcing something the screen never showed. This is the deferral `KdsBoard.tsx` recorded in P1 and this slice closes",
    find: '  return lang === "my" && nameMy !== null ? nameMy : name;',
    replace: "  return name;",
  },
  {
    id: "staff-labels/table-name-uses-the-raw-status-key",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: 'P2 · OPEN-ITEMS P2g, restored exactly — the table card interpolated `table.status` RAW into its accessible name, so a SPLITTING table announced "settling" while the chip beside it read "Splitting". A WCAG 2.5.3 mismatch in ENGLISH, live before this slice. \u26a0\ufe0f The generic containment loop in that suite stays GREEN under this mutation (a name containing the raw key still contains the visible label), which is precisely why the three `settling` assertions exist: `settling` is the one status whose DB value and displayed word differ, so it is the only fixture that separates the two code paths',
    find: "      parts.push(ts(lang, FLOOR_STATUS_KEY[control.status]));",
    replace: "      parts.push(control.status);",
  },
  {
    id: "staff-labels/name-drops-the-visible-echo",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "components/staff/Chrome.test.tsx",
    why: "P2 PR B, pre-merge blind pass \u2014 the CRITICAL. `<Chrome echo>` under `my` renders TWO visible strings (the Burmese span AND `.chrome-en`, which is `display: block` with no aria-hidden); `al()` composed its `visible` from ONE. So Approve SHOWED `\u1001\u103d\u1004\u1037\u103a\u1015\u103c\u102f` and `Approve` and ANNOUNCED only the Burmese half \u2014 WCAG 2.5.3 failing on 15 controls across 6 files, in the language the pilot DEFAULTS to, under three comments asserting containment held by construction. \u26a0\ufe0f Only the `my`-WITH-echo arms can catch this: under `en` Chrome returns a bare text node and under `my`-without-echo the two are identical, so a fixture that omits the echo modes is degenerate",
    find: '  return echo === "inline" ? `${my} \u00b7 ${en}` : `${my} ${en}`;',
    replace: "  return my;",
  },
  {
    id: "staff-labels/line-qty-stays-latin",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: 'P2 PR B — a KDS line\'s quantity is a PROSE COUNT and takes the device\'s numerals; it shipped Latin while every other count in this module went Burmese, so one line announced "\u1015\u103c\u102e\u1038 \u2014 2 \u1019\u102f\u1014\u1037\u103a\u101f\u1004\u103a\u1038\u1001\u102b\u1038" beside a floor card saying "\u1015\u1005\u1039\u1005\u100a\u103a\u1038 \u1049 \u1001\u102f". Found by a blind audit. \u26a0\ufe0f The containment loop stays GREEN under this mutation \u2014 the name still contains the visible dish \u2014 so the numeral assertion beside it is the only thing that separates the two code paths',
    find: "        aria: `${verb} \u2014 ${localizeCount(control.qty, lang)} ${dish}${mods}`,",
    replace: "        aria: `${verb} \u2014 ${control.qty} ${dish}${mods}`,",
  },
  {
    id: "staff-labels/subject-collapses-into-verb",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: "P2 PR B — `verb` and `subject` compose the SAME two pieces and differ only in which is `visible`, so a call site that picks the wrong arm still produces a plausible name. It shipped: the register's queue row asked for `verb`, whose visible half is the word \"Resume\", on a row that shows a guest's name and a line count and never shows that word — the {visible, aria} pair went unexercised and rule 3c could not see it, because the al() call was hoisted out of the attribute. Collapse the two arms and the containment loop stays green (the aria still contains SOMETHING); only the inversion assertions separate them",
    find: '    case "subject": {\n      return { visible: control.subject, aria: `${ts(lang, control.verb)} — ${control.subject}` };',
    replace:
      '    case "subject": {\n      return { visible: ts(lang, control.verb), aria: `${ts(lang, control.verb)} — ${control.subject}` };',
  },
  {
    id: "staff-labels/optional-fragment-always-appended",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: "P2 — a table's name is built from CONDITIONAL fragments, and the failure that matters is the one that announces a state the table is not in: every quiet table telling a server it is over its tab limit is worse than saying nothing, because that phrase is the cue to walk over. Appending unconditionally is the natural regression when a later reader flattens the ifs",
    find: '    if (control.tabOverCeiling) parts.push(ts(lang, "floor.tabOverLimit"));',
    replace: '    parts.push(ts(lang, "floor.tabOverLimit"));',
  },
  {
    id: "staff-labels/verb-label-not-the-verb-key",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: "P2 — the `verb` arm's whole contract is that the control's VISIBLE word and the word its name leads with are ONE dictionary lookup. Return the subject as the visible label instead and every call site still compiles, the containment loop still passes (the name contains the subject), and WCAG 2.5.3 breaks at every one of them: the button reads the Burmese verb and announces a person's name",
    find: '    case "verb": {\n      const visible = chromeVisible(lang, control.verb, control.echo);',
    replace: '    case "verb": {\n      const visible = control.subject;',
  },
  {
    id: "staff-outage/frozen-copy-ignores-lang",
    file: "apps/qr/lib/staff-outage.ts",
    suite: "lib/staff-outage.test.ts",
    why: "P2 — the sentence five boards show when the ordering system is unreachable, and the one that tells the floor to fall back to paper. Ignore `lang` and it stays English on a Burmese tablet, in the middle of the outage it exists to explain",
    find: '  const tail = escalated ? ts(lang, "out.tail.paper") : ts(lang, "out.tail.reconnecting");',
    replace:
      '  const tail = escalated ? ts("en", "out.tail.paper") : ts("en", "out.tail.reconnecting");',
  },
  {
    id: "board-poll/reason-dropped",
    file: "apps/qr/lib/board-poll.ts",
    suite: "lib/board-poll.test.ts",
    why: "P2 — `message` is the SERVER's English sentence and a Burmese wall TV cannot translate a string at runtime. The reason discriminator is what lets the screen render its own copy; drop it and the board is stuck showing English to a Burmese room, or inventing a sentence for a refusal it cannot name",
    find: '    return { kind: "verdict", reason: expected, message };',
    replace: '    return { kind: "verdict", reason: "denied", message };',
  },
  {
    id: "promo/decline-keeps-the-grant",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "M70 (Codex P1 on #233) — a pin is a statement about ONE attempt's basket, so create-intent releases the previous one under the era it just acquired before re-deriving; `mms_pin_promo_grant` no-ops on a non-null pin, so without the release a grant earned by a $30 basket prices the $20 basket the diner re-checks-out with, charged for real. Dropping the era makes it a cart-wide clear, which is the successor-wiping hazard the scoping exists to prevent — and Codex round 2 on #240 is why this runs from the NEXT attempt rather than the decline webhook, where it would have cleared the pin under a still-retryable PaymentIntent",
    find: "    p_attempt: attempt,",
    replace: "    p_attempt: null,",
  },
  {
    id: "lock/attempt-release-not-scoped",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "W6c review (confirmed HIGH) — without the settle_by predicate, a release that outlived its attempt (a late webhook canceled/failed delivery after a cancel→retry, a stale panel, a double-tap loser) nulls a SUCCESSOR attempt's live freeze and reopens the reader-vs-phone double-collect",
    find: '    .eq("id", cartId)\n    .eq("settle_by", owner);',
    replace: '    .eq("id", cartId);',
  },
  {
    id: "terminal/skip-tipping-dropped",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c — without skip_tipping the reader can add an on-reader tip AFTER the mint; no tipRate reproduces a dollar tip, so every tipped tap 409-loops the webhook reconcile (charged guest, no order)",
    find: "      process_config: { skip_tipping: true },\n",
    replace: "      process_config: {},\n",
  },
  {
    id: "register-math/terminal-invisible-in-summary",
    file: "apps/qr/lib/register-math.ts",
    suite: "lib/register-math.test.ts",
    why: "W6c — folding the reader's takings into online card hides a mis-tendered order and breaks the register's reader-vs-Stripe-Terminal reconcile",
    find: '    } else if (r.tender === "terminal") {\n      s.terminalCount += 1;\n      s.terminalCents += r.total_cents;\n    } else {',
    replace: "    } else {",
  },
  {
    id: "kiosk/mint-forgets-membership",
    file: "apps/qr/lib/kiosk.ts",
    suite: "lib/kiosk.test.ts",
    why: "W6b — the membership row IS the authorization for every diner-path cart write; a memberless kiosk session dead-ends at the first assertCartMember",
    find: '    const { error: memErr } = await db\n      .from("session_members")\n      .insert({ session_id: sess.id, seat_id: user.id, display_name: "Kiosk", role: "host" });',
    replace: "    const memErr = null as { code: string } | null;",
  },
  {
    id: "kiosk/occupied-table-still-claimed",
    file: "apps/qr/lib/kiosk.ts",
    suite: "lib/kiosk.test.ts",
    why: "W6b — dropping the occupancy refusal opens a second live cart over a seated party's table (two ledgers, one table — the split-table class)",
    find: '    if (occupied) return { ok: false, reason: "occupied" };',
    replace: "",
  },
  {
    id: "session-code/reserved-prefix-forgotten",
    file: "apps/qr/lib/session-code.ts",
    suite: "lib/session-code.test.ts",
    why: "W6b — /api/session's refusal to CREATE reserved-prefix sessions rides this helper; forgetting a prefix (or all of them) reopens client-minted fake counter-queue entries",
    find: "  return RESERVED_SESSION_PREFIXES.some((p) => code.startsWith(p));",
    replace: "  return false;",
  },
  {
    id: "receipt/expired-token-resolves",
    file: "apps/qr/lib/receipt-token.ts",
    suite: "lib/receipt-token.test.ts",
    why: "W7a — the expiry predicate is the whole bound on a forwarded/leaked receipt bearer; without it every link ever minted resolves forever",
    find: '      .eq("token", rawToken)\n      .gt("expires_at", new Date().toISOString())\n      .maybeSingle();',
    replace: '      .eq("token", rawToken)\n      .maybeSingle();',
  },
  {
    id: "receipt/link-payer-probe-unscoped",
    file: "apps/qr/lib/receipt.ts",
    suite: "lib/receipt-authz.test.ts",
    why: "W7a — the payer probe is half the pre-mint authorization; without the uid predicate any signed-in visitor mints a durable receipt bearer for any order id they can guess",
    find: '    .eq("order_id", orderId)\n    .eq("payer_uid", uid)\n    .maybeSingle();',
    replace: '    .eq("order_id", orderId)\n    .maybeSingle();',
  },
  {
    id: "receipt-entry/unsettled-order-gets-receipt",
    file: "apps/qr/lib/receipt-entry.ts",
    suite: "lib/receipt-authz.test.ts",
    why: "W7a — the settled-status predicate is the money rule of the session-less read; without it a pending/failed order renders a durable 'receipt' for money that never moved",
    find: '    .eq("id", orderId)\n    .in("status", [...RECEIPT_STATUSES])\n    .maybeSingle();',
    replace: '    .eq("id", orderId)\n    .maybeSingle();',
  },
  {
    id: "receipt/token-shape-unchecked",
    file: "apps/qr/lib/receipt-token.ts",
    suite: "lib/receipt-token.test.ts",
    why: "W7a — the shape gate keeps junk/pathological input out of the resolve query entirely; without it the session-less view forwards arbitrary strings into the token lookup",
    find: "export async function resolveReceiptOrder(rawToken: string): Promise<string | null> {\n  if (!isReceiptTokenShape(rawToken)) return null;",
    replace:
      "export async function resolveReceiptOrder(rawToken: string): Promise<string | null> {",
  },
  {
    id: "live-order/grocery-word-override",
    file: "apps/qr/lib/live-order.ts",
    suite: "lib/live-order.test.ts",
    why: "W22b — the grocery early-return is the ONLY thing standing between a self-scanned basket and a kitchen claim: mms_init_togo_status stamps togo_status='preparing' on grocery lines at PAYMENT, so falling through to the switch tells a shopper holding their own bag that it is being prepared",
    find: '  if (o.kind === "grocery") return "Ready to go";',
    replace: "",
  },
  {
    id: "live-order-panel/grocery-gets-kitchen-stamps",
    file: "apps/qr/lib/live-order-panel.ts",
    suite: "lib/live-order-panel.test.ts",
    why: "W22b — a grocery line stamps the SAME togo_status column as a kitchen bag (mms_init_togo_status fires on fulfillment in ('togo','grocery')), so only `hasTogoFood` separates an exit-pass check from real bagging; without it the panel prints 'Ready 2:31 PM' over goods the shopper scanned and is already carrying",
    find: "  if (order.hasTogoFood) {",
    replace: "  if (true) {",
  },
  {
    id: "live-order-panel/total-not-a-snapshot",
    file: "apps/qr/lib/live-order-panel.ts",
    suite: "lib/live-order-panel.test.ts",
    why: "W22b — the panel prints the fulfillment-time total VERBATIM; recomputing it from the breakdown is the drift this repo has paid for repeatedly (a value computed in one place and quoted in another WILL diverge — here a refunded or adjusted order would show a total the receipt never printed)",
    find: '  if (order.totalCents > 0) rows.push({ label: "Order total", value: money(order.totalCents) });',
    replace:
      '  if (order.totalCents > 0)\n    rows.push({\n      label: "Order total",\n      value: money(\n        order.breakdown.subtotalCents +\n          order.breakdown.taxCents +\n          order.breakdown.tipCents,\n      ),\n    });',
  },
  {
    id: "live-order/kitchen-word-needs-togo-food",
    file: "apps/qr/lib/live-order.ts",
    suite: "lib/live-order.test.ts",
    why: "W22b review — `togo_status` is only a KITCHEN signal when the order carries to-go FOOD; mms_init_togo_status stamps 'preparing' for grocery lines too, so reading the column raw tells a seated diner their self-scanned shopping is being prepared, then ready",
    find: "  const kitchen = o.hasTogoFood ? o.togoStatus : null;",
    replace: "  const kitchen = o.togoStatus;",
  },
  {
    id: "live-order/kind-precedence-dinein",
    file: "apps/qr/lib/live-order.ts",
    suite: "lib/live-order.test.ts",
    why: "W22b — dine-in must win the kind even when a pickup slot rides the same order; dropping the rung reclassifies a seated diner's order as pickup, which changes the status word, the mode label and the /track back-link",
    find: '  if (t.hasDineInFood) return "dinein";',
    replace: "",
  },
  // ── M108 — the session-mode fork, and the privacy filter that fails the other way ────────────
  {
    id: "authz/mode-pinned-to-a-constant",
    file: "apps/qr/lib/authz.ts",
    suite: "lib/authz.test.ts",
    why: 'M108 review (blind pass) — `assertCartMember` is now the ONE producer of the mode every dine-in/to-go fork reads, and this exact edit was the auditor\'s demonstration: with no test here, `mode: "pickup"` left all mutants, 981 tests and CI green while every dine-in add rang the to-go tax. The defect M108 closed, relocated one file upstream of its guards',
    find: "    mode: sess.mode,",
    replace: '    mode: "pickup",',
  },
  {
    id: "authz/mode-not-selected",
    file: "apps/qr/lib/authz.ts",
    suite: "lib/authz.test.ts",
    why: "M108 review — a column PostgREST was never asked for is simply absent from the row, so dropping `mode` from the select makes `sess.mode` undefined and collapses every fork to to-go, with the return statement still reading as correct",
    find: '    .select("status,expires_at,mode")',
    replace: '    .select("status,expires_at")',
  },
  {
    id: "authz/session-read-fails-open",
    file: "apps/qr/lib/authz.ts",
    suite: "lib/authz.test.ts",
    why: "M108 — this is the read that now decides a tax fork, so it refusing rather than defaulting is the whole reason deleting the two downstream reads was safe. Fail it open and an unreadable session picks a tax arm again (and W10a's original harm returns: a diner told their live session expired during a DB blip)",
    // Anchored through the mode SELECT: `assertSessionMember` a few lines down carries a
    // byte-identical guard, so the bare line matches twice and the mutant reports STALE. Only
    // assertCartMember asks for `mode`.
    find: '    .select("status,expires_at,mode")\n    .eq("id", cart.session_id)\n    .maybeSingle();\n  if (sessErr) throw UNAVAILABLE();',
    replace:
      '    .select("status,expires_at,mode")\n    .eq("id", cart.session_id)\n    .maybeSingle();\n  if (false) throw UNAVAILABLE();',
  },
  {
    id: "cart/add-mode-fork-collapses-to-togo",
    file: "apps/qr/lib/cart.ts",
    suite: "lib/cart-add-mode.test.ts",
    why: "M108 — addItem's session-mode fork sets every added line's routing tag and, through it, its per-line tax. Collapsing it to togo is exactly what the discarded-error second read did on an unreadable session: cold food that CDTFA Reg 1603 taxes at a table rings EXEMPT, under-collecting on the busiest money fork in the app",
    find: '  const dineIn = mode === "dinein";',
    replace: "  const dineIn = false;",
  },
  {
    id: "board/mode-read-fails-open",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "M108-adjacent — this second read is the ONLY thing keeping dine-in off a wall-mounted public screen. Discarding its error empties the mode map, every comparison passes, and the whole table's diner-chosen first names publish. A dropped read must never expose more than a successful one",
    find: "  if (sessionsError) {",
    replace: "  if (false) {",
  },
  {
    id: "board/ready-minutes-off-the-wall-clock",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "K32 (A4·1) — the wait is derived from the DATABASE clock, the same `dbNowMs` the pulse ages on, because a TV's clock is the least trusted in the building. Off the process clock the count drifts with the app instance; shipping the instant instead and letting the wall subtract is the same defect one screen later",
    find: "          : Math.max(0, Math.floor((dbNowMs - Date.parse(o.togo_ready_at)) / 60_000)),",
    replace:
      "          : Math.max(0, Math.floor((Date.now() - Date.parse(o.togo_ready_at)) / 60_000)),",
  },
  {
    id: "board/saturated-read-keeps-the-oldest-bags",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "K32 (A4·1), reshaped by the blind pass: `picked_up` is a manual expo tap, so untapped `ready` rows accumulate all day and the cap WILL be reached on a busy Saturday. Oldest-first + limit then drops the bag that just came up in favour of one handed over at lunch — and the first draft's 503 on saturation was worse, a guest-facing outage sentence for the rest of the window. Newest-first keeps the wall honest under the cap: the latest bags publish, the oldest untapped fall off",
    find: '      .order("created_at", { ascending: false })\n      .limit(BOARD_ORDER_CAP),',
    replace: '      .order("created_at", { ascending: true })\n      .limit(BOARD_ORDER_CAP),',
  },
  {
    id: "board/lingered-handoff-evicts-a-waiting-bag",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "Codex's per-head round on A4·1 (P2): a bag collected a minute ago rides along for the ten-minute linger and its readiness is the newest on the wall, so ranked by readiness alone it takes one of the sixty slots and the bag readied longest ago — still waiting, its guest at the counter — falls off. Active rows (`togo_picked_up_at` null) rank ahead of every collected one; the collected name is the row that yields",
    find: '      .order("togo_picked_up_at", { ascending: false, nullsFirst: true })\n',
    replace: "",
  },
  {
    id: "board/capped-read-ranks-by-creation-not-readiness",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "Codex round 1 on A4·1 (P2): under the cap, `created_at DESC` keeps the newest ORDERS, not the newest READINESS — a scheduled pickup placed at breakfast and readied at six is the oldest creation on the wall and the row the cap drops, while its guest stands at the counter with no name up. Readiness first, still-preparing bags (null) last: the bag that just came up is the first row kept",
    find: '      .order("togo_ready_at", { ascending: false, nullsFirst: false })\n      .order("created_at", { ascending: false })',
    replace: '      .order("created_at", { ascending: false })',
  },
  {
    id: "board/collected-bag-keeps-waiting",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: "Blind pass on A4·1, CRITICAL 4. A picked-up row lingers under Ready for ten minutes so the guest sees their name leave; a wait derived from `togo_ready_at` alone keeps climbing on it, and the wall states a bag someone is holding is still waiting",
    find: "        o.togo_ready_at === null || o.togo_picked_up_at !== null",
    replace: "        o.togo_ready_at === null",
  },
  {
    id: "lock/unreadable-status-reads-as-closed",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: 'M119 (b) — the diagnostic read whose entire job is to `message it honestly` reported a VERDICT it had not established. Unbound, a failed status read makes `cart` null, `cart?.status === "open"` false, and the answer `closed` — so create-intent tells a diner whose order is open that it is `no longer open` and they cannot pay. This is the SAME shape the comment one statement above already describes and fixes on the UPDATE, where it had given every checkout a spurious 409 after the PostgREST 14 upgrade',
    find: '  if (statusError) return { result: "unavailable", era: null };',
    replace: "  // fail-closed removed",
  },
  {
    id: "grocery/unreadable-catalog-destroys-a-scan",
    file: "apps/qr/lib/grocery.ts",
    suite: "lib/grocery.test.ts",
    why: "M119 (d) — and NOT merely a wrong sentence. `unknown_barcode` sits in grocery-queue.ts's REJECT_REASONS, so the offline queue treats it as definitive: dequeue, tell the shopper, never retry. An unreadable catalog read answering `unknown_barcode` therefore PERMANENTLY DISCARDS a queued scan during a reconnect drain — while the queue's own fall-through comment names `unreadable` as the retry bucket for exactly this case",
    find: "  if (itemError) {",
    replace: "  if (false) {",
  },
  {
    id: "reorder/unverified-availability-reads-an-empty-map",
    file: "apps/qr/lib/reorder.ts",
    suite: "lib/reorder.test.ts",
    why: "M119 (e) — an EMPTY `itemById` does not mean nothing is available, it means we never asked. Consult it anyway when today's read failed and every food line is skipped as `gone`: zero reorder dishes added and one false statement per dish. `priceItem` re-reads the same two columns per line, so the fallback is safe — this mutant proves the loop actually TAKES it rather than reading the empty map",
    find: "    if (!unverified) {",
    replace: "    if (true) {",
  },
  {
    id: "reorder/unsellable-reason-collapses-to-needs-choices",
    file: "apps/qr/lib/reorder.ts",
    suite: "lib/reorder.test.ts",
    why: 'M119 (e), Codex round 1 P2 — the half that keeps the fallback HONEST. Without this arm every `priceItem` throw on the unverified path is reported `needs_choices` ("tap to choose"), so a genuinely sold-out dish comes back as one the diner could have if they just picked options. That trades a wrong OUTCOME for a wrong SENTENCE, which is not a fix on a change about exactly that',
    find: "      if (e instanceof ItemUnsellableError) {",
    replace: "      if (false) {",
  },
  {
    id: "reorder/read-failure-reported-as-gone",
    file: "apps/qr/lib/reorder.ts",
    suite: "lib/reorder.test.ts",
    why: "M119, Codex round 2 P2 — the fallback's OWN fabricated diagnosis. Without this arm an `ItemUnreadableError` (the per-line catalog read failed) falls into the generic catch and is reported `needs_choices`, and before `priceItem` split the two facts it was reported `gone` — an availability verdict about a dish nobody could check, on the very path that exists to stop making them",
    find: "      if (e instanceof ItemUnreadableError) {",
    replace: "      if (false) {",
  },
  {
    id: "order-lines/outage-conflated-with-a-delisted-dish",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-availability.test.ts",
    why: 'M119, Codex round 2 P2 — `.single()` reports a 0-row result as an ERROR, so `error` alone cannot mean "this dish is gone". Collapsing the two branches back answers `gone` for a transport failure, which is how an outage reaches the diner as a fact about today\'s menu. `.maybeSingle()` is what makes `error` mean exactly one thing',
    find: "  if (error) throw new ItemUnreadableError(menuItemId);",
    replace: "  if (false) throw new ItemUnreadableError(menuItemId);",
  },
  {
    id: "share-intent/unreadable-read-denies-membership",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "M119 (c) — a discarded `{ error }` told a payer looking at their own share on the live split board that they are `not part of this split`, with a 400 (client fault) for our outage. This handler already holds itself to the opposite standard on the SAME table 200 lines below, where the lost-claim re-read binds `nowErr` and answers 503",
    find: "    if (shareError)",
    replace: "    if (false)",
  },
  {
    id: "tabs/pay-mutex-fails-open",
    file: "apps/qr/lib/tabs.ts",
    suite: "lib/tabs.test.ts",
    why: 'M119a — the money mutex, reverted. `paymentInFlightReason(null)` returns null by DELIBERATE contract (`pay-guard.ts:38`, pinned by pay-guard.test.ts): null means "there is no cart", not "we could not tell". So skipping the fail-closed does not mis-word the refusal, it SKIPS it — a tab opens on a cart whose card is mid-authorization, and nothing downstream re-checks because `mms_open_tab` gates on the cart being `open`, which it still is during an authorization. This is the shape that shipped: eight of the nine `paymentInFlightReason` call sites already refuse an unreadable cart before calling; this was the one that did not',
    find: "  if (payCartError) {",
    replace: "  if (false) {",
  },
  {
    id: "setup-intent/tab-gate-dropped",
    file: "apps/qr/app/api/stripe/setup-intent/route.ts",
    suite: "app/api/stripe/setup-intent/route.test.ts",
    why: "the dine-in gate is the only thing stopping a pickup or scan-and-go session from saving a card against a tab it can never open — `mms_open_tab` refuses those modes, so the card would be stored for a settlement that never comes. Drop it and a SetupIntent is minted for a session the tab primitive will not serve",
    find: '    if (mode !== "dinein")',
    replace: "    if (false)",
  },
  {
    id: "setup-intent/mode-from-a-second-read",
    file: "apps/qr/app/api/stripe/setup-intent/route.ts",
    suite: "app/api/stripe/setup-intent/route.test.ts",
    why: 'M116, restored. Resolving the mode in a SECOND read whose `{ error }` is discarded is what made the refusal fabricate a diagnosis: on a failed read `sess?.mode` is undefined, `undefined !== "dinein"` passes, and a diner at a real dine-in table is told their table is not one. The window is the gap between authz\'s read and this one — deleting the read is what closes it, so this mutant proves the deletion is load-bearing rather than cosmetic',
    find: "    const { sessionId, uid, mode } = await assertCartMember(cartId);",
    replace:
      '    const { sessionId, uid } = await assertCartMember(cartId);\n    const mode = (await serviceClient().from("table_sessions").select("mode").eq("id", sessionId).single()).data?.mode;',
  },
  {
    id: "board/allowlist-becomes-a-blacklist",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: 'M108-adjacent, and the shape TWO rounds got wrong in the same direction — `!== "dinein"` publishes a row absent from an answer that DID arrive (a truncated `.in()`) AND any mode value the CHECK gains later that means table service. The board is defined positively (takeout + grocery), so it must name the modes it publishes; an unknown mode belongs off the wall, not on it',
    find: "      return mode !== undefined && BOARD_MODES.has(mode);",
    replace: '      return mode !== "dinein";',
  },
  // ── P5 · the pilot loop: the tag that separates the pilot's orders, and the sheet read at 9pm ──
  {
    id: "pilot-tag/empty-code-reported-as-a-campaign",
    file: "apps/qr/lib/pilot-tag.ts",
    suite: "lib/pilot-tag.test.ts",
    why: 'P5 — `qr_carts.promo_code` is a bare `text` column with no NOT NULL and no CHECK, and OPEN-ITEMS P2e exists because a SECOND writer is coming. Drop the empty-string arm and a cart cleared with `""` rather than NULL reports a nameless campaign on every money-path event — a phantom row in the pilot funnel that no code ever created',
    find: '  return trimmed === "" ? null : trimmed.toUpperCase();',
    replace: "  return trimmed.toUpperCase();",
  },
  {
    id: "pilot-tag/case-preserved-so-one-campaign-reads-as-two",
    file: "apps/qr/lib/pilot-tag.ts",
    suite: "lib/pilot-tag.test.ts",
    why: "P5 — a PostHog filter is exact-match. Report the raw column and `PILOT15` / `pilot15` are two campaigns, one of which silently under-counts the pilot by however many orders took the other spelling. `applyPromo` upper-cases today, which is exactly why this looks like a no-op and is not: the normalizer is what stops the reporting shape inheriting whatever the newest writer happened to use",
    find: '  return trimmed === "" ? null : trimmed.toUpperCase();',
    replace: '  return trimmed === "" ? null : trimmed;',
  },
  {
    id: "pilot-night/unattributed-order-folded-into-the-commonest-door",
    file: "apps/qr/lib/pilot-night.ts",
    suite: "lib/pilot-night.test.ts",
    why: "P5 — `qr_orders.session_id` is nullable and the mode is only reachable through it, so an order with no readable channel is a real row shape. Attributing it to dine-in (the commonest door, and the tempting default) prints a number the app invented on a screen someone reads as a statement of the night. The registry's own rule: some things genuinely cannot be attributed, and guessing is worse than saying so",
    find: "    else unattributed++;",
    replace: '    else tally.set("dinein", (tally.get("dinein") ?? 0) + 1);',
  },
  {
    id: "pilot-night/refunded-counted-as-tonights-orders",
    file: "apps/qr/lib/pilot-night.ts",
    suite: "lib/pilot-night.test.ts",
    why: "P5 — `summarizeDay` keeps refunded rows out of every tender bucket and reports them apart, and the two screens must not disagree about what an order tonight is. Widen the filter and a refunded order counts as participation on the sheet while the register says its money is not in the drawer",
    find: '    if (row.status !== "paid") continue;',
    replace: '    if (row.status === "cancelled") continue;',
  },
  {
    id: "pilot-night/an-empty-channel-vanishes-from-the-sheet",
    file: "apps/qr/lib/pilot-night.ts",
    suite: "lib/pilot-night.test.ts",
    why: 'P5 — a channel dropped for having no orders reads as "not measured"; a zero reads as "none tonight". They are different statements and the sheet must make the second one, because the pilot is partly a question about which doors people actually use',
    find: "  const channels = PILOT_CHANNELS.map((mode) => ({ mode, orders: tally.get(mode) ?? 0 }));",
    replace:
      "  const channels = PILOT_CHANNELS.map((mode) => ({ mode, orders: tally.get(mode) ?? 0 })).filter(\n    (c) => c.orders > 0,\n  );",
  },
  {
    id: "pilot/a-count-that-never-happened-reads-as-zero",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: 'P5, the T21(a) class on the screen where it costs most. postgrest-js RESOLVES a transport failure into `{ data: null, error }`, so `?? 0` turns a dropped socket into a confident "0 discounts given · 0 charges with no order" — read at 9pm by the person deciding whether anything needs chasing. A null `count` with no error is the same shape one step quieter: PostgREST answered and did not count',
    find: "  return result.error ? null : result.count;",
    replace: "  return result.error ? 0 : (result.count ?? 0);",
  },
  {
    id: "pilot/the-orders-read-stops-at-the-first-page",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: "P5 — PostgREST truncates at its max-rows (default 1000) with `error` still null, which is why both existing day reads page explicitly. Stop after one page and a busy day's order count is silently short on a sheet headed Tonight, with nothing anywhere reporting that it was cut",
    find: "    if (page.length < PAGE) break;",
    replace: "    break;",
  },
  {
    id: "day-window/the-service-day-becomes-a-rolling-24-hours",
    file: "apps/qr/lib/day-window.ts",
    suite: "lib/day-window.test.ts",
    why: "P5 — \"tonight\" must mean the same instant on the register, the tip report and the pilot sheet, and `laDayStartIso` is now that ONE definition: the pilot sheet ADOPTS the register's instant rather than deriving its own. A rolling 24 hours looks identical on a quiet evening and disagrees with the Z-report every time service crosses midnight or a clock changes. This mutant used to sit on `pilot.ts`'s own `laDayStartIso(new Date())` call; adopting the register's window deleted that line and left the rule pinned NOWHERE, so it moved to the definition rather than being dropped — a stale mutant whose rule still matters is RETARGETED, never deleted. ⚠️ The retarget an agent first proposed emptied the offset-probe loop, which disables the DST probe and is a different rule from the one this id names; the mutation below returns an actual rolling 24 hours, so the id, the why and the edit agree. A4·1 (K31) moved the definition AGAIN — `laDayStartIso` is now `dayStartIso(now, 'America/Los_Angeles')` in `day-window.ts`, because the KDS served rail needed the same floor from `pickup_config.tz` — so the mutant followed it a second time: it sits on the verified return inside the probe loop, and the suite that reddens is the one asserting exact instants in four zones",
    find: "  return new Date(start).toISOString();\n}",
    replace: "  return new Date(now - 86_400_000).toISOString();\n}",
  },
  // ── A4·2 — the counter's one screen: the takeaway lane's kitchen state (K30 B), the merged list,
  // the shared counter-queue read ──────────────────────────────────────────────────────────────
  {
    id: "expo-rules/a-voided-line-keeps-the-bag-cooking",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "A4·2 (K30 B) — a voided line is off the ticket; counted, a bag whose one voided dish was 'fired' reads as cooking until the cart is gone, sinks below every finished bag and never earns the badge — the counter taps by eye again on exactly the bags this rule exists for",
    find: '  const food = togo.filter((l) => l.state !== "voided");',
    replace: "  const food = togo;",
  },
  {
    id: "expo-rules/grocery-counts-as-kitchen-work",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "A4·2 (K30 B) — a grocery line is never fired, so it is never served; counted as kitchen work every scan-and-go basket reads as cooking forever and sinks to the bottom of the lane behind the food bags, on the counter whose job for that basket is a five-second exit-pass check",
    find: '  const togo = lines.filter((l) => l.fulfillment === "togo");',
    replace: '  const togo = lines.filter((l) => l.fulfillment !== "dinein");',
  },
  {
    id: "expo-rules/a-cooking-bag-outranks-a-finished-one",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "A4·2 (K30 B) — the whole point of reading the kitchen state is that a finished bag can be bagged NOW; inverted, the lane leads with the bags nobody can act on and the finished ones wait beneath them, which is the pre-K30 counter with a badge on it",
    find: '  const cooking = Number(a.kitchen === "cooking") - Number(b.kitchen === "cooking");',
    replace: '  const cooking = Number(b.kitchen === "cooking") - Number(a.kitchen === "cooking");',
  },
  {
    id: "expo-rules/the-kitchen-outranks-a-waiting-guest",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "A4·2 (K30 B) — J5's rule is that a waiting HUMAN outranks everything; tested after the kitchen, a guest standing at the counter whose bag is still cooking drops beneath a finished bag nobody has come for, and the person in front of the tablet is the last one it mentions",
    find: '  const arrived = Number(!a.arrivedAt) - Number(!b.arrivedAt);\n  if (arrived !== 0) return arrived;\n  const cooking = Number(a.kitchen === "cooking") - Number(b.kitchen === "cooking");\n  if (cooking !== 0) return cooking;',
    replace:
      '  const cooking = Number(a.kitchen === "cooking") - Number(b.kitchen === "cooking");\n  if (cooking !== 0) return cooking;\n  const arrived = Number(!a.arrivedAt) - Number(!b.arrivedAt);\n  if (arrived !== 0) return arrived;',
  },
  // ── staff-console polish, slice 2a (counter-1 · counter-7): the lane's due-ness and its undo window
  {
    id: "expo-rules/a-scheduled-bag-ages-from-payment",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "counter-7 (O-G) — the lane's clock is due-ness: counted from PAYMENT when a slot exists, a noon-paid 6 pm pickup wears a late header strip for five hours while nobody is waiting for it, and the strip stops meaning anything by dinner",
    find: "  const from = Date.parse(t.arrivedAt ?? t.pickupSlot ?? t.createdAt);",
    replace: "  const from = Date.parse(t.arrivedAt ?? t.createdAt);",
  },
  {
    id: "expo-rules/late-flips-a-minute-after-the-threshold",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "counter-7 — the thresholds are the config constant the counter reads by; a strict compare on the late edge is a silent minute of drift between what the constant says and what the strip shows",
    find: '    min >= EXPO_TONE_MIN.late ? "late" : min >= EXPO_TONE_MIN.warn ? "warn" : "ok";',
    replace: '    min > EXPO_TONE_MIN.late ? "late" : min >= EXPO_TONE_MIN.warn ? "warn" : "ok";',
  },
  {
    id: "expo-rules/the-undo-window-outlives-itself",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "counter-1 (O-E) — the deferred picked-up write goes out on the first tick at which the window is CLOSED; an inclusive compare holds the bag on the tracker and the wall one tick longer than the window the card promised, every time",
    find: "  return nowMs - startedMs < windowMs;",
    replace: "  return nowMs - startedMs <= windowMs;",
  },
  {
    id: "expo-rules/undo-arms-on-the-tap-that-picked",
    file: "apps/qr/lib/expo-rules.ts",
    suite: "lib/expo-rules.test.ts",
    why: "the lane's Undo takes the SAME 64px slot the pick was tapped in and React reuses the node; armed from the first millisecond, the second tap of a double-tap 'to make sure' lands on Undo and the bag the counter just handed over stays 'ready' on the tracker and the wall",
    find: "  return nowMs - startedMs >= armMs;",
    replace: "  return true;",
  },
  {
    id: "expo/a-failed-kitchen-read-freezes-the-counter",
    file: "apps/qr/lib/expo.ts",
    suite: "lib/expo.test.ts",
    why: "A4·2 (K30 B) — the badge is ADVISORY: a cart-lines read that fails must log and leave every bag `unknown`, never answer `outage` — which freezes the lane on its last-known queue over a label. A badge cannot misidentify a bag; refusing the whole counter over one is the over-blocking direction (the blind pass on A4·1 rejected exactly this posture on the served rail)",
    find: '  if (cartLinesError) {\n    console.error(\n      "[expo] kitchen-state read failed — bags will not say whether the kitchen is done",\n      {\n        message: cartLinesError.message,\n      },\n    );\n  } else if (cartLinesTruncated) {',
    replace:
      '  if (cartLinesError) {\n    return { ok: false, reason: "outage" };\n  } else if (cartLinesTruncated) {',
  },
  {
    id: "expo/the-kitchen-state-is-never-read",
    file: "apps/qr/lib/expo.ts",
    suite: "lib/expo.test.ts",
    why: "A4·2 (K30 B) — the read exists to put the kitchen's progress on the ticket; hardcoding `unknown` keeps the query, the log line and the badge code and ships none of the behaviour — every bag reads unknown, no badge is ever drawn, the lane never reorders. The wiring suite is what tells this from a working read",
    find: "      kitchen: kitchenStateOf(o.cart_id ? linesByCart.get(o.cart_id) : undefined),",
    replace: '      kitchen: "unknown",',
  },
  {
    id: "expo/a-truncated-kitchen-read-still-verdicts",
    file: "apps/qr/lib/expo.ts",
    suite: "lib/expo.test.ts",
    why: "A4·2 Codex round 1 — PostgREST's max-rows cap is SILENT: a cart-lines response short of its own `count: \"exact\"` has dropped rows, and a cart whose one cooking row fell past the cap reads `done` off its surviving served rows and is lifted as finished. The truncation must take the failed read's posture (every bag `unknown`, logged); constant-false keeps the count in the select and ships a verdict on a partial read",
    find: '  const cartLinesTruncated =\n    typeof cartLinesCount === "number" && cartLinesCount > (cartLines?.length ?? 0);',
    replace: "  const cartLinesTruncated = false;",
  },
  {
    id: "floor-rows/a-counter-order-outranks-a-table-asking-to-pay",
    file: "apps/qr/lib/floor-rows.ts",
    suite: "lib/floor-rows.test.ts",
    why: "A4·2 — the one list's seam: a table that asked to pay at the counter is a party waiting to leave (A1 puts it on top of the floor for that reason), and folding the counter orders in must not push it beneath a walk-up that has not ordered yet. Swapped, the ask drops under every open counter order on a busy afternoon",
    find: '    ...asks.map((table): FloorRow => ({ kind: "table", table })),\n    ...counter.map((order): FloorRow => ({ kind: "counter", order })),',
    replace:
      '    ...counter.map((order): FloorRow => ({ kind: "counter", order })),\n    ...asks.map((table): FloorRow => ({ kind: "table", table })),',
  },
  {
    id: "floor-rows/a-stale-stamp-under-a-card-payment-jumps-the-queue",
    file: "apps/qr/lib/floor-rows.ts",
    suite: "lib/floor-rows.test.ts",
    why: "A4·2 Codex round 1 — `counterRequestedAt` outlives the ask: a table that asked to pay at the counter, then started a card payment or a split, keeps the stamp while `deriveFloorStatus` reports `paying`/`settling`, and the floor's own sort lifts only status `counter`. Partitioned on the stamp, a table staff cannot settle is lifted above the orders they are building — the partition must read the STATUS the card shows",
    find: '  const asks = tables.filter((t) => t.status === "counter");\n  const rest = tables.filter((t) => t.status !== "counter");',
    replace:
      "  const asks = tables.filter((t) => t.counterRequestedAt !== null);\n  const rest = tables.filter((t) => t.counterRequestedAt === null);",
  },
  {
    id: "refund-console/a-cash-order-is-sent-to-the-card-dashboard",
    file: "apps/qr/lib/refund-console.ts",
    suite: "lib/refund-console.test.ts",
    why: "A4·3 · M183 — `mms_fulfill_cash_order` never writes a PaymentIntent, so without the tender arm every cash order reads as a split card order and the manager is sent to a processor dashboard where no charge exists, two lines under the order's own tender (the M116 fabricated-diagnosis class)",
    find: '  if (o.tender === "cash") return "cash";\n  return o.stripePaymentIntentId ? "app" : "dashboard";',
    replace: '  return o.stripePaymentIntentId ? "app" : "dashboard";',
  },
  {
    id: "refund-console/the-pool-forgets-the-tip",
    file: "apps/qr/lib/refund-console.ts",
    suite: "lib/refund-console.test.ts",
    why: "A4·3 · M204 — the SQL's refundable pool is total − service − tip (W17 P1-1); a console pool that keeps the tip offers a line refund the server will clamp, so the sheet shows one number and charges back another — the exact gap the offer-with-clamp exists to close",
    find: "  const pool = o.totalCents - o.serviceChargeCents - o.tipCents;",
    replace: "  const pool = o.totalCents - o.serviceChargeCents;",
  },
  {
    id: "refund-console/the-offer-ignores-what-the-order-can-still-give-back",
    file: "apps/qr/lib/refund-console.ts",
    suite: "lib/refund-console.test.ts",
    why: "A4·3 · M204 — an unclamped offer shows the line's full figure on an order whose pool is nearly spent; the server clamps on submit and the manager learns the real amount only from the confirmation, which is precisely what 'a clamp is explained before the tap' forbids",
    find: "  const cents = Math.max(0, Math.min(lineCents, remainingCents));",
    replace: "  const cents = Math.max(0, lineCents);",
  },
  {
    id: "refund-console/a-discounted-line-refunds-its-list-price",
    file: "apps/qr/lib/refund-console.ts",
    suite: "lib/refund-console.test.ts",
    why: "S4-audit P0-1, re-homed — the line's refundable goods are its gross MINUS its pro-rata share of the order discount; without the share, a promo order's console offers the list price and the sheet's figure disagrees with what `mms_refund_authorize` will actually return",
    find: "  const goods = lineGross - lineDiscount;",
    replace: "  const goods = lineGross;",
  },
  {
    id: "refunds/the-settled-list-forgets-the-service-day",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "A4·3 — 'Settled today' is scoped by the ONE service-day rule (K31): paid since the floor, or refunded here since the floor. Without the floor on the paid arm the capped read is the newest fifty orders of ALL time — a week of settled tables passed off as today, the day's real orders pushed off the page by the cap, and the takings' three 'today' zones no longer agreeing about when today began",
    find: '  const paidQ = settled()\n    .gte("created_at", sinceIso)\n',
    replace: "  const paidQ = settled()\n",
  },
  {
    id: "refunds/the-union-read-is-never-made",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "A4·3 (blind pass, CRITICAL 1 — the union; Codex round 1 on #283, P1 — its own read): 'Settled today' is paid today OR refunded here today, and the second arm is a read of its own by the ledger's ids, uncapped by the paid arm's page. Never made, an earlier day's order refunded today is on neither surface again — the takings still send the manager here to find it",
    find: "  const unionQ = refundedTodayIds.length\n    ? settled()\n",
    replace: "  const unionQ = false\n    ? settled()\n",
  },
  {
    id: "refunds/an-earlier-day-refund-is-ranked-by-its-order-time",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "A4·3 Codex round 1 on #283 (P1) — the merge ranks every row by the instant it settled TODAY (the latest refund for a row the ledger admitted), and the cap runs over that ranking. Ranked by `created_at`, an earlier day's order refunded at noon sits behind every order paid today and on a fifty-order day the cap drops it — the exact row the takings pointed at",
    find: '  const movedMs = (o: { id: string; created_at: string }) =>\n    Math.max(Date.parse(o.created_at), Date.parse(refundedTodayAt.get(o.id) ?? "") || 0);\n',
    replace:
      "  const movedMs = (o: { id: string; created_at: string }) => Date.parse(o.created_at);\n",
  },
  {
    id: "refunds/the-refund-arm-is-capped-by-order-age",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "A4·3 Codex round 2 on #283 (P1) — the ids the union read is given are ranked by the LATEST refund and capped BEFORE the read; handed every id, the read's own `.order(\"created_at\")` under its `.limit` keeps the fifty newest-CREATED, and with more than fifty refunded today the oldest order carrying today's latest refund is gone before the merge can rank it",
    find: "  const refundedTodayIds = [...refundedTodayAt.entries()]\n    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]) || (a[0] < b[0] ? 1 : -1))\n    .slice(0, SETTLED_CAP)\n    .map(([id]) => id);\n",
    replace: "  const refundedTodayIds = [...refundedTodayAt.entries()].map(([id]) => id);\n",
  },
  {
    id: "settled/the-hand-back-order-waits-on-a-read-that-can-fail",
    file: "apps/qr/components/staff/SettledToday.tsx",
    suite: "components/staff/SettledToday.test.tsx",
    why: "M218 (Codex round 4 on #286, P1) — the cash banner is an INSTRUCTION carrying the only copy of the server-clamped amount, and keying its focus to `snap` makes it wait on a read succeeding. `refresh()` calls `setSnap` ONLY on a good answer (an outage keeps the last good list and sets `stale`), so a refund that RECORDED followed by a failed refresh leaves the effect never rerunning and the instruction never focused — money out of the books' reach with nobody told to hand it over. `confirmed` is set synchronously before `refresh()`, so it changes whether or not the read lands",
    find: "  }, [confirmed]);",
    replace: "  }, [snap]);",
  },
  {
    id: "settled/a-no-op-re-issues-the-last-instruction",
    file: "apps/qr/components/staff/SettledToday.tsx",
    suite: "components/staff/SettledToday.test.tsx",
    why: "M218 (Codex round 3 on #286, P1) — under record-first the cash banner ASKS for a hand-back rather than reporting one. `already_refunded`/`fully_refunded` return no amount, so leaving the previous `confirmed` standing re-issues its imperative over an attempt that moved no money, and a manager following it pays the earlier refund a second time out of the drawer",
    find: "            if (refundedCents == null) {",
    replace: "            if (false) {",
  },
  {
    id: "settled/a-new-attempt-inherits-the-last-figure",
    file: "apps/qr/components/staff/SettledToday.tsx",
    suite: "components/staff/SettledToday.test.tsx",
    why: "M218 (Codex round 3 on #286, P1) — the same imperative, one step earlier. Opening the sheet on a DIFFERENT line while the previous line's 'now hand back $x' still stands puts a figure from one refund over another line's tap. Cleared when the sheet opens, before the manager can act on it",
    find: "                setConfirmed(null);\n                setRefunding({ order: o, line });",
    replace: "                setRefunding({ order: o, line });",
  },
  {
    id: "day-cash/a-short-drawer-reads-as-its-contents",
    file: "apps/qr/components/staff/DayCash.tsx",
    suite: "components/staff/DayCash.test.tsx",
    why: "M218 (Codex round 3 on #286, P2) — `cashNetCents` is signed, so a day whose hand-backs exceed its cash sales renders negative. Through `reg.day.inDrawer` that reads '-$15.00 in drawer' — not a figure anyone can count a till to. The sign has to pick the SENTENCE, and the magnitude shown has to be the positive one a manager can match against the day",
    find: '                  k={s.cashNetCents < 0 ? "reg.day.short" : "reg.day.inDrawer"}',
    replace: '                  k="reg.day.inDrawer"',
  },
  {
    id: "refund-ledger/the-window-before-the-migration-goes-dark",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M218 (Codex round 2 on #286, P1) — `tender` does not exist until the migration is applied by hand, and the app ships on merge. PostgREST rejects the WHOLE query for one unknown column (42703, raised at parse time — measured), and both callers turn a failed ledger read into `outage`, so without the one-column-short retry the settled list AND the register's drawer go dark for the length of that window, taking the `cash_not_ready` verdict written for it out of reach",
    find: "      if (after === null && cols === LEDGER_COLS && error.code === UNDEFINED_COLUMN) {",
    replace: "      if (false) {",
  },
  {
    id: "refund-ledger/an-outage-downgrades-into-a-plausible-subset",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M218 (Codex round 2 on #286, P1) — the fallback's NARROWNESS is the property. Retrying on any error, not just the undefined column, turns a broken read into a shorter successful-looking one: the drawer nets a subset of the day and calls it the till, which is the exact defect this module was written to make impossible",
    find: "error.code === UNDEFINED_COLUMN",
    replace: "true",
  },
  {
    id: "refund-ledger/the-seek-forgets-the-tie",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M219 (Codex round 1 on #286, P2) — `created_at` is not unique, so a seek of `created_at > <last seen>` alone SKIPS the second of a pair that straddles a page boundary. The day silently loses a refund at every page edge: the settled list misdates an order and the drawer nets a subset of the hand-backs. Only the composite `(created_at, id)` seek carries the tied row over",
    find: '`created_at.gt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.gt."${after.id}")`',
    replace: '`created_at.gt."${after.createdAt}"`',
  },
  {
    id: "refund-ledger/stops-after-the-first-page",
    file: "apps/qr/lib/refund-ledger.ts",
    suite: "lib/refund-ledger.test.ts",
    why: "M219 — this REPLACES `refunds/a-truncated-ledger-read-still-ranks`, whose subject no longer exists: the settled list used to detect a capped ledger answer and mark itself `truncated`, and now it reads the ledger completely instead. The cap is still silent (PostgREST returns max-rows with `error` null), so a loop that stops after one page is the same defect one layer down — a partial ledger that calls itself whole, ranking the day and netting the drawer from a subset",
    find: "    if (page.length < PAGE) break;",
    replace: "    break;",
  },
  {
    id: "refunds/the-ledger-no-longer-marks-the-refunded-line",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "W10b, on the read that now owns it — a line with a ledger row must render its mark and lose its Refund button; a dropped flag re-offers a refund on an already-refunded line, and the idempotency key is the backstop, not the UI",
    find: "            refunded: refundedLines.has(li.id),",
    replace: "            refunded: false,",
  },
  {
    id: "refunds/the-ledger-no-longer-shrinks-the-pool",
    file: "apps/qr/lib/refunds.ts",
    suite: "lib/refunds.test.ts",
    why: "A4·3 · M204 — every ledger row against the order (line-level and dashboard alike) is the sum `mms_refund_authorize` clamps against; a pool that ignores the ledger offers the full line on an order that has already given most of it back, and the sheet's figure is not the server's",
    find: "        ledgerRefundedCents: ledgerByOrder.get(o.id) ?? 0,",
    replace: "        ledgerRefundedCents: 0,",
  },
  {
    id: "service-day/the-configured-zone-is-ignored",
    file: "apps/qr/lib/service-day.ts",
    suite: "lib/service-day.test.ts",
    why: "A4·3 Codex round 1 on #283 (P2) — the takings floored on hardcoded LA while the settled list beside them floored on `pickup_config.tz`, two service days on one screen. This read exists so every today zone applies the CONFIGURED zone; read as the default, the owner's zone is set and nothing changes",
    find: "  const tz = resolveServiceTz(tzRes.data?.tz);\n",
    replace: "  const tz = resolveServiceTz(null);\n",
  },
  {
    id: "service-day/the-server-clock-is-ignored",
    file: "apps/qr/lib/service-day.ts",
    suite: "lib/service-day.test.ts",
    why: "A4·3 Codex round 1 on #283 — the floor is derived from the SERVER's instant (`mms_now`) so two reads in one request agree about now and the day; from this process's clock, a skewed or stale app server floors a different day than the SQL beside it (K34 is the storage-time half of the same rule)",
    find: "  const nowIso = nowRes.data ?? new Date().toISOString();\n",
    replace: "  const nowIso = new Date().toISOString();\n",
  },
  {
    id: "sign-in-state/a-wrong-account-falls-through-the-denied-form",
    file: "apps/qr/lib/sign-in-state.ts",
    suite: "lib/sign-in-state.test.ts",
    why: "A4·4 — the lock cookie is a DEVICE fact, set by whichever session locked the tablet; a real account with no staff row must meet the denied form (Sign out is its only way out) whatever the cookie or the URL says. Let it fall through and a wrong account on a locked tablet is sent to a PIN screen it can never unlock, or straight to the destination it was denied",
    find: '  if (auth.kind === "not_staff") return { kind: "form", denied: true };\n',
    replace:
      '  if (auth.kind === "not_staff" && !input.locked) return { kind: "form", denied: true };\n',
  },
  {
    id: "sign-in-state/the-lock-outranks-an-explicit-destination",
    file: "apps/qr/lib/sign-in-state.ts",
    suite: "lib/sign-in-state.test.ts",
    why: "A4·4 — `?next=` is the sign-in's PURPOSE and the destination gates itself (the lock is a `/staff`-scoped cookie the kiosk and the wall never see); read the lock first, a bookmarked `/staff/login?next=/kiosk` on a locked counter tablet lands on the console's lock screen instead of the kiosk — the pre-fold behaviour the one-screen promised to keep, gone",
    find: '  if (input.next !== null) return { kind: "redirect", to: input.next };\n  if (input.locked) return { kind: "redirect", to: LOCK_ROUTE };\n',
    replace:
      '  if (input.locked) return { kind: "redirect", to: LOCK_ROUTE };\n  if (input.next !== null) return { kind: "redirect", to: input.next };\n',
  },
  {
    id: "register-queue/settled-carts-return-to-the-counter",
    file: "apps/qr/lib/register-queue.ts",
    suite: "lib/register-queue.test.ts",
    why: "A4·2 — the W6a review's confirmed HIGH, on the read the floor snapshot now carries: without the open-cart guard, settled-but-unexpired counter sessions fill the capped page and a genuinely open order is hidden in a rush — and the card would offer to Resume an order that is already paid",
    find: '    .eq("status", "open")\n    .eq("table_sessions.mode", "pickup")',
    replace: '    .eq("table_sessions.mode", "pickup")',
  },
  {
    id: "register-queue/kiosk-orders-vanish-from-the-counter",
    file: "apps/qr/lib/register-queue.ts",
    suite: "lib/register-queue.test.ts",
    why: "A4·2 — W6b put self-minted kiosk orders on the SAME queue because they pay at this counter; narrowing the predicate to the staff-minted prefix makes them vanish from the one screen the counter person reads, while the guest stands there having built an order the tablet cannot see",
    find: '    .or(`qr_code.like.${REG_PREFIX}%,qr_code.like.kiosk-%`, { referencedTable: "table_sessions" })',
    replace: '    .or(`qr_code.like.${REG_PREFIX}%`, { referencedTable: "table_sessions" })',
  },
  {
    id: "glossary/a-settled-row-is-dropped-instead-of-locked",
    file: "apps/qr/lib/glossary.ts",
    suite: "lib/glossary.test.ts",
    why: "P5 — a corrector who cannot find မီးဖိုချောင် on the printed sheet concludes it was missed and writes it in the margin, and now the sheet disagrees with a correction the owner already made. A settled or Latin-by-design string is PRINTED with its reason and simply carries no box; omitting it is the worse failure, not the tidier one",
    find: "  const rows: GlossaryRow[] = keys.map((key) => ({",
    replace:
      "  const rows: GlossaryRow[] = keys\n    .filter((k) => lockFor(k) === null)\n    .map((key) => ({",
  },
  {
    id: "glossary/the-ask-counts-rows-nobody-can-correct",
    file: "apps/qr/lib/glossary.ts",
    suite: "lib/glossary.test.ts",
    why: "P5 — the sheet prints this number as the size of the ask. Counting the locked rows into it overstates what the family is being asked to check, on the one artifact whose whole job is to make the ask small enough to finish over dessert",
    find: "    openForCorrection: rows.filter((r) => r.locked === null).length,",
    replace: "    openForCorrection: rows.length,",
  },
  {
    id: "feedback/a-failed-triage-read-renders-as-an-empty-inbox",
    file: "apps/qr/lib/feedback.ts",
    suite: "lib/feedback-read.test.ts",
    why: 'P5 — the same rule one process boundary out. Answering `{ ok: true, rows: [] }` on a failed read puts "No feedback yet. Diners are asked to rate after every order." on screen during an outage — and now directly beneath a pilot sheet whose rating count comes from a query that fails LOUD, so one outage can show "7 ratings tonight" and "no feedback yet" at once',
    find: "    return { ok: false };",
    replace: "    return { ok: true, rows: [] };",
  },
  {
    id: "staff-clock/wall-clock-in-the-process-zone",
    file: "apps/qr/lib/staff-clock.ts",
    suite: "lib/staff-clock.test.ts",
    why: "tips-1 (slice 6) — the ONE staff clock. Drop the zone from the time formatter and the tips page, a Server Component on Vercel's UTC runtime, prints `2:05 AM` for a 7:05 PM review to every manager — the exact defect the module replaced. The suite forces the process zone to UTC so a Los Angeles dev box cannot hide it",
    find: 'const clock = new Intl.DateTimeFormat("en-US", {\n  timeZone: RESTAURANT_TZ,\n  hour: "numeric",',
    replace: 'const clock = new Intl.DateTimeFormat("en-US", {\n  hour: "numeric",',
  },
  {
    id: "staff-clock/service-day-is-the-utc-day",
    file: "apps/qr/lib/staff-clock.ts",
    suite: "lib/staff-clock.test.ts",
    why: "menu-4's foundation — \"same day\" decided on the UTC calendar splits one Los Angeles evening in two at 5 PM: a dish 86'd at 4:30 PM and read at 11:30 PM would carry yesterday's day and the warn ink",
    find: 'const dayKey = new Intl.DateTimeFormat("en-CA", {\n  timeZone: RESTAURANT_TZ,\n  year: "numeric",',
    replace: 'const dayKey = new Intl.DateTimeFormat("en-CA", {\n  year: "numeric",',
  },
  {
    id: "sold-out-since/day-compared-on-the-iso-string",
    file: "apps/qr/lib/sold-out-since.ts",
    suite: "lib/sold-out-since.test.ts",
    why: "menu-4 — the stamp's one job is to expose a flag that outlived its shift. Comparing the ISO strings' dates is a UTC compare, so an 86 at 4:30 PM read at 11:30 PM the same evening is shown as another day's, tinted warn, and a real overnight flag is indistinguishable from it",
    find: "  const sameDay = sameServiceDay(soldOutAt, nowIso);",
    replace: "  const sameDay = soldOutAt.slice(0, 10) === nowIso.slice(0, 10);",
  },
  {
    id: "menu-price-draft/floor-refused",
    file: "apps/qr/lib/menu-price-draft.ts",
    suite: "lib/menu-price-draft.test.ts",
    why: "menu-5 — the client verdict must accept exactly what the write accepts. An exclusive floor refuses $0.25 with `Lowest price is $0.25` beside a field holding $0.25 — a stated reason that is false, worse than the dead button it replaced",
    find: '  if (cents < PRICE_MIN_CENTS) return "below";',
    replace: '  if (cents <= PRICE_MIN_CENTS) return "below";',
  },
  {
    id: "menu-price-draft/unchanged-is-ok",
    file: "apps/qr/lib/menu-price-draft.ts",
    suite: "lib/menu-price-draft.test.ts",
    why: "menu-5 — a no-op edit must not light Save: the confirm would read `Change Mohinga from $12.00 to $12.00?` and the write would record a price change that changed nothing, with the manager's name on it",
    find: '  if (cents === currentCents) return "unchanged";\n',
    replace: "",
  },
  {
    id: "menu-browse/sold-out-chip-filters-nothing",
    file: "apps/qr/lib/menu-browse.ts",
    suite: "lib/menu-browse.test.ts",
    why: "the menu list's sold-out chip (slice 6) — pressed, it must narrow to the flags a server is told to watch for. A chip that lights and filters nothing is the §16 control that does nothing, wearing the selection cap",
    find: "      (!soldOutOnly || i.soldOut || i.id === keep) &&\n",
    replace: "",
  },
  {
    id: "pilot/redemptions-count-every-campaign",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: "P5 (blind pass) — the figure is LABELLED with the pilot's code. Drop the code filter and every campaign's redemptions are reported under it, which is a wrong participation count presented as the pilot's own. Caught only because the suite's fake keys a query on its table AND its filters; the first fake keyed on table plus position, and this deletion was silently green",
    find: '      .eq("code", PILOT_PROMO_CODE)\n      .gte("redeemed_at", sinceIso),',
    replace: '      .gte("redeemed_at", sinceIso),',
  },
  {
    id: "pilot/low-ratings-counts-every-rating",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: "P5 (blind pass) — the two `mms_feedback` reads differ ONLY by this filter. Drop it and `low` equals `total`, so a perfect night reports every rating as needing follow-up — and the manager stops believing the chip. The suite tells the two apart by the filter now, not by which one Promise.all issued first",
    find: '      .gte("created_at", sinceIso)\n      .lte("rating", LOW_RATING),',
    replace: '      .gte("created_at", sinceIso),',
  },
  {
    id: "pilot/resolved-recoveries-still-counted-as-waiting",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: 'P5 (blind pass) — the sheet says "{n} waiting on the approvals screen". Counting resolved rows too means the number never falls after someone clears one, so the nightly "was anything charged with no order" check reports work that is already done, every night, until nobody reads it',
    find: 'db.from("qr_refunds_needed").select("id", { count: "exact", head: true }).eq("resolved", false),',
    replace: 'db.from("qr_refunds_needed").select("id", { count: "exact", head: true }),',
  },
  {
    id: "pilot/an-absent-promo-row-reported-as-a-live-campaign",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: 'P5 (blind pass, then corrected once PILOT15 actually went live on prod) — a missing row and a live one are DIFFERENT SENTENCES on the sheet. Collapse them and a code that was never inserted, or was switched off, reports a confident "0 discounts given", which reads as a claim about the guests rather than about the campaign. The row is QUOTED, never judged: whether a code applies is `mms_promo_check`\'s decision and a second copy of it on a reporting surface is the drift the W17 rules forbid',
    find: "        : { exists: false },",
    replace: "        : { exists: true, active: true, used: 0, maxUses: null, validUntil: null },",
  },
  {
    id: "pilot/a-campaign-state-change-deletes-tonights-measurement",
    file: "apps/qr/lib/pilot-night.ts",
    suite: "lib/pilot-night.test.ts",
    why: "P5 (pre-merge blind pass, CRITICAL) — `active = false` is the pilot's documented emergency off-switch, and the first cut decided show-vs-suppress in JSX as `exists && active`. Pull that lever at 20:00 on a day that already took N redemptions and the 9pm sheet shows NO participation figure at all — on the one evening something changed. `PILOT_PLAN.md` §3 says the redemption count IS the participation count. A measured non-zero is never erased by a fact about the campaign; the state prints beside it",
    find: 'if (redemptionsToday > 0 || state === "live")',
    replace: 'if (state === "live")',
  },
  {
    id: "pilot/a-suppressed-zero-becomes-a-claim-about-the-guests",
    file: "apps/qr/lib/pilot-night.ts",
    suite: "lib/pilot-night.test.ts",
    why: 'P5 — the other direction of the same rule. Showing `0` under a switched-off or absent campaign is TRUE and misleading at once: it reads as "nobody used it" (about the guests) when the honest sentence is "it was not discounting anything" (about the campaign). Those call for opposite actions at 9pm',
    find: '  if (redemptionsToday > 0 || state === "live")',
    replace: "  if (true)",
  },
  {
    id: "pilot/the-day-window-is-re-derived-instead-of-adopted",
    file: "apps/qr/lib/pilot.ts",
    suite: "lib/pilot-read.test.ts",
    why: 'P5 — the register derives the service day for the takings it hands over, and this sheet ADOPTS that instant rather than calling `laDayStartIso(new Date())` again. Two derivations of one value is the W17 "name it ONCE" shape, and here the two calls happen at different instants: a sheet opened as the clock crosses midnight would bucket the money into one service day and the counts beside it into the next, with nothing on screen saying so',
    find: "  const sinceIso = cash.sinceIso;",
    replace: "  const sinceIso = new Date(Date.parse(cash.sinceIso) - 3600_000).toISOString();",
  },
  {
    id: "glossary/a-burmese-word-inside-an-english-sentence-loses-its-mark",
    file: "apps/qr/lib/glossary.ts",
    suite: "lib/glossary.test.ts",
    why: 'P5 (deep pass, a11y) — the lock REASONS are English sentences carrying a Burmese word (`STAFF_SETTLED["kds.title"]` embeds မီးဖိုချောင်), and the sheet rendered them in a span with no `lang` and no font rule. On the one surface whose entire purpose is judging Burmese typography, that word fell outside Padauk and `--lh-my` and was announced in an English voice. Marking the WRAPPER instead is the opposite error — an English sentence announced in Burmese — so the mark belongs on the RUN, which is the same rule `Chrome.tsx` §3 and `TicketText.tsx`\'s hole rule already state',
    find: "    .map((text) => ({ text, my: MYANMAR.test(text) }));",
    replace: "    .map((text) => ({ text, my: false }));",
  },
  {
    id: "glossary/latin-values-announced-as-burmese",
    file: "apps/qr/lib/glossary.ts",
    suite: "lib/glossary.test.ts",
    why: "P5 — four dictionary values are Latin BY OWNER DECISION (the station chips All/Wok/Cold/Drinks, kept Latin because a wrong Burmese word there hides tickets). Mark them `lang=\"my\"` and each is typeset in Padauk and announced to a screen reader as Burmese — the defect `TicketText.tsx`'s hole rule exists for, already caught once in review on `ReadyBoard`. The rule lives in `lib/` rather than the page's JSX precisely so a VALUE can falsify it",
    find: '  return MYANMAR.test(value) ? "my" : undefined;',
    replace: '  return "my";',
  },
  // ── P6 · the kitchen pulse band on the same wall TV ─────────────────────────────────────────────
  // The board's second section publishes to the SAME public screen as the first, so every rule below
  // is an exposure rule or an honesty rule, and each is falsifiable by a value.
  {
    id: "pulse/rail-published-below-the-exposure-floor",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: 'P6 — the all-day rail and the table strip are safe apart and not together. With ONE live ticket the rail IS that ticket\'s order and the strip names its table, so the wall would state "Table 2 is having Mohinga ×2" — the exact fact this slice says may not cross. Publishing unconditionally is the whole defect, and it looks like a simplification',
    find: "  const railOpen =\n    cookingSessions.size >= PULSE_RAIL_MIN_PARTIES &&\n    (cookingTables === 0 || ranked.length >= PULSE_RAIL_MIN_DISHES);",
    replace: "  const railOpen = true;",
  },
  {
    id: "pulse/table-allowlist-becomes-a-blacklist",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the same shape the orders half already carries a mutant for, pointed the other way. Naming the modes to EXCLUDE means the day `table_sessions.mode`'s CHECK gains a fourth value that means table service, its tables appear on a public wall with nobody having decided that. An unknown mode belongs off the wall, not on it",
    find: "    if (!tableModes.has(sess.mode)) continue;",
    replace: '    if (sess.mode === "pickup" || sess.mode === "scango") continue;',
  },
  {
    id: "pulse/second-table-mode-escapes-the-liveness-test",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the LOAD loop and the STRIP loop ask different questions and are coupled only by sharing one set. Spelled from the dine-in constant instead, a SECOND table mode (a numbered bar counter) routes to the `paid` arm, which applies no session-status test at all — so a CLEARED session of that mode reaches both the load figures and the public strip, which is the defect the strip's own deleted guard used to catch. The set is a defaulted PARAMETER precisely so this proposition is reachable while the set still has one member",
    find: "    const dineIn = tableModes.has(sess.mode);",
    replace: "    const dineIn = sess.mode === PULSE_DINEIN_MODE;",
  },
  {
    id: "pulse/held-line-reads-as-cooking",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — a future `fire_at` is either a scheduled pickup the kitchen has not started or a dine-in send still inside its 10-second undo grace. Counting it puts a table on a public wall for an order its own diner can still pull back, and inflates the load figure with food nobody is cooking. `lib/kitchen.ts` applies the identical comparison for the identical reason",
    find: "    if (fireMs > nowMs) continue;",
    replace: "    if (false) continue;",
  },
  {
    id: "pulse/unplaceable-line-counted-anonymously",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: 'P6 — a line whose session did not come back is a row we could not place, not a row that belongs. Counting it anyway makes the aggregate half of this payload disagree with the allowlisted half about what a missing row means, and the board already has one live defect from exactly that reading ("publish what is known to belong, never what was merely not seen")',
    find: "    if (!sess) continue; // unplaceable — never counted, never published",
    // ⚠️ NOT `if (false) continue;`, which was the first form and is what the pre-merge blind pass
    // called degenerate — and correctly. With the guard removed `sess` is `undefined` and the very
    // next use of `sess.mode` THROWS, so the suite reddened on a TypeError: the mutant measured the
    // crash, not the rule, and no fixture ever separated the two readings by a VALUE. The mutation
    // is now the plausible wrong implementation the `why` below actually describes — count the row
    // anyway, we just cannot place it — which the fixture separates as `tickets: 1` vs `0`.
    replace: "    if (!sess) { cookingCarts.add(l.cart_id); continue; }",
  },
  {
    id: "pulse/served-food-counted-as-load",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the rail states the wok's remaining obligation, so a bumped line must leave it. Widening the state set to everything-but-voided both overstates that obligation and destroys `ready` outright (a served line then reads as cooking), which is two wrong statements on a wall from one loosened predicate",
    find: "    if (PULSE_COOKING_STATES.has(l.state)) {",
    replace: '    if (l.state !== "voided") {',
  },
  {
    id: "pulse/pass-linger-unbounded",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — `up` is an announcement, and an announcement has a life. Unbounded, a table reads `Food up` from the bump until it pays — half an hour of a wall repeating a call nobody still needs, which is how a screen stops being read at all",
    find: "      if (Number.isFinite(bumpedMs) && bumpedMs >= passFloorMs) passSessions.add(cart.session_id);",
    replace: "      if (Number.isFinite(bumpedMs)) passSessions.add(cart.session_id);",
  },
  {
    id: "pulse/cooking-loses-to-food-up",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — one table carries a just-bumped first course and an already-fired second. `up` winning sends a runner to the pass for a plate still on the wok. ⚠️ This mutant SURVIVED its first fixture, which put the two states on two different sessions: the later cooking row overwrote the earlier one under both readings, so the polarity never mattered. One session holding both is the input that separates them",
    find: '    const next: PulseTableStatus = cooking ? "cooking" : "up";',
    replace: '    const next: PulseTableStatus = up ? "up" : "cooking";',
  },
  {
    id: "pulse/re-seat-overwrites-cooking",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the OTHER half of the same rule, and the half the ternary cannot express. Two sessions can share one table number across a re-seat, and the map is walked in insertion order; without this guard whichever row lands last wins, so a wall says `Food up` for a number whose new party's food is still on the wok. A rule that depends on read order is not a rule",
    find: '    if (byTable.get(sess.table_number) === "cooking") continue;',
    replace: "    if (false) continue;",
  },
  {
    id: "pulse/cleared-table-counted-as-live-load",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6, the blind pass's CRITICAL — this arm was MISSING while this module, the CHANGELOG and an OPEN-ITEMS row all claimed the load figures used the KDS's test. A dine-in table pays (cart open→PAID), one line is never bumped, staff clear the table — and `clearTable` cancels only the OPEN cart before closing the session, so that line survives. Without this the wall counts it as live kitchen work for 24 hours, ageing `Oldest` toward 1440, while the KDS beside it correctly shows nothing",
    find: "      if (sess.status !== PULSE_LIVE_SESSION_STATUS) continue; // cleared/closed table",
    replace: "      if (false) continue;",
  },
  {
    id: "pulse/unpaid-non-dinein-food-counted",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the other half of the pass's rule. `lib/kitchen.ts`: \"a pre-payment fired line on an open pickup cart is an edge no diner surface produces — skip rather than cook unpaid food.\" Drop it and the wall counts food the kitchen is not cooking, so its number is a different figure wearing the same label as the KDS's",
    find: '    } else if (cart.status !== "paid") {',
    replace: "    } else if (false) {",
  },
  {
    id: "pulse/exposure-floor-counts-carts-not-parties",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the floor asks how many PARTIES the rail could be attributed to, and one party can hold two carts (a paid cart with unbumped lines beside a fresh open one). Counting carts lets two parties look like three and opens the rail one party early, which is precisely the state the floor exists to prevent: one table number beside a rail that is substantially that table's order",
    find: "    cookingSessions.size >= PULSE_RAIL_MIN_PARTIES &&",
    replace: "    cookingCarts.size >= PULSE_RAIL_MIN_PARTIES &&",
  },
  {
    id: "pulse/one-row-rail-names-every-cooking-table",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6, the blind pass's CRITICAL — the party floor was the ONLY term for four commits, and a party count cannot express attribution. With one rail row every counted party's cooking content IS that dish, so every `cooking` number on the strip is named by it in a single frame, at any party count: `3 Cooking · Table 4 Cooking · All day — Mohinga x4`. Three parties all ordering mohinga in a lull is the ordinary case, not the adversarial one. Dropping the term restores exactly the shipped defect, and it looks like a simplification",
    find: "    (cookingTables === 0 || ranked.length >= PULSE_RAIL_MIN_DISHES);",
    replace: "    true;",
  },
  {
    id: "pulse/diversity-floor-withholds-with-nothing-to-attribute",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the OTHER direction, and the one a rail-only fix gets wrong. The exposure is the rail x strip JOIN: with no `cooking` row on the strip a one-row rail names nobody (an `up` row's dish left `dishes` at the bump), so withholding it there protects nothing and costs a pickup-only kitchen its all-day view during the exact rush the band exists for. Over-withholding is a defect too, and it is the invisible kind",
    find: "cookingTables === 0 || ",
    replace: "",
  },
  {
    id: "pulse/unregistered-sticker-published-as-a-table",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — `table_sessions.table_number` is nullable and a dine-in session started at an unregistered sticker genuinely has none. Without this guard the strip publishes a row whose number is `null`, which renders as a table nobody can find and states a fact the session does not carry",
    find: "    if (sess.table_number === null) continue;",
    replace: "    if (false) continue;",
  },
  {
    id: "pulse/idle-table-published",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — a seated table with nothing fired and nothing just out has no kitchen state to report. Publishing it anyway puts every occupied table number on a public wall with a status the data does not support, and turns the strip from a kitchen signal into a seating chart",
    find: "    if (!cooking && !up) continue;",
    replace: "    if (false) continue;",
  },
  {
    id: "pulse/oldest-age-rounds-up",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — a wall must not round a 7m59s wait up to 8 and call a ticket late against the KDS's 8-minute amber threshold. ⚠️ This rule had NO guard on the first pass because every fixture offset was a whole minute, so floor, ceil and round answered identically — a degenerate fixture by this repo's own definition",
    find: "      ? Math.floor((nowMs - oldestFiredMs) / 60_000)",
    replace: "      ? Math.round((nowMs - oldestFiredMs) / 60_000)",
  },
  {
    id: "pulse/ghost-table-pinned-to-the-wall",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — `status = 'active'` alone is the KDS's liveness test and it is not enough for a PUBLIC screen. Nothing closes an abandoned session (`app/api/session/route.ts`: there is no background sweeper) and nothing extends the 4-hour TTL, past which `is_member` refuses the diners themselves — so a dead table with one unbumped line keeps its number on a dining-room wall indefinitely. The floor board, which owns table state, has always paired the two predicates",
    find: "    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue;",
    replace: "    if (false) continue;",
  },
  {
    id: "pulse/withheld-rail-still-counts-its-dishes",
    file: "apps/qr/lib/board-pulse.ts",
    suite: "lib/board-pulse.test.ts",
    why: "P6 — the overflow count exists so a capped rail never truncates in silence. Publishing it while the rail is WITHHELD leaks a fact drawn from exactly the data the floor is withholding: how many distinct dishes the one or two live tickets ordered",
    find: "    allDayMore: railOpen ? ranked.length - allDay.length : 0,",
    replace: "    allDayMore: ranked.length - allDay.length,",
  },
  {
    id: "board/pulse-outage-reads-as-an-empty-kitchen",
    file: "apps/qr/app/api/board/route.ts",
    suite: "app/api/board/route.test.ts",
    why: 'P6 — the pulse degrades to `null` rather than 503ing the whole board, and `null` is what makes that safe: it is the screen\'s cue to say it cannot read the kitchen. Shaping a pulse from the empty arrays a failed read leaves behind publishes `tickets: 0` — an "all clear" band over a full wok, which is the exact lie `lib/kitchen.ts` returns `outage` to avoid one screen over',
    find: "  const pulseReadable = !linesRes.error && !cartsRes.error;",
    replace: "  const pulseReadable = true;",
  },
  {
    id: "pulse/english-dish-name-wears-a-burmese-mark",
    file: "apps/qr/components/ReadyBoard.tsx",
    suite: "components/ReadyBoard.test.tsx",
    why: 'P6 — the render rule no data-layer guard can see, and the one P1\'s blind pass rejected twice on the ticket. `nameMy: null` means the rail shows the English snapshot ALONE; dropping the null check marks that English word `lang="my"`, which typesets it in Padauk and announces it as Burmese on the one staff screen guests read',
    find: '  const my = lang === "my" && dish.nameMy !== null;',
    replace: '  const my = lang === "my";',
  },
  {
    id: "board/stale-wait-keeps-ticking",
    file: "apps/qr/components/ReadyBoard.tsx",
    suite: "components/ReadyBoard.test.tsx",
    why: "Codex round 1 on A4·1 (P2): `readyMinutes` is a server-derived AGE and rots exactly as the pulse's do — carried through an outage, a bag reads `5 min` an hour later beside a note saying the board is reconnecting. The name and code stay (they do not rot); the count goes with the band",
    find: "      {wait !== null && !stale && (",
    replace: "      {wait !== null && (",
  },
  {
    id: "pulse/stale-board-keeps-announcing-the-pass",
    file: "apps/qr/components/ReadyBoard.tsx",
    suite: "components/ReadyBoard.test.tsx",
    why: 'P6 — the stale fold keeps `kind: "live"` and carries the whole snapshot forward, which is right for a name and a pickup code and wrong for every value in this band. Drop the `stale` term and forty minutes into an outage the wall still reads `9 Oldest (min)` and a lit-gold `Table 3 · Food up`, sending a runner to the pass for a plate that went out half an hour ago — and the five-minute linger that exists to prevent exactly that is enforced SERVER-side, so it lapses the moment the server stops answering. It reads like a simplification of a redundant condition',
    find: '        pulse={state.kind === "live" && !state.stale ? state.pulse : null}',
    replace: '        pulse={state.kind === "live" ? state.pulse : null}',
  },

  // ── P3 · the staff promo door (apply + remove) and the merge refusal it makes true ──────────────
  // Two new authority surfaces and one that was never guarded at all. `lib/staff-promo.ts` is the
  // SECOND writer of `qr_carts.promo_code` and the FIRST that can clear it, so every predicate
  // `applyPromo` carries has to be carried here too — the pin these statements null is what a
  // captured charge reconciles against. Every freeze predicate is mutated in BOTH directions,
  // because the first draft of this module over-blocked on the settle axis and three blind auditors
  // rejected it: an under-blocking mutant alone would have called that draft correct.
  // `lib/floor.ts` had ZERO mutants before this block while matching two money markers, shielded
  // only by an unrelated file-level exemption; the merge refusal it now guards is the one rule
  // standing between a merge and a re-derived discount priced against a subtotal the guest was
  // never quoted.
  {
    id: "staff-promo/apply-ignores-the-pay-lock",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "P3 \u2014 the staff apply re-tests the freeze in the statement that WRITES, for the same reason applyPromo does (M70): the pre-check is read before awaited round trips, long enough for a diner to reach the pay screen and pin the grant. Gated on status alone this clears a LIVE attempt's pin, and the webhook then re-derives an amount the capture cannot match",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n',
  },
  {
    id: "staff-promo/apply-ignores-the-settlement-freeze",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "P3 \u2014 the split-tender freeze is the other half of the same window and it is TABLE-WIDE: every member's cart is frozen while the table pays in turn. Without this term a staff apply lands mid-settlement, against holds already authorized under the old amount",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
  },
  {
    id: "staff-promo/apply-settle-check-ignores-the-ttl",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the OVER-blocking direction on the settle axis, and this is not hypothetical \u2014 `settle_at IS NULL` is the form the FIRST draft of this module shipped and three blind auditors rejected. `settle_at` is only ever nulled by a CLEAN release, so an abandoned split (abortSettlement has one caller, the diner's own host UI) or a terminal decline whose release write failed refuses BOTH promo doors for the life of the cart \u2014 while `canWrite` stays TTL-aware and renders the control enabled. It also re-opens P2e: the merge refusal points at a remove that is itself refused",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .is("settle_at", null)\n',
  },
  {
    id: "staff-promo/apply-replaces-a-quoted-code",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the register's view is a 5s poll, so a diner can apply a code on their own phone while a server has the now-stale apply form open. Without this term the server's tap SILENTLY REPLACES a code the guest was already quoted \u2014 a different discount on the bill with no trace of the swap, on the one surface where a guest is told a number out loud",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n',
  },
  {
    id: "staff-promo/apply-refuses-a-reapply-of-the-same-code",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the OVER-blocking half of the same term. `eq.${normalized}` is what keeps re-applying the SAME code working, and a re-apply is how a server clears a grant pinned for the code already on the cart (M70: `mms_pin_promo_grant` only pins when null). A bare `is null` refuses it and leaves the pin OUTRANKING the code it belongs to \u2014 a discount nothing on any surface can explain",
    find: "    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n",
    replace: '    .is("promo_code", null)\n',
  },
  {
    id: "staff-promo/apply-ignores-the-live-intent",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "M152 (a) through the staff door \u2014 the freeze predicates are deliberately TTL-aware, so five minutes after a captured intent whose webhook is merely late they pass. Without the link gate a staff apply then moves the pin that capture reconciles against: a charged card and no order. For the REMOVE it is worse, because dropping the code RAISES the total the webhook re-derives",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .is("live_payment_intent_id", null);\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .eq("id", cart.id);\n',
  },
  {
    id: "staff-promo/apply-not-status-guarded",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the status guard belongs IN the SQL statement, not only in the client (CLAUDE.md's money rule). Without it a staff apply rewrites the promo on a cart that has already been fulfilled or cancelled \u2014 a discount edit against a settled order",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n',
  },
  {
    id: "staff-promo/apply-lock-check-ignores-the-ttl",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "OVER-blocking is as expensive as under-blocking (the tip-cap lesson). A lock is only real while `locked_at` is inside CART_LOCK_TTL \u2014 `locked = true` with a stale or null timestamp is an abandoned pay screen. Reading the raw column refuses a legitimate apply for five minutes at the counter, on the table the pilot script has Dad applying a code at",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false`)\n',
  },
  {
    id: "staff-promo/apply-drops-the-exact-count",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: '`{ count: "exact" }` is not decoration on the option bag \u2014 PostgREST only sends `Content-Range` when the request ASKS for a count, so without it `count` is null on every response, `(count ?? 0) === 0` fires on writes that succeeded, and every apply answers a refusal (whatever the diagnosis read then invents) while the cart actually moved. The row-count check below is worthless without the option that produces the row count',
    find: '    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n',
    replace: "    .update({ promo_code: normalized, promo_granted_cents: null })\n",
  },
  {
    id: "staff-promo/apply-blocked-write-reads-as-ok",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "`.update()` returns no row count, so a write the predicates BLOCKED still answers ok (the W17 lesson). Without the count check the apply reports success to a server standing at the table while the cart never moved \u2014 and the money it implies changed did not",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id, { attempted: normalized }));\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n  void count;\n',
  },
  {
    id: "staff-promo/apply-transport-error-reads-as-a-refusal",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "a dropped socket is not a verdict about the cart. Swallowing `updErr` sends the apply on to the diagnosis read, which finds an open, unfrozen cart and answers `cart_closed` \u2014 a fabricated diagnosis of exactly the M116/M119 shape, told to a server whose tap actually hit a network failure",
    find: '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n',
    replace:
      '    // M70 \u2014 a new code voids any grant pinned for the OLD one, in the SAME statement as the code\n    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale\n    // grant left here would silently outrank the code just applied).\n    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    // Never OVER another code \u2014 see the docblock. `eq.${normalized}` keeps a re-apply of the same\n    // code working (it is the pin refresh); a different one is refused and pointed at the remove.\n    .or(`promo_code.is.null,promo_code.eq.${normalized}`)\n    .is("live_payment_intent_id", null);\n  void updErr;\n',
  },
  {
    id: "staff-promo/apply-diagnosis-forgets-the-attempted-code",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the write and its explanation have to agree. The non-replacement predicate is invisible from inside `refusedPromoReason`, so without the attempted code it falls through every branch and answers `cart_closed` on a cart that is demonstrably OPEN \u2014 the M116/M119 fabricated verdict, told to a server whose recovery (Remove) is one tap away on the same card",
    find: "  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id, { attempted: normalized }));\n",
    replace: "  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id));\n",
  },
  {
    id: "staff-promo/apply-rate-keyed-by-the-table",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "STAFF_PROMO_RATE is keyed by the CALLING staff account, never by the table. Re-keyed to the session, one griefing table \u2014 or one server fat-fingering codes at it \u2014 spends a budget that then refuses the register's apply at every OTHER table, which is over-blocking on the surface the pilot depends on. Keyed by the caller it bounds exactly the thing it is for: a stolen staff cookie scanning the code space",
    find: '  if (!(await withinStaffPromoRate(gate.staffId))) return no("rate_limited");\n',
    replace: '  if (!(await withinStaffPromoRate(sessionId))) return no("rate_limited");\n',
  },
  {
    id: "staff-promo/apply-keeps-the-old-grant",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "M70 \u2014 a new code must void any grant pinned for the OLD one, in the SAME statement so the two cannot drift. `mms_pin_promo_grant` only pins when null, so a stale grant left here silently OUTRANKS the code just applied: `mms_promo_discount` returns the pin verbatim and the register charges a discount the new code never earned",
    find: '    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })\n',
    replace: '    .update({ promo_code: normalized }, { count: "exact" })\n',
  },
  {
    id: "staff-promo/apply-lowercases-the-code",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the code is stored as the lookup key. `mms_promo_discount_live` reads `promo_codes` by the value in `qr_carts.promo_code` verbatim and the rows are upper-case, so a lower-case write prices at ZERO on every surface \u2014 with no error anywhere, because a missing row is a 0 discount by contract. It also breaks the non-replacement predicate, which compares against the NORMALIZED value, so a legitimate re-apply is refused too",
    find: "  const normalized = code.toUpperCase();\n",
    replace: "  const normalized = code;\n",
  },
  {
    id: "staff-promo/apply-skips-the-validity-gate",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "`mms_promo_check` is the SINGLE apply-time gate \u2014 active, window, min-subtotal, global cap, per-session cap \u2014 and it returns its verdict as DATA because Next redacts thrown Server Action errors in prod. Testing only that a row came back accepts every invalid verdict it can produce: an expired code, an exhausted budget, a table that already redeemed it",
    find: '  if (!check?.valid) return no((check?.reason ?? "invalid") as StaffPromoReason);\n',
    replace: '  if (!check) return no("invalid");\n',
  },
  {
    id: "staff-promo/apply-swallows-the-validity-rpc-error",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "an unreadable gate is not an invalid code. Swallowing the RPC error leaves `check` undefined, the guard below answers `invalid`, and a server is told the pilot card in their hand is a bad code during an outage \u2014 the fabricated-diagnosis shape on the surface the pilot depends on",
    find: '  if (chkErr) return no("error");\n',
    replace: "  void chkErr;\n",
  },
  {
    id: "staff-promo/apply-is-unbounded",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "a Server Action is a public POST, so a stolen staff cookie is all a code-space scan needs. The diner door is bounded at 10 attempts per 5 minutes; without this gate the staff door is the weaker entrance to the same secret, and the code space can be enumerated as fast as the network allows",
    find: '  if (!(await withinStaffPromoRate(gate.staffId))) return no("rate_limited");\n',
    replace: "  void withinStaffPromoRate;\n",
  },
  {
    id: "staff-promo/apply-ignores-the-split-mutex",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the UPDATE's predicates cannot see an AUTHORIZED SPLIT SHARE on a cart whose settlement freeze has already gone stale \u2014 `captureAllIfReady` deliberately captures on a stale freeze once the table is covered, and the freeze predicate above is TTL-aware, so the row passes. `paymentInFlightReason` is the only gate that knows, and without it the promo moves under captured cards",
    find: '  if (await paymentInFlightReason(cart)) return no("locked");\n\n  const db = serviceClient();\n  const { data: rows, error: chkErr } = await db.rpc("mms_promo_check", {\n',
    replace:
      '  void paymentInFlightReason;\n\n  const db = serviceClient();\n  const { data: rows, error: chkErr } = await db.rpc("mms_promo_check", {\n',
  },
  {
    id: "staff-promo/clear-ignores-the-pay-lock",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "P3 \u2014 the staff remove re-tests the freeze in the statement that WRITES, for the same reason applyPromo does (M70): the pre-check is read before awaited round trips, long enough for a diner to reach the pay screen and pin the grant. Gated on status alone this clears a LIVE attempt's pin, and the webhook then re-derives an amount the capture cannot match",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n',
  },
  {
    id: "staff-promo/clear-ignores-the-settlement-freeze",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "P3 \u2014 the split-tender freeze is the other half of the same window and it is TABLE-WIDE: every member's cart is frozen while the table pays in turn. Without this term a staff remove lands mid-settlement, against holds already authorized under the old amount",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
  },
  {
    id: "staff-promo/clear-settle-check-ignores-the-ttl",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the OVER-blocking direction, and on the REMOVE it is the one that re-opens P2e outright: `mergeTables` refuses with 'remove it here first', so a remove that a stale freeze refuses for the life of the cart leaves the table unable to remove the code OR merge, from any staff surface. `settle_at` is nulled only by a clean release, and an abandoned split leaves it set forever",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .is("settle_at", null)\n',
  },
  {
    id: "staff-promo/clear-ignores-the-live-intent",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "M152 (a) through the staff door \u2014 the freeze predicates are deliberately TTL-aware, so five minutes after a captured intent whose webhook is merely late they pass. Without the link gate a staff remove then moves the pin that capture reconciles against: a charged card and no order. For the REMOVE it is worse, because dropping the code RAISES the total the webhook re-derives",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .is("live_payment_intent_id", null);\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .eq("id", cart.id);\n',
  },
  {
    id: "staff-promo/clear-not-status-guarded",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the status guard belongs IN the SQL statement, not only in the client (CLAUDE.md's money rule). Without it a staff remove rewrites the promo on a cart that has already been fulfilled or cancelled \u2014 a discount edit against a settled order",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n',
  },
  {
    id: "staff-promo/clear-lock-check-ignores-the-ttl",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "OVER-blocking is as expensive as under-blocking (the tip-cap lesson). A lock is only real while `locked_at` is inside CART_LOCK_TTL \u2014 `locked = true` with a stale or null timestamp is an abandoned pay screen. Reading the raw column refuses a legitimate remove for five minutes at the counter, and the remove is the recovery the merge refusal points at",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false`)\n',
  },
  {
    id: "staff-promo/clear-drops-the-exact-count",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "same as the apply's: without the option PostgREST sends no `Content-Range`, `count` is null on every response, and a remove that actually cleared the code answers a refusal instead \u2014 which on this door reads as the P2e dead end returning",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n',
    replace: "    .update({ promo_code: null, promo_granted_cents: null })\n",
  },
  {
    id: "staff-promo/clear-blocked-write-reads-as-ok",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "`.update()` returns no row count, so a write the predicates BLOCKED still answers ok (the W17 lesson). Without the count check the remove reports success to a server standing at the table while the cart never moved \u2014 and the money it implies changed did not",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id));\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n  void count;\n',
  },
  {
    id: "staff-promo/clear-transport-error-reads-as-a-refusal",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "a dropped socket is not a verdict about the cart. Swallowing `updErr` sends the remove on to the diagnosis read, which finds an open, unfrozen cart and answers `cart_closed` \u2014 a fabricated diagnosis of exactly the M116/M119 shape, told to a server whose tap actually hit a network failure",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .is("live_payment_intent_id", null);\n  if (updErr) return no("error");\n',
    replace:
      '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n    .eq("id", cart.id)\n    .eq("status", "open")\n    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)\n    .is("live_payment_intent_id", null);\n  void updErr;\n',
  },
  {
    id: "staff-promo/clear-keeps-the-pin",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "OPEN-ITEMS P2e \u2014 `mms_promo_discount` returns `promo_granted_cents` VERBATIM whenever it is non-null and only then falls through to the live derivation. Clearing the code alone therefore leaves the pinned discount in force with no code behind it: a saving nothing on any surface can explain, surviving until the cart closes",
    find: '    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })\n',
    replace: '    .update({ promo_code: null }, { count: "exact" })\n',
  },
  {
    id: "staff-promo/clear-writes-on-an-empty-cart",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the remove is deliberately unbounded (no rate gate \u2014 it is the recovery the merge refusal points at), so an UNCONDITIONAL write turns every tap into a `qr_carts` realtime broadcast to the whole table, a PostHog event and two `revalidatePath`s, on a cart where nothing changed. Answering ok is idempotence; WRITING to say so is amplification, and the row state afterwards is identical either way \u2014 which is why the suite counts the writes",
    find: "  if (cart.promo_code === null && cart.promo_granted_cents === null) return { ok: true };\n",
    replace: "",
  },
  {
    id: "staff-promo/clear-short-circuits-on-a-lone-pin",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the short-circuit is `code === null AND pin === null`, not `code === null`. A pinned grant with no code behind it is exactly the state `mms_promo_discount` returns VERBATIM \u2014 the P2e ghost discount \u2014 so skipping the write there leaves a saving nothing can explain until the cart closes, which is the defect this whole action exists to remove",
    find: "  if (cart.promo_code === null && cart.promo_granted_cents === null) return { ok: true };\n",
    replace: "  if (cart.promo_code === null) return { ok: true };\n",
  },
  {
    id: "staff-promo/clear-ignores-the-split-mutex",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the remove needs the mutex MORE than the apply does: it RAISES the total the webhook re-derives, so running one over an authorized or captured share is a charge that can never reconcile again. The UPDATE's predicates cannot see a share on a cart whose settlement freeze has gone stale, and `captureAllIfReady` deliberately captures in exactly that state",
    find: '  if (await paymentInFlightReason(cart)) return no("locked");\n  // Nothing to clear \u2192 ok, without writing. See the docblock: idempotent, but not an amplifier.\n',
    replace:
      "  // Nothing to clear \u2192 ok, without writing. See the docblock: idempotent, but not an amplifier.\n",
  },
  {
    id: "staff-promo/clear-becomes-rate-limited",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the asymmetry is DELIBERATE and this is the refactor that would erase it 'for symmetry'. A remove carries no guessable secret, so there is nothing to enumerate \u2014 and it is the RECOVERY path the merge refusal points at, so a server rate-limited out of removing a promo is rate-limited out of merging the table too. Over-blocking is as expensive as under-blocking",
    find: '  const { sessionId } = parsed.data;\n\n  const { session, cart, unavailable } = await openCartFor(sessionId);\n  if (unavailable) return no("outage");\n  if (!session) return no("table_closed");\n  if (!cart) return no("no_order");\n',
    replace:
      '  const { sessionId } = parsed.data;\n  if (!(await withinStaffPromoRate(gate.staffId))) return no("rate_limited");\n\n  const { session, cart, unavailable } = await openCartFor(sessionId);\n  if (unavailable) return no("outage");\n  if (!session) return no("table_closed");\n  if (!cart) return no("no_order");\n',
  },
  {
    id: "staff-promo/outage-reads-as-signin",
    file: "apps/qr/lib/staff-promo.ts",
    suite: "lib/staff-promo.test.ts",
    why: "W10b \u2014 an unreadable identity is not a signed-out one. Collapsing `unavailable` into the sign-in ask is the loop that ends in a destroyed board mid-service: the tablet is working, the staff member is signed in, and the console tells them to sign in again",
    find: '  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };\n',
    replace: '  if (auth.kind === "unavailable") return { ok: false, reason: "signin" };\n',
  },
  {
    id: "cart/promo-diagnosis-ignores-the-code-already-applied",
    file: "apps/qr/lib/promo-refusal.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the OTHER half of the non-replacement rule, and the half a reader trusts: with the write correctly refused, a diagnosis that cannot see the existing code falls through to `cart_closed` on an open, unfrozen cart. That is the M116/M119 fabricated verdict, and it is worse than usual here because the true answer names a recovery (Remove) the false one hides",
    find: '  if (opts?.attempted && cart.promo_code && cart.promo_code !== opts.attempted)\n    return "code_applied";\n',
    replace: "",
  },
  {
    id: "rate/staff-promo-shares-the-mutate-bucket",
    file: "apps/qr/lib/rate.ts",
    suite: "lib/rate.test.ts",
    why: "`mms_rate_limit` counts within `(bucket, key)`, so two wrappers naming one bucket silently share ONE budget \u2014 and every wrapper here has the same signature and the same return type, so nothing but this catches it. Folded into `mutate` (the tempting refactor, since a staff apply is 'a cart write'), a diner's own edits spend the register's promo budget and a busy table can rate-limit the counter out of applying the pilot code",
    find: '    "staffpromo",\n',
    replace: '    "mutate",\n',
  },
  {
    id: "rate/check-fails-closed",
    file: "apps/qr/lib/rate.ts",
    suite: "lib/rate.test.ts",
    why: "FAIL-OPEN is a decision this module states in prose and nothing proved: a limiter GLITCH must never strand a legit diner mid-order, because the hard invariants (status guards, server-derived money, the DB caps) hold regardless. Flipped, one bad RPC 429s every join, every cart edit, every receipt send and the register's promo apply at once \u2014 an outage in the limiter becomes an outage in the product",
    find: "    return true; // fail-open: never block a legit diner on a limiter error\n",
    replace: "    return false;\n",
  },
  {
    id: "staff-promo/apply-code-charset-unbounded",
    file: "packages/db/src/schemas.ts",
    suite: "lib/staff-promo.test.ts",
    why: "the staff apply INTERPOLATES this value into a PostgREST `or()` term list (`promo_code.eq.${normalized}`, the non-replacement predicate), so a code carrying a comma or a parenthesis splits the list and 400s the whole UPDATE \u2014 a real owner-created code that then fails PERMANENTLY at the register while the diner door, which has no such disjunct, applies it fine. `lock.ts:491-492` justifies the identical interpolation on the grounds that its value is Stripe-generated and never a client string; this one IS a client string, so the bound lives here",
    find: "  code: z\n    .string()\n    .trim()\n    .min(1)\n    .max(40)\n    .regex(/^[A-Za-z0-9_-]+$/),",
    replace: "  code: z.string().trim().min(1).max(40),",
  },
  {
    id: "floor/detail-reads-a-settled-cart",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-detail-promo.test.ts",
    why: "the drill-down's cart read is status-guarded, and dropping the guard is invisible in the projection: a SETTLED cart's `promo_code` and `id` reach the detail, `StaffPromoControl` renders (it is gated on `cartId != null`, never on status), and the console announces a live discount on a table with no open order \u2014 while every tap on it is answered `no_order` by `applyPromoForTable`, which goes through the real `openCartFor`. The suite's fake used to discard filters entirely, so this line had no coverage at all",
    find: '      .select(\n        "id,locked,locked_at,settle_at,counter_requested_at,tab_type,tab_opened_at,intended_tip_cents,promo_code",\n      )\n      .eq("session_id", sessionId)\n      .eq("status", "open")\n      .maybeSingle(),',
    replace:
      '      .select(\n        "id,locked,locked_at,settle_at,counter_requested_at,tab_type,tab_opened_at,intended_tip_cents,promo_code",\n      )\n      .eq("session_id", sessionId)\n      .maybeSingle(),',
  },
  {
    id: "floor/detail-reads-the-wrong-status",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-detail-promo.test.ts",
    why: "the sibling of `detail-reads-a-settled-cart`, and the one that proves the suite's fake is filter-AWARE rather than merely filter-carrying: deleting the guard and INVERTING it are different mutations, and a fake that recorded filters without evaluating them would catch neither. Inverted, the drill-down reads the SETTLED order instead of the open one \u2014 every live table reports no cart, the promo row and the whole settle panel vanish mid-service, and `getTableDetail` answers about an order that is already paid",
    find: '      .select(\n        "id,locked,locked_at,settle_at,counter_requested_at,tab_type,tab_opened_at,intended_tip_cents,promo_code",\n      )\n      .eq("session_id", sessionId)\n      .eq("status", "open")\n      .maybeSingle(),',
    replace:
      '      .select(\n        "id,locked,locked_at,settle_at,counter_requested_at,tab_type,tab_opened_at,intended_tip_cents,promo_code",\n      )\n      .eq("session_id", sessionId)\n      .eq("status", "paid")\n      .maybeSingle(),',
  },
  {
    id: "floor/k21-phones-back-on-the-floor",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-dinein-only.test.ts",
    why: "K21 (Phase 0) \u2014 the floor is the ROOM. A to-go or scan-&-go phone mints a session the moment a diner opens the menu, and without the mode guard every one of them is drawn as a table card titled with its raw `pickup-<uuid>` code (27 of 33 cards, measured): the table count lies and the phones eat the session cap. The suite's fake EVALUATES `.eq()` on the session list, so the phones come back in the OUTCOME",
    find: '      .eq("mode", "dinein")\n      .gt("expires_at", nowIso)',
    replace: '      .gt("expires_at", nowIso)',
  },
  {
    id: "i18n/money-amount-hardcoded-in-the-dictionary",
    file: "apps/qr/lib/i18n/staff.ts",
    suite: "lib/i18n/strings.test.ts",
    why: "the numerals rule is TWO-sided \u2014 Burmese numerals in prose counts, Latin wherever a number is an identifier or an AMOUNT \u2014 and the \u1040\u2013\u1049 filter enforces only the first half. This is the exact evasion the pre-merge blind pass named: a hard-coded amount passes every other guard (no Myanmar digit, matching empty slot sets, Myanmar script still present) and ships on the sentence flagged K15-HIGH as the one a cashier reads out before taking cash. Money reaches these templates ONLY through the `{m}` slot, preformatted by `fmt()` from a server-derived figure, so a literal is by construction a number no code computed. \u26a0\ufe0f The mutant has to move the DICTIONARY, not the guard's own filter: blinding the filter makes the suite pass vacuously, which is a surviving mutant rather than a caught one",
    find: '  "promo.worth": { en: "{m} off this order", my: "\u1012\u102e\u1021\u1031\u102c\u103a\u1012\u102b {m} \u101c\u103b\u103e\u1031\u102c\u1037" },\n',
    replace:
      '  "promo.worth": { en: "$5 off this order", my: "\u1012\u102e\u1021\u1031\u102c\u103a\u1012\u102b $5 \u101c\u103b\u103e\u1031\u102c\u1037" },\n',
  },
  {
    id: "staff-promo-ui/submit-uses-native-disabled",
    file: "apps/qr/components/staff/StaffPromoControl.tsx",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "a natively-disabled button drops focus to `<body>` in a real browser, and jsdom does NOT reproduce it \u2014 `StaffLangSwitch` shipped exactly this with a green 'keeps focus' assertion over it for a whole PR, which is why its own source now carries a \u26a0\ufe0f about it. `aria-disabled` says the same thing and keeps the node in the focus order; the click it does not block is refused by the form's own submit guard",
    find: "              aria-disabled={busy !== null || !code.trim() || undefined}",
    replace: "              disabled={busy !== null || !code.trim()}",
  },
  {
    id: "staff-promo-ui/field-uses-native-disabled",
    file: "apps/qr/components/staff/StaffPromoControl.tsx",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "same focus rule on the FIELD, plus one more: `readOnly` also stops the value drifting under an apply that already read it, where `disabled` would silently clear the keyboard's place mid-request. The resting DOM cannot tell the two apart \u2014 `disabled={false}` renders no attribute at all \u2014 so this is only visible while a request is in flight",
    find: "              readOnly={busy !== null}",
    replace: "              disabled={busy !== null}",
  },
  {
    id: "staff-promo-ui/no-re-entry-guard",
    file: "apps/qr/components/staff/StaffPromoControl.tsx",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "`aria-disabled` does NOT block a click, so the guard inside `run` is the only thing between a double tap on REMOVE and two removes \u2014 the Remove button is a bare `onClick`, unlike the apply, which the form's submit handler already refuses. On a ref rather than on `busy` because the callback does not close over it and state is a render behind",
    find: "      if (busyRef.current) return;\n      busyRef.current = true;\n",
    replace: "",
  },
  {
    id: "staff-promo-ui/refusal-key-has-no-fallback",
    file: "apps/qr/components/staff/StaffPromoControl.tsx",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "seven of these reasons arrive as DATA from `mms_promo_check` and are CAST to the union, so a new `reason` string added in SQL reaches the table with no TypeScript error at all. Unguarded the lookup is `undefined`, `<Chrome k={undefined}>` throws INSIDE RENDER, and a mere refusal takes the whole drill-down to app/staff/error.tsx mid-service",
    find: 'REASON_KEY[reason] ?? "promo.err.error"',
    replace: "REASON_KEY[reason]",
  },
  {
    id: "staff-promo-ui/focus-latch-outlives-its-action",
    file: "apps/qr/components/staff/StaffPromoControl.tsx",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "the latch must be spent by the FIRST refresh after the action, matched or not. Consumed only on a MATCH it survives a degraded read and fires on the NEXT change instead \u2014 which can be minutes later and caused by someone else, so focus jumps out from under whatever the cashier is doing. Same class as the delivery repo's 'a ref latched in a cleanup must be re-armed at setup'",
    find: '    const want = awaiting.current;\n    if (!want) return;\n    awaiting.current = null;\n    if (want === "applied" && promoCode) appliedRef.current?.focus({ preventScroll: true });\n    else if (want === "cleared" && !promoCode) inputRef.current?.focus({ preventScroll: true });',
    replace:
      '    if (awaiting.current === "applied" && promoCode) {\n      awaiting.current = null;\n      appliedRef.current?.focus({ preventScroll: true });\n    } else if (awaiting.current === "cleared" && !promoCode) {\n      awaiting.current = null;\n      inputRef.current?.focus({ preventScroll: true });\n    }',
  },
  {
    id: "staff-promo-ui/zero-copy-promises-transience",
    file: "apps/qr/lib/i18n/staff.ts",
    suite: "components/staff/StaffPromoControl.test.tsx",
    why: "'right now' tells a cashier to wait for a saving that may never come: `mms_promo_discount_live` returns 0 for a code that is switched OFF or past `valid_until` \u2014 permanent \u2014 exactly as readily as for a void that dropped the basket under its minimum. Copy must promise only what the code keeps",
    find: "On the order, but it isn\u2019t taking anything off.",
    replace: "On the order, but worth nothing on it right now.",
  },
  {
    id: "floor/merge-carries-a-promo-across-carts",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-merge-promo.test.ts",
    why: "OPEN-ITEMS P2e / S1.4 — a merge re-parents server-priced lines into the TARGET cart, and the discount and per-line tax are re-derived per cart at settle. The source's code is tied to the closing session and its per-session redemption cap so it cannot follow, and recomputing the target's discount off the larger subtotal swings what a guest pays in either direction. Dropping the refusal is not a UX regression, it is a wrong charge — and floor.ts carried NO mutants at all before P3 while matching two money markers (measured: `paymentInFlightReason` and `unit_price_cents`)",
    find: '  if (src.cart.promo_code || tgt.cart.promo_code) {\n    const tgtName = tableDisplay({\n      tableNumber: tgt.session.table_number,\n      label: tgt.session.qr_code,\n    });\n    return {\n      ok: false,\n      error:\n        src.cart.promo_code && tgt.cart.promo_code\n          ? "Both tables have a promo code applied — remove them first, then merge. The discounts go with them, so re-apply on the merged table if a guest was quoted one."\n          : src.cart.promo_code\n            ? "This table has a promo code applied — remove it here first, then merge. The discount goes with it, so re-apply on the merged table if the guest was quoted it."\n            : // An unregistered sticker or a counter session has no tent number to name, so it gets the\n              // phrase the picker itself used rather than a raw `reg-…` token dressed up as a table.\n              `${tgtName.unregistered ? "The table you picked" : `Table ${tgtName.text}`} has a promo code applied — remove it there first, then merge. The discount goes with it, so re-apply on the merged table if the guest was quoted it.`,\n    };\n  }\n',
    replace: "",
  },
  {
    id: "floor/merge-refusal-names-the-wrong-table",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-merge-promo.test.ts",
    why: "the two arms are one keystroke apart and the refusal is the only thing telling a server where to go. Swapping them sends someone to the target table to remove a code the SOURCE carries — a dead end that reads like a working instruction, which is the shape P2e was filed for in the first place",
    find: '\n          ? "Both tables have a promo code applied — remove them first, then merge. The discounts go with them, so re-apply on the merged table if a guest was quoted one."\n          : src.cart.promo_code\n',
    replace:
      '\n          ? "Both tables have a promo code applied — remove them first, then merge. The discounts go with them, so re-apply on the merged table if a guest was quoted one."\n          : tgt.cart.promo_code\n',
  },
  {
    id: "floor/detail-drops-the-promo-code",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-detail-promo.test.ts",
    why: "P3 — the drill-down is where a cashier learns a discount is on the table BEFORE taking cash, and (since P2e) the only screen that can remove one. Dropping the field does not mis-charge anyone — the settle total is derived either way — it hides the discount from the person collecting the money and hides the remove control from the merge refusal that points at it",
    find: "    promoCode: cart?.promo_code ?? null,\n",
    replace: "    promoCode: null,\n",
  },
  {
    id: "floor/detail-quotes-the-combined-discount",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-detail-promo.test.ts",
    why: "the 'name it ONCE' rule, at the seam where it is easiest to lose: `discountCents` is promo PLUS reward (M22) and the two identifiers sit one line apart on the same object. Reading the wrong one tells a cashier the code is worth the whole discount, overstating the promo by the entire reward on any cart carrying one — a number a guest can be told out loud",
    find: "    settlePromoCents = settleTotals.promoCents;\n",
    replace: "    settlePromoCents = settleTotals.discountCents;\n",
  },
  // ── A6 · the team screen opened to managers (floor lowered, ceiling added) ──────────────────
  // Every write here goes through the service-role client and `staff` carries one RLS policy, a
  // SELECT — so these TypeScript refusals are the entire gate and a survivor is a live hole.
  {
    id: "staff-roles/ceiling-inverts",
    file: "apps/qr/lib/staff-roles.ts",
    suite: "lib/staff-role-ceiling.test.ts",
    why: "A6 \u2014 the ceiling read the wrong way round is the whole escalation in one character: a manager could reach an owner and an owner could reach nobody. It looks right at a glance because the SAME operator and the same two operands appear in `roleAtLeast` one function above, where the caller/floor order genuinely is reversed relative to caller/target \u2014 so the mutation is a plausible copy of the neighbour rather than a typo",
    find: "export function canActOn(callerRole: StaffRole, targetRole: StaffRole): boolean {\n  return RANK[callerRole] >= RANK[targetRole];\n}",
    replace:
      "export function canActOn(callerRole: StaffRole, targetRole: StaffRole): boolean {\n  return RANK[targetRole] >= RANK[callerRole];\n}",
  },
  {
    id: "staff-roles/ceiling-admits-a-peer-only",
    file: "apps/qr/lib/staff-roles.ts",
    suite: "lib/staff-role-ceiling.test.ts",
    why: "the tempting tightening: `>` reads as 'strictly above me is out of reach' and is one keystroke from the shipped rule. It silently forbids a manager from touching another manager and an owner from touching a co-owner \u2014 including the owner-on-owner deactivation the codebase has always allowed \u2014 so the screen grows read-only rows nobody can explain",
    find: "  return RANK[callerRole] >= RANK[targetRole];\n}\n\n/** Highest \u2192 lowest.",
    replace: "  return RANK[callerRole] > RANK[targetRole];\n}\n\n/** Highest \u2192 lowest.",
  },
  {
    id: "staff-roles/menu-order-reverses",
    file: "apps/qr/lib/staff-roles.ts",
    suite: "lib/staff-role-ceiling.test.ts",
    why: "ROLE_ORDER drives BOTH the console's role menus and `listStaff`'s sort. Reversed, the roster puts servers above the owner and the add-staff form opens on the lowest rung \u2014 cosmetic apart, but together they are the one screen that states who runs the place, stating it backwards",
    find: 'export const ROLE_ORDER: StaffRole[] = ["owner", "manager", "server"];',
    replace: 'export const ROLE_ORDER: StaffRole[] = ["server", "manager", "owner"];',
  },
  {
    id: "staff-team/provision-skips-the-ceiling",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "A6 \u2014 the lowered floor without the ceiling hands every manager the `owner` option in the same form they use to add a server: invite an owner at an address you control, sign in as them. It sits BEFORE `createUser`, so deleting it also mints an auth account for a refusal \u2014 an orphan that can never be re-provisioned at that address, which fails the invite silently and forever for the person it was meant for",
    find: '  if (!canActOn(fresh.role, parsed.data.role))\n    return { ok: false, error: "Only the owner can add another owner." };\n\n  const { data: created, error: createErr } = await db.auth.admin.createUser({',
    replace: "  const { data: created, error: createErr } = await db.auth.admin.createUser({",
  },
  {
    id: "staff-team/provision-checks-the-caller-against-itself",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the mutant that KEEPS the call and still ships the hole \u2014 the shape a `canActOn` grep can never catch. `canActOn(x, x)` is always true, so the guard runs, passes, and reads in review exactly like the real one",
    find: '  if (!canActOn(fresh.role, parsed.data.role))\n    return { ok: false, error: "Only the owner can add another owner." };',
    replace:
      '  if (!canActOn(fresh.role, fresh.role))\n    return { ok: false, error: "Only the owner can add another owner." };',
  },
  {
    id: "staff-team/deactivate-skips-the-ceiling",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "without it the same two taps that offboard a server offboard every OWNER, and the account that could reinstate them is the one just switched off. The self-check above it survives the deletion and looks like the guard",
    find: '  if (!canActOn(fresh.role, target.role as StaffRole))\n    return { ok: false, error: "Only the owner can change an owner\u2019s account." };\n',
    replace: "",
  },
  {
    id: "staff-team/deactivate-write-drops-its-status-guard",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the sibling of `role-change-write-drops-its-status-guard`, and it was genuinely MISSING on this action's first pass \u2014 found by a blind read, not by symmetry. The ceiling above is decided against a role read a moment earlier; without the repeat in the STATEMENT, a target promoted to owner in that window is deactivated by a manager whose permission was granted for a server",
    find: '    .eq("user_id", parsed.data.userId)\n    .eq("role", target.role)\n    .select("user_id");',
    replace: '    .eq("user_id", parsed.data.userId)\n    .select("user_id");',
  },
  {
    id: "staff-team/deactivate-trusts-a-blocked-write",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the W17 rule on the offboard path: `.update()` returns no row count, so a write the statement's own guard refused still answers ok \u2014 and the console then shows a member switched off who is still on, which is the worst direction for this particular screen to be wrong in",
    find: '  if (!rows || rows.length === 0)\n    return { ok: false, error: "That member just changed \u2014 reload and try again." };\n',
    replace: "",
  },
  {
    id: "staff-team/role-change-ignores-the-requested-role",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "HALF the ceiling, which is the half that looks complete: the target is checked, so a manager may not touch an owner \u2014 but the role they are MOVED TO is unchecked, so a manager promotes a fellow server to owner and signs in as them. One of two mutants because either half alone leaks, in opposite directions",
    find: "  if (!canActOn(fresh.role, current) || !canActOn(fresh.role, parsed.data.role))",
    replace: "  if (!canActOn(fresh.role, current))",
  },
  {
    id: "staff-team/role-change-ignores-the-current-role",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the mirror hole, and the one that hands over the restaurant: the requested role is checked, so a manager may not create an owner \u2014 but the target's CURRENT role is unchecked, so a manager demotes the owner to server, which is a role well within their reach, and inherits the place from below",
    find: '  if (!canActOn(fresh.role, current) || !canActOn(fresh.role, parsed.data.role))\n    return { ok: false, error: "Only the owner can change an owner\u2019s role." };',
    replace:
      '  if (!canActOn(fresh.role, parsed.data.role))\n    return { ok: false, error: "Only the owner can change an owner\u2019s role." };',
  },
  {
    id: "staff-team/role-change-allows-self-promotion",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the shortest path of all \u2014 a manager setting their OWN row to owner, which the ceiling alone permits because a manager may act on a manager and (before the change lands) is not yet asking for a role above their own. It is also the lockout guard: the sole owner demoting themselves leaves nobody who can restore the role",
    find: '  if (isSelf) return { ok: false, error: "You can\u2019t change your own role." };\n',
    replace: "",
  },
  {
    id: "staff-team/role-change-write-drops-its-status-guard",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the project's standing rule that a status guard belongs in the SQL STATEMENT, not only in the code above it. The ceiling was decided against a role read a moment earlier; without `.eq(\"role\", current)` a concurrent change in that window applies this decision to a role it was never made about \u2014 an owner demoted to server between the read and the write is then re-promoted by a manager's in-flight edit",
    find: '    .eq("user_id", parsed.data.userId)\n    .eq("role", current)\n    .select("user_id");',
    replace: '    .eq("user_id", parsed.data.userId)\n    .select("user_id");',
  },
  {
    id: "staff-team/role-change-trusts-a-blocked-write",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the W17 rule at a new seam: `.update()` returns no row count, so a write the statement's own guard REFUSED still answers ok. Dropping the row check reports a role change the console then renders and nobody stored \u2014 and on the next reload it silently reverts",
    find: '  if (!rows || rows.length === 0)\n    return { ok: false, error: "That role just changed \u2014 reload and try again." };\n',
    replace: "",
  },
  {
    id: "staff-team/revoked-caller-still-writes",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the TOCTOU Codex found: `getStaffAuth()` resolves the caller at the top of the action and the write lands several round trips later, so without the re-read a manager an owner deactivated or demoted in that window still grants authority to someone else on the way out. Three mutants rather than one because each action calls it separately and a single deletion is invisible in the other two",
    find: "  const fresh = await refreshCallerAuthority(db, caller);\n  if (!fresh.ok) return { ok: false, error: authorityRefusal(fresh.reason) };\n  // BOTH halves again, on the REFRESHED role \u2014 the target's current role and the requested one.",
    replace:
      "  const fresh = { ok: true, role: caller.role } as const;\n  // BOTH halves again, on the REFRESHED role \u2014 the target's current role and the requested one.",
  },
  {
    id: "staff-team/revoked-caller-still-offboards",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the same window on the offboard path, and the one that compounds: a manager being deactivated could deactivate the rest of the rung on the way out, and the only record of it is a best-effort analytics event (M205)",
    find: "  const fresh = await refreshCallerAuthority(db, caller);\n  if (!fresh.ok) return { ok: false, error: authorityRefusal(fresh.reason) };\n  // The ceiling AGAIN, on the REFRESHED role",
    replace:
      "  const fresh = { ok: true, role: caller.role } as const;\n  // The ceiling AGAIN, on the REFRESHED role",
  },
  {
    id: "staff-team/revoked-caller-refused-on-an-outage",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "the OVER-BLOCKING direction, which is the half a security-shaped change gets wrong by reflex, and M209 kept it after changing the other half. An unreadable row now refuses \u2014 correctly \u2014 but it must refuse as an OUTAGE: collapsing it to the plain refusal tells a manager they are not one, which is the fabricated-diagnosis shape M116/M119 b\u2013e closed across this codebase, on the one screen whose whole job is telling someone what their authority is",
    find: '  if (error) return { ok: false, reason: "outage" };',
    replace: '  if (error) return { ok: false, reason: "revoked" };',
  },
  {
    id: "merge-redeem/handover-leaves-the-latch-set",
    file: "apps/qr/components/MergeRedeemer.tsx",
    suite: "components/MergeRedeemer.test.tsx",
    why: "the shared-tablet handover, found by Codex. `AccountStatus.toGuest()` signs out, mints a fresh anonymous session and calls `router.refresh()`, which does NOT re-run client effects \u2014 and this component keeps its tree position, so `done` stays true from the PREVIOUS guest's redemption. The next person to sign in on that device hits the guard and their orders never follow them. Exactly the defect A7 fixed, one identity later",
    find: "        generation.current += 1;\n        done.current = false;\n        running.current = false;\n        pending.current = false;\n        return;\n",
    replace: "",
  },
  {
    id: "staff-team/ceiling-decided-on-the-stale-role",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: 'Codex P1 on the merge head, and the defect the FIRST version of this re-read shipped: answering a plain boolean checked only the manager FLOOR and threw the refreshed rank away, so an OWNER demoted mid-request passed it \u2014 they are a manager \u2014 while every ceiling below went on deciding against the stale `caller.role === "owner"`. The now-manager could still mint an owner. Returning the session\'s role here restores exactly that: a narrower window on one hole and a wider one on another, which is worse than the hole it replaced',
    find: '  if (!roleAtLeast(role, "manager")) return { ok: false, reason: "revoked" };\n  return { ok: true, role };',
    replace:
      '  if (!roleAtLeast(role, "manager")) return { ok: false, reason: "revoked" };\n  return { ok: true, role: caller.role };',
  },
  {
    id: "merge-redeem/stale-attempt-spends-the-next-guests-token",
    file: "apps/qr/components/MergeRedeemer.tsx",
    suite: "components/MergeRedeemer.test.tsx",
    why: "Codex P2 on the merge head. The sign-out reset re-arms the refs but cannot cancel a request already awaiting the server: it resolves after the handover, latches `done` and calls `clearMergeToken()` \u2014 deleting the token the NEXT guest just stashed and re-blocking the very person the reset was for. Without the stamp check the stale answer is acted on, which is a worse failure than the latch it was added to fix, because it destroys data rather than merely stalling",
    find: "      if (mine !== generation.current) return;\n",
    replace: "",
  },
  {
    id: "floor/card-calls-refunded-money-paid",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: 'Codex P2 on the merge head \u2014 the same contradiction the status widening created, one surface up. Nulled, `TableCard` falls to its unrefunded arm and prints the PRE-refund total beside "Paid" in the success token, and puts it in the spoken name too, while the drill-down beside it correctly says the charge came back. One table, one screen, two stories',
    find: "        refund: summarizeRefund(o.total_cents, o.refunded_cents ?? 0, o.status),",
    replace: "        refund: null,",
  },
  {
    id: "floor-card/spoken-name-says-paid-over-a-refund",
    file: "apps/qr/components/staff/TableCard.tsx",
    suite: "components/staff/TableCard.test.tsx",
    why: "the card corrects a refunded table with a colour AND a different word; a colour reaches nobody listening. Pinned false, the accessible name announces a refunded table as paid \u2014 on the one surface with no visual fallback, which makes it the worst place for this claim to survive rather than a lesser one",
    find: '    paidRefunded: table.refund != null && table.refund.state !== "none",',
    replace: "    paidRefunded: false,",
  },
  // ── A7 · the orders that did not follow the diner onto their account ────────────────────────
  {
    id: "merge-redeem/absent-token-is-terminal",
    file: "apps/qr/components/MergeRedeemer.tsx",
    suite: "components/MergeRedeemer.test.tsx",
    why: "A7, THE SHIPPED DEFECT ITSELF \u2014 the owner's \"orders not automatically linked\". A diner reaches /account BEFORE signing in, so this component's first mount always finds no token: `AccountUpgrade` has minted nothing yet. Reading that as terminal latches `done` permanently, and the SIGNED_IN that arrives seconds later \u2014 once the token DOES exist \u2014 returns at the guard. Every other piece works; they simply run in this order. It reads as an obvious early-out, which is why it survived review",
    find: "    const token = readMergeToken();\n    if (!token) return;\n",
    replace:
      "    const token = readMergeToken();\n    if (!token) {\n      done.current = true;\n      return;\n    }\n",
  },
  {
    id: "merge-redeem/concurrent-sign-in-dropped",
    file: "apps/qr/components/MergeRedeemer.tsx",
    suite: "components/MergeRedeemer.test.tsx",
    why: "A7 \u2014 the Google-return shape. /account re-mounts, the mount attempt goes out, and the PKCE exchange fires SIGNED_IN a beat later while that attempt is still awaiting the server. Collapsing the two guards drops the deferred retry instead of queueing it, so the one event that proves a real account has arrived is thrown away and the token sits unredeemed until the diner happens to reload",
    find: "    if (done.current) return;\n    if (running.current) {\n      pending.current = true; // defer, never drop \u2014 see `pending` above\n      return;\n    }\n",
    replace: "    if (done.current || running.current) return;\n",
  },
  {
    id: "merge-redeem/deferred-retry-never-drains",
    file: "apps/qr/components/MergeRedeemer.tsx",
    suite: "components/MergeRedeemer.test.tsx",
    why: "the half of the fix that is easy to lose separately: recording the deferral without draining it is the same lost retry with more code. In `finally` rather than the success path so a throw cannot strand a retry someone asked for",
    find: "      if (mine === generation.current && pending.current && !running.current) {\n        pending.current = false;\n        void attemptRef.current?.();\n      }\n",
    replace: "      pending.current = false;\n",
  },
  {
    id: "merge/anon-predicate-drops-a-real-account",
    file: "apps/qr/lib/merge.ts",
    suite: "lib/merge-anon-predicate.test.ts",
    why: 'the rule this repo documents at `rewards.ts:54-58` and applies at six other sites: test `!== true`, never `=== false`. A real account may surface `is_anonymous` as false OR omit it, and `undefined !== false` is true \u2014 so the stricter form reads a signed-in diner as still anonymous and answers `null`. `null` means "retry later", so the token is never spent: the merge spins on every load forever and the orders never move',
    find: "    if (!user || user.is_anonymous === true) return null; // still anon \u2192 retry once sign-in lands",
    replace:
      "    if (!user || user.is_anonymous !== false) return null; // still anon \u2192 retry once sign-in lands",
  },
  // ── A7b · the Google recovery, and the carry it must not lose ───────────────────────────────
  {
    id: "oauth/bounce-read-only-from-error-code",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: "the original derivation keyed on `error_code` ALONE, so a Supabase bounce carrying only `?error=server_error` rendered nothing at all — no message, no recovery, and the raw error left sitting in the address bar with the diner unable to tell what happened",
    find: '  if (errorCode || error) return { kind: "generic" };',
    replace: '  if (errorCode) return { kind: "generic" };',
  },
  {
    id: "oauth/already-linked-still-offers-link",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: "sending an already-linked bounce back to `linkIdentity` is the 422 REPEATED: Supabase has just said that identity belongs to another user, so the same call costs another full round trip through Google to the same refusal. This is the owner-reported dead end, expressed in one operator",
    find: '  return outcome?.kind === "already-linked" ? "sign-in" : "link";',
    replace: '  return outcome?.kind === "generic" ? "sign-in" : "link";',
  },
  {
    id: "oauth/button-label-disagrees-with-the-call",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: 'the label is the diner\'s only evidence of what the press will do. A button reading "Continue with Google" that fires a SIGN-IN (switching them to a different account) is a lie on the button face — and the reverse strands them on the call that just failed',
    find: '  return googleAction(outcome) === "sign-in" ? "Sign in with Google" : "Continue with Google";',
    replace:
      '  return googleAction(outcome) === "link" ? "Sign in with Google" : "Continue with Google";',
  },
  {
    id: "oauth/message-drops-the-button-name",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: 'the sibling email-taken copy names its control ("tap ‘Send sign-in code’"); without the label here the sentence says only "sign in" while the control it means sits below an aria-hidden "or" divider, distinguished from its failed self by two changed words',
    find: '    return "That Google account already has a Morning Star account — tap “Sign in with Google” below and we’ll move this device’s Stars onto it.";',
    replace:
      '    return "That Google account already has a Morning Star account — sign in and we’ll move this device’s Stars onto it.";',
  },
  {
    id: "oauth/auto-recovery-can-fire-twice",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: "the one-shot guard is the only thing bounding an automatic redirect. Dropping it lets a bounce that returns to the same state redirect again, with no way for the diner to stop it",
    find: '  return outcome?.kind === "already-linked" && !attempted;',
    replace: '  return outcome?.kind === "already-linked";',
  },
  {
    id: "oauth/auto-recovery-fires-on-an-unnamed-failure",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: "auto-recovering a `generic` bounce redirects into a failure we cannot name — and unlike `identity_already_exists`, whatever produced it may well produce it again. That is how a loop gets built",
    find: '  return outcome?.kind === "already-linked" && !attempted;',
    replace: "  return outcome != null && !attempted;",
  },
  {
    id: "merge-carry/failed-mint-proceeds-anyway",
    file: "apps/qr/lib/merge-carry.ts",
    suite: "lib/merge-carry.test.ts",
    why: "THE PERMANENT LOSS. Proceeding on a failed mint abandons the anonymous uid that owns this device's orders, Stars, coupons and favourites, and it is unreachable the moment `signInWithOAuth` lands: a replacement token needs the anon session (gone), and only `service_role` can move the value afterwards. The card has already promised to move it. This is the shipped behaviour A7b replaced",
    find: '  if (outcome.kind === "failed") return { kind: "blocked", reason: "mint", message: MINT_FAILED };',
    replace:
      '  if (outcome.kind === "minted") return { kind: "blocked", reason: "mint", message: MINT_FAILED };',
  },
  {
    id: "merge-carry/stash-presence-mistaken-for-identity",
    file: "apps/qr/lib/merge-carry.ts",
    suite: "lib/merge-carry.test.ts",
    why: "a leftover token from an ABANDONED earlier attempt reads as present and may already be spent. Checking presence rather than identity carries the wrong proof across the redirect, which looks exactly like a carry and moves nothing",
    find: "  if (stashedBack !== outcome.token)",
    replace: "  if (stashedBack == null)",
  },
  {
    id: "merge-carry/blocks-a-diner-with-nothing-to-lose",
    file: "apps/qr/lib/merge-carry.ts",
    suite: "lib/merge-carry.test.ts",
    why: 'OVER-BLOCKING IS ALSO A FAILURE. `nothing-to-carry` is a CONFIRMED non-anonymous caller, so abandoning that session costs them nothing — refusing there turns a mint outage into "you cannot sign in" for someone who had nothing at stake',
    find: '  if (outcome.kind === "nothing-to-carry") return { kind: "proceed" };',
    replace:
      '  if (outcome.kind === "nothing-to-carry") return { kind: "blocked", reason: "mint", message: MINT_FAILED };',
  },
  {
    id: "merge/unreadable-session-reads-as-nothing-to-carry",
    file: "apps/qr/lib/merge.ts",
    suite: "lib/merge-mint-outcome.test.ts",
    why: 'an unreadable session is "we could not tell", NOT "there is nothing to lose". Folding it into the safe answer is precisely how the old single `null` destroyed value: the caller reads it as permission to abandon the device',
    find: '    if (!user) return { kind: "failed" };',
    replace: '    if (!user) return { kind: "nothing-to-carry" };',
  },
  {
    id: "merge/insert-failure-reported-as-a-mint",
    file: "apps/qr/lib/merge.ts",
    suite: "lib/merge-mint-outcome.test.ts",
    why: "the proof is the ROW, not the string. Reporting a mint with no row behind it stashes a token that resolves to nothing at redeem time, so the carry silently moves zero while every surface says it worked",
    find: '    if (error) return { kind: "failed" };',
    replace: '    if (error) return { kind: "minted", token };',
  },
  {
    id: "staff/authority-refresh-fails-open-on-a-read-error",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: "M209. Proceeding on a read error authorizes an authority write on a rank the code EXPLICITLY failed to confirm — on a path where `staff` carries one RLS policy and it is a SELECT, so these refusals are the whole gate. A caller demoted or deactivated mid-request still provisions staff and changes roles",
    find: '  if (error) return { ok: false, reason: "outage" };',
    replace: "  if (error) return { ok: true, role: caller.role };",
  },
  {
    id: "staff/outage-refusal-accuses-a-manager-of-not-being-one",
    file: "apps/qr/lib/staff-actions.ts",
    suite: "lib/staff-team-actions.test.ts",
    why: 'M209\'s other half. Answering "That needs a manager — ask one to step in." to a manager whose row merely failed to read is the fabricated-diagnosis shape M116/M119 b–e closed across this codebase, on the one screen whose job is telling someone what their authority is',
    find: '  return reason === "outage" ? AUTHORITY_UNCONFIRMED : MANAGERS_ONLY;',
    replace: "  return MANAGERS_ONLY;",
  },
  {
    id: "floor/settled-round-count-reads-as-exact-when-capped",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: 'M212. A bounded read cannot tell "exactly N" from "N and we stopped counting", so reporting the capped length as an exact figure prints a number the query could not know — a table that settled 21 rounds is described as having settled 20, on a staff surface read as a statement of fact',
    find: "    settledOrderCountCapped: settledOrders.length > SETTLED_ORDER_CAP,",
    replace: "    settledOrderCountCapped: false,",
  },
  {
    id: "oauth-store/attempt-flag-fails-toward-another-redirect",
    file: "apps/qr/lib/oauthCallbackStore.ts",
    suite: "lib/oauthCallbackStore.test.tsx",
    why: 'when storage is unavailable we cannot know whether we already redirected, and the two answers cost very differently: "yes" costs one manual tap on a button that says what it does, "no" costs a redirect loop through Google the diner cannot stop. The fail-safe direction is the whole reason this wrapper exists',
    find: "    return window.sessionStorage.getItem(ATTEMPT_KEY) !== null;\n  } catch {\n    return true;",
    replace:
      "    return window.sessionStorage.getItem(ATTEMPT_KEY) !== null;\n  } catch {\n    return false;",
  },
  {
    id: "oauth-store/unknown-stored-value-coerced-into-a-bounce",
    file: "apps/qr/lib/oauthCallbackStore.ts",
    suite: "lib/oauthCallbackStore.test.tsx",
    why: "sessionStorage is writable by anything on the origin and survives across visits. Coercing an unrecognized value into an outcome invents a bounce that never happened, which on the already-linked arm auto-redirects a diner who simply opened /account",
    find: '    if (kind === "generic") return { kind: "generic" };\n    return null;',
    replace:
      '    if (kind === "generic") return { kind: "generic" };\n    return kind ? { kind: "already-linked" } : null;',
  },
  {
    id: "account-upgrade/bounce-re-derived-live-from-the-url",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "THE OWNER-REPORTED DEFECT. Next 16.2.9 patches `window.history.replaceState` and propagates it to `useSearchParams()`, so a live derivation is erased by this card's own URL cleanup one frame later — the message vanishes and the button reverts to the `linkIdentity` call that was just refused. Capturing once is the fix; re-deriving restores the dead end",
    find: '  const [callback, setCallback] = useState<CallbackOutcome | null>(() =>\n    readCallbackOutcome(searchParams.get("error_code"), searchParams.get("error")),\n  );',
    replace:
      '  const [, setCallback] = useState<CallbackOutcome | null>(null);\n  const callback = readCallbackOutcome(searchParams.get("error_code"), searchParams.get("error"));',
  },
  {
    id: "account-upgrade/strip-discards-co-present-params",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "replacing with `pathname` alone discards EVERY other param, and this effect is declared before the `?resume=` one so it runs first: a lend-mode return arriving beside a bounce loses `resume` before anything can act on it, and the resume effect is then torn down mid-flight when `resumeParam` flips to null",
    find: '    window.history.replaceState(null, "", `${url.pathname}${url.search}`);',
    replace: '    window.history.replaceState(null, "", url.pathname);',
  },
  {
    id: "account-upgrade/redirects-past-a-blocked-carry",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "the decision is worthless if the caller ignores it. Reporting the block but continuing to `signInWithOAuth` abandons the anonymous session anyway — the diner sees a warning AND loses their orders, which is worse than either alone",
    find: '      if (decision.kind === "blocked") {\n        setCarryBlocked({ message: decision.message, flow: { method: "google" } });\n        setBusy(false);\n        setSelectedEmail(null);\n        signInStarting.current = false;\n        return false;\n      }',
    replace:
      '      if (decision.kind === "blocked") {\n        setCarryBlocked({ message: decision.message, flow: { method: "google" } });\n      }',
  },
  {
    id: "account-upgrade/unbound-token-survives-a-failed-oauth-call",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "the redirect never happened, so the stashed token is bound to nothing and lives 24h. `MergeRedeemer` redeems on ANY later non-anonymous sign-in on this device — including a staff member arriving through /staff/auth/callback and then opening /account — moving one person's orders and Stars onto another person's account",
    find: '      clearMergeToken();\n      setError(e4.message || "Couldn’t sign in with Google — try again.");',
    replace: '      setError(e4.message || "Couldn’t sign in with Google — try again.");',
  },
  {
    id: "account-upgrade/auto-recovery-marks-the-attempt-after-leaving",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "the flag must be written BEFORE the page is left, AND the attempt must not be spent unless the write actually landed (Codex round 1 on #279). Dropping the check redirects on an unrecorded attempt, so the next mount finds the bounce remembered with no marker and fires a SECOND automatic trip through Google — the loop the one-shot exists to make impossible",
    find: "      if (!markRecoveryAttempted()) return;\n      setBusy(true);",
    replace: "      markRecoveryAttempted();\n      setBusy(true);",
  },
  {
    id: "account-upgrade/mint-transport-rejection-wedges-the-card",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "a Server Action promise rejects at the TRANSPORT (a lost connection), before `mintMergeToken`'s own try/catch can run — so an uncaught call throws past every line below it, leaving the card at busy=true with no message, no recovery and an unhandled rejection",
    find: '      const outcome = await mintMergeToken().catch(() => MINT_TRANSPORT_FAILURE);\n      if (outcome.kind === "minted") stashMergeToken(outcome.token);\n      // Read the stash BACK',
    replace:
      '      const outcome = await mintMergeToken();\n      if (outcome.kind === "minted") stashMergeToken(outcome.token);\n      // Read the stash BACK',
  },
  {
    id: "oauth/lend-resume-loses-to-auto-recovery",
    file: "apps/qr/lib/oauth-callback.ts",
    suite: "lib/oauth-callback.test.ts",
    why: "Codex round 1 on #279, P1. `?resume=` is the OWNER returning after lending the device, and that path is deliberately merge-SUPPRESSED so the friend's Stars are never swept onto the owner's account. The auto-recovery is the opposite — it mints and carries whatever this device holds. Dropping the veto lets an effect registered FIRST decide whose rewards move, which is the one outcome the resume path exists to prevent",
    find: "  if (lendResumePresent) return false;",
    replace: "  void lendResumePresent;",
  },
  {
    id: "oauth-store/attempt-marker-reports-success-it-did-not-have",
    file: "apps/qr/lib/oauthCallbackStore.ts",
    suite: "lib/oauthCallbackStore.test.tsx",
    why: "Codex round 1 on #279, P2. The caller's next act is an irreversible redirect, so a marker that could not be written must SAY so. `readRecoveryAttempted` cannot cover a write-only failure — it answers true only when the READ throws, and after a refused setItem the read succeeds and honestly reports no attempt — so a blind `true` here re-arms the automatic redirect on the next mount: the loop the one-shot exists to make impossible",
    find: '    window.sessionStorage.setItem(ATTEMPT_KEY, "1");\n    return window.sessionStorage.getItem(ATTEMPT_KEY) !== null;',
    replace: '    window.sessionStorage.setItem(ATTEMPT_KEY, "1");\n    return true;',
  },
  {
    id: "account-upgrade/two-doors-mint-at-once",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: 'Codex round 1 on #279, P1 — and the permanent orphan reached through a second door. `autoRecoverFired` guards only the automatic path, so a manual press during the deferred frame runs a CONCURRENT mint. Each `mintMergeToken` prunes this anon\'s other rows with `.neq("token", …)`, so the two delete each other; the last stash wins, `decideCarry` reads back a token matching the mint it knows about, every check passes — and the row behind the stashed proof is gone. The redirect then abandons the anonymous uid with a token that resolves to nothing',
    find: "    if (signInStarting.current) return false; // one start at a time, whichever door — see `signInStarting`\n    signInStarting.current = true;\n    const supa = browserClient();",
    replace: "    const supa = browserClient();",
  },
  {
    id: "account-upgrade/escape-hatch-switches-the-method",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: 'Codex round 1 on #279, P2. Both recoveries mint, so both can be blocked and both render this control. Wiring it straight to Google sends a diner who typed an email address to a different provider and plausibly a different account — "continue without your Stars" is consent about the STARS, not consent to sign in as somebody else',
    find: '            if (flow.method === "email") {',
    replace: "            if (false) {",
  },
  {
    id: "staff/authority-outage-copy-cannot-be-translated",
    file: "apps/qr/lib/staff-outage.ts",
    suite: "components/staff/Chrome.test.tsx",
    why: "Codex round 1 on #279, P2 — and the mutant had to be rewritten before it could express the defect. ⚠️ ITS FIRST FORM SURVIVED, and correctly: it replaced the constant with a literal CHARACTER-IDENTICAL to the dictionary entry, so both code paths produced the same value and no fixture could separate them. That is a mutant expressing nothing, not a weak guard — the distinction the doctrine draws. The rule actually worth pinning is CORRESPONDENCE: the English constant must BE `out.authority.unconfirmed`.en, because `<OutageText>` pairs it with that key's `.my` by string identity. A hand-written English literal that drifts from the entry leaves the Burmese twin describing a sentence nobody shows, and the console silently falls back to English — on the one screen whose job is telling someone what their authority is",
    find: 'export const AUTHORITY_UNCONFIRMED = STAFF["out.authority.unconfirmed"].en;',
    replace:
      'export const AUTHORITY_UNCONFIRMED = "We could not verify your access. Please try again.";',
  },
  {
    id: "account-upgrade/otp-failure-strands-the-proof",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: 'BLIND PASS, CRITICAL. The invariant "a stashed merge proof must never outlive its redirect" is stated in three places and was enforced in two: the Google branch clears, `AccountStatus.toGuest()` clears, and this one did not. The mint succeeded and stashed; the send then failed — Supabase rate-limits OTP per address, so this is an ordinary evening — and the token lives 24h. `MergeRedeemer` redeems it on ANY later non-anonymous sign-in on this device, handing the next person this diner\'s orders and Stars under the words "Your Stars followed you"',
    find: '        clearMergeToken();\n        setError(e0.message || "Couldn’t send the sign-in code — try again.");',
    replace: '        setError(e0.message || "Couldn’t send the sign-in code — try again.");',
  },
  {
    id: "account-upgrade/otp-rejection-wedges-every-door",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: 'BLIND PASS, CRITICAL — and the lock is what makes it critical. `signInWithOtp` builds the PKCE challenge from storage before it sends and rethrows anything that is not an AuthError, so it can REJECT rather than answer `{ error }`. Uncaught, the throw skips the release and `signInStarting` stays true for the life of the page: the Google button, a Welcome-back chip, a `?resume=` return and this form all become silent no-ops, with no message, because `setBusy(false)` sits after the throw. ⚠️ THE FIRST FORM OF THIS MUTANT SURVIVED, and deserved to: it matched `await supa.auth\\n  .signInWithOtp({` and collapsed it to one line, which deletes a LINE BREAK and leaves the `.catch` clause fully intact — semantically identical code. That is the repo\'s own "guards PARSE, never scan" rule turned on the mutation set: a matcher anchored on whitespace tests formatting, not behaviour. It now removes the catch clause itself',
    find: '        })\n        .catch((e: unknown) => ({\n          error: {\n            message: e instanceof Error ? e.message : "Couldn’t send the sign-in code — try again.",\n          },\n        }));',
    replace: "        });",
  },
  {
    id: "account-upgrade/hatch-acts-on-a-contradicted-address",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "BLIND PASS, CRITICAL. The hatch renders outside both `phase` branches and nothing retired `carryBlocked` on an edit, so a diner blocked on one address who corrected it and began an ordinary uid-PRESERVING upgrade still saw the button — and pressing it abandoned that upgrade and sent an OTP to the OLD address, turning it into a merge-suppressed sign-in to a different account. The label is consent about the STARS; it never mentioned the address or the method",
    find: "      {carryBlocked && blockStillApplies && (",
    replace: "      {carryBlocked && (",
  },
  {
    id: "oauth-store/an-apology-is-remembered-like-a-recovery",
    file: "apps/qr/lib/oauthCallbackStore.ts",
    suite: "lib/oauthCallbackStore.test.tsx",
    why: 'BLIND PASS. A `generic` bounce carries no recovery — there is nothing to press differently — so reviving it only re-prints "Couldn\'t finish with Google" on a later visit where nothing was attempted. And it is unclearable in practice: `clearCallbackOutcome` runs from the non-anonymous auth listener and from a device handover, and an anonymous diner who never signs in reaches neither, so the false sentence follows them for the rest of the tab session',
    find: '  if (outcome.kind !== "already-linked") return;',
    replace: "  void outcome;",
  },
  {
    id: "account-upgrade/oauth-rejection-wedges-the-card",
    file: "apps/qr/components/AccountUpgrade.tsx",
    suite: "components/AccountUpgrade.test.tsx",
    why: "the OTP path's twin, and it had no mutant until the blind pass named the asymmetry. `signInWithOAuth` writes the PKCE verifier to storage before it resolves, so a storage or browser failure REJECTS rather than answering `{ error }`. Uncaught, `busy` stays true with the manual recovery button disabled, the one-start lock is never released, and the token stashed a moment earlier stays live 24h for a later unrelated sign-in on this device",
    find: '      })\n      .catch((e: unknown) => ({\n        error: { message: e instanceof Error ? e.message : "Couldn’t reach Google — try again." },\n      }));',
    replace: "      });",
  },
  // ── K33 · the drill-down AFTER the table pays ───────────────────────────────────────────────
  {
    id: "floor/settled-total-reads-as-paid-when-refunded",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: 'THE DEFECT REGISTRY M2 CLOSED, REOPENED ON THE STAFF SURFACE \u2014 and the reason this branch needed a refund read at all. Admitting `refunded` orders so a refunded table keeps its lines let the drill-down print the PRE-refund total in the success token beside the word "paid", over money already returned to the guest. Nulling the summary restores exactly that: `FloorDetailLive` falls to its `refund == null` arm, which is the green "{m} paid" row. The repo\'s own rule, verbatim: "a refunded order must never read \'Paid in full\'"',
    find: "    refund: paid ? summarizeRefund(paid.total_cents, paid.refunded_cents ?? 0, paid.status) : null,",
    replace: "    refund: null,",
  },
  {
    id: "floor/refund-summary-re-derived-instead-of-read",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "the 'name it ONCE' rule at a seam this repo has already been burned at. `summarizeRefund` reconciles TWO facts that legitimately disagree for a beat \u2014 the status flips on the webhook, the column bumps in-app \u2014 and always answers the one claiming LESS was paid. A hand-written subtraction looks identical on an ordinary refund and is wrong on the dashboard-issued one, where the status says refunded and the column says 0: it reports \"$0.00 came back\", a lie in the guest's favour and no less wrong for it",
    find: "summarizeRefund(paid.total_cents, paid.refunded_cents ?? 0, paid.status)",
    replace:
      '{ state: paid.refunded_cents ? "partial" : "none", refundedCents: paid.refunded_cents ?? 0, netPaidCents: paid.total_cents - (paid.refunded_cents ?? 0) }',
  },
  {
    id: "floor/settled-line-hides-its-refund",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "a PARTIAL refund leaves `qr_orders.status` at 'paid', so the settled record renders through the ordinary path with nothing on it that says money came back. Zeroed, the refunded dish shows at full price beside a total that DOES account for the refund \u2014 the screen asserting the guest paid for a dish the restaurant already returned the money for, on the surface a manager reconciles against the guest's receipt",
    find: "      refundedCents: i.refunded_cents ?? 0,",
    replace: "      refundedCents: 0,",
  },
  {
    id: "floor/settled-record-hides-the-other-rounds",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: '`/api/session`\'s own comment is the proof this is reachable: "after a previous cart is paid (status\u2260\'open\') the next order starts clean". A table that pays a round and keeps ordering settles more than once, and a count pinned at 1 silences the note saying which round is on screen \u2014 so a record showing the last of three reads as the whole meal, on the screen staff use to answer "what did they have?"',
    find: "    settledOrderCount: Math.min(settledOrders.length, SETTLED_ORDER_CAP),",
    replace: "    settledOrderCount: 1,",
  },
  {
    id: "floor/settled-record-shows-the-first-round",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "WHICH round the record describes, and the mutant the suite could not catch until its fake applied `.order()` for real. Ascending, the drill-down shows the table's FIRST settlement and its total while the floor board \u2014 which reduces the same rows by a max on `created_at` \u2014 shows the latest: one table, two amounts, neither labelled as a round",
    find: '      .order("created_at", { ascending: false })',
    replace: '      .order("created_at", { ascending: true })',
  },
  {
    id: "floor/settled-line-drops-its-seat",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: 'the one field in the settled branch that crosses key spaces: the map is built from `session_members.seat_id`, the open-cart branch feeds it `by_seat`, and this branch feeds it `added_by` \u2014 the same space (`order-lines.ts`: "outside a reassign `added_by === by_seat` always") but a different column. Nulled, every settled line loses its attribution silently, and a blind audit found BOTH fixture rows carried `added_by: null`, so nothing exercised the lookup at all',
    find: "      bySeatName: i.added_by ? (nameBySeat.get(i.added_by) ?? null) : null,",
    replace: "      bySeatName: null,",
  },
  // The cart read is `status = 'open'` and both fulfillment RPCs flip the cart to 'paid', so every
  // one of these mutations is invisible while a table is eating and only surfaces at settlement —
  // the window with the most staff attention on the screen and the least tolerance for a wrong one.
  {
    id: "floor/settled-lines-read-the-wrong-order",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: 'K33 \u2014 the settled path reads the order\'s lines by `order_id`, and the session id is sitting right there in scope one argument away. Keyed wrong the read matches nothing and the branch maps an empty array, which restores the EXACT shipped defect the branch was written to end \u2014 "Nothing in the cart yet." over a table that just ate \u2014 with every other field on the detail still correct, so the screen looks healthy',
    find: '      .eq("order_id", paid.id)\n',
    replace: '      .eq("order_id", sessionId)\n',
  },
  {
    id: "floor/settled-lines-unread-reads-as-empty",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "the open-cart read has answered `outage` on an unreadable line list since W10b, and this one is the same posture at a new seam: an unread order is not an EMPTY order. Swallowed, a transient PostgREST failure renders a paid table with no lines and a real paid total beside it \u2014 a screen asserting the guests were charged for nothing, which is worse than the freeze",
    find: '    if (soldError) return { kind: "outage" };\n',
    replace: "",
  },
  {
    id: "floor/settled-read-excludes-a-refunded-order",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "K33 \u2014 `refunded` is admitted beside `paid` so a refunded table stops deriving as `seated`. Drop it and the order vanishes from the drill-down at the moment staff most need it: a guest disputing a refund, with the lines that were refunded no longer on the one screen that can show them. `deriveFloorStatus` also flips the table back to an empty-looking `seated`, i.e. the floor re-offers a session that is finished",
    find: '      .in("status", ["paid", "refunded"])\n',
    replace: '      .in("status", ["paid"])\n',
  },
  {
    id: "floor/settled-lines-leak-into-the-running-total",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "the plausible 'helpful' regression, and it is the W17 'name it ONCE' rule at this seam: `itemCount`/`runningSubtotalCents` are the OPEN-CART 'so far' bindings that drive `LiveMoney`, and a settled table's authoritative figure is `paidTotalCents`. Filling them from the settled lines prints a live-looking running basket beside the paid total \u2014 two numbers for one meal, the pre-tax one smaller than what was actually charged, on the screen a cashier reads while holding the guest's cash",
    find: "      refundedCents: i.refunded_cents ?? 0,\n    }));\n  }\n",
    replace:
      "      refundedCents: i.refunded_cents ?? 0,\n    }));\n    itemCount = lines.reduce((a, l) => a + l.qty, 0);\n    runningSubtotalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0);\n  }\n",
  },
  {
    id: "floor/settled-lines-drop-the-options",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "K33 \u2014 `modifiers` is the chosen options as server-priced labels ('No egg', 'Extra spicy'), and the floor was the one staff surface that never carried them. Blanked here, a server checking back what a table ordered sees the dish and not the choice, which is precisely the question asked at the table ('did they say no egg?'). A jsonb column narrowed to `[]` is silent \u2014 no error, no empty state, just a line that looks plain",
    find: "      pendingApproval: false, // approvals are cart-scoped and resolved before settlement\n      notes: i.notes ?? null,\n      modifiers: Array.isArray(i.modifiers) ? (i.modifiers as string[]) : [],\n",
    replace:
      "      pendingApproval: false, // approvals are cart-scoped and resolved before settlement\n      notes: i.notes ?? null,\n      modifiers: [],\n",
  },
  {
    id: "floor/open-lines-drop-the-options",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "the same loss on the LIVE side, and the one that reaches the kitchen: an open line's options are what the server reads back to confirm before firing. Two mutants rather than one because the two branches map independently \u2014 a single fix to either leaves the other blank, and the bare mapping line is byte-identical in both, so each is anchored on its own surrounding context",
    find: "      // K33 \u2014 the server-priced option labels, as stored on the line. `modifiers` is a jsonb column,\n      // so narrow it the way every other reader does rather than trusting the row's type.\n      modifiers: Array.isArray(i.modifiers) ? (i.modifiers as string[]) : [],\n",
    replace:
      "      // K33 \u2014 the server-priced option labels, as stored on the line. `modifiers` is a jsonb column,\n      // so narrow it the way every other reader does rather than trusting the row's type.\n      modifiers: [],\n",
  },
  {
    id: "floor/detail-never-reports-settled",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-settled-detail.test.ts",
    why: "K33 \u2014 `settled` is what flips the drill-down's heading from 'Order so far' to 'Ordered', and what suppresses the running-cart caption and the multi-round note. False, a paid table's record is headed as though the guests were still ordering and carries \"tax is added at settle\" under a total that WAS taxed at settlement \u2014 a caption that is simply false on that screen. \u26a0\ufe0f AND THAT IS THE WHOLE OF IT: an earlier version of this note also claimed the flag takes the line editor off the record. It does not. `canWrite` is `detail.cartId != null && !detail.paymentInFlight` and nothing else, and the settled branch is reached only when there is no cart, so the editor is already gone whatever this flag says. The mutant still turns the suite red; what it protects is the COPY, not write authority, and a reader inheriting the wrong reason mis-learns which flag is load-bearing",
    find: "    settled: !cart && paid != null,\n",
    replace: "    settled: false,\n",
  },
  // ── P7 · the doors (a REDIRECT decision) and the KDS text dial (a PAGE-SIZE decision) ───────────
  // Neither moves money, but both are authority: the first decides where a tablet lands and whether
  // it can ever leave, the second decides which tickets a page shows. Each rule is falsified by a
  // value in its own suite; a guard here that survives is a tablet that can be trapped.
  {
    id: "staff-report/outage-reads-as-sign-in",
    file: "apps/qr/lib/staff-report-actions.ts",
    suite: "lib/staff-report-actions.test.ts",
    why: "P7·4 — an UNKNOWABLE auth answer (transport failed) must be `outage`, never `auth`: `auth` tells a signed-in cook mid-outage to sign in again — the W10b loop that ends in a destroyed board — when the honest sentence is 'try again in a moment'",
    find: '  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };\n  if (auth.kind !== "staff") return { ok: false, reason: "auth" };\n  const parsed = staffReportInput.safeParse(input);',
    replace:
      '  if (auth.kind !== "staff") return { ok: false, reason: "auth" };\n  const parsed = staffReportInput.safeParse(input);',
  },
  {
    id: "staff-report/gate-admits-anon",
    file: "apps/qr/lib/staff-report-actions.ts",
    suite: "lib/staff-report-actions.test.ts",
    why: "P7·4 — the report is written service-role; the ONLY thing between an anonymous POST and a row under a fabricated identity is this refusal. Narrowing it to `not_staff` admits `anon`",
    find: '  if (auth.kind !== "staff") return { ok: false, reason: "auth" };\n  const parsed = staffReportInput.safeParse(input);',
    replace:
      '  if (auth.kind === "not_staff") return { ok: false, reason: "auth" };\n  const parsed = staffReportInput.safeParse(input);',
  },
  {
    id: "staff-report/identity-from-the-client",
    file: "apps/qr/lib/staff-report-actions.ts",
    suite: "lib/staff-report-actions.test.ts",
    why: "P7·4 — the reporter is the VERIFIED session, never the input: a client that names a staff id files reports under someone else, and the email and the issue would carry that name as fact",
    find: "      staff_id: auth.caller.staffId,\n      staff_name: auth.caller.displayName,",
    replace:
      "      staff_id: (input as { staff_id?: string }).staff_id ?? auth.caller.staffId,\n      staff_name: auth.caller.displayName,",
  },
  {
    id: "staff-report/ceiling-off-by-one",
    file: "apps/qr/lib/staff-report-actions.ts",
    suite: "lib/staff-report-actions.test.ts",
    why: "P7·4 — the ceiling is FIVE per person per ten minutes: the issue list is public and a stuck tap files a report per repaint. `>` admits a sixth, and every one after it — the suite carries exactly five already sent",
    find: '  if (!countErr && (count ?? 0) >= REPORT_RATE_MAX) return { ok: false, reason: "rate" };',
    replace:
      '  if (!countErr && (count ?? 0) > REPORT_RATE_MAX) return { ok: false, reason: "rate" };',
  },
  {
    id: "staff-report/email-recorded-as-sent-when-it-failed",
    file: "apps/qr/lib/staff-report-actions.ts",
    suite: "lib/staff-report-actions.test.ts",
    why: "P7·4 — delivery outcomes are RECORDED as they were; stamping `emailed_at` on a failed send tells the next reader an owner was told when nobody was",
    find: "    if (email.ok) emailedAt = new Date().toISOString();",
    replace: "    emailedAt = new Date().toISOString();",
  },
  {
    id: "staff-door/doors-param-loses-to-remembered-door",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — `?doors=1` is the Screens chip, the ONLY way off a remembered door. If a remembered kitchen door outranks it, Mom's tablet redirects onto the board from the very chip that exists to leave it — a trap with no in-app exit, only a cookie clear",
    find: '  if (input.doorsParam) return { view: "doors" };',
    replace: '  if (input.doorsParam && input.door === null) return { view: "doors" };',
  },
  {
    id: "staff-door/warm-navigation-redirects-too",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — the redirect is for a COLD start (icon, bookmark). An in-app tap that lands on /staff from a kitchen device (an '← Floor' link on the expo page) must show the doors: redirecting every arrival makes 'Floor' mean 'Kitchen' on that tablet and the word a lie",
    find: '    return input.coldStart ? { redirect: "/staff/kitchen" } : { view: "doors" };',
    replace: '    return { redirect: "/staff/kitchen" };',
  },
  {
    id: "staff-door/cold-start-ignores-origin",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — 'cold' is NO SAME-ORIGIN referer, not 'no referer'. Treating any referer as warm means a link from another site (or a phishing page) into /staff on a kitchen tablet shows the doors instead of the board — harmless-looking, but it is the bound that makes the redirect a device behaviour rather than a request-shaped one. Treating none as warm is the trap the other way",
    find: "  if (from.host.toLowerCase() !== own.host.toLowerCase()) return true;",
    replace: "  void own;",
  },
  {
    id: "staff-door/origin-check-by-suffix",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — the same-origin test is EQUALITY of hosts. A suffix match admits `evil-mms.example` as ours; the suite carries exactly that host so this cannot regress to `endsWith` the way host checks usually do",
    find: "  if (from.host.toLowerCase() !== own.host.toLowerCase()) return true;",
    replace: "  if (!from.host.toLowerCase().endsWith(own.host.toLowerCase())) return true;",
  },
  {
    id: "staff-door/front-door-referer-reads-as-warm",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7, blind pass CRITICAL 4 — the lock (`PinUnlock` → `router.replace('/staff')`) and the login (`next` defaults to /staff) re-enter /staff through a SAME-ORIGIN client navigation, and a locked kitchen tablet begins every day exactly that way. Read as warm, the cold-start redirect never fires on the mornings it exists for: unlock → doors → tap, daily. A front-door referer is a start",
    find: "  return isFrontDoor(from.pathname);",
    replace: "  return false;",
  },
  {
    id: "staff-door/front-door-matched-by-prefix",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — the two page front doors match EXACTLY and only the auth callback matches by prefix; a bare `startsWith` turns any page whose name begins with `lock` or `login` into a start, so an in-app tap from it redirects a kitchen tablet onto the board with no way back but the Screens chip",
    find: '  return STAFF_FRONT_DOORS.some((d) => (d.endsWith("/") ? pathname.startsWith(d) : pathname === d));',
    replace: "  return STAFF_FRONT_DOORS.some((d) => pathname.startsWith(d));",
  },
  {
    id: "staff-door/multi-valued-host-reads-as-cold",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7, blind pass open question — behind two proxies `x-forwarded-host` is `a, b`; `new URL('https://a, b')` throws and a throw reads as cold, so EVERY in-app arrival on a kitchen tablet redirects onto the board. The header is read by its first value",
    find: '  const first = host.split(",")[0]?.trim() ?? "";',
    replace: "  const first = host;",
  },
  {
    id: "staff-door/floor-param-only-for-a-counter-device",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7, blind pass CRITICAL 2 — `?floor=1` is the Counter door's own href, and it exists so the door opens the FLOOR when the cookie was refused or JavaScript is off. Gating it on the cookie having been written is the exact failure it was added to remove: the tap lands back on the doors",
    find: '  if (input.floorParam) return { view: "floor" };',
    replace: '  if (input.floorParam && input.door === "counter") return { view: "floor" };',
  },
  {
    id: "staff-door/parser-case-folds",
    file: "apps/qr/lib/staff-door.ts",
    suite: "lib/staff-door.test.ts",
    why: "P7 — EXACT equality, like the language cookie. A lax parse turns a QA session's leftover `Kitchen` into a remembered door on a counter tablet, and the doors screen — the honest fallback for garbage — never shows",
    find: '  return value === "kitchen" || value === "counter" ? value : null;',
    replace:
      '  const v = value?.toLowerCase();\n  return v === "kitchen" || v === "counter" ? (v as StaffDoor) : null;',
  },
  {
    id: "kds-size/page-size-ignores-the-dial",
    file: "apps/qr/lib/kds-size.ts",
    suite: "lib/kds-size.test.ts",
    why: "P7 — the CSS drops medium and large to THREE columns; a page of eight there is two tickets below the fold on every page, and they are exactly the tickets nobody bumps. 'One page' has to stay 'one screen' at every size",
    find: '  return size === "s" ? 8 : 6;',
    replace: "  return 8;",
  },
  {
    id: "kds-size/parser-admits-any-value",
    file: "apps/qr/lib/kds-size.ts",
    suite: "lib/kds-size.test.ts",
    why: "P7 — a stored value from an older build or a hand-edit must fall to the size every ticket has always rendered at, never to a size the CSS has no rule for (which renders at small type on a three-column grid — the worst of both)",
    find: '  return value === "m" || value === "l" ? value : KDS_SIZE_DEFAULT;',
    replace: "  return (value as KdsSize) ?? KDS_SIZE_DEFAULT;",
  },
  {
    id: "stripe-env/winner-not-trimmed",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: 'A signing secret pasted through a dashboard field carries a trailing newline, and Stripe\'s SDK answers with "the provided signing secret contains whitespace" appended to a signature failure \u2014 i.e. every delivery rejected, reported as a bad signature. Trimming here is the difference between C18 and a working webhook, so it is a money rule, not tidiness',
    find: "    const trimmed = value.trim();\n    if (!trimmed) continue;\n    return { name, value: trimmed };",
    replace:
      "    const trimmed = value.trim();\n    if (!trimmed) continue;\n    return { name, value };",
  },
  {
    id: "stripe-env/blank-var-counts-as-set",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "A Vercel variable created and left EMPTY is present to `process.env` and useless to Stripe. Without the blank check the empty name wins and the real value one line below it is never reached \u2014 the credential is 'set' and every Stripe call fails",
    find: '    if (typeof value !== "string") continue;\n    const trimmed = value.trim();\n    if (!trimmed) continue;',
    replace: '    if (typeof value !== "string") continue;\n    const trimmed = value.trim();',
  },
  {
    id: "stripe-env/unsuffixed-wins-over-test",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "WHICH candidate wins decides the Stripe MODE the deployment runs in. Reversed, a Production environment holding both keys mounts the LIVE card form while the server signs with the test secret \u2014 a real guest shown a real Stripe form whose fulfilment webhook can never verify",
    find: '    [\n      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",\n      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST,\n    ],\n    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY],',
    replace:
      '    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY],\n    [\n      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST",\n      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST,\n    ],',
  },
  {
    id: "stripe-env/live-key-read-as-test",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "The mode marker is the ONLY evidence either key carries about which Stripe account it talks to. Read a live key as test and `modeDisagreement` sees agreement where there is none \u2014 the guard that exists to stop a live charge with a test webhook secret waves it through",
    find: '  if (/^[sprk]{2}_test_/.test(k)) return "test";\n  if (/^[sprk]{2}_live_/.test(k)) return "live";',
    replace:
      '  if (/^[sprk]{2}_test_/.test(k)) return "test";\n  if (/^[sprk]{2}_live_/.test(k)) return "test";',
  },
  {
    id: "stripe-env/disagreement-never-refuses",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "The whole gate. With the comparison inverted every mismatched pair reports agreement, and `getStripe()` constructs a LIVE client whose fulfilment webhook is signed by a TEST secret \u2014 C18 with real guests' money instead of test cards",
    find: '  if (secret === "unknown" || publishable === "unknown") return null;\n  if (secret === publishable) return null;',
    replace:
      '  if (secret === "unknown" || publishable === "unknown") return null;\n  if (secret !== publishable) return null;',
  },
  {
    id: "stripe/mode-gate-skipped",
    file: "apps/qr/lib/stripe.ts",
    suite: "lib/stripe-env.test.ts",
    why: "The refusal has to happen BEFORE the client is constructed. Dropped, a mismatched pair builds a working live Stripe client and the first charge is real money whose fulfilment can never be verified \u2014 the failure C18 was, with the guard sitting one function away doing nothing",
    find: "  const mismatch = modeDisagreement(key, resolvePublishableKey()?.value);\n  if (mismatch) throw new Error(mismatch);\n",
    replace: "",
  },
  {
    id: "stripe-env/live-mode-keeps-the-test-webhook-secret",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "Codex P1 on #274. The live cutover removes the two _TEST KEY variables and can leave STRIPE_WEBHOOK_SECRET_TEST behind; getStripe() then sees a live secret and a live publishable key, they AGREE, and it raises nothing, while the webhook picks the TEST signing secret. Every live delivery fails constructEvent: real cards captured, zero orders \u2014 C18 with real money. modeDisagreement structurally cannot catch it, because a whsec_ is identical in both modes and the NAME is the only evidence",
    find: '  if (mode !== "live") return candidates;\n  return candidates.filter(([name]) => !name.endsWith("_TEST"));',
    replace: "  return candidates;",
  },
  {
    id: "stripe-env/test-mode-drops-the-base-webhook-name",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "The asymmetry is the point, and the other direction is a real regression rather than extra safety: the BASE name legitimately holds a TEST signing secret in local dev, in .env.example, and in every deployment predating the per-mode rename. Filtering it out in test mode breaks all of those to guard a hazard that exists only in live mode \u2014 over-blocking is as bad as under-blocking",
    find: '  if (mode !== "live") return candidates;',
    replace: '  if (mode === "live") return candidates;',
  },
  {
    id: "stripe-env/diagnostic-hides-the-ignored-name",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "Codex P2 on #274. Selection reads the mode-FILTERED candidates and the diagnostic must not: during the live cutover the filter drops STRIPE_WEBHOOK_SECRET_TEST, so a message built from the filtered list says only 'Looked for: STRIPE_WEBHOOK_SECRET' while the variable actually holding a secret sits populated and unmentioned. The operator then hunts for a name they already set, under the one name the filter deliberately refused, and the webhook stays down. Dropping this clause reinstates exactly that silence",
    find: "  if (ignored.length === 0) return base;",
    replace: "  if (ignored.length >= 0) return base;",
  },
  {
    id: "stripe-env/diagnostic-set-ness-skips-the-trim",
    file: "apps/qr/lib/stripe-env.ts",
    suite: "lib/stripe-env.test.ts",
    why: "Set-ness in the diagnostic must be decided by pickEnv's own trim rule. A whitespace-only leftover is 'not set' for SELECTION, so reporting it as SET gives the operator two contradictory answers to the same question and sends them hunting for a variable this module already considers empty \u2014 the same class of misdirection the diagnostic exists to remove",
    find: '    .map(([name, value]) => `${name} (${pickEnv([[name, value]]) ? "SET" : "not set"})`)',
    replace:
      '    .map(([name, value]) => `${name} (${typeof value === "string" ? "SET" : "not set"})`)',
  },
  {
    id: "share-intent/tip-cap-dropped",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "The $1,000 house tip ceiling, which single-pay has enforced since W19 and this route did not. A rate cannot express a dollar cap, so Zod's .max(0.5) on tipRate is only the transport rail \u2014 the derived cents grow with the share, and an even split of a large banquet cart reaches a seat net where 0.5 mints a tip past the ceiling every other tender refuses. lib/tip.ts states the reason: the cap exists so a fat-finger or a hostile client cannot mint a five-figure PaymentIntent through the tip field",
    find: "    if (!tipWithinAmountCap(tip)) {",
    replace: "    if (false) {",
  },
  {
    id: "live-intent/off-session-throw-reads-as-decline",
    file: "apps/qr/lib/live-intent.ts",
    suite: "lib/live-intent.test.ts",
    why: "A StripeCardError is the issuer saying the money did not move; a connection reset, a 429, a 5xx or a timeout says NOTHING, because closeSecureTab's PaymentIntent is created with confirm:true and can be captured while the response never arrives. Calling every throw a decline is how staff read 'declined', take cash over a live charge, and the succeeded webhook then writes a qr_refunds_needed row \u2014 the guest collected twice, waiting on a manual refund. The same 'unknowable is never a verdict' rule supersedeOutcome applies in this module",
    find: '  if (err.type !== "StripeCardError") return "unknown";',
    replace: '  if (false) return "unknown";',
  },
  {
    id: "staff-cart/unknown-outcome-releases-the-freeze",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "This function's own idempotency-key comment names the freeze as the protection: 'The concurrent double-charge guard here is the FREEZE (paymentInFlightReason + acquireSettlement serialize attempts), not this key.' Releasing it unconditionally in the catch removes that guard on an outcome we could not establish, over an intent that may already be captured — the shipped double-collect shape",
    find: "    if (declined) await releaseSettlementFor(cart.id, attempt);",
    replace: "    await releaseSettlementFor(cart.id, attempt);",
  },
  {
    id: "counter/ask-admits-a-pickup-table",
    file: "apps/qr/lib/counter-pay-state.ts",
    suite: "lib/counter-pay-state.test.ts",
    why: "A1 — only a dine-in table has a counter to walk to. Pickup and scan-and-go create their order AT payment (the webhook fulfils), so an unpaid 'pay at the counter' ask there is an order the kitchen never sees and a guest waiting for food nobody is making. The rule is a VALUE in this module precisely so it can be falsified here",
    find: '  if (input.mode !== "dinein") return "not_dinein";\n',
    replace: "",
  },
  {
    id: "counter/ask-ignores-a-live-card-payment",
    file: "apps/qr/lib/counter-pay-state.ts",
    suite: "lib/counter-pay-state.test.ts",
    why: "A1 — the ask under a live single-pay lock sends a table walking to the register while a card is mid-flight on a phone: the register settles, the webhook lands, and the table has paid twice. `applyPromo` refuses on the same axis for the same reason",
    find: '  if (input.locked) return "paying";\n',
    replace: "",
  },
  {
    id: "counter/request-stamps-a-settled-cart",
    file: "apps/qr/lib/counter-pay.ts",
    suite: "lib/counter-pay.test.ts",
    why: "A1 — the status guard lives IN the statement, not only at authz: `assertCartMember` ran a beat earlier, and the register can settle in that beat. Without it a paid cart takes the stamp, the floor shows a table 'waiting to pay' that already paid, and the diner sees the counter card over a closed order instead of the settled close",
    find: '    .eq("id", cartId)\n    .eq("status", "open")\n    .is("counter_requested_at", null)\n    .select("id");',
    replace: '    .eq("id", cartId)\n    .is("counter_requested_at", null)\n    .select("id");',
  },
  {
    id: "counter/re-ask-moves-the-table-down-the-queue",
    file: "apps/qr/lib/counter-pay.ts",
    suite: "lib/counter-pay.test.ts",
    why: "A1 — the floor sorts the LONGEST-waiting ask first, so a second tap on the same table must keep the first stamp. Dropping the `is null` arm makes every re-tap (a nervous diner, a tablemate's phone) restamp `now()` and push the family that asked ten minutes ago behind the table that asked just now",
    find: '    .eq("status", "open")\n    .is("counter_requested_at", null)\n    .select("id");',
    replace: '    .eq("status", "open")\n    .select("id");',
  },
  {
    id: "order/counter-order-resolves-for-any-tender",
    file: "apps/qr/lib/order.ts",
    suite: "lib/order-counter.test.ts",
    why: "A1 — durable session membership proves who SAT at the table, not who PAID. For a card order that is the wrong question (M29: `earned_by`/`qr_order_payers`/the share row answer it), so the membership path is scoped to the counter tenders. Widening it lets any past member of the session open a tablemate's card receipt",
    find: '      .in("tender", [...COUNTER_TENDERS])\n',
    replace: "",
  },
  {
    id: "order/counter-order-skips-the-membership-read",
    file: "apps/qr/lib/order.ts",
    suite: "lib/order-counter.test.ts",
    why: "A1 — the cart id is in the URL (`/track?cart=…&paid=1`), and a cart id is not a secret. The membership read is the ONLY thing between a guessed or shared cart id and another table's receipt; returning the order on its existence alone makes the tracker public",
    find: '    if (order?.session_id) {\n      const { data: member } = await db\n        .from("session_members")\n        .select("seat_id")\n        .eq("session_id", order.session_id)\n        .eq("seat_id", uid)\n        .limit(1)\n        .maybeSingle();\n      if (member) return { id: order.id, counter: true };\n    }',
    replace: "    if (order?.session_id) return { id: order.id, counter: true };",
  },
  {
    id: "floor/ask-outranks-a-live-card-payment",
    file: "apps/qr/lib/floor-status.ts",
    suite: "lib/floor-status.test.ts",
    why: "A1 — the chip is what the register reads before it settles. If the ask ranks above a fresh single-pay lock, a table whose card is mid-flight on a phone reads 'Pay at counter' and the cashier takes cash for an order the webhook is about to fulfil — the double-collect, one screen earlier than the settle guard",
    find: '    if (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS)) return "paying";\n    if (counterAskLive(cart.counter_requested_at) && itemCount > 0) return "counter";\n',
    replace:
      '    if (counterAskLive(cart.counter_requested_at) && itemCount > 0) return "counter";\n    if (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS)) return "paying";\n',
  },
  {
    id: "floor/ask-on-an-empty-table-lights-the-floor",
    file: "apps/qr/lib/floor-status.ts",
    suite: "lib/floor-status.test.ts",
    why: "A1 — a stamp can outlive the lines under it (a table that asked, then voided everything, or a cleared-and-reseated sticker). Without the item gate the floor sorts an EMPTY table to the top of the register's queue with nothing to settle, and `settleCash` refuses it with 'nothing on this table' — a chip that sends a person to a dead end",
    find: '    if (counterAskLive(cart.counter_requested_at) && itemCount > 0) return "counter";\n',
    replace: '    if (counterAskLive(cart.counter_requested_at)) return "counter";\n',
  },
  {
    id: "surfaces/kiosk-reopened",
    file: "apps/qr/lib/surfaces.ts",
    suite: "lib/surfaces.test.ts",
    why: "A1 — the parked doors are a DECISION (owner's go, 2026-09-09), and a constant is the cheapest thing in the repo to flip by accident in a merge. This pins it so re-opening the kiosk is a diff to a test and a conversation, never a silent resolution",
    find: "  kiosk: false,\n",
    replace: "  kiosk: true,\n",
  },
  {
    id: "surfaces/split-action-answers-open",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: 'A1 — `openSettlement` is a `"use server"` action, directly POST-able with the button hidden (its own W21 note says so). Parking the split only where it is DRAWN leaves the full share/capture path live behind a missing button — the blind audit on this diff named it: a door with the sign taken down, not a parked one. Deleting the refusal is exactly that',
    find: '  if (!surfaceOpen("selfServeSplit"))\n    throw new Error(\n      "Splitting the bill across phones isn’t available — pay together here, or at the counter.",\n    );\n',
    replace: "",
  },
  {
    id: "surfaces/tab-action-answers-open",
    file: "apps/qr/lib/tabs.ts",
    suite: "lib/tabs.test.ts",
    why: "A1 — `openTab` is the action behind BOTH parked buttons (the diner's Save-a-card, the staff Open-a-tab). Without this refusal a POST opens a tab on a table nobody offered one to, and the tab machinery A2 will retire the guard rows for is live again",
    find: '  if (!surfaceOpen("cardOnFileTabs"))\n    return { ok: false, error: "Tabs aren’t available right now — pay here, or at the counter." };\n',
    replace: "",
  },
  {
    id: "surfaces/share-intent-route-answers-open",
    file: "apps/qr/app/api/stripe/create-share-intent/route.ts",
    suite: "app/api/stripe/create-share-intent/route.test.ts",
    why: "A1 — the share intent is the MONEY half of the parked split: a settlement opened by any means still needs this route to mint a PaymentIntent per seat. With the refusal gone the parked door charges cards",
    find: '    if (!surfaceOpen("selfServeSplit"))\n      return NextResponse.json(\n        {\n          error:\n            "Splitting the bill across phones isn’t available — pay together, or at the counter.",\n        },\n        { status: 410 },\n      );\n',
    replace: "",
  },
  {
    id: "surfaces/setup-intent-route-answers-open",
    file: "apps/qr/app/api/stripe/setup-intent/route.ts",
    suite: "app/api/stripe/setup-intent/route.test.ts",
    why: "A1 — the SetupIntent saves a card off-session for a later charge; it is the half of the tab door that touches Stripe. Parked means no new card is saved, and only this refusal makes that true for a POST",
    find: '    if (!surfaceOpen("cardOnFileTabs"))\n      return NextResponse.json(\n        { error: "Saving a card isn’t available right now — pay here, or at the counter." },\n        { status: 410 },\n      );\n',
    replace: "",
  },
  {
    id: "counter/ask-counts-voided-lines",
    file: "apps/qr/lib/counter-pay.ts",
    suite: "lib/counter-pay.test.ts",
    why: "A1 (blind audit, CRITICAL 3) — the ask's item gate must count what the FLOOR counts (`state !== 'voided' && !comped`). Counting every row lets a table whose lines were all voided or comped stamp an ask: the diner sees 'show this to the register' while the floor derives `seated`, never sorts the table first and never shows the banner — a person waiting for a chip that does not exist",
    find: '    .eq("cart_id", cartId)\n    .neq("state", "voided")\n    .eq("comped", false);\n',
    replace: '    .eq("cart_id", cartId);\n',
  },
  {
    id: "counter/outcome-answers-a-stranger",
    file: "apps/qr/lib/counter-pay.ts",
    suite: "lib/counter-pay.test.ts",
    why: "A1 (blind audit) — `counterPayOutcome` is a public Server Action and a cart id is in every URL. The `session_members` read is the ONLY thing between a guessed id and another table's cart status; without it the action is a status probe for anyone",
    find: '  if (memberError || !member) return { kind: "unknown" };\n',
    replace: "",
  },
  {
    id: "counter/outcome-calls-a-card-the-counter",
    file: "apps/qr/lib/counter-pay.ts",
    suite: "lib/counter-pay.test.ts",
    why: "A1 (blind audit, CRITICAL 1) — a tablemate's CARD flips the cart to `paid` too. If the outcome reports every settle as `counter`, every other phone at the table reads 'This bill was settled at the counter' for a bill paid by card on a phone — a false sentence about where the money went, on the screen that closes the meal",
    find: '      : (COUNTER_TENDERS as readonly string[]).includes(order.tender)\n        ? "counter"\n        : "card";\n',
    replace: '      : "counter";\n',
  },
  {
    id: "order/fallback-membership-admits-a-card-order",
    file: "apps/qr/lib/orders.ts",
    suite: "lib/orders-payers.test.ts",
    why: "A1 — the durable-membership arm of `getMyOrderFallback` exists for COUNTER orders, which carry no `earned_by`, no payer row and no share. Dropping the tender scope lets any past member of a session read a tablemate's CARD receipt through /track — who sat there is not who paid (M29's whole point)",
    find: '        .in("tender", [...COUNTER_TENDERS])\n',
    replace: "",
  },
  {
    id: "counter-tender/card-is-a-counter-tender",
    file: "apps/qr/lib/counter-tender.ts",
    suite: "lib/order-counter.test.ts",
    why: "A1 — `COUNTER_TENDERS` is the ONE list three membership-gated reads key off (`getCartOrderRef`, `getMyOrderFallback`, `counterPayOutcome`). Admitting 'card' here widens all three at once: every card receipt becomes readable by table membership. Pinned as a value so the list cannot drift under the guards that name it",
    find: 'export const COUNTER_TENDERS = ["cash", "terminal"] as const;\n',
    replace: 'export const COUNTER_TENDERS = ["cash", "terminal", "card"] as const;\n',
  },
  // ── Phase 1c · pay-element ──────────────────────────────────────────────────────────────────
  {
    id: "pay-element/reveal-ignores-wallet",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — the reveal waits for the wallet to settle (or its grace): revealing on the card alone lets Apple Pay pop in ABOVE a form the diner has started typing into, moving the Pay button under a thumb already aimed at it",
    find: 'const revealed = s.card === "ready" && (s.wallet !== "loading" || s.graceElapsed);',
    replace: 'const revealed = s.card === "ready";',
  },
  {
    id: "pay-element/payable-skips-settle",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — `payable` IS the card-path charge gate (the CTA's aria-disabled and confirm() both read it). Without the settle term a tap aimed before the reveal moved the layout lands on a live Pay button and charges",
    find: "    payable: revealed && s.settled,",
    replace: "    payable: revealed,",
  },
  {
    id: "pay-element/stale-attempt-accepted",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — a retry re-keys Elements; a late `ready` from the DESTROYED mount must not reveal (and arm the charge gate for) the one that replaced it, whose iframe has not loaded",
    find: '  if ("attempt" in e && e.attempt !== s.attempt) return s; // a destroyed mount\'s late event\n',
    replace: "",
  },
  {
    id: "pay-element/intent-classified-as-network",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — an ended intent (succeeded, cancelled, superseded) cannot be retried on the same secret, and it may have SUCCEEDED: classifying it as network offers a Try again that can never work instead of sending the diner to see where their order stands",
    find: '  if (errorType === "invalid_request_error") return "intent";',
    replace: '  if (errorType === "invalid_request_error") return "network";',
  },
  {
    id: "pay-element/config-retries",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — a bad or mismatched publishable key is nothing the diner can fix: routing it through network offers a Try again that fails forever while the pay-window lock holds the table read-only",
    find: '  if (errorType === "authentication_error") return "config";',
    replace: '  if (errorType === "authentication_error") return "network";',
  },
  {
    id: "pay-element/escalation-keeps-retrying",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — after two failed retries the card must stop offering the door that keeps failing and send the diner back to review (where the counter door is): an escalated card that still says Try again strands them",
    find: '          body: both(counterDoor ? "payFailEscalatedCounter" : "payFailEscalated"),\n          action: "review",',
    replace:
      '          body: both(counterDoor ? "payFailEscalatedCounter" : "payFailEscalated"),\n          action: "retry",',
  },
  {
    id: "pay-element/stall-ignores-late-ready",
    file: "apps/qr/lib/pay-element.ts",
    suite: "lib/pay-element.test.ts",
    why: "Phase 1c — the timeout card keeps the mount alive precisely so a slow iframe can still arrive: ignoring its late `ready` leaves a working form hidden behind a card that says it may still appear",
    find: '      return { ...s, card: "ready", cardFailure: null, retrying: false };',
    replace:
      '      return s.card === "failed" ? s : { ...s, card: "ready", cardFailure: null, retrying: false };',
  },
  {
    id: "pay-section/submit-ignores-payable",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c — the card path's confirm() reads `payElementView().payable` (via canConfirm) at call time; a submit path that skips it charges before the form it charges exists (an IntegrationError at best, the latch this change closes at worst)",
    find: "    if (!handles || !canConfirm(view, source) || hold || inFlightRef.current) {",
    replace:
      '    if (\n      !handles ||\n      (source === "wallet" && !canConfirm(view, source)) ||\n      hold ||\n      inFlightRef.current\n    ) {',
  },
  {
    id: "pay-section/double-submit",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c (LEARNINGS #126) — two submits inside one frame both read `submitting === false` from the same render; only the in-flight REF read at call time stops the second confirmPayment",
    find: "    if (!handles || !canConfirm(view, source) || hold || inFlightRef.current) {",
    replace: "    if (!handles || !canConfirm(view, source) || hold) {",
  },
  {
    id: "pay-section/throw-latches",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c — a REJECTING confirmPayment (an IntegrationError, a stale handle) must clear submitting/paying: latched, the CTA reads Processing forever, Edit order and Back to review refuse, and the pagehide release skips — the diner and the table frozen until the lock's TTL",
    find: '      setError({ en: t("en", "payConfirmFailed"), my: t("my", "payConfirmFailed") });\n      release();',
    replace:
      '      setError({ en: t("en", "payConfirmFailed"), my: t("my", "payConfirmFailed") });',
  },
  {
    id: "pay-section/express-refusal-hangs",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c — a refused wallet confirmation (not ready, a hold, one already in flight) must call paymentFailed, or the Apple Pay / Google Pay sheet spins until Stripe's own timeout",
    find: '      // A refused wallet sheet must be told, or it spins until Stripe\'s own timeout.\n      event?.paymentFailed({ reason: "fail" });\n',
    replace:
      "      // A refused wallet sheet must be told, or it spins until Stripe's own timeout.\n",
  },
  {
    id: "pay-section/hold-ignored",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c (blind review) — the Pay button is aria-disabled, never native disabled, so a submit still fires: `hold` (a leave releasing the pay-window lock and cancelling the intent) is refused ONLY inside confirm(). Drop it and a tap confirms against the intent the release is cancelling",
    find: "!canConfirm(view, source) || hold || inFlightRef.current",
    replace: "!canConfirm(view, source) || inFlightRef.current",
  },
  {
    id: "pay-section/wallet-reject-hangs",
    file: "apps/qr/components/PaymentSection.tsx",
    suite: "components/PaymentSection.test.tsx",
    why: "Phase 1c (blind review) — a confirmPayment that REJECTS never reached Stripe's sheet flow, so an open Apple Pay / Google Pay sheet is still waiting; without paymentFailed in the catch it spins until Stripe's own timeout",
    find: "      // waiting: tell it, or it spins until Stripe's timeout (the refusal path's rule, above).\n      event?.paymentFailed({ reason: \"fail\" });\n",
    replace:
      "      // waiting: tell it, or it spins until Stripe's timeout (the refusal path's rule, above).\n",
  },
  // ── Phase 1c · add-feedback ──────────────────────────────────────────────────────────────────────
  {
    id: "refusal/add-correction-loses-its-dish",
    file: "apps/qr/components/TableCartProvider.tsx",
    suite: "components/TableCartProvider.test.tsx",
    why: "Phase 1c — with several rows in flight, or an item sheet that has already closed, \u201cThat didn\u2019t go through\u201d does not say WHICH dish did not, and the diner is the one who has to act on it. Dropping the name at the add fork restores the unnamed sentence everywhere the caller supplied a dish",
    find: "publishRefusal(refusal, opts?.name);",
    replace: "publishRefusal(refusal);",
  },
  {
    id: "refusal/named-opener-drops-hedge",
    file: "apps/qr/lib/cart-freeze.ts",
    suite: "lib/cart-freeze.test.ts",
    why: "Phase 1c — the named twin must keep the per-cause opener. `unknown` is the cause `setItemQty`'s forgeable comparison produces with no lock or settle behind it (T41), so the assertive \u201cMohinga didn\u2019t go through\u201d there asserts a non-landing nobody established \u2014 the fabricated-diagnosis class, now with the dish's name on it",
    find: 'refusal.cause === "unknown" ? `We couldn\u2019t confirm ${name}` : `${name} didn\u2019t go through`',
    replace: "`${name} didn\u2019t go through`",
  },
  {
    id: "add-feedback/unconfirmed-cues-a-revert",
    file: "apps/qr/lib/add-feedback.ts",
    suite: "lib/add-feedback.test.ts",
    why: "Phase 1c — an `unconfirmed` create may well be on the bill. Drawing the \u201cset back down\u201d cue over it tells the diner a dish that landed did not, and invites the re-tap that charges it twice",
    find: 'input.state === "refused" ||',
    replace: 'input.state !== "applied" ||',
  },
  {
    id: "add-feedback/unknown-seat-cues-a-revert",
    file: "apps/qr/lib/add-feedback.ts",
    suite: "lib/add-feedback.test.ts",
    why: "Phase 1c — `lineVisible: null` means there was nothing to read the line off (session recovery blanks the seat; an overtaken read yields no view). Treating that as \u201cno line\u201d draws a SUCCESS as a revert",
    find: "input.lineVisible === false",
    replace: "input.lineVisible !== true",
  },
  {
    id: "notice/claim-erases-a-correction",
    file: "apps/qr/lib/notice-slot.ts",
    suite: "lib/notice-slot.test.ts",
    why: "Phase 1c — claims are spoken at the TAP now, so a claim can arrive a beat after the correction that retracted an earlier one. Letting it take the slot erases the retraction: the diner's last word is the claim the app just withdrew",
    find: '  if (incoming.kind === "claim" && current.kind === "correction") return "defer";\n',
    replace: "",
  },
  {
    id: "notice/quiet-erases-visible-text",
    file: "apps/qr/lib/notice-slot.ts",
    suite: "lib/notice-slot.test.ts",
    why: "Phase 1c — a QUIET line draws nothing, so letting it take the slot blanks the visible pill someone is reading (a tablemate's add, a lock) and puts nothing on screen in its place",
    find: '  if (incoming.quiet && !current.quiet) return "defer";\n',
    replace: "",
  },
  {
    id: "notice/retracted-claim-spoken-late",
    file: "apps/qr/lib/notice-slot.ts",
    suite: "lib/notice-slot.test.ts",
    why: "Phase 1c — a claim waiting in the deferred slot may be the one a correction just retracted. Keeping it speaks \u201cMohinga added\u201d AFTER \u201cWe couldn\u2019t confirm Mohinga\u201d \u2014 a retracted claim, stated as the final word",
    find: '  if (incoming.kind === "correction") return true;\n',
    replace: "",
  },
  {
    id: "notice/news-leaves-a-stale-visible-claim",
    file: "apps/qr/lib/notice-slot.ts",
    suite: "lib/notice-slot.test.ts",
    why: "Phase 1c (blind review) — a VISIBLE claim deferred behind a correction and then out-waited by NEWS is older than that news; drawn after it, a stale \u201cAdded to your order\u201d becomes the last word under an honest \u201cwe couldn\u2019t confirm all of them\u201d summary",
    find: '  return incoming.kind === "news" && !deferred.quiet;',
    replace: "  return false;",
  },
  {
    id: "notice/two-dishes-erase-each-other",
    file: "apps/qr/lib/notice-slot.ts",
    suite: "lib/notice-slot.test.ts",
    why: "Phase 1c (blind review) — two dishes refused under one lock inside one window: each named correction erases the other, and the first dish's claim (spoken at its tap) is left with no retraction on screen. One family collides into its unnamed sentence, which covers both",
    find: '      return "generalize";',
    replace: '      return "show";',
  },
  // ── Phase 1c · account-star ──
  {
    id: "rewards-progress/unlock-at-zero-stars",
    file: "apps/qr/lib/rewards-progress.ts",
    suite: "lib/rewards-progress.test.ts",
    why: 'Phase 1c · account-star — 0 % step === 0, so without the `stars > 0` clause a degenerate zeroed summary (a transiently failed RPC reads stars 0 with the order still attributed) claims "Reward unlocked!" on PaySuccess AND "the reward you just unlocked" on the save card, both of which read this ONE binding — for a reward no milestone issued',
    find: "earned && stars != null && milestoneStep != null && stars > 0 && stars % milestoneStep === 0",
    replace: "earned && stars != null && milestoneStep != null && stars % milestoneStep === 0",
  },
  {
    id: "save-stars/pitches-signed-in",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: 'Phase 1c · account-star — a signed-in diner\'s Stars are already on their account. Dropping the isUpgraded clause tells them their Stars "live only on this phone" and sends them to save what is already saved: a false claim about durability on the success screen',
    find: "  if (p.isUpgraded) return null;\n",
    replace: "",
  },
  {
    id: "save-stars/pitches-share-payer",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: 'Phase 1c · account-star — split-tender stamps only the HOST as earner; a share-payer earned no Star on this order. Without the earnedThisOrder clause they are asked to "keep" Stars this order never gave them, quoting a total that includes none of it',
    find: "  if (!p.earnedThisOrder) return null;\n",
    replace: "",
  },
  {
    id: "save-stars/claims-this-orders-plus-one",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: "Phase 1c · account-star — the heading's count is the server total AFTER attribution (`progress.stars`), never the order's own +1. Quoting 1 tells a diner with seven guest Stars that one is at stake — understating exactly what they stand to lose",
    find: "    stars: p.stars,\n    rewardJustUnlocked: rewardJustUnlocked({",
    replace: "    stars: 1,\n    rewardJustUnlocked: rewardJustUnlocked({",
  },
  {
    id: "save-stars/pitches-a-refunded-order",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: 'Phase 1c · account-star — a fully refunded order earned nothing to keep, and its screen has turned into the refund state. Dropping the clause puts a save-your-Stars pitch beside "the refund above is its final state"',
    find: "  if (i.refunded) return null;\n",
    replace: "",
  },
  {
    id: "save-stars/door-flips-before-attribution",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: "Phase 1c · account-star — while the bounded progress poll is still deciding attribution, NO rewards door may render. Without the pending branch GoodbyeBeat's /account link appears, then vanishes under the diner's finger when attribution lands and the save card takes over (focus drops to <body>) — the exact rule OrderTracker's revisit link was written around",
    find: '  if (!final) return { card: false, goodbye: "pending" };\n',
    replace: "",
  },
  {
    id: "save-stars/card-lands-above-receipt-actions",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: "Phase 1c · account-star — the card mounts only once ReceiptActions has SETTLED. `card: true` mounts it on the first tick, before the async receipt mint resolves; the view/print + email row then lands ABOVE it and pushes the card's buttons down under the diner's thumb",
    find: "card: i.receiptSettled",
    replace: "card: true",
  },
  {
    id: "save-stars/decline-cap-ignored",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: "Phase 1c · account-star — after two declined orders the ask stops on this device (§9 warm host, never a nag); the header ✦ link stays the standing door. Dropping the cap re-asks on every payment forever",
    find: "  return declined.length < SAVE_STARS_DECLINE_CAP;",
    replace: "  return true;",
  },
  {
    id: "save-stars/chooser-tells-a-zero-star-guest",
    file: "apps/qr/lib/save-stars.ts",
    suite: "lib/save-stars.test.ts",
    why: 'Phase 1c · account-star — the Welcome-back disclosure names Stars only when there ARE Stars. `>= 0` tells a zero-Star guest they leave "0 guest Stars" behind and promises to "bring everything along" — a promise the merge does not keep for a share-payer\'s in-progress order (the M29 lineage)',
    find: "  if (i.stars !== null && i.stars > 0) {",
    replace: "  if (i.stars !== null && i.stars >= 0) {",
  },
  // ── Phase 1c · grocery ──
  {
    id: "grocery/a-sheet-over-a-minting-basket-only-holds",
    file: "apps/qr/lib/camera-state.ts",
    suite: "lib/camera-state.test.ts",
    why: "Phase 1c — `decodeHold` decides whether a decoded sighting may become a charge attempt (M186 lineage). Test the basket before the sheet and a sheet open while the basket is still minting reads `hold`, not `swallow` — so on the render that both lands the basket and closes the sheet the scanner takes the hold→none edge, RESETS its throttle, and the jar that sat in frame behind the modal announces as new and is charged",
    find: '  if (i.sheetOpen) return "swallow";\n  if (!i.cartReady) return "hold";\n',
    replace: '  if (!i.cartReady) return "hold";\n  if (i.sheetOpen) return "swallow";\n',
  },
  {
    id: "grocery/a-sheet-holds-instead-of-swallowing",
    file: "apps/qr/lib/camera-state.ts",
    suite: "lib/camera-state.test.ts",
    why: "Phase 1c — the sheet's pause must SWALLOW, never hold: a hold resets the throttle on the way out, so closing the basket sheet over a jar still in frame announces it as new and `add()` charges it — an item added behind a modal the shopper could not see",
    find: '  if (i.sheetOpen) return "swallow";\n',
    replace: '  if (i.sheetOpen) return "hold";\n',
  },
  {
    id: "grocery/a-minted-basket-judges-scans-unloaded",
    file: "apps/qr/lib/camera-state.ts",
    suite: "lib/camera-state.test.ts",
    why: "Phase 1c (blind review) — the camera's hold lifts the moment the basket is READY and the jar in frame is judged against its lines then. Keyed on the cart id alone, a REJOINED basket's lines are still [] at that frame, so the item it already pays for is classified new and charged a second time",
    find: "  return Boolean(i.cartId) && i.hydrated;\n",
    replace: "  return Boolean(i.cartId);\n",
  },
  // ── Phase 1c · cart-motion ──
  // /cart's removal wiring. The rules are pure (lib/line-motion.ts, value-falsified in its own
  // suite); these are the four lines in Checkout.tsx that CALL them, which only the jsdom suite sees.
  {
    id: "p1c-cart-motion/removal-skips-the-landing",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Phase 1c — an own removal must move focus to the NEIGHBOURING dish's name before the write (while the old control is live) and hold what sits below from the next tap. Skip the call and a keyboard/screen-reader user is left inside an inert ghost, and a quick second tap lands on the row that slid under the finger",
    find: "                          if (q <= 0) lines.noteRemoval(i.id);\n",
    replace: "",
  },
  {
    id: "p1c-cart-motion/empty-heading-drops-its-ref",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Phase 1c — removing the ONLY dish swaps the view to the empty state; its <h1> is the landing target (WCAG 2.4.3). Without the ref, focus falls to <body> and a screen reader hears nothing about what just happened",
    find: '        <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--fs-h1)", marginBottom: 16 }}>\n',
    replace: '        <h1 tabIndex={-1} style={{ fontSize: "var(--fs-h1)", marginBottom: 16 }}>\n',
  },
  {
    id: "p1c-cart-motion/a-removed-draft-reads-as-fired",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Phase 1c — S2.2 keyed on a draft COUNT also fires on a tablemate's REMOVAL, and on iOS (a tap never focuses a button) activeElement is always <body>, so every peer removal yanked the VoiceOver cursor to the heading. `firedSince` keys on ids: a firing is a draft that is still here",
    find: "      firedSince(prev, new Set(split(liveLineIds)), new Set(split(draftIds))) &&\n",
    replace: "      split(draftIds).length < prev.length &&\n",
  },
  {
    id: "p1c-cart-motion/ghost-rendered-as-a-live-row",
    file: "apps/qr/components/Checkout.tsx",
    suite: "components/Checkout.test.tsx",
    why: "Phase 1c — a leaving row must render inert, aria-hidden and `.mms-remove`. Drop the flag and the removed dish is drawn as a LIVE row for its whole exit: a second listitem a screen reader reads, and a stepper a finger can still press on a line the server has already deleted",
    find: "                      .map((r) => renderLine(r.item, r.leaving))}\n",
    replace: "                      .map((r) => renderLine(r.item))}\n",
  },
  // ── Phase 2a · padserver ──
  // The staff add's coded refusal (lib/staff-add-outcome.ts), its wiring in staffAddItem (the phase
  // flag, the captured pricing error, the add key riding the existing scan-event ledger), and
  // priceItem's options read failing closed.
  {
    id: "p2a-padserver/write-throw-reads-as-failed",
    file: "apps/qr/lib/staff-add-outcome.ts",
    suite: "lib/staff-add-outcome.test.ts",
    why: "Phase 2a — a throw out of the write may have COMMITTED (the RPC ran, the response was lost). Classify it by its class instead of its phase and it reads `failed`, a definite refusal the pad answers with a fresh tap under a NEW key — the one double-add the add key exists to make impossible",
    find: '  if (phase === "write") return "unconfirmed";\n',
    replace: "",
  },
  {
    id: "p2a-padserver/sold-out-reads-as-failed",
    file: "apps/qr/lib/staff-add-outcome.ts",
    suite: "lib/staff-add-outcome.test.ts",
    why: "Phase 2a — a sold-out dish carries its reason on the error (M119). Dropping the arm reports a generic failure, and staff tap it again for a dish the kitchen already 86'd",
    find: "  if (err instanceof ItemUnsellableError) return err.reason;\n",
    replace: "",
  },
  {
    id: "p2a-padserver/unreadable-catalog-reads-as-failed",
    file: "apps/qr/lib/staff-add-outcome.ts",
    suite: "lib/staff-add-outcome.test.ts",
    why: "Phase 2a — an unreadable catalog is an OUTAGE (keep it on paper), not a verdict about the dish or the request. Folding it into `failed` tells staff something is wrong with THIS add when nothing can be added",
    find: '  if (err instanceof ItemUnreadableError) return "outage";\n',
    replace: "",
  },
  {
    id: "p2a-padserver/write-closed-reads-unconfirmed",
    file: "apps/qr/lib/staff-add-outcome.ts",
    suite: "lib/staff-add-outcome.test.ts",
    why: "Phase 2a (blind review) — the insert guard's typed 'not open' is a DEFINITE non-write. Read as `unconfirmed`, staff are told to check the order for a dish the database refused, and the pad holds the add key for a retry that can only be refused again",
    find: '  if (phase === "write" && err instanceof CartClosedError) return "closed";\n',
    replace: "",
  },
  {
    id: "p2a-padserver/write-throw-not-classified",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a (blind review) — the write phase is classified by what the WRITE threw. Handed the (empty) pricing capture instead, a typed 'not open' refusal reads `unconfirmed`",
    find: '    const code = addFailureCode(phase, phase === "write" ? e : priceFailure);\n',
    replace: "    const code = addFailureCode(phase, priceFailure);\n",
  },
  {
    id: "p2a-padserver/insert-refusal-untyped",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-scan.test.ts",
    why: "Phase 2a (blind review) — the insert RPC answering null with no error is its guard's refusal: nothing written. Thrown untyped, no caller can tell it from a lost response",
    find: "    if (!insertedId) throw new CartClosedError();",
    replace: '    if (!insertedId) throw new Error("Cart is no longer open");',
  },
  {
    id: "p2a-padserver/insert-rpc-error-typed-closed",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-scan.test.ts",
    why: "Phase 2a (blind review) — an RPC ERROR is not a verdict: the insert may have committed with its response lost. Falling through to the null check types it `closed`, a definite refusal the pad answers with a fresh key — the double-add the add key exists to prevent",
    find: '    if (insertErr) throw new Error("Cart is no longer open");\n',
    replace: "",
  },
  {
    id: "p2a-padserver/phase-never-flips-to-write",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a — the flag is what makes a throw out of insertOrIncLine `unconfirmed`. Without it every write failure is reported as a definite `failed`, inviting a re-add of a line that may already be on the ticket",
    find: '    phase = "write";\n',
    replace: "",
  },
  {
    id: "p2a-padserver/pricing-error-not-captured",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a — the catch keeps its binding-free shape, so the pricing error reaches the classifier only through this capture. Drop it and a sold-out or unreadable dish is reported as a generic `failed`",
    find: "      priceFailure = e;\n",
    replace: "",
  },
  {
    id: "p2a-padserver/add-key-not-forwarded",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a — the add key IS the idempotency: it rides the existing `p_scan_id` ledger, claimed in the same transaction as the write. Drop the forward and a resend of a lost-response add lands a second line while the pad believes it retried the same one",
    find: "      qty,\n      addKey,\n    );",
    replace: "      qty,\n    );",
  },
  {
    id: "p2a-padserver/pay-refusal-uncoded",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a — the payment mutex's refusal must be CODED `paying`: the pad keys its lock notice on the code, and an uncoded refusal falls to the generic failed copy while a card is mid-authorization",
    find: '      code: "paying",\n',
    replace: "",
  },
  {
    id: "p2a-padserver/options-read-error-priced-as-none",
    file: "apps/qr/lib/order-lines.ts",
    suite: "lib/order-lines-availability.test.ts",
    why: "Phase 2a — a failed modifier_options read folded into `[]` priced and named the line WITHOUT the add-on the guest chose: a silent under-charge on the diner path and a dish cooked wrong on the staff path. It must fail closed as an outage, like the item read (M119)",
    find: "    if (optError) throw new ItemUnreadableError(menuItemId);",
    replace: "    if (false) throw new ItemUnreadableError(menuItemId);",
  },
  // Phase 2a (Codex round 1, P1) — the add key's lifetime on the shipped staff add surfaces.
  {
    id: "staff-add-key/unconfirmed-reads-definite",
    file: "apps/qr/lib/staff-add-key.ts",
    suite: "lib/staff-add-key.test.ts",
    why: "Phase 2a (Codex round 1, P1) — an `unconfirmed` add may have LANDED. Read as definite, the next tap mints a new key and a lost-response add is doubled: a second dish cooked and charged",
    find: '  return res.code === "unconfirmed" ? "unknown" : "definite";\n',
    replace: '  return "definite";\n',
  },
  {
    id: "staff-add-key/retry-mints-new-key",
    file: "apps/qr/lib/staff-add-key.ts",
    suite: "lib/staff-add-key.test.ts",
    why: "Phase 2a (Codex round 1, P1) — a retry of the same intent after an unknown outcome must resend the SAME key, which the ledger turns into a no-op if the first landed. A fresh key is a second add",
    find: "  return held !== null && held.intent === intent ? held.key : mint();\n",
    replace: "  return mint();\n",
  },
  {
    id: "staff-add-key/key-held-after-ok",
    file: "apps/qr/lib/staff-add-key.ts",
    suite: "lib/staff-add-key.test.ts",
    why: "Phase 2a (Codex round 1, P1) — a definite outcome retires the key. Held after an ok add, the NEXT deliberate add of the same dish is swallowed by the ledger as a duplicate of the first",
    find: '  return outcome === "unknown" ? { intent, key } : null;\n',
    replace: "  return { intent, key };\n",
  },
  // ── Phase 2a · send ──
  // The staff console's Send to kitchen (P2k). The server action (lib/staff-send.ts), the pure send
  // rules (lib/staff-send-view.ts), the one client reading of the server grace (lib/send-grace.ts),
  // the session renewal on a staff add, and the table detail that carries the counts.
  {
    id: "staff-send/fires-a-counter-order",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — a counter order cooks when it is PAID. Without the mode refusal the dine-in-only RPC fires nothing on a pickup cart and the console reads 'nothing to send' over a cart full of unsent food — the lie the old kitchen.ts action told",
    find: '  if (session.mode !== "dinein") return { ok: false, reason: "counter" } satisfies TableRefusal;\n',
    replace: "",
  },
  {
    id: "staff-send/fires-mid-payment",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — parity with the diner's sendToKitchen: lines never move under a live payment (a locked single-payer or a split freeze). Dropped, the console fires a round into a cart whose total a card is authorizing",
    find: '  if (await paymentInFlightReason(cart))\n    return { ok: false, reason: "paying" } satisfies TableRefusal;\n',
    replace: "",
  },
  {
    id: "staff-send/nothing-reads-as-sent",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — a fire that moved 0 lines (a colleague or the host sent first) must answer `nothing`, never a success with an Undo for a batch that holds nothing",
    find: '  if (!firedRows) return { ok: false, reason: "nothing" };\n',
    replace: "",
  },
  {
    id: "staff-send/no-batch-no-undo",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — the batch the RPC stamped is what the Undo targets (S4-audit P1-3). Dropped, a mis-tap on a shared tablet can never be taken back — the defect that made the old action unshippable",
    find: "    undoBatch: row?.batch ?? null,\n",
    replace: "    undoBatch: null,\n",
  },
  {
    id: "staff-send/diner-phones-not-resynced",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — the host's phone watches the cart's updated_at. A console send that does not touch it leaves the diner's cart showing steppers on dishes the kitchen already has",
    find: "    await touchCart(cartId, ctx);\n",
    replace: "",
  },
  {
    id: "staff-send/no-renewal",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — a phone-less table worked only from the console aged off the floor and the KDS 4h after 'Start a table'. A staff send slides the session's expiry exactly as a diner write does",
    find: "  await maybeRenewSession(serviceClient(), sessionId, expiresAt); // non-throwing by contract\n",
    replace: "",
  },
  {
    id: "staff-send/undo-targets-the-wrong-batch",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — the undo reverses exactly the batch this console's send handed back, never a diner's make-it-now line that shares the grace window (S4-audit P1-3)",
    find: "    p_batch: batch,\n",
    replace: "    p_batch: sessionId,\n",
  },
  {
    id: "staff-send/late-undo-reads-as-success",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a — 0 lines taken back means the kitchen has it. Answered as a success, the console says 'Brought back — not sent' over a dish that is being cooked, and nobody reaches for Void / Comp",
    find: "  if (!unfired) return { ok: false, reason: await undoMissReason(table.cart.id, batch) };\n",
    replace: "",
  },
  {
    id: "staff-send/undo-gone-reads-as-expired",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a (blind review) — an undo retried after a LOST response finds its batch already brought back (undo clears fire_batch). Answered `expired`, the console says 'too late — the kitchen has it, Void / Comp' over a dish nobody is cooking",
    find: '  return data?.length ? "expired" : "gone";\n',
    replace: '  return "expired";\n',
  },
  {
    id: "staff-send/undo-expired-reads-as-gone",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a (blind review) — lines still carrying the batch mean the grace ran out and the kitchen has them. Answered `gone` without looking, the console says nothing from the send is cooking while it is, and nobody reaches for Void / Comp",
    find: '  return data?.length ? "expired" : "gone";\n',
    replace: '  return "gone";\n',
  },
  {
    id: "staff-send/undo-unread-check-reads-as-gone",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a (blind review) — an unreadable batch check has no evidence either way; it must keep the steer that sends staff to LOOK (`expired`), never the comforting 'nothing is with the kitchen'",
    find: '    return "expired"; // deliberate: the conservative steer (see above)\n',
    replace: '    return "gone";\n',
  },
  {
    id: "staff-send/fired-rows-not-units",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a (Codex round 1) — mms_fire_cart reports ROWS; the Send's label counts UNITS. Returned as-is, one Mohinga ×3 announces 'Sent 1 item' under a 'Send · 3 items' button",
    find: "  const fired = batch ? await firedUnits(table.cart.id, batch, firedRows) : firedRows;\n",
    replace: "  const fired = firedRows;\n",
  },
  {
    id: "staff-send/fired-units-error-guessed-up",
    file: "apps/qr/lib/staff-send.ts",
    suite: "lib/staff-send.test.ts",
    why: "Phase 2a (Codex round 1) — an unreadable units read falls back to the row count, the LOWER bound (every line has qty ≥ 1): the notice may under-state what went, never claim a dish the kitchen did not get",
    find: "    return firedRows; // deliberate: the lower bound (see above)\n",
    replace: "    return firedRows + 1;\n",
  },
  {
    id: "staff-send-view/sendable-counts-togo",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — the Send's count is what mms_fire_cart fires (dine-in drafts). Widened to every non-grocery draft, 'Send · 4 items' fires three: the to-go line cooks at pay, never on the Send",
    find: "    sendable: dinein ? kitchenDraftUnitsFromRows(rows) : 0,\n",
    replace:
      '    sendable: dinein\n      ? rows.filter((r) => r.state === "draft" && r.fulfillment !== "grocery").reduce((a, r) => a + r.qty, 0)\n      : 0,\n',
  },
  {
    id: "staff-send-view/staff-added-counts-diner",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — `by_seat` null is exactly 'staff added it'. Without the filter a host's own round counts as staff's, so the Send goes primary over a round the diners are still choosing",
    find: "    staffAdded: dinein ? kitchenDraftUnitsFromRows(rows.filter((r) => r.by_seat == null)) : 0,\n",
    replace: "    staffAdded: dinein ? kitchenDraftUnitsFromRows(rows) : 0,\n",
  },
  {
    id: "staff-send-view/host-round-fired-as-primary",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (owner decision #3) — a host table whose unsent dishes are all the diners' gets a SECONDARY Send under the host hint. Primary there invites firing a round still being chosen",
    find: '    return { ...base, emphasis: "secondary", note: "host" };\n',
    replace: '    return { ...base, emphasis: "primary", note: null };\n',
  },
  {
    id: "staff-send-view/staff-added-demoted",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (owner decision #3) — dishes a server added at a host's table are the counter's to send; demoted to the host hint, nobody sends them (Problem 2 — Problem 1 back on host tables)",
    find: "    if (c.staffAdded > 0)\n",
    replace: "    if (c.staffAdded > c.sendable)\n",
  },
  {
    id: "staff-send-view/counter-ask-keeps-host-note",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — once the table has asked to pay, whatever is unsent is the counter's to settle: the Send goes primary with the check-first note, even on a diner-built round",
    find: '    if (i.counterAsk) return { ...base, emphasis: "primary", note: "counterAsk" };\n',
    replace: "",
  },
  {
    id: "staff-send-view/paying-not-blocked",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — under a live payment the Send stays rendered but refuses and says why; unblocked, it offers a tap the server refuses",
    find: '    const blocked = i.paymentInFlight ? ("paying" as const) : null;\n',
    replace: "    const blocked = null;\n",
  },
  {
    id: "staff-send-view/counter-order-offered-a-send",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — a counter order cooks at payment (owner decision 1 files cook-before-pay separately). Without the mode guard it is offered a Send the server refuses",
    find: '  if (i.mode !== "dinein")\n    return i.counterOrder && i.counts.foodDraft ? { kind: "counterAtPay" } : { kind: "none" };\n',
    replace: "",
  },
  {
    id: "staff-send-view/counter-at-pay-on-slotted-cart",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — only a register (`reg-`) order cooks at pay; a slotted diner pickup fires at slot − prep, so 'the kitchen starts this when it's paid' would be false there",
    find: '    return i.counterOrder && i.counts.foodDraft ? { kind: "counterAtPay" } : { kind: "none" };\n',
    replace: '    return i.counts.foodDraft ? { kind: "counterAtPay" } : { kind: "none" };\n',
  },
  {
    id: "staff-send-view/unsent-chip-on-host-diner-round",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — the floor may call 'not sent' only what staff own on a host table; counting the diners' round there teaches staff to fire it",
    find: "  return hostPresent ? counts.staffAdded : counts.sendable;\n",
    replace: "  return counts.sendable;\n",
  },
  {
    id: "staff-send-view/unsent-chip-hides-staff-lines",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — dishes staff added at a host's table are the counter's to send; hidden from the floor, nobody sees them waiting",
    find: "  return hostPresent ? counts.staffAdded : counts.sendable;\n",
    replace: "  return hostPresent ? 0 : counts.sendable;\n",
  },
  {
    id: "staff-send-view/note-hold-ignored",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (allergy safety) — a note typed but unsaved when its line fires is LOST (setLineNotes is draft-guarded). Without the hold, 'no peanuts' reaches nobody",
    find: "  const note = edits.find((e) => e.sendable && e.noteDirty);\n",
    replace: "  const note = edits.find(() => false);\n",
  },
  {
    id: "staff-send-view/tab-close-steers-to-send",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — at a secure-tab close the guest may have left, so a refused settle steers to the LINES (remove first), never to a Send that cooks for an empty table",
    find: '  return trigger === "tab" ? "lines" : "send";\n',
    replace: '  return "send";\n',
  },
  {
    id: "staff-send-view/late-undo-says-try-again",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a — an undo that came too late must steer to Void / Comp; 'try again before the time runs out' over a window that has closed sends the server tapping a dead control while the dish cooks",
    find: '      return warn("table.send.err.expired");\n',
    replace: '      return warn("table.send.err.undoFailed");\n',
  },
  {
    id: "staff-send-view/gone-reads-as-expired",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (blind review) — `gone` (an earlier take-back already landed) must read as an OK line pointing at the dishes; mapped to the expired steer it tells staff to Void a dish nobody is cooking",
    find: '      return { tone: "ok", msg: { k: "table.send.gone" } };\n',
    replace: '      return warn("table.send.err.expired");\n',
  },
  {
    id: "staff-send-view/send-line-never-superseded",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (blind review) — a send line retires when the slot it spoke over changes. Kept, 'Couldn't send — try again' stands over an 'Everything's been sent' row after a colleague sends, inviting a tap that contradicts the screen",
    find: "  return note.against === fact ? note : null;\n",
    replace: "  return note;\n",
  },
  {
    id: "staff-send-view/send-line-baselined-by-a-stale-read",
    file: "apps/qr/lib/staff-send-view.ts",
    suite: "lib/staff-send-view.test.ts",
    why: "Phase 2a (blind review) — only a read that STARTED after the line may fix its baseline. A poll already in the air began before the write; baselined on it, the confirming re-read retires a 'Sent' or 'Brought back' the instant it lands",
    find: "  if (!note || readTicket <= note.raisedAt) return note;\n",
    replace: "  if (!note) return note;\n",
  },
  {
    id: "send-grace/absolute-server-deadline",
    file: "apps/qr/lib/send-grace.ts",
    suite: "lib/send-grace.test.ts",
    why: "Phase 2a — the grace is the server-MEASURED duration counted from this device's receipt. Read as the absolute server timestamp, a tablet five minutes fast sees a window that closed before it opened",
    find: "  return graceMs > 0 && res.undoBatch !== null ? receiptMs + graceMs : null;\n",
    replace:
      "  return graceMs > 0 && res.undoBatch !== null ? Date.parse(res.undoUntil ?? res.serverNow) : null;\n",
  },
  {
    id: "send-grace/undo-without-a-batch",
    file: "apps/qr/lib/send-grace.ts",
    suite: "lib/send-grace.test.ts",
    why: "Phase 2a — an undo without a batch could reverse a line some other actor fired inside the same grace (S4-audit P1-3): no batch, no window",
    find: "  return graceMs > 0 && res.undoBatch !== null ? receiptMs + graceMs : null;\n",
    replace: "  return graceMs > 0 ? receiptMs + graceMs : null;\n",
  },
  {
    id: "send-grace/no-same-gesture-hold",
    file: "apps/qr/lib/send-grace.ts",
    suite: "lib/send-grace.test.ts",
    why: "Phase 2a — the second half of a double-tap must never land on the Undo that replaced the Send under the finger (one number for 'the same gesture': @mms/ui SAME_GESTURE_MS)",
    find: "  return removeHeld(armedAt, now);\n",
    replace: "  return false;\n",
  },
  {
    id: "send-grace/hold-never-resolves",
    file: "apps/qr/lib/send-grace.ts",
    suite: "lib/send-grace.test.ts",
    why: "Phase 2a — the post-undo busy hold is bounded at two detail commits; unbounded, a table a colleague re-sent in between leaves the control busy forever",
    find: '  return viewKind === "send" || commitsSinceUndo >= 2;\n',
    replace: '  return viewKind === "send";\n',
  },
  {
    id: "staff-cart/add-no-renewal",
    file: "apps/qr/lib/staff-cart.ts",
    suite: "lib/staff-cart.test.ts",
    why: "Phase 2a — a staff add slides the session's expiry exactly as a diner write does, so a phone-less table worked from the console never ages off the floor and the KDS",
    find: "    await maybeRenewSession(serviceClient(), session.id, session.expires_at);\n",
    replace: "",
  },
  {
    id: "floor/send-counts-lose-the-fulfillment",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-send.test.ts",
    why: "Phase 2a — the Send's count and each line's tag rest on `fulfillment`. Unread, no line is sendable: the table page offers no Send over a table full of unsent food",
    find: '        "id,name,qty,unit_price_cents,by_seat,created_at,menu_item_id,state,comped,notes,modifiers,fulfillment",\n',
    replace:
      '        "id,name,qty,unit_price_cents,by_seat,created_at,menu_item_id,state,comped,notes,modifiers",\n',
  },
  {
    id: "floor/line-sendable-tags-a-togo-draft",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-send.test.ts",
    why: "Phase 2a — 'Not sent' marks only what the Send fires. A to-go draft cooks at pay, so tagging it tells staff to send a dish the Send will not fire",
    find: '      sendable: session.mode === "dinein" && i.state === "draft" && i.fulfillment === "dinein",\n',
    replace: '      sendable: session.mode === "dinein" && i.state === "draft",\n',
  },
  {
    id: "floor/settled-record-offers-a-send",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-send.test.ts",
    why: "Phase 2a — a settled record is what was eaten, not a basket; a 'Not sent' tag there calls for a send the table has already paid past",
    find: "      sendable: false, // Phase 2a · send — a settled record sends nothing\n",
    replace: "      sendable: true,\n",
  },
  {
    id: "floor/host-present-ignores-the-host",
    file: "apps/qr/lib/floor.ts",
    suite: "lib/floor-send.test.ts",
    why: "Phase 2a (owner decision #3) — the Send's emphasis turns on whether a diner host runs the table; reported hostless, every host table gets a primary Send over the diners' own round",
    find: "    hostPresent: session.host_seat != null,\n",
    replace: "    hostPresent: false,\n",
  },
  // ── Phase 2a · register ──
  // The two live register hotfixes. lib/money-input.ts is the ONE reading of a typed money amount
  // (value-falsified in its own suite); the two components are the wiring that calls it / survives
  // a rejected charge, which only their jsdom suites see.
  {
    id: "p2a-register/money-input-sanitizer-drops-commas",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register — the per-keystroke filter must never drop a comma: judged per key, '5,' has no digits after the comma yet, so dropping it builds '500' from '5,00' and the cash settle records a $500 tip for a $5 one (the W21d P1 on the path real hands take)",
    find: '    } else if (ch === ",") {\n',
    replace: '    } else if (ch === "," && false) {\n',
  },
  {
    id: "p2a-register/money-input-no-decimal-comma",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register — comma-only text ending in 1–2 digits is a DECIMAL comma. Without the branch '5,00' is grouping and reads 50000 cents",
    find: '    : text.replace(/,(?=\\d{1,2}$)/, ".").replace(/,/g, "");\n',
    replace: '    : text.replace(/,/g, "");\n',
  },
  {
    id: "p2a-register/money-input-third-decimal",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register — a third digit after the dot is REFUSED at the keystroke, never kept for a silent round later: the field must show exactly the cents that will be recorded",
    find: "        if (decimals >= 2) continue;",
    replace: "        if (decimals >= 3) continue;",
  },
  {
    id: "p2a-register/money-input-float-times-100",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register — typed money is read in integer cents. parseFloat × 100 turns '0.29' into 28.999999999999996, a non-integer the settle schema refuses (and a silent round everywhere else)",
    find: '  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));\n',
    replace: "  return Number.parseFloat(normalized) * 100;\n",
  },
  {
    id: "p2a-register/money-input-dot-after-decimal-comma",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register (blind review) — a dot typed after a DECIMAL comma must be refused at the keystroke. Accepted, '5,00.' holds a dot, every comma then reads as grouping, and the settle records 50000 cents for the $5.00 on screen",
    find: "      if (DECIMAL_COMMA_TAIL.test(out)) continue;\n",
    replace: "",
  },
  {
    id: "p2a-register/money-input-comma-then-dot-parses",
    file: "apps/qr/lib/money-input.ts",
    suite: "lib/money-input.test.ts",
    why: "Phase 2a · register (blind review) — the whole-string belt for a paste: a decimal comma followed by a dot carries two decimal marks. Read anyway, '5,00.' is 50000 cents and '5,5.0' is 5500",
    find: "  if (COMMA_THEN_DOT.test(text)) return null;\n",
    replace: "",
  },
  {
    id: "p2a-register/cash-tip-overlong-reads-as-zero",
    file: "apps/qr/components/staff/CashSettleButton.tsx",
    suite: "components/staff/CashSettleButton.test.tsx",
    why: "Phase 2a · register (blind review) — a null read WITH a digit in it is more than seven whole-dollar digits, past any cap. Treated like digit-free text it is a valid ZERO tip: the settle goes through and the cashier's typed tip is silently dropped",
    find: "  const tipValid = tipParsed != null ? tipCents <= 100000 : !/\\d/.test(tip);\n",
    replace: "  const tipValid = tipParsed != null ? tipCents <= 100000 : true;\n",
  },
  {
    id: "p2a-register/cash-tip-field-drops-commas-per-keystroke",
    file: "apps/qr/components/staff/CashSettleButton.tsx",
    suite: "components/staff/CashSettleButton.test.tsx",
    why: "Phase 2a · register — the tip field's onChange must only REFUSE characters. Restore the old per-keystroke comma drop and '5,00' typed key by key builds '500': the settle carries tipCents 50000 — $500 recorded for a $5 tip, under the cap, refused by nothing",
    find: "                  setTip(sanitizeMoneyInput(e.target.value));\n",
    replace:
      '                  setTip(sanitizeMoneyInput(e.target.value.replace(/,(?!\\d{1,2}$)/g, "")));\n',
  },
  {
    id: "p2a-register/secure-close-rejection-escapes",
    file: "apps/qr/components/staff/CloseSecureTabButton.tsx",
    suite: "components/staff/CloseSecureTabButton.test.tsx",
    why: "Phase 2a · register — a REJECTED closeSecureTab (the connection dropped mid-charge) must clear busy, close the confirm and say the outcome is unknown. Let it escape and the card latches on 'Charging…' with focus on <body> until a reload, and the one true sentence — the card may or may not have been charged — is never said",
    find: "      res = await closeSecureTab({ sessionId });\n    } catch (e) {\n",
    replace:
      "      res = await closeSecureTab({ sessionId });\n    } catch (e) {\n      throw e;\n",
  },
  // ── Phase 2b · kitchen ──
  {
    id: "kds-urgency/channel-swapped",
    file: "apps/qr/lib/kds-urgency.ts",
    suite: "lib/kds-urgency.test.ts",
    why: "Phase 2b — lateness reads the ticket's OWN channel pair: dine-in ages on the dine-in thresholds, pickup and scan-and-go on the pickup ones. Swap the ternary and a table's food reads calm while the counter customer's reads red, or the reverse — on the KDS strip, the Late stat and (2d) the floor pill at once",
    find: '  const amber = channel === "dinein" ? th.dineinAmberMin : th.pickupAmberMin;\n  const red = channel === "dinein" ? th.dineinRedMin : th.pickupRedMin;\n',
    replace:
      '  const amber = channel !== "dinein" ? th.dineinAmberMin : th.pickupAmberMin;\n  const red = channel !== "dinein" ? th.dineinRedMin : th.pickupRedMin;\n',
  },
  {
    id: "kds-urgency/amber-edge-exclusive",
    file: "apps/qr/lib/kds-urgency.ts",
    suite: "lib/kds-urgency.test.ts",
    why: "Phase 2b — the amber edge is inclusive: a ticket exactly 8:00 old is amber. Exclusive, it reads calm for the minute the config says it should not",
    find: '  if (min >= amber) return "amber";\n',
    replace: '  if (min > amber) return "amber";\n',
  },
  {
    id: "kds-urgency/red-edge-exclusive",
    file: "apps/qr/lib/kds-urgency.ts",
    suite: "lib/kds-urgency.test.ts",
    why: "Phase 2b — the red edge is inclusive: a ticket exactly 12:00 old is red and counts as Late. Exclusive, it stays amber and the Late stat under-counts at the threshold",
    find: '  if (min >= red) return "red";\n',
    replace: '  if (min > red) return "red";\n',
  },
  {
    id: "kds-urgency/config-ignored",
    file: "apps/qr/lib/kds-urgency.ts",
    suite: "lib/kds-urgency.test.ts",
    why: "Phase 2b — the owner's `mms_kds_config` row is the thresholds; the defaults are only the fallback. Always answer the defaults and a kitchen that set 5/9 is told 8/12 on every screen",
    find: "  if (!row) return DEFAULT_KDS_THRESHOLDS;\n",
    replace: "  return DEFAULT_KDS_THRESHOLDS;\n",
  },
  {
    id: "kds-urgency/config-crossed",
    file: "apps/qr/lib/kds-urgency.ts",
    suite: "lib/kds-urgency.test.ts",
    why: "Phase 2b — the row maps field for field. Cross dine-in and pickup and a kitchen that set pickup tighter than dine-in (the counter customer is standing there) gets the reverse",
    find: "    dineinAmberMin: row.dinein_amber_min,\n    dineinRedMin: row.dinein_red_min,\n    pickupAmberMin: row.pickup_amber_min,\n    pickupRedMin: row.pickup_red_min,\n",
    replace:
      "    dineinAmberMin: row.pickup_amber_min,\n    dineinRedMin: row.pickup_red_min,\n    pickupAmberMin: row.dinein_amber_min,\n    pickupRedMin: row.dinein_red_min,\n",
  },
  {
    id: "kds-line/sold-out-still-offered",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b (K22) — the ONE offer rule. Offer the 86 on a dish already off the menu and the line keeps its ⋯, the sheet offers a write the server refuses 'stale', and a cook reads the refusal as their own mistake",
    find: "  return line.menuItemId !== null && !line.soldOut;\n",
    replace: "  return line.menuItemId !== null;\n",
  },
  {
    id: "kds-line/describedby-empty-string",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b — a line with no held slot and no note must carry NO aria-describedby; an empty attribute names nothing and reads to an audit as a broken promise",
    find: '  return parts.join(" ") || undefined;\n',
    replace: '  return parts.join(" ");\n',
  },
  {
    id: "kds-line/override-cleared-by-inflight-poll",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b — the coalesced-refresh defect (menu-3, on the board): a poll already in flight at the write shares its sequence and predates the write. Let it drop the override and the stale snapshot re-offers the ⋯ on the dish the cook just 86'd; a second tap is refused 'stale' about their own action",
    find: "    if (snapshotSeq > o.afterSeq) {\n",
    replace: "    if (snapshotSeq >= o.afterSeq) {\n",
  },
  {
    id: "kds-line/override-never-dropped",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b — menu-3's blind-pass defect: an override kept 'until the snapshot agrees' pins a false 'off the menu' forever once /staff/menu or another tablet puts the dish back; the first snapshot fetched after the confirmation is the truth, whatever it says",
    find: "    if (snapshotSeq > o.afterSeq) {\n",
    replace: "    if (false) {\n",
  },
  {
    id: "kds-line/override-ignored",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b — the ONE binding every consumer reads. Return the snapshot untouched and a landed 86 shows nothing until the next poll: the line still offers its ⋯ and its name still says the dish is on",
    find: "  if (overrides.size === 0) return tickets;\n",
    replace: "  return tickets;\n",
  },
  {
    id: "staff-labels/line-drops-sold-out",
    file: "apps/qr/lib/staff-labels.ts",
    suite: "lib/staff-labels.test.ts",
    why: "Phase 2b — the line button's aria-label REPLACES its content, so the OFF THE MENU tag inside it is never announced; 2b deleted the band that said it outside the button. Drop the clause and a screen reader hears a live dish",
    find: "      if (!control.soldOut) return name;\n",
    replace: "      return name;\n",
  },
  {
    id: "ticket-names/note-runs-never-burmese",
    file: "apps/qr/lib/ticket-names.ts",
    suite: "lib/ticket-names.test.ts",
    why: "Phase 2b — a note's Burmese run must be classified Burmese, or the renderer never marks it: the allergy note is typeset in the body face's fallback (clipping stacked marks at 1.3) and voiced as English",
    find: "    const my = MYANMAR_SCRIPT.test(ch);\n",
    replace: "    const my = false;\n",
  },
  {
    id: "ticket-text/note-myanmar-run-unmarked",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: 'Phase 2b — the RENDER half of the note rule: each Myanmar run is wrapped lang="my" (Padauk, --lh-my, a Burmese voice). Render bare text and every data-layer guard stays green while the allergy note reads as English',
    find: '        {runs.map((r, i) =>\n          r.my ? (\n            <span key={i} lang="my">\n              {r.text}\n            </span>\n          ) : (\n            r.text\n          ),\n        )}\n',
    replace: "        {runs.map((r) => r.text)}\n",
  },
  {
    id: "ticket-text/note-runs-unwrapped",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: "Phase 2b — §6: the note is a flex row, and a flex container DROPS whitespace-only children. Render the runs straight under it and the spaces between an English run and a Burmese one vanish; jsdom has no layout, so the two-children structure is the guard",
    find: '      <span className="ticket-note-text">\n        <span className="sr-only">\n          <Chrome lang={lang} k="kds.note.sr" />\n          {" — "}\n        </span>\n        {runs.map((r, i) =>\n          r.my ? (\n            <span key={i} lang="my">\n              {r.text}\n            </span>\n          ) : (\n            r.text\n          ),\n        )}\n      </span>\n    </Tag>\n',
    replace:
      '      <>\n        <span className="sr-only">\n          <Chrome lang={lang} k="kds.note.sr" />\n          {" — "}\n        </span>\n        {runs.map((r, i) =>\n          r.my ? (\n            <span key={i} lang="my">\n              {r.text}\n            </span>\n          ) : (\n            r.text\n          ),\n        )}\n      </>\n    </Tag>\n',
  },
  {
    id: "ticket-text/dish-title-drops-echo",
    file: "apps/qr/components/staff/TicketText.tsx",
    suite: "components/staff/TicketText.test.tsx",
    why: "Phase 2b — the ⋯ sheet's title names the dish the way the line reads: Burmese first, the English snapshot echoed (Dad's line, and the K15 safety net). Drop the echo and the English name the cook may read the dish by is gone",
    find: '      <span className="chrome-en">{line.name}</span>\n',
    replace: "",
  },
  {
    id: "kds-line/qty-one-stands",
    file: "apps/qr/lib/kds-line.ts",
    suite: "lib/kds-line.test.ts",
    why: "Phase 2b (commit 2) — only a multiple lights the quantity chip. Light a single too and every chip is the same lit block again: a 2 reads like a 1 at arm's length, which is how short plates go out",
    find: "  return qty > 1;\n",
    replace: "  return qty >= 1;\n",
  },
];

const args = new Set(process.argv.slice(2));
const skipGate = args.has("--no-gate");
const only = [...args].find((a) => a.startsWith("--only="))?.slice("--only=".length);

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function run(cmd, cmdArgs, cwd) {
  return execFileSync(cmd, cmdArgs, { cwd, encoding: "utf8", stdio: "pipe" });
}
/** Run a vitest file; true = the suite PASSED. */
function suitePasses(suite) {
  try {
    run("npx", ["vitest", "run", suite], QR);
    return true;
  } catch {
    return false;
  }
}

/** Refuse to mutate a file that has uncommitted changes — a crash must never eat real work. */
function assertClean(files) {
  const dirty = run("git", ["status", "--porcelain", "--", ...files], ROOT).trim();
  if (dirty) {
    console.error(c.red("\n✗ Uncommitted changes in files this script mutates:\n"));
    console.error(dirty);
    console.error(
      c.dim("\n  Commit or stash them first. verify:slice rewrites these files in place and\n") +
        c.dim("  restores them; it will not risk your working copy.\n"),
    );
    process.exit(1);
  }
}

// Coverage first — a changed money-path file with NO mutant is the cheapest failure to surface, and
// it was the single most expensive class to discover any other way (two review-round HIGHs, ~3.5M
// tokens each, both reducible to this grep). Fails in ~1s, before the minute-long gate.
process.stdout.write("money-path coverage … ");
try {
  execFileSync("node", ["scripts/check-money-coverage.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}

// M17 — the cheapest guard in this file, added because CI caught what `ls` could have. Two
// migrations shared a timestamp; the CLI keys `schema_migrations` on that prefix alone, so the
// collision surfaced as a duplicate-key INSERT only after a full stack had started and replayed
// every migration. Pure filename facts belong before the expensive gate, not inside it.
try {
  execFileSync("node", ["scripts/check-migration-versions.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}

// W16d review BLOCK — the same shape of cheap grep, for the photo filter. A unit test on
// `safeImageUrl` is BLIND to a filter re-added at a CALL SITE (proven: re-adding it inside
// getCartView's media map leaves media-url.test.ts fully green), and that is precisely how W13
// hid 34 real dish photos behind the placeholder for a whole milestone.
try {
  execFileSync("node", ["scripts/check-photo-filter.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}

// W22d — the third cheap grep: the hex values that ESCAPE the token system. `contrast-audit` parses
// tokens.css and is rigorous about everything it can see, which makes it easy to assume the palette
// is fully covered — but the service worker's offline shell and `viewport.themeColor` ship before any
// stylesheet exists, so both carry hand-copied hex that no test can reach. Two of those values had
// already drifted when the guard was written, silently, for however long.
try {
  execFileSync("node", ["scripts/check-theme-parity.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}

// M70 — the fourth cheap grep: the promo grant is pinned, and pinned BEFORE the amount is derived.
// `create-intent` has no test file and carries a `verify:slice-exempt` line, so deleting the pin
// call leaves every other gate in this repo green while M70 silently regresses.
try {
  execFileSync("node", ["scripts/check-promo-grant-pin.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}

// M70 — the fifth cheap grep: `packages/db/src/database.types.ts` is hand-edited in a container with
// no Postgres, so a new RPC's entry is typed by guess and the first thing that checks it is CI's
// `migrations-check + types-fresh` — six image pulls and 120 migrations before a one-line diff. M70
// burned TWO of those cycles on plain alphabetical slips. Worse, `types-fresh` runs BEFORE the SQL
// tests in that job, so the slip aborts the stack before a single `supabase/tests/*.sql` assertion
// executes: the migration's real proof never runs, and the red check names the types file.
try {
  execFileSync("node", ["scripts/check-generated-types-sorted.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}

// Every mutant must carry a UNIQUE id, checked before anything else runs.
//
// This is here because it already happened, and a full run could not see it. A new mutant was
// written with TWO `id:` keys; the later one won, so the object was fine — but the duplicate had
// silently taken the id of the NEXT mutant in the list, which was left with none. A full run stayed
// green (it filters nothing, so it never reads `m.id`), while `--only=lock` crashed on
// `undefined.includes` and the W6c settle_by mutant became untargetable. A count of 228 caught
// proved 228 mutations still fail their suites; it could not prove they are still ADDRESSABLE, and
// an id is how a human re-runs the one mutant they are iterating on.
{
  const seen = new Map();
  const bad = [];
  MUTANTS.forEach((m, i) => {
    if (typeof m.id !== "string" || !m.id) bad.push(`#${i} (${m.file}) has no id`);
    else if (seen.has(m.id)) bad.push(`"${m.id}" is used by #${seen.get(m.id)} and #${i}`);
    else seen.set(m.id, i);
  });
  if (bad.length) {
    console.error(c.red(c.bold("\n\u2717 mutant ids are not unique:\n")));
    for (const b of bad) console.error(`  ${b}`);
    console.error(
      c.dim("\n  A duplicate key silently steals the next mutant's id — JS keeps the last one.\n"),
    );
    process.exit(1);
  }
}

const targets = MUTANTS.filter((m) => !only || m.id.includes(only));
const files = [...new Set(targets.map((m) => m.file))];

console.log(c.bold("\nverify:slice — the mechanical pre-PR gate\n"));

// ── 1 · the standard gate ─────────────────────────────────────────────────────────────────────────
if (!skipGate) {
  process.stdout.write("gate (lint · typecheck · build · test) … ");
  try {
    run("pnpm", ["turbo", "run", "lint", "typecheck", "build", "test"], ROOT);
    console.log(c.green("green"));
  } catch (e) {
    console.log(c.red("RED"));
    console.error(String(e.stdout || e.message).slice(-4000));
    process.exit(1);
  }
} else {
  console.log(c.dim("gate … skipped (--no-gate)"));
}

// ── 2 · the mutation battery ──────────────────────────────────────────────────────────────────────
assertClean(files);

const originals = new Map(files.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));
const restoreAll = () => {
  for (const [f, src] of originals) writeFileSync(path.join(ROOT, f), src);
};
process.on("SIGINT", () => {
  restoreAll();
  console.log(c.red("\ninterrupted — files restored"));
  process.exit(130);
});

// A red baseline would make every mutant look "caught" for the wrong reason.
process.stdout.write("\nbaseline suites … ");
const suites = [...new Set(targets.map((m) => m.suite))];
const redBaseline = suites.filter((s) => !suitePasses(s));
if (redBaseline.length) {
  console.log(c.red("RED"));
  console.error(c.red(`\n✗ These suites fail BEFORE any mutation: ${redBaseline.join(", ")}`));
  console.error(
    c.dim("  Every mutant would appear 'caught' for the wrong reason. Fix these first.\n"),
  );
  process.exit(1);
}
console.log(c.green(`green (${suites.length} suite${suites.length === 1 ? "" : "s"})`));

console.log(c.bold(`\nmutating (${targets.length}) — each must turn its suite RED\n`));
const survived = [];
const stale = [];
const unparseable = [];

/**
 * Does the mutated source still PARSE?
 *
 * ⚠️ ADDED BY THE BLIND ADVERSARIAL PASS ON #254 (CRITICAL), and the defect it caught is the reason
 * this exists rather than a style note. A retargeted mutant cut the `if` out of an `if/else` pair,
 * leaving a bare `else` — a SyntaxError. `suitePasses` is an exit-code check, so a file that will not
 * parse reddens EVERY test in its suite, the mutant scores `caught`, and the operator reads green.
 *
 * A mutation that does not parse measures the PARSER, not the guard. It is scored `caught` for a
 * reason that has nothing to do with the proposition it exists to prove, and the assertion it was
 * written to protect is left unproven while looking proven — the exact class this whole script is
 * built to refuse, arriving through the script itself.
 *
 * `typescript` is already a dependency and its parser reports syntactic diagnostics without a
 * program or a typecheck, so this costs milliseconds per mutant.
 */
const parses = (rel, code) => {
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, kind);
  return sf.parseDiagnostics.length === 0;
};
try {
  for (const m of targets) {
    const abs = path.join(ROOT, m.file);
    const src = originals.get(m.file);
    const hits = src.split(m.find).length - 1;
    if (hits !== 1) {
      // A mutant that no longer applies is NOT a pass. The code moved and this guard is now fiction —
      // exactly the silent rot the whole script exists to prevent.
      stale.push({ ...m, hits });
      console.log(
        `  ${c.red("STALE")}  ${m.id} ${c.dim(`— pattern matched ${hits}× (expected 1)`)}`,
      );
      continue;
    }
    const mutated = src.replace(m.find, m.replace);
    if (!parses(m.file, mutated)) {
      // Not a pass and not a failure of the CODE — a failure of the MUTATION. See `parses` above.
      unparseable.push(m);
      console.log(
        `  ${c.red("UNPARSEABLE")}  ${m.id} ${c.dim("— the mutated file does not parse; it would score `caught` off a SyntaxError")}`,
      );
      continue;
    }
    writeFileSync(abs, mutated);
    const caught = !suitePasses(m.suite);
    writeFileSync(abs, src);
    if (caught) {
      console.log(`  ${c.green("caught")} ${m.id} ${c.dim(`— ${m.why}`)}`);
    } else {
      survived.push(m);
      console.log(`  ${c.red("SURVIVED")} ${m.id} ${c.dim(`— ${m.why}`)}`);
    }
  }
} finally {
  restoreAll();
}

// ── 3 · the orphan-suite guard (mirrors ci.yml) ───────────────────────────────────────────────────
process.stdout.write("\norphan-suite guard … ");
// Enumerated through git, not `find`: the guard asks "does any test file exist that no config
// runs?", and only files git would SHIP can answer yes. A bare `find` walks build artifacts too, and
// `.review-bundle/` — which the workflow tells you to generate right before every adversarial pass —
// copies each changed file, `.test.ts` included, into one flat directory. That reported 30+ orphans
// and made the gate unusable at exactly the moment it is supposed to run. `--cached --others
// --exclude-standard` is tracked + untracked-minus-ignored, so a brand-new test file is still checked
// before it is committed, and no future artifact directory can trip this again.
// VARIADIC, deliberately: the caller below passes three non-running suffixes, and a single-pattern
// signature would have silently dropped two of them into the shell as nothing — a guard quietly
// looking for less than it says it does, which is the exact class this file exists to prevent.
const find = (...patterns) =>
  run(
    "bash",
    [
      "-c",
      `git ls-files --cached --others --exclude-standard -- ${patterns.map((p) => `'${p}'`).join(" ")}`,
    ],
    ROOT,
  )
    .split("\n")
    .filter(Boolean)
    .map((p) => `./${p}`);
const allTs = find("*.test.ts");
// A SECOND pathspec, not a looser one: `git ls-files -- '*.test.ts'` does NOT match `.test.tsx`
// (measured), so `allTs` has never once enumerated a tsx file.
const allTsx = find("*.test.tsx");
/**
 * The guard's own self-check, because "no orphans found" and "nothing was looked at" print the same
 * word. The git form can enumerate empty-and-zero where `find` could not (no `.git`, a
 * `safe.directory` refusal); `run()` throws on a nonzero exit, so the earlier `|| true` was removed.
 *
 * A bare count is not enough, though (Codex round 2): with 104 tests under `apps/qr` alone, an
 * enumeration accidentally scoped to that one subtree clears any total-count floor while every
 * potential orphan root — `packages/*`, `scripts/`, the repo root itself — goes unlooked-at, and the
 * guard prints "clean". So the check is per-ROOT: every configured suite root must be represented,
 * which cannot hold for a listing scoped inside any one of them.
 */
const SUITE_ROOTS = [
  { label: "apps/qr", re: /^\.\/apps\/qr\// },
  { label: "packages/ui/src", re: /^\.\/packages\/ui\/src\// },
];
const unseen = SUITE_ROOTS.filter((r) => !allTs.some((p) => r.re.test(p)));
if (allTs.length < 10 || unseen.length) {
  console.log(c.red("FAIL"));
  console.error(
    c.red(`\n✗ orphan-suite guard enumerated ${allTs.length} test file(s)`) +
      (unseen.length ? c.red(`, none under ${unseen.map((r) => r.label).join(" / ")}`) : "") +
      c.red(" — it cannot have run.\n") +
      c.dim("  Check that this is a whole-repo git checkout `git ls-files` can read.\n"),
  );
  process.exit(1);
}
const tsOrphans = allTs.filter((p) => !SUITE_ROOTS.some((r) => r.re.test(p)));
// ⚠️ NARROWER THAN `SUITE_ROOTS` ON PURPOSE (M46). apps/qr includes `**/*.test.{ts,tsx}`;
// packages/ui is still `src/**/*.test.ts`, so a `.test.tsx` THERE runs nowhere. Reusing the shared
// root list here would whitelist it by directory — the exact hole W8 closed.
const tsxOrphans = allTsx.filter((p) => !/^\.\/apps\/qr\//.test(p));
// BOTH `.spec` suffixes are matched by NO vitest config at any path, so either is an orphan
// wherever it sits. `.spec` joined this list from T5 / Codex P2 on #241: the orphan guard had
// only ever enumerated the `.test` suffix, so a conventional `packages/db/foo.spec.ts` ran
// nowhere AND was reported by nothing — the original invisible-test hole, under a different
// filename. Keep in step with the mirror in ci.yml.
const nonRunners = find("*.spec.ts", "*.spec.tsx");

// ⚠️ ONE IMPLEMENTATION, TWO CALLERS (blind adversarial pass on #252). The environment check used
// to live here in JS and again in `ci.yml` in POSIX ERE, and the two DISAGREED on a shape that
// matters — see `scripts/check-test-env.mjs` for the measurement. CI now runs that module directly.
// `find()` yields `./`-prefixed repo-relative paths; the shared checker reads absolute ones.
const toAbs = (p) => path.join(ROOT, p);
const badPragma = envFailures({ tsFiles: allTs.map(toAbs), tsxFiles: allTsx.map(toAbs) }).map((m) =>
  m.replace(`${ROOT}/`, "./"),
);

const orphans = [...tsOrphans, ...tsxOrphans, ...nonRunners];
console.log(orphans.length || badPragma.length ? c.red("FAIL") : c.green("clean"));
for (const o of orphans)
  console.log(`  ${c.red("orphan")} ${o} ${c.dim("— no vitest config runs this")}`);
for (const b of badPragma) console.log(`  ${c.red("environment")} ${b}`);

// ── verdict ───────────────────────────────────────────────────────────────────────────────────────
const failed =
  survived.length + stale.length + unparseable.length + orphans.length + badPragma.length;
if (failed === 0) {
  console.log(
    c.green(c.bold(`\n✓ verify:slice passed — ${targets.length} mutants caught, no orphans\n`)),
  );
  process.exit(0);
}
console.log(c.red(c.bold("\n✗ verify:slice FAILED\n")));
if (survived.length) {
  console.log(c.red(`  ${survived.length} mutant(s) SURVIVED — the guard for each is too weak:`));
  for (const m of survived)
    console.log(`    · ${m.id} — ${m.why}\n      suite: apps/qr/${m.suite}`);
  console.log(
    c.dim("\n  A surviving mutant means the behaviour can change with the suite still green.\n") +
      c.dim(
        "  Usually the fixture is DEGENERATE — two code paths produce the same numbers on it.\n",
      ) +
      c.dim("  Find inputs that separate them (search numerically), don't just add assertions.\n"),
  );
}
if (unparseable.length) {
  console.log(
    c.red(`  ${unparseable.length} mutant(s) UNPARSEABLE — the mutation, not the code, is broken:`),
  );
  for (const m of unparseable) console.log(`    · ${m.id} (${m.file})`);
  console.log(
    c.dim(
      "\n  A mutation must remain valid code. One that does not parse reddens its whole suite for a\n",
    ) + c.dim("  reason unrelated to the rule, so it scores `caught` while proving nothing.\n"),
  );
}
if (stale.length) {
  console.log(
    c.red(`  ${stale.length} mutant(s) STALE — update MUTANTS in scripts/verify-slice.mjs:`),
  );
  for (const m of stale) console.log(`    · ${m.id} — pattern matched ${m.hits}× in ${m.file}`);
}
process.exit(1);
