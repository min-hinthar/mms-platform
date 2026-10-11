#!/usr/bin/env node
/**
 * Phase 2f · P2v — the two-session harness for the counter fire's locks: against the name clear
 * (the cart row) and against the expired-session sweeper (the session row).
 *
 * `20261001000000_p2f_counter_cook_before_paid.sql` lets staff send a `reg-` counter order to the
 * kitchen before it is paid, and only with a name on it (owner decision 7c): the name is the only
 * pre-payment identity, so `mms_clear_cart_name` refuses (`keep_name`) once food is in, and
 * `mms_fire_counter_cart` fires nothing (`named = false`) while the name is blank. Each decides
 * under the SAME lock — the `qr_carts` row `FOR UPDATE`, taken first — so a clear and a fire on one
 * cart are ordered and neither can act on the other's stale read.
 *
 * The cron sweeper (`mms_sweep_expired_sessions`) closes expired sessions and exempts a `reg-` order
 * with SENT food. The fire takes the `table_sessions` row `FOR SHARE` after the cart; the sweeper
 * LOCKS its candidates (`FOR NO KEY UPDATE SKIP LOCKED`) and only then decides the exemption in a
 * second statement, with a fresh snapshot. Without both halves a Send overlapping the sweep leaves
 * fired, unpaid food on a CLOSED session — off the KDS, the lane, every settle and the no-show
 * (Phase 2f blind review, C1).
 *
 * Delete any of those locks and every single-session case still passes:
 * `supabase/tests/p2f_counter_cook_before_paid_test.sql` runs in one transaction, where nothing
 * interleaves. `verify-mode-authority.mjs` lists the deletions as documented SURVIVORS for exactly
 * that reason; this is the second session that kills them.
 *
 * WHAT THIS PROVES, and no more: the nineteen orderings below, on one cart (two, for the merge). The
 * no-show, the undo and a settle claim take the same cart-row lock, but no scenario here interleaves
 * THEM — those orderings are argued from construction and pinned single-session (P2F.15e, P2F.18),
 * not proven here. The no-show IS interleaved with a void, a request (h, h2) and a kitchen Start (j).
 * The `order by id` on every whole-cart lines lock (and `mms_bump_ticket`'s pre-lock) is deadlock
 * AVOIDANCE between a bump and a no-show/Clear/merge; no order here drives that pair.
 *
 * ── The orders ──────────────────────────────────────────────────────────────────────────────
 *
 *   (a) clear-first — B clears the name inside an open transaction ('ok'); A's fire must BLOCK on B
 *       (read from `pg_blocking_pids`, never a sleep). Once B commits, A must answer `0|false` (nothing
 *       fired, not named) and the line must still be a draft. Without the fire's lock A reads the
 *       still-committed name, fires the bag, and B then strips the name off food that is cooking.
 *   (b) fire-first — A fires inside an open transaction (`1|true`); B's clear must BLOCK on A. Once A
 *       commits, B must answer 'keep_name' and the name must be unchanged. Without the clear's lock
 *       B's sent-food check reads A's uncommitted lines as drafts and clears the name of an order
 *       the kitchen is now making.
 *   (c) sweep-first — A opens its transaction while the session is still live (its `now()` is
 *       pinned before expiry), the session expires, S sweeps it closed inside an open transaction;
 *       A's fire must BLOCK on S. Once S commits, A must answer `0|true` (nothing fired,
 *       closed) and the line must still be a draft on a closed session. Without the fire's session
 *       lock A's UPDATE reads the still-active session through its own snapshot and fires food onto
 *       the session S is closing.
 *   (d) fire-first — A fires inside an open transaction while the session is live; the session
 *       expires; S sweeps and must NOT wait (SKIP LOCKED) and must not close it; A commits, and a
 *       second sweep must leave it active too (the committed SENT line exempts it). Without the
 *       fire's session lock, or with the sweeper deciding in the same statement that locks, S reads
 *       A's uncommitted lines as drafts and closes a session the kitchen is now cooking for.
 *
 *   Codex r2 on #308 moved the table Clear's counter half into `mms_clear_counter_cart` (the SENT
 *   check and the cancel, one call, the cart row then the lines locked FOR UPDATE). Two more orders:
 *   (e) kitchen-fire-before-clear — A runs the kitchen's draft→fired edge (`mms_line_transition`,
 *       which stamps fire_at = now(): due at once, and locks only the LINE) inside an open
 *       transaction; B's clear must BLOCK on A and, once A commits, answer 'sent' with the cart still
 *       open. Without the lines' lock B reads the draft, cancels, and due food vanishes from the KDS.
 *   (f) settle-before-clear — A takes the cart row and flips it to paid (a settle's claim) inside an
 *       open transaction; B's clear must BLOCK and, once A commits, answer 'not_open'. Without the
 *       cart lock B decides from a snapshot older than the settle and reports a cancel it never made.
 *
 *   Codex r3 on #308 moved the merge's counter refusal into `mms_merge_table_orders` (after its cart
 *   lock, with the source's approvals and lines locked) and gave `mms_void_line` /
 *   `mms_request_approval` the cart row FOR SHARE before the line. Four more orders:
 *   (g) send-before-merge — A's transaction starts, its 10s grace is waited out ON THE DB CLOCK, then
 *       A Sends inside it (the stamped deadline is already past, so the food is DUE the moment A
 *       commits); B merges the counter order into a diner's pickup and must BLOCK on A, then answer
 *       -1 with the line still on the counter cart and the target empty. (A fresh Send is in its
 *       grace and merges by design — the no-show's predicate — so the grace is pinned, not raced.)
 *   (g2) kitchen-fire-before-merge — A runs the kitchen's draft→fired edge (due at once, the LINE
 *       lock only) in an open transaction; B's merge must BLOCK and answer -1. Without the merge's
 *       lines lock B reads the draft, passes the check, waits at the re-parent and then moves the
 *       fired line onto the target: due food off the KDS and onto another customer's bill.
 *   (h) no-show-before-void — A writes a no-show off inside an open transaction ('ok'); B voids a
 *       DRAFT on that cart and must BLOCK, then answer 'not_open' with no audit row. Without the
 *       void's cart lock B waits on the no-show's LINE lock and resumes with the cart row its
 *       statement snapshot saw — 'open' — recording an approved void on a cancelled cart.
 *   (h2) no-show-before-request — the same, for an approval request on a draft over the ceiling:
 *       'not_open' and no pending row, never a manager asked to approve a loss on a cancelled cart.
 *
 *   The Phase 2f self-review gave `mms_clear_counter_cart` the cart's PENDING approvals (locked
 *   before its lines, superseded on 'ok') and named the no-show's lines lock. Three more orders:
 *   (i) clear-before-resolve — B clears a drafts-only counter order holding a pending request inside
 *       an open transaction ('ok'); A resolves the request (approve) and must BLOCK on B, then answer
 *       'already_resolved' with the request 'superseded' and the line still a draft. Without the
 *       supersede the request is left pending on a cancelled cart; without the whole change A waits
 *       only on the Clear's LINE lock and resumes reading the cart 'open' — an approved void (a loss)
 *       on the cancelled cart.
 *   (i2) resolve-mid-clear — A takes an approve's first two locks in M269's order (the cart FOR
 *       SHARE, then the request's row FOR UPDATE) in an open transaction; B's Clear must BLOCK on A (at
 *       the cart); then A runs the resolve itself (its next lock is the LINE) and must answer 'ok'
 *       without waiting, and once A commits B must answer 'ok' (the request resolved first, the order
 *       then cleared). Both are wrapped so a deadlock comes back as DATA, 'deadlock'. Until M269 A took
 *       the request alone (the resolve's first lock then), and without the Clear's approvals lock B
 *       held the lines at the supersede while A's resolve waited on one — 40P01. M269 put the cart
 *       first, so the Clear and the approve meet at the cart and that mutant is now a DOCUMENTED
 *       SURVIVOR (below); A holding the request without the cart models no resolve that locks a line.
 *   (j) kitchen-start-before-no-show — A starts the SENT line (`mms_line_transition` → in_progress,
 *       the LINE lock only) in an open transaction; B's no-show (no approver) must BLOCK on A and,
 *       once A commits, answer 'needs_approval' (the dish is now cooked) with the line untouched.
 *       Without the no-show's lines lock B reads the line as merely fired, decides a solo write-off,
 *       waits at the void, and voids a started dish with no manager.
 *
 *   M184 (the blind passes on #333) restates `mms_request_approval` to refuse 'in_flight' while the
 *   cart is pay-locked or settling, so no request lands between a settle door's freeze and its read
 *   of the pending set. The freeze is `acquireSettlement`'s UPDATE (lib/lock.ts), written out here;
 *   B's request runs in an open transaction so its commit can land after the door's read. Two orders:
 *   (r1) freeze-before-request — A freezes the cart inside an open transaction; B's request on a draft
 *       over the ceiling must BLOCK on A (the cart FOR SHARE) and, once A commits, answer 'in_flight'
 *       with nothing pending. Without the lock, or with the freeze read before it, B asks a manager
 *       about a bill the door is already charging, and its request commits after the door's read.
 *   (r2) request-before-freeze — B asks ('ok') inside an open transaction; A's freeze must BLOCK on B
 *       and, once B commits, land; the door's read (after A commits) must see the request. Without the
 *       lock the freeze lands first, the read sees nothing, and B's request then commits behind it.
 *   In both, every request pending at the end is one the door's read saw.
 *
 *   M269 gives `mms_resolve_approval`'s approve the line's cart FOR SHARE before the request and the
 *   line, and reads the cart's freshness after it. The cash door is the freeze (as above), its totals
 *   read and `mms_fulfill_cash_order`, which derives the subtotal and copies the lines with no line
 *   lock. Two orders:
 *   (k) approve-before-settle — A approves the void inside an open transaction; B's freeze must BLOCK
 *       on A and, once A commits, land; the door's totals then omit the voided dish and the cash order
 *       charges only what is on the bill (its subtotal equals its items, the dish absent). Without the
 *       lock the freeze lands past A's uncommitted void, the door charges the dish, and A then records
 *       it as an approved loss.
 *   (k2) settle-before-approve — B's freeze, totals read and cash fulfillment held open in one
 *       transaction (so A arrives mid-write, the freeze not yet visible); A's approve must BLOCK on B and,
 *       once B commits, answer 'not_open' with the line still charged and the request still pending.
 *       Without the lock, or with the cart read before it, A voids a dish B is charging.
 *
 *   PD5b (`20261009120300_pd5b_settlement_batch_and_fold.sql`) marks the settlement batch: the drain
 *   (`mms_fire_pending_food`) mints it as a version-8 UUID, every Send a version-4 one, and the
 *   kitchen read numbers rounds by that mark. Two more orders, on a DINE-IN table with a dine-in and
 *   a to-go draft — THE GRACE RACE:
 *   Since PD1 (`20261008123000_pd1_send_nudge.sql`) `mms_fire_cart` takes the cart row `for no key
 *   update` FIRST and holds it to commit, and recording the payment is a cart UPDATE — so the two
 *   meet at the CART, before either reaches a line:
 *   (s) send-before-settlement-fire — A Sends inside an open transaction (the dine-in dish, its
 *       deadline 10 s out); B, in its own transaction, records the guest's payment (the cart → paid),
 *       which must BLOCK on A's cart lock. Once A commits the payment lands, and B's drain — a later
 *       statement, so it reads A's committed line — must fire only the to-go dish (1). The Send's dish
 *       keeps A's batch, version 4; the to-go dish carries the mark. Without the drain's draft guard it
 *       re-fires the Send's dish under the settlement batch, and the Send loses its number. (Before
 *       PD1 the payment did not wait and the drain met A's LINE lock instead; should the cart lock
 *       ever go, the scenario falls back to that shape rather than hang.)
 *   (s2) settlement-fire-before-send — B records the payment and drains both drafts inside an open
 *       transaction (2, one marked batch); A's Send must BLOCK on the payment's cart lock and, once B
 *       commits, fire 0 (its UPDATE, a later snapshot, reads the cart paid).
 *
 * The sweeper closes EVERY expired active session in the database it runs against — what its cron
 * does anyway; on a throwaway cluster there are only these fixtures.
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 * For each function, re-create it from THIS migration's text (or its `LATER` file) with a lock deleted
 * or moved. A mutant marked `survives` must stay green on every order — the claim that no interleaving
 * here needs it, checked rather than left as a comment. Each
 * mutant asserts the pattern matched exactly once, the apply succeeded and `md5(prosrc)` changed,
 * and that EXACTLY its expected scenarios went red; the restore re-applies the whole migration file
 * (plus each function a later migration restates, from that file — `LATER`)
 * (idempotent) and asserts every body is byte-identical to the baseline. A green baseline runs
 * first, and before anything is written the live bodies are compared with what the migration
 * produces INSIDE A ROLLED-BACK TRANSACTION — if a later migration redefines one of these
 * functions, restoring from this file would revert it, so the battery refuses.
 *
 * ── It COMMITS, so it refuses anything that is not local ────────────────────────────────────────
 *
 * Two sessions must see the fixtures, so they are committed, tagged `reg-P2FR-` on
 * `table_sessions.qr_code` (the `reg-` prefix is the counter predicate itself), and swept by tag in
 * a `finally`. The DSN defaults to the local supabase stack; `COUNTER_RACE_DSN` may point elsewhere,
 * but only at loopback or a unix-socket directory, with the same libpq scrubbing, in-DB TLS/address
 * checks and `supabase status` tunnel check as scripts/verify-line-guard-race.mjs (P2dk), whose
 * layers this copies; `COUNTER_RACE_ASSUME_DISPOSABLE=1` skips only the tunnel check.
 *
 * Run: `pnpm verify:counter-race` · `pnpm verify:counter-race:mutants` (the local stack), or
 *   COUNTER_RACE_DSN="postgresql:///postgres?host=/tmp&port=55432&user=postgres" node scripts/verify-counter-fire-race.mjs
 * against a throwaway cluster with every migration applied (how it was first proved: PG16, 2026-09-30).
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20261001000000_p2f_counter_cook_before_paid.sql",
);
/**
 * Functions a LATER migration restates, each read from its LAST defining file — the fingerprint,
 * the mutation and the byte-identical restore alike. Reading them from p2f's file would compare the
 * live database against a body it no longer runs, and the restore would revert the later fix.
 * M184 (PD8, the blind pass on #333) restates `mms_request_approval` with the settle-freeze refusal.
 */
const LATER = {
  mms_request_approval: path.join(
    ROOT,
    "supabase/migrations/20261008120000_m184_approval_refuses_when_changed.sql",
  ),
  // M269 restates M184's `mms_resolve_approval` with the cart lock before the line; p2f never defined
  // it, so it is compared and restored from this file alone.
  mms_resolve_approval: path.join(
    ROOT,
    "supabase/migrations/20261009120100_m269_approve_cart_lock.sql",
  ),
  // PD5b restates p2f's `mms_merge_table_orders` (the fold compares `fire_batch` for cooking lines)
  // and `mms_fire_pending_food` (the settlement mark; p2f never defined it) — the grace race (s · s2).
  mms_merge_table_orders: path.join(
    ROOT,
    "supabase/migrations/20261009120300_pd5b_settlement_batch_and_fold.sql",
  ),
  mms_fire_pending_food: path.join(
    ROOT,
    "supabase/migrations/20261009120300_pd5b_settlement_batch_and_fold.sql",
  ),
};
const TAG = "P2FR";
const CODE_PREFIX = `reg-${TAG}-`;
/** The merge target: a diner's pickup, deliberately NOT `reg-` (a counter target is refused). */
const TGT_PREFIX = `${TAG}T-`;
/** PD5b — a dine-in table (the grace race, s · s2). Tagged so the cleanup finds it. */
const DINE_PREFIX = `${TAG}D-`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function refuse(why) {
  console.error(red(`\n${TAG} REFUSED — ${why}\n`));
  process.exit(1);
}

// ── Layer 1: the DSN can only name this machine ──────────────────────────────────────────────────
const SCRUBBED = [
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGPASSFILE",
  "PGOPTIONS",
  "PGSSLMODE",
  "PGGSSENCMODE",
  "PGREQUIRESSL",
  "PGSSLNEGOTIATION",
  "PGSYSCONFDIR",
];
const childEnv = (app) => {
  const e = { ...process.env, PGAPPNAME: `mms-p2fr-${app}` };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

/** Only these may appear in the query string. `hostaddr` overrides `host` in libpq, `service`
 * reads a file, `options` rewrites GUCs — each could send a "localhost" DSN somewhere else. */
const PARAMS_OK = new Set(["host", "port", "user", "dbname", "password", "connect_timeout"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveDsn() {
  const raw =
    process.env.COUNTER_RACE_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let u;
  try {
    u = new URL(raw);
  } catch {
    refuse(`COUNTER_RACE_DSN is not a postgresql:// URL`);
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") refuse(`not a postgres URL`);
  const keys = [...u.searchParams.keys()];
  const bad = keys.filter((k) => !PARAMS_OK.has(k));
  if (bad.length) refuse(`DSN parameter(s) ${bad.join(", ")} are not allowed here`);
  if (new Set(keys).size !== keys.length) refuse(`a DSN parameter is given twice`);
  const uriHost = decodeURIComponent(u.hostname);
  const qHost = u.searchParams.get("host");
  if (qHost !== null && uriHost !== "") refuse(`the host is named twice (authority and ?host=)`);
  const host = qHost ?? uriHost;
  if (host.includes(",")) refuse(`a multi-host DSN is not allowed`);
  const socket = host === "" || host.startsWith("/");
  if (!socket && !LOOPBACK.has(host)) {
    refuse(`host ${JSON.stringify(host)} is not loopback or a unix socket — this harness COMMITS`);
  }
  // The transport is STATED: `ssl` is an in-DB predicate below, and GSSAPI encryption would
  // report ssl=f on an encrypted remote hop (verify-merge-race.mjs, DSN block).
  u.searchParams.set("sslmode", "prefer");
  u.searchParams.set("gssencmode", "disable");
  return { dsn: u.toString(), socket, host, port: u.searchParams.get("port") ?? u.port };
}
const TARGET = resolveDsn();
const DSN = TARGET.dsn;

/** One-shot query on its own connection. Throws with psql's stderr. */
function q(sql, app = "probe") {
  const r = spawnSync(
    "psql",
    ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`, "-f", "-"],
    { env: childEnv(app), encoding: "utf8", input: sql },
  );
  if (r.status !== 0) {
    throw new Error(
      `psql failed (status=${r.status}${r.error ? `, ${r.error.code}` : ""}):\n` +
        (r.stderr || r.stdout || r.error?.message || "<no output — is psql on PATH?>"),
    );
  }
  return (r.stdout || "").trim();
}

// ── Layer 0 (TCP only): the port is the local stack's, so nothing else can be bound there ────────
function assertNotATunnel() {
  if (TARGET.socket) return;
  if (process.env.COUNTER_RACE_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(`  ⚠️  COUNTER_RACE_ASSUME_DISPOSABLE=1 — tunnel check SKIPPED (in-DB checks on)`),
    );
    return;
  }
  const r = spawnSync("supabase", ["status", "-o", "env"], {
    env: childEnv("status"),
    encoding: "utf8",
  });
  const dbUrl = /DB_URL="?([^"\n]+)"?/.exec(r.stdout || "")?.[1] ?? "";
  let ok = false;
  try {
    const got = new URL(dbUrl);
    ok = r.status === 0 && got.hostname === TARGET.host && got.port === TARGET.port;
  } catch {
    ok = false;
  }
  if (!ok) {
    refuse(
      `could not confirm ${TARGET.host}:${TARGET.port} is the local supabase stack ` +
        `(supabase status ${r.status === 0 ? `reported DB_URL=${JSON.stringify(dbUrl)}` : `failed, status=${r.status}`}).\n` +
        `  A TCP loopback port can be forwarded anywhere; the CLI owning it is what rules that out.\n` +
        `  Start the stack (supabase start), use a unix socket, or — a bare cluster on purpose —\n` +
        `  COUNTER_RACE_ASSUME_DISPOSABLE=1 (skips ONLY this check).`,
    );
  }
}

// ── Layer 2: what the server says about itself ───────────────────────────────────────────────────
let localVerified = false;
function assertLocalOnly() {
  const out = q(`select
      coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), true),
      coalesce(inet_server_addr()::text, '<unix socket>'),
      inet_server_addr() is null
        or inet_server_addr() <<= inet '127.0.0.0/8' or inet_server_addr() <<= inet '::1/128'
        or inet_server_addr() <<= inet '10.0.0.0/8' or inet_server_addr() <<= inet '172.16.0.0/12'
        or inet_server_addr() <<= inet '192.168.0.0/16' or inet_server_addr() <<= inet 'fc00::/7',
      current_setting('lock_timeout'), current_setting('statement_timeout')`);
  const [ssl, addr, priv, lockTo, stmtTo] = out.split("|");
  console.log(
    dim(`  server: ssl=${ssl} addr=${addr} private=${priv} lock_timeout=${lockTo} stmt=${stmtTo}`),
  );
  if (ssl !== "f" || priv !== "t") {
    refuse(
      `ssl=${ssl} (want f) addr=${addr} private=${priv} (want t). Hosted Supabase is TLS on a public ` +
        `address; a local stack is neither. Do not relax this to make a run work.`,
    );
  }
  localVerified = true;
}

/** A long-lived psql session; completion is a marker `\echo`ed after each statement. */
class Session {
  constructor(name) {
    this.name = name;
    this.buf = "";
    this.seq = 0;
    this.pending = null;
    this.proc = spawn(
      "psql",
      ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`],
      { env: childEnv(name), stdio: ["pipe", "pipe", "pipe"] },
    );
    this.proc.stdout.on("data", (d) => (this.buf += d));
    // NOTICE/WARNING also arrive on stderr; only a fatal severity stops the session.
    this.proc.stderr.on("data", (d) => {
      const t = String(d);
      if (/^(psql:|ERROR|FATAL|PANIC)/m.test(t)) this.fatal = (this.fatal ?? "") + t;
    });
    this.proc.on("error", (e) => (this.fatal = (this.fatal ?? "") + `spawn: ${e.message}\n`));
    this.proc.stdin.on("error", () => {});
    this.dead = new Promise((res) => this.proc.on("exit", res));
  }
  async open() {
    // The RPC's refusal must come back as DATA: under ON_ERROR_STOP a raise would end the session.
    // A subtransaction commits into its parent, so a lock taken inside it is held to COMMIT.
    // Neither function raises on a refusal (they answer in data), so no try-wrapper is needed; an
    // ERROR here is a broken fixture and ends the run through `fatal`.
    await this.run(`set lock_timeout = 0; set statement_timeout = 0;`);
    this.pid = await this.run("select pg_backend_pid();");
    return this;
  }
  write(sql) {
    const marker = `__P2FR_${this.name}_${++this.seq}__`;
    const start = this.buf.length;
    this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
    return { marker, start };
  }
  async run(sql) {
    return this.result(this.write(sql), sql);
  }
  fire(sql) {
    this.pending = this.write(sql);
  }
  done() {
    return this.pending !== null && this.buf.includes(this.pending.marker, this.pending.start);
  }
  async collect() {
    const p = this.pending;
    this.pending = null;
    return this.result(p, "fired statement");
  }
  async result({ marker, start }, what) {
    const t0 = Date.now();
    while (!this.buf.includes(marker, start)) {
      if (this.fatal) throw new Error(`${this.name} psql error:\n${this.fatal}`);
      if (Date.now() - t0 > 20000) throw new Error(`${TAG} TIMEOUT ${this.name}: ${what}`);
      await new Promise((r) => setTimeout(r, 10));
    }
    return this.buf
      .slice(start, this.buf.indexOf(marker, start))
      .trim()
      .split("\n")
      .filter(Boolean)
      .pop();
  }
  async close() {
    this.proc.stdin.end();
    await this.dead;
  }
}

/**
 * Wait until `s`'s fired statement is either blocked BY `peer` or finished — whichever is TRUE,
 * observed, never assumed. A timeout means neither happened: a broken fixture, not a verdict.
 */
async function blockedOrDone(s, peer) {
  const t0 = Date.now();
  for (;;) {
    if (s.done()) return "done";
    if (s.fatal) throw new Error(`${TAG} ${s.name} errored instead of blocking:\n${s.fatal}`);
    const blockers = q(`select array_to_string(pg_blocking_pids(${s.pid}), ',');`);
    if (blockers.split(",").includes(String(peer.pid))) return "blocked";
    if (Date.now() - t0 > 15000) {
      throw new Error(`${TAG} TIMEOUT — ${s.name} neither blocked on ${peer.name} nor finished`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
// One named counter order (a `reg-` pickup session, an open cart) with ONE to-go draft: exactly
// what `mms_fire_counter_cart` fires. One qr_code per fixture — `table_sessions_active_qr_uniq`
// refuses a second active session on a code, and `--mutants` re-runs every scenario.
const NAME = "P2FR Guest";
const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`;
let fixtureSeq = 0;

/** `ttl` — the session's remaining life; the sweep scenarios give it seconds and wait it out. */
function fixture(id, ttl = "12 hours") {
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status, expires_at)
      values ('${CODE_PREFIX}${id}-${RUN}-${++fixtureSeq}', 'pickup', 'active',
              clock_timestamp() + interval '${ttl}') returning id
    ), c as (
      insert into public.qr_carts (session_id, customer_name, counter_arm)
      select id, '${NAME}', 'phone' from s returning id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
      select c.id, '${TAG}-dish', 'Mohinga', 1, 1400, 147, 'togo' from c
      returning id
    )
    select (select id from s), (select id from c), (select id from i);`);
  const [session, cart, line] = out.split("|");
  if (!session || !cart || !line) throw new Error(`${TAG} fixture ${id} did not resolve: ${out}`);
  return {
    session,
    cart,
    line,
    // The cart's status — what a Clear decided.
    cartStatus: () => q(`select status from public.qr_carts where id = '${cart}';`),
    // What the counter and the kitchen see: the name on the order · the line's state.
    state: () =>
      q(`select coalesce(c.customer_name, '<none>') || '|' || i.state
           from public.qr_carts c join public.qr_cart_items i on i.cart_id = c.id
          where c.id = '${cart}';`),
    // What the sweep decided: the session's status · the line's state.
    swept: () =>
      q(`select s.status || '|' || i.state
           from public.table_sessions s join public.qr_carts c on c.session_id = s.id
           join public.qr_cart_items i on i.cart_id = c.id
          where c.id = '${cart}';`),
  };
}

/** A DINER's pickup (not `reg-`, so not a counter order) with an open cart and nothing on it — the
 *  merge target. Tagged `${TGT_PREFIX}` so the cleanup finds it (and the lines a merge moves onto it). */
function target(id) {
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status, expires_at)
      values ('${TGT_PREFIX}${id}-${RUN}-${++fixtureSeq}', 'pickup', 'active',
              clock_timestamp() + interval '12 hours') returning id
    ), c as (
      insert into public.qr_carts (session_id, customer_name) select id, 'P2FR Diner' from s returning id
    )
    select (select id from c);`);
  if (!out) throw new Error(`${TAG} target ${id} did not resolve`);
  return {
    cart: out,
    lines: () => q(`select count(*) from public.qr_cart_items where cart_id = '${out}';`),
  };
}

/** PD5b — a DINE-IN table with an open cart and two drafts: a dine-in dish (what a Send fires) and a
 *  to-go one (a Send leaves it; the settlement fires it). The grace race (s · s2). */
function dineFixture(id) {
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status, expires_at)
      values ('${DINE_PREFIX}${id}-${RUN}-${++fixtureSeq}', 'dinein', 'active',
              clock_timestamp() + interval '12 hours') returning id
    ), c as (
      insert into public.qr_carts (session_id) select id from s returning id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
      select c.id, '${TAG}-dish', v.name, 1, 1400, 147, v.ful
        from c, (values ('Mohinga', 'dinein'), ('Tea leaf salad', 'togo')) v(name, ful)
      returning id, fulfillment
    )
    select (select id from c), (select id from i where fulfillment = 'dinein'),
           (select id from i where fulfillment = 'togo');`);
  const [cart, dish, togo] = out.split("|");
  if (!cart || !dish || !togo)
    throw new Error(`${TAG} dine-in fixture ${id} did not resolve: ${out}`);
  /** A line's batch, and its UUID version character (15th) — '8' is the settlement mark. */
  const batchOf = (line) => q(`select fire_batch from public.qr_cart_items where id = '${line}';`);
  return { cart, dish, togo, batchOf, version: (line) => batchOf(line).charAt(14) };
}
/** The Send (`mms_fire_cart`): fired · batch. The guest's payment recorded: the settle's claim. */
const send = (f) => `select fired || '|' || batch from public.mms_fire_cart('${f.cart}'::uuid);`;
const payRecorded = (f) => `update public.qr_carts set status = 'paid' where id = '${f.cart}';`;
const settleFire = (f) => `select public.mms_fire_pending_food('${f.cart}'::uuid);`;

/** A counter order a no-show can write off: one SENT line (past its grace) and two drafts — one
 *  under the loss ceiling (a solo void) and one over it (a request needs a manager). */
function noShowFixture(id) {
  const f = fixture(id);
  const out =
    q(`update public.qr_cart_items set state = 'fired', fire_at = clock_timestamp() - interval '1 minute'
                  where id = '${f.line}';
    with d as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
      values ('${f.cart}', '${TAG}-dish', 'Tea leaf salad', 1, 1400, 147, 'togo'),
             ('${f.cart}', '${TAG}-dish', 'Feast platter', 1, 2500, 262, 'togo')
      returning id, unit_price_cents
    )
    select (select id from d where unit_price_cents = 1400), (select id from d where unit_price_cents = 2500);`);
  const [draft, big] = out.split("\n").pop().split("|");
  if (!draft || !big) throw new Error(`${TAG} no-show fixture ${id} did not resolve: ${out}`);
  return {
    ...f,
    sent: f.line,
    draft,
    big,
    audits: (line) => q(`select count(*) from public.mms_approvals where line_id = '${line}';`),
  };
}

/** Observe (never assume) that the fixture's session has expired by the database's clock. */
async function untilExpired(f) {
  const t0 = Date.now();
  while (
    q(
      `select clock_timestamp() > expires_at from public.table_sessions where id = '${f.session}';`,
    ) !== "t"
  ) {
    if (Date.now() - t0 > 15000) throw new Error(`${TAG} TIMEOUT — the fixture never expired`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const fire = (f) =>
  `select fired || '|' || named from public.mms_fire_counter_cart('${f.cart}'::uuid);`;
/** The fire as the sweep scenarios read it: fired · closed. */
const fireClosed = (f) =>
  `select fired || '|' || closed from public.mms_fire_counter_cart('${f.cart}'::uuid);`;
const sweep = `select public.mms_sweep_expired_sessions() >= 0;`;
/** A's transaction start, compared with the fixture's expiry — `now()` is what the fire's
 *  expiry term reads, so (c) must pin it BEFORE the session expires or the term alone refuses. */
const nowBeforeExpiry = (f) =>
  `select now() < expires_at from public.table_sessions where id = '${f.session}';`;
const clearName = (f) => `select public.mms_clear_cart_name('${f.session}'::uuid);`;
/** The table Clear's counter half (Codex r2 on #308): the SENT check and the cancel in one call. */
const clearCounter = (f) => `select public.mms_clear_counter_cart('${f.cart}'::uuid);`;
/** Codex r3 on #308 — the merge (a negative count is its counter refusal), and the two line writers. */
const merge = (f, t) =>
  `select public.mms_merge_table_orders('${f.cart}'::uuid, '${t.cart}'::uuid);`;
const STAFF = "00000000-0000-0000-0000-00000000f2f0";
const noShow = (f) =>
  `select public.mms_counter_no_show('${f.cart}'::uuid, '${STAFF}'::uuid, array['${f.sent}']::uuid[]);`;
/** The approving manager `mms_resolve_approval` checks against `staff` — committed once per run
 *  (`setupManager`) and removed by `cleanup`. Distinct from STAFF (the initiator), or it self-approves. */
const MGR = "00000000-0000-0000-0000-00000000f2f1";
/** Each helper answers 'deadlock' as DATA instead of an ERROR that would end the session: (i2)'s
 *  mutant is a lock-order inversion, and the deadlock detector may pick either side. */
const DEADLOCK_SAFE = `
  create function pg_temp.p2fr_clear(p uuid) returns text language plpgsql as $f$
  begin return public.mms_clear_counter_cart(p);
  exception when deadlock_detected then return 'deadlock'; end $f$;
  create function pg_temp.p2fr_resolve(p uuid) returns text language plpgsql as $f$
  begin return public.mms_resolve_approval(p, '${MGR}'::uuid, 'approve');
  exception when deadlock_detected then return 'deadlock'; end $f$;`;
const resolve = (id) => `select pg_temp.p2fr_resolve('${id}'::uuid);`;
const approvalStatus = (id) => q(`select status from public.mms_approvals where id = '${id}';`);
const lineState = (id) => q(`select state from public.qr_cart_items where id = '${id}';`);

/** A drafts-only counter order (nothing sent — the Clear lands) with a PENDING S2.4 request on a
 *  draft over the loss ceiling. */
function requestFixture(id) {
  const f = fixture(id);
  const big = q(`insert into public.qr_cart_items
      (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values ('${f.cart}', '${TAG}-dish', 'Feast platter', 1, 2500, 262, 'togo') returning id;`);
  const asked = q(requestApproval(big));
  const approval = q(
    `select id from public.mms_approvals where line_id = '${big}' and status = 'pending';`,
  );
  if (asked !== "ok" || !approval) {
    throw new Error(`${TAG} request fixture ${id} did not resolve: ${asked} ${approval}`);
  }
  return { ...f, big, approval };
}
const voidLine = (line) =>
  `select public.mms_void_line('${line}'::uuid, 'void', 'wrong_item', '${STAFF}'::uuid);`;
const requestApproval = (line) =>
  `select public.mms_request_approval('${line}'::uuid, 'void', 'wrong_item', '${STAFF}'::uuid);`;
/** Where the counter line is and what it is: on its own cart? · state · the cart's status. */
const counterLine = (f) =>
  q(`select (ci.cart_id = '${f.cart}')::text || '|' || ci.state || '|' || c.status
       from public.qr_cart_items ci join public.qr_carts c on c.id = '${f.cart}'
      where ci.id = '${f.line}';`);

/** A counter order with one more draft, over the loss ceiling — a request on it needs a manager. */
function bigFixture(id) {
  const f = fixture(id);
  const big = q(`insert into public.qr_cart_items
      (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
    values ('${f.cart}', '${TAG}-dish', 'Feast platter', 1, 2500, 262, 'togo') returning id;`);
  if (!big) throw new Error(`${TAG} big fixture ${id} did not resolve`);
  return { ...f, big };
}
/** A settle door's freeze — `acquireSettlement`'s UPDATE (apps/qr/lib/lock.ts) with its two windows
 *  written out (the pay-lock's 5 minutes, the settle's 10): the cart row's settle stamp, taken only on
 *  an open cart with no live pay-lock and no live settle. Answers the rows it froze. */
const freeze = (f) => `with w as (
    update public.qr_carts set settle_at = now(), settle_by = '${MGR}'::uuid
     where id = '${f.cart}' and status = 'open'
       and (locked = false or (locked_at <= now() - interval '5 minutes' and live_payment_intent_id is null))
       and (settle_at is null or settle_at <= now() - interval '10 minutes')
     returning 1)
  select count(*) from w;`;
/** The door's next read after its freeze — `readPendingApprovalFlags`' filter (lib/approvals-read.ts). */
const pendingOn = (f) =>
  q(
    `select count(*) from public.mms_approvals where cart_id = '${f.cart}' and status = 'pending';`,
  );

/** The cash door's totals read after its freeze (`getCartTotals`' subtotal, tip 0): subtotal|tax. */
const doorTotals = (f) =>
  `select coalesce(sum(unit_price_cents * qty), 0) || '|' || coalesce(sum(tax_cents), 0)
     from public.qr_cart_items
    where cart_id = '${f.cart}' and state <> 'voided' and not comped;`;
/** The cash door's write — `mms_fulfill_cash_order` at the totals it just read ('t' once it lands). */
const fulfillCash = (f, totals) => {
  const [sub, tax] = totals.split("|");
  return `select public.mms_fulfill_cash_order('${f.cart}'::uuid, '${MGR}'::uuid, ${sub}, 0, 0, ${tax}, 0, null) is not null;`;
};
/** What the cash order charged: its subtotal · the sum of its items · how many items are the
 *  request's dish (the requestFixture's 'Feast platter'). */
const orderCheck = (f) =>
  q(`select o.subtotal_cents
            || '|' || coalesce((select sum(oi.unit_price_cents * oi.qty) from public.qr_order_items oi
                                 where oi.order_id = o.id), 0)
            || '|' || (select count(*) from public.qr_order_items oi
                        where oi.order_id = o.id and oi.name = 'Feast platter')
       from public.qr_orders o where o.cart_id = '${f.cart}' and o.tender = 'cash';`);

/** Each scenario returns [label, got, want] triples; any mismatch reddens it. */
const SCENARIOS = {
  async a() {
    const f = fixture("a");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const cleared = await b.run(clearName(f));
      a.fire(fire(f));
      const how = await blockedOrDone(a, b);
      await b.run("commit;");
      const fired = await a.collect();
      return [
        ["B cleared the name", cleared, "ok"],
        ["A's fire waited for the clear", how, "blocked"],
        ["A fired nothing and read no name", fired, "0|false"],
        ["no name, and the line never left draft", f.state(), "<none>|draft"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async b() {
    const f = fixture("b");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fire(f));
      b.fire(clearName(f));
      const how = await blockedOrDone(b, a);
      // A clear that did NOT wait ran its sent-food check against A's uncommitted fire — the real
      // race — so A commits only after it. A clear that waited cannot finish until A commits.
      if (how === "blocked") await a.run("commit;");
      const cleared = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A fired the named bag", fired, "1|true"],
        ["B's clear waited for the fire", how, "blocked"],
        ["B refused to clear", cleared, "keep_name"],
        ["the name stayed on food that is cooking", f.state(), `${NAME}|fired`],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async c() {
    const f = fixture("c", "2 seconds");
    const a = await new Session("a").open();
    const s = await new Session("s").open();
    try {
      await a.run("begin;");
      const pinned = await a.run(nowBeforeExpiry(f));
      await untilExpired(f);
      await s.run("begin;");
      await s.run(sweep);
      const closedByS = await s.run(
        `select status from public.table_sessions where id = '${f.session}';`,
      );
      a.fire(fireClosed(f));
      const how = await blockedOrDone(a, s);
      await s.run("commit;");
      const fired = await a.collect();
      await a.run("commit;");
      return [
        ["A's transaction began before the expiry", pinned, "t"],
        ["S swept the session closed", closedByS, "closed"],
        ["A's fire waited for the sweep", how, "blocked"],
        ["A fired nothing and read the order closed", fired, "0|true"],
        ["no food on the closed session", f.swept(), "closed|draft"],
      ];
    } finally {
      await a.close();
      await s.close();
    }
  },
  async d() {
    const f = fixture("d", "2 seconds");
    const a = await new Session("a").open();
    const s = await new Session("s").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fireClosed(f));
      await untilExpired(f);
      s.fire(sweep);
      const how = await blockedOrDone(s, a);
      // A sweep that waited cannot finish until A commits; one that did not ran against A's
      // uncommitted fire — the real race — so A commits only after it.
      if (how === "blocked") await a.run("commit;");
      await s.collect();
      if (how === "done") await a.run("commit;");
      const afterFirst = f.swept();
      await s.run(sweep);
      return [
        ["A fired the live bag", fired, "1|false"],
        ["S's sweep did not wait on the Send", how, "done"],
        ["the sweep left the cooking order open", afterFirst, "active|fired"],
        ["a later sweep leaves it open too (SENT exempts it)", f.swept(), "active|fired"],
      ];
    } finally {
      await a.close();
      await s.close();
    }
  },
  async e() {
    const f = fixture("e");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // The kitchen's own draft→fired edge stamps fire_at = now(): DUE the moment it commits, and it
      // locks only the LINE — the cart-row lock alone cannot order a Clear against it.
      await a.run("begin;");
      const fired = await a.run(`select public.mms_line_transition('${f.line}'::uuid, 'fired');`);
      b.fire(clearCounter(f));
      const how = await blockedOrDone(b, a);
      // A Clear that did NOT wait read A's uncommitted line as a draft — the real race — so A
      // commits only after it. A Clear that waited cannot finish until A commits.
      if (how === "blocked") await a.run("commit;");
      const cleared = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A fired the line (due at once)", fired, "1"],
        ["B's clear waited for the fire", how, "blocked"],
        ["B refused: the food is in the kitchen", cleared, "sent"],
        ["the cart stayed open under the kitchen's food", f.cartStatus(), "open"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async f() {
    const f = fixture("f");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // A settle's claim: the cart row taken and flipped to paid, not yet committed.
      await a.run("begin;");
      await a.run(`update public.qr_carts set status = 'paid' where id = '${f.cart}';`);
      b.fire(clearCounter(f));
      const how = await blockedOrDone(b, a);
      await a.run("commit;");
      const cleared = await b.collect();
      return [
        ["B's clear waited for the settle", how, "blocked"],
        ["B read the cart as settled — no cancel claimed", cleared, "not_open"],
        ["the settled cart is untouched", f.cartStatus(), "paid"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async g() {
    const f = fixture("g");
    const t = target("g");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // Pin A's `now()`, then wait its 10s grace out on the DB clock: the Send stamps now() + 10s,
      // so the food A fires is already DUE — to B, whose statement starts later — when A commits.
      await a.run("begin;");
      const t0 = await a.run("select now();");
      const t00 = Date.now();
      while (
        q(`select clock_timestamp() > '${t0}'::timestamptz + interval '10 seconds';`) !== "t"
      ) {
        if (Date.now() - t00 > 20000) throw new Error(`${TAG} TIMEOUT — the grace never ran out`);
        await new Promise((r) => setTimeout(r, 100));
      }
      const fired = await a.run(fire(f));
      b.fire(merge(f, t));
      const how = await blockedOrDone(b, a);
      // A merge that did NOT wait decided against A's uncommitted Send — the real race — so A commits
      // only after it. A merge that waited cannot finish until A commits.
      if (how === "blocked") await a.run("commit;");
      const merged = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A sent the named bag (already due)", fired, "1|true"],
        ["B's merge waited for the Send", how, "blocked"],
        ["B refused: the counter order's food is in the kitchen", merged, "-1"],
        ["the line stayed on the open counter cart, fired", counterLine(f), "true|fired|open"],
        ["nothing reached the target", t.lines(), "0"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async g2() {
    const f = fixture("g2");
    const t = target("g2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // The kitchen's draft→fired edge: due at once, and it locks only the LINE.
      await a.run("begin;");
      const fired = await a.run(`select public.mms_line_transition('${f.line}'::uuid, 'fired');`);
      b.fire(merge(f, t));
      const how = await blockedOrDone(b, a);
      if (how === "blocked") await a.run("commit;");
      const merged = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A fired the line (due at once)", fired, "1"],
        ["B's merge waited for the fire", how, "blocked"],
        ["B refused: the counter order's food is in the kitchen", merged, "-1"],
        ["the line stayed on the open counter cart, fired", counterLine(f), "true|fired|open"],
        ["nothing reached the target", t.lines(), "0"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async h() {
    const f = noShowFixture("h");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const wrote = await a.run(noShow(f));
      b.fire(voidLine(f.draft));
      const how = await blockedOrDone(b, a);
      if (how === "blocked") await a.run("commit;");
      const voided = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A wrote the no-show off", wrote, "ok"],
        ["B's void waited for the no-show", how, "blocked"],
        ["B refused: the cart is cancelled", voided, "not_open"],
        ["no void recorded on the cancelled cart", f.audits(f.draft), "0"],
        ["the cart is cancelled", f.cartStatus(), "cancelled"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async h2() {
    const f = noShowFixture("h2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const wrote = await a.run(noShow(f));
      b.fire(requestApproval(f.big));
      const how = await blockedOrDone(b, a);
      if (how === "blocked") await a.run("commit;");
      const asked = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A wrote the no-show off", wrote, "ok"],
        ["B's request waited for the no-show", how, "blocked"],
        ["B refused: the cart is cancelled", asked, "not_open"],
        ["no request pending on the cancelled cart", f.audits(f.big), "0"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async i() {
    const f = requestFixture("i");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run(DEADLOCK_SAFE);
      await b.run("begin;");
      const cleared = await b.run(clearCounter(f));
      a.fire(resolve(f.approval));
      const how = await blockedOrDone(a, b);
      // A resolve that did NOT wait decided against B's uncommitted Clear — the real race — so B
      // commits only after it. A resolve that waited cannot finish until B commits.
      if (how === "blocked") await b.run("commit;");
      const resolved = await a.collect();
      if (how === "done") await b.run("commit;");
      return [
        ["B cleared the order", cleared, "ok"],
        ["A's resolve waited for the clear", how, "blocked"],
        ["A found the request already resolved", resolved, "already_resolved"],
        ["the request was superseded, not approved", approvalStatus(f.approval), "superseded"],
        ["no void landed on the cancelled cart", lineState(f.big), "draft"],
        ["the cart is cancelled", f.cartStatus(), "cancelled"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async i2() {
    const f = requestFixture("i2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run(DEADLOCK_SAFE);
      await b.run(DEADLOCK_SAFE);
      // An approve's first two locks, in M269's order (the cart FOR SHARE, then the request), taken
      // on their own so the Clear starts MID-resolve. Before M269 the request came first; holding it
      // without the cart now models no resolve that then locks a line, and the Clear (holding the
      // cart, waiting on the request) and the approve (waiting on the cart) would deadlock.
      await a.run("begin;");
      await a.run(`select 1 from public.qr_carts where id = '${f.cart}' for share;`);
      const held = await a.run(
        `select status from public.mms_approvals where id = '${f.approval}' for update;`,
      );
      b.fire(`select pg_temp.p2fr_clear('${f.cart}'::uuid);`);
      const how = await blockedOrDone(b, a);
      // …then the rest of the resolve: its LINE lock must be free (the Clear waits at the cart).
      const resolved = await a.run(resolve(f.approval));
      await a.run("commit;");
      const cleared = await b.collect();
      return [
        ["A holds the pending request", held, "pending"],
        ["B's clear waited for the resolve", how, "blocked"],
        ["A's resolve finished (no deadlock)", resolved, "ok"],
        ["B's clear finished after it (no deadlock)", cleared, "ok"],
        ["the request was approved — it resolved first", approvalStatus(f.approval), "approved"],
        ["the cart is cancelled", f.cartStatus(), "cancelled"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async j() {
    const f = noShowFixture("j");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // The kitchen's Start: it locks only the LINE — the cart-row lock cannot order a no-show after it.
      await a.run("begin;");
      const started = await a.run(
        `select public.mms_line_transition('${f.sent}'::uuid, 'in_progress');`,
      );
      b.fire(noShow(f));
      const how = await blockedOrDone(b, a);
      if (how === "blocked") await a.run("commit;");
      const wrote = await b.collect();
      if (how === "done") await a.run("commit;");
      return [
        ["A started the sent dish", started, "1"],
        ["B's no-show waited for the Start", how, "blocked"],
        ["B needs a manager: the dish is cooked now", wrote, "needs_approval"],
        ["the started dish was not written off", lineState(f.sent), "in_progress"],
        ["no loss row", f.audits(f.sent), "0"],
        ["the cart is still open", f.cartStatus(), "open"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async r1() {
    const f = bigFixture("r1");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      // B's request runs in its own open transaction so its commit can land AFTER the door's read —
      // the window a request that did not wait would use.
      await a.run("begin;");
      const froze = await a.run(freeze(f));
      await b.run("begin;");
      b.fire(requestApproval(f.big));
      const how = await blockedOrDone(b, a);
      let asked;
      let seen;
      if (how === "blocked") {
        await a.run("commit;");
        seen = pendingOn(f); // the door's read, after its freeze commits
        asked = await b.collect();
      } else {
        // B decided against A's UNCOMMITTED freeze — the real race: the door commits and reads first.
        asked = await b.collect();
        await a.run("commit;");
        seen = pendingOn(f);
      }
      await b.run("commit;");
      return [
        ["A froze the cart for settlement", froze, "1"],
        ["B's request waited for the freeze", how, "blocked"],
        ["B refused: the cart is settling", asked, "in_flight"],
        ["every pending request is one the door's read saw", pendingOn(f), seen],
        ["nothing pending behind the settle", pendingOn(f), "0"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async r2() {
    const f = bigFixture("r2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const asked = await b.run(requestApproval(f.big));
      await a.run("begin;");
      a.fire(freeze(f));
      const how = await blockedOrDone(a, b);
      let froze;
      let seen;
      if (how === "blocked") {
        await b.run("commit;");
        froze = await a.collect();
        await a.run("commit;");
        seen = pendingOn(f); // the door's read, after its freeze commits
      } else {
        // A froze past B's UNCOMMITTED request — the real race: the door commits and reads first.
        froze = await a.collect();
        await a.run("commit;");
        seen = pendingOn(f);
        await b.run("commit;");
      }
      return [
        ["B asked a manager", asked, "ok"],
        ["A's freeze waited for the request", how, "blocked"],
        ["A froze the cart once the request landed", froze, "1"],
        ["the door's read saw the request", seen, "1"],
        ["every pending request is one the door's read saw", pendingOn(f), seen],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async k() {
    const f = requestFixture("k");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run(DEADLOCK_SAFE);
      // A approves the void inside an open transaction: the cart, the request and the line held.
      await a.run("begin;");
      const resolved = await a.run(resolve(f.approval));
      b.fire(freeze(f));
      const how = await blockedOrDone(b, a);
      if (how === "blocked") await a.run("commit;");
      const froze = await b.collect();
      // The door: its totals read, then the cash fulfillment. A freeze that did NOT wait landed past
      // A's uncommitted void — the real race — so A commits only after the door has written.
      const totals = await b.run(doorTotals(f));
      b.fire(fulfillCash(f, totals));
      const paidHow = await blockedOrDone(b, a);
      if (paidHow === "blocked") await a.run("commit;");
      const paid = await b.collect();
      if (how === "done" && paidHow === "done") await a.run("commit;");
      return [
        ["A approved the void", resolved, "ok"],
        ["the door's freeze waited for the approve", how, "blocked"],
        ["the freeze landed once the approve committed", froze, "1"],
        ["the cash order landed", paid, "t"],
        [
          "the order charged only what is on the bill (subtotal|items|the voided dish)",
          orderCheck(f),
          "1400|1400|0",
        ],
        [
          "the approved void stands",
          `${approvalStatus(f.approval)}|${lineState(f.big)}`,
          "approved|voided",
        ],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async k2() {
    const f = requestFixture("k2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run(DEADLOCK_SAFE);
      // The door's freeze, its totals read and its cash fulfillment, held open in one transaction so
      // A's approve arrives while the door is mid-write (and the freeze is not yet visible to it).
      await b.run("begin;");
      const froze = await b.run(freeze(f));
      const totals = await b.run(doorTotals(f));
      const paid = await b.run(fulfillCash(f, totals));
      a.fire(resolve(f.approval));
      const how = await blockedOrDone(a, b);
      // An approve that did NOT wait decided against B's uncommitted settle — the real race — so B
      // commits only after it. An approve that waited cannot finish until B commits.
      if (how === "blocked") await b.run("commit;");
      const resolved = await a.collect();
      if (how === "done") await b.run("commit;");
      return [
        ["B froze the cart and took the cash", `${froze}|${paid}`, "1|t"],
        ["A's approve waited for the settle", how, "blocked"],
        ["A refused: the table is paid", resolved, "not_open"],
        [
          "the charged dish was not written off",
          `${lineState(f.big)}|${approvalStatus(f.approval)}`,
          "draft|pending",
        ],
        [
          "the order charged the dish it kept (subtotal|items|the dish)",
          orderCheck(f),
          "3900|3900|1",
        ],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // PD5b — THE GRACE RACE. A Send is in its grace when the guest's payment is recorded; the
  // settlement then fires what was left. The Send's line must keep its OWN unmarked batch.
  async s() {
    const f = dineFixture("s");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const sent = await a.run(send(f));
      // Since PD1 the Send holds the cart row (`for no key update`) until A commits, and recording the
      // payment is a cart UPDATE — so it is FIRED, never awaited: awaited before A commits, it waits on
      // A until the session's 20 s bound fails the run (Codex on #340; measured, P2FR TIMEOUT b).
      await b.run("begin;");
      b.fire(payRecorded(f));
      const how = await blockedOrDone(b, a);
      let settled;
      if (how === "blocked") {
        // A payment that waited lands once A commits; the drain, a later statement, reads A's line.
        await a.run("commit;");
        await b.collect();
        settled = await b.run(settleFire(f));
      } else {
        // A payment that did NOT wait (the Send's cart lock gone — red above) is the pre-PD1 shape:
        // the drain meets A's uncommitted line, so A commits only once that is observed.
        await b.collect();
        b.fire(settleFire(f));
        await blockedOrDone(b, a);
        await a.run("commit;");
        settled = await b.collect();
      }
      await b.run("commit;");
      const [fired, batch] = String(sent).split("|");
      return [
        ["A's Send fired the dine-in dish", fired, "1"],
        ["B's payment record waited on the Send's cart lock", how, "blocked"],
        ["B fired only what the Send left", settled, "1"],
        ["the Send's dish keeps the Send's batch", f.batchOf(f.dish), batch],
        ["the Send's batch is a Send's (version 4)", f.version(f.dish), "4"],
        ["the settlement's dish carries the mark (version 8)", f.version(f.togo), "8"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // …and the reverse: the payment and its settlement first. The Send waits, then fires nothing.
  async s2() {
    const f = dineFixture("s2");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      await b.run(payRecorded(f));
      const settled = await b.run(settleFire(f));
      a.fire(send(f));
      const how = await blockedOrDone(a, b);
      await b.run("commit;");
      const sent = await a.collect();
      return [
        ["B's settlement fired both drafts", settled, "2"],
        ["A's Send waited on the payment's cart lock", how, "blocked"],
        ["A's Send fired nothing on the paid cart", String(sent).split("|")[0], "0"],
        ["the dine-in dish carries the mark (version 8)", f.version(f.dish), "8"],
        ["the to-go dish carries the mark (version 8)", f.version(f.togo), "8"],
        ["one settlement batch for both", f.batchOf(f.dish) === f.batchOf(f.togo), true],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
};

/** Run every scenario; returns the ids that went red (printing when `loud`). */
async function battery(loud) {
  const red_ = [];
  red_.why = [];
  for (const [id, run] of Object.entries(SCENARIOS)) {
    const checks = await run();
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) red_.push(id);
    for (const [label, got] of bad) red_.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      const name = {
        a: "clear-first",
        b: "fire-first",
        c: "sweep-first",
        d: "fire-before-sweep",
        e: "kitchen-fire-before-clear",
        f: "settle-before-clear",
        g: "send-before-merge",
        g2: "kitchen-fire-before-merge",
        h: "no-show-before-void",
        h2: "no-show-before-request",
        i: "clear-before-resolve",
        i2: "resolve-mid-clear",
        j: "kitchen-start-before-no-show",
        r1: "freeze-before-request",
        r2: "request-before-freeze",
        k: "approve-before-settle",
        k2: "settle-before-approve",
        s: "send-before-settlement-fire",
        s2: "settlement-fire-before-send",
      }[id];
      console.log(`  ${bad.length ? red("✗") : green("✓")} ${name} (${id})`);
      for (const [label, got, want] of bad) {
        console.log(`      ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
    }
  }
  return red_;
}

let lockOwned = false;
/** The manager (i, i2) — `staff.user_id` references `auth.users`, so both rows. Tagged by its id. */
function setupManager() {
  q(`insert into auth.users (id) values ('${MGR}') on conflict do nothing;
     insert into public.staff (user_id, role, display_name, active)
       values ('${MGR}', 'manager', '${TAG} Manager', true) on conflict (user_id) do nothing;`);
}
function cleanup() {
  if (!localVerified || !lockOwned) return; // never sweep unverified, nor under another run
  // (k, k2) write cash orders, settled by MGR; their items (and every row keyed on an order) cascade
  // with them. First: an order still names MGR (`settled_by`) and its session.
  for (const prefix of [CODE_PREFIX, TGT_PREFIX, DINE_PREFIX]) {
    q(`delete from public.qr_orders o using public.table_sessions s
         where o.session_id = s.id and s.qr_code like '${prefix}%';`);
  }
  q(`delete from public.staff where user_id = '${MGR}';
     delete from auth.users where id = '${MGR}';`);
  for (const prefix of [CODE_PREFIX, TGT_PREFIX, DINE_PREFIX]) {
    q(`delete from public.mms_approvals a using public.qr_carts c, public.table_sessions s
         where a.cart_id = c.id and c.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
         where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.qr_carts c using public.table_sessions s
         where c.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.table_sessions where qr_code like '${prefix}%';`);
  }
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
const LATER_TEXT = Object.fromEntries(
  Object.entries(LATER).map(([fn, file]) => [fn, readFileSync(file, "utf8")]),
);
/** Every function this migration defines, plus each `LATER` one — the restore re-applies them all,
 *  so all are compared. */
const FNS = [
  "mms_bump_ticket",
  "mms_clear_cart_name",
  "mms_clear_counter_cart",
  "mms_counter_no_show",
  "mms_fire_counter_cart",
  "mms_fire_pending_food",
  "mms_line_transition",
  "mms_merge_table_orders",
  "mms_request_approval",
  "mms_resolve_approval",
  "mms_sweep_expired_sessions",
  "mms_undo_counter_fire",
  "mms_void_line",
];
const HASHES = `select p.proname || '=' || md5(p.prosrc) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (${FNS.map((f) => `'${f}'`).join(", ")})
  order by 1;`;

/** `fn`'s `create or replace` statement in `text`, exactly once or not at all. */
function statementIn(text, fn) {
  const head = `create or replace function public.${fn}(`;
  const at = text.indexOf(head);
  if (at < 0 || text.indexOf(head, at + 1) >= 0) return null;
  // The sweeper is restated in its original file's style (`end; $$;`); the rest end `end $$;`.
  const ends = ["\nend $$;", "\nend; $$;"]
    .map((t) => [text.indexOf(t, at), t])
    .filter(([i]) => i >= 0)
    .sort((x, y) => x[0] - y[0]);
  if (!ends.length) return null;
  const [end, term] = ends[0];
  return text.slice(at, end + term.length);
}
/** `fn`'s statement from its LAST defining file (`LATER`, else this migration). */
function statementFor(fn) {
  return statementIn(LATER_TEXT[fn] ?? MIGRATION_TEXT, fn);
}
/**
 * What the live functions should be: this migration, then each later restatement — the drift check
 * applies it rolled back, the restore applies it for real. Only the restated FUNCTION is replayed
 * from the later file (its grants are this migration's, and `create or replace` keeps them).
 */
const LATER_STATEMENTS = Object.keys(LATER).map((fn) => {
  const stmt = statementFor(fn);
  if (!stmt) refuse(`${fn} is not defined exactly once in ${path.basename(LATER[fn])}`);
  return stmt;
});
const RESTORE_TEXT = [MIGRATION_TEXT, ...LATER_STATEMENTS].join("\n");

const MUTANTS = [
  {
    id: "p2f/counter-fire-cart-lock-dropped",
    fn: "mms_fire_counter_cart",
    find: "    from public.qr_carts c where c.id = p_cart_id\n    for update;\n",
    replace: "    from public.qr_carts c where c.id = p_cart_id;\n",
    // Measured: both orders go red — the UPDATE … FROM never locks the cart row, so the fire
    // neither waits for an uncommitted clear (a) nor holds off a clear behind its own (b).
    expect: ["a", "b"],
    why: "the fire reads a name a concurrent clear is removing and cooks an order nobody can call",
  },
  {
    id: "p2f/clear-name-cart-lock-dropped",
    fn: "mms_clear_cart_name",
    find: "    where c.session_id = p_session_id and c.status = 'open'\n    for update of c;",
    replace: "    where c.session_id = p_session_id and c.status = 'open';",
    // Measured: (b) only. In (a) the clear's own UPDATE still takes the row lock the fire waits on.
    expect: ["b"],
    why: "the clear checks for sent food before the fire commits, then strips the name off it",
  },
  {
    id: "p2f/counter-fire-session-lock-dropped",
    fn: "mms_fire_counter_cart",
    find: "    from public.table_sessions s where s.id = v_session\n    for share;",
    replace: "    from public.table_sessions s where s.id = v_session;",
    // (c): A's UPDATE reads the session through its own snapshot — active — and fires onto the
    // session S is closing. (d): S's lock step does not see A, so S closes the session under food.
    expect: ["c", "d"],
    why: "a Send overlapping the cron sweep leaves fired, unpaid food on a CLOSED session (C1)",
  },
  {
    id: "p2f/sweeper-decides-without-locking-first",
    fn: "mms_sweep_expired_sessions",
    find: "     order by s.id\n     for no key update skip locked) x;",
    replace: "     order by s.id) x;",
    // (d): the UPDATE itself waits on A's share lock, then closes the row WITHOUT re-reading the
    // exemption (a merely-locked row is not re-checked) — food on a closed session, and S waited.
    expect: ["d"],
    why: "the exemption is read from a snapshot older than the Send it waited for",
  },
  {
    id: "p2f/sweeper-waits-on-a-send",
    fn: "mms_sweep_expired_sessions",
    find: "     for no key update skip locked) x;",
    replace: "     for no key update) x;",
    // (d): the outcome is right (the second statement re-reads), but the cron sweep now stalls
    // behind every in-flight Send — and a stalled sweep holds every expired row it locked.
    expect: ["d"],
    why: "the cron sweep blocks behind an in-flight Send instead of leaving that row to the next run",
  },
  {
    id: "p2f/sweeper-closes-rows-it-skipped",
    fn: "mms_sweep_expired_sessions",
    find: "    where s.id = any(v_ids)\n      and not (",
    replace: "    where s.status = 'active' and s.expires_at <= now()\n      and not (",
    // (d): the lock step skips A's row, but the UPDATE reaches it anyway — waits on A, then closes it
    // without re-reading the exemption. The decision must be confined to the rows the sweep holds.
    expect: ["d"],
    why: "the sweep closes a session it never locked, from a snapshot older than the Send it waited for",
  },
  {
    id: "p2f/clear-counter-lines-lock-dropped",
    fn: "mms_clear_counter_cart",
    find: "  perform 1 from public.qr_cart_items where cart_id = p_cart_id order by id for update;\n  if exists (",
    replace: "  if exists (",
    // (e): the kitchen's fire locks only the line, so without this the Clear reads it as a draft,
    // cancels, and the ticket A just made due vanishes from the KDS — the finding, via a line writer.
    expect: ["e"],
    why: "a kitchen fire committing mid-clear lands due food on a cancelled cart (Codex r2 on #308)",
  },
  {
    id: "p2f/clear-counter-cart-lock-dropped",
    fn: "mms_clear_counter_cart",
    find: "    where c.id = p_cart_id\n    for update of c;\n  if v_sess is null",
    replace: "    where c.id = p_cart_id;\n  if v_sess is null",
    // (f): the Clear reads the cart open from a snapshot older than the settle it then waits on, and
    // answers 'ok' — a cancel it never made (its UPDATE re-checks `status = 'open'` and hits nothing).
    expect: ["f"],
    why: "the clear decides from a snapshot older than a settle's claim and reports a cancel nobody made",
  },
  {
    id: "p2f/merge-counter-lines-lock-dropped",
    fn: "mms_merge_table_orders",
    find: "    perform 1 from public.qr_cart_items where cart_id = p_source_cart order by id for update;\n",
    replace: "",
    // (g2): the kitchen's fire locks only the line, so the merge reads the draft, passes the check,
    // waits at the re-parent and then moves the fired line onto the target (Codex r3 on #308).
    // (g) stays green: the Send holds the CART, which the merge's own cart lock already waits on.
    expect: ["g2"],
    why: "a kitchen fire committing mid-merge moves due, unpaid food off the KDS and onto another bill",
  },
  {
    id: "p2f/void-cart-lock-dropped",
    fn: "mms_void_line",
    find: "    perform 1 from public.qr_carts where id = v_void_cart for share;\n",
    replace: "",
    // (h): the void waits on the no-show's LINE lock and resumes with its statement's snapshot of
    // the cart — 'open' — so it records an approved void on the cancelled cart (Codex r3 on #308).
    expect: ["h"],
    why: "a void racing a no-show records a loss on a cart the no-show already cancelled",
  },
  {
    id: "p2f/request-cart-lock-dropped",
    fn: "mms_request_approval",
    find: "    perform 1 from public.qr_carts where id = v_req_cart for share;\n",
    replace: "",
    // Since M184 restates the function, this deletes the lock in M184's body (`LATER`). (h2) as before;
    // (r1) the request reads the cart past an uncommitted freeze and asks anyway; (r2) the freeze
    // lands past an uncommitted request, so the door's read misses a request that then commits.
    // Measured 2026-10-09: all three.
    expect: ["h2", "r1", "r2"],
    why: "a request racing a no-show leaves a manager a pending loss on a cancelled cart",
  },
  {
    // The lock kept, but taken AFTER the read that decides the freeze — so it orders nothing. (r1):
    // B waits on the lock, but has already read the cart without the freeze and asks anyway. (h2): B
    // waits on the no-show's line lock, resumes with its snapshot's 'open' cart, and asks on the
    // cancelled one. (r2) stays green: B holds the lock before A's freeze reaches the row.
    // Measured 2026-10-09.
    id: "m184/request-reads-the-freeze-before-the-lock",
    fn: "mms_request_approval",
    find:
      "    perform 1 from public.qr_carts where id = v_req_cart for share;\n" +
      "    select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status,\n" +
      "           c.locked, c.locked_at, c.settle_at\n" +
      "      into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status,\n" +
      "           v_locked, v_locked_at, v_settle_at\n" +
      "      from public.qr_cart_items ci\n" +
      "      join public.qr_carts c on c.id = ci.cart_id\n" +
      "      where ci.id = p_line and ci.cart_id = v_req_cart\n" +
      "      for update of ci;\n",
    replace:
      "    select ci.cart_id, c.session_id, ci.state, ci.qty, ci.unit_price_cents, ci.name, ci.comped, c.status,\n" +
      "           c.locked, c.locked_at, c.settle_at\n" +
      "      into v_cart, v_session, v_state, v_qty, v_price, v_name, v_comped, v_status,\n" +
      "           v_locked, v_locked_at, v_settle_at\n" +
      "      from public.qr_cart_items ci\n" +
      "      join public.qr_carts c on c.id = ci.cart_id\n" +
      "      where ci.id = p_line and ci.cart_id = v_req_cart\n" +
      "      for update of ci;\n" +
      "    perform 1 from public.qr_carts where id = v_req_cart for share;\n",
    expect: ["h2", "r1"],
    why: "a request that reads the cart before it waits on a settle's freeze asks a manager about a bill already being charged",
  },
  {
    // M269 — the approve's cart lock deleted. (k): the freeze lands past A's uncommitted void and the
    // door charges the dish A then writes off. (k2): A reads B's cart as open and unfrozen and voids
    // a dish B is charging.
    id: "m269/approve-cart-lock-dropped",
    fn: "mms_resolve_approval",
    find: "    perform 1 from public.qr_carts where id = v_lock_cart for share;\n",
    replace: "",
    expect: ["k", "k2"],
    why: "an approve racing a settle records an approved void on a dish the order charged",
  },
  {
    // M269 — the lock kept, but taken AFTER the read that decides `not_open` / `in_flight`, so it orders
    // nothing: (k2) A waits on B's settle, then acts on the cart it read before waiting.
    id: "m269/approve-reads-the-cart-before-the-lock",
    fn: "mms_resolve_approval",
    edits: [
      {
        find: "    perform 1 from public.qr_carts where id = v_lock_cart for share;\n",
        replace: "",
      },
      {
        find: "    where ci.id = v_line for update of ci;\n",
        replace:
          "    where ci.id = v_line for update of ci;\n  perform 1 from public.qr_carts where id = v_lock_cart for share;\n",
      },
    ],
    expect: ["k2"],
    why: "an approve that reads the cart before it waits on a settle voids a dish the table just paid for",
  },
  {
    id: "p2f/clear-counter-supersede-dropped",
    fn: "mms_clear_counter_cart",
    find: "  update public.mms_approvals a set status = 'superseded', resolved_at = now()\n    where a.cart_id = p_cart_id and a.status = 'pending';\n",
    replace: "",
    // (i): the resolve waits on the Clear's approvals lock, then reads its request still 'pending' on
    // a cart that is now cancelled and answers not_open — the request stays pending forever.
    // (i2) stays green: there the resolve wins, so nothing is left to supersede.
    expect: ["i"],
    why: "a Clear leaves a pending request on the cancelled cart — a manager's queue holds a loss nobody can resolve",
  },
  {
    id: "p2f/clear-counter-approvals-lock-dropped",
    fn: "mms_clear_counter_cart",
    find: "  perform 1 from public.mms_approvals where cart_id = p_cart_id and status = 'pending' order by id for update;\n",
    replace: "",
    // Killed by (i2) until M269: the Clear took the lines first and met the resolve's approval lock only
    // at the supersede, while the resolve (request, then line) waited on a line the Clear held — 40P01.
    // M269 gave the approve the cart FOR SHARE before the request, so the Clear and every resolve arm
    // that locks a line now meet at the cart; deny and close lock no line. Measured 2026-10-09: no
    // order goes red without this lock. It stays as defence in depth, a documented survivor here.
    expect: [],
    survives:
      "equivalent since M269 — the approve meets the Clear at the cart row, so no resolve can hold a request the Clear then waits on",
    why: "a Clear racing a resolve deadlocks (lines → approval against the resolve's approval → line)",
  },
  {
    id: "p2f/no-show-lines-lock-dropped",
    fn: "mms_counter_no_show",
    find: "  perform 1 from public.qr_cart_items where cart_id = p_cart_id order by id for update;\n  select array_agg",
    replace: "  select array_agg",
    // (j): the no-show reads the started dish as merely fired (A's Start is uncommitted), decides a
    // solo write-off, waits at the void and then voids a cooked dish with no manager.
    expect: ["j"],
    why: "a no-show racing a kitchen Start writes off a cooked dish as uncooked — past the manager gate",
  },
  // ── PD5b — the grace race (s · s2) ──────────────────────────────────────────────────────────────
  {
    id: "pd5b/settlement-batch-unmarked",
    fn: "mms_fire_pending_food",
    find: "  v_batch uuid := overlay(gen_random_uuid()::text placing '8' from 15 for 1)::uuid;\n",
    replace: "  v_batch uuid := gen_random_uuid();\n",
    // Both orders read the settlement's lines' version character.
    expect: ["s", "s2"],
    why: "the settlement batch unmarked: the kitchen read cannot tell the food the table had not sent from a Send, in either order",
  },
  {
    id: "pd5b/settlement-fires-cooking-lines",
    fn: "mms_fire_pending_food",
    find: "      and ci.state = 'draft'\n",
    replace: "",
    // (s): the payment waits on the Send's cart lock (PD1), so the drain runs after the Send commits
    // and, with no draft guard, RE-fires the Send's dish under its own marked batch (2, not 1) — the
    // Send's batch is gone and its number with it. (s2) stays green: the settlement fires first, and
    // both lines were drafts anyway.
    expect: ["s"],
    why: "the drain's draft guard is what leaves a Send that landed in the grace alone: without it the settlement re-stamps the Send's dish with the settlement mark",
  },
];

function restoreMigration() {
  q(RESTORE_TEXT, "restore");
}

async function runMutants() {
  // Drift first, with NOTHING written: what would this migration produce, rolled back?
  const live = q(HASHES);
  const expected = q(`begin;\n${RESTORE_TEXT}\n${HASHES}\nrollback;`)
    .split("\n")
    .filter((l) => /^mms_\w+=/.test(l))
    .join("\n");
  if (live !== expected || live.split("\n").length !== FNS.length) {
    throw new Error(
      `${TAG} REFUSED — ` +
        `the live bodies are not what ${path.basename(MIGRATION)} and its LATER restatements ` +
        `produce — another migration redefines one (or a mutant is live). Restoring would revert it, so every ` +
        `verdict would be about dead code.\n  live:\n${live}\n  migration:\n${expected}`,
    );
  }
  console.log(`\n${TAG} mutation battery — ${MUTANTS.length} mutants against the LIVE functions\n`);
  const base = await battery(false);
  if (base.length) {
    throw new Error(
      `${TAG} REFUSED — the UNMUTATED functions are already red on (${base.join(", ")})`,
    );
  }
  console.log(
    `  ${green("baseline")} ${dim(`all ${Object.keys(SCENARIOS).length} orders green on the real functions`)}`,
  );

  let bad = 0;
  let survivors = 0;
  for (const m of MUTANTS) {
    const stmt = statementFor(m.fn);
    // One edit, or several (a lock MOVED is a delete plus an insert); each must match exactly once.
    const edits = m.edits ?? [{ find: m.find, replace: m.replace }];
    const hits = edits.map((e) => (stmt ? stmt.split(e.find).length - 1 : 0));
    if (hits.some((h) => h !== 1)) {
      console.log(
        `  ${red("STALE")} ${m.id} — the edits matched ${hits.join("/")}× (want exactly 1 each)`,
      );
      bad++;
      continue;
    }
    // A function replacement, never a string: `$'`/`$&` in a replacement string are patterns.
    const mutated = edits.reduce((t, e) => t.replace(e.find, () => e.replace), stmt);
    let live_ = true;
    const restoreNow = () => {
      if (!live_) return;
      live_ = false;
      restoreMigration();
    };
    process.once("exit", restoreNow);
    process.once("SIGINT", restoreNow);
    process.once("SIGTERM", restoreNow);
    try {
      q(mutated, "mutate");
      if (q(HASHES) === live) {
        console.log(`  ${red("INERT")} ${m.id} — applied, but no body changed`);
        bad++;
        continue;
      }
      const reds = await battery(false);
      const missed = m.expect.filter((e) => !reds.includes(e));
      const leaked = reds.filter((r) => !m.expect.includes(r));
      if (!reds.length && m.survives) {
        // A DOCUMENTED survivor: applied, every order still green — the claim that no interleaving
        // here needs it, checked on every run rather than left as a comment.
        console.log(`  ${dim("survivor")} ${m.id} ${dim(`— ${m.survives}`)}`);
        survivors++;
      } else if (!reds.length) {
        console.log(`  ${red("SURVIVED")} ${m.id} — ${m.why}`);
        bad++;
      } else if (missed.length || leaked.length) {
        console.log(
          `  ${red("MISDIRECTED")} ${m.id} — want red (${m.expect.join(", ")}), got (${reds.join(", ")})`,
        );
        bad++;
      } else {
        console.log(`  ${green("caught")} ${m.id} ${dim(`by (${reds.join(", ")})`)}`);
        console.log(dim(`      ${reds.why.join("\n      ")}`));
      }
    } finally {
      restoreNow();
      process.removeListener("exit", restoreNow);
      process.removeListener("SIGINT", restoreNow);
      process.removeListener("SIGTERM", restoreNow);
    }
    if (q(HASHES) !== live) {
      throw new Error(`${TAG} FATAL — the restore after ${m.id} is not byte-identical.`);
    }
  }
  if (bad) {
    console.log(red(`\n✗ verify:counter-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
  } else {
    console.log(
      green(
        `\n✓ all ${MUTANTS.length - survivors} mutants caught` +
          (survivors ? `, ${survivors} documented survivor` : "") +
          `; bodies restored byte-identical\n`,
      ),
    );
  }
  return bad;
}

async function main() {
  assertNotATunnel();
  assertLocalOnly();
  // Mutual exclusion: fixtures are committed and swept by tag, and --mutants replaces live
  // functions. A session-level advisory lock dies with its connection, so a kill cannot wedge it.
  const guard = new Session("guard");
  if ((await guard.run(`select pg_try_advisory_lock(hashtext('p2fr-counter-race'));`)) !== "t") {
    await guard.close();
    refuse(`another counter-race run holds the advisory lock on this database`);
  }
  lockOwned = true;
  let failed = 0;
  try {
    cleanup(); // a previous run killed mid-flight
    setupManager();
    if (process.argv.includes("--mutants")) {
      failed += await runMutants();
    } else {
      console.log(
        `\n${TAG} — the counter fire vs the name clear and the sweep, one cart, two sessions\n`,
      );
      failed += (await battery(true)).length;
    }
  } finally {
    cleanup();
    await guard.close();
  }
  const left = q(
    `select count(*) from public.table_sessions
      where qr_code like '${CODE_PREFIX}%' or qr_code like '${TGT_PREFIX}%'
         or qr_code like '${DINE_PREFIX}%';`,
  );
  if (left !== "0") {
    console.log(red(`✗ cleanup left ${left} ${TAG} sessions behind`));
    failed++;
  }
  if (failed) {
    console.log(red(`\n✗ verify:counter-race — ${failed} failure(s)\n`));
    process.exit(1);
  }
  if (!process.argv.includes("--mutants")) {
    console.log(
      green(
        `\n✓ verify:counter-race — clear-first · fire-first · sweep-first · fire-before-sweep · kitchen-fire-before-clear · settle-before-clear · send-before-merge · kitchen-fire-before-merge · no-show-before-void · no-show-before-request · clear-before-resolve · resolve-mid-clear · kitchen-start-before-no-show · freeze-before-request · request-before-freeze · approve-before-settle · settle-before-approve · send-before-settlement-fire · settlement-fire-before-send\n`,
      ),
    );
  }
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
