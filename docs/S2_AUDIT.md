# S2 — Line lifecycle & authority: retrospective adversarial audit

A **post-merge** red-team of the shipped S2 arc (S2.1 line-state + KDS · S2.2 undo grace · S2.3 loss-gated
voids/comps + durable audit · S2.4 approvals primitive), run as **four parallel specialist agents** (the
project's RED-TEAM four-lens model): money/settlement-integrity · auth/RLS/authority · state-machine/
concurrency/realtime · product-UX/a11y/fidelity. Each read merged code on `main` (applied to live
`fasnpdhtvqtzjlvruqcu`) and cited `file:line`. This report orchestrates their findings.

> Why audit shipped, gate-passed code: LEARNINGS — per-phase reviews catch feature logic; a milestone
> sweep catches **cross-phase escapes** no single PR could see (a mutex one phase added that the next didn't
> carry forward; a flag that's safe in its own phase but mutable via another phase's path; an inconsistency
> visible only in aggregate). All three blockers below are exactly that shape.

## Executive summary

| #      | Severity   | Finding                                                                                                                                                                                                            | Lens(es)           | Fix surface                                                   |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------- |
| **B1** | 🔴 BLOCKER | **Comped line is diner-mutable** — `canMutateLine` + `mms_cart_item_set_qty_if_open`/`inc_qty` are comped-blind; reachable via comp-in-grace → undo (S4)                                                           | money + state      | SQL (2 RPCs) + `permissions.ts`                               |
| **B2** | 🔴 BLOCKER | **Void/comp/resolve not mutually-exclusive with the diner pay-lock** → mid-charge base mutation → stranded capture (S1-audit B2/S3 family, re-opened)                                                              | concurrency + auth | SQL (`mms_void_line`/`mms_resolve_approval`) + `approvals.ts` |
| **B3** | 🔴 BLOCKER | **Staff qty/bump actions have no failure path** — `StaffLineEditor.setQty` + KDS `bump` lack try/catch → stranded optimistic qty / silent bump no-op                                                               | error-recovery     | 2 components                                                  |
| S1     | 🟠 SHOULD  | Approval audit `amount_cents` snapshotted at request; line editable through resolve → loss ledger understates the actual void/comp                                                                                 | money + audit      | `mms_resolve_approval` re-derive + guard                      |
| S2     | 🟠 SHOULD  | `getFloorView` running subtotal/itemCount include voided/comped (disagrees with `getTableDetail` + the settle)                                                                                                     | product-UX         | `floor.ts`                                                    |
| S3     | 🟠 SHOULD  | KDS reads the grace boundary on the **app clock**; `mms_undo_fire` gates on the **DB clock** → skew double-pull / lost-undo                                                                                        | concurrency        | `kitchen.ts` + SQL                                            |
| S4     | 🟠 SHOULD  | `mms_undo_fire` can reverse a **comped** fired line → audit/state divergence (also the main reachability of B1)                                                                                                    | state-machine      | `mms_undo_fire`                                               |
| S5     | 🟠 SHOULD  | Lock-order inversion `mms_resolve_approval` (approvals→items) vs `mms_merge_table_orders` (carts→items→approvals) → deadlock (40P01)                                                                               | lock-order         | reorder merge's supersede UPDATE                              |
| S6     | 🟠 SHOULD  | Merge **folds a fired/in-progress source line into a draft target** (matches on item+modifiers, not `state`) → erases kitchen state + line_id                                                                      | state-machine      | merge fold predicate (`070000`+`080000`)                      |
| S7     | 🟠 SHOULD  | Re-fire batch `max(fire_at)` selection is clock-resolution-dependent → a sub-ms double-fire lets one Undo claw back two batches                                                                                    | idempotency        | fire-batch id (defer; near-impossible)                        |
| S8     | 🟠 SHOULD  | KDS renders one `role="alert"` **per line** → live-region flood (other boards consolidate)                                                                                                                         | a11y               | `KdsBoard.tsx`                                                |
| S9     | 🟠 SHOULD  | No stale/reconnect signal on the polled boards (KDS/Approvals/Detail) — S1-audit N2 replicated ×3                                                                                                                  | error-recovery     | 3 boards                                                      |
| S10    | 🟠 SHOULD  | PIN field `aria-describedby` points at the **live region** → double-announce / mis-association (LossActionSheet + ApprovalsBoard)                                                                                  | a11y               | 2 components                                                  |
| S11    | 🟠 SHOULD  | "No managers available" soft dead-end: disabled CTA + ambiguous "No manager here?" fallback copy                                                                                                                   | UX + copy          | `LossActionSheet.tsx`                                         |
| S12    | 🟠 SHOULD  | Line-state vocabulary diverges diner vs staff (`fired`="Sent to kitchen" vs "Sent"; "Removed" vs "Voided") — no single source                                                                                      | consistency        | shared copy map                                               |
| S13    | 🟠 SHOULD  | Manager-PIN step-up **duplicated** (not shared) across LossActionSheet/ApprovalsBoard, already drifting                                                                                                            | consistency        | extract `<ManagerPinStepUp>`                                  |
| S14    | 🟠 SHOULD  | Loss sheet: disabled CTA with no inline "pick a reason" validation; single-select Reason is `role=group`+`aria-pressed`, not a radiogroup                                                                          | a11y + UX          | `LossActionSheet.tsx`                                         |
| S15    | 🟠 SHOULD  | `mms_approvals_owner_read` policy `roles=public` → advisor-0012 lint noise (no real exposure; no anon/auth grant)                                                                                                  | a11y/hygiene       | scope policy `to authenticated`                               |
| N1–N7  | ⚪ NIT     | ceiling read outside row-lock · comped absent from `/track`+QBO receipt · manager-roster enumeration · comped-draft drops stepper · RelativeTime tick · redundant cooking aria-label · `--t3` struck-text contrast | mixed              | low                                                           |

**Honest RUBRIC read on the S2 UI as a whole: ~4.1 / 5** (below the 4.3 bar) — dragged by #9 edge/error
(B3 + S9 recoverability gaps ≈3.7) and #8 a11y (S8/S10/S14 ≈4.0); carried by #7 voice (~4.6) and #1 perceived
perf (~4.4). **Fixing B3 + S8 + S9 + S10 clears 4.3.**

**Confirmed clean (independently verified across the four lenses):** the **chargeable-$0 invariant** holds in
every _charge_ path — `getCartTotals`, both promo RPCs, all three fulfill reconciles+snapshots, split
`deriveShareBreakdowns`, the create-intent route, the webhook reconcile, and the QBO mapper all exclude
`state='voided' OR comped`; the discount clamp is sound; tax re-derives on the discounted taxable base with
no negative/overcharge path. The **legal-edge graph** is terminal-safe (`voided` has no exit; `draft→served`
skip rejected; undo can't reverse `in_progress`). **Every S2 RPC** is INVOKER + `search_path=''` +
service-role-only on live (no advisor-0029 reach); both new tables are service-role-only with **no GraphQL
exposure**; `mms_approvals` is append-only, **non-PII** (staff ids + line-name, no diner identity),
owner-read through the **B1-fixed verified-email gate (not reopened)**. The manager step-up rejects a
`server` PIN in SQL, enforces `approver≠initiator`, is lockout-counted + replay-safe (idempotent on
`pending`, partial unique index). No S2 broadcast was added (realtime privatization prerequisite intact);
`replica identity full` syncs void UPDATEs + merge DELETEs. Honest copy throughout (SB-1524 verbatim from
v7.2); tokens-only (no hardcoded colors); the S1-audit B3 `-strong` contrast fixes are intact.

---

## BLOCKERs

### B1 — A comped line can become diner-mutable (free food + falsified comp audit)

**Where:** `apps/qr/lib/permissions.ts:25-29` (`canMutateLine` keys on `state`, ignores `comped`);
`supabase/migrations/20260619000200_cart_mutations_status_atomic.sql` (`mms_cart_item_set_qty_if_open`) +
`20260619000300_inc_qty_signal_closed.sql` (`mms_cart_item_inc_qty`) — both gate only on `status='open'`,
**comped-blind**; reachable via `20260622050000_undo_grace.sql:57-70` (`mms_undo_fire` matches `state='fired'`
only, not `comped`).

**The hole:** a comp sets `comped=true` but **leaves `state` unchanged** (by design — the kitchen still makes
it). A line can therefore be `comped=true` AND `state='draft'`: comp a just-fired line within the 10s grace
(`mms_void_line` requires only `status='open'`), then the host taps **Undo** → `mms_undo_fire` flips it
`fired→draft` (it doesn't exclude comped). Now `canMutateLine('draft', {kind:'diner'})` returns **true**, and
`setQty`/`addItem` route to `mms_cart_item_set_qty_if_open`/`inc_qty`, which never check `comped`. The diner
grows the comped (=$0) line → **free food**, and the `mms_approvals` row still says `qty=1, amount_cents=…` →
the two-party comp audit is **falsified**.

**Fix (two layers):** (a) DB — add `and not comped` to `mms_cart_item_set_qty_if_open` + `mms_cart_item_inc_qty`
(load-bearing: the server RPC is the real boundary); (b) gate — thread `comped` into `canMutateLine` and
return `false` for a comped line (isomorphic; the client hides the stepper). Plus **S4** (`mms_undo_fire`
excludes comped) removes the main reachability at the source. The diner `Checkout` already renders a comped
line as a chip (not a stepper), so the _UI_ is safe today — the hole is the server path.

### B2 — Void / comp / approval-resolve is not mutually-exclusive with an in-flight diner card pay

**Where:** `apps/qr/lib/voids.ts:80-118` + `apps/qr/lib/approvals.ts:122-167` (app-read `paymentInFlightReason`,
**absent entirely in `resolveApproval`**); `supabase/migrations/20260622060000_voids_comps.sql:94-133`
(`mms_void_line` guards only `status='open'`) + `20260622080000_approvals_primitive.sql:132-150`
(`mms_resolve_approval` re-checks only `status='open'`); vs `lib/lock.ts` `acquireCartLock` (atomic
conditional UPDATE on `locked`) + the create-intent route + the Stripe webhook reconcile.

**The hole:** the pay path takes the lock with an **atomic conditional UPDATE**; the void path checks an
**app-side read** of `locked`/`settle_at` then calls an RPC that only re-checks `status='open'` (a locked
cart is still `open`). Different exclusion mechanisms → not mutually exclusive. A void/comp/resolve landing in
the create-intent→capture window drops a line from the chargeable base **after** the PaymentIntent was minted
for the old amount → the webhook's `getCartTotals` re-derivation mismatches the captured amount → the fulfill
raises → **captured charge, no order, no durable refund row** (the S1-audit B2/S3 "stranded charge" family,
re-opened on the void path). `mms_resolve_approval` is worse — it has **no pay-guard at all**, so a manager
approving a queued void from `/staff/approvals` can apply it any time, including mid-capture. The migration
comment's "the webhook re-derives and rejects on a mismatch, so it's fail-safe" is wrong: a 409 + a stranded
capture is not fail-safe.

**Fix:** re-check the pay-lock/settle freshness **in SQL**, atomically, inside `mms_void_line` and the APPROVE
branch of `mms_resolve_approval` (mirror `acquireCartLock`'s predicate: refuse when `locked` is fresh OR
`settle_at` is fresh → return `in_flight`), driving freshness off DB `now()`. Add the app-side
`paymentInFlightReason` re-check to `resolveApproval` for parity with `voidLine`.

### B3 — Staff qty/bump actions have no failure path

**Where:** `apps/qr/components/staff/StaffLineEditor.tsx:42-51` (`setQty`) and
`apps/qr/components/staff/KdsBoard.tsx:117-124` (`KdsLineRow.bump`) — both `await` the Server Action inside
`startTransition` with **no try/catch**. The actions return `{ok:false}` for _expected_ failures but throw on
the unexpected path (a rejected fetch to the action endpoint, a redacted prod throw, `openCartFor` throwing).

**The hole:** on a throw, StaffLineEditor leaves the **optimistic qty on screen** (never rolled back),
`onError` never fires, the live region stays empty → the staffer sees a quantity the server rejected. KDS:
the bump silently no-ops, the button re-enables, **no `role="alert"`** → the cook taps "Start", nothing
happens, no error. The diner side wraps _every_ action in try/catch with honest copy — these two S2.1 staff
paths are the only S2 async UIs with no catch at all.

**Fix:** wrap both in try/catch; on catch, roll back the optimistic qty and route an honest line through the
existing error channel (`onError(...)` / `setErr(...)`), matching the diner pattern.

---

## SHOULD-FIX (condensed — see the executive table for severity/lens)

- **S1** — `mms_resolve_approval` (approve) re-read `qty*unit_price` from the locked line and
  `update mms_approvals set amount_cents=…` so the durable loss ledger reflects what was actually
  voided/comped, not the request-time snapshot; optionally block `setQty` on a line with an open pending
  request. (Audit honesty — the ledger is a financial record.)
- **S2** — add `state,comped` to `getFloorView`'s line select and exclude `voided`/`comped` from the running
  subtotal + itemCount (parity with `getTableDetail`).
- **S3** — derive the KDS grace cutoff from DB `now()` (a `SECURITY DEFINER` helper or a DB-sourced now),
  not the Next process clock, so the "kitchen never sees an undoable line" boundary is single-clock.
- **S4** — `mms_undo_fire`: add `and not ci.comped` to the UPDATE **and** the `max(fire_at)` batch subquery.
- **S5** — move merge's `update mms_approvals … set superseded` to **before** the item re-parent loop so both
  resolve and merge acquire `mms_approvals`→`qr_cart_items` in the same order (kills the deadlock cycle).
- **S6** — add `t.state = r.state` to the merge fold-match predicate so a fired/in-progress line never folds
  into a draft target (and vice-versa); otherwise re-parent preserving `state`/`fire_at`.
- **S7** — (defer) give each fire batch a discrete `fire_batch` id and gate undo on the latest batch id, not
  `max(fire_at)`; the current window is sub-millisecond across separate HTTP transactions (near-impossible),
  so this is tracked, not urgent.
- **S8** — hoist one board-level live region in `KdsBoard` and route line errors to it (mirror
  `FloorDetailLive`); drop the per-row `role="alert"`.
- **S9** — after N consecutive poll failures, surface "Reconnecting — showing last known state" once in the
  existing count region (KDS, Approvals, FloorDetail).
- **S10** — give the PIN input a static `aria-describedby` hint (or none); keep the live region purely
  transactional (LossActionSheet + ApprovalsBoard).
- **S11** — when no managers are signed in, make "Request approval" the **primary** affordance and relabel it
  ("Send to the approvals queue"); de-emphasize the dead PIN step-up.
- **S12** — extract a shared `LINE_STATE_COPY` (diner vs staff variants) so the state vocabulary is defined
  once. (Refactor — can ride a later UI pass.)
- **S13** — extract a shared `<ManagerPinStepUp>` (select + PIN + lockout + reason→message map) used by both
  LossActionSheet and ApprovalsBoard. (Refactor — can ride a later UI pass.)
- **S14** — show an inline "Pick a reason" hint instead of a silently-disabled CTA; consider real radiogroup
  semantics for the single-select Reason set.
- **S15** — scope `mms_approvals_owner_read` `to authenticated` to silence advisor-0012 (no behavior change).

## NITs

- **N1** — `mms_void_line` reads `mms_loss_config` outside the row lock (benign gate-decision TOCTOU).
- **N2** — comped line is absent from the `/track` + QBO receipt ("served ≠ receipt" honesty gap; the
  reconcile is correct — a "Comped — $0.00" line would need a zero-priced snapshot row).
- **N3** — `listApprovers` exposes the manager/owner roster (ids) to a `server` — by design (authority is the
  PIN + SQL role check); noted.
- **N4** — `Checkout` renders a comped-draft line as a chip (comped branch precedes draft) — correct but
  undocumented; add a comment.
- **N5** — `RelativeTime` 30s tick is text, not motion (reduced-motion N/A); the S2 surface is otherwise
  CSS-transition-free.
- **N6** — KDS "cooking" tag has a redundant `aria-label` on a non-interactive span.
- **N7** — `--t3` struck/comped small text — verify AA in-browser (decorative-redundant, not gated).

## Optionally also snapshot a gate-reason

Per the auth lens (N-1 merged into **S1**): `mms_approvals` records `amount_cents`/`cooked` but not _which_
gate tripped (cooked vs ceiling vs comp) nor the ceiling in force — an owner reviewing the ledger can't
reconstruct why a void was server-solo vs manager-gated if the config later changes. A `gate_reason` column
would complete the audit. Tracked with S1.

---

## Remediation plan

**✅ Remediated** in migration `20260622090000_s2_audit_fixes.sql` + paired app fixes (this PR):

- **B1** — `and not comped` on `mms_cart_item_set_qty_if_open`/`inc_qty` (DB, load-bearing) **+**
  `canMutateLine(comped)` (gate, threaded via `assertCartItemMember`/`cart.ts`).
- **B2** — atomic in-SQL pay-lock freshness guard (`locked` 5m / `settle_at` 10m, DB-clocked → `'in_flight'`)
  in `mms_void_line` **and** the APPROVE branch of `mms_resolve_approval`; app-side `paymentInFlightReason`
  re-check added to `resolveApproval`; the `in_flight` status mapped + copy'd in `voids.ts`/`approvals.ts`/
  `ApprovalsBoard`.
- **B3** — try/catch on `StaffLineEditor.setQty` + `KdsBoard` bump (roll back optimistic / honest copy).
- **S1** — `mms_resolve_approval` re-derives `amount_cents` from the locked line at approve.
- **S2** — `getFloorView` excludes voided/comped from count + running subtotal.
- **S4** — `mms_undo_fire` excludes comped (UPDATE + latest-batch subquery).
- **S5** — merge supersedes pending approvals **before** the item loop (consistent lock order).
- **S6** — merge fold matches on `state` (no fired↔draft coalescing).
- **S8** — one board-level live region in `KdsBoard` (no per-line `alert` flood) + **N6** (redundant
  `aria-label` removed).
- **S10** — PIN inputs no longer `aria-describedby` the live region (LossActionSheet + ApprovalsBoard).
- **S15** — `mms_approvals_owner_read` scoped `to authenticated`.

**✅ Remediated in the S2-polish follow-up** (migration `20260622100000_s2_polish.sql` + the `claude/feat/s2-polish` diff):

- **S3** — KDS grace cutoff now reads DB `now()` via a new `mms_now()` helper (`kitchen.ts` round-trips it,
  app-clock fallback only if the rpc fails).
- **S7** — `mms_fire_cart` stamps one `fire_batch uuid` per send; `mms_undo_fire` reverses exactly the latest
  in-grace batch (by id), not a `max(fire_at)` tie — one Undo = one Send is now structural.
- **S9** — "Reconnecting — showing the last known …" signal after 2 consecutive poll failures, in
  `KdsBoard` / `ApprovalsBoard` / `FloorDetailLive` (a frozen polled board no longer reads as live).
- **S11** — when no manager is signed in, `LossActionSheet` promotes "Request a manager's approval" to the
  **primary** affordance (the PIN path can't complete) instead of a disabled "Void with approval".
- **S12** — shared `DINER_STATE_COPY` / `STAFF_STATE_COPY` vocabulary (`lib/line-state-copy.ts`), wired into
  Checkout + StaffLineEditor.
- **S13** — shared `<ManagerPinStepUp>` (`ManagerPinFields` + `useLockout` + `pinFailureCopy`) de-duplicates
  the LossActionSheet/ApprovalsBoard PIN flow.
- **S14** — inline "Pick a reason to continue" validation (aria-describedby + a visible/announced note)
  instead of a silently-disabled CTA. (Radiogroup semantics intentionally NOT changed — kept the app's
  `role="group"`+`aria-pressed` segmented-control convention to avoid promising arrow-key roving.)
- **gate-reason** — `mms_void_line` / `mms_request_approval` snapshot the gate (`comp`/`cooked`/`ceiling`/
  `solo`) into `mms_approvals.gate_reason`, so the ledger is reconstructable even if `mms_loss_config` changes.

The migration is applied to live + re-verified (columns nullable, all 5 fns `search_path=""` + service_role
-only execute, advisors clean), the SQL behavioral matrix re-run (batch-discrimination + gate precedence),
and a fresh-context adversarial pass run on the remediation diff before merge.

**⏭ Still deferred** (informational / out of this scope):

- **Nits** N1 (ceiling read outside lock), N2 (comped not on receipt), N3 (roster), N5/N7 (informational).
