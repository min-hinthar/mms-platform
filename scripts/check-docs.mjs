#!/usr/bin/env node
/**
 * The docs half of the mechanical gate: **markdown tables must render, and stated counts must be true.**
 *
 * Both halves come from real escapes, twice each.
 *
 * COUNTS. `docs/OPEN-ITEMS.md` claimed a "214-test apps/qr suite" when it was 209, and "pinned by 5
 * tests" when the file had 6. A number that crosses from prose into a doc is never re-derived, so it
 * rots silently — and then gets cited as evidence in the next review. Every count here is MEASURED:
 * `vitest list` enumerates without running, so this stays cheap enough to run every time.
 *
 * TABLES. An unescaped `|` inside an OPEN-ITEMS row widened it to 6 cells against a 5-cell header.
 * Per GFM a header/delimiter mismatch means the table is **not recognised at all** — so the entire
 * 45-row money registry rendered as one raw pipe paragraph on GitHub, not just the offending row. And
 * `format:check` cannot catch it, because `prettier` is what widens the delimiter to match. A second
 * table on `main` had been broken the same way for weeks before anyone noticed.
 *
 * SCOPE, deliberately asymmetric. TABLES are checked in every tracked markdown file — a broken table
 * is wrong wherever it is. COUNTS are checked only in the docs that describe the CURRENT state
 * (`docs/OPEN-ITEMS.md`, `docs/HANDOFF.md`). `CHANGELOG.md` and `ROADMAP.md` are append-only histories
 * where "203 qr tests" in the W9 entry is not stale — it is accurate about the day it was written.
 * Flagging those would make the check noisy, and a noisy gate gets switched off.
 *
 * The checks are exported as pure functions so they can be tested against the exact historical content
 * that broke — a gate nobody has watched fail is the same defect it exists to catch.
 *
 * Usage: node scripts/check-docs.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * A GFM table needs its header row and its delimiter row to have the SAME cell count. Comparing pipe
 * counts is exactly that test, and it is the one prettier will not do for you — prettier reads the
 * widest row and pads the delimiter to match, which is how the mismatch gets INTRODUCED.
 */
export function tableFailures(text, name = "<doc>") {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const delim = lines[i + 1];
    if (!/^\s*\|[-: |]+\|\s*$/.test(delim)) continue;
    if (!header.trim().startsWith("|")) continue;
    const h = (header.match(/\|/g) || []).length;
    const d = (delim.match(/\|/g) || []).length;
    if (h !== d)
      out.push(
        `${name}:${i + 1} — header has ${h - 1} cells, delimiter has ${d - 1}. ` +
          `GFM refuses the WHOLE table on a mismatch; escape any literal pipe as \\|`,
      );
  }
  return out;
}

/**
 * Only the phrasings that have actually rotted are matched. A narrow set that fires reliably beats a
 * clever one that cries wolf — a noisy gate gets disabled, and a disabled gate catches nothing.
 */
const COUNT_RULES = [
  { re: /(\d+)\s+qr\s+tests/gi, key: "qr", label: "qr tests" },
  { re: /(\d+)-test\s+`?apps\/qr`?\s+suite/gi, key: "qr", label: "qr suite size" },
  { re: /(\d+)\s+ui\s+tests/gi, key: "ui", label: "ui tests" },
  { re: /(\d+)\s+`?verify:slice`?\s+mutants/gi, key: "mutants", label: "verify:slice mutants" },
  { re: /verify:slice\s+(\d+)\s+mutants/gi, key: "mutants", label: "verify:slice mutants" },
];

export function countFailures(text, truth, name = "<doc>") {
  const out = [];
  const lines = text.split("\n");
  for (const rule of COUNT_RULES) {
    for (const m of text.matchAll(rule.re)) {
      const stated = Number(m[1]);
      if (stated === truth[rule.key]) continue;
      const lineNo = text.slice(0, m.index).split("\n").length;
      const line = lines[lineNo - 1] ?? "";
      // Even inside a live-state doc, a line may deliberately record a past number.
      if (/at (?:the )?time|at that point|was written|historical/i.test(line)) continue;
      out.push(
        `${name}:${lineNo} — says ${stated} ${rule.label}, measured ${truth[rule.key]}\n` +
          c.dim(`      ${line.trim().slice(0, 110)}`),
      );
    }
  }
  return out;
}

/** Measure, never assume: `vitest list` enumerates without executing, so this costs ~10s, not a run. */
export function measure(root) {
  const list = (dir) =>
    execFileSync("npx", ["vitest", "list"], {
      cwd: path.join(root, dir),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter((l) => l.includes(" > ")).length;
  const verifySlice = readFileSync(path.join(root, "scripts/verify-slice.mjs"), "utf8");
  return {
    qr: list("apps/qr"),
    ui: list("packages/ui"),
    mutants: (verifySlice.match(/^\s*id:\s*"/gm) || []).length,
  };
}

function main() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const docs = execFileSync("git", ["ls-files", "*.md", "docs/*.md"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.startsWith("node_modules/"));
  /** Docs that assert the CURRENT state, and so must agree with what the repo measures right now.
   *  W22-docs: README joined the set the day it started quoting the gate's size — the front door is
   *  where a stale number is read most and noticed least (its "M0 scaffold" headline survived ~20
   *  merged arcs). Note README sits at the ROOT, so the pattern must not require a docs/ prefix. */
  const liveState = docs.filter((f) => /^(README|docs\/(OPEN-ITEMS|HANDOFF))\.md$/.test(f));

  process.stdout.write("docs — tables render, counts are measured … ");
  const failures = [];
  for (const rel of docs)
    failures.push(...tableFailures(readFileSync(path.join(ROOT, rel), "utf8"), rel));
  const truth = measure(ROOT);
  for (const rel of liveState)
    failures.push(...countFailures(readFileSync(path.join(ROOT, rel), "utf8"), truth, rel));

  if (failures.length === 0) {
    console.log(
      c.green("clean") +
        c.dim(` (${docs.length} files, ${truth.qr}+${truth.ui} tests, ${truth.mutants} mutants)`),
    );
    return 0;
  }
  console.error(c.red(c.bold("\n\n✗ docs check failed:\n")));
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    c.dim(
      "\n  Counts are measured with `vitest list` (no run) and by counting MUTANTS — so a number here\n" +
        "  is wrong, not the check. Fix the prose, or mark the line as a point-in-time record.\n",
    ),
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
