-- 20261005120000_p3c2_table_number_uniq.sql — Phase 3c-ii (D22): ONE active dine-in session per table NUMBER.
--
-- The table number is an identity beside the sticker token now: a session can be seated LATE — a
-- generated join code bound to 7 at the first Send (`bindTable`, lib/bind-table.ts) — and the
-- sticker token never names that row. Every writer finds the party at N by number
-- (`seatedSessionFor`, lib/seated.ts), and this index is what makes "the party at N" a single row:
-- two simultaneous binds, a bind racing the register's Start, a kiosk claim racing a phone — the
-- second writer takes a 23505, re-reads BY NUMBER and converges or refuses. Before it, the floor
-- strip called two live sessions on one number "a data anomaly" (lib/floor-rows.ts) and nothing
-- prevented one.
--
-- Three steps, in this order, ONE transaction (the MCP `apply_migration` wraps the file):
--   1. close the EXPIRED-but-still-active dine-in rows that carry a number — the pg_cron sweeper's
--      own act (`mms_sweep_expired_sessions`, every 15 minutes), done here so a dead row cannot make
--      step 3 fail against a session nobody can use;
--   2. RAISE, naming the numbers, when two LIVE dine-in rows share one. This migration never closes
--      a live row: the owner clears the duplicate from the floor (/staff → Clear table) and
--      re-applies. The query to measure prod before applying (owner question 9):
--        select table_number, count(*) from table_sessions
--         where status = 'active' and mode = 'dinein' and table_number is not null
--         group by 1 having count(*) > 1;
--   3. the partial unique index — the PHASE3B_DESIGN shape: NULLs are distinct (a numberless
--      host-mint code never collides), `status = 'active'` so a turned-over table reuses its number
--      once the prior session closes, and `mode = 'dinein'` because only a dine-in session is a
--      SEAT: a pickup row carrying a number (the register's counter arms write null, but the column
--      is not constrained) must never block a table. Indexes do not appear in database.types.ts, so
--      this is a no-op for the types-fresh check (20260620000500's note).
--
-- The index is partial on `status`, so an expired-but-active row still holds N until the cron runs:
-- every number-stamping writer sweeps it first (`sweepExpiredOnTable`), as the token writers always
-- swept the code. Deploy before apply is safe (the pre-reads decide the common path; only truly
-- simultaneous writes stay open until this lands) — and this file is applied ONE FILE AT A TIME via
-- the Supabase MCP, never `db push` (the prod history is divergent — CLAUDE.md).
--
-- Pinned by supabase/tests/p3c2_table_number_uniq_test.sql (case 1 goes red on the un-migrated stack).

-- ── 1. the dead rows: closed, exactly as the sweeper would close them ───────────────────────────
update public.table_sessions s
   set status = 'closed'
 where s.status = 'active'
   and s.mode = 'dinein'
   and s.table_number is not null
   and s.expires_at <= now();

-- ── 2. live duplicates: refuse, naming them — never close a live row ───────────────────────────
do $$
declare v_dupes text;
begin
  select string_agg(d.table_number::text, ', ' order by d.table_number) into v_dupes
    from (select table_number
            from public.table_sessions
           where status = 'active' and mode = 'dinein' and table_number is not null
           group by table_number
          having count(*) > 1) d;
  if v_dupes is not null then
    raise exception 'p3c2: two live dine-in sessions share table(s) % — clear the duplicate from the floor (/staff) and re-apply; this migration never closes a live row',
      v_dupes;
  end if;
end $$;

-- ── 3. the index ────────────────────────────────────────────────────────────────────────────────
create unique index if not exists table_sessions_active_table_uniq
  on public.table_sessions (table_number)
  where status = 'active' and mode = 'dinein';
