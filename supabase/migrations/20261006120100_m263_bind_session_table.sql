-- 20261006120100_m263_bind_session_table.sql — M263 · J41 · J40 (Phase 3c-ii, Codex rounds 3–4 on
-- #314 and the blind pass): the table bind decided ONCE, where the locks are.
--
-- THE HOLE (M263). Both binders — `bindTable` (lib/bind-table.ts, the Send-time sheet) and the
-- claim arm of `/api/session` (J33's unbound half) — read the session cart's freeze in one statement
-- and wrote `table_sessions.table_number` in another. A read is not a guard (20260929000000's
-- header): a pay lock or a split freeze that committed between the two let the number land under a
-- live charge, and the fulfill RPCs snapshot that number onto the order the payer is reading
-- (20260828000000). The bind now happens in ONE call, under the binder's open cart row lock.
--
-- THE MECHANISM. The binder's open cart is taken FOR SHARE (the P2cy idiom, 20260929000000). It
-- conflicts with every freeze writer — the lock acquire and both settle claims are UPDATEs of that
-- row (lib/lock.ts) — and with fulfillment's flip to paid, so each of them either commits first and
-- is SEEN by the freshness reads below, or waits until this call commits. It is compatible with
-- itself, so a bind never queues behind a staff line insert (P2cy's own FOR SHARE); a row-exclusive
-- lock here would have made every bind wait on every add.
--
-- FRESHNESS, stated as `mms_undo_fire` states it (20261005120100): a fresh single-pay lock is
-- `locked and locked_at > now() - 5 minutes` (CART_LOCK_TTL_MS), a fresh split freeze is
-- `settle_at > now() - 10 minutes` (SETTLE_TTL_MS). A NULL stamp is not fresh, and a stale lock
-- does not refuse (W17: never over-block — `locked` is sticky). `now()` is the transaction start,
-- so a bind that waited on a lock acquire errs toward refusing it.
--
-- ACCEPTED (red-team #9). A declined card retried against the same PaymentIntent past five minutes
-- leaves `locked_at` stale while `live_payment_intent_id` still names a live attempt (lib/lock.ts
-- reads that as live). This function reads only the two TTL columns, so such a bind lands and the
-- number can still reach that order's snapshot. That is a table label, not an amount: accepted, as
-- M258 accepted its one-statement residual, and stated here rather than claimed closed.
--
-- J41 — A STICKER SESSION BINDS ONLY TO ITS OWN TABLE. The bind writes `table_number` alone and
-- never rewrites `qr_code` (D21), and the token index is unique on `qr_code` among ACTIVE rows
-- (20260620000500). So an unbound session minted on table T's sticker and bound to N wedged T: a
-- sticker scan at T 23505'd on the token and its re-read by number found nobody (a 500), a claim at
-- T and a staff Start at T failed the same way, while the picker showed T as Open. An unbound row
-- whose code is an ACTIVE registered sticker now binds to that sticker's table only, and is told so
-- (`sticker` names the table). An INACTIVE registration does not refuse: the sticker arm of
-- `/api/session` resolves active stickers only, so such a row was never treated as that table's.
--
-- J40 — AN UNTOUCHED STAFF SHELL YIELDS. A table a server started (lib/register.ts: `host_seat`
-- null, no member, an empty open cart) exists to be claimed by its first diner (route.ts, W6a). A
-- phone that picks that table at Send hands the shell's id in as `p_shell`, and the shell is
-- adopted — its empty cart cancelled, its session closed — in the SAME subtransaction as the CAS,
-- so a CAS that moves no row takes the adopt back with it. Asked only with `p_shell`; never decided
-- here which row is the shell (the app's one predicate, `seatedSessionFor`, found it), only
-- re-checked under locks. Two answers instead of an adopt:
--   · `gone` — the row is no longer what the caller saw: no open cart, not live, not dine-in,
--     claimed by a host, or not at this number. The caller re-reads by number and answers that.
--   · `held` — a live, hostless shell at this number with something on it: a member, an earlier
--     cart, a line (voided included), a pay attempt, a split, a name, a promo or a tab. The order
--     goes to a server, who can fold it in (`mms_merge_table_orders`). `applied_reward_id` needs a
--     member and a subtotal (20260816060000), so an empty memberless cart cannot carry one.
--
-- LOCK ORDER. Both open carts — the binder's (SHARE) and, with `p_shell`, the shell's (row-exclusive)
-- — in cart-id order, the order `mms_merge_table_orders` locks them (20261001000000), so a server
-- merging exactly these two carts at this instant waits instead of deadlocking (red-team #6). Then
-- the shell's session row, row-exclusive: that conflicts with the KEY SHARE a membership insert's
-- foreign key takes and with a host claim's UPDATE, so a join or a claim either commits first and is
-- seen, or waits for this call (the close's own UPDATE would not: NO KEY UPDATE and KEY SHARE are
-- compatible). Then the binder's session row, through the CAS. Fulfillment updates a cart, then
-- reads a session; the sweeper skips locked rows; `clearTable` issues its two writes as separate
-- statements — none of them closes a cycle with this order.
--
-- OUTCOMES (one row): `bound` / `adopted` with the table · `locked` · `settling` · `sticker` with the
-- sticker's table · `gone` · `held` · `unmoved` (the CAS moved no row: bound meanwhile, closed,
-- expired, pickup, or no such session — the caller re-reads its own row). A 23505 (the number is
-- seated) and a 23503 (the registry FK) PROPAGATE, aborting the whole call, adopt included; the
-- caller reads them by code, never by constraint name.
--
-- SECURITY DEFINER with an empty search_path and every name schema-qualified; EXECUTE revoked from
-- public, anon and authenticated and granted to service_role only (both binders run server-side on
-- the service client). Applied ONE FILE AT A TIME via the Supabase MCP before the code that calls
-- it merges, never `db push` (CLAUDE.md: the prod history is divergent). Pinned by
-- supabase/tests/m263_bind_session_table_test.sql, falsified case by case in
-- scripts/verify-mode-authority.mjs (suite `m263`), and its row locks by scripts/verify-bind-race.mjs.

create or replace function public.mms_bind_session_table(
  p_session uuid,
  p_table integer,
  p_shell uuid default null
) returns table (outcome text, at_table integer)
  language plpgsql security definer set search_path = '' as $$
declare
  v_cart record;
  v_locked boolean;
  v_locked_at timestamptz;
  v_settle_at timestamptz;
  v_shell_cart uuid;
  v_qr text;
  v_cur integer;
  v_sticker integer;
  n integer;
begin
  -- 1. the open carts, in id order: the binder's FOR SHARE, the shell's row-exclusive.
  for v_cart in
    select c.id, c.session_id
      from public.qr_carts c
     where c.status = 'open'
       and (c.session_id = p_session or c.session_id = p_shell)
     order by c.id
  loop
    if v_cart.session_id = p_session then
      select c.locked, c.locked_at, c.settle_at into v_locked, v_locked_at, v_settle_at
        from public.qr_carts c
       where c.id = v_cart.id and c.status = 'open'
         for share;   -- M263: a freeze writer's UPDATE or fulfillment's flip waits, or is seen below
    else
      select c.id into v_shell_cart
        from public.qr_carts c
       where c.id = v_cart.id and c.status = 'open'
         for update;   -- J40: a staff line (P2cy's FOR SHARE) or a cart write waits, or is seen below
    end if;
  end loop;

  -- 2. M263 — the freeze, read under that lock.
  if v_locked and v_locked_at is not null and v_locked_at > now() - interval '5 minutes' then   -- M263: a FRESH pay lock refuses
    return query select 'locked'::text, null::integer;
    return;
  end if;
  if v_settle_at is not null and v_settle_at > now() - interval '10 minutes' then   -- M263: a FRESH split freeze refuses
    return query select 'settling'::text, null::integer;
    return;
  end if;

  -- 3. J41 — an unbound row on another table's ACTIVE sticker binds only to that table.
  select s.qr_code, s.table_number into v_qr, v_cur
    from public.table_sessions s
   where s.id = p_session;
  if v_cur is null then   -- J41: a bound row is the CAS's to answer (the caller re-reads where it is)
    select q.table_number into v_sticker
      from public.qr_tables q
     where q.qr_code = v_qr
       and q.active;   -- J41: the sticker arm resolves ACTIVE stickers only
    if v_sticker is not null and v_sticker <> p_table then   -- J41: its own table binds
      return query select 'sticker'::text, v_sticker;
      return;
    end if;
  end if;

  -- 4. J40 — the shell, re-checked under its locks (only when asked).
  if p_shell is not null then
    perform 1 from public.table_sessions s
     where s.id = p_shell
       for update;   -- J40: a membership insert (its FK's KEY SHARE) or a host claim waits, or is seen below
    if v_shell_cart is null   -- J40: the shell's open cart
       or not exists (select 1 from public.table_sessions s
                       where s.id = p_shell
                         and s.status = 'active'   -- J40: a live row
                         and s.mode = 'dinein'   -- J40: never a pickup or counter order
                         and s.host_seat is null   -- J40: no diner has claimed it
                         and s.table_number = p_table)   -- J40: the row that holds THIS number
    then
      return query select 'gone'::text, null::integer;
      return;
    end if;
    if exists (select 1 from public.session_members m where m.session_id = p_shell)   -- J40: nobody joined it
       or exists (select 1 from public.qr_carts c where c.session_id = p_shell and c.id <> v_shell_cart)   -- J40: no earlier order
       or exists (select 1 from public.qr_cart_items ci where ci.cart_id = v_shell_cart)   -- J40: no line, voided included
       or exists (select 1 from public.qr_carts c
                   where c.id = v_shell_cart
                     and (c.locked   -- J40: no pay attempt
                          or c.settle_at is not null   -- J40: no split
                          or c.customer_name is not null   -- J40: no name staff typed
                          or c.promo_code is not null   -- J40: no promo
                          or c.tab_type <> 'none'))   -- J40: no tab
    then
      return query select 'held'::text, null::integer;
      return;
    end if;
  end if;

  -- 5. D21 · J40 — the adopt (only when asked) and the CAS land together or not at all.
  begin
    if p_shell is not null then
      update public.qr_carts c set status = 'cancelled' where c.id = v_shell_cart;   -- J40: the empty cart
      update public.table_sessions s set status = 'closed' where s.id = p_shell;   -- J40: the shell yields
    end if;
    update public.table_sessions s
       set table_number = p_table
     where s.id = p_session
       and s.table_number is null
       and s.status = 'active'
       and s.mode = 'dinein'
       and s.expires_at > now();
    get diagnostics n = row_count;
    if n = 0 then   -- D21: a blocked CAS is never a landing, and it takes the adopt back with it
      raise exception using errcode = 'MMSB0', message = 'mms_bind_session_table: the CAS moved no row';
    end if;
  exception when sqlstate 'MMSB0' then
    return query select 'unmoved'::text, null::integer;
    return;
  end;
  return query select (case when p_shell is null then 'bound' else 'adopted' end)::text, p_table;
end $$;
revoke all on function public.mms_bind_session_table(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.mms_bind_session_table(uuid, integer, uuid) to service_role;
