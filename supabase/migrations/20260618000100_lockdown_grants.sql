-- 20260618000100_lockdown_grants.sql
-- Tighten EXECUTE + SELECT grants beyond the init migration.
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase grants anon/
-- authenticated SELECT on new public tables — so the init revokes (anon/authenticated only) left
-- both reachable. Revoke from PUBLIC and re-grant only what's needed. Resolves advisors
-- 0026/0028/0029 except the documented, intentional exceptions.

-- Functions: drop the implicit PUBLIC execute grant; re-grant narrowly.
revoke all on function public.mms_tax_rate()                       from public;
revoke all on function public.mms_taxable(text, boolean)           from public;
revoke all on function public.mms_line_tax(integer, text, boolean) from public;
revoke all on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.mms_fulfill_order(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;  -- Stripe webhook only

-- is_member/is_host stay SECURITY DEFINER (break RLS recursion) and must be callable by the
-- `authenticated` role during policy evaluation — but not by anon. (Advisor 0029 for these two is
-- an accepted, necessary exception: RLS helpers.)
revoke all on function public.is_member(uuid) from public;
revoke all on function public.is_host(uuid)   from public;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_host(uuid)   to authenticated;

-- Tables: anon (truly unauthenticated) shouldn't even discover the session-scoped tables. RLS
-- already gates rows; revoking SELECT also clears pg_graphql anon exposure (advisor 0026). QR
-- diners are `authenticated` (anonymous-auth), so they keep RLS-gated SELECT.
revoke select on public.table_sessions, public.session_members, public.qr_carts,
  public.qr_cart_items, public.qr_orders, public.qr_order_items from anon;

-- promo_codes is validated server-side only (service-role); no client reads it.
revoke select on public.promo_codes from anon, authenticated;

-- NOTE: the catalog (menu_categories/menu_items/modifier_groups/modifier_options/
-- item_modifier_groups/grocery_items) intentionally keeps anon+authenticated SELECT — it's the
-- public menu (advisors 0026/0027 on those are expected). promo_codes keeps RLS enabled with no
-- policy (advisor 0008) by design: default-deny, service-role only.
