# Session Handoff — MMS Platform (2026-08-29)

The originating chat context does not carry across sessions — **this file is the durable pickup point.**
Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (research map — decisions, QA gate, rubric,
red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md),
[`CHANGELOG.md`](../CHANGELOG.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

> ## ⏭️ NEXT SESSION — start here (2026-09-03 · PR #248 — T10 · T12 · T14 · T15 closed; /menu stops telling diners their connection dropped)
>
> **`main` is at `70521e6`** — #247 merged on the owner's explicit instruction with `codex-review`
> RED, because Codex had exhausted its account review credits and never reviewed the final head.
> **Top up Codex credits before opening the next PR, or the same block recurs**; the gate itself
> worked exactly as designed by staying red rather than pretending.
>
> **⚠️ TWO OF THE FOUR ROWS IN THIS SLICE HAD PREMISES THAT WERE WRONG, AND BOTH WRONG IN THE SAME
> DIRECTION — toward deferral.** That is the headline, not the code.
>
> **T14 said /menu was fine.** Verbatim: _"Neither is a silent no-op today: both catches re-sync and
> speak."_ True, and it hid a live defect. `TableCartProvider`'s `add`/`setItemQty` DID speak — they
> flashed "Reconnecting to your table…" and re-minted the table session — for EVERY throw, including
> the lock the catch's own comment listed as a cause. A diner whose tablemate was checking out was
> told their connection had dropped and watched a re-mint they did not need. That is the M116/M119
> fabricated-diagnosis class one screen from where four PRs removed it. **J4's clause (b) is "silent
> no-op"; the class is bigger than the clause** — a control that says something FALSE is worse than
> one that says nothing (LEARNINGS #70). The fix is `classifyRefusedWrite` in `lib/cart-freeze.ts`:
> the client cannot read the thrown message (Next redacts Server Action errors in prod), so the cause
> is re-established with ONE `getCartView` re-read and split into four states — `unreachable` is the
> only arm that re-mints and the only one that may say "reconnecting"; `settling` is tested FIRST, to
> match `inertReason`'s documented precedence; `frozen` takes its clause from `inertReason` too, the
> vocabulary /menu already speaks; `unknown` claims nothing. **Grep for the RECOVERY, not the copy** —
> an unconditional `revalidate()` in a catch is a diagnosis whether or not anything is printed.
>
> ⚠️ **THERE IS NO PRE-WRITE GATE, AND RE-ADDING ONE IS THE DEFECT.** Two review rounds killed two
> separate attempts (the provider's, then `YourUsual`'s). `authz.ts` computes the lock as
> `locked_at > now - CART_LOCK_TTL_MS`, so it expires by the passage of TIME with no row write — no
> realtime event, and a tab that stays visible never hits the visibility refresh either. Any gate on
> that cached value intercepts the very write that would have corrected it. The server decides;
> refusals are explained afterwards, from a read (LEARNINGS #72).
>
> **T10 named a blocker belonging to a different hook.** It said widening the subscription "changes
> channel scope and the RLS path on `realtime.messages` (private channels, `is_member`)" — all true of
> `useGroupCart`, none of it true of `useCartRealtime`, which is the hook the row is about. They share
> a file and the reasoning slid between them, toward the more expensive answer (LEARNINGS #71).
> Measured: non-private channel, no broadcast, ordinary SELECT RLS on `qr_carts` with no mode term,
> both tables on the publication since `20260620000600_cart_realtime.sql`. No migration, no policy.
> The "slice" was the deletion of the `enabled` parameter — and deletion is the point: a parameter
> that does not exist cannot be re-narrowed, which is T9's required-props argument one layer down.
>
> **`YourUsual` was a fourth ungated add surface**, found while measuring T14 rather than named by it.
> `AddButton` and `ItemSheet` have gated on `locked || settling` since W9b; it never did.
>
> **T12** is mechanical now: `lib/rewards-summary.test.ts` plus four mutants, one per
> `mms_rewards_summary` reader plus the over-tight direction. Every reader asserted in BOTH
> directions — a suite that only checked "an error yields null" passes against a reader that returns
> null unconditionally, which is its own defect.
>
> **T15** was re-read rather than restated: none of the kiosk's four catches fabricates a cause, so it
> stays outside the freeze model by decision.
>
> ⚠️ **T20 IS THE HIGHEST-VALUE ROW THIS SLICE LEAVES, AND #248 RAISED ITS REACH.** `AddButton` and
> `ItemSheet` are natively disabled off a CACHED `locked`, and the lock expires by computation with
> no row event — so both primary add surfaces can go permanently inert, and being disabled they
> cannot generate the request that would correct the cache. T10's realtime widening made that state
> reachable on pickup and scan-and-go, which never received a pushed lock before. The fix needs
> `CART_LOCK_TTL_MS` out of `server-only` `lib/lock.ts` into a shared pure module, then ONE re-read
> scheduled while the freeze is held — not a poll (see `recheckLock`'s reasoning on the checkout
> side). Do it before the next surface adopts the same gate.
>
> **Still open, in order:** the **cart→intent link** (M123 · M124 · M151 · M152 a/b/c — one owner
> decision, designed in `docs/CART_INTENT_LINK.md`, **not written, not applied, authorization
> required**; the QR prod migration history is divergent — read the `db push` warning in `CLAUDE.md`
> first) · **C16** (owner-only) · **T16** (nine deferred guard evasions) · **T17** (the new one: the
> no-mode-gate rule is enforced by TypeScript, not by a guard) · the med/low sweep, which has still
> never had a truth pass — and after this slice, **assume it is stale in the deferral direction.**

> ## ⏭️ NEXT SESSION — start here (2026-09-03 · PR #247 — T9 · T11 · T13 closed; the freeze now reaches the child controls, and two guards that could not fail can)
>
> **Branch `claude/qr-app-backlog-cj2t0m`, PR #247, on top of `ce1c4a8`.** Three registry rows closed
> and a fourth defect found by the guard written for the first.
>
> **⚠️ ROUND 1 OF REVIEW REWROTE MOST OF THIS SLICE, AND THE HEADLINE IS THAT BOTH GUARDS AUDITED
> LESS THAN THEY PRINTED.** Codex left ten P2s and a blind adversarial pass returned REJECT with
> three criticals; the two independently agreed on the sharpest — `check-child-freeze.mjs` was
> opening **4 of the 8 components that fire the mutations it derives**, because `readdirSync` is not
> recursive and `ImportSpecifier.name` is the LOCAL binding (so `import { addItem as addItemAction }`
> matched nothing). Its docblock, `ci.yml` and the T9 closure all claimed those components "join
> automatically". **The transferable lesson is LEARNINGS #68: a guard reports on the code it opened
> and never on the code it did not — so print what you opened, and make every exclusion an entry
> that must FIRE.** Both guards now name their counts and their exemptions; the residual gaps are
> filed as T14 · T15 rather than left to a directory read.
>
> **The copy design was also wrong, and in the M116 way.** Children were given the parent's own
> `freezeNotice` sentence "so a refusal cannot drift from the explanation" — backwards, because that
> string rides the SUPPRESSED freeze while the gate rides the RAW one. The pair is only exercised
> where they disagree: the viewer's OWN in-flight create-intent, where the `??` fallback read
> "Someone's checking out" about the reader. Pass a child the FACT; let it name its own control
> (LEARNINGS #69).
>
> **T9 — the four child controls.** `RewardField`, `SendToKitchenButton`, `PickupWhenChoice` and
> `SplitSection` now take `frozen` + `frozenNote` as **required** props. Required, not defaulted: an
> unwired call site is a type error, which is a stronger guard than any script. Handlers early-return
> on `frozen`; controls are `aria-disabled`, never natively `disabled` (WCAG 2.4.3 — native `disabled`
> drops focus to `<body>` mid-interaction). **`SplitSection` was not in T9's list** — its `reassign()`
> caught `assignLine`'s throw into an EMPTY block, the same silent no-op as `RewardField.remove()`.
> Two deliberate non-gates, both documented at their call sites: `SendToKitchenButton` keeps
> `undoUntil` OPEN under a freeze (the server has already taken the undo away; closing the window
> locally would forfeit it for good), and `PickupWhenChoice` does not pretend to stop a write already
> in flight on `writesRef` — that one is refused server-side and the existing `reason: "locked"`
> branch already snaps the pill back.
>
> **THE METHOD THAT FOUND THE FOURTH COMPONENT, AND THEN THE FOURTEENTH MUTATION, IS THE THING TO
> CARRY FORWARD.** `scripts/check-child-freeze.mjs` derives its subject set from the lib modules
> rather than reading T9's list — so `SplitSection` announced itself on the first run. Then, because
> it derives the SAME set `check-freeze-parity.mjs` derives, the two came back one apart: that is how
> `apps/qr/lib/reorder.ts`'s `reorderOrder` was found, a fourteenth lock-bearing mutation neither
> guard had ever opened, **missed by T13's own first fix** because that fix looked only for a
> destructured `locked` while `reorderOrder` keeps the whole authz object. Two independent derivations
> disagreeing is a finding; one agreeing with itself is not. If you write a second view of an existing
> rule, cross-check the sets and treat a mismatch as a defect in one of them.
>
> **T11 + T13 — three ways `check-freeze-parity.mjs` could not fail, now closed and each falsified in
> one edit.** `if (locked) return { ok: true }` used to pass rule 1 (a refusal is a `throw` or an
> `ok: false` literal now); a write INSIDE the locked branch used to beat rule 2 (the EXIT statement's
> position orders it now, not the `if`'s); and the FILE set was two constants, so deleting
> `setPickupSlot`'s refusal printed CLEAN. Subject count is 14 and the set is derived.
>
> **⚠️ One falsification run reported GREEN and was VACUOUS.** The mutation regex `if \(frozen\) return;`
> missed a guard line carrying a trailing comment, so nothing was deleted and "the guard did not fire"
> meant nothing. Redone by line number, it failed as it should. **Always diff the file after applying a
> mutation** — a falsification you did not confirm landed is not evidence, and this is the second time
> in two sessions (`LEARNINGS` #61's multi-line `const lockedFresh`).
>
> **Still open, in order:** **T10** (pickup/scan-and-go get no live lock delivery, so the second-tab
> freeze arrives one refused edit late) · **T12** (the rewards error→null rule is mechanically
> unpinned) · the **cart→intent link** (M123 · M124 · M151 · M152 a/b/c — one owner decision, designed
> in `docs/CART_INTENT_LINK.md`, **not written, not applied, authorization required**; the QR prod
> migration history is divergent — read the `db push` warning in `CLAUDE.md` first) · **C16**
> (owner-only) · the med/low sweep, which has still never had a truth pass.
>
> **⚠️ Codex credits were exhausted when #246 merged.** If they still are, #247 hits the same
> `codex-review` block. That is the gate working, not failing — "the reviewer ran out of credits" is
> not "the reviewer approved", and merging past it is the owner's call, never the session's.

> ## ⏭️ NEXT SESSION — start here (2026-09-03 — #246 is MERGED as `ce1c4a8`; the money-path `high` cluster is now ONE owner decision, and everything else at `high` is a child-component gap)
>
> **`main` is at `ce1c4a8`.** #246 shipped J4's residual (`apps/qr/lib/cart-freeze.ts` — the one
> binding that mirrors `cart.ts`'s bare `locked` across eleven mutations) plus the backlog truth pass.
>
> **⚠️ IT MERGED WITH `codex-review` RED, on the owner's explicit instruction, and the reason
> matters for the next PR: Codex reached its account usage limits mid-review and could not review the
> final head.** Every other check was green and `verify:slice` passed 248/248. The gate itself worked
> exactly as designed — it stayed red rather than pretending — so **top up Codex credits before
> opening the next PR, or the same block recurs.** If it does and the work is finished, the choice is
> the owner's, not the session's: "the reviewer ran out of credits" is not "the reviewer approved".
>
> **What seven Codex rounds actually taught (5 → 4 → 3 → 4 → 4 → 2 → 3, every finding real).** Rounds
> 1–3 were the product change; **4 onward were almost entirely the guard auditing itself**, which is
> the #241/#242 pattern repeating. Two late findings touched shipped behaviour and justified the whole
> tail: the edit gate derived from the SUPPRESSED freeze (every control live while the server refused),
> and Reopen wiping a NEWER client secret out from under a mounted Payment Element. **The recurrence
> worth internalising is LEARNINGS #65: FOUR separate matchers in one guard file each had to be
> re-bound after being written to match TEXT.** When you write a predicate over a name, the question is
> never "does this string appear" but "is this the thing I mean" — and after fixing one, grep the same
> file for every other predicate still spelling instead of binding.
>
> **The whole money-path `high` cluster is one decision.** M123 · M124 · M151 · **M152 (a/b/c)** all
> reduce to the same missing fact — a cart→intent link so every pin-clearer can say
> `and live_payment_intent_id is null`. Designed in `docs/CART_INTENT_LINK.md`, **not written, not
> applied, owner authorization required** (the QR prod migration history is divergent — read the
> `db push` warning in `CLAUDE.md` before touching it). Nothing else at `high` is blocked on it.
>
> **Next open, in order of value:** **T9** (high — the only unblocked `high`: `RewardField`,
> `PickupWhenChoice` and `SendToKitchenButton` take no freeze prop, so they still present live
> mutation controls under any freeze; RewardField's Remove ignores `clearReward`'s `ok:false` and
> refreshes back to the applied reward) · **T11** (the two remaining shape holes in
> `check-freeze-parity.mjs`) · **T10** (pickup/scan-and-go get no live lock delivery) · then the
> cart→intent link the moment it is authorized · **C16** (owner-only) · the med/low sweep, which has
> still never had a truth pass.
>
> **The registry had three duplicate IDs and they are FIXED** — #246's truth pass filed new rows under
> `G17`, `G18` and `T7`, all three of which were already taken, so two different rows answered to one
> name in the file that is supposed to be the single registry. The 2026-09-02 rows are now **G20** ·
> **G21** · **T12**; the pre-existing rows keep their IDs, and the three closure notes that pointed at
> them (G3's, G4's, J8's) plus the CHANGELOG entry were updated in the same commit. **The lesson is
> the method, not the numbers:** the next free ID was DERIVED by reading every row in the file, and
> the result was checked as a set (`uniq -d` empty, old rows still present) rather than eyeballed.
> Never pick an ID from memory — that is exactly how these three were minted.

> ## ⏭️ NEXT SESSION — start here (2026-09-02 — a truth pass found 7 of 16 open `high` rows already fixed; J4's residual shipped; the registry is now measured, not remembered)
>
> `main` is at #245. **#246** closes J4 and trues up the registry.
>
> **⚠️ THE REGISTRY WAS 44% STALE AT `high`, AND THAT IS THE HEADLINE.** Sixteen open `high` rows were
> verified against source and **seven were already fixed and never marked** — F3 · F4 · G2 · G3 · G4 ·
> J7 · J8. Two of them (J7, J8) carried comments in the SOURCE describing their own defects in the
> past tense. Before picking any row off this file, verify it: three rows this week (M153, M123, M124)
> had premises that were wrong or already closed, and the pattern is not rare.
>
> **The method that made it trustworthy, and it is worth repeating:** every CLOSED verdict was
> adversarially re-checked by a second agent told to prove it wrong, because a false "closed" deletes
> a real defect and nobody looks again. That inversion earned its keep immediately — **J4 was verified
> CLOSED and the skeptic overturned it.** The peer case was genuinely done; the identical harm
> survived for a self-held lock, on a route that needs no error at all.
>
> **J4's residual, now shipped:** every UI guard keyed off `lockedByPeer` while every server refusal
> in `cart.ts` is bare `locked` across eleven mutations. `apps/qr/lib/cart-freeze.ts` is the one
> binding that mirrors the server. Read its docblock before touching the lock UI — especially the two
> deliberate limits: the pay CTA stays on `lockedByPeer` (Pay is the self-locked diner's escape hatch,
> since the same uid may re-acquire), and the self notice must never borrow `superseded`'s vocabulary.
>
> **Still open and unchanged:** the cart→intent link (**M151** · **M152 a/b/c** · **M123 a′ and b**) is
> one prod migration, designed in `docs/CART_INTENT_LINK.md`, **not applied, owner authorization
> required**. **C16** (branch protection) is owner-only. **M124**'s sub-millisecond era collision is
> live and needs no migration. New from the pass: **G20** · **G21** · **T12** · **T8** (renamed 2026-09-03 — the pass first filed them under IDs that were already taken).
>
> **Next open, in order of value:** C16 (owner) · the cart→intent link slice (owner-gated) · **M124**
> (med, no migration — the era collision) · **T12** (med — pin the rewards error→null rule before it
> regresses) · **F5** / **G5** / **S2**, all PARTIAL with the live half measured in the pass · then the
> med/low sweep, which has never had a truth pass.

> ## ⏭️ NEXT SESSION — start here (2026-09-01 — #244/#245 finished the attempt-token work that needs no schema change; EVERYTHING else on that arc is one prod migration, designed and un-applied)
>
> `main` is at #244; **#245** adds M153. The through-line: `locked_at` is the checkout ATTEMPT's
> name, and every release that touches the lock now says which attempt it is. #244 gave the client
> that token (M124); #245 did the server side — one `freeLock()` helper over
> `releaseCartLockFor` for all seven refusal exits, and the era-scoped lock release in both abandon
> paths.
>
> **⚠️ READ THIS BEFORE TOUCHING THE PIN.** #245 first tried collapsing each abandon pair into
> `releasePayAttempt`, and it was a REGRESSION that Codex and the blind adversarial pass caught
> independently. `mms_release_promo_grant`'s `locked_at is null` disjunct is load-bearing for
> `create-intent` and NOT for a client exit: the pin is the route's own, and a predecessor's delayed
> `payment_failed` webhook nulls `locked_at` cart-wide, so an era-only predicate strands that pin on
> an unlocked cart — manufacturing M123 (a′). A client cannot show the pin is its own and must fail
> closed; this caller holds the lock it pinned under and must not. `check-pay-attempt.mjs` rules 3
> and 4 now hold both directions.
>
> **⚠️ M123 (b) IS STILL OPEN — it was attempted and reverted, and the reason is worth inheriting.**
> Making `getCartView` quote the live promo agrees with what `create-intent` derives and DISAGREES
> with the five counter rails (cash, secure-tab close, Terminal, split, the floor settle quote),
> which all charge the pin. Quoting the pin lies about the phone; quoting live lies about the till.
> There is no correct display basis until the pin's validity is decidable.
>
> **⚠️ THE REST OF THIS ARC IS ONE PROD MIGRATION AND IT IS NOT APPLIED.**
> `docs/CART_INTENT_LINK.md` is the design — read it before touching **M151**, **M152 (a/b/c)**, or
> **M123 (a′ and b)**, which are all the same missing fact: no cart→intent link exists between mint
> and fulfilment, so no pin-clearer and no display can ask "does a live PaymentIntent depend on
> this?". Settled there: a **service-role-only sidecar**, never a `qr_carts` column (that table is on
> `supabase_realtime` and fans its full row to every anonymous tablemate — the `mms_tab_secure`
> precedent, cited). Still open there: the stuck-link hazard, whose three candidate answers must be
> **checked against Stripe's documented behaviour, not inferred** — the `db push` warning in
> `CLAUDE.md` was wrong twice for exactly that reason. The apply is one file at a time via Supabase
> MCP against the divergent history, and **needs the owner's explicit say-so.**
>
> **Next open, in order of value:** **C16** (owner-only — require the `codex-review` check in branch
> protection; #241 is the measured proof) · the **cart→intent link** slice (M151 · M152 · M123 a′+b,
> high, migration-gated on **M125**) · **M148 (b) + (d)** (low) · **M154** (low — the sibling uid-only
> lock release in `manual-capture-run.ts`, left alone on purpose; the row says why) · then the
> OPEN-ITEMS sweep.

> ## ⏭️ NEXT SESSION — start here (2026-08-29 — the back-sweep arc #240–#242 is MERGED; the backlog is mostly CODE: 90 of 148 open rows are Money/security/hardening)
>
> `main` is at #242. The arc closed: the money-path promo-pin move + the `codex-review` gate + Rice
> off the promoted POS order (#240), the CI fast-lane teeth — `format:check` ·
> `check:migration-versions` · `check:promo-pin` in `ci.yml` (#241), and the back-sweep leftovers
> M146 · M147 · M150 plus **half of M148** (#242 — its (a) and (c) doc-claim corrections; **(b) and
> (d) stay OPEN** and need the original Codex comments re-read, not re-asserted — see the M148 row). Two new LEARNINGS
> entries carry the session's real lessons: **#60** (eleven of thirteen Codex findings were in guards
> written that day — a matcher satisfied by a name/substring/count/position/constant while the
> behaviour regressed; guards about executable behaviour PARSE, never scan — and where no parser
> exists for the subject, as in the CSS band guard, the scan is bounded and falsified) and **#61** (#241 was merged **eleven seconds
> past a red `codex-review`** — mark-ready and merge are never one motion; the merge ritual is now
> `docs/WORKFLOW.md` §Review step 5, and C16 is what makes the gate real).
>
> **Next open, in order of value:** **C16** (owner-only — require the `codex-review` check in branch
> protection; #241 is the measured proof) · **M151** (high — concurrent create-intents can hold
> different promo pins; needs `qr_carts.live_payment_intent_id`, i.e. a prod migration, gated on
> **M125** history reconciliation) · **M148 (b) + (d)** (low — the M125-row "both exist" claim and
> the unpinned-token count whose fix is stating the definition, both pending a re-read of the
> original Codex comments) · then the OPEN-ITEMS sweep — 148 open rows measured, **90 of them
> Money / security / hardening code items**; the owner-config / photo-shoot / hardware / SKU-import
> blockers are a ~10-row minority that gates specific arcs, not the bulk of the registry.

> ## ⏭️ NEXT SESSION — start here (2026-08-21 — the M-registry backlog is being worked in severity order; W22d proper SPLITS — its **dark half is UNBLOCKED and in progress as M126** (Night enriched, not re-hued; the aubergine direction was built, rejected and reverted), its **light/maroon half stays OWNER-BLOCKED on M86**)
>
> ### ⏭️ Pick up here — M116 closed; M111 · M112 are the next open rows, plus the new M119 class
>
> ### 🔴 2026-08-27 — M22 · M70 · M72a APPLIED to production, closing a LIVE money-path outage
>
> Prod is at **97 migrations**. The **nine RPCs M22 · M70 · M72a touch** now exist with one shape
> each and `service_role`-only grants, verified with `has_function_privilege` after each apply.
> ⚠️ **Nine is the count THIS apply covered, not the app's RPC surface** (M148, Codex on #236):
> a repo-wide search finds **57** distinct literal `.rpc()` names. The earlier wording — "all
> nine RPCs the app calls" — made a narrow verification read as an exhaustive schema-drift
> check, which is the kind of claim the next reader stops looking behind.
>
> **What had happened, because the shape of it will recur:** the app half of a migration deploys to
> production automatically on merge to `main` (Vercel), while the SQL half needs a MANUAL apply.
> M22 · M70 · M72a all merged, all auto-deployed, none applied — so production ran code calling
> `mms_pin_promo_grant`, `mms_release_promo_grant(p_cart_id, p_attempt)`,
> `mms_release_promo_grant_for_holder`, `qr_carts.promo_granted_cents`, and both fulfill functions'
> `p_promo_cents`, **none of which existed in the database**. PostgREST resolves `.rpc()` by argument
> NAME and rejects a whole query naming an unknown column, so checkout, promo-apply, card
> fulfillment and cash settle were ALL failing. The webhook correctly 5xx'd, so Stripe held the
> retry — a card could be captured with no order written. It survived unnoticed only because the app
> is pre-launch (14 paid orders, last one 2026-08-17).
>
> **The durable fix is a rail, not a checklist**: nothing in the repo tracked "SQL applied?" as
> distinct from "PR merged", which is exactly how three migrations shipped half-deployed. Until there
> is one, treat every merged migration as UNAPPLIED until the catalog says otherwise — checking the
> objects THAT file creates, not `pg_proc` reflexively (many migrations here add only columns,
> indexes, policies or data and define no function).
>
> ⚠️ **Prod's migration history is DIVERGENT from this repo** — see `CLAUDE.md:46`. The versions are
> MCP-generated and share **zero** values with the repo filenames. **`db push` in ANY form cannot be
> used here until the histories are reconciled** — and this note has now been wrong TWICE by
> inferring CLI behaviour instead of observing it (M148). Draft 1 said plain `db push` replays from
> `create table`; draft 2 said `--include-all` WOULD force that replay and is "genuinely
> destructive". Both unverified. Codex reports (#236, round 2) that `FindPendingMigrations` rejects
> remote versions absent from the local directory **regardless of the flag**, and that `includeAll`
> only admits local migrations preceding the latest remote version — so with 97 remote-only stamps
> BOTH forms stop before applying anything. `CLAUDE.md`'s fence carries the measured-vs-unmeasured
> split; do not restate a failure mode you have not run. Apply one file at a time with the MCP
> `apply_migration`, verifying the
> objects THAT file creates before the next — `pg_proc` is not universal, since column/index/policy
> migrations leave no function row. Reconciling the histories is filed as **M125**.
>
> Two real defects in M70 were found by the pre-apply audit and filed rather than fixed inline, both
> **high**: **M123** (a pinned promo grant survives lock-TTL expiry and prices a later basket) and
> **M124** (`mms_release_promo_grant_for_holder` matches on `locked_by` alone, so a late unload
> beacon from one tab clears the pin a second tab's PaymentIntent was derived under). ⚠️ An earlier
> draft of this note named the wrong function for M124 and prescribed a `status = 'open'` gate; that
> gate cannot close it, since the cart is still open in the capture→webhook window. **Both rows need
> an attempt/era discriminator.** Applying M70 was still strongly net-positive: it replaced a total
> promo outage with an edge case.
>
> **M17 AND M109 are both APPLIED to production** (`fasnpdhtvqtzjlvruqcu`; M17 2026-08-23, M109
> 2026-08-24 — via the Supabase MCP, which is why prod's recorded `schema_migrations` versions differ
> from the repo filenames). **Repeat the drift check before every push, because it is what makes the
> restatement safe:** compare prod's live `prosrc` against the repo's LAST-DEFINING migration for that
> function before applying, so you know the body you are replacing is the one you think it is. Both
> times prod matched on LOGIC but not on bytes — prod's copies carry fewer inline comments, an
> artifact of the MCP path — so normalize comments away and diff the tokens, then verify `md5(prosrc)`
> against the repo body AFTER applying (M109 came back byte-identical: `a5d28c3a…`). M109's own probe
> also confirmed the defect was live: `position('mode' in prosrc)` was **0** on the old body. Prod has
> 0 active sessions and 0 open carts, so neither apply moved live data.
>
> - **M116 closed — and the lesson is about the FIX SHAPE, not the sentence.** `setup-intent` answered
>   "Tabs are for dine-in tables" on an unreadable read. The tempting fix is to handle the error; the
>   right one was to DELETE the read. `assertCartMember` already reads `table_sessions` and already
>   fails closed, so the window was never "the DB is down" — it was the GAP between authz's read and
>   this one. Handling the error narrows a gap; removing the read removes it. Case 5 of the new test
>   asserts the route touches `table_sessions` **not at all**, so the deletion cannot drift back into a
>   corrected re-read.
> - **⚠️ `check-money-coverage` reported "clean" over an EMPTY SET.** It diffs `base...HEAD`, so an
>   uncommitted change is invisible to it — it said clean for a money-path file with no mutant at all.
>   Committing first turned it red, which is the verdict that meant something. **Run the coverage guard
>   after committing, never before**, and treat a "clean" on an uncommitted tree as no information.
>
> **M17's migration is APPLIED to production** (`fasnpdhtvqtzjlvruqcu`, 2026-08-23, via the Supabase
> MCP — prod's `schema_migrations` is keyed by that path's timestamps, not the repo filenames, which is
> why the recorded versions differ). Verified after: `qr_cart_items.tax_category` exists with the CHECK
> mirroring `menu_items`, the backfill stamped **226** rows and left **19** (the grocery barcode lines)
> null with **0** uuid-shaped rows unstamped, one signature on the insert RPC, grants `postgres` +
> `service_role` only, `search_path=""` on both functions, and both `md5(prosrc)` values byte-identical
> to what the migration file produces. The drift check ran FIRST and is the part to repeat next time:
> prod's live bodies were compared against the repo's last-defining migrations (m100 for the toggle, m3
> for the insert) before applying, so the restatement was known to clobber nothing newer. They matched
> on logic, not bytes — prod's copies carry fewer inline comments, because they were applied through
> the MCP rather than the CLI. **Still pending, and deliberately not done here:** the `lemon-salad`
> tax-category correction is a per-item CDTFA classification call for the owner. Four items are filed
> `hot_prepared` with salad-shaped names — `lemon-salad`, `fishcake-stuffed-salad`, `ngapi-rice-salad`,
> `rice-with-pickled-tea-salad` — and each is only exempt to-go if it is genuinely served cold.
> Guessing in the exempt direction is under-collection. Run `supabase/data/m17_recategorize.sql` right
> after whichever corrections the owner confirms.
>
> - **M109 closed — the same-mode rule now exists in SQL.** `mms_merge_table_orders`'s body never
>   mentioned `mode`; the rule lived only at `floor.ts:666`, in front of a service_role RPC. The thing
>   worth carrying is what M97 did NOT buy: its fold predicate refuses to FOLD two lines whose tags
>   differ, but **a refused fold re-parents** — the line lands on the target cart anyway, and the tail
>   cancels the source cart and closes its session. "A guard refuses" and "nothing moves" are different
>   claims, and reading the first as the second is how this sat filed as merely `med`. The fix is a
>   whole-merge GATE, not a fold predicate, because there is no per-line outcome that is correct.
> - **⚠️ The most valuable finding of the whole item: the first suite could not tell WHICH COLUMN the
>   gate read.** A session's `mode` and its lines' `fulfillment` tags travel together in ordinary data
>   (a pickup session's lines are `togo`, a scan-and-go session's are `grocery`), so five fixtures
>   built from ordinary tables left the two perfectly correlated — and the suite was **measured green
>   against a gate that never read `mode` at all**, comparing line tags instead. That is M109's own
>   defect, reintroduced with every test passing. Found by the blind adversarial pass, then reproduced
>   directly. **The generalisation worth carrying: when a rule is about column A, ask what else moves
>   with A in your fixtures — a suite over ordinary data cannot separate two columns that ordinary
>   data keeps in lockstep.** The way out is that the correlation is usually not a law: a seated diner
>   can tap "To go", so a `dinein` session legitimately holds a `togo` line. Case 4 (modes equal, tags
>   differ → must succeed) and case 5 (modes differ, tags match → must refuse) break it in opposite
>   directions, and both are needed — a gate ANDing a tag conjunct onto a real mode comparison passes
>   4 and only 5 sees it.
> - **Two more cases carry the other mis-write family, and neither is the obvious one.** Case 3
>   (scan-and-go → pickup) is the only one that kills a `dinein`-flavoured gate copied from M100's
>   neighbouring guard; case 7 (pickup ↔ pickup) is the only one that kills the over-tightening to
>   "both must be dine-in". Cases 1 and 2 — the ones anybody would write first — pass both mis-writes.
>   When the guard next door is spelled around ONE enum value, the copy-paste failure is that shape.
> - **A post-refusal assertion cannot prove ORDERING.** The same pass killed a claim in the test's
>   comments: a plpgsql `begin … exception` block is an implicit savepoint, so catching the raise
>   rolls the merge back wherever the gate sits. Measured by relocating the gate below
>   `update table_sessions set status = 'closed'` — the whole file stayed green. Those asserts are
>   fixture-drift checks and are now labelled as such.
> - **A lock shipped and was removed before merge, and that is the reusable part.** M109 first took
>   `for update` on both session rows. It bought nothing for `mode` (no writer of that column exists
>   anywhere), so its real justification was a `status` race one column over — and it was not free:
>   `explain` gives `LockRows → Sort (Sort Key: s.id)` while `mms_sweep_expired_sessions` (pg_cron,
>   every 15 min) is `Update → Seq Scan`. Two orders over the same rows is a deadlock path that does
>   NOT exist today, only because the merge tail locks exactly one session row. **Read the plan before
>   adding a lock**, and do not fix defect B half-way inside a PR about defect A — the `status` race
>   is real and is now M118, with that ordering constraint written down.
>
> **M100 · M107 shipped (#220); M108 · M113 shipped (#226)** — the session's mode is now re-derived
> server-side in `mms_set_line_fulfillment` and `mms_fire_line`, and on the INSERT path it is read
> ONCE, by `assertCartMember`, off the row that already proves the session active. All four are closed
> in `docs/OPEN-ITEMS.md`. Two durable rules came out of them: a client render gate (`isDineIn &&`) is
> advisory on a public POST, and — from #226 — **a second read of a fact you already hold is a second
> chance to fail, and it will fail in whichever direction the call site's default happens to point.**
> Three sites discarded the error on that column: two under-collected tax, one published a dine-in
> diner's name to a public TV. Deleting the read beat handling the error at every site. The full
> census is **eleven** readers (`addItem` · `reorderOrder` · `api/board` · `api/session/peek` ·
> `manual-capture-mode` · `kitchen` · `register` · `expo` · `staff-open-cart` · `create-intent` ·
> `setup-intent`), every one re-read; the eight not fixed here fail closed or are caller-scoped.
>
> - **The twin-audit is the reusable move.** After fixing the two rows M108 named, every remaining
>   read of that column was classified rather than assumed — which is the only reason M113 (the board
>   leak) was found at all; nothing had filed it. When you close a defect defined by a SHAPE, grep the
>   shape before closing the row.
> - **M116 (low, open)** is the audit's leftover — re-filed from M114, which was RETIRED in #227
>   because it had been written around a refusal that never shipped: `setup-intent/route.ts:32` fails closed but answers
>   "Tabs are for dine-in tables" on an unknowable read — the refusal is right, the sentence is a
>   fabricated diagnosis. It reads the same column and should read `mode` off `assertCartMember` too.
> - **M17 shipped (#227) — but the first fix was REJECTED, and that is the part worth carrying.**
>   The obvious move (refuse the toggle when the category will not resolve) was measured against the
>   wrong quantity: `getCartTotals` reads `tax_cents` as a **boolean**, so comparing the stored NUMBER
>   before and after says nothing about the charge. Measured properly it changed nothing in the
>   direction M17 was filed for, stranded the box (a refused flip leaves the line `dinein`, so the
>   counter never sees a bag), and introduced an under-collection in the other direction. **Assert on
>   the charge, not on the column.**
> - **The shipped fix snapshots the fact instead of re-deriving it.** `qr_cart_items` already froze
>   `name`, `modifiers` and `unit_price_cents` and left `tax_category` a live lookup — so a pruned
>   catalog row could revoke it. It now carries the category, stamped at insert (inside
>   `mms_cart_item_insert_if_open`, signature unchanged, so no deploy window and no caller edit) and
>   backfilled. Two of the four transitions are genuinely un-derivable from the row (`grocery_food` is
>   exempt BOTH ways, which falsified an earlier header's claim of three), so keeping the fact was the
>   only correct answer.
> - **`verify:mode-authority` now replays a migration CHAIN.** M17 is the fourth definition of
>   `mms_set_line_fulfillment`, and the battery's drift check caught it on the first run: replaying
>   M100 alone would have reverted the fix and every verdict would have been about dead code. A mutant
>   now names which migration text it patches, and that file must be the LAST one defining its
>   function. Add a migration that restates either function and this is the file to update.
> - **M115 (low, open)** is what #227 deliberately did not widen into: `Checkout.tsx:642` discards the
>   toggle's result, so every refusal reaches the diner as a pill that moves and moves back.
> - Still open from the merge-fold chain: **M99 · M103 · M105 · M106** (all low), plus **M109 · M111**.
>
> **A rule worth carrying, from #220:** a multi-case `plpgsql` ASSERT file can only ever prove its
> FIRST case — red-then-green on eight cases is a claim about one. `scripts/verify-mode-authority.mjs`
> is the pattern for the other seven (`.claude/LEARNINGS.md` #51).
>
> ### The W22 slate is still down to one owner decision
>
> `docs/W22_DESIGN_PROPOSAL.md` is the plan-of-record and **every slice is marked SHIPPED except
> W22d**. What remains:
>
> - **W22d · Night, designed — the DARK half is UNBLOCKED and in progress; the LIGHT half is still
>   owner-blocked.** ⚠️ **The aubergine direction was tried and rejected.** It shipped as #235 and was
>   reverted on 2026-08-27 (owner: _"I actually prefer the Night than the Aubergine. Make Night more
>   enriched, enhanced, layered, shades, effects."_). Do not resume the aubergine build from this
>   block or from `docs/W22D_HUE_DECISION.md` — both describe a rejected direction.
>
>   - **DARK → registry M126 · Night ENRICHED, not re-hued.** The hue was never the problem. Measured
>     on the restored ground, the ladder is **four surfaces and three gaps** — `--pg` → `--sf` → `--cd`
>     → `--surface-elevated`, contrast **1.0906 / 1.0727 / 1.0951** (Y ratios 1.716× / 1.365× / 1.375×)
>     — every one under 1.10, and the hairline `--bd` reads only 1.40–1.45 against its own surface. So
>     the flatness lives on the LIGHTNESS axis, and the rotation held OKLab L fixed on all four ground
>     values at once. ⚠️ **Do not count `--oa` as a rung** — an earlier draft here did, quoting
>     1.0717 / 1.0727 / 1.0951 and a "dead step" of 1.0176. `--oa` is on-accent INK (29 `color:` uses
>     against one `background:`), never a plane behind content. Four directions (depth · light · material ·
>     atmosphere) go to the owner as a rendered prototype board **before any token moves** (standing
>     directive: _"always show me my decisions and prototypes so I can pick and choose"_). The hard
>     limits are measured: `--cd` may lighten by only ΔL 0.0103 before the ruby/jade tint combos
>     break, any surface carrying `--t3` needs Y ≤ 0.031089, darkening is free (all 28 dark combos
>     improve), and a NEW surface token gets no audit coverage automatically.
>   - **LIGHT/maroon → registry M86, still BLOCKED ON THE OWNER.** Untouched by the revert. The full
>     note is [`docs/W22D_HUE_DECISION.md`](W22D_HUE_DECISION.md): two candidate maroons (`#a41034`
>     declared canon vs `#a71b1d` measured off the logo), the brand-mark-reservation conflict, and the
>     measured **luminance window** any accent must land in (Y > 0.153066 so the negative guard still
>     holds, Y ≤ 0.171484 so `--ac` on `--pg` clears 4.5) — today's `#a65f10` sits inside it at
>     0.16329 and **every candidate maroon is outside at 0.085–0.110**, so the hue cannot simply be
>     swapped onto `--ac`. Do not start that build before the two questions are answered.
>
>   The correctness floor (**W22d-1**) shipped ahead of both and is independent.
>
> Shipped since this block was last rewritten: **W22c** (the gesture layer), **W22d-1** (the Night
> correctness floor + `pnpm check:theme` in CI), **W22e** ("your usual", honestly) and **W22f** (the
> opt-in sound identity). Their findings live in `CHANGELOG.md`; the durable rules they produced are
> `docs/DESIGN-LANGUAGE.md` §12 (hands), §13 (Night), §14 (recognition) and §15 (sound).
>
> **Also open, small — `docs/OPEN-ITEMS.md` M56**, the three W22a polish to-dos noted-and-merged under
> the 2-round rule: ① the empty-Surprise-me copy blames a diet filter when the WHOLE menu is sold out
> (check in-stock before attributing); ② the pause choice is component-local, so pause → search →
> clear remounts the band playing (persist per visit); ③ the drift resumes while an ItemSheet opened
> from a card is up, so closing it can scroll the rail away from the opener.
>
> **The process rule that now binds every PR (owner, 2026-08-16 — "when diminishing returns after
> round 2, should note for nice to-dos and merge"): TWO Codex rounds, then merge.** Comment
> `@codex review` on the draft the moment it opens; round 2 on the fix commits; fix-or-justify both.
> From round 3 on, anything not fixed-on-sight goes to `docs/OPEN-ITEMS.md` as a nice-to-do and the PR
> MERGES — W22a/#194 ran 4 rounds (4 → 5 → 1 → 2 findings, every one real but each smaller): the
> review loop converges, it never terminates on its own. The in-session adversarial pass and its HARD
> CAP are unchanged — Codex is the second reviewer, not a replacement for it.
>
> **Gate today:** 259 `verify:slice` mutants green · `pnpm check:docs` clean (96 files, 1179 qr tests + 138 ui tests) · CI green · then the two reviewers.
>
> **W22c (the gesture layer) — no migration.** The plan-of-record listed five parts; the scout found
> **three already built**, and this doc said otherwise in two places, which is why the first commit is
> mostly corrections. Swipe-to-close shipped at **R5b** (`packages/ui/src/sheet.tsx`: handle-initiated
> `useDragControls` + `dragListener={false}`, so the body keeps its native scroll) — there is **no
> `useSwipeToClose` hook in this repo**, that is the delivery repo's name for it and the old bullet
> above named a seam that never existed here. 16px input floors and back-nav consistency were done
> earlier too. What was actually missing:
>
> - **The haptic vocabulary** (`lib/haptics.ts`). The old `hapticTap(ms)` let one weight mean two
>   things and it did: **8ms was both a PICK and a COMMIT** — `ItemSheet.choose` buzzed 8 for
>   selecting a modifier while the Add pill and the grocery scan buzzed 8 for buying. `haptic()` takes
>   a MOMENT, not a duration, so a raw millisecond is now a compile error; `hapticTap` is deleted
>   rather than re-typed. **Four names, not the proposal's three**, because v7.2 designed three
>   add-weights (6 stepper · 8 quick-add · 12 sheet-add): `pick` 6 · `add` 8 · `commit` 12 ·
>   `celebrate` pattern. The one weight that CHANGES is `ItemSheet.choose` (8 → 6) — that is the
>   defect being corrected, not a side effect of the rename. Two rules travel with it: reduced motion
>   is read SYNCHRONOUSLY from `matchMedia` (never `useAnimationPreference`, which seeds
>   `shouldAnimate = true` before its effect resolves, so an RM user would be buzzed once per first
>   tap), and **a haptic may never be the only feedback for an event** — iOS Safari implements no
>   `navigator.vibrate` at all, so on this app's most common device every one of these is a silent
>   no-op.
> - **Pull-to-refresh** (`lib/pull-refresh.ts` + `components/PullToRefresh.tsx`). ⚠️ **The indicator
>   moves; the page does not.** `/menu`'s `<main>` hosts two `position: fixed` descendants —
>   `PaperAmbient` and `CartBar` — and a `transform` on an ancestor creates a containing block for
>   fixed descendants, so translating the page for the pull would drag the Add-to-cart bar off the
>   bottom of the screen. Same family as the `isolation: isolate` rule W22a·depth learned on
>   `PaperAmbient`'s host. The curve is asymptotic to 96px and arms at 48 — its own inverse at the
>   midpoint, so `pullTravel(96) === 48` exactly, computed rather than chosen.
> - **What the refresh is allowed to SAY** (`lib/catalog-freshness.ts`) — the load-bearing part.
>   `router.refresh()` returns `void` and cannot report failure, so freshness has to be PROVEN by the
>   caller (an RSC render stamp that changed), not inferred from the data. And a failed catalog read
>   produces an EMPTY snapshot: diffed naively against a full one, every dish reads as newly sold out
>   and the app announces to every diner in the room at once that the whole restaurant has run out.
>   That is the delivery repo's "a failure must never read as empty" arriving at a new boundary, and
>   it is why the outcome is a three-state union whose third state is `unverified` — **never collapse
>   it into `unchanged`**; "we couldn't check" and "nothing changed" are different sentences and only
>   one of them is true when the wifi drops. Price movement is reported as a COUNT, never a delta
>   (W17b ships a live staff price editor, so prices really do move — but the server owns the number
>   and a client-stated "+$1.00" starts an argument the client cannot win), and nothing ever "just"
>   sold out (`sold_out_at` is not in the menu page's select, so recency is not a fact this module
>   holds).
> - **Rail overscroll** — `overscroll-behavior-x: contain` on the seven horizontal scrollers, so a
>   swipe that runs off the end of a rail stops there instead of triggering the browser's back
>   gesture. `-x` only, **never the shorthand**: the shorthand would also claim the vertical axis and
>   kill the pull-to-refresh the same slice adds.
> - **`RefundActionSheet` migrated to the canonical `Sheet`** — the migration its own comment had been
>   asking for since P1-5, closing four real defects at once: `aria-modal="true"` with no focus trap
>   (the attribute PROMISES the rest of the page is inert; the deleted rationale argued the trap was
>   unnecessary while leaving the claim it existed), Esc bound via `onKeyDown` on a non-focusable
>   overlay `<div>`, `onClick` dismissal on the scrim that a text-selection DRAG out of the PIN field
>   could fire, and no `--kb-inset` on a bottom-anchored sheet whose PIN field sits directly above the
>   Refund button.
>
> **The adversarial round found the slice's own rule failing in the WIRING, twice, and both times the
> unit test was green.** Worth carrying forward as a shape, not just as two fixes:
>
> 1. **A render that landed is not a read that succeeded.** `catalogStale` reached the gesture's
>    `disabled` prop and never the freshness decision, and the stale branch stamps `Date.now()` like
>    any other render — so `advanced` certified a render where the DB was never reached. The
>    DegradedStrip and a toast reading "Menu is up to date." appeared together; and because
>    `readLastGoodCatalog` is per-INSTANCE module state bounded by traffic rather than a TTL, a
>    refresh landing on a different warm instance can serve an OLDER cache than the diner had and
>    diff it into "Mohinga is back on." about a dish still 86'd. Two claims, two flags:
>    `catalogFreshness` now takes `{ advanced, trusted }`.
> 2. **A render stamp used as proof must be captured when the work STARTS.** `advanced` compared the
>    current stamp against `baseline.stamp`, which only advances when the component announces —
>    while ANY `router.refresh()` on the route advances the props' stamp, and `AnonAuthGate` does one
>    on every cold QR scan. First-session diners' first pull therefore read `advanced` even when the
>    fetch never landed. Capture at fire time; let `baseline.rows` keep its own lifetime.
>
> Also from that round, each verified before accepting: `unverified` was still being adopted as the
> new baseline (refusing to speak from an untrusted snapshot while still remembering one); no
> axis-dominance test, so a rail flick at page top was claimed vertically and `preventDefault`
> cancelled the rail's scroll on both axes; `armedRef` survived a drag back under the deadzone, so a
> visibly-cancelled pull still fired; the gesture was the ONLY way to reach the function (WCAG 2.5.1
> — there is now a real button on the eyebrow row); the wake path SPOKE, replacing "Added Mohinga"
> with an unrequested "Menu is up to date." on every app switch; `catalogStale` suppressed the whole
> component including the wake, stranding a blipped diner with no path back; the `preventDefault`
> sat below the in-flight bail, handing Chrome-Android's document reload the second pull; `.ptr` was
> `absolute` under an unpositioned `<main>` so a wake-fired refresh painted off-screen; and
> `RefundActionSheet` had no in-flight guard, so Esc/✕/drag mid-refund dropped the server's answer
> on an unmounted tree. New rows: **M80–M82**.
>
> ⚠️ **Codex could not review #207** — "You have reached your Codex usage limits for code reviews."
> The two-round rule did not run, and the in-session pass is not an independent second reviewer.
> If credits return, `@codex review` on that PR still works retroactively.
>
> \*\*W23c (manual + partial capture for pickup — registry M69) — merged #203, migration prod-applied
>
> - probed, and shipped DARK behind `PICKUP_MANUAL_CAPTURE=1`.\*\*
>
> ⛔ **Before that flag is flipped, ALL of these — not most of them:**
>
> 1. **Confirm the LIVE Stripe endpoint is subscribed to `payment_intent.amount_capturable_updated`.**
>    That event is W23c's ONLY entry point; without it every pickup authorization sits uncaptured
>    until it expires — food made, nobody charged, no error anywhere. The docs that configure this
>    endpoint listed only two events until W23c (see the ⚠️ below), so an endpoint built from them
>    does NOT have it.
> 2. **M70 · M71 · M72 closed** (`docs/OPEN-ITEMS.md`). ⚠️ **M72 cannot be closed as written and this
>    gate needs re-deciding.** The row says closing it needs a reservation the 86 write participates
>    in — the inventory model `20260819000000` deliberately declined. M72a (migration
>    `20260830000000`) SHRINKS the widest DB-side window: the settlement now DERIVES the unsellable
>    set inside the statement that voids, instead of being handed a list the app computed a
>    round-trip earlier. ⚠️ Shrunk, not closed — under READ COMMITTED that statement reads from a
>    snapshot taken at its start, so an 86 committing mid-statement is still missed, and
>    `setItemSoldOut` takes no cart lock. Two further windows remain — `getCartTotals` never reads
>    `menu_items`, and the Stripe capture is an HTTP call no transaction can span — so an 86 landing
>    after the void still reaches a capture.
>
>    **Price the residual before deciding.** It is not "one round-trip": `apps/qr/lib/stripe.ts`
>    passes neither `timeout` nor `maxNetworkRetries`, so stripe@22.2.1 applies 80 000 ms per attempt
>    and 2 retries — up to three attempts with jittered backoff. A flapping capture holds that window
>    open for MINUTES. Capping `maxNetworkRetries` on the capture call would shrink it far more
>    cheaply than any schema change, and is filed separately because it changes retry behaviour for
>    every Stripe call in the app.
>
> 3. **A preview smoke test with a test-mode card**, covering all three outcomes: full capture, a
>    partial after an 86, and a cancel when nothing survives.
>
> Two Codex rounds on #203 plus one on #204 found SIXTEEN real defects on this path, and the suite was
> green throughout because it mocked the RPC whose contract was wrong. Treat the list above as the
> minimum, not the ceiling.
>
> The one thing not to re-derive: **nothing is fulfilled at authorization.** Capturing fires
> `payment_intent.succeeded` and the EXISTING handler creates the order, so an order is only ever
> born already captured and no surface learns a fourth status. `mms_fulfill_order` already excludes
> voided lines, so voiding at authorization makes the downstream correct for free. Order of
> operations is the money rule: void → re-derive → capture, money LAST. The succeeded reconcile
> compares `amount_received`, not `amount`.
>
> `mms_settle_precheck_and_void` is a PRECHECK as much as a void — called unconditionally, empty
> array included, because a check that only runs on the unusual path is a check the usual path does
> not have. It identifies the checkout ATTEMPT (`locked_by` + `locked_at`, the latter carried in the
> PI's metadata), because `acquireCartLock` lets the same diner reacquire: a re-checkout with a
> different tip leaves the FIRST authorization's webhook still naming a valid lock holder, and only
> the attempt stamp separates the eras. An earlier draft RECLAIMED the lock instead — do not go back
> to that: refreshing `locked_at` there stamps a superseded era as current, and a redelivery after a
> failed capture then finds its own stamp moved and cancels a good order.
>
> ⚠️ **`docs/ENV.md`'s webhook event list was wrong for the WHOLE handler until W23c** — it named two
> events; the handler acts on six. Any endpoint configured from the old docs silently breaks
> split-tender, saved cards, W23b's refund reconcile **and W23c itself**. Latent, not live for the
> first three (prod has 0 split shares, 0 refunds) — but for W23c it is a hard rollout prerequisite,
> not a latent risk, because the capture event is that feature's only entry point (item 1 above).
>
> Migration `20260819200000` **✅ prod-applied + probed** as `w23c_capture_void`, in a block that
> RAISED at the end so the whole probe rolled back and prod was left untouched (verified: 0 ledger
> rows, 0 probe rows). Results: precheck-only on an open owned cart = 0; a lock owned by someone else
> = **-2**; the real void = **2 lines** (including the COMPED one the first version silently skipped)
> with **2 ledger rows** — which is the `mms_approvals` NOT NULL bug proven dead — at 2800 for the
> paid line and **0** for the comped one; a settled cart = **-1**. RLS on with exactly one SELECT
> policy, zero grants to anon/authenticated/PUBLIC, and an `authenticated` INSERT refused.
>
> **W23d (registry M71 — tell the diner what the settlement dropped).** Migration
> `20260819300000_w23d_dropped_visibility.sql` **✅ prod-applied + probed** as `w23d_dropped_visibility`.
> Before applying, prod's live `mms_fulfill_order` was checked against the M3 baseline it is restated
> from (one overload, pre-W23d column list, M3 + K2 + W21 + promo-consume + open-guard all present) —
> the one drift CI cannot catch, because CI builds from migrations rather than from prod.
>
> The probe ran inside a block that RAISED at the end, so everything rolled back (verified after: **0**
> cancellation rows, **0** dropped rows, **0** orders with a non-empty `dropped_lines`, no probe
> fixtures, 14 orders unchanged). Results: the precheck voided **1** line and stamped it
> `pi_w23d_probe_A`, the line really went to `voided`; the snapshot for that attempt is
> `[{"qty":2,"name":"Probe Mohinga"}]` (name + qty only — no amount, no reason code) while a DIFFERENT
> attempt on the same cart answers `[]`, which is the whole per-attempt scoping rule; the verdict mark
> answered **1** then **0** on redelivery and **kept** `nothing_left` rather than taking the second
> call's `over_authorized`; a **cartless** verdict (`cart_id` null, reason `no_cart` — the webhook's
> no-cartId branch) recorded; an out-of-vocabulary reason was **refused** by the CHECK; and the diner
> read answered **1** row for the payer and **0** for a different uid. Structure: `cart_id` nullable
> with **0** foreign keys, RLS on with exactly **1** policy, all four functions SECURITY DEFINER with
> `search_path=""` and EXECUTE granted to `service_role` only, and exactly one `mms_settle_precheck_and_void`
> (the 4-arg shape is gone — no overload).
>
> Its shape, so a future session does not have to re-derive it: the PARTIAL fact rides `qr_orders.dropped_lines` (W23b's `refunded_cents` move —
> one column on a row the diner already reads, so no policy is widened and `qr_dropped_lines` KEEPS its
> manager-read policy), while the ALL-DROPPED fact cannot ride the order (there isn't one) and must not
> ride the line ledger (a cancellation with ZERO dropped lines is reachable: a promo lapses on
> `valid_until` purely on time, so `planCapture` answers `over_authorized` with nothing voided). It gets
> `qr_settlement_cancellations`, keyed on the **PaymentIntent** so each attempt keeps its own verdict,
> written **before** the Stripe cancel — a failed cancel is retryable, a lost verdict is not, because the
> hold being cancelled short-circuits every redelivery on the live-status guard. The verdict is
> **asserted, never inferred**: between `capture` and `mms_fulfill_order`, "no order and no verdict" is
> exactly what a healthy capture looks like, so `undecided` and `error` both fall through to today's copy.
>
> **W23b (the partial-refund diner surface — registry M2) — see the PR/CHANGELOG for the full
> account.** The short version a future session needs: a partial refund leaves `qr_orders.status` at
> `'paid'`, so `refunded_cents` on the ORDER (Stripe-authoritative, `greatest()`-guarded, and the only
> thing that catches a **dashboard** refund — those write no ledger row) and on the **ITEM** (the line
> attribution only `mms_record_refund` can know) are the entire diner-readable signal. `mms_refunds`
> stays manager-only on purpose: it carries reason codes and staff ids, and widening its RLS to
> surface two numbers would expose the whole audit trail. `lib/refund-view.ts` is the ONE derivation —
> the original bug was a **type**, not arithmetic: `receiptStatusLabel` took a boolean and a partial
> refund is a third state. The Total row still prints the fulfillment-time snapshot verbatim;
> "Refunded" and "You paid" follow it. Codex round 2 caught the one corner the design created:
> `summarizeRefund` answers `full` on `refunded_cents >= total` (before the webhook flips the
> status) and /account's read filters `status='paid'`, so a wholly-returned order reaches that list
> in the `full` state — the chip and its spoken clause now DERIVE from the state instead of testing
> one at the call site.
> Migration `20260819100000` **✅ prod-applied + probed** as `w23b_refund_visibility`: both columns
> are `integer` defaulting to 0, both `>= 0` CHECKs exist, and the ledger back-fill moved nothing
> (0 rows nonzero of 14 orders — there are no refunds in production). Five probes run against prod
> and rolled back by hand: a negative was refused on BOTH tables; a legitimate 1400 still landed
> (an over-tight bound blocks real service and no refusal-only probe would notice); a `greatest()`
> redelivery of 900 did NOT rewind the total; and 1900 did advance it. Prod left at 0 nonzero.
>
> **W23a (the 86 button + the availability gate) — merged #199, migration prod-applied + probed.**
> The owner asked whether checkout should wait on kitchen acceptance. The audit found a different
> problem: `menu_items.is_sold_out` has existed since platform-init, ~15 surfaces READ it, and
> **nothing had ever written it** (`menu_items` is public-read with no write policy). `setItemSoldOut`
> is the writer, on the `setMenuPrice` pattern; `/staff/menu` gates PER CONTROL (server → 86 only,
> manager → prices too) and the KDS carries the same flip on the ticket that revealed the empty pan.
> The gate reads ONE predicate (`itemSellable`) at BOTH boundaries — `priceItem` at add time,
> `create-intent` before the mint — and blocks **draft lines only**: a fired line is already made, and
> a diner cannot remove one, so widening past draft would strand a table that ate the last portion.
> **Residual (OPEN-ITEMS M69):** an 86 landing between the mint and the webhook confirm still produces
> a refundable order; that needs manual capture, which is **W23c**.
> Migration `20260819000000` **✅ prod-applied + probed** as `w23a_sold_out`: `sold_out_at` is
> timestamptz with 0 rows stamped (no fabricated back-fill), `menu_availability_audit` has RLS on with
> exactly ONE policy and it is SELECT-only — an `authenticated` INSERT into the ledger and an
> `authenticated` UPDATE of `menu_items` were both run against prod and both refused, 0 rows written.
>
> **W22b (installed-native — the live order chip + the PWA install):** the header order pill is now a
> DISCLOSURE that expands in place. It lives INSIDE `.app-header` on purpose — sticky with no
> `overflow`, so an absolute sibling is contained but unclipped and inherits the header's stacking
> context: no new z token, no `--chrome-top` offset, no page-padding change, no PaperAmbient
> isolation exposure. Panel content derives in `lib/live-order-panel.ts` (stored values only; "In the
> kitchen" gets NO clock — `togo_status='preparing'` is a webhook stamp at payment, not a cook-start).
> **The proposal was wrong twice and the doc says so now:** there is no "fired → cooking → ready"
> (M64 files what a real stage would take), and the chip cannot literally follow the diner onto
> /track (a duplicated `view-transition-name` kills the J1 morph app-wide). Two live falsehoods died
> first: the pill said "Preparing" over a grocery basket the shopper was already holding, and "Ready"
> off an exit-pass check — both now read the one `liveOrderStatusWord`, as does /track's chip.
> `useOrderStatus` resets on a key change (a second order used to render the first order's word).
> Install: `id` pinned, `scope`/`lang`/`dir`/`categories`, `launch_handler: navigate-existing`, the
> whole-origin `orientation` lock removed, real rasters from `scripts/gen-pwa-icons.mjs`, three-door
> shortcuts, precache 261.0KB → 93.1KB. **iOS splash/status bar deliberately NOT shipped** — inert in
> Next 16.2.9 and not theme-safe without a real device (M62). New rows: M62–M67.
>
> **W22r (receipts · the receipt email · live tracking — merged #196):** the restaurant's identity is
> named ONCE in `apps/qr/lib/brand.ts`, every string verbatim from the delivery repo's production
> constants — name, 750 Terrado Plaza Suite 33 Covina CA 91723, (626) 665-5317,
> admin@mandalaymorningstar.com, the two socials. **No hours**: neither repo has any, and inventing
> them is exactly the honesty violation the design language forbids. Surfaces adopt the constants as
> they are touched (deliberately no big-bang sweep). The durable `?r=` receipt is a real business
> document — badge lockup, identity foot (address · tel · mailto, 44px padded), destination group
> headings in the Bill's own vocabulary ("At your table / To-go / Grocery", only when the basket spans
> 2+), per-line kitchen notes, the pickup contact name; the rules are pure and tested in
> `lib/receipt-view.ts` (`fulfillmentLabel` + `groupReceiptLines`). The EMAIL matches the delivery
> shell (`emails/MmsEmailLayout.tsx`): a hosted **true-PNG** badge (`public/email-logo.png` — the
> app's own `logo.png` is WebP bytes behind a `.png` name that email clients cannot decode), the
> Mingalabar + Burmese kicker, a 3-cell **solid** triad bar (clients drop gradients), a full identity
> footer, and a per-template `reason` line so no template inherits another's claim; the send gained a
> plain-text part rendered from the SAME element and a `replyTo` into the owner's inbox. `/track`
> itemizes: ONE `TRACK_ORDER_SELECT` + `shapeTrackedOrder` (`lib/track-order.ts`) replaced THREE
> hand-copied shapes, so the tracker and the durable receipt list the same lines in the same order;
> `receiptStatusLabel` means a refunded order never reads "Paid in full"; the step rail shows REAL
> times (`created_at` / `togo_ready_at` / `togo_picked_up_at` — "In the kitchen" stays bare because no
> honest clock exists). Authorization unchanged (RLS read, uid-scoped fallback, same field set both
> paths). **No migration — every column already existed.** New mutant
> `track/breakdown-drops-the-tip`; `useOrderStatus.ts` carries an in-file `verify:slice-exempt`
> (thin subscription wiring — the money mapping it carries is guarded in `track-order.ts`).
>
> **W22a·depth (the warm-paper pass — merged #195; this IS the proposal's W22a slice):** new
> `--sh-paper` / `--sh-paper-hover` in `packages/ui/src/tokens.css` (two-tier — a tight ambient
> contact shadow + a NEGATIVE-spread wide diffuse; the flat `--sh` read as a hard square frame over
> busy backdrops), adopted by `.card` and `.surface-paper` under the inset `--sheen` lip, with
> `.card-interactive:hover` deepening through the hover token. The R1 texture kit is finally
> CONSUMED: `.surface-vellum` on the ConfirmSwap decision card (a warmer surface for a moment of
> consideration), md:+ frost on `.app-header` / `.menu-toolbar` — mobile keeps today's exact opaque
> paint, because the GPU budget forbids blur below `md`. New `components/PaperAmbient.tsx`: a fixed
> `z:-1` gradient-masked hairline LINE grid + gold bloom + grain behind every diner main (menu ·
> checkout/bill · account · /track incl. every notice branch and `loading.tsx` · the durable receipt ·
> grocery). **Pages carry LINES, cards keep DOTS** (`.card-textured`) so the two textures never read
> identical. **The host must NOT isolate** — the page ground moved to `html` ONLY, because an isolating
> host trapped fixed overlays (tier-up scrim, grocery toast, confetti) under the app header (the #195
> review lesson). Print-hidden. Ceremony 1: the /track paid summary is a thermal SLIP (`receipt-slip` >
> `receipt-slip-clip` > card body + `receipt-tear`) that PRINTS ON when `justPaid`
> (`mmsPrintReveal`/`mmsPrintHead`, 1.05s; the print-head is a SIBLING of the clipped element or it
> gets clipped) — presentation only, every figure stays the server-rendered value, and reduced motion
> renders the finished slip at rest. Ceremony 2: the send-to-kitchen paper beat (`.mms-send-beat` glyph
>
> - `.mms-settle` on the undo control), keyed per send, `display:none` under RM. **Digits deliberately
>   untouched** — `@number-flow/react` owns its own baseline; the delivery repo's baseline-anchor lesson
>   applies to hand-rolled reels only.
>
> **W22a (the drifting start + one taste-buds bar — merged #194):** "Start here" is TWO independently
> drifting rows of 10 (`components/menu/MarqueeRail.tsx` + `lib/menu/startHereRows.ts`) — row A is the
> honest paid-order ranking with tie-aware seals (or the hand-set `popular` fallback, seal-less), row B
> is **"a little of everything"**, a category round-robin: a curation RULE, not a ranking, so it never
> wears a seal or borrows row A's "what tables love" framing. They drift in opposite directions at
> different speeds. The drift rides the NATIVE scroller (swipe · chevrons · keyboard ·
> scroll-into-view all survive) and is a guest in the diner's scroll: it pauses on
> touch/hover/focus/offscreen/hidden-tab and for 2.2s after any scroll it didn't write itself, with the
> rAF loop STOPPED while blocked (a forever-ticking no-op loop is a battery tax); a visible pause/play
> coin satisfies WCAG 2.2.2; `prefers-reduced-motion` gets the exact pre-W22 static rail — no drift, no
> duplicate DOM. Loop-duplicate cards are `aria-hidden` + `tabIndex={-1}` but **still CLICKABLE**
> (`inert` made visibly-on-screen dupes tap-dead) and route focus to their real twin first, so an
> aria-hidden node is never a sheet's focus-restore target. The taste section is **"Explore your
> Burmese taste buds"**: craving pills plus the DIETARY pills moved in from the toolbar
> (`components/menu/DietPills.tsx`, shared) — the sticky toolbar mirrors the same rail whenever a diet
> is active OR a search hides the band (`q.trim() !== "" || diets.length > 0`) and owns the SINGLE
> free-from disclaimer. Recommendations and Surprise-me respect active diets. `DIETS`
> (`lib/menu/dietary.ts`) gained MY accents — K15 ledger.
>
> **W21d (the Codex backlog sweep — merged #193):** Codex had reviewed every PR since #178 and nobody
> read them — 31 findings, all landed post-merge. Triaged here: 18 fixed, 5 closed by a decisive prod
> measurement, 4 already fixed by later work, 4 justified into OPEN-ITEMS (M54/M55). The ones that
> mattered: two allergen P1s (Sanwin Makin → **dairy**, Crispy Shrimp in Fish Sauce → **fish**;
> migration `20260816080000` + catalog snapshot + seed), a locale decimal COMMA turning a typed "5,00"
> cash tip into **$500**, a kiosk tip intent silently dropped when it arrived after the counter screen
> mounted, the price editor now verifying the price the manager's SCREEN showed (`expectedPriceCents` —
> the old CAS guarded only the server's own read-to-write window), SharePay finally reading
> `TIP_LADDER` like every other surface, and the 🌱 taste chip excluding `vegan-optional` (the dietary
> predicate's own fail-safe rule). Fresh-DB parity: migrations run before seed, so their guarded
> UPDATEs no-op on a fresh database — a seed appendix re-applies them post-insert. **This sweep is why
> the 2-round Codex rule exists.**
>
> **W21 (clarity & personalization):** the bill groups by destination on the Bill moment AND the
> pay step (shared `BillLines`/`BILL_GROUPS`); "Sales tax (10.5%)" un-fused (flex dt drops
> whitespace — margin, the `<My/>` trap); kitchen = မီးဖိုချောင် everywhere (owner's correction, 12
> strings); the slot sheet moves real FOCUS to the diner's chip once per open; **pickup requires
> name + phone** (`pickupContactMissing` at create-intent + client, `qr_carts.customer_phone`
> migration `20260816070000` — **✅ prod-applied + probed** as `w21_pickup_contact`; phone is cart-only PII, order
> snapshot deferred until a staff surface reads it); Start-here = uniform two-row grid; the **Find
> your dish** taste picker (honest category/tag matching + Surprise-me, per-device picks); the
> dine-in exit lines merged into one two-door sentence.
>
> **W20 (alive & instant — the owner's optimistic-UX batch):** the pickup pills + slot sheet + item-
> sheet Add are OPTIMISTIC (instant flip/close, background write, write-token-serialized revert +
> one-live-region explain on refusal — amounts stay server-authoritative); "not on selected slot"
> was slot IDENTITY (`sameSlot` compares by instant — the RPC and table serializations of one
> timestamptz differ as strings); the tip ask reacts per rung (`tipReaction`, bilingual — new MY
> joins K15); the Bill names the tax rate from `taxRate()`; the reward FOLLOWS its owner
> (`mms_apply_reward` v3, migration `20260816060000` + red-first SQL test in CI's required list —
> **✅ prod-applied + probed** as `w20_reward_follows_owner`); every mode has a named leave (dine-in's is device-level
> `forgetDineinOnThisDevice` — never a server mutation); Start here = 10 items + data-backed rank
> seals + RM-gated hover life.
>
> **W19 (production readiness — nine owner complaints, nine fixes):** press-states on every checkout
> control (tap parity with the hover-only delight), the tip ladder warms with % and the custom tip
> is uncapped to the $1,000 cash bound (`TIP_AMOUNT_MAX_CENTS` — enforced in create-intent on the
> DERIVED cents; CLAUDE.md's "Two caps" rule updated), forgot-to-send→pay is informed (never
> blocked — `unsentFoodQty` + Bill notice + confirm line), "Put a card on file" + "Send to kitchen
> now" renames, the dine-in exit is named on the arrival beat, the pickup picker's two stacked bugs
> are fixed (`currentSlot` prop + slot state lifted to Checkout via `normalizePickupSlot`), and 37
> menu descriptions got the house voice (migration `20260816050000` — **✅ prod-applied + probed** as
> `w19_menu_voice`). All new MY still pending K15 — see the blocked-decisions list below.
>
> **W18 (after this block was first written):** the owner's warm pass landed — tip ask encourages
> (round-up + cap lecture retired, 122 → 119 mutants; "None" last and quiet on checkout AND kiosk),
> "Use a reward" bilingual + leading with the good news, the kitchen strip opens into a dish-by-dish
> kitchen-tap view, the order view gained the mode-true menu nav, and guest-facing Burmese moved to
> the friendly spoken register (တယ်/မယ်/နော်) — ALL Claude-authored MY still pending K15, now
> including the re-registered kiosk dict. The 31 W17d-2 `description_my` in prod still carry the old
> formal register; rewriting them waits for the K15 check (one migration, guarded per row).
>
> **Read this block, then `docs/W22_DESIGN_PROPOSAL.md` (the live slate) — `docs/W17_PLAN.md` only for
> the owner-blocked POS/pricing residuals. Everything below is merged AND prod-applied.** Prod is
> `fasnpdhtvqtzjlvruqcu`; its migration history ends at `w23d_dropped_visibility` (prod stamps its own
> apply-time versions — match history by NAME, not timestamp), and **W22a / W22a·depth / W22r / W22b
> needed no migration at all** — every column the itemized tracker and the live order chip read
> already existed. **This line is the ONE statement of prod's migration head** — the W23a block above
> says what each W23 migration did and what its probes returned, and the "Prod state you can rely on"
> bullet points here rather than restating. Keep it that way: two copies of a migration head is how a
> future session gets told a live slice is unapplied, which is precisely what Codex found on #200 —
> twice, the second time in the fix for the first.
>
> ### What the owner asked for, and where it landed
>
> | Directive (verbatim)                                                            | Slice     | State                                                                 |
> | ------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
> | "revert to real POS pricing for both dine-in and take-out"                      | W17a      | ✅ merged #178                                                        |
> | "staff portal should be able to update prices?"                                 | W17b      | ✅ merged #180, prod-applied                                          |
> | "maybe enhance the tipping features" (all four selected)                        | W17c-1..4 | ✅ #182 #183 #184 + this slice                                        |
> | "tip should be 15%, 20%, 30% options"                                           | W17c-3    | ✅ merged #184, prod-applied                                          |
> | "prices should be most recent POS 2026 reference"                               | W17d-1    | ✅ merged #185, prod-applied                                          |
> | "new menu items from POS ... not duplicated" + "verify each item before adding" | W17d-2    | ✅ this slice — 31 adds, classification in `docs/W17_PLAN.md` §W17d-2 |
>
> ### The three rules this arc kept re-learning (read before touching money)
>
> 1. **A value computed in one place and quoted in another WILL drift.** Three of the four review
>    HIGHs were this exact shape: the round-up froze a basket-dependent rate in state; the cash
>    settle passed a tip-FREE total to the tab-close audit row; the register computed tip chips off
>    the tax-INCLUSIVE total while every other surface used the pre-tax base. The fix each time was
>    to name the value **once** and derive from it — `effectiveTipRate`, `collectedCents`,
>    `settleTipBaseCents`. Look for a second copy before adding one.
> 2. **`.update()` returns no row count.** A status-guarded write can correctly BLOCK and still
>    report success. Chain `.select("id")` and check the rows — `applyPromo`, `setMenuPrice` and
>    `setKioskTip` all do; two of them only after a review caught it.
> 3. **An unreachable guard is decorative.** `verify:slice` caught the tip cap-filter mutant
>    SURVIVING because a fixed ladder never breaches the cap. `tipPresets` now takes the ladder as a
>    defaulted parameter so a test can reach the rule. If a mutant survives, the fixture (or the
>    code) cannot express the failure — fix that, don't delete the mutant.
>
> ### Prod state you can rely on (measured, not assumed)
>
> - **97 menu items** (66 + W17d-2's 31 adds), none out of `menu_items_base_price_cents_bounds`
>   (25..500000). A **Desserts** category exists (sort 75). The 31 new items have **no photo** (the
>   designed `PhotoPlaceholder` renders) and Burmese descriptions **awaiting the K15 native check**.
> - **Catalog == register**: `docs/data/MENU_REFERENCE.md` reports **no price deltas**.
> - **Constraints live**: `qr_orders_tip_cents_nonneg`, `qr_carts_intended_tip_cents_bounds`,
>   `menu_items_base_price_cents_bounds`. Each probed: refuses the bad value, accepts the good one.
> - **`menu_price_audit`** exists, RLS on, manager+ SELECT, **no insert policy** (service-role only).
> - **0 rows** in `menu_price_audit` and **0 carts** with `intended_tip_cents` — nothing has exercised
>   these paths in prod yet. **Smoke-test them before trusting them in service.**
> - **34 items carry no photo** — the 3 genuinely-NULL dishes (C5's photography afternoon) plus
>   W17d-2's 31 adds. Don't read 34 as a regression: since W16d `safeImageUrl` (containment) is the
>   only rule and no display filter hides a real photo.
> - **Migration head: see the "Everything below is merged AND prod-applied" paragraph above — it is
>   the ONE place this file states where prod's history stops.** This bullet used to restate it and
>   drifted the moment W23a landed; Codex caught it twice on #200, the second time inside a fix whose
>   own commit message claimed the head was already stated once. That is the lesson worth keeping: a
>   fact repeated in a third place drifts exactly like a value computed in two places, and the repo
>   has now paid for it in prose as well as in code. The repo's newest migration FILE is
>   `20260819300000_w23d_dropped_visibility.sql`, and it IS applied — prod's history now ends at
>   `w23d_dropped_visibility`.
>
> ### ⚠️ Open decisions that BLOCK work — ask the owner, don't guess
>
> 1. **The four per-mode prices.** Pork Offal 15/14, Salted Fish Pounded 19/17, Beef Pounded 19/17,
>    Salted Fish Eggplant 14/12. Real two-price policy, or register habit? `togo_price_cents` is
>    **deliberately deferred** because it re-opens the dine-in↔to-go re-price ladder W17a removed —
>    do not build it on a guess. Shape to build once confirmed: `docs/W17_PLAN.md` §W17b.
> 2. **The $1,000 cash-tip cap and the tip ladder** are judgment calls, not owner-set beyond the
>    15/20/30 rates.
> 3. **W17d-2's residuals are ALL owner questions now** (full record: `docs/W17_PLAN.md` §W17d-2):
>    **alcohol** (~49 units — licensing before it can appear in the app); `Egg Add-on` **$3 vs our
>    $1.50/$2.00** modifier prices; hilsa **fried vs steamed** naming (261 units — no prep modifier
>    exists, verified against prod); duck curry + ginger salad (1 ring each — real dishes?);
>    `Fishcake Fried` ambiguity; nangyi **thoke vs mont-ti** labeling. Never guess — ask.
> 4. **K15 — the Burmese native check** (OPEN-ITEMS K15). Every Claude-authored MY string from W5c
>    through W22a waits on Min's read: the 60 W5c `description_my` + the modifier/option names, the 31
>    W17d-2 descriptions (**still in the old formal register in prod** — the rewrite is one
>    guarded-per-row migration, deliberately held), W18's spoken-register kiosk + cart dictionaries,
>    W20's `tipReaction`, W21's မီးဖိုချောင် (12 strings), and W22a's five `DIETS` accents. Nothing new
>    ships MY without joining the queue.
> 5. **The remaining POS residuals live in OPEN-ITEMS C14, not here** — the 14 unapplied fuzzy grocery
>    price matches (Brooms $10 vs $2.99, balms $3 vs $41.86: POS-side errors or size variants?) and the
>    POS-verbatim `Red Bull - SHARK 8.4 oz` name that conflates two brands. Same rule: ask.
>
> ### W17d-2 — the missing POS menu items (this slice)
>
> All 98 unmatched POS rows classified BEFORE anything was created; **31 genuine adds** (1,450 units
> of 2026 volume) + a Desserts category, each machine-verified (no slug/EN/exact-MY collision,
> loose-MY overlaps printed + adjudicated; price read from the named POS row, never transcribed). 4 catalog Burmese typos fixed —
> they were hiding real matches. Two generator bugs fixed **red-first**: the Burmese join compared
> non-NFC strings (Myanmar asat/dot-below byte order differs while rendering identically — hid a
> 126-unit match), and exact-match ranking by volume put a $100 catering tray's price beside the $10
> dish sharing its name (exacts now prefer the price-agreeing row; a delta is flagged only when NO
> exact ring agrees). Backlog 98 → 60, all residuals classified (duplicates the Burmese-only join
> can't see, alcohol, modifiers, trays, noise, owner questions). Full record:
> `docs/W17_PLAN.md` §W17d-2. Migration `20260816040000`.
>
> ### W17c-4 — tip transparency (merged #186)
>
> ⚠️ **The bug worth remembering here**: the first version scoped the QUERY for a server
> (`.eq("settled_by", me)`). That hides colleagues — and also makes a null `settled_by` structurally
> impossible, so every server saw "guests tipped $0.00 on their phones" **as fact**, under a promise
> that nothing on the screen is an estimate. A privacy filter had become a lie about money. Narrow
> **in-process** (`scopeToSelf`, pure and mutant-pinned), never by a predicate that also removes the
> rows a different number depends on.
>
> `/staff/tips`, linked from the floor for every staff member. The honest constraint shapes it:
> `qr_orders.settled_by` is stamped when a STAFF member took the money and is **null** when the guest
> paid on their own phone. So there are two buckets and they are **never blended** — "handed to a
> person" (per-staff) and "paid on a phone" (shared, belongs to nobody in particular). No averages,
> no projections, no per-head split: how the shared pool divides is the owner's decision, and a
> number computed here would look exactly like a policy they had agreed to. A server sees only their
> own line (the scope is a **predicate**, so a colleague's row never enters the process); managers
> see everyone. A failed read renders the outage shell, never "you were tipped nothing".
>
> ### Where things live now
>
> - `apps/qr/lib/tip.ts` — the house 15/20/30 ladder + `effectiveTipRate` + `tipReaction` + the
>   $1,000 `TIP_AMOUNT_MAX_CENTS` bound (pure, mutant-pinned; the round-up branch was RETIRED with its
>   feature in W18 — the derive-don't-store lesson lives on in CLAUDE.md).
> - `apps/qr/lib/tip-report.ts` — the two-bucket summary (pure).
> - `apps/qr/lib/menu-price.ts` — the ONE place a money amount crosses from a human into the system.
> - `apps/qr/lib/brand.ts` — the restaurant's identity (name · address · tel · email · socials), read
>   by the durable receipt, the receipt email and the /track foot. Verbatim from the delivery repo's
>   production constants; no hours exist, so none are offered. W22r.
> - `apps/qr/lib/track-order.ts` — `TRACK_ORDER_SELECT` + `shapeTrackedOrder`: the ONE tracked-order
>   shape (live subscription + both fallback reads), lines sorted by id so the tracker and the receipt
>   agree. W22r.
> - `apps/qr/lib/receipt-view.ts` — receipt rows, `fulfillmentLabel`, `groupReceiptLines`,
>   `receiptStatusLabel`, `tenderLabel`, the SB-1524 disclosure string (pure, tested).
> - `apps/qr/lib/menu/` — `startHereRows.ts` (the twin-row curation) · `taste.ts` (the craving rules) ·
>   `dietary.ts` (`DIETS` + the fail-safe free-from predicate). All pure, all tested.
> - `apps/qr/components/menu/MarqueeRail.tsx` (the drift, native-scroller-based) ·
>   `menu/DietPills.tsx` (the shared pill rail + the single free-from disclaimer) ·
>   `components/PaperAmbient.tsx` (the page ground — lines on pages, dots on cards).
> - `docs/data/` — `menu_catalog.json` + `pos_2026_prices.json` → generated `MENU_REFERENCE.md`.
>   Regenerate with `node scripts/gen-menu-reference.mjs`; `pnpm check:docs` fails on drift.
>
> ## (2026-08-16 — W17a reverted the mode markup)
>
> **W17a shipped (2026-08-16)** — real POS pricing, both modes. The owner: _"let's just revert to
> real POS pricing for both dine-in and take-out for now (staff portal should be able to update
> prices?) and maybe enhance the tipping features."_ Locked via AskUserQuestion: **bare POS price,
> no markup.**
>
> **Why W16a's markup was wrong — from the owner's own exports.** Zettle/PayPal stores ONE menu
> price per dish. What separated a dine-in ring from a to-go ring at the register was the TAX
> COLUMN, not the price: dine-in rows carry 25.5% (10.5% sales tax + a 15% dine-in SERVICE CHARGE),
> to-go rows carry 10.5%. The qty=1 rows are the Rosetta stone — "Duck To-Go 1 $2.00 $21.00" →
> net $19.00 × 0.105, and "Salted Fish Dine-In 1 $4.85 $23.85" → the same net $19.00 × 0.255.
> Across the 365 rows of the 2025 report whose rate is derivable: 209 at ~10.5%, 155 at ~25.5%, one
> outlier. And of the 72 dishes sold BOTH ways in Jan–Jul 2026, **66 price identically**. So W16a re-created, as a price increase, the very
> service charge the owner had just retired.
>
> `lib/mode-price.ts` is DELETED (with `mode-price.test.ts` + `reorder-mode.test.ts`). The charged
> unit is `base_price_cents` + modifier deltas at the one `priceItem` seam; every display reverts
> with it. The for-here↔to-go toggle is **tax-only** again — it omits `p_unit_price_cents`, which is
> the SQL fn's documented "leave the price alone" path (`coalesce(null, stored)`), so **no migration
> is needed and no signature changes**. Tax stays 10.5% and the service charge stays retired
> (`serviceChargeCents` a constant 0; `receipt-view.ts` keeps its `> 0`-gated historical row).
> verify:slice: the 5 markup mutants retired, 2 added (`order-lines/pos-price-marked-up`,
> `cart/toggle-re-prices-the-line`); the staff mode-fork mutant survives guarding the routing + TAX
> fork, which is what it really was.
>
> **✅ Prod swept (2026-08-16) — zero affected lines.** `menu_items.base_price_cents` was never
> touched by W16a (the markup lived in TS), so the deploy alone restores POS pricing. The open
> question was lines ADDED during the W16a window. Measured: of 126 open food lines across 31 open
> carts, 5 were created on/after 2026-08-15 and every one is at the bare POS price (the one that
> looks high, Kyay-O at 2200, is 2000 + a real 200¢ Brains add-on — the markup would have been
> 2300). Nothing was ever ordered through the markup; **no data fix needed.** Do NOT re-check with a
> bare `unit_price_cents <> base_price_cents` predicate — `unit_price_cents` includes modifier
> deltas and older lines carry pre-W15 prices, so it returns ~30 false positives. The correct
> window-scoped query is in `docs/W17_PLAN.md`.
>
> **Next: W17b/c/d** — see [`docs/W17_PLAN.md`](W17_PLAN.md). W17b per-mode `togo_price_cents` for
> the ~4 genuinely-different items + a manager-gated staff price editor; W17c tipping (all four
> options the owner selected); W17d the ~25–30 missing POS menu items, deduped on the BURMESE name
> (English names differ between POS and our catalog).
>
> ## (2026-08-15 — the owner's W16 reset COMPLETE)
>
> **W16d+e shipped (2026-08-15)** — the last two slices of the owner's reset.
>
> **W16d (photos).** The owner asked why dishes like Kyay-O had lost their photos. W13's filename
> filter assumed those rows shared a generic stock image; a probe of the live bucket disproved it
> (each is a DISTINCT real dish photo — different sizes/etags per id; the sibling filename some rows
> were assumed to have 404s). **Measured against prod: 66 active menu items — 34 were being hidden
> by the filter, 29 carry another filename, 3 are genuinely NULL.** So it was hiding 34 real photos
> across the menu grid, item sheet, Start-here, favorites, cart/bill thumbs and history, while the
> kiosk (which never imported the filter) showed them all along. `displayImageUrl` is DELETED;
> `safeImageUrl` is the single rule, now pinned to the TWO allowlisted project hosts (it used to
> accept any Supabase tenant, which would pass containment and then throw inside `next/image`). The
> kiosk and staff-add pages gained the containment they never had. **The guard that actually holds
> this** is `scripts/check-photo-filter.mjs` (in `verify:slice`): a unit test on `safeImageUrl` is
> blind to the filter being re-added at a CALL SITE — proven by doing exactly that and watching the
> suite stay green while the grep went red. **The owner-facing photography task is 3 NULL dishes**,
> not 31 (OPEN-ITEMS C5 + PRODUCTION_PLAN §1/§5/§W2a corrected).
>
> **W16e (spacing).** `[lang="my"]` finally carries `line-height: var(--lh-my)` — the token has
> existed since W5 but only the retired `body.my` mode ever applied it, so no Burmese accent had
> ever had its own leading (this is what makes W16b's stacked bilingual safe by construction);
> `body` gets `--lh-normal`. Burmese lifted off the sub-13px floor everywhere it was under it —
> including the owner's OWN named buttons (the confirm CTAs were still 11px) and the /grocery
> classes, which had been overriding the new leading with their own. The photo slot stops collapsing
> on null; `.item-hero` becomes an aspect-ratio; `.checkout-cta` AND `.checkout-viewbill` both carry
> the min-height + padding (one button swaps between them, so a box on only one made it twitch);
> `--w-content`/`--s*` token hygiene.
>
> **W16c shipped (2026-08-15)** — the important buttons ask first (owner: "Important buttons like
> Send to kitchen … or finalize pay bill should ask to confirm decision"). ONE shared
> `components/ConfirmSwap.tsx` (the repo's inline two-step idiom — trigger replaced by a
> `role="group"` card; NOT a modal, since nothing else is inerted) now gates three money CTAs:
> **Send to kitchen** (names the count; the 10s server-clocked undo STAYS — mis-tap vs changed
> mind are different failure modes), the **finalize CHARGE** in `PaymentSection` (the real
> `stripe.confirmPayment`; the review step's "Pay · $X" only mints the intent and is reversible via
> "Edit order"), and **SharePay's Authorize $X** (a real hold — same policy, not an exemption).
> The **wallet path is deliberately exempt** (OS payment sheet = the native confirm; stalling
> `ExpressCheckoutElement.onConfirm` can expire the wallet session). Copy is pure + bilingual
> (`lib/i18n/confirm.ts` + `lib/confirm-copy.ts`); the owner's Burmese rides the send
> proceed-button VERBATIM, pinned by test + mutant. K15: the Claude-authored MY question forms
> await Min's native check.
>
> **W16b shipped (2026-08-15)** — always bilingual (owner: "Ditch the language toggle and have
> bilingual only"): LocaleToggle + LocaleProvider deleted; `<html lang="en">` fixed (per-span
> `lang="my"` accents carry WCAG 3.1.2); the proxy Accept-Language cookie seed, `setLocalePref`
> (+ its `lang_change` PostHog event), the /account Language row, `body.my` reading mode, and the
> `mms.qr.locale` handover exemption are all retired. The `lib/i18n` dictionaries STAY — every
> W5-L2 money moment now renders STACKED EN+MY (headings, receipt rows via the bilingual `Row`,
> EmptyState, tip heading, grand total, Send-to-kitchen / View-bill / Pay CTAs — MY line under the
> EN+amount line, Latin digits only). Deliberate exception: tip chips stay EN-only (320px row; the
> bilingual group heading carries MY). `mms_profiles.locale` returns to dead-column status (no
> writer; column + CHECK left in place). W5-L3/L4/L5 continue as the STACKED-bilingual rollout to
> /track·receipt·menu·grocery·account.
>
> **W16a shipped (2026-08-15)** — ⚠️ **the mode-price half was REVERTED by W17a (2026-08-16)**; the
> service-charge retirement and the 10.5% tax rate stand. The owner's money reset
> (`docs/W16_PLAN.md`; closes C12+C13):
> the 5% SB-1524 service charge is RETIRED; prices are MODE-DERIVED (dine-in = base ×1.15,
> to-go = base ×1.05, rounded to the nearest $0.25 — `lib/mode-price.ts`, applied to the
> base+modifier-delta sum at the ONE `priceItem` seam; grocery exempt); tax 0.0975 → 0.105
> (owner-confirmed L.A rate), TS + SQL in one deploy. `serviceChargeCents` stays a constant 0 in
> the totals shape (split/webhook/QBO/receipt contracts unbroken); `lib/receipt-view.ts` keeps
> the `> 0`-gated historical service row + disclosure. The for-here↔to-go toggle re-prices in TS
> and hands `p_unit_price_cents` to the re-signed `mms_set_line_fulfillment` (SQL never
> re-rounds). **✅ prod-applied + probe-verified (2026-08-15)**: mms_tax_rate()=0.105 · tie
> 100→11 · IEEE 900→95 · 1M→105,000 exact · exactly ONE (3-arg) mms_set_line_fulfillment.
> Remaining W16 slices: **W16c** confirm steps · **W16d** photos (drop the fallback.jpg filter
> in `lib/media-url.ts`) · **W16e** spacing polish — maps in the session scratchpad
> (`w16_maps.json`).
>
> **M3 shipped (2026-08-15)** — faithful reorder: `modifier_option_ids` beside the labels on
> cart+order lines (`20260815100000_m3_modifier_option_ids.sql` — insert RPC re-signed, 3
> fulfill RPCs restated from their newest baselines), priceItem returns `optionIds`, all three
> add paths thread them, reorder re-prices by stored id with vanished-option disclosure
> (`lib/reorder-options.ts`, pure + mutant-pinned ×4). **⚠️ post-merge: apply the migration to
> prod `fasnpdhtvqtzjlvruqcu` via `mcp__Supabase__apply_migration` + probes** (columns exist, 4
> fn signatures resolve). No backfill by design.
>
> **W15 shipped (2026-08-15)** — POS truth (`docs/W15_PLAN.md`): the owner's real Zettle
> exports reconciled into the catalog (menu prices ×10, data-grounded `popular` tags ×9, 6
> missing dishes, 60 grocery shelf prices + 9 house SKUs). **✅ prod-applied + probe-verified (2026-08-15):** kyay-o 2000 · tea salad 1400 ·
> popular=10 · 6 new dishes (fritters hot_prepared / ngapi cold_food / sodas retail_nonfood) ·
> grocery 404 rows incl 9 HM15xx · 0 compare_at violations. Owner decisions surfaced: C12 (POS 15% dine-in service vs disclosed 5%),
> C13 (POS 10.5% L.A tax vs 9.75% Covina RATE), C14 (fuzzy-match review + gap backlog).
>
> **W5-L1+L2 shipped (2026-08-15)** — one tongue (`docs/W5_PLAN.md`; S2 high, first two slices):
> typed `lib/i18n` dictionaries (`common` + `cart`, ~50 money-moment keys, 6 red-first guards),
> `mms_locale` cookie → server-stamped `<html lang>`/`body.my` (no flash), AppHeader chip +
> /account Language row (kiosk a11y rule: the visible target-language name IS the accessible
> name), `setLocalePref` profile sync (+`lang_change` PostHog), Padauk reading-mode reset, the
> Checkout/SendToKitchen money moments translated at render sites with the locale-swapped
> bilingual headings, SB-1524 MY line ACCOMPANIES the EN disclosure. `mms.qr.locale` is exempt
> from the device-handover clear. **(W16b superseded the toggle: always-bilingual now — the
> dictionaries + render-site pattern survive; the locale plumbing is gone.)**
> **Remaining: W5-L3** (/track + receipt) · **L4** (menu/grocery)
> · **L5** (account/errors + the kiosk-dictionary merge — closes S14a). L2 residuals (peer-lock/
> split/settling copy, pay-step status words, tip subline, Undo strings) ride with L3. K15: the
> whole dictionary awaits Min's native check (`serviceDisclosureMy` retired with the service
> charge, W16a).
>
> **Queued next (owner, 2026-08-15):** the remaining **W16** slices (`docs/W16_PLAN.md`):
> **W16b** bilingual-only (ditch the language toggle; stacked EN+MY) · **W16c** bilingual
> confirm steps on Send-to-kitchen + finalize-pay · **W16d** photos restored (remove the W13
> fallback.jpg filename filter in `lib/media-url.ts` — every fallback.jpg in the bucket is a
> real unique photo, HTTP-probed) · **W16e** spacing/typography polish (top-25 map).
>
> **W7a shipped (2026-08-15)** — the receipt artifact (`docs/W7A_PLAN.md`; closes S1 high): the
> durable `/track?r=<token>` session-less itemized receipt (`mms_receipt_tokens`, 90d opaque
> bearer, resolve predicate = the authorization, red-first + mutants), print via the repo's first
> `@media print`, and the consent-first "Email me this receipt" (earner/payer authz →
> `RECEIPT_RATE` → paid-status-guarded write → `after()`-drained Resend `OrderReceiptEmail` with
> the durable link). SB-1524 disclosure rides the artifact + email; M7 one-tax-row. C8:
> `RESEND_RECEIPT_FROM` ships with a `RESEND_FROM` fallback — the owner still owes the dedicated
> diner sender decision. **⚠️ `20260815000000_w7a_receipt.sql` needs the prod apply post-merge**
> (the MCP catch-up flow). Residuals: kiosk/register link wiring (S12), auto-send, Resend
> receipt-event routing, per-order links on /account history.
>
> **W14 shipped (2026-08-14)** — the profile slice (`docs/W14_PLAN.md`; RUBRIC J-F): the name
> finally exists (`setDisplayName` — first writer of `mms_profiles.display_name`; identity card
> grows the v7.2 avatar + tenure + inline Add/Edit name, prefilled from the device name, never
> auto-saved; lights up the Mingalaba greeting / lend confirm / switcher chips), device-session
> hygiene on switch/lend/forget (`lib/device-session.ts` clears `mms.name` + `mms.qr.*` — J19's
> K7 half), history rows lead with 44px thumbs + Burmese sublines (catalog join over soft refs,
> advisory, media-only), `reorderLink` stops the mode guess (pure-grocery → market; food →
> pickup door, dine-in demoted — J19's mode half), masthead recognition line + favorites strip +
> skeleton parity. Decision logic in `lib/order-history-view.ts` + `lib/profile-view.ts` +
> `lib/device-session.ts`, all red-first.
>
> **W13 shipped (2026-08-14)** — the premium-feel pass (`docs/W13_PLAN.md`): the add moment
> (springing bilingual toast, cart-bar spring + count capsule, MicroBurst, haptic hierarchy
> 6/8/12), photos + Burmese joined onto the cart/bill lines (`getCartView` imageUrl/nameMy;
> designed placeholder always renders; `fallback.jpg` filtered), directional back-slides inside
> /cart, bilingual heading accents. `lib/media-url` containment guard caught + closed a real
> protocol-relative `//host` escape in the W4b inline guard. Presentation-only.
>
> **W12 shipped (2026-08-14)** — the two-moment checkout (`docs/W12_PLAN.md`; owner-directed
> restage): the dine-in cart stages **Order** ("Send to kitchen · N items" primary + a quiet
> "View bill & pay · $X" bar) and **Pay** ("Your bill" — receipt-slip rows + breakdown + tip +
> "Pay · $X"); diner tab vocabulary retired (tray / "Keep tab open" / diner `openTab` gone — the
> tab is a state; card-on-file is now "Save a card — leave whenever" on the bill; staff tab
> machinery untouched). Presentation-only, zero money-path changes; landing rule pinned in
> `lib/checkout-stage.ts`. **S13 opened**: an open tab never extends the 4h session TTL.
>
> **W11 merged (#162)** — the split ledger is durable: the pinned reconcile (M1/M25), the
> capture-claim stamp (M45), the refunds ledger + staff strip (M43), payer released-hold copy (M44),
> `qr_order_payers` visibility (M29). ONE capped adversarial pass (13 findings / 4 HIGH, all fixed) —
> the review record is the PR comment. **W6a shipped right after** — the FOH register (K6 + K17
> closed; `docs/W6A_PLAN.md`): `/staff/register` mints walk-up/phone/`start-a-table` orders,
> search + the staff modifier sheet (cardinality enforced), tendered/change + `#CODE` handoff,
> day cash summary.
>
> **✅ Restore catch-up DONE (2026-08-14):** the owner restored the QR project and reported
> "grocery data also not rendering" — root cause: prod's migration history ended at
> `w5c_modifier_allergen_tax` (2026-07-21), so `getGroceryCatalog`'s `is_featured_deal` select
> (W9d) failed and the whole catalog query errored. All SIX owed migrations applied in order via
> MCP (`pickup_asap` · `w9d_featured_deal` · `w11_split_ledger_durable` · `w6a_register_day_index`
> · `w6c_terminal` · `w7b_scan_events`) and verified live: 16 featured deals seeded, all 7
> re-signed fns present, `qr_order_payers` + `mms_scan_events` created with RLS, and the exact
> catalog select resolves. (Prod stamps its own apply-time versions — match history by NAME, not
> timestamp.) **Still owed:** one live split-mint smoke + one register walk-up smoke (needs a live
> table), card-present smoke on hardware (S12).
>
> **W6b shipped too** — the kiosk shell (S5 closed; `docs/W6B_PLAN.md`): device-token surface,
> three doors over kiosk- member sessions, three-way idle fork (abandon / committed-advance /
> screen-clear; the reset defers to the counter-settle freeze), HID wedge, one upsell,
> pay-at-counter into the register queue.
>
> **W6c shipped too** — Stripe Terminal (M6·P6.2 pulled forward; `docs/W6C_PLAN.md`): server-driven
> S700 card settle (`lib/terminal.ts` → the existing webhook fulfill, `tender='terminal'` +
> attribution), freeze held across the collect + extended by the poll, tip-free v1 (S11 registry),
> Card·reader Z-report column. Feature-off unset. **Owed on hardware + Terminal enablement (S12):**
> reader registration (live + simulated for preview), `STRIPE_TERMINAL_READER_ID` per scope, one
> live card-present smoke — and `20260806100000_w6c_terminal.sql` joins the restore `db push` list.
>
> **W7b shipped too** — the resilience shell (S3 closed → an S3a sweep note; `docs/W7B_PLAN.md`):
> Serwist SW (documents network-only under the nonce CSP, synthetic bilingual offline shell,
> capped runtime caches, `CACHE_VERSION` sweep) built via `scripts/build-sw.mjs` chained after
> `next build` (turbo `outputs` carries `public/sw.js*` — cache blindness); 10-min update
> heartbeat + quiet Refresh strip + first-install `controllerchange` guard; device-offline pill on
> `useConnectionTruth`; the offline grocery **scan queue** — server-side per-scan dedupe
> (`mms_scan_events` claimed as the RPCs' first statement; duplicate insert returns the NIL-uuid
> sentinel; a refused write RAISES so a claim never commits without its write), price-free
> `{scanId, cartId, barcode, queuedAt}` entries, ONE id per physical scan (live attempt + queued
> retry share it — the review's HIGH), serialized FIFO drain, terminal verdict flushes the cart's
> queue, catalog-cache "≈$" estimates. 88 mutants at the time (259 today) — and
> `20260813210000_w7b_scan_events.sql` joins the restore `db push` list.
>
> **Next candidates (as of 2026-08-05 — all three now superseded):** W7a receipt (shipped, and
> extended by W22r) · W5 bilingual toggle (RETIRED by W16b — always-bilingual) · the money-truth
> residual sweep (J14 · M22 · M36 · W8d — track it in `docs/OPEN-ITEMS.md`, not here).
>
> _(The banner below is the pre-W11 state — kept for the W10 war stories.)_
>
> ## Previous banner (2026-08-05, morning)
>
> **The W10 outage arc is closed** (W10a–W10d merged; latest #160 — split-tender endgame: M39 idempotency-key
> fix, M40 hold release, the M1/M25 reconcile built-and-reverted with the working design written up in
> `docs/W10_PLAN.md` §W10d). #160 took THREE adversarial rounds (9 HIGH, three of them regressions inside
> fix layers) — read the PR's four review comments before touching the split path.
>
> **The process changed — two hard rules now bind every session:**
>
> 1. **Review budget (owner directive): ONE adversarial pass per PR.** ≤3 lenses, ≤10 agents, ~15 min,
>    delta-scoped. Stalled/overrun → kill + hand-triage the journal. After fixes: mechanical gates + a
>    hand-read, never another agent round. Full wording in `CLAUDE.md` § Pre-PR sweep.
> 2. **Two new mechanical gates, run them before ANY review:** `verify:slice` now opens with
>    `check-money-coverage.mjs` (a changed money-path file MUST be in `MUTANTS` or carry an in-file
>    `verify:slice-exempt — <reason>`); `pnpm check:docs` validates every markdown table renders + measures
>    live-state doc counts. Both are red-first-proven against the real failures that motivated them.
>
> **Open on the split path (docs/OPEN-ITEMS.md is the registry):** **M1/M25** (persist the expected total at
> `openSettlement` — needs a migration, on a Supabase BRANCH) · **M45** (the abort/re-open-vs-capture race —
> needs a capture-claimed stamp BEFORE `paymentIntents.capture`, also a migration) · **M43** (a dead-ended
> split tells no one) · **M44** (no payer-facing "your hold was released") · **M46** (no `.test.tsx` runner —
> decision logic must live in `lib/`, e.g. `split-board.ts`) · **M29** (split payers other than the host
> can't see their paid order). **Still owed: a preview smoke of one split mint** — the `{ count: "exact" }`
> claim is argued from postgrest source + `lib/lock.ts` precedent, not a live round-trip; the QR Supabase
> project is PAUSED (restore only on the owner's explicit request).
>
> Coverage at that point: 314 tests (273 qr + 41 ui), 52 mutants, four split-path suites that didn't exist before #160.

> ## Previous handoff (2026-07-31) — audit findings, still valid
>
> **The W5 UX-gap arc is closed** (W5a–W5g merged; latest #149 — pickup timing UX). A full-repo audit this
> session asked three questions and got these answers:
>
> 1. **Is every customer path validated?** **No — and the gap is structural.** The monorepo has **5 test
>    files**, none on money/auth/journey: `totals.ts` (the charge authority), `tax.ts`, `cart.ts`,
>    `split.ts`/`split-math.ts`, `pickup.ts`, `authz.ts`, `permissions.ts`, `staff-cart.ts` are all at
>    **zero**. There is **no Playwright config and no `e2e/`**. Every validation so far has been diff review
>    - manual preview smoke — reasoning, not execution, which is exactly how the W5c per-part `tax_cents`
>      over-charge nearly shipped (a reviewer caught it; nothing mechanical would have).
> 2. **What still needs refining?** The registry is honest — 33 open rows. The ones that are real customer-path
>    defects: **M1** (a line added in the `openSettlement` race window ships **unpaid**) · **M11** (a
>    grocery-only seat in a by-person split pays a slice of the restaurant service charge) · **M6** (sub-6¢
>    taxable SKU reads exempt) · **M3** (reorder loses modifiers) · **G5/G6** (held item re-adds every 1.5s;
>    camera-denied dead end) · **G13/F9** (bare `/menu` defaults to `scango`, and post-W5f every food door
>    goes to `pickup` — so "Browse menu" drops a returning diner into a different mode) · **S3** (no
>    PWA/SW/offline — table wifi makes it foundation, not polish) · **S1** (no receipt artifact; anon history
>    dies with the 4h TTL).
> 3. **Ready for the admin/staff kiosk surface?** **Staff console yes, register/kiosk no.** KDS, expo,
>    orders, approvals, team/PIN lock, floor board, cash settle, merge, void/comp, refunds are all shipped —
>    you can run the _kitchen_ on this today. You cannot run the _counter_: **K6 (high)** no FOH register
>    (walk-up/phone orders cannot be entered), **K17** no staff modifier picker, **S5** kiosk seam absent,
>    **C7** hardware unbought. `ROADMAP.md` W6 is ⬜.
>
> **Recommendation, and the plan-of-record: [`docs/W8_PLAN.md`](W8_PLAN.md) — W8 (proof) then W6a (register).**
> Build the money-path test harness first (not for coverage's sake — to make server-authoritative pricing,
> TS↔SQL tax parity, and the split cent-reconcile _mechanically_ enforced), then the register. The register
> is a **new money surface**; landing it on an untested foundation repeats the W5c class of bug against a
> real counter transaction. W8 is tracked as `T1`/`T2`/`T3` in [`docs/OPEN-ITEMS.md`](OPEN-ITEMS.md) and as
> the `W8` row in `ROADMAP.md`. **W8 changes no charged amount** — its only production-code change is a
> behaviour-preserving extraction of `computeTotals` out from under the I/O.
>
> _(The 2026-07-15 banner below is the state W8 builds on — read it for what shipped.)_

> ## ⏭️ CURRENT STATE — (2026-07-15)
>
> **Journey II (the K-track) is CLOSED.** Since the 2026-06-29 banner below, three initiatives shipped &
> merged: the 🎨 **Richness track** (R1–R9), **Journey I** (J0–J6, the mode journeys), and **Journey II**
> (K0–K6, "one house, three doors" — the entry IA, table registry, rewards presence + cross-device Stars
> merge, the orders tray, grocery grown up). All on the standard gate with per-PR pre-PR **and** pre-merge
> fresh-context adversarial reviews (verdicts posted on the PRs).
>
> **Latest (post-K6 follow-ons, PR #131):** a guest-rewards-card clarity fix + **K7 — the shared-device
> account experience** ([`docs/SHARED_DEVICE.md`](SHARED_DEVICE.md)): **Switch account** + a **"Welcome back"**
> remembered-identity chooser (one-tap re-auth; hints only, never tokens) + **"Order for a friend"** lend mode
> (clean guest session + a global ribbon + one-tap owner return). The safety hinge: a K3b Stars-merge fires
> only when a genuine guest saves _their own_ Stars — every switch/return suppresses it, so a friend's guest
> Stars can never land on the owner's account. No schema change; server stays the sole rewards authority.
>
> - **Where the plans/scores live:** `ROADMAP.md` (the K0–K6 board, all ✅), `docs/JOURNEY2_PLAN.md`
>   (§ Track close — the self-scored rubric re-score: dine-in/pickup/grocery all ≈4.5), `docs/JOURNEY_PLAN.md`
>   (the J-track close), `CHANGELOG.md` (per-PR detail), `docs/REVIEW.md` (the J/K QA-sweep record).
> - **Open follow-ups (parked, not blocking):** a `posthog.identify` consent surface (would let the client↔
>   server funnels join — deliberately deferred, needs a consent banner); door-keyed funnels await real diner
>   traffic to read (wired + captured, no data yet); `/track` refund arm; the K3b merge-token `pg_cron`
>   expired-row reaper (belt-and-suspenders on the per-device self-clean); K4 reorder loses modifiers
>   (names-not-ids, a schema improvement for a future milestone).
> - **Next initiative (2026-07-16): the 🏭 W-track — Production ("the working house").** Owner verdict:
>   the app is "nowhere near production level polish"; an 8-agent audit+benchmark pass confirmed it and
>   found why the ≈4.5 self-scores missed it (photography/content/ops/i18n are product-level gaps the
>   per-surface rubric never measured; v7.2 covers only the diner path; WORLD_CLASS_UX_PLAN shipped 1/6
>   slices). **Plan-of-record: [`docs/PRODUCTION_PLAN.md`](PRODUCTION_PLAN.md)** — W0 truth/registry →
>   W1 money blockers (grocery pays the 5% service charge + is offered tip presets today; `totals.ts:52`)
>   → W3 kitchen (KDS never sees pickup orders; `kitchen.ts:70`) → W2 flagship craft → W7 shell → W4 grocery →
>   W5 bilingual → W6 register + kiosk shell. Photography + 198-SKU data sprints (needs Min, §5) start
>   in parallel now. **W0 ✅ + W1 ✅ shipped (2026-07-16):** the money/hardening blockers are closed
>   (grocery service-charge/tip · Q4/Q6/Q7/Q9/Q11 · the /track refund arm), the OPEN-ITEMS registry +
>   O-axes + the three SPEC design sources exist.
>
>   **W3 ✅ shipped (2026-07-16, the PR carrying this banner) — the kitchen you can trust.** All five
>   slices in one PR (W3a–W3e, per-slice detail in `CHANGELOG.md`): every channel reaches the KDS
>   (pickup/scango fire at settlement at `slot − prep`, HELD cards, the latent unbumpable-paid-cart-line
>   fix), the hardware-grade board (full-bleed Night `--kfs-*` tier, config-driven urgency, chime/
>   re-chime, paging + "+N more", All-Day rail), ticket bump + 6s undo + 2-min recall (SQL-enforced),
>   the bounded notes/allergy channel end-to-end, wake lock + honest 401/lock redirects, first-name
>   capture at takeout checkout, and the `/board` order-ready TV behind a sanitized device-token poll.
>   **⚠️ Before merge: apply `20260716000000_w3_kitchen.sql` to live** (`fasnpdhtvqtzjlvruqcu` — the
>   preview shares the live DB; the Supabase MCP was unauthenticated in the build session, so this is
>   still pending) **and set `BOARD_DEVICE_TOKEN` in Vercel** (docs/ENV.md) or `/board` stays 503.
>   Hardware to buy stays C7.
>
>   **W2 🚧 foundation shipped (2026-07-17) — flagship craft (icons · placeholder · perceived-perf ·
>   order code).** The buildable-now, non-money slices: ✅ **W2b** the `@mms/ui` `<Icon>` lucide set
>   retiring ~30 emoji-chrome glyphs across the diner path (staff surfaces deferred to a staff pass) ·
>   ✅ **W2a** the designed `PhotoPlaceholder` (category glyph + ✦ over the gradient) via a new
>   `BlurUpImage` `fallback` — a photoless/broken-hotlink dish never reads broken (real photos still
>   gate on C5; the bucket move still needs live Supabase + Min) · ✅ **W2c** `loading.tsx` skeletons
>   for menu/dine-in/track/grocery + `error.tsx` ChunkLoadError guard · ✅ **W2e** the short order code
>   on the food /track receipt. ✅ **W2d — checkout/pay craft (money-path):** wallet-first Express
>   Checkout (`<ExpressCheckoutElement>` above the card, same PaymentIntent — needs the Stripe
>   wallet-domain registration to SHOW wallets, C10; fails closed to card meanwhile) · custom tip
>   (server-confirmed **rate** `customCents/net`, schema cap `0.5→1.0`, re-derived so a group edit can't
>   re-scale a fixed-$ tip) · fees + SB-1524 shown ABOVE the tip ask · amount-on-CTA + "Pay the whole
>   order · $X" group caveat · designed empty-cart. **Server-authority invariant preserved** — the
>   client never sends an amount; create-intent + the webhook recompute from `metadata.tipRate`. **Still
>   open in W2:** the ~360-`fontSize` **type-scale sweep** + lint ban (W2c part 2) · itemized + email
>   receipt + print (W2e — order-lines data + C8) · real photography (C5) + bucket move.
>   Read `docs/OPEN-ITEMS.md` for everything still open (K14/K15 are the W3 residuals; F-items track W2).
>
>   **W4a+W4b ✅ shipped (2026-07-17, the PR carrying this banner) — the market grows up.** The owner's
>   wholesale/retail price lists became a **real 395-SKU bilingual catalog** (`supabase/data/grocery_catalog.json`
>   - import artifact; migration `20260717000000` adds category/brand/sku/size/synonyms + `mms_grocery_search`
>     pg_trgm), and `/grocery` became **Browse|Scan over one cart** (bilingual aisle tiles + unit-priced cards +
>     EBT subtotal; every add rides the existing `scanAdd`). **Competitive plan-of-record:
>     [`docs/GROCERY_MARKET_PLAN.md`](GROCERY_MARKET_PLAN.md)** (the road to #1 online Burmese grocery; the
>     delivery-repo half is `mandalay-morning-star-delivery-app/docs/grocery-delivery-plan.md`, G-track).
>     **⚠️ Needs Min before the LIVE catalog import:** confirm current prices (seed prices are 2022 vintage),
>     real shelf UPCs (synthetic 299-prefix EAN-13s hold browse/search meanwhile), per-SKU photos (C5/C6).
>     W4c (scanner craft) + W4d (exit pass) remain.
>
>   **W4c–W4g + W5a–W5c shipped (2026-07-18 → 07-21).** W4 closed out with the scanner craft, exit
>   pass, sale layer (compare-at pricing, real-competitor-grounded), right-edge aisle fan-out, and the
>   grocery editorial polish. The W5 UX-gap arc then landed: **W5a** session resume (peek endpoint,
>   home resume cards, member-aware picker re-claim — the swipe-back dead end closed, #144),
>   **W5b** desktop rail affordances (scrollbars + `<Rail>` chevron nudges, #145), **W5c** menu item
>   depth (this PR): bilingual `description_my`/modifier `name_my` columns + 60/60 authored Burmese
>   descriptions, real modifier coverage (spice/sweetness/temperature/rice/soft-egg per the honesty
>   rules in the CHANGELOG entry), and the sheet's pre-add qty stepper (bounded Zod+SQL+CHECK).
>   ⚠️ Needs Min: native-check the W5c Burmese batch (K15) + kitchen-confirm the modifier coverage
>   (C11). **W5d shipped (2026-07-22):** the grocery **detail sheet** (`GroceryItemSheet`, reuses the
>   menu Sheet + hero/CTA CSS; hero · bilingual name · aisle badge · brand·size · honest price/compare-at/
>   unit block · EBT-as-eligibility; one money path via the same `onAdd`/`onStep`) + a **card-density**
>   pass (whole-card `.gcard-open` button → sheet, 44px quick-add FAB replacing the full-width pill, unit
>   price on its own line, name 13→15px, photo 1:1→132px). Closes the G17 density asks; **G18** (grocery
>   desktop-widen past the 440 phone column) deferred as its own slice. **Next: W5e** to-go ASAP↔scheduled
>   at checkout (the last of the W5 UX-gap arc).
>
> _(The 2026-06-29 banner below is kept as history — it pointed at the Richness track, now shipped.)_

> ## ⏭️ NEXT SESSION — start here (2026-06-29)
>
> **M1–M5 + S1–S4 are all complete & merged. M5 was deep-audited (verdict: sound — zero money/auth/RLS findings).**
> **The next initiative is the 🎨 Richness track — see [`docs/RICHNESS_PLAN.md`](RICHNESS_PLAN.md) (the full spec).**
> Bring delivery's deep textures/surfaces/micro-interactions/motion to QR, on QR's clean tokens, within the
> M5 guardrails. Build order: **R1 tokens+texture → R2 dark-mode activation → R3 framer (lazy) + test stub →
> R4 interactions.ts→@mms/ui → R5 primitive richness → R6 menu / R7 checkout-celebration / R8 track+rewards /
> R9 staff+homepage.** Each slice = one gated PR with the pre-PR + pre-merge adversarial review.
>
> - **R1 ✅ shipped** — the motion/depth token set (`--ease-in-out`/`--dur-fast`/`--dur-slow`, `--tex-*`,
>   `--glow-*`, `--surface-glass/-vellum/-elevated`, `--sheen`, `--sh-glow`, both themes) + the gradient-masked
>   `.tex-dotgrid`/`.tex-linegrid`/`.tex-grain` + opaque-mobile `.surface-glass/-vellum/-paper` + `pop`/`steam`
>   keyframes in `globals.css`; `--surface-elevated` locked in contrast-audit (41 tests, both themes). **R2 next.**
> - **R5a ✅ shipped** — primitive richness: `Card` opt-in `textured`/`interactive` props (CSS-only,
>   Server-safe; `.card-textured` masked dot-grid + glow on the menu rows, `.card-interactive` on ModeCard) ·
>   `Stepper` count-bounce (a11y-safe — stable aria outer span, bouncing aria-hidden digit) + button press ·
>   `ModeCard` gradient tile + stagger. **R5b is next** — `Sheet` swipe-to-close = the **first `domMax`
>   consumer** (port delivery's `DomMaxProvider` + `useSwipeToClose`; spread the hook's `motionProps` FIRST
>   then explicit style — the safe-area-replace bug; don't nest a `LazyMotion` that a test mock won't stub).
>   **R5c:** AddButton→Stepper inline morph (`layoutId` if domMax present, else CSS).
> - **R3+R4 ✅ shipped** — framer-motion adopted lazily (`MotionProvider` = root LazyMotion/domAnimation,
>   strict; `domMax`/`DomMaxProvider` deferred to R5b sheet-swipe) + the interaction hooks
>   (`useTilt`/`useMagnetic`/`useHeroParallax`/`useRipple`) ported to `packages/ui/src/interactions.ts`.
>   First consumer: `AddButton` press-spring + ripple. **When the first `*.test.tsx` lands, add the framer
>   Vitest stub** (vitest is node-env today; switch to jsdom + add a `framer-motion` mock).
> - **R2 ✅ shipped** — dark mode is now LIVE. Nonce blocking inline script in `layout.tsx` (carries the
>   `proxy.ts` per-request nonce) sets `.dark` from `prefers-color-scheme` before paint; `ThemeSync` handles
>   live OS flips; no next-themes. A verified per-surface audit (workflow) found only small latent dark bugs —
>   all fixed: 6× undefined `var(--bg)`→`var(--sf)`, a hardcoded shadow→`var(--sh-md)`, SharePay→shared
>   `stripeAppearance()`. Rewards + staff surfaces were already dark-clean. **Stripe theme is mount-time** (not
>   re-keyed on a live flip — a remount would wipe in-progress card entry). **R3 (framer-motion, lazy) is next.**
> - **Verify R2 by eye in the preview** (the contrast-audit proves the token matrix, not component usage): each
>   screen in dark for the first time — the cart error-alert lift, the recessed `--sf` fields, over-photo chrome,
>   `--ac` focus rings on Night, and no flash-of-wrong-theme on a hard dark load.
> - **Tracked-deferred a11y (from the audit, not yet fixed):** "one live region per view" is violated at the
>   _seams_ on Checkout-review (RewardField+SecureTabButton), /track (FeedbackPrompt), and ApprovalsBoard
>   (N+1) — each component is correct alone but stacks a 2nd polite region when co-rendered. Also: status chips
>   → `Badge` (a visual change, defer), split-pay off-avatar dim → lighter-bg not opacity (cosmetic).
> - Latest merged: the M5 audit-fix checkpoint (EmptyState→Card, FloorBoard→EmptyState, SettlementBoard→Avatar).

**M1 + M2 + M3 + S1 + S2 + S3 + M4 + S4 + M5 are all complete and merged.** Build order `M1 → M2 → M3 → S1 → S2 →
S3 → M4 → S4 → M5 → (Richness track) → M6` in `ROADMAP.md`. **M5 — RESHAPED 2026-06-24, now COMPLETE.** M5 is **no longer a migration**:
the two apps stay **separate repos** and the younger **QR** app **learns from** the live **delivery** PWA
(adopts its hardened mobile/iOS + a11y patterns, a motion/perf discipline layer, a reusable primitive library
built to QR's tokens, and a contrast-audit test). Why the change: the shared-`@mms/ui` payoff is unrealized
while the apps run different design lineages (QR's tokens are the cleaner base — keep them); delivery's real
value is **craft + learnings** (a transfer, not a repo merge); and the migration would **force-bump a live
production app** (regression risk — the #1 frustration). Full-repo co-location is **reconsidered at M6**. **Read
[`docs/M5_DESIGN.md`](M5_DESIGN.md)** (the reshaped design-of-record) + **[`docs/QR_FROM_DELIVERY.md`](QR_FROM_DELIVERY.md)**
(the prioritized transfer backlog from two grounded audits). P5.0 (the `@mms/db` factory, #79) is retained as a
clean internal refactor. P5.1 = this reshape + the backlog (docs). Slices P5.2–P5.6 are the actual transfers.
**P5.2 ✅ MERGED (#81) — iOS / mobile hardening sweep** (QR ← delivery, built to QR's tokens; no money/auth/data
change): `--sheet-max-h` dvh token + safe-area in the shared `.mms-sheet` (with a `90vh` fallback for iOS <15.4
— one fix covers every `@mms/ui` Sheet); `viewportFit:"cover"` (the linchpin that makes `env()` insets resolve);
position-based `env(safe-area-inset-*,0px)` on CartBar / grocery CTA / recovery alert / RefundActionSheet /
staff add-items header / diner menu header; a single `@media (max-width:639.98px)` rule pinning
`input/textarea/select` to 16px (closes the iOS input-zoom class app-wide). _Deferred:_ swipe-to-close → P5.4;
page-flow top insets → P5.6/PWA.

**P5.3 ✅ DONE (this PR) — motion discipline + perf budget** (QR ← delivery): `@mms/ui` foundation primitives
`useAnimationPreference()` / `useInView()` / `useDeviceTier()` (lean, SSR-safe, exported from root); the
`/track` pulse wired as the canonical `shouldAnimate && inView` consumer (offscreen-pause + JS reduced-motion,
ref on the stable `<ul>`); and **`docs/MOTION_AND_PERF.md`** — the discipline (reduced-motion CSS+JS, 60fps
transform/opacity-only, offscreen-pause, the **mobile GPU/blur budget** that prevents the sibling app's prod
iOS-OOM crash, `desktop`-only gating for heavy GPU). Grounding fact: QR has **no framer-motion** — motion is
CSS-only + already reduced-motion-gated; so P5.3 is the foundation+discipline for P5.4, not a retrofit.
`useRipple`/`useTilt` deferred to P5.4 (need component consumers; carry the no-tilt-on-CTA-card + disable-on-
keyboard-focus caveats; reference impls in the delivery repo `Hero/interactions.ts` / `useTiltEffect.ts`).

**P5.4 — primitive component library in `@mms/ui`, shipped incrementally** (built to QR tokens; each primitive
adopted at an EXISTING duplicated site — no dead code; two grounded audits confirmed consumers + that
Tooltip/Drawer/tilt have NONE → deferred).

- **P5.4a ✅ (this PR):** `@mms/ui` eslint config + `lint` script (+`react-hooks`; closes the P5.3 review Low-2
  — shared hooks were typecheck-only) · **`Badge`** (semantic `tone` presets that own the AA-on-tint rule +
  explicit-color override + `aria-label`/`decorative` passthroughs; `RoleBadge`→tone, `FloorStatusChip`→explicit,
  both byte-identical) · **`EmptyState`** (token `.card` surface + `titleAs`; `KdsBoard`+`ApprovalsBoard`+
  `ExpoBoard` unified). Both pure-presentational (Server-Component safe). **Hardened by a 3-lens deep pre-merge
  review (all PASS).** 6/6 gate.
- **P5.4b-1 ✅:** `Avatar` (`@mms/ui`, initial-in-a-circle; caller passes resolved `initial`+`color`) adopted in
  `GuestList` + `SplitSection`; `tabChip`→`Badge` (`tone="accent"/"warn"`, decorative on TableCard / announced on
  FloorDetailLive) — unifies the floor pills (deep-review carry-forward). **Visual change** (glyph→tone-dot) —
  preview-flagged for the owner.
- **P5.4b-2 ✅:** `Skeleton` (`@mms/ui`, Server-safe, `aria-hidden`; `width`/`height`/`radius`/`circle`) adopted
  in `PickupSlotSheet` (slot-chip mirror) + `SettlementBoard` (share-row mirror). **The shimmer `@keyframes`
  lives in `apps/qr/app/globals.css` `.mms-skeleton`, NOT the package** — a keyframe can't be inline, and the
  pkg ships no component CSS (only `tokens.css`); the primitive references the class (the `Sheet`→`.mms-sheet`
  split). + `Stepper` (`@mms/ui`, client, presentational; parent keeps the mutation). **The "only one consumer"
  belief was WRONG** — a context sweep found **two** drifted consumers: `StaffLineEditor` (red ✕, no count) +
  customer cart `Checkout` (🗑, center count). Extracted one canonical primitive preserving each look via
  `removeGlyph`/`removeTone`/`showCount`; minor flagged cosmetic deltas on Checkout (glyph −2px, sold-out now
  dims, aria wording) — qty math untouched. Skeleton fast-follow consumers surfaced: **SharePay**, **MergeTableButton**.
  - **Deferred (tracked a11y ticket, NOT a P5.4b-2 regression):** removing a line at qty 1 disables/removes the
    "−", dropping focus to `<body>` (WCAG 2.4.3) — **both old inline steppers behaved identically**, so it's
    pre-existing. Fix pattern already in `Checkout.tsx` (`refocusToggle` ref + post-`refresh` effect): stash the
    next focus target (the line above's stepper, or the cart/section heading) and restore it after the mutation.
    Apply to `Stepper` consumers (`Checkout` + `StaffLineEditor`) in a focused a11y pass.
- **P5.4c ✅:** `Card` primitive — **NO variants.** A pre-build sweep overturned the planned elevated/outlined/
  filled taxonomy (it was _delivery_'s, not QR's): all 25 `className="card"` sites are surface-uniform (overrides
  are padding-only); the only fork — shadow vs none — was **accidental drift** in 10 hand-rolled inline copies
  that dropped `box-shadow`. Shipped a polymorphic `<Card>` (`@mms/ui`, applies the global `.card` = single source
  of truth, `as` for real `<Link>`/`<a>` semantics, `ref`-forwarding via React 19 ref-as-prop) + migrated the 10
  drifters; the 9 accidentally-flat ones **gain the canonical `--sh` shadow** (the "unify drift" call, owner-chosen,
  preview-flagged). The 25 class sites + the accent-pill `.card` abusers (CartBar, grocery CTA) are untouched.
  - **Tracked follow-ups:** (a) the 4 tinted ok/warn status surfaces (OrderTracker + FloorDetailLive banners) want
    a future **`Callout`** primitive, NOT a Card variant; (b) ✅ done in the M5 audit-fix checkpoint — `EmptyState`
    now composes `<Card>` (the last re-inlined `.card`-recipe copy is retired).
- **P5.5 ✅ — QR's first test infra:** Vitest 4 in `packages/ui` + `apps/qr` (node-env; pure-logic only — no
  `server-only`/CSS); the turbo `test` gate is now live in `ci.yml`. The **contrast-audit** (`packages/ui`)
  **parses `tokens.css` at test time** (resolves `var()` aliases + flattens `color-mix` tints — no hardcoded
  fixtures to drift) and asserts the text×surface matrix both themes + **negative anti-regression guards**
  (plain `--ac`/`--gold` as text must stay <4.5 in light). + `avatars.test.ts` (seat AA + `seatColor`/
  `seatInitial`). **The P5.4b-1 "seat hues sub-AA" follow-up was a PHANTOM** — all 5 `PCOL` hues clear 4.5:1
  (lightest 4.92); `avatar.tsx` comment corrected. Tooling: `esbuild`→`pnpm-workspace.yaml allowBuilds`;
  `packages/ui/tsconfig` `types:["node","react"]`. 37 tests; gate 8/8.
  - **Deferred fast-follow:** pure money-math tests (`tax.ts`/`split-math.ts`); component tests (need jsdom +
    `@vitejs/plugin-react` + `@testing-library` — add when the first lands, no speculative apparatus now).
- **NEXT — P5.6 (deferred/optional):** PWA/offline (Serwist SW + manifest + offline cart + chunk-load reload
  boundary). Low priority for dine-in (on-site, ~4h session, network assumed) — **M5 is otherwise complete.**
- **Deferred (no consumer):** `Tooltip`, `Drawer`, tilt; `Toast` + ripple only if a real consumer emerges.

Backlog + per-primitive consumer map: `docs/QR_FROM_DELIVERY.md`.

> **S4 — unified basket & fulfillment routing — COMPLETE (PRs #71–75, all merged + applied to live).**
> **S4.1** (#71, `20260623100000`) — per-line `qr_cart_items.fulfillment` (dinein/togo/grocery) drives BOTH
> routing and tax; `mms_set_line_fulfillment` (TOCTOU-fixed: re-asserts open+draft+not-grocery in the UPDATE
> WHERE). **S4.2** (#72, `20260623220000`) — per-line fire routing: `mms_fire_cart` fires only
> `fulfillment='dinein'`; `mms_fire_line` (togo make-it-now, guards in WHERE); `mms_fire_pending_food` (fires
> draft food of a PAID dinein cart at checkout) + KDS fulfillment subset + ready signal. **S4.3a** (#73,
> `20260624000000`) — to-go fulfillment loop: `qr_orders.togo_status` (preparing/ready/picked_up) +
> `qr_order_items.fulfillment` snapshot; `mms_init_togo_status`/`mms_set_togo_status`; the bagging/**expo**
> station `/staff/expo` + "to-go ready" signal. **S4.3b** (#74, `20260624010000`) — line-level **refunds**
> (money-out): `mms_refunds` ledger (unique stripe_refund_id + partial-unique on order_item_id, RLS-on,
> manager-read), `mms_approvals.kind` gains `'refund'`; `mms_refund_authorize`/`mms_record_refund`/
> `mms_apply_refund_reconcile`; manager-facing `/staff/orders` surface + `RefundActionSheet` + self-PIN
> step-up; `charge.refunded` webhook reconcile (fetches `refunds.list({charge})` — `charge.refunds` is NOT
> auto-expanded on Stripe apiVersion `2026-05-27.dahlia`). **S4.3c** (#75, `20260624020000`) — the EBT
> split-tender **seam** (data model only): `qr_order_items.ebt_eligible` + `mms_snapshot_ebt_eligibility`
> (marks grocery lines whose catalog item is EBT-eligible, in the settlement after() drain) — the 2027 Forage
> tender becomes a tender-time branch, not a rewrite. The 3 settlement after() drains (card webhook single +
> split, cash settle) chain `mms_fire_pending_food` → `mms_init_togo_status` → `mms_snapshot_ebt_eligibility`.
> **Design-of-record:** [`docs/S4_DESIGN.md`](S4_DESIGN.md). **All 5 migrations applied to live + advisor-clean.**

> **⚠️ S4 deep audit shipped — [`docs/S4_AUDIT.md`](S4_AUDIT.md)** (6 parallel adversarial auditors; money/tax,
> auth/RLS/IDOR, concurrency, M5/M6 seams, a11y/UX, schema/debt). **Verdict: structurally sound, security a
> clean PASS — but the fast build left real defects.** **Remediation SHIPPED (PR #77, `20260624030000`,
> applied to live + advisor-clean + dual-adversarial):**
>
> - **P0-1 (money BLOCKER) ✅** — `mms_refund_authorize` under-refunded qty>1 taxable lines (per-unit tax
>   added once); now the line's **pro-rata share of order tax** (scales with qty). **P1-1 ✅** — refund is
>   **discount-aware** (discounted goods + tax on the discounted base, mirrors `totals.ts`) + an **order-level
>   over-refund cap** (Σ refunds ≤ net+tax). UI shows the server-derived `refundableCents`.
> - **P1-2 ✅** — fire-at-checkout durable backstop: `mms_reconcile_settled_fulfillment` pg-cron (5-min) +
>   the 3 settlement `after()` paths split into independent try/catch.
> - **P1-3 ✅** — `mms_undo_fire` keys on a `fire_batch` (threaded send→client→undo), race-free; never claws
>   back a guest's make-it-now line. (`mms_fire_cart` now returns `(fired, batch, fire_deadline)`.)
> - **P1-4 ✅** — `charge.refunded` backstop 5xxs on a list/record failure (Stripe redelivers) instead of
>   swallowing → no >24h re-refund double-pay.
> - **P0-2 (M5 doc blocker) ✅** — topology reconciled (own project; shared packages + one Stripe account).
> - **Still open (deferred, NOT blockers):** **P1-5** (`RefundActionSheet` → canonical `Sheet` + a `--scrim`
>   token, a11y) · **P1-6** (refunded orders in `/account` history) · the **P2 debt** (indexes; Checkout live
>   regions; dead `docs/REVIEW.md`; no S4 LEARNINGS; `@mms/db/schemas.ts` QR-only but root-exported — **fold
>   the namespace into the M5 package restructure**; S4.1 bare `create function`).
> - **M6 carry-forward (not S4 defects):** EBT is the deferred split-refund's twin (2027 needs a Forage tender
>   column + a tender↔line-subset association on `qr_cart_shares`); SNAP tax exemption is a tender-time fact the
>   single per-line snapshot can't represent (needs an adjustment entry + scan-time eligibility); `/track` needs
>   a session-less signed-order-token path for kiosk/Terminal walk-ups; Terminal must route through the
>   settlement mutex or the double-collect guard has a hole.

## Where we are — M1 + M2 complete (merged)

The QR app is feature-complete through the solo pay path + tax/promos/scheduling/grocery + the QBO
accounting seam. Per-phase detail is in `ROADMAP.md` + `CHANGELOG.md`; the load-bearing facts:

- **M1 (walking pay path) ✅** — anon-auth session (`AnonAuthGate`/`useAnonSession`; `POST /api/session`
  mints a `table_session` + member + open cart and returns `cartId`), **one authz guard**
  (`apps/qr/lib/authz.ts`, `assertCartMember`) on every mutation, server-authoritative cart/tax/totals
  (`lib/cart.ts`/`lib/tax.ts`/`lib/totals.ts`, **cents end-to-end**), two-step checkout → Payment Element
  → signature-verified **idempotent** webhook (`mms_fulfill_order`) → `/track` live timeline via Realtime,
  nonce CSP (`apps/qr/proxy.ts`), fail-fast env (`requireEnv`).
- **M2 (tax · promos · scheduling · grocery · QBO) ✅ — all shipped THIS session:**
  - **P2.1 promos** (#18): `mms_promo_*` SECURITY DEFINER fns, per-reason `applyPromo`, migration `…0000`.
  - **P2.2 pickup** (#19): capacity slots counting **paid + live holds**, per-slot advisory lock,
    `fire_at` (the S2 KDS seam), `/track` echoes the chosen slot, next-day rollover. Migrations
    `…0100`/`0200` + the **same-day slot-alignment fix `…0300`** (anchor the grid at the _stable_ day-open,
    filter by `now+lead`; never anchor the series at `now+lead` — LEARNINGS).
  - **P2.3 grocery** (#21): Scan & Go now mints a real `useTableSession("scango")` session (not a client
    uuid); name-search fallback (`searchGroceryItems`) over public-RLS `grocery_items`.
  - **P2.4 QBO sync** (#22): paid order → QBO **Sales Receipt deposited to a Stripe clearing account**
    (two-ledger). Pure total-preserving mapper (`lib/qbo/mapping.ts` — throws unless Σ(lines) == charge),
    fail-safe idempotent client (`lib/qbo/client.ts`, a no-op unless `QBO_SYNC_ENABLED=true`),
    `qbo_sync_queue` ledger (migration `…0400`, RLS default-deny), webhook posts in `after()` so QBO never
    blocks the money path. **Off by default.** See `docs/QBO_SYNC.md`.
- **M3 (group cart — multi-device) ✅ — P3.1–P3.4 shipped + merged:**
  - **P3.1 multi-device join** (#25): `qrCode` doubles as the join key (scanned sticker `?t=` or a
    server-minted 8-char invite `?j=`); partial unique index `table_sessions_active_qr_uniq` makes
    concurrent joiners converge on ONE session; presence guest list (`useGroupCart`, sanitized on
    ingest, keyed by the stable seat). Join model = **both (sticker primary)**.
  - **P3.2 live group-cart sync** (#26): Postgres Changes on `qr_carts`/`qr_cart_items` → consumers
    re-fetch the server-authoritative `getCartView` (keyed React state, never client math); `replica
identity full` for DELETE filtering; announce a peer's ADD only (by_seat).
  - **P3.2-lock cart-lock-at-pay** (#27): `locked`/`locked_at`/`locked_by` (TTL auto-release, re-acquire
    by the same payer); one atomic conditional UPDATE; the existing `locked` guard in every mutation.
  - **P3.3a split-the-bill foundation** (#28): Even/By-person UI on `/cart` + per-line assignment;
    `canMutate(line_state, actor_role, isOwner)` (host any line / guest own-only); optimistic
    cent-reconciled shares (`lib/split-math`). Schema-free.
  - **P3.3b split-tender** (#31, **Option A: authorize-all → capture-together**): each diner authorizes
    their server-derived share on a `capture_method:manual` PaymentIntent (`create-share-intent`,
    per-payer tip); the webhook captures all when the last authorizes → `mms_fulfill_split_order` (one
    order, idempotent) → release the freeze; abort/decline cancels the holds; `qr_cart_shares` ledger +
    `settle_at` table-wide freeze (mutually exclusive with the single-pay lock); live `SettlementBoard`
    (realtime + 5s poll backstop). Tax weighted by each seat's **taxable** base, service by **net**.
    Hardened across **three** adversarial passes (foundation, server flow, pre-merge) — the
    "never charged-with-no-order" invariant holds, fail-loud on the residual.
  - **P3.4 abuse limits** (this session): generic per-**seat** rate limiter (`rate_events` +
    `mms_rate_limit`, count-first/self-GC) on `/api/session` join (30/min) + every cart mutation incl.
    both pay routes (120/min), **fail-open**; party cap **12** via an advisory-locked `session_members`
    `BEFORE INSERT` trigger (`mms_enforce_party_size`) + friendly route 409 + cap-aware Invite UI;
    background `mms_sweep_expired_sessions()` on **pg_cron** (15-min, guarded for local CI); RLS
    membership **negative tests** (`supabase/tests/rls_membership_test.sql`, in CI + verified live).
    Migration `20260621000000` applied to live, advisor-clean. Adversarial subagent **PASS**.
- **Two fixes rode alongside M3 this session:**
  - **Dine-in session-expiry recovery** (#29): the 4h TTL stranded in-use tables ("Couldn't add that")
    because the mint found a session by `status='active'` only while authz/RLS reject on `expires_at`.
    Fix: sliding renewal on any authorized touch + rejoin; mint sweeps a stale session + re-mints;
    client re-mints on a failed op (honest renewed-vs-timed-out copy). Schema-free.
  - **Production error tracking** (#30): PostHog server-side capture (`instrumentation.ts onRequestError`,
    non-PII context) + branded `error.tsx`/`global-error.tsx` boundaries; client capture was already on.
    PostHog-only (Sentry would be redundant).
- **All M2 + M3 migrations are applied to the live QR project** (`fasnpdhtvqtzjlvruqcu`) + advisor-clean
  (only the intentional `rls_enabled_no_policy` INFO on the default-deny tables). **P3.3b's
  `20260620001000_split_tender` was applied to live mid-session** because the PR preview shares the live
  DB — a migration-requiring branch is broken on its preview until the (additive) migration lands on live
  (LEARNINGS — the inverse of "CI green ≠ applied").

## ⚠️ Pending activation — needs Min (config, not code; like the Stripe live cutover)

1. **QBO sync ships dark.** Sandbox company **"Mandalay Morning Star"** is connected; the mapper's entities
   exist (recorded in `docs/QBO_SYNC.md` → `QBO_CUSTOMER_REF=126`, sales `740` (Non-Inventory), service
   `737`, tax `738`, tip `739`). Remaining (the connector can't do these): create a **Stripe Clearing** GL
   account, get the **realm id**, create an Intuit **Developer app** (`QBO_CLIENT_ID`/`SECRET` +
   `QBO_REFRESH_TOKEN`), set all in Vercel, `QBO_ENV=sandbox`, `QBO_SYNC_ENABLED=true`, run one test order.
   QBO UI cleanups: **deactivate** the old Service-typed "QR Sales" (736); **remap** "QR Sales Tax"/"QR Tip"
   to liability accounts.
2. **Stripe live webhook + keys** at production cutover (`docs/ENV.md` "Wiring Production"). ⚠️ Prod
   currently has **live** Stripe keys → a _test_ card is declined; for a test-charge smoke, run prod on
   test keys (incl. a test-mode `whsec_…`) or use `stripe listen`.
3. **Staff sign-in + email — Resend.** Staff log in three ways, all resolving to the `staff.email`
   allowlist (`docs/ENV.md` "Staff sign-in"):
   - **Google OAuth (primary, NO email/SMTP needed — the recommended path):** Google Cloud OAuth web
     client (redirect URI `https://fasnpdhtvqtzjlvruqcu.supabase.co/auth/v1/callback`) → Supabase → Auth
     → **Providers → Google** (paste ID/secret) → add redirect URL
     `https://qr.mandalaymorningstar.com/staff/auth/callback`. This sidesteps the SMTP mess entirely.
   - **Bootstrap the first owner:** sign in once with Google (mints the auth user; bounced as non-staff),
     copy your UID from Auth → Users, then `insert into public.staff (user_id, email, role, display_name)
values ('<uid>','you@…','owner','Min');` → refresh `/staff`.
   - **Magic-link/OTP — via the Supabase Send-Email Hook (preferred, NO SMTP):** Supabase → Auth →
     **Hooks → Send Email Hook** → HTTPS, URL `https://qr.mandalaymorningstar.com/api/auth/send-email`,
     put its secret (`v1,whsec_…`) in `SEND_EMAIL_HOOK_SECRET`. The app renders a **React Email**
     template (code-prominent — dodges the link-prefetch `otp_expired` we saw) and sends via Resend, so
     there's no SMTP to misconfigure (this replaces the Gmail-`534`/429 mess). Needs `RESEND_API_KEY` +
     `RESEND_FROM`. _(SMTP→Resend + a code-only `{{ .Token }}` template is the only-if-you-skip-the-hook
     fallback.)_
   - **Auth hardening — ⚠️ STILL REQUIRED (S1-audit B1 binding backstop):** on the **live** project,
     **disable public email/password signup** (staff are admin-provisioned; diners use anonymous sign-in —
     neither needs it) **or** turn email **confirmations ON**; restrict the Google provider to the workspace
     domain; disable automatic cross-provider linking. The SQL side is now **CODE-FIXED** (migration
     `20260622000000`): `is_staff()`/`is_staff_at_least()` no longer trust the raw JWT `email` claim — the
     email branch resolves via `staff_session_email_match()` (reads `auth.users`, requires
     `email_confirmed_at` + a provider-verified OAuth identity, never `provider='email'`). **But** under
     confirmations-OFF auto-confirm, the `provider <> 'email'` guard is what holds the RLS layer, so the
     config above is the durable control — do it before the live cutover. (See `docs/S1_AUDIT.md` §B1.)
   - **App transactional:** set `RESEND_API_KEY` + `RESEND_FROM` + `NEXT_PUBLIC_SITE_URL`
     (`https://qr.mandalaymorningstar.com`) in Vercel → staff invite/deactivation emails send via the
     SDK (`lib/email.ts`, best-effort via `after()`; unset keys = silently skipped, action still succeeds).
   - **Events webhook:** in Resend add a webhook → `https://qr.mandalaymorningstar.com/api/resend/webhook`
     and set its Svix signing secret as `RESEND_SIGNING_SECRET` → `/api/resend/webhook` verifies + flags
     bounces/complaints (masked logs) + PII-free PostHog deliverability events. (`RESEND_WEBHOOK` was
     provisioned but the code doesn't consume it — only the signing secret is needed.)

## S1 (staff & floor) COMPLETE — S1.1a + S1.1b + S1.2 + S1.3 + S1.4 SHIPPED · Next: S2

Per the build order (`M1 → M2 → M3 → S1 → S2 → S3 → M4 → S4 → M5 → M6`) the service-model layer is in
progress. Read [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md) + the `ROADMAP.md` S-track for the
S1 exit criteria. **Staff auth = magic-link/OTP + a shared-tablet PIN** (Min's call): S1.1a builds the
magic-link foundation; S1.1b adds the PIN.

**S1.1a shipped (this session):** `staff` table + roles (server/manager/owner) + `is_staff()`/
`is_staff_at_least()` additive RLS (staff read **any** table session; diners unchanged) + `/staff` console
(OTP login, role-gated shell, owner-only `/staff/team` provisioning). Migration `20260621100000` applied to
live + advisor-clean; RLS verified behaviorally; adversarial subagent run pre-PR (all fixes landed).

**⚠️ Bootstrap the first owner (one-time, before `/staff` is usable):** there is deliberately NO self-serve
first-owner path. In the Supabase dashboard → Authentication → **Add user** (auto-confirm) for the owner's
email, then run once (service-role / SQL editor):
`insert into public.staff (user_id, role, display_name) values ('<that-auth-user-id>', 'owner', 'Min');`
After that the owner signs in at `/staff/login` (OTP) and provisions everyone else from `/staff/team`. (If
an over-deactivation ever locks owners out, recover the same way: `update public.staff set active=true …`.)

**Smoke-tested on preview ✅** (this session, real inbox): Google OAuth round-trip and the email
magic-link/OTP send + in-page verify both work end-to-end on the PR-43 preview. Team provisioning
(`createUser` + row, orphan-rollback) still wants one live pass once an owner is bootstrapped, but the
auth path itself is confirmed.

**OTP resend-loop — FIXED (code, #43, preview-verified) + one config step left for Min.** The "Too many
code requests" loop was NOT a hanging Send-Email Hook (auth logs show GoTrue's `/otp` durations are all
sub-second). It's GoTrue's own **`over_email_send_rate_limit`** (429) — its email rate limit, which fires
_before_ the hook, so it's unrelated to Resend's quota. Two parts: (a) **code fix (shipped #43):**
`StaffLogin`'s resend cooldown was reset on _every keystroke_, so editing the email even one char wiped the
60s gate → instant re-tap → trip the limit; the cooldown/block is now scoped to the address it was sent to,
the honest 60s "Resend in Ns" countdown shows only after a _successful_ send, and a 429 blocks the address
and steers to Google (no misleading "wait a minute" that re-enables into the hourly cap). (b) **config (Min
must do):** raise Supabase → Auth → **Rate Limits → "Rate limit for sending emails"** (`docs/ENV.md` "Staff
sign-in"); until then, **Google OAuth is the reliable path** (no email, never rate-limited). _Deferred (no
evidence it's needed): a fail-fast timeout on the Resend send in the hook — a hung send WOULD hang the hook
→ GoTrue retry storm, but the logs show sub-second sends, so it's hardening, not the bug._

**S1.1b shipped (this session, PIN):** per-person shared-tablet **PIN** — bcrypt hash in a service-role-only
`staff_pins` table (NOT a `staff` column: `staff` is client-readable, so a hash column would leak — separate
default-deny table keeps it off every read surface); atomic `mms_staff_verify_pin` (advisory-locked,
**5-try / 15-min lockout**, lapsed-lock grants fresh budget) — the SAME primitive S2's manager step-up
reuses; **fail-CLOSED** app wrapper (`lib/staff-pin.ts`); keyed by the resolved staff-row PK
(`StaffCaller.staffId`, not the session uid). Self-service set/rotate/remove at `/staff/profile`
(`PinManager`, trivial-PIN rejection); a shared-tablet **lock** (`/staff/lock`, `LockButton`/`PinUnlock`) —
an httpOnly, path-scoped cookie the shell pages redirect on, documented as an **attribution/privacy
affordance, not a hard boundary** (the Supabase session + staff-row gate remain the real boundary; escapes:
"Forgot PIN? Sign out", lock refused without a PIN). Migration `20260621130000_staff_pin.sql` (additive),
types regenerated, gate green, adversarial subagent **PASS**.

**✅ `20260621130000_staff_pin.sql` is APPLIED to live (`fasnpdhtvqtzjlvruqcu`)** — applied via the Supabase
MCP after Min's go-ahead, then verified: `staff_pins` exists with RLS on + 0 policies (default-deny);
`anon`/`authenticated` have **no** SELECT on the table and **no** EXECUTE on any of the three `mms_staff_*`
fns (service-role only); bcrypt resolves at runtime under `extensions` (correct PIN matches, wrong
rejected); `get_advisors(security)` shows only the intentional `rls_enabled_no_policy` INFO on `staff_pins`
(it does NOT appear in the 0026/0027 GraphQL-exposure WARNs, confirming the anon/authenticated revoke took).
No further DB action for S1.1b.

**S1.2 shipped (this session, floor view):** live `/staff` floor (`FloorBoard`) of every active table —
party/status/running-subtotal-or-paid/last-activity — over **Postgres-Changes authorized by the existing
`is_staff()` SELECT RLS** (so NO `realtime.messages` change was needed; that's only for S2 staff
_broadcast_ — the postgres-changes READ path already saw staff via the `or public.is_staff()` folded into
each table policy). Read-only drill-down `/staff/table/[id]` (`FloorDetailLive`) shows the cart lines +
party. Staff **"Clear table"** turnover (`clearTable`, pulled forward from S1.4) closes the session +
cancels the cart, refusing mid-payment (fresh lock/settle **and** any `authorized`/`captured` split share);
logged non-PII via PostHog. Server layer `lib/floor.ts` (`getFloorView`/`getTableDetail`/`clearTable`, all
`requireStaff()`+service-role); `lib/useFloorRealtime.ts` (debounce + 5s poll backstop + self-heal).
**`qr_carts.updated_at` is never bumped** (no trigger; the cart RPCs don't write it) — so last-activity +
the detail live-refresh key off the latest `qr_cart_items` row, not that column (adversarial F1). Migration
`20260621140000_floor_realtime.sql` (publication add — no types impact). Gate green; adversarial subagent
PASS (F1/F2/F3 fixed pre-PR). **✅ `20260621140000` is APPLIED to live** — `table_sessions` +
`session_members` are on the live `supabase_realtime` publication (verified via MCP this session).

**S1.3 shipped (this session, staff write + cash settle):** staff order/edit a table order _for_ a guest +
**settle in cash** ("pay a human"), from the floor drill-down. The cart belongs to the **table**, not the
phone (ORDER-MODEL), so staff write the **same** ledger via the **same** server-authoritative pricing —
extracted to `lib/order-lines.ts` (`priceItem` + `insertOrIncLine`, shared with the diner `addItem` so
they can't drift); staff lines carry `by_seat = null`. Cash settle: `getCartTotals` (single tax engine,
`tip=0` off-system, SB-1524 service charge applied) → `mms_fulfill_cash_order` — **idempotent on `cart_id`**
(partial-unique), **atomic `open→paid` flip**, **subtotal-reconcile** (Σ lines in SQL vs passed breakdown).
A shared payment mutex (`lib/pay-guard.ts`, `paymentInFlightReason`; clear-table refactored onto it) refuses
write/settle/clear while a card payment or split is in flight — and the card-lock requires `status='open'`,
so card-after-cash can't start and cash-during-card is refused → no double-charge. UI: `StaffLineEditor`
(qty steppers), `StaffAddButton` + `/staff/table/[id]/add` (menu browser), `CashSettleButton` (two-step
confirm, all-in total). Migration `20260621150000` (`qr_orders.tender`/`cart_id`/`settled_by`; cash RPC
`revoke from public` + `grant service_role`). Types regenerated; gate green; money path verified on the
local stack (happy/idempotent/mismatch-raise/double-settle-raise); adversarial subagent run pre-PR.
**⚠️ Apply `20260621150000` to live before merge** — the PR preview shares the live DB, so a
migration-requiring branch is broken on its preview until the (additive) migration lands on live.

**S1.4 shipped (this session, soft convergence — completes S1):** **one-tap merge** of two table orders —
`MergeTableButton` on the drill-down → `mergeTables` (lib/floor.ts, `requireStaff` + service-role) → atomic
`mms_merge_table_orders`. Folds a source table's open order into another (re-parents the **already-server-
priced** lines — bumps an identical target line, same item + normalized modifier set, when it stays ≤99 else
re-parents it so **no units drop**; moved lines `by_seat=null`), then cancels the source cart + closes its
session. **Any active staff** may merge (non-loss turnover cleanup, like clear-table — no manager-PIN; that's
S2's loss-gate), logged non-PII (`staff_merge_tables`). Refuses a closed/paid table, a **cross-mode** target
(per-line tax basis is dine-in vs to-go), or either side **mid-payment** (shared `pay-guard`); both carts
row-locked + must be `open` so a concurrent settle/clear loses the race. **Divergence "warning" is the
explicit pick-and-confirm tool** — the sticker `qr_code` is unique per active session, so two-labels-one-table
isn't auto-detectable; no fabricated alarm (ORDER-MODEL §46–50). **Session expiry** already covered
(`mms_sweep_expired_sessions` pg_cron + `expires_at` floor filter + sliding renewal, P3.4). Migration
`20260621160000_table_merge.sql` (one SECURITY DEFINER fn, service-role-only); types regenerated; gate green;
money path verified on the local stack (merge / identical-bump-across-modifier-order / 99-cap re-parent with
no unit loss / non-open + same-cart raises / grant lockdown); adversarial subagent pre-PR.
**⚠️ Apply `20260621160000` to live before merge** (the PR preview shares the live DB — same as S1.3).

**Next: S2 — line lifecycle & authority.** A full pre-build adversarial design review is in
[`docs/S2_DESIGN.md`](S2_DESIGN.md) (threat model per phase, the new money/auth/RLS surface, the build-order
PR slices). Read it + [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md) §"edit rights"/"voids"/"approvals"
before building. **Three load-bearing seams it surfaces:**

- **The line lifecycle is PRE-settlement** — it lives on `qr_cart_items` (the open cart _is_ the table order
  until settle), NOT `qr_orders` (`/track` is post-pay). Dine-in fires food before payment.
- **`canMutateLine` is diner-only today** (`"host"|"guest"`, `LineState="draft"`) and its post-draft branch is
  a placeholder returning `actorRole==="host"` — **wrong for S2** (a diner host is not staff). Making **staff a
  first-class actor** in that gate is the #1 thing to get right; post-fire editing is staff-only.
- **KDS broadcast needs the `cart:*` channel privatized first** (`{private:true}` + a `realtime.messages`
  policy); recommend shipping the **v1 KDS on `postgres_changes`** (no broadcast, no new policy) to avoid it.
  And **unify the fire timer** — consume the existing `fire_at` (pickup) for dine-in immediate-fire too.

**Confirmed decisions (Min):** loss gate = **cooked-vs-uncooked + a ceiling** (uncooked void = server-solo +
reason; cooked/refund/over-ceiling = **manager-PIN step-up**, reusing `mms_staff_verify_pin`); S2.4 = build the
**approvals primitive + in-person manager-PIN + durable audit** now, **defer owner-remote-approve/SMS**.
**Still-open (in S2_DESIGN §Open decisions):** manager-PIN resolution model, KDS-as-console-view, ceiling
values, undo-grace length. **A full S1 retrospective audit shipped — [`docs/S1_AUDIT.md`](S1_AUDIT.md)** (4
parallel specialist agents): **B1** (`is_staff()` unverified-email RLS escalation, `20260622000000`) and
**B2/S1/S3** (card-after-cash double-charge + atomic fulfill claim + `qr_refunds_needed` recovery ledger,
`20260622010000` — which also restored two S1.3 regressions in `mms_fulfill_order`: the `pickup_slot`/
`fire_at` copy + the `mms_promo_consume` call) are now **code-fixed**; B1's live-config backstop is in
"Auth hardening" above. **B3 + the a11y batch** (RoleBadge AA contrast via `-strong` tokens, sold-out
`+` gate, dual-live-region → assertive alert, dropped-focus on confirm/step panels) are now **code-fixed**
too (no migration). Both money/auth migrations are **applied to live** (`20260622000000`, `20260622010000`)
and merged. **B3 + the a11y batch** (RoleBadge AA contrast, sold-out `+`, live-region, focus) merged (no
migration). **S2** (cash/merge RPCs session-gated on `table_sessions.status`, `20260622020000`) and **S7**
(staff-provisioning: generic create-failure message, per-owner `mms_rate_limit`, PostHog audit events)
close out the audit. **The S1 retrospective audit is now FULLY remediated** — both blockers + all seven
SHOULD-FIX done. Live migration state: `20260622000000` + `20260622010000` + `20260622020000` all
applied. B1's live-config backstop (disable public email signup, workspace-domain Google)
is in "Auth hardening" above — still the binding control there.

**Tracked / deferred (non-blocking, carry forward):**

- **S2 must privatize the realtime cart/shares channels before adding broadcast.** The `cart:`/`shares:`
  channels (`lib/realtime.ts`) are non-private — RLS-safe for postgres-changes today, but a `.send()`
  (e.g. a KDS/staff push) requires `{ config: { private: true } }` + a `realtime.messages` policy for
  `cart:*`/`shares:*` (mirroring `rt_member_read`), since table RLS doesn't cover broadcast. Load-bearing
  comments are in place; this is the S2 to-do.
- **Split-fulfill amount reconcile is tautological → fix WITH S4.3.** `mms_fulfill_split_order` compares
  Σ(share amounts) against a value derived from the same rows; not exploitable today (each share's
  `amount_cents` == its PI amount, client can't tamper), but it becomes load-bearing the moment S4.3 adds
  **partial capture** — then reconcile against Stripe `amount_received`.
- **Split share-math: P3.3a display vs P3.3b tender can diverge** (by-person + unassigned/mixed-tax) — the
  `/cart` SplitSection reference number can differ by cents from the authorized amount. Compute the display
  from `deriveShareBreakdowns`, or label it "approximate". (Tender is authoritative; the divergence is a
  display-honesty polish.)
- **Cross-owner line delete is host-only with no confirm** — QA §D accepts host-only as the alternative to
  a confirm; revisit if product wants a confirmation step.
- **P3.4 Low:** a mutate-rate 429 in `TableCartProvider.add` shows the session-recovery copy
  ("Reconnecting…") rather than a throttle message — self-correcting; precise copy needs a result
  discriminant (thrown Server Action errors are redacted in prod). 120/min is far above human use.
- **P3.3b follow-up:** the `onShareCaptured` `wasOpen` TOCTOU → a possible **duplicate analytics event**
  under a sub-ms double `succeeded` delivery (money unaffected — QBO upsert idempotent).
- **`charge.refunded` is unhandled platform-wide** (single-pay AND split) → owned by the **S4.3** seam
  (line-level refunds).
- **M1-money (from the M0–M2 red-team):** `getCartTotals` infers a line's taxability from `tax_cents>0`,
  so a sub-6¢ taxable SKU (where `round(price×0.0975)=0`) would be treated as exempt — no real MMS SKU is
  that cheap, but the clean fix carries an `is_taxable`/category onto the cart line rather than the rounded
  proxy (small data-model change). Also: order-level `qr_orders.tax_cents` (aggregate-rounded on the
  discounted base) won't sum-match the per-unit-rounded line `tax_cents` snapshots — the **charge is
  correct**; only a receipt that sums line tax disagrees by a cent or two. Both deferred (latent/cosmetic).
- **QBO production-activation** (already on the `docs/QBO_SYNC.md` checklist): Intuit refresh-token rotation
  on each exchange + a per-order advisory lock for the drain (`processPendingQboSyncs`) before
  `QBO_ENV=production`. Off by default today; no action for S1.

**Build to v7.2 + the bars.** `docs/prototype/v7.2.html` is the design source; hold every screen to
QA-CHECKLIST §A / RUBRIC ≥4.3 in the **first commit** (tokens, motion, a11y, brand voice). Read
`docs/context/INDEX.md` (RUBRIC · DESIGN-RESEARCH · QA-CHECKLIST · RED-TEAM) at the START of the phase.

## Environment facts (read before running anything)

- **QR runs on its OWN Supabase project** — `fasnpdhtvqtzjlvruqcu` ("MMS QR Platform", org
  `iqphcmcmbydhkssfhrdt`), separate from the live **delivery** app (`ukuzkhuppqwtrdkjqrkv`). No
  shared-project blast radius; the catalog is owned here (`tax_category` is a column).
- **App env** (set in Vercel by Min): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` _or_
  `…_PUBLISHABLE_KEY` (both accepted), `SUPABASE_SERVICE_ROLE_KEY`, the Stripe + PostHog keys, and the QBO
  vars (`docs/ENV.md`).
- ⚠️ **This sandbox injects `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` pointing at the DELIVERY
  project**, and Next lets real shell env override `.env.local` — so local `pnpm dev`/build hits **delivery**
  unless you inline-override:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://fasnpdhtvqtzjlvruqcu.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
  pnpm --filter @mms/qr dev
  ```
- **Supabase MCP** is scoped per `project_ref` — target `fasnpdhtvqtzjlvruqcu`. Run `get_advisors`
  (security + performance) after every migration.
- **Anonymous sign-ins ENABLED** on the live project (verified against the auth endpoint). Leaked-password
  protection is Pro-only — that advisor WARN is accepted/benign.
- **Regen types via the pinned local CLI** (CI's `types-fresh` diffs it byte-identical): `sudo dockerd &`,
  download `supabase` **2.107.0** from GitHub releases, `supabase start -x
edge-runtime,studio,imgproxy,logflare,vector,mailpit` (the pg-delta/edge-runtime TLS error at boot is
  benign — migrations still apply), then `pnpm db:types`. The committed `database.types.ts` is the raw
  `--local --schema public` output, prettier-ignored.

## The loop (how every phase ships here)

- Build to v7.2 + the research bar in the **FIRST commit** (money/auth/RLS/tokens/a11y/error-paths). Run the
  **Pre-PR self-review sweep** (CLAUDE.md), ending with a **fresh-context adversarial subagent** (the Agent
  tool) across a11y · perf · security/privacy · product-UX — fix its findings, then **post its verdict as a
  PR comment**. CI runs only zero-token green stub checks; the in-session subagent **is** the review.
- Gate: `pnpm turbo lint typecheck build`. One phase = one PR on `claude/<type>/<slug>`;
  `enable_pr_auto_merge` (squash) lands it on green.
- **After a migration merges, APPLY it to the live project + verify the object state** (LEARNINGS #59 — CI
  green ≠ applied to live). New tables → RLS default-deny + `revoke select from anon, authenticated`; new
  SECURITY DEFINER fns → `revoke … from public, anon, authenticated` + `grant to service_role` (LEARNINGS
  #25/#58), then verify `has_function_privilege` + `get_advisors`.

## Verify

- Gate: `pnpm turbo lint typecheck build`
- Advisors: `get_advisors` (security|performance) on `fasnpdhtvqtzjlvruqcu`
- Local app smoke (with the override env above): `curl "localhost:3000/menu?mode=dinein"`

## Open decisions / notes

- **ESLint pinned 9.x** — ESLint 10 breaks `eslint-config-next`'s react plugin; flip when upstream is ready.
- **Staging project** — add one when QR has live traffic; today one project is dev+prod-in-one (so Preview
  and Production share the QR project until then — `docs/ENV.md`).
- **Tax nuance** — cold salads filed under `sides` inherit `hot_prepared`; confirm per-item and override
  `menu_items.tax_category` where a cold item is exempt to-go (e.g. `lemon-salad`).
- **`loyalty_rewards.user_id` is `NOT NULL`** — anon diners can't earn gems until an account link (M4); don't
  wire gem awards into `mms_fulfill_order` before then.
- `docs/DATA_RECONCILIATION.md` is **historical** (the delivery-owned-menu era); the catalog is owned here.
- **P1.2 follow-up (small, still open):** a modifier-customization sheet — `AddButton` adds the base item;
  for items with modifier groups, open a Radix `Sheet` with `role="radiogroup"` per group respecting
  `min_select`/`max_select`, then `addItem(cartId, id, modifierOptionIds)` (line-merge already keys on the
  normalized modifier set).
