-- 20260620000500_session_join_race.sql
-- M3·P3.1 (group cart — multi-device join). A dine-in table session is now SHARED: a second phone
-- scanning the same physical sticker (qr_code = an opaque per-table token) or entering the host's
-- server-issued join code resolves to the SAME active session. /api/session is find-or-create by
-- qr_code, so two phones joining the same code at once would otherwise BOTH find nothing and BOTH
-- insert → a split-brain (each diner in a different session + cart). This partial unique index makes
-- concurrent first-joiners collide on the loser's insert (23505) so the route re-reads and converges
-- on one session — the same race-safe pattern qr_carts_one_open_per_session uses for carts.
--
-- Partial (status='active') so a turned-over table can reuse the same physical sticker code for a
-- fresh session once the prior one closes/expires-and-is-swept. Indexes don't appear in the
-- generated database.types.ts, so this is a no-op for the types-fresh CI check.
create unique index if not exists table_sessions_active_qr_uniq
  on public.table_sessions (qr_code)
  where status = 'active';

-- Defense-in-depth on the now user-settable presence name (setDisplayName, M3·P3.1). The Zod
-- displayName schema caps input at 40 chars; this column CHECK bounds it at the DB too, so a future
-- write path that forgets the Zod cap still can't store an unbounded string (sweep: Zod .max() + a
-- column CHECK). 80 leaves headroom over the 40-char UX cap; existing names are already ≤40.
-- CHECK constraints don't appear in the generated types → no-op for types-fresh.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_members_name_len'
  ) then
    alter table public.session_members
      add constraint session_members_name_len check (char_length(display_name) <= 80);
  end if;
end $$;
