# Phase 3c-ii — the table bound at SEND (2026-10-05)

> **BUILT (2026-10-05)** — two worktree slices squashed onto the branch (`d8a0c0c` authority ·
> `fe5d0e2` bind-ux) plus the integration gate's fix (`b9c0274`); the CHANGELOG entry "Phase 3c-ii" is the
> as-built list. Continues `docs/PHASE3C_DESIGN.md` (D13–D20): D21–D30 below. Both migrations landed as
> FILES with their SQL tests; the owner applies each one-file (M260; M258's file first) — **the session
> never applies DDL to prod.** Owner questions are numbered under _Dependencies · risks_ with the default
> each took. **BUILT deviations, each against source:** `bindVerdict` is a pure export of `lib/seated.ts`
> (a `"use server"` module exports only async functions — D24's placement); `liveDineIn(db, nowIso)` +
> `liveDineInAt(db, n, nowIso)` replace D23's builder-typed `liveDineInAt(q, …)` (postgrest-js's generic
> `eq` cannot be typed without `any`; the `counterQueueBase` idiom), and `seatedSessionFor` adds
> `.limit(1)` so two anomalous live rows before the index is applied never turn into a `maybeSingle`
> error; the bind's 23505 answers `seated` only when the re-read finds a live holder, else `error`
> (retryable); the route maps a thrown `UNAVAILABLE()` to the existing W10a 503 shape; the reserved-code
> block moved ABOVE the W5a member check so a number-found `kiosk-` row meets the join refusal on the
> claim path too; the kiosk also sweeps the dead row off N before its pre-read; `bindRefusalCopy(result,
reasonCopy)` takes the send's copy as a PARAMETER (`useUndoGrace` imports `@/lib/cart`, whose
> `server-only` would poison every `table-pick` importer's suite); D28's "the primitive's default restore
> to Send on dismissal" does not hold — `sheet.tsx` skips the W9e restore once `onCloseAutoFocus` exists —
> so the host lands focus on BOTH edges through the button's handle; the integration gate added T9's
> freeze gate to the sheet (`frozen` + `onFrozen`, `FROZEN_NOTE` before the write) and moved the bind
> call to the host as `onClaim` (the `LineOptionsSheet` shape `check:child-freeze` can read); the
> migration stamps are `20261005…`, not the doc's `20261006…`. The tap walk's 9 stayed 9, as scored.

**The brief.** Row 3c of `docs/PHASE3_JOURNEYS.md` (J22 · J33 · M258). Today a dine-in diner is asked
"Which table are you at?" BEFORE the menu (`/dine-in` → `TablePicker.tsx:42`) and a seated table demands
the party's code there; the audit counted 9 taps + a forced 10 s wait to a paid two-dish order. 3c-ii:
**browse first** — the home's Dine-in door enters the menu on today's bare host-start (a generated join
code, `table_number = null`, `route.ts:201-213`); the table is asked ONCE, inside the first **Send**, as a
sheet whose chip binds the live session and then runs the same send; a scanned sticker or a `?table=N`
claim stamps the number at mint and never sees the sheet. The authority side makes the table NUMBER an
identity beside the sticker TOKEN: ONE predicate (`seatedSessionFor`), a partial unique index on
`table_sessions(table_number) WHERE status='active' AND mode='dinein'`, a row-count CAS `bindTable`,
every 23505 re-read BY NUMBER (the mint's sticker and claim paths, the register, the kiosk), the home
card's resume converging on a late-bound table instead of 409ing its own host, and J33's unbound half
closed server-side. M258 ships as the void path's freshness predicate in `mms_undo_fire` with a
verify-mode-authority suite. **No amount is computed or moved; RLS, the lock model, `mms_fire_cart`, the
party cap, W5a and W9a are untouched.**

**Provenance.** A nine-agent panel run in-session on 2026-10-05 under the owner's "merge, continue
3c-ii": two read-only mappers (the session plane · the send/authority plane), four blind proposers (the
bind state machine · the authority SQL · the tap walk/copy/a11y · the adversary), two judges
(contract·risk · rubric·craft) each with grafts and a `mustNot` list, and one synthesizer. **Both judges
ranked proposal 4 (the adversary) first** (contract 5/5 from both): it kept every law they could check —
table_number-only bind, host-only behind the lock freshness, `{count:"exact"}` + re-read, 23505 by number
never by constraint name, the 3B-spec index with a RAISE guard, two migration files, the register
converging, M258 as the `mms_void_line` idiom with a four-row battery, the hero still Send. Its skeleton
is below with what BOTH judges named grafted: P1's live table number on every surface (D30), P2's
fail-honest occupancy and reserved-by-number gate (D23 · D25), P3's `tables.length > 0` gate, the
say-at-unmount a11y ordering and the `pickYourTable` title (D27 · D28), P2's inactive-registry refusal and
the kiosk's 23505 arm (D23 · D26). Every judge `mustNot` is honoured as law; where the judges' letters
conflict (the undo's row lock) the default satisfies both and the stricter form is owner question 1.

**Form.** As `docs/PHASE3C_DESIGN.md`: findings → decisions → the two slices → bookkeeping → scoring.
Every claim is file:line read from THIS checkout (`686facd`), never from a proposal's prose; every judged
refutation is dropped (P2's 10-tap count — `MenuBrowser.tsx:912-930` is a one-tap Add for a no-choice
dish; P2's status-only index; P2's server `no_table` dead end; P1's "held" chips and its h1/MY mismatch —
`TablePicker.tsx:43-51` pairs the Burmese with the SUB-line; P3's member-level bind; P3's sticker
invitation on `/cart`; P4's "atomic against `acquireCartLock`"). One judge claim was itself wrong: the
J33 row DOES carry a fix column ("a different table is a BIND of the live session, never a claim" —
`OPEN-ITEMS.md:790`, the cell after the description), which is what D25 builds for the unbound half.

## What the panel found (verified against source)

| #   | Finding                                                                                                                                                                                                                                                                                           | Evidence                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two keys, three occupancy predicates, no uniqueness on the number.** Picker, mint and register key on the sticker TOKEN; the kiosk and the floor strip on the NUMBER; `table_number` is a plain nullable FK. A generated-code session bound to 7 reads "Open" and is invisible to the register. | `tables.ts:29-31`, `route.ts:114-125`, `register.ts:119-126`; `kiosk.ts:79-88`, `floor-rows.ts:49-51` ("a data anomaly"); `20260713000000_k2_table_registry.sql:48-49` |
| 2   | **Every 23505 is read as the qr_code index.** The route's claim and sticker arms re-read by TOKEN and fall to a 500; the register → `STAFF_WRITE_OUTAGE`; the kiosk `continue`s six times.                                                                                                        | `route.ts:215-241`; `register.ts:141-155`; `kiosk.ts:111`                                                                                                              |
| 3   | **The home card's resume and the W5a member check see only a token-keyed session.** A late-bound session is missed, a SECOND session inserts (or 409s its own host under an index), and the "earlier visit had ended" notice fires over a live table.                                             | `HomeSessionCard.tsx:47-51`; `route.ts:125`, `:141-160`; `TableCartProvider.tsx:660-675`                                                                               |
| 4   | **Re-keying `qr_code` would recreate the W9a phantom table.** Every phone persists the joinCode (= `qr_code`) after the mint, the URL is stripped, the invite URL embeds it; a stale key on a bare `/menu?mode=dinein` INSERTS a new host session.                                                | `useTableSession.ts:57-58`, `:127-139`, `:181`; `route.ts:201-213`, `:383`; `InviteSheet.tsx:33-34`                                                                    |
| 5   | **`mms_undo_fire` never reads the lock.** open · dinein · fired · not comped · in-grace · batch; the only lock check is the action's. The void path has the freshness idiom; `lock.ts:110` takes a STALE lock over, so bare `c.locked = false` would refuse a legitimate undo.                    | `20260624030000_s4_money_remediation.sql:116-134`; `cart.ts:335,347`; `20260622090000_s2_audit_fixes.sql:112-115`; `lock-ttl.ts:32,38`; `authz.ts:185-192`             |
| 6   | **Occupancy fails OPEN.** `getDineInTables` destructures `{ data: active }` with no error branch — a failed sessions read marks EVERY table Open.                                                                                                                                                 | `tables.ts:20-29`                                                                                                                                                      |
| 7   | **The table number is page-load state on `/cart` and mint-time state on `/menu`**; `applyCartView` syncs ten fields and not this one; the view already carries it.                                                                                                                                | `Checkout.tsx:247,273,2596,3980`, `:564-603`; `TableCartProvider.tsx:1605`; `cart.ts:661,768`                                                                          |
| 8   | **The Sheet's close contract.** `onCloseAutoFocus` fires at UNMOUNT after the CSS exit; a caller that speaks or moves focus on close does so under the sheet's `aria-hidden`; the default restore targets the opener; `busy` needs a bounded, finally-cleared await.                              | `packages/ui/src/sheet.tsx:37-41`, `:64-91`, `:227-255`                                                                                                                |
| 9   | **Stale prose and a retired citation.** "there's no background sweeper"; "the sticker qr_code is the only identity"; M258 cites `checkout/pay-mints-over-an-in-flight-undo`, retired in 3c-i.                                                                                                     | `route.ts:163` vs `20261001000000_p2f_counter_cook_before_paid.sql:337-360`; `floor.ts:1253-1254`; `OPEN-ITEMS.md:112`                                                 |

**Cross-cutting, both judges:** the bind writes exactly ONE column; the predicate is ONE module; the hero
stays Send and the table question is a gate inside `send()` after the frozen refusal; one live region per
view, every sentence said AFTER the sheet unmounts; a registry outage never dead-ends the send
(`TableGrid.tsx:86-98`'s own rule); the Send sheet never invites a sticker scan (a `?t=` from `/cart` drops
the persisted key at `useTableSession.ts:57` and mints a second session); no cart migration from a diner
path; two migration files; every count measured.

## The decisions (D21–D30 — continuing `docs/PHASE3C_DESIGN.md`)

### Authority (Slice A)

- **D21 — the bind writes `table_number` ONLY; `qr_code` is never rewritten.** ONE helper
  `bindSessionTable(db, sessionId, n)` in NEW `lib/seated.ts`: `update table_sessions set { table_number:
n }` with `{ count: "exact" }` (`lock.ts:97-113`'s idiom — `.update()` with no count reports a blocked
  write as success) WHERE `id = S AND table_number IS NULL AND status='active' AND mode='dinein' AND
expires_at > now()`. The join identity stays the row's `qr_code` for its whole life; the NUMBER is the
  seat. _Why not re-key to the token (finding 4):_ every phone's `DINEIN_KEY`, the stripped URL and the
  invite link would name a code with no active row → the next bare mint INSERTS a phantom host session,
  and the qr index 23505s the re-key whenever a token session already holds N. _Tests:_
  `bind-table.test.ts` — payload keys exactly `["table_number"]`; predicates `.is("table_number", null)`,
  status, mode, `.gt("expires_at")`; `count: "exact"`; `route.test.ts` — a rejoin by the SAME persisted
  code after a bind returns 200 with `tableNumber` N and no insert. _Mutants:_ `bind-table/rekeys-the-session`
  · `bind-table/cas-drops-the-null-guard`.
- **D22 — one active dine-in session per NUMBER: the index, its guarded migration, the sweep by number,
  23505 by number for every writer.** `supabase/migrations/20261006000000_p3c2_table_number_uniq.sql`:
  (1) close expired-but-active dine-in rows carrying a number (the cron sweeper's own act,
  `20261001000000:341-353`); (2) a `do $$` block that RAISES, naming the numbers, when two LIVE dine-in
  rows share one (the owner clears from the floor, `floor.ts:1194-1201`, and re-applies — the migration
  never closes a live row); (3) `create unique index if not exists table_sessions_active_table_uniq on
public.table_sessions (table_number) where status = 'active' and mode = 'dinein'` — the
  `PHASE3B_DESIGN.md:374-377` shape, NULLs distinct, invisible to types-fresh (`20260620000500:11-12`).
  P2's status-only deviation is refused: a SQL fixture inserts a pickup row carrying a number past every
  writer and falsifies the scope in one case. `sweepExpiredOnTable(db, n)` (lib/seated.ts) closes
  `table_number = n AND mode='dinein' AND status='active' AND expires_at <= now()` before every
  number-stamping write — the index is partial on status, so a dead row holds N until the 15-min cron; the
  token sweeps (`route.ts:171-178`, `register.ts:112-117`) stay for numberless token rows. **23505 per
  writer, decided by `seatedSessionFor(n)`, NEVER by the constraint name:** the mint's claim insert →
  `winner.host_seat === seat` converges (W5a) else the shipped 409; the sticker insert → join; the
  generated-code insert → `continue` as today; `startTable` → converge else `STAFF_WRITE_OUTAGE`; the
  kiosk → `occupied`; the bind → `seated`. _Tests:_ `supabase/tests/p3c2_table_number_uniq_test.sql`
  (rolled back, `set local plpgsql.check_asserts = on`) — case 1 FIRST: two active dine-in rows on 98 →
  `unique_violation` (caught, SQLSTATE asserted), so the un-migrated run goes red on it; closed + active
  accepted; two NULL-number rows coexist; an active PICKUP row carrying 98 beside the dine-in one ACCEPTED
  (the mode scope); an UPDATE of a second session's NULL → 98 raises 23505 (the bind path); `indexdef` from
  `pg_indexes` contains `WHERE ((status = 'active'::text) AND (mode = 'dinein'::text))` — the PREDICATE
  pinned, not the name. Appended to `ci.yml:233`. _Mutants:_ `bind-table/sweep-keyed-on-the-token` ·
  `bind-table/sweep-closes-a-live-table` · `register/start-collision-reads-by-token` ·
  `kiosk/number-collision-regenerates`; the index has no function body for the battery — proved red by
  hand before/after the file (CI-only, Docker) and said so in the test header.
- **D23 — `seatedSessionFor(n)`: ONE server predicate, read by every consumer; a read error is an outage,
  never "free".** `lib/seated.ts` (server-only, like `tables.ts:13-14`): `liveDineInAt(q, nowIso)` applies
  `eq table_number · eq mode 'dinein' · eq status 'active' · gt expires_at` once; `seatedSessionFor(db, n)`
  → `Sess | null` selecting `route.ts:75`'s `cols`, `maybeSingle`, **throws `UNAVAILABLE()` on error**
  (W10a, `authz.ts:174-177`); `seatedTableNumbers(db)` → `Set<number> | null`; `occupancyFor(tables,
seated)` PURE. Callers: the route (D25), `startTable` (D26), the kiosk's pre-read at `kiosk.ts:79-88` (its
  anchor `if (occupied) return { ok: false, reason: "occupied" };` byte-identical — `verify-slice.mjs:3963-3969`),
  `getDineInTables` (occupancy by NUMBER, `seated.has(t.tableNumber)`; **a null set → `[]`**, the picker's
  existing degrade — closing finding 6) and the bind's collision re-read. `assertCartMember`'s select
  (`authz.ts:196`) is UNTOUCHED (three anchors, `verify-slice.mjs:4066,4077,11694`). `status='locked'`
  (`init.sql:118`, no writer — measured) stays outside the predicate as it is outside every occupancy read
  today (owner question 5). _Tests:_ `seated.test.ts` (query-capture, the `kiosk.test.ts:45-60` idiom) —
  the four predicates; a read error throws; `occupancyFor` by value. NEW `tables.test.ts` — a
  generated-code session with `table_number 7` reads occupied; a null number marks nothing; a failed read
  → `[]`. _Mutants:_ `seated/expired-session-counts-as-seated` · `any-mode-seats-a-table` ·
  `closed-session-seats-a-table` · `read-error-reads-as-empty`; `tables/occupancy-keyed-on-the-token` ·
  `tables/occupancy-fails-open`.
- **D24 — `bindTable(cartId, n)`: host-only, under the lock model, bound once, refusals that name the
  recovery, never a merge.** NEW `"use server"` `lib/bind-table.ts`; `bindTableInput = { cartId: uuid,
tableNumber: int 1..99 }` (`schemas.ts:37`; the CHECK `k2:23`). Order, each refusal before any write and
  in `sendToKitchen`'s order (`cart.ts:276-280`): `assertCartMember` → `withinMutationRate` → `locked` →
  `settling` → `role !== "host"` → `mode !== "dinein"` → the registry (`qr_tables … eq active true`,
  `route.ts:88-98`'s check and sentence) → `sweepExpiredOnTable(n)` → the CAS (D21). Outcomes: count 1 →
  `ok` → `touchCart(cartId, "bindTable")` (every peer's `qr_carts` watch re-reads the view,
  `realtime.ts:179-183` — D30) → posthog `table_bound`; 23505 → `seated`; 23503 (the FK, `k2:48-49`) →
  `unavailable`; count 0 → RE-READ the own row, answered by a pure `bindVerdict({ count, reread, n })`:
  `=== n` → `ok, already` (two tabs) · `m ≠ n` → `already_bound(m)` · closed/expired → `session_expired`.
  _Why the lock refuses a bind:_ the fulfill RPCs snapshot `table_sessions.table_number` at settlement
  (`k2:85-91`) — a bind under a peer's charge would re-table a paid order. _Why never a merge:_
  `mms_merge_table_orders` re-parents lines, cancels the source cart and closes its session
  (`20260622020000:118-125`), a money-bearing staff-gated write (`floor.ts:1353`; M257); a seated number is
  REFUSED with the join path and nothing on the OTHER session is written. No `session_members` row, no
  `expires_at` in the payload (`assertCartMember`'s renewal, `authz.ts:231`, is the only slide). _Tests:_
  `bind-table.test.ts` — guest → `not_host` with NO write; fresh lock → `locked`; fresh settle →
  `settling`; a STALE lock lands; pickup → `not_dinein`; inactive/unregistered → `unavailable`; 23505 →
  `seated`; 23503 → `unavailable`; count 0 + own row n → ok/already; + 3 → `already_bound 3`; `touchCart`
  awaited AFTER the update and the sweep BEFORE the CAS (order on one spy); no `expires_at`, no membership
  query; `bindVerdict` every arm. _Mutants:_ `bind-table/guest-binds` · `locked-binds` · `settling-binds` ·
  `pickup-binds` · `zero-rows-reads-as-landed` · `collision-reads-as-landed` · `peers-not-resynced` ·
  `forged-number-trusted` · `seated-evicts` · `bind-slides-the-expiry` · `bind-writes-a-membership`.
- **D25 — the sticker scan, the `?table` claim and the home card converge BY NUMBER; a claim from a phone
  with a live UNBOUND hosted session BINDS it (J33's unbound half); a number-found session still passes
  the reserved gate.** `route.ts`: the claim is `tableNumber != null` (today `!resolvedQr &&`, `:87`);
  `priorCode = claim ? qrCode : undefined`; `resolvedQr = claim ? tbl.qr_code : qrCode`; `:125` becomes
  `sess = sessionTable != null ? seatedSessionFor(N) : resolvedQr ? findActive(resolvedQr) : null`. The
  W5a member check (`:141-160`) then converges a member of a late-bound session (the home card's
  `?resume=1&table=N`, `HomeSessionCard.tsx:47-51`) and 409s a stranger as today. NEW before the create
  loop: `mine = priorCode && !isReservedSessionCode(priorCode) ? findActive(priorCode) : null`; the PURE
  `claimDisposition({ seated, mine, seat })` → `"bind"` iff `!seated && mine.mode === "dinein" &&
mine.table_number == null && mine.host_seat === seat`, else `"mint"`; `"bind"` → `sweepExpiredOnTable(N)`
  → `bindSessionTable(mine.id, N)`: count 1 → `sess = mine` (a JOIN; the expiry slides at `:246-252`);
  23505 → the shipped 409; count 0 → fall through to mint. The 23505 arms (`:222-237`): claim →
  `seatedSessionFor(N)`, host === seat → converge else 409; sticker → `seatedSessionFor(N)` → join;
  generated → `continue`. **Reserved by number:** `reservedCodeRefusal` keys on the code the CLIENT sent
  (`:189-196`), so a number-found row needs `isReservedSessionCode(sess.qr_code)` → the shipped "join"
  sentence (a `kiosk-` dine-in session carries a number, `kiosk.ts:94-101`). The client
  (`useTableSession.ts:150`) sends the persisted code ALONGSIDE `tableNumber`; the comment at `:147-149`
  is rewritten red-first — its substance survives: the code is only ever `priorCode`, verified by
  `host_seat === seat`, never the key the number resolves. J33's BOUND half stays filed: a seat may hold
  several memberships (`TableGrid.tsx:57-63`), "Leave this table" is device-only (W20,
  `useTableSession.ts:25-38`), a bound session cannot bind again under D21's `is null` — no "held" chips.
  `route.ts:163`'s prose is corrected. _Tests:_ `route.test.ts` with a **filter-aware** mock (today
  `:43-60` answers every `table_sessions` select with one row): a member's claim at a late-bound session
  converges (no insert, that `joinCode`), a stranger's 409s with no write; a claim whose body `qrCode`
  names a live unbound dine-in session this seat HOSTS → ONE update, no insert — a guest of it, a bound
  one, or a reserved prior code → insert, never an update; a sticker at a late-bound session → no insert,
  membership on THAT id; a 23505 on the claim re-reads `eq("table_number", N)`; a number-found `kiosk-`
  session → the "join" refusal; a bare host-start never consults the number read. `seated.test.ts` —
  `claimDisposition`'s truth table. NEW `useTableSession.test.tsx` — with `tableNumber` and a persisted
  key the POST body has BOTH; with neither, no `qrCode`. _Mutants:_
  `session-route/claim-finds-by-token` · `sticker-finds-by-token` · `collision-re-read-by-token` ·
  `reserved-prior-code-binds` · `number-found-reserved-joined`; `seated/claim-mints-over-an-unbound-table` ·
  `claim-binds-a-guest` · `claim-rebinds-a-bound-table`; `use-table-session/claim-drops-the-persisted-code`.
- **D26 — the register finds by NUMBER and converges; an inactive table is refused; no new copy
  otherwise.** `register.ts:98-159`: the registry read selects `active` and refuses `!reg.active` with
  "Table N isn’t active." (the mint requires `active = true` on both arms, `route.ts:92,106`; the register
  reads without it, `:102-106`); `sweepExpiredOnTable(n)` beside the token sweep; the find (`:119-126`) →
  `seatedSessionFor(db, n)` → existing → `ensureOpenCart`, `created: false` (`CounterMint.tsx:202-207`
  re-arms the pane with the number — staff open the diners' ledger, never a second one); the insert
  unchanged; the 23505 re-read (`:141-151`) → `seatedSessionFor(n)`. The 3B row's "register refusal" is a
  CONVERGENCE (`register.ts:96`'s own docblock); a bound table never shows a Start tile
  (`floor-rows.ts:69-82`). _Tests:_ `register.test.ts` gains its first `describe("startTable")` — the find
  carries `eq("table_number", n)` and never `eq("qr_code")` before the insert; found → `created:false`, no
  insert; 23505 → re-read by number; the sweep carries number + `lte expires_at`; inactive → refused
  before any `table_sessions` query; the insert payload byte-identical. _Mutants:_
  `register/start-finds-by-token` · `start-collision-reads-by-token` · `start-sweeps-by-token` ·
  `start-ignores-inactive`.

| Race (authority)                                                                              | Outcome                                                                                                                                                                                                                                                                                | Guard                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Two hosts bind N at once · the same host binds N in two tabs                                  | the first UPDATE lands; a second session's 23505 → `seated` → the inline join form; the same session's 0-row re-read → `ok, already`, one `touchCart`                                                                                                                                  | D22 index · `bind-table/collision-reads-as-landed` · `zero-rows-reads-as-landed` · SQL case 1 |
| Host binds N, THEN a companion scans N's sticker                                              | `findActive(token)` misses → `seatedSessionFor(N)` → the host's session; membership + expiry slide; the companion persists the host's code — sticker and invite reach ONE party                                                                                                        | route test (f) · `session-route/sticker-finds-by-token`                                       |
| Companion scans N FIRST (token session, companion = host), THEN the diner with drafts binds N | 23505 → `seated` → `JOIN_COPY` inline + the drafts note; joining mints a guest membership there; the unbound cart's drafts are never fired (host-gated, `cart.ts:280`) and age out, or staff merge from the floor — never from a phone                                                 | D24 · `Checkout.bind.test` seated case                                                        |
| A bind races the register's Start on N                                                        | bind wins → `startTable`'s 23505 re-reads by number and converges (`created:false` re-arms the pane); staff win → the bind reads `seated`, the staff row is hostless and token-keyed, the drafts stay on the unbound cart (one UPDATE wide)                                            | `register/start-collision-reads-by-token` · owner question 7                                  |
| An expired-but-active row holds N and the cron has not run                                    | every number-stamping writer sweeps it first → the write lands; a LIVE row is never swept                                                                                                                                                                                              | `bind-table/sweep-keyed-on-the-token` · `sweep-closes-a-live-table` · `seated/expired-…`      |
| A bind after a peer's create-intent lock / during a fresh split freeze                        | `locked` / `settling` before any write; the fulfillment snapshot keeps the number the charge began with                                                                                                                                                                                | `bind-table/locked-binds` · `settling-binds`                                                  |
| A bind on a session that expired a second ago                                                 | `session_expired`; the provider's `revalidate()` re-mints the persisted code → the token sweep closes it → a FRESH unbound session; the old cart's drafts are gone — today's expiry behaviour, named                                                                                   | `bind-table/bind-slides-the-expiry`                                                           |
| A reload after the bind with the old key · the home card `?resume=1&table=N`                  | `findActive(code)` rejoins with `tableNumber` N (`route.ts:386`); the card's claim → `seatedSessionFor(N)` → the W5a member check converges — no 409 to its own host                                                                                                                   | D21 · route test (a) · `session-route/claim-finds-by-token`                                   |
| A forged `tableNumber` · a guest POSTs `bindTable`                                            | Zod (1..99) · the registry's `active=true` read with `route.ts:96`'s sentence · the FK 23503 → `unavailable`; a guest → `not_host` before any write                                                                                                                                    | `bind-table/forged-number-trusted` · `guest-binds`                                            |
| J33 — an UNBOUND live phone taps Open chip M on the to-go grid                                | `?table=M` + the persisted code → `claimDisposition` "bind" → the session is bound to M, drafts intact, the dine-in menu rejoins it; M seated meanwhile → the shipped 409                                                                                                              | `seated/claim-mints-over-an-unbound-table` · route test (b)                                   |
| J33 — a BOUND phone (at 7) taps 9                                                             | 7 reads "Your table" and resumes by number; 9 mints a second session (several memberships are allowed) and 7 keeps its card — nothing orphaned. Re-filed with the W20 reason                                                                                                           | `TableGrid.test` "YOUR table resumes" · owner question 6                                      |
| Kiosk dine-in claim on N bound by a phone                                                     | the pre-read says `occupied`; on the insert race, 23505 → `seatedSessionFor(N)` → `occupied`, never six regenerations                                                                                                                                                                  | `kiosk/occupied-table-still-claimed` · `kiosk/number-collision-regenerates`                   |
| A paid-and-left party's session is still active (≤4 h, not cleared); the next party binds N   | `seated` — the chip reads Seated as the picker does today; the sticker joins the OLD session; turnover is staff's Clear or the cron                                                                                                                                                    | pre-existing · owner question 8                                                               |
| M258 — host A taps Undo while guest B's create-intent locks                                   | B's lock commits first → A's RPC sees a FRESH lock → 0 rows → "That’s already with the kitchen — ask a server to change it." (`cart.ts:347`); the lines stay fired, B's charge covers dishes the kitchen cooks. A commits first → B's post-lock draft read (`create-intent:214`) → 409 | D29 battery `undo/locked-cart-undone` · `checkout-stage/*`                                    |
| M258 — a stale lock (pay tab closed 6 min ago); the host sends and undoes within 10 s         | the batch reverses — both layers read the lock as stale                                                                                                                                                                                                                                | battery `undo/stale-lock-blocks-undo`                                                         |
| M258 — the undo statement began before B's lock committed                                     | the undo's `FROM qr_carts c` reads its SNAPSHOT and locks nothing (`20260929000000:20-30` says why a predicate alone does not serialize) — a window one statement wide, STATED in the migration header and the M258 row, never claimed closed                                          | owner question 1 (the row lock)                                                               |

### Send-time UX (Slice B)

- **D27 — the first Send on an unbound session opens the table sheet; the hero stays Send; a chip binds
  THEN sends in one gesture; dismissal keeps every draft; `/dine-in` retires from the walk.**
  `lib/table-pick.ts` gains `sendNeedsTable({ isDineIn, tableNumber, tables })` = `isDineIn && tableNumber
=== null && tables.length > 0` — an EMPTY or failed registry never asks a question with no answers; the
  send proceeds UNBOUND exactly as today (`TableGrid.tsx:86-98`'s "never dead-end the dine-in door"; the
  KDS labels by code, `kitchen.ts:361-362`). `app/cart/page.tsx` passes `tables` only when `split?.mode ===
"dinein" && view.tableNumber == null` (an RSC read, tokens stripped). `SendToKitchenButton` gains
  `onNeedTable?`; `send()` keeps the frozen refusal FIRST (`:74-78`), then calls it and RETURNS before
  `sendToKitchen`. NEW `components/TableBindSheet.tsx`: `<Sheet title={t("en","pickYourTable")}
busy={binding}>` hosting NEW `components/TableSection.tsx` — heading (both tongues), sub-line (D28),
  `TableGrid`, the inline `JOIN_COPY` form — extracted VERBATIM from `DoorSheet.tsx:227-297` so the two hosts
  cannot drift. `TableGrid` gains `onClaim?(n)`, `onPlain?()` (given, the chip calls them instead of
  navigating, `:69-84`), `markMine={false}` in the send sheet (a "pick up where you left off" chip whose
  bind would answer `seated` is a promise the code cannot keep) and `tablePlainLabel(source)`. Chip: `r =
await boundWrite(bindTable(cartId, n))` (`bounded-write.ts:68`; `busy` cleared in `finally`; the caller
  joins `sheet-busy-callers.test.ts:572`'s GUARDED list) → ok → `setTableNumber(n)`, close, then the SAME
  `send()` AWAITED and serialized; `seated` → that chip flips to Seated and the inline join form reveals
  with focus in the input (`DoorSheet.tsx:113-115`) plus the drafts note when `kitchenDraftQty > 0`; any
  other refusal → its sentence after the close (D28), sheet open; dismiss (Esc · ✕ · scrim) → nothing
  called, drafts untouched, hero still `send`, focus back on Send; "Send anyway" → `sentAnyway` for this
  mount, close, `send()`. `orderStageHero` is UNCHANGED (`checkout-verb.ts:42-44`): one `.checkout-cta`;
  "Pick your table" is the Send's question, never a verb (D13). Doors: `doors.ts:35` → the LITERAL
  `"/menu?mode=dinein&door=dinein"` pinned by `expect(href).toBe(dineInMenuHref({}))` (doors cannot import
  table-pick — `table-pick.ts:1` imports doors); `app/(order)/dine-in/page.tsx` → `redirect(...)` (the
  route stays: `manifest.ts:65` and `ActiveOrderProvider.tsx:158-163` read the path); `TablePicker.tsx`
  deleted. `DoorSheet` behaviour UNCHANGED: `tableGridOffered` mode-only with its mutant,
  `DoorSheet.test.tsx:378-392` stays law, its Dine-in row follows `DOORS` (`DoorSheet.test.tsx:83-84`). Who
  never sees the sheet: a sticker scan and a `?table` claim (`route.ts:101-109`, `:207`), a staff-started
  table, a kiosk claim, an invite joiner (guests never send, `cart.ts:280`). _Tests:_ `table-pick.test.ts`
  — `sendNeedsTable` four arms; `tablePlainLabel("send")` = "Not at a numbered table? Send anyway",
  `("page"|"sheet")` = the shipped sibling; `DOORS` href equality. NEW `Checkout.bind.test.tsx` (jsdom, the
  `Checkout.grace.test.tsx` harness, `tableNumber null` + `tables`): unbound → Send opens a dialog named
  "Pick your table", `sendToKitchen` NOT called, one `.checkout-cta`; chip 5 → `bindTable(cartId, 5)`
  resolves THEN `sendToKitchen(cartId)` (one shared spy; nothing while the bind pends; the sheet busy);
  `seated` → the join form, `activeElement` the code input, the drafts note, no send; Esc → no calls,
  focus on Send, items unchanged; "Send anyway" → send, no re-ask this mount; frozen → `FROZEN_NOTE`, no
  sheet; bound (7) → no dialog; after ok the eyebrow reads "Table 5"; exactly one `[role=status]` in the
  view. `TableGrid.test.tsx` — `onClaim` → `router.push` NOT called; `markMine={false}` → never "Your
  table". A `/dine-in` redirect test; `DoorSheet.test.tsx` green with the extracted section. _Mutants:_
  `table-pick/send-skips-the-table-ask` · `bound-table-asked-again` · `empty-registry-asks-anyway` ·
  `send-sheet-says-start`; `checkout-bind/send-runs-before-the-bind-lands` · `dismiss-sends` ·
  `seated-claims-again` · `ask-is-a-second-hero`; `send-button/sheet-opens-under-a-freeze` ·
  `unbound-send-reaches-the-server`; `table-grid/claim-override-ignored` · `mine-marked-in-the-send-sheet`.

**The tap walk (first-timer, no sticker, two one-tap dishes — `MenuBrowser.tsx:914-930` — card pay).**
_Before (`PHASE3_JOURNEYS.md:19`):_ (1) Home → Dine-in (`doors.ts:35` → `/dine-in`); (2) "Which table are
you at?" → an Open chip (`TableGrid.tsx:69-77`) — at a Seated table the code wall, Sheet + typing + Join
BEFORE any dish (`TablePicker.tsx:58-104`); (3)(4) Add, Add; (5) the Order tab; (6) "Send to kitchen · 2
items" → the 10 s grace, Pay held; (7) the Total door; (8) Pay; (9) the Payment Element's confirm. **= 9
taps + 10 s.** Sticker: 7. _After:_ (1) Home → Dine-in → the MENU (D27; the bare host-start or the
persisted rejoin); (2)(3) Add, Add; (4) the Order tab; (5) "Send to kitchen · 2 items" → the sheet, no
round trip; (6) an Open chip → bind lands → the same send → the 10 s grace (a Seated chip reveals the join
form HERE — the code wall moves to the moment it matters, only for a seated table); (7) the Total door;
(8) Pay; (9) confirm. **= 9 taps + 10 s — unchanged; what moves:** taps before the first dish 2 → 1, taps
about tables before the first dish 1 → 0, a browse that never binds or blocks a number, the code wall
deferred and conditional, the home-card resume no longer 409ing its own host. Sticker: 7 → 7. The 10 s is
D16's (the owner's default). A chip that fired the kitchen with no Send tap would make a table pick the
sending verb (D13 forbids it); a two-tap shape is 10 and is owner question 2.

- **D28 — copy and a11y: named by its title, said after it unmounts, one focus owner per edge.** TITLE:
  `t("en"|"my","pickYourTable")` = "Pick your table" / "စားပွဲ ရွေး" (`common.ts:40`, v7.2:495 verbatim) as the
  Sheet's `title` — bilingual by construction, never TablePicker's EN-only h1 (its Burmese belongs to the
  SUB-line, `TablePicker.tsx:43-51`). SUB (NEW EN, this sheet only — the DoorSheet keeps `:239`): "Pick
  where you’re sitting — your order goes to the kitchen right after." · MY **K15 draft:** "ထိုင်နေတဲ့
  စားပွဲကို ရွေးပါ — ရွေးပြီးတာနဲ့ အော်ဒါက မီးဖိုချောင်ဆီ ရောက်သွားပါမယ်။" (the shipped "Scan your table’s sticker, or
  pick your number." is REFUSED here: a `?t=` from `/cart` drops the persisted key at
  `useTableSession.ts:57` and mints a second session over the drafts about to be sent — both judges'
  law). CHIPS: `tableChipWord`/`tableChipLabel` verbatim (`table-pick.ts:41-62`); the list `aria-label
"Choose your table"` (`TableGrid.tsx:102`); `.table-chip` min-height 88px (`globals.css:7327`), RM-none;
  `stagger={false}`. SEATED chip: `JOIN_COPY` verbatim (`table-pick.ts:94-104`) in the INLINE form, the chip
  a disclosure (`aria-expanded`/`aria-controls`, the DoorSheet idiom) — never native `disabled` on any
  chip; the drafts note under the form only when drafts exist (NEW EN, EN-only like the grid's siblings,
  ledgered): "Joining puts you on their order — the dishes you added here won’t come along." ESCAPE: "Not
  at a numbered table? Send anyway" (`tablePlainLabel("send")`, the sibling of `TableGrid.tsx:143`).
  REFUSALS, verbatim where shipped: `seated` → "That table was just seated — join with the party’s code,
  or pick another." (`route.ts:157`, named once as `BIND_COPY.seated` in lib/table-pick and imported by
  the route); `unavailable` → "That table isn’t available — scan its sticker or pick another."
  (`route.ts:96`); `locked` / `settling` / `not_host` / `rate_limited` / `error` → `reasonCopy` verbatim
  (`useUndoGrace.ts:107-130`; a bind that fails is a send that did not happen, so `error`'s sentence is
  true); `already_bound` (NEW EN): "You’re at Table {M} — this order goes there." SUCCESS: no sentence of
  its own — `sentCopy(res.fired)` EN + the owner's MY (`confirm-copy.ts:66-71`) speaks and the eyebrow
  "Table N" appears (D30). THE REGION: the sheet carries NO `aria-live`/`role=status` (`DoorSheet.tsx:61`);
  a sentence written while the modal is open sits under Radix's `aria-hidden`, and `onCloseAutoFocus`
  fires at UNMOUNT after the CSS exit (`sheet.tsx:37-41`) — so the button STASHES the pending sentence and
  says it through `sayOutcome` (`Checkout.tsx:873-890`) in that handler; on the SUCCESS edge
  `e.preventDefault()` AND an explicit focus on the Undo after unmount (the grace's open-edge effect at
  `useUndoGrace.ts:235-241` may fire under the modal's trap; the Send node is gone — J21's shape,
  `sheet.tsx:92-96`); on dismissal/refusal the primitive's default restore to Send (`sheet.tsx:227-255`).
  `table_picked` keeps `source: "send"`; `mode_selected` does NOT fire (no door entered). Register (D26):
  "Table N isn’t active." beside the shipped `register.ts:108`. **K15 ledger — ONE row:** one MY draft (the
  sub-line); EN-only gaps for the native round — the chip words, "Start anyway" / "Send anyway", the bind
  refusals, the drafts note, `already_bound`, and the DEAD string "Your party’s table is open"
  (`HomeSessionCard.tsx:38`, unreachable under `:26`). _Tests:_ `Checkout.bind.test.tsx` /
  `SendToKitchenButton.test.tsx` — the dialog's name is both tongues with `lang="my"`; no `[aria-live]`
  inside the sheet; a `seated` refusal reaches the region only after `onCloseAutoFocus`; success prevents
  the default restore and `activeElement` is the Undo AFTER unmount; dismissal restores Send; seated chips
  are never `disabled`; refusal sentences pasted from `route.ts:96,157`, never typed. _Mutants:_
  `send-button/refusal-said-under-the-scrim` · `success-restores-focus-to-a-detached-send` ·
  `seated-chip-natively-disabled`.
- **D29 — M258: `mms_undo_fire` refuses under a FRESH pay lock or a FRESH split freeze, in the SQL's own
  idiom; the body restated in full; the "in grace blocks pay" predicate stays filed.**
  `supabase/migrations/20261006000100_m258_undo_fire_lock_guard.sql`: `create or replace function
public.mms_undo_fire(p_cart_id uuid, p_batch uuid) returns integer` (same signature — the `(uuid)` overload
  is already dropped at `20260624030000:115`; `database.types.ts:2236` unchanged), the body of `:116-134`
  restated in full with two conjuncts after `c.status = 'open'`: `and not (c.locked and c.locked_at >
now() - interval '5 minutes')` and `and (c.settle_at is null or c.settle_at <= now() - interval '10
minutes')` — the literals `mms_void_line` (`20260622090000:112-115`) and `mms_counter_no_show`
  (`20261001000000:256-260`) carry, mirroring `lock-ttl.ts:32,38` and `authz.ts:185-192`; revoke/grant
  restated (`:135-136`). The row's bare `and c.locked = false` is REJECTED: `locked` is sticky (`lock.ts:110`
  takes a stale lock OVER; `authz.ts:185-188` ignores it), so an abandoned pay tab would block every later
  undo and `cart.ts:347` would say "already with the kitchen" over lines the kitchen never saw. **No `for
update` by default** (both judges' letter; `20260929000000:33-37`'s "fires never lock the cart" stays
  true) — and the residual is STATED: the UPDATE's `FROM qr_carts c` reads its snapshot and locks nothing,
  so a lock committing after the snapshot is invisible — one statement wide, the shape
  `20260929000000:20-30` describes; the counter twin takes `perform 1 from public.qr_carts … for update`
  first (`20261001000000:171`) for exactly this reason. Upgrading to that lock (cart → line, the order every
  settlement uses) is **owner question 1**, recommended, with the 20260929 prose restated and the lock
  listed as a two-session survivor as the battery lists the counter undo's. The TS stays: a lock-refused 0
  rows reads `expired` — true in effect; naming the lock needs a return-shape change (nice-to-do). THE
  IN-GRACE PREDICATE stays filed: it would 409 a GUEST's legitimate pay for ≤10 s after every host send
  with no money benefit — with the guard, whichever side wins, the charge equals the cart and nothing is
  cooked as paid without a send. `mms_fire_cart` untouched. _Tests:_
  `supabase/tests/m258_undo_fire_lock_guard_test.sql` (rolled back, `check_asserts` on, the
  `staff_fire_undo_test.sql:30-66` fixture shape): M1 fire two drafts → `locked=true, locked_at=now()` →
  undo = 0, both lines still `fired` with the batch; M2 `locked_at = now() - '6 minutes'` → undo = 2 (the
  legitimate undo the strict form over-blocks — W17's rule); M3 unlocked → 2; M4 `settle_at = now()` → 0;
  M5 `settle_at = now() - '11 minutes'` → reverses; M6 `has_function_privilege('anon', …, 'execute')`
  false, `service_role` true; `staff_fire_undo_test.sql` cases 1–7 stay green. Appended to `ci.yml:233`.
  _Battery:_ `verify-mode-authority.mjs` gains suite `p3c2` `{ migration, test }` appended LAST to CHAIN
  (`:129`), `mms_undo_fire` added to TARGETS (`:1674-1691`; the drift abort at `:1725-1740` requires its
  last definer in the chain), four rows: `undo/locked-cart-undone` (expect M1) · `undo/stale-lock-blocks-undo`
  (the leg → bare `c.locked = false`, expect M2) · `undo/settling-cart-undone` (M4) ·
  `undo/settle-window-widened` (`'10'` → `'60 minutes'`, M5); `ci.yml:280`'s comment re-measured with
  `grep -c 'id: "'` (130 today).
- **D30 — the table number is LIVE on every surface: one binding per surface, read from the latest
  confirmed value.** `/cart`: `tableNumber` becomes state seeded from the prop (renamed
  `initialTableNumber`, the `initialLocked` idiom `:261-265`), written by `applyCartView` from
  `v.tableNumber` (`cart.ts:768`) and by the bind's CONFIRMED answer (the CAS count or the re-read, never
  before); the eyebrow (`:2596`), the counter card (`:3980`) and `sendNeedsTable` read it, so the NEXT send
  never asks. `/menu`: the provider's context (`TableCartProvider.tsx:1605`) becomes `viewTable ??
session?.tableNumber ?? null`, `applyView` (`:404-470`) writing `viewTable` on every applied view including
  the realtime echo — the bind's `touchCart` moves `qr_carts.updated_at`, every phone's watch re-reads
  (`realtime.ts:179-183`), and the DoorSheet trigger (`DoorSheet.tsx:110`), GuestList's "Table N ·"
  (`GuestList.tsx:220`) and InviteSheet's "Table N code" (`InviteSheet.tsx:82`) flip without a remount; a
  null view after a known number never un-names the table. The number is READ (mint · view · bind), never
  derived. _Tests:_ `Checkout.bind.test.tsx` — a bind lands → "Table 5", the next Send does not ask; a
  refresh carrying a tablemate's bind updates it; `Checkout.test.tsx:1531-1532` under the renamed prop
  (red-first); `TableCartProvider.test.tsx` — a mint with null then a view with 7 → `useCart().tableNumber
=== 7`; a later null view keeps 7. _Mutants:_ `checkout-bind/bill-keeps-the-stale-null` ·
  `checkout-bind/bind-not-recorded` · `provider/table-number-frozen-at-mint` ·
  `provider/view-null-unnames-the-table`.

## The build — two disjoint worktree slices

Both land on the merged 3c-i head (`686facd`); the lead integrates. **Shared by neither slice (the lead's
integration commit):** `scripts/verify-slice.mjs` (every mutant above), `scripts/verify-mode-authority.mjs`
(the `p3c2` suite), `.github/workflows/ci.yml:233` (two test files) and `:280`, CLAUDE.md's enumeration,
`docs/OPEN-ITEMS.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/PHASE3_JOURNEYS.md`, `docs/DESIGN-LANGUAGE.md` §33,
`docs/HANDOFF.md`. Review lenses for the blind pass: **money semantics · concurrency · product truth** (≤3
lenses, ≤10 agents, ~15 min — the HARD CAP).

### Slice A — `authority` · the number as an identity (D21–D26, D29)

- **Files (owned):** `supabase/migrations/20261006000000_p3c2_table_number_uniq.sql` +
  `supabase/tests/p3c2_table_number_uniq_test.sql`;
  `supabase/migrations/20261006000100_m258_undo_fire_lock_guard.sql` +
  `supabase/tests/m258_undo_fire_lock_guard_test.sql`; `apps/qr/lib/seated.ts` + `seated.test.ts`;
  `lib/bind-table.ts` + test; `lib/tables.ts` + `tables.test.ts` (new); `lib/kiosk.ts` + test;
  `lib/register.ts` + test; `app/api/session/route.ts` + `route.test.ts` (filter-aware mock);
  `lib/useTableSession.ts` (`:147-150` only) + `useTableSession.test.tsx` (new);
  `packages/db/src/schemas.ts` (`bindTableInput`). Stamps match `check-migration-versions.mjs:45`'s SHAPE
  and are distinct (the latest on disk is `20261001000000`).
- **Laws:** `authz.ts` UNTOUCHED; the kiosk's `if (occupied)` line byte-identical; `mms_fire_cart`'s WHERE
  untouched; the bind writes ONE column; no merge, eviction, membership or expiry in any payload; a read
  error THROWS; every 23505 by number; the migration RAISES on live duplicates and closes only expired
  rows; the undo guard is the two-leg freshness idiom, body restated in full, grants restated; nothing
  applied to prod from the session.
- **Red-first:** every suite watched fail against a stub; the index proof by hand on the un-migrated local
  stack (CI-only — no Docker here; said in both test headers as `staff_fire_undo_test.sql:24-25` says it);
  the battery's four rows each green-baseline → md5 changed → the NAMED case fails → byte-identical
  restore. `check:mutant-anchors` before any `verify:slice` run.
- **Must not touch:** `components/**`, `app/cart/page.tsx`, `app/(order)/**`, `lib/table-pick.ts`,
  `lib/doors.ts`, `lib/i18n/**`, `globals.css` — Slice B's.

### Slice B — `bind-ux` · the Send-time sheet (D27, D28, D30)

- **Files (owned):** `components/TableBindSheet.tsx` (new) + test; `components/TableSection.tsx`
  (extracted from `DoorSheet.tsx:227-297`) + test; `DoorSheet.tsx` + test; `TableGrid.tsx` + test;
  `TablePicker.tsx` (deleted); `SendToKitchenButton.tsx` + test; `Checkout.tsx` (`tableNumber` state, the
  gate, the sheet, `applyCartView`) + `Checkout.test.tsx` + `Checkout.bind.test.tsx` (new);
  `TableCartProvider.tsx` (`viewTable`) + test; `useUndoGrace.ts` (`reasonCopy` gains `seated` ·
  `unavailable` · `already_bound`); `app/cart/page.tsx` (`tables`); `app/(order)/dine-in/page.tsx`
  (redirect); `lib/doors.ts:35`; `lib/table-pick.ts` + test (`sendNeedsTable`, `tablePlainLabel`,
  `BIND_COPY`); `lib/i18n/cart.ts` (the one draft, flagged `// K15 draft (3c-ii)`);
  `lib/sheet-busy-callers.test.ts` (GUARDED gains `TableBindSheet.tsx`). **No `globals.css`** — reuse
  `.table-grid`/`.table-chip*` (`:7324-7416`), `.door-sheet-*`, the primitive; a missing rule is a one-line
  note to the lead.
- **States (dine-in `/cart`, Order stage):** unbound·host·drafts → hero Send; tap → the sheet; chip → bind
  - send → Undo hero, focus on Undo, eyebrow "Table N"; seated chip → inline join (+ the drafts note);
    "Send anyway" → today's unbound send; Esc → nothing; frozen → `FROZEN_NOTE`, no sheet; registry `[]` → no
    sheet. Bound (sticker · claim · staff-started · kiosk · after a bind) → never the sheet. Guest → the host
    note (`Checkout.tsx:3861-3872`). Bill · pay · settle · counter-ask unchanged. `/menu`: DoorSheet
    unchanged in behaviour (its Dine-in row links the menu); the trigger flips to "At table N" on the echo.
    Home: the Dine-in card enters the menu; `JoinTable` and `HomeSessionCard` unchanged (owner question 4).
- **Laws:** the mint is Slice A's (`useTableSession.ts`, `route.ts` OFF LIMITS — `bindTable` mocked by
  import); the hero never gains a verb; the bind awaited before the send, asserted on mock resolution
  order; the sheet has no region; everything said after unmount; `busy` bounded and finally-cleared; the
  number lands on screen only from the confirmed answer; chips ≥44px, no stagger, nothing new animates;
  every EN string pasted, one K15 draft; `mode_selected` never fires from the sheet.
- **Must not touch:** `supabase/**`, `lib/seated.ts`, `lib/bind-table.ts`, `lib/tables.ts`, `lib/kiosk.ts`,
  `lib/register.ts`, `lib/authz.ts`, `app/api/**`, `useTableSession.ts`, `schemas.ts` — Slice A's.

### Bookkeeping (every push, lead)

`pnpm check:docs` (step ONE; refresh counts) · `check:migration-versions` · `check:mutant-anchors` (the
`Checkout.tsx` anchors around `:247-273` and `:3840-3856`, the `SendToKitchenButton` anchors;
`table-pick/grid-offered-at-table` stays anchored) · `check:style-literals` · `check:scan-repeat` ·
`check:freeze-parity` · `check:pay-attempt` · `pnpm turbo lint typecheck build test` · `pnpm verify:slice`
ONCE on the merge head, watched to the end (`ps -eo pid,comm,args | awk '$2=="node" &&
/verify-slice\.mjs/'` first; never commit during a run — LEARNINGS #74). Then: every mutant above into
`verify-slice.mjs`; **CLAUDE.md's mutate-set enumeration MEASURED** with the prescribed grep (258 today =
lib 175 · api 4 · components 76 · css 1 · staff page 1 · schemas 1; expected after: lib +3 `seated.ts` ·
`bind-table.ts` · `tables.ts`, api +1 `session/route.ts`, components +2 `TableBindSheet.tsx` ·
`TableSection.tsx` — never read these off this line); `docs/OPEN-ITEMS.md`: J22 closed (browse first,
bound at Send); J33 → unbound half closed (D25), bound half re-filed with the W20 reason; M258 → "filed as
a migration; apply blocked on M125; the in-grace half retired", its retired-mutant citation corrected; NEW
rows at the next numbers measured at write time (today's max: M259 · J37 · C26) — the index apply
(blocked on M125), the undo row-lock upgrade (owner question 1), a turnover auto-close M-row, a
merge-along-from-a-phone J-row, the K15 ledger row; `CHANGELOG.md` "Phase 3c-ii"; `ROADMAP.md:445` box;
`docs/PHASE3_JOURNEYS.md:67` row 3c; `docs/DESIGN-LANGUAGE.md` **§33 — the table is bound at SEND; one
predicate for a seat; a grid is offered only off the table — and inside the Send, once, on an unbound
session**; `docs/HANDOFF.md`. Then the ritual: `pnpm review:bundle` → blind pass → draft PR → `@codex
review` → mark ready → WAIT, event-driven, for "Codex has reviewed" the merge head → fix-or-justify (two
rounds) → merge.

### Out of scope (this PR)

A diner re-bind ("wrong table") and a staff "move to table N" (a server does it; the merge is the only
move). A merge-along onto a seated table's cart, or a diner-side replay of orphaned drafts through
`addItem` — filed. A Pay gate on an unbound dine-in session (an all-to-go dine-in cart pays unbound as
today). A bind from the to-go sheet (J33's unbound half is server-side). A server "in grace blocks pay"
predicate (D29). A home card for an UNBOUND session. `/api/tables` for the market. The `status='locked'`
blind spot (named, not widened). Every amount, tip cap, promo pin and tax rule.

### Dependencies · risks

- **Owner, numbered (the default taken in each):** (1) `mms_undo_fire`'s row lock — ship the freshness
  predicate alone (default, both judges' letter) or ALSO `perform 1 from public.qr_carts where id =
p_cart_id for update` first (the counter twin's line; closes the one-statement window; restates
  `20260929000000:33-37`; the lock becomes a two-session survivor) — recommended. (2) ONE gesture at the
  chip (bind + send, 9 taps, the 10 s undo as the net) — default; a second Send tap is 10. (3) "Send
  anyway" stays (default): a numberless ticket reads its code; removing it makes a registry outage a dead
  end. (4) No home card for an UNBOUND session with items (a card keyed on a clearable device key could
  mint an empty session, `HomeSessionCard.tsx:22-26`). (5) `status='locked'` (no writer): both partial
  indexes stay `where status = 'active'`; a future writer widens both, `seatedSessionFor`, `findActive` and
  the sweeps together. (6) J33's bound half: a phone at 7 may still start 9 from the to-go grid (several
  memberships; W20 keeps "leave" device-only) — re-filed, not refused. (7) Bind-vs-Start where staff win:
  the drafts stay on the unbound cart until a scan claims the hostless row — accepted, one UPDATE wide.
  (8) Turnover: a paid-and-left party holds its number ≤4 h unless cleared — an "auto-close N min after
  full settlement" M-row. (9) Apply order: M258's file first (independent, high), then the index after
  the owner measures prod for live duplicates (`select table_number, count(*) from table_sessions where
status='active' and mode='dinein' and table_number is not null group by 1 having count(*) > 1`); the TS
  ships before either apply — the pre-reads decide the common path, only simultaneous writes stay open
  until the index lands. (10) K15 (Min): one draft (the sub-line), one ledger row.
- **Blast radius:** `Checkout.tsx` (46 live mutants) — the gate lives in lib, `check:mutant-anchors` after
  every edit; `route.ts` has ZERO mutants and a filter-blind mock — the new cases are the first that can
  tell a number-keyed read from a token-keyed one; `useTableSession.ts:150` is W9a-sensitive and gets its
  first suite; `DoorSheet.tsx` is pinned — the section is extracted byte-for-byte.
- **Deploy before apply:** without the index two simultaneous binds could double-seat (today's "data
  anomaly", `floor-rows.ts:49-51`) until the owner applies the file; the RAISE then names them.
- **Two service-role reads** per `/cart` render on an unbound dine-in session (the pair the to-go menu
  already makes); measure TTFB on the preview.
- **Mutate-set files touched** (Checkout, SendToKitchenButton, TableCartProvider, register, kiosk,
  schemas, route) — commit before any `verify:slice` run, never during.

## Scoring (RUBRIC J-axes, self-scored, before → after 3c-ii)

| Path    | J-B progress clarity | J-C effort | J-E dead-time | J-F recognition | J-G recovery | Note                                                                                                                                                              |
| ------- | -------------------- | ---------- | ------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dine-in | 4.7 → 4.8            | 4.2 → 4.4  | 4.5 → 4.5     | 4.0 → 4.3       | 4.8 → 4.8    | the first screen is a dish; the table is asked where the kitchen needs it; the home card resumes a late-bound table by number; a seated refusal names its way out |
| To-go   | 4.5 → 4.5            | 4.2 → 4.2  | —             | —               | 4.7 → 4.8    | an Open chip from the to-go grid binds the live unbound session instead of orphaning its drafts (J33's unbound half)                                              |

Honest about what does not move: the first-timer's 9 taps stay 9 — the question moves, it does not
vanish; the 10 s wait is D16's; the sticker path is 7 either way. M258's residual is one statement wide
and is stated, not hidden (owner question 1 closes it). J-A and J-D are unchanged; nothing new animates.
