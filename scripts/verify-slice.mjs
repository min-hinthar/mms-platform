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
    why: "W16c — the last thing under the diner's thumb must name the sum it charges; a proceed button reading a bare 'Yes, pay' is a confirm that never showed what it confirms",
    find: '        proceedEn: `${t("en", "confirmPayProceed")} ${amount}`,',
    replace: '        proceedEn: t("en", "confirmPayProceed"),',
  },
  {
    id: "confirm-copy/owner-verbatim-string-swapped",
    file: "apps/qr/lib/confirm-copy.ts",
    suite: "lib/confirm-copy.test.ts",
    why: "W16c — the send-to-kitchen proceed button carries Min's OWN Burmese from the W16 directive; a silent swap to another key is exactly the drift the pin exists to catch",
    find: '        proceedMy: t("my", "confirmSendProceed"),',
    replace: '        proceedMy: t("my", "confirmSendLabel"),',
  },
  // ── W19 — the forgot-to-send notice (pay-with-drafts is supported, but INFORMED) ────────────────
  {
    id: "confirm-copy/unsent-items-silenced-in-the-charge-confirm",
    file: "apps/qr/lib/confirm-copy.ts",
    suite: "lib/confirm-copy.test.ts",
    why: "W19 — a diner who forgot to send can pay; the charge INCLUDES the drafts and the kitchen only starts them after payment. The confirm naming them is what turns that from a surprise into a choice — dropping the line is the plausible 'clean up the detail string' edit",
    find: "      const unsent = d.unsentCount ?? 0;",
    replace: "      const unsent = 0;",
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
    find: "    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)\n    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`);",
    replace: "    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`);",
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
    file: "apps/qr/lib/cart.ts",
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
    why: 'W23c — the void that would remove unmakeable lines failed. Capturing anyway bills the FULL hold for food that does not exist \u2014 the exact charge this path was built to prevent \u2014 where leaving the authorization standing costs nothing and lets Stripe redeliver. \u26a0\ufe0f M72 folded `unreadable-catalog-reads-as-available` (Codex #203 P1) into this mutant rather than leaving it stale: the catalog is now read INSIDE the RPC, so "I could not read the catalog" is no longer a separate app-side arm \u2014 it arrives here, as a failed precheck. The rule is unchanged and still guarded; only its entry point moved. A failure must never read as empty.',
    find: '    return { kind: "retry", note: "precheck failed" };',
    replace: '    console.error("[manual-capture] proceeding despite precheck failure");',
  },
  {
    id: "manual-capture-run/captures-the-hold-not-the-rederived-total",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c/M72 — the ORDER is the money rule, pinned by its only observable consequence. A total read BEFORE the voids still contains the dish the kitchen ran out of, and the visible result is identical to capturing the hold outright: the guest pays for food that does not exist. The old anchor for this rule emptied the app-side unavailable list, which M72 deleted \u2014 and which never pinned the ordering anyway (the coverage audit confirmed it survives hoisting the read anywhere earlier). Charging `authorizedCents` instead of the re-derived figure is the defect stated directly.",
    find: "      { amount_to_capture: plan.amountCents },",
    replace: "      { amount_to_capture: authorizedCents },",
  },
  {
    id: "manual-capture-run/cart-not-open-verdict-discarded",
    file: "apps/qr/lib/manual-capture-run.ts",
    suite: "lib/manual-capture-run.test.ts",
    why: "W23c (Codex #203 P1) — the precheck IS the proof that the cart is still open and this payer still holds its lock, and a hold can outlive its basket whether or not a dish ran out. Its VERDICT is the load-bearing half: discard the -1 arm and a cart settled by cash out of band, or cleared entirely, is captured anyway \u2014 charging a guest for an order that already closed. The old anchor mutated the caller-supplied id list, which M72 removed because the server derives the set itself; the rule it guarded (the precheck runs and is believed on EVERY capture, not only when something is dropped) now lives here.",
    find: "  if (voided === -1) {",
    replace: "  if (false) {",
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
    find: "  if (pinError) {\n    const releaseErr = await releaseSettlement(id);",
    replace: "  if (false) {\n    const releaseErr = await releaseSettlement(id);",
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
    find: "      null,\n      qty,\n    );",
    replace: "      null,\n    );",
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
    find: '  if (body && DEVICE_REFUSALS.get(status) === body.reason) return { kind: "verdict", message };',
    replace: '  if (status === 401 || status === 503) return { kind: "verdict", message };',
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
    why: "W6c — the settlement freeze is the double-collect mutex; minting the reader PI on an unfrozen cart lets a diner's phone payment capture during the collect window",
    find: "  const freeze = await acquireSettlement(cart.id, attemptId);",
    replace: '  const freeze = "acquired" as Awaited<ReturnType<typeof acquireSettlement>>;',
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
    find: "    const relErr = await releaseSettlementFor(cartId, attempt);",
    replace: "    const relErr = null as { message: string } | null;",
  },
  {
    id: "terminal/recording-window-stops-extending",
    file: "apps/qr/lib/terminal.ts",
    suite: "lib/terminal.test.ts",
    why: "W6c review — captured-but-unfulfilled is the window where the freeze matters MOST (money moved, cart open); if the poll stops extending there, a delayed webhook past the TTL hands the cart to a cash settle and the guest is double-charged",
    find: "    // Captured but not yet fulfilled — the window where the freeze matters MOST (money has moved,\n    // the cart is still open). Keep it fresh, or a delayed webhook past the TTL hands the cart to\n    // a cash settle and the guest is double-charged (review finding).\n    await extendSettlement(cartId);\n",
    replace:
      "    // Captured but not yet fulfilled — the window where the freeze matters MOST (money has moved,\n    // the cart is still open). Keep it fresh, or a delayed webhook past the TTL hands the cart to\n    // a cash settle and the guest is double-charged (review finding).\n",
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
    id: "lock/attempt-release-not-scoped",
    file: "apps/qr/lib/lock.ts",
    suite: "lib/lock.test.ts",
    why: "W6c review (confirmed HIGH) — without the settle_by predicate, a release that outlived its attempt (a late webhook canceled/failed delivery after a cancel→retry, a stale panel, a double-tap loser) nulls a SUCCESSOR attempt's live freeze and reopens the reader-vs-phone double-collect",
    find: '    .eq("id", cartId)\n    .eq("settle_by", attemptId);',
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
    writeFileSync(abs, src.replace(m.find, m.replace));
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
const find = (pattern) =>
  run("bash", ["-c", `git ls-files --cached --others --exclude-standard -- '${pattern}'`], ROOT)
    .split("\n")
    .filter(Boolean)
    .map((p) => `./${p}`);
const allTs = find("*.test.ts");
/**
 * The guard's own self-check, because "no orphans found" and "nothing was looked at" print the same
 * word. The git form can enumerate empty-and-zero where `find` could not (no `.git`, a
 * `safe.directory` refusal); `run()` throws on a nonzero exit, so the earlier `|| true` was removed.
 *
 * A bare count is not enough, though (Codex round 2): with ~89 tests under `apps/qr` alone, an
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
const tsxAny = find("*.test.tsx"); // no vitest config includes .tsx — any is an orphan
const orphans = [...tsOrphans, ...tsxAny];
console.log(orphans.length ? c.red("FAIL") : c.green("clean"));
for (const o of orphans)
  console.log(`  ${c.red("orphan")} ${o} ${c.dim("— no vitest config runs this")}`);

// ── verdict ───────────────────────────────────────────────────────────────────────────────────────
const failed = survived.length + stale.length + orphans.length;
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
if (stale.length) {
  console.log(
    c.red(`  ${stale.length} mutant(s) STALE — update MUTANTS in scripts/verify-slice.mjs:`),
  );
  for (const m of stale) console.log(`    · ${m.id} — pattern matched ${m.hits}× in ${m.file}`);
}
process.exit(1);
