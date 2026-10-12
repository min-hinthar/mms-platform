-- 20261009120100_m269_approve_cart_lock.sql — M269: an approve takes the cart lock before the line,
-- so it can never record an approved void on a dish a settle door is charging.
--
-- ⚠️ PROD: applied ONE FILE AT A TIME through the Supabase MCP `apply_migration`, AFTER
-- 20261008120000_m184_approval_refuses_when_changed.sql (this file restates M184's function). Verify
-- after: ONE definition of `public.mms_resolve_approval(uuid, uuid, text)`, `has_function_privilege(
-- 'service_role', …)` true and anon / authenticated false, and `prosrc` carrying the `for share` line.
--
-- THE DEFECT (M269, OPEN-ITEMS; the last blind pass on #333). The approve arm locked the LINE only and
-- read the cart's `status` / `locked` / `settle_at` through its statement snapshot. A settle door's
-- freeze (`acquireSettlement`) and `mms_fulfill_cash_order` UPDATE the cart row, and the fulfillment
-- derives the subtotal and copies the lines without a line lock. So an approve whose read preceded an
-- uncommitted freeze passed its 'in_flight' check, and if the door's totals read and fulfillment ran
-- before the approve committed, the order charged the dish AND the line ended 'voided' with an
-- 'approved' loss row: one dish both charged and written off. The shape predates M184 (S2's B2 check);
-- M184 restated it unchanged.
--
-- THE FIX. M184's function verbatim, plus ONE lock: an approve resolves the line's cart (unlocked) and
-- takes it FOR SHARE before the request's row and the line, as `mms_void_line` and
-- `mms_request_approval` already do. The freshness checks then read the cart in a later statement,
-- after the lock, so a freeze or a fulfillment either committed first (the approve reads it and refuses
-- 'in_flight' or 'not_open') or waits for the approve (and its totals read sees the void). Deny and
-- close write no line, so they keep their locks. No new answer: the TS mapping is unchanged.
--
-- LOCK ORDER — cart, then the request, then the line. `mms_clear_counter_cart` (cart FOR UPDATE, its
-- pending requests, its lines) and `mms_merge_table_orders` (both carts FOR UPDATE by id, the source's
-- requests, its lines) take the same order, so neither can hold what this approve needs while waiting
-- on what it holds. `mms_fulfill_cash_order` locks only the cart (its UPDATE), and the freeze is one
-- UPDATE of the cart. A line the merge moved has had its request superseded under the merge's locks,
-- so the request's own status check answers 'already_resolved' whichever cart was read first.
--
-- Pinned by supabase/tests/m269_approve_cart_lock_test.sql (named in ci.yml), the two-session orders
-- (k) and (k2) in scripts/verify-counter-fire-race.mjs (`m269/*` mutants: the lock dropped, and the
-- cart read before it), and scripts/verify-mode-authority.mjs (suite `m269`, which also re-points M184's
-- `mms_resolve_approval` mutants here, its last definition). Idempotent: `create or replace` + restated
-- grants; the signature is unchanged (no generated-types drift).

create or replace function public.mms_resolve_approval(
  p_id uuid,
  p_approver uuid,
  p_decision text
) returns text language plpgsql set search_path = '' as $$
declare
  v_kind text; v_status text; v_line uuid; v_initiator uuid;
  v_req_qty integer; v_req_amount integer;
  v_approver_role text; v_approver_active boolean;
  v_line_state text; v_line_comped boolean; v_cart_status text;
  v_qty integer; v_price integer; v_amount integer;
  v_locked boolean; v_locked_at timestamptz; v_settle_at timestamptz;
  v_changed boolean;
  v_lock_cart uuid;  -- M269: the line's cart, locked FOR SHARE before the request and the line
begin
  if p_decision not in ('approve','deny','close') then raise exception 'illegal decision %', p_decision; end if;

  -- M269: an APPROVE writes the void or comp, so it takes the line's cart FOR SHARE FIRST — cart, then
  -- the request, then the line: the order the Clear and the merge take. A settle door's freeze and a
  -- cash fulfillment both UPDATE the cart row, so each now either waits for this approve (and then
  -- reads its void) or holds the cart first (and this approve, reading the cart only after its lock,
  -- refuses 'not_open' or 'in_flight'). A missing request or line locks nothing and answers below.
  if p_decision = 'approve' then
    select ci.cart_id into v_lock_cart
      from public.mms_approvals a join public.qr_cart_items ci on ci.id = a.line_id
      where a.id = p_id;
    perform 1 from public.qr_carts where id = v_lock_cart for share;
  end if;

  select kind, status, line_id, initiator_staff_id, qty, amount_cents
    into v_kind, v_status, v_line, v_initiator, v_req_qty, v_req_amount
    from public.mms_approvals where id = p_id for update;
  if v_kind is null then return 'not_found'; end if;
  if v_status <> 'pending' then return 'already_resolved'; end if;

  -- D2: the request's own asker may CLOSE it (nothing about food is decided); approve and deny keep
  -- the self rule — nobody approves or refuses their own request.
  if p_decision <> 'close' and p_approver = v_initiator then return 'self_approve'; end if;
  select role, active into v_approver_role, v_approver_active
    from public.staff where user_id = p_approver;
  if not coalesce(v_approver_active, false) or v_approver_role not in ('manager','owner') then
    return 'bad_approver';
  end if;

  if p_decision = 'deny' then
    update public.mms_approvals
      set status = 'denied', approver_staff_id = p_approver, resolved_at = now()
      where id = p_id;
    return 'ok';
  end if;

  if p_decision = 'close' then
    -- M184 · D2: admitted only once the cart has left 'open' (paid, or cancelled by a clear) OR the
    -- line is no longer the one asked about (gone, or its qty / amount moved) — never on a live,
    -- unchanged request, which still has a real decision to make. No lock: the line is untouched.
    select ci.state, ci.comped, c.status, ci.qty, ci.unit_price_cents
      into v_line_state, v_line_comped, v_cart_status, v_qty, v_price
      from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
      where ci.id = v_line;
    v_changed := v_line_state is null
      or v_line_state = 'voided' or coalesce(v_line_comped, false)
      or v_qty is distinct from v_req_qty
      or (v_price * v_qty) is distinct from v_req_amount;
    if coalesce(v_cart_status, 'gone') = 'open' and not v_changed then return 'still_open'; end if;
    update public.mms_approvals
      set status = 'superseded', approver_staff_id = p_approver, resolved_at = now()
      where id = p_id;
    return 'ok';
  end if;

  -- APPROVE: lock the line + cart; re-check actionable, NOT mid-payment, and that the line is STILL
  -- the one the manager read (M184) before applying anything.
  select ci.state, ci.comped, c.status, ci.qty, ci.unit_price_cents, c.locked, c.locked_at, c.settle_at
    into v_line_state, v_line_comped, v_cart_status, v_qty, v_price, v_locked, v_locked_at, v_settle_at
    from public.qr_cart_items ci join public.qr_carts c on c.id = ci.cart_id
    where ci.id = v_line for update of ci;
  if v_line_state is null then return 'stale'; end if;
  if v_cart_status <> 'open' then return 'not_open'; end if;
  if (v_locked and v_locked_at > now() - interval '5 minutes')
     or (v_settle_at is not null and v_settle_at > now() - interval '10 minutes') then
    return 'in_flight';                            -- B2: don't drop a line from a capturing PI's base
  end if;
  -- M184: a line already removed or made free since the ask (its loss is already recorded) is not
  -- the line asked about; nothing is applied, the request closes instead.
  if v_line_state = 'voided' or v_line_comped then
    return 'changed';
  end if;
  -- M184: the qty AND the amount, against the request's snapshot. A match leaves `v_amount` equal to
  -- the snapshot by construction; the S1 re-derive below stays so the audit row is the line's own.
  if v_qty is distinct from v_req_qty or (v_price * v_qty) is distinct from v_req_amount then
    return 'changed';
  end if;
  v_amount := v_price * v_qty;

  if v_kind = 'void' then
    if v_line_state <> 'voided' then
      update public.qr_cart_items set state = 'voided' where id = v_line;
    end if;
  elsif v_kind = 'comp' then
    if not v_line_comped then
      update public.qr_cart_items set comped = true where id = v_line;
    end if;
  end if;

  update public.mms_approvals
    set status = 'approved', approver_staff_id = p_approver, resolved_at = now(),
        amount_cents = v_amount                    -- S1: honest loss, re-derived at resolve
    where id = p_id;
  return 'ok';
end $$;
revoke all on function public.mms_resolve_approval(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mms_resolve_approval(uuid, uuid, text) to service_role;
