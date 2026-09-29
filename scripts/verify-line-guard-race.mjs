#!/usr/bin/env node
/**
 * P2dk — the two-session harness for the P2cy row lock on the cart's three line RPCs.
 *
 * `20260929000000_p2dd_p2cy_line_guards.sql` opens `mms_cart_item_insert_if_open`,
 * `mms_cart_item_inc_qty` and `mms_cart_item_set_qty_if_open` by taking the parent cart row
 * `FOR SHARE`. That lock is the ONLY thing ordering a line write against a settlement claim (the
 * `UPDATE qr_carts SET settle_at …` of `acquireSettlement` and its siblings): the freeze predicate
 * right after it reads a value, and a read orders nothing. Delete the lock and every
 * single-session case still passes — `supabase/tests/p2dd_p2cy_line_guards_test.sql` runs in one
 * transaction, where no claim can interleave. `verify-mode-authority.mjs` lists the insert's
 * deletion as a documented SURVIVOR for exactly that reason, and inc_qty / set_qty had no mutant at
 * all. This is the missing second session.
 *
 * ── What each RPC is put through ────────────────────────────────────────────────────────────────
 *
 *   (a) claim-first — B claims the freeze and holds it; A calls the RPC. A must BLOCK on B (read
 *       from `pg_blocking_pids`, never a sleep), and once B commits A must raise
 *       'cart is being paid' and write nothing: READ COMMITTED re-fetches the locked row and the
 *       freeze check sees B's `settle_at`.
 *   (b) add-first — A calls the RPC inside an open transaction; B's claim must BLOCK on A until A
 *       commits, and B's NEXT statement (the settlement's own reads: the unsent gate,
 *       `getCartTotals`) must see A's write. Without the lock B claims past an uncommitted line and
 *       quotes a total that line then joins.
 *   (c) CONTROL — two writes to one table do NOT serialize. The migration's header promises
 *       `FOR SHARE` is compatible with itself; a mutex (`for update`) passes (a) and (b) perfectly
 *       and turns every busy table into a queue, so (c) is the only thing that can tell them apart.
 *       It also proves the blocking in (a)/(b) comes from the claim, not from any lock at all.
 *
 * Every wait is observed, both ways: a statement is polled until it either appears in
 * `pg_blocking_pids` behind the named peer ("blocked") or its completion marker lands ("done").
 * The mutant makes (a)/(b) answer "done" deterministically instead of timing out.
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 * For each function, re-create it from THIS migration's text with the `for share;` line
 * (a) deleted — (a)+(b) must go red and (c) stay green — and (b) turned into `for update;` — (c)
 * must go red and (a)+(b) stay green. Each mutant asserts the line matched exactly once, the apply
 * succeeded and `md5(prosrc)` changed; the restore re-applies the whole migration file and asserts
 * all three bodies are byte-identical to the baseline. A green baseline runs first, and before any
 * of it the live bodies are compared with what the migration produces INSIDE A ROLLED-BACK
 * TRANSACTION: if a later migration redefines one of these functions, re-applying this file would
 * revert it and every verdict would be about dead code, so the battery refuses before writing.
 *
 * ── It COMMITS, so it refuses anything that is not local ────────────────────────────────────────
 *
 * Two sessions must see the fixtures, so they are committed, tagged `P2DK-` on
 * `table_sessions.qr_code`, and swept by tag in a `finally`. The DSN defaults to the local
 * supabase stack; `LINE_RACE_DSN` may point elsewhere, but only at 127.0.0.1 / localhost / ::1 or
 * a unix-socket directory, with no parameter that can redirect libpq (`hostaddr`, `service`,
 * `options`, …), and every libpq environment variable is scrubbed from the children. Then, in the
 * database: TLS off and a private (or socket) server address — hosted Supabase fails both. A TCP
 * host must also be the port `supabase status` reports (the only check that can see a tunnel —
 * scripts/verify-merge-race.mjs `assertNotATunnel`, whose Codex history this inherits);
 * `LINE_RACE_ASSUME_DISPOSABLE=1` skips only that one, for a bare cluster on purpose.
 *
 * Run: `pnpm verify:line-race` · `pnpm verify:line-race:mutants` (the local stack), or
 *   LINE_RACE_DSN="postgresql:///postgres?host=/tmp&port=55432&user=postgres" node scripts/verify-line-guard-race.mjs
 * against a throwaway cluster with the migration applied (how it was first proved: PG16, 2026-09-29).
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260929000000_p2dd_p2cy_line_guards.sql");
const TAG = "P2DK";
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
  const e = { ...process.env, PGAPPNAME: `mms-p2dk-${app}` };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

/** Only these may appear in the query string. `hostaddr` overrides `host` in libpq, `service`
 * reads a file, `options` rewrites GUCs — each could send a "localhost" DSN somewhere else. */
const PARAMS_OK = new Set(["host", "port", "user", "dbname", "password", "connect_timeout"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveDsn() {
  const raw =
    process.env.LINE_RACE_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let u;
  try {
    u = new URL(raw);
  } catch {
    refuse(`LINE_RACE_DSN is not a postgresql:// URL`);
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
  if (process.env.LINE_RACE_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(`  ⚠️  LINE_RACE_ASSUME_DISPOSABLE=1 — tunnel check SKIPPED (in-DB checks on)`),
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
        `  LINE_RACE_ASSUME_DISPOSABLE=1 (skips ONLY this check).`,
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
    await this.run(`create function pg_temp.p2dk_try(sql text) returns text language plpgsql as
      $f$ begin execute sql; return 'ok'; exception when others then return 'ERR:' || sqlerrm; end $f$;
      set lock_timeout = 0; set statement_timeout = 0;`);
    this.pid = await this.run("select pg_backend_pid();");
    return this;
  }
  write(sql) {
    const marker = `__P2DK_${this.name}_${++this.seq}__`;
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
// Two draft lines of DIFFERENT quantities, so every expected state below names which line moved:
// "2|5|1" (d1 bumped) cannot be satisfied by d2 moving, nor a set_qty by a bump.
const D1 = 3;
const D2 = 1;
const BY = 2; // inc_qty's step
const SET = 7; // set_qty's target
const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`;
// One qr_code per FIXTURE, not per scenario name: `--mutants` runs every scenario again after the
// baseline, and `table_sessions_active_qr_uniq` (unique qr_code among ACTIVE sessions) refused the
// second `P2DK-insert-a-<run>` — CI's first run of this harness went red on exactly that. A minimal
// local schema without the index passed, which is why the index is now part of the local proof.
let fixtureSeq = 0;
const sig = (lines, d1, d2) => `${lines}|${d1}|${d2}`;

function fixture(id) {
  const out = q(`with s as (
      insert into public.table_sessions (qr_code, mode, status)
      values ('${TAG}-${id}-${RUN}-${++fixtureSeq}', 'dinein', 'active') returning id
    ), c as (
      insert into public.qr_carts (session_id) select id from s returning id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, fulfillment)
      select c.id, '${TAG}-dish', 'Mohinga', v.qty, 1400, 147, 'dinein'
        from c, (values (${D1}), (${D2})) v(qty)
      returning id, qty
    )
    select (select id from c), (select id from i where qty = ${D1}), (select id from i where qty = ${D2});`);
  const [cart, d1, d2] = out.split("|");
  if (!cart || !d1 || !d2) throw new Error(`${TAG} fixture ${id} did not resolve: ${out}`);
  const f = { cart, d1, d2 };
  // What a reader sees: line count · d1's qty · d2's qty.
  f.state = () =>
    `select count(*) || '|' || coalesce(max(qty) filter (where id = '${d1}'), 0) || '|' ||
            coalesce(max(qty) filter (where id = '${d2}'), 0)
       from public.qr_cart_items where cart_id = '${cart}';`;
  return f;
}

/** The settlement claim, shaped like `acquireSettlement`'s UPDATE (lib/lock.ts). */
const claim = (f) =>
  `update public.qr_carts set settle_at = now(), settle_by = gen_random_uuid()
     where id = '${f.cart}' and status = 'open' and settle_at is null returning id;`;
const attempt = (sql) => `select pg_temp.p2dk_try($q$${sql}$q$);`;

const RPCS = [
  {
    key: "insert",
    fn: "mms_cart_item_insert_if_open",
    call: (f) =>
      `select public.mms_cart_item_insert_if_open('${f.cart}'::uuid, '${TAG}-dish', 'Mohinga',
         '[]'::jsonb, 1400, 147, null::uuid, 'dinein')`,
    one: sig(3, D1, D2),
    two: sig(4, D1, D2),
  },
  {
    key: "inc_qty",
    fn: "mms_cart_item_inc_qty",
    call: (f, line = "d1") => `select public.mms_cart_item_inc_qty('${f[line]}'::uuid, ${BY})`,
    one: sig(2, D1 + BY, D2),
    two: sig(2, D1 + BY, D2 + BY),
  },
  {
    key: "set_qty",
    fn: "mms_cart_item_set_qty_if_open",
    call: (f, line = "d1") =>
      `select public.mms_cart_item_set_qty_if_open('${f[line]}'::uuid, ${SET})`,
    one: sig(2, SET, D2),
    two: sig(2, SET, SET),
  },
];
const BEFORE = sig(2, D1, D2);

/** Each scenario returns [label, got, want] triples; any mismatch reddens it. */
const SCENARIOS = {
  async a(rpc) {
    const f = fixture(`${rpc.key}-a`);
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await b.run("begin;");
      const claimed = await b.run(claim(f));
      a.fire(attempt(rpc.call(f)));
      const how = await blockedOrDone(a, b);
      await b.run("commit;");
      const res = await a.collect();
      return [
        ["B claimed the cart", claimed, f.cart],
        ["A waited for the claim", how, "blocked"],
        ["A refused", res, "ERR:cart is being paid"],
        ["nothing landed", q(f.state()), BEFORE],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async b(rpc) {
    const f = fixture(`${rpc.key}-b`);
    const a = await new Session("a").open();
    const b = await new Session("b").open();
    try {
      await a.run("begin;");
      const res = await a.run(attempt(rpc.call(f)));
      await b.run("begin;");
      b.fire(claim(f));
      const how = await blockedOrDone(b, a);
      // A claim that did NOT wait runs its reads while A is still uncommitted — the real race, so
      // A commits only after them. A claim that waited cannot finish until A commits.
      if (how === "blocked") await a.run("commit;");
      const claimed = await b.collect();
      const seen = await b.run(f.state()); // the settlement's NEXT statement
      if (how === "done") await a.run("commit;");
      await b.run("rollback;");
      return [
        ["A's write landed", res, "ok"],
        ["the claim waited for A", how, "blocked"],
        ["B claimed the cart", claimed, f.cart],
        ["B's next read sees A's line", seen, rpc.one],
      ];
    } finally {
      await a.close();
      await b.close();
    }
  },
  async c(rpc) {
    const f = fixture(`${rpc.key}-c`);
    const a = await new Session("a").open();
    const c = await new Session("c").open();
    try {
      await a.run("begin;");
      const r1 = await a.run(attempt(rpc.call(f, "d1")));
      c.fire(attempt(rpc.call(f, "d2")));
      const how = await blockedOrDone(c, a);
      await a.run("commit;");
      const r2 = await c.collect();
      return [
        ["A's write landed", r1, "ok"],
        ["a second writer did NOT wait for A", how, "done"],
        ["the second write landed", r2, "ok"],
        ["both are on the cart", q(f.state()), rpc.two],
      ];
    } finally {
      await a.close();
      await c.close();
    }
  },
};

/** Run one RPC's three scenarios; returns the ids that went red (printing when `loud`). */
async function battery(rpc, loud) {
  const red_ = [];
  red_.why = [];
  for (const [id, run] of Object.entries(SCENARIOS)) {
    const checks = await run(rpc);
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) red_.push(id);
    for (const [label, got] of bad) red_.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      console.log(`  ${bad.length ? red("✗") : green("✓")} ${rpc.key} (${id})`);
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
  q(`delete from public.mms_scan_events e using public.qr_carts c, public.table_sessions s
       where e.cart_id = c.id and c.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
       where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.qr_carts c using public.table_sessions s
       where c.session_id = s.id and s.qr_code like '${TAG}-%';
     delete from public.table_sessions where qr_code like '${TAG}-%';`);
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
const HASHES = `select p.proname || '=' || md5(p.prosrc) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (${RPCS.map((r) => `'${r.fn}'`).join(", ")})
  order by 1;`;

/** This migration's `create or replace` statement for `fn`, exactly once or not at all. */
function statementFor(fn) {
  const head = `create or replace function public.${fn}(`;
  const at = MIGRATION_TEXT.indexOf(head);
  if (at < 0 || MIGRATION_TEXT.indexOf(head, at + 1) >= 0) return null;
  const end = MIGRATION_TEXT.indexOf("\nend $$;", at);
  return end < 0 ? null : MIGRATION_TEXT.slice(at, end + "\nend $$;".length);
}

const MUTANTS = RPCS.flatMap((rpc) => [
  {
    id: `${rpc.key}/for-share-deleted`,
    rpc,
    to: "    ;",
    expect: ["a", "b"],
    why: "the P2cy hole: an add passes its freeze read, a claim commits, the line lands under the settlement",
  },
  {
    id: `${rpc.key}/for-share-is-a-mutex`,
    rpc,
    to: "    for update;",
    expect: ["c"],
    why: "over-locking: correct against a claim, but every write on a busy table queues behind the last",
  },
]);

function restoreMigration() {
  q(MIGRATION_TEXT, "restore");
}

async function runMutants() {
  // Drift first, with NOTHING written: what would this migration produce, rolled back?
  const live = q(HASHES);
  const expected = q(`begin;\n${MIGRATION_TEXT}\n${HASHES}\nrollback;`)
    .split("\n")
    .filter((l) => /^mms_cart_item_\w+=/.test(l))
    .join("\n");
  if (live !== expected) {
    throw new Error(
      `${TAG} REFUSED — ` +
        `the live bodies are not what ${path.basename(MIGRATION)} produces — a later migration ` +
        `redefines one (or a mutant is live). Restoring from this file would revert it, so every ` +
        `verdict would be about dead code.\n  live:\n${live}\n  migration:\n${expected}`,
    );
  }
  console.log(`\n${TAG} mutation battery — ${MUTANTS.length} mutants against the LIVE functions\n`);
  for (const rpc of RPCS) {
    const reds = await battery(rpc, false);
    if (reds.length) {
      throw new Error(
        `${TAG} REFUSED — the UNMUTATED ${rpc.fn} is already red on (${reds.join(", ")})`,
      );
    }
  }
  console.log(`  ${green("baseline")} ${dim("all nine scenarios green on the real functions")}`);

  let bad = 0;
  for (const m of MUTANTS) {
    const stmt = statementFor(m.rpc.fn);
    const hits = stmt ? stmt.split("\n").filter((l) => /^\s*for share;\s*$/.test(l)).length : 0;
    if (hits !== 1) {
      console.log(`  ${red("STALE")} ${m.id} — \`for share;\` matched ${hits}× (want exactly 1)`);
      bad++;
      continue;
    }
    const mutated = stmt.replace(/^\s*for share;\s*$/m, () => m.to);
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
      const reds = await battery(m.rpc, false);
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
    console.log(red(`\n✗ verify:line-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
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
  if ((await guard.run(`select pg_try_advisory_lock(hashtext('p2dk-line-race'));`)) !== "t") {
    await guard.close();
    refuse(`another line-race run holds the advisory lock on this database`);
  }
  lockOwned = true;
  let failed = 0;
  try {
    cleanup(); // a previous run killed mid-flight
    if (process.argv.includes("--mutants")) {
      failed += await runMutants();
    } else {
      console.log(`\n${TAG} — the line RPCs' cart lock against a real settlement claim\n`);
      for (const rpc of RPCS) failed += (await battery(rpc, true)).length;
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
    console.log(red(`\n✗ verify:line-race — ${failed} failure(s)\n`));
    process.exit(1);
  }
  if (!process.argv.includes("--mutants")) {
    console.log(green(`\n✓ verify:line-race — 3 RPCs × (claim-first · add-first · control)\n`));
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
