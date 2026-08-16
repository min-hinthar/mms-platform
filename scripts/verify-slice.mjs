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
    id: "totals/grocery-in-tip-gate",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "W16a/M26 — grocery lines must not open the tip ask: the restaurantBase reduce is the tip gate's only input",
    find: '(i.fulfillment === "grocery" ? 0 : Number(i.unitPriceCents) * i.qty)',
    replace: "Number(i.unitPriceCents) * i.qty",
  },
  {
    id: "totals/reward-clamp-order",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "the reward must clamp to what REMAINS after the promo, or the total goes negative",
    find: "Math.min(rewardCentsRaw, Math.max(subtotalCents - promoCents, 0))",
    replace: "Math.min(rewardCentsRaw, subtotalCents)",
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
    id: "reorder/mode-fork-collapses-to-dinein",
    file: "apps/qr/lib/reorder.ts",
    suite: "lib/reorder-mode.test.ts",
    why: "W17a — reorder's session-mode fork is the re-added line's routing TAG and, through it, its tax. Collapsing it taxes every pickup reorder of a COLD dish that CDTFA Reg 1603 exempts to-go",
    find: '          fulfillment: dineIn ? "dinein" : "togo",',
    replace: '          fulfillment: "dinein" as const,',
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
    find: '  if (!written) return { ok: false, error: "That dish is no longer on the menu." };',
    replace: "",
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
    id: "kiosk/unset-token-answers-open",
    file: "apps/qr/lib/kiosk.ts",
    suite: "lib/kiosk.test.ts",
    why: "W6b — an UNSET device token must mean the kiosk feature is OFF; degrading to open lets any visitor mint sessions and fire the reset with an empty string",
    find: '  if (!expected) return { ok: false, reason: "not_configured" };',
    replace: "  if (!expected) return { ok: true };",
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

// W16d review BLOCK — the same shape of cheap grep, for the photo filter. A unit test on
// `safeImageUrl` is BLIND to a filter re-added at a CALL SITE (proven: re-adding it inside
// getCartView's media map leaves media-url.test.ts fully green), and that is precisely how W13
// hid 34 real dish photos behind the placeholder for a whole milestone.
try {
  execFileSync("node", ["scripts/check-photo-filter.mjs"], { cwd: ROOT, stdio: "inherit" });
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
const find = (pattern) =>
  run(
    "bash",
    [
      "-c",
      `find . -name '${pattern}' -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' || true`,
    ],
    ROOT,
  )
    .split("\n")
    .filter(Boolean);
const tsOrphans = find("*.test.ts").filter((p) => !/^\.\/(apps\/qr\/|packages\/ui\/src\/)/.test(p));
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
