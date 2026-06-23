-- 20260623020000_s3_secure_tab.sql — S3.2: secure tab (SetupIntent → off-session close). docs/S3_DESIGN.md.
-- A secure tab saves a card via a SetupIntent (usage 'off_session') at open or mid-tab, and charges it
-- off-session at close. SAQ-A: we store ONLY Stripe TOKENS (Customer id + PaymentMethod id), never PAN —
-- the card lives in the Payment Element / Stripe.
--
-- KEY DESIGN CALL (refines the S3_DESIGN "store on the cart" line): the tokens live in a SERVICE-ROLE-ONLY
-- SIDECAR table, NOT on qr_carts. qr_carts is on the supabase_realtime publication and fans the FULL row
-- to every (anonymous) table member — putting stripe_customer_id / stripe_payment_method_id there would
-- broadcast payment tokens to diners (the A3 lesson, escalated from a uid to a payment token). The cart
-- row signals only tab_type='secure' (the "card on file" boolean the client legitimately needs); the
-- tokens stay in mms_tab_secure (default-deny RLS, NOT on the realtime publication), read service-role-side
-- by the off-session close.

create table if not exists public.mms_tab_secure (
  cart_id uuid primary key references public.qr_carts(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_payment_method_id text,             -- null until the SetupIntent confirms (validate-at-open, T7)
  secured_at timestamptz,                    -- stamped when the PM lands; null = Customer minted, not yet secured
  created_at timestamptz not null default now()
);
-- Service-role only: RLS on with NO policy = default-deny for anon/authenticated (service_role bypasses
-- RLS). Mirrors mms_loss_config / mms_tab_config. NOT added to supabase_realtime — tokens never fan out.
-- The intentional rls_enabled_no_policy advisor INFO is expected.
alter table public.mms_tab_secure enable row level security;
revoke all on public.mms_tab_secure from anon, authenticated;

-- ── mms_secure_tab: record the saved card after a confirmed SetupIntent (webhook setup_intent.succeeded)
-- and flip the tab to 'secure'. NEVER charges. The PM is always recorded (the card IS saved on the
-- Customer, so a close can use it); the cart only flips to 'secure' when it's a live, open, dine-in tab.
-- Securing can also OPEN a tab (card-first) — stamp tab_opened_at if unset. Idempotent; never downgrades.
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

  -- Flip to 'secure' only on a live, open, dine-in tab that isn't already secure.
  if v_status = 'open' and v_mode = 'dinein' and v_tab <> 'secure' then
    update public.qr_carts
      set tab_type = 'secure', tab_opened_at = coalesce(tab_opened_at, now())
      where id = p_cart;
  end if;
  return 'ok';
end $$;
revoke all on function public.mms_secure_tab(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mms_secure_tab(uuid, text, text) to service_role;
