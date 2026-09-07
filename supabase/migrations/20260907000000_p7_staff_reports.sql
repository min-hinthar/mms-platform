-- P7·4 — "Something's wrong": the staff report row (registry P7, PR 4 of 4).
--
-- The parents' console gets a third row in the Help sheet. A cook or a server who cannot explain a
-- problem over the phone (Min's call: "nothing to explain over the phone — capture it and send it
-- to us") types a few words; the app attaches what it can see (the screen, the path, the time, the
-- board's connection state, the deployed version, the device, the PostHog ids that let the captured
-- exceptions be found) and files it THREE ways, each honest about what it is:
--
--   THE ROW   — this table. Written FIRST, before any delivery, by the server action behind the
--               staff gate (`lib/staff-report-actions.ts`), with the reporter's identity taken from
--               the verified session, never from the client. It is the record: "a row you can see"
--               is the Help sheet's own list of the reporter's reports with their status.
--   THE EMAIL — Resend, to the restaurant's admin address, after the row exists (best-effort).
--   THE ISSUE — a GitHub issue on the app's repository with the diagnostics attached, so the report
--               lands where the fixes are made (best-effort; needs the owner's token — C17).
--
-- Delivery outcomes are RECORDED on the row (`emailed_at`, `issue_url`), never assumed: a report
-- whose email failed and whose issue was never opened is still a report, and the sheet's status
-- chip says only what the row says.
--
-- ── Bounds live HERE, not only in Zod ────────────────────────────────────────────────────────────
-- The Zod schema (`staffReportInput`) is the transport rail; every column below carries its own
-- CHECK so a hand-written insert, a future second writer, or a loosened schema cannot store a
-- 2MB message, an unknown screen, or a made-up status. `supabase/tests/p7_staff_reports_test.sql`
-- watches each refusal AND that a legitimate row still passes (an over-tight bound blocks real
-- service and a refusal-only test would never notice).
--
-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
-- Staff-internal. The app reads and writes it SERVICE-ROLE behind the app-level staff gate (the
-- shape `qr_settlement_cancellations` and `mms_refunds` use); `anon` and `authenticated` hold no
-- grant at all, and a manager-read policy stands behind that for the day a grant is added. No write
-- policy, deliberately: the only writer is the gated action, and stating the omission stops a
-- future reader "fixing" it into a path that files reports under someone else's name.
--
-- `staff_id` carries NO foreign key, deliberately: a report outlives an offboarded staff row (it is
-- a ledger, like the audit tables), and `staff.user_id` can be re-provisioned.

create table if not exists public.qr_staff_reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  -- The RESOLVED staff row (`StaffCaller.staffId`), written by the server from the verified session.
  staff_id    uuid not null,
  staff_name  text not null check (char_length(staff_name) between 1 and 80),
  -- Which Help door filed it — the three screens the parents run.
  screen      text not null check (screen in ('kitchen', 'counter', 'expo')),
  path        text not null check (char_length(path) between 1 and 200),
  -- The person's own words. 1..2000: the sheet's field caps at the same number.
  message     text not null check (char_length(message) between 1 and 2000),
  lang        text not null check (lang in ('en', 'my')),
  -- What the board believed about its feed when the report was written.
  connection  text not null check (connection in ('live', 'not_updating', 'page')),
  app_version text check (char_length(app_version) <= 64),
  -- ua · viewport · online · tz · client time · PostHog ids. Bounded as a whole.
  device      jsonb not null default '{}'::jsonb check (pg_column_size(device) <= 4096),
  -- Triage state, edited by hand (or a later tool) — the sheet's chip reads it verbatim.
  status      text not null default 'open' check (status in ('open', 'triaged', 'fixed')),
  -- Delivery OUTCOMES, recorded after the fact; null means it did not happen.
  issue_url   text check (issue_url is null or issue_url ~ '^https://github\.com/'),
  emailed_at  timestamptz
);
create index if not exists qr_staff_reports_staff_idx
  on public.qr_staff_reports (staff_id, created_at desc);
create index if not exists qr_staff_reports_status_idx
  on public.qr_staff_reports (status, created_at desc);

alter table public.qr_staff_reports enable row level security;
revoke all on table public.qr_staff_reports from anon, authenticated;
grant all on table public.qr_staff_reports to service_role;

drop policy if exists qr_staff_reports_read on public.qr_staff_reports;
create policy qr_staff_reports_read on public.qr_staff_reports
  for select to authenticated using (public.is_staff_at_least('manager'));

comment on table public.qr_staff_reports is
  'P7·4 — a staff member''s "Something''s wrong" report from the console Help sheet: their words plus '
  'the diagnostics the app could see. Written by the gated server action with the identity taken '
  'from the verified session; the email and the GitHub issue are best-effort deliveries recorded on '
  'the row (emailed_at, issue_url), never assumed. status is hand-triaged.';
