-- 20260623050000_s3_secure_tab_signal.sql — S3.3 wrap follow-up [adversarial #1]: make mms_secure_tab
-- signal whether it actually flipped the tab to 'secure' ('secured') vs a no-op on an already-secure tab
-- ('exists'), mirroring the opened/exists pattern on mms_open_tab. The webhook gates the durable 'secured'
-- audit event on the transition, so a Stripe SetupIntent redelivery (mms_secure_tab is idempotent and
-- returns success) no longer appends a duplicate 'secured' row to mms_tab_events. CREATE OR REPLACE;
-- signature unchanged (Returns: text → no types drift). Body = the S3.2 definition + the return signal.
create or replace function mms_secure_tab(p_cart uuid, p_customer text, p_payment_method text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_status text; v_mode text; v_tab text;
begin
  select c.status, s.mode, c.tab_type into v_status, v_mode, v_tab
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart
    for update of c;
  if v_status is null then return 'not_found'; end if;

  -- Record the token (upsert keyed on cart_id; one Customer per tab — never change a recorded customer).
  insert into public.mms_tab_secure (cart_id, stripe_customer_id, stripe_payment_method_id, secured_at)
    values (p_cart, p_customer, p_payment_method, now())
    on conflict (cart_id) do update
      set stripe_payment_method_id = excluded.stripe_payment_method_id, secured_at = now();

  -- Flip to 'secure' only on a live, open, dine-in tab that isn't already secure → that's the transition
  -- the audit log records exactly once. An already-secure tab (redelivery) is a benign 'exists' no-op.
  if v_status = 'open' and v_mode = 'dinein' and v_tab <> 'secure' then
    update public.qr_carts
      set tab_type = 'secure', tab_opened_at = coalesce(tab_opened_at, now())
      where id = p_cart;
    return 'secured';
  end if;
  return 'exists';
end $$;
revoke all on function public.mms_secure_tab(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mms_secure_tab(uuid, text, text) to service_role;
