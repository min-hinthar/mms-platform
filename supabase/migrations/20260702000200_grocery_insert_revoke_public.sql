-- 20260702000200_grocery_insert_revoke_public.sql — close the PUBLIC EXECUTE grant left on the grocery
-- status-atomic insert primitive (LEARNINGS #58: locking a fn needs `revoke … from public`, not just
-- anon/authenticated).
--
-- 20260624040000 did `drop function … / create function …` — the DROP resets the ACL, and Postgres's
-- default grants EXECUTE to PUBLIC on the fresh function. That migration then revoked only
-- `from anon, authenticated`, which is a no-op against a grant held via PUBLIC — so anon/authenticated can
-- still reach it through the implicit PUBLIC grant (every sibling RPC gets the three-way revoke right).
-- Not currently exploitable — the fn is invoker-rights (not SECURITY DEFINER) and qr_cart_items has no
-- INSERT policy, so RLS denies the write — but it's one "add security definer for perf" refactor away from
-- an unauthenticated arbitrary-price cart-line insert, and it trips the repo's own lockdown convention.
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text)
  from public;
-- (grant to service_role from 20260624040000 stands.)
