-- W23d — tell the diner what the settlement dropped (registry M71).
--
-- W23c gave the pickup path a last look at the catalog between AUTHORIZATION and capture: sold-out
-- lines come off the basket, the reduced total is captured, and if nothing survives the hold is
-- cancelled outright. Every one of those outcomes is correct on the money and SILENT to the guest.
--
-- Two silences, and they are different problems because only one of them has an order:
--
--   PARTIAL  — lines were dropped and the rest was captured, so an order exists. The receipt, the
--              email, /account and the /track slip all list what the guest GOT and the amount they
--              were actually charged — both true, and both missing the fact that the basket changed
--              between the tap and the charge. A guest who ordered four dishes and is billed for
--              three has to work out which one went, from a receipt that never mentions it.
--
--   ALL-DROPPED — nothing survived, the hold was cancelled, and NO ORDER WILL EVER EXIST. The
--              tracker polls for ~30s and lands on its give-up card, whose every arm asserts a
--              payment: "Your payment went through", "Your payment is safe — show this screen to
--              staff". All false. This file's whole reason for existing is that last sentence: the
--              guest is told to go and ask staff about money that was never taken.
--
-- ── Where each fact lives, and why they are not the same place ────────────────────────────────────
--
-- The partial fact rides the ORDER (`qr_orders.dropped_lines`), which is W23b's move for
-- `refunded_cents`: one column on a row the diner already reads under `qr_order_read`, so the LIVE
-- browser subscription, both server fallback reads, the durable receipt, the email and the account
-- history all inherit it through the shape modules they already share. No policy changes, no second
-- query, no new authorization surface.
--
-- The cancelled fact CANNOT ride the order, because the whole point is that there is no order. It
-- also must not ride `qr_dropped_lines`: a cancellation with ZERO dropped lines is reachable and not
-- rare — `mms_promo_discount` drops a promotion the moment `now() > valid_until`, purely on time, so
-- a hold can be cancelled as `over_authorized` with no line ever voided (this is registry M70's
-- shape). A verdict stored on the line ledger would have nowhere to go in exactly the case whose
-- copy differs most.
--
-- So it gets its own row, keyed on the PaymentIntent: `qr_settlement_cancellations`. One row per
-- ATTEMPT, never overwritten, so a diner who re-orders after a cancellation and is cancelled a
-- second time can still be told the truth about either hold. A cart-level column could not do that —
-- the second attempt would paint over the first.
--
-- ── RLS: qr_dropped_lines is NOT widened, deliberately ───────────────────────────────────────────
-- Its single manager-read policy stands exactly as W23c wrote it. Every path here reads it inside a
-- SECURITY DEFINER function owned by `postgres` (no `force row level security` anywhere in this
-- repo), and only `name` and `qty` — the guest's own order text — ever cross to the diner.
-- `reason_code`, `amount_cents`, `line_id` and the row's existence stay staff-internal. The new
-- table follows the same discipline. `supabase/tests/w23d_dropped_visibility_test.sql` asserts that a
-- genuine session MEMBER — the most-privileged diner there is — CANNOT read either ledger, so a
-- future "helpful" widening reddens CI instead of depending on a reviewer noticing. (In practice
-- `authenticated` has no SELECT grant on either table at all, which refuses the read before RLS is
-- even consulted; the app reads them service-role behind an app-level staff gate, exactly as it
-- reads `mms_refunds`. The test accepts either mechanism, because the RULE is "a diner cannot read
-- this" and pinning one mechanism would go red the day the other legitimately changed.)

-- ── 1. Which ATTEMPT dropped the line ────────────────────────────────────────────────────────────
-- Without this the fulfillment snapshot below could only join on `cart_id`, and a cancelled
-- all-dropped attempt leaves its cart OPEN (see `releaseOurLock` in lib/manual-capture-run.ts) — so
-- the guest re-orders into that same cart, pays, and their brand-new receipt would print "Sold out
-- before we could make it — <Dish> ×1" about an order that never contained it. A fabricated fact on
-- a durable money artifact is the exact thing this slice exists to stop, so the scoping is the
-- FIRST thing here rather than an afterthought.
--
-- Nullable: the W23c rows already in the ledger were written before the column existed and belong to
-- no attempt this code can name. They are staff history and must stay readable; they simply never
-- match a snapshot join, which is the correct answer for a row whose attempt is unknown.
alter table public.qr_dropped_lines add column if not exists payment_intent text;
create index if not exists qr_dropped_lines_intent_idx
  on public.qr_dropped_lines (cart_id, payment_intent);
comment on column public.qr_dropped_lines.payment_intent is
  'W23d — the authorization this drop belongs to. Scopes the fulfillment snapshot to ONE attempt so a '
  're-order in the same still-open cart cannot inherit a previous cancelled attempt''s drops. NULL on '
  'pre-W23d rows (no attempt is knowable for them; they never match a snapshot).';

-- ── 2. The cancelled-hold verdict ────────────────────────────────────────────────────────────────
-- ASSERTED, never inferred. In the beat between `paymentIntents.capture` and `mms_fulfill_order`,
-- "drop rows exist and no order does" is indistinguishable from a perfectly healthy partial capture
-- whose fulfillment has not landed yet — so inferring a cancellation from absence would tell a guest
-- whose money IS moving that nothing was charged. Recording it is the only honest mechanism.
-- ⚠️ `cart_id` carries NO foreign key, and that is deliberate (Codex #205 P1). The precheck returns
-- -1 for BOTH "cart is not open" and "cart row is gone" (`v_status is null` — an outcome it handles
-- explicitly), and the caller records the verdict BEFORE cancelling the hold. With an FK, the gone-
-- cart case would fail the insert, the caller would answer `retry`, and every Stripe redelivery
-- would repeat the same violation — leaving the guest's authorization standing for its full ~7-day
-- life because we could not write a sentence about it. Nothing deletes `qr_carts` today, so the case
-- is not live; a guard whose failure mode is an uncancellable hold is not one to leave loaded.
-- An orphan row here is the correct outcome for a ledger anyway: it records what happened, and what
-- happened does not stop having happened when its cart is swept.
create table if not exists public.qr_settlement_cancellations (
  payment_intent text primary key,
  -- NULLABLE (Codex #205 round 2). The webhook has one branch that cancels a `pickup_manual` hold
  -- with NO cart at all — an authorization whose `cartId` metadata did not arrive, which it handles
  -- explicitly rather than 5xx-ing into 72h of retries that cannot succeed. Without a nullable
  -- column that cancellation has nowhere to be recorded, so the diner's /track (which still carries
  -- `?cart=` from the return_url, and so still classifies the checkout as manual capture) polls
  -- indefinitely saying the card is authorized while Stripe has already released it. The diner read
  -- is keyed on the PaymentIntent and the payer, not the cart, so a null here costs it nothing;
  -- `mms_dropped_snapshot(null, …)` answers '[]', which is the true answer for an attempt that never
  -- reached a basket.
  cart_id        uuid,
  -- The diner this hold belonged to (the intent's `earnerUid` metadata). It is the AUTHORIZATION for
  -- the diner-facing read: `qr_carts.locked_by` is nulled by the lock release that follows a cancel,
  -- so the payer's identity has to be captured here or it is gone.
  payer_uid      uuid,
  reason         text not null check (reason in
                   ('nothing_left','over_authorized','cart_not_open','superseded','no_cart')),
  -- The lock era this authorization was minted under — forensics only, never read by the diner path.
  attempt        timestamptz,
  canceled_at    timestamptz not null default now()
);
create index if not exists qr_settlement_cancellations_cart_idx
  on public.qr_settlement_cancellations (cart_id, canceled_at desc);
alter table public.qr_settlement_cancellations enable row level security;

-- Manager-read, matching qr_dropped_lines / mms_refunds / menu_availability_audit. NO write policy:
-- the app appends only through the SECURITY DEFINER function below, and stating the omission stops a
-- future reader "fixing" it into a path that can mint a fictional cancellation.
drop policy if exists qr_settlement_cancellations_read on public.qr_settlement_cancellations;
create policy qr_settlement_cancellations_read on public.qr_settlement_cancellations
  for select to authenticated using (public.is_staff_at_least('manager'));

comment on table public.qr_settlement_cancellations is
  'W23d — one row per pickup authorization the settlement CANCELLED rather than captured. Keyed on '
  'the PaymentIntent (never the cart) so each attempt keeps its own verdict: a diner who re-orders '
  'after a cancellation and is cancelled again can still be told the truth about either hold. Read '
  'by the diner ONLY through mms_settlement_cancellation, scoped to their own payer_uid.';

-- ── 3. The dropped-line snapshot, derived ONCE ───────────────────────────────────────────────────
-- Both readers go through this: the fulfillment projection below (which freezes it onto the order)
-- and the cancelled-hold read (which has no order to freeze it onto). Naming the jsonb shape in one
-- place is why the tracker, the receipt, the email and /account cannot disagree about it.
--
-- name + qty ONLY, and the omission is deliberate. `amount_cents` stays in the staff ledger: a dollar
-- figure sitting beside the receipt rows, for money that was never charged, reads as a refund line —
-- and a value carried onto a diner-readable column "in case it is useful" is a value some future
-- surface will render. `reason_code` is staff vocabulary and stays staff-side too.
create or replace function public.mms_dropped_snapshot(p_cart uuid, p_intent text)
  returns jsonb language sql security definer stable set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('name', d.name, 'qty', d.qty) order by d.dropped_at, d.id),
    '[]'::jsonb)
  from public.qr_dropped_lines d
  where d.cart_id = p_cart and d.payment_intent = p_intent;
$$;
revoke all on function public.mms_dropped_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_dropped_snapshot(uuid, text) to service_role;
comment on function public.mms_dropped_snapshot(uuid, text) is
  'W23d — the diner-safe projection of one attempt''s dropped lines (name + qty only). The ONE place '
  'that shape is derived: the fulfillment snapshot and the cancelled-hold read both call it.';

-- ── 4. The precheck learns which attempt it is voiding for ───────────────────────────────────────
-- The four-argument shape is DROPPED rather than replaced: adding a parameter to a plpgsql function
-- creates an OVERLOAD, and two callable shapes of a money-path function is the ambiguity W23c's own
-- header refused. Nothing outside W23c/W23d has ever called it.
drop function if exists public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz);

create or replace function public.mms_settle_precheck_and_void(
  p_cart uuid,
  p_menu_ids text[],
  p_payer uuid,
  p_attempt timestamptz,
  p_intent text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_status text; v_locked_by uuid; v_locked_at timestamptz; v_count integer := 0; r record;
begin
  select c.status, c.locked_by, c.locked_at into v_status, v_locked_by, v_locked_at
    from public.qr_carts c where c.id = p_cart for update;
  if v_status is null then return -1; end if;          -- cart gone: nothing to charge for
  if v_status <> 'open' then return -1; end if;        -- settled/cleared out of band
  -- `is distinct from` so a NULL lock (released or expired) fails the check too: an authorization
  -- whose lock is gone has no claim on this cart, whoever holds it now.
  if v_locked_by is distinct from p_payer then return -2; end if;

  -- ERA CHECK (Codex #204 round 2). `locked_by` alone cannot separate a live attempt from a
  -- superseded one, because `acquireCartLock` lets the SAME uid reacquire: a diner who backs out and
  -- re-checks-out with a different tip gets a second authorization over the same cart, and the FIRST
  -- one's webhook still names them as the lock holder. Without this it would pass, and capture the
  -- older authorization — old amount, old tip — against the successor attempt's basket.
  --
  -- `p_attempt` is the `locked_at` this authorization was minted under, carried in the PaymentIntent's
  -- metadata. Equality is the whole test: every fresh acquisition moves the timestamp, so a
  -- superseded era simply does not match and is refused as -2 (the caller cancels its hold, which is
  -- right — its era is over).
  --
  -- This REPLACES the reclaim-the-lock idea from the previous round. Refreshing `locked_at` here
  -- would have been actively harmful under the same scenario: it would stamp a superseded era as
  -- current, and a redelivery after a failed capture would then find its own stamp moved and cancel a
  -- perfectly good order. Verifying is both simpler and correct; the five-minute TTL stops mattering
  -- once the attempt itself is identified.
  if v_locked_at is distinct from p_attempt then return -2; end if;

  if p_menu_ids is null or array_length(p_menu_ids, 1) is null then return 0; end if;

  for r in
    select ci.id, ci.name, ci.qty, ci.unit_price_cents, ci.comped
      from public.qr_cart_items ci
     where ci.cart_id = p_cart
       and ci.state = 'draft'
       and ci.fulfillment in ('dinein','togo')
       and ci.menu_item_id = any(p_menu_ids)
  loop
    update public.qr_cart_items set state = 'voided' where id = r.id;
    insert into public.qr_dropped_lines (cart_id, line_id, name, qty, amount_cents, reason_code, payment_intent)
      -- A comped line's money value is 0, and recording its list price here would overstate what the
      -- shortage cost. The ledger answers "what did we fail to sell", not "what was on the menu".
      values (p_cart, r.id, r.name, r.qty,
              case when r.comped then 0 else r.unit_price_cents * r.qty end, 'sold_out', p_intent);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) to service_role;

comment on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) is
  'W23c/W23d — confirm a pickup authorization may still be captured (cart open AND this payer still '
  'holds the lock, on the SAME attempt), and drop any lines the catalog says can no longer be made, '
  'stamping each with the attempt''s PaymentIntent. Called unconditionally by the manual-capture '
  'path, empty array included, so the gate runs on EVERY capture and not only on the ones that have '
  'something to void. -1 = cart not open, -2 = lock lost or superseded era, >= 0 = lines voided.';

-- ── 5. Record a cancelled hold ───────────────────────────────────────────────────────────────────
-- Called BEFORE `paymentIntents.cancel`, and the ordering is the load-bearing part. A failed CANCEL
-- is retryable — the intent is still `requires_capture`, so Stripe's redelivery re-enters and tries
-- again. A lost VERDICT is not: once the hold is cancelled, `settleAuthorizedPickup` short-circuits
-- on `live.status !== 'requires_capture'` and never reaches the write again, so a cancel-then-mark
-- ordering would strand the guest on "your payment is safe — show this screen to staff" permanently
-- on any transient DB failure. Marking first costs nothing if the cancel then fails: the row simply
-- describes a hold that is about to be released, which is what the copy says either way.
--
-- `on conflict do nothing` makes the redelivery idempotent. 0 rows therefore means "already
-- recorded", which is SUCCESS — the caller only has to treat an exception as failure.
create or replace function public.mms_mark_settle_canceled(
  p_intent text,
  p_cart uuid,
  p_reason text,
  p_payer uuid,
  p_attempt timestamptz
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  insert into public.qr_settlement_cancellations (payment_intent, cart_id, reason, payer_uid, attempt)
  values (p_intent, p_cart, p_reason, p_payer, p_attempt)
  on conflict (payment_intent) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) to service_role;
comment on function public.mms_mark_settle_canceled(text, uuid, text, uuid, timestamptz) is
  'W23d — record that a pickup authorization was CANCELLED rather than captured. Called before the '
  'Stripe cancel: a failed cancel is retryable, a lost verdict is not. Idempotent on the intent; '
  'returns 1 on the first write and 0 when it was already recorded (both are success).';

-- ── 6. The diner-facing read ─────────────────────────────────────────────────────────────────────
-- Uid-scoped IN THE SQL STATEMENT, not in the caller: `payer_uid = p_uid` is the authorization, and
-- the PaymentIntent id is only a lookup. Returns the dropped lines through the shared snapshot, so a
-- cancellation with zero drops answers '[]' rather than failing — that case is the promo-lapse arm
-- and its copy must be correct with no lines at all.
create or replace function public.mms_settlement_cancellation(p_intent text, p_uid uuid)
  returns table (reason text, lines jsonb)
  language sql security definer stable set search_path = '' as $$
  select c.reason, public.mms_dropped_snapshot(c.cart_id, c.payment_intent)
  from public.qr_settlement_cancellations c
  where c.payment_intent = p_intent and c.payer_uid = p_uid;
$$;
revoke all on function public.mms_settlement_cancellation(text, uuid) from public, anon, authenticated;
grant execute on function public.mms_settlement_cancellation(text, uuid) to service_role;
comment on function public.mms_settlement_cancellation(text, uuid) is
  'W23d — the cancelled-hold verdict for ONE diner''s own authorization. `payer_uid = p_uid` is the '
  'authorization and it lives in the statement; the intent id only narrows it. Zero rows = no '
  'recorded cancellation of this caller''s, which the caller must treat as UNDECIDED, never as '
  '"nothing was charged".';

-- ── 7. The order carries what it lost ────────────────────────────────────────────────────────────
-- W23b's move for `refunded_cents`, for the same reason: a column on `qr_orders` is readable under
-- the untouched `qr_order_read` policy, so the LIVE browser subscription, both `getMyOrderFallback`
-- server reads, the durable `?r=` receipt, the emailed receipt and the /account history all inherit
-- the fact through the two shape modules they already share. Nothing else has to learn anything.
--
-- Frozen at fulfillment, exactly like every other figure on the order: this is the snapshot of what
-- the settlement removed, not a live view of a ledger that could later be re-read differently.
alter table public.qr_orders add column if not exists dropped_lines jsonb not null default '[]'::jsonb;
comment on column public.qr_orders.dropped_lines is
  'W23d — the lines this order''s own settlement removed between authorization and capture '
  '(name + qty, frozen at fulfillment). ''[]'' for every automatic-capture order, which is all of '
  'them until PICKUP_MANUAL_CAPTURE is on. Never a money row: the guest was not charged for these.';
-- ── mms_fulfill_order restated (SAME signature — only the qr_orders insert widens) ──────────────
-- Baseline: supabase/migrations/20260815100000_m3_modifier_option_ids.sql (the 10-arg M3 shape
-- carrying p_settled_by / p_tender). Restated MECHANICALLY from that file, not hand-transcribed:
-- the block was sliced out and diffed, and the only difference is `dropped_lines` in the column
-- list plus its snapshot in the values list. `create or replace` with an unchanged signature, so no
-- overload can be minted; naming the wrong baseline here would silently revert K2/W6c/M3 on the one
-- function every card order passes through.
create or replace function public.mms_fulfill_order(
  p_cart_id uuid, p_payment_intent text, p_amount_cents integer, p_subtotal_cents integer,
  p_discount_cents integer, p_service_charge_cents integer, p_tax_cents integer, p_tip_cents integer default 0,
  p_settled_by uuid default null, p_tender text default 'card'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_total integer; v_session uuid; v_promo text;
  v_slot timestamptz; v_fire timestamptz; v_table integer; v_name text;
begin
  -- Idempotent branch FIRST (the ordering discipline): the PI id is the card-family key.
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
                         pickup_slot, fire_at, cart_id, table_number, customer_name,
                         tender, settled_by, dropped_lines)
    values (v_session, p_subtotal_cents, p_discount_cents, p_service_charge_cents,
            p_tax_cents, p_tip_cents, v_total, p_payment_intent, 'paid', v_slot, v_fire, p_cart_id,
            v_table, v_name, p_tender, p_settled_by,
            public.mms_dropped_snapshot(p_cart_id, p_payment_intent))
    returning id into v_order;

  insert into public.qr_order_items (order_id, menu_item_id, name, qty, modifiers, modifier_option_ids, unit_price_cents, tax_cents, fulfillment, notes)
    select v_order, ci.menu_item_id, ci.name, ci.qty, ci.modifiers, ci.modifier_option_ids, ci.unit_price_cents, ci.tax_cents, ci.fulfillment, ci.notes
    from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state <> 'voided' and not ci.comped;

  if v_promo is not null and p_discount_cents > 0 then
    perform public.mms_promo_consume(v_promo, v_session, v_order);
  end if;

  return v_order;
end; $$;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer, uuid, text)
  to service_role;

-- ── NOT restated: mms_fulfill_cash_order / mms_fulfill_split_order ───────────────────────────────
-- A cancelled all-dropped hold leaves the cart OPEN, so staff CAN later settle that cart in cash and
-- an order is born from a cart that carries drop rows. It still must not carry them, and the reason
-- is the same predicate that makes §1 necessary: those drops belong to a DIFFERENT attempt — a card
-- authorization that was cancelled — and a cash order has no PaymentIntent to match them on.
-- Attributing them to the cash settle would print "sold out before we could make it" on a receipt
-- for an order the guest placed afterwards, in full knowledge of what was and wasn't available.
-- Split is dine-in; `manualCaptureMode` refuses everything but pickup, so it can never see a drop
-- row at all. Both keep the '[]' default, which is the true answer for them.
