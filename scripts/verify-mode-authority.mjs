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
 * DOCUMENTED SURVIVORS
 * --------------------
 * Three mutations are expected to SURVIVE, and asserting that is the point. They are not one kind:
 *
 *   · A survivor that measures a PROPERTY. `toggle/in-write-mode-term-deleted` rests on
 *     `table_sessions.mode` having no writer; the migration's header states that in writing and this
 *     row MEASURES it. A kill means the claim has become false and the header must be rewritten.
 *     (M109's gate rests on the same property, which is why it reads that column WITHOUT a lock.)
 *   · A survivor that names a GAP. `toggle/in-write-parens-dropped` (M110) and
 *     `merge/null-mode-branch-dropped` are real guards no SINGLE-session test can reach — the first
 *     because a pre-check refuses first, the second because the gate above it proves both carts
 *     exist. They are listed rather than omitted so a maintainer reworking either predicate sees the
 *     row instead of an absence.
 *
 * Either way the expectation is checked in the same direction as every other row, never left as an
 * untested comment.
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
import { readFileSync, readdirSync } from "node:fs";
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
    migration: path.join(ROOT, "supabase/migrations/20260826000000_m17_line_tax_category.sql"),
    test: path.join(ROOT, "supabase/tests/m17_line_tax_category_test.sql"),
  },
  m109: {
    migration: path.join(ROOT, "supabase/migrations/20260827000000_m109_merge_matches_mode.sql"),
    test: path.join(ROOT, "supabase/tests/m109_merge_matches_mode_test.sql"),
  },
};
/** Apply order. Later entries redefine earlier ones, so this order is load-bearing. */
const CHAIN = ["m100", "m17", "m109"];

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
/**
 * M109's gate, named once because five mutants below patch it. A typo in an
 * inlined copy would make that mutant fail to apply — which the md5 check catches, but reported
 * as "the patch did not land" rather than "the guard has a hole", and those read very
 * differently at 2am.
 */
const M109_GATE = "  if v_src_mode is null or v_tgt_mode is null or v_src_mode <> v_tgt_mode then";

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
  // ── M17 — the line carries its own tax category. One mutant per case: `plpgsql` ASSERT stops at
  // the first failure, so the SQL file alone can only ever prove case 1 (LEARNINGS #51). ────────
  {
    id: "insert/tax-category-not-stamped",
    fn: "mms_cart_item_insert_if_open",
    src: "m17",
    suite: "m17",
    expect: "M17.1",
    why: "the whole premise: a line minted without its category is a line whose tax the catalog can revoke later. Everything else in this suite rests on the stamp happening at insert, while the item is certain to exist",
    find: "         case when p_menu_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'\n              then (select mi.tax_category from public.menu_items mi where mi.id = p_menu_item_id::uuid)\n              else null end",
    replace: "         null",
  },
  {
    id: "toggle/ignores-the-line-category",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.2",
    why: "M17 itself, restored: resolving the category from menu_items on every flip instead of reading the line means a pruned catalog row assumes hot_prepared — taxable BOTH ways — so cold food in a bag is charged tax CDTFA exempts, AND (refusing instead) the box never reaches expo",
    find: "  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents, s.mode,\n         ci.tax_category\n    into v_cart, v_status, v_state, v_cur, v_mid, v_price, v_mode, v_cat",
    replace:
      "  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents, s.mode,\n         null::text\n    into v_cart, v_status, v_state, v_cur, v_mid, v_price, v_mode, v_cat",
  },
  {
    id: "toggle/category-forced-exempt",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.3",
    why: "the under-collection direction, and the one the rejected first attempt shipped: dine-in is all taxable except groceries, so treating every unresolved line as grocery charges $0 on food eaten at the table. Passes case 2 exactly — which is why case 3 exists",
    find: "public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')",
    // Forces the CATEGORY, not the fallback. The first cut mutated `coalesce(v_cat, …)`'s default and
    // SURVIVED — correctly: the line now carries `cold_food`, so the coalesce never fires. A mutant
    // that cannot reach the code it names is the degenerate case this battery exists to surface.
    replace: "public.mms_line_tax(v_new_price, 'grocery_food', p_fulfillment = 'dinein')",
  },
  {
    id: "toggle/category-forced-cold",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.4",
    why: "hot food silently exempted in the bag. Passes cases 2 and 3 — both cold — so only a HOT fixture separates it. This is the mutant that stops 'make the pruned case exempt' from being satisfied by exempting everything to-go",
    find: "public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')",
    replace: "public.mms_line_tax(v_new_price, 'cold_food', p_fulfillment = 'dinein')",
  },
  {
    id: "toggle/legacy-catalog-bridge-deleted",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.5",
    why: "the catalog read is BOTH the bridge for rows written before this migration (no stamp) and the path a live re-classification travels. Delete it and a legacy line falls to `mms_line_tax(…, NULL, …)`, where `mms_taxable`'s `else true` taxes cold food in a bag",
    find: "  if v_mid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then\n    select tax_category into v_cat_live from public.menu_items where id = v_mid::uuid;\n    if v_cat_live is not null then v_cat := v_cat_live; end if;\n  end if;",
    replace: "",
  },
  {
    id: "toggle/stamp-preferred-over-catalog",
    fn: "mms_set_line_fulfillment",
    src: "m17",
    suite: "m17",
    expect: "M17.7",
    why: "the ORDER of the two reads, and the shape this fix originally shipped as. Preferring the line's stamp means an operator correcting a mis-classified dish (supabase/data/w15_pos_apply.sql does exactly this, and one is pending for lemon-salad) never reaches lines already in an open cart — the corrected dish keeps ringing its old tax, silently, for a change they believe they just made",
    find: "  if v_mid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then\n    select tax_category into v_cat_live",
    replace:
      "  if v_cat is null and v_mid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then\n    select tax_category into v_cat_live",
  },
  {
    id: "insert/uuid-guard-deleted",
    fn: "mms_cart_item_insert_if_open",
    src: "m17",
    suite: "m17",
    // Not a case name: without the CASE guard the cast RAISES at insert, before any assert can run.
    // That 22P02 is precisely the symptom case 6 exists to keep out of a diner's face.
    expect: "invalid input syntax for type uuid",
    why: "a grocery barcode in menu_item_id is not a uuid, and a bare cast raises 22P02 — a 500 on the scan path rather than a stamped line",
    find: "         case when p_menu_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'\n              then (select mi.tax_category from public.menu_items mi where mi.id = p_menu_item_id::uuid)\n              else null end",
    replace:
      "         (select mi.tax_category from public.menu_items mi where mi.id = p_menu_item_id::uuid)",
  },
  // ── M109 — the merge refuses two tables of different KINDS.
  //
  // TWO mis-write families survive the obvious cases, and each has a case built for it.
  //
  // (a) The `dinein`-flavoured gate. M100's guard, one function over, is spelled
  //     `p_fulfillment = 'dinein' and v_mode <> 'dinein'`; copying that shape yields a guard that
  //     passes cases 1 and 2 while merging scan-and-go into pickup. Case 3 kills it, case 7 kills
  //     the opposite over-tightening.
  //
  // (b) A gate that reads the wrong COLUMN. A session's `mode` and its lines' `fulfillment` tags
  //     travel together in ordinary data, so a suite built only from ordinary tables leaves the two
  //     perfectly correlated and cannot tell them apart. The FIRST version of this suite was
  //     measured green against a gate that never read `mode` at all — the defect M109 closes,
  //     reintroduced with every test passing (blind adversarial pass, HIGH). Cases 4 and 5 break the
  //     correlation in opposite directions, and `reads-line-tags-not-mode` /
  //     `mode-gate-weakened-by-tag-conjunct` below are what keep it broken. ────────────────────────
  {
    id: "merge/mode-gate-deleted",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.1",
    why: "the whole M109 guard. A pickup table merges into a dine-in one: M97's fold predicate refuses to FOLD the mismatched tag, but the line re-parents onto the target cart anyway, and the tail then cancels the source cart and closes the source session",
    find: M109_GATE,
    replace: "  if false then",
  },
  {
    id: "merge/mode-gate-is-dinein-flavoured",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.3",
    why: 'the gate written as "is one of them dine-in?" — the shape M100 uses one function over. It refuses both dine-in-vs-other directions and merges scan-and-go straight into pickup, which is why case 3 holds two NON-dine-in modes',
    find: M109_GATE,
    replace: "  if (v_src_mode = 'dinein') <> (v_tgt_mode = 'dinein') then",
  },
  {
    id: "merge/mode-gate-checks-one-side",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.2",
    why: "a one-sided gate — it refuses a pickup source landing on a dine-in target and admits the reverse. Case 1 alone cannot see this, which is the whole reason case 2 is not a mirror written for symmetry",
    find: M109_GATE,
    replace: "  if v_tgt_mode = 'dinein' and v_src_mode <> 'dinein' then",
  },
  {
    id: "merge/mode-gate-over-tightened",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.7",
    why: "the OPPOSITE failure, and the one cases 1-6 all pass: a gate demanding both tables be dine-in refuses two pickup tables merging, an ordinary floor action. Over-blocking is as expensive as under-blocking",
    find: M109_GATE,
    replace: "  if v_src_mode <> 'dinein' or v_tgt_mode <> 'dinein' then",
  },
  {
    id: "merge/reads-line-tags-not-mode",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.4",
    why: "the wrong COLUMN, and the mutant the first version of this suite could not kill. A session's `mode` and its lines' `fulfillment` tags are perfectly correlated in ordinary data, so a gate comparing TAGS answers identically on every ordinary fixture — M109's whole defect, reintroduced green. Case 4 holds the modes equal while the tags differ (a seated diner who tapped To go), which is the only shape that separates them",
    find: M109_GATE,
    replace:
      "  if exists (select 1 from public.qr_cart_items a, public.qr_cart_items b\n               where a.cart_id = p_source_cart and b.cart_id = p_target_cart\n                 and a.fulfillment <> b.fulfillment) then",
  },
  {
    id: "merge/mode-gate-weakened-by-tag-conjunct",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    expect: "M109.5",
    why: "the half-right version of the row above, and the reason case 5 is not redundant with case 4: a real mode comparison WEAKENED by an extra tag conjunct. Case 4 passes it (the modes match, so the gate is never reached), and only case 5 — modes differing while both lines happen to read `togo` — sees a pickup table merge into a dine-in one",
    find: M109_GATE,
    replace:
      "  if v_src_mode is null or v_tgt_mode is null or (v_src_mode <> v_tgt_mode\n        and exists (select 1 from public.qr_cart_items a, public.qr_cart_items b\n                      where a.cart_id = p_source_cart and b.cart_id = p_target_cart\n                        and a.fulfillment <> b.fulfillment)) then",
  },
  {
    id: "merge/null-mode-branch-dropped",
    fn: "mms_merge_table_orders",
    src: "m109",
    suite: "m109",
    // DOCUMENTED SURVIVOR — a GAP, not a property. `select … into` yields NULL when no row matches,
    // and `null <> null` is null, which `if` treats as false: without the explicit test an unreadable
    // mode would be ADMITTED. Nothing single-session can reach it, because the open/active gate
    // directly above the guard already proves both carts exist. It is belt against that gate being
    // reordered or relaxed, and it is listed so the next maintainer sees the row rather than nothing.
    expect: null,
    why: "the fail-closed null test. Unreachable while the open/active gate above it proves both carts exist — belt against that gate moving, not against today's schema",
    find: M109_GATE,
    replace: "  if v_src_mode <> v_tgt_mode then",
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
    `\nverify:mode-authority — ${MUTANTS.length} mutants over 4 functions, ${CHAIN.length} suites\n`,
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
const TARGETS = [
  "mms_set_line_fulfillment",
  "mms_fire_line",
  "mms_cart_item_insert_if_open",
  "mms_merge_table_orders",
];

/**
 * Which migration LAST defines a function, read from the migration directory in apply order.
 *
 * The identity check below cannot answer this (Codex round 2, P2): if a later migration restates a
 * function byte-identically, `live === expected` even on a fresh database, and the runner would then
 * patch an earlier file whose mutation the later one silently overwrites — a mutant reported as
 * killed while nothing it wrote ever reached the database. Identity proves the chain produces the
 * live body; only the filenames prove the chain is COMPLETE.
 */
function lastDefiningMigration(fn) {
  const dir = path.join(ROOT, "supabase/migrations");
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`,
    "i",
  );
  let last = null;
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (re.test(readFileSync(path.join(dir, f), "utf8"))) last = f;
  }
  return last;
}

{
  const chainFiles = new Set(CHAIN.map((k) => path.basename(SUITES[k].migration)));
  const drift = TARGETS.map((fn) => [fn, lastDefiningMigration(fn)]).filter(
    ([, f]) => !f || !chainFiles.has(f),
  );
  if (drift.length) {
    console.log(
      c.red(
        `  ABORT  a migration OUTSIDE this battery's chain now defines a target function:\n` +
          drift.map(([fn, f]) => `         ${fn} → ${f ?? "(no definition found)"}`).join("\n") +
          `\n         Add it to CHAIN/SUITES and repoint the affected mutants' \`src\`, or every\n` +
          `         verdict about that function is about a body the chain does not produce.\n`,
      ),
    );
    process.exit(1);
  }
}

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
  // `() => e.replace`, never a bare string: String.replace treats `$&`, `$'`, `` $` `` and `$1` in a
  // STRING replacement as substitution patterns. Several of these mutants carry the uuid regex, whose
  // `…{12}$'` contains `$'` — "everything after the match" — so a literal-looking replacement spliced
  // the entire remainder of the migration into the function body and psql failed with a syntax error
  // that named a line nobody wrote. A function replacement is always literal. (Same class as
  // Python's re.sub backslash handling; both bit this file in one afternoon.)
  const mutatedText = edits.reduce((text, e) => text.replace(e.find, () => e.replace), original);
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
