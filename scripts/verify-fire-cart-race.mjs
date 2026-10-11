#!/usr/bin/env node
/**
 * PD1 — the two-session harness for the diner Send's lock order (the blind pass on #335).
 *
 * `20261008123000_pd1_send_nudge.sql` restates `mms_fire_cart` (the host's Send and the console's)
 * to clear the guest's "Let {host} know" stamp, and adds `mms_nudge_host`. Its first draft cleared
 * the stamp AFTER locking the lines — `UPDATE qr_cart_items … FROM qr_carts` locks the LINES, and the
 * clear's `UPDATE qr_carts` came second — while the three line RPCs (P2cy) take the cart `for share`
 * FIRST and the line second: a tablemate's "+" racing the host's Send was a wait cycle, and Postgres
 * kills one side with 40P01. Both functions now take the cart row `for no key update` FIRST
 * (cart → line, the order m261 records), and the nudge decides in a statement AFTER that lock.
 *
 * `supabase/tests/pd1_send_nudge_test.sql` runs in ONE transaction, where nothing interleaves: it
 * proves each lock is TAKEN (PD1.16 · PD1.17, a line-less cart's `xmax`), never its ORDER. This is
 * the second session.
 *
 * ── The orders ──────────────────────────────────────────────────────────────────────────────
 *
 *   (a) add-first — B opens a transaction and takes the cart `for share`: EXACTLY the first statement
 *       `mms_cart_item_inc_qty` runs (P2dd §2), so B stands where a real add stands between its cart
 *       lock and its line write. A's fire must BLOCK on B. B then runs the add itself ("+" on Thiri's
 *       draft) and it must answer 'ok' WITHOUT waiting; B commits; A must fire the line, now qty 2.
 *       With the cart lock moved after the lines (the first draft's order) A holds the line while it
 *       waits for the cart, B's add waits for the line: 40P01, one side answers 'deadlock'.
 *   (b) fire-first — A fires inside an open transaction; B's add must BLOCK on A and, once A commits,
 *       answer 'sent' — P2dd's 'line already sent', on which the app inserts a fresh draft (an add
 *       after a Send is a new line in the order model). The line stays fired at qty 1.
 *   (c) qty-first — (a) with `mms_cart_item_set_qty_if_open` (a stepper to 3): same lock, same proof.
 *   (d) fire-first — (b) with the stepper: 'sent', the fired line keeps qty 1.
 *   (e) fire-first — A fires inside an open transaction; B's nudge must BLOCK on A and, once A
 *       commits, answer 'nothing_to_send' with no stamp written: the dishes it would name are gone.
 *       Without the nudge's own cart lock B waits only because A holds the row, and then decides from
 *       the snapshot it took BEFORE A committed — the stamp lands on a cart with nothing to send.
 *   (f) nudge-first — B nudges inside an open transaction ('ok'); A's fire must BLOCK on B and, once
 *       B commits, fire the line AND clear the stamp: the answered wait leaves the host's phone in
 *       the same transaction as the dishes.
 *   (g) merge-first — M merges the table into another (`mms_merge_table_orders` locks BOTH carts
 *       first, then re-parents the lines) inside an open transaction; A's fire on the source must
 *       BLOCK on M and, once M commits, fire nothing — the source is cancelled, its line moved.
 *   (h) fire-first — A fires inside an open transaction; M's merge must BLOCK on A and, once A
 *       commits, finish (no deadlock, no error) with the fired line moved onto the target. (g) and (h)
 *       are the blind pass's open question — "the merge as a second deadlock partner" — answered:
 *       both take a cart first, so they meet at the cart and never at a line.
 *
 * Every wait is read from `pg_blocking_pids`, never a sleep. Each RPC runs inside a `pg_temp`
 * wrapper that turns 40P01 (and P2dd's two P0001 refusals) into DATA, so a deadlock is a verdict and
 * never a crashed session.
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 * Each mutant patches THIS migration's text (the find must match exactly once), applies the whole
 * patched file (it is idempotent), asserts `md5(prosrc)` changed and that EXACTLY its expected orders
 * went red; the restore re-applies the original file and asserts every body is byte-identical. A
 * green baseline runs first, and before anything is written the live bodies are compared with what
 * the migration produces INSIDE A ROLLED-BACK TRANSACTION — if a later migration redefines one of
 * these functions, restoring from this file would revert it, so the battery refuses.
 *
 * ── It COMMITS, so it refuses anything that is not local ────────────────────────────────────────
 *
 * Two sessions must see the fixtures, so they are committed, tagged `PD1R-` / `PD1RT-` on
 * `table_sessions.qr_code`, and swept by tag in a `finally`. The DSN defaults to the local supabase
 * stack; `FIRE_RACE_DSN` may point elsewhere, but only at loopback or a unix-socket directory, with
 * the libpq scrubbing, in-DB TLS/address checks and `supabase status` tunnel check of
 * scripts/verify-counter-fire-race.mjs (whose layers this copies); `FIRE_RACE_ASSUME_DISPOSABLE=1`
 * skips only the tunnel check.
 *
 * Run: `pnpm verify:fire-cart-race` · `pnpm verify:fire-cart-race:mutants` (the local stack), or
 *   FIRE_RACE_DSN="postgresql://postgres@127.0.0.1:54391/postgres" FIRE_RACE_ASSUME_DISPOSABLE=1 \
 *     node scripts/verify-fire-cart-race.mjs
 * against a throwaway cluster with every migration applied (how it was first proved: PG16, 2026-10-09).
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261008123000_pd1_send_nudge.sql");
const TAG = "PD1R";
const CODE_PREFIX = `${TAG}-`;
/** The merge target: another dine-in table, tagged apart so the cleanup finds it. */
const TGT_PREFIX = `${TAG}T-`;
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
  const e = { ...process.env, PGAPPNAME: `mms-pd1r-${app}` };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

/** Only these may appear in the query string. `hostaddr` overrides `host` in libpq, `service`
 * reads a file, `options` rewrites GUCs — each could send a "localhost" DSN somewhere else. */
const PARAMS_OK = new Set(["host", "port", "user", "dbname", "password", "connect_timeout"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveDsn() {
  const raw =
    process.env.FIRE_RACE_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let u;
  try {
    u = new URL(raw);
  } catch {
    refuse(`FIRE_RACE_DSN is not a postgresql:// URL`);
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
  if (process.env.FIRE_RACE_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(`  ⚠️  FIRE_RACE_ASSUME_DISPOSABLE=1 — tunnel check SKIPPED (in-DB checks on)`),
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
        `  FIRE_RACE_ASSUME_DISPOSABLE=1 (skips ONLY this check).`,
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
      current_setting('lock_timeout'), current_setting('statement_timeout'),
      current_setting('deadlock_timeout')`);
  const [ssl, addr, priv, lockTo, stmtTo, dlTo] = out.split("|");
  console.log(
    dim(
      `  server: ssl=${ssl} addr=${addr} private=${priv} lock_timeout=${lockTo} stmt=${stmtTo} deadlock_timeout=${dlTo}`,
    ),
  );
  if (ssl !== "f" || priv !== "t") {
    refuse(
      `ssl=${ssl} (want f) addr=${addr} private=${priv} (want t). Hosted Supabase is TLS on a public ` +
        `address; a local stack is neither. Do not relax this to make a run work.`,
    );
  }
  localVerified = true;
}

/**
 * Each RPC behind a wrapper that answers in DATA. Under ON_ERROR_STOP a raise would end the session,
 * and a deadlock IS the verdict (a): `deadlock` as a string, P2dd's 'line already sent' as `sent`.
 * A subtransaction commits into its parent, so a lock taken inside it is held to COMMIT.
 */
const HELPERS = `
  create function pg_temp.r_fire(p uuid) returns text language plpgsql as $f$
  declare v integer;
  begin select fired into v from public.mms_fire_cart(p); return v::text;
  exception when deadlock_detected then return 'deadlock'; end $f$;
  create function pg_temp.r_share(p uuid) returns text language plpgsql as $f$
  begin perform 1 from public.qr_carts where id = p for share; return 'held';
  exception when deadlock_detected then return 'deadlock'; end $f$;
  create function pg_temp.r_inc(p uuid) returns text language plpgsql as $f$
  begin perform public.mms_cart_item_inc_qty(p, 1); return 'ok';
  exception
    when deadlock_detected then return 'deadlock';
    when raise_exception then
      return case when sqlerrm = 'line already sent' then 'sent' else 'refused: ' || sqlerrm end;
  end $f$;
  create function pg_temp.r_qty(p uuid, n integer) returns text language plpgsql as $f$
  declare v integer;
  begin v := public.mms_cart_item_set_qty_if_open(p, n); return 'ok:' || v;
  exception
    when deadlock_detected then return 'deadlock';
    when raise_exception then
      return case when sqlerrm = 'line already sent' then 'sent' else 'refused: ' || sqlerrm end;
  end $f$;
  create function pg_temp.r_nudge(p uuid, seat uuid) returns text language plpgsql as $f$
  declare v text;
  begin select reason into v from public.mms_nudge_host(p, seat); return v;
  exception when deadlock_detected then return 'deadlock'; end $f$;
  create function pg_temp.r_merge(src uuid, tgt uuid) returns text language plpgsql as $f$
  declare v integer;
  begin v := public.mms_merge_table_orders(src, tgt); return v::text;
  exception when deadlock_detected then return 'deadlock'; end $f$;`;

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
    await this.run(`set lock_timeout = 0; set statement_timeout = 0;${HELPERS}`);
    this.pid = await this.run("select pg_backend_pid();");
    return this;
  }
  write(sql) {
    const marker = `__PD1R_${this.name}_${++this.seq}__`;
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

/**
 * Run `sql` on `s` and report whether it had to WAIT for `peer` on the way. A statement that should
 * not wait (a's add, while B already holds the cart) is fired and watched rather than `run`, so a
 * deadlock-detector pause shows up as a wait instead of passing silently.
 */
async function runWatching(s, peer, sql) {
  s.fire(sql);
  const how = await blockedOrDone(s, peer);
  const got = await s.collect();
  return { how, got };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
// One dine-in table: a host (Aye), a guest (Thiri) and an open cart holding Thiri's ONE dine-in
// draft — exactly what `mms_fire_cart` fires and what a nudge asks it to. One qr_code per fixture:
// `table_sessions_active_qr_uniq` refuses a second active session on a code, and `--mutants` re-runs
// every order.
const AYE = "00000000-0000-0000-0000-00000000a4e1";
const THIRI = "00000000-0000-0000-0000-00000000111b";
const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`;
let fixtureSeq = 0;

function table(prefix, id, withLine) {
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status, host_seat, expires_at)
      values ('${prefix}${id}-${RUN}-${++fixtureSeq}', 'dinein', 'active', '${AYE}',
              clock_timestamp() + interval '12 hours') returning id
    ), m as (
      insert into public.session_members (session_id, seat_id, role, display_name)
      select id, '${AYE}'::uuid, 'host', 'Aye' from s
      union all select id, '${THIRI}'::uuid, 'guest', 'Thiri' from s
      returning id
    ), c as (
      insert into public.qr_carts (session_id) select id from s returning id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
      select c.id, '${TAG}-dish', 'Mohinga', 1, 1400, 147, '${THIRI}', 'dinein' from c
       where ${withLine ? "true" : "false"}
      returning id
    )
    select (select id from s), (select id from c), coalesce((select id::text from i), ''),
           (select count(*) from m);`);
  const [session, cart, line, members] = out.split("|");
  if (!session || !cart || (withLine && !line) || members !== "2") {
    throw new Error(`${TAG} fixture ${id} did not resolve: ${out}`);
  }
  return {
    session,
    cart,
    line,
    /** The line as the kitchen sees it: state · qty · which cart it is on now. */
    lineNow: () =>
      q(`select i.state || '|' || i.qty || '|' || (i.cart_id = '${cart}')
           from public.qr_cart_items i where i.id = '${line}';`),
    /** The stamp: `none`, or the seat that nudged. */
    stamp: () =>
      q(
        `select coalesce(send_nudge_seat::text, 'none') from public.qr_carts where id = '${cart}';`,
      ),
    cartStatus: () => q(`select status from public.qr_carts where id = '${cart}';`),
  };
}
const fixture = (id) => table(CODE_PREFIX, id, true);
const target = (id) => table(TGT_PREFIX, id, false);

const fire = (f) => `select pg_temp.r_fire('${f.cart}'::uuid);`;
const share = (f) => `select pg_temp.r_share('${f.cart}'::uuid);`;
const inc = (f) => `select pg_temp.r_inc('${f.line}'::uuid);`;
const setQty = (f, n) => `select pg_temp.r_qty('${f.line}'::uuid, ${n});`;
const nudge = (f) => `select pg_temp.r_nudge('${f.cart}'::uuid, '${THIRI}'::uuid);`;
const merge = (f, t) => `select pg_temp.r_merge('${f.cart}'::uuid, '${t.cart}'::uuid);`;

/** Each order returns [label, got, want] triples; any mismatch reddens it. */
const SCENARIOS = {
  // (a) add-first: B holds the cart as `inc_qty`'s first statement does; A's fire waits on the
  // CART; B's add then finishes without waiting; A fires what B added.
  async a() {
    const f = fixture("a");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const held = await b.run(share(f));
      a.fire(fire(f));
      const how = await blockedOrDone(a, b);
      // The add runs while A waits. With the cart lock first, A holds nothing B needs.
      const add = await runWatching(b, a, inc(f));
      // The wrappers catch 40P01 inside a subtransaction, so B's outer transaction is intact
      // either way, and A ran in autocommit: nothing here needs a rollback.
      await b.run("commit;");
      const fired = await a.collect();
      return [
        ["B holds the cart as the add's first statement does", held, "held"],
        ["A's fire waited for the add's cart lock", how, "blocked"],
        ["B's add finished without waiting on A", add.how, "done"],
        ["B's add went through", add.got, "ok"],
        ["A fired the line (no deadlock)", fired, "1"],
        ["the line is fired WITH the add", f.lineNow(), "fired|2|true"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (b) fire-first: the add waits on the Send, then meets P2dd's answer.
  async b() {
    const f = fixture("b");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fire(f));
      b.fire(inc(f));
      const how = await blockedOrDone(b, a);
      await a.run("commit;");
      const add = await b.collect();
      return [
        ["A fired the line", fired, "1"],
        ["B's add waited for the Send", how, "blocked"],
        ["B's add met a sent line (the app inserts a fresh draft)", add, "sent"],
        ["the fired line kept its qty", f.lineNow(), "fired|1|true"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (c) qty-first: (a) with the stepper.
  async c() {
    const f = fixture("c");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const held = await b.run(share(f));
      a.fire(fire(f));
      const how = await blockedOrDone(a, b);
      const step = await runWatching(b, a, setQty(f, 3));
      await b.run("commit;");
      const fired = await a.collect();
      return [
        ["B holds the cart as the stepper's first statement does", held, "held"],
        ["A's fire waited for the stepper's cart lock", how, "blocked"],
        ["B's stepper finished without waiting on A", step.how, "done"],
        ["B's stepper went through", step.got, "ok:1"],
        ["A fired the line (no deadlock)", fired, "1"],
        ["the line is fired at the stepped qty", f.lineNow(), "fired|3|true"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (d) fire-first: the stepper waits on the Send, then meets P2dd's answer.
  async d() {
    const f = fixture("d");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fire(f));
      b.fire(setQty(f, 3));
      const how = await blockedOrDone(b, a);
      await a.run("commit;");
      const step = await b.collect();
      return [
        ["A fired the line", fired, "1"],
        ["B's stepper waited for the Send", how, "blocked"],
        ["B's stepper met a sent line", step, "sent"],
        ["the fired line kept its qty", f.lineNow(), "fired|1|true"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (e) fire-first: a nudge racing the Send decides AFTER it, from a fresh snapshot.
  async e() {
    const f = fixture("e");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fire(f));
      b.fire(nudge(f));
      const how = await blockedOrDone(b, a);
      await a.run("commit;");
      const answer = await b.collect();
      return [
        ["A fired the line", fired, "1"],
        ["B's nudge waited for the Send", how, "blocked"],
        ["B's nudge found nothing left to send", answer, "nothing_to_send"],
        ["no stamp on a cart whose dishes are gone", f.stamp(), "none"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (f) nudge-first: the Send waits on the nudge, then fires AND clears it.
  async f() {
    const f = fixture("f");
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const answer = await b.run(nudge(f));
      a.fire(fire(f));
      const how = await blockedOrDone(a, b);
      await b.run("commit;");
      const fired = await a.collect();
      return [
        ["B's nudge landed", answer, "ok"],
        ["A's fire waited for the nudge", how, "blocked"],
        ["A fired the line", fired, "1"],
        ["the answered wait left with the dishes", f.stamp(), "none"],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  // (g) merge-first: the merge holds both carts; the fire waits at the CART and then fires nothing.
  async g() {
    const f = fixture("g");
    const t = target("g");
    const a = await new Session("a").open();
    const m = await new Session("m").open();
    try {
      await m.run("begin;");
      const moved = await m.run(merge(f, t));
      a.fire(fire(f));
      const how = await blockedOrDone(a, m);
      await m.run("commit;");
      const fired = await a.collect();
      return [
        ["M merged the table (one line moved)", moved, "1"],
        ["A's fire waited for the merge", how, "blocked"],
        ["A fired nothing on the cancelled source (no deadlock)", fired, "0"],
        ["the source is cancelled", f.cartStatus(), "cancelled"],
      ];
    } finally {
      await a.close();
      await m.close();
    }
  },
  // (h) fire-first: the merge waits at the cart for the Send, then finishes.
  async h() {
    const f = fixture("h");
    const t = target("h");
    const a = await new Session("a").open();
    const m = await new Session("m").open();
    try {
      await a.run("begin;");
      const fired = await a.run(fire(f));
      m.fire(merge(f, t));
      const how = await blockedOrDone(m, a);
      await a.run("commit;");
      const moved = await m.collect();
      return [
        ["A fired the line", fired, "1"],
        ["M's merge waited for the Send", how, "blocked"],
        ["M's merge finished (no deadlock)", moved, "1"],
        ["the fired line moved onto the target", f.lineNow(), "fired|1|false"],
      ];
    } finally {
      await a.close();
      await m.close();
    }
  },
};
const NAMES = {
  a: "add-first",
  b: "fire-before-add",
  c: "qty-first",
  d: "fire-before-qty",
  e: "fire-before-nudge",
  f: "nudge-first",
  g: "merge-first",
  h: "fire-before-merge",
};

/** Run every order; returns the ids that went red (printing when `loud`). */
async function battery(loud) {
  const red_ = [];
  red_.why = [];
  for (const [id, run] of Object.entries(SCENARIOS)) {
    const checks = await run();
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) red_.push(id);
    for (const [label, got] of bad) red_.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      console.log(`  ${bad.length ? red("✗") : green("✓")} ${NAMES[id]} (${id})`);
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
  for (const prefix of [CODE_PREFIX, TGT_PREFIX]) {
    q(`delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
         where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.qr_carts c using public.table_sessions s
         where c.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.session_members m using public.table_sessions s
         where m.session_id = s.id and s.qr_code like '${prefix}%';
       delete from public.table_sessions where qr_code like '${prefix}%';`);
  }
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
/** Every function this migration defines — the restore re-applies them all, so all are compared. */
const FNS = ["mms_fire_cart", "mms_nudge_host"];
const HASHES = `select p.proname || '=' || md5(p.prosrc) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (${FNS.map((f) => `'${f}'`).join(", ")})
  order by 1;`;

const FIRE_LOCK =
  "  perform 1 from public.qr_carts where id = p_cart_id for no key update;   -- PD1: the cart row first (cart → line)\n";
const MUTANTS = [
  {
    id: "pd1/fire-cart-lock-dropped",
    edits: [{ find: FIRE_LOCK, replace: "" }],
    // (a)/(c): the fire takes no cart lock, so it never waits for the add holding the cart.
    // (e): the nudge's cart lock no longer waits for the fire, so its UPDATE reads the fire's
    // uncommitted lines as drafts and the stamp lands on a cart whose dishes then go.
    // (f): the fire's statement no longer waits for the nudge, so its snapshot predates the stamp,
    // the clear's `send_nudge_at is not null` matches nothing, and the stamp outlives the dishes.
    // (Measured: the first run of this battery expected a/c/e and got a/c/e/f — the clear's
    // stamp condition reads the statement's snapshot, so ORDER is what makes it see the nudge.)
    expect: ["a", "c", "e", "f"],
    why: "the fire is ordered against nothing at the cart: an add's line and a nudge's decision race it",
  },
  {
    id: "pd1/fire-cart-lock-after-the-lines",
    edits: [
      { find: FIRE_LOCK, replace: "" },
      {
        find: "  select count(*) into n from fired_lines;\n",
        replace:
          "  select count(*) into n from fired_lines;\n  perform 1 from public.qr_carts where id = p_cart_id for no key update;\n",
      },
    ],
    // (a)/(c): the first draft's order — the fire holds the line and waits for the cart the add
    // holds; the add waits for the line: 40P01. (f): the fire's statement runs before its (late)
    // cart lock, from a snapshot without the nudge's uncommitted stamp, so the clear matches
    // nothing and the stamp outlives the dishes (measured; the first run expected a/c only).
    // (e) stays green: the fire runs whole, lock included, before the nudge starts.
    expect: ["a", "c", "f"],
    why: "the blind pass's CRITICAL on #335: lines then cart, against the line RPCs' cart then line — a deadlock",
  },
  {
    id: "pd1/nudge-cart-lock-dropped",
    edits: [
      {
        find: "  perform 1 from public.qr_carts where id = p_cart_id for no key update;\n  update public.qr_carts c\n    set send_nudge_seat = p_seat",
        replace: "  update public.qr_carts c\n    set send_nudge_seat = p_seat",
      },
    ],
    // (e): the nudge's UPDATE waits on the fire's row lock but, the row unmodified, decides from the
    // snapshot it took BEFORE the fire committed — the dine-in draft it reads has already gone.
    expect: ["e"],
    why: "a nudge racing a Send lands a stamp on dishes that just went — 'Someone's waiting' with nothing to send",
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
  console.log(
    `  ${green("baseline")} ${dim(`all ${Object.keys(SCENARIOS).length} orders green on the real functions`)}`,
  );

  let bad = 0;
  for (const m of MUTANTS) {
    const stale = m.edits.filter((e) => MIGRATION_TEXT.split(e.find).length - 1 !== 1);
    if (stale.length) {
      console.log(`  ${red("STALE")} ${m.id} — ${stale.length} edit(s) did not match exactly once`);
      bad++;
      continue;
    }
    // A function replacement, never a string: `$'`/`$&` in a replacement string are patterns.
    const mutated = m.edits.reduce((t, e) => t.replace(e.find, () => e.replace), MIGRATION_TEXT);
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
    if (q(HASHES) !== live) {
      throw new Error(`${TAG} FATAL — the restore after ${m.id} is not byte-identical.`);
    }
  }
  if (bad) {
    console.log(red(`\n✗ verify:fire-cart-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
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
  if ((await guard.run(`select pg_try_advisory_lock(hashtext('pd1r-fire-cart-race'));`)) !== "t") {
    await guard.close();
    refuse(`another fire-cart-race run holds the advisory lock on this database`);
  }
  lockOwned = true;
  let failed = 0;
  try {
    cleanup(); // a previous run killed mid-flight
    if (process.argv.includes("--mutants")) {
      failed += await runMutants();
    } else {
      console.log(
        `\n${TAG} — the diner Send against an add, a qty change, a nudge and a merge, two sessions\n`,
      );
      failed += (await battery(true)).length;
    }
  } finally {
    cleanup();
    await guard.close();
  }
  const left = q(
    `select count(*) from public.table_sessions
      where qr_code like '${CODE_PREFIX}%' or qr_code like '${TGT_PREFIX}%';`,
  );
  if (left !== "0") {
    console.log(red(`✗ cleanup left ${left} ${TAG} sessions behind`));
    failed++;
  }
  if (failed) {
    console.log(red(`\n✗ verify:fire-cart-race — ${failed} failure(s)\n`));
    process.exit(1);
  }
  if (!process.argv.includes("--mutants")) {
    console.log(green(`\n✓ verify:fire-cart-race — ${Object.values(NAMES).join(" · ")}\n`));
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
