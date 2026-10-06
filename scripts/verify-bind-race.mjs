#!/usr/bin/env node
/**
 * M263 · J40 — the two-session harness for `mms_bind_session_table`'s row locks.
 *
 * `20261006120100_m263_bind_session_table.sql` decides the table bind under three locks, and NONE
 * of them is observable from one session: `supabase/tests/m263_bind_session_table_test.sql` runs in
 * a single transaction, where no lock acquire, no line insert and no join can interleave, and
 * `verify-mode-authority.mjs` (suite `m263`) lists each lock's deletion as a documented SURVIVOR for
 * exactly that reason. This is the missing second session.
 *
 *   · the BINDER's open cart, FOR SHARE (M263) — orders the bind against a pay-lock acquire and a
 *     split claim (both UPDATEs of that row) and fulfillment's flip to paid, and must NOT order it
 *     against a staff line insert (P2cy's own FOR SHARE);
 *   · the SHELL's open cart, row-exclusive (J40) — orders an adopt against a staff line insert, so
 *     the adopt never cancels a cart a line just landed on;
 *   · the SHELL's session row, row-exclusive (J40) — orders an adopt against a membership insert
 *     (its foreign key's KEY SHARE) and a host claim (an UPDATE), so the adopt never closes a
 *     session somebody just joined or claimed.
 *
 * ── The orders (B holds its transaction open; A calls the RPC) ───────────────────────────────────
 *
 *   (a) B takes the pay lock            → A BLOCKS on B, then answers `locked`; nothing bound.
 *   (b) B claims a split (settle_at)    → A blocks, then `settling`.
 *   (c) A binds and HOLDS               → B's lock acquire blocks on A; once A commits, B's NEXT read
 *                                          (fulfillment's snapshot) sees the number.
 *   (d) B flips the cart to paid        → A blocks, then `bound` — recorded, not prevented: a bind
 *                                          after payment labels nothing the payer reads (the paid
 *                                          order's snapshot is already taken) — the design's risk 3.
 *   (e) B inserts a line on the SHELL   → A (adopting) blocks, then `held`; the line is there.
 *   (f) B joins the SHELL (member row)  → A blocks, then `held`.
 *   (g) B claims host on the SHELL      → A blocks, then `gone` (a claimed shell is a party).
 *   (h) A adopts and HOLDS              → B's line insert blocks, then lands nothing (the cart is
 *                                          cancelled) — a CONTROL for M3 (see below).
 *   (i) B inserts a line on the BINDER  → A does NOT block, and binds — the CONTROL that tells
 *                                          FOR SHARE from a mutex.
 *
 * Every wait is observed, both ways: a statement is polled until it either appears in
 * `pg_blocking_pids` behind the named peer ("blocked") or its completion marker lands ("done").
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 *   M1  the binder's `for share` deleted        → a, b, c, d must go red; i must stay green.
 *   M2  the binder's `for share` → `for update` → i must go red (the mutex).
 *   M3  the shell cart's lock deleted           → e must go red; h stays green — the adopt's own
 *                                                 cancel UPDATE still conflicts with the insert's
 *                                                 FOR SHARE, so (h) cannot tell (red-team #4).
 *   M4  the shell session's lock deleted        → f and g must go red.
 *
 * Each mutant asserts its line matched exactly once, the apply succeeded and `md5(prosrc)` changed;
 * the restore re-applies the migration file and asserts the body is byte-identical. Before any of
 * it, the live definition is compared with what the migration produces INSIDE A ROLLED-BACK
 * TRANSACTION (full `pg_get_functiondef` + `proacl`): if a later migration redefines the function,
 * re-applying this file would revert it, so the battery refuses before writing.
 *
 * ── It COMMITS, so it refuses anything that is not local ────────────────────────────────────────
 *
 * Copied from scripts/verify-line-guard-race.mjs, layer for layer: the DSN may only name loopback
 * or a unix socket, with no libpq-redirecting parameter, and every libpq environment variable is
 * scrubbed from the children; in the database TLS must be off and the address private; a TCP host
 * must be the port `supabase status` reports (`BIND_RACE_ASSUME_DISPOSABLE=1` skips only that).
 * Fixtures are committed, tagged `M263R-` on `table_sessions.qr_code` (and the one registry row it
 * adds, table 88, `M263R-T88`), closed after every order and swept by tag in a `finally`.
 *
 * Run: `pnpm verify:bind-race` · `pnpm verify:bind-race:mutants` (the local stack), or
 *   BIND_RACE_DSN="postgresql:///postgres?host=/tmp&port=55432&user=postgres" node scripts/verify-bind-race.mjs
 * against a throwaway cluster with every migration applied.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261006120100_m263_bind_session_table.sql");
const FN = "mms_bind_session_table";
const TAG = "M263R";
const TABLE = 88;
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
  const e = { ...process.env, PGAPPNAME: `mms-m263r-${app}` };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

/** Only these may appear in the query string. `hostaddr` overrides `host` in libpq, `service`
 * reads a file, `options` rewrites GUCs — each could send a "localhost" DSN somewhere else. */
const PARAMS_OK = new Set(["host", "port", "user", "dbname", "password", "connect_timeout"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveDsn() {
  const raw =
    process.env.BIND_RACE_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let u;
  try {
    u = new URL(raw);
  } catch {
    refuse(`BIND_RACE_DSN is not a postgresql:// URL`);
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
  if (process.env.BIND_RACE_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(`  ⚠️  BIND_RACE_ASSUME_DISPOSABLE=1 — tunnel check SKIPPED (in-DB checks on)`),
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
        `  BIND_RACE_ASSUME_DISPOSABLE=1 (skips ONLY this check).`,
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
    // The RPC's answer (or its raise) must come back as DATA: under ON_ERROR_STOP a raise would end
    // the session. A subtransaction commits into its parent, so a lock taken inside it is held.
    await this.run(`create function pg_temp.m263r_try(sql text) returns text language plpgsql as
      $f$ declare v text; begin execute sql into v; return coalesce(v, '<null>');
      exception when others then return 'ERR:' || sqlerrm; end $f$;
      set lock_timeout = 0; set statement_timeout = 0;`);
    this.pid = await this.run("select pg_backend_pid();");
    return this;
  }
  write(sql) {
    const marker = `__M263R_${this.name}_${++this.seq}__`;
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
  /** A session still blocked when its order ends (an order that went red mid-wait) would hold its
   *  psql open forever and wedge the run: give it 5s, then terminate its backend. */
  async close() {
    this.proc.stdin.end();
    const stuck = setTimeout(() => {
      try {
        if (this.pid) q(`select pg_terminate_backend(${Number(this.pid)});`, "reaper");
      } catch {
        /* deliberate: the session may already be gone; the exit below is what we wait on */
      }
    }, 5000);
    await this.dead;
    clearTimeout(stuck);
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
// One qr_code per FIXTURE (the token index is unique among ACTIVE rows, and `--mutants` re-runs
// every order — verify-line-guard-race.mjs went red in CI on exactly that), and every order closes
// what it opened so table 88 is free for the next.
const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`;
let fixtureSeq = 0;

/** A live dine-in session with one open cart; `table` null = unbound (the binder), 88 = the shell. */
function session(kind, table) {
  const host = table === null ? "gen_random_uuid()" : "null";
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status, host_seat, table_number, expires_at)
      values ('${TAG}-${kind}-${RUN}-${++fixtureSeq}', 'dinein', 'active', ${host},
              ${table === null ? "null" : table}, now() + interval '1 hour')
      returning id
    ), c as (
      insert into public.qr_carts (session_id) select id from s returning id
    )
    select (select id from s), (select id from c);`);
  const [id, cart] = out.split("|");
  if (!id || !cart) throw new Error(`${TAG} fixture ${kind} did not resolve: ${out}`);
  return { id, cart };
}
const closeAll = () =>
  q(`update public.table_sessions set status = 'closed'
       where qr_code like '${TAG}-%' and status = 'active' and qr_code <> '${TAG}-T${TABLE}';`);

const bind = (b, shell = null) =>
  `select pg_temp.m263r_try($q$select outcome || ':' || coalesce(at_table::text, '')
     from public.${FN}('${b.id}'::uuid, ${TABLE}${shell ? `, '${shell.id}'::uuid` : ""})$q$);`;
const insertLine = (cart) =>
  `select pg_temp.m263r_try($q$select coalesce(public.mms_cart_item_insert_if_open('${cart}'::uuid,
     '${TAG}-dish', 'Mohinga', '[]'::jsonb, 1400, 147, null::uuid, 'dinein')::text, '<null>')$q$);`;
const tableOf = (s) =>
  `select coalesce(table_number::text, 'null') from public.table_sessions where id = '${s.id}';`;
const statusOf = (s) => `select status from public.table_sessions where id = '${s.id}';`;
const lines = (cart) => `select count(*) from public.qr_cart_items where cart_id = '${cart}';`;

/** A holds nothing; B holds `hold` open; A's bind must wait for B and then answer `want`. */
async function bHoldsThenABinds(hold, aSql, check) {
  const a = await new Session("a").open();
  const b = await new Session("b").open();
  try {
    await b.run("begin;");
    const held = await b.run(hold);
    a.fire(aSql);
    const how = await blockedOrDone(a, b);
    await b.run("commit;");
    const res = await a.collect();
    return check({ held, how, res });
  } finally {
    await a.close();
    await b.close();
  }
}

/** Each order returns [label, got, want] triples; any mismatch reddens it. */
const ORDERS = {
  async a() {
    const b = session("B", null);
    try {
      return await bHoldsThenABinds(
        `update public.qr_carts set locked = true, locked_at = now(), locked_by = gen_random_uuid()
           where id = '${b.cart}' returning 'held';`,
        bind(b),
        ({ how, res }) => [
          ["A waited for the lock acquire", how, "blocked"],
          ["A refused", res, "locked:"],
          ["nothing bound", q(tableOf(b)), "null"],
        ],
      );
    } finally {
      closeAll();
    }
  },
  async b() {
    const b = session("B", null);
    try {
      return await bHoldsThenABinds(
        `update public.qr_carts set settle_at = now(), settle_by = gen_random_uuid()
           where id = '${b.cart}' and settle_at is null returning 'held';`,
        bind(b),
        ({ how, res }) => [
          ["A waited for the split claim", how, "blocked"],
          ["A refused", res, "settling:"],
          ["nothing bound", q(tableOf(b)), "null"],
        ],
      );
    } finally {
      closeAll();
    }
  },
  async c() {
    const b = session("B", null);
    const a = await new Session("a").open();
    const l = await new Session("l").open();
    try {
      await a.run("begin;");
      const res = await a.run(bind(b));
      await l.run("begin;");
      l.fire(
        `update public.qr_carts set locked = true, locked_at = now() where id = '${b.cart}' returning 'locked';`,
      );
      const how = await blockedOrDone(l, a);
      // A lock acquire that did NOT wait runs its next read while A is uncommitted — the real race,
      // so A commits only after it. One that waited cannot finish until A commits.
      if (how === "blocked") await a.run("commit;");
      await l.collect();
      const seen = await l.run(tableOf(b)); // the charge's NEXT statement (fulfillment's snapshot)
      if (how === "done") await a.run("commit;");
      await l.run("rollback;");
      return [
        ["A bound", res, `bound:${TABLE}`],
        ["the lock acquire waited for the bind", how, "blocked"],
        ["the charge's next read sees the number", seen, String(TABLE)],
      ];
    } finally {
      await a.close();
      await l.close();
      closeAll();
    }
  },
  async d() {
    const b = session("B", null);
    try {
      return await bHoldsThenABinds(
        `update public.qr_carts set status = 'paid' where id = '${b.cart}' returning 'held';`,
        bind(b),
        ({ how, res }) => [
          ["A waited for the flip to paid", how, "blocked"],
          ["A bound after it (recorded: risk 3)", res, `bound:${TABLE}`],
        ],
      );
    } finally {
      closeAll();
    }
  },
  async e() {
    const b = session("B", null);
    const sh = session("S", TABLE);
    try {
      return await bHoldsThenABinds(insertLine(sh.cart), bind(b, sh), ({ held, how, res }) => [
        ["B's line landed", /^[0-9a-f-]{36}$/.test(held) ? "uuid" : held, "uuid"],
        ["A waited for the line", how, "blocked"],
        ["A answered held", res, "held:"],
        ["the shell is still live", q(statusOf(sh)), "active"],
        ["the line is on its cart", q(lines(sh.cart)), "1"],
      ]);
    } finally {
      closeAll();
    }
  },
  async f() {
    const b = session("B", null);
    const sh = session("S", TABLE);
    try {
      return await bHoldsThenABinds(
        `insert into public.session_members (session_id, seat_id, display_name, role)
           values ('${sh.id}', gen_random_uuid(), 'Bo', 'guest') returning 'held';`,
        bind(b, sh),
        ({ how, res }) => [
          ["A waited for the join", how, "blocked"],
          ["A answered held", res, "held:"],
          ["the shell is still live", q(statusOf(sh)), "active"],
        ],
      );
    } finally {
      closeAll();
    }
  },
  async g() {
    const b = session("B", null);
    const sh = session("S", TABLE);
    try {
      return await bHoldsThenABinds(
        `update public.table_sessions set host_seat = gen_random_uuid()
           where id = '${sh.id}' and host_seat is null returning 'held';`,
        bind(b, sh),
        ({ how, res }) => [
          ["A waited for the host claim", how, "blocked"],
          ["A answered gone (a claimed shell is a party)", res, "gone:"],
          ["the claimed shell is still live", q(statusOf(sh)), "active"],
        ],
      );
    } finally {
      closeAll();
    }
  },
  async h() {
    const b = session("B", null);
    const sh = session("S", TABLE);
    const a = await new Session("a").open();
    const l = await new Session("l").open();
    try {
      await a.run("begin;");
      const res = await a.run(bind(b, sh));
      l.fire(insertLine(sh.cart));
      const how = await blockedOrDone(l, a);
      await a.run("commit;");
      const landed = await l.collect();
      return [
        ["A adopted", res, `adopted:${TABLE}`],
        ["the line insert waited for the adopt", how, "blocked"],
        ["it landed nothing on the cancelled cart", landed, "<null>"],
        ["no line on the shell's cart", q(lines(sh.cart)), "0"],
      ];
    } finally {
      await a.close();
      await l.close();
      closeAll();
    }
  },
  async i() {
    const b = session("B", null);
    const a = await new Session("a").open();
    const l = await new Session("l").open();
    try {
      await l.run("begin;");
      const landed = await l.run(insertLine(b.cart));
      a.fire(bind(b));
      const how = await blockedOrDone(a, l);
      // A bind that waited (the mutex mutant) cannot finish until the insert commits; one that did
      // not is collected while the insert is still open — the real overlap.
      if (how === "blocked") await l.run("commit;");
      const res = await a.collect();
      if (how === "done") await l.run("commit;");
      return [
        ["B's line landed", /^[0-9a-f-]{36}$/.test(landed) ? "uuid" : landed, "uuid"],
        ["A did NOT wait for a line insert", how, "done"],
        ["A bound", res, `bound:${TABLE}`],
      ];
    } finally {
      await a.close();
      await l.close();
      closeAll();
    }
  },
};

/** Run every order; returns the ids that went red (printing when `loud`). */
async function battery(loud) {
  const red_ = [];
  red_.why = [];
  for (const [id, run] of Object.entries(ORDERS)) {
    const checks = await run();
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) red_.push(id);
    for (const [label, got] of bad) red_.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      console.log(`  ${bad.length ? red("✗") : green("✓")} (${id})`);
      for (const [label, got, want] of bad) {
        console.log(`      ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
    }
  }
  return red_;
}

let lockOwned = false;
let registryOwned = false;
function cleanup() {
  if (!localVerified || !lockOwned) return; // never sweep unverified, nor under another run
  q(`delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
       where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.session_members m using public.table_sessions s
       where m.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.qr_carts c using public.table_sessions s
       where c.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.table_sessions where qr_code like '${TAG}-%';`);
  if (registryOwned) q(`delete from public.qr_tables where qr_code = '${TAG}-T${TABLE}';`);
}

/** The one registry row the orders bind to: ours (tagged), or the run refuses. */
function ensureRegistry() {
  const owner = q(`select qr_code from public.qr_tables where table_number = ${TABLE};`);
  if (owner === "") {
    q(
      `insert into public.qr_tables (table_number, qr_code, active) values (${TABLE}, '${TAG}-T${TABLE}', true);`,
    );
    registryOwned = true;
    return;
  }
  if (owner !== `${TAG}-T${TABLE}`) {
    refuse(`table ${TABLE} is registered to ${JSON.stringify(owner)} — this harness needs it free`);
  }
  registryOwned = true; // a previous run killed mid-flight left it
  const live = q(`select count(*) from public.table_sessions
                   where table_number = ${TABLE} and status = 'active' and mode = 'dinein';`);
  if (live !== "0") refuse(`table ${TABLE} has a live dine-in session that is not this harness's`);
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
const IDENTITY = `select md5(pg_get_functiondef(p.oid)) || '|' ||
    coalesce(array_to_string(p.proacl::text[], ','), '(default)')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '${FN}';`;
const HASH = `select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '${FN}';`;

/** Each mutant rewrites ONE line, found by the comment the migration pins it with. */
const MUTANTS = [
  {
    id: "M1/binder-for-share-deleted",
    line: /^\s*for share;\s+-- M263: a freeze writer's UPDATE/,
    to: (l) => l.replace("for share;", ";"),
    expect: ["a", "b", "c", "d"],
    why: "the M263 hole: a lock acquire, a split claim or the flip to paid commits mid-call and the freshness read never sees it",
  },
  {
    id: "M2/binder-for-share-is-a-mutex",
    line: /^\s*for share;\s+-- M263: a freeze writer's UPDATE/,
    to: (l) => l.replace("for share;", "for update;"),
    expect: ["i"],
    why: "over-locking: correct against a charge, but every bind queues behind every staff line insert",
  },
  {
    id: "M3/shell-cart-lock-deleted",
    line: /^\s*for update;\s+-- J40: a staff line/,
    to: (l) => l.replace("for update;", ";"),
    expect: ["e"],
    why: "a staff line inserted mid-adopt is invisible to the 'no line' check, and the adopt cancels the cart it landed on",
  },
  {
    id: "M4/shell-row-lock-deleted",
    line: /^\s*for update;\s+-- J40: a membership insert/,
    to: (l) => l.replace("for update;", ";"),
    expect: ["f", "g"],
    why: "a join or a host claim mid-adopt is invisible to the checks, and the adopt closes the session somebody just joined or claimed",
  },
];

function restoreMigration() {
  q(MIGRATION_TEXT, "restore");
}

async function runMutants() {
  // Drift first, with NOTHING written: what would this migration produce, rolled back?
  const live = q(IDENTITY);
  const expected = q(`begin;\n${MIGRATION_TEXT}\n${IDENTITY}\nrollback;`)
    .split("\n")
    .filter((l) => /^[0-9a-f]{32}\|/.test(l))
    .join("\n");
  if (!live || live !== expected) {
    throw new Error(
      `${TAG} REFUSED — the live ${FN} is not what ${path.basename(MIGRATION)} produces — a later ` +
        `migration redefines it (or a mutant is live, or it is missing). Restoring from this file ` +
        `would revert it, so every verdict would be about dead code.\n  live: ${live}\n  migration: ${expected}`,
    );
  }
  const baseHash = q(HASH);
  console.log(`\n${TAG} mutation battery — ${MUTANTS.length} mutants against the LIVE function\n`);
  const reds0 = await battery(false);
  if (reds0.length) {
    throw new Error(`${TAG} REFUSED — the UNMUTATED ${FN} is already red on (${reds0.join(", ")})`);
  }
  console.log(
    `  ${green("baseline")} ${dim(`all ${Object.keys(ORDERS).length} orders green on the real function`)}`,
  );

  let bad = 0;
  for (const m of MUTANTS) {
    const textLines = MIGRATION_TEXT.split("\n");
    const hits = textLines.filter((l) => m.line.test(l));
    if (hits.length !== 1) {
      console.log(`  ${red("STALE")} ${m.id} — the line matched ${hits.length}× (want exactly 1)`);
      bad++;
      continue;
    }
    const mutated = textLines.map((l) => (m.line.test(l) ? m.to(l) : l)).join("\n");
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
      if (q(HASH) === baseHash) {
        console.log(`  ${red("INERT")} ${m.id} — applied, but the body did not change`);
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
        console.log(dim(`      ${reds.why.join("\n      ")}`));
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
    if (q(IDENTITY) !== live) {
      throw new Error(`${TAG} FATAL — the restore after ${m.id} is not byte-identical.`);
    }
  }
  if (bad) {
    console.log(red(`\n✗ verify:bind-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
  } else {
    console.log(
      green(`\n✓ all ${MUTANTS.length} mutants caught; the body restored byte-identical\n`),
    );
  }
  return bad;
}

async function main() {
  assertNotATunnel();
  assertLocalOnly();
  // Mutual exclusion: fixtures are committed and swept by tag, and --mutants replaces the live
  // function. A session-level advisory lock dies with its connection, so a kill cannot wedge it.
  const guard = new Session("guard");
  if ((await guard.run(`select pg_try_advisory_lock(hashtext('m263r-bind-race'));`)) !== "t") {
    await guard.close();
    refuse(`another bind-race run holds the advisory lock on this database`);
  }
  lockOwned = true;
  let failed = 0;
  try {
    cleanup(); // a previous run killed mid-flight
    ensureRegistry();
    if (process.argv.includes("--mutants")) {
      failed += await runMutants();
    } else {
      console.log(`\n${TAG} — the bind's row locks against real concurrent writers\n`);
      failed += (await battery(true)).length;
    }
  } finally {
    cleanup();
    await guard.close();
  }
  const left = q(`select count(*) from public.table_sessions where qr_code like '${TAG}-%';`);
  if (left !== "0") {
    console.log(red(`✗ cleanup left ${left} ${TAG} sessions behind`));
    failed++;
  }
  if (failed) {
    console.log(red(`\n✗ verify:bind-race — ${failed} failure(s)\n`));
    process.exit(1);
  }
  if (!process.argv.includes("--mutants")) {
    console.log(
      green(
        `\n✓ verify:bind-race — ${Object.keys(ORDERS).length} orders (a–i), every wait observed\n`,
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
