-- 20260816070000_w21_pickup_contact.sql — W21 (owner: "pickup should need name and phone number").
--
-- The phone a pickup order can be reached at, on the CART. create-intent REQUIRES it for pickup
-- carts (the pure rule is apps/qr/lib/pickup-contact.ts — shape + a ≥7-digit floor; this CHECK is
-- the DB belt behind it, same two-layer pattern as customer_name/Zod). Deliberately NOT snapshotted
-- onto qr_orders yet: no staff surface reads it today, and qr_orders.cart_id already joins back to
-- this column when one does — restating the three fulfill RPCs for an unread column would be risk
-- without a reader. PII: never analytics, never money-bearing.
--
-- The CHECK mirrors lib/pickup-contact.ts exactly: allowed class bounded 7–20 chars AND at least
-- 7 actual digits (the shape alone accepts '-------'). Proven by
-- supabase/tests/pickup_phone_bound_test.sql (refusals AND a legitimate value passing).

alter table public.qr_carts
  add column if not exists customer_phone text
    check (
      customer_phone is null
      or (
        customer_phone ~ '^[0-9+(). -]{7,20}$'
        and length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 7
      )
    );
