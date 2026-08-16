-- W17c-2 — recording the cash tip (owner: "maybe enhance the tipping features"; the selected set
-- includes "tip on the staff cash settle").
--
-- Until now a cash settle passed `p_tip_cents: 0` unconditionally and the code called cash tips
-- "in-hand/off-system". That is fine as a description of where the money goes and wrong as a
-- description of the books: the tip is part of what the cashier collected, so the drawer never
-- reconciled against the day summary, and no one could answer what the team was actually tipped.
--
-- `mms_fulfill_cash_order` has ALWAYS taken `p_tip_cents integer default 0` and folded it into the
-- order total — so nothing here re-signs it, and the app change is simply to stop passing a
-- hardcoded 0. What is missing is the BOUND.

-- ── the non-negative invariant ──────────────────────────────────────────────────────────────────
-- The cash tip is the one figure on this path a human types, and the RPC computes
--   total = subtotal - discount + service + tax + tip
-- with no constraint on the last term. A negative tip would therefore REDUCE the recorded total
-- below what the diner actually owes — a silent discount wearing a tip's name, arriving through the
-- money path with every other guard satisfied.
--
-- The app's Zod schema bounds it 0..100000 (an absolute anti-fat-finger ceiling; $1,000 is far above
-- any real tip and far below a mis-keyed one). This is the belt for the floor, where it cannot be
-- bypassed by any caller. Deliberately NOT a relative ceiling (tip <= subtotal): a generous tipper
-- leaving more than the bill is real, and over-blocking a legitimate settle mid-service is as bad as
-- under-blocking a mistake — the cashier confirms the amount and the total before it lands.
--
-- Verified against prod before adding: 11 orders, tips 0..2376, none negative.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qr_orders_tip_cents_nonneg') then
    alter table public.qr_orders
      add constraint qr_orders_tip_cents_nonneg check (tip_cents >= 0);
  end if;
end $$;
