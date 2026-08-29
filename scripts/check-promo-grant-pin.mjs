#!/usr/bin/env node
/**
 * M70 — the fourth cheap grep: is the promo grant actually PINNED, and pinned in time?
 *
 * The whole of M70's SQL half is covered by `supabase/tests/m70_promo_grant_survives_settlement_test.sql`
 * on a real stack in CI. Its TypeScript half is two lines in `create-intent`, and neither is
 * reachable by any unit test: the route has no test file, and it sits under a
 * `verify:slice-exempt` line, so `check-money-coverage` waves it through. Delete the pin call and
 * every gate in this repo stays green while M70 silently regresses — a promo lapsing between
 * authorize and capture would once again raise the live total above the hold and cancel the order.
 *
 * Two rules, and the second is the one that is easy to lose in a refactor:
 *
 *   1. `create-intent` calls `mms_pin_promo_grant`.
 *   2. It calls it BEFORE `getCartTotals`. Deriving first would mint the Stripe amount from the
 *      LIVE promo value and then pin a possibly different one a moment later — the hold and the
 *      pin would disagree, which is the exact divergence M70 exists to remove.
 *
 * A grep is the right instrument here for the same reason `check-photo-filter` is: the fact is
 * structural and cheap to state, and the alternative is a 400-line mock scaffold that would mostly
 * exercise Stripe plumbing.
 *
 * Red-first: delete the `.rpc("mms_pin_promo_grant"` line, or move it below `getCartTotals(`, and
 * this exits 1 naming which rule broke.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/qr/app/api/stripe/create-intent/route.ts";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const raw = readFileSync(path.join(ROOT, FILE), "utf8");

/**
 * Blank out comments and string bodies, preserving offsets.
 *
 * This guard's whole claim is "the CALL is there, and it is first". A plain `indexOf` cannot make
 * that claim: `// await db.rpc("mms_pin_promo_grant", …)` contains the searched substring exactly,
 * so commenting the pin out left the guard GREEN while no pin executed — a green tick over a live
 * money regression, and the one failure mode a required check must never have. Codex P1 on #241
 * caught it, against a file whose own comment already said "a comment naming the RPC must not
 * satisfy this guard": the intent was written down and never implemented.
 *
 * Offsets are preserved (each removed character becomes a space) because the SECOND rule is an
 * ORDERING comparison — collapsing the text would move the two call sites relative to each other.
 * String bodies are blanked for the same reason comments are: a fixture or an error message quoting
 * the RPC name is not a call either.
 */
function stripNonCode(text) {
  const out = text.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      let j = text.indexOf("\n", i);
      if (j === -1) j = text.length;
      blank(i, j);
      i = j;
    } else if (two === "/*") {
      let j = text.indexOf("*/", i + 2);
      j = j === -1 ? text.length : j + 2;
      blank(i, j);
      i = j;
    } else if (text[i] === '"' || text[i] === "'" || text[i] === "`") {
      const q = text[i];
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") j += 2;
        else if (text[j] === q) break;
        else j++;
      }
      // Keep the quotes, blank the body — so `.rpc("mms_pin_promo_grant"` stops matching on the
      // NAME while the call shape around it stays greppable.
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

// Executable text only. `src` is the same LENGTH as the file, so every index below is a real
// offset into it and the ordering comparison stays meaningful.
const src = stripNonCode(raw);

// The name lives inside a string, which `stripNonCode` blanks — so match the call SHAPE and then
// confirm the name at that offset in the raw text. That keeps "is it code?" and "is it the right
// RPC?" as two separate questions, each answered by the source that can answer it.
const RPC = '.rpc("mms_pin_promo_grant"';
let pinAt = -1;
for (let k = src.indexOf('.rpc("'); k !== -1; k = src.indexOf('.rpc("', k + 1)) {
  if (raw.startsWith(RPC, k)) {
    pinAt = k;
    break;
  }
}
const totalsAt = src.indexOf("getCartTotals(");

process.stdout.write("promo grant pin — taken, and taken before the amount … ");

const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

if (pinAt === -1) {
  fail(
    `${FILE} no longer calls \`mms_pin_promo_grant\`.\n  ` +
      "M70: without the pin, a promo that lapses between authorization and capture (a sold-out\n  " +
      "void dropping the subtotal under min_subtotal_cents, a valid_until passing, an admin\n  " +
      "flipping active) raises the live total above the hold and planCapture cancels the whole\n  " +
      "order. Nothing else in the gate catches this — the route has no test file and carries a\n  " +
      "verify:slice-exempt line.",
  );
}

if (totalsAt === -1) {
  fail(
    `${FILE} no longer calls \`getCartTotals(\`.\n  ` +
      "This guard compares the two call sites; if the amount is derived some other way now, teach\n  " +
      "the guard the new shape rather than deleting it — the ordering rule still has to hold.",
  );
}

if (pinAt > totalsAt) {
  fail(
    "the promo grant is pinned AFTER the amount is derived.\n  " +
      "M70: deriving first mints the Stripe amount from the LIVE promo value and then pins a\n  " +
      "possibly different one, so the hold and the pin disagree — the exact divergence the pin\n  " +
      "exists to remove. Move the `mms_pin_promo_grant` call above `getCartTotals(`.",
  );
}

process.stdout.write(`${c.green("clean")}${c.dim(" — pinned, and pinned first")}\n`);
