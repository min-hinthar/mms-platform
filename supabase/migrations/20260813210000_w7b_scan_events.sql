-- 20260813210000_w7b_scan_events.sql
-- W7b (S3 — the offline scan queue): per-scan-event idempotency, IN the SQL statement.
--
-- A replayed scanAdd double-adds today BY DESIGN: a repeat barcode is qty+1 (live re-scans must
-- count), so the queue's re-sends need a per-EVENT identity — a client-minted scan_id, deduped
-- atomically inside the same transaction as the qty write. The claim CANNOT be a separate RPC:
-- a claim that commits before a failed write burns the id, and the retry would report success for
-- a scan that never landed. It also cannot be a TS-side "seen it" check (TOCTOU under concurrent
-- drains — the repo doctrine: the guard lives in the SQL statement).
--
-- The ledger is per (scan_id) — a duplicate returns WITHOUT writing, as an idempotent success
-- (the delivery repo's at-least-once lesson: never an error the queue would mark permanent). The
-- dedupe survives the caller's inc-vs-insert branch flip between attempts because the ledger is
-- keyed by the event, not the branch. Live scans pass no scan_id and are byte-identical to today.

-- ── the ledger ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.mms_scan_events (
  scan_id uuid primary key,
  cart_id uuid not null references public.qr_carts(id),
  created_at timestamptz not null default now()
);
-- Age-scoped cleanup (the queue's client TTL is ~2h; rows are tiny — sweep is a follow-up).
create index if not exists mms_scan_events_created_idx on public.mms_scan_events (created_at);
-- Default-deny: reachable only through the service-role RPCs below (service_role bypasses RLS).
alter table public.mms_scan_events enable row level security;
revoke all on table public.mms_scan_events from public, anon, authenticated;

-- ── mms_cart_item_inc_qty re-signed: + p_scan_id ─────────────────────────────────────────────────
-- Restated from the LIVE body (20260721000000_w5c_menu_depth.sql); the only addition is the claim
-- block. Signature change ⇒ drop BOTH signatures + re-issue grants (they don't survive the drop).
drop function if exists public.mms_cart_item_inc_qty(uuid, integer);
drop function if exists public.mms_cart_item_inc_qty(uuid, integer, uuid);
create function public.mms_cart_item_inc_qty(p_id uuid, p_by integer default 1, p_scan_id uuid default null) returns void
  language plpgsql set search_path = '' as $$
declare v_open boolean;
begin
  -- Bound the bump IN the statement (doctrine: the guard lives in SQL, not just the caller's Zod).
  if p_by is null or p_by < 1 or p_by > 99 then
    raise exception 'invalid quantity' using errcode = 'P0001';
  end if;
  -- W7b: the scan-event claim, atomic with the bump (same transaction). A duplicate replay claims
  -- nothing and returns silently — the caller reads the current lines and reports idempotent OK.
  -- (A vanished line also claims nothing → silent return; the fresh lines read is the truth.)
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id)
      select p_scan_id, ci.cart_id from public.qr_cart_items ci where ci.id = p_id
      on conflict (scan_id) do nothing;
    if not found then return; end if;
  end if;
  update public.qr_cart_items ci
    set qty = least(ci.qty + p_by, 99)
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99 and not ci.comped;
  if not found then
    -- 0 rows: cart closed/gone, OR open-but-at-the-99-cap, OR the line is comped (immutable). Only the
    -- closed-cart case signals; a capped or comped line is an intentional silent no-op.
    select (c.status = 'open') into v_open
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_id;
    if v_open is distinct from true then
      raise exception 'cart is no longer open' using errcode = 'P0001';
    end if;
  end if;
end $$;
revoke all on function public.mms_cart_item_inc_qty(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.mms_cart_item_inc_qty(uuid, integer, uuid) to service_role;

-- ── mms_cart_item_insert_if_open re-signed: + p_scan_id ──────────────────────────────────────────
-- Restated from the LIVE body (20260721000000); `language sql` becomes plpgsql for the claim block.
-- A duplicate replay returns the NIL uuid — a truthy sentinel, so the TS caller's `!insertedId ⇒
-- closed cart` contract holds while the duplicate still reads as an idempotent success (returning
-- null would classify a replay as a refused write and retry-loop it forever).
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer);
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid);
create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text,
  p_notes text default null,
  p_qty integer default 1,
  p_scan_id uuid default null
) returns uuid
  language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if p_scan_id is not null then
    insert into public.mms_scan_events (scan_id, cart_id) values (p_scan_id, p_cart_id)
      on conflict (scan_id) do nothing;
    if not found then
      return '00000000-0000-0000-0000-000000000000'::uuid; -- duplicate replay: no write, idempotent OK
    end if;
  end if;
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat, fulfillment, notes)
  select p_cart_id, p_menu_item_id, p_name, p_qty, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat,
         p_fulfillment, p_notes
  from public.qr_carts
  where id = p_cart_id and status = 'open' and p_qty between 1 and 99
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer, uuid)
  to service_role;
