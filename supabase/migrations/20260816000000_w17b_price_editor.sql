-- W17b — the staff price editor's database half (owner: "staff portal should be able to update
-- prices?"). Two things: a bound on the price column, and a durable ledger of who changed what.
--
-- Deliberately NOT here: a per-mode `togo_price_cents`. W17a established one POS price per dish
-- (66 of the 72 dishes sold both ways ring identically), and a handful that genuinely differ would
-- need the dine-in↔to-go toggle to RE-PRICE again — the machinery W17a just removed. That is a real
-- money-path change and it waits on the owner confirming the four candidate prices, rather than
-- being built on the chance they say yes. See docs/W17_PLAN.md §W17b.

-- ── 1) bound the price column ───────────────────────────────────────────────────────────────────
-- Until now `base_price_cents` was writable only by a migration. Once a manager can set it from the
-- console it needs a bound where the app cannot bypass it: a price arrives from a human typing into
-- a form, and a fat-fingered $1900 is a money incident. The app's Zod schema enforces the same range
-- — this is the belt, not the only strap.
--
-- The 25¢ floor mirrors mms_set_line_fulfillment's existing belt and clears today's catalog floor
-- ($2.00 Rice) with room. If a genuinely sub-25¢ item is ever added, widen this deliberately rather
-- than relaxing it under time pressure.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'menu_items_base_price_cents_bounds'
  ) then
    alter table public.menu_items
      add constraint menu_items_base_price_cents_bounds
      check (base_price_cents >= 25 and base_price_cents <= 500000);
  end if;
end $$;

-- ── 2) the price-change ledger ──────────────────────────────────────────────────────────────────
-- Staff mutations elsewhere are audited to PostHog via after() — best-effort telemetry, the right
-- weight for "who bumped a ticket". A price change is different in kind: it is the number every
-- future guest is charged, and "when did this become $19, and who decided that?" must be answerable
-- from the database months later, not from an analytics retention window. Hence a real table.
-- uuid PK + gen_random_uuid(), matching every other table in this schema. Deliberately NOT a bigint
-- identity: the schema has no identity column anywhere, so its generated-types shape would be the
-- one thing in `database.types.ts` with no precedent to check against — and this repo's committed
-- types must byte-match `supabase gen types --local` or the `types-fresh` CI job fails.
create table if not exists public.menu_price_audit (
  id             uuid primary key default gen_random_uuid(),
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  -- staff.user_id — the RESOLVED row's PK, which can differ from auth.uid() when the row was matched
  -- by the email allowlist (see lib/staff.ts StaffCaller.staffId). No FK: the ledger must outlive a
  -- deleted staff row, since the point is the record of who set the price.
  changed_by     uuid not null,
  changed_at     timestamptz not null default now(),
  old_price_cents integer not null,
  new_price_cents integer not null
);

create index if not exists menu_price_audit_item_idx
  on public.menu_price_audit (menu_item_id, changed_at desc);

alter table public.menu_price_audit enable row level security;

-- Readable by managers and owners — the people who can change a price should be able to see its
-- history. A server-level staff member and every diner see nothing.
drop policy if exists menu_price_audit_read on public.menu_price_audit;
create policy menu_price_audit_read on public.menu_price_audit
  for select to authenticated using (public.is_staff_at_least('manager'));

-- There is deliberately NO insert/update/delete policy. With RLS enabled and no permissive policy,
-- every non-service-role write is refused; the app appends the ledger row through the service client
-- in the same action that writes the price, after its own role gate. Stated explicitly so a future
-- reader does not "fix" the omission and open a path to a fictional entry — or, worse, to a price
-- change with no entry at all.
