-- M1·P1.5 — live order tracking.
-- The diner's /track subscribes to Realtime Postgres Changes on their OWN order row, keyed by
-- stripe_payment_intent_id (Stripe appends `payment_intent` to the Payment Element return_url).
-- Fulfillment is async (the signature-verified webhook inserts qr_orders a beat after the redirect),
-- so this makes the order appear LIVE with no manual refresh. Authorization is the EXISTING
-- qr_order_read RLS (is_member(session_id)) — Realtime enforces it per-subscriber, so a diner only
-- ever receives their own session's order; a guessed payment_intent reveals nothing. RLS is already
-- enabled on qr_orders (init migration). Forward-compatible: S2's kitchen-status updates flow
-- through the same subscription with no client change.
--
-- Guarded + idempotent: only touch the publication if it exists and the table isn't already a member.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'qr_orders'
     )
  then
    alter publication supabase_realtime add table public.qr_orders;
  end if;
end $$;

-- NOTE(S2): M1 is INSERT-only (the webhook creates the row once), so the default REPLICA IDENTITY
-- (primary key) is enough — INSERT/UPDATE changes carry the new row's stripe_payment_intent_id, which
-- the client filter matches. When S2 adds kitchen-status UPDATEs (and any DELETE), verify the filter
-- still matches on those events; DELETE old-row filtering needs `alter table public.qr_orders replica
-- identity full;` — add it then if the filter misfires.
