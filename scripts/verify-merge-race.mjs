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
 * An earlier design had B lock the TARGET instead. It was rejected: B would have to do two unrelated
 * things, A would block at a statement that is not the one under test, and — decisively — B would
 * have committed and released before A reached the delete, so EvalPlanQual, the actual mechanism the
 * guard depends on, would never fire. That variant survives here as S7 only, whose sole job is to
 * prove the target's `for update` exists at all.
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
const DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
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
  if (r.status !== 0) throw new Error(`psql failed:\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

/**
 * Layer 2 of the prod guard: an in-DB refusal, run before a single INSERT.
 *
 * The two OBVIOUS discriminators are both refuted by measurement and must not be reintroduced:
 *   · `inet_server_port()` is 5432 on BOTH — `config.toml`'s 54322 is a host-side Docker map that the
 *     container's backend never sees.
 *   · `inet_server_addr()` on the hosted project is a public AWS IPv6 address, so "private ⇒ local"
 *     is false in both directions.
 *
 * What does discriminate: on a local stack `postgres` IS a superuser and the connection is NOT SSL;
 * on the hosted project `postgres` is not super (only `supabase_admin` is) and SSL is on.
 *
 * The failure direction is the point. If either predicate is ever wrong about the LOCAL stack, this
 * REFUSES to run — loud, and never a silent write into production. A false refusal is visible; a
 * silent commit into the live database would not be.
 */
function assertLocalOnly() {
  const out = q(`select
      current_user,
      coalesce((select usesuper from pg_user where usename = current_user), false),
      coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), true)`);
  const [user, isSuper, isSsl] = out.split("|");
  if (isSuper !== "t" || isSsl !== "f") {
    console.error(
      red(
        `\n${TAG} REFUSED — this harness COMMITS fixture rows and must never touch a hosted database.\n`,
      ) +
        `  current_user=${user} usesuper=${isSuper} ssl=${isSsl}\n` +
        `  A local supabase stack is usesuper=t, ssl=f. The hosted project is usesuper=f, ssl=t.\n` +
        `  Do NOT use inet_server_port() to relax this — it is 5432 on BOTH.\n` +
        `  Do NOT relax this to make a run work. Start the local stack instead: supabase start\n`,
    );
    process.exit(1);
  }
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
    this.proc.stderr.on("data", (d) => (this.errBuf += d));
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
      if (this.errBuf) throw new Error(`${this.name} psql error:\n${this.errBuf}`);
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
 * The timeout message names the line it is really about: if the target's `for update` is ever removed
 * from the match query, S7 stops blocking and times out here, and the next maintainer must not
 * "fix" that by loosening the poll.
 */
async function waitBlocked(aPid, bPid, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const blockers = q(`select coalesce(array_to_string(pg_blocking_pids(${aPid}), ','), '')`);
    if (blockers.split(",").includes(String(bPid))) return;
    if (Date.now() - t0 > ms) {
      throw new Error(
        `${TAG} TIMEOUT — session A never blocked on session B.\n` +
          `  That means the merge did NOT wait where this harness expects it to.\n` +
          `  If this fired on S7, the \`for update\` on the match query is GONE — restore it rather\n` +
          `  than loosening this poll. If on S1-S6, the guarded DELETE no longer contends with the\n` +
          `  source row, which is the guard itself going missing.`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const P = 300; // the real applied Balachaung price, before the edit
const P2 = 1000; // …and after it ($3.00 -> $10.00)

/** Commit one fixture pair. Returns the ids. Everything is tagged M102- so cleanup can be exact. */
function fixture(n) {
  const out = q(`
    with s as (
      insert into public.table_sessions (qr_code, mode, status, host_seat)
      values ('M102-S${n}', 'dinein', 'active', null), ('M102-T${n}', 'dinein', 'active', null)
      returning id, qr_code
    ), c as (
      insert into public.qr_carts (session_id)
      select id from s order by qr_code returning id, session_id
    ), i as (
      insert into public.qr_cart_items
        (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
      select c.id, 'M102-dish', 'Balachaung', 1, ${P}, 32, null, 'dinein' from c
      returning id, cart_id
    )
    select (select id from c order by id limit 1),
           (select id from c order by id offset 1 limit 1),
           (select i.id from i join c on c.id = i.cart_id
              where c.id = (select id from c order by id limit 1)),
           (select i.id from i join c on c.id = i.cart_id
              where c.id = (select id from c order by id offset 1 limit 1))`);
  const [srcCart, tgtCart, srcLine, tgtLine] = out.split("|");
  return { srcCart, tgtCart, srcLine, tgtLine };
}

/**
 * The fold's predicate list, copied and with the price comparison flipped to `=`, asserting that a
 * fold WOULD have landed. Without this, "the fold refused" is vacuous — a fixture that violates some
 * unrelated predicate refuses for the wrong reason and every assertion below passes.
 *
 * ⚠️ A deliberate COPY that WILL go stale if the fold gains a predicate. Update it in the same commit,
 * exactly as `m98_merge_matches_price_test.sql`'s header instructs. It fails safe: a stale copy
 * returns 0 and this aborts.
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
      and t.unit_price_cents = s.unit_price_cents`);
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
    moved: 2,
    tgtLines: 1,
    srcLines: 0,
    why: "CONTROL — B locks without writing, so nothing actually changed. The fold MUST still land. Kills `delete … and false` and any permanently-refusing guard.",
  },
  {
    id: "C1",
    control: true,
    mutate: (f) =>
      `update public.qr_cart_items set tax_cents = tax_cents + 1 where id = '${f.srcLine}'`,
    moved: 2,
    tgtLines: 1,
    srcLines: 0,
    why: "CONTROL — a column the guard does NOT re-assert changed. The fold must still land, and EvalPlanQual's recheck must PASS. Kills an over-tight guard.",
  },
  {
    id: "S1",
    mutate: (f) => `update public.qr_cart_items set qty = 2 where id = '${f.srcLine}'`,
    moved: 2,
    tgtLines: 2,
    srcLines: 0,
    why: "qty — drop `and qty = r.qty` and the fold lands on the STALE r.qty: one unit silently destroyed, not charged, not cooked, no error. The RPC value is the only thing that catches a revert of the read-back `v_moved`.",
  },
  {
    id: "S2",
    mutate: (f) => `update public.qr_cart_items set state = 'voided' where id = '${f.srcLine}'`,
    moved: 0,
    tgtLines: 1,
    srcLines: 1,
    why: "state — and the eligibility half: a voided line must be LEFT ON THE SOURCE, stranded on the cancelled cart where its own audit lives, never carried into the target.",
  },
  {
    id: "S3",
    mutate: (f) => `update public.qr_cart_items set comped = true where id = '${f.srcLine}'`,
    moved: 0,
    tgtLines: 1,
    srcLines: 1,
    why: "comped — separates the `comped` half of both guards from the `state` half, which S2 alone would conflate.",
  },
  {
    id: "S4",
    mutate: (f) =>
      `update public.qr_cart_items set unit_price_cents = ${P2} where id = '${f.srcLine}'`,
    moved: 1,
    tgtLines: 2,
    srcLines: 0,
    why: "THE BRANCH M102 EXISTS FOR — M98's own header calls this one 'reasoned-correct, UNPROVEN'. Drop the predicate and both units are charged at one price: uncapped error, plus tax, plus the tip riding it.",
  },
  {
    id: "S5",
    mutate: (f) => `update public.qr_cart_items set fulfillment = 'togo' where id = '${f.srcLine}'`,
    moved: 1,
    tgtLines: 2,
    srcLines: 0,
    why: "fulfillment — M97's defect back through the door: a now-to-go row folded into a dine-in target, wrong tax on the cold categories.",
  },
  {
    id: "S6",
    mutate: (f) => `update public.qr_cart_items set notes = 'no chili' where id = '${f.srcLine}'`,
    moved: 1,
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
    await b.run("begin; set local idle_in_transaction_session_timeout = '60s';");

    // B mutates (or merely locks) the SOURCE row and holds the transaction open. The row count is
    // asserted, because a mutation that matched nothing would make A never block and the failure
    // would surface as a confusing timeout rather than as "the fixture was wrong".
    const rows = await b.run(
      `${s.mutate(f)};\nselect count(*) from public.qr_cart_items where id = '${f.srcLine}' for update;`,
    );
    if (!rows.split("\n").pop().trim().endsWith("1")) {
      throw new Error(
        `${TAG} ${s.id}: B's statement did not affect the source row (got ${JSON.stringify(rows)})`,
      );
    }

    // A now runs the merge. It will block at the guarded DELETE, on B's row lock.
    a.fire(`select public.mms_merge_table_orders('${f.srcCart}', '${f.tgtCart}');`);
    await waitBlocked(aPid, bPid);

    await b.run("commit;");
    const moved = (await a.collect()).split("\n").pop().trim();

    const tgtLines = q(`select count(*) from public.qr_cart_items where cart_id = '${f.tgtCart}'`);
    const srcLines = q(`select count(*) from public.qr_cart_items where cart_id = '${f.srcCart}'`);

    const label = `${s.id}${s.control ? " (control)" : ""}`;
    const ok =
      [
        check(`${label} RPC moved`, moved, s.moved),
        check(`${label} target lines`, tgtLines, s.tgtLines),
        check(`${label} source lines`, srcLines, s.srcLines),
      ].every(Boolean) &&
      (s.id !== "S1" ||
        check(
          `${label} the moved line kept its CURRENT qty`,
          q(`select qty from public.qr_cart_items where id = '${f.srcLine}'`),
          2,
        ));

    console.log(`  ${ok ? green("caught") : red("FAILED")} ${label} — ${s.why}`);
  } finally {
    await b.close();
    await a.close();
  }
}

/**
 * S7 — liveness only, and the ONLY thing covering the target's `for update`.
 *
 * S1–S6 neither assert it nor depend on it. This is a known coverage shape, written down rather than
 * left for someone to discover: it is proved by a timeout, not by a wrong number.
 */
async function runS7() {
  const f = fixture("S7");
  assertFoldable(f, "S7");
  const b = new Session("b-S7");
  const a = new Session("a-S7");
  try {
    const bPid = await b.run("select pg_backend_pid();");
    const aPid = await a.run("select pg_backend_pid();");
    await b.run("begin; set local idle_in_transaction_session_timeout = '60s';");
    await b.run(`select id from public.qr_cart_items
      where cart_id = '${f.tgtCart}' and by_seat is null and state <> 'voided'
        and not comped and notes is null for update;`);
    a.fire(`select public.mms_merge_table_orders('${f.srcCart}', '${f.tgtCart}');`);
    await waitBlocked(aPid, bPid);
    await b.run("commit;");
    const moved = (await a.collect()).split("\n").pop().trim();
    const ok = [
      check("S7 RPC moved", moved, 2),
      check(
        "S7 target lines",
        q(`select count(*) from public.qr_cart_items where cart_id = '${f.tgtCart}'`),
        1,
      ),
    ].every(Boolean);
    console.log(
      `  ${ok ? green("caught") : red("FAILED")} S7 (liveness) — proves the match query's \`for update\` exists at all; remove it and this times out rather than returning a wrong number.`,
    );
  } finally {
    await b.close();
    await a.close();
  }
}

function cleanup() {
  // Never `truncate`, never an unqualified delete — every statement is keyed to this harness's own
  // tag, so even a total failure of the guards above cannot widen the blast radius.
  q(`delete from public.qr_cart_items ci using public.qr_carts c, public.table_sessions s
       where ci.cart_id = c.id and c.session_id = s.id and s.qr_code like 'M102-%'`);
  q(`delete from public.qr_carts c using public.table_sessions s
       where c.session_id = s.id and s.qr_code like 'M102-%'`);
  q(`delete from public.table_sessions where qr_code like 'M102-%'`);
}

async function main() {
  assertLocalOnly();

  // The whole harness rests on each SPI statement getting a fresh snapshot, which is true because the
  // function is VOLATILE — by omission of a marker, not by intent. Mark it STABLE and the delete
  // would inherit the caller's snapshot, never see B's commit, and every scenario below would go
  // green having proved nothing.
  const vol = q(`select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'mms_merge_table_orders'`);
  if (vol !== "v") {
    console.error(
      red(
        `${TAG} WRONG VOLATILITY — mms_merge_table_orders is provolatile='${vol}', expected 'v'.`,
      ) +
        `\n  A non-VOLATILE function reuses the caller's snapshot, so the guarded DELETE would never see\n` +
        `  the concurrent commit and every scenario here would pass without testing anything.\n`,
    );
    process.exit(1);
  }

  console.log(`\n${TAG} — the merge's concurrency guard, against a real second session\n`);
  cleanup(); // in case a previous run died mid-flight
  try {
    for (const s of SCENARIOS) await runScenario(s);
    await runS7();
  } finally {
    cleanup();
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
      "  (S1–S6 prove the guard refuses; C0/C1 prove it still allows; S7 proves the target lock exists.)\n",
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
