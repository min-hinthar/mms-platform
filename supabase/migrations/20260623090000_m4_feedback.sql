-- 20260623090000_m4_feedback.sql — M4 P4.3: feedback + UNGATED review triage. docs/M4_DESIGN.md (R9/R10).
-- The canonical ungated pattern: ask everyone, offer the public link to ALL raters, surface LOW ratings to
-- staff for recovery — never gate the link or suppress a review by sentiment (Google-policy + FTC). Triage
-- is internal routing only. One feedback per order, by the order's EARNER. Additive + idempotent.

create table if not exists public.mms_feedback (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.qr_orders(id) on delete cascade,  -- one per order
  user_id    uuid not null references auth.users(id) on delete cascade,               -- the earner
  rating     integer not null check (rating between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
-- Triage: recent LOW ratings (≤3) for staff recovery — a partial index keeps that scan cheap.
create index if not exists mms_feedback_low_idx on public.mms_feedback(created_at desc) where rating <= 3;
-- Owner/manager-read RLS (the triage surface; parity with mms_approvals). The diner writes via the
-- service-role action and never reads another's feedback. Off the realtime publication.
alter table public.mms_feedback enable row level security;
revoke all on public.mms_feedback from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mms_feedback'
                 and policyname='mms_feedback_staff_read') then
    create policy mms_feedback_staff_read on public.mms_feedback for select to authenticated
      using (public.is_staff_at_least('manager'));
  end if;
end $$;

-- Owner-tunable public-review URL (singleton; parity with the other config tables). NULL → the public
-- link isn't shown anywhere (graceful) — never a broken/missing link.
create table if not exists public.mms_feedback_config (
  id                boolean primary key default true check (id),
  google_review_url text check (google_review_url is null or char_length(google_review_url) <= 500),
  updated_at        timestamptz not null default now()
);
insert into public.mms_feedback_config (id) values (true) on conflict (id) do nothing;
alter table public.mms_feedback_config enable row level security;
revoke all on public.mms_feedback_config from anon, authenticated;

-- ── mms_submit_feedback: record one feedback for the caller's OWN paid order (earner-gated). Ungated —
-- it stores any 1..5 rating; the public-link offer is a UI concern shown to all. Idempotent (one per order).
create or replace function mms_submit_feedback(p_order uuid, p_user uuid, p_rating integer, p_comment text)
  returns text language plpgsql security definer set search_path = '' as $$
declare v_earned uuid; v_status text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then return 'bad_rating'; end if;
  select earned_by, status into v_earned, v_status from public.qr_orders where id = p_order;
  if v_earned is null then return 'not_found'; end if;       -- unknown order, or a cash/staff order (no earner)
  if v_earned <> p_user then return 'not_yours'; end if;     -- only the earner reviews their order
  if v_status <> 'paid' then return 'not_paid'; end if;
  insert into public.mms_feedback (order_id, user_id, rating, comment)
    values (p_order, p_user, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
    on conflict (order_id) do nothing;                       -- one per order; a re-submit is a benign no-op
  if not found then return 'exists'; end if;
  return 'ok';
end $$;
revoke all on function public.mms_submit_feedback(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.mms_submit_feedback(uuid, uuid, integer, text) to service_role;
