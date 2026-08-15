-- 20260815000000_w7a_receipt.sql
-- W7a (S1 — the receipt artifact): the durable receipt token + the email-receipt columns.
--
-- Two additive, guarded changes; NO fulfill-RPC restatement (the new columns are written
-- POST-pay by the diner-facing action, never snapshotted cart→order inside the RPCs — which
-- deliberately sidesteps the three-RPC restatement hazard 20260806100000_w6c_terminal.sql warns
-- about).
--
--  1. `mms_receipt_tokens` — the mms_merge_tokens pattern: an opaque ≥256-bit bearer that resolves
--     to ONE order's receipt view, so the artifact outlives the 4h anon session TTL (and gives the
--     S12 walk-up /track note its foundation). One token per order (UNIQUE order_id; the mint is
--     find-or-create and only rotates the token once the old one has expired), 90-day TTL. The
--     token is a LOOKUP CREDENTIAL by design — unlike order ids / PaymentIntent ids / #CODE, which
--     stay non-credentials per the lib/orders.ts doctrine; that doctrine survives because this
--     bearer is purpose-minted, opaque, expiring, and revocable (delete the row).
--  2. `qr_orders.receipt_email` + `receipt_sent_at` — where "Email me this receipt" lands. Bounded
--     at the DB (254 = the RFC address ceiling, mirroring the Zod .max(254) in schemas.ts).

-- ── 1) the durable receipt token ─────────────────────────────────────────────────────────────────
create table if not exists public.mms_receipt_tokens (
  token      text primary key,                             -- randomBytes(32).base64url — the bearer
  order_id   uuid not null references public.qr_orders(id) on delete cascade unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
-- Default-deny: reachable only through the service-role mint/resolve (lib/receipt-token.ts).
alter table public.mms_receipt_tokens enable row level security;
revoke all on public.mms_receipt_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.mms_receipt_tokens to service_role;

-- ── 2) the email-receipt columns ─────────────────────────────────────────────────────────────────
alter table public.qr_orders
  add column if not exists receipt_email text
  check (receipt_email is null or char_length(receipt_email) <= 254);
alter table public.qr_orders
  add column if not exists receipt_sent_at timestamptz;

comment on column public.qr_orders.receipt_email is
  'W7a — where the diner asked their receipt sent (post-pay, consent-first; the setReceiptEmail '
  'action authorizes on earned_by/qr_order_payers). Never snapshotted by the fulfill RPCs.';
comment on column public.qr_orders.receipt_sent_at is
  'W7a — when the last receipt email send was handed to Resend (display state; re-sends allowed, '
  'bounded by the RECEIPT_RATE bucket).';
