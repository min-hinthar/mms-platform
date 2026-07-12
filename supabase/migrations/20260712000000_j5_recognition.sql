-- 20260712000000_j5_recognition.sql — J5: recognition (docs/JOURNEY_PLAN.md), the track's one migration.
--
-- 1) qr_favorites — uid-scoped menu hearts. The diner's uid (anonymous or upgraded — SAME uid across the
--    upgrade) owns its rows outright; every verb rides RLS (no service-role path exists or is needed).
--    menu_item_id is a REAL menu item (uuid FK, cascade on menu removal) — grocery barcodes can never land
--    here (the heart lives on the food item sheet, and the FK enforces it at the DB regardless of client).
--    Row count is naturally bounded per user by the PK + FK: at most one row per (user, catalog item), so
--    no count trigger is needed — the catalog is the cap.
-- 2) qr_orders.arrived_at — the J3-deferred "I'm here" signal, done in this migration window as planned:
--    a member-gated server action stamps it once (idempotent — only from null); the expo board reads it on
--    the EXISTING floor realtime path (a qr_orders UPDATE is already what lights /staff surfaces), so no
--    new channel and no realtime.messages policy is required. Nullable, no default: null = never announced.

create table if not exists qr_favorites (
  user_id uuid not null default auth.uid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, menu_item_id)
);

alter table qr_favorites enable row level security;

-- Own rows only, for exactly the three verbs a diner needs. `(select auth.uid())` (not bare auth.uid())
-- per the initializer-plan convention the sibling policies use.
drop policy if exists qr_fav_select on qr_favorites;
create policy qr_fav_select on qr_favorites for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists qr_fav_insert on qr_favorites;
create policy qr_fav_insert on qr_favorites for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists qr_fav_delete on qr_favorites;
create policy qr_fav_delete on qr_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (new tables inherit nothing useful): diners are the `authenticated` role (anon-auth
-- users included). The unauthenticated `anon` role gets nothing — belt to the RLS braces.
revoke all on qr_favorites from public, anon;
grant select, insert, delete on qr_favorites to authenticated;

-- No UPDATE grant/policy: a favorite is created or removed, never edited.

alter table qr_orders add column if not exists arrived_at timestamptz;
