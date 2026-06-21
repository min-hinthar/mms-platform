-- 20260621140000_floor_realtime.sql
-- S1.2 (staff floor view). Put table_sessions + session_members on the realtime publication so the
-- staff floor view updates LIVE as tables open/close and parties grow — the same Postgres-Changes
-- pattern as /track (qr_orders) and the group cart (qr_carts/qr_cart_items). Authorization is the
-- EXISTING is_staff() branch S1.1a folded into each table's SELECT policy (sess_read / mem_read):
-- Realtime enforces RLS per-subscriber, so a STAFF socket receives every active table's events while
-- a diner still only sees their own. No new policy is needed — this is purely publication membership.
--
-- NOTE: this covers postgres_changes (RLS-gated reads) only. Staff BROADCAST/presence (e.g. an S2 KDS
-- push to the floor) needs a `realtime.messages` is_staff() policy on a PRIVATE channel — deferred to
-- S2, same as the cart/shares broadcast note in lib/realtime.ts. The floor view is read-only.
--
-- Additive (publication membership only — no schema/column/type change, so no types-fresh drift) and
-- guarded/idempotent (only touch the publication if it exists and the table isn't already a member),
-- matching 20260619000400_track_realtime + 20260620000600_cart_realtime. Safe to apply to live ahead
-- of merge (LEARNINGS #79). REPLICA IDENTITY: table_sessions closes are UPDATEs and session_members
-- is INSERT-only (no leave path), and the floor subscribes with NO per-row filter (staff RLS scopes
-- delivery), so the default identity (PK) is sufficient — no `replica identity full` needed.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_sessions'
    ) then
      alter publication supabase_realtime add table public.table_sessions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_members'
    ) then
      alter publication supabase_realtime add table public.session_members;
    end if;
  end if;
end $$;
