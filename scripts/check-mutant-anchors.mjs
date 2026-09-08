#!/usr/bin/env node
/**
 * Every mutant's `find` string must match its target file EXACTLY ONCE.
 *
 * Why this exists (LEARNINGS #106). `verify:slice` already reports a STALE mutant — but only at the
 * END of a full run, after every other mutation has been applied and its suite re-run. That is ~20
 * minutes to be told a string does not match, and the failure is easy to cause: `pnpm format`
 * reflows the TARGET file, and an anchor written before it stops matching. It happened to
 * `stripe-env/unsuffixed-wins-over-test`, whose two-line candidate array prettier exploded to eight.
 *
 * A stale mutant is not cosmetic. It means the rule it guards is UNGUARDED while the suite stays
 * green — the "green for the wrong reason" shape the mutant harness exists to catch, occurring in
 * the harness itself. This check answers the same question in about a second, reads no test and
 * runs no build, so it belongs in the CI fast lane in front of everything expensive.
 *
 * AMBIGUITY IS ALSO A FAILURE. A `find` that matches twice is not "fine, it'll pick one": the
 * harness replaces every occurrence, so a two-match anchor mutates a second site nobody reasoned
 * about, and the mutation's stated `why` no longer describes what it did. Exactly one, or it fails.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLICE = path.join(ROOT, "scripts/verify-slice.mjs");

/**
 * The MUTANTS array, evaluated rather than pattern-matched.
 *
 * `verify-slice.mjs` cannot simply be imported — importing it RUNS the whole gate. And the entries
 * cannot be scraped with a regex either: prettier rewrites the string literals (double-quoted JSON
 * comes back single-quoted) and the `find` values contain escapes a hand-rolled decoder gets wrong.
 * So: slice out the array literal by walking to its matching bracket — skipping strings and
 * comments, because both contain brackets — and let the JS engine parse it.
 */
function readMutants() {
  const src = readFileSync(SLICE, "utf8");
  const start = src.indexOf("const MUTANTS = [");
  if (start < 0) throw new Error("check:mutant-anchors — could not find `const MUTANTS = [`");
  const open = src.indexOf("[", start);
  let depth = 0;
  let end = -1;
  let inString = null;
  let inComment = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inComment) {
      if (inComment === "//" && c === "\n") inComment = null;
      else if (inComment === "/*" && c === "*" && n === "/") {
        inComment = null;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inString = c;
      continue;
    }
    if (c === "/" && (n === "/" || n === "*")) {
      inComment = c + n;
      i++;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("check:mutant-anchors — unterminated MUTANTS array");
  // eslint-disable-next-line no-eval -- the input is this repo's own source, already parsed above
  return eval(src.slice(open, end + 1));
}

const mutants = readMutants();
const cache = new Map();
const bad = [];

for (const m of mutants) {
  const abs = path.join(ROOT, m.file);
  if (!cache.has(abs)) cache.set(abs, readFileSync(abs, "utf8"));
  // `split().length - 1` counts overlapping-free occurrences of a literal without regex escaping.
  const hits = cache.get(abs).split(m.find).length - 1;
  if (hits !== 1) bad.push({ id: m.id, file: m.file, hits });
}

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;

process.stdout.write(`mutant anchors — each find-string matches once … `);
if (!bad.length) {
  console.log(`[32mclean[0m${dim(` (${mutants.length} anchors, ${cache.size} files)`)}`);
  process.exit(0);
}

console.log(`[31m[1m\n\n✗ ${bad.length} mutant anchor(s) do not match exactly once:[0m\n`);
for (const b of bad) {
  console.log(`  ${bold(b.id)}`);
  console.log(dim(`    ${b.hits}× in ${b.file}${b.hits === 0 ? " — STALE" : " — AMBIGUOUS"}`));
}
console.log(
  dim(
    `\n  A stale anchor means the rule it guards is UNGUARDED while its suite stays green.\n` +
      `  Usual cause: \`pnpm format\` reflowed the target after the anchor was written (LEARNINGS #106).\n` +
      `  Fix: re-anchor on the FORMATTED source — run \`pnpm format\` first, then copy the shipped bytes.\n`,
  ),
);
process.exit(1);
