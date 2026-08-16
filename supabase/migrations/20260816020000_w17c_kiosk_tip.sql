-- W17c-3 — the kiosk's tip has to survive the walk to the counter.
--
-- The diner path sends a tip RATE at create-intent time, so nothing needs storing: the choice and the
-- charge happen in one request. The kiosk is different — it hands off to the register, and the money
-- is taken minutes later by a cashier. Without somewhere to put it, a tip chosen at the kiosk is
-- forgotten by the time anyone opens the drawer.
--
-- `intended_tip_cents` is named for exactly what it is: what the guest CHOSE, not what was charged.
-- The register pre-fills its tip field from it and the cashier confirms or adjusts, because only the
-- person who takes the money knows what was actually handed over. The authority stays where W17c-2
-- put it — the cashier's entry — and this column is the guest's half of the conversation.
--
-- NULL means "the guest was never asked" (every cart that predates this, and every non-kiosk cart),
-- which is deliberately distinct from 0 = "asked, and chose to leave nothing". The register renders
-- those two differently, so collapsing them into a default would erase a real answer.

alter table public.qr_carts
  add column if not exists intended_tip_cents integer;

-- Same bound as the settle path's Zod schema (0..100000), restated where no caller can bypass it.
-- The ceiling is the anti-fat-finger one; the floor matters more — a negative value here would
-- pre-fill the register with a tip that REDUCES the recorded total, which is the hole
-- `qr_orders_tip_cents_nonneg` closes one step downstream.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qr_carts_intended_tip_cents_bounds') then
    alter table public.qr_carts
      add constraint qr_carts_intended_tip_cents_bounds
      check (intended_tip_cents is null or (intended_tip_cents >= 0 and intended_tip_cents <= 100000));
  end if;
end $$;
