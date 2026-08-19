-- W23c — the settlement's own precheck-and-void, run between a pickup order's AUTHORIZATION and its
-- capture (registry M69).
--
-- The manual-capture path gets one more look at the live catalog before money moves. When a dish ran
-- out in that window the line has to come off the cart before the capture amount is derived, so the
-- guest is charged for what they are actually getting and no refund ever exists.
--
-- ── Why not mms_void_line ───────────────────────────────────────────────────────────────────────
-- Its guard answers 'in_flight' whenever the cart is locked or settling — which is exactly the state
-- this path runs in, because create-intent acquired the pay lock and never released it on the success
-- route. That guard is right for what it protects against: a SECOND actor mutating a basket while
-- money is moving on it. This caller is not a second actor; it is the settlement itself. Loosening
-- the shared guard would have opened the in-flight window to every void caller — the floor console,
-- the staff sheet, the approvals queue — to serve one path that already owns the lock.
--
-- ── Why this is a PRECHECK, not just a void (Codex #203 P1 ×2) ──────────────────────────────────
-- The first draft only ran when there was something to void, which left the ordinary all-available
-- capture with NO check that the cart was still open — and checked `status` but never who held the
-- lock. Both are the same mistake in different clothes: a hold can outlive its basket. The five-
-- minute lock can go stale, another payer can take the cart, and a late Payment Element confirmation
-- would then void lines underneath a fresh settlement and capture an obsolete authorization.
--
-- So the gate and the void are ONE call, and the caller makes it unconditionally — an empty id array
-- is a legitimate use, meaning "nothing to drop; confirm I may still capture." A check that only runs
-- on the unusual path is a check the usual path does not have.
--
--   -1  the cart is no longer open  — settled or cleared out of band; there is nothing to charge for
--   -2  the lock is no longer ours  — another payer owns this cart's settlement now
--   >=0 the number of lines voided
--
-- ── Scope ──────────────────────────────────────────────────────────────────────────────────────
--   • DRAFT lines only, matching lib/availability.ts: a fired line is already made, and nothing here
--     should be able to un-sell food that exists. Pickup lines stay draft until payment fires them.
--   • FOOD only. Grocery is self-scanned and already in the shopper's hands.
--   • COMPED lines INCLUDED, deliberately — and this is where the first draft contradicted itself.
--     `lib/availability.ts` blocks a comped draft line on purpose ("comped or not, the kitchen still
--     makes it, and it cannot make a dish it does not have"), but the first version of this function
--     excluded them, so a sold-out comped dish was reported by the gate, voided by nothing, and then
--     fired to a kitchen that could not make it. Voiding it costs the guest nothing — it was already
--     $0 — and stops an impossible ticket reaching the line.

create table if not exists public.qr_dropped_lines (
  id            uuid primary key default gen_random_uuid(),
  cart_id       uuid not null references public.qr_carts(id) on delete cascade,
  line_id       uuid not null,
  name          text not null,
  qty           integer not null,
  amount_cents  integer not null,
  reason_code   text not null check (char_length(reason_code) between 1 and 40),
  dropped_at    timestamptz not null default now()
);
create index if not exists qr_dropped_lines_cart_idx on public.qr_dropped_lines (cart_id, dropped_at desc);
alter table public.qr_dropped_lines enable row level security;

-- Manager-read, matching mms_refunds and menu_availability_audit. There is deliberately NO write
-- policy: the app appends through the service client inside the function below, and stating the
-- omission here stops a future reader "fixing" it into a path that can mint a fictional entry.
drop policy if exists qr_dropped_lines_read on public.qr_dropped_lines;
create policy qr_dropped_lines_read on public.qr_dropped_lines
  for select to authenticated using (public.is_staff_at_least('manager'));

comment on table public.qr_dropped_lines is
  'W23c — lines removed from a pickup basket by the settlement itself, between authorization and '
  'capture, because the catalog said they could no longer be made. Its OWN table rather than a row '
  'in mms_approvals: that ledger is a TWO-PARTY staff record with a NOT NULL initiator, and no human '
  'decided this. Passing a staff id would put a name against a decision nobody made; passing null '
  'raises. Also the number the owner actually wants — how often does the kitchen run out mid-order?';

create or replace function public.mms_settle_precheck_and_void(
  p_cart uuid,
  p_menu_ids text[],
  p_payer uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_status text; v_locked_by uuid; v_count integer := 0; r record;
begin
  select c.status, c.locked_by into v_status, v_locked_by
    from public.qr_carts c where c.id = p_cart for update;
  if v_status is null then return -1; end if;          -- cart gone: nothing to charge for
  if v_status <> 'open' then return -1; end if;        -- settled/cleared out of band
  -- `is distinct from` so a NULL lock (released or expired) fails the check too: an authorization
  -- whose lock is gone has no claim on this cart, whoever holds it now.
  if v_locked_by is distinct from p_payer then return -2; end if;

  -- RECLAIM rather than refuse (Codex round 2 P1). `locked_by` alone does not prove the lock is
  -- LIVE: lib/lock.ts treats one older than five minutes as stealable, so a diner who took longer
  -- than that between minting the intent and confirming their card arrives here still named on a
  -- lock the rest of the app already considers free.
  --
  -- Refusing there would cancel a perfectly good payment for being slow, which is the wrong trade —
  -- and it would not buy much, because the money is already guarded downstream: the totals are
  -- re-derived after the voids, so an edited basket captures LESS, and one that somehow grew is
  -- refused by `planCapture`. What the staleness really costs is ambiguity about who may act.
  --
  -- So take the lock back instead. Nobody else holds it (locked_by still names this payer), we are
  -- inside `for update` on the row, and after this line the lock is provably ours AND fresh — any
  -- concurrent editor would have had to acquire it, which changes locked_by, which the check above
  -- already catches.
  update public.qr_carts set locked = true, locked_at = now() where id = p_cart;

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
    insert into public.qr_dropped_lines (cart_id, line_id, name, qty, amount_cents, reason_code)
      -- A comped line's money value is 0, and recording its list price here would overstate what the
      -- shortage cost. The ledger answers "what did we fail to sell", not "what was on the menu".
      values (p_cart, r.id, r.name, r.qty,
              case when r.comped then 0 else r.unit_price_cents * r.qty end, 'sold_out');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.mms_settle_precheck_and_void(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function public.mms_settle_precheck_and_void(uuid, text[], uuid) to service_role;

comment on function public.mms_settle_precheck_and_void(uuid, text[], uuid) is
  'W23c — confirm a pickup authorization may still be captured (cart open AND this payer still holds '
  'the lock), and drop any lines the catalog says can no longer be made. Called unconditionally by '
  'the manual-capture path, empty array included, so the gate runs on EVERY capture and not only on '
  'the ones that have something to void. -1 = cart not open, -2 = lock lost, >= 0 = lines voided.';
