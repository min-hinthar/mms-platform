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
  // ⚠️ ONE PAIR ONLY. P5 (#263) and P6 (#262) each wrote a pair for this form, independently and
  // within the hour, and `check-docs.mjs` did NOT conflict — the two edits sat far enough apart
  // that git merged them silently, so main briefly carried BOTH and reported one stale number
  // twice (measured: a planted value named at `HANDOFF.md:407` by two rules at once). A conflict
  // marker would have forced someone to choose; a clean merge did not. P6's pair below is kept
  // because `statesItsOwnCurrency` — also P6's, in `countFailures` — solves the exemption bug for
  // EVERY rule, where P5's pair solved it only for itself by ending each match at its digits.
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
  // rule keeps ONE capture and the existing single-key loop is untouched.
  //
  // ⚠️ Three properties are load-bearing, and each was a real defect first — change one and
  // re-run the fixture matrix in the PR that introduced it (#265), do not reason about it:
  //
  //   • THE ANCHOR is `ui tests`, NOT `qr + N ui tests`. The live-state docs spell the left half
  //     two ways — `1372 qr + 138 ui tests` (docs/HANDOFF.md) and `1755 qr tests + 142 ui tests`
  //     (README.md, docs/HANDOFF.md's gate line). A rule keyed on `qr\s*\+` matches only the first,
  //     because after the literal `qr` the second spelling reads " tests" and there is no `+` to
  //     find. `ui tests` is present in BOTH, so anchoring there covers the pair however the left
  //     half is written. (P6's original note claimed the `qr + N ui tests` context was required and
  //     kept the rules off an unrelated `(3 + 4 today)`. Neither half was true: the context was
  //     never in the pattern, and what actually keeps them off an unrelated parenthetical is the
  //     closing paren below — an adjacent `(3 + 4 today)` still matches by design.)
  //   • THE PARENTHETICAL MUST CLOSE right after the pair, `\s*(?=\))`, with only an optional
  //     `today` between. Without it the rules read the first two numbers of ANY parenthetical
  //     following `ui tests` — `142 ui tests (3 + 4 skipped)` was reported as a stale qr and ui
  //     count. `today` stays OPTIONAL because `(C + D)` with no trailing word is the same claim;
  //     requiring it would trade one false positive for a false negative.
  //   • `current: true` OPTS THESE TWO OUT OF THE HISTORICAL EXEMPTION, and it is the flag's only
  //     use. `HISTORICAL` is tested against the text FOLLOWING the match, so on a line that chains
  //     claims (`… (1924 + 142)**, 69 target modules at the time (…)`) the NEIGHBOUR's marker lands
  //     inside the 24-character window and exempts the live number the rule exists to catch —
  //     measured, at 23 characters, silencing BOTH captures. No match extent fixes it: the window
  //     starts where the capture ends, and the neighbour is closer than 24 characters from there.
  //     `statesItsOwnCurrency`'s `\btoday\b` test does not cover it either — it only helps a match
  //     whose own text contains `today`, which 8 of the 13 rules here can never do (measured), and
  //     the bare `(C + D)` spelling has no `today` to find. The flag is sound precisely BECAUSE of
  //     the closing paren: the parens can hold nothing but `C + D` or `C + D today`, so a
  //     historical marker is always outside them and always belongs to a different clause.
  // The tracked-docs-file count was MEASURED and PRINTED by this script from the day it was written
  // and checked by nothing — `truth` carried mutants, modules, libModules, qr and ui, and no `files`.
  // The docs quote it as measured truth (`check:docs` clean (98 files, …)), which is precisely the
  // shape this guard exists for: a number a reader takes on the script's authority.
  //
  // ⚠️ These two are the FIRST rules here that must stay EXEMPTIBLE, and the reason is worth the
  // paragraph. The parenthetical `ui tests` pair above carries `current: true` because its shape —
  // parens that can hold nothing but `C + D` — makes a historical reading impossible. This phrasing
  // is the opposite: `\`check:docs\` clean (98 files, …)` appears in docs/HANDOFF.md THREE times, once
  // as live state under `**Gate today:**` and twice as point-in-time records of a past head, in
  // IDENTICAL words. Nothing in the text distinguishes them, so the rule cannot; the marker has to,
  // and the two records now carry `at the time` inside the parenthetical — after the number, which
  // is the only position `HISTORICAL` reads. Copying `current: true` here would report both records
  // as stale forever, i.e. it would punish the docs for keeping an honest history.
  {
    re: /`?check:docs`?[^.]{0,24}?\(\s*(\d+)\s+files\b/gi,
    key: "files",
    label: "tracked docs files",
  },
  // ⚠️ The gap is `[^.]`, NOT `[^.\n]` like every other rule here: prettier wraps prose, and it had
  // already split one of the three instances so that `\`check:docs\` clean` ends line 462 and
  // `(98 files, …)` opens line 463. A newline-excluding gap could not see it — measured, it was the
  // one fixture of four that stayed silent — which would make coverage depend on where the
  // formatter happened to break the line, i.e. a claim could drift out of the guard's reach with no
  // edit to the claim at all. The sentence-ending `.` still bounds it, so it cannot wander into an
  // unrelated statement.
  //
  // The other phrasing the docs use, and the one with no parenthetical to anchor on. `tracked docs
  // files` is required in full: a bare `(\d+)\s+files` would grab `168 assertions across 8 files`,
  // `15 controls across 6 files`, `64 files aria-clean` and `the repo (96 files)` — four live decoys
  // in these same documents, three of which are counts of something else entirely.
  {
    re: /(\d+)\s+tracked\s+docs\s+files/gi,
    key: "files",
    label: "tracked docs files",
  },
  {
    re: /ui\s+tests[^.\n]{0,24}?\(\s*(\d+)\s*\+\s*\d+(?:\s+today)?\s*(?=\))/gi,
    key: "qr",
    label: "qr tests (parenthetical 'today' form)",
    current: true,
  },
  {
    re: /ui\s+tests[^.\n]{0,24}?\(\s*\d+\s*\+\s*(\d+)(?:\s+today)?\s*(?=\))/gi,
    key: "ui",
    label: "ui tests (parenthetical 'today' form)",
    current: true,
  },
];

/** `matchAll` with capture offsets. Memoised on the rule so the pattern is compiled once, not once
 *  per document; `d` only adds `m.indices` and changes no matching behaviour. */
function withIndices(rule) {
  rule.reD ??= new RegExp(rule.re.source, rule.re.flags + "d");
  return rule.reD;
}

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
    for (const m of scan.matchAll(withIndices(rule))) {
      const stated = Number(m[1]);
      if (stated === truth[rule.key]) continue;
      /** Report the line holding the NUMBER, not the line the match starts on. They differ whenever
       *  a rule spans a prose wrap — which the `check:docs` file rule deliberately does, since
       *  prettier had already split one claim across two lines. Pointing at the match start showed
       *  a resolver a context line with no number in it (measured: `…:462` quoting the `verify:slice`
       *  half while the stale `77` sat on 463), which is the failure message failing at its one
       *  job. `d` gives the capture's own offset; every other rule is single-line, so this is a
       *  no-op for them. */
      const at = m.indices?.[1]?.[0] ?? m.index;
      const lineNo = scan.slice(0, at).split("\n").length;
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
      // ⚠️ …and unless the rule's SHAPE makes it current. `current: true` is for a rule whose match
      // can only be the live half of an `A at the time (C today)` pair — the parenthetical rules,
      // whose closing-paren requirement means the parens can hold nothing but `C + D` or
      // `C + D today`. A historical marker is by construction OUTSIDE those parens, so any marker
      // the window reaches belongs to a NEIGHBOURING clause. Measured, before this flag existed:
      // on `… (1924 + 142)**, 69 target modules at the time (…)` the neighbour's marker sits 23
      // characters past the match and exempted BOTH captures — the guard went silent on exactly
      // the stale number it was written for. `statesItsOwnCurrency` cannot cover it, because the
      // bare `(C + D)` spelling has no `today` to test for.
      const statesItsOwnCurrency = rule.current === true || /\btoday\b/i.test(m[0]);
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
  /** ⚠️ DE-DUPLICATED, and that is not tidiness. `git ls-files` lists an UNMERGED path once per
   *  merge stage — three entries for one conflicted file — and the two glob arguments overlap by
   *  construction (`*.md` already matches at any depth, so `docs/*.md` re-matches every docs file
   *  the moment git stops treating the first pattern as exhaustive). Measured on a throwaway repo:
   *  clean `2 entries -> a.md b.md`, conflicted `4 entries -> a.md a.md a.md b.md`.
   *
   *  Three consequences, every one of them worst DURING a merge — precisely when someone runs this
   *  script to decide whether their resolution is sound: the printed file count inflates by 2 per
   *  conflicted doc; every conflicted doc is table-checked three times, so ONE broken table reports
   *  as three failures; and a conflicted live-state doc is count-checked three times, so ONE stale
   *  number reports as three. All three were watched red before this line was written.
   *
   *  It never produced a false PASS — duplicates only add work, never remove a check — which is
   *  exactly why it survived: CI only ever runs this on a clean tree. It reached the record anyway.
   *  PR #265 reported `100 files` in its body, its review comment and its merge message, because
   *  both readings were taken with `CHANGELOG.md` still `UU` in the index. The real count was 98.
   *  A number this script PRINTS is quoted into docs as measured truth, so an inflated one is not
   *  cosmetic; and now that `truth.files` guards that number, an un-deduplicated list would fail
   *  the guard against a count only a mid-merge index could produce. */
  const docs = [
    ...new Set(
      execFileSync("git", ["ls-files", "*.md", "docs/*.md"], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((f) => !f.startsWith("node_modules/")),
    ),
  ];
  /** Docs that assert the CURRENT state, and so must agree with what the repo measures right now.
   *  W22-docs: README joined the set the day it started quoting the gate's size — the front door is
   *  where a stale number is read most and noticed least (its "M0 scaffold" headline survived ~20
   *  merged arcs). Note README sits at the ROOT, so the pattern must not require a docs/ prefix. */
  const liveState = docs.filter((f) => /^(README|CLAUDE|docs\/(OPEN-ITEMS|HANDOFF))\.md$/.test(f));

  process.stdout.write("docs — tables render, counts are measured … ");
  const failures = [];
  for (const rel of docs)
    failures.push(...tableFailures(readFileSync(path.join(ROOT, rel), "utf8"), rel));
  /** `files` is the length of the ONE list above, never a second `ls-files`: the count this script
   *  PRINTS and the count it CHECKS must be the same number or the guard can pass while the banner
   *  lies (the "name it ONCE" rule, applied to a count rather than an amount). */
  const truth = { ...measure(ROOT), files: docs.length };
  for (const rel of liveState)
    failures.push(...countFailures(readFileSync(path.join(ROOT, rel), "utf8"), truth, rel));

  if (failures.length === 0) {
    console.log(
      c.green("clean") +
        c.dim(` (${truth.files} files, ${truth.qr}+${truth.ui} tests, ${truth.mutants} mutants)`),
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
