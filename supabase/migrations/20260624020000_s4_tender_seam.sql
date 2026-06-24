-- 20260624020000_s4_tender_seam.sql — S4.3c: the EBT split-tender SEAM (data model only). docs/S4_DESIGN.md
-- S4.3c. The 2027 EBT tender split (one tender pays the eligible grocery subset, another pays the rest) is
-- gated on Forage/FNS and NOT built here. This lays the eligibility partition key so 2027 is a tender-time
-- branch, not a rewrite: the order records what was EBT-eligible AT SALE. Off the money path (snapshot runs
-- in the settlement after() drain, not the fulfill RPCs). Additive + idempotent.

-- ── C1: eligibility-at-sale on the order line (default false; a permanent audit record + the 2027 key). ──
alter table public.qr_order_items
  add column if not exists ebt_eligible boolean not null default false;

-- mms_snapshot_ebt_eligibility — mark the order's grocery lines whose catalog item is EBT-eligible. Called
-- best-effort in the settlement after() side-effects (off the money path; a hiccup just leaves false, and
-- the catalog stays derivable as a fallback). Idempotent. A grocery line's menu_item_id IS the barcode
-- (S4.1 soft-ref); food/prepared lines never match grocery_items → stay false (never SNAP-eligible anyway).
create or replace function public.mms_snapshot_ebt_eligibility(p_order uuid) returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.qr_order_items oi
    set ebt_eligible = true
    from public.grocery_items g
    where oi.order_id = p_order
      and oi.fulfillment = 'grocery'
      and g.barcode = oi.menu_item_id
      and g.ebt_eligible = true
      and oi.ebt_eligible = false;   -- only flip the ones not yet marked (idempotent; returns 0 on re-run)
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_snapshot_ebt_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.mms_snapshot_ebt_eligibility(uuid) to service_role;
