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
 * Four mutations (twelve with Phase 2f, below) are expected to SURVIVE, and asserting that is the point. They are not one kind:
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
 *   · A survivor that needs TWO sessions. `insert/for-share-deleted` (P2cy): the row lock orders an
 *     add against a settlement claim, which no single session can interleave. It is KILLED — for all
 *     three line RPCs — by `scripts/verify-line-guard-race.mjs --mutants`; it is listed here so this
 *     battery's own count stays honest.
 *
 * PHASE 2f · P2v adds suite `p2f`: the four staff-only counter functions (`mms_fire_counter_cart`,
 * `mms_undo_counter_fire`, `mms_clear_cart_name`, `mms_counter_no_show`) and the restated
 * `mms_sweep_expired_sessions` (its counter exemption) — one mutant per named `P2F.<id> ·` case, the
 * `expect` string carrying the middle dot because `runTest` matches by substring. It brings FOUR
 * more documented survivors, all row locks no single session can observe: the fire's and the name
 * clear's cart lock are KILLED by `scripts/verify-counter-fire-race.mjs --mutants`; the no-show's
 * approvals-before-lines order (deadlock avoidance) and the undo's cart lock have no two-session
 * harness yet and are filed in OPEN-ITEMS. The Phase 2f blind review (C1) adds FOUR more: the fire's
 * session-row lock and the sweeper's lock-then-decide, SKIP LOCKED and held-rows-only confinement —
 * all KILLED by `verify-counter-fire-race.mjs --mutants` (sweep-first · fire-before-sweep). Twelve
 * survivors in all. Codex r2 on #308 adds `mms_clear_counter_cart` (Clear's SENT check and cancel in
 * one call) with NINE killed mutants and NO new survivor: its two locks are left out of this battery
 * and killed by `verify-counter-fire-race.mjs --mutants` (orders e and f) instead.
 * Codex r3 on #308 restates `mms_merge_table_orders` in the p2f migration (§8 — the counter refusal
 * decided under the merge's own locks; M109's seven mutants now patch THAT text, still judged by the
 * m109 suite) and `mms_void_line` / `mms_request_approval` (§9 — the cart locked before the line). Its
 * non-lock checks are killed here (P2F.28, P2F.29) with NO new survivor: the merge's LINES lock and
 * the two writers' cart locks are killed by `verify-counter-fire-race.mjs --mutants` (orders g2, h and
 * h2) instead. The merge's APPROVALS lock has no mutant anywhere yet (nothing races a resolve against
 * a merge) — filed under OPEN-ITEMS P2fi, not claimed here.
 * The Phase 2f self-review adds, with NO new survivor: the counter Clear's supersede of pending
 * requests (P2F.31a, and P2F.31b — a 'sent' refusal must not supersede), the merge's in-grace revert to
 * draft (P2F.28e), and the sweeper's exemption now counting a COMPED kitchen line (P2F.19f — the
 * mutant re-adds `not ci.comped`). The Clear's approvals LOCK and the no-show's LINES lock are killed
 * by `verify-counter-fire-race.mjs --mutants` (orders i2 and j) instead. `mms_line_transition` and
 * `mms_bump_ticket` (§6) join TARGETS: the migration defines both, so a restore re-applies them too.
 *
 * Phase 3c-ii · M258 (D29) adds suite `p3c2`: `mms_undo_fire` restated with the two freshness legs
 * (a fresh pay lock, a fresh split freeze — `mms_void_line`'s idiom) and FOUR killed mutants, each
 * beside the legitimate case its leg must not over-block, with NO new survivor: the function takes
 * no row lock by default (owner question 1), and the one-statement residual that leaves is STATED
 * in the migration header rather than claimed closed by a row here.
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
  // P2dd · P2cy restate all three line RPCs, `mms_cart_item_insert_if_open` included — so M17's
  // insert mutants patch THIS file now (the last definition), and are still judged by the m17 suite.
  p2dd: {
    migration: path.join(ROOT, "supabase/migrations/20260929000000_p2dd_p2cy_line_guards.sql"),
    test: path.join(ROOT, "supabase/tests/p2dd_p2cy_line_guards_test.sql"),
  },
  // Phase 2f · P2v — four new counter functions and the sweeper restated (its exemption).
  p2f: {
    migration: path.join(
      ROOT,
      "supabase/migrations/20261001000000_p2f_counter_cook_before_paid.sql",
    ),
    test: path.join(ROOT, "supabase/tests/p2f_counter_cook_before_paid_test.sql"),
  },
  // Phase 3c-ii · M258 (D29) — `mms_undo_fire` restated with the two freshness conjuncts (a fresh
  // pay lock, a fresh split freeze). Its LAST definition was 20260624030000 (s4), outside every
  // chain, so the function joins TARGETS here and the drift check below now covers it.
  p3c2: {
    migration: path.join(ROOT, "supabase/migrations/20261005120100_m258_undo_fire_lock_guard.sql"),
    test: path.join(ROOT, "supabase/tests/m258_undo_fire_lock_guard_test.sql"),
  },
};
/** Apply order. Later entries redefine earlier ones, so this order is load-bearing. */
const CHAIN = ["m100", "m17", "m109", "p2dd", "p2f", "p3c2"];

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
    src: "p2dd",
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
    src: "p2dd",
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
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
    suite: "m109",
    expect: "M109.1",
    why: "the whole M109 guard. A pickup table merges into a dine-in one: M97's fold predicate refuses to FOLD the mismatched tag, but the line re-parents onto the target cart anyway, and the tail then cancels the source cart and closes the source session",
    find: M109_GATE,
    replace: "  if false then",
  },
  {
    id: "merge/mode-gate-is-dinein-flavoured",
    fn: "mms_merge_table_orders",
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
    suite: "m109",
    expect: "M109.3",
    why: 'the gate written as "is one of them dine-in?" — the shape M100 uses one function over. It refuses both dine-in-vs-other directions and merges scan-and-go straight into pickup, which is why case 3 holds two NON-dine-in modes',
    find: M109_GATE,
    replace: "  if (v_src_mode = 'dinein') <> (v_tgt_mode = 'dinein') then",
  },
  {
    id: "merge/mode-gate-checks-one-side",
    fn: "mms_merge_table_orders",
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
    suite: "m109",
    expect: "M109.2",
    why: "a one-sided gate — it refuses a pickup source landing on a dine-in target and admits the reverse. Case 1 alone cannot see this, which is the whole reason case 2 is not a mirror written for symmetry",
    find: M109_GATE,
    replace: "  if v_tgt_mode = 'dinein' and v_src_mode <> 'dinein' then",
  },
  {
    id: "merge/mode-gate-over-tightened",
    fn: "mms_merge_table_orders",
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
    suite: "m109",
    expect: "M109.7",
    why: "the OPPOSITE failure, and the one cases 1-6 all pass: a gate demanding both tables be dine-in refuses two pickup tables merging, an ordinary floor action. Over-blocking is as expensive as under-blocking",
    find: M109_GATE,
    replace: "  if v_src_mode <> 'dinein' or v_tgt_mode <> 'dinein' then",
  },
  {
    id: "merge/reads-line-tags-not-mode",
    fn: "mms_merge_table_orders",
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
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
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
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
    src: "p2f", // Codex r3 on #308 restates the merge (§8); patch the LAST definition
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
  // ── P2dd · P2cy — the line RPCs (20260929000000). One mutant per named case. ──
  {
    id: "setqty/remove-sends-a-sent-line",
    fn: "mms_cart_item_set_qty_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.2",
    why: "the delete branch's own draft guard. Without it staff or a diner REMOVES a dish the kitchen is already cooking — a line that vanishes from the bill while the plate still comes out",
    find: "where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped\n        and ci.state = 'draft';\n  else",
    replace:
      "where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped;\n  else",
  },
  {
    id: "setqty/qty-changes-a-sent-line",
    fn: "mms_cart_item_set_qty_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.1",
    why: "P2dd itself: another device's Send lands between staffSetQty's read and this RPC, and the quantity of a line the kitchen was just handed changes — the ticket says 2, the bill says 5",
    find: "    update public.qr_cart_items ci set qty = p_qty\n      from public.qr_carts c\n      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped\n        and ci.state = 'draft';",
    replace:
      "    update public.qr_cart_items ci set qty = p_qty\n      from public.qr_carts c\n      where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and not ci.comped;",
  },
  {
    id: "setqty/sent-refusal-silent",
    fn: "mms_cart_item_set_qty_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.1",
    why: 'the refusal\'s NAME. A silent 0 reads as "no longer open" in both callers, telling staff a live table closed when the truth is "that dish already went to the kitchen"',
    find: "    if v_state is not null and v_state <> 'draft' then\n      raise exception 'line already sent' using errcode = 'P0001';",
    replace:
      "    if false then\n      raise exception 'line already sent' using errcode = 'P0001';",
  },
  {
    id: "inc/grows-a-sent-line",
    fn: "mms_cart_item_inc_qty",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.3",
    why: "the merge bump's draft guard: the sibling read filters state='draft', but a Send between that read and this bump grows a fired line — the cook plates 2, the bill charges 3",
    find: "and ci.qty < 99 and not ci.comped\n      and ci.state = 'draft';",
    replace: "and ci.qty < 99 and not ci.comped;",
  },
  {
    id: "inc/sent-bump-silent",
    fn: "mms_cart_item_inc_qty",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.3",
    why: "a bump refused on a sent line must be NAMED so the caller inserts a fresh draft; silent, the add is reported as landed and exists nowhere",
    find: "    if v_state is distinct from 'draft' then\n      raise exception 'line already sent'",
    replace: "    if false then\n      raise exception 'line already sent'",
  },
  {
    id: "inc/grows-a-comped-line",
    fn: "mms_cart_item_inc_qty",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2DD.4",
    why: "the comped guard on the bump: a repeat tap of a dish staff comped grows the comped line, so every extra unit is cooked and billed at zero. P2DD.4 called the bump on the comped draft and never read it back until the Phase 2d blind review — this mutant survived the file (measured)",
    find: "ci.qty < 99 and not ci.comped",
    replace: "ci.qty < 99",
  },
  {
    id: "insert/freeze-ignored",
    fn: "mms_cart_item_insert_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.1",
    why: "P2cy itself: an add under a live settlement rides the Terminal PaymentIntent (no quote CAS there) and is fired after pay by mms_fire_pending_food",
    find: "  -- its null / raise below.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
    replace: "  -- its null / raise below.\n",
  },
  {
    id: "inc/freeze-ignored",
    fn: "mms_cart_item_inc_qty",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.2",
    why: "the same hole on the merge branch: a repeat tap of a dish already in the basket grows its quantity under the settlement",
    find: "  -- answers idempotently; the raise rolls a fresh claim back.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then",
    replace:
      "  -- answers idempotently; the raise rolls a fresh claim back.\n  if false and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then",
  },
  {
    id: "setqty/freeze-ignored",
    fn: "mms_cart_item_set_qty_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.3",
    why: "a quantity change or removal under a live settlement moves a total staff are collecting",
    find: "  if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then",
    replace:
      "  if false and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then",
  },
  {
    id: "insert/freeze-checked-before-claim",
    fn: "mms_cart_item_insert_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.4",
    why: "ordering: checking the freeze BEFORE the claim tells a replayed scan that already landed that it did not — the offline queue then keeps retrying (or drops) a write that is on the bill",
    edits: [
      {
        find: "  -- its null / raise below.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
        replace: "  -- its null / raise below.\n",
      },
      {
        find: "    for share;\n  if p_scan_id is not null then\n    insert into public.mms_scan_events (scan_id, cart_id) values",
        replace:
          "    for share;\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n  if p_scan_id is not null then\n    insert into public.mms_scan_events (scan_id, cart_id) values",
      },
    ],
  },
  {
    id: "insert/freeze-never-goes-stale",
    fn: "mms_cart_item_insert_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.5",
    why: "the TTL: an abandoned settlement (the tab died mid-collect) must stop freezing the table after SETTLE_TTL_MS, exactly as assertCartMember reads it — or the table is dead until someone clears settle_at by hand",
    find: "  -- its null / raise below.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
    replace:
      "  -- its null / raise below.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '12 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
  },
  {
    id: "insert/freeze-refuses-a-closed-cart",
    fn: "mms_cart_item_insert_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: "P2CY.6",
    why: 'a paid cart with a fresh settle_at must keep its "no longer open" answer (null → CartClosedError → start a fresh order), never "being paid", which tells the diner to wait for a payment that already happened',
    find: "  -- its null / raise below.\n  if v_status = 'open' and v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
    replace:
      "  -- its null / raise below.\n  if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then\n    raise exception 'cart is being paid' using errcode = 'P0001';\n  end if;\n",
  },
  {
    id: "insert/for-share-deleted",
    fn: "mms_cart_item_insert_if_open",
    src: "p2dd",
    suite: "p2dd",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — the row lock is what orders an add against a settlement claim, and it is only observable with TWO sessions, which no file this battery runs can open. It is KILLED in CI by scripts/verify-line-guard-race.mjs --mutants (P2dk), which deletes `for share` from all three line RPCs and watches both orders go red. A kill HERE would mean the single-session suite has started to depend on the lock — re-read that harness before trusting it",
    find: "    from public.qr_carts c where c.id = p_cart_id\n    for share;",
    replace: "    from public.qr_carts c where c.id = p_cart_id;",
  },
  // ── Phase 2f · P2v — the counter cook-before-paid functions (20261001000000). One mutant per named
  // case; `expect` carries the trailing " ·" because `runTest` matches by substring and a bare
  // "P2F.1" would be satisfied by "P2F.15…".
  {
    id: "p2f/counter-fire-reg-prefix-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.3 ·",
    why: "the reg- half of the counter predicate: without it a DINER's pickup cart (a scanned sticker, pay-first by M107) cooks unpaid on a staff Send",
    find: "      and s.mode = 'pickup'\n      and s.qr_code like 'reg-%'\n      and ci.state = 'draft'\n      and ci.fulfillment = 'togo';",
    replace:
      "      and s.mode = 'pickup'\n      and ci.state = 'draft'\n      and ci.fulfillment = 'togo';",
  },
  {
    id: "p2f/counter-fire-mode-term-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.5 ·",
    why: "the mode half: a reg- code on a scan-and-go session is not a counter order, and nothing but this conjunct keeps its drafts from firing unpaid",
    find: "      and s.mode = 'pickup'\n      and s.qr_code like 'reg-%'\n      and ci.state = 'draft'",
    replace: "      and s.qr_code like 'reg-%'\n      and ci.state = 'draft'",
  },
  {
    id: "p2f/counter-fire-name-term-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.6 ·",
    why: "decision 7c — the name is the only pre-payment identity. Without the UPDATE's own conjunct an anonymous bag cooks and nobody can call it at pickup (the returned `named` is informational, never the guard)",
    find: "      and nullif(btrim(c.customer_name), '') is not null\n      and s.status = 'active'",
    replace: "      and s.status = 'active'",
  },
  {
    id: "p2f/counter-fire-open-term-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.7 ·",
    why: "a paid or cancelled cart's drafts must not fire through the unpaid path — the paid path (mms_fire_pending_food) already owns them",
    find: "      and c.status = 'open'\n      and nullif(btrim(c.customer_name), '') is not null",
    replace: "      and nullif(btrim(c.customer_name), '') is not null",
  },
  {
    id: "p2f/counter-fire-session-active-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.8 ·",
    why: "a closed session's drafts are abandoned basket, not an order; firing them cooks food nobody can settle",
    find: "      and s.status = 'active'\n      and s.expires_at > now()",
    replace: "      and s.expires_at > now()",
  },
  {
    id: "p2f/counter-fire-grocery-fires",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.2 ·",
    why: "grocery never fires, and a dine-in-tagged line on a counter cart is not this send's — the to-go conjunct is what leaves both as drafts",
    find: "      and ci.state = 'draft'\n      and ci.fulfillment = 'togo';\n  get diagnostics n = row_count;\n  return query",
    replace: "      and ci.state = 'draft';\n  get diagnostics n = row_count;\n  return query",
  },
  {
    id: "p2f/counter-fire-named-lies",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.6 ·",
    why: "`named` is how the app tells 'add a name first' from 'nothing to send'; a constant true reports a name refusal as an empty basket",
    find: "  return query select n, v_batch, v_deadline, coalesce(v_named, false),",
    replace: "  return query select n, v_batch, v_deadline, true,",
  },
  {
    id: "p2f/counter-undo-batch-term-dropped",
    fn: "mms_undo_counter_fire",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.9 ·",
    why: "the undo must return THIS tap's batch only — without the batch term one device's undo pulls back another device's send still in its grace",
    find: "      and ci.fire_at > now()\n      and ci.fire_batch = p_batch;",
    replace: "      and ci.fire_at > now();",
  },
  {
    id: "p2f/counter-undo-grace-term-dropped",
    fn: "mms_undo_counter_fire",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.11 ·",
    why: "past the 10s grace the ticket is on the KDS; an undo then silently unsends food a cook may already be making",
    find: "      and ci.fire_at > now()\n      and ci.fire_batch = p_batch;",
    replace: "      and ci.fire_batch = p_batch;",
  },
  {
    id: "p2f/counter-undo-comped-reverted",
    fn: "mms_undo_counter_fire",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.12 ·",
    why: "a comped line is an audited loss; the undo turning it back into a draft makes it billable again with the comp row still standing",
    find: "      and ci.state = 'fired'\n      and not ci.comped\n      and ci.fire_at > now()\n      and ci.fire_batch = p_batch;",
    replace:
      "      and ci.state = 'fired'\n      and ci.fire_at > now()\n      and ci.fire_batch = p_batch;",
  },
  {
    id: "p2f/clear-name-sent-check-dropped",
    fn: "mms_clear_cart_name",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.14 ·",
    why: "decision 7c — once food is in, the name is how the counter finds the bag; clearing it strands a cooked, unpaid order with no one to call",
    find: "    return 'keep_name';",
    replace: "    null;",
  },
  {
    id: "p2f/clear-name-lock-covers-tables",
    fn: "mms_clear_cart_name",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.14 ·",
    why: "over-block: the name lock is a COUNTER rule; a dine-in cart with fired lines must still clear its name (P2F.14's legit half)",
    find: "  if v_mode = 'pickup' and v_code like 'reg-%' and exists (",
    replace: "  if exists (",
  },
  {
    id: "p2f/no-show-counter-check-dropped",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15a ·",
    why: "the no-show writes off food without a charge — on a table or a diner pickup that is a free meal behind one button",
    find: "  if v_mode <> 'pickup' or v_code not like 'reg-%' then return 'not_counter'; end if;\n",
    replace: "",
  },
  {
    id: "p2f/no-show-nothing-sent-check-dropped",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15b ·",
    why: "with nothing sent there is no loss to record; the call must steer to Clear rather than cancel a live order and write zero rows",
    find: "  if v_sent is null then return 'nothing_sent'; end if;\n",
    replace: "",
  },
  {
    id: "p2f/no-show-grace-line-written-off",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15c ·",
    why: "an in-grace line never reached the KDS — writing it off records a loss for food nobody made",
    find: "      and not ci.comped\n      and (ci.fire_at is null or ci.fire_at <= now());",
    replace: "      and not ci.comped;",
  },
  {
    id: "p2f/no-show-open-check-dropped",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15d ·",
    why: "a paid cart's lines are revenue; voiding them after the fact erases a sale from the books",
    // Anchored on the comment after it: §9 restates `mms_void_line` / `mms_request_approval`, whose
    // bodies carry the same line (Codex r3 on #308).
    find: "  if v_status <> 'open' then return 'not_open'; end if;\n  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n",
    replace: "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n",
  },
  {
    id: "p2f/no-show-settle-freeze-ignored",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15e ·",
    why: "two tablets: a cashier's settle freeze is live — the no-show must refuse (in_flight) rather than void food the reader is charging for",
    find: "     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then\n    return 'in_flight';\n  end if;\n  -- Lock order: approvals",
    replace: "     then\n    return 'in_flight';\n  end if;\n  -- Lock order: approvals",
  },
  {
    id: "p2f/no-show-approver-gate-dropped",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15f ·",
    why: "decision 7b — the existing loss gate: a started or served dish needs a manager, and without the null check a server writes it off alone",
    find: "  if v_gate <> 'solo' then\n    if p_approver is null then return 'needs_approval'; end if;\n",
    replace: "  if v_gate <> 'solo' then\n",
  },
  {
    id: "p2f/no-show-self-approve-allowed",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15g ·",
    why: "a manager approving their own write-off is no second pair of eyes — the same rule mms_void_line enforces",
    find: "    if p_approver = p_initiator then return 'self_approve'; end if;\n    select role, active into v_role, v_active",
    replace: "    select role, active into v_role, v_active",
  },
  {
    id: "p2f/no-show-server-approves",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15h ·",
    why: "the approver must be an active manager/owner; a server's id in the approver slot is the gate in name only",
    find: "v_role not in ('manager', 'owner') then",
    replace: "v_role not in ('manager', 'owner', 'server') then",
  },
  {
    id: "p2f/no-show-cooked-gate-ignored",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15f ·",
    why: "the cooked leg of the gate: a served dish under the ceiling must still need a manager, as it does for a single void",
    find: "  v_gate := case when v_cooked then 'cooked' when v_loss > v_max_loss then 'ceiling' else 'solo' end;",
    replace: "  v_gate := case when v_loss > v_max_loss then 'ceiling' else 'solo' end;",
  },
  {
    id: "p2f/no-show-drafts-written-off",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15b ·",
    why: "drafts never reached the kitchen — writing them off as a no-show loss inflates the loss with food nobody made. Since a NULL fire_at counts as sent (Phase 2f review, M2) the state term is the ONLY thing between a plain draft and the sent set, so the drafts-only case (P2F.15b) catches it first; P2F.16's old-fire_at draft pins it too",
    find: "      and ci.state in ('fired', 'in_progress', 'served')\n      and ci.fulfillment <> 'grocery'",
    replace: "      and ci.state <> 'voided'\n      and ci.fulfillment <> 'grocery'",
  },
  {
    id: "p2f/no-show-grocery-written-off",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "a grocery line is shelf stock, not kitchen food — the no-show leaves it on the cancelled cart with no row (Clear's precedent) and never books it as a loss",
    find: "      and ci.fulfillment <> 'grocery'\n      and not ci.comped\n      and (ci.fire_at is null",
    replace: "      and not ci.comped\n      and (ci.fire_at is null",
  },
  {
    id: "p2f/no-show-comped-line-re-audited",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "a comped line is already an audited loss; auditing it again as a no-show double-counts it",
    find: "      and ci.fulfillment <> 'grocery'\n      and not ci.comped\n",
    replace: "      and ci.fulfillment <> 'grocery'\n",
  },
  {
    id: "p2f/no-show-pending-left-open",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "a pending S2.4 request on a cancelled cart can later be approved against a line that no longer exists — supersede it in the same statement",
    find: "  update public.mms_approvals set status = 'superseded', resolved_at = now()\n    where cart_id = p_cart_id and status = 'pending';\n",
    replace: "",
  },
  {
    id: "p2f/no-show-grace-line-left-fired",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "an in-grace fired line on a cancelled cart sits 'fired' with no audit row and no bill — return it to draft (the undo's own edge)",
    find: "  update public.qr_cart_items set state = 'draft', fire_at = null, fire_batch = null\n    where cart_id = p_cart_id and state = 'fired' and fire_at > now();\n",
    replace: "",
  },
  {
    id: "p2f/no-show-cart-left-open",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "the write-off must close the cart, or the voided order stays payable and the counter keeps showing it",
    find: "  update public.qr_carts set status = 'cancelled' where id = p_cart_id and status = 'open';\n",
    replace: "",
  },
  {
    id: "p2f/no-show-session-left-active",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.16 ·",
    why: "the session must close with the cart, or the reg- code keeps a live session a diner can still join",
    find: "  update public.table_sessions set status = 'closed' where id = v_session and status = 'active';\n",
    replace: "",
  },
  {
    id: "p2f/no-show-ceiling-counts-drafts",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.17 ·",
    why: "the loss ceiling is over SENT value only; counting drafts sends a $5 no-show with a $30 unsent basket to a manager for nothing",
    find: "    from public.qr_cart_items ci where ci.id = any(v_sent);\n  select max_loss_cents",
    replace:
      "    from public.qr_cart_items ci where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;\n  select max_loss_cents",
  },
  {
    id: "p2f/sweeper-counter-exemption-dropped",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19a ·",
    why: "the M171 shape for counter orders: without the exemption an expired reg- session with food cooking is closed and the KDS, the lane and every settle door lose it",
    find: "      and not (s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (",
    replace: "      and not (false and s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (",
  },
  {
    id: "p2f/sweeper-exemption-covers-every-pickup",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19d ·",
    why: "the exemption is for STAFF counter orders only; a diner's pickup session with fired food must still expire",
    find: "      and not (s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (",
    replace: "      and not (s.mode = 'pickup' and exists (",
  },
  {
    id: "p2f/sweeper-exemption-covers-drafts",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19b ·",
    why: "a drafts-only counter order is an abandoned basket — nothing is cooking, so the sweep must close it",
    find: "               and ci.state in ('fired', 'in_progress', 'served')\n",
    replace: "               and ci.state <> 'voided'\n",
  },
  {
    id: "p2f/sweeper-exemption-covers-tables",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19c ·",
    why: "the dine-in half of M171 is unchanged here: a dine-in session with fired lines still expires (P2F.19c pins that this PR did not widen it)",
    find: "      and not (s.mode = 'pickup' and s.qr_code like 'reg-%' and exists (",
    replace: "      and not (s.qr_code like '%' and exists (",
  },
  {
    id: "p2f/counter-fire-cart-lock-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — the fire's cart-row lock is what orders it against a name clear (and a no-show or settle claim); only TWO sessions can interleave them. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants (clear-first and fire-first must both go red). A kill HERE means the single-session suite has started to depend on the lock",
    find: "    from public.qr_carts c where c.id = p_cart_id\n    for update;\n  -- Then the session row",
    replace: "    from public.qr_carts c where c.id = p_cart_id;\n  -- Then the session row",
  },
  {
    id: "p2f/clear-name-cart-lock-dropped",
    fn: "mms_clear_cart_name",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — the name clear decides keep_name under the cart-row lock the fire also takes; without it a fire committing between its read and its update leaves a cooking order with no name. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants",
    find: "    where c.session_id = p_session_id and c.status = 'open'\n    for update of c;",
    replace: "    where c.session_id = p_session_id and c.status = 'open';",
  },
  {
    id: "p2f/no-show-approvals-locked-after-lines",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR — locking pending approvals BEFORE lines is deadlock avoidance against mms_resolve_approval (approval → line); a deadlock needs two sessions and no harness drives this one yet. Filed (OPEN-ITEMS, P2fi-row: two-session proof of the no-show's lock order)",
    find: "  perform 1 from public.mms_approvals\n    where cart_id = p_cart_id and status = 'pending'\n    for update;\n",
    replace: "",
  },
  {
    id: "p2f/counter-undo-cart-lock-dropped",
    fn: "mms_undo_counter_fire",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR — the undo's cart-row lock orders it against a no-show or a settle claim on the same cart; only two sessions can interleave them and no harness drives the undo yet. Filed (OPEN-ITEMS, P2fi-row: two-session proof of the undo's cart lock)",
    find: "  perform 1 from public.qr_carts where id = p_cart_id for update;\n",
    replace: "",
  },
  // ── Phase 2f blind review (db) — the fire's closed signal and expiry term (C1), the no-show's
  // expected set ('changed', the cross-area decision), the untested pay-lock / ceiling / null-fire_at
  // rules (M4 · M3 · M2), and the sweeper's OPEN-cart and SENT terms (M5 · one definition).
  {
    id: "p2f/counter-fire-expired-session-fires",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.8b ·",
    why: "C1 — an expired session the sweeper has not reached yet must not gain fired food: the next sweep would close it under the food, off the KDS, the lane and every settle",
    find: "      and s.status = 'active'\n      and s.expires_at > now()\n",
    replace: "      and s.status = 'active'\n",
  },
  {
    id: "p2f/counter-fire-closed-ignores-expiry",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.8b ·",
    why: "an expired order answers 'nothing to send' instead of closed — the app names a refusal from `closed`, so the counter is told the basket is empty",
    find: "  select s.status = 'active' and s.expires_at > now() into v_live",
    replace: "  select s.status = 'active' into v_live",
  },
  {
    id: "p2f/counter-fire-closed-ignores-cart",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.7 ·",
    why: "a Send that lost the race to a settle (the cart is paid) must say closed, not 'add a name' or 'nothing to send'",
    find: "                      not (coalesce(v_cart_open, false) and coalesce(v_live, false));",
    replace: "                      not coalesce(v_live, false);",
  },
  {
    id: "p2f/counter-fire-closed-ignores-session",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.8 ·",
    why: "a Send that lost the race to a sweep or a clear (the session is closed) must say closed",
    find: "                      not (coalesce(v_cart_open, false) and coalesce(v_live, false));",
    replace: "                      not coalesce(v_cart_open, false);",
  },
  {
    id: "p2f/counter-fire-closed-always",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.6 ·",
    why: "a live, nameless order must read 'add a name first' — a constant closed hides the one refusal the counter can fix",
    find: "                      not (coalesce(v_cart_open, false) and coalesce(v_live, false));",
    replace: "                      true;",
  },
  {
    id: "p2f/no-show-pay-lock-ignored",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15i ·",
    why: "M4 — a guest's single-pay attempt is live (fresh lock): voiding the food under it cancels a cart a card is being charged for",
    find: "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_locked and v_locked_at > now() - interval '5 minutes')\n     or (v_settle_at",
    replace:
      "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_settle_at",
  },
  {
    id: "p2f/no-show-pay-lock-ttl-widened",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15i ·",
    why: "over-block: an ABANDONED pay lock (past mms_void_line's 5-minute literal) must not strand a no-show — the TTL is what releases it",
    find: "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_locked and v_locked_at > now() - interval '5 minutes')",
    replace:
      "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_locked and v_locked_at > now() - interval '10 minutes')",
  },
  {
    id: "p2f/no-show-pay-lock-flag-ignored",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.15i ·",
    why: "over-block: a released lock leaves its stamp behind; only `locked` says a payment is live",
    find: "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_locked and v_locked_at > now() - interval '5 minutes')",
    replace:
      "  -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.\n  if (v_locked_at > now() - interval '5 minutes')",
  },
  {
    id: "p2f/no-show-ceiling-arm-dropped",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.21 ·",
    why: "M3 — the ceiling leg of the loss gate: a large sent order nobody started is written off by a server alone",
    find: "when v_cooked then 'cooked' when v_loss > v_max_loss then 'ceiling' else 'solo' end;",
    replace: "when v_cooked then 'cooked' else 'solo' end;",
  },
  {
    id: "p2f/no-show-null-fire-at-not-sent",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.22 ·",
    why: "M2 — a fired line with no deadline is on the KDS; reading it as unsent answers nothing_sent and steers staff to Clear, cancelling food the kitchen saw with no loss row",
    find: "      and not ci.comped\n      and (ci.fire_at is null or ci.fire_at <= now());",
    replace: "      and not ci.comped\n      and ci.fire_at <= now();",
  },
  {
    id: "p2f/no-show-expected-set-ignored",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.20 ·",
    why: "the approval is tied to what the approver SAW: without the check a line sent after the sheet loaded is written off under a PIN that never covered it",
    find: "  if (select array_agg(distinct e order by e) from unnest(p_expected_line_ids) e)\n       is distinct from v_sent then\n    return 'changed';\n  end if;\n",
    replace: "",
  },
  {
    id: "p2f/no-show-expected-set-order-sensitive",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.20 ·",
    why: "over-block: the sheet's order and a repeated id are not a change — compared as a list, every real no-show refuses",
    find: "array_agg(distinct e order by e) from unnest(p_expected_line_ids) e)",
    replace: "array_agg(e) from unnest(p_expected_line_ids) e)",
  },
  {
    id: "p2f/no-show-missing-expected-set-passes",
    fn: "mms_counter_no_show",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.20 ·",
    why: "a NULL expected set compares as unknown under `<>` and falls through to the write — a caller that sends nothing approves anything",
    find: "       is distinct from v_sent then",
    replace: "       <> v_sent then",
  },
  {
    id: "p2f/sweeper-paid-cart-exempt",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19e ·",
    why: "M5 — a PAID counter order has nothing to collect; exempting it keeps a finished order squatting in the active set and the register queue forever",
    find: "             where c.session_id = s.id and c.status = 'open'\n",
    replace: "             where c.session_id = s.id\n",
  },
  {
    id: "p2f/sweeper-comped-swept",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19f ·",
    why: "the exemption is the KITCHEN set (`counterKitchenLine`, comps included): with `not ci.comped` back, a counter order whose only kitchen food is comped is swept — the session closes over an OPEN cart, the KDS and the lane lose it, and the Clear that is its exit can no longer reach it",
    find: "               and ci.fulfillment <> 'grocery'));",
    replace: "               and ci.fulfillment <> 'grocery'\n               and not ci.comped));",
  },
  {
    id: "p2f/sweeper-grocery-exempts",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.19g ·",
    why: "one definition of the kitchen set: a grocery line marked fired is shelf stock, not kitchen food — exempting it keeps an order alive that the no-show refuses",
    find: "               and ci.state in ('fired', 'in_progress', 'served')\n               and ci.fulfillment <> 'grocery'));",
    replace: "               and ci.state in ('fired', 'in_progress', 'served')));",
  },
  {
    id: "p2f/counter-fire-session-lock-dropped",
    fn: "mms_fire_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — the fire's session-row lock orders it against the cron sweep (C1); only TWO sessions can interleave them. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants (sweep-first and fire-before-sweep)",
    find: "    from public.table_sessions s where s.id = v_session\n    for share;",
    replace: "    from public.table_sessions s where s.id = v_session;",
  },
  {
    id: "p2f/sweeper-decides-without-locking-first",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — lock-then-decide is what makes the exemption read a snapshot newer than any Send the sweep waited for; single-session it is indistinguishable. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants (fire-before-sweep)",
    find: "     order by s.id\n     for no key update skip locked) x;",
    replace: "     order by s.id) x;",
  },
  {
    id: "p2f/sweeper-waits-on-a-send",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — SKIP LOCKED keeps the cron from stalling behind an in-flight Send; only a second session holds a lock to skip. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants (fire-before-sweep)",
    find: "     for no key update skip locked) x;",
    replace: "     for no key update) x;",
  },
  {
    id: "p2f/sweeper-closes-rows-it-skipped",
    fn: "mms_sweep_expired_sessions",
    src: "p2f",
    suite: "p2f",
    expect: null,
    why: "DOCUMENTED SURVIVOR HERE — the UPDATE is confined to the rows the lock step HOLDS; single-session every candidate is held. KILLED in CI by scripts/verify-counter-fire-race.mjs --mutants (fire-before-sweep)",
    find: "    where s.id = any(v_ids)\n      and not (",
    replace: "    where s.status = 'active' and s.expires_at <= now()\n      and not (",
  }, // ── Codex r1 on #308 — a fired line with no fire_at is DUE to the kitchen's writes (§6). ─────────
  {
    id: "p2f/line-transition-null-fire-at-refused",
    fn: "mms_line_transition",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.23 ·",
    why: "the Start/Ready guard back to `fire_at is not null`: a null-fire_at line the KDS shows can never be started or readied — every tap answers 'already updated'",
    find: "           or (ci.fire_at is null or ci.fire_at <= now()))",
    replace: "           or (ci.fire_at is not null and ci.fire_at <= now()))",
  },
  {
    id: "p2f/line-transition-held-line-movable",
    fn: "mms_line_transition",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.23 ·",
    why: "the Start/Ready guard reduced to its new null half: a HELD line (future fire_at, one the board has not shown as live) can be started and readied",
    find: "           or (ci.fire_at is null or ci.fire_at <= now()))",
    replace: "           or (ci.fire_at is null or true))",
  },
  {
    id: "p2f/bump-null-fire-at-refused",
    fn: "mms_bump_ticket",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.24 ·",
    why: "the ticket bump back to `fire_at is not null`: the displayed null-fire_at ticket can never leave the live queue",
    find: "      and ci.state in ('fired','in_progress')\n      and (ci.fire_at is null or ci.fire_at <= now());",
    replace:
      "      and ci.state in ('fired','in_progress')\n      and ci.fire_at is not null and ci.fire_at <= now();",
  },
  {
    id: "p2f/bump-held-line-served",
    fn: "mms_bump_ticket",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.24 ·",
    why: "the bump guard reduced to its new null half: a HELD line riding a bump is served before the kitchen ever saw it",
    find: "      and ci.state in ('fired','in_progress')\n      and (ci.fire_at is null or ci.fire_at <= now());",
    replace:
      "      and ci.state in ('fired','in_progress')\n      and (ci.fire_at is null or true);",
  },
  {
    id: "p2f/line-transition-fire-edge-stamps-nothing",
    fn: "mms_line_transition",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.25 ·",
    why: "the draft→fired edge back to stamping no fire_at: the only writer of a fired line with no deadline is live again",
    find: "        fire_at    = case when p_to = 'fired' then now() else ci.fire_at end,",
    replace: "        fire_at    = ci.fire_at,",
  },
  {
    id: "p2f/line-transition-fire-edge-keeps-stale",
    fn: "mms_line_transition",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.25 ·",
    why: "coalesce instead of now(): a draft carrying the leftover deadline of an earlier un-fire re-fires back-dated (instant red on the board)",
    find: "        fire_at    = case when p_to = 'fired' then now() else ci.fire_at end,",
    replace:
      "        fire_at    = case when p_to = 'fired' then coalesce(ci.fire_at, now()) else ci.fire_at end,",
  },
  {
    id: "p2f/line-transition-every-edge-stamps",
    fn: "mms_line_transition",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.25 ·",
    why: "the stamp on every edge: Start/Ready would re-date a line the kitchen already has, resetting its ticket age",
    find: "        fire_at    = case when p_to = 'fired' then now() else ci.fire_at end,",
    replace: "        fire_at    = now(),",
  },
  // ── Codex r2 on #308 — `mms_clear_counter_cart`: Clear's SENT check and its cancel, one decision.
  // Its two locks (the cart row, then the lines) are NOT here: single-session they are unobservable,
  // and this battery takes no new survivor — both are KILLED by scripts/verify-counter-fire-race.mjs
  // --mutants (orders e and f).
  {
    id: "p2f/clear-counter-sent-check-dropped",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26a ·",
    why: "THE FINDING: Clear cancels a counter order whose food the kitchen has — the KDS drops the ticket and the no-show, its only audited exit, becomes unreachable",
    find: "          and (ci.fire_at is null or ci.fire_at <= now())) then\n    return 'sent';\n",
    replace:
      "          and (ci.fire_at is null or ci.fire_at <= now())) and false then\n    return 'sent';\n",
  },
  {
    id: "p2f/clear-counter-comped-blocks",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26f ·",
    why: "over-block: a comped line is already an audited loss — counting it as sent strands an order no no-show can take (the no-show skips comped lines too)",
    find: "          and not ci.comped\n          and (ci.fire_at is null",
    replace: "          and (ci.fire_at is null",
  },
  {
    id: "p2f/clear-counter-grace-counts-as-sent",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26d ·",
    why: "over-block: an in-grace line never reached the KDS and is the sender's to undo — refusing it strands an order whose no-show answers nothing_sent",
    find: "          and not ci.comped\n          and (ci.fire_at is null or ci.fire_at <= now())) then",
    replace: "          and not ci.comped) then",
  },
  {
    id: "p2f/clear-counter-null-fire-at-not-sent",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26c ·",
    why: "a fired line with no fire_at is on the KDS (P2F.22) — reading it as unsent cancels food the kitchen shows",
    find: "          and (ci.fire_at is null or ci.fire_at <= now())) then",
    replace: "          and ci.fire_at <= now()) then",
  },
  {
    id: "p2f/clear-counter-grocery-blocks",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26g ·",
    why: "over-block: grocery is never kitchen food — refusing on it strands an order the no-show cannot take",
    find: "          and ci.fulfillment <> 'grocery'\n          and not ci.comped\n          and (ci.fire_at is null",
    replace: "          and not ci.comped\n          and (ci.fire_at is null",
  },
  {
    id: "p2f/clear-counter-counter-check-dropped",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26h ·",
    why: "the refusal is a COUNTER rule — a table with fired food still clears (Clear's precedent); without the check this staff-only cancel answers for any cart",
    find: "  if v_sess_mode <> 'pickup' or v_qr not like 'reg-%' then return 'not_counter'; end if;\n",
    replace: "",
  },
  {
    id: "p2f/clear-counter-mode-term-dropped",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26l ·",
    why: "the mode half of the counter predicate: a reg- code on a scan-and-go session is not a counter order",
    find: "  if v_sess_mode <> 'pickup' or v_qr not like 'reg-%' then",
    replace: "  if v_qr not like 'reg-%' then",
  },
  {
    id: "p2f/clear-counter-open-check-dropped",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26j ·",
    why: "a cart that is no longer open was not cancelled here — answering ok claims a cancel nobody recorded",
    find: "  if v_cart_status <> 'open' then return 'not_open'; end if;\n",
    replace: "",
  },
  {
    id: "p2f/clear-counter-cancel-dropped",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.26d ·",
    why: "'ok' must mean cancelled: the caller closes the session next, and an open cart under a closed session is an order nobody can reach",
    find: "  update public.qr_carts c set status = 'cancelled' where c.id = p_cart_id and c.status = 'open';\n",
    replace: "",
  },
  // ── Codex r3 on #308 — the merge's counter refusal (§8) and the void / request re-check (§9) ──
  {
    id: "p2f/merge-counter-source-check-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28a ·",
    why: "the finding itself: a counter source's sent food re-parents onto a table's cart — off the KDS, onto another customer's bill",
    find: "  if v_src_is_counter then\n",
    replace: "  if false then\n",
  },
  {
    id: "p2f/merge-counter-target-check-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28d ·",
    why: "a table's lines folded INTO a counter order — an unpaid pay-at-pickup bag that is nobody's table",
    find: "  if v_tgt_is_counter then\n",
    replace: "  if false then\n",
  },
  {
    id: "p2f/merge-refusal-still-writes",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28a · the refusal writes nothing",
    why: "a refusal that supersedes the source's pending requests first — a manager's queue emptied by a merge that never happened",
    find: "      return -1;\n",
    replace:
      "      update public.mms_approvals set status = 'superseded', resolved_at = now()\n" +
      "        where cart_id = p_source_cart and status = 'pending';\n      return -1;\n",
  },
  {
    id: "p2f/merge-sent-states-narrowed",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28b ·",
    why: "a started or served dish is sent food too — 'fired' alone lets a cooked order merge away",
    find: "            and src_ci.state in ('fired', 'in_progress', 'served')\n",
    replace: "            and src_ci.state = 'fired'\n",
  },
  {
    id: "p2f/merge-sent-null-fire-at-not-sent",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28c ·",
    why: "a fired line with no fire_at is on the KDS (P2F.22) — reading it as unsent merges food the kitchen shows",
    find: "            and (src_ci.fire_at is null or src_ci.fire_at <= now())) then",
    replace: "            and src_ci.fire_at <= now()) then",
  },
  {
    id: "p2f/merge-sent-grace-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28e ·",
    why: "over-block: an in-grace line never reached the KDS and is still the sender's to undo — the no-show's predicate, exactly",
    find: "            and (src_ci.fire_at is null or src_ci.fire_at <= now())) then",
    replace: ") then",
  },
  {
    id: "p2f/merge-sent-comped-blocks",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28g ·",
    why: "over-block: a comped line is an audited loss already and the merge never moves it",
    find: "            and not src_ci.comped\n",
    replace: "",
  },
  {
    id: "p2f/merge-sent-grocery-blocks",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28h ·",
    why: "over-block: grocery is never kitchen food",
    find: "            and src_ci.fulfillment <> 'grocery'\n",
    replace: "",
  },
  {
    id: "p2f/merge-counter-code-term-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28i ·",
    why: "the code half of the counter predicate: a diner's own pickup with fired food is a table, and merges",
    find: "  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_src_is_counter\n",
    replace: "  select s.mode = 'pickup' into v_src_is_counter\n",
  },
  {
    id: "p2f/merge-counter-mode-term-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28j ·",
    why: "the mode half of the counter predicate: a reg- code on a scan-and-go session is not a counter order",
    find: "  select s.mode = 'pickup' and s.qr_code like 'reg-%' into v_tgt_is_counter\n",
    replace: "  select s.qr_code like 'reg-%' into v_tgt_is_counter\n",
  },
  {
    id: "p2f/void-open-recheck-dropped",
    fn: "mms_void_line",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.29d ·",
    why: "the re-check the cart lock exists for: an approved void (a loss) recorded on a cart the no-show already cancelled",
    find: "  if v_status <> 'open' then return 'not_open'; end if;\n  if (v_locked and v_locked_at",
    replace: "  if (v_locked and v_locked_at",
  },
  {
    id: "p2f/request-open-recheck-dropped",
    fn: "mms_request_approval",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.29e ·",
    why: "a pending request raised on a cancelled cart — a manager asked to approve a loss on an order that no longer exists",
    find: "  if v_status <> 'open' then return 'not_open'; end if;\n  if v_state = 'voided' or v_comped",
    replace: "  if v_state = 'voided' or v_comped",
  },
  {
    id: "p2f/void-cart-binding-refuses-everything",
    fn: "mms_void_line",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.29a ·",
    why: "over-block: the line read bound to a cart it can never equal — every void answers not_found",
    find: "      where ci.id = p_line and ci.cart_id = v_void_cart\n",
    replace: "      where ci.id = p_line and ci.cart_id = v_session\n",
  },
  {
    id: "p2f/request-cart-binding-refuses-everything",
    fn: "mms_request_approval",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.29b ·",
    why: "over-block: the line read bound to a cart it can never equal — every request answers not_found",
    find: "      where ci.id = p_line and ci.cart_id = v_req_cart\n",
    replace: "      where ci.id = p_line and ci.cart_id = v_session\n",
  },
  // ── Phase 2f self-review — the Clear supersedes pending requests; the merge reverts in-grace lines ──
  {
    id: "p2f/clear-counter-pending-left-open",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.31a ·",
    why: "a pending S2.4 request on a cleared (cancelled) counter order sits in a manager's queue forever — and a resolve racing the Clear approved a void on the cancelled cart",
    find: "  update public.mms_approvals a set status = 'superseded', resolved_at = now()\n    where a.cart_id = p_cart_id and a.status = 'pending';\n",
    replace: "",
  },
  {
    id: "p2f/clear-counter-refusal-supersedes",
    fn: "mms_clear_counter_cart",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.31b ·",
    why: "over-reach: a 'sent' refusal must write nothing — superseding before the SENT check empties a manager's queue for a Clear that never happened",
    find: "  perform 1 from public.mms_approvals where cart_id = p_cart_id and status = 'pending' order by id for update;\n",
    replace:
      "  update public.mms_approvals set status = 'superseded', resolved_at = now() where cart_id = p_cart_id and status = 'pending';\n",
  },
  {
    id: "p2f/merge-counter-grace-revert-dropped",
    fn: "mms_merge_table_orders",
    src: "p2f",
    suite: "p2f",
    expect: "P2F.28e ·",
    why: "an in-grace counter line arrives on a pay-first target still 'fired' with the counter's deadline and batch — it skips the target's pay-then-fire schedule and goes live on the counter's clock",
    find: "    update public.qr_cart_items set state = 'draft', fire_at = null, fire_batch = null\n      where cart_id = p_source_cart and state = 'fired' and fire_at > now();\n",
    replace: "",
  },
  // ── Phase 3c-ii · M258 (D29) — the undo's two freshness legs, each beside the legitimate case it
  // must not over-block. Both legs read the SAME columns `mms_void_line` reads, so a leg written in
  // the strict form (bare `c.locked = false`) passes M1 and fails M2 — the over-blocking direction
  // W17 named. No row lock by default (owner question 1): the one-statement residual is stated in
  // the migration header, not claimed closed here.
  {
    id: "undo/locked-cart-undone",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.1 ·",
    why: "the hole D20 filed — without the lock leg, host A's undo flips the batch back after guest B's create-intent locked and read zero drafts, and B's charge mints over dishes the gate would have refused",
    find: "      and not (c.locked and c.locked_at > now() - interval '5 minutes')   -- M258: a FRESH pay lock refuses\n",
    replace: "",
  },
  {
    id: "undo/stale-lock-blocks-undo",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.2 ·",
    why: "the strict form the row proposed — `locked` is sticky (acquireCartLock takes a stale lock over; authz ignores one past its TTL), so a bare locked=false refuses every undo after an abandoned pay tab and the action says 'already with the kitchen' over lines the kitchen never saw",
    find: "      and not (c.locked and c.locked_at > now() - interval '5 minutes')   -- M258: a FRESH pay lock refuses\n",
    replace: "      and c.locked = false\n",
  },
  {
    id: "undo/settling-cart-undone",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.4 ·",
    why: "a split in flight captures each share against the CURRENT base — an undo under a fresh settle freeze re-drafts lines the shares already priced",
    find: "      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')   -- M258: a FRESH split freeze refuses\n",
    replace: "",
  },
  {
    id: "undo/settle-window-widened",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.5 ·",
    why: "the freeze lifetime is SETTLE_TTL_MS (10 min) in lib/lock-ttl.ts, lib/authz.ts and every mms_split_* — a wider window here refuses the undo of a table whose settlement the app already treats as abandoned",
    find: "      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')   -- M258: a FRESH split freeze refuses\n",
    replace:
      "      and (c.settle_at is null or c.settle_at <= now() - interval '60 minutes')   -- M258: a FRESH split freeze refuses\n",
  },
  {
    id: "undo/lock-window-narrowed",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.7 ·",
    why: "the blind pass on 3c-ii (money lens) — the outer edges alone (0 and 6 minutes) let a body reading `interval '1 minute'` pass: the hole D20 filed reopens for any lock older than a minute, inside the 5-minute pay window a create-intent still holds",
    find: "      and not (c.locked and c.locked_at > now() - interval '5 minutes')   -- M258: a FRESH pay lock refuses\n",
    replace:
      "      and not (c.locked and c.locked_at > now() - interval '1 minute')   -- M258: a FRESH pay lock refuses\n",
  },
  {
    id: "undo/settle-window-narrowed",
    fn: "mms_undo_fire",
    src: "p3c2",
    suite: "p3c2",
    expect: "M258.8 ·",
    why: "the same inner edge for the split freeze: a body reading `interval '1 minute'` passes M4 (0 min) and M5 (11 min) while a 9-minute-old settlement — inside SETTLE_TTL_MS — no longer refuses the undo",
    find: "      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')   -- M258: a FRESH split freeze refuses\n",
    replace:
      "      and (c.settle_at is null or c.settle_at <= now() - interval '1 minute')   -- M258: a FRESH split freeze refuses\n",
  },
];

/** Each migration's text, and the two concatenated in apply order (what the chain WOULD produce). */
const sources = Object.fromEntries(
  CHAIN.map((k) => [k, readFileSync(SUITES[k].migration, "utf8")]),
);
const chainSource = CHAIN.map((k) => sources[k]).join("\n");
let failures = 0;

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
  "mms_cart_item_inc_qty",
  "mms_cart_item_set_qty_if_open",
  "mms_fire_counter_cart",
  "mms_undo_counter_fire",
  "mms_clear_cart_name",
  "mms_counter_no_show",
  "mms_sweep_expired_sessions",
  "mms_clear_counter_cart",
  "mms_void_line",
  "mms_request_approval",
  "mms_line_transition",
  "mms_bump_ticket",
  "mms_undo_fire",
];

// TARGETS.length, measured — the banner used to hardcode "6 functions" and would have gone stale.
console.log(
  c.bold(
    `\nverify:mode-authority — ${MUTANTS.length} mutants over ${TARGETS.length} functions, ${CHAIN.length} suites\n`,
  ),
);

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
