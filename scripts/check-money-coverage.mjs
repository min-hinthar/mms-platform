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
  /\breleaseHold\b/,
  // W16a review MED — the mode-price seam (order-lines.ts) and the toggle re-price (cart.ts) were
  // both revertible with every gate green because neither file matched a marker: the noun the
  // charged price actually lives in was missing.
  /\bunit_price_cents\b/,
];

const EXEMPT = /verify:slice-exempt\s*—?\s*(.+)/;

function run(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Files changed against the merge base with origin/main (or against HEAD~1 when that is unavailable). */
function changedFiles() {
  let base;
  try {
    base = run("git", ["merge-base", "HEAD", "origin/main"]).trim();
  } catch {
    try {
      base = run("git", ["rev-parse", "HEAD~1"]).trim();
    } catch {
      return []; // a fresh repo with one commit — nothing to compare against
    }
  }
  return run("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`])
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

for (const rel of changedFiles()) {
  if (!MONEY_PATHS.some((re) => re.test(rel))) continue;
  if (/\.(test|spec)\.[tj]sx?$/.test(rel)) continue; // a test needs no mutant of its own
  if (/\.tsx$/.test(rel)) continue; // no vitest config here runs .tsx — tracked as OPEN-ITEMS M46
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
  console.log(c.green("clean") + c.dim(" — every changed money-path file has a mutant"));
  process.exit(0);
}

console.error(c.red(c.bold("\n✗ changed money-path files with no mutant in MUTANTS:\n")));
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
