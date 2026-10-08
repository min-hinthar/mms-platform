#!/usr/bin/env node
/**
 * The coverage half of the mechanical gate: **a changed money-path file must have a mutant.**
 *
 * Two of the nine HIGH findings across W10d's review rounds reduced to one sentence — *this file has
 * no test and no mutant, so the rule I just added cannot fail.* Both cost a full adversarial round
 * (~3.5M tokens, ~80 minutes) to discover. Both are a grep.
 *
 * `verify:slice` already proves every mutant in `MUTANTS` turns its suite red. What nothing checked is
 * the other direction: whether a file that NEEDS a mutant has one. `MUTANTS` grew by hand, so it only
 * ever covered the files someone remembered — `lib/split.ts` carried the whole abort/hold-release rule
 * with zero coverage, and `create-share-intent/route.ts` carried the claim whose regression 42703'd
 * production, also with zero coverage. Reverting either left the suite green.
 *
 * So: any file changed against the merge base, under a money-bearing path, that touches Stripe or the
 * share/cart money columns, must appear as a `file:` in `MUTANTS` — or carry an in-file exemption that
 * says why, in writing, where the next reader will see it.
 *
 *   // verify:slice-exempt — <reason>
 *
 * The exemption is deliberately a comment rather than a list in this script: a reason that lives next
 * to the code gets re-read when the code changes; a name in an allowlist never does.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** Paths whose contents can move money or authorize a payer. */
const MONEY_PATHS = [/^apps\/qr\/lib\//, /^apps\/qr\/app\/api\//];

/**
 * What makes a file money-bearing. Deliberately about the NOUNS the money lives in rather than about
 * filenames: a helper called `format.ts` that reaches for `paymentIntents` is exactly the file this
 * check exists to notice.
 */
const MONEY_MARKERS = [
  /paymentIntents/,
  /getStripe\(/,
  /qr_cart_shares/,
  /amount_cents/,
  /subtotal_cents/,
  /stripe_payment_intent_id/,
  /idempotencyKey/,
  /\bcaptureAllIfReady\b/,
  // M119a — `paymentInFlightReason` IS the money mutex ("the shared 'is money moving on this cart?'
  // guard", pay-guard.ts), and this list could not see it. `tabs.ts` matched NO marker at all, so
  // `openTab`'s copy of the guard was revertible with every gate green — and it had in fact already
  // been reverted: the read's `{ error }` was dropped, `paymentInFlightReason(null)` returns null by
  // contract, and the refusal was SKIPPED while a card was mid-authorization. The guard was blind to
  // the exact file whose money defect it exists to catch. Listed as a FUNCTION for the same reason
  // `captureAllIfReady` and `summarizeRefund` are: the money lives in the decision, not in a column.
  //
  // ⚠️ Three further callers now fall under this marker with no mutant yet — `floor.ts`,
  // `approvals.ts`, `voids.ts`. That is deliberate and it is not silent: the guard only requires a
  // mutant for a CHANGED file, so each will be asked for one the next time it is touched, rather
  // than forcing three unrelated mutants into this change.
  /\bpaymentInFlightReason\b/,
  /\breleaseHold\b/,
  // W16a review MED — the mode-price seam (order-lines.ts) and the toggle re-price (cart.ts) were
  // both revertible with every gate green because neither file matched a marker: the noun the
  // charged price actually lives in was missing.
  /\bunit_price_cents\b/,
  // W23b — the refund columns and the one function that reads them into a verdict. `refund-view.ts`
  // is pure and touches no other noun on this list, so without these it was a money-DECISION module
  // the guard could not see: the rule that decides whether a receipt says "Paid in full" would have
  // been revertible with every gate green. `summarizeRefund` is listed for the same reason
  // `captureAllIfReady` is — the noun is a function when the money lives in a decision.
  /\brefunded_cents\b/,
  /\bsummarizeRefund\b/,
  // W23d — the same reasoning one slice on. `dropped-view.ts` decides whether a receipt discloses
  // that the basket shrank between the tap and the charge, and whether a screen is allowed to say
  // "no payment was taken"; `manual-capture-mode.ts` decides whether the arrival screen may claim a
  // payment at all. None of them names a money COLUMN, so without these three the rules would be
  // money decisions the guard cannot see — revertible with every gate green.
  /\bparseDroppedLines\b/,
  /\bsettleCanceledCopy\b/,
  /\bawaitingManualCapture\b/,
  // W22c — `catalogFreshness` names no money column either, but it is the one thing that decides
  // whether a diner who pulls the menu down is TOLD a price moved. W17b ships a live staff price
  // editor, so prices really do move mid-service; a rule that silently stopped reporting that would
  // be revertible with every gate green, on the surface a diner uses precisely when they suspect
  // what they are looking at is stale.
  /\bcatalogFreshness\b/,
  // W22e — same reasoning again, for a RECOGNITION claim rather than a price one. `yourUsual`
  // decides whether the app tells a diner "this is your usual" and whether two dishes are joined by
  // a `+` that asserts they were ordered together. It names no money column, so without this the
  // honesty rules would be revertible with every gate green — on a card that speaks about the diner
  // themselves, which is where a fabrication is least forgivable.
  /\byourUsual\b/,
  // M108 review (blind pass) — `authz.ts` names no money column, but since M108 it is the ONE
  // producer of the session mode every dine-in/to-go tax fork reads. It matched nothing on this
  // list, so the file that DECIDES the fork was invisible here while `cart.ts`, which merely reads
  // the decision, was visible. `CartAuthz` occurs in exactly one file (measured), so this makes the
  // producer visible without dragging in every consumer that calls the guard.
  /\bCartAuthz\b/,
  // ── Phase 1c · pay-element ── `payElementView` names no money column either, but its `payable`
  // IS the card-path charge gate (the Pay button's aria-disabled and `confirm()` both read it) —
  // the same reasoning as `awaitingManualCapture`: the money lives in the decision.
  /\bpayElementView\b/,
];

const EXEMPT = /verify:slice-exempt\s*—?\s*(.+)/;

function run(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Refuse to answer. A coverage check that cannot name what it compared against has checked NOTHING,
 * and "nothing to check" and "nothing wrong" print the same word — so in CI the absence of a base is
 * a failure, never an empty list.
 */
function failClosed(why) {
  console.error(c.red(c.bold("\n✗ money-path coverage cannot run: ")) + why);
  console.error(
    c.dim(
      "\n  Set MONEY_COVERAGE_BASE to the commit this change is measured against (CI: the PR's\n" +
        "  base sha, or the push's `before`) and make sure the checkout holds it — actions/checkout's\n" +
        "  default depth-1 clone has neither origin/main nor HEAD~1, so the old fallback checked an\n" +
        "  empty list and printed `clean`.\n",
    ),
  );
  process.exit(1);
}

/**
 * The commit to diff against, and where it came from. In order:
 *
 *   1. `MONEY_COVERAGE_BASE` — CI sets it explicitly. Set but unresolvable is a FAILURE wherever it
 *      runs, never a fallback: falling back would silently check something other than what was asked.
 *      GitHub's all-zero `before` (a newly created branch) counts as unset.
 *   2. the merge base with origin/main — the local default.
 *   3. HEAD~1 — LOCAL ONLY. On CI it would quietly check one commit of a many-commit change, and a
 *      depth-1 checkout does not have it anyway; with `CI` set, reaching this point fails closed.
 *
 * Returns null only locally, in a repo with nothing to compare against (a fresh single-commit clone).
 */
function resolveBase() {
  const asked = (process.env.MONEY_COVERAGE_BASE ?? "").trim();
  if (asked && !/^0+$/.test(asked)) {
    try {
      const sha = run("git", ["rev-parse", "--verify", "--quiet", `${asked}^{commit}`]).trim();
      return { sha, from: `MONEY_COVERAGE_BASE=${asked}` };
    } catch {
      failClosed(
        `MONEY_COVERAGE_BASE=${asked} does not name a commit in this checkout (shallow clone?).`,
      );
    }
  }
  try {
    return { sha: run("git", ["merge-base", "HEAD", "origin/main"]).trim(), from: "origin/main" };
  } catch {
    // fall through
  }
  if (process.env.CI) {
    failClosed(
      "CI is set, MONEY_COVERAGE_BASE is unset or empty, and origin/main is not in this checkout.",
    );
  }
  try {
    return { sha: run("git", ["rev-parse", "HEAD~1"]).trim(), from: "HEAD~1" };
  } catch {
    return null; // local only: a fresh repo with one commit — nothing to compare against
  }
}

/** Files changed between the base (via the merge base, `...`) and HEAD. */
function changedFiles(base) {
  let out;
  try {
    out = run("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base.sha}...HEAD`]);
  } catch (e) {
    // `...` needs a merge base, which a shallow checkout may not hold even when both ends exist.
    failClosed(`git diff ${base.sha.slice(0, 10)}...HEAD failed: ${String(e.stderr || e).trim()}`);
  }
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The files `MUTANTS` covers. Read by regex rather than by importing `verify-slice.mjs`, because that
 * module RUNS the gate on import — this check has to stay cheap enough to sit in front of it.
 */
function coveredFiles() {
  const src = readFileSync(path.join(ROOT, "scripts/verify-slice.mjs"), "utf8");
  return new Set([...src.matchAll(/^\s*file:\s*"([^"]+)"/gm)].map((m) => m[1]));
}

const covered = coveredFiles();
const gaps = [];
const exempted = [];

const base = resolveBase();
const changed = base ? changedFiles(base) : [];
// Say what was compared, so a vacuous pass is visible as one ("0 changed files") instead of reading
// exactly like a real one.
const against = base
  ? `${changed.length} changed file${changed.length === 1 ? "" : "s"} vs ${base.sha.slice(0, 10)} (${base.from})`
  : "no base — a single-commit repo, nothing compared";

for (const rel of changed) {
  if (!MONEY_PATHS.some((re) => re.test(rel))) continue;
  if (/\.(test|spec)\.[tj]sx?$/.test(rel)) continue; // a test needs no mutant of its own
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue; // renamed away
  const src = readFileSync(abs, "utf8");
  if (!MONEY_MARKERS.some((re) => re.test(src))) continue;
  if (covered.has(rel)) continue;
  const exempt = src.match(EXEMPT);
  if (exempt) exempted.push([rel, exempt[1].trim()]);
  else gaps.push(rel);
}

if (exempted.length) {
  console.log(c.dim(`  ${exempted.length} exempt:`));
  for (const [f, why] of exempted) console.log(c.dim(`    ${f} — ${why}`));
}

if (gaps.length === 0) {
  console.log(
    c.green("clean") + c.dim(` — every changed money-path file has a mutant (${against})`),
  );
  process.exit(0);
}

console.error(
  c.red(c.bold(`\n✗ changed money-path files with no mutant in MUTANTS (${against}):\n`)),
);
for (const f of gaps) console.error(`    ${f}`);
console.error(
  c.dim(
    "\n  Each of these can have a money rule reverted with the suite still green — the class that\n" +
      "  produced two HIGH findings in W10d. Add a mutant to scripts/verify-slice.mjs naming the\n" +
      "  suite that must catch it, or, if a mutant genuinely does not apply, say so in the file:\n\n" +
      "    // verify:slice-exempt — <reason>\n",
  ),
);
process.exit(1);
