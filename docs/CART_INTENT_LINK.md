# The cart→intent link — the design M151 · M152 · M123 (a′) are all waiting on

**Status: DESIGN ONLY. No code, no migration file, nothing applied.** Written 2026-09-01 alongside
#245, which shipped the half of that follow-up needing no schema change (M153 and M123 b). This
document exists so the next slice is a build rather than a re-derivation — every fact below was
measured against source or the live schema, and each one is cited.

## The one missing fact

Five open clauses are the same sentence in five costumes: **a promo pin can be cleared while a live
PaymentIntent still depends on it, and a superseded PaymentIntent can still be confirmed.** M70's
header states the invariant that makes both fatal:

> "The pin has to outlive the lock for the charge to reconcile at all."

Stripe retries a webhook up to three times at an 80s timeout, so a capture whose fulfilment lands
after `CART_LOCK_TTL_MS` (5 min) must still re-derive **with** the pin. Every pin-clearer therefore
needs to be able to ask one question it cannot ask today:

```sql
and <no live PaymentIntent depends on this cart>
```

`stripe_payment_intent_id` lives on `qr_orders`, which only exists **after** fulfilment. Between
mint and fulfilment there is no cart→intent link at all. That absence is the whole blocker.

## What the link may NOT be: a column on `qr_carts`

Settled, with the repo's own precedent:

| Fact                                                              | Evidence                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `qr_carts` is on the realtime publication                         | `supabase/migrations/20260620000600_cart_realtime.sql:24` |
| Diners subscribe to its row changes                               | `apps/qr/lib/realtime.ts:151` (`postgres_changes`)        |
| The full row therefore fans out to every (anonymous) table member | `20260623020000_s3_secure_tab.sql:7`, verbatim            |

That last migration created `mms_tab_secure` as a **service-role-only sidecar** for exactly this
reason. A PaymentIntent id is not a client secret and cannot be acted on without a secret key, so the
sensitivity argument alone is weak — but two others are not:

1. **Write amplification.** Setting and clearing the link on every mint would broadcast a `qr_carts`
   row change to every tablemate's subscription, each of which re-fetches `getCartView`. Two writes
   per checkout attempt × every diner at the table, for a fact no client renders.
2. **Precedent.** The repo already answered this question once, in writing, for the same table.

**So: a sidecar, `qr_cart_intents`, service-role only, RLS on with no policies (the `mms_tab_secure`
shape).**

## The consequence that makes this non-trivial

PostgREST cannot join in an `UPDATE`. Two of the five pin-clearers are PostgREST updates in TS:

| Clearer                                  | Where                         | Shape today                                                     |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `mms_release_promo_grant(cart, attempt)` | M70 migration §5              | SQL function ✓                                                  |
| `mms_mark_settle_canceled(...)`          | M70 migration §4              | SQL function ✓                                                  |
| `applyPromo`                             | `apps/qr/lib/cart.ts` (≈ 410) | PostgREST update ✗                                              |
| `releasePayAttempt`                      | `apps/qr/lib/lock.ts`         | PostgREST update ✗                                              |
| `mms_release_promo_grant_for_holder`     | M70 migration §6              | **dead** — banned by `scripts/check-pay-attempt.mjs` since #244 |

The two SQL functions grow one `and not exists (select 1 from app_private.qr_cart_intents …)` term
each. The two PostgREST updates have to become RPCs, or they cannot carry the term at all. That is
the bulk of the work and it is why this is a slice of its own, not a rider.

## The four rows, and what each needs

- **M151** — cancel-on-supersede. `create-intent` reads the link, `paymentIntents.cancel`s the
  predecessor, clears the link, and only then releases its pin. A cancel that Stripe **refuses**
  (the predecessor succeeded or is processing) is the honest refusal case: tell the diner their
  previous payment is still going through rather than minting a second chargeable intent.
- **M152 (a)** — `applyPromo` must refuse while the link is live. It is TTL-aware today, so five
  minutes after a diner walks away with a captured intent a tablemate's promo code nulls the pin.
- **M152 (b)** — `create-intent`'s stale-grant release, closed by M151's cancel: after a successful
  cancel there is no live intent, so clearing the predecessor's pin is safe by construction.
- **M152 (c)** — the outer catch, which also fires on throws from **above** the pin block, where any
  pin belongs to a predecessor. Same term.
- **M123 (a′)** — the refusal exits leave `locked = false` over a live pin, and cash / Terminal /
  split then charge it (`acquireSettlement` gates on the raw `locked` column). Note the fix is
  **not** "clear the pin at those exits" — #244 shipped that and reverted it. With the link, the
  staff rails can instead cancel the live intent before settling on another rail, which is the
  behaviour a human at the counter actually wants when a card declines and the guest reaches for
  cash.
- **M123 (b)** — the same link, on the DISPLAY side, and #245 proved it belongs here rather than
  standing alone. `getCartView` quotes `coalesce(pin, live)`. Switching it to live makes the quote
  agree with what `create-intent` derives and **disagree with the five counter rails** — cash
  (`staff-cart.ts:281`), secure-tab close (`:528`), Terminal (`terminal.ts:136`), split
  (`split.ts:246`) and the floor settle quote (`floor.ts:360`) — every one of which derives on the
  authorized basis and charges the pin. Quoting the pin lies about the phone; quoting live lies about
  the till, in front of a guest who is standing at one. Neither is right while an orphan pin can
  outlive the attempt that made it, so (b) is a consequence of this design, not an independent fix.

## The hazard this design must answer before anyone writes it

**A stuck link.** A diner mints an intent and vanishes. The link stays set, the pin becomes
permanently unclearable, and the cart is un-promo-able forever. The lock TTL cannot be reused: the
window where the lock has expired but the pin must survive is precisely M70's window. Candidate
answers, none yet chosen:

1. **Resolve against Stripe on demand.** A clearer that finds a live link retrieves the intent; if
   it is `canceled` / `requires_payment_method`, clear the link and proceed. Correct, but it puts a
   network call inside a promo apply.
2. **Cancel-on-supersede covers the create-intent path** (M151) and leaves only the abandoned-forever
   case.
3. **A link TTL longer than Stripe's retry budget.** Simple, but picking the number is a claim about
   Stripe's redelivery behaviour that would have to be measured, not assumed.

**Do not pick one from this list without checking it against Stripe's actual documented behaviour.**
Two drafts of the `db push` warning in `CLAUDE.md` were wrong for exactly this reason — inferring a
vendor's behaviour instead of observing it.

## Applying it

⚠️ **The QR prod migration history is divergent** (97 remote-only stamps, zero overlap with repo
filenames — measured 2026-08-27 from prod's own `schema_migrations`). `db push` is unusable in any
form. This migration is applied **one file at a time via the Supabase MCP `apply_migration`**, with
the objects it creates verified before anything else runs — and **only with the owner's explicit
say-so.** See `CLAUDE.md` and OPEN-ITEMS **M125** (reconcile the histories with
`supabase migration repair`).
