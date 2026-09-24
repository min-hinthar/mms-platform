# Phase 2a · padserver — the order pad's server fixes

Scope: order-pad spec, commit group 1, SERVER items only (changes 0 · 1 · 2 · 3 · 26 · 27; tests 8 ·
11 · 12 · 14). No UI, no i18n keys, no migration.

## 1. DESIGN-LANGUAGE draft

- **§17 · a staff write's refusal is CODED by where it happened.** `staffAddItem` answers
  `{ ok: false, error, code }`: the pre-read refusals are coded by the branch that refused
  (`signin` · `sentence` · `invalid` · `outage` · `closed` · `no-cart` · `paying`), and a throw inside
  the add is coded by its PHASE (`lib/staff-add-outcome.ts` `addFailureCode`) — pricing writes nothing,
  so its failures are definite (`sold_out` · `gone` · `outage` · `failed`); anything thrown from the
  write is `unconfirmed`, because the RPC may have committed with its response lost. Never classify by
  message text. An `unconfirmed` add is resent under the SAME `addKey`, never re-tapped under a new one.
- **§17 · one add, one key.** A staff add may carry a client-minted `addKey` (uuid); it rides the
  existing `p_scan_id` scan-event ledger (`mms_scan_events`, claimed in the same transaction as the
  insert/increment), so a resend of the same key is an idempotent no-op on either branch.

## 2. CHANGELOG

- **Staff add: coded refusals, an idempotent add key, and a paid add-on that is never dropped.**
  `staffAddItem` now returns a failure `code` decided by where it failed (`unconfirmed` for a write
  that may have landed), accepts an optional `addKey` forwarded to the existing `p_scan_id` ledger so a
  retried add can never land twice, and `priceItem` refuses (outage) instead of pricing a line without
  its chosen add-on when the modifier options read fails — on the diner path too. A rolled-back SQL
  test now pins the staff Send/Undo's batch isolation (`supabase/tests/staff_fire_undo_test.sql`).

## 3. OPEN-ITEMS rows

| Sev | Item                                                                    | Why / where                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Med | `supabase/tests/staff_fire_undo_test.sql` has never run                 | CI-only (needs the local stack / Docker); written against `20260624030000_s4_money_remediation.sql`'s `mms_fire_cart(uuid)` / `mms_undo_fire(uuid, uuid)` and never executed in the authoring environment. The red-first step (a wrong batch count asserted, watched fail, then fixed) could not be performed here — do it on the first CI run of the integrated branch. |
| Low | The existing staff add surfaces still re-tap after an `unconfirmed` add | `StaffAddButton` / `StaffMenuBrowser` send no `addKey` and show the unchanged "Couldn’t add that item." for every catch, so a lost-response add can still be re-tapped into a double add there. The order pad (2c) is the consumer of `code` + `addKey`; adopting them on the older surfaces is separate.                                                                |
| Low | `mms_scan_events` has no sweep and no `ON DELETE CASCADE`               | Staff adds now write a ledger row per keyed add (a few hundred tiny rows a day). The W7b header already names the sweep as a follow-up; a future cart delete would need the cascade (the same exposure the grocery path already has).                                                                                                                                    |
| Low | `insertOrIncLine` discards the insert RPC's `error`                     | `const { data: insertedId } = await db.rpc(…)` — a transport error and a refused insert both read as "Cart is no longer open". Harmless for the code (both are `unconfirmed` by phase), but the sentence is wrong on an outage. Found, not fixed (outside scope).                                                                                                        |

## 4. Mutate-set / CLAUDE.md enumeration changes

- **File added to the mutate set:** `apps/qr/lib/staff-add-outcome.ts` — bucket **lib** (so the lib
  bucket grows by one; re-measure the CLAUDE.md enumeration with its grep at the integrated head).
- **Mutants added** (block `// ── Phase 2a · padserver ──`, 8):
  `p2a-padserver/write-throw-reads-as-failed` · `p2a-padserver/sold-out-reads-as-failed` ·
  `p2a-padserver/unreadable-catalog-reads-as-failed` (staff-add-outcome.ts) ·
  `p2a-padserver/phase-never-flips-to-write` · `p2a-padserver/pricing-error-not-captured` ·
  `p2a-padserver/add-key-not-forwarded` · `p2a-padserver/pay-refusal-uncoded` (staff-cart.ts) ·
  `p2a-padserver/options-read-error-priced-as-none` (order-lines.ts).
- **Mutants re-anchored:** `staff-cart/qty-collapses-to-one` → find
  `"      null,\n      qty,\n      addKey,\n    );"`, replace `"      null,\n      1,\n      addKey,\n    );"`
  (meaning unchanged: the qty forward collapses to one unit).
- Measured on this branch: `check:mutant-anchors` → 800 anchors, 140 files.

## 5. Owner-visible behaviour changes

- **Diner and staff add, and reorder:** if the menu's add-on read fails at the moment of an add, the
  add is now refused as an outage instead of silently landing the dish WITHOUT the add-on the guest
  chose (and charged less for). On reorder the dish is skipped as "couldn’t check" instead of coming
  back as the base dish.
- **Staff add (existing screens):** nothing visible changes — the same sentences; the new `code` and
  `addKey` are for the order pad (2c).

## 6. K15 strings

None (server only; no dictionary keys added).

## 7. Deviations from spec

- **The catch keeps its binding-free shape.** The spec's `catch` would bind the error; the line after
  `await touchCart(cart.id, "staffAddItem")` is `} catch {`, which the prompt reserved (the send agent
  inserts a line there). The pricing error is captured at the call instead
  (`priceItem(…).catch((e) => { priceFailure = e; throw e; })`) and the catch returns
  `addFailureCode(phase, priceFailure)`. Same semantics — only `priceItem` throws the typed errors — and
  `      { enforceCardinality: true },` plus the staffFulfillment line stay byte-identical. A mutant
  (`p2a-padserver/pricing-error-not-captured`) pins the capture.
- **Gate code:** `signin` when the gate's error is `STAFF_SIGNIN_REQUIRED`, else `sentence` (the same
  split `kitchen.ts` `gateRefusal` makes). The gate's own outage copy therefore codes `sentence`, not
  `outage` — the sentence IS the outage twin that `<OutageText>` already swaps.
- **`StaffWriteCode` lives in `lib/staff-add-outcome.ts`** (pure module, importable as a type from the
  client) and is re-exported as a type from `staff-cart.ts`.
- **Test file names:** the spec's `lib/order-lines.test.ts` does not exist; the options-read cases
  extend `lib/order-lines-availability.test.ts` (whose mock already served the `.in()` read).
- **p_scan_id read before forwarding (as instructed):** `mms_cart_item_insert_if_open` (live:
  20260826000000_m17) and `mms_cart_item_inc_qty` (live: 20260813210000_w7b) claim `p_scan_id` into
  `mms_scan_events` (PK) in the same transaction as the write; a duplicate returns the NIL-uuid sentinel
  (insert) or returns silently (inc) with no write; a refused write raises so the claim rolls back. No
  grocery-only side effect — the M186 repeat rule is client-side (`scan-gate.ts` / the grocery page),
  not in the RPC. Forwarding therefore changes nothing beyond "the same key cannot add twice". One
  property worth knowing: the key dedupes per EVENT, not per dish — a key reused for a different dish
  would also no-op, so the client must mint one key per add.
- **An extra mutant** (`pay-refusal-uncoded`) beyond the spec's list, since the `paying` code is the
  pad's lock trigger.

## 8. LEARNINGS candidates

- A reserved neighbouring line (for a parallel agent's insertion) can force a structural choice: the
  binding-free `catch {}` can still classify a typed throw if the throw is captured at its call site —
  and that capture then needs its own mutant, because deleting it degrades silently to the generic code.
