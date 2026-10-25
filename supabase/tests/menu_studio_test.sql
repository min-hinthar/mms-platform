-- supabase/tests/menu_studio_test.sql  (Menu studio — owner, 2026-10-24)
--
-- Pins supabase/migrations/20261024120100_menu_studio.sql: the edit ledger (`menu_edit_audit`) is
-- service-written and manager-read with RLS on, refuses a row about nothing and an over-long value,
-- and still takes a legitimate one; the text bounds refuse an over-long name, description and
-- category name while a legitimate edit still passes. The photo bucket is checked only where a
-- `storage` schema exists (the Supabase stack, not a bare Postgres).
--
-- Red-first: plpgsql ASSERT stops at the FIRST failure. Run against any QR DB (rolls back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/menu_studio_test.sql

begin;
set local plpgsql.check_asserts = on;

-- ══ STUDIO.1 · the ledger: RLS on, never readable or writable by anon ══════════════════════════
do $$
declare rls boolean;
begin
  select relrowsecurity into rls from pg_class where oid = 'public.menu_edit_audit'::regclass;
  assert rls, 'STUDIO.1 · RLS is on for menu_edit_audit';
  assert not has_table_privilege('anon', 'public.menu_edit_audit', 'select'),
    'STUDIO.1 · anon cannot read the ledger';
  assert not has_table_privilege('anon', 'public.menu_edit_audit', 'insert'),
    'STUDIO.1 · anon cannot write the ledger';
  assert not has_table_privilege('authenticated', 'public.menu_edit_audit', 'insert'),
    'STUDIO.1 · a signed-in user cannot write the ledger';
  assert has_table_privilege('service_role', 'public.menu_edit_audit', 'insert'),
    'STUDIO.1 · the service role writes it';
end $$;

-- ══ STUDIO.2 · the ledger's row: about SOMETHING, bounded — and a legitimate row lands ═════════
do $$
declare c uuid; ok boolean;
begin
  select id into c from public.menu_categories limit 1;
  if c is null then
    insert into public.menu_categories (slug, name, sort_order) values ('studio-test', 'Studio', 999)
      returning id into c;
  end if;
  insert into public.menu_edit_audit (category_id, changed_by, field, old_value, new_value)
    values (c, gen_random_uuid(), 'name', 'Soups', 'Soup');
  ok := false;
  begin
    insert into public.menu_edit_audit (changed_by, field) values (gen_random_uuid(), 'name');
  exception when check_violation then ok := true;
  end;
  assert ok, 'STUDIO.2 · a row about no dish and no category is refused';
  ok := false;
  begin
    insert into public.menu_edit_audit (category_id, changed_by, field, new_value)
      values (c, gen_random_uuid(), 'name', repeat('x', 2001));
  exception when check_violation then ok := true;
  end;
  assert ok, 'STUDIO.2 · an over-long value is refused';
end $$;

-- ══ STUDIO.3 · the text bounds: over-long refused, a legitimate edit passes ═════════════════════
do $$
declare d uuid; c uuid; ok boolean;
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_names_bounded') then
    raise notice 'STUDIO.3 skipped — a seeded row was outside the bound (the migration skipped it)';
    return;
  end if;
  select id into c from public.menu_categories limit 1;
  insert into public.menu_items (category_id, slug, name_en, base_price_cents)
    values (c, 'studio-bounds-test', 'Bounds', 1200) returning id into d;
  update public.menu_items set name_en = 'Bounds renamed', description_en = 'A fine soup' where id = d;
  ok := false;
  begin
    update public.menu_items set name_en = repeat('n', 81) where id = d;
  exception when check_violation then ok := true;
  end;
  assert ok, 'STUDIO.3 · a name over 80 is refused';
  ok := false;
  begin
    update public.menu_items set description_my = repeat('d', 401) where id = d;
  exception when check_violation then ok := true;
  end;
  assert ok, 'STUDIO.3 · a description over 400 is refused';
  ok := false;
  begin
    update public.menu_categories set name = repeat('c', 61) where id = c;
  exception when check_violation then ok := true;
  end;
  assert ok, 'STUDIO.3 · a category name over 60 is refused';
end $$;

-- ══ STUDIO.4 · the bucket, where storage exists: public read, 5 MB, images only ════════════════
do $$
declare b record;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'STUDIO.4 skipped — no storage schema here';
    return;
  end if;
  select public, file_size_limit, allowed_mime_types into b from storage.buckets where id = 'menu-photos';
  assert b.public, 'STUDIO.4 · the bucket is public-read';
  assert b.file_size_limit = 5242880, 'STUDIO.4 · 5 MB per object';
  assert b.allowed_mime_types @> array['image/jpeg'] and not (b.allowed_mime_types @> array['text/html']),
    'STUDIO.4 · images only';
end $$;

rollback;
