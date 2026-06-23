-- 20260623010000_s3_tab_followups.sql — S3.1 post-merge adversarial follow-ups (docs/S3_DESIGN.md).
-- Two fresh-context deep reviewers over the merged S3.1 (#62). Confirmed real findings:
--   A1 [data-integrity]: mms_merge_table_orders ignored the tab columns, so folding a table with an open
--     trust tab into another silently dropped the tab (the floor stopped showing "Tab"; the S3.3
--     ceiling/nudge — which gate on tab_type — would no longer fire). Carry the tab forward on a fold.
--   A3 [privacy, Min: fix now]: tab_opened_by stored the opener's auth.uid() on the diner-readable qr_carts
--     row, which fans out to anonymous diners over realtime — a STAFF uid for staff-opened tabs. Drop the
--     column; opener attribution returns in S3.3 via the service-role-only mms_tab_events audit log.
-- (A2 — refuse open mid-payment — is enforced in the app layer (lib/tabs.ts) via the canonical
-- paymentInFlightReason mutex, to avoid a second copy of the lock TTLs drifting in SQL.)

-- ── A3: drop the opener-uid column + re-create mms_open_tab WITHOUT the p_by arg (signature change, so
-- DROP + CREATE, not REPLACE). The function is dropped first, then the column it used to write. ──────────
drop function if exists public.mms_open_tab(uuid, uuid);
alter table public.qr_carts drop column if exists tab_opened_by;

create or replace function mms_open_tab(p_cart uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_status text; v_mode text; v_tab text; v_sess text;
begin
  select c.status, s.mode, c.tab_type, s.status into v_status, v_mode, v_tab, v_sess
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart
    for update of c;
  if v_status is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_sess = 'closed' then return 'not_open'; end if;          -- swept session: never open an unclosable tab
  if v_mode <> 'dinein' then return 'not_dinein'; end if;       -- pickup/grocery pay at checkout, never a tab
  if v_tab <> 'none' then return 'ok'; end if;                  -- already a tab (trust/secure) → benign no-op
  update public.qr_carts set tab_type = 'trust', tab_opened_at = now() where id = p_cart;
  return 'ok';
end $$;
revoke all on function public.mms_open_tab(uuid) from public, anon, authenticated;
grant execute on function public.mms_open_tab(uuid) to service_role;

-- ── A1: mms_merge_table_orders carries a trust tab forward on a fold (CREATE OR REPLACE; signature
-- unchanged). Body is the live definition + the tab-inheritance UPDATE. ───────────────────────────────────
create or replace function mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  -- Row-lock both carts and require BOTH still open (orders by id to avoid a deadlock with a concurrent
  -- merge of the same pair in the other direction).
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;
  if (select count(*) from public.qr_carts
        where id in (p_source_cart, p_target_cart) and status = 'open') <> 2 then
    raise exception 'both carts must be open to merge (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  for r in
    select id, menu_item_id, qty,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items where cart_id = p_source_cart
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb) = r.modkey
    limit 1;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      -- No identical target line (or the merge would exceed the 99 cap) → re-parent as its own line.
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  -- S3.1 follow-up [A1]: carry a trust tab forward. A tab opened on the SOURCE must not vanish when its
  -- lines move to the TARGET. Inherit only UP — never downgrade a target 'secure' tab (S3.2) — and take
  -- the earliest open time. Only when the source had a tab; a 'none' source leaves the target untouched.
  -- Secure card tokens live on the source cart and don't transfer, so a (future) secure source folds in
  -- as a trust tab on the target.
  update public.qr_carts tgt
    set tab_type = case when tgt.tab_type = 'secure' then 'secure' else 'trust' end,
        tab_opened_at = least(coalesce(tgt.tab_opened_at, src.tab_opened_at), src.tab_opened_at)
    from public.qr_carts src
    where tgt.id = p_target_cart and src.id = p_source_cart and src.tab_type <> 'none';

  -- Bump the target so floor/realtime peers re-sync; cancel the now-empty source cart + close its session.
  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;

revoke all on function mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function mms_merge_table_orders(uuid, uuid) to service_role;
