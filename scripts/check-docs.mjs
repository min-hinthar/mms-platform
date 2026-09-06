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
    // ⚠️ COUNT CELL SEPARATORS, NOT PIPE CHARACTERS. An ESCAPED pipe (`\\|`) is content — it renders
    // as a literal "|" inside a cell and does not split it. Counting it as a separator reports a
    // correctly-escaped row as malformed, which is how a gate earns its way into being ignored.
    const bars = (line) => (line.replace(/\\\|/g, "").match(/\|/g) || []).length;
    const h = bars(header);
    const d = bars(delim);
    if (h !== d)
      out.push(
        `${name}:${i + 1} — header has ${h - 1} cells, delimiter has ${d - 1}. ` +
          `GFM refuses the WHOLE table on a mismatch; escape any literal pipe as \\|`,
      );

    // ⚠️ AND EVERY BODY ROW, which this check could not see until #248 — where an adversarial round
    // found FIVE freshly-written `docs/OPEN-ITEMS.md` rows that had silently lost their Status and
    // Source cells. GFM pads a short row instead of refusing it, so the registry rendered three
    // newly-closed rows and one newly-filed row with a BLANK status and this gate stayed green: the
    // single source of truth for "is T17 open?" answered nothing, and nothing said so.
    //
    // A row with FEWER cells than the header is the failure; a row with MORE is already caught by
    // the unescaped-pipe reading below, and is reported the same way because the cause is the same.
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j];
      if (!row.trim().startsWith("|")) break; // the table ended
      const c = bars(row);
      if (c === h) continue;
      out.push(
        c < h
          ? `${name}:${j + 1} — row has ${c - 1} cells, header has ${h - 1}. GFM pads a short row ` +
              `SILENTLY, so a dropped trailing cell renders as blank rather than failing.`
          : `${name}:${j + 1} — row has ${c - 1} cells, header has ${h - 1}. An unescaped pipe ` +
              `splits the cell it sits in; write it as \\| to keep it as content.`,
      );
    }
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
  // W22-docs review: README described the same count as "124 semantic mutations", a phrasing NO rule
  // matched — so the commit that put README under this guard also wrote an unguarded count into it,
  // two lines from an already-rotted claim. The lesson is the guard's own: a narrow rule set must
  // still cover every phrasing the docs actually use, or the doc drifts in the gap.
  { re: /(\d+)\s+semantic\s+mutations?/gi, key: "mutants", label: "verify:slice mutants" },
  // M108 review (blind pass): the same hole one phrasing over. CLAUDE.md's command block said
  // "gate + 197 mutations + orphan check" — no "semantic", so no rule matched, and the count sat
  // stale while the line two below it was kept current. Requires nearby verify:slice/gate context so
  // this cannot grab an unrelated "5 mutations".
  {
    re: /(?:verify:slice|gate)[^.\n]{0,40}?(\d+)\s+mutations?\b/gi,
    key: "mutants",
    label: "verify:slice mutants",
  },
  // The "N mutants at the time (M today)" form: the historical N is exempt, but M is a CURRENT-state
  // claim and must be measured. Requires nearby mutant context so this can't grab an unrelated
  // "(3 today)". Found in round 2 — HANDOFF carried a `(124 today)` nothing could falsify.
  { re: /mutants?[^.\n]{0,40}?\((\d+)\s+today\)/gi, key: "mutants", label: "verify:slice mutants" },
  // T20 (blind adversarial pass): the mutant COUNT was guarded and the MODULE count beside it was
  // not, so the same edit that refreshed "261 mutations" left "59 money/authority modules (56 under
  // apps/qr/lib" stale one line below — a wrong live-state number in the two files CLAUDE.md itself
  // names as live-state docs, reported clean by this script. Both phrasings appear verbatim in
  // CLAUDE.md and README, and both describe what `verify:slice` REWRITES IN PLACE, which is the
  // number a reader checks before deciding whether a dirty tree is safe.
  // P5 (pre-merge blind pass, SYSTEMIC): the idiom this repo INVENTED for recording measured
  // history is precisely the idiom the measuring guard could not reach. `A qr + B ui tests at the
  // time (C + D today)` puts no digit adjacent to "qr tests" or "ui tests", so the `(\d+) qr tests`
  // rule matched nothing and C rotted while the same claim two lines down stayed current. Four
  // instances of this ONE bug were live across the four pilot PRs at once, every one of them inside
  // a paragraph advertising itself as measured-not-transcribed. The historical A and B stay exempt
  // (they are what was true then); C and D are current-state claims and are now measured. The
  // "tests at the time (" prefix is required so this cannot grab an unrelated parenthetical.
  {
    re: /tests?\s+at\s+the\s+time\s+\((\d+)\s*\+/gi,
    key: "qr",
    label: "qr tests (parenthetical 'today' form)",
  },
  {
    // ⚠️ THE MATCH STOPS AT THE CAPTURED DIGITS, and that is load-bearing rather than tidiness.
    // `HISTORICAL` is tested against the text following the match END, so a rule that ran on
    // through `today)` put the NEXT clause's "at the time" (`…, 69 target modules at the time`)
    // inside its 24-character window and exempted itself. Caught red-first: a planted `777` stayed
    // green while the sibling qr rule — which happens to end sooner — reddened correctly.
    re: /tests?\s+at\s+the\s+time\s+\(\d+\s*\+\s*(\d+)/gi,
    key: "ui",
    label: "ui tests (parenthetical 'today' form)",
  },
  // Same class, module side: "…74 under `apps/qr/lib` today, 81 in all)" — the `under apps/qr/lib`
  // rule reached the first number and nothing reached the second, so a resolver who fixes exactly
  // what the guard names leaves a wrong number on the line they just edited.
  {
    re: /`?apps\/qr\/lib`?[^.\n]{0,20}?,\s*(\d+)\s+in\s+all/gi,
    key: "modules",
    label: "verify:slice target modules ('N in all' form)",
  },
  {
    re: /(\d+)\s+money\/authority\s+modules/gi,
    key: "modules",
    label: "verify:slice target modules",
  },
  {
    re: /(\d+)\s+under\s+`?apps\/qr\/lib`?/gi,
    key: "libModules",
    label: "verify:slice target modules under apps/qr/lib",
  },
  // P6 (blind adversarial pass): the ONE line in HANDOFF that advertises itself as measured was the
  // one line no rule could see. `1372 qr + 138 ui tests at the time (1558 + 142 today)` states a
  // CURRENT pair inside the parentheses, but there is no digit adjacent to either `qr tests` or
  // `ui tests` — the counts sit on the far side of a `+` — so every rule above missed it, and 1558
  // rotted two lines from a measured 1560 while this script reported clean. Split in two so each
  // rule keeps ONE capture and the existing single-key loop is untouched; both require the
  // `qr + N ui tests` context so neither can grab an unrelated `(3 + 4 today)`.
  {
    re: /qr\s*\+\s*\d+\s+ui\s+tests[^.\n]{0,24}?\((\d+)\s*\+\s*\d+\s+today\)/gi,
    key: "qr",
    label: "qr tests",
  },
  {
    re: /qr\s*\+\s*\d+\s+ui\s+tests[^.\n]{0,24}?\(\d+\s*\+\s*(\d+)\s+today\)/gi,
    key: "ui",
    label: "ui tests",
  },
];

/**
 * A historical marker qualifies the number it FOLLOWS ("88 mutants at the time"), so the exemption is
 * scoped to a tight window AFTER the match — not to the whole line. Line-scoped was the round-2 bug:
 * on `88 mutants at the time (124 today)` the marker exempted BOTH numbers, so the live count on that
 * line could rot untouched. Nothing in the live-state docs relies on a marker that precedes its number.
 */
const HISTORICAL = /^.{0,24}?(at (?:the )?time|at that point|as of \d|historical)/is;

/**
 * Blanks a wrapped CONTINUATION MARKER so a count that straddles two lines is still ONE phrase to
 * the rules. Found by the W22-docs review: README states the gate's size inside a fenced `bash`
 * block whose comment wraps, so `124 verify:slice` ended one line and `# mutants` began the next —
 * the `#` sits where the rules expect whitespace, and EVERY rule silently missed it (a planted 999
 * stayed green). The marker and its padding become spaces while the newline SURVIVES, so offsets
 * and line numbers are byte-identical to the original and the reported anchor stays exact.
 *
 * `>` joined the list in M131, from the same defect one notation over: HANDOFF's gate line wraps
 * inside a BLOCKQUOTE, so a `sed` that lost its capture left `1049 qr tests +` ending one line and
 * `>  ui tests` beginning the next. The numberless twin below could not see it — the `+` was
 * followed by a newline, and the continuation line began with `>` where the rule expects only
 * whitespace — so `check:docs` reported CLEAN on a gate line with a missing number in it, which is
 * the exact failure the twin was added to stop. A rule that normalizes one notation and not the
 * other is a rule that only works where it was tested.
 */
const joinWrappedComments = (text) =>
  text.replace(
    /\n([ \t]*)[#>]([ \t]*)/g,
    (_m, before, after) => "\n" + " ".repeat(before.length + 1 + after.length),
  );

/**
 * A count with its NUMBER MISSING passes every rule above, because every rule requires `(\d+)` to
 * match at all. Found by Codex on #238: a `sed` whose capture came back empty turned README's gate
 * line into `1049 qr tests +  ui tests`, and this check reported CLEAN — the phrase it exists to
 * verify had simply stopped being a phrase it could see. That is the guard's own recurring lesson
 * ("a narrow rule set must cover every phrasing the docs actually use") pointed at its own blind
 * spot: a rule that only fires on a well-formed claim cannot notice a malformed one.
 *
 * So each rule carries a NUMBERLESS twin. It matches the same words with the digits absent, and it
 * is deliberately strict about what "absent" means — `\+\s{2,}` and a bare label with no preceding
 * digit — so an ordinary sentence about "ui tests" in prose does not trip it.
 */
const MISSING_RULES = [
  // The label reached directly from a separator or a line start with only whitespace between —
  // i.e. the digits that belong there are gone. In a well-formed `1049 qr tests + 125 ui tests`
  // each label is preceded by its own number, so neither half matches.
  { re: /(?:^|[+·|(])[ \t]*(qr|ui)[ \t]+tests/gim, label: (m) => `${m[1]} tests` },
  { re: /(?:^|[+·|(])[ \t]*(verify:slice)[ \t]+mutants/gim, label: () => "a mutant count" },
  // T20 round 2 (Codex): the module rules added below were born with the very blind spot this list
  // exists to close — they only fire when digits are present, so deleting the number made the claim
  // vanish from the check and `countFailures` reported clean. Both twins are anchored on the
  // phrasing that CARRIES a count, not on the bare words: CLAUDE.md legitimately says "applies 264
  // semantic mutations to the money/authority modules" with no count of its own, and a bare
  // `money/authority modules` rule would fail that honest sentence.
  {
    re: /rewrites[ \t]+the[ \t]+money\/authority[ \t]+modules/gi,
    label: () => "a module count",
  },
  {
    // `[ \t\n]+`, not `[ \t]+`: CLAUDE.md wraps this very claim across two comment lines, and
    // `joinWrappedComments` blanks the `#` marker but deliberately KEEPS the newline so line numbers
    // stay exact. A tab/space-only gap therefore misses the wrapped half — which is the file the
    // claim actually lives in.
    re: /(?:^|[(])[ \t]*under[ \t\n]+`?apps\/qr\/lib/gim,
    label: () => "a module count for apps/qr/lib",
  },
];

export function countFailures(text, truth, name = "<doc>") {
  const out = [];
  const lines = text.split("\n");
  const scan = joinWrappedComments(text);
  for (const rule of MISSING_RULES) {
    for (const m of scan.matchAll(rule.re)) {
      const lineNo = scan.slice(0, m.index).split("\n").length;
      out.push(
        `${name}:${lineNo} — states ${rule.label(m)} with NO NUMBER; a countless claim passes every` +
          ` count rule, so it must fail here instead`,
      );
    }
  }
  for (const rule of COUNT_RULES) {
    for (const m of scan.matchAll(rule.re)) {
      const stated = Number(m[1]);
      if (stated === truth[rule.key]) continue;
      const lineNo = scan.slice(0, m.index).split("\n").length;
      const line = lines[lineNo - 1] ?? "";
      // Even inside a live-state doc, a number may deliberately record a past value ("88 mutants at
      // the time"). Deliberately NOT "was written": that phrase turned up in CLAUDE.md as ordinary
      // prose about a guard, exempting the gate-size count on the same line.
      // ⚠️ …unless the match STATES its own currency. `(N today)` is a live-state claim with the
      // word in the match, so the exemption must not be able to reach it — and it could: HISTORICAL
      // scans a 24-character window AFTER the match, and on a line that chains two claims
      // (`… (1558 + 142 today)**, 69 target modules at the time (70 …)`) that window lands inside
      // the NEIGHBOUR's marker and exempted a live number. The `(375 today)` on the very same line
      // escaped only because its own neighbour's marker happened to sit 40 characters away. That is
      // how P6's blind pass found HANDOFF stating 1558 where two other measured lines said 1560.
      const statesItsOwnCurrency = /\btoday\b/i.test(m[0]);
      if (!statesItsOwnCurrency && HISTORICAL.test(scan.slice(m.index + m[0].length))) continue;
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
  // DISTINCT paths, not mutant count: several mutants share a file, and what the docs describe is
  // the set of modules the run REWRITES IN PLACE.
  const targets = [
    ...new Set((verifySlice.match(/^\s*file:\s*"([^"]+)"/gm) || []).map((m) => m.split('"')[1])),
  ];
  return {
    qr: list("apps/qr"),
    ui: list("packages/ui"),
    mutants: (verifySlice.match(/^\s*id:\s*"/gm) || []).length,
    modules: targets.length,
    libModules: targets.filter((f) => f.startsWith("apps/qr/lib/")).length,
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
  const liveState = docs.filter((f) => /^(README|CLAUDE|docs\/(OPEN-ITEMS|HANDOFF))\.md$/.test(f));

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
