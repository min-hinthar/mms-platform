-- 20260620000400_qbo_sync.sql  (M2·P2.4)
-- QuickBooks Online sync of PAID orders. Each paid qr_order posts to QBO as a Sales Receipt deposited
-- to a Stripe *clearing* account (the two-ledger pattern: sales land in clearing on order, the Stripe
-- payout later clears it to the bank). This table is the durable sync ledger — one row per order, so
-- the post is idempotent (we never create a second Sales Receipt for an order) and a failed/disabled
-- sync is retryable. The actual HTTP post is app-side (lib/qbo) behind QBO_SYNC_ENABLED; nothing here
-- talks to QBO. Service-role only: the webhook (service-role) enqueues + the processor updates status.
create table public.qbo_sync_queue (
  order_id   uuid primary key references public.qr_orders(id) on delete cascade,
  status     text    not null default 'pending'
               check (status in ('pending', 'synced', 'error', 'skipped')),
  qbo_doc_id text,                                   -- the QBO SalesReceipt Id once posted (idempotency)
  attempts   integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Default-deny: no diner ever reads the accounting ledger. Service-role bypasses RLS for the
-- webhook/processor; anon+authenticated get neither a policy nor SELECT (mirrors promo_codes).
alter table public.qbo_sync_queue enable row level security;
revoke select on public.qbo_sync_queue from anon, authenticated;

-- The processor drains the un-synced rows; index the hot predicate.
create index qbo_sync_queue_unsynced_idx
  on public.qbo_sync_queue (created_at)
  where status in ('pending', 'error');
