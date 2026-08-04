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
    id: "totals/service-rate",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "the SB-1524 service rate silently changes",
    find: "* 0.05)",
    replace: "* 0.06)",
  },
  {
    id: "totals/tax-on-undiscounted-base",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "tax stops honouring the discount (CDTFA: tax is on the DISCOUNTED taxable base)",
    find: "Math.round((taxableBaseCents - discOnTaxableCents) * taxRate())",
    replace: "Math.round(taxableBaseCents * taxRate())",
  },
  {
    id: "totals/grocery-in-service-base",
    file: "apps/qr/lib/totals-math.ts",
    suite: "lib/totals-math.test.ts",
    why: "W1a — retail lines must not carry a 'supports fair kitchen wages' charge",
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
    why: "the Covina rate must be pinned on the TS side (the SQL half is pinned in supabase/tests/)",
    find: "const RATE = 0.0975;",
    replace: "const RATE = 0.098;",
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
    find: 'if ((shares ?? []).some((s) => s.status === "captured" && s.stripe_payment_intent_id != null)) {',
    replace: 'if ((shares ?? []).some((s) => s.status === "captured")) {',
  },
  {
    id: "split/abort-skips-the-post-delete-release",
    file: "apps/qr/lib/split.ts",
    suite: "lib/split.test.ts",
    why: "the cancel loop runs off a snapshot; SharePay mints on mount, so a share claimed mid-abort is destroyed with its brand-new PaymentIntent never released",
    find: "    const outcome = await releaseHold(pi);",
    replace: '    const outcome = "released";',
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
