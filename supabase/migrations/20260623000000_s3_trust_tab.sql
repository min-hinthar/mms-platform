-- 20260623000000_s3_trust_tab.sql — S3.1: trust tab (deferred settlement). See docs/S3_DESIGN.md.
-- A tab is the table order with settlement deferred — NOT a new ledger. The spine (qr_carts stays `open`
-- until a settle RPC flips it `paid`; S2's fire_batch lets a table fire in rounds) already supports it; S3.1
-- adds (1) a tab marker on the cart for floor legibility + the ceiling/nudge, (2) a tunable config, (3) the
-- open RPC. Close reuses the EXISTING settle paths (mms_fulfill_cash_order already accepts p_tip_cents for
-- the close-tip; card close is the M1 Payment Element) — no fourth fulfill path, no new charge-with-no-order
-- window. Secure-tab tokens (S3.2) land in a later migration. Additive + idempotent.

-- ── Tab state on the table-owned cart ────────────────────────────────────────────────────────────────────
alter table public.qr_carts
  add column if not exists tab_type text not null default 'none',          -- 'none'|'trust'|'secure'
  add column if not exists tab_opened_at timestamptz,
  add column if not exists tab_opened_by uuid;                             -- the opener's auth uid (staff or diner)

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qr_carts_tab_type_chk') then
    alter table public.qr_carts add constraint qr_carts_tab_type_chk
      check (tab_type in ('none','trust','secure'));
  end if;
end $$;

-- ── Tunable tab policy (singleton; parity with mms_loss_config) ──────────────────────────────────────────
create table if not exists public.mms_tab_config (
  id boolean primary key default true check (id),                          -- single row
  ceiling_cents integer not null default 40000 check (ceiling_cents > 0),   -- $400 silent ceiling (Min)
  nudge_party_size integer not null default 10 check (nudge_party_size > 0),-- suggest a secure tab at 10+
  updated_at timestamptz not null default now()
);
insert into public.mms_tab_config (id) values (true) on conflict (id) do nothing;
-- Service-role only: RLS on with NO policy = default-deny for anon/authenticated (service_role bypasses RLS).
-- Mirrors mms_loss_config; the intentional rls_enabled_no_policy advisor INFO is expected.
alter table public.mms_tab_config enable row level security;
revoke all on public.mms_tab_config from anon, authenticated;

-- ── mms_open_tab: mark a dine-in cart as a trust tab (idempotent; never downgrades a secure tab) ──────────
-- SECURITY DEFINER + grant-locked to service_role (the house pattern for the settle/merge/void RPCs). The
-- only caller is a service-role server action that has already authz'd the opener (staff via getStaffAuth OR
-- the diner via assertCartMember; T3). `for update of c` takes the cart's row write-lock; a concurrent
-- settle's conditional UPDATE contends on that same lock, so they serialize and the loser re-reads the
-- committed state. Session-gated like every money RPC (S2 invariant): the sweeper sets a session
-- status='closed' but leaves its cart `open`, and settle refuses a closed session — so a tab opened on a
-- swept table could never be closed. assertCartMember catches this on the diner path; the STAFF path doesn't,
-- so the gate must live in the SQL.
create or replace function mms_open_tab(p_cart uuid, p_by uuid) returns text
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
  update public.qr_carts
    set tab_type = 'trust', tab_opened_at = now(), tab_opened_by = p_by
    where id = p_cart;
  return 'ok';
end $$;
revoke all on function public.mms_open_tab(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_open_tab(uuid, uuid) to service_role;
