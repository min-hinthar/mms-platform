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
-- Idempotent: `create or replace` for the functions AND the trigger (PG14+; no DROP, so the MCP
-- apply path runs it without a destructive-statement confirmation it cannot get). Pinned by
-- supabase/tests/pd3_solo_session_refuses_join_test.sql and `scripts/verify-mode-authority.mjs`
-- suite `pd3s`.

-- ── 0. FIRST: the state this migration prevents must not already exist (Codex P1 on #339) ────────
-- The trigger below governs FUTURE writes only. A solo session that already held a second member
-- would keep it — its `is_member` reads, its cart writes, its arrival stamp, the expiry its activity
-- slides — and the migration would have grandfathered exactly the member it exists to refuse.
-- Measured on prod, read-only, 2026-10-09 (the coordinator): pickup / scan-and-go sessions with more
-- than one `session_members` row — ZERO, at any status. So nothing is deleted. Instead the apply
-- ABORTS, loudly, if that state exists when it runs: today a proven no-op. A named function rather
-- than an inline block, so supabase/tests can drive it on a fixture and it can be re-run as a check.
--
-- The LOCK is what makes "aborts if that state exists" true (the blind pass on #339, 1). The assert
-- alone takes ACCESS SHARE, so a membership insert could commit between it and `create trigger`
-- below and the apply would still succeed over a second member. SHARE ROW EXCLUSIVE on
-- `session_members` conflicts with every insert's ROW EXCLUSIVE, so from the assert until this
-- migration's transaction COMMITS — past the trigger's creation — no membership can be written: the
-- assert sees the last state before the trigger, and every later insert meets the trigger. Every
-- apply path runs a migration file as ONE transaction (the CLI's `supabase db push` / `start`, the
-- MCP `apply_migration`), so the lock spans the file. It is taken inside a DO block because a bare
-- `lock table` outside a transaction block is an error, and the mutant harness replays this file
-- statement by statement (`verify-mode-authority.mjs`); there it guards nothing, and needs nothing.
create or replace function public.mms_assert_solo_sessions_single() returns void
language plpgsql security definer set search_path = '' as $$
declare v_found text;
begin
  select string_agg(format('%s (%s, %s members)', s.id, s.mode, m.n), ', ' order by s.id)
    into v_found
    from public.table_sessions s
    join (select session_id, count(*) as n
            from public.session_members
           group by session_id
          having count(*) > 1) m on m.session_id = s.id
   where s.mode <> 'dinein';   -- every mode but dine-in is solo, the trigger's own rule
  if v_found is not null then
    raise exception 'solo_sessions_with_members: %', v_found
      using errcode = 'P0001',
            hint = 'A pickup or scan-and-go session already holds a second member: reconcile it (an owner decision) before installing session_members_solo_guard.';
  end if;
end; $$;

revoke all on function public.mms_assert_solo_sessions_single() from public, anon, authenticated;

do $$
begin
  lock table public.session_members in share row exclusive mode;  -- held to COMMIT: no insert lands before the trigger
  perform public.mms_assert_solo_sessions_single();
end $$;

-- ── 1. the refusal, where the membership is written ──────────────────────────────────────────────
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

create or replace trigger session_members_solo_guard
  before insert or update of session_id on public.session_members
  for each row execute function public.mms_refuse_solo_join();

-- A trigger function fires as its owner whatever the grants; revoke anyway so it is not reachable as
-- an RPC (the party cap's lockdown, 20260621000000_abuse_limits.sql; LEARNINGS #58).
revoke all on function public.mms_refuse_solo_join() from public, anon, authenticated;
