#!/usr/bin/env node
/**
 * M210 · M208 · M205 — the two-session harness for the team-safety migration, and its mutant battery.
 *
 * `20261018120000_m210_team_safety.sql` decides every team write under locks no single session can
 * observe: `supabase/tests/m210_team_safety_test.sql` runs in one transaction, where no second
 * demotion, no revocation and no promotion can land mid-call. This is the second session.
 *
 *   · the TEAM LOCK (`pg_advisory_xact_lock(hashtext('mms_staff_team'))`), first in `mms_staff_set`
 *     and in the owner trigger `mms_staff_keep_an_owner` — orders two team writes, and orders the
 *     trigger's owner count after any other owner loss commits;
 *   · the CALLER's row FOR SHARE (`mms_staff_set`, `mms_staff_provision`) — a revocation by any other
 *     writer commits first and is read, or waits for the decision (M208);
 *   · the TARGET's row FOR UPDATE (`mms_staff_set`) — the ceiling is decided on the role the UPDATE
 *     writes over;
 *   · the trigger's WHEN clause — only a write that ends an active owner pays for the lock.
 *
 * ── The orders ───────────────────────────────────────────────────────────────────────────────────
 *
 *   (a) A (owner) demotes B (owner) and HOLDS → B's demotion of A BLOCKS on A, then answers
 *       `ceiling` (B is a manager now); exactly one owner remains, one audit row. THE M210 RACE.
 *   (b) O demotes manager M and HOLDS → M's deactivation of a server BLOCKS, then `not_authorized`;
 *       the server stays on. THE M208 RACE, through the app's own path.
 *   (c) X holds B's row FOR SHARE; A's demotion of B BLOCKS on X; B's demotion of A BLOCKS on A;
 *       X lets go → A `ok`, B `ceiling` — never a deadlock. Without the team lock A holds A's row and
 *       wants B's while B holds B's and wants A's: the cycle the lock exists to queue.
 *   (d) W demotes manager M by hand and HOLDS → M's deactivation of a server BLOCKS on W, then
 *       `not_authorized`. What the caller's FOR SHARE has and FOR KEY SHARE lacks: a role change is
 *       a non-key UPDATE, which KEY SHARE does not wait for.
 *   (e) W promotes server S to owner by hand and HOLDS → manager M's deactivation of S (looked at as
 *       a server) BLOCKS on W, then `changed`; the new owner stays on.
 *   (f) W1 demotes owner A by hand and HOLDS (B is the only other owner) → W2's hand demotion of B
 *       BLOCKS on W1, then is REFUSED by `staff_keep_an_owner`; B stays owner. The table invariant
 *       against writers that never call the function.
 *   (g) O demotes manager M and HOLDS → W's rename of a server does NOT block — the CONTROL that the
 *       trigger takes the team lock only for a write that ends an active owner.
 *   (h) W demotes manager M by hand and HOLDS → M's invite BLOCKS on W, then `not_authorized`; no
 *       staff row, no audit row (`mms_staff_provision`'s caller lock).
 *
 * Every wait is observed: a statement is polled until it is either in `pg_blocking_pids` behind the
 * named peer ("blocked") or its completion marker lands ("done"). Never a sleep.
 *
 * ── `--mutants` ─────────────────────────────────────────────────────────────────────────────────
 *
 * Every rule in the migration, one mutant each, in two kinds:
 *   · SQL-TEST mutants — a rule one session can see. The battery runs
 *     `supabase/tests/m210_team_safety_test.sql` and the failing assertion must name the case the
 *     mutant is listed against (`M210.<n> ·`), never just "something went red".
 *   · ORDER mutants — a lock. The orders above run, and the set that goes red must be EXACTLY the
 *     set listed: a mutant that reddens a control as well is misdirected, not caught.
 * Each mutant patches the migration's text (its `find` must match exactly once), re-applies the
 * WHOLE file — it is idempotent — asserts the identity (every function's full definition and ACL,
 * and the trigger's definition) changed, judges, then re-applies the untouched file and asserts the
 * identity is byte-identical to the baseline. Before anything is written, the live identity is
 * compared with what the file produces INSIDE A ROLLED-BACK TRANSACTION, and the migration directory
 * is read for a later file defining one of these functions: if either finds drift, re-applying this
 * file would revert a newer body and every verdict would be about dead code, so the battery refuses.
 *
 * Why its own battery and not a suite in `verify-mode-authority.mjs`: that step replays a fifteen-file
 * chain per mutant and measured 709–816 s against a 15-minute CI timeout, with its own header asking
 * for a shard past ~350 rows. This file's rules need none of that chain — one idempotent file restores
 * them — so they are judged here, in seconds.
 *
 * ── It COMMITS, so it refuses anything that is not local ────────────────────────────────────────
 *
 * Two sessions must see the fixtures, so they are committed — staff rows named `M210R …` with fresh
 * ids, their auth users and their audit rows — and swept after EVERY order (the owner trigger counts
 * the whole table, so one order's owners must not survive into the next). The sweep switches the
 * owner trigger off for its own transaction only. The DSN defaults to the local supabase stack;
 * `TEAM_RACE_DSN` may point elsewhere, but only at 127.0.0.1 / localhost / ::1 or a unix-socket
 * directory, with no parameter that can redirect libpq, and every libpq environment variable is
 * scrubbed from the children. Then, in the database: TLS off and a private (or socket) server
 * address — hosted Supabase fails both. A TCP host must also be the port `supabase status` reports;
 * `TEAM_RACE_ASSUME_DISPOSABLE=1` skips only that one, for a bare cluster on purpose (LEARNINGS #95 ·
 * #243). And because the owner invariant is over the whole table, it refuses a database holding an
 * active owner that is not its own fixture: the orders could not be judged there.
 *
 * Run: `pnpm verify:team-race` · `pnpm verify:team-race:mutants` (the local stack), or
 *   TEAM_RACE_DSN="postgresql://postgres@127.0.0.1:54331/postgres" TEAM_RACE_ASSUME_DISPOSABLE=1 \
 *     node scripts/verify-team-race.mjs --mutants
 * against a throwaway cluster with every migration applied.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_FILE = "20261018120000_m210_team_safety.sql";
const MIGRATION = path.join(ROOT, "supabase/migrations", MIGRATION_FILE);
const SQL_TEST = path.join(ROOT, "supabase/tests/m210_team_safety_test.sql");
const TAG = "M210R";
const FUNCTIONS = ["mms_staff_set", "mms_staff_provision", "mms_staff_keep_an_owner"];
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
  const e = { ...process.env, PGAPPNAME: `mms-m210r-${app}` };
  for (const k of SCRUBBED) delete e[k];
  return e;
};

/** Only these may appear in the query string. `hostaddr` overrides `host` in libpq, `service`
 * reads a file, `options` rewrites GUCs — each could send a "localhost" DSN somewhere else. */
const PARAMS_OK = new Set(["host", "port", "user", "dbname", "password", "connect_timeout"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function resolveDsn() {
  const raw =
    process.env.TEAM_RACE_DSN ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let u;
  try {
    u = new URL(raw);
  } catch {
    refuse(`TEAM_RACE_DSN is not a postgresql:// URL`);
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
  if (process.env.TEAM_RACE_ASSUME_DISPOSABLE === "1") {
    console.log(
      dim(`  ⚠️  TEAM_RACE_ASSUME_DISPOSABLE=1 — tunnel check SKIPPED (in-DB checks on)`),
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
        `  TEAM_RACE_ASSUME_DISPOSABLE=1 (skips ONLY this check).`,
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
    // A refusal must come back as DATA: under ON_ERROR_STOP a raise would end the session. A
    // subtransaction commits into its parent, so a lock taken inside it is held to COMMIT.
    await this.run(`create function pg_temp.m210r_try(sql text) returns text language plpgsql as
      $f$ declare r text; begin execute sql into r; return coalesce(r, '<null>');
          exception when others then return 'ERR:' || sqlerrm; end $f$;
      set lock_timeout = 0; set statement_timeout = 0;`);
    this.pid = await this.run("select pg_backend_pid();");
    return this;
  }
  write(sql) {
    const marker = `__M210R_${this.name}_${++this.seq}__`;
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
   *  psql open forever and wedge the run: give it 5s, then terminate its backend (LEARNINGS #243). */
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
let fixtureSeq = 0;
/** Staff rows (and their auth users) for one order: `roles` maps a label to `role` or `role:off`. */
function fixture(order, roles) {
  const ids = {};
  const values = [];
  for (const [label, spec] of Object.entries(roles)) {
    const [role, off] = spec.split(":");
    const id = q(`select gen_random_uuid();`);
    ids[label] = id;
    values.push(
      `('${id}', '${role}', '${TAG} ${order}-${label}-${++fixtureSeq}', ${off === "off" ? "false" : "true"})`,
    );
  }
  q(`insert into auth.users (id) values ${Object.values(ids)
    .map((id) => `('${id}')`)
    .join(", ")};
     insert into public.staff (user_id, role, display_name, active) values ${values.join(", ")};`);
  return ids;
}
const roleOf = (id) => q(`select role || ':' || active from public.staff where user_id = '${id}';`);
const auditsOf = (ids) =>
  q(`select count(*) from public.staff_audit
      where target_id in (${ids.map((i) => `'${i}'`).join(", ")})
         or actor_id in (${ids.map((i) => `'${i}'`).join(", ")});`);
const owners = () =>
  q(`select count(*) from public.staff where role = 'owner' and active
       and display_name like '${TAG} %';`);
const attempt = (sql) => `select pg_temp.m210r_try($q$${sql}$q$);`;
const setRole = (by, who, seen, role) =>
  attempt(
    `select (public.mms_staff_set('${by}', '${who}', '${seen}', '${role}', null))->>'status'`,
  );
const setActive = (by, who, seen, on) =>
  attempt(`select (public.mms_staff_set('${by}', '${who}', '${seen}', null, ${on}))->>'status'`);
const handWrite = (sql) => attempt(`${sql} returning 'ok'`);

async function withSessions(names, body) {
  const ss = [];
  try {
    for (const n of names) ss.push(await new Session(n).open());
    return await body(...ss);
  } finally {
    for (const s of ss) await s.close();
  }
}

/** Each order returns [label, got, want] triples; any mismatch reddens it. */
const ORDERS = {
  a: () => {
    const f = fixture("a", { A: "owner", B: "owner" });
    return withSessions(["a", "b"], async (a, b) => {
      await a.run("begin;");
      const r1 = await a.run(setRole(f.A, f.B, "owner", "manager"));
      b.fire(setRole(f.B, f.A, "owner", "manager"));
      const how = await blockedOrDone(b, a);
      await a.run("commit;");
      const r2 = await b.collect();
      return [
        ["A demoted B", r1, "ok"],
        ["B's demotion of A waited for A", how, "blocked"],
        ["B, now a manager, meets the ceiling", r2, "ceiling"],
        ["exactly one owner remains", owners(), "1"],
        ["A is still the owner", roleOf(f.A), "owner:true"],
        ["one audit row — the write that landed", auditsOf([f.A, f.B]), "1"],
      ];
    });
  },
  b: () => {
    const f = fixture("b", { O: "owner", M: "manager", S: "server" });
    return withSessions(["o", "m"], async (o, m) => {
      await o.run("begin;");
      const r1 = await o.run(setRole(f.O, f.M, "manager", "server"));
      m.fire(setActive(f.M, f.S, "server", false));
      const how = await blockedOrDone(m, o);
      await o.run("commit;");
      const r2 = await m.collect();
      return [
        ["O demoted M", r1, "ok"],
        ["M's deactivation waited for O", how, "blocked"],
        ["M, now a server, is refused", r2, "not_authorized"],
        ["the server is still on", roleOf(f.S), "server:true"],
      ];
    });
  },
  c: () => {
    const f = fixture("c", { A: "owner", B: "owner" });
    return withSessions(["x", "a", "b"], async (x, a, b) => {
      await x.run("begin;");
      await x.run(`select 1 from public.staff where user_id = '${f.B}' for share;`);
      a.fire(setRole(f.A, f.B, "owner", "manager"));
      const howA = await blockedOrDone(a, x);
      b.fire(setRole(f.B, f.A, "owner", "manager"));
      const howB = await blockedOrDone(b, a);
      await x.run("commit;");
      const r1 = await a.collect();
      const r2 = await b.collect();
      return [
        ["A waited for X's lock on B", howA, "blocked"],
        ["B queued behind A", howB, "blocked"],
        ["A demoted B", r1, "ok"],
        ["B meets the ceiling — no deadlock", r2, "ceiling"],
        ["exactly one owner remains", owners(), "1"],
      ];
    });
  },
  d: () => {
    const f = fixture("d", { O: "owner", M: "manager", S: "server" });
    return withSessions(["w", "m"], async (w, m) => {
      await w.run("begin;");
      const r0 = await w.run(
        handWrite(`update public.staff set role = 'server' where user_id = '${f.M}'`),
      );
      m.fire(setActive(f.M, f.S, "server", false));
      const how = await blockedOrDone(m, w);
      await w.run("commit;");
      const r = await m.collect();
      return [
        ["W demoted M by hand", r0, "ok"],
        ["M's call waited for W", how, "blocked"],
        ["M is refused on the committed role", r, "not_authorized"],
        ["the server is still on", roleOf(f.S), "server:true"],
      ];
    });
  },
  e: () => {
    const f = fixture("e", { O: "owner", M: "manager", S: "server" });
    return withSessions(["w", "m"], async (w, m) => {
      await w.run("begin;");
      const r0 = await w.run(
        handWrite(`update public.staff set role = 'owner' where user_id = '${f.S}'`),
      );
      m.fire(setActive(f.M, f.S, "server", false));
      const how = await blockedOrDone(m, w);
      await w.run("commit;");
      const r = await m.collect();
      return [
        ["W promoted S by hand", r0, "ok"],
        ["M's call waited for W", how, "blocked"],
        ["M's stale look refuses", r, "changed"],
        ["the new owner is still on", roleOf(f.S), "owner:true"],
      ];
    });
  },
  f: () => {
    const f = fixture("f", { A: "owner", B: "owner" });
    return withSessions(["w1", "w2"], async (w1, w2) => {
      await w1.run("begin;");
      const r1 = await w1.run(
        handWrite(`update public.staff set role = 'manager' where user_id = '${f.A}'`),
      );
      w2.fire(handWrite(`update public.staff set role = 'manager' where user_id = '${f.B}'`));
      const how = await blockedOrDone(w2, w1);
      await w1.run("commit;");
      const r2 = await w2.collect();
      return [
        ["W1 demoted A by hand", r1, "ok"],
        ["W2's demotion of B waited for W1", how, "blocked"],
        [
          "W2 is refused by the owner invariant",
          String(r2).startsWith("ERR:staff_keep_an_owner:"),
          true,
        ],
        ["exactly one owner remains", owners(), "1"],
      ];
    });
  },
  g: () => {
    const f = fixture("g", { O: "owner", M: "manager", S: "server" });
    return withSessions(["o", "w"], async (o, w) => {
      await o.run("begin;");
      const r1 = await o.run(setRole(f.O, f.M, "manager", "server"));
      w.fire(
        handWrite(
          `update public.staff set display_name = '${TAG} g-renamed' where user_id = '${f.S}'`,
        ),
      );
      const how = await blockedOrDone(w, o);
      await o.run("commit;");
      const r2 = await w.collect();
      return [
        ["O demoted M", r1, "ok"],
        ["a rename of a server did NOT wait for the team write", how, "done"],
        ["the rename landed", r2, "ok"],
      ];
    });
  },
  h: () => {
    const f = fixture("h", { O: "owner", M: "manager" });
    const fresh = q(`select gen_random_uuid();`);
    // Tagged by its e-mail, so the sweep finds it whether or not the invite wrote a staff row.
    q(`insert into auth.users (id, email) values ('${fresh}', '${fresh}@m210r.test');`);
    return withSessions(["w", "m"], async (w, m) => {
      await w.run("begin;");
      const r0 = await w.run(
        handWrite(`update public.staff set role = 'server' where user_id = '${f.M}'`),
      );
      m.fire(
        attempt(
          `select (public.mms_staff_provision('${f.M}', '${fresh}', '${fresh}@m210r.test', 'server', '${TAG} h-invite'))->>'status'`,
        ),
      );
      const how = await blockedOrDone(m, w);
      await w.run("commit;");
      const r = await m.collect();
      return [
        ["W demoted M by hand", r0, "ok"],
        ["M's invite waited for W", how, "blocked"],
        ["M's invite is refused", r, "not_authorized"],
        [
          "no staff row was written",
          q(`select count(*) from public.staff where user_id = '${fresh}';`),
          "0",
        ],
        ["no audit row was written", auditsOf([fresh]), "0"],
      ];
    });
  },
};

let lockOwned = false;
/** Sweep every fixture: audit rows, staff rows (the owner trigger off for THIS transaction only — a
 *  fixture owner may be the last one), then their auth users. */
function cleanup() {
  if (!localVerified || !lockOwned) return; // never sweep unverified, nor under another run
  q(`begin;
     create temp table m210r_ids on commit drop as
       select user_id as id from public.staff where display_name like '${TAG} %'
       union select id from auth.users where email like '%@m210r.test';
     delete from public.staff_audit a using m210r_ids i
       where a.target_id = i.id or a.actor_id = i.id;
     alter table public.staff disable trigger staff_keep_an_owner;
     delete from public.staff s using m210r_ids i where s.user_id = i.id;
     alter table public.staff enable trigger staff_keep_an_owner;
     delete from auth.users u using m210r_ids i where u.id = i.id;
     commit;`);
}

/** Run the orders; returns the ids that went red (printing when `loud`). */
async function battery(loud) {
  const reds = [];
  reds.why = [];
  for (const [id, run] of Object.entries(ORDERS)) {
    let checks;
    try {
      checks = await run();
    } finally {
      cleanup(); // after EVERY order: the owner trigger counts the whole table
    }
    const bad = checks.filter(([, got, want]) => String(got) !== String(want));
    if (bad.length) reds.push(id);
    for (const [label, got] of bad) reds.why.push(`${id}: ${label} ✗ (${got})`);
    if (loud) {
      console.log(`  ${bad.length ? red("✗") : green("✓")} order ${id}`);
      for (const [label, got, want] of bad) {
        console.log(`      ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
    }
  }
  return reds;
}

// ── The mutation battery ─────────────────────────────────────────────────────────────────────────
const MIGRATION_TEXT = readFileSync(MIGRATION, "utf8");
const IDENTITY = `select p.proname || '|' || md5(pg_get_functiondef(p.oid)) || '|' ||
                        coalesce(array_to_string(p.proacl::text[], ','), '(default)')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in (${FUNCTIONS.map((f) => `'${f}'`).join(", ")})
                 union all
                 select 'trigger|' || md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text
                   from pg_trigger t
                  where t.tgrelid = 'public.staff'::regclass and t.tgname = 'staff_keep_an_owner'
                  order by 1;`;
const identityRows = (out) =>
  out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(mms_staff_\w+|trigger)\|/.test(l))
    .join("\n");

/** Which migration LAST defines a function — the chain must be this file alone (see the header). */
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

/** The SQL test: null when green, else the failing ASSERT's message. */
function runSqlTest() {
  const r = spawnSync(
    "psql",
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", `--dbname=${DSN}`, "-f", SQL_TEST],
    { env: childEnv("sqltest"), encoding: "utf8" },
  );
  if (r.status === 0) return null;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const line = out.split("\n").find((l) => l.includes("ERROR:"));
  return (line ?? out).replace(/^.*ERROR:\s*/, "").trim();
}

/**
 * The mutants. `expect` is a string — the SQL-test case that must fail (substring of its message) —
 * or an array — the orders that must go red, exactly. `find` must match the migration exactly once.
 */
const SET = "mms_staff_set";
const PROV = "mms_staff_provision";
const TRIG = "mms_staff_keep_an_owner";
const MUTANTS = [
  // ── mms_staff_set: the caller ──
  {
    id: "set/switched-off-caller-passes",
    fn: SET,
    expect: "M210.1 · a switched-off manager is refused",
    why: "the active half of the caller rule dropped: a manager an owner switched off still changes roles",
    find: "  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
    replace:
      "  if v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
  },
  {
    id: "set/floor-admits-a-server",
    fn: SET,
    expect: "M210.1 · a server is refused",
    why: "the floor one rung low: a server reaches the team screen's writes",
    find: "  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
    replace:
      "  if v_caller_active is not true or v_caller_rank < 1 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
  },
  // ── mms_staff_set: the decision ──
  {
    id: "set/self-allowed",
    fn: SET,
    expect: "M210.3 · a manager cannot promote themselves",
    why: "the self rule dropped: a manager promotes themselves (the ceiling allows a manager on a manager) and the sole owner can step down to nobody",
    find: "  if p_target = p_caller then\n    return jsonb_build_object('status', 'self');\n  end if;\n",
    replace: "",
  },
  {
    id: "set/stale-look-passes",
    fn: SET,
    expect: "M210.4 · a stale look refuses",
    why: "the console's role is never compared: a decision made about a server lands on whatever the row is now",
    find: "  if v_target_role <> p_seen_role then\n    return jsonb_build_object('status', 'changed', 'role', v_target_role);\n  end if;\n",
    replace: "",
  },
  {
    id: "set/noop-writes",
    fn: SET,
    expect: "M210.5 · the same active flag is a no-op",
    why: "no no-op rule: re-sending the state a member is already in writes and audits a change that did not happen",
    find: "  if (p_role is not null and p_role = v_target_role)\n     or (p_active is not null and p_active = v_target_active) then\n    return jsonb_build_object('status', 'noop', 'role', v_target_role, 'active', v_target_active);\n  end if;\n",
    replace: "",
  },
  {
    id: "set/ceiling-ignores-the-current-role",
    fn: SET,
    expect: "M210.6 · a manager cannot demote an owner",
    why: "A6's first half dropped: a manager demotes the owner to server — a role within reach — and takes the place from below",
    find: "  if v_caller_rank < (case v_target_role when 'owner' then 3 when 'manager' then 2 else 1 end)\n     or (p_role",
    replace: "  if (p_role",
  },
  {
    id: "set/ceiling-ignores-the-requested-role",
    fn: SET,
    expect: "M210.7 · a manager cannot mint an owner",
    why: "A6's second half dropped: a manager raises a server to owner and signs in as them",
    find: "     or (p_role is not null\n         and v_caller_rank < (case p_role when 'owner' then 3 when 'manager' then 2 else 1 end)) then",
    replace: " then",
  },
  {
    id: "set/ceiling-refuses-a-peer",
    fn: SET,
    expect: "M210.1 · an active manager promotes a server",
    why: "over-block: `<=` reads as 'nobody at or above me' and forbids a manager from moving a server to manager, or touching a peer",
    find: "  if v_caller_rank < (case v_target_role when 'owner' then 3 when 'manager' then 2 else 1 end)\n     or (p_role is not null\n         and v_caller_rank < (case p_role",
    replace:
      "  if v_caller_rank < (case v_target_role when 'owner' then 3 when 'manager' then 2 else 1 end)\n     or (p_role is not null\n         and v_caller_rank <= (case p_role",
  },
  // ── mms_staff_set: the write and its ledger row (M205) ──
  {
    id: "set/active-flip-not-written",
    fn: SET,
    expect: "M210.4 · the deactivation landed",
    why: "the flag never reaches the row: the console says switched off, the member still signs in",
    find: "         active = coalesce(p_active, s.active),\n",
    replace: "         active = s.active,\n",
  },
  {
    id: "set/no-audit-row",
    fn: SET,
    expect: "M210.8 · ONE audit row per write",
    why: "M205 itself: the write lands and nothing durable says who did it",
    find: "  insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)\n    values (p_caller, v_action, p_target, v_target_role, coalesce(p_role, v_target_role));\n",
    replace: "",
  },
  {
    id: "set/audit-names-the-target-as-actor",
    fn: SET,
    expect: "M210.8 · the role change is recorded as who, what, from, to",
    why: "a ledger that records the wrong person is worse than none: it answers 'who made this person a manager' with them",
    find: "    values (p_caller, v_action, p_target, v_target_role, coalesce(p_role, v_target_role));",
    replace:
      "    values (p_target, v_action, p_target, v_target_role, coalesce(p_role, v_target_role));",
  },
  {
    id: "set/audit-swaps-on-and-off",
    fn: SET,
    expect: "M210.8 · the deactivation is recorded",
    why: "the ledger says reactivated for an offboarding — the one direction a reader must not get backwards",
    find: "                   when p_active then 'reactivated' else 'deactivated' end;",
    replace: "                   when p_active then 'deactivated' else 'reactivated' end;",
  },
  // ── mms_staff_provision ──
  {
    id: "provision/switched-off-caller-passes",
    fn: PROV,
    expect: "M210.9 · a switched-off manager cannot invite",
    why: "an offboarded manager still mints accounts",
    find: "  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
    replace:
      "  if v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
  },
  {
    id: "provision/floor-admits-a-server",
    fn: PROV,
    expect: "M210.9 · a server cannot invite",
    why: "the floor one rung low on the invite",
    find: "  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
    replace:
      "  if v_caller_active is not true or v_caller_rank < 1 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
  },
  {
    id: "provision/ceiling-dropped",
    fn: PROV,
    expect: "M210.9 · a manager cannot invite an owner",
    why: "A6's invite ceiling: a manager invites an owner at an address they control and signs in as them",
    find: "  if v_caller_rank < (case p_role when 'owner' then 3 when 'manager' then 2 else 1 end) then\n    return jsonb_build_object('status', 'ceiling');\n  end if;\n\n  begin",
    replace: "  begin",
  },
  {
    id: "provision/no-audit-row",
    fn: PROV,
    expect: "M210.9 · the invite is recorded",
    why: "M205 on the invite: an account appears and nothing says who created it",
    find: "  insert into public.staff_audit (actor_id, action, target_id, from_role, to_role)\n    values (p_caller, 'invited', p_user_id, null, p_role);\n",
    replace: "",
  },
  {
    id: "provision/duplicate-reads-ok",
    fn: PROV,
    expect: "M210.9 · the same member again is exists",
    why: "a duplicate answers ok: the console says invited, and the invite email goes to someone whose row was never written",
    find: "    return jsonb_build_object('status', 'exists');",
    replace: "    return jsonb_build_object('status', 'ok');",
  },
  {
    id: "provision/email-case-kept",
    fn: PROV,
    expect: "M210.9 · the staff row is written, active, its e-mail lower-cased",
    why: "the allowlist matches lower(email); a mixed-case row is a member whose Google sign-in finds nobody",
    find: "      values (p_user_id, lower(p_email), p_role, p_display_name);",
    replace: "      values (p_user_id, p_email, p_role, p_display_name);",
  },
  // ── the owner invariant (M210) ──
  {
    id: "keep-owner/never-refuses",
    fn: TRIG,
    expect: "M210.11 · the last owner cannot be demoted",
    why: "the table-level invariant gone: a hand-run UPDATE leaves the restaurant with no owner",
    find: "    raise exception 'staff_keep_an_owner: the restaurant must keep at least one active owner'\n      using errcode = 'check_violation';\n",
    replace: "    null;\n",
  },
  {
    id: "keep-owner/an-off-owner-still-counts-as-kept",
    fn: TRIG,
    expect: "M210.11 · the last owner cannot be switched off",
    why: "the early exit reads role alone: deactivating the last owner keeps their role and passes",
    find: "  if tg_op = 'UPDATE' and new.role = 'owner' and new.active then",
    replace: "  if tg_op = 'UPDATE' and new.role = 'owner' then",
  },
  {
    id: "keep-owner/counts-switched-off-owners",
    fn: TRIG,
    expect: "M210.11 · the last owner cannot be demoted",
    why: "an owner who cannot sign in is counted as the one who remains",
    find: "  if not exists (select 1 from public.staff s where s.role = 'owner' and s.active) then",
    replace: "  if not exists (select 1 from public.staff s where s.role = 'owner') then",
  },
  // ── the locks: only the orders can see them ──
  {
    id: "set/team-lock-dropped",
    fn: SET,
    expect: ["c"],
    why: "two cross-demotions that lock each other's rows deadlock instead of queueing",
    find: "  -- (1) the team lock: every team write queues here, before any row lock.\n  perform pg_advisory_xact_lock(hashtext('mms_staff_team'));\n",
    replace: "",
  },
  {
    id: "set/caller-lock-dropped",
    fn: SET,
    expect: ["d"],
    why: "M208 again: the caller's role is read past an uncommitted revocation",
    find: "    from public.staff s where s.user_id = p_caller\n    for share;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
    replace:
      "    from public.staff s where s.user_id = p_caller;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
  },
  {
    id: "set/caller-lock-is-key-share",
    fn: SET,
    expect: ["d"],
    why: "KEY SHARE does not wait for a non-key UPDATE, so a role change lands unseen",
    find: "    from public.staff s where s.user_id = p_caller\n    for share;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
    replace:
      "    from public.staff s where s.user_id = p_caller\n    for key share;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
  },
  {
    id: "set/both-function-locks-dropped",
    fn: SET,
    expect: ["a", "b", "c", "d"],
    why: "A6's shape: the decision read with no lock at all — the loser of a cross-demotion is stopped only by the trigger, as an error, and a revocation by the function itself is not seen",
    edits: [
      {
        find: "  -- (1) the team lock: every team write queues here, before any row lock.\n  perform pg_advisory_xact_lock(hashtext('mms_staff_team'));\n",
        replace: "",
      },
      {
        find: "    from public.staff s where s.user_id = p_caller\n    for share;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
        replace:
          "    from public.staff s where s.user_id = p_caller;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n\n  -- (3)",
      },
    ],
  },
  {
    id: "set/target-lock-dropped",
    fn: SET,
    expect: ["e"],
    why: "the ceiling is decided on a role the UPDATE then writes over: a manager offboards a just-promoted owner",
    find: "    from public.staff s where s.user_id = p_target\n    for update;",
    replace: "    from public.staff s where s.user_id = p_target;",
  },
  {
    id: "provision/caller-lock-dropped",
    fn: PROV,
    expect: ["h"],
    why: "M208 on the invite: a manager demoted mid-call still mints an account",
    find: "    from public.staff s where s.user_id = p_caller\n    for share;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
    replace:
      "    from public.staff s where s.user_id = p_caller;\n  v_caller_rank := case v_caller_role when 'owner' then 3 when 'manager' then 2\n                                      when 'server' then 1 else 0 end;\n  -- No row reads as NULLs: rank 0, never active — one refusal for gone, off and below the floor.\n  if v_caller_active is not true or v_caller_rank < 2 then\n    return jsonb_build_object('status', 'not_authorized');\n  end if;\n  if v_caller_rank < (case p_role",
  },
  {
    id: "keep-owner/team-lock-dropped",
    fn: TRIG,
    expect: ["f"],
    why: "M210 against hand-run writers: two demotions of the last two owners each count the other, and both land",
    find: "  -- commits, never before (the header's ## THE TABLE-LEVEL INVARIANT).\n  perform pg_advisory_xact_lock(hashtext('mms_staff_team'));\n",
    replace: "  -- commits, never before (the header's ## THE TABLE-LEVEL INVARIANT).\n",
  },
  {
    id: "keep-owner/fires-for-every-row",
    fn: TRIG,
    expect: ["g"],
    why: "over-locking: every staff write — a rename, a server's PIN-adjacent edit — queues behind any team write",
    find: "  for each row\n  when (old.role = 'owner' and old.active)\n  execute function",
    replace: "  for each row\n  execute function",
  },
];

function apply(text, app) {
  q(text, app);
}

async function runMutants() {
  // The chain is this file alone: nothing later may define one of its functions.
  for (const fn of FUNCTIONS) {
    const last = lastDefiningMigration(fn);
    if (last !== MIGRATION_FILE) {
      throw new Error(
        `${TAG} REFUSED — ${fn} is last defined by ${last ?? "(nothing)"}, not ${MIGRATION_FILE}: ` +
          `re-applying this file would revert it, so every verdict would be about dead code.`,
      );
    }
  }
  // Drift, with NOTHING written: what would this migration produce, rolled back?
  const live = identityRows(q(IDENTITY));
  const expected = identityRows(q(`begin;\n${MIGRATION_TEXT}\n${IDENTITY}\nrollback;`));
  if (live !== expected || live.split("\n").length !== FUNCTIONS.length + 1) {
    throw new Error(
      `${TAG} REFUSED — the live definitions are not what ${MIGRATION_FILE} produces (or one is ` +
        `missing).\n  live:\n${live}\n  migration:\n${expected}`,
    );
  }
  console.log(
    `\n${TAG} mutation battery — ${MUTANTS.length} mutants against the LIVE definitions\n`,
  );
  const base = runSqlTest();
  if (base !== null) throw new Error(`${TAG} REFUSED — the SQL test is already red: ${base}`);
  const baseReds = await battery(false);
  if (baseReds.length) {
    throw new Error(
      `${TAG} REFUSED — the UNMUTATED orders are already red: ${baseReds.why.join("; ")}`,
    );
  }
  console.log(
    `  ${green("baseline")} ${dim("the SQL test and all eight orders green on the real definitions")}`,
  );

  let bad = 0;
  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ find: m.find, replace: m.replace }];
    const stale = edits.filter((e) => MIGRATION_TEXT.split(e.find).length - 1 !== 1);
    if (stale.length) {
      console.log(`  ${red("STALE")} ${m.id} — ${stale.length} edit(s) did not match exactly once`);
      bad++;
      continue;
    }
    const mutated = edits.reduce((t, e) => t.replace(e.find, () => e.replace), MIGRATION_TEXT);
    let live_ = true;
    const restoreNow = () => {
      if (!live_) return;
      live_ = false;
      apply(MIGRATION_TEXT, "restore");
    };
    process.once("exit", restoreNow);
    process.once("SIGINT", restoreNow);
    process.once("SIGTERM", restoreNow);
    try {
      apply(mutated, "mutate");
      if (identityRows(q(IDENTITY)) === live) {
        console.log(`  ${red("INERT")} ${m.id} — applied, but no definition changed`);
        bad++;
        continue;
      }
      if (typeof m.expect === "string") {
        const got = runSqlTest();
        if (got === null) {
          console.log(`  ${red("SURVIVED")} ${m.id} — ${m.why}`);
          bad++;
        } else if (!got.includes(m.expect)) {
          console.log(
            `  ${red("WRONG CASE")} ${m.id} — want ${m.expect}, got: ${got.slice(0, 120)}`,
          );
          bad++;
        } else {
          console.log(`  ${green("caught")} ${m.id} ${dim(`by ${m.expect}`)}`);
        }
      } else {
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
          console.log(`  ${green("caught")} ${m.id} ${dim(`by orders (${reds.join(", ")})`)}`);
          console.log(dim(`      ${reds.why.join("\n      ")}`));
        }
      }
    } finally {
      restoreNow();
      process.removeListener("exit", restoreNow);
      process.removeListener("SIGINT", restoreNow);
      process.removeListener("SIGTERM", restoreNow);
    }
    if (identityRows(q(IDENTITY)) !== live) {
      throw new Error(`${TAG} FATAL — the restore after ${m.id} is not byte-identical.`);
    }
  }
  const after = runSqlTest();
  if (after !== null) {
    console.log(red(`  the SQL test is RED after the battery: ${after}`));
    bad++;
  }
  if (bad) {
    console.log(red(`\n✗ verify:team-race --mutants — ${bad} mutant(s) not caught cleanly\n`));
  } else {
    console.log(
      green(`\n✓ all ${MUTANTS.length} mutants caught; definitions restored byte-identical\n`),
    );
  }
  return bad;
}

async function main() {
  assertNotATunnel();
  assertLocalOnly();
  // Mutual exclusion: fixtures are committed and swept, and --mutants replaces live functions. A
  // session-level advisory lock dies with its connection, so a kill cannot wedge it.
  const guard = new Session("guard");
  if ((await guard.run(`select pg_try_advisory_lock(hashtext('m210r-team-race'));`)) !== "t") {
    await guard.close();
    refuse(`another team-race run holds the advisory lock on this database`);
  }
  lockOwned = true;
  let failed = 0;
  try {
    cleanup(); // a previous run killed mid-flight
    const foreign = q(`select count(*) from public.staff
                        where role = 'owner' and active and display_name not like '${TAG} %';`);
    if (foreign !== "0") {
      refuse(
        `${foreign} active owner(s) on this database are not this harness's fixtures. The owner ` +
          `invariant is over the whole table, so orders (a), (c) and (f) cannot be judged here — ` +
          `run against a fresh local stack or a throwaway cluster.`,
      );
    }
    if (process.argv.includes("--mutants")) {
      failed += await runMutants();
    } else {
      console.log(`\n${TAG} — the team writes' locks against a second session\n`);
      failed += (await battery(true)).length;
    }
  } finally {
    cleanup();
    await guard.close();
  }
  const left = q(`select count(*) from public.staff where display_name like '${TAG} %';`);
  if (left !== "0") {
    console.log(red(`✗ cleanup left ${left} ${TAG} staff rows behind`));
    failed++;
  }
  if (failed) {
    console.log(red(`\n✗ verify:team-race — ${failed} failure(s)\n`));
    process.exit(1);
  }
  if (!process.argv.includes("--mutants")) {
    console.log(green(`\n✓ verify:team-race — ${Object.keys(ORDERS).length} orders\n`));
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
