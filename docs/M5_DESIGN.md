# M5 design — QR learns from delivery (repos stay separate)

**Status: design of record (2026-06-24, reshaped).** Supersedes the original "migrate delivery into the
monorepo" plan (kept below for history). Companion to `ROADMAP.md` §M5, the transfer backlog
[`docs/QR_FROM_DELIVERY.md`](QR_FROM_DELIVERY.md), [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md)
(the locked topology), and [`docs/M4_DESIGN.md`](M4_DESIGN.md) (the rewards ledger).

## The decision (2026-06-24)

M5 was scoped as a **code co-location**: clone the live delivery PWA into `apps/delivery`. On review with Min,
we **changed direction**: **keep the two apps as separate repos and instead have the younger QR app learn from
the mature, live delivery app.** Rationale:

1. **The headline monorepo win — a shared `@mms/ui` — is unrealized today.** Two grounded audits found the apps
   run **different design lineages**: QR's `@mms/ui/tokens.css` is a tight, WCAG-AA-verified 107-line system;
   delivery's is a 34 KB accreted "Pepper + warm-paper" system. Sharing UI requires *converging the design
   languages first* — itself a project — so co-location buys little now.
2. **The real asset delivery offers QR is craft + scars, not code to import wholesale** — 599 components, 81
   hooks, and an enormous production-learnings list (iOS WebKit OOM, Serwist update flow, sheet sizing, RLS FK
   traps, offline-queue idempotency). That is a **knowledge/pattern transfer**, which does not need a repo merge.
3. **Delivery is live, and the migration's dep-dedup would force-bump it** (next 16.1→16.2, react 19.2.3→.7,
   eslint-config-next 15→16, one TS version) — a real **regression surface on production**, which is the owner's
   stated #1 frustration. Not worth it for organizational tidiness.

**So M5 is now a transfer workstream**, not a migration. Full-repo co-location is **reconsidered at M6**, only
if Terminal/kiosk create a concrete shared-runtime need — and even then via a small extracted package, not a
monolith merge.

## Locked topology (unchanged, and now even cleaner)

- **Two databases, never merged.** QR `fasnpdhtvqtzjlvruqcu`; delivery `ukuzkhuppqwtrdkjqrkv`. No shared schema.
- **Two repos, two deploys, two CIs.** Each app keeps its own Vercel project, its own `ci.yml`, its own
  Supabase env. (The migration's per-app CI matrix problem **disappears** — each repo guards its own stack.)
- **One Stripe account, shared** (config, not code — works fine across separate repos; each webhook filters to
  its own PaymentIntents by metadata).
- **`@mms/ui` / `@mms/db` / `@mms/config`** remain the QR monorepo's internal packages. They are **not**
  consumed by delivery (separate repo). If a *truly* shared component layer is ever wanted, publish `@mms/ui` as
  a versioned package then — out of scope for M5.

## Scope

**In scope:** QR adopts delivery's production-hardened **mobile/iOS + a11y patterns**, a **motion/perf
discipline layer**, a **reusable primitive component library** in `@mms/ui` (built to **QR's** tokens), and a
**contrast-audit test** (QR has AA tokens but no automated tests today). Plus folding QR-relevant delivery
learnings into `.claude/LEARNINGS.md`.

**Explicit non-goals:** no repo merge; no `apps/delivery` clone; **no fork of delivery's design tokens** (QR's
are the cleaner base — keep them); no change to delivery (it stays as-is); no rewards-wallet unification
(remains post-M5 "M5a" — and with two DBs in two repos it is squarely a cross-project data problem, not a code
move). M5 ships with **two reward ledgers**, surfaced honestly.

## Slice plan (one slice = one gated PR; full backlog in `docs/QR_FROM_DELIVERY.md`)

- **P5.0 · `@mms/db` generic client factory** _(already merged, #79)_ ✅ — kept as a clean internal QR refactor
  (zero behavior change). Its original "multi-app prep" rationale is moot now, but reverting is pure churn for no
  gain, so it stays.
- **P5.1 · Reshape M5 + transfer audit** _(docs)_ — **this slice.** Rewrite M5 to the separate-repos transfer
  direction; land the prioritized backlog (`docs/QR_FROM_DELIVERY.md`) synthesized from the two audits.
- **P5.2 · iOS / mobile hardening sweep** — safe-area **position** insets, `--sheet-max-h` dvh sheet sizing,
  16px input-zoom audit, nested-scroll wheel-block, breakpoint-coupled overlay anchors. Highest value:effort.
- **P5.3 · Motion discipline + perf budget** — `useAnimationPreference` JS gate, `useInView` offscreen-pause,
  the mobile GPU/blur budget rules, `useDeviceTier`, and `useRipple`/`useTilt` as QR-token primitives.
- **P5.4 · Primitive library in `@mms/ui`** — Skeleton, Toast, EmptyState, Stepper, Card variants, Drawer,
  Badge, Avatar, Tooltip (built to QR tokens; delivery APIs as reference). Ship incrementally, most-used first.
- **P5.5 · Contrast-audit test + QR test infra** — wire Vitest into QR + uncomment the turbo `test` gate; port
  delivery's contrast-audit with QR token fixtures (refresh fixtures in the same PR as any token change).
- **P5.6 · PWA / offline** _(deferred / optional)_ — Serwist SW + manifest + offline cart + chunk-load reload
  boundary. Low priority for dine-in (on-site, ~4h session); revisit only if pickup/home-install demand grows.

**Exit (M5):** QR has absorbed delivery's mobile/a11y/motion hardening + a reusable primitive layer + a
contrast-regression guard; both apps remain independent repos sharing only the Stripe account; co-location
reconsidered at M6.

## Risks (reshaped)

1. **Pattern drift over time (P2).** A one-time transfer decays — delivery and QR can re-diverge. Mitigation:
   fold the *learnings* into `.claude/LEARNINGS.md` (durable), and prefer promoting shared primitives into
   `@mms/ui` (a real artifact) over copy-paste.
2. **Over-porting / aesthetic mismatch (P1).** Delivery's catalog over-indexes on "copy our design system."
   Mitigation: every transfer is rebuilt to **QR's** tokens; reject wholesale CSS/token imports.
3. **Regressing QR while "improving" it (P1).** The owner's #1 frustration is regressions. Mitigation: each
   slice is a small gated PR with the pre-PR sweep + adversarial subagent; P5.5 (the contrast test + test infra)
   exists partly to make later visual changes safe.
4. **Two repos, no single dep/CI policy (accepted).** The explicit trade for not risking the live app. Revisit
   at M6.

## Open question answered by the audit

- **Does delivery use file-based migrations?** Yes — `supabase/migrations/**` (baseline + 4), file-based. (This
  mattered for the now-abandoned per-app CI matrix; recorded for completeness.)

---

## Superseded — the original co-location plan (history)

The original M5 was a **code co-location**: clone `min-hinthar/mandalay-morning-star-delivery-app` into
`apps/delivery`, drop its `.git`, dedupe deps to the root single-version pins (next/react/react-dom), wire its
scripts into turbo, and stand up a second Vercel project + a per-app CI matrix booting two Supabase stacks. The
real work was identified as `@mms/db` (the only QR-coupled package); `@mms/ui`/`@mms/config` were already
app-agnostic. P5.0 (the generic `@mms/db/factory`) shipped as that plan's prep slice and is retained. The
co-location plan was set aside for the three reasons in **The decision** above — chiefly that it would
force-bump a live production app for a shared-UI payoff that isn't realizable until the design languages
converge anyway.
