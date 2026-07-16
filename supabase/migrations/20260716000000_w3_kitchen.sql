-- 20260716000000_w3_kitchen.sql — W3: the kitchen you can trust (KDS · expo · order-ready board).
--
-- The data layer for the whole W3 track (docs/PRODUCTION_PLAN.md §W3, docs/context/SPEC-KDS.md).
-- One principle drives the shape: the BUMP EVENT is the single source of truth — it feeds the diner's
-- /track, the order-ready board, expo state, and (via fire_at/started_at/bumped_at) every kitchen metric.
--
--   1) K4 (ops BLOCKER): paid pickup/scango food never reached the KDS — every fire path was gated
--      s.mode='dinein'. mms_fire_pending_food now fires ALL modes at settlement; pickup lines fire at
--      the cart's stored fire_at (= slot − prep, stamped by mms_set_pickup_slot since M2), so a
--      scheduled order enters the board as a dimmed HELD card and turns live at fire time — no cron,
--      the unified per-line fire timer was built for exactly this seam (20260622040000).
--   2) Latent unbumpable-line fix: mms_line_transition guarded c.status='open', but a line fired AT
--      checkout lives on a PAID cart — the cook's bump 0-rowed forever. Kitchen edges (in_progress/
--      served) now accept paid carts; draft/undo/void edges stay open-cart-only.
--   3) K5: a bounded notes channel to the kitchen (qr_cart_items.notes + the qr_order_items snapshot) —
--      "no peanuts" finally has somewhere to live. Zod .max mirrors the column CHECK (house pattern).
--   4) K7: ticket-level bump + recall — mms_bump_ticket serves the lines the cook actually SAW (the
--      client passes the displayed line ids, so a line that fired mid-tap is never silently served);
--      mms_recall_ticket restores a mis-bump within 2 minutes (guard in the SQL, not the client).
--   5) W3e: qr_carts.customer_name → qr_orders.customer_name (the pickup/scango call-out identity for
--      expo + the order-ready board) + togo_ready_at/togo_picked_up_at stamps on the expo bump (the
--      board's gold-flash + auto-clear need real transition times, not created_at).
--   6) Aging thresholds live in mms_kds_config (the mms_tab_config singleton pattern), and
--      mms_kds_stats() derives today's avg ticket time from the stamps — the same thresholds drive the
--      urgency colors, so the metric and the UI can never disagree (SPEC-KDS §7).
--
-- SAFETY: additive columns only; the three fulfill RPCs are restated in full with ONLY the
-- customer_name/notes copy added (no signature change, no money-math change, idempotency preserved).
-- All new/replaced fns re-assert the revoke/grant lockdown. Idempotent throughout.

-- ── 1) Line lifecycle stamps + the notes channel ────────────────────────────────────────────────────
alter table public.qr_cart_items
  add column if not exists notes text check (notes is null or char_length(notes) <= 160),
  add column if not exists started_at timestamptz,
  add column if not exists bumped_at  timestamptz;

-- The order snapshot carries the note too — the bagging counter needs "no peanuts" as much as the wok.
alter table public.qr_order_items
  add column if not exists notes text check (notes is null or char_length(notes) <= 160);

-- ── 2) Pickup/scango call-out identity + expo transition stamps ─────────────────────────────────────
alter table public.qr_carts
  add column if not exists customer_name text
    check (customer_name is null or char_length(customer_name) <= 40);
alter table public.qr_orders
  add column if not exists customer_name text
    check (customer_name is null or char_length(customer_name) <= 40),
  add column if not exists togo_ready_at     timestamptz,
  add column if not exists togo_picked_up_at timestamptz;

-- The order-ready board polls live takeaway orders; keep that read off a seq scan as history grows.
create index if not exists qr_orders_togo_live_idx
  on public.qr_orders (created_at) where togo_status in ('preparing', 'ready');

-- ── 3) KDS aging thresholds (config, not constants — SPEC-KDS §1) ───────────────────────────────────
-- The mms_tab_config singleton pattern: RLS default-deny, service-role reads. Two thresholds per
-- channel (Square's simplicity): green < amber ≤ red, minutes since fire. Pickup ages FROM fire time
-- (slot − prep), never order time, so a noon-paid 6pm order can't age red all afternoon (O-G).
create table if not exists public.mms_kds_config (
  id boolean primary key default true check (id),
  dinein_amber_min integer not null default 8  check (dinein_amber_min > 0),
  dinein_red_min   integer not null default 12 check (dinein_red_min > 0),
  pickup_amber_min integer not null default 8  check (pickup_amber_min > 0),
  pickup_red_min   integer not null default 12 check (pickup_red_min > 0),
  rechime_sec      integer not null default 75 check (rechime_sec between 30 and 600),
  updated_at timestamptz not null default now()
);
insert into public.mms_kds_config (id) values (true) on conflict (id) do nothing;
alter table public.mms_kds_config enable row level security;
revoke all on public.mms_kds_config from anon, authenticated;

-- ── 4) mms_line_transition — stamp the lifecycle + let the kitchen bump PAID carts ──────────────────
-- Restated from 20260622030000. Three changes:
--   a) started_at/bumped_at stamps (started_at survives a direct fired→served bump via coalesce-now).
--   b) cart guard: kitchen edges (in_progress/served) accept c.status='paid' — a to-go/pickup line
--      fired at checkout lives on a paid cart and MUST stay bumpable, or it haunts the board until the
--      table is cleared. draft/fired/voided targets keep the strict open-cart guard (undo and void are
--      pre-settlement acts; voids on paid carts go through the refund path, never this fn).
--   c) kitchen edges also require fire_at ≤ now() — a line the board hasn't shown (HELD, or inside the
--      dine-in undo grace) can't be started/served through the per-line bump (mms_bump_ticket already
--      guards this; the graph itself should agree).
create or replace function public.mms_line_transition(p_line uuid, p_to text) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_to not in ('draft','fired','in_progress','served','voided') then
    raise exception 'illegal target line state %', p_to;
  end if;
  update public.qr_cart_items ci
    set state = p_to,
        started_at = case when p_to in ('in_progress','served') then coalesce(ci.started_at, now())
                          else ci.started_at end,
        bumped_at  = case when p_to = 'served' then now() else ci.bumped_at end
    from public.qr_carts c
    where ci.id = p_line and c.id = ci.cart_id
      and (c.status = 'open' or (c.status = 'paid' and p_to in ('in_progress','served')))
      and (p_to not in ('in_progress','served')
           or (ci.fire_at is not null and ci.fire_at <= now()))
      and (
        (p_to = 'fired'       and ci.state = 'draft') or
        (p_to = 'in_progress' and ci.state = 'fired') or
        (p_to = 'served'      and ci.state in ('fired','in_progress')) or
        (p_to = 'draft'       and ci.state = 'fired') or
        (p_to = 'voided'      and ci.state in ('draft','fired','in_progress','served'))
      );
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_line_transition(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_line_transition(uuid, text) to service_role;

-- ── 5) mms_fire_pending_food — every channel reaches the kitchen (K4, the W3a blocker) ──────────────
-- Restated from 20260623220000. The mode gate is GONE: at settlement, still-draft food fires for ALL
-- modes. Dine-in keeps fire_at = now() (paid ⇒ immediately due, no undo). Pickup/scango fire at the
-- cart's stored fire_at (= slot − prep, mms_set_pickup_slot) — a future fire_at renders as a HELD card
-- on the KDS and turns live when the clock passes it; greatest(…, now()) keeps a late-paid order from
-- back-dating into instant-red. A scango cart has no slot ⇒ coalesce ⇒ fires now. Grocery lines still
-- NEVER fire (bagged, not cooked). Called by the same three settlement after() drains + the pg_cron
-- reconciler — no call-site change needed; the gate always lived in this WHERE.
create or replace function public.mms_fire_pending_food(p_cart_id uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid();
begin
  update public.qr_cart_items ci
    set state = 'fired',
        fire_at = case when s.mode = 'dinein' then now()
                       else greatest(coalesce(c.fire_at, now()), now()) end,
        fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'paid'                       -- fire BECAUSE settled (no-charge-no-fire)
      and ci.state = 'draft'
      and ci.fulfillment in ('dinein','togo');     -- all food; grocery is bagged, never cooked. A comped
                                                    -- line stays included — comped = $0 but still MADE.
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_pending_food(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_pending_food(uuid) to service_role;

-- ── 6) mms_reconcile_settled_fulfillment — the backstop learns the widened fire too ─────────────────
-- Restated from 20260624030000 with ONE change: the draft-food pre-filter drops its s.mode='dinein'
-- gate, so a pickup/scango straggler (after() cold-stop) is re-fired within the cron interval exactly
-- like a dine-in one. Body otherwise identical.
create or replace function public.mms_reconcile_settled_fulfillment() returns integer
  language plpgsql security definer set search_path = '' as $$
declare r record; n integer; total integer := 0;
begin
  for r in
    select o.id as order_id, o.cart_id
      from public.qr_orders o
      where o.status = 'paid' and o.cart_id is not null
        and o.created_at > now() - interval '24 hours'
        and (
          -- a paid cart (ANY mode, W3) with still-DRAFT food — never fired, uncooked
          exists (
            select 1 from public.qr_cart_items ci
              join public.qr_carts c on c.id = ci.cart_id
              where c.id = o.cart_id and c.status = 'paid'
                and ci.state = 'draft' and ci.fulfillment in ('dinein','togo'))
          -- a takeaway order whose ready-signal was never initialized
          or (o.togo_status is null and exists (
                select 1 from public.qr_order_items oi
                  where oi.order_id = o.id and oi.fulfillment in ('togo','grocery')))
          -- a grocery line whose EBT eligibility-at-sale was never snapshotted
          or exists (
            select 1 from public.qr_order_items oi
              join public.grocery_items g on g.barcode = oi.menu_item_id
              where oi.order_id = o.id and oi.fulfillment = 'grocery'
                and g.ebt_eligible = true and oi.ebt_eligible = false)
        )
  loop
    select public.mms_fire_pending_food(r.cart_id) into n;   -- idempotent: fires 0 if no draft food remains
    total := total + coalesce(n, 0);
    perform public.mms_init_togo_status(r.order_id, r.cart_id);
    perform public.mms_snapshot_ebt_eligibility(r.order_id);
  end loop;
  return total;
end $$;
revoke all on function public.mms_reconcile_settled_fulfillment() from public, anon, authenticated;
grant execute on function public.mms_reconcile_settled_fulfillment() to service_role;

-- ── 7) mms_bump_ticket / mms_recall_ticket — the ticket-level bump + the 2-minute recall (K7) ───────
-- Bump serves exactly the lines the cook SAW (the client passes the ticket's displayed line ids +
-- their cart): a line that fired between snapshot and tap stays un-served and re-renders as its own
-- fresh ticket — fat-finger-safe by construction. fire_at <= now() keeps a HELD/in-grace line (which
-- the kitchen has not seen) out of a bump. One atomic UPDATE; guards in the statement.
create or replace function public.mms_bump_ticket(p_cart uuid, p_lines uuid[]) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'served',
        started_at = coalesce(ci.started_at, now()),
        bumped_at = now()
    from public.qr_carts c
    where ci.id = any(p_lines)
      and ci.cart_id = p_cart
      and c.id = ci.cart_id
      and c.status in ('open','paid')
      and ci.state in ('fired','in_progress')
      and ci.fire_at is not null and ci.fire_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_bump_ticket(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mms_bump_ticket(uuid, uuid[]) to service_role;

-- Recall un-serves a just-bumped ticket (mis-tap insurance, SPEC-KDS §4). The 2-minute window is
-- enforced HERE, not in the client; only served lines with a live bumped_at stamp move, back to
-- in_progress (the cook had it on the wok — "started" is the honest restore state). Never touches
-- voided lines; a cancelled cart (cleared table) refuses.
create or replace function public.mms_recall_ticket(p_cart uuid, p_lines uuid[]) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'in_progress',
        bumped_at = null
    from public.qr_carts c
    where ci.id = any(p_lines)
      and ci.cart_id = p_cart
      and c.id = ci.cart_id
      and c.status in ('open','paid')
      and ci.state = 'served'
      and ci.bumped_at is not null
      and ci.bumped_at > now() - interval '2 minutes';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_recall_ticket(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mms_recall_ticket(uuid, uuid[]) to service_role;

-- Fire a HELD (scheduled, future-fire_at) ticket early — the manual "fire now" on a held card
-- (SPEC-KDS §2, "manual fire-early allowed"). Guarded to PAID carts so this can never eat a dine-in
-- send's 10s undo grace (those lines sit on OPEN carts; their grace belongs to the diner, not the KDS).
create or replace function public.mms_fire_ticket_now(p_cart uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set fire_at = now()
    from public.qr_carts c
    where ci.cart_id = p_cart
      and c.id = ci.cart_id
      and c.status = 'paid'
      and ci.state = 'fired'
      and ci.fire_at > now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_ticket_now(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_ticket_now(uuid) to service_role;

-- ── 8) mms_set_togo_status — stamp the transitions the board + metrics need ─────────────────────────
-- Restated from 20260624000000. Same legal edges (preparing→ready→picked_up, 'stale' on a race); adds
-- togo_ready_at / togo_picked_up_at stamps. The order-ready board's gold flash keys on the READY
-- transition and its auto-clear on picked_up + 10 min — both need the real time, not created_at.
create or replace function public.mms_set_togo_status(p_order uuid, p_to text) returns text
  language plpgsql security definer set search_path = '' as $$
begin
  if p_to not in ('ready','picked_up') then return 'bad_status'; end if;
  update public.qr_orders o
    set togo_status = p_to,
        togo_ready_at     = case when p_to = 'ready'     then now() else o.togo_ready_at end,
        togo_picked_up_at = case when p_to = 'picked_up' then now() else o.togo_picked_up_at end
    where o.id = p_order
      and (
        (p_to = 'ready'     and o.togo_status = 'preparing') or
        (p_to = 'picked_up' and o.togo_status = 'ready')
      );
  if not found then return 'stale'; end if;
  return 'ok';
end $$;
revoke all on function public.mms_set_togo_status(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_set_togo_status(uuid, text) to service_role;

-- ── 9) mms_cart_item_insert_if_open — carry the note ────────────────────────────────────────────────
-- Signature change (new trailing p_notes with a default) ⇒ drop + recreate (a defaulted param is a NEW
-- overload; the old signature must go or RPC resolution is ambiguous). Existing callers (grocery adds)
-- omit p_notes and hit the default — no call-site change required. Both signatures dropped so a
-- re-apply stays idempotent.
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text);
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text);
create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text,
  p_notes text default null
) returns uuid
  language sql set search_path = '' as $$
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat, fulfillment, notes)
  select p_cart_id, p_menu_item_id, p_name, 1, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat,
         p_fulfillment, p_notes
  from public.qr_carts
  where id = p_cart_id and status = 'open'
  returning id;
$$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text)
  to service_role;

-- ── 10) Fulfill RPCs restated — copy customer_name (cart→order) + notes (line→snapshot) ─────────────
-- CARD path (restated from 20260713000000; only add: v_name lookup + insert column, notes in line copy).
create or replace function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz; v_table integer; v_name text;
begin
  select id into v_order from public.qr_orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then return v_order; end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;
  if v_total <> p_amount_cents then
    raise exception 'fulfillment amount mismatch: breakdown=% intent=%', v_total, p_amount_cents;
  end if;

  select c.promo_code, c.pickup_slot, c.fire_at, c.customer_name into v_promo, v_slot, v_fire, v_name
    from public.qr_carts c where c.id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    raise exception 'cart % is not open (already settled by another tender) — refund PI %',
      p_cart_id, p_payment_intent;
  end if;

  -- K2: snapshot the session's registered table number onto the order (null for pickup/scango or an
  -- unregistered sticker) so /track + the receipt show it after the session read has expired.
  select table_number into v_table from public.table_sessions where id = v_session;

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status,
                         pickup_slot, fire_at, cart_id, table_number, customer_name)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id,
            v_table, v_name)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer)
  to service_role;

-- CASH path (restated from 20260713000000; only add: v_name lookup + insert column, notes in line copy).
create or replace function public.mms_fulfill_cash_order(
  p_cart_id uuid, p_settled_by uuid, p_subtotal_cents integer, p_discount_cents integer,
  p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total integer; v_derived_subtotal integer; v_session uuid; v_status text; v_promo text; v_table integer; v_name text;
begin
  select id into v_order from public.qr_orders where cart_id = p_cart_id and tender = 'cash';
  if v_order is not null then return v_order; end if;

  select coalesce(sum(unit_price_cents * qty), 0) into v_derived_subtotal
    from public.qr_cart_items where cart_id = p_cart_id and state <> 'voided' and not comped;
  if v_derived_subtotal <> p_subtotal_cents then
    raise exception 'cash settle subtotal mismatch: derived=% passed=%', v_derived_subtotal, p_subtotal_cents;
  end if;

  v_total := p_subtotal_cents - p_discount_cents + p_service_charge_cents + p_tax_cents + p_tip_cents;

  select promo_code, customer_name into v_promo, v_name from public.qr_carts where id = p_cart_id;
  update public.qr_carts set status = 'paid'
    where id = p_cart_id and status = 'open'
    returning session_id into v_session;
  if v_session is null then
    select status into v_status from public.qr_carts where id = p_cart_id;
    raise exception 'cart % is not open for cash settlement (status=%)', p_cart_id, coalesce(v_status, 'missing');
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, status, tender, cart_id, settled_by, table_number, customer_name)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, 'paid', 'cash', p_cart_id, p_settled_by, v_table, v_name)
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_cash_order(uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;

-- SPLIT path (restated from 20260713000000; only add: v_name lookup + insert column, notes in line copy).
create or replace function public.mms_fulfill_split_order(p_cart_id uuid, p_expected_total_cents integer)
  returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_session uuid; v_sum integer; v_open integer; v_table integer; v_name text;
begin
  select session_id, customer_name into v_session, v_name from public.qr_carts where id = p_cart_id;

  select count(*) into v_open from public.qr_cart_shares
    where cart_id = p_cart_id and status <> 'captured';
  if v_open > 0 then
    raise exception 'split fulfillment blocked: % share(s) not captured', v_open;
  end if;

  select coalesce(sum(amount_cents), 0) into v_sum from public.qr_cart_shares
    where cart_id = p_cart_id and status = 'captured';
  if v_sum <> p_expected_total_cents then
    raise exception 'split fulfillment mismatch: captured=% expected=%', v_sum, p_expected_total_cents;
  end if;

  update public.qr_carts set status = 'paid' where id = p_cart_id and status = 'open';
  if not found then
    select order_id into v_order from public.qr_cart_shares
      where cart_id = p_cart_id and order_id is not null limit 1;
    if v_order is null then
      raise exception 'split fulfillment: cart % not open and no order stamped (status conflict)', p_cart_id;
    end if;
    return v_order;
  end if;

  select table_number into v_table from public.table_sessions where id = v_session; -- K2 snapshot

  insert into public.qr_orders (session_id, subtotal_cents, discount_cents, service_charge_cents,
                         tax_cents, tip_cents, total_cents, stripe_payment_intent_id, status, cart_id, table_number, customer_name)
    select v_session, sum(subtotal_cents), sum(discount_cents), sum(service_charge_cents),
           sum(tax_cents), sum(tip_cents), sum(amount_cents), null, 'paid', p_cart_id, v_table, v_name
    from public.qr_cart_shares where cart_id = p_cart_id and status = 'captured'
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  update public.qr_cart_shares set order_id = v_order, updated_at = now()
    where cart_id = p_cart_id and status = 'captured';
  return v_order;
end; $$;
revoke all on function public.mms_fulfill_split_order(uuid, integer) from public, anon, authenticated;
grant execute on function public.mms_fulfill_split_order(uuid, integer) to service_role;

-- ── 11) mms_merge_table_orders — a kitchen note never folds away ────────────────────────────────────
-- Restated from 20260702000000 with ONE change: the fold key learns `notes`. A NOTED line never folds
-- (in either direction) — folding "no peanuts" units into a plain sibling would silently erase an
-- allergy instruction; a noted source re-parents as its own line instead (no units drop). Body
-- otherwise identical (all the restored S2.3/S6/R5c guards preserved).
create or replace function public.mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
  returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  -- Row-lock both carts, ordered by id to avoid a deadlock with a concurrent reverse-direction merge.
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;

  -- S2-audit: both carts open AND both tables still active (a closed session can't accept a fold).
  if (select count(*) from public.qr_carts c
        where c.id in (p_source_cart, p_target_cart) and c.status = 'open'
          and exists (select 1 from public.table_sessions s
                        where s.id = c.session_id and s.status <> 'closed')) <> 2 then
    raise exception 'both carts must be open and their tables active to merge (source=% target=%)',
      p_source_cart, p_target_cart;
  end if;

  -- S3.2: never merge a secured tab (the card-on-file sidecar can't follow a cancelled source cart).
  if exists (select 1 from public.qr_carts
               where id in (p_source_cart, p_target_cart) and tab_type = 'secure') then
    raise exception 'cannot merge a secured tab (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  -- S5: supersede the source cart's pending approvals FIRST, so this fn and mms_resolve_approval both lock
  -- mms_approvals before qr_cart_items (same order → no deadlock). A moved line's request can't honestly
  -- resolve here; 'superseded' (not 'denied') keeps the audit truthful (re-request on the merged table).
  update public.mms_approvals
    set status = 'superseded', resolved_at = now()
    where cart_id = p_source_cart and status = 'pending';

  for r in
    select id, menu_item_id, qty, state, notes,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items
    where cart_id = p_source_cart
      and state <> 'voided' and not comped         -- S2.3: never move a $0'd line's qty into the target
  loop
    -- Fold ONLY into a chargeable, same-state, UNASSIGNED, NOTE-LESS target line: same kitchen state
    -- (S6), not voided/comped (S2.3), by_seat null (R5c), and neither side carries a kitchen note (W3b —
    -- a note is per-line identity; folding would apply/erase it on units it doesn't belong to).
    -- No match → re-parent as its own null line (assignable later).
    v_match := null;
    if r.notes is null then
      select t.id, t.qty into v_match, v_match_qty
      from public.qr_cart_items t
      where t.cart_id = p_target_cart
        and t.by_seat is null
        and t.notes is null
        and t.state = r.state
        and t.state <> 'voided' and not t.comped
        and t.menu_item_id = r.menu_item_id
        and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                     '[]'::jsonb) = r.modkey
      limit 1;
    end if;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  -- S3.1 [A1]: carry a trust tab forward (inherit up, earliest open time; a secure target is refused above).
  update public.qr_carts tgt
    set tab_type = case when tgt.tab_type = 'secure' then 'secure' else 'trust' end,
        tab_opened_at = least(coalesce(tgt.tab_opened_at, src.tab_opened_at), src.tab_opened_at)
    from public.qr_carts src
    where tgt.id = p_target_cart and src.id = p_source_cart and src.tab_type <> 'none';

  -- Bump the target so floor/realtime peers re-sync; cancel the now-empty source cart + close its session.
  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;
revoke all on function public.mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_merge_table_orders(uuid, uuid) to service_role;

-- ── 12) mms_kds_stats — today's avg ticket time, from the stamps (SPEC-KDS §7) ──────────────────────
-- "Today" = since local midnight in the restaurant tz (pickup_config, the one tz the house already
-- keeps). Cook time = bumped_at − fire_at (fire_at is when the kitchen first SAW the line — for a held
-- pickup that's slot − prep, so a 6pm order prepped in 9 minutes reads 9 minutes, not 6 hours).
-- Negative deltas (recall→re-bump edge) clamp at 0. STABLE, service-role only.
create or replace function public.mms_kds_stats() returns table(avg_secs integer, served_count integer)
  language sql stable security definer set search_path = '' as $$
  select coalesce(avg(greatest(extract(epoch from (ci.bumped_at - ci.fire_at)), 0)), 0)::integer,
         count(*)::integer
  from public.qr_cart_items ci
  where ci.state = 'served'
    and ci.bumped_at is not null
    and ci.fire_at is not null
    and ci.bumped_at >= (
      date_trunc('day',
        now() at time zone coalesce((select tz from public.pickup_config where id), 'America/Los_Angeles'))
      at time zone coalesce((select tz from public.pickup_config where id), 'America/Los_Angeles')
    );
$$;
revoke all on function public.mms_kds_stats() from public, anon, authenticated;
grant execute on function public.mms_kds_stats() to service_role;
