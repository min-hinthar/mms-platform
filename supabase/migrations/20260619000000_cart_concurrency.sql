-- 20260619000000_cart_concurrency.sql
-- Concurrency hardening for the cart path (surfaced by the M1·P1.2 adversarial review).
--
--  • mms_cart_item_inc_qty — an ATOMIC single-line qty bump. The line-merge in addItem was a
--    non-atomic read-modify-write (read dup.qty, then write dup.qty + 1), so two concurrent
--    group-cart adds of the same line both read N and both write N+1 → a lost increment
--    (undercharge). An in-DB `qty = qty + 1` is atomic. Runs as the service-role invoker (the only
--    caller), search_path pinned, schema-qualified; revoked from anon/authenticated (not
--    client-callable), matching the other mms_* helpers.
--
--  • qr_carts_one_open_per_session — at most one OPEN cart per session. The /api/session
--    find-or-create was select-then-insert (racy: concurrent joins could each insert an open cart).
--    With this partial unique index the insert loser hits a unique violation and re-reads the
--    winner's cart, so the session converges on a single open cart.

create function mms_cart_item_inc_qty(p_id uuid) returns void
  language sql set search_path = '' as $$
  update public.qr_cart_items set qty = qty + 1 where id = p_id;
$$;
revoke all on function mms_cart_item_inc_qty(uuid) from anon, authenticated;

-- Defensive: collapse any pre-existing duplicate open carts (keep the newest) so the index applies.
update public.qr_carts c
  set status = 'cancelled'
  where c.status = 'open'
    and exists (
      select 1 from public.qr_carts c2
      where c2.session_id = c.session_id and c2.status = 'open' and c2.created_at > c.created_at
    );

create unique index qr_carts_one_open_per_session
  on public.qr_carts (session_id) where status = 'open';
