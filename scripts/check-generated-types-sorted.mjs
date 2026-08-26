#!/usr/bin/env node
/**
 * M70 — the fifth cheap grep: `packages/db/src/database.types.ts` is HAND-EDITED here, and the only
 * thing that decides whether the edit is right is a Postgres that this container does not have.
 *
 * `pnpm db:types` needs a local Supabase stack (Docker). In a cloud session there is none, so a new
 * RPC's type entry has to be typed by hand and the FIRST time anything checks it is CI's
 * `migrations-check + types-fresh` — a job that pulls half a dozen images and replays 120 migrations
 * before it gets to the one-line `git diff`. M70 burned TWO of those cycles on the same mistake:
 * `mms_pin_promo_grant` filed after `mms_promo_attempt`, then `mms_release_promo_grant` filed after
 * `mms_request_approval`. Both were pure alphabetical slips (`pin` < `promo`, `rele` < `requ`), and
 * both are decidable from the file alone, in milliseconds, with no database anywhere.
 *
 * Worse than the wasted minutes: `types-fresh` runs BEFORE the SQL tests in that job (ci.yml:109 vs
 * :122), so a sort slip aborts the stack before a single `supabase/tests/*.sql` assertion executes.
 * A migration's real proof never runs, and the red check names the types file — so it reads like a
 * bookkeeping nit rather than "your SQL is still unverified."
 *
 * Three orderings the generator guarantees, all verified against the current file when this was
 * written (46 tables · 70 functions · 64 Args blocks, every one already sorted):
 *
 *   1. `Tables` keys, plain ASCII ascending.
 *   2. `Functions` keys, plain ASCII ascending.
 *   3. Each function's `Args` keys, plain ASCII ascending (inline and multi-line forms both).
 *
 * What this does NOT prove: that the entry's SHAPE matches the generator's printer. The generator
 * breaks an entry across lines at ~80 columns, so `mms_reward_discount` stays inline while the
 * seven-character-longer `mms_release_promo_grant` does not — reimplementing that is prettier's job,
 * not a guard's. Position is the half that is cheap AND is the half that was actually wrong twice.
 * When Docker is available, `pnpm db:types` remains the only authority; this is the check for when
 * it is not.
 *
 * Red-first: move any `Functions` entry one slot out of order, or swap two `Args` keys, and this
 * exits 1 naming the exact pair.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "packages/db/src/database.types.ts";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const src = readFileSync(path.join(ROOT, FILE), "utf8");

process.stdout.write("generated DB types — generator sort order … ");

const fail = (msg) => {
  process.stdout.write(`${c.red("✗")}\n\n  ${msg}\n\n`);
  process.exit(1);
};

/** The body of `    <name>: {` … its matching `}`, brace-counted rather than bounded by the next
 *  section header — the LAST section would otherwise swallow the rest of the file. */
const section = (name) => {
  const header = new RegExp(`^    ${name}: \\{$`, "m");
  const m = header.exec(src);
  if (!m)
    fail(
      `${FILE} has no \`${name}\` section — the generator's shape changed. Teach this guard the new shape rather than deleting it.`,
    );
  const open = src.indexOf("{", m.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  fail(`${FILE}'s \`${name}\` section has unbalanced braces.`);
  return "";
};

/** First out-of-order neighbour, or null. Reporting the PAIR matters: "not sorted" sends the reader
 *  scanning 70 keys, "x should precede y" is the edit. */
const firstUnsorted = (keys) => {
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i - 1] > keys[i]) return { before: keys[i - 1], after: keys[i] };
  }
  return null;
};

const counts = [];

for (const name of ["Tables", "Functions"]) {
  const body = section(name);
  const keys = [...body.matchAll(/^ {6}([A-Za-z_][A-Za-z0-9_]*): /gm)].map((m) => m[1]);
  // A guard that looked at nothing prints the same word as a guard that found nothing wrong.
  if (keys.length === 0) {
    fail(
      `${FILE}'s \`${name}\` section parsed to ZERO keys.\n  ` +
        "Either the generator's indentation changed or this guard's pattern rotted — both mean it\n  " +
        "has been silently passing. Fix the pattern; do not delete the check.",
    );
  }
  const bad = firstUnsorted(keys);
  if (bad) {
    fail(
      `${FILE}: \`${name}\` keys are out of order — \`${bad.after}\` must come BEFORE \`${bad.before}\`.\n  ` +
        "`supabase gen types` emits these in plain ASCII order, so CI's `types-fresh` diff will\n  " +
        "reject the file. Move the entry; the whole entry, keeping the generator's line breaks.",
    );
  }
  counts.push(`${keys.length} ${name.toLowerCase()}`);
}

// Args keys — the same slip one level in, and the one a hand-written multi-parameter RPC invites.
const fnBody = section("Functions");
let argBlocks = 0;
for (const m of fnBody.matchAll(/Args: \{ ([^\n}]+?) \}/g)) {
  argBlocks += 1;
  const keys = m[1].split(";").map((p) => p.split(":")[0].trim().replace(/\?$/, ""));
  const bad = firstUnsorted(keys);
  if (bad) {
    fail(
      `${FILE}: inline \`Args\` keys are out of order — \`${bad.after}\` must come BEFORE \`${bad.before}\`.\n  ` +
        `  in: { ${m[1]} }`,
    );
  }
}
for (const m of fnBody.matchAll(/Args: \{\n((?: +\w+\??: [^\n]+\n)+) *\}/g)) {
  argBlocks += 1;
  const keys = m[1]
    .trim()
    .split("\n")
    .map((l) => l.trim().split(":")[0].replace(/\?$/, ""));
  const bad = firstUnsorted(keys);
  if (bad) {
    fail(
      `${FILE}: multi-line \`Args\` keys are out of order — \`${bad.after}\` must come BEFORE \`${bad.before}\`.`,
    );
  }
}
if (argBlocks === 0) {
  fail(
    `${FILE}: parsed ZERO \`Args\` blocks.\n  ` +
      "The generator's shape changed and this half of the guard has been passing on nothing.",
  );
}
counts.push(`${argBlocks} Args blocks`);

process.stdout.write(`${c.green("clean")}${c.dim(` — ${counts.join(" · ")}`)}\n`);
