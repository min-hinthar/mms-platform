#!/usr/bin/env node
/**
 * M102 — the two-session harness for `mms_merge_table_orders`'s concurrency guard.
 *
 * M97 added a guard whose whole job is to notice that a row changed under the merge's cursor, and
 * M98 extended it. It shipped REASONED-CORRECT AND UNPROVEN, and said so in its own header, because
 * none of its predicates can differ from the cursor's values without a **concurrent committed
 * write** — so the branch is unreachable from a single `psql` session, and every file in
 * `supabase/tests/` is single-session by construction (`begin; … rollback;`).
 *
 * This is that missing session.
 *
 * ── How the window is entered, deterministically ─────────────────────────────────────────────────
 *
 * B mutates the SOURCE row and holds the transaction open. A then calls the merge: it takes the cart
 * locks (B holds none), opens its loop cursor — reading the source at its PRE-B value, because a
 * reader never blocks on an uncommitted write — locks the target, and then BLOCKS on B's row lock at
 * the guarded DELETE. B commits; A's delete re-checks its WHERE against the new tuple under
 * EvalPlanQual and refuses.
 *
 * Two properties make this sound rather than lucky:
 *
 *   · **A blocks at the statement under test.** "The window was entered" and "the guard ran" are one
 *     fact, not two hopes. The sync device IS the production mutation — a diner tapping `+` mid-merge
 *     is exactly `update … set qty` on the source row.
 *   · **Acyclic by construction, not by argument.** B takes its only lock BEFORE A starts and
 *     requests nothing afterwards, so the single wait edge is A→B. (The two things that could have
 *     made a cycle are both absent: no FK references `qr_cart_items`, and the only UPDATE trigger on
 *     it carries `when (new.added_by is distinct from old.added_by)`, which no scenario here trips.)
 *
 * An earlier design had B lock the TARGET instead. It was rejected for S1–S6: A would block at a
 * statement that is not the one under test, and B would have committed and released before A reached
 * the delete, so EvalPlanQual — the mechanism the source guard depends on — would never fire.
 *
 * S7 keeps the target-side shape, because there IS a second guard over there (the match query's
 * `for update`) and it needs its own scenario. But B MUTATES the target rather than merely locking
 * it: see S7's own header for why a lock-only version proved nothing and survived its mutant.
 *
 * ── Why it COMMITS, and why that makes it dangerous ─────────────────────────────────────────────
 *
 * Session B must SEE session A's fixtures, so they cannot live in a rolled-back transaction. Every
 * other test in this repo ends "leaves NO data behind"; this one cannot make that promise, which is
 * why the refusal below is the strictest thing in the file. See `assertLocalOnly`.
 *
 * Run: `pnpm verify:merge-race` — requires the LOCAL supabase stack (`supabase start`). There is no
 * DSN argument, deliberately.
 */

import { spawn, spawnSync } from "node:child_process";

// ── Layer 1 of the prod guard: there is no input through which production can be named ───────────
//
// Not "validate the DSN the caller passed" — take no DSN at all, and scrub every libpq environment
// variable out of the children so an exported PGHOST/DATABASE_URL cannot redirect them. This mirrors
// `verify-slice.mjs`'s clean-tree assertion, which does not ASK about the dangerous state, it derives
// it and exits before touching anything.
// The transport is STATED, not inherited. `ssl` is one of the guard's predicates, and libpq's
// default is `prefer` — so without pinning it here the predicate silently depends on an environment
// default and on what the far end offers. `gssencmode=disable` matters more than it looks: GSSAPI
// encryption is negotiated INSTEAD of TLS, so a fully encrypted remote connection reports
// `pg_stat_ssl.ssl = f` (the state lives in `pg_stat_gssapi`, which nothing here reads) — i.e. it
// can satisfy half the guard on a remote database.
const DSN =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=prefer&gssencmode=disable";
const SCRUBBED = [
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGPASSFILE",
  "PGOPTIONS",
  "PGSSLMODE",
  "PGHOSTADDR",
  // These do not redirect the connection — they change what the GUARD MEASURES, which is worse,
  // because the refusal still runs and still says yes.
  "PGGSSENCMODE",
  "PGREQUIRESSL",
  "PGSSLNEGOTIATION",
  "PGSYSCONFDIR",
];
const childEnv = () => {
  const e = { ...process.env };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

const TAG = "M102";
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
// Set ONLY at the end of assertLocalOnly(). cleanup() refuses while it is false.
let localVerified = false;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) {
    failures++;
    console.log(
      `   ${red("✗")} ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
  }
  return ok;
};

/** One-shot query. Returns trimmed stdout; throws with psql's stderr on failure. */
function q(sql, appName = `mms-m102-probe`) {
  const r = spawnSync(
    "psql",
    ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`, "-c", sql],
    { env: { ...childEnv(), PGAPPNAME: appName }, encoding: "utf8" },
  );
  // On ENOENT `spawnSync` sets status:null and leaves stdout/stderr undefined, so reading only
  // stderr produces the literally useless message "psql failed:\nundefined" — at the FIRST call,
  // which is `assertLocalOnly`, inviting the reader to blame the production-safety refusal.
  if (r.status !== 0) {
    throw new Error(
      `psql failed (status=${r.status}${r.error ? `, ${r.error.code}` : ""}):\n` +
        (r.stderr || r.stdout || r.error?.message || "<no output — is psql on PATH?>"),
    );
  }
  return (r.stdout || "").trim();
}

/**
 * Layer 2 of the prod guard: an in-DB refusal, run before a single INSERT.
 *
 * ⚠️ THE FIRST VERSION OF THIS FUNCTION WAS WRONG, AND WRONG IN THE WAY THIS REPO CARES MOST ABOUT.
 * It asserted `usesuper = 't'`, on the stated ground that "on a local stack `postgres` IS a
 * superuser". That was never measured — there is no Docker in the container it was written in — and
 * it is FALSE: the supabase CLI's local `postgres` role is NOT a superuser. CI run 32485950724
 * measured `usesuper=f, ssl=f` on the local stack and the harness refused to run at all. A reasoned
 * assertion written in the language of an observation, one PR after an adversarial pass flagged
 * exactly that. It failed SAFE only by luck, because `ssl` carried the refusal on its own.
 *
 * So this now asserts only what has actually been measured on BOTH sides:
 *
 *   |                      | hosted (fasnpdhtvqtzjlvruqcu) | supabase CLI stack | scratch cluster    |
 *   | -------------------- | ----------------------------- | ------------------ | ------------------ |
 *   | `usesuper`           | f                             | f                  | t                  |
 *   | `ssl`                | **t**                         | **f**              | **f**              |
 *   | `inet_server_addr()` | **2600:1f14:… (public)**      | **172.18.0.2**     | **127.0.0.1**      |
 *   | foreign `qr_cart_items` | **245**                    | **0**              | **0**              |
 *
 * Every cell is measured, and each column says where. Hosted: a probe of that project. CLI stack:
 * CI run 32493251873, the first green run of this file — NOT reasoning about what a Docker bridge
 * address ought to look like, which is the entire reason the previous version of this guard was
 * wrong. Scratch cluster: a local postgres-16 with this repo's migration and production's constraint
 * and trigger surface applied, which is how every local proof in this PR was obtained.
 *
 * ⚠️ The third column was originally labelled "bare local cluster", which was wrong in a way worth
 * recording: a BARE cluster has no `public.qr_cart_items` at all, so the guard's count query would
 * ERROR rather than return 0. The column only ever described a MIGRATED scratch cluster. A cell that
 * cannot exist in the environment its column names is the same defect as an unmeasured one.
 *
 * The same run measured `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout`
 * as ALL ZERO on the CLI stack, so zeroing the first two on session A is belt-and-braces against a
 * future image rather than a fix for a live problem — and the fingerprint prints them every run, so
 * the day that changes it will be visible rather than an intermittent red.
 *
 * `usesuper` is not a discriminator in either direction and is now only PRINTED, never asserted.
 * The two that are left are independent of each other: one is about the transport, one about the
 * address, and production fails both.
 *
 * Refuted by measurement, and not to be reintroduced:
 *   · `inet_server_port()` is 5432 on BOTH — `config.toml`'s 54322 is a host-side Docker map that
 *     the container's backend never sees.
 *
 * `<<=` and not `<<`: containment must be inclusive, or a server whose address IS the loopback
 * address (`::1 << ::1/128` is FALSE) refuses itself. A NULL address means a unix socket, which is
 * local by definition, so it is coalesced to allowed.
 *
 * The failure direction is the point. If a predicate is ever wrong about a LOCAL stack this REFUSES
 * — loud, and never a silent write into production. A false refusal is visible; a silent commit into
 * the live database would not be. The fingerprint is printed on EVERY run, not only on refusal, so
 * the next person to touch this reads measured values instead of inferring them as I did.
 */
/**
 * Layer 0 — and the ONLY layer that can see a tunnel.
 *
 * Codex round 1, P1, and it is correct: point 127.0.0.1:54322 at an EMPTY remote postgres whose
 * backend has a private address and a plaintext hop, and all three in-DB predicates pass. The
 * harness then commits fixtures, and `--mutants` runs `create or replace function` on it.
 *
 * NO IN-DB PREDICATE CAN FIX THAT. The database cannot know how the client reached it, so every
 * check inside it describes the server, never the route. What CAN see it is PORT EXCLUSIVITY: ask
 * the supabase CLI whether a local stack is running and which port its database is on. If it says
 * 54322, something is already bound there and a tunnel cannot also be — so 127.0.0.1:54322 IS that
 * stack. This is the only interlock here that is a property of the CONNECTION rather than of
 * whatever happens to answer it.
 *
 * The escape hatch is deliberate and narrow: a bare disposable cluster (no supabase CLI, no Docker)
 * is a legitimate way to develop this file, and `M102_ASSUME_DISPOSABLE=1` says "I assert this
 * cluster is mine to destroy". It skips ONLY this check — never the three in-DB ones — and prints
 * loudly. CI never sets it.
 */
function assertNotATunnel() {
  if (process.env.M102_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(
        "  ⚠️  M102_ASSUME_DISPOSABLE=1 — port-exclusivity check SKIPPED (in-DB guards still on)",
      ),
    );
    return;
  }
  const r = spawnSync("supabase", ["status", "-o", "env"], { env: childEnv(), encoding: "utf8" });
  const dbUrl = /DB_URL="?([^"\n]+)"?/.exec(r.stdout || "")?.[1] ?? "";
  const wanted = new URL(DSN);
  let ok = false;
  try {
    const got = new URL(dbUrl);
    ok = r.status === 0 && got.hostname === wanted.hostname && got.port === wanted.port;
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error(
      red(`\n${TAG} REFUSED — could not confirm ${wanted.host} is the local supabase stack.\n`) +
        `  supabase status ${r.status === 0 ? `reported DB_URL=${JSON.stringify(dbUrl)}` : `failed (status=${r.status})`}\n` +
        // Print what it actually said. If a future CLI renames or drops DB_URL this refusal is the
        // first thing anyone sees, and it should diagnose itself rather than send the reader to go
        // and reproduce it — the same reason `q()` names ENOENT instead of printing "undefined".
        `  --- supabase status stdout ---\n${(r.stdout || "<empty>").split("\n").slice(0, 12).join("\n")}\n` +
        `  --- stderr ---\n${(r.stderr || "<empty>").split("\n").slice(0, 4).join("\n")}\n` +
        `  This is the only check that can see a TUNNEL: if the CLI reports a stack on this port,\n` +
        `  nothing else can be bound there. Without it 127.0.0.1:54322 could be forwarded to a\n` +
        `  remote database, and this harness COMMITS rows and (with --mutants) replaces a function.\n` +
        `  Start the stack: supabase start\n` +
        `  Bare disposable cluster on purpose? M102_ASSUME_DISPOSABLE=1 (skips ONLY this check).\n`,
    );
    process.exit(1);
  }
}

function assertLocalOnly() {
  const out = q(`select
      current_user,
      coalesce((select usesuper from pg_user where usename = current_user), false),
      coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), true),
      coalesce(inet_server_addr()::text, '<unix socket>'),
      coalesce(inet_server_addr() is not null and (
               inet_server_addr() <<= inet '127.0.0.0/8'
            or inet_server_addr() <<= inet '10.0.0.0/8'
            or inet_server_addr() <<= inet '172.16.0.0/12'
            or inet_server_addr() <<= inet '192.168.0.0/16'
            or inet_server_addr() <<= inet '::1/128'
            or inet_server_addr() <<= inet 'fc00::/7'
            or inet_server_addr() <<= inet 'fe80::/10'), false),
      -- Cart lines that are NOT this harness's own. A first draft counted ALL qr_cart_items, which
      -- refused correctly on production (245 when measured) but ALSO self-deadlocked: a run killed
      -- before cleanup leaves tagged rows behind, and every later run then refuses forever. Found by
      -- running it, not by reading it: a SIGPIPE from piping the output through head was enough.
      (select count(*) from public.qr_cart_items ci
         join public.qr_carts c on c.id = ci.cart_id
         join public.table_sessions s on s.id = c.session_id
        where s.qr_code not like 'M102-%'),
      current_setting('statement_timeout'),
      current_setting('lock_timeout'),
      current_setting('idle_in_transaction_session_timeout')`);
  const [user, isSuper, isSsl, addr, addrLocal, cartItems, stmtTo, lockTo, idleTo] = out.split("|");
  console.log(
    dim(
      `  server: user=${user} usesuper=${isSuper} ssl=${isSsl} addr=${addr} (private=${addrLocal})\n` +
        `  foreign qr_cart_items=${cartItems}  statement_timeout=${stmtTo} lock_timeout=${lockTo} idle_in_tx=${idleTo}`,
    ),
  );
  const emptyDb = cartItems === "0";
  if (isSsl !== "f" || addrLocal !== "t" || !emptyDb) {
    console.error(
      red(
        `\n${TAG} REFUSED — this harness COMMITS fixture rows and must never touch a hosted database.\n`,
      ) +
        `  ssl=${isSsl} (want f)   addr=${addr} private=${addrLocal} (want t)   qr_cart_items=${cartItems} (want 0)\n` +
        `  The hosted project is ssl=t on a PUBLIC address and holds real cart lines (245 when this\n` +
        `  was measured, none of them M102-tagged); a freshly migrated stack is ssl=f, private, and\n` +
        `  holds none — supabase/seed.sql inserts no qr_cart_items. The count EXCLUDES this\n` +
        `  harness's own tagged rows, so leftovers from a killed run do not lock out the next one.\n` +
        `  Do NOT assert usesuper here — it is f on hosted AND f on the supabase CLI stack.\n` +
        `  Do NOT use inet_server_port() to relax this — it is 5432 on BOTH.\n` +
        `  Do NOT relax this to make a run work. Start the local stack instead: supabase start\n`,
    );
    process.exit(1);
  }
  // Every write in this file — INSERT and DELETE alike — is gated on this having RETURNED. The
  // top-level catch calls cleanup(), so without the latch a THROW in here (a dropped first
  // connection, a statement_timeout, a permission error on pg_stat_ssl) would make the process's
  // first successful database traffic an unguarded, CASCADING delete. Measured: both
  // qr_carts_session_id_fkey and qr_cart_items_cart_id_fkey are ON DELETE CASCADE, so the reach of
  // `delete from table_sessions where qr_code like 'M102-%'` is the transitive closure, not the
  // three tables cleanup() names.
  localVerified = true;
}

/**
 * A long-lived psql session. Statements are written to stdin and completion is detected by echoing a
 * unique marker after each one — psql's own `\echo` lands on stdout in statement order.
 */
class Session {
  constructor(name) {
    this.name = name;
    this.buf = "";
    this.errBuf = "";
    this.seq = 0;
    this.proc = spawn(
      "psql",
      ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`],
      { env: { ...childEnv(), PGAPPNAME: `mms-m102-${name}` }, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.proc.stdout.on("data", (d) => (this.buf += d));
    // psql routes NOTICE and WARNING to stderr exactly like ERROR, and `-q` does not suppress
    // server messages. Latching on ANY stderr byte would turn a `raise notice` left in a migration
    // into a permanent failure for every later statement on this session — and because the failure
    // lands after B has mutated but before it commits, the `finally` would ROLL B BACK, so the fold
    // would land and the harness would die reporting an outcome that never occurred. Keep the raw
    // text for diagnostics; only fatal severities stop the run.
    this.proc.stderr.on("data", (d) => {
      const t = String(d);
      this.errBuf += t;
      if (/^(psql:|ERROR|FATAL|PANIC)/m.test(t)) this.fatal = (this.fatal ?? "") + t;
    });
    this.proc.on("error", (e) => {
      this.fatal = (this.fatal ?? "") + `spawn failed: ${e.message}\n`;
    });
    // A write to an exited psql emits 'error' on the stream; unhandled, that is an uncaught
    // exception rather than a caught throw, so main().catch — and therefore cleanup() — never runs.
    this.proc.stdin.on("error", () => {});
    this.dead = new Promise((res) => this.proc.on("exit", (c) => res(c)));
  }
  /** Send SQL and return everything it printed, once its marker appears. */
  async run(sql) {
    const marker = `__M102_${this.name}_${++this.seq}__`;
    const start = this.buf.length;
    this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
    await this.until(() => this.buf.includes(marker), `${this.name}: ${sql.slice(0, 60)}`);
    return this.buf.slice(start, this.buf.indexOf(marker, start)).trim();
  }
  /** Fire SQL WITHOUT awaiting it — for the statement we expect to block. */
  fire(sql) {
    const marker = `__M102_${this.name}_${++this.seq}__`;
    this.pending = { marker, start: this.buf.length };
    this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
  }
  /** Collect the result of a previously fired statement. */
  async collect() {
    const { marker, start } = this.pending;
    await this.until(() => this.buf.includes(marker), `${this.name}: fired statement`);
    this.pending = null;
    return this.buf.slice(start, this.buf.indexOf(marker, start)).trim();
  }
  async until(pred, what, ms = 20000) {
    const t0 = Date.now();
    for (;;) {
      if (pred()) return;
      if (this.fatal) throw new Error(`${this.name} psql error:\n${this.fatal}`);
      if (Date.now() - t0 > ms) throw new Error(`${TAG} TIMEOUT waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  async close() {
    this.proc.stdin.end();
    await this.dead;
  }
}

/**
 * Wait until A's backend is blocked BY B's backend, using `pg_blocking_pids` — not a sleep, and not a
 * lock-signature heuristic.
 *
 * ⚠️ Do NOT read a timeout here as "the `for update` is gone". Removing it does not stop A blocking —
 * the bump (`update … where id = v_match`) takes the same row lock one statement later. That is
 * exactly why S7 asserts an OUTCOME rather than liveness. A timeout here means A did not contend
 * with B at all, which is a broken fixture or a guard that vanished entirely.
 */
async function waitBlocked(a, aPid, bPid, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const blockers = q(`select coalesce(array_to_string(pg_blocking_pids(${aPid}), ','), '')`);
    if (blockers.split(",").includes(String(bPid))) return;
    // `fire()` is the one statement whose completion is not funnelled through `until()`, and
    // `until()` is the only place psql's stderr is surfaced. Under ON_ERROR_STOP a raising RPC makes
    // psql print the server error and EXIT — the marker never lands, A never appears in
    // pg_blocking_pids, and without this the harness would spin the full timeout and then report
    // "the guard vanished" while the real message sat unread in a.errBuf and was discarded by
    // a.close(). That is the single most likely way this job ever goes red.
    if (a.fatal) {
      throw new Error(`${TAG} session ${a.name} ERRORED instead of blocking:\n${a.fatal}`);
    }
    if (a.proc.exitCode !== null) {
      throw new Error(
        `${TAG} session ${a.name} EXITED (code ${a.proc.exitCode}) instead of blocking — it never ` +
          `reached the statement under test.\n${a.errBuf || "<no output>"}`,
      );
    }
    if (Date.now() - t0 > ms) {
      throw new Error(
        `${TAG} TIMEOUT — session A never blocked on session B.\n` +
          `  That means the merge did NOT wait where this harness expects it to.\n` +
          `  On S1-S6 that means the guarded DELETE no longer contends with the source row — the\n` +
          `  guard itself going missing. On S7 it means neither the match's \`for update\` NOR the\n` +
          `  bump contends with the target, which no single edit produces. Either way: do not\n` +
          `  "fix" it by loosening this poll.`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const P = 300; // the real applied Balachaung price, before the edit
const P2 = 1000; // …and after it ($3.00 -> $10.00)

// The two lines carry DIFFERENT quantities, and that is load-bearing rather than incidental.
//
// The first version of this harness gave both lines qty 1, and every expected number collapsed onto
// the same value: a fold returns `v_moved := v_moved + r.qty`, so "1" could not tell `r.qty` from a
// hardcoded 1, and the re-parent's read-back qty could not be told from the cursor's stale one —
// which is precisely the defect M97's Codex round 2 found in the function itself ("v_moved counted
// the snapshot, not the move"). A fixture on which two code paths produce identical numbers proves
// neither. 3 and 1 separate them: a fold returns 3, and S1's re-parent returns the row's CURRENT 2.
const SRC_QTY = 3;
const TGT_QTY = 1;

/** Commit one fixture pair. Returns the ids. Everything is tagged M102- so cleanup can be exact. */
function fixture(n) {
  const out = q(`
    with s as (
      insert into public.table_sessions (qr_code, mode, status, host_seat)
      values ('M102-S${n}', 'dinein', 'active', null), ('M102-T${n}', 'dinein', 'active', null)
      returning id, qr_code
    ), c as (
      insert into public.qr_carts (session_id) select id from s returning id, session_id
    ), j as (
      select c.id as cart_id, s.qr_code from c join s on s.id = c.session_id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
      select j.cart_id, 'M102-dish', 'Balachaung',
             case when j.qr_code = 'M102-S${n}' then ${SRC_QTY} else ${TGT_QTY} end,
             ${P}, 32, null, 'dinein'
      from j
      returning id, cart_id
    )
    select (select cart_id from j where qr_code = 'M102-S${n}'),
           (select cart_id from j where qr_code = 'M102-T${n}'),
           (select i.id from i where i.cart_id = (select cart_id from j where qr_code = 'M102-S${n}')),
           (select i.id from i where i.cart_id = (select cart_id from j where qr_code = 'M102-T${n}'))`);
  const [srcCart, tgtCart, srcLine, tgtLine] = out.split("|");
  // Source and target are resolved through the qr_code, NOT by ordering on the generated uuid as the
  // first draft did — `order by id` on a `gen_random_uuid()` primary key picks an ARBITRARY cart, so
  // the `-S`/`-T` names were decorative and the two roles could swap between runs. They carry
  // different quantities now, so that is no longer harmless.
  if (!srcCart || !tgtCart || !srcLine || !tgtLine || srcCart === tgtCart) {
    throw new Error(`${TAG} fixture ${n} did not resolve: ${JSON.stringify(out)}`);
  }
  return { srcCart, tgtCart, srcLine, tgtLine };
}

/**
 * The fold's predicate list, copied and with the price comparison flipped to `=`, asserting that a
 * fold WOULD have landed. Without this, "the fold refused" is vacuous — a fixture that violates some
 * unrelated predicate refuses for the wrong reason and every assertion below passes.
 *
 * ⚠️ A deliberate COPY that WILL go stale if the fold gains a predicate. Update it in the same commit,
 * exactly as `m98_merge_matches_price_test.sql`'s header instructs.
 *
 * ⚠️⚠️ AN EARLIER VERSION OF THIS COMMENT CLAIMED "it fails safe: a stale copy returns 0 and this
 * aborts". That is EXACTLY INVERTED, and the inversion is the whole hazard. An omitted predicate
 * makes this copy LOOSER than the fold, so it returns 1 and PASSES while the real fold refuses —
 * and every drift mode the sentence above names (the fold GAINING a predicate) is that direction.
 * A copy can only fail safe if it is STRICTER.
 *
 * The consequence is not abstract. If the two fixture lines ever differ on a predicate this copy
 * omits, the match query finds no target, EVERY source line takes the re-parent path — and S1, S2,
 * S3, S4, S5 and S6 all land on exactly their expected numbers by that path, printing `caught`
 * having never once entered the guarded DELETE. Only C0/C1 would go red, and their message names
 * neither the fixture nor the guard. That is why the modifier key and the qty cap are now here: it
 * was missing both, while the anti-degeneracy block it was copied FROM
 * (`m98_merge_matches_price_test.sql`) carries the modifier key.
 */
function assertFoldable(f, scenario) {
  const n = q(`select count(*) from public.qr_cart_items t, public.qr_cart_items s
    where t.cart_id = '${f.tgtCart}' and s.cart_id = '${f.srcCart}'
      and t.by_seat is null
      and t.added_by is not distinct from s.added_by
      and t.fulfillment = s.fulfillment
      and t.notes is null and s.notes is null
      and t.state = s.state and t.state <> 'voided' and not t.comped
      and s.state <> 'voided' and not s.comped
      and t.menu_item_id = s.menu_item_id
      and t.unit_price_cents = s.unit_price_cents
      -- The modifier key, copied verbatim from the fold. Omitting it was NOT harmless: see below.
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb)
        = coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(s.modifiers) e),
                   '[]'::jsonb)
      -- And the cap, which is the other half of the IF that decides whether a fold is attempted.
      and t.qty + s.qty <= 99`);
  if (n !== "1") {
    throw new Error(
      `${TAG} DEGENERATE FIXTURE (${scenario}) — the two lines are not foldable-but-for-the-race ` +
        `(join returned ${n}, expected 1). Whatever this scenario asserts next, it is not measuring ` +
        `the concurrency guard.`,
    );
  }
}

// ── The scenarios ────────────────────────────────────────────────────────────────────────────────
//
// C0/C1 are CONTROLS and they are not optional: both of the originally-proposed scenarios assert the
// guard REFUSES, and a `delete … where id = r.id and false` mutant passes every one of them. The
// controls are the only thing proving the guard still ALLOWS a legitimate fold.
const SCENARIOS = [
  {
    id: "C0",
    control: true,
    mutate: (f) => `select id from public.qr_cart_items where id = '${f.srcLine}' for update`,
    moved: SRC_QTY,
    tgtQty: SRC_QTY + TGT_QTY,
    tgtLines: 1,
    srcLines: 0,
    why: "CONTROL — B locks without writing, so nothing actually changed. The fold MUST still land. Kills `delete … and false` and any permanently-refusing guard.",
  },
  {
    id: "C1",
    control: true,
    mutate: (f) =>
      `update public.qr_cart_items set tax_cents = tax_cents + 1 where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY,
    tgtQty: SRC_QTY + TGT_QTY,
    tgtLines: 1,
    srcLines: 0,
    why: "CONTROL — a column the guard does NOT re-assert changed. The fold must still land, and EvalPlanQual's recheck must PASS. Kills an over-tight guard.",
  },
  {
    id: "S1",
    mutate: (f) => `update public.qr_cart_items set qty = 2 where id = '${f.srcLine}' returning id`,
    moved: 2,
    tgtQty: TGT_QTY + 2,
    tgtLines: 2,
    srcLines: 0,
    movedLineQty: 2,
    why: "qty — drop `and qty = r.qty` and the fold lands on the STALE r.qty: one unit silently destroyed, not charged, not cooked, no error. The RPC value is the only thing that catches a revert of the read-back `v_moved`.",
  },
  {
    id: "S1b",
    mutate: (f) =>
      `update public.qr_cart_items set qty = ${SRC_QTY + 1} where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY + 1,
    tgtQty: TGT_QTY + SRC_QTY + 1,
    tgtLines: 2,
    srcLines: 0,
    movedLineQty: SRC_QTY + 1,
    why: "qty, the OTHER DIRECTION — and the one every document here names as the hazard: a diner tapping `+`. S1 only ever DECREASES, so it is passed by `and qty >= r.qty`, a one-character mis-write that then deletes the source and bumps the target by the STALE r.qty. One unit destroyed, which is verbatim the HIGH M97's review found.",
  },
  {
    id: "S4b",
    mutate: (f) =>
      `update public.qr_cart_items set unit_price_cents = 100 where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY,
    tgtQty: TGT_QTY + SRC_QTY,
    tgtLines: 2,
    srcLines: 0,
    why: "price, the OTHER DIRECTION. S4 only ever RAISES, so `and unit_price_cents <= r.unit_price_cents` survives it. Same family, same one-character shape.",
  },
  {
    id: "S2",
    mutate: (f) =>
      `update public.qr_cart_items set state = 'voided' where id = '${f.srcLine}' returning id`,
    moved: 0,
    tgtQty: TGT_QTY,
    tgtLines: 1,
    srcLines: 1,
    why: "state — and the eligibility half: a voided line must be LEFT ON THE SOURCE, stranded on the cancelled cart where its own audit lives, never carried into the target.",
  },
  {
    id: "S3",
    mutate: (f) =>
      `update public.qr_cart_items set comped = true where id = '${f.srcLine}' returning id`,
    moved: 0,
    tgtQty: TGT_QTY,
    tgtLines: 1,
    srcLines: 1,
    why: "comped — separates the `comped` half of both guards from the `state` half, which S2 alone would conflate.",
  },
  {
    id: "S4",
    mutate: (f) =>
      `update public.qr_cart_items set unit_price_cents = ${P2} where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY,
    tgtQty: TGT_QTY + SRC_QTY,
    tgtLines: 2,
    srcLines: 0,
    why: "THE BRANCH M102 EXISTS FOR — M98's own header calls this one 'reasoned-correct, UNPROVEN'. Drop the predicate and both units are charged at one price: uncapped error, plus tax, plus the tip riding it.",
  },
  {
    id: "S5",
    mutate: (f) =>
      `update public.qr_cart_items set fulfillment = 'togo' where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY,
    tgtQty: TGT_QTY + SRC_QTY,
    tgtLines: 2,
    srcLines: 0,
    why: "fulfillment — M97's defect back through the door: a now-to-go row folded into a dine-in target, wrong tax on the cold categories.",
  },
  {
    id: "S6",
    mutate: (f) =>
      `update public.qr_cart_items set notes = 'no chili' where id = '${f.srcLine}' returning id`,
    moved: SRC_QTY,
    tgtQty: TGT_QTY + SRC_QTY,
    tgtLines: 2,
    srcLines: 0,
    why: "notes — the fold would apply or erase a kitchen note onto units it does not belong to.",
  },
];

async function runScenario(s) {
  const f = fixture(s.id);
  assertFoldable(f, s.id);

  const b = new Session(`b-${s.id}`);
  const a = new Session(`a-${s.id}`);
  try {
    const bPid = await b.run("select pg_backend_pid();");
    const aPid = await a.run("select pg_backend_pid();");
    // A is SUPPOSED to block indefinitely; this harness's own poll is the real bound. A server-side
    // `lock_timeout` would cancel it the moment the poll's per-iteration psql spawn takes longer,
    // which is latency-dependent and would surface as an intermittent red on a blocking CI job with
    // the wrong root cause. The fingerprint printed above records what the server actually had.
    await a.run("set lock_timeout = 0; set statement_timeout = 0;");
    await b.run("begin; set local idle_in_transaction_session_timeout = '60s';");

    // B mutates (or merely locks) the SOURCE row and holds the transaction open. The row count is
    // asserted, because a mutation that matched nothing would make A never block and the failure
    // would surface as a confusing timeout rather than as "the fixture was wrong".
    const hit = (await b.run(`${s.mutate(f)};`))
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .pop();
    if (hit !== f.srcLine) {
      throw new Error(
        `${TAG} ${s.id}: B's statement did not touch the source row — it returned ` +
          `${JSON.stringify(hit)}, expected ${f.srcLine}. Every mutate ends in \`returning id\` so ` +
          `this is proved by IDENTITY, not by a row count: a mutation that matched nothing would ` +
          `leave A unblocked and surface as a confusing timeout instead of as "the fixture was wrong".`,
      );
    }

    // A now runs the merge. It will block at the guarded DELETE, on B's row lock.
    a.fire(`select public.mms_merge_table_orders('${f.srcCart}', '${f.tgtCart}');`);
    await waitBlocked(a, aPid, bPid);

    await b.run("commit;");
    const moved = (await a.collect()).split("\n").pop().trim();

    const tgtLines = q(`select count(*) from public.qr_cart_items where cart_id = '${f.tgtCart}'`);
    const tgtQty = q(
      `select coalesce(sum(qty), 0) from public.qr_cart_items where cart_id = '${f.tgtCart}'`,
    );
    const srcLines = q(`select count(*) from public.qr_cart_items where cart_id = '${f.srcCart}'`);

    const label = `${s.id}${s.control ? " (control)" : ""}`;
    const ok =
      [
        check(`${label} RPC moved`, moved, s.moved),
        check(`${label} target lines`, tgtLines, s.tgtLines),
        check(`${label} target units`, tgtQty, s.tgtQty),
        check(`${label} source lines`, srcLines, s.srcLines),
        // Postconditions, asserted on EVERY scenario because the merge's trailing statements run
        // unconditionally. Nothing here read outside the two carts' line rows until now, so a
        // refactor dropping either of these was invisible to the whole battery — two open carts
        // for one set of lines, and a table session that never closes.
        check(
          `${label} source cart cancelled`,
          q(`select status from public.qr_carts where id = '${f.srcCart}'`),
          "cancelled",
        ),
        check(
          `${label} source session closed`,
          q(`select s.status from public.table_sessions s
               join public.qr_carts c on c.session_id = s.id where c.id = '${f.srcCart}'`),
          "closed",
        ),
      ].every(Boolean) &&
      (s.movedLineQty === undefined ||
        check(
          `${label} the moved line kept its CURRENT qty, not the cursor's stale ${SRC_QTY}`,
          q(`select qty from public.qr_cart_items where id = '${f.srcLine}'`),
          s.movedLineQty,
        ));

    console.log(`  ${ok ? green("caught") : red("FAILED")} ${label} — ${s.why}`);
  } finally {
    await b.close();
    await a.close();
  }
}

/**
 * S7 — THE TARGET CHANGED UNDER THE MATCH, and the `for update` that holds it.
 *
 * ⚠️ This scenario replaces a LIVENESS-ONLY version that proved nothing, and the mutation battery is
 * what caught it. The first draft had B merely LOCK the target row and asserted only that the fold
 * still landed; its comment claimed "remove the `for update` and this times out rather than
 * returning a wrong number". Removing it does NOT time out. `pg_blocking_pids` still sees the edge,
 * because the very next statement — `update … set qty = v_match_qty + r.qty where id = v_match` —
 * takes the same row lock a moment later. So A blocks either way, the fold lands either way, and the
 * mutant SURVIVED. A scenario whose only assertion is "something blocked" cannot tell WHERE.
 *
 * So B now MUTATES the target instead of merely holding it, which separates the two:
 *
 *   · WITH `for update` — the match query blocks on B, and when B commits, READ COMMITTED re-evaluates
 *     the query's WHERE against the NEW row version. The target is now $10.00, `t.unit_price_cents =
 *     r.unit_price_cents` no longer holds, and the row is SKIPPED: no match, so the source re-parents
 *     as its own line and keeps the price it was quoted.
 *   · WITHOUT it — the match reads the pre-B snapshot, matches the $3.00 target, deletes the source,
 *     and only THEN blocks on the bump. The fold lands into a line that is now priced $10.00, so
 *     ${SRC_QTY} units quoted at $3.00 are silently re-priced. That is M98's defect arriving through
 *     the other door: not a stale SOURCE, but a stale TARGET.
 *
 * The assertion that separates them is therefore about MONEY, not about liveness: how many units sit
 * on the target cart still priced at what they were quoted.
 */
async function runS7() {
  const f = fixture("S7");
  assertFoldable(f, "S7");
  const b = new Session("b-S7");
  const a = new Session("a-S7");
  try {
    const bPid = await b.run("select pg_backend_pid();");
    const aPid = await a.run("select pg_backend_pid();");
    // A is SUPPOSED to block indefinitely; this harness's own poll is the real bound. A server-side
    // `lock_timeout` would cancel it the moment the poll's per-iteration psql spawn takes longer,
    // which is latency-dependent and would surface as an intermittent red on a blocking CI job with
    // the wrong root cause. The fingerprint printed above records what the server actually had.
    await a.run("set lock_timeout = 0; set statement_timeout = 0;");
    await b.run("begin; set local idle_in_transaction_session_timeout = '60s';");
    const hit = (
      await b.run(
        `update public.qr_cart_items set unit_price_cents = ${P2} where id = '${f.tgtLine}' returning id;`,
      )
    )
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .pop();
    if (hit !== f.tgtLine) {
      throw new Error(
        `${TAG} S7: B did not touch the TARGET row (returned ${JSON.stringify(hit)})`,
      );
    }

    a.fire(`select public.mms_merge_table_orders('${f.srcCart}', '${f.tgtCart}');`);
    await waitBlocked(a, aPid, bPid);
    await b.run("commit;");
    const moved = (await a.collect()).split("\n").pop().trim();

    const ok = [
      check("S7 RPC moved", moved, SRC_QTY),
      check(
        "S7 target lines",
        q(`select count(*) from public.qr_cart_items where cart_id = '${f.tgtCart}'`),
        2,
      ),
      // The one that actually separates the two behaviours: the moved units must still be priced at
      // what they were quoted. Drop the `for update` and this is 0 — they were folded into the
      // re-priced line.
      check(
        `S7 units still priced at the ${P}¢ they were quoted`,
        q(
          `select coalesce(sum(qty), 0) from public.qr_cart_items
             where cart_id = '${f.tgtCart}' and unit_price_cents = ${P}`,
        ),
        SRC_QTY,
      ),
      check(
        "S7 source lines",
        q(`select count(*) from public.qr_cart_items where cart_id = '${f.srcCart}'`),
        0,
      ),
    ].every(Boolean);
    console.log(
      `  ${ok ? green("caught") : red("FAILED")} S7 — the TARGET changed under the match: the fold must refuse and the source must re-parent at its own price, not be folded into the re-priced line.`,
    );
  } finally {
    await b.close();
    await a.close();
  }
}

function cleanup() {
  if (!localVerified) {
    console.error(
      red(`${TAG} cleanup SKIPPED — assertLocalOnly() never returned, so nothing here may write.`),
    );
    return;
  }
  // Never `truncate`, never an unqualified delete — every statement is keyed to this harness's own
  // tag, so even a total failure of the guards above cannot widen the blast radius.
  q(`delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
       where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like 'M102-%'`);
  q(`delete from public.qr_carts c using public.table_sessions s
       where c.session_id = s.id and s.qr_code like 'M102-%'`);
  q(`delete from public.table_sessions where qr_code like 'M102-%'`);
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
//
// `pnpm verify:merge-race --mutants`. Nine scenarios that all pass prove nothing on their own: the
// question is whether any of them can FAIL. This file's own history is the argument — two
// assertion-quality defects were found ONLY by mutating the function and watching what happened, and
// neither is detectable from inside a green run:
//
//   · S7 asserted liveness only, and its mutant SURVIVED. Removing the match query's `for update`
//     does not stop A blocking; the bump takes the same row lock one statement later.
//   · The fixture was DEGENERATE — both lines qty 1, so a fold's `v_moved += r.qty` could not be
//     told from a literal 1, nor from the re-parent's read-back qty.
//
// It mutates the LIVE function (`pg_get_functiondef`), not a migration file, so it does not care
// which migration last defined it. Every mutant asserts four things, because a battery that only
// checks "did the run go red" is as credulous as the suite it is auditing — the first ad-hoc version
// of this reported a SURVIVOR that was really a malformed `sed` leaving a syntax error, so the
// mutant never applied and the harness ran against the UNMUTATED function:
//
//   1. the pattern still matches exactly one line (a STALE mutant is a failure, never a skip)
//   2. the apply SUCCEEDED (exit 0)
//   3. `md5(prosrc)` actually CHANGED
//   4. the named scenarios went red — and, for a targeted mutant, the CONTROLS stayed green
//
// then restores and asserts the body is byte-identical again.
const MUTANTS = [
  {
    id: "delete-drops-price",
    expect: ["S4"],
    find: /^\s*and unit_price_cents = r\.unit_price_cents\b/,
    to: null,
    why: "M98's price re-assertion — the branch M98's own header called reasoned-correct and UNPROVEN",
  },
  {
    id: "delete-drops-qty",
    expect: ["S1"],
    find: /^\s*and qty = r\.qty\s*$/,
    to: null,
    why: "M97's qty re-assertion — without it a concurrent + silently destroys a unit",
  },
  {
    id: "delete-qty-loosened",
    expect: ["S1b"],
    find: /^\s*and qty = r\.qty\s*$/,
    to: "          and qty >= r.qty",
    why: "the inequality family — survives S1's decrease, dies only on S1b's increase. The repo already states this rule in m98_merge_matches_price_test.sql: an inequality mis-write survives one direction and dies in the other, so BOTH are needed.",
  },
  {
    id: "delete-price-loosened",
    expect: ["S4b"],
    find: /^\s*and unit_price_cents = r\.unit_price_cents\b/,
    to: "          and unit_price_cents <= r.unit_price_cents",
    why: "the same family on price — survives S4's raise, dies only on S4b's drop.",
  },
  {
    id: "delete-overtight-taxcents",
    expect: ["C1"],
    controlsExpected: true,
    find: /^\s*and not comped;\s*$/,
    to: "          and not comped and tax_cents = 32;",
    why: "an OVER-tight guard, and the only mutant that separates C1 from C0: C1 bumps tax_cents so the recheck must fail, while C0 (lock only, no new tuple version) still folds. Without it the two controls have identical expectations and C1 strictly subsumes C0. It compares against the fixture's literal 32 rather than `r.tax_cents` because tax_cents is NOT in the loop's cursor — the record-field version applied cleanly and then errored at runtime, which the battery reported as MISDIRECTED rather than caught.",
  },
  {
    id: "drops-source-cart-cancel",
    expect: ["C0"],
    controlsExpected: true,
    find: /^\s*update public\.qr_carts set status = 'cancelled' where id = p_source_cart;\s*$/,
    to: "",
    why: "a POSTCONDITION rather than a guard: without it the merge leaves two open carts for one set of lines. No scenario asserted it until the postcondition checks were added, so every mutation of the merge's trailing statements was invisible.",
  },
  {
    id: "delete-drops-fulfillment",
    expect: ["S5"],
    find: /^\s*and fulfillment = r\.fulfillment\s*$/,
    to: null,
    why: "M97's tag re-assertion — wrong tax on the cold categories",
  },
  {
    id: "delete-drops-state",
    expect: ["S2"],
    find: /^\s*and state = r\.state\s*$/,
    to: null,
    why: "the state re-assertion — a concurrently voided line folded into the target",
  },
  {
    id: "delete-drops-notes",
    expect: ["S6"],
    find: /^\s*and notes is null\s*$/,
    to: null,
    why: "the notes re-assertion — a kitchen note applied to units it does not belong to",
  },
  {
    id: "delete-drops-comped",
    expect: ["S3"],
    find: /^\s*and not comped;\s*$/,
    to: "          ;",
    why: "the comped re-assertion — separates `comped` from `state`, which S2 alone would conflate",
  },
  {
    id: "delete-never-matches",
    expect: ["C0", "C1"],
    controlsExpected: true,
    find: /^\s*and not comped;\s*$/,
    to: "          and not comped and false;",
    why: "THE CONTROLS' REASON TO EXIST — a permanently-refusing guard passes every S1-S6 assertion",
  },
  {
    id: "match-drops-for-update",
    expect: ["S7"],
    find: /^\s*for update;/,
    to: "      ;",
    why: "the target lock — without it the match reads a stale snapshot and folds into a re-priced line",
  },
  {
    id: "reparent-drops-eligibility",
    expect: ["S2", "S3"],
    find: /^\s*where id = r\.id and state <> 'voided' and not comped\s*$/,
    to: "        where id = r.id",
    why: "M97/Codex-P2 — a voided or comped line re-parented into the target anyway",
  },
  {
    id: "vmoved-counts-stale-qty",
    expect: ["S1"],
    find: /^\s*if found then v_moved := v_moved \+ v_moved_qty; end if;\s*$/,
    to: "      if found then v_moved := v_moved + r.qty; end if;",
    why: "M97/Codex-P3 — v_moved reporting the cursor's snapshot rather than what actually moved",
  },
];

/** Run one statement through psql's stdin (the function body is far too big for `-c`). */
function exec(sql) {
  const r = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`, "-f", "-"], {
    env: { ...childEnv(), PGAPPNAME: "mms-m102-mutate" },
    encoding: "utf8",
    input: sql,
  });
  return { ok: r.status === 0, err: (r.stderr || "").trim().split("\n")[0] || "" };
}

const FNDEF = `select pg_get_functiondef(p.oid) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mms_merge_table_orders'`;
const BODY_MD5 = `select md5(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mms_merge_table_orders'`;

/** Replace or delete the ONE line matching `re`. Returns null if it matches zero or many lines. */
function transformLine(src, re, to) {
  const lines = src.split("\n");
  const hits = lines.reduce((a, l, i) => (re.test(l) ? [...a, i] : a), []);
  if (hits.length !== 1) return null;
  if (to === null) lines.splice(hits[0], 1);
  else lines[hits[0]] = to;
  return lines.join("\n");
}

/**
 * One child harness run. It inherits the advisory lock the battery already holds, so it must not
 * try to take it itself. Strips ANSI, because `✗` is emitted wrapped in colour codes and a naive
 * /✗\s+(\w+)/ matches NOTHING — every mutant then reports "expected S4, saw none", which is broken
 * in the direction of reporting failure, at least the safe one.
 */
function childRun() {
  const child = spawnSync(process.execPath, [process.argv[1]], {
    encoding: "utf8",
    env: { ...process.env, M102_LOCK_HELD_BY_PARENT: "1" },
  });
  return {
    status: child.status,
    out: ((child.stdout || "") + (child.stderr || "")).replace(/\x1b\[[0-9;]*m/g, ""),
  };
}

function runMutants() {
  const original = q(FNDEF);
  const baseline = q(BODY_MD5);
  console.log(`\n${TAG} mutation battery — ${MUTANTS.length} mutants against the LIVE function\n`);

  // A GREEN BASELINE FIRST (Codex round 1, P2). Without it a scenario that is ALREADY failing — a
  // drifted fixture, a half-applied migration, someone's leftover mutant — gets credited to
  // whichever mutant happens to name it, and the battery reports `caught` for a failure it did not
  // cause. Leaning on the preceding CI step is not enough: `--mutants` can be run on its own.
  const base = childRun();
  if (base.status !== 0) {
    console.error(
      red(`${TAG} REFUSED — the UNMUTATED function does not pass every scenario.\n`) +
        `  Every "caught" below would credit a mutant for a failure that already existed.\n` +
        `  Fix the baseline first:\n\n${base.out.split("\n").slice(-25).join("\n")}\n`,
    );
    process.exit(1);
  }
  console.log(
    `  ${green("baseline")} ${dim(`unmutated function passes all ${SCENARIOS.length + 1} scenarios`)}`,
  );

  let bad = 0;

  for (const m of MUTANTS) {
    const mutated = transformLine(original, m.find, m.to);
    if (mutated === null) {
      console.log(`  ${red("STALE")} ${m.id} — pattern matched zero or many lines. A stale mutant is
        a FAILURE, not a skip: the rule it guards may have moved or vanished.`);
      bad++;
      continue;
    }
    const applied = exec(mutated);
    if (!applied.ok) {
      console.log(`  ${red("BROKEN")} ${m.id} — mutant did not apply: ${applied.err}`);
      bad++;
      exec(original);
      continue;
    }
    if (q(BODY_MD5) === baseline) {
      console.log(`  ${red("INERT")} ${m.id} — applied but the body is unchanged; it would be a
        FALSE survivor.`);
      bad++;
      exec(original);
      continue;
    }

    // From here the mutant is LIVE, so every exit runs the restore (Codex round 1, P2). Restoring
    // only at the bottom of the loop meant a throw in between — a transient q(BODY_MD5), a killed
    // child — reached the top-level catch and left a developer's persistent stack running a mutated
    // money function. `process.on("exit")` covers the paths a `finally` cannot: an uncaught throw
    // that skips it, and process.exit() called from inside.
    let live = true;
    const restoreNow = () => {
      if (!live) return;
      live = false;
      exec(original);
    };
    process.once("exit", restoreNow);
    // 'exit' does NOT fire on a signal with no listener — Node terminates directly — so Ctrl-C
    // during a mutant would leave the money function mutated on a persistent local stack.
    process.once("SIGINT", restoreNow);
    process.once("SIGTERM", restoreNow);
    try {
      const child = childRun();
      const out = child.out;
      const failing = new Set(
        // `[CS]\d[a-z]?` — the trailing letter matters: S1b and S4b exist precisely because they are
        // the OTHER direction of S1 and S4, and a `/^[CS]\d$/` parser silently drops them, so their
        // mutants reported "expected S1b, saw none" while the scenario had failed correctly.
        [...out.matchAll(/✗\s+(\w+)/g)].map((x) => x[1]).filter((x) => /^[CS]\d[a-z]?$/.test(x)),
      );
      const missed = m.expect.filter((e) => !failing.has(e));
      const controlsFired = ["C0", "C1"].filter((c) => failing.has(c));
      const controlLeak = !m.controlsExpected && controlsFired.length > 0;

      if (child.status === 0) {
        console.log(`  ${red("SURVIVED")} ${m.id} — the harness stayed GREEN. ${m.why}`);
        bad++;
      } else if (missed.length) {
        console.log(
          `  ${red("MISDIRECTED")} ${m.id} — expected ${m.expect.join("+")} to fail, saw ` +
            `${[...failing].join("+") || "none"}. Missing: ${missed.join("+")}`,
        );
        bad++;
      } else if (controlLeak) {
        // A mutant that also reddens the controls is not targeted: it proves "something broke", which
        // is exactly the undiscriminating signal the controls exist to rule out.
        console.log(
          `  ${red("UNTARGETED")} ${m.id} — killed ${m.expect.join("+")} but also the CONTROLS ` +
            `(${controlsFired.join("+")}), so it does not isolate the rule it names.`,
        );
        bad++;
      } else {
        console.log(`  ${green("caught")} ${m.id} ${dim(`by ${[...failing].sort().join(", ")}`)}`);
      }
    } finally {
      restoreNow();
      process.removeListener("exit", restoreNow);
      process.removeListener("SIGINT", restoreNow);
      process.removeListener("SIGTERM", restoreNow);
    }

    const md5Now = q(BODY_MD5);
    if (md5Now !== baseline) {
      console.error(
        red(`\n${TAG} FATAL — could not restore mms_merge_table_orders after ${m.id}.`) +
          `\n  md5 now ${md5Now}, baseline ${baseline}. Re-apply supabase/migrations and re-run.\n`,
      );
      process.exit(1);
    }
  }

  if (bad) {
    console.log(red(`\n✗ verify:merge-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
    process.exit(1);
  }
  console.log(
    green(`\n✓ all ${MUTANTS.length} mutants caught, function restored byte-identical\n`),
  );
}

async function main() {
  const mutantMode = process.argv.includes("--mutants");
  assertNotATunnel();
  assertLocalOnly();

  // The function is VOLATILE by OMISSION of a marker rather than by intent, and each SPI statement
  // therefore gets a fresh snapshot — which is what lets the guarded DELETE see B's commit.
  //
  // ⚠️ THIS CHECK IS A DIAGNOSTICS GUARD, NOT A SILENT-GREEN GUARD, and an earlier version of this
  // comment said the opposite: "mark it STABLE and every scenario would go green having proved
  // nothing". Measured, that is impossible — plpgsql runs SPI read-only for a non-VOLATILE function,
  // so the merge aborts at its FIRST statement:
  //
  //     ERROR:  SELECT FOR UPDATE is not allowed in a non-volatile function
  //     CONTEXT:  SQL statement "SELECT 1 from public.qr_carts ... order by id for update"
  //
  // It would go loudly RED, not silently green. The assertion is kept because it is cheap and turns
  // a confusing mid-run psql error into a named refusal — but the reason is now the measured one.
  // (Another reasoned mechanism written in the language of an observation, in the file whose header
  // spends fifteen lines retracting exactly that mistake about `usesuper`.)
  const vol = q(`select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'mms_merge_table_orders'`);
  if (vol !== "v") {
    console.error(
      red(
        `${TAG} WRONG VOLATILITY — mms_merge_table_orders is provolatile='${vol}', expected 'v'.`,
      ) +
        `\n  plpgsql runs SPI read-only for a non-VOLATILE function, so the merge would abort at its\n` +
        `  FIRST statement with "SELECT FOR UPDATE is not allowed in a non-volatile function" rather\n` +
        `  than reaching any guard. Refusing here names the cause instead of leaving a psql error\n` +
        `  mid-run for the reader to diagnose.\n`,
    );
    process.exit(1);
  }

  // MUTUAL EXCLUSION — and it must cover MUTATION MODE, which is strictly more dangerous than the
  // scenario run (Codex round 1, P2). The `--mutants` branch used to return before this, so two
  // batteries could interleave: the second captures the FIRST's active mutant as its `original` and
  // later "restores" that mutant after the first has restored the real body. Both check byte
  // identity only against their own baseline, so both report success and the stack is left running
  // a mutated money function. The fixtures are COMMITTED and cleanup is a `like 'M102-%'` sweep, so two
  // overlapping runs against one stack delete each other's rows mid-flight — and the damage is not
  // a clean failure: depending on timing a scenario either reports a mismatch that never happened
  // or PASSES for the wrong reason. A concurrency harness that is not itself concurrency-safe can
  // report a guard as proven when it never ran. A session-level advisory lock dies with the
  // connection, so a SIGKILL cannot leave it stuck.
  const guard = new Session("guard");
  const lockHeldByParent = process.env.M102_LOCK_HELD_BY_PARENT === "1";
  if (
    !lockHeldByParent &&
    (await guard.run(`select pg_try_advisory_lock(hashtext('m102-merge-race'));`)).trim() !== "t"
  ) {
    console.error(
      red(`\n${TAG} REFUSED — another merge-race run holds the advisory lock on this database.\n`) +
        `  Two runs would delete each other's committed fixtures. Wait for the other one to finish.\n`,
    );
    await guard.close();
    process.exit(1);
  }

  // The battery's child harness runs inherit the lock the parent already holds, so they must not
  // try to take it themselves — every child would refuse.
  if (mutantMode) {
    try {
      runMutants();
    } finally {
      await guard.close();
    }
    return;
  }

  console.log(`\n${TAG} — the merge's concurrency guard, against a real second session\n`);

  try {
    cleanup(); // in case a previous run died mid-flight
    for (const s of SCENARIOS) await runScenario(s);
    await runS7();
  } finally {
    cleanup();
    await guard.close();
  }

  const left = q(`select count(*) from public.table_sessions where qr_code like 'M102-%'`);
  if (left !== "0") {
    console.log(red(`\n✗ cleanup left ${left} M102 sessions behind`));
    failures++;
  }

  if (failures) {
    console.log(red(`\n✗ verify:merge-race — ${failures} assertion(s) failed\n`));
    process.exit(1);
  }
  console.log(
    green(
      `\n✓ verify:merge-race passed — ${SCENARIOS.length + 1} scenarios, guard exercised under a real race\n`,
    ),
  );
  console.log(
    dim(
      "  (S1-S6 prove the source guard refuses, S1b/S4b the OTHER direction of the two numeric ones;\n" +
        "   C0/C1 prove it still allows; S7 covers the target; every scenario checks the merge's\n" +
        "   postconditions on the source cart and session.)\n",
    ),
  );
}

main().catch((e) => {
  console.error(red(`\n${e.message}\n`));
  try {
    cleanup();
  } catch {
    /* the run already failed; a cleanup failure must not mask it */
  }
  process.exit(1);
});
