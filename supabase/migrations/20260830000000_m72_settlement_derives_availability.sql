-- 20260830000000_m72_settlement_derives_availability.sql — M72 (partial: one of three windows).
--
-- ⚠️ READ THE SCOPE NOTE BEFORE TICKING ANY BOX. This does NOT close M72 as the registry row is
-- written, and `docs/HANDOFF.md` gates the PICKUP_MANUAL_CAPTURE rollout on "M70 · M71 · M72
-- closed". That gate needs re-deciding or the row re-scoping; see §0.
--
-- ── §0 · What this closes, and what it does not ─────────────────────────────────────────────────
-- The pickup manual-capture path had THREE windows in which an 86 (staff marking a dish sold out)
-- could be missed and the full authorization captured for a dish nobody can make:
--
--   A. app catalog read  →  void            — a PostgREST ROUND-TRIP plus the void's own
--                                             execution.                    ← THIS MIGRATION: shrunk
--   B. void commits      →  getCartTotals   — `getCartTotals` never reads menu_items, so an 86
--                                             landing here is invisible.  ← still open
--   C. totals            →  Stripe capture  — an HTTP call no Postgres transaction can span.
--                                             ← still open, and see the warning below
--
-- ⚠️ Window A is SHRUNK, not eliminated, and an earlier draft of this header said "zero" (Codex
-- round 2, P1 — correctly). Under READ COMMITTED a statement reads from a snapshot taken when the
-- statement BEGINS. An 86 committing after that snapshot but before this statement finishes is
-- invisible to it, so the line is not voided. What goes away is the app→DB round-trip that used to
-- sit in front of the void; what remains is the statement's own execution. That is a large
-- reduction and not a closure, and `setItemSoldOut` writes only `menu_items` — it takes no cart
-- lock — so nothing serialises the two. Closing A entirely needs the same synchronisation B and C
-- need.
--
-- ⚠️ Window C is NOT "one round-trip". `apps/qr/lib/stripe.ts` constructs the SDK with no `timeout`
-- and no `maxNetworkRetries`, so stripe@22.2.1 applies its defaults: 80 000 ms per attempt and 2
-- retries, i.e. up to THREE attempts with 0.5–5 s jittered backoff. A slow or flapping capture
-- holds window C open for MINUTES, not milliseconds. Anyone re-deciding the rollout gate should
-- price that number, not the intuitive one. (Capping `maxNetworkRetries` on the capture call would
-- shrink C far more cheaply than any schema change — deliberately left to its own slice, because it
-- changes retry behaviour for every Stripe call in the app.)
--
-- Closing B and C properly needs a RESERVATION the 86 write participates in — the inventory model
-- `20260819000000_w23a_sold_out.sql` deliberately declined, on the grounds that somebody then has to
-- count portions every service. That trade-off stays declined. This migration buys window A without
-- paying for it.
--
-- ── §1 · Why the change is worth making on its own ─────────────────────────────────────────────
-- Window A is not just the widest DB-side gap; it is an AUTHORITY defect. The old shape had the app
-- read the catalog, compute the unsellable set, and hand the ids to the server as `p_menu_ids`,
-- which voided exactly what it was told. The server never consulted `menu_items` — so "which dishes
-- can no longer be made" was a client-supplied decision on a money path, the one shape this repo
-- forbids outright (CLAUDE.md: guards belong IN the SQL statement).
--
-- It also deletes a failure mode: the app-side read could fail transiently, and `manual-capture-run`
-- answered `retry` for it. With the derivation inside the void's own snapshot there is no second
-- read to fail, so an outage that used to strand a hold now simply cannot happen here.
--
-- ── §2 · Why this is not a lock, and cannot block the 86 button ───────────────────────────────
-- The function already held `for update` on `qr_carts` before the void; the derivation just joins
-- `menu_items` under that same statement. The cart row lock and the catalog are different objects,
-- so `setItemSoldOut` (which writes only `menu_items` + `menu_availability_audit`, and never touches
-- `qr_carts`) is never blocked by a settlement in flight. Verified on a real stack from two
-- sessions: the 86 committed without waiting, and a derivation run afterwards saw it — READ
-- COMMITTED takes a fresh snapshot per statement. **The 86 button must never be refusable; it isn't.**
--
-- ── §3 · The signature is DELIBERATELY unchanged ──────────────────────────────────────────────
-- `p_menu_ids` is retained and IGNORED rather than dropped, and that is the load-bearing choice:
--
--   · DROP + CREATE resets `pg_proc.proacl` to NULL, which means EXECUTE **to PUBLIC**. The
--     `revoke` in w23d:211 belongs to the old pg_proc row and does not carry over. Measured on a
--     scratch stack: after a drop-and-recreate, `set role authenticated; select
--     mms_settle_precheck_and_void(cart, null, null, 'pi_forged')` SUCCEEDS — voiding lines and
--     minting a `qr_dropped_lines` row with an attacker-chosen payment_intent, which
--     `mms_dropped_snapshot` then renders to a diner. (It gets through because SECURITY DEFINER
--     bypasses the table grants, and `null is distinct from null` is FALSE so an open cart with a
--     released lock passes both -2 gates.) Every QR diner is `authenticated` — anonymous auth.
--     `CREATE OR REPLACE` on the SAME signature preserves the ACL, so that hole cannot open here.
--   · PostgREST resolves `.rpc()` by ARGUMENT NAME. Dropping the parameter would make app and
--     migration undeployable apart in EITHER order — each skew direction 500s the webhook and Stripe
--     redelivers for 72 h with the guest's hold standing.
--
-- ⚠️ One asymmetry is ACCEPTED rather than solved (Codex round 2, P2). New function + unchanged app
-- is behaviourally identical in the direction that matters — a dish that sold out is derived and
-- voided whatever the app sent. The reverse is not: if a dish the app saw as sold out becomes
-- AVAILABLE again before this statement runs, the derivation correctly finds nothing, returns 0, and
-- the unchanged caller's `gone.length > 0 && voided === 0` check (manual-capture-run.ts:168) reads
-- that as a precheck failure and answers `retry`. The hold stands until Stripe redelivers, and the
-- next delivery succeeds. That is a delayed capture, never a wrong charge, and it self-heals — where
-- the alternative (teaching the app about the new semantics in this PR) reintroduces exactly the
-- round-1 defect, since the app must keep sending a real list while the OLD function may still be
-- live. M72b removes the check and the read together, after `db push`.
--
-- The parameter is therefore vestigial for exactly one deploy cycle. Removing it is filed as a
-- follow-up; until then the body must never read it, so no future edit can re-wire the client's
-- opinion back into an authority decision.
--
-- ── §4 · The join, and the three arms it must reproduce ───────────────────────────────────────
-- `qr_cart_items.menu_item_id` is a SOFT text ref (init:146): a menu_items uuid as text, OR a
-- grocery barcode. So the cast direction is `mi.id::text = ci.menu_item_id` and NOT
-- `ci.menu_item_id::uuid` — the latter raises 22P02 on any grocery line in the same cart, aborting
-- the settlement and answering `retry` to Stripe for 72 h. The planner may evaluate the cast before
-- the fulfillment filter, so that filter is not protection.
--
-- LEFT join, never inner: an id with NO catalog row is UNSELLABLE (`availability.ts:104-113`, pinned
-- by the "Ghost Curry" case in `availability.test.ts`). An inner join would silently fail OPEN on
-- exactly that case, reversing a documented rule. The three arms — no row · sold out · delisted —
-- are set-equal to `pickUnavailable`'s, and `supabase/tests/m72_settlement_derives_availability_test.sql`
-- pins that parity the same way `tax_parity_test.sql` pins `lib/tax.ts` ↔ `mms_line_tax`.
create or replace function public.mms_settle_precheck_and_void(
  p_cart uuid,
  p_menu_ids text[],
  p_payer uuid,
  p_attempt timestamptz,
  p_intent text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_status text; v_locked_by uuid; v_locked_at timestamptz; v_count integer;
begin
  -- Unchanged from w23d: the three authority gates run FIRST and are the reason this is called
  -- unconditionally, empty basket included. A hold can outlive its cart whether or not a dish ran out.
  select c.status, c.locked_by, c.locked_at into v_status, v_locked_by, v_locked_at
    from public.qr_carts c where c.id = p_cart for update;
  if v_status is null then return -1; end if;
  if v_status <> 'open' then return -1; end if;
  if v_locked_by is distinct from p_payer then return -2; end if;
  if v_locked_at is distinct from p_attempt then return -2; end if;

  -- ONE data-modifying statement, so the derivation and the void share a single snapshot: the
  -- app→DB round-trip that used to precede the void is gone, and what remains of window A is this
  -- statement's own execution (see §0 — an 86 committing after the snapshot is still missed).
  -- `p_menu_ids` is not read anywhere below — see §3.
  with unsellable as (
    select ci.id, ci.name, ci.qty, ci.unit_price_cents, ci.comped
      from public.qr_cart_items ci
      left join public.menu_items mi on mi.id::text = ci.menu_item_id
     where ci.cart_id = p_cart
       and ci.state = 'draft'
       -- Food only. A grocery barcode never joins a catalog row, so without this it would fall into
       -- the `mi.id is null` arm and every scan-and-go line would be voided at settlement.
       and ci.fulfillment in ('dinein','togo')
       and (mi.id is null or mi.is_sold_out or not mi.is_active)
  ),
  voided as (
    update public.qr_cart_items t
       set state = 'voided'
      from unsellable u
     -- `t.state = 'draft'` is NOT redundant with the CTE's filter. Under READ COMMITTED a concurrent
     -- commit makes the executor re-check the UPDATE's own qual against the new row version
     -- (EPQ); the CTE's filter was evaluated in the earlier snapshot and is not re-checked. Measured
     -- without it: two sessions voiding the same line produced TWO `qr_dropped_lines` rows — and
     -- that ledger has no unique constraint while `mms_dropped_snapshot` aggregates without
     -- `distinct`, so the diner's /track card and receipt list the dish twice.
     where t.id = u.id and t.state = 'draft'
    returning t.id
  ),
  ledger as (
    insert into public.qr_dropped_lines
      (cart_id, line_id, name, qty, amount_cents, reason_code, payment_intent)
    select p_cart, u.id, u.name, u.qty,
           -- A comped line's money value is 0; recording its list price would overstate what the
           -- shortage cost. The ledger answers "what did we fail to sell".
           case when u.comped then 0 else u.unit_price_cents * u.qty end,
           -- Still the single 'sold_out' code, exactly as w23d wrote it. The set now mixes three
           -- arms and the column CHECK is only a length bound, so recording the true arm is possible
           -- — but `reason_code` is diner-facing vocabulary and changing it is its own decision.
           'sold_out', p_intent
      from unsellable u
      -- Only ledger what the UPDATE actually claimed. Joining `voided` rather than `unsellable`
      -- is the second half of the duplicate-row fix above: a line another session voided first is
      -- absent from `voided`, so it earns no ledger row here.
      join voided v on v.id = u.id
    returning 1
  )
  select count(*)::integer into v_count from ledger;
  return v_count;
end $$;

-- Restated even though CREATE OR REPLACE preserves the ACL: it costs nothing, it documents the
-- intent at the point of change, and `m72_settlement_derives_availability_test.sql` asserts the
-- resulting privileges with `has_function_privilege` — the guard this repo did not previously have
-- for any function (the only prior instance is hand-written in m87_order_item_seat_test.sql:207-212).
revoke all on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) to service_role;

comment on function public.mms_settle_precheck_and_void(uuid, text[], uuid, timestamptz, text) is
  'W23c/W23d/M72 — confirm a pickup authorization may still be captured (cart open AND this payer '
  'still holds the lock, on the SAME attempt), then DERIVE the unsellable draft food lines from the '
  'catalog inside this statement''s own snapshot and void them, stamping each with the attempt''s '
  'PaymentIntent. M72: the unsellable set is no longer supplied by the caller — `p_menu_ids` is '
  'accepted and IGNORED for one deploy cycle (dropping it would reset the ACL to PUBLIC and make '
  'app/migration undeployable apart) and is scheduled for removal. -1 = cart not open, -2 = lock '
  'lost or superseded era, >= 0 = lines voided.';

-- Anti-overload guard: if a future edit adds or removes a parameter without dropping the old shape,
-- both bodies stay callable and the older one still trusts the caller's list. Fails the migration
-- loudly rather than leaving two live definitions. Falsified when written: planting a second shape
-- raises, removing it passes.
do $$
declare v_shapes integer;
begin
  select count(*) into v_shapes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mms_settle_precheck_and_void';
  if v_shapes <> 1 then
    raise exception 'mms_settle_precheck_and_void has % shapes, expected 1 — an overload would leave the caller-trusting body live', v_shapes;
  end if;
end $$;
