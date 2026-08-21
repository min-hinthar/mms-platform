#!/usr/bin/env node
/**
 * verify:mode-authority — the mutant battery behind `supabase/tests/m100_session_mode_authority_test.sql`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The SQL test has eight cases and `plpgsql` ASSERT stops at the FIRST failure. Run it against the
 * un-migrated schema and it goes red on case 1 — and cases 2-8 are never reached, never executed, and
 * never proven to be able to fail at all. "It went red before the fix and green after" is therefore a
 * statement about ONE case, offered as if it covered eight. That is precisely the shape this repo has
 * paid for repeatedly: a guard written and never watched fail (`scripts/verify-slice.mjs`'s header),
 * and a battery that credits a green run to whichever mutant was in flight (`verify-merge-race.mjs`).
 *
 * WHAT IT DOES
 * ------------
 * For each mutation it (1) proves a GREEN BASELINE first — otherwise an already-failing case is
 * credited to the mutant — (2) applies the mutation to the LIVE function with `create or replace`,
 * (3) asserts `md5(prosrc)` actually CHANGED (a malformed patch that never applied would otherwise
 * "survive" and read as a hole in the test), (4) runs the SQL test and requires the NAMED case to be
 * the one that fails, then (5) restores the function byte-identically and re-verifies the md5.
 *
 * A mutant that fails the WRONG case is a failure: it means two cases overlap and neither pins what
 * its name claims.
 *
 * DOCUMENTED SURVIVOR
 * -------------------
 * One mutation is expected to SURVIVE, and asserting that is the point: the mode term inside
 * `mms_set_line_fulfillment`'s UPDATE cannot diverge from its pre-check while `table_sessions.mode`
 * is immutable. The migration's header states that in writing; this battery MEASURES it. If that
 * mutant is ever killed, the header's claim has become false and the note must be rewritten — so it
 * is checked in the same direction as every other row, not left as an untested comment.
 *
 * USAGE
 * -----
 *   node scripts/verify-mode-authority.mjs                        # the local `supabase start` stack
 *   MODE_AUTHORITY_DSN=<dsn> node scripts/verify-mode-authority.mjs  # a throwaway local cluster
 *
 * The default DSN is the local stack's, the same one ci.yml's SQL-test step uses. It is deliberately
 * an ENV VAR and not an argv flag: this battery REWRITES live function bodies, so pointing it
 * somewhere should take a visible act, and there is no argument shape that can be passed by accident.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260823000000_m100_mode_authority.sql");
const TEST = path.join(ROOT, "supabase/tests/m100_session_mode_authority_test.sql");

const DSN =
  process.env.MODE_AUTHORITY_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function psql(args, input) {
  return execFileSync("psql", [DSN, "-v", "ON_ERROR_STOP=1", ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** md5 of a function's body — the proof a mutation applied and, later, that the restore was exact. */
function bodyHash(fn) {
  return psql([
    "-tAc",
    `select md5(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'`,
  ]).trim();
}

/** Run the SQL test. Returns null when it passes, or the failing ASSERT's message when it fails. */
function runTest() {
  try {
    psql(["-f", TEST]);
    return null;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const line = out.split("\n").find((l) => l.includes("ERROR:"));
    return (line ?? out).replace(/^.*ERROR:\s*/, "").trim();
  }
}

/** Re-apply the migration verbatim — the only restore path, so a mutant can never leave a body behind. */
function restore() {
  psql(["-q", "-f", MIGRATION]);
}

/**
 * The exact `CREATE OR REPLACE` text Postgres would emit for a live function. ONE mutant below
 * targets a function this migration does not contain (`mms_init_togo_status`), because the case that
 * measures the CONSEQUENCE of the guards can only be falsified by breaking the pipeline it observes.
 * Round-tripping through `pg_get_functiondef` restores it exactly, without re-running an unrelated
 * migration whose other statements may not be re-runnable.
 */
function functionDef(fn) {
  return psql([
    "-tAc",
    `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'`,
  ]);
}

/**
 * Each mutant replaces `find` with `replace` inside the migration's text, then applies THAT. `find`
 * must match exactly once — a zero-match mutant is a failure, not a skip, because a silently-stale
 * mutant is the rot this file exists to prevent.
 *
 * `expect` is the substring the failing assertion MUST contain. Naming the case (not just "it went
 * red") is what stops two mutants from both being credited to case 1.
 */
const MUTANTS = [
  {
    id: "toggle/mode-gate-deleted",
    fn: "mms_set_line_fulfillment",
    expect: "M100.1",
    why: "the whole M100 guard — a pickup session tags a line dine-in again",
    find: "  if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n",
    replace: "",
  },
  {
    id: "toggle/mode-gate-names-pickup",
    fn: "mms_set_line_fulfillment",
    expect: "M100.2",
    why: "the guard written as the mode it was FOUND on rather than the one it must allow — passes case 1, lets scan-and-go through",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if p_fulfillment = 'dinein' and v_mode = 'pickup' then",
  },
  {
    id: "toggle/mode-gate-blocks-both-directions",
    fn: "mms_set_line_fulfillment",
    expect: "M100.5",
    why: "the guard phrased as 'no toggling off a dine-in session' — traps every already-mis-tagged line as permanently taxable",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if v_mode <> 'dinein' then",
  },
  {
    id: "toggle/mode-gate-refuses-everything",
    fn: "mms_set_line_fulfillment",
    expect: "M100.3",
    why: "the guard as an unconditional refusal — the seated diner loses the For-here pill the feature exists for",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if p_fulfillment = 'dinein' then",
  },
  {
    id: "toggle/refusal-still-writes",
    fn: "mms_set_line_fulfillment",
    // Deliberately NOT just "M100.1": this mutant must be caught by that case's ROW assertion, not by
    // its return-value assertion, or the row check is decoration riding a verdict someone else made.
    expect: "the RPC refused but the row moved anyway",
    why: "the reason returned but the row moved anyway — this repo's most expensive shape (a blocked write reporting success)",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;",
    replace:
      "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then\n" +
      "    update public.qr_cart_items set fulfillment = 'dinein' where id = p_line;\n" +
      "    return 'not_dinein_session';\n  end if;",
  },
  {
    id: "toggle/mode-gate-inverts-direction",
    fn: "mms_set_line_fulfillment",
    expect: "M100.4",
    why: "'a dine-in session's lines must be dine-in' — the plausible over-tightening, which takes away the seated diner's To go",
    // ADDITIVE, not a swap. Replacing the guard outright makes case 1 fail first (with 'stale', since
    // the in-write term still refuses the write), so case 4 would never be reached and this mutant
    // would be credited to the wrong case — which is exactly the failure this battery reports.
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;",
    replace:
      "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n" +
      "  if p_fulfillment = 'togo' and v_mode = 'dinein' then return 'not_dinein_session'; end if;",
  },
  {
    id: "toggle/pre-check-deleted-in-write-term-kept",
    fn: "mms_set_line_fulfillment",
    // The complement of the documented survivor below, and the reason that term is worth its clause:
    // with the named pre-check gone, the copy inside the UPDATE still refuses the write — the verdict
    // degrades from a named reason to 'stale', but no row moves. Deleting BOTH is the first mutant.
    expect: "M100.1",
    why: "the in-write term standing alone — a broken pre-check degrades the verdict to 'stale' instead of writing a dine-in tag onto a pickup line",
    find: "  if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n  if v_cur = p_fulfillment",
    replace: "  if v_cur = p_fulfillment",
  },
  {
    id: "fire-line/mode-gate-deleted",
    fn: "mms_fire_line",
    expect: "M107 THE DEFECT",
    why: "the whole M107 guard — an unpaid pickup cart fires food to the kitchen again",
    find: "  if v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n",
    replace: "",
  },
  {
    id: "fire-line/mode-gate-names-pickup",
    fn: "mms_fire_line",
    expect: "M107.2",
    why: "same polarity error on the fire path — refuses pickup, lets scan-and-go fire unpaid",
    find: "if v_mode <> 'dinein' then return 'not_dinein_session'; end if;",
    replace: "if v_mode = 'pickup' then return 'not_dinein_session'; end if;",
  },
  {
    id: "fire-line/mode-gate-refuses-everything",
    fn: "mms_fire_line",
    expect: "M107.3",
    why: "'Make it now' gated off at a real table — the over-block direction on the fire path",
    find: "if v_mode <> 'dinein' then return 'not_dinein_session'; end if;",
    replace: "if true then return 'not_dinein_session'; end if;",
  },
  {
    id: "expo/bag-pipeline-stops-seeing-togo",
    fn: "mms_init_togo_status",
    // `fnPatch` mutates a LIVE function this migration does not contain. Case 6 asserts the
    // CONSEQUENCE the two guards exist to protect — a paid pickup order that actually reaches the
    // counter — and no mutation of the guards themselves can falsify it, because they fail at case 1
    // first and case 6 never runs. Breaking the pipeline it measures is the only honest way to show
    // that case is load-bearing rather than decorative.
    fnPatch: true,
    expect: "M100.6",
    why: "the stamp that starts the pickup pipeline stops recognising a to-go line — /track freezes at 'Order placed' and the counter never shows a bag",
    find: "ci.fulfillment in ('togo','grocery')",
    replace: "ci.fulfillment in ('grocery')",
  },
  {
    id: "toggle/in-write-mode-term-deleted",
    fn: "mms_set_line_fulfillment",
    expect: null, // DOCUMENTED SURVIVOR — see the header
    why: "the migration header claims this term cannot diverge from its pre-check while `table_sessions.mode` is immutable. A survivor MEASURES that claim; a kill would mean the claim is false",
    find: "\n          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')",
    replace: "",
  },
];

const source = readFileSync(MIGRATION, "utf8");
let failures = 0;

console.log(c.bold(`\nverify:mode-authority — ${MUTANTS.length} mutants over 2 functions\n`));
restore();

for (const m of MUTANTS) {
  // The text a mutant patches: the migration itself, or (fnPatch) the live definition of a function
  // this migration does not contain. Either way the match must be unique — a zero- or multi-match
  // `find` is a failure, never a skip.
  const original = m.fnPatch ? functionDef(m.fn) : source;
  const occurrences = original.split(m.find).length - 1;
  if (occurrences !== 1) {
    console.log(
      c.red(`  STALE  ${m.id} — \`find\` matched ${occurrences} times, expected exactly 1`),
    );
    failures++;
    continue;
  }

  // (1) a green baseline, every time — otherwise an already-red case is credited to this mutant.
  const baseline = runTest();
  if (baseline !== null) {
    console.log(c.red(`  ABORT  ${m.id} — baseline is already RED: ${baseline}`));
    failures++;
    break;
  }
  const before = bodyHash(m.fn);

  // (2) apply, and (3) prove it actually landed.
  psql(["-q"], original.replace(m.find, m.replace));
  const mutated = bodyHash(m.fn);
  if (mutated === before) {
    console.log(c.red(`  NO-OP  ${m.id} — ${m.fn}'s body is unchanged; the patch never applied`));
    if (m.fnPatch) psql(["-q"], original);
    else restore();
    failures++;
    continue;
  }

  // (4) the named case must be the one that fails.
  const got = runTest();
  const survived = got === null;
  let verdict;
  if (m.expect === null) {
    verdict = survived
      ? c.green("SURVIVES (documented)")
      : c.red(`KILLED — the header's immutability claim is refuted: ${got}`);
    if (!survived) failures++;
  } else if (survived) {
    verdict = c.red(`SURVIVES — no case detects this; ${m.expect} does not pin what it claims`);
    failures++;
  } else if (!got.includes(m.expect)) {
    verdict = c.red(`WRONG CASE — expected ${m.expect}, got: ${got.slice(0, 90)}`);
    failures++;
  } else {
    verdict = c.green(`killed by ${m.expect}`);
  }

  // (5) restore, byte-identically.
  if (m.fnPatch) psql(["-q"], original);
  else restore();
  const after = bodyHash(m.fn);
  if (after !== before) {
    console.log(c.red(`  DIRTY  ${m.id} — ${m.fn} did not restore byte-identically`));
    failures++;
  }
  console.log(`  ${verdict}  ${c.bold(m.id)}\n    ${c.dim(m.why)}`);
}

const finalCheck = runTest();
if (finalCheck !== null) {
  console.log(c.red(`\n  the suite is RED after restore: ${finalCheck}`));
  failures++;
}

console.log(
  failures === 0
    ? c.green(
        `\n✓ ${MUTANTS.length} mutants accounted for; the suite is green on the real function\n`,
      )
    : c.red(`\n✗ ${failures} failure(s)\n`),
);
process.exit(failures === 0 ? 0 : 1);
