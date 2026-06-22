# S2 — Line lifecycle & authority — design + adversarial review

**Status:** design (pre-build). The adversarial pass below red-teams the plan _before_ a line of S2 ships,
so the hardening lands in the first commit (the M1 lesson: don't let the gate tease out the craft).
Read alongside [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md) (the source decisions),
[`ROADMAP.md`](../ROADMAP.md) §S2, [`docs/context/RED-TEAM.md`](context/RED-TEAM.md), and
[`docs/HANDOFF.md`](HANDOFF.md).

## What S2 is

The layer that lets the **kitchen trust the screen** and gives **loss-controlled** undo/void. Four phases:

- **S2.1** Line-state machine `draft → fired → in_progress → served → settled` + a KDS fire/bump; grocery
  lines lock at **payment**, not fire.
- **S2.2** Post-fire edit rights — a diner's "Remove" on a fired line becomes **"Ask server"**; a ~5s
  **undo** grace before the ticket truly hits the KDS; enforced server-side via `canMutate(state, role)`.
- **S2.3** Voids/comps — **loss-gated**: uncooked = server-solo + reason; cooked / money-out = **manager-PIN
  step-up**; two-party audit.
- **S2.4** **Approvals primitive** (`request → notify → approve/deny → audit`), void as consumer #1.
  _(In-person manager-PIN approve/deny + durable audit in S2; owner-remote-approve / SMS deferred — below.)_

**Confirmed decisions (Min, this session):**

1. **Loss gate = cooked-vs-uncooked + a ceiling.** Uncooked / not-yet-fired void → server solo + reason (no
   PIN). Any **cooked**-food comp/void, any **money-leaving** refund, or a discount/override **above a
   ceiling** → manager-PIN step-up. (Avoids PIN-fatigue on zero-loss voids — the ORDER-MODEL stance.)
2. **S2.4 scope = primitive + in-person now, defer remote.** Build the approvals primitive + durable
   two-party audit + in-person manager-PIN approve/deny. **Defer** owner-remote-approve (push + SMS,
   two-approver, fail-to-safe-on-timeout) to a follow-up — it needs an SMS/push provider (a Min config step,
   like Resend) and the async state machine; the gating + audit it rides on ship in S2.

---

## The spine S2 plugs into (current-state facts that shape it)

These are load-bearing and were verified against the code this session:

1. **The line lifecycle is PRE-settlement.** `/track` is a **post-pay** view on the diner's `qr_orders` row
   (P1.5, keyed by the Stripe `payment_intent`). But dine-in fires food **before** payment (the
   deferred-settlement spine: order → eat → settle by cash/card/split later). So the S2 state machine lives
   on **`qr_cart_items`** (the open cart _is_ the table order until settle), **not** `qr_orders`. The order
   snapshot at settle (`mms_fulfill_*`) already copies the lines; S2 just adds where each line is in its
   kitchen life _before_ that.
2. **`canMutateLine` is diner-only today.** `apps/qr/lib/permissions.ts`: `ActorRole = "host" | "guest"`,
   `LineState = "draft"`, and the post-draft branch is a **placeholder** that returns `actorRole === "host"`.
   That is **wrong for S2**: post-fire editing is **staff-only**, and a diner "host" is **not** staff. S2
   must make **staff a first-class actor** in this gate (a third role, or a separate staff axis), or the
   placeholder silently hands a diner host edit rights over fired food. **This is the #1 seam to get right.**
3. **The fire mechanism must be ONE timer.** `fire_at` already exists on `qr_carts`/`qr_orders` (M2·P2.2
   pickup: `fire_at = slot − prep`, the documented "S2 KDS seam"). S2's KDS must **consume the same
   `fire_at`** and unify it with dine-in **immediate** fire (fire_at = now on send) and to-go **fire at
   checkout** (S4.2). Don't grow a second timer (ORDER-MODEL touch-point M2.2).
4. **Realtime broadcast needs privatization FIRST.** `apps/qr/lib/realtime.ts` `cart:{cartId}` is a
   **non-private** `postgres_changes` channel (RLS-gated per row — safe for reads). Any KDS→floor or
   floor→diner **`.send()` broadcast** (e.g. "your order fired", a KDS bump push) requires
   `{ config: { private: true } }` **+** a `realtime.messages` RLS policy for `cart:*` (mirroring
   `rt_member_read`), because table RLS does **not** cover broadcast. **This is a hard prerequisite for any
   S2 push** and is already flagged in-code (`NOTE(S2)`).
5. **The PIN step-up primitive is ready.** `mms_staff_verify_pin` (S1.1b) is atomic, 5-try/15-min lockout,
   advisory-locked, service-role-only — S2.3 reuses it **verbatim** for the manager step-up. (Resolution
   model — _whose_ PIN — is an open decision below.)
6. **No durable audit table exists.** clear-table / merge / settle log to **PostHog** (ephemeral analytics),
   not a durable ledger. ORDER-MODEL requires a **two-party audit** (initiating server + authorizing manager
   - reason + amount + timestamp) for voids. **S2.3/S2.4 introduces the first durable audit table.**
7. **`charge.refunded` is unhandled platform-wide** (deferred to S4.3, which owns line-level refunds). So
   S2.3's "money-leaving refund" path **gates + audits** the decision; the **Stripe refund execution** is the
   S4.3 seam. Pre-settlement this is the common, money-safe case (voiding a fired-but-unpaid line moves no
   money); a true card refund (already captured) is the rarer one and rides S4.3.

---

## Adversarial review — threats & hardening, per phase

Lenses: **money/auth/RLS · race/atomicity · abuse · a11y · product-UX/fidelity.** Each item is a concrete
attack or failure with the guardrail that kills it.

### S2.1 — Line-state machine + KDS fire/bump

**New surface:** a `state` on `qr_cart_items` (`draft|fired|in_progress|served|voided`; `settled` is implicit
once the cart settles), the fire/bump transitions, and a KDS read of the fire queue.

- **A1 — IDOR / forged transition (money-adjacent).** Bump/fire/void are Server Actions = public POSTs.
  Threat: a diner POSTs `fire(lineId)` or `serve(lineId)` to mutate the kitchen state, or marks their own
  line `served` to dodge a charge. **Guard:** every transition is **staff-only** (`requireStaff` +
  service-role) **except** the diner's own pre-fire add/remove (which stays `canMutateLine`), and the
  transition is an **atomic status-guarded RPC** (`update … where id=$ and state=$expected`) so an illegal
  jump (e.g. `served → draft`) is a 0-row no-op, not a silent overwrite. **The legal transition graph lives
  in SQL**, not just the client.
- **A2 — State-machine skips / illegal edges.** Threat: `draft → served` skipping fire (un-fired food marked
  done), or re-firing a served line (double KDS ticket). **Guard:** a single `mms_line_transition(line, to)`
  that encodes the allowed edges (`draft→fired→in_progress→served`, plus `→voided` from any non-settled
  state, gated separately) and raises on any other; idempotent on a no-op repeat.
- **A3 — Fire after settle / fire a cancelled cart.** Threat: a line fires into the kitchen after the cart
  is `paid`/`cancelled` (waste, or a ticket for a closed table). **Guard:** the transition RPC requires the
  parent `qr_carts.status = 'open'` **in the statement** (parity with `mms_cart_item_insert_if_open`).
- **A4 — Unified fire timer correctness.** Threat: pickup's scheduled `fire_at` and dine-in's immediate fire
  diverge into two code paths that drift (the M2.2 warning). **Guard:** the KDS queue is **one** read —
  "lines to fire" = `state='fired' AND fire_at <= now()` (dine-in sets `fire_at = now()` on send; pickup
  keeps `slot − prep`; to-go sets it at checkout). One column, one query.
- **A5 — Grocery must NOT fire.** Threat: a Scan & Go / grocery line enters the kitchen queue. **Guard:** a
  line's fulfillment type (kitchen vs grocery) decides its lock trigger — grocery locks at **payment**, never
  fires (ORDER-MODEL). Until S4.1's explicit per-line fulfillment tag, derive it from the cart `mode`
  (`scango` ⇒ no fire) and document the seam.
- **A6 — KDS realtime is a broadcast.** A live KDS that pushes "new ticket / bump" is exactly the
  privatization prerequisite (spine #4). **Guard:** privatize `cart:*` (+ a `realtime.messages` policy) **or**
  keep the KDS on the S1.2 `postgres_changes` read pattern (RLS-gated, no `.send()`) for v1. **Recommend v1
  KDS = postgres_changes on `qr_cart_items` filtered to fired/in_progress** (no broadcast, no new policy) —
  ship the fire/bump on the proven read path; add broadcast only when a true server→client push is needed.
- **A7 — a11y/UX.** The KDS/fire queue is a staff surface: ≥44px bump targets, one live region for "new
  ticket" (no flood — RED-TEAM trap), `prefers-reduced-motion` on any "new ticket" animation, honest
  microcopy (no fabricated "ready in X" until a real timer backs it — RED-TEAM parity gap #5).

### S2.2 — Post-fire edit rights + undo grace

- **B1 — The `canMutateLine` staff seam (spine #2).** **Guard:** extend the gate so post-`draft` states are
  **staff-only** with a real staff actor — e.g. `canMutateLine(state, { kind: 'diner', role } | { kind:
'staff' })`: a diner may mutate only an **own, `draft`** line; a fired/in_progress/served line is mutable
  only by `kind:'staff'`. **Both** the diner path (`cart.ts`) and the staff path (`staff-cart.ts`) call it;
  the server enforces, the client imports the same rule to render "Ask server" instead of "Remove".
- **B2 — "Adding is always allowed" asymmetry.** A diner adding a NEW line post-fire is fine (it's a fresh
  `draft` that fires later); only **remove/reduce/modify on a fired line** is gated. **Guard:** the gate keys
  on the **target line's** state, never the cart's — don't accidentally freeze _adds_ when any line is fired.
- **B3 — Undo-grace races (the dangerous one).** The "~5s Sent! — Undo" must not become an indefinite delete
  window or a double-fire. **Threats:** (a) undo fires _after_ the KDS already pulled the ticket (cook
  started → undo = silent waste/confusion); (b) two devices both "undo"; (c) a diner extends the window to
  keep deleting. **Guard:** model fire as **`fire_at = now() + grace`** — the line is `fired` immediately
  (visible, honest) but the **KDS query only pulls `fire_at <= now()`**, so "undo" within the grace is a
  clean **`fired → draft`** transition that the kitchen never saw; once `fire_at` passes, undo is gone and
  removal routes through S2.3 (a **void**, possibly manager-gated). Grace is **server-clocked** (not the
  client's), single-use, and the transition is atomic (0-row if already pulled). **Default grace = 5s**
  (ORDER-MODEL), config-able.
- **B4 — Focus/live-region.** When "Remove" morphs to "Ask server" on a fired line, announce once (one live
  region); move focus predictably; reduced-motion safe.

### S2.3 — Voids / comps (loss-gated)

- **C1 — The gate must be SERVER-derived, not client-asserted.** Threat: client sends `{ cooked: false }` to
  dodge the manager-PIN. **Guard:** "cooked?" is derived **server-side from the line's state** —
  `state IN ('in_progress','served')` ⇒ cooked ⇒ manager-PIN; `state IN ('draft','fired-within-grace')` ⇒
  uncooked ⇒ server-solo. The **ceiling** (discount/override > 20% or > $20 — _tunable_) and **any
  money-leaving refund** ⇒ manager-PIN, also computed server-side from the amount, never the request body.
- **C2 — Manager step-up reuse + resolution.** Reuse `mms_staff_verify_pin` (atomic lockout). **Open
  decision (below):** _whose_ PIN — a specific manager identity tapped first, or any `manager`+ role PIN.
  **Guard regardless:** verify runs server-side against a **resolved `manager`-or-`owner` staff row**; a
  `server`-role PIN must be **rejected** for a loss action even if correct (the step-up authorizes a
  _higher_ role, not just "a PIN"). The void mutation only proceeds on `status='ok'`.
- **C3 — Two-party audit is DURABLE + tamper-evident.** PostHog is not an audit log. **Guard:** a
  `mms_void_audit` (or generalized `mms_approvals`, S2.4) table — **append-only** (RLS: service-role
  write, owner read; no update/delete to anon/authenticated), recording **initiating server + authorizing
  manager + line + reason code + amount_cents + timestamp + cart/session**. Non-PII. The void RPC writes the
  audit row **in the same transaction** as the state flip (no audit ⇒ no void).
- **C4 — Void ≠ refund (money boundary).** Pre-settlement, a void just removes an unpaid line (no money out)
  — the **common** case, fully in S2. A void of an **already-captured** line (post-settle refund) **gates +
  audits here** but **executes the Stripe refund in S4.3** (`charge.refunded` is unhandled today). **Guard:**
  S2.3 refuses (honest copy) to "refund" a settled line until S4.3 wires the Stripe path — it records the
  _request_; it must not pretend money moved (RED-TEAM: don't promise what the data model can't keep).
- **C5 — Comp vs void semantics.** A **comp** (free item, kitchen still makes it) vs a **void** (cancel,
  don't make it) are different kitchen signals. **Guard:** distinct transitions/reason codes so the KDS
  isn't told to cancel a comped item the guest still receives.

### S2.4 — Approvals primitive

- **D1 — Generalize once, don't fork.** `request → notify → approve/deny → audit`, with the **post-fire void
  as consumer #1**; refunds, large discounts, price overrides, after-hours tab-closes reuse it (ORDER-MODEL).
  **Guard:** one `mms_approvals` table + RPCs; S2.3's void-audit is a row in it, not a parallel table.
- **D2 — Fail to the SAFE state (deferred-remote, but design now).** The async owner-remote path is
  deferred, but the **state model must default safe**: a pending approval leaves the line **`void_pending`**
  (food not refired, money not moved), resolving into the final tab whenever approved — **never auto-approve
  on timeout** (the 2am hole). Even the in-person path uses the same `pending → approved/denied` states so
  the remote path is a notify-channel add later, not a refactor.
- **D3 — Approval can't be self-granted.** Threat: the initiating server approves their own request via a
  second tap. **Guard:** `approver_staff_id <> initiator_staff_id` enforced in the RPC; approver must be
  `manager`+.
- **D4 — Replay / idempotency.** An approval token/PIN verification must be single-use per request
  (idempotent on the approval id) so a captured approve can't be replayed against another request.

---

## New money/auth/RLS surface S2 introduces (review checklist for the build)

- **`qr_cart_items.state`** column (`check (state in ('draft','fired','in_progress','served','voided'))`,
  default `'draft'`) — backfills existing rows to `draft` (correct: nothing fired pre-S2). Realtime: the KDS
  read filters on it (no new publication if we reuse the S1.2 `postgres_changes` path).
- **`mms_line_transition(line, to_state)`** — ✅ **shipped (S2.1a)** as **INVOKER** (not SECURITY DEFINER —
  the cart-RPC precedent `20260619000200`: the only caller is the service-role staff action, so DEFINER
  would only widen the surface, advisor 0029). Encodes the legal edge graph, requires parent cart `open`,
  atomic/0-row-guarded; `revoke … from public, anon, authenticated` + `grant service_role`.
  **Carry-forward for S2.1b/S2.2 callers:** a `0` return is per-context — a double-fire/bump `0` is a benign
  no-op, but an **undo** that returns `0` (grace passed, KDS already pulled it) MUST route to a void, never
  silently succeed. When S2.1b/S2.2 wire the **staff** edit path, route it through `canMutateLine`'s
  `{kind:'staff'}` actor (today `staffSetQty` bypasses the gate via `requireStaff` — the staff branch is
  dormant until then), and thread the real `lineState` + "Ask server" copy into `Checkout`/`SplitSection`.
- **`mms_void_line(line, reason, manager_staff_id?, manager_pin?)`** — derives cooked/ceiling server-side,
  calls `mms_staff_verify_pin` for the gated path, writes the audit row **in-txn**, flips state. Same lockdown.
- **`mms_approvals`** (durable audit/approvals ledger) — append-only; RLS default-deny + owner-read; non-PII;
  service-role write. The first **durable** audit surface in the app.
- **`canMutateLine` v2** — staff as a first-class actor; the post-fire = staff-only rule; isomorphic (server
  - client import the same fn).
- **(If KDS broadcast) `realtime.messages` policy for `cart:*` + `{private:true}`** — the spine #4
  prerequisite. **Recommend deferring** by shipping the v1 KDS on `postgres_changes`.
- **Tax/money:** S2 moves no prices; a void **removes** a line (totals re-derive from the remaining lines via
  the single engine — same as a diner remove). A comp needs a **0-priced or fully-discounted** line that
  still re-derives correctly (don't hand-edit a total). Keep `lib/totals.ts` the one source.

## Open decisions — ✅ CONFIRMED (Min, S2 kickoff)

1. **Manager-PIN resolution model (S2.3/C2):** ✅ **(a) the manager taps their name → enters their PIN** —
   unambiguous two-party attribution (initiating server + named manager). A `server`-role PIN is rejected
   for a loss action even if correct.
2. **KDS v1 surface:** ✅ **console view on the staff tablet** (fire queue + bump on the same device) — on
   the proven `postgres_changes` read path, no new hardware, no realtime-broadcast privatization needed yet.
3. **Ceiling values:** ✅ **20% of the line OR $20 absolute, whichever trips first** — above ⇒ manager-PIN;
   tunable in a config row (parity with `pickup_config`).
4. **Undo grace length:** ✅ **10s, per send-batch** (Min chose longer than the 5s ORDER-MODEL default) —
   one "Sent! — Undo" window per fire action, server-clocked (`fire_at = now() + 10s`).

## Recommended build order (PR slices)

1. **S2.1a** `state` column + `mms_line_transition` (legal-edge graph, atomic, locked-down) + `canMutateLine`
   v2 (staff actor) — **no UI**, pure spine + tests. _This de-risks the #1 seam first._
2. **S2.1b** KDS console view (fire queue + bump) on `postgres_changes`; dine-in immediate-fire + unify
   `fire_at`; grocery excluded.
3. **S2.2** Post-fire "Ask server" + the server-clocked undo-grace fire model.
4. **S2.3** Loss-gated void/comp + manager-PIN step-up + the durable `mms_approvals` audit (consumer #1).
5. **S2.4** Approvals primitive generalized (in-person approve/deny + audit). _Owner-remote/SMS deferred._

Each slice: build to the bar in the first commit (money/auth/RLS/tokens/a11y/error-paths), Pre-PR sweep +
fresh-context adversarial subagent, apply migration to live + verify (`service_role`-only, advisors clean),
gate green, then merge. **S2 deps are real:** S2.2 needs S2.1; S2.3 needs S2.1 + the PIN primitive (have it);
S2.4 generalizes S2.3.
