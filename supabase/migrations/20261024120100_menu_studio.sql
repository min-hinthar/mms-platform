-- Menu studio (owner, 2026-10-24: "elevate full features (iOS photo upload, add new menu items
-- categories etc, updates to names prices categories etc,) to menu-editor").
--
-- The staff menu screen grows from a price list into the menu's editor: a manager adds a dish, edits
-- its names, descriptions, category, tax category and whether it is on the menu, takes or chooses a
-- photo on an iPhone, and adds, renames, reorders and hides categories. The writes are Server Actions
-- (`apps/qr/lib/menu-studio.ts`, manager-and-up, service role). This file adds the three things they
-- need that the schema does not have:
--
--   1. The `menu-photos` STORAGE BUCKET on this project — public READ (the diner menu renders the
--      photo through next/image, whose allowlist already names this host), no write policy at all:
--      only the service role writes, behind the manager gate. 5 MB per object and image types only,
--      enforced by the bucket itself (the client resizes to ~1600px JPEG well under it). Guarded on
--      `storage.buckets` existing, so a bare Postgres (the throwaway SQL-test cluster) applies it too.
--   2. `menu_edit_audit` — who changed which field of which dish or category, from what to what. The
--      price keeps its own ledger (`menu_price_audit`, W17b); this is everything else. RLS on, read
--      by manager-and-up (the price ledger's rule), written by the service role only.
--   3. Length bounds on the text a manager now types (Zod `.max()` + a column CHECK — the repo's
--      rule): names ≤ 80, descriptions ≤ 400, a category name ≤ 60 — each added only when every
--      existing row passes (§3 says why), so the apply never refuses a legacy row's next write.
--
-- Until this file applies, the editor's text edits work (they write existing columns) and say so if
-- the audit cannot be written; a photo upload answers "photo storage isn't set up yet". Idempotent.
--
-- Verify after apply: `select id, public, file_size_limit from storage.buckets where id =
-- 'menu-photos'`; `menu_edit_audit` exists with RLS on and has_table_privilege('anon', …, 'select')
-- false; the three constraints are in pg_constraint (or a NOTICE named the one skipped).

-- ── 1. the photo bucket ────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('menu-photos', 'menu-photos', true, 5242880,
              array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do update
        set public = excluded.public,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ── 2. the edit ledger ─────────────────────────────────────────────────────────────────────────
create table if not exists public.menu_edit_audit (
  id           uuid primary key default gen_random_uuid(),
  -- One of the two is set: the dish edited, or the category. Kept through a delete (set null), the
  -- way the price ledger keeps its record.
  menu_item_id uuid references public.menu_items(id) on delete set null,
  category_id  uuid references public.menu_categories(id) on delete set null,
  -- staff.user_id, the resolved row (see menu_price_audit) — no FK, so the ledger outlives the row.
  changed_by   uuid not null,
  changed_at   timestamptz not null default now(),
  field        text not null check (char_length(field) between 1 and 40),
  old_value    text check (old_value is null or char_length(old_value) <= 2000),
  new_value    text check (new_value is null or char_length(new_value) <= 2000),
  check (menu_item_id is not null or category_id is not null)
);

create index if not exists menu_edit_audit_item_idx
  on public.menu_edit_audit (menu_item_id, changed_at desc);
create index if not exists menu_edit_audit_category_idx
  on public.menu_edit_audit (category_id, changed_at desc);

alter table public.menu_edit_audit enable row level security;

drop policy if exists menu_edit_audit_read on public.menu_edit_audit;
create policy menu_edit_audit_read on public.menu_edit_audit
  for select to authenticated using (public.is_staff_at_least('manager'));

revoke all on table public.menu_edit_audit from anon, authenticated;
grant select on table public.menu_edit_audit to authenticated;
grant all on table public.menu_edit_audit to service_role;

-- ── 3. the bounds on typed text ────────────────────────────────────────────────────────────────
-- ⚠️ Added ONLY when every existing row already passes, and then VALID. A NOT VALID check is still
-- enforced on every later UPDATE of a row, so one legacy dish with a long description would refuse
-- its next price change or 86 — the over-blocking direction on the busiest write in the building.
-- A bound some row breaks is skipped with a NOTICE (the Zod bound still holds every new write), to be
-- added once that row is trimmed.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_names_bounded') then
    if exists (select 1 from public.menu_items
               where char_length(name_en) not between 1 and 80 or char_length(name_my) > 80) then
      raise notice 'menu_items_names_bounded skipped — a row is outside it';
    else
      alter table public.menu_items add constraint menu_items_names_bounded
        check (char_length(name_en) between 1 and 80
               and (name_my is null or char_length(name_my) <= 80));
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_items_descriptions_bounded') then
    if exists (select 1 from public.menu_items
               where char_length(description_en) > 400 or char_length(description_my) > 400) then
      raise notice 'menu_items_descriptions_bounded skipped — a row is outside it';
    else
      alter table public.menu_items add constraint menu_items_descriptions_bounded
        check ((description_en is null or char_length(description_en) <= 400)
               and (description_my is null or char_length(description_my) <= 400));
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_categories_name_bounded') then
    if exists (select 1 from public.menu_categories where char_length(name) not between 1 and 60) then
      raise notice 'menu_categories_name_bounded skipped — a row is outside it';
    else
      alter table public.menu_categories add constraint menu_categories_name_bounded
        check (char_length(name) between 1 and 60);
    end if;
  end if;
end $$;
