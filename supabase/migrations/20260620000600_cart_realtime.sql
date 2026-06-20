-- 20260620000600_cart_realtime.sql
-- M3·P3.2 (live group-cart sync). Put the cart + its lines on the realtime publication so a peer's
-- change (another phone at the dine-in table) reaches every member's client, which then re-fetches the
-- SERVER-AUTHORITATIVE view (getCartView) and merges it into keyed React state — never client math.
-- Door-agnostic by design (Postgres Changes, like /track): a future staff-POS write propagates too.
--
-- Authorization is the EXISTING member-gated SELECT RLS on these tables (qr_cart_read / qr_citem_read,
-- is_member(session_id)); Realtime enforces it per-subscriber, so a client only ever receives its own
-- table's cart — a guessed cart id reveals nothing. No schema/type change here (publication membership +
-- replica identity don't appear in the generated types → no types-fresh drift).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qr_cart_items'
    ) then
      alter publication supabase_realtime add table public.qr_cart_items;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qr_carts'
    ) then
      alter publication supabase_realtime add table public.qr_carts;
    end if;
  end if;
end $$;

-- A line removal is a DELETE (setQty 0 → delete). The default REPLICA IDENTITY (primary key) ships
-- only the deleted row's PK in the WAL, so a `cart_id=eq.<id>` subscriber filter can't match a DELETE
-- and the removal wouldn't sync. FULL ships the whole old row so the filter matches. qr_cart_items is
-- low-volume per table session, so the extra WAL is negligible. (qr_carts is UPDATE-only here — its new
-- row carries the id the filter needs — so it keeps the default identity.)
alter table public.qr_cart_items replica identity full;
