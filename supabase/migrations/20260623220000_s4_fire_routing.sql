-- 20260623220000_s4_fire_routing.sql — S4.2: per-line fire routing for the dine-in unified basket.
-- docs/S4_DESIGN.md S4.2 (F1–F6). The per-line fulfillment tag (S4.1) now drives WHEN a line fires:
--   dinein  → kitchen NOW   (the S2 batch send)
--   togo    → at checkout, or early via "make it now"
--   grocery → never fires   (bagged at payment)
-- This slice ONLY refines the per-line (qr_cart_items.fire_at) dine-in path. Pickup/scango keep their M2
-- ORDER-level scheduled fire (qr_orders.fire_at = slot − prep) — untouched. Additive + idempotent.

-- ── F1: mms_fire_cart now fires ONLY dinein lines ───────────────────────────────────────────────────────
-- Was (S2 polish): fired EVERY draft line of a dine-in session. With S4.1, a diner can tag a food line
-- 'togo' (to take home) — that line must NOT fire on "Send to kitchen"; it waits for checkout / make-it-now.
-- A 'grocery' line never fires. Same atomic shape: one fire_batch + fire_at = now()+10s grace, cart open.
create or replace function public.mms_fire_cart(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid();   -- one id for THIS send (undo-batch identity)
begin
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now() + interval '10 seconds', fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'draft'
      and ci.fulfillment = 'dinein';   -- S4.2: to-go waits for checkout/make-it-now; grocery never fires
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_cart(uuid) to service_role;

-- ── F2: mms_fire_line — "make it now" early fire of ONE to-go food line ──────────────────────────────────
-- Returns a text reason (parity with mms_set_line_fulfillment). Re-derives the guards IN the write so a
-- concurrent fire/settle can't double-fire or fire a stale line. Only a 'togo' line (a 'dinein' line uses
-- the batch send; 'grocery' never fires). The diner action layer adds member + canMutateLine (own/host
-- draft) on top. Grace = 10s so the same undo affordance applies. Its own fire_batch (a single-line send).
create or replace function public.mms_fire_line(p_line uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_ful text;
begin
  select ci.cart_id, c.status, ci.state, ci.fulfillment
    into v_cart, v_status, v_state, v_ful
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- already fired/served/voided
  if v_ful <> 'togo' then return 'not_togo'; end if;       -- dinein → batch send; grocery → never
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now() + interval '10 seconds', fire_batch = gen_random_uuid()
    where ci.id = p_line
      and ci.state = 'draft'
      and ci.fulfillment = 'togo'
      and exists (select 1 from public.qr_carts c where c.id = ci.cart_id and c.status = 'open');
  if not found then return 'stale'; end if;   -- raced a settle / another fire between read and write
  return 'ok';
end $$;
revoke all on function public.mms_fire_line(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_line(uuid) to service_role;

-- ── F3: mms_fire_pending_food — fire-at-checkout safety net ("no charge-with-no-fire") ───────────────────
-- At settlement, fire every still-DRAFT FOOD line (dinein + togo, NEVER grocery) of the now-PAID dine-in
-- cart, so the kitchen makes everything the guest paid for. fire_at = now() (immediately due — paid, no
-- undo). Idempotent: a re-run finds no draft food and fires 0. Gated to mode='dinein' so pickup/scango keep
-- their scheduled order-level fire. Called BEST-EFFORT *after* the money RPCs (never inside them) — a fire
-- failure must not roll back a captured payment. Returns the count fired (for logging).
create or replace function public.mms_fire_pending_food(p_cart_id uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer; v_batch uuid := gen_random_uuid();
begin
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now(), fire_batch = v_batch
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'paid'                       -- fire BECAUSE settled (the no-charge-no-fire trigger)
      and s.mode = 'dinein'                        -- pickup/scango keep their scheduled order-level fire
      and ci.state = 'draft'
      and ci.fulfillment in ('dinein','togo');     -- all food; grocery is bagged, never cooked. A comped
                                                    -- line stays included — comped = $0 but still MADE (S2.3).
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_fire_pending_food(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_pending_food(uuid) to service_role;
