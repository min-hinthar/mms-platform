-- M100 · M107 — the session's mode is the authority for a line's routing tag, and two RPCs never asked.
--
-- `Checkout.tsx` renders the For-here/To-go pills (`:1243`) and the "Make it now" button (`:1283`)
-- behind `isDineIn &&`, and its own comment says why that gate is written to fail closed on an
-- unknown mode: "a missing control costs a tap, a wrong one costs the order". A Server Action is a
-- public POST, so that gate is advisory — this repo's stated rule is that the server re-derives.
-- `mms_set_line_fulfillment` and `mms_fire_line` never read `table_sessions.mode`, so nothing
-- between the browser and the row re-derived the one fact both controls were gated on.
--
-- Both holes are measured, not reasoned: on a migrated database, one $14.00 cold-food line on a
-- `pickup` session —
--
--     mms_set_line_fulfillment(line,'dinein') -> ok     fulfillment=dinein   tax_cents 0 -> 147
--     mms_fire_line(line)                     -> ok     state=fired          cart status=open
--
-- ── M100 — what a forged `dinein` tag costs, and the money is the SMALLER half ──────────────────
--
-- MONEY. `getCartTotals` reads a line's stored `tax_cents` only as a boolean taxable-or-not flag and
-- taxes the whole `unit_price_cents * qty` (`tax.ts`'s own header; `totals-math.ts`), so the tag moves
-- the ENTIRE line across the taxable base. CDTFA Reg 1603 exempts cold food to-go, so the guest is
-- charged 147¢ of tax the transaction does not owe and the restaurant over-collects it. Only
-- `cold_food` and `beverage_cold` are fulfillment-sensitive; a hot dish's tag flip costs nothing.
-- Nothing downstream notices: `create-intent` and the webhook reconcile both call `getCartTotals` on
-- the same corrupted rows, so they agree, and the tag then freezes into `qr_order_items` verbatim.
--
-- ROUTING, which is worse. `mms_init_togo_status` stamps `togo_status='preparing'` only when the cart
-- holds a `togo`/`grocery` line, and `expo.ts` reads `.in("fulfillment",["togo","grocery"])`. A
-- single-line pickup order whose one line reads `dinein` therefore settles with `togo_status` NULL
-- and ZERO expo lines: /track never leaves "Order placed", the counter never shows a bag, nobody
-- calls the customer. The food is still COOKED — `mms_fire_pending_food` lost its mode gate in W3 —
-- so it reaches the pass with no destination. A paid order that no staff surface shows.
--
-- ── M107 — "Make it now" fires an UNPAID pickup/scango line to the kitchen ──────────────────────
--
-- `mms_fire_line` requires an open cart and a `togo` line. Every pickup cart satisfies both BEFORE
-- payment, and `kitchen.ts` reads carts `in ('open','paid')`, so the line lands on the KDS. That
-- file's own comment states the invariant nothing enforced: "pickup/scango only ever fire paid".
-- Dine-in fires before payment BY DESIGN (you are seated and settle at the end); pickup and
-- scan-and-go are pay-first, and `mms_fire_pending_food` is the path that reaches the kitchen there.
--
-- ── Nothing here is a new idea ─────────────────────────────────────────────────────────────────
--
-- `mms_fire_cart` (`20260624030000:94-101`) and `mms_fire_pending_food` (`20260716000000:125-137`)
-- both `join public.table_sessions s on s.id = c.session_id` inside their write. These two functions
-- are catching up with their three siblings; the pattern, the join and the column are all already here.
--
-- ── The guard is ONE-DIRECTIONAL, on purpose ───────────────────────────────────────────────────
--
-- `dinein` is the value a non-dine-in session may not reach. `togo` is the value that REPAIRS one, so
-- it stays open on every mode: rows already tagged `dinein` on a pickup cart exist today (every line
-- written before this applies), and a guard phrased as "no toggling at all off a dine-in session"
-- would trap each of them as permanently taxable — the exact damage this migration exists to stop,
-- made unfixable. Over-blocking is as bad as under-blocking; `supabase/tests/
-- m100_session_mode_authority_test.sql` case 5 is the case that fails if this is ever tightened.
--
-- ── Two homes for one predicate, and an honest note about the second ───────────────────────────
--
-- The pre-check produces a NAMED reason; the copy inside the UPDATE is the atomicity guarantee. Both
-- functions already do exactly this for open/draft/grocery. Unlike those, the mode copy cannot
-- diverge from its pre-check AT RUNTIME: no statement in this schema or in `apps/` ever sets
-- `table_sessions.mode` after the insert that mints the session (only `status` is ever updated), and
-- `qr_carts.session_id` is `not null` and likewise never rewritten — so mode is immutable for a
-- cart's whole life and no concurrent session can make the two disagree. `scripts/
-- verify-mode-authority.mjs` MEASURES that rather than asserting it: deleting the in-write term while
-- the pre-check stands is a DOCUMENTED SURVIVOR, and a kill there would mean this paragraph had
-- become false.
--
-- What the term is worth is the other direction, and that is measured too. Delete the PRE-CHECK and
-- keep the term, and the write is still refused — the verdict degrades from a named reason to
-- 'stale', but no dine-in tag reaches a pickup line. So it is not a race guard dressed up as one, and
-- not decoration either: it is the half of the guard that survives someone editing the other half.
-- The joins are total: `qr_carts.session_id` is `not null` with an FK to `table_sessions`, so neither
-- can drop a live row.

-- ── 1) mms_set_line_fulfillment — a non-dine-in session may not name `dinein` ────────────────────
-- Restated from `20260815200000_w16a_mode_prices_tax.sql:29-76`, the live definition and the THIRD
-- of this function (measured: `grep -rEc "create (or replace )?function[[:space:]]+(public\.)?
-- mms_set_line_fulfillment" supabase/migrations/*.sql`, counting this file). Signature unchanged, so
-- `create or replace` is enough and the grants below are a restatement, not a repair. FOUR lines
-- differ, and nothing else — diff the bodies to confirm: `v_mode` declared; `s.mode` added to the
-- select with the `table_sessions` join it needs; the pre-check; the term inside the UPDATE's EXISTS.
-- The price path, the 25¢/500000¢ bound, the tax recompute and every other predicate are untouched.
create or replace function public.mms_set_line_fulfillment(
  p_line uuid,
  p_fulfillment text,
  p_unit_price_cents integer default null
) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_cur text; v_mid text; v_price integer; v_cat text;
        v_new_price integer; v_mode text;
begin
  if p_fulfillment not in ('dinein','togo') then return 'bad_fulfillment'; end if;
  -- Bound the server-derived price (belt: the caller is service-role TS, never the client, but a
  -- corrupted value must not become a charged amount). Null = legacy tax-only behavior. The 25¢
  -- floor is belt-only against today's catalog (min base $2.00, no negative deltas): a genuinely
  -- sub-25¢ food line would refuse its toggle with 'bad_price' — if a ~$0 item is ever added,
  -- widen this to allow 0 explicitly rather than relaxing the floor.
  if p_unit_price_cents is not null and (p_unit_price_cents < 25 or p_unit_price_cents > 500000) then
    return 'bad_price';
  end if;
  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents, s.mode
    into v_cart, v_status, v_state, v_cur, v_mid, v_price, v_mode
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    join public.table_sessions s on s.id = c.session_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- can't re-route a line the kitchen has
  if v_cur = 'grocery' then return 'is_grocery'; end if;   -- grocery routing + exemption are fixed
  -- M100 — the client gate, re-derived. Placed with the other authorization checks and BEFORE the
  -- no-op return below, so the verdict never depends on whether the write happens to be a no-op.
  if p_fulfillment = 'dinein' and v_mode <> 'dinein' then return 'not_dinein_session'; end if;
  if v_cur = p_fulfillment then return 'ok'; end if;       -- no-op flip: never rewrite the price
  v_new_price := coalesce(p_unit_price_cents, v_price);
  -- Per-line tax from the food item's category + the new fulfillment, on the NEW price (the
  -- taxable-base flag getCartTotals reads). menu_item_id is a uuid for food (grocery filtered out).
  select tax_category into v_cat from public.menu_items where id = v_mid::uuid;
  -- Re-assert open + draft + food IN THE WRITE (not just the if-checks above): a concurrent
  -- mms_fire_cart (draft→fired) or webhook open→paid flip landing between the SELECT and this
  -- UPDATE must NOT re-route + re-price a line the kitchen/payment already owns. The mode term is
  -- the exception noted in this file's header: it cannot diverge from the pre-check at runtime, and
  -- earns its place by refusing the write (as 'stale') if the pre-check above is ever edited away.
  update public.qr_cart_items ci
    set fulfillment = p_fulfillment,
        unit_price_cents = v_new_price,
        tax_cents = public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')
    where ci.id = p_line
      and ci.state = 'draft'
      and ci.fulfillment <> 'grocery'
      and exists (
        select 1 from public.qr_carts c
        join public.table_sessions s on s.id = c.session_id
        where c.id = ci.cart_id and c.status = 'open'
          and (p_fulfillment <> 'dinein' or s.mode = 'dinein')
      );
  if not found then return 'stale'; end if;   -- raced a fire / pay between the read and the write
  return 'ok';
end $$;
revoke all on function public.mms_set_line_fulfillment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mms_set_line_fulfillment(uuid, text, integer) to service_role;

-- ── 2) mms_fire_line — "Make it now" is a DINE-IN affordance ────────────────────────────────────
-- Restated from `20260623220000_s4_fire_routing.sql:44-59`, the live definition and the SECOND of
-- this function (measured the same way; the 20260624030000 remediation names this function in prose
-- but re-creates only `mms_fire_cart`, which is why a grep for the prose would miscount). The same
-- FOUR lines differ and nothing else — diff the bodies: `v_mode`, `s.mode` + its join, the
-- pre-check, the term in the EXISTS. The 10s grace, the batch id and `not_togo` are untouched.
create or replace function public.mms_fire_line(p_line uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_ful text; v_mode text;
begin
  select ci.cart_id, c.status, ci.state, ci.fulfillment, s.mode
    into v_cart, v_status, v_state, v_ful, v_mode
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    join public.table_sessions s on s.id = c.session_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- already fired/served/voided
  if v_ful <> 'togo' then return 'not_togo'; end if;       -- dinein → batch send; grocery → never
  -- M107 — pickup and scan-and-go are pay-first: their food reaches the kitchen through
  -- mms_fire_pending_food at settlement, never from an open cart. Same gate mms_fire_cart has had
  -- since S4.2; this is the early-fire path that never adopted it.
  if v_mode <> 'dinein' then return 'not_dinein_session'; end if;
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now() + interval '10 seconds', fire_batch = gen_random_uuid()
    where ci.id = p_line
      and ci.state = 'draft'
      and ci.fulfillment = 'togo'
      and exists (
        select 1 from public.qr_carts c
        join public.table_sessions s on s.id = c.session_id
        where c.id = ci.cart_id and c.status = 'open' and s.mode = 'dinein'
      );
  if not found then return 'stale'; end if;   -- raced a settle / another fire between read and write
  return 'ok';
end $$;
revoke all on function public.mms_fire_line(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_line(uuid) to service_role;
