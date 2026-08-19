-- W23a — the 86 (sold-out) path, made writable and auditable.
--
-- `menu_items.is_sold_out` has existed since the platform init migration and is READ by ~15 surfaces
-- (the diner menu greys the card, the kiosk skips it, reorder reports `sold_out`, the floor console
-- flags it, the cart's advisory "+" disable). Nothing has ever WRITTEN it: `menu_items` carries a
-- public-read RLS policy and no write policy at all, and no app code updates the column. So the
-- kitchen has had no way to tell the app it ran out — the flag every diner surface respects could
-- only ever be set by hand in the database.
--
-- This migration adds the two things a real 86 needs beyond the boolean:
--   1. `sold_out_at` — WHEN it was flipped, so the console can print "sold out since 6:40pm". The
--      owner chose a MANUAL lifetime (no auto-clear at service start, no timer): a flag that expires
--      on its own can quietly put a genuinely-empty dish back on sale mid-service, which is the more
--      expensive mistake. The timestamp is what makes a stale flag visible to whoever opens the
--      screen next, and it is the only thing standing in for an expiry.
--   2. `menu_availability_audit` — the same ledger discipline as `menu_price_audit`. An 86 is a
--      revenue decision (nobody can order the dish until someone un-flips it), so "who took it off
--      and when" has to be answerable.
--
-- Deliberately NOT added: any inventory/quantity model. There is no count anywhere in this schema and
-- adding one means somebody counts and decrements portions every service — a standing labor line for
-- a small kitchen. A boolean flipped by the cook who can see the empty pan is the right resolution at
-- this size. The consequence is honest and worth stating: two diners CAN both buy the last portion,
-- and nothing here notices.

alter table public.menu_items
  add column if not exists sold_out_at timestamptz;

comment on column public.menu_items.sold_out_at is
  'W23a — when is_sold_out was last set true (null whenever the item is available). Drives the '
  '"sold out since 6:40pm" stamp; there is no auto-clear, so this is the only signal that a flag has '
  'outlived its shift.';

-- Back-fill discipline: nothing in production has ever been flagged (verified: 0 rows with
-- is_sold_out true), so there is no historical stamp to invent. Any row that IS flagged without a
-- timestamp would be pre-W23a and its true moment is unknown — leave it null rather than stamp it
-- with the migration's own clock, which would read as "sold out since <deploy time>" and be a
-- fabricated fact on a staff screen.

create table if not exists public.menu_availability_audit (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references public.menu_items(id) on delete cascade,
  -- staff.user_id — the RESOLVED row's PK, which can differ from auth.uid() when the row was matched
  -- by the email allowlist (lib/staff.ts StaffCaller.staffId). No FK, matching menu_price_audit: the
  -- ledger must outlive a deleted staff row, because the record of who took a dish off is the point.
  changed_by    uuid not null,
  changed_at    timestamptz not null default now(),
  -- The state written, not a delta: `true` = took it off, `false` = put it back. Stored explicitly so
  -- a reader never has to reconstruct direction from ordering.
  sold_out      boolean not null
);

create index if not exists menu_availability_audit_item_idx
  on public.menu_availability_audit (menu_item_id, changed_at desc);

alter table public.menu_availability_audit enable row level security;

-- Readable by managers and owners, matching menu_price_audit. A server-level staff member can FLIP an
-- 86 (they are the ones on the floor when a dish runs out) but does not need its history; a diner
-- sees nothing.
drop policy if exists menu_availability_audit_read on public.menu_availability_audit;
create policy menu_availability_audit_read on public.menu_availability_audit
  for select to authenticated using (public.is_staff_at_least('manager'));

-- There is deliberately NO insert/update/delete policy, exactly as for menu_price_audit. With RLS on
-- and no permissive policy every non-service-role write is refused; the app appends through the
-- service client in the same action that flips the flag, after its own role gate. Stated so a future
-- reader does not "fix" the omission and open a path to a fictional entry — or to an 86 with no entry.
