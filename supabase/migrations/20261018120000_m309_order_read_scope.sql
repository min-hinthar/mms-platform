-- 20261018120000_m309_order_read_scope.sql — M309: a session member reads only the orders of the
-- party they sat with, and never the receipt address on any of them.
--
-- ## The hole, verified against the schema
-- `qr_order_read` (20260618000000_qr_platform_init.sql:242, widened for staff by
-- 20260621100000_staff_identity.sql:62) is `is_member(session_id) or is_staff()`, and `authenticated`
-- holds a TABLE-level `select` on `qr_orders` (Supabase's default grant; 20260618000100's lockdown
-- revoked it from `anon` only). Every diner is `authenticated` (anonymous auth), so any CURRENT
-- member of a session reads every order of that session, every column, from the browser with the
-- anon key and no id to guess: `select * from qr_orders where session_id = …`. A session outlives its
-- party until staff clear the table, and the next party to scan the same sticker joins it (m182) — so
-- the next party read the previous party's totals, its lines' parent rows, and `receipt_email`, the
-- address a payer typed into "Email me this receipt" (W7a, 20260815000000_w7a_receipt.sql).
--
-- ## The fix: two halves, one file
-- ① COLUMNS. `receipt_email` and `receipt_sent_at` leave the diner's grant: the table-level `select`
--   is revoked from `anon` and `authenticated` and re-granted to `authenticated` column by column,
--   every column but those two. Postgres checks column privileges on what a query NAMES, so a member's
--   `select receipt_email` (or `select *`, which names it) is refused with 42501, while every column
--   the diner's reads name still reads. (Whether Realtime's postgres_changes payload also drops the
--   two columns is NOT proven here — no test reads a broadcast as a member; M309 keeps it open.)
--   Nothing on the diner's side named them: the email lives in two server actions (`getReceiptLink`,
--   `setReceiptEmail`, lib/receipt.ts) that already read and write it with the SERVICE ROLE, after
--   their own earner/payer authorization (M206's seat arm buys the link only, never the address).
--   ⚠️ Fail-closed for new columns: a column added to `qr_orders` later is NOT readable by diners until
--   a migration grants it. A diner read that names it fails loudly (42501) — the live /track read
--   (`TRACK_ORDER_SELECT`, lib/track-order.ts) would stop — so lib/track-order-grants.test.ts parses
--   THIS file's grant list and fails while the diner selects name a column it does not grant.
-- ② ROWS. The policy's member arm gains the join-time term the server arms already read the order by
--   (`getMyOrderFallback`'s counter arm, `getCartOrderRef`, `callerMayReceiveReceipt`'s seat arm —
--   #359, `session_members.created_at <= qr_orders.created_at`): a member reads an order only if their
--   seat was taken no later than the order. `qr_orders.created_at` is the settle (the row is inserted
--   by fulfillment), and a seat row is written once per (session, seat) and never re-stamped — a
--   rejoin finds the existing row (app/api/session/route.ts, the idempotent membership), and no
--   writer moves a member or an order to another session. So everyone at the table when it paid keeps
--   the order, and a party seated after it does not see it at all.
--
-- ## Why this shape, and not the alternatives
--   · A service-role-only SIDECAR table for the two columns would close ① too, but it moves data and
--     restates two server actions' reads and writes for the same effect a column grant has with no
--     data motion and no app change — and the grant leaves the service role's reads untouched.
--   · ① ALONE would leave the later party reading the earlier party's totals, lines and status: the
--     address is the worst field, not the only one. ② ALONE would leave the address readable by every
--     tablemate of the payer, including one who sat with them but paid nothing (M29: membership is
--     not payment) — the receipt actions refuse that seat the address; the row read must not hand it
--     over either.
--   · Binding the row to the order's PAYER (earned_by / qr_order_payers) would break the tablemates'
--     own live read: /track shows a dine-in table's order to every member who sat for it, and most of
--     them paid nothing themselves — the host's guests when the host pays for the table, everyone at a
--     counter settle (cash and Terminal write no earned_by and no payer row, M206). Joined-before-the-
--     settle is exactly the set of people at the table that paid.
--
-- ## What this does NOT close (M309 stays open for it)
-- The paid CART is still `is_member`-scoped: `qr_carts` (`qr_cart_read`), its lines
-- (`qr_citem_read`) and its shares (`qr_share_read`) read for any current member, so a later party
-- can still read the earlier party's paid cart lines. And ② is one-directional by construction: a
-- member of the EARLIER party who never left the session still reads the LATER party's orders (minus
-- ①'s columns) — the system has no notion of "party" beyond the session, and the two share one open
-- cart until staff clear the table (m182), which closes the session and ends every member's read.
-- And ②'s boundary is the order's INSERT time, not its payment: a fulfillment that lands late (a
-- Stripe retry, an outage, M160(b)'s recovery) admits a party seated between the charge and the
-- insert — it reads that order's row and lines, never ①'s two columns. Closing it needs a
-- payment-time anchor on the row (M309).
--
-- ## What a diner still reads (and the test proves)
-- `useOrderStatus`'s live read and its Realtime subscription (TRACK_ORDER_SELECT, keyed by the
-- PaymentIntent id or the order id), and `getOrderKitchen`'s `cart_id` probe (lib/order-kitchen-read.ts)
-- — the only `qr_orders` reads that run on a diner's JWT. Every other reader runs on the service role,
-- which bypasses RLS and keeps its table-level grant — restated below, because the local stack CI
-- builds does not hand the service role one by default (prod's is Supabase's default grant; the
-- statement is a no-op there). Staff keep the `is_staff()` arm unchanged; their console reads all
-- run on the service role, which lib/track-order-grants.test.ts proves by refusing any `qr_orders`
-- read it cannot classify.
--
-- ## Idempotent
-- A table-level REVOKE also revokes every column privilege on the table, so a re-run lands on the same
-- grant set; `create or replace function` and `alter policy` restate in place.

-- ── ② the join-time membership predicate ────────────────────────────────────────────────────────
-- `is_member`'s body (20260618000000_qr_platform_init.sql:194) with ONE added term. SECURITY DEFINER
-- for the same reason as `is_member`: the policy must read `session_members` / `table_sessions`
-- without the caller's own RLS on them. It answers only about the CALLER (`auth.uid()`), so the
-- execute grant to `authenticated` (which the policy needs) is no oracle about anyone else.
create or replace function public.is_member_seated_by(sess uuid, seated_by timestamptz)
  returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_members m
    join public.table_sessions s on s.id = m.session_id
    where m.session_id = sess
      and m.seat_id = (select auth.uid())
      and m.created_at <= seated_by
      and s.status <> 'closed' and s.expires_at > now()
  );
$$;
revoke all on function public.is_member_seated_by(uuid, timestamptz) from public, anon;
grant execute on function public.is_member_seated_by(uuid, timestamptz) to authenticated, service_role;

alter policy qr_order_read on public.qr_orders
  using (public.is_member_seated_by(session_id, created_at) or public.is_staff());

-- ── ① the diner's column grant ──────────────────────────────────────────────────────────────────
revoke select on public.qr_orders from anon, authenticated;
grant select on public.qr_orders to service_role;
grant select (
  id, session_id, subtotal_cents, discount_cents, service_charge_cents, tax_cents, tip_cents,
  total_cents, stripe_payment_intent_id, status, created_at, pickup_slot, fire_at, tender, cart_id,
  settled_by, earned_by, togo_status, arrived_at, table_number, customer_name, togo_ready_at,
  togo_picked_up_at, refunded_cents, dropped_lines
) on public.qr_orders to authenticated;
