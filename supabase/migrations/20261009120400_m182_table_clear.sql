-- 20261009120400_m182_table_clear.sql — M182 · P2hf · M198 (the clear half) · PD7: the table-clear RPC.
--
-- ⚠️ PROD: one of the four files ruling #5 approved (OWNER_RULINGS_2026-10-07 #5). Applied ONE FILE AT
-- A TIME through the Supabase MCP `apply_migration`, at a quiet time the OWNER names, never `db push`
-- (M125). Verify after: ONE definition each of `public.mms_clear_table(uuid, uuid, timestamptz,
-- uuid[], integer, uuid)` and `public.mms_ack_table_clear_stop(uuid, uuid)`; for both,
-- `has_function_privilege('service_role', …, 'execute')` true and anon / authenticated false; the
-- table `public.qr_table_clears` with RLS on, no anon / authenticated privilege, and its
-- `session_id` foreign key NO ACTION (`pg_constraint.confdeltype = 'a'`, never a cascade); the column
-- `mms_loss_config.clear_requires_pin` (default false). Deploy order: migration first, app second —
-- until the app calls `mms_clear_table`, nothing calls it, and the old app's plain cancel keeps working.
--
-- THE DEFECT (M182, #275's six-lens audit; P2hf). `clearTable` (apps/qr/lib/floor.ts) cancelled a
-- dine-in cart and closed its session in two plain writes. Sent and cooking lines went with it: no
-- guard against fired food, no loss row, no record of who cleared it, and the KDS ticket vanished on
-- the next poll (the kitchen read selects only open / paid carts) before the cook saw why. Every such
-- clear also left its fired lines `fired` forever (M198's leak).
--
-- THE RULE (owner ruling #6, "one loss rule"): Clearing a table NEVER WAITS. It frees the table, stops
-- the kitchen, and records every SENT dish on the owner's loss list as NOT APPROVED — `void` /
-- `table_cleared`, `gate_reason` `unapproved` — unless a manager approved that clear. An explicit,
-- recorded exception to S2 decision 1, behind ONE SQL seam that can switch a PIN on
-- (`mms_loss_config.clear_requires_pin`, default false). No new `mms_approvals` kind.
--
-- ## SENT — the no-show's predicate exactly
-- state in ('fired','in_progress','served') ∧ fulfillment <> 'grocery' ∧ not comped ∧ (fire_at is null
-- or fire_at <= now()) — `mms_counter_no_show`'s (20261001000000), so a counter no-show and a table
-- clear write off the same food. The TypeScript twin is `clearSentLine` (apps/qr/lib/clear-table.ts),
-- which builds the preview the staff member SEES; this function derives its own under the locks and
-- refuses 'changed' — writing nothing — when the set or its value differs (below). The loss per row
-- is `unit_price_cents * qty`, the ledger's own (`mms_approvals.amount_cents`, voids_comps.sql:52):
-- the menu price, pre-tax, never the bill.
--
-- ## The snapshot the staff member saw (`p_seen_at`, `p_expected_line_ids`, `p_loss_cents`)
-- The clear is a deferred write (a 6 s Undo in the app), so the table can move between the look and
-- the write. Refusals, each BEFORE any write:
--   'joined'  — someone joined the table after the look (`session_members.created_at > p_seen_at`):
--               a next party who scanned the sticker is never closed out;
--   'changed' — a line was added after the look, or the SENT set is not the one shown (as SETS; a
--               NULL or a NULL element never matches), or its value is not `p_loss_cents` — or the
--               look is from the FUTURE (`p_seen_at > now()`).
-- `p_seen_at` is meant to be the DATABASE clock at the look (`mms_now`), but the REQUEST carries it,
-- and this function bounds it from ABOVE only: a value later than this transaction's own clock is
-- refused (a post-dated look would pass every join and every added dish — the blind pass on #341).
-- Nothing here proves the value came from a real look: any instant at or before this transaction's
-- start is accepted, and a join or a dish older than it passes. That is what a REAL look taken at
-- that instant would pass too, and any staff member may take one, so the bound grants no clear a
-- fresh look could not; it only removes the future. A look further in the past makes 'joined' and
-- 'changed' STRICTER, never looser.
--
-- ## Money that may still be moving
--   'in_flight' — `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze;
--   'card_live' — `qr_carts.live_payment_intent_id` (M151) names a card attempt that may still
--                 capture: cancelling its cart would strand a charge with no order (M163).
--   'in_flight' — also a split share holding money (`qr_cart_shares` authorized or captured, with a
--                 PaymentIntent — `paymentInFlightReason`'s own predicate, lib/pay-guard.ts), re-read
--                 HERE under the cart lock: the caller's read runs before this transaction, so a share
--                 authorized in between would otherwise see its cart cancelled (the blind pass on #341).
--                 A share write takes no cart lock, so this narrows that window to this transaction;
--                 it cannot close it — the caller's read stays, and a capture on a cancelled cart is
--                 the refunds-needed ledger's (M163).
--
-- ## A secured tab (card on file) — 'secure_tab'
-- A `tab_type = 'secure'` cart with SENT food is refused without a verified manager (`p_approver`):
-- its food can still be charged to the saved card (`closeSecureTab`, lib/staff-cart.ts), and a
-- cancelled cart takes that door away for good — the card-on-file sidecar cannot follow a cancelled
-- cart, which is why the merge refuses a secure tab outright (floor.ts, S3.2). Nothing sent, nothing
-- to charge: a free clear of a secure tab proceeds. With a manager named, the write-off is that
-- manager's, recorded as such (the gate below) — the seam a declined card after a walkout needs
-- (M270); the app sends no approver today, so in the app the pane says to close it on the card.
--
-- ## Lock order: cart → session → approvals → lines (the code below, in that order). The open cart
-- FOR UPDATE first (one open cart per session, `qr_carts_one_open_per_session`); then the session FOR
-- UPDATE (the fire takes cart → session FOR SHARE, the same direction; the sweeper takes sessions
-- SKIP LOCKED and no cart); then the cart's PENDING approvals FOR UPDATE, in id order; then its
-- LINES FOR UPDATE, in id order (the kitchen's `mms_line_transition` / `mms_bump_ticket` lock only
-- the line). A manager resolving a request meanwhile waits and then reads 'superseded': an approve
-- takes the line's cart FOR SHARE first (M269, 20261009120100 — cart → request → line), so it waits
-- on this function's cart lock; a deny or a close takes request → line and waits at the approvals.
-- The no-show, the counter clear and the merge take cart → approvals → lines and no session; this is
-- their order with the session taken right after the cart. A table with no open cart (paid, or
-- seated with nothing) locks the session alone. No two-session harness drives this order yet
-- (M270 (5)): it is reasoned from the statements, not measured.
--
-- ## What a clear writes (only after every refusal above)
--   1. the cart's pending approval requests → 'superseded' (D2: m8 reads them "Table was cleared
--      first"); the status 20260622080000 declared, the merge's, the no-show's and M184's `close`;
--   2. one `mms_approvals` row per SENT line: kind 'void', status 'approved', reason 'table_cleared',
--      `amount_cents` = unit × qty, `cooked` = started or served, `gate_reason` 'unapproved' — or,
--      with a verified manager (`p_approver`), the gate the loss would have met ('cooked' · 'ceiling' ·
--      'solo', the no-show's), the approver recorded;
--   3. the KITCHEN's lines — fired past their grace and in progress, comped ones too (a comp is still
--      being cooked) — and the SENT lines → 'voided' (M198's clear half: nothing stays `fired`
--      forever); fired lines still inside their grace never reached the KDS and return to draft (the
--      undo's own edge, as the no-show does);
--   4. the cart → 'cancelled'; the session → 'closed';
--   5. ONE `qr_table_clears` row: who cleared it (and who approved), when, the dishes and the loss, and
--      the DURABLE STOP RECORD (Codex correction 12): `stop_line_ids`, the kitchen's lines this clear
--      voided. The kitchen read selects open / paid carts only, so without it a cleared ticket
--      vanished before the cook saw it; kitchen-ops' "Left — stop cooking" card reads the rows whose
--      `stop_acknowledged_at` is null, and "Got it" writes it through `mms_ack_table_clear_stop`.
-- Returns jsonb `{status, dishes, loss_cents, clear_id}` — `dishes` the SENT units (Σ qty) the app
-- says back with the RPC's OWN count ("Table 4 cleared — 3 dishes on the loss list").
-- Statuses: 'ok' | 'not_found' | 'closed' | 'counter' | 'in_flight' | 'card_live' | 'joined' |
-- 'changed' | 'secure_tab' | 'needs_approval' | 'self_approve' | 'bad_approver'.
--
-- A COUNTER order (`mode = 'pickup' and qr_code like 'reg-%'`) is refused ('counter'): its exits are
-- its own — `mms_clear_counter_cart` (nothing sent) and `mms_counter_no_show` (sent food).
--
-- Pinned by supabase/tests/m182_table_clear_test.sql (named in ci.yml). Idempotent: `if not exists`
-- on the column, the table and the index, `create or replace` on the functions, grants restated.

-- ── 0. the ONE seam that can switch a PIN on (ruling #6) ─────────────────────────────────────────
alter table public.mms_loss_config
  add column if not exists clear_requires_pin boolean not null default false;
comment on column public.mms_loss_config.clear_requires_pin is
  'M182 · ruling #6 — false (the default): a table clear never waits; every sent dish is recorded as '
  'not approved unless a manager approved that clear. true: a clear with sent food needs a manager.';

-- ── 1. the clear record: the audit row, and the durable stop record ─────────────────────────────
create table if not exists public.qr_table_clears (
  id                   uuid primary key default gen_random_uuid(),
  -- NO cascade (the blind pass on #341): a durable audit row never leaves with its session — the same
  -- NO ACTION `qr_orders.session_id` carries. No code path deletes a session; a hand-run delete of a
  -- cleared one is refused rather than taking its clear record with it.
  session_id           uuid not null references public.table_sessions(id),
  cart_id              uuid references public.qr_carts(id) on delete set null,
  cleared_by           uuid not null,
  approver_staff_id    uuid,
  dishes               integer not null default 0 check (dishes >= 0),
  loss_cents           integer not null default 0 check (loss_cents >= 0),
  stop_line_ids        uuid[] not null default '{}',
  stop_acknowledged_at timestamptz,
  stop_acknowledged_by uuid,
  created_at           timestamptz not null default now(),
  -- A loss and its dishes are one fact: no dishes, no loss; dishes, a figure (a $0 dish is refused
  -- nowhere else, so >= 0 — the figure is the menu's).
  constraint qr_table_clears_loss_needs_dishes check (dishes > 0 or loss_cents = 0),
  -- Only a clear that stopped something can be acknowledged, and only by someone.
  constraint qr_table_clears_ack_needs_stop
    check (stop_acknowledged_at is null
           or (cardinality(stop_line_ids) > 0 and stop_acknowledged_by is not null))
);
comment on table public.qr_table_clears is
  'M182 — one row per table clear (mms_clear_table): who cleared it, the dishes and the loss, and the '
  'durable stop record the kitchen shows until "Got it" (Codex correction 12). Service role only.';
-- The kitchen's read: the stops still to acknowledge, newest last.
create index if not exists qr_table_clears_stop_open
  on public.qr_table_clears (created_at)
  where stop_acknowledged_at is null and cardinality(stop_line_ids) > 0;
create index if not exists qr_table_clears_session on public.qr_table_clears (session_id);
alter table public.qr_table_clears enable row level security;
-- No policy: diners never read it. Staff read it through service-role server code only.
revoke all on table public.qr_table_clears from public, anon, authenticated;
grant select, insert, update on table public.qr_table_clears to service_role;

-- ── 2. the clear ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.mms_clear_table(
  p_session uuid,
  p_initiator uuid,
  p_seen_at timestamptz,
  p_expected_line_ids uuid[],
  p_loss_cents integer,
  p_approver uuid default null
) returns jsonb
  language plpgsql set search_path = '' as $$
declare
  v_cart uuid; v_cart_locked boolean; v_cart_locked_at timestamptz; v_cart_settle_at timestamptz;
  v_live_pi text; v_tab text;
  v_found boolean; v_sess_status text; v_sess_mode text; v_sess_code text;
  v_sent uuid[]; v_stop uuid[]; v_loss integer := 0; v_units integer := 0; v_cooked boolean := false;
  v_max_loss integer; v_gate text; v_requires_pin boolean;
  v_role text; v_active boolean; v_clear uuid;
begin
  if p_session is null or p_initiator is null or p_seen_at is null or p_loss_cents is null then
    raise exception 'mms_clear_table: session, initiator, seen_at and loss_cents are required';
  end if;
  -- A look from the future never happened (the header): refused before any lock is taken.
  if p_seen_at > now() then return jsonb_build_object('status', 'changed'); end if;

  -- The open cart FIRST (the header's lock order). FOR UPDATE re-checks `status = 'open'` against the
  -- newest version, so a settle that won the race leaves no row here.
  select c.id, c.locked, c.locked_at, c.settle_at, c.live_payment_intent_id, c.tab_type
    into v_cart, v_cart_locked, v_cart_locked_at, v_cart_settle_at, v_live_pi, v_tab
    from public.qr_carts c
    where c.session_id = p_session and c.status = 'open'
    for update;

  -- Then the session.
  select true, s.status, s.mode, s.qr_code
    into v_found, v_sess_status, v_sess_mode, v_sess_code
    from public.table_sessions s where s.id = p_session
    for update;
  if v_found is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_sess_status = 'closed' then return jsonb_build_object('status', 'closed'); end if;
  if v_sess_mode = 'pickup' and v_sess_code like 'reg-%' then
    return jsonb_build_object('status', 'counter');
  end if;

  if v_cart is not null then
    -- `mms_void_line`'s two literals: a fresh pay lock, or a fresh settle freeze.
    if (v_cart_locked and v_cart_locked_at > now() - interval '5 minutes')
       or (v_cart_settle_at is not null and v_cart_settle_at > now() - interval '10 minutes') then
      return jsonb_build_object('status', 'in_flight');
    end if;
    if v_live_pi is not null then return jsonb_build_object('status', 'card_live'); end if;
    -- A split share holding money, re-read under the cart lock (the header).
    if exists (select 1 from public.qr_cart_shares sh
                where sh.cart_id = v_cart and sh.status in ('authorized', 'captured')
                  and sh.stripe_payment_intent_id is not null) then
      return jsonb_build_object('status', 'in_flight');
    end if;
  end if;

  -- Someone joined after the look: never close out a party that just sat down.
  if exists (select 1 from public.session_members m
              where m.session_id = p_session and m.created_at > p_seen_at) then
    return jsonb_build_object('status', 'joined');
  end if;

  if v_cart is not null then
    -- Approvals before lines (`mms_resolve_approval` takes approval → line).
    perform 1 from public.mms_approvals a
      where a.cart_id = v_cart and a.status = 'pending' order by a.id for update;
    perform 1 from public.qr_cart_items ci where ci.cart_id = v_cart order by ci.id for update;

    -- A dish added after the look is a change, sent or not.
    if exists (select 1 from public.qr_cart_items ci
                where ci.cart_id = v_cart and ci.created_at > p_seen_at) then
      return jsonb_build_object('status', 'changed');
    end if;

    select array_agg(ci.id order by ci.id) into v_sent
      from public.qr_cart_items ci
      where ci.cart_id = v_cart
        and ci.state in ('fired', 'in_progress', 'served')
        and ci.fulfillment <> 'grocery'
        and not ci.comped
        and (ci.fire_at is null or ci.fire_at <= now());
    -- The kitchen's lines: what the KDS shows now (fired past its grace, started), comped included.
    select array_agg(ci.id order by ci.id) into v_stop
      from public.qr_cart_items ci
      where ci.cart_id = v_cart
        and ci.state in ('fired', 'in_progress')
        and ci.fulfillment <> 'grocery'
        and (ci.fire_at is null or ci.fire_at <= now());
  end if;

  -- The set the staff member saw, as SETS (order and duplicates ignored; a NULL element never
  -- matches). No open cart means nothing is SENT, so a look that showed dishes is a change too.
  if (select array_agg(distinct e order by e) from unnest(p_expected_line_ids) e)
       is distinct from v_sent then
    return jsonb_build_object('status', 'changed');
  end if;
  if v_sent is not null then
    select coalesce(sum(ci.unit_price_cents * ci.qty), 0), coalesce(sum(ci.qty), 0),
           coalesce(bool_or(ci.state in ('in_progress', 'served')), false)
      into v_loss, v_units, v_cooked
      from public.qr_cart_items ci where ci.id = any(v_sent);
  end if;
  if v_loss is distinct from p_loss_cents then return jsonb_build_object('status', 'changed'); end if;

  -- THE SEAM (ruling #6): off by default — a clear with sent food never waits for a manager.
  if v_sent is not null then
    select l.max_loss_cents, l.clear_requires_pin into v_max_loss, v_requires_pin
      from public.mms_loss_config l where l.id;
    v_max_loss := coalesce(v_max_loss, 2000);
    -- A secured tab's sent food can still go on its card: never written off without a manager.
    if v_tab = 'secure' and p_approver is null then
      return jsonb_build_object('status', 'secure_tab');
    end if;
    if coalesce(v_requires_pin, false) and p_approver is null then
      return jsonb_build_object('status', 'needs_approval');
    end if;
    if p_approver is not null then
      if p_approver = p_initiator then return jsonb_build_object('status', 'self_approve'); end if;
      select st.role, st.active into v_role, v_active from public.staff st where st.user_id = p_approver;
      if not coalesce(v_active, false) or v_role not in ('manager', 'owner') then
        return jsonb_build_object('status', 'bad_approver');
      end if;
      v_gate := case when v_cooked then 'cooked' when v_loss > v_max_loss then 'ceiling' else 'solo' end;
    else
      v_gate := 'unapproved';
    end if;
  end if;

  -- ── writes (nothing above this line wrote) ──
  if v_cart is not null then
    update public.mms_approvals a set status = 'superseded', resolved_at = now()
      where a.cart_id = v_cart and a.status = 'pending';
    if v_sent is not null then
      insert into public.mms_approvals
        (kind, status, cart_id, session_id, line_id, line_name, qty, amount_cents,
         reason_code, cooked, initiator_staff_id, approver_staff_id, gate_reason)
        select 'void', 'approved', v_cart, p_session, ci.id, ci.name, ci.qty,
               ci.unit_price_cents * ci.qty, 'table_cleared', ci.state in ('in_progress', 'served'),
               p_initiator, case when v_gate = 'unapproved' then null else p_approver end, v_gate
          from public.qr_cart_items ci where ci.id = any(v_sent)
          order by ci.id;
    end if;
    update public.qr_cart_items ci set state = 'voided'
      where ci.cart_id = v_cart
        and (ci.id = any(coalesce(v_sent, '{}'::uuid[])) or ci.id = any(coalesce(v_stop, '{}'::uuid[])));
    update public.qr_cart_items ci set state = 'draft', fire_at = null, fire_batch = null
      where ci.cart_id = v_cart and ci.state = 'fired' and ci.fire_at > now();
    update public.qr_carts c set status = 'cancelled' where c.id = v_cart and c.status = 'open';
  end if;
  update public.table_sessions s set status = 'closed' where s.id = p_session and s.status <> 'closed';
  insert into public.qr_table_clears
    (session_id, cart_id, cleared_by, approver_staff_id, dishes, loss_cents, stop_line_ids)
    values (p_session, v_cart, p_initiator,
            case when v_gate is null or v_gate = 'unapproved' then null else p_approver end,
            v_units, v_loss, coalesce(v_stop, '{}'::uuid[]))
    returning id into v_clear;
  return jsonb_build_object('status', 'ok', 'dishes', v_units, 'loss_cents', v_loss,
                            'clear_id', v_clear);
end $$;
comment on function public.mms_clear_table(uuid, uuid, timestamptz, uuid[], integer, uuid) is
  'M182 · ruling #6 — clear a table: refuses a counter order, money in flight, a live card attempt, '
  'a join or a change after the look, a secured tab''s sent food without a manager; else supersedes pending requests, records every sent dish as a '
  'table_cleared void (unapproved unless a manager approved), voids the kitchen''s lines, cancels '
  'the cart, closes the session and writes the qr_table_clears row (the durable stop record).';
revoke all on function public.mms_clear_table(uuid, uuid, timestamptz, uuid[], integer, uuid)
  from public, anon, authenticated;
grant execute on function public.mms_clear_table(uuid, uuid, timestamptz, uuid[], integer, uuid)
  to service_role;

-- ── 3. "Got it" — the kitchen acknowledges a stop (kitchen-ops' card writes it) ─────────────────
-- 'ok' | 'not_found' | 'nothing_to_stop' (the clear voided no kitchen line) | 'already'. One guarded
-- UPDATE decides: a second "Got it" (another tablet, a double tap) is 'already', never a second write.
create or replace function public.mms_ack_table_clear_stop(p_clear uuid, p_by uuid)
  returns text
  language plpgsql set search_path = '' as $$
declare v_stops integer; v_acked timestamptz;
begin
  if p_by is null then raise exception 'mms_ack_table_clear_stop: who acknowledged is required'; end if;
  update public.qr_table_clears t
     set stop_acknowledged_at = now(), stop_acknowledged_by = p_by
   where t.id = p_clear and t.stop_acknowledged_at is null and cardinality(t.stop_line_ids) > 0;
  if found then return 'ok'; end if;
  select cardinality(t.stop_line_ids), t.stop_acknowledged_at into v_stops, v_acked
    from public.qr_table_clears t where t.id = p_clear;
  if v_stops is null then return 'not_found'; end if;
  if v_stops = 0 then return 'nothing_to_stop'; end if;
  return 'already';
end $$;
revoke all on function public.mms_ack_table_clear_stop(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_ack_table_clear_stop(uuid, uuid) to service_role;
