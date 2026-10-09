-- PD3 follow-up (2026-10-09, decided under the owner's delegation) — a SOLO session refuses a second
-- member.
--
-- A pickup or scan-and-go session is ONE device's own order: the client keys it on a per-device
-- `${mode}-<uuid>` code (lib/useTableSession.ts `resolveQrCode`), no pickup or scan-and-go surface
-- offers that code to anyone (the only invite surface, GuestList → InviteSheet, mounts for dine-in
-- alone), and the bill split refuses anything but dine-in (lib/split.ts). But `/api/session`'s
-- `findActive` filters on the code, `status` and expiry — never the mode — and its member insert
-- checked only the party size, so a `?j=<code>` join landed a SECOND member on someone's pickup.
-- That member then passed every `is_member` read and `stampArrival`'s session arm (the pickup
-- "I'm here"), which is authority the order's own device never gave away.
--
-- So the refusal sits where the membership is WRITTEN, as `session_members_party_cap` does for the
-- party size: a BEFORE INSERT OR UPDATE OF session_id trigger, which covers every writer — the route,
-- `lib/kiosk.ts`'s own first row, and any future one — not a check one route remembers. Dine-in is
-- the only party mode; every other mode is solo, so a mode added later is solo by default.
--
--   · the FIRST member of a fresh solo session lands (the mint; the kiosk's own row);
--   · the same SEAT again is not a second member — it falls through to unique(session_id, seat_id)'s
--     23505, which the route reads as "already a member" (an idempotent rejoin);
--   · any other seat raises `solo_session` (P0001). The route answers it with the same 404 a wrong
--     `?j=` code gets ("No table found for that code") — never an existence oracle.
--
-- The count runs under the party cap's own advisory key (`mms_party:<session>`), so two first
-- members racing into one fresh session are serialized and the second sees the first. That ordering
-- is a two-session property no single-session test observes; it is STATED here, not claimed proven
-- (the party cap's trigger already takes the same key, and fires first by name).
--
-- Idempotent: `create or replace` + `drop trigger if exists`. Pinned by
-- supabase/tests/pd3_solo_session_refuses_join_test.sql and `scripts/verify-mode-authority.mjs`
-- suite `pd3s`.

create or replace function public.mms_refuse_solo_join() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
  select s.mode into v_mode from public.table_sessions s where s.id = new.session_id;
  -- Dine-in is the one party mode. A missing session row is the foreign key's to refuse, not ours.
  if v_mode is null or v_mode = 'dinein' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('mms_party:' || new.session_id::text));
  if exists (
    select 1
      from public.session_members m
     where m.session_id = new.session_id
       and m.seat_id <> new.seat_id   -- the same seat again is the unique key's 23505, not a second member
  ) then
    raise exception 'solo_session' using errcode = 'P0001';  -- /api/session answers the no-oracle 404
  end if;
  return new;
end; $$;

drop trigger if exists session_members_solo_guard on public.session_members;
create trigger session_members_solo_guard
  before insert or update of session_id on public.session_members
  for each row execute function public.mms_refuse_solo_join();

-- A trigger function fires as its owner whatever the grants; revoke anyway so it is not reachable as
-- an RPC (the party cap's lockdown, 20260621000000_abuse_limits.sql; LEARNINGS #58).
revoke all on function public.mms_refuse_solo_join() from public, anon, authenticated;
