-- 20260909000000_a1_counter_pay.sql — A1 · "Pay at the counter" (Option A, slice 1).
--
-- A dine-in table that would rather settle at the register had no way to say so: the Bill moment
-- offered a card on the phone or nothing, and the floor could not tell a table that was waiting to
-- pay from one still eating. The counter already settles any open dine-in cart (cash or Terminal,
-- `mms_fulfill_cash_order` / the reader) — what was missing was the ASK, so this column is the ask
-- and nothing more.
--
-- ── The column ────────────────────────────────────────────────────────────────────────────────
-- `qr_carts.counter_requested_at` — set when a member of the table taps "Pay at the counter" on the
-- Bill, cleared when they change their mind ("Pay on your phone instead"). It moves no money and
-- freezes nothing: the table can keep ordering, the register re-derives the live total at settle
-- exactly as before. The floor derives a `counter` status from it (below `settling` and `paying`,
-- which are a payment in FLIGHT and outrank a request), the drill-down shows the ask above the
-- settle controls, and settlement ends it the way it ends every cart — `status = 'paid'`.
--
-- Writes go through `apps/qr/lib/counter-pay.ts` (diner, member-authorized, dine-in only, refused
-- while a card payment or split holds the cart). No RLS change: the column rides `qr_carts`'
-- existing member/staff SELECT policy and the service-role write path.
--
-- Idempotent — safe to re-run.
alter table public.qr_carts add column if not exists counter_requested_at timestamptz;

comment on column public.qr_carts.counter_requested_at is
  'A1: when a member of this dine-in table asked to pay at the counter (null = no ask, or withdrawn). An ask, never a freeze — settlement re-derives the live total.';
