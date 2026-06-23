-- 20260623040000_s3_discretion.sql — S3.3: server-discretion gating (nudge · ceiling · audit log).
-- docs/S3_DESIGN.md threat model T11–T14. The spine (qr_carts.tab_type, mms_tab_config, mms_open_tab,
-- mms_secure_tab) is already in place; S3.3 adds (1) the durable tab-action audit trail, and (2) the
-- tab-age nudge threshold. The ceiling/nudge SURFACES are read-side (the floor query) — no auto-charge,
-- no auto-convert (T11). Additive + idempotent.

-- ── T13: mms_tab_events — append-only tab-action audit log ───────────────────────────────────────────────
-- The walk-out post-mortem + the discretion-pattern review (the real control is the trail, not the tap).
-- Opener attribution that A3 (S3.1 follow-up) pulled OFF the diner-readable, realtime-fanned qr_carts row
-- returns HERE: service-role-only, owner-read. NON-PII — we store the staff uid (an employee, the point of
-- the audit) but NEVER the anonymous diner's uid; a diner action is actor_kind='diner' with a null staff id.
-- Same shape/RLS as mms_approvals. NOT on the realtime publication (owner-read; realtime would only reach
-- staff sessions and there's no live consumer).
create table if not exists public.mms_tab_events (
  id             uuid primary key default gen_random_uuid(),
  cart_id        uuid not null,
  session_id     uuid,
  event          text not null check (event in ('opened','secured','closed')),
  actor_kind     text not null check (actor_kind in ('staff','diner')),
  actor_staff_id uuid,                          -- staff.user_id when actor_kind='staff'; null for a diner (non-PII)
  tab_type       text not null check (tab_type in ('none','trust','secure')),
  amount_cents   integer check (amount_cents is null or amount_cents >= 0),  -- the settled total, on 'closed' only
  created_at     timestamptz not null default now()
);
create index if not exists mms_tab_events_session_idx on public.mms_tab_events(session_id, created_at);
create index if not exists mms_tab_events_cart_idx on public.mms_tab_events(cart_id, created_at);
-- Service-role write; owner-read (forward-looking audit surface). RLS on; revoke anon/authenticated; the
-- owner-read policy mirrors mms_approvals (scoped `to authenticated` for advisor-0012 hygiene).
alter table public.mms_tab_events enable row level security;
revoke all on public.mms_tab_events from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_tab_events'
                 and policyname='mms_tab_events_owner_read') then
    create policy mms_tab_events_owner_read on public.mms_tab_events for select to authenticated
      using (public.is_staff_at_least('owner'));
  end if;
end $$;

-- ── T12: the tab-age nudge threshold (party-size nudge already exists from S3.1) ─────────────────────────
alter table public.mms_tab_config
  add column if not exists nudge_tab_age_min integer not null default 90 check (nudge_tab_age_min > 0);

-- ── mms_open_tab: distinguish a FRESH open (none→trust) from a benign no-op (already a tab) so the app
-- logs exactly one 'opened' audit event per real open, race-free (the transition is decided under the
-- cart's row lock). Returns 'opened' on the transition, 'exists' when it was already a tab; both are
-- success to the caller. CREATE OR REPLACE, signature unchanged. ─────────────────────────────────────────
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
  if v_tab <> 'none' then return 'exists'; end if;              -- already a tab (trust/secure) → benign no-op
  update public.qr_carts set tab_type = 'trust', tab_opened_at = now() where id = p_cart;
  return 'opened';
end $$;
revoke all on function public.mms_open_tab(uuid) from public, anon, authenticated;
grant execute on function public.mms_open_tab(uuid) to service_role;
