# 🔬 W8 — Proof (the money-path test harness) → then W6a (the register)

**Plan-of-record for the next two slices.** Written 2026-07-31 after a full-repo audit of "what's left to
refine, is every customer path validated, are we ready for the staff/kiosk surface." Read this with
[`docs/HANDOFF.md`](HANDOFF.md) (current state), [`docs/OPEN-ITEMS.md`](OPEN-ITEMS.md) (the registry),
[`docs/PRODUCTION_PLAN.md`](PRODUCTION_PLAN.md) (the W-track), and `CLAUDE.md` (the loop + the gate).

---

## 0 · The finding that produced this plan

**No customer path is validated in any executable sense.** The whole monorepo has **5 test files**, and
none of them touch money, auth, or a customer journey:

| File                                               | What it covers        |
| -------------------------------------------------- | --------------------- |
| `packages/ui/src/__tests__/contrast-audit.test.ts` | token contrast matrix |
| `apps/qr/lib/avatars.test.ts`                      | seat colour/initial   |
| `apps/qr/lib/floor-pulse.test.ts`                  | floor pulse helper    |
| `apps/qr/lib/menu/upsell.test.ts`                  | upsell picker         |
| `apps/qr/lib/menu/modifiers.test.ts`               | modifier cardinality  |

Meanwhile the load-bearing modules have **zero** coverage: `lib/totals.ts` (the charge authority, 78 ln) ·
`lib/tax.ts` (40) · `lib/cart.ts` (609) · `lib/split-math.ts` (150) · `lib/split.ts` (249) ·
`lib/pickup.ts` (129) · `lib/authz.ts` (203) · `lib/permissions.ts` · `lib/staff-cart.ts` (525).
There is **no Playwright config and no `e2e/` directory** — zero end-to-end coverage of any journey.

Every validation to date has been **diff review + manual preview smoke** — reasoning, not execution. That
is exactly how the W5c near-miss happened: a per-part `tax_cents` change looked correct in review and
silently **over-charged** the whole line; a pre-merge reviewer caught it, not a test. The owner's stated
#1 frustration is regressions, and today nothing mechanically catches one.

**So: build the proof layer before the next money surface.** W6a (the register) is a _new money surface_
— landing it on an untested foundation repeats the W5c class of bug against a real counter transaction.

> **Why this is a W-track phase and not "just add some tests":** the point is not coverage percentage. It
> is to make the three invariants that CLAUDE.md declares load-bearing — server-authoritative pricing, the
> TS↔SQL tax parity, and the split cent-reconcile — **mechanically enforced** instead of review-enforced.

---

## 1 · Scope

**In (W8):**

- A pure-math seam under the charge authority + tests for it.
- TS↔SQL parity tests for the tax engine (the "keep them in sync" rule finally gets a gate).
- Cent-reconcile + allocation tests for split.
- Slot-grid + rollover tests for pickup (pins a LEARNINGS-recorded regression).
- The `state × role` authority matrix for `canMutateLine`.
- Pinning tests for three _known-open_ defects (M6 · M7 · M11) so their fix has a target and can't
  silently regress.

**Out (deliberately):**

- React component tests — no jsdom, no `@testing-library` apparatus until a component test genuinely
  earns it (the P5.5 "no speculative apparatus" call still holds).
- Coverage thresholds / mutation testing.
- Rewriting any money behaviour. **W8 changes no charged amount.** The only production-code change is a
  behaviour-preserving extraction (§2.1) — anything that would alter an amount is a finding to file in
  OPEN-ITEMS, not a fix to sneak in.

---

## 2 · W8 slices

### W8a — the pure seam + totals tests (the core slice)

**The blocker to test `getCartTotals` today:** it is `import "server-only"` and does its own fetching
(`serviceClient()` + `mms_promo_discount` + `mms_reward_discount` RPCs). Mocking a chained PostgREST
builder is brittle and tests the mock, not the math.

**Do this instead — extract, don't mock.** Split `apps/qr/lib/totals.ts` into:

```ts
// lib/totals-math.ts  — PURE. no server-only, no db, no I/O.
export type TotalsLine = {
  qty: number;
  unitPriceCents: number;
  taxCents: number;
  state: string;
  comped: boolean;
  fulfillment: "dinein" | "togo" | "grocery";
};
export function computeTotals(
  lines: TotalsLine[],
  promoCentsRaw: number,
  rewardCentsRaw: number,
  tipRate: number,
): CartTotals;
```

`getCartTotals` keeps its exact signature and doc comment, does the two RPC reads, and returns
`computeTotals(...)`. **Verify byte-equivalence of behaviour by reading the diff line-by-line** — the
extraction must move the arithmetic verbatim, including the `Math.round` placement and the clamp order
(promo clamps to subtotal; reward clamps to _remaining after promo_). Do not "tidy" while extracting.

Then `lib/totals-math.test.ts` asserts the invariants:

| #   | Invariant                                                                                                                  | Why it matters                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | voided **and** comped lines are excluded from subtotal, taxable base, and service base                                     | S2.3 — a comped line charged at $0 everywhere                                            |
| 2   | promo clamps to subtotal; reward clamps to `subtotal − promo`; combined discount never exceeds subtotal                    | no negative total                                                                        |
| 3   | tax = `round((taxableBase − discOnTaxable) × 0.0975)`, where `discOnTaxable` is pro-rated **by taxable share of subtotal** | CLAUDE.md: tax on the discounted taxable base, _not_ a pro-rata of the rounded aggregate |
| 4   | service base **excludes** `fulfillment === "grocery"`; discount pro-rated onto the service base the same way               | W1a — SB-1524 copy is false on retail lines                                              |
| 5   | `tipCents === 0` when the basket is pure grocery (`serviceBase === 0`), regardless of `tipRate`                            | W1a — forced server-side so every caller agrees                                          |
| 6   | `total === net + service + tax + tip`, all integer cents, for a randomised matrix of ~200 baskets                          | no float drift                                                                           |
| 7   | mixed taxable/exempt + flat promo produces the _same_ tax as hand-computed cents                                           | the exact case a pro-rata-of-aggregate bug would break                                   |

Plus **pinning tests for known-open defects**, each named for its OPEN-ITEMS id so the fix flips a
red/green pair rather than being invisible:

- `test("M6 (known-open): a sub-6¢ taxable line reads exempt", …)` — documents `tax_cents > 0` used as a
  boolean taxable flag.
- `test("M7 (known-open): aggregate order tax ≠ Σ per-unit line tax by ≤2¢", …)` — charge is correct,
  receipt display differs.

Wire `server-only` out of the way for any test that must import a server module:
`resolve.alias: { "server-only": path.resolve(__dirname, "test/stubs/empty.ts") }` in
`apps/qr/vitest.config.ts`. (Prefer extraction over aliasing — the alias exists for the few unavoidable
cases, not as the default.)

### W8b — tax TS↔SQL parity (the sync rule, enforced)

`lib/tax.ts` is the TS mirror of `mms_line_tax` / `mms_taxable` (`supabase/migrations/20260618000000_qr_platform_init.sql:14-39` — **not** `packages/db/migrations/0001`, which does not exist; CLAUDE.md carries the same stale reference). Nothing
checks they agree.

1. `lib/tax.test.ts` — the full matrix: 6 `TaxCategory` values × `dineIn ∈ {true,false}` for `isTaxable`,
   plus `lineTax` rounding at the `.5`-cent boundary and at 0.
2. `supabase/tests/tax_parity_test.sql` — the **same matrix** asserted against the SQL functions, run in
   the existing `migrations-check` CI job. **Correction (W8 build):** the step hard-coded ONE filename,
   so a new `.sql` would have passed by not existing — it is now a `nullglob` loop over
   `supabase/tests/*.sql` with a count floor. Every SQL test file must also `set local
plpgsql.check_asserts = on`, or every ASSERT compiles out and the file exits 0 having proved nothing.
3. Assert the **rate constant** matches on both sides (`0.0975`) — a rate change that lands on one side
   only is the highest-consequence drift.

This is the cheapest high-value slice in W8: it turns a comment ("Keep the TS and SQL in sync") into a
failing build.

### W8c — split cent-reconcile + authority matrix

`lib/split-math.ts` is already pure — no refactor needed.

- `allocate(total, weights)` — Σ output **always** `=== total` exactly (property test over randomised
  totals/weights incl. zero weights, single weight, all-zero weights); no negative allocations; largest
  remainder distribution is deterministic for a given input.
- `computeShares` / `deriveShareBreakdowns` — even and by-person modes; unassigned lines; a $0 share;
  a seat with only exempt lines; Σ(share totals) reconciles to the cart total to the cent.
- **Pinning test for M11 (known-open):** a grocery-only seat currently receives a pro-rata slice of the
  restaurant-only service charge. Assert the _current_ behaviour with the test named
  `M11 (known-open): grocery-only seat is allocated service charge` so the fix is a one-line flip.
- `lib/permissions.ts` `canMutateLine(lineState, actor, comped)` — the full `state × actor` matrix.
  **Correction (W8 build):** `settled` is NOT a `LineState`; the union is
  `draft | fired | in_progress | served | voided`, so the matrix is 5 × 5 × 2 = 50 cells, of which
  exactly 7 are allowed at `comped=false`. Post-fire
  must be staff-only; a comped line must be immutable to diners. This gate is what stops a guest silently
  mutating a fired ticket — it has never been tested.

### W8d — pickup slot grid (regression pin) — **SQL, not TS**

**Correction (W8 build):** `lib/pickup.ts` contains **zero arithmetic** — it is a 129-line RPC wrapper.
The whole grid lives in `supabase/migrations/20260620000300_pickup_slots_align_fix.sql:32-52`, so this
slice is a second file in `supabase/tests/`, not a TS extraction. Writing a TS mirror of the grid would
manufacture exactly the second drift surface W8b exists to close.

Pin, in `supabase/tests/pickup_slots_test.sql`: grid anchored at the stable day-open rather than
`now + lead` (the LEARNINGS-recorded regression); `lead_minutes >= prep_minutes` (the W5e config
CHECK); next-day rollover past close; capacity counting paid orders + live holds and excluding expired
ones; `excludeCart` removing the caller's own hold.

**Deferred out of the first W8 PR** — it needs a fixture harness for shop hours/timezone that the tax
parity file does not, and the two SQL findings it surfaced (`M18`, `M19`) are filed and independently
actionable.

### W8e — journey smoke (decide, don't assume)

**Recommendation: defer, and say so explicitly rather than half-building it.** A useful Playwright run
needs a live Supabase project + Stripe test keys + a seeded table session; the sandbox injects the
_delivery_ project's env (see §5), and preview/prod currently share one QR project with **live** Stripe
keys — so an e2e suite would either need its own project or would transact against live keys.

If the next session wants it anyway, the minimum honest version is **3 read-only smokes** (menu renders
per mode · `/track` renders a known paid order · `/grocery` browse renders) against the Vercel preview,
with **no** payment step, run manually rather than in CI. Anything more waits for a staging project
(already tracked as an open decision in HANDOFF "Open decisions"). **Do not** stand up a Playwright
harness that only exercises static pages and call the money path validated.

---

## 3 · W8 exit criteria

- `pnpm turbo lint typecheck build test` green; `test` already runs in CI's `verify` job — confirm the new
  suites actually execute there (a `*.test.ts` outside the `include` glob silently never runs).
- `supabase/tests/tax_parity_test.sql` runs in the `migrations-check` job and fails on induced drift —
  **prove it**: temporarily change the TS rate to `0.098`, watch it go red, revert.
- Every pinning test is named with its OPEN-ITEMS id and has a comment pointing at the row.
- `docs/OPEN-ITEMS.md` swept: close **T1** (added below), and annotate M6/M7/M11 with "pinned by test".
- `CHANGELOG.md` line · `ROADMAP.md` W8 box · `.claude/LEARNINGS.md` entry if anything non-obvious surfaced.
- Pre-PR sweep + **fresh-context adversarial subagent** (a11y · perf · security/privacy · product-UX),
  verdict posted as a PR comment. Then the pre-merge subagent pass. Per CLAUDE.md this in-session review
  **is** the gate — CI's `review`/`security`/`adversarial-pr` checks are zero-token green stubs.

**Estimated shape:** W8a is the substantive slice (extraction + ~7 invariants + 2 pins). W8b/c/d are each
small and independent. Reasonable as **one PR** (`claude/test/w8-money-proof`) if the extraction stays
clean; split W8a out first if the diff on `totals.ts` needs its own careful review.

---

## 4 · Then W6a — the register (front of house)

The plan-of-record text is [`docs/PRODUCTION_PLAN.md`](PRODUCTION_PLAN.md) §W6a; this is the build detail.

**Why it's next after W8:** today an order literally cannot exist without a diner scanning a sticker. A
walk-up or phone customer has **nowhere to go**. That is a daily operational hole, and it is bigger than
the kiosk (W6b), which is hardware-gated anyway (C7).

**Closes:** `K6` (high — no FOH register) · `K17` (staff add screen has no modifier picker).
**Does not close:** `S5`/`W6b` (kiosk shell) · `W6c`/M6·P6.2 (Terminal) · EBT (2027, FNS-gated).

### Four pieces

1. **Staff-minted sessions** — "Start a table / phone order / walk-up" from `/staff`. Reuse the existing
   mint (`POST /api/session`) rather than growing a second path; the cart must belong to the **table/order**,
   not a device (ORDER-MODEL). Phone orders are a `togo` fulfilment with the W3e first-name capture; walk-ups
   likewise. Decide and document what `qr_code` a staff-minted session gets — the partial unique index
   `table_sessions_active_qr_uniq` assumes one active session per code.
2. **Search + modifiers in the staff add screen** (`apps/qr/app/staff/table/[id]/add/page.tsx`) — it is one
   alphabetical scroll of base items today. Reuse the diner `ItemSheet`'s modifier-group read; `staffAddItem`
   (`lib/staff-cart.ts:64`) **deliberately skips cardinality** as a trusted path, so adding a picker means
   deciding whether staff adds now validate `min_select`/`max_select` or keep the trusted bypass. **Recommend:
   validate**, with an explicit staff override for "kitchen said yes" — K17 exists because modifier-less staff
   lines reach the kitchen ambiguous, and W5c made two drinks require Hot/Iced.
3. **Repeat-last-order** — note **M3 (open)**: order lines store modifier _labels_, not option ids, so a
   faithful re-price needs option-id capture on order snapshots (schema change). Either land that schema
   change as part of W6a or scope repeat-last-order to modifier-free re-adds and say which — **do not** ship
   a repeat that silently drops modifiers.
4. **End-of-day cash summary** (Z-report-lite) — read-only off `qr_orders` where `tender='cash'`, manager
   role-gated via `requireStaffPage()`. Read-only keeps it out of the money-mutation blast radius.

### Money/auth guardrails for W6a (CODEOWNERS-flagged surface)

- Pricing stays server-derived — the register sends item id + modifier option ids, never a price
  (`lib/order-lines.ts` `priceItem`/`insertOrIncLine` is the shared single source; do not fork it).
- Every new mutation: `requireStaff()` + the status guard **in the SQL statement**, Zod `.max()` **plus** a
  column `CHECK`, `mms_rate_limit` bucket, and any new `SECURITY DEFINER` fn `revoke … from public` +
  `grant … to service_role`.
- Respect the shared payment mutex (`lib/pay-guard.ts`) — a register write during a card/split payment
  must be refused, exactly as staff writes are today.
- Migration applied to **live** (`fasnpdhtvqtzjlvruqcu`) before merge — the PR preview shares the live DB,
  so a migration-requiring branch is broken on its preview until the additive migration lands (LEARNINGS
  #59). Run `get_advisors` (security + performance) after.
- **W8's harness is the point:** add the register's own money math to `totals-math.test.ts` / the SQL
  parity file in the _same_ PR.

---

## 5 · Environment + workflow facts the new session needs

- **Branch:** `claude/burmese-grocery-app-design-a6y81i` (this session's designated branch; repo convention
  is otherwise `claude/<type>/<slug>`). Never push to `main`.
- **Gate:** `pnpm turbo lint typecheck build` (+ `test`, already in the CI `verify` job).
- ⚠️ **The sandbox injects the DELIVERY project's Supabase env**, and Next lets real shell env override
  `.env.local`. Inline-override for anything local:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://fasnpdhtvqtzjlvruqcu.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
  pnpm --filter @mms/qr dev
  ```
- **Supabase MCP is scoped per `project_ref`** — target `fasnpdhtvqtzjlvruqcu` (QR), **not**
  `ukuzkhuppqwtrdkjqrkv` (delivery).
- **Vitest:** `apps/qr/vitest.config.ts` + `packages/ui/vitest.config.ts`, both **node env**, glob
  `**/*.test.ts`. A `.test.tsx` would not be picked up — that is intentional (no jsdom yet).
- **SQL tests** run in the `migrations-check` job after `supabase start`; `supabase/tests/README.md`
  documents the pattern, `rls_membership_test.sql` is the worked example.
- **Types:** regenerate via the pinned local CLI (2.107.0) — CI's `types-fresh` diffs byte-identical.
- **Review:** pre-PR sweep + fresh-context adversarial subagent, then again pre-merge, verdict posted as a
  PR comment. CI has no Claude review.

## 6 · Landmines (from LEARNINGS / recent slices)

- **Don't "fix" tax by storing a per-part `tax_cents`.** `getCartTotals` reads that field as a _boolean_
  taxable flag and taxes the full `unit_price_cents` — the W5c attempt did exactly this and over-charged
  the line. The real fix is a per-line taxable-base engine (its own milestone, see C11).
- **CI green ≠ applied to live.** Migrations must be applied to `fasnpdhtvqtzjlvruqcu` before merge.
- **A test file outside the vitest `include` glob passes silently by not existing.** Verify new suites
  appear in the run output, not just that the command exits 0.
- **Self-contained fixtures rot silently** — the delivery repo's `contrast-audit` fixture drift is the
  cautionary tale. Parse the source of truth where practical (QR's contrast-audit already parses
  `tokens.css`), rather than hardcoding values a later change won't invalidate.
- **Don't let the adversarial subagent be the first pass.** The recurring waste is a correct-but-incomplete
  first commit; sweep the diff against money/a11y/error-paths/copy before opening (CLAUDE.md).
