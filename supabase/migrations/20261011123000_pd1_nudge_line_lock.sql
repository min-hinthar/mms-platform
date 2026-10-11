-- 20261011123000_pd1_nudge_line_lock.sql — PD1 follow-up: the nudge takes the dine-in drafts it
-- decides on `for share`, after the cart and before the decision, so a fulfillment change it races
-- commits FIRST or waits for it (Codex's post-merge review of #335, comment 4240355357: "Serialize
-- nudges with fulfillment changes").
--
-- ## The finding, verified against the source
-- `mms_nudge_host` (20261008123000_pd1_send_nudge.sql, APPLIED to prod as migration row
-- `20261011045025`, verified 2026-10-11 — so restated here, never edited there) takes the cart row
-- `for no key update` and then decides in ONE UPDATE whose WHERE requires a DINE-IN DRAFT through
-- a plain `exists`: a read that neither locks nor waits.
-- `mms_set_line_fulfillment` — its LATEST definition, 20260826000000_m17_line_tax_category.sql:171-262
-- — locks the LINE and nothing else: its first read takes no lock, and its UPDATE's `exists` over
-- `qr_carts` locks no cart (an FK check fires only when `cart_id` changes, and it never does). The
-- two never met. A nudge racing a switch of the LAST dine-in draft to to-go read the line's
-- pre-switch version (READ COMMITTED: the UPDATE's snapshot predates the switch's commit), stamped
-- the cart and answered `ok` — "Aye can see you're waiting" — and once the switch committed the stamp
-- had no dine-in draft added at or before it, so every view read it stale (`nudgeLive`,
-- lib/send-nudge-state.ts) and the host never saw it. Reproduced with two sessions BEFORE this file
-- existed: scripts/verify-fire-cart-race.mjs order (i) answered `ok` without waiting and left the
-- stamp on a cart with no dine-in draft, and order (j)'s switch did not wait for the nudge.
--
-- ## The fix: one statement between the cart lock and the UPDATE
-- `mms_nudge_host` is restated WHOLE from the PD1 file — same signature, same four-column return,
-- same grants, its UPDATE and its diagnosis byte-for-byte (diff the bodies) — with ONE statement
-- added after the cart lock: the cart's DINE-IN DRAFTS — exactly the lines the UPDATE's `exists`
-- reads — `for share`, in id order, while the cart is open. `for share` conflicts with the row lock
-- any UPDATE of the line takes, so:
--   · switch first → the nudge WAITS on the line. Once the switch commits, READ COMMITTED re-checks
--     the line's new version against the lock's WHERE (to-go: it no longer qualifies, skipped), and
--     the UPDATE — a LATER statement, a fresh snapshot — finds no dine-in draft: `nothing_to_send`,
--     and no stamp (order i);
--   · nudge first → the switch WAITS on the share lock until the nudge commits. The stamp was live
--     when it was written and goes stale only through a change that came AFTER it — the serial
--     order, which PD1's liveness rule already reads (order j).
-- The same lock orders the nudge against every other writer that can take a dine-in draft away
-- WITHOUT the cart: `mms_line_transition` (one line, draft → fired or voided). Its latest definition
-- (20261001000000_p2f_counter_cook_before_paid.sql) is ONE UPDATE of the line, whose `from
-- public.qr_carts` locks no cart, and an UPDATE's row lock conflicts with `for share` — order m (a
-- void first: the nudge waits, then answers `nothing_to_send` with no stamp) and order n (the nudge
-- first: the fire of the line waits for it). And against the fire, which now meets it at a line as
-- well as at the cart: order e stays green with EITHER lock alone, so the race harness drops each
-- lock alone and both together, and only the mutant that drops both (`pd1n/nudge-both-locks-dropped`,
-- the lock-less decision) turns e red. The writers that take the cart first (the fire, the three
-- line RPCs, `mms_void_line`, the merge) were already ordered by the cart lock.
--
-- ## Lock order: the cart FIRST, then the lines — the measured lock-cycle check
-- With a line lock in the nudge, the PD1 order (cart → line) becomes load-bearing in a new way: a
-- nudge holding a line `for share` while it asked for the cart would close a cycle with the three
-- line RPCs (P2cy: the cart `for share`, then the line) — 40P01. Order (k) proves the nudge waits at
-- the cart for an add and never deadlocks; the mutant `pd1n/nudge-line-lock-before-the-cart` is
-- that cycle, killed there.
--   · `mms_set_line_fulfillment` cannot close a cycle with this nudge: measured, its latest
--     definition (m17, above) takes ONE line row (its UPDATE) and never the cart — not before the
--     line, not after it. A nudge waiting for that line holds only the cart and the lines it already
--     has; the switch waits for nothing the nudge holds except, in order j, the line itself.
--   · Every lines-only writer, from a statement-order scan of the LATEST definition of all 88 public
--     functions in the migrations (2026-10-11, the scan PD1's header describes, re-run with this
--     file's lock in mind): `mms_set_line_fulfillment`, `mms_fire_line` and `mms_line_transition`
--     lock ONE row each; `mms_bump_ticket` locks its `p_lines` `for update` in `order by id`;
--     `mms_recall_ticket`, `mms_fire_ticket_now` and `mms_fire_pending_food` write served or fired
--     lines, or a PAID cart's drafts. None of them asks for a cart. The app's two PostgREST writes
--     to `qr_cart_items` (`assignLine`, `setLineNotes`) are one statement on one row by id. Every
--     function that locks both tables still takes its first conflicting `qr_carts` lock before any
--     `qr_cart_items` lock (PD1's header) — the nudge included.
--   · `order by ci.id`: the nudge takes its lines in the order `mms_bump_ticket` takes its own, so
--     two multi-row lockers meeting on the same drafts (a bump whose `p_lines` an undo has just
--     returned to draft) queue instead of crossing. Order (l) proves it with three sessions; the
--     mutant `pd1n/nudge-line-lock-against-id-order` deadlocks there.
--   · The open-cart term: the nudge refuses a cart that is not open anyway (`closed`), and under its
--     own cart lock that status cannot change before it commits, so it locks lines only where it
--     can stamp — and never meets the post-pay kitchen writers on a PAID cart's drafts
--     (`mms_fire_pending_food`'s multi-row UPDATE has no `order by`). Pinned single-session by
--     PD1N.3.
--   · Why `for share`: it is the weakest lock that conflicts with a line UPDATE's `for no key
--     update`; `for key share` does not, and would wait for nothing (order i, the mutant
--     `pd1n/nudge-line-lock-key-share`). It does not conflict with another share lock, so two
--     tablemates' nudges still meet at the cart, as before.
--   · Re-read for the blind pass on #342 (2026-10-11), the writers it named: `mms_fulfill_order`
--     (m22's definition) takes the cart first (its UPDATE to `paid`) and only READS lines;
--     `mms_counter_no_show` and `mms_clear_counter_cart` (p2f) take the cart `for update of c`, then
--     the approvals, then the lines; `mms_sweep_expired_sessions` (p2f) locks sessions only; the two
--     triggers on `qr_cart_items` (`mms_seed_added_by`, `mms_keep_added_by`, m87) write `new` and no
--     other row, and no trigger on `qr_cart_items` writes `qr_carts`; `mms_fire_pending_food`
--     (w3_kitchen here; main's PD5b restatement changes only its batch mint) is one UPDATE of a
--     PAID cart's drafts that locks no cart. None of them runs line-then-cart on an open cart.
--   · A scan of text, like PD1's and m261's: a later function written line-then-cart, or a new
--     lines-only writer that locks several drafts out of id order, would break this, and no guard
--     here would notice.
--
-- ## What is PROVEN, and where
--   · Two sessions, both orders (scripts/verify-fire-cart-race.mjs and its `--mutants`): the nudge
--     against `mms_set_line_fulfillment` (i · j), against an add holding the cart (k), against a
--     bump holding its lines in id order (l, three sessions), against `mms_line_transition`'s void
--     and fire of the line (m · n), beside PD1's a–h — and against the Send (e) with both locks
--     dropped.
--   · One session (supabase/tests/pd1_nudge_line_lock_test.sql, falsified case by case by suite
--     `pd1n` in scripts/verify-mode-authority.mjs): the lock is TAKEN on the cart's dine-in drafts
--     before the decision, even when it refuses (PD1N.1); never on a to-go draft or a sent line
--     (PD1N.2); never on a cart that is not open (PD1N.3); the grants, and the UPDATE on
--     `qr_cart_items` that `for share` needs from service_role, this invoker function's only caller
--     (PD1N.4, a shape check that runner cannot mutate). The lock's ORDER, STRENGTH and id order are
--     invisible to one session — three documented survivors there, killed by the race harness. Every PD1 behaviour case
--     (pd1_send_nudge_test.sql) still runs against this body, and suite `pd1`'s nudge mutants now
--     patch THIS file's text (its LAST definition).
--
-- ## Deploy order: none — the app is unchanged by this file
-- Same signature, same return shape, same grants: the deployed build calls it exactly as before.
-- Apply it on the owner's go before the PR merges (#342); the PR's app change (the "Show a server"
-- pass) does not depend on it. PD1's file (`20261008123000`) is already applied (prod row
-- `20261011045025`), and it must NEVER be re-applied after this one: its idempotent `create or
-- replace` would silently put back the nudge with no line lock, and the md5 check below runs only
-- when THIS file is applied, so it would not notice. If PD1's file is ever replayed (a history
-- repair, M125), re-apply this file after it and re-run that check.
--
-- ## Applying to prod (the QR history is divergent — CLAUDE.md, M125)
-- On the OWNER's go (OWNER_RULINGS_2026-10-07 #5), ONE file with the Supabase MCP `apply_migration`,
-- after confirming the MCP targets `fasnpdhtvqtzjlvruqcu`. No `drop`, no `delete`: the MCP apply
-- path stalls on a destructive statement, and `create or replace` over the PD1 definition needs
-- neither. Then verify: ONE `mms_nudge_host` row in pg_proc, `pg_get_function_result` naming the
-- same four columns, `md5(prosrc)` equal to this file's body (a local apply's), and
-- `has_function_privilege('service_role', 'public.mms_nudge_host(uuid, uuid)', 'execute')` true and
-- false for `anon` / `authenticated`. Never `db push`, never the SQL editor.
--
-- Guarded + idempotent: every statement re-applies cleanly.

-- ── the nudge, restated: the dine-in drafts `for share` between the cart lock and the decision ───
create or replace function public.mms_nudge_host(p_cart_id uuid, p_seat uuid)
  returns table(ok boolean, reason text, nudged_at timestamptz, nudge_seat uuid)
  language plpgsql set search_path = '' as $$
declare
  n integer;
  v_at timestamptz; v_by uuid;
  v_status text; v_sess_status text; v_mode text; v_host uuid;
  v_prev timestamptz; v_prev_seat uuid; v_member boolean; v_paying boolean; v_draft boolean;
begin
  -- The cart row FIRST (the header's lock order): a fire in flight finishes before this decides, and
  -- the UPDATE below is a later statement, so it reads the fire's committed lines.
  perform 1 from public.qr_carts where id = p_cart_id for no key update;
  -- PD1 follow-up (Codex's post-merge review of #335): the dine-in drafts the UPDATE's `exists`
  -- reads, `for share`, AFTER the cart (cart → line) and BEFORE the decision — a fulfillment change
  -- in flight commits first (and the UPDATE, a later statement, reads it) or waits for this one; in
  -- id order, like `mms_bump_ticket`; only while the cart is open (the header).
  perform 1 from public.qr_cart_items ci
    where ci.cart_id = p_cart_id and ci.state = 'draft' and ci.fulfillment = 'dinein'
      and exists (select 1 from public.qr_carts oc where oc.id = p_cart_id and oc.status = 'open')
    order by ci.id
    for share of ci;
  update public.qr_carts c
    set send_nudge_seat = p_seat, send_nudge_at = now()
    from public.table_sessions s
    where c.id = p_cart_id
      and s.id = c.session_id
      and c.status = 'open'
      and s.status = 'active'
      and s.mode = 'dinein'
      and s.host_seat is not null
      and s.host_seat <> p_seat
      and exists (select 1 from public.session_members m
                   where m.session_id = s.id and m.seat_id = p_seat)
      and not (c.locked and c.locked_at is not null and c.locked_at > now() - interval '5 minutes')
      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')
      and exists (select 1 from public.qr_cart_items ci
                   where ci.cart_id = c.id and ci.state = 'draft' and ci.fulfillment = 'dinein')
      and (c.send_nudge_at is null or c.send_nudge_at < now() - interval '1 minute'
           -- a STALE stamp (no dine-in draft that predates it) blocks nothing — see the header
           or not exists (select 1 from public.qr_cart_items w
                            where w.cart_id = c.id and w.state = 'draft' and w.fulfillment = 'dinein'
                              and w.created_at <= c.send_nudge_at))
    returning c.send_nudge_at, c.send_nudge_seat into v_at, v_by;
  get diagnostics n = row_count;
  if n = 1 then
    return query select true, 'ok'::text, v_at, v_by; return;
  end if;
  -- Zero rows: say which guard refused, from a read — never a guess. The cart row is still ours.
  select c.status, s.status, s.mode, s.host_seat, c.send_nudge_at, c.send_nudge_seat,
         exists (select 1 from public.session_members m where m.session_id = s.id and m.seat_id = p_seat),
         (c.locked and c.locked_at is not null and c.locked_at > now() - interval '5 minutes')
           or (c.settle_at is not null and c.settle_at > now() - interval '10 minutes'),
         exists (select 1 from public.qr_cart_items ci
                  where ci.cart_id = c.id and ci.state = 'draft' and ci.fulfillment = 'dinein')
    into v_status, v_sess_status, v_mode, v_host, v_prev, v_prev_seat, v_member, v_paying, v_draft
    from public.qr_carts c join public.table_sessions s on s.id = c.session_id
    where c.id = p_cart_id;
  if not found then return query select false, 'no_cart'::text, null::timestamptz, null::uuid; return; end if;
  if v_status <> 'open' or v_sess_status <> 'active' then
    return query select false, 'closed'::text, null::timestamptz, null::uuid; return;
  end if;
  if not v_member then return query select false, 'not_member'::text, null::timestamptz, null::uuid; return; end if;
  if v_host is null then return query select false, 'no_host'::text, null::timestamptz, null::uuid; return; end if;
  if v_host = p_seat then return query select false, 'is_host'::text, null::timestamptz, null::uuid; return; end if;
  if v_paying then return query select false, 'paying'::text, null::timestamptz, null::uuid; return; end if;
  if v_mode <> 'dinein' or not v_draft then
    return query select false, 'nothing_to_send'::text, null::timestamptz, null::uuid; return;
  end if;
  -- Reached only when the cadence term refused: the stamp is fresh AND live (a stale one passes it).
  if v_prev is not null and v_prev >= now() - interval '1 minute' then
    -- The stamp stands. THIS seat's → `recent` (idempotent: the guest's line keeps showing); another
    -- seat's → `taken`, carrying whose it is. Never the caller's seat on a stamp that is not theirs.
    if v_prev_seat = p_seat then
      return query select false, 'recent'::text, v_prev, v_prev_seat; return;
    end if;
    return query select false, 'taken'::text, v_prev, v_prev_seat; return;
  end if;
  return query select false, 'unknown'::text, null::timestamptz, null::uuid;
end $$;
revoke all on function public.mms_nudge_host(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_nudge_host(uuid, uuid) to service_role;
