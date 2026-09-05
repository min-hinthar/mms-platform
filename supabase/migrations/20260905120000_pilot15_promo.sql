-- 20260905120000_pilot15_promo.sql  (pilot P3 — the incentive row)
--
-- DATA ONLY. No DDL: `promo_codes` already carries every column this needs (init + the 20260620000000
-- ALTER), so this file inserts ONE row and creates nothing. That is deliberate and it is what makes
-- the file safe to apply on this project's divergent history: there is no object to verify afterwards
-- beyond the row itself, and `select … from promo_codes where code = 'PILOT15'` is the whole check.
--
-- ⚠️ `value` IS A FRACTION, NOT A PERCENTAGE. `kind='pct' → value is a fraction (0.10 = 10% off)`
-- (20260618000000:162), and the `promo_pct_max_100` CHECK is `kind <> 'pct' or value <= 1`. So 15%
-- is 0.15. A row written as `15` would pass NOTHING — the CHECK refuses it outright — but the shape
-- of that mistake (a percentage where a fraction belongs) is why both the value and the constraint
-- are asserted in `supabase/tests/pilot15_promo_test.sql`.
--
-- ⚠️ THIS CODE IS NOT DINE-IN-ONLY, AND THE PLAN SAYS SO. PILOT_PLAN §3 P3: "No mode-scope column
-- exists; the pilot scopes it by WHO GETS THE CARD." `mms_promo_check` has no notion of fulfillment
-- mode, so a guest who is handed a card can spend it on a pickup or a scan-and-go basket too. That
-- is an accepted, bounded gap — `max_uses` is the ceiling on it — and it is written here rather than
-- discovered later, because "15% off dine-in" appears on the card the guest is handed.
--
-- ── The four policy numbers, and why each is what it is ─────────────────────────────────────────
--   value 0.15            — 15%, the incentive the plan chose (PILOT_PLAN §4 D2 → A).
--   per_session_limit 1   — one redemption per TABLE SESSION. The plan's own wording, and the cap
--                           `mms_promo_consume` re-counts under a row lock, so it is a DB invariant
--                           rather than only an app-layer gate.
--                           ⚠️ AND IT BARELY BINDS AT THE COUNTER, which is worth knowing before
--                           anyone reads it as "one per guest". The unit is a session, and a
--                           counter-style session is ONE ORDER: `closeCounterStyleSession` closes
--                           every `reg-` (and pickup `kiosk-`) session at settle, so the next
--                           customer — or the same one, two minutes later — is a fresh session with
--                           a fresh budget. It bounds a DINE-IN table, which is the surface the
--                           pilot is measuring; at the register the real ceiling is `max_uses`.
--   min_subtotal_cents 0  — no minimum. The pilot is measuring whether the surfaces work, not
--                           lifting ticket size, and a minimum would refuse the smallest tables,
--                           which are the ones most likely to expose a rounding edge.
--   max_uses 200          — the blast radius if the code LEAKS, which is the only real downside of a
--                           standing code. At a ~$40 average ticket, 200 redemptions is ~$1,200 of
--                           discount; the pilot itself needs perhaps 100.
--                           ⚠️ AND 200 IS A SOFT CEILING, deliberately quoted the way the function
--                           that enforces it quotes it: `used` is bumped at FULFILLMENT, so the
--                           overrun is every cart that APPLIED while under the cap and has not
--                           fulfilled yet — and `mms_promo_consume`'s own comment
--                           (20260620000000_promo_validation.sql:131-133) says that is "potentially
--                           many during a promo blast — not 'a few'". An earlier draft of this line
--                           said "a handful of live tables", which is the opposite of what the
--                           enforcing code documents; if a leak matters, the lever is
--                           `active = false`, not a tighter `max_uses`.
--   valid_until           — 2026-10-31 23:59:59 America/Los_Angeles. The pilot is two weeks from a
--                           Day 0 that is still blocked on hardware (O1) and env (O2), so this is
--                           deliberately generous rather than exact. What it must NOT be is null: a
--                           standing 15% that nobody remembers to switch off is the failure mode a
--                           promo row has, and `valid_from` is null precisely so the row goes live
--                           the moment it is applied and the OWNER-GATED APPLY is the only start
--                           gate — one gate, not two, and the second one could silently sit in the
--                           future while everyone waited for a code that was never live.
--
-- ⚠️ NOT APPLIED. Per PILOT_PLAN §O4 the one-file-at-a-time Supabase MCP `apply_migration` path is
-- owner-authorized per file. Measured against prod on 2026-09-05 before this was written: zero
-- PILOT15 rows exist, and the only codes present are TEAHOUSE5 (flat 500, used 0/500) and WELCOME10
-- (pct 0.10, used 0/1000).

-- `do update` and not `do nothing`, with `active` and `used` DELIBERATELY EXCLUDED.
--
-- The house seed idiom (20260620000000:214-219) is `do nothing`, which is right for fixtures that
-- only need to exist. It is wrong for a POLICY row: a re-run would apply green and change nothing,
-- so an edited window in this file would read as applied while prod kept the old numbers — green for
-- the wrong reason, on a row that decides what guests are charged. `do update` makes this file the
-- statement of intent it looks like.
--
-- `active` is excluded because switching a live promo OFF is an emergency lever the owner may reach
-- for in the dashboard, and a re-run must never quietly turn it back on. `used` is excluded because
-- it is a consumed BUDGET, not policy — resetting it would hand back redemptions already spent.
insert into public.promo_codes
  (code, kind, value, max_uses, per_session_limit, min_subtotal_cents, valid_from, valid_until)
values
  ('PILOT15', 'pct', 0.15, 200, 1, 0,
   null,
   '2026-10-31 23:59:59 America/Los_Angeles'::timestamptz)
on conflict (code) do update set
  kind               = excluded.kind,
  value              = excluded.value,
  max_uses           = excluded.max_uses,
  per_session_limit  = excluded.per_session_limit,
  min_subtotal_cents = excluded.min_subtotal_cents,
  valid_from         = excluded.valid_from,
  valid_until        = excluded.valid_until;
