-- ── W6a — the register's day window ──────────────────────────────────────────────────────────────────
-- The Z-report-lite (`getDayCashSummary`) scans qr_orders by created_at — a column with NO index until
-- now (every existing read path keyed on session_id / earned_by / togo state / pickup_slot). One
-- additive index; day windows and any future date-ranged reporting ride it.
create index if not exists qr_orders_created_idx on public.qr_orders (created_at);
