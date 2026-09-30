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
 * WHAT THIS PROVES, and no more: the four orderings below, on one cart. The no-show, the undo and a
 * settle claim take the same cart-row lock, but no scenario here interleaves them — those orderings
 * are argued from construction and pinned single-session (P2F.15e, P2F.18), not proven here.
 *
 * ── The four orders ──────────────────────────────────────────────────────────────────────────────
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
 *       A's fire must BLOCK on S. Once S commits, A must answer `0|false-open` (nothing fired,
 *       closed) and the line must still be a draft on a closed session. Without the fire's session
 *       lock A's UPDATE reads the still-active session through its own snapshot and fires food onto
 *       the session S is closing.
 *   (d) fire-first — A fires inside an open transaction while the session is live; the session
 *       expires; S sweeps and must NOT wait (SKIP LOCKED) and must not close it; A commits, and a
 *       second sweep must leave it active too (the committed SENT line exempts it). Without the
 *       fire's session lock, or with the sweeper deciding in the same statement that locks, S reads
 *       A's uncommitted lines as drafts and closes a session the kitchen is now cooking for.
 *
 * The sweeper closes EVERY expired active session in the database it runs against — what its cron
 * does anyway; on a throwaway cluster there are only these fixtures.
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 * For each function, re-create it from THIS migration's text with its cart-row lock deleted. Each
 * mutant asserts the pattern matched exactly once, the apply succeeded and `md5(prosrc)` changed,
 * and that EXACTLY its expected scenarios went red; the restore re-applies the whole migration file
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
const TAG = "P2FR";
const CODE_PREFIX = `reg-${TAG}-`;
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
};

/** Run both scenarios; returns the ids that went red (printing when `loud`). */
async function battery(loud) {
  const red_ = [];
  red_.why = [];
  for (const [id, run] of Object.entries(SCENARIOS)) {
    const checks = await run();
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) red_.push(id);
    for (const [label, got] of bad) red_.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      const name = { a: "clear-first", b: "fire-first", c: "sweep-first", d: "fire-before-sweep" }[
        id
      ];
      console.log(`  ${bad.length ? red("✗") : green("✓")} ${name} (${id})`);
      for (const [label, got, want] of bad) {
        console.log(`      ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
    }
  }
  return red_;
}

let lockOwned = false;
function cleanup() {
  if (!localVerified || !lockOwned) return; // never sweep unverified, nor under another run
  q(`delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
       where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like '${CODE_PREFIX}%';
     delete from public.qr_carts c using public.table_sessions s
       where c.session_id = s.id and s.qr_code like '${CODE_PREFIX}%';
     delete from public.table_sessions where qr_code like '${CODE_PREFIX}%';`);
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
/** Every function this migration defines — the restore re-applies them all, so all are compared. */
const FNS = [
  "mms_clear_cart_name",
  "mms_counter_no_show",
  "mms_fire_counter_cart",
  "mms_sweep_expired_sessions",
  "mms_undo_counter_fire",
];
const HASHES = `select p.proname || '=' || md5(p.prosrc) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (${FNS.map((f) => `'${f}'`).join(", ")})
  order by 1;`;

/** This migration's `create or replace` statement for `fn`, exactly once or not at all. */
function statementFor(fn) {
  const head = `create or replace function public.${fn}(`;
  const at = MIGRATION_TEXT.indexOf(head);
  if (at < 0 || MIGRATION_TEXT.indexOf(head, at + 1) >= 0) return null;
  // The sweeper is restated in its original file's style (`end; $$;`); the rest end `end $$;`.
  const ends = ["\nend $$;", "\nend; $$;"]
    .map((t) => [MIGRATION_TEXT.indexOf(t, at), t])
    .filter(([i]) => i >= 0)
    .sort((x, y) => x[0] - y[0]);
  if (!ends.length) return null;
  const [end, term] = ends[0];
  return MIGRATION_TEXT.slice(at, end + term.length);
}

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
];

function restoreMigration() {
  q(MIGRATION_TEXT, "restore");
}

async function runMutants() {
  // Drift first, with NOTHING written: what would this migration produce, rolled back?
  const live = q(HASHES);
  const expected = q(`begin;\n${MIGRATION_TEXT}\n${HASHES}\nrollback;`)
    .split("\n")
    .filter((l) => /^mms_\w+=/.test(l))
    .join("\n");
  if (live !== expected || live.split("\n").length !== FNS.length) {
    throw new Error(
      `${TAG} REFUSED — ` +
        `the live bodies are not what ${path.basename(MIGRATION)} produces — a later migration ` +
        `redefines one (or a mutant is live). Restoring from this file would revert it, so every ` +
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
  console.log(`  ${green("baseline")} ${dim("all four orders green on the real functions")}`);

  let bad = 0;
  for (const m of MUTANTS) {
    const stmt = statementFor(m.fn);
    const hits = stmt ? stmt.split(m.find).length - 1 : 0;
    if (hits !== 1) {
      console.log(`  ${red("STALE")} ${m.id} — the lock matched ${hits}× (want exactly 1)`);
      bad++;
      continue;
    }
    // A function replacement, never a string: `$'`/`$&` in a replacement string are patterns.
    const mutated = stmt.replace(m.find, () => m.replace);
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
      if (!reds.length) {
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
      green(`\n✓ all ${MUTANTS.length} mutants caught; bodies restored byte-identical\n`),
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
    `select count(*) from public.table_sessions where qr_code like '${CODE_PREFIX}%';`,
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
        `\n✓ verify:counter-race — clear-first · fire-first · sweep-first · fire-before-sweep\n`,
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
