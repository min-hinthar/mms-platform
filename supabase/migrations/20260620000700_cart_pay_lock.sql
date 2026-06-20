-- 20260620000700_cart_pay_lock.sql
-- M3·P3.2-lock (cart-lock-at-pay). Deferred from P1.3 on purpose: locking at intent-create with no
-- auto-release strands an abandoned cart. Now that group carts are live (P3.2), a peer can mutate the
-- cart WHILE the host is on the Stripe pay screen → the cart total drifts from the fixed PaymentIntent
-- amount → the webhook reconcile 409s → charged-but-no-order. The lock freezes the cart for the pay
-- window; the EXISTING `locked` mutation guards (addItem/setQty/applyPromo/scanAdd/setPickupSlot) enforce
-- it server-side. No new function (the acquire is one atomic conditional UPDATE in create-intent); no RLS
-- change (members already read qr_carts; writes stay service-role).
--
-- locked_at = when the lock was taken → a TTL (lib/lock.ts CART_LOCK_TTL) auto-releases an abandoned
-- pay-screen so the cart can't stay frozen. locked_by = the seat holding it → so the SAME payer can
-- re-acquire after a refresh (not be told "someone's checking out" by their own lock), release is scoped
-- to the locker, and the UI can name who's checking out. Both nullable (a cart starts unlocked).
alter table public.qr_carts add column if not exists locked_at timestamptz;
alter table public.qr_carts add column if not exists locked_by uuid;
