-- supabase/tests/m109_merge_matches_mode_test.sql  (M109)
--
-- `mms_merge_table_orders` had no SQL session-mode check at all — its body never mentioned `mode`.
-- The rule that a pickup table cannot be merged into a dine-in one lived only at `floor.ts:666-667`
-- ("Only tables of the same kind can be merged."), a CLIENT-SIDE check in front of a service_role
-- RPC. M100's exact defect shape, one function over.
--
-- ── What the merge actually did across a mode boundary ──────────────────────────────────────────
-- M97's fold predicate already refuses to fold two lines whose `fulfillment` differs, so a `togo`
-- line from a pickup table could not silently join a `dinein` line's qty. That is the whole of what
-- M97 bought here, and it is not much: a refused fold RE-PARENTS instead (`if not v_folded then …`),
-- so the line lands on the target cart as its own row anyway — and the merge tail then CANCELS the
-- source cart and CLOSES the source session. A pickup guest's session is gone and their food is on
-- somebody else's table.
--
-- ── ⚠️ THE CONFOUND THIS FILE EXISTS TO BREAK, and which its first version did not ──────────────
-- A session's `mode` and its lines' `fulfillment` tags travel together in ordinary data: a pickup
-- session's lines are `togo`, a scan-and-go session's are `grocery`, a dine-in session's are
-- `dinein`. So a fixture set built only from ordinary tables leaves the two PERFECTLY CORRELATED,
-- and a suite over it cannot tell a gate that reads `table_sessions.mode` from one that reads
-- `qr_cart_items.fulfillment`.
--
-- That is not hypothetical. The first version of this file had five cases and was MEASURED green
-- against a gate that never read `mode` at all:
--
--     if exists (select 1 from public.qr_cart_items a, public.qr_cart_items b
--                  where a.cart_id = p_source_cart and b.cart_id = p_target_cart
--                    and a.fulfillment <> b.fulfillment) then raise exception '… same kind …';
--
-- — i.e. the exact defect M109 closes, reintroduced with the whole suite still passing. Found by the
-- blind adversarial pass and then reproduced directly.
--
-- Cases 4 and 5 are the fix, and they are only possible because the correlation is not a law: a
-- SEATED diner can tap "To go", which is what `mms_set_line_fulfillment` is for, so a `dinein`
-- session legitimately holds a `togo` line. Case 4 holds the modes EQUAL while the tags DIFFER (a
-- tag-reading gate refuses; a mode-reading gate must let it through). Case 5 holds the modes
-- DIFFERENT while the tags MATCH (a tag-reading gate allows; a mode-reading gate must refuse).
-- Neither direction alone is enough — a gate could read `mode` in one and tags in the other.
--
-- ── Why the raising cases cannot be green-for-the-wrong-reason ──────────────────────────────────
-- A `raise` proves only that SOME gate fired — `merge requires two different carts`, the open/active
-- gate and the secured-tab gate all raise too. Every raising case therefore asserts on the MESSAGE.
--
-- ── Why three refusal cases and not one ─────────────────────────────────────────────────────────
-- The obvious mis-write is `dinein`-flavoured, because the neighbouring gate that DOES exist
-- (M100's, in `mms_set_line_fulfillment`) is spelled `if p_fulfillment = 'dinein' and v_mode <>
-- 'dinein'`. Copy that shape one function over and you get something like `(src = 'dinein') <> (tgt
-- = 'dinein')`, which refuses cases 1 and 2 and happily merges a scan-and-go table into a pickup one.
-- Case 3 is the only case that kills it — and case 7 is the only one that kills the opposite
-- over-tightening (`both must be dinein`), which cases 1-6 all pass.
--
-- ── ⚠️ What the post-refusal assertions do NOT prove ────────────────────────────────────────────
-- Each refusal case re-checks that the source cart, its line and its session are untouched. Read
-- that for exactly what it is: a FIXTURE-DRIFT check, not an ordering proof. A plpgsql
-- `begin … exception` block is an implicit savepoint, so catching the raise rolls back every write
-- the function made — which means these assertions hold whether the gate sits before the destructive
-- tail or after it. Measured: relocating the gate to below `update table_sessions set status =
-- 'closed'` leaves this whole file green. An earlier version of this comment claimed they proved
-- "the gate must fire BEFORE the destructive tail"; they cannot, and nothing single-session can.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m109_merge_matches_mode_test.sql

begin;
-- W8: without this GUC every ASSERT below compiles out and the file exits 0 having proved nothing.
set local plpgsql.check_asserts = on;

do $$
declare
  ana  uuid := '00000000-0000-0000-0000-000000109a0a';
  dish text := 'cccccccc-0000-4000-8000-000000000109';
  cat  text := 'cold_food';   -- so a dine-in / to-go difference is real tax, not decoration
  price integer := 1600;
  t_in integer; t_out integer;   -- asked of the engine, never transcribed
  src_sess uuid; tgt_sess uuid; src_cart uuid; tgt_cart uuid;
  n integer; msg text; raised boolean;
begin
  t_in  := public.mms_line_tax(price, cat, true);
  t_out := public.mms_line_tax(price, cat, false);

  -- ══ 1. pickup source → dine-in target: REFUSED ════════════════════════════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S1', 'pickup', 'active', ana), (tgt_sess, 'M109T1', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_in,  null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo');

  -- PRE-CONDITION: the two gates that raise BEFORE this one must not be the reason we raise.
  assert src_cart <> tgt_cart, 'M109.1 fixture drift: the same-cart gate would fire first';
  select count(*) into n from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id in (src_cart, tgt_cart) and c.status = 'open' and s.status <> 'closed';
  assert n = 2, format('M109.1 DEGENERATE FIXTURE: the open/active gate fires before the mode gate '
                       '(%s of 2 carts open on an active table)', n);

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert raised, 'M109.1 THE DEFECT: a pickup table merged into a dine-in one. The source guest''s '
                 'session is now closed and their food is on somebody else''s table.';
  assert msg like '%same kind%',
    format('M109.1 the merge was refused, but by a DIFFERENT gate — this case proves nothing about '
           'the mode rule. Message was: %s', msg);
  -- FIXTURE DRIFT only — see the header: the exception block rolls the merge back wherever the gate
  -- sits, so this cannot prove the gate precedes the tail.
  select count(*) into n from public.qr_cart_items where cart_id = src_cart;
  assert n = 1, format('M109.1 fixture drift: %s source line(s) after the refusal, expected 1', n);
  select count(*) into n from public.qr_carts where id = src_cart and status = 'open';
  assert n = 1, 'M109.1 fixture drift: the source cart is not open after the refusal';

  -- ══ 2. dine-in source → pickup target: the OTHER direction ════════════════════════════════════
  -- Not a mirror for symmetry's sake: a one-sided mis-write (checking only the source, or only the
  -- target) refuses case 1 and admits this one.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S2', 'dinein', 'active', ana), (tgt_sess, 'M109T2', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo'),
           (src_cart, dish, 'Balachaung', 1, price, t_in,  null, 'dinein');

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert raised, 'M109.2 THE DEFECT, other direction: a dine-in table merged into a pickup one';
  assert msg like '%same kind%',
    format('M109.2 refused by a different gate — proves nothing about the mode rule. Message: %s', msg);

  -- ══ 3. scan-and-go → pickup: two NON-dine-in modes that differ ════════════════════════════════
  -- The case that kills a `dinein`-flavoured gate copied from M100. Cases 1 and 2 both pass against
  -- `(src = 'dinein') <> (tgt = 'dinein')`; this one does not.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S3', 'scango', 'active', ana), (tgt_sess, 'M109T3', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo'),
           (src_cart, '0123456789012', 'Shan Noodle Pack', 1, price, 0, null, 'grocery');

  assert (select mode from public.table_sessions where id = src_sess) <> 'dinein'
     and (select mode from public.table_sessions where id = tgt_sess) <> 'dinein',
    'M109.3 DEGENERATE FIXTURE: neither side may be dine-in, or this case cannot kill the '
    'dinein-flavoured mis-write it exists for';

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert raised, 'M109.3 THE DEFECT: a scan-and-go basket merged into a pickup order. A gate written '
                 'as "is one of them dine-in?" — the shape M100 uses one function over — passes '
                 'cases 1 and 2 and admits exactly this.';
  assert msg like '%same kind%',
    format('M109.3 refused by a different gate — proves nothing about the mode rule. Message: %s', msg);

  -- ══ 4. SAME modes, DIFFERENT line tags: must SUCCEED ══════════════════════════════════════════
  -- Case 1's fixture with exactly ONE word changed — the source session's mode. The lines are
  -- untouched (`togo` on the source, `dinein` on the target), which is legitimate data: a seated
  -- diner tapping "To go" is what `mms_set_line_fulfillment` exists for.
  --
  -- This is half of the confound-breaker (see the header). A gate reading `qr_cart_items.fulfillment`
  -- instead of `table_sessions.mode` REFUSES here and the case goes red; the real gate lets it
  -- through. It is also what makes case 1 a statement about the MODE rather than about the tags.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S4', 'dinein', 'active', ana), (tgt_sess, 'M109T4', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_in,  null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo');

  -- ANTI-DEGENERACY: the modes must match while the tags differ, or this case measures nothing.
  assert (select s.mode from public.qr_carts c join public.table_sessions s on s.id = c.session_id where c.id = src_cart)
       = (select s.mode from public.qr_carts c join public.table_sessions s on s.id = c.session_id where c.id = tgt_cart)
     and (select fulfillment from public.qr_cart_items where cart_id = src_cart)
      <> (select fulfillment from public.qr_cart_items where cart_id = tgt_cart),
    'M109.4 DEGENERATE FIXTURE: this case only separates a mode gate from a line-tag gate while the '
    'MODES MATCH and the TAGS DIFFER';

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert not raised, format('M109.4 two DINE-IN tables were refused because their LINE TAGS differ. '
                            'The gate is reading `qr_cart_items.fulfillment`, not '
                            '`table_sessions.mode` — which is the defect M109 exists to close, and '
                            'cases 1-3 cannot see it. Message: %s', msg);
  -- M97 refuses the FOLD (the tags differ), so the line re-parents as its own row rather than
  -- joining the target's qty. Two lines, both prices intact.
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M109.4 expected the source line to re-parent as its own row (tags differ, so '
                       'M97 refuses the fold): %s lines on the target, expected 2', n);
  select count(*) into n from public.qr_carts where id = src_cart and status = 'cancelled';
  assert n = 1, 'M109.4 the legitimate merge did not cancel the source cart';

  -- ══ 5. DIFFERENT modes, SAME line tags: must REFUSE ═══════════════════════════════════════════
  -- The other half of the confound-breaker. A pickup table merging into a dine-in table whose line a
  -- seated diner has already flipped to "To go": both lines read `togo`, so a gate comparing LINE
  -- TAGS sees nothing wrong and lets it through. Only a gate reading `mode` refuses.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S5', 'pickup', 'active', ana), (tgt_sess, 'M109T5', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo'),
           (src_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo');

  -- ANTI-DEGENERACY: the tags must match while the modes differ — the exact inverse of case 4.
  assert (select fulfillment from public.qr_cart_items where cart_id = src_cart)
       = (select fulfillment from public.qr_cart_items where cart_id = tgt_cart)
     and (select s.mode from public.qr_carts c join public.table_sessions s on s.id = c.session_id where c.id = src_cart)
      <> (select s.mode from public.qr_carts c join public.table_sessions s on s.id = c.session_id where c.id = tgt_cart),
    'M109.5 DEGENERATE FIXTURE: this case only separates a mode gate from a line-tag gate while the '
    'TAGS MATCH and the MODES DIFFER';

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert raised, 'M109.5 a pickup table merged into a dine-in table because both their LINES happened '
                 'to be tagged `togo`. The gate is reading `qr_cart_items.fulfillment`, not '
                 '`table_sessions.mode`; cases 1-4 all pass against that.';
  assert msg like '%same kind%',
    format('M109.5 refused by a different gate — proves nothing about the mode rule. Message: %s', msg);

  -- ══ 6. same mode, same tags: the ordinary fold must still land ════════════════════════════════
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S6', 'dinein', 'active', ana), (tgt_sess, 'M109T6', 'dinein', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_in, null, 'dinein'),
           (src_cart, dish, 'Balachaung', 1, price, t_in, null, 'dinein');

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert not raised, format('M109.6 two same-mode tables were refused — the gate cost the legitimate '
                            'case it was narrowed around. Message: %s', msg);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M109.6 two identical lines stopped folding (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M109.6 the fold did not carry the qty: %s, expected 2', n);

  -- ══ 7. same mode, NEITHER dine-in: the gate must not have become "both must be dine-in" ═══════
  -- The over-tightening cases 1-6 all pass: 1-3 and 5 are refusals it also produces, and 4 and 6 are
  -- dine-in on both sides. Two pickup tables merging is an ordinary floor action and must survive.
  src_sess := gen_random_uuid(); tgt_sess := gen_random_uuid();
  src_cart := gen_random_uuid(); tgt_cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat) values
    (src_sess, 'M109S7', 'pickup', 'active', ana), (tgt_sess, 'M109T7', 'pickup', 'active', ana);
  insert into public.qr_carts (id, session_id) values (src_cart, src_sess), (tgt_cart, tgt_sess);
  insert into public.qr_cart_items (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (tgt_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo'),
           (src_cart, dish, 'Balachaung', 1, price, t_out, null, 'togo');

  raised := false;
  begin
    perform public.mms_merge_table_orders(src_cart, tgt_cart);
  exception when others then
    raised := true; msg := SQLERRM;
  end;
  assert not raised, format('M109.7 two PICKUP tables were refused — the gate was written as "both '
                            'must be dine-in" rather than "both the same". Message: %s', msg);
  select count(*) into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 1, format('M109.7 two PICKUP tables stopped merging (%s lines, expected 1)', n);
  select qty into n from public.qr_cart_items where cart_id = tgt_cart;
  assert n = 2, format('M109.7 the fold did not carry the qty: %s, expected 2', n);

  raise notice 'M109: 7 cases passed';
end $$;

rollback;
