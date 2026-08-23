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
/**
 * The migrations that define the functions under test, IN APPLY ORDER, and the suite each one is
 * measured by. This was a single (migration, test) pair until M17 restated
 * `mms_set_line_fulfillment` a fourth time. That is the exact situation the drift check below was
 * written to catch, and it caught it: with only M100 in the chain the battery ABORTED, because
 * re-applying M100 would have reverted M17's fix and every verdict would have been about dead code.
 *
 * So the chain is the fix, not a workaround. `restore()` replays BOTH in order, and a mutant names
 * the file whose text it patches — which must be the LAST one defining its function, or the mutation
 * is overwritten by a later migration and "survives" for a reason that has nothing to do with the
 * guard. `mms_set_line_fulfillment` therefore lives in m17 now; `mms_fire_line` is still m100's.
 */
const SUITES = {
  m100: {
    migration: path.join(ROOT, "supabase/migrations/20260823000000_m100_mode_authority.sql"),
    test: path.join(ROOT, "supabase/tests/m100_session_mode_authority_test.sql"),
  },
  m17: {
    migration: path.join(ROOT, "supabase/migrations/20260824000000_m17_unknown_item_tax.sql"),
    test: path.join(ROOT, "supabase/tests/m17_unknown_item_tax_test.sql"),
  },
};
/** Apply order. Later entries redefine earlier ones, so this order is load-bearing. */
const CHAIN = ["m100", "m17"];

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

/**
 * md5 of a function's body — the proof a mutation applied and, later, that the restore was exact.
 *
 * Asserts a SINGLE row rather than pinning a signature string (which would rot on the next re-sign):
 * `proname` alone matches every overload, and two rows would `.trim()` into a two-line "hash" that
 * compares unequal to itself for a reason nobody would read. All three targets have exactly one
 * overload today; this fails loudly on the day one of them gains a second.
 */
function bodyHash(fn) {
  const rows = psql([
    "-tAc",
    `select md5(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'`,
  ])
    .split("\n")
    .filter(Boolean);
  if (rows.length !== 1) {
    throw new Error(
      `${fn}: expected exactly 1 definition, found ${rows.length}. An overload landed — this battery ` +
        `mutates by name and cannot tell them apart.`,
    );
  }
  return rows[0].trim();
}

/** Run the SQL test. Returns null when it passes, or the failing ASSERT's message when it fails. */
function runTest(suite) {
  try {
    psql(["-f", SUITES[suite].test]);
    return null;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const line = out.split("\n").find((l) => l.includes("ERROR:"));
    return (line ?? out).replace(/^.*ERROR:\s*/, "").trim();
  }
}

/**
 * Re-apply the whole chain verbatim, in order — the only restore path, so a mutant can never leave a
 * body behind. Replaying only the mutated file would leave an EARLIER migration's definition in
 * place for any function a later one restates.
 */
function restore() {
  for (const k of CHAIN) psql(["-q", "-f", SUITES[k].migration]);
}

/**
 * The exact `CREATE OR REPLACE` text Postgres would emit for a live function. ONE mutant below
 * targets a function this migration does not contain (`mms_init_togo_status`), because the case that
 * measures the CONSEQUENCE of the guards can only be falsified by breaking the pipeline it observes.
 * Round-tripping through `pg_get_functiondef` restores it exactly, without re-running an unrelated
 * migration whose other statements may not be re-runnable.
 */
function functionDef(fn) {
  const def = psql([
    "-tAc",
    `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'`,
  ]).trimEnd();
  // Measured: `pg_get_functiondef` ends `end $function$` with NO terminating semicolon. Piping that
  // to psql would leave an unterminated statement and rely on the client flushing its query buffer
  // at EOF. It does — but a battery whose RESTORE path rests on that is the "green for the wrong
  // reason" shape this file exists to prevent, so terminate it explicitly.
  return `${def};\n`;
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
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    expect: "M100.1",
    why: "the whole M100 guard — BOTH copies, so the row actually moves and the tax is actually rewritten. This is the original defect, not merely a changed verdict",
    // Both edits, deliberately. Removing only the pre-check leaves the in-write term refusing the
    // write as 'stale', which is a different mutant entirely (`pre-check-deleted-in-write-term-kept`
    // below) — so a one-edit "whole guard deleted" would be a duplicate of it under a name claiming
    // to test the corruption path, and nothing would ever exercise a mutation where the row moves.
    // Caught by Codex round 1 on #220.
    edits: [
      {
        find: "  if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n",
        replace: "",
      },
      { find: "\n          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')", replace: "" },
    ],
  },
  {
    id: "toggle/mode-gate-names-pickup",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    expect: "M100.2",
    why: "the guard written as the mode it was FOUND on rather than the one it must allow — passes case 1, lets scan-and-go through",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if p_fulfillment = 'dinein' and v_mode = 'pickup' then",
  },
  {
    id: "toggle/mode-gate-blocks-both-directions",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    expect: "M100.5",
    why: "the guard phrased as 'no toggling off a dine-in session' — traps every already-mis-tagged line as permanently taxable",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if v_mode <> 'dinein' then",
  },
  {
    id: "toggle/mode-gate-refuses-everything",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    expect: "M100.3",
    why: "the guard as an unconditional refusal — the seated diner loses the For-here pill the feature exists for",
    find: "if p_fulfillment = 'dinein' and v_mode <> 'dinein' then",
    replace: "if p_fulfillment = 'dinein' then",
  },
  {
    id: "toggle/refusal-still-writes",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
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
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
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
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
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
    why: "the whole M107 guard — BOTH copies, so the line actually fires. Same reason as the toggle above: one edit only degrades the verdict to 'stale' and nothing reaches the KDS",
    edits: [
      { find: "  if v_mode <> 'dinein' then return 'not_dinein_session'; end if;\n", replace: "" },
      {
        find: "        where c.id = ci.cart_id and c.status = 'open' and s.mode = 'dinein'",
        replace: "        where c.id = ci.cart_id and c.status = 'open'",
      },
    ],
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
    id: "toggle/in-write-parens-dropped",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    // DOCUMENTED SURVIVOR, and unlike the one below this is a survivor that names a GAP rather than
    // a property. Dropping the parentheses lets `AND` bind tighter, so the in-write predicate reads
    // `(… and c.status='open' and p_fulfillment <> 'dinein') or s.mode='dinein'` — true for every
    // dine-in session whatever the cart's status. Measured on the mis-parenthesized form with the
    // `not_open` pre-check bypassed: a PAID cart's line is re-routed and re-taxed (0 → 147¢).
    // Every case in the SQL test is short-circuited by that pre-check, so nothing here can kill it
    // single-session; only a two-session harness can (OPEN-ITEMS M110, the same shape M98 filed as
    // M102). It is listed anyway so a maintainer who reworks that predicate sees this row rather
    // than a silently-absent one.
    expect: null,
    why: "the parentheses in the in-write EXISTS — load-bearing, and unkillable from one session because the pre-check refuses first (M110)",
    find: "          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')",
    replace: "          and p_fulfillment <> 'dinein' or s.mode = 'dinein'",
  },
  {
    id: "toggle/in-write-mode-term-deleted",
    fn: "mms_set_line_fulfillment",
    src: "m17", // M17 restates this function; patch the LAST definition or it is overwritten
    expect: null, // DOCUMENTED SURVIVOR — see the header
    why: "the migration header claims this term cannot diverge from its pre-check while `table_sessions.mode` is immutable. A survivor MEASURES that claim; a kill would mean the claim is false",
    find: "\n          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')",
    replace: "",
  },
  // ── M17 — the unresolvable tax category. One mutant per case: `plpgsql` ASSERT stops at the
  // first failure, so the SQL file alone can only ever prove case 1 (LEARNINGS #51). ────────────
  {
    id: "toggle/unknown-item-falls-back-to-hot",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.1",
    why: "M17 itself, restored verbatim: a deleted menu item assumed 'hot_prepared', which is taxable BOTH ways, so a cold line went to-go still carrying the dine-in tax on a transaction CDTFA Reg 1603 exempts",
    // Two edits, because the refusal and the fallback are two halves of one rule. Dropping only the
    // null check leaves `mms_line_tax(…, NULL, …)` — `mms_taxable`'s CASE falls to its `else true`,
    // which taxes it, so a one-edit version would over-collect for a DIFFERENT reason and credit
    // this mutant to a behaviour the fallback line never had.
    edits: [
      { find: "  if v_cat is null then return 'unknown_item'; end if;\n", replace: "" },
      {
        find: "public.mms_line_tax(v_new_price, v_cat, p_fulfillment = 'dinein')",
        replace:
          "public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')",
      },
    ],
  },
  {
    id: "toggle/unknown-item-uuid-guard-deleted",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    // NOT a case name: without the shape guard the cast RAISES before any assert runs, so the thing
    // that must be observed is postgres's own 22P02 — which is precisely the symptom case 2 exists
    // to convert into a verdict. Naming the exception text is as specific as naming a case.
    expect: "invalid input syntax for type uuid",
    why: "a non-uuid menu_item_id (a grocery barcode on a non-grocery line) raised 22P02 out of `v_mid::uuid` — the diner got a 500 instead of a reason",
    find: "  if v_mid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then\n    return 'unknown_item';\n  end if;\n",
    replace: "",
  },
  {
    id: "toggle/unknown-item-refuses-everything",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.3",
    why: "the over-blocking shape: a refusal written without its condition traps every line at its current tag, so cold food can never leave the table and stop being taxed. Over-blocking is as bad as under-blocking",
    find: "  if v_cat is null then return 'unknown_item'; end if;\n",
    replace: "  if true then return 'unknown_item'; end if;\n",
  },
  {
    id: "toggle/tax-category-hardcoded-grocery",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.4",
    why: "the category read but not USED — a hardcoded exempt category passes case 3 (which expects 0) and under-collects on every for-here toggle. The mirror of M17: same defect, other direction",
    find: "public.mms_line_tax(v_new_price, v_cat, p_fulfillment = 'dinein')",
    replace: "public.mms_line_tax(v_new_price, 'grocery_food', p_fulfillment = 'dinein')",
  },
  {
    id: "toggle/tax-category-hardcoded-cold",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.5",
    why: "a hardcoded COLD category passes cases 1-4 exactly — both cold cases agree with it — and silently exempts hot food in the bag. This is the mutant that makes case 5 earn its place rather than merely documenting the fixture",
    find: "public.mms_line_tax(v_new_price, v_cat, p_fulfillment = 'dinein')",
    replace: "public.mms_line_tax(v_new_price, 'cold_food', p_fulfillment = 'dinein')",
  },
];

/** Each migration's text, and the two concatenated in apply order (what the chain WOULD produce). */
const sources = Object.fromEntries(
  CHAIN.map((k) => [k, readFileSync(SUITES[k].migration, "utf8")]),
);
const chainSource = CHAIN.map((k) => sources[k]).join("\n");
let failures = 0;

console.log(
  c.bold(
    `\nverify:mode-authority — ${MUTANTS.length} mutants over 3 functions, ${CHAIN.length} suites\n`,
  ),
);

/**
 * `restore()` re-applies THIS migration, which is only a restore while this migration is still the
 * LAST definition of both functions. The day a later one redefines either, every mutant below would
 * quietly revert to the M100 body and each verdict would be about dead code — a battery reporting
 * green about a function the database no longer runs. So prove that first, and touch NOTHING until
 * it is proven.
 *
 * This check was wrong three times, each caught by inducing the violation rather than reasoning
 * about it, and the shape of the mistake was the same every time — *the guard damaged the thing it
 * existed to protect*:
 *
 *  1. It hashed and restored ONE FUNCTION AT A TIME. `restore()` re-applies the whole migration, so
 *     the first iteration healed the exact drift the second was looking for — stubbing out
 *     `mms_fire_line` produced a clean pass.
 *  2. It detected drift by APPLYING the migration and comparing afterwards, which overwrote the
 *     newer bodies: on the one database this exists for, it downgraded both functions and THEN
 *     announced it was refusing to proceed (Codex round 1; measured, a sentinel body was destroyed).
 *  3. It compared `md5(prosrc)` — the BODY. `alter function … security invoker` leaves prosrc
 *     byte-identical, so attribute drift (SECURITY, `search_path`, volatility, parallel safety) read
 *     as "no drift" while `restore()` silently reverted it. Measured: the run printed a green ✓ and
 *     put `security definer` back. And `pg_get_functiondef` carries no GRANTs, so replaying it could
 *     never have restored an EXECUTE grant this migration's `revoke` had just removed (Codex
 *     round 2).
 *
 * The fix retires the whole class instead of patching the third instance: compute what the migration
 * WOULD produce by applying it inside a transaction and rolling back. DDL is transactional in
 * Postgres, so nothing is written at all — there is no restore path left to get wrong. The
 * comparison is the FULL `pg_get_functiondef` (body + every attribute) plus `proacl`, so identity is
 * everything a caller could observe, not just the source text.
 */
const TARGETS = ["mms_set_line_fulfillment", "mms_fire_line"];

/** proname → "<md5 of full definition>|<acl>" for each target, as the given SQL leaves the database. */
function identity(prelude = "") {
  const probe = `select p.proname || '|' || md5(pg_get_functiondef(p.oid)) || '|' ||
                        coalesce(array_to_string(p.proacl::text[], ','), '(default)')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in (${TARGETS.map((t) => `'${t}'`).join(",")})
                  order by 1;`;
  const out = prelude
    ? psql(["-tA"], `begin;\n${prelude}\n${probe}\nrollback;`)
    : psql(["-tAc", probe]);
  // Keep the TUPLES only. With a prelude, psql also echoes a command tag for every statement the
  // migration runs (BEGIN, CREATE FUNCTION, REVOKE, GRANT, ROLLBACK), and treating those as rows
  // made the identities differ for a reason that had nothing to do with drift — the baseline
  // aborted while all three real drift axes were being detected correctly.
  const row = new RegExp(`^(?:${TARGETS.join("|")})\\|`);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => row.test(l));
}

const live = identity();
const expected = identity(chainSource); // applied and rolled back — the database is not written to
if (live.join("\n") !== expected.join("\n")) {
  console.log(
    c.red(
      `  ABORT  the live definitions are NOT what the migration CHAIN produces — a migration\n` +
        `         outside ${CHAIN.join(" + ")} redefines or re-grants one of these functions.\n` +
        `         Re-applying the chain would REVERT that,\n` +
        `         so every verdict below would be about dead code.\n` +
        `         Nothing was written: the comparison ran inside a rolled-back transaction.\n\n` +
        live
          .filter((l, i) => l !== expected[i])
          .map(
            (l) =>
              `         live     ${l}\n         migration ${expected[live.indexOf(l)] ?? "(absent)"}`,
          )
          .join("\n"),
    ),
  );
  process.exit(1);
}

for (const m of MUTANTS) {
  // The text a mutant patches: the migration itself, or (fnPatch) the live definition of a function
  // this migration does not contain. Either way the match must be unique — a zero- or multi-match
  // `find` is a failure, never a skip.
  const suite = m.suite ?? "m100";
  const src = m.src ?? suite;
  const original = m.fnPatch ? functionDef(m.fn) : sources[src];
  // A mutant is one or more edits. Most are one; the "whole guard" mutants are two, because this
  // guard deliberately lives in two places and deleting one of them is a different mutation.
  const edits = m.edits ?? [{ find: m.find, replace: m.replace }];
  const stale = edits.filter((e) => original.split(e.find).length - 1 !== 1);
  if (stale.length) {
    console.log(
      c.red(
        `  STALE  ${m.id} — ${stale.length} of ${edits.length} edit(s) did not match exactly once`,
      ),
    );
    failures++;
    continue;
  }

  // (1) a green baseline, every time — otherwise an already-red case is credited to this mutant.
  const baseline = runTest(suite);
  if (baseline !== null) {
    console.log(c.red(`  ABORT  ${m.id} — baseline is already RED: ${baseline}`));
    failures++;
    break;
  }
  const before = bodyHash(m.fn);

  // (2) apply, and (3) prove it actually landed. A migration mutant replays the WHOLE chain with the
  // patched file substituted in place — applying the patched file alone would leave any earlier
  // migration's statements unapplied, and applying it out of order would let a later one overwrite
  // the mutation, which reads as a surviving mutant and is really a broken harness.
  const mutatedText = edits.reduce((text, e) => text.replace(e.find, e.replace), original);
  if (m.fnPatch) {
    psql(["-q"], mutatedText);
  } else {
    for (const k of CHAIN) psql(["-q"], k === src ? mutatedText : sources[k]);
  }
  const mutated = bodyHash(m.fn);
  if (mutated === before) {
    console.log(c.red(`  NO-OP  ${m.id} — ${m.fn}'s body is unchanged; the patch never applied`));
    if (m.fnPatch) psql(["-q"], original);
    else restore();
    failures++;
    continue;
  }

  // (4) the named case must be the one that fails.
  const got = runTest(suite);
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

for (const k of CHAIN) {
  const finalCheck = runTest(k);
  if (finalCheck !== null) {
    console.log(c.red(`\n  the ${k} suite is RED after restore: ${finalCheck}`));
    failures++;
  }
}

console.log(
  failures === 0
    ? c.green(
        `\n✓ ${MUTANTS.length} mutants accounted for; the suite is green on the real function\n`,
      )
    : c.red(`\n✗ ${failures} failure(s)\n`),
);
process.exit(failures === 0 ? 0 : 1);
