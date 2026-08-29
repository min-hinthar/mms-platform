# Changelog

All notable changes to **MMS Platform**. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this repo tracks milestones (see [`ROADMAP.md`](ROADMAP.md)), not semver releases yet.

## [Unreleased]

### The session's lessons, written into the harness (2026-08-29)

Docs-only distillation of the #240–#242 arc into durable rules. `.claude/LEARNINGS.md` gains **#60**
(the guard-falsification class: eleven of thirteen Codex findings were in guards written the same
session, every one a matcher satisfied by a name, substring, count, position, or constant — guards
parse, they never scan) and **#61** (#241 was squash-merged eleven seconds after `codex-review` went
red on its head; mark-ready and merge are never one motion, and a merge-conflict resolution is
verified as a set operation, never from a remembered list). `docs/WORKFLOW.md` gains the explicit
six-step **merge ritual** with the event-driven wait as its own step; CLAUDE.md's Pre-PR sweep gains
the guards-parse rule and extends never-transcribe-a-number to lists; the C16 row now carries the
#241 timestamps as measured proof the check must be required, not advisory; README/HANDOFF/counts
refreshed to post-#242 state (backlog re-measured at ~150 open rows — the "~190" was stale).

### Four guards written this session, four ways they measured nothing (2026-08-29)

Codex's second round on #242 landed the sharpest finding of the sweep, and it is the same shape as
the three before it: **a guard that verifies a constant rather than the thing it claims to guard.**

(Round 3 then closed two remaining false-CLEAN doors in the same two guards: the CSS extraction was
still first-textual-match, so a commented-out copy of the rule above a regressed live one would have
been measured, and a gradient growing a second `var()` would have silently re-pointed the
assertions — it now strips CSS comments, identifies the PAINTING rule structurally rather than by
position (the selector legitimately appears twice, the second being the reduced-motion override),
and refuses more than one custom property in the declaration. And `isDead` recognised only
`false &&` while its own comment claimed ternaries, so `{false ? <script/> : null}` and
`{0 && <script/>}` still read as live; it now covers literal-falsy `&&`, truthy `||` and both
ternary arms. Four dead-branch shapes and both CSS shapes falsified.)

`composite-contrast.test.ts` measured `--reward-shine` by name and never checked that anything
CONSUMES it. Swapping `.checkout-reward-applied::after` back to `var(--sheen)` left all 35
assertions green — **including the negative one asserting `--sheen` fails** — while restoring the
3.8745:1 defect in production. Reproduced before fixing. The band's token is now READ OUT of the
shipped rule, so the assertions follow the selector wherever it points and the extraction throws if
the rule stops carrying a `var()`. Falsified three ways: selector swapped back, token loosened to
0.11, whole rule deleted — all red.

The `fx-boot` extraction needed the same lesson a second time. Requiring exactly one textual
candidate proved uniqueness, and **uniqueness is not liveness**: a good copy in `{false && <script/>}`
or behind a comment, plus a live script that regressed by dropping the storage key, leaves the DEAD
copy as the sole candidate and every assertion passes against code that never ships. Text can say
"there is a string like this"; it cannot say "this renders". So this asks the compiler too, the same
instrument `check-promo-grant-pin.mjs` moved to for the same reason — matching a JSX `<script>` whose
`__html` names the key, skipping dead branches, and refusing ambiguity. Both of Codex's scenarios now
fail.

And a citation this repo's own rule should have caught: the M150 row cited `tokens.css:277` for
`--pa-parallax-mid: 13px` — a line number **invalidated by the very commit that wrote it**, since
adding `--reward-shine` above shifted it to 283 and 277 now names `--pa-grid-far`. Every reference
cites the token instead. "Never transcribe a number" has a sibling: never cite a line.

### The post-merge Codex findings, finally answered — and half of them were already fixed (2026-08-29)

The back-sweep filed six rows of Codex findings that had landed after a merge and never been
answered. Working them turned out to be as much re-verification as repair: **two sub-items were
already fixed by later work, and one does not reproduce against current source at all.** Acting on
the filed text without re-reading the code would have produced changes for problems that no longer
exist.

**M146 — `data-fx="off"` still moved the room, and the CSS alone would not have fixed it.** The `off`
block nulled `animation` on the two ambient planes and nothing else, so on a fine pointer
`AmbientMotion` kept writing `--pa-px`/`--pa-py` every frame and both full-viewport planes kept
translating — with `--fx-promote: auto` having just removed their layer promotion, so "off" was doing
_unpromoted_ compositing work. `.pa-pause` is `display: none` there and never renders on a fine
pointer anyway, so that diner had motion and no stop control (WCAG 2.2.2). The `off` rule now mirrors
the reduced-motion block exactly, **and** `AmbientMotion` reads the dial so the listener is never
attached — with a `MutationObserver` on `data-fx`, because `FxDial` writes the attribute at runtime
and reading it once at mount would strand a diner who turns effects off mid-session. Codex's tell was
the right one: the reduced-motion block three rules down already killed all four properties, which is
what makes the narrow shape an oversight rather than a decision.

**M147 — a `localStorage` throw took the device-tier fallback with it.** The boot script read storage
and derived the hardware tier inside one `try`, so a browser that throws on storage access — Safari
private mode, cookies blocked, a partitioned iframe — skipped the tier derivation too. The browser
most likely to throw is a locked-down mobile one: exactly the low-end device `lite` exists for, and
the one getting the full budget. Now two `try` blocks, and pinned by `apps/qr/lib/fx-boot.test.ts` —
8 assertions that read `layout.tsx` and **evaluate the shipped literal**, so a test cannot stay green
while the real script rots. Its first draft anchored the extraction on the post-fix prefix, which made
the regression _unfindable_ and reported "no tests" instead of a failure; a guard that disappears on
the thing it guards is worse than none, so it now anchors on the storage key.

**M150 — all four, and one of them I had closed wrongly.** `.pa-mid` was `inset: 0` while translating
13px (the value of `--pa-parallax-mid`), pulling its own edge into frame; it is now `inset: -16px`. The
`verify-mode-authority` chain inference and the M17 tax truth table were both already corrected, each
with a comment crediting the round that caught it.

The fourth is the one worth reading. I closed the reward-shimmer contrast finding as **"does not
reproduce"**, because it named `--print-head` and that token's only consumer in source is the
receipt's, measured at 4.6028 and documented. Codex's round on #242 named the actual element:
`.checkout-reward-applied::after` sweeps a `--sheen` band across the reward card while `RewardField`
renders `--t2` Burmese and reward-shortfall text on top of it. Measured in Night, not estimated:
`--t2` on the card's `color-mix(--gold 14%, --cd)` stop is **5.4243** bare and **3.8745** under the
band — and the 7% stop fails too, 6.3427 → **4.4930**. **I searched for the token the finding named
instead of looking at the element it named**, and closed a live AA failure on the strength of it. A
wrongly-closed finding is worse than an open one.

The fix is a bounded token of its own — `--reward-shine`, Night **0.05** (4.6609 on the worst stop;
the limit is 0.0610 and it backs off for headroom exactly as `--print-head` took 0.08 over its own
limit). Light keeps 0.55 unchanged, because white over an already-light ground only brightens it and
moves dark text the safe way (5.2563 → 5.5775). Five assertions in `composite-contrast.test.ts`,
including one that keeps the token bounded BELOW `--sheen` so the two cannot be collapsed back
together by someone who notices they look alike; red-first, restoring 0.11 fails both Night stops.
Reduced-motion sets `content: none` on that pseudo-element, so the band only ever existed on the
motion path — which is most people.

**M148 — two documentation claims corrected, two left open honestly.** `HANDOFF.md` said "all nine
RPCs the app calls"; there are **57** distinct `.rpc()` names, and the wording made a narrow
post-apply verification read as an exhaustive drift check. And both `HANDOFF.md` and this file still
carried "`--include-all` … would force a replay … genuinely destructive" — the second unverified
inference in a row about a command nobody here has run. That claim is **removed rather than replaced
with a third guess**; the conclusion never depended on the mechanism.

### The Codex wait is a required check now, and Rice is out of the promoted order (2026-08-29)

Two owner asks: _"wire the wait into the flow properly. don't have Rice as top seller."_

**The wait was a rule, and the rule kept failing the same way.** It was written down and followed
for months. Codex only fires when a PR LEAVES DRAFT, and the merge flow marks-ready-and-squashes in
one motion, so its review lands minutes after the merge on a closed PR nobody re-reads. On #191 that
buried 2×P1 + 2×P2. On #239 it buried three P2s by NINE minutes, all of which reached `main`. The
back-sweep above then found 76 findings across twelve PRs, sixteen never answered — including the
money P1 that sat open for two days. Every one of those arrived post-merge, which makes it a
sequencing problem, and a sequencing problem is what a required check fixes.

`.github/workflows/require-codex-review.yml` is red until Codex has reviewed the commit that is
actually about to merge. It re-reds on every push, because a review of the previous head says nothing
about the code that would land now — that being exactly the #239 case. Drafts are exempt, and the
reason is **not** that Codex cannot review one: it can, on an `@codex review` comment, and it did so
twice on this PR while it was still a draft. The exemption is about what a draft MEANS. It is
mid-iteration, pushes land minutes apart, and a check that reddens on each one — clearable only by
asking a metered reviewer to re-read unfinished code — would either burn Codex rounds on WIP or,
far more likely, teach everyone to ignore a permanently-red check. The gate arms at
`ready_for_review`, which is also when Codex fires by itself, so it is red across exactly the window
where the merge button is live and nowhere else.

The decision is a tested module (`scripts/codex-review-gate.mjs`, 9 assertions in
`apps/qr/lib/codex-review-gate.test.ts`) and not an inline expression, because a required check that
answers "yes" for the wrong reason is worse than no check — it converts an unread review into a
green tick, and this repo has shipped that class before. So the near-misses are what get asserted:
a review of the PREVIOUS head, a HUMAN writing the word "Codex", a Codex comment that names no
commit, a malformed head. Matching is on the sha, never on vocabulary. It accepts both shapes Codex
reports in — a submitted review pinned via `commit_id`, and the no-findings issue comment that names
its commit only in prose. **What it cannot do is prove anyone read the review**; it proves one exists
on the commit about to merge, which turns merging past it into a deliberate act rather than an
accident of timing. Two rounds and fix-or-justify remain a human discipline.

**Rice is no longer promoted** (OPEN-ITEMS M136, open since M135 as an explicit owner question).
`NOT_PROMOTED_SLUGS = ["rice"]` in `posPopular.ts`, filtered in `posPopularIds`, so Rice leaves both
the "Most ordered" badge set and the suggestion order; the promoted head is now `kyay-o` (1975),
ahead of `burmese-milk-tea` (1791) and `mohinga` (1068), and 75 of the 76 POS rows survive. Three
things it deliberately does not do. The **data file is untouched** — `pos-popularity.json` still
reads the till verbatim at `rice(2052)`, asserted by a test, because the moment the export carries a
product opinion nobody can tell a sales change from an edit. It is **not a Sides-and-Drinks rule**:
Coconut Rice is a Side and stays, Milk Tea and Faluda are Drinks and stay, since a diner orders those
on purpose and a category rule would be this app inventing a policy from one sentence. And the filter
is at **read time**, so the next export drops in without re-deciding anything. Four assertions --
including a first-promoted-slug COMPUTED from the list rather than transcribed, since a hardcoded
`"kyay-o"` goes green forever the day the till changes — and two mutations watched red.

### The Codex gate's own green tick was asserting something false (2026-08-29)

Spotted while verifying a `codex-review` success on a head pushed a minute earlier — the kind of
"that was too fast" reflex that is worth following. The check was behaving correctly: #241 is a
draft, and the gate stands down on drafts by design. **What it printed was a lie:**

> Codex has reviewed `b37e8c35e4` (via draft stand-down — Codex is not gated mid-iteration).

Nothing had been reviewed. The stand-down reason was being interpolated into a sentence that asserts
a review happened, because `report()` had only two outcomes — reviewed and waiting — and the draft
path borrowed the first one to get a green conclusion. A green tick that ASSERTS a review nobody
performed is precisely the failure this workflow exists to prevent, one level up from where it
prevents it.

Three outcomes now, and only one of them claims a review: **reviewed** (green, names how),
**stood-down** (green, and says in as many words that this is _not_ a statement the commit was
reviewed), **waiting** (red). The draft still reports success, because an unpublished required check
reads as pending and blocks a merge as hard as a red one — what changed is only what it claims.

### The CI fast lane grows teeth, and it caught #240's own drift (2026-08-29)

Three guards existed and none of them gated a merge. Wiring them took minutes; the interesting part
is what the first one found.

**`format:check` ran in ZERO workflows** (T6). `lint` is plain `eslint .` with no prettier plugin,
and the fast lane read docs, tokens and generated types — nothing read general source formatting. The
row filing this said "the tree is currently clean so it would land green." **That was already false.**
`apps/qr/app/api/stripe/webhook/route.ts` was sitting on `main` unformatted, merged hours earlier by
#240 — whose round-2 rework removed a symbol from an import and left it wrapped across four lines
that now fit on one. Every required check on that PR was green. The guard's justification was
demonstrated by the PR that filed it, which is why the drift is recorded here rather than quietly
swept.

**Two correctness guards were reachable only from a local `verify:slice`** (M149, Codex P2 on #233
and #227, both post-merge, neither answered). `check:migration-versions` catches a filename shape the
Supabase CLI SILENTLY SKIPS — the exact failure M17 already cost a CI cycle for — and
`check-promo-grant-pin.mjs` catches the promo pin being deleted or reordered on a route that has no
test file. A contributor who does not run the local gate could merge either. Both now run in `ci.yml`
as `pnpm check:migration-versions` and a new `pnpm check:promo-pin`, file-read-only and about a
second each. Red-first all three ways: the pin call replaced with `const pinErr = null` → RED; a
`.sqlx` extension → RED; a duplicate version prefix → RED.

One half of M149 was already stale and is corrected rather than repeated: `check-migration-versions.mjs`
no longer filters `.endsWith(".sql")` before checking shape — it reads every directory entry, with a
comment crediting the Codex round that fixed it.

**T5 was downgraded, and Codex showed the downgrade was wrong.** The argument was that W8's
orphan-suite guard already rejected a stray suite, so the "invisible forever" harm was gone. That held
only for the `.test` suffix: the guard enumerated `*.test.ts` / `*.test.tsx`, so a conventional
`packages/db/foo.spec.ts` was **neither rejected nor executed** — the original failure mode intact
under a different filename. Neither vitest config includes `.spec` at any path, so such a file runs
nowhere; `*.spec.ts` and `*.spec.tsx` now sit beside `*.test.tsx` in the non-running set, in `ci.yml`
and its mirror in `verify-slice.mjs`. Fixing the mirror surfaced a second defect of the same kind:
`find()` accepted ONE pattern, so the variadic call would have dropped two suffixes into the shell as
nothing — a guard quietly looking for less than it claims. It is variadic now.

**The promo-pin guard could be satisfied by a COMMENT, and it now had to be right** (Codex P1 on
#241). `check-promo-grant-pin.mjs` located the call with `indexOf('.rpc("mms_pin_promo_grant"')`, so
`// await db.rpc("mms_pin_promo_grant", …)` contained the searched substring exactly: comment the pin
out and the guard reported **clean** while no pin executed. Reproduced before fixing. That was
tolerable while it was one signal among several in a local gate; this PR makes it the route's only CI
coverage, which turns it into a green tick over a live money regression. The file's own comment
already said "a comment naming the RPC must not satisfy this guard" — the intent was written down and
never implemented. The first repair blanked comments and string bodies with a hand-rolled scanner. **Codex round 2
broke that too**, with a working exploit: a regex literal containing a quote opens fabricated string
state, and an apostrophe in a following comment closes it, exposing the rest of that comment as
"code" — so `if (/['"]/.test(cartId)) …` followed by `// don't await db.rpc("mms_pin_promo_grant", …)`
read as CLEAN again.

Both failures are the same mistake at different resolutions: approximating a JavaScript parser. The
second is the instructive one, because the scanner was _more_ careful than the `indexOf` and still
lost — regex-versus-division cannot be decided without the preceding token, which is the doorway to
the next exploit. So the guard now **asks the compiler**. `typescript` is already a dependency, the
parse costs milliseconds on one file, and comments are not AST nodes — which makes "is this
executable?" structural rather than textual and closes the class rather than the two instances found.

Writing it surfaced a third would-be false CLEAN, caught locally: `ts.forEachChild` is a SEARCH
primitive that stops at the first callback returning a truthy value, so a visitor written as
`(c) => walk(c, out)` aborts after the first child — the walk covers a sliver of the file and the
guard passes on almost anything. It is noted in the source, because the next person to write a TS
walker here will reach for exactly that shape.

Round 3 then found that the guard was still measuring the wrong property. Comparing source POSITIONS
proves lexical order, not **sequencing**, and two refactors satisfy the first while destroying the
guarantee: `await Promise.all([db.rpc("mms_pin_promo_grant", …), getCartTotals(…)])` puts the pin
first in the AST and runs both concurrently, so the amount can be derived from a promo value the pin
has not frozen; and a fire-and-forget `db.rpc(…)` above the derivation is earlier in the file with no
guarantee it completed, or succeeded. Both reproduce the hold-versus-pinned-grant divergence M70
exists to remove, and both read CLEAN. The guard now asks what the rule actually requires — the pin
is **awaited**, in a statement that **finishes before** the one deriving the amount begins. Different
statements is what rules out the `Promise.all` shape, because concurrency inside a single statement
is invisible to position.

Falsified seven ways — line-commented, block-commented, deleted, name-only-in-a-string, the
regex-quote exploit, fire-and-forget, a promise stored and never awaited, and the pin moved below
`getCartTotals` — all red, with the real call still clean. One correction to my own testing along the
way: the first `Promise.all` mutation paired the pin with `Promise.resolve()`, which genuinely does
await it — a mis-constructed test, not a hole. Pairing it with `getCartTotals`, which is the actual
hazard, goes red.

Docs swept holistically at the owner's request: README's workflow table was still describing **three**
workflows after #240 added a fourth, and the review section did not mention that the Codex wait is now
mechanical. CLAUDE.md gains a dated "Where things stand" block so a resuming session reads progress —
the moved promo pin, the unwired `codex-review` check, the grown fast lane — before it reads rules.

### Codex round 2 on #240 — the gate's own P1, and a regression it caught in my fix (2026-08-29)

The required check went red on purpose (see below), Codex reviewed the head, and the round returned
**4×P1 + 1×P2**. Four were fixed; every one was verified against source before acting, and two of
them were defects in work committed hours earlier in this same PR.

- **The gate could never have gone green from a comment** (P1, on the workflow this PR adds). A
  workflow's implicit check run attaches to the SHA the RUN is for, and only `pull_request` events
  give that the PR head. Measured on #240: four runs, **none from `issue_comment`** — that event
  runs from the default branch, where the file does not exist yet. So Codex's no-findings comment,
  which names its commit only in prose, could never clear a `pull_request` failure sitting on the
  head, and the gate would have wedged the PR permanently red — the exact "check nobody can satisfy"
  outcome the draft exemption exists to avoid. The verdict is now a check run the job **creates**
  against `pr.head.sha`, so the attachment is explicit rather than incidental, and the draft
  stand-down publishes success rather than staying silent (an unpublished required check reads as
  pending and blocks just as hard as a red one).
- **My own money fix had made an inline retry worse** (P1) — see the section below. Before it, a
  declined-then-retried card matched its pinned grant and settled correctly; the release turned that
  into a charge fulfillment could not re-derive. Moved to the next attempt.
- **A stale decline could wipe a successor's lock era** (P1) and **a reused automatic-capture intent
  carries a stale era** (P1) — both dissolved by the same move.
- **A duplicate `id:` key silently stole the next mutant's identity** (P2), leaving the W6c
  `settle_by` mutant with none. A full `verify:slice` run stayed green because it filters nothing
  and never reads `m.id`; `--only=lock` crashed on `undefined.includes`, and that mutant was
  untargetable. Green for the wrong reason, exactly the class this repo keeps re-learning: a count
  of 228 caught proves 228 mutations still fail their suites, and cannot prove they are still
  _addressable_. `verify:slice` now refuses to run on a missing or duplicate id, with both halves
  watched red.

### The Codex back-sweep — a money P1 that sat unanswered for two days (2026-08-29)

Asked to check every Codex review for fixes, so the twelve PRs before #239 were swept as well:
**76 findings, 12 PRs.** Most were fixed or justified at the time. Sixteen were never clearly
answered — almost all because the review landed AFTER the merge — and eight of those verify as still
live against `main` today. One of them is a money defect.

**The decline was the one exit that freed the cart and kept the promo grant** (Codex P1 on #233,
posted 2026-08-26, no reply). M70 pins `promo_granted_cents` at authorization so a promo that
expires — or a basket that changes — cannot move the amount already charged, and it releases that
pin on three exits: create-intent's abandon paths, "Edit order", and the pagehide beacon. A DECLINE
was the fourth, and released nothing: `payment_intent.payment_failed` freed the cart lock and the
settlement freeze, so the cart came back **editable with the pin still set**. The diner drops a $30
basket to $20, re-checks out, `mms_pin_promo_grant` no-ops because the pin is not null, and
`mms_promo_discount` hands back the old grant — a discount priced against a basket that never earned
it, charged for real. The migration's own §6 fixed exactly this shape for the Edit-order exit and
missed the decline.

**The fix is not where it looked like it should go, and Codex round 2 is why.** The obvious repair
was to release the pin in the decline webhook — that is the exit that leaves the editable cart. It
was written that way first and it was wrong, for three reasons that only surface on the paths a
happy-path read skips. An inline decline **does not end the attempt**: `PaymentSection.confirm()`
keeps the same Elements and clientSecret mounted and hands back a live Pay button, so the same
PaymentIntent is retried at its original, grant-inclusive amount — clearing the pin there turns a
retry that works today into a charge fulfillment can no longer re-derive (a charged guest, no
order). The `releaseCartLock` beside it is **cart-wide**, so a stale decline nulls the `locked_at`
that the era predicate reads, and on redelivery the `locked_at is null` branch clears a _successor's_
live pin. And an automatic-capture idempotency key carries **no era**, so a re-entered checkout gets
the first PaymentIntent back with the first era in its metadata while the cart is locked under a new
one.

So the release belongs to the attempt that **replaces** the pin, not the one that failed:
`create-intent` now releases the previous grant under the era it just acquired and re-derives from
the basket as it stands. It holds the lock it releases under, so there is no successor to wipe and
no metadata to trust, and an intent nobody re-minted keeps the pin its amount was built from. The
era metadata stays scoped to manual capture, whose idempotency key does carry the era — widening it
would have put a stale value on every replayed intent. The decision lives in `lib/lock.ts` as
`releasePromoGrantFor` rather than inline in the route, because `app/api/**` sits outside
`verify:slice`'s mutant set and a money rule written there cannot be guarded at all. Four
assertions, three mutations watched red, and a 228th `verify:slice` mutant.

Filed rather than fixed, all post-merge Codex findings that verify as live: **M146** (`data-fx="off"`
still parallaxes for desktop diners — the block suppresses `animation` but not `translate`, and the
checked-in comment claims the opposite), **M147** (a throwing `localStorage` read takes the
device-tier fallback down with it, so the weakest device loses `lite`), **M149** (the promo-pin and
migration-name guards run only in `verify:slice`, which no workflow invokes), **M148** and **M150**
(documentation claims Codex corrected, and three narrower live findings).

### Codex was right, nine minutes too late — three P2s from a post-merge review (2026-08-29)

`#239` was marked ready and squashed inside a minute, and Codex's review landed on `9155abf` at
**00:44:56 — nine minutes after the 00:35:50 merge**. That is the precise failure the repo's own
rule was written to prevent ("its findings landed minutes AFTER the merge, unread"), and all three
of its P2s were real. All three were against code written in the rendered-surface pass, so they
shipped to `main` before anyone read them.

**The photo slot collapsed to nothing on any dish without a photo.** Making the surprise cards flex
columns to bottom-anchor the "How about this?" chip, I added `align-items: flex-start` — which turns
off the stretch `.start-here-photo` depends on. `PhotoPlaceholder` is absolutely positioned and
contributes no intrinsic width, so on a photoless dish the slot shrank to **0×0**: measured on the
deployed preview, two of eight cards. With the slot gone the name rides up under the
absolutely-positioned price tag, so "Beef Jerky (Gril" sat struck through by its own "$19.00" over
an empty card. Only the chip wanted to hug its text, so only the chip says so now
(`align-self: flex-start`); the card keeps the default stretch.

**The dietary sheet's new count was wrong in two opposite ways, and Codex found both.** Round 1:
`matches={visible.length}` passed the intersection of query _and_ diets into a sentence reading
"Nothing on the menu fits these filters — ease one", so searching "mohinga" and lighting Vegetarian
denied that vegetarian dishes exist — a true number attached to the wrong CAUSE. The first fix
counted diets alone; round 2 caught that this misstates the OUTCOME instead, announcing "72 dishes
fit" when closing the sheet reveals an empty menu, because the list behind it still applies both
constraints. Neither count is wrong — the sentence was. It reports the number the diner will
actually land on now, and names every constraint that produced it: _"12 dishes match “mohinga” with
these filters."_ when a search is active, the plain filters-only wording when it is not. Same family
as the taste band's sold-out-blamed-on-filters line: the number was never the problem.

**The first category tab never lit on the opening scroll.** Rewriting the scroll-spy to "the last
section whose top crossed the reading line" made the observer a pure recompute — but an
IntersectionObserver only fires on threshold _crossings_, and a section's top passing the reading
line is not one. What schedules that pick is the PREVIOUS section leaving the band at the same
moment; the first category has no predecessor to leave. So on the opening scroll the callback ran,
found nothing crossed, and set nothing — no tab was current until the second category arrived. A
nearest-approaching fallback covers exactly that gap, and once anything has crossed the rule is
unchanged.

### The rendered-surface pass — the app in a real browser, judged on its pixels (2026-08-29)

The owner asked for a deep adversarial pass on UI/UX quality and production readiness, so this one
ran against the RENDERED app, not the diff: headless Chromium drove the live preview (head
`2b2aeb1`), captured 28 screenshots across mobile/desktop × light/Night × reduced-motion, and
measured what a script can measure — tap boxes, focus destinations, scroll landings, overflow,
console, network. Three blind auditors judged the evidence against `DESIGN-LANGUAGE.md` and the
rubric; survivors were adversarially refuted. 23 distinct findings; 5 survived refutation at high
confidence; 17 hand-triaged; 1 refuted by geometry.

**CRITICAL — the Dietary sheet was the horizontal scroller.** `.rail-shell`, the chip rail's
wrapper, sat as a grid item inside `.menu-diet-sheet` with no `min-width: 0`, so its min-content
width (the un-wrapped five-chip rail, ~700px) set the grid track wider than the 390px sheet. The
inner `.taste-rail` — the intended scroller — was stretched wide enough to never overflow, and the
overflow landed on `.mms-sheet` itself: reaching **Gluten-free panned the entire dialog sideways**,
scrolling away the title and grab handle, floating the ✕ mid-air at the left, and clipping the
allergen disclaimer to _"bout any allergy."_ — the sheet read broken precisely on the allergy path.
Three fixes, layered: `.rail-shell` is shrinkable (`min-width: 0`); the sheet can never scroll
sideways again (`overflow-x: clip` — the belt); and inside the sheet the chips now **wrap** — all
five dietary options visible at once, no sideways gesture between a diner and an allergy filter.

**The jump-nav undershoot (M139) was measured, then fixed.** Heading top 193 vs pinned toolbar
bottom 229 — 36px of every jumped-to section title under the toolbar, unconditional (the QR header
never retracts; the earlier hedge was wrong). `toolbarH` now adds the toolbar's _resolved_ sticky
offset (`getComputedStyle(el).top` — the whole `calc`, lend ribbon included), and that one binding
drives both `scrollMarginTop` and the scroll-spy inset. The spy also stopped flattering the
PREVIOUS tab while a full viewport of the next section was on screen: active is now the last
section whose top crossed the reading line, recomputed from section rects.

**The arrival screen contradicted itself on the menu's default state.** Bare `/menu` defaults to
`scango`; the eyebrow's ternary lacked that branch, so the masthead said **TO-GO** over the
greeting card's **SCAN & GO** — two door claims on one screen, shipped since M131. The door is
named ONCE now (`doorFor` in `ArrivalBeat`), and both surfaces read it.

Smaller confirmed findings, all fixed: the search pill's real hit target was a 24px-tall input
inside a 44px field (the wrapper is a `<label>` and the input stretches — every tap on the pill,
glyph included, lands the caret); toggling a diet inside the modal sheet announced nothing (the
page's status region is `aria-hidden` under Radix's dialog) — the sheet now states the consequence
of each toggle in its own `role="status"` line ("14 dishes fit." / "Nothing on the menu fits these
filters — ease one."), which also lets a sighted diner see the effect the covered list can't show;
the pinned free-from disclaimer is one line at phone widths ("Allergen info is a guide — tell our
staff." — same claim, shorter; the sheet keeps the full sentence); the empty state's button says
what it clears ("Clear search & filters" / "Clear search" / "Clear filters"); the stale-catalog
strip stopped claiming "a few minutes ago" (the snapshot's age is bounded by the outage, not any
clock — it says "a little earlier"); the surprise cards are flex columns so "How about this?" sits
on every card's bottom edge; and the narrowed search placeholder cuts with an ellipsis, not
mid-word.

**Verified working in production, for the record:** the surprise tap moves focus to "Shuffle
again"; the sheet restores focus to its opener; reduced-motion mounts no duplicate rail DOM and
hides the pause control; no horizontal document overflow anywhere; search keeps focus while
typing on an empty result; the search input was already 16px (no iOS zoom-lock). One finding was
**refuted by geometry**: the ambient pause coin does not occlude card titles — the "missing"
glyphs sit at negative x, clipped by the rail's own overflow, left of the coin.

Deferred to `docs/OPEN-ITEMS.md` as owner decisions: **M142** — four dishes' `image_url`s point at
DELETED storage objects (Rice — the top seller, leading "Start here" with a placeholder card —
Kayah Sausages, Tomato Salad, Grilled Aubergine Salad; re-upload or null the four URLs; Vercel's
image cache makes them show intermittently per size); **M143** — the last-good-catalog snapshot is
per-instance memory, weakest during rush-hour scale-out (KV/Edge-Config write-through is the
durable home); **M144** — whether Surprise should prefer photographed dishes; **M145** — the UA
search-cancel ✕ and the unproven mid-tier animation load.

### The blind adversarial pass on #239 — six defects, and three guards that could not fail (2026-08-28)

Three blind auditors read `.review-bundle/` and nothing else — product truth, a11y/interaction, and
algorithmic correctness + guard integrity — then one skeptic per finding was pointed at the source
and told to refute it. 27 filed, 6 survived refutation, and hand-triage of the rest found 5 more that
were real. Every finding was re-verified against source before it was acted on; three were refuted
outright and are recorded below so nobody re-files them.

**Two false statements a diner could read.** The Start-here sub-heading still said _"what tables
love"_ after M135 replaced its evidence with the owner's till export — the same commit that renamed
the badge off "Table favorite" for exactly that reason, since the export is every counter sale and
to-go bag too and `posPopular.ts` says so in as many words. It reads **"the most ordered here"**. And
the taste band's empty line blamed the diner's dietary filters for picks lost to a **sold-out** flag,
rendering that sentence verbatim with **zero filters lit** — the cause is genuinely unknowable from
there, so it now states the fact and the remedy and attributes nothing (W17's rule).

**The first tap destroyed the button that was tapped.** The invitation panel and the stood-down
"Shuffle again" line are different elements at the same position, so activating Surprise unmounted
the activated control and focus fell to `<body>` — the repo's own focus-on-remove rule, cited three
files away in `DietFilterButton`. Focus now moves to the shuffle button, which is described by an
sr-only line naming the outcome, so the tap announces what it produced without a second live region.
Two more in the same family: the menu's empty-state effect reached **out of the open dietary dialog**
to focus a button behind it (it now stands down while focus is inside a `role="dialog"`), and the
free-from disclaimer was a bare flex item of the new one-line search row, so `.menu-search` — the
`flex: 1; min-width: 0` item — collapsed to absorb it whenever an allergy filter was lit.

**The Clear-all label measured 1.8708:1.** It stays in the tab order on purpose (`aria-disabled`,
never native `disabled`, so clearing the last filter cannot destroy anyone's place), which means its
label is read by exactly the people that choice protects — and `opacity: .45` put it below even the
3:1 non-text floor. Nothing under opacity 0.94 clears AA in light, so the unavailable state rides the
border and the accessible name.

**`pos-popularity.json` skipped the price-agreement correction its own script applies one loop
earlier.** W21d added that filter because a $100 catering tray's units were being attributed to the
$10 dish; the new generated output summed every exact-name row instead, so `oil-rice-with-peas`
shipped at **26** while the doc's units cell — same join, same run — read **6**. One dish differs and
the badge top-12 is byte-identical either way, which is why this is filed as real but not critical.
The tie-break also moved off `localeCompare` (no locale argument resolves against the runtime's
default, so two machines could order a tie differently and `--check` would fail on a file nobody
touched).

**Three guards were green for the wrong reason, and all three now fail red-first.** The assertion
labelled `THE DISCRIMINATOR` did not discriminate: deleting ROUND 2 outright left it green, because
the buckets are rank-sorted internally and round 3's tie-break reaches for the same dish. It has its
own fixture now with an **unranked category first**, and the mutation reports
`expected 'Curries-2' to be 'Noodles-2'`. `"no ranking is a NO-OP"` compared `[]` against `undefined`
— and `undefined` resolves to that same `[]` default, so it proved that JS default parameters work;
it pins the computed draw instead, plus a ranked draw that must differ, and ignoring `popularIds`
now turns it red. And `"strictly descending by units"` asserted only non-increasing on data that
carries 7 tied values — the title said something the shipped file violates.

**Refuted, so nobody re-files them:** `PullToRefresh` is not live under the dietary sheet (`.ptr`
carries no z-index and the sheet paints over it); `menu_items.slug` exists in `database.types.ts` and
the select is uncast, so `tsc` validates it; and `check:docs` _does_ re-check the generated outputs —
it is `check-docs.mjs && gen-menu-reference.mjs --check`, and `package.json` was not in the bundle.

Deferred to `docs/OPEN-ITEMS.md` rather than widened into this PR: **M139** (the jump-nav offset
omits `--header-height` — pre-dates M133, needs a browser to settle, and the comment that asserted
otherwise has been corrected), **M140** (the full 76-dish sales order reaches the public RSC payload
— the owner's business data, and their call), **M141** (neither new component has a behavioural test;
every defect above was found by reading, not by a red one).

### One tap, not eight — the taste band rebuilt, the filters folded away (M137, 2026-08-28)

The owner: _"dietary filters take too much space. make surprise your taste buds the one and only
main feature for explore your burmese taste buds section so let's reimagine it."_

**Surprise is the section now, so it stopped being a chip.** W21 built the band as a craving picker:
eight pills (🍜 noodles, 🌶 heat, 🧁 sweet …) with the surprise chip beside them, and W22 briefly
parked the dietary pills here too — three pill vocabularies on one band, two of which asked the
diner to already know what they wanted. That is the opposite of what a first-timer's section is for.
The pills are **deleted**, along with `CRAVINGS`, `recommendByTaste`, their types and the saved-picks
`localStorage` read; the section is now one invitation panel on the shipped paper surface — glyph,
bilingual title, one honest line, one action — which after the tap stands down to a single
"✨ Here's what we picked / Shuffle again" line so up to eight dishes get the room.

The invitation copy makes **no claim on purpose**: "Not sure where to start? Tap once and we'll pick
a few." The draw prefers the most-ordered dishes, but it tops up from the rest when it must, so
"what people order most" would be true of the algorithm and not of every card. The cards say
"How about this?" and mean it.

**The dietary filters cost the sticky toolbar three rows and now cost one.** The toolbar was
carrying a search field, a category nav, a two-line caption and a five-pill rail — and it is
`position: sticky`, so that was its height at _every_ scroll position, not just at the top. Search
and a new 44px **Dietary** chip share one row; the pills live in a `Sheet` behind it. The chip keeps
the count visible when a filter is lit, and the count is in the accessible name too, so it is never
a colour-only signal.

⚠️ **The free-from disclaimer renders in BOTH places.** The standing rule is that an active
free-from filter is never on screen without its warning (Codex P1 on #194 caught the search state
dropping it) — and a sheet the diner has closed is not on screen, which is exactly when it matters.
It is in the sheet beside the pills, and in the toolbar whenever such a filter is lit.

**A guard nobody had to remember caught the new `Sheet` caller.** `sheet-busy-callers.test.ts`
discovers every `Sheet` on disk and asserts an allowlist, so adding the twelfth turned it red until
`DietFilterButton` was placed deliberately: its sheet toggles client-side filters and writes nothing,
so it belongs in the **unguarded** list — locking a filter picker mid-tap would be the "lock with no
reason" the `busy` prop's own doc forbids. Its "Clear all" is `aria-disabled` rather than
conditionally unmounted, for the WCAG 2.4.3 reason §16 states about the sheet's own ✕: clearing the
last filter is precisely when that button has focus.

### The till, not our own history — POS units replace the ranking, and the seals come off (M135, 2026-08-27)

The owner: _"you can refer to the actual paypal pos data insights for the menu items for most
ordered items, instead of ranking them or numbering. also explore your burmese taste buds
suggestions (including surprise your taste buds) should offer at most 8 menu items and displayed as
one row. taste-diet-cap should be moved back inside menu-toolbar."_

**The popularity source is the owner's own PayPal/Zettle export, which was already in the repo.**
`docs/data/pos_2026_prices.json` (Jan–Jul 2026) has been sitting beside `MENU_REFERENCE.md` since
W17, carrying a units-sold column nothing read. `scripts/gen-menu-reference.mjs` already joins it to
our catalog on the **Burmese** dish name, so the same join now emits a second generated file —
`apps/qr/lib/menu/pos-popularity.json`, 76 of our 97 dishes ordered by real units — and
`pnpm check:docs` fails if either output drifts from its inputs.

|                        | the retired `mostLoved`             | the POS export                      |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| source                 | this app's own paid orders, 60 days | the restaurant's till, Jan–Jul 2026 |
| evidence               | 77 line rows                        | 149 POS rows                        |
| dishes it can separate | 17                                  | 76                                  |
| cost per menu render   | a service-role aggregate            | none — a static import              |

**EXACT Burmese matches only, and that is load-bearing.** The generator's own long-standing rule for
prices — approx matches are "kept for discovery, never used to conclude anything" — applies harder
to a units count, because this one ORDERS THE MENU. Loosening it was run as a mutation and the new
double-claim assert named the damage: Coconut Rice's units would have gone to Coconut Chicken &
Rice, and White Peas' to Oil Rice with Peas.

**The rank seals are gone, not restyled** — `.start-here-rank`, `soleRanks`, `competitionRanks`,
`--bloom-gold-seal`, all deleted. The numeral was the only thing on the band making an ordinal
claim, and M133 had already found it unreadable on the old data (five cards wearing "8"). Row A is
now a SET of most-ordered dishes in sales order. The seal's bloom was **not** moved onto the price
tag: it existed for one coin, and a rail renders ten tags — ten gold halos is the overspend the glow
economy forbids.

**The badge is renamed, because the new data cannot support the old words.** "Table favorite"
claimed something about diners at this app's tables; POS units know nothing about tables or about
this app. It reads **"Most ordered"**, which is exactly what the number counts.

**Every taste row is one row of at most 8.** The two-row `start-here-rail-wall` grid is deleted —
the taste band was its only caller, at 8 cards it made the rail twice as tall as the pills above it,
and an odd count left a hole in the last column. The per-card cascade survives on the single row.

**The dietary caption and pills moved back into the sticky toolbar, unconditionally.** W22 had put
them in the taste band and left the toolbar mirroring them only during a search or with a filter
already lit — so the one control that narrows the whole menu was reachable only from a band the
diner scrolls past. Cravings recommend, diets filter; a filter belongs on the surface that persists.

⚠️ **Worth the owner's eye: the honest reading of units puts sides first.** Plain Rice (2052) and
Burmese Milk Tea (1791) outrank Mohinga (1068), because they ride along with other orders. That is
deliberately NOT filtered — a "real dish" rule would be this app deciding what the owner's sales
mean. The category round-robin already keeps one dish per category, so a side cannot take over a
row, but the "Most ordered" badge will sit on Rice.

### The suggestions are SELECTED from the top 50 now, and the rank seals stop repeating (M133, 2026-08-27)

The owner, on the M131 preview: _"menu items for a little of everything and explore your burmese
taste buds (surprise your taste buds, something sweet, etc.,) menu item suggestions should mostly
selected from the top 50 of popular, customer most ordered menu items. Menu-toolbar should be
positioned after taste-h before All-day breakfast so customers can view the start-here and taste-h
contents first. all explore your burmese taste buds suggestions (including surprise your taste
buds) should offer at least 4 and at most 7 menu items. and what is wrong with the numberings
duplicates on the cards of Start here?"_

**The numbering duplicates were two separate defects, and both were real.** Measured against the
live database rather than guessed at:

1. **Tied ranks, correctly shared and completely unreadable.** Over the 60-day paid window the menu
   has 77 order lines and 17 dishes clearing the ≥2-distinct-orders floor, so the top twelve rank
   **1, 2, 2, 4, 5, 5, 5, 8, 8, 8, 8, 8** — five cards wearing an identical "8". Competition ranking
   is right and stays (tied dishes must share a numeral; the counts establish no order between
   them), but a numeral repeated five times has stopped working as a rank for the person reading
   it. `soleRanks` now withholds every SHARED numeral: a seal renders only where the rank is
   unique, and a tied dish keeps its place in the row while making no ordinal claim. Ties break on
   their own as order history accumulates. Deliberately not "fixed" by breaking ties on price or
   name — that manufactures an order the data doesn't contain and prints it as a fact.
2. **The marquee printed its loop copy even when it could not loop.** `MarqueeRail` renders a
   duplicate card set for the seamless drift, and the drift effect bails when one set doesn't
   overflow the rail — but the copies stayed in the DOM. A short row on a wide viewport therefore
   showed the whole sequence, seals and all, twice and perfectly still. The rail now measures the
   real set on its own (with a `ResizeObserver`, so a rotation re-evaluates) and renders the copies
   only when a loop is genuinely possible.

**Row B and the taste rows now SELECT from the ranking, not merely order by it.** M131's change was
too small: sorting each category bucket meant a category holding a ranked dish and one holding none
contributed equally, so the row could be mostly unranked while claiming to prefer what tables
order. Row B runs two phases over the same balance — phase 1 serves only top-50 dishes, phase 2
fills the rest — and each turn goes to the LEAST-served category, so no category takes a second
dish while another has none. Phase 2 is what keeps "a little of everything" true: with 17 eligible
dishes today and row A taking ten, filtering to the top 50 would quietly collapse the row to three
or four categories while the caption still promised coverage.

**Every taste row is 4–7 cards.** Surprise was 3, cravings capped at 8. The MAX is a hard slice; the
MIN is reached only in the honest direction — matches keep the craving line they earned, and
top-up cards say "Something else to try", never a craving they didn't match. The surprise row is
deliberately NOT topped up: its emptiness is information ("your favorites already cover everything
that fits"), and padding it would replace an honest answer with a filler one.

**The sticky toolbar moved below the taste band** so the start-here and taste content read first.
It is `position: sticky`, so this changes only where it starts — it still pins under the header on
scroll, and every section's `scrollMarginTop` is measured from its height rather than its position.

**Codex round 2 found two more, and both were right.** (1) The ranked round ran unbounded, and
"least-served" only balances buckets that HAVE an eligible dish — a bucket with nothing ranked is
skipped rather than waited for, so ten ranked dishes in one category would take the whole ten-card
cap and leave "a little of everything" showing exactly one. Coverage is bought FIRST now: round 1
is one dish per category (its best-ranked, since the buckets are rank-sorted), round 2 spends the
remaining slots on the ranking, round 3 fills anything left. (2) The surprise row could fall below
its own advertised floor — draw seven, switch a dietary filter on, three survive, and the row
rendered three cards because only the ZERO case was treated as empty. `refillSurprise` tops a
PARTIAL row back up (deterministically, ranked-first, hearted dishes still excluded) while an
EMPTY one is still never padded, because its emptiness is the honest answer.

Two more defects found by the tests during the build, both in code written this session: phase 2
restarted its own lap counter and bailed on the first pass (row B silently vanished under its
3-card floor), and before that the ranked category was served twice before an untouched category
appeared at all. A `TASTE_ROW_MAX` mutant also SURVIVED — the cap test asserted through the
constant, which is a tautology; the bounds are pinned as literals now.

### The first screen, reorganized — the door, the headings and the card wall (M131, 2026-08-27)

The owner: _"arrival-beat contents, start-here-h contents, taste-h contents, for both dine-in and
to-go modes have to be organized, enhanced, enriched, positioned, organized, styled, reimagined.
surprise your tastebuds should be first option … a little bit of everything, and explore your
burmese taste bud menu item suggestions should mostly be selected from the top 50 of popular,
customer most ordered items. and the card ul display … should be more creative, styled, rendered."_

**The suggestions now draw from the top 50 — and the badge deliberately does not.** `getMostLoved`
returned twelve rows, and that one list was doing two incompatible jobs: it seeded the Start-here
rank seals AND it was the set behind every **"Table favorite"** badge on the menu. Widening it to
fifty would have widened the badge with it, so a claim a diner READS would have quietly gone from
"one of the twelve most ordered" to "one of the fifty" without a word of copy changing. It is now
two named bounds — `LOVED_BADGE_MAX` (12, what anyone reads as a claim) and `LOVED_POOL_MAX` (50,
what gets offered first and never becomes copy). Three consumers take the wider pool as a
**preference, never a filter**: the taste rail's craving matches break ties toward it (the match
count still wins, or the card's "why" line would be reading out a weaker reason than the one that
earned the card its place), "Surprise your taste buds" draws from a ranked tier first and tops up
from the rest, and _a little of everything_ orders each category's bucket by it. That last one is
sorted rather than filtered on purpose: filtering to the top 50 would silently drop any category
with nothing in it, and the row would stop being a little of everything while still saying it was.
An empty ranking is a no-op everywhere — a thin history degrades to the row that shipped before.

**"Surprise your taste buds" leads the rail.** Every other chip asks the diner to already know what
they want; this one asks nothing, which makes it the right opening move for the first-timer the
band exists for. It is an ACTION, not a toggle — no `aria-pressed`, the dashed affordance, and its
own description — so being first among filters cannot make it read as one.

**The arrival beat says which door you came through.** Dine-in and to-go were typographically
identical; only the wording differed. There is a mode eyebrow now (At the table · To go · Scan &
go), the live table number rides it as a gold chip rather than trailing the greeting, the greeting
takes the display face, and the exit — previously a run-on sentence at the greeting's weight, and
longer than it — is two door tiles below a hairline, each with its promise on its own line.

**The section headings finally sit between the page title and the cards.** They were 15px body face
— the same size as the card names beneath them — so a heading read as a label. Display face at
19px, the sub on its own line, and a hairline closing the header.

**The card wall.** 4:3 photos instead of a 1.45:1 letterbox (the old crop took the top and bottom
off a plated dish, which is most of what makes food look like food), a price tag floating on the
photo's corner opposite the rank coin, the taste card's honesty line promoted from grey caption to
an earned chip, 166px cells, and a per-card cascade in.

**Two contrast defects found while measuring, one of them shipped.** `.start-here-rank-top` — the
**#1** seal, the most prominent numeral on the band — has worn `color: var(--oa)` since W20. `--oa`
is on-ACCENT ink, sized for the dark amber `--ac`; on that gold gradient it measures **2.0458:1**
in the light theme. It is `--ink` now (worst 5.4353 light / 9.6157 Night). The second was caught
before it shipped: the new exit tile's promise line was `--t3` over a 7% accent tint, **4.3708:1**.
Both classes were invisible to `contrast-audit.test.ts` for the same structural reason — it asserts
token PAIRS, and neither a gradient nor a `color-mix` is a token — so `composite-contrast.test.ts`
now pins the fill across every share it paints, plus both tinted grounds, with the negative guards
that record WHY each ink was chosen.

### Night, deepened — the room, the glass and the moments, behind one dial (2026-08-27)

The owner asked twice. First _"Make Night more enriched, enhanced, layered, shades, effects"_, which
landed as the six-rung ladder, the bevel, the well and the press. Then _"go for more ultra deepen,
enhance, layered, shades, effects, with no GPU restrictions"_ — this entry.

**The mobile GPU budget is lifted, and it is now a dial rather than a breakpoint.** That budget was
written after a production iOS WebKit tab OOM-crashed on stacked `backdrop-filter` + large `blur()`,
so nothing here is free and none of it pretends to be. Every expensive declaration in the app reads
`--fx-glass-*` / `--fx-plane-blur` / `--fx-promote` from `tokens.css` instead of a raw filter, so
`document.documentElement.dataset.fx = "lite" | "off"` scales the whole heavy layer back with no
redesign, no colour change and no layout change. `lite` drops the two full-viewport FILTER
surfaces — the defocus scrim's backdrop (~20.6 MB, 80% of the glass budget on its own, because a
backdrop buffer scales with a pane's AREA and not with its blur radius) and the far plane's own
`blur(64px)` — and un-promotes both ambient planes. `off` leaves no
`backdrop-filter` and no plane blur anywhere, and the static composition survives whole. The dial
re-points whole function lists rather than scaling radii to `0px`, because `blur(0px)` still
allocates a buffer and `none` does not. `prefers-reduced-transparency: reduce` takes the glass off at
the dial's own specificity, so an explicitly-set `data-fx` cannot override the OS preference.

**The room.** The page ambient is three sibling planes: a far wall genuinely out of focus (ladder-rung
blobs plus a defocused copy of the grid at 3× gauge — the same texture at two focal depths is what
the eye reads as space), a lit middle distance in focus, and unmasked film grain on the lens. Two
shipped defects die on the way. The mask sat on a `position: fixed` element, so it faded in VIEWPORT
coordinates at every scroll position — solid to ~28%vh, zero from ~68%vh — meaning the bottom third
of every screen has never had ambient. And the grain was a child inside that mask, so it died with
it. **M128 closes as a side effect:** the page grid is a groove now, not a ridge. A light hairline on
a dark ground lightens the pixel under light text; a dark groove darkens it, so the grid buys
contrast instead of spending it. Worst ambient pixel, shipped → now: **Night 4.4743 → 4.8443, light
3.9670 → 4.6428** — both shipped values are live AA failures, and the light one was failing harder
than Night, which M128 never noticed because it only ever looked at Night.

**The glass.** Sticky chrome is frosted at every viewport in Night and opaque in light, and that
asymmetry is a measurement rather than a preference: light-on-dark glass can only be LIGHTENED and
the brightest possible backdrop is white, which bounds the failure, while dark-on-light glass is
DARKENED by most photography and dark text falls with it. It also retires a live defect — the md:+
light frost this replaces put `.app-header-cart` (`--t2`, 13px) at **3.8320:1** over a dark backdrop
and `.app-header-rewards` (`--ac`) at **3.2238:1**; opaque restores 5.5546 / 4.6729, and tuning the
alpha cannot save it (even 0.94 lands `--t3` at 4.172). The scrim stops dimming the page and
DEFOCUSES it, so a diner keeps the spatial memory of where they came from while nothing on it stays
legible. `.mms-sheet` finally leaves `--pg`: against the new scrim it separated by 1.0385:1, and on
`--cd` it reads 1.3216.

**The moments.** Five one-shots on `filter: drop-shadow()`, which follows an object's real silhouette
and interpolates where a box-shadow list cannot — so the lit gold cap IGNITES at the instant of
choice instead of cross-fading a static halo. A lacquer rake crosses the sheet head once as it
settles; the send beat drags accent light behind it; pay success blooms and the confetti gains a
per-particle depth of field; the print head becomes a defocused line of light. None loop, none fire
on scroll, none run unattended.

**Three composited bounds are now guarded, red-first.** `contrast-audit.test.ts` reads a hex per
surface, so it is structurally blind to a translucent pane, a stack of ambient layers, and a light
band washing across text — all three of which this work introduced, and each of which is a
"green for the wrong reason" shape where a wrong-but-plausible alpha passes every gate in the repo.
`composite-contrast.test.ts` computes the composite and asserts the floor; five mutations were each
watched go red and restored md5-identical. Writing it moved a shipped value: the guard does not round
to 8 bits and so reads up to ~0.03 tighter than a hand calculation, which put light's
`--pa-grain-op` at 0.05 on 4.5776 — passing, but with less margin than the two methods' own
disagreement. It is 0.04 now (4.6428), and the token comments quote the guard rather than the hand
calculation.

**At most one full-viewport backdrop-filter, and that is now mechanical.** The first draft of the
glass layer gave the defocus to `.mms-scrim`, `.tier-up` and `.merge-beat` together. Two of those
can be alive at once — `MergeRedeemer` and `RewardsHub` → `TierUpCelebration` are both rendered by
`/account`, and MergeRedeemer's own comment says it refreshes the hub so the merged Stars appear,
which is exactly the path that awards a tier. A backdrop buffer scales with a pane's AREA and not
with its blur radius, so two viewport-sized panes is ~41 MB on a phone — the shape that OOM-crashed
an iOS WebKit tab in this product. The defocus belongs to `.mms-scrim` alone now; the celebrations
keep the plain deep veil they already had, which is also the right call on its own terms, since the
page behind a celebration card is not something the diner is holding on to.
`apps/qr/lib/fullscreen-blur-contract.test.ts` fails if a second viewport-sized selector ever takes
one, and also fails a filter that hard-codes its own value instead of reading the dial — because a
rule that bypasses `--fx-*` silently opts out of the escape hatch. Three mutations, each watched go
red. It checks the STYLESHEET and not the DOM, and says so: no two sheets in this app are openable
at once today, but that is a fact about the components, not something the guard proves.

**The blind adversarial pass returned REJECT, and it was right on the load-bearing ones.** Recorded
here rather than only in the PR, because three of them were defects this entry had already claimed
were fixes.

- **Light's header moved off `--pg` onto `--sf`, putting `.app-header-rewards` (bare `--ac`) at
  4.2843:1.** One `--glass-chrome` token served both themes, and Night tints its chrome with `--sf`
  on purpose so it sits below cards. Light cannot follow it there: the main audit already carries
  `plain ac on sf` as a NEGATIVE guard asserted under 4.5, whose whole job is to force call sites
  onto `--ac-strong`. So the header was painted on a surface this repo had already ruled out for
  the text it carries — and the "opaque restores 5.5546 / 4.6729" figures in the code comment were
  measured against `--pg`, the surface the code no longer painted. `--glass-chrome-opaque` is now
  the one name for "the opaque chrome of this theme" (light `--pg`, Night `--sf`) and every
  filter-off path reads it, so a fallback cannot drift from the pane it replaces.
- **The light ambient failed AA in both motion states — and the new guard reported it passing.**
  `lightWorst()` excluded the far-plane blobs and the warm pool "because both lighten, which helps
  dark text". That is false: every light ambient source is darker than light `--pg` (`--sf` Y
  0.86380, `--warnb` 0.83472, `--gold` 0.45487, `--jade` 0.12344, `--ruby` 0.12598 against
  0.94668). The model therefore omitted exactly the layers that darken, reported 4.6056, and the
  real worst pixel was **4.4738 with motion and 4.3585 under reduced motion**. Light's
  `--pa-far-op` and all four `--pa-blob-*` were asserted by nothing whatsoever. The model now
  stacks what actually darkens and computes BOTH motion states, and light's weights were refitted
  against it (`--pa-far-op` 0.34 → 0.24, `--pa-mid-op` 0.55 → 0.42 with Night pinned at 0.55,
  `--pa-grain-op` 0.04 → 0.03, groove 28% → 16%, still-groove 42% → 24%): worst case now 4.6744.
  Worth stating plainly — reverting any ONE of those five leaves the suite green; only the original
  combination breaches, which is what a multi-factor bound looks like and why the red-first
  mutation had to restore all five at once.
- **`--pa-groove-still` deepens the grid under reduced motion, and its comment called that "the
  safer composition".** True in Night, where a darker groove darkens the ground under LIGHT text.
  Light is dark-on-light, so the same move spends contrast instead of buying it, and reduced motion
  is the tighter of light's two states, not the looser one.
- **The pause control's name inverted against its own `aria-pressed`.** Once paused it announced
  "Play the background motion, pressed" — a pressed "Play" states that motion is playing. On the
  one control WCAG 2.2.2 requires to be comprehensible. It carries a changing name and no
  `aria-pressed` now.
- **`lite` did not drop the largest filter surface it claimed to.** It re-pointed only the scrim's
  backdrop, leaving the far plane's `blur(64px)` — over an overscanned box, the biggest filtered
  surface in the app — running, while the docs said "~35 MB". It drops `--fx-plane-blur` too now,
  and the prose names both planes rather than "the mid plane" (one token un-promotes both).
- **The dial had no writer anywhere in the repo.** An escape hatch that justifies lifting a budget
  written after a production OOM, reachable only from a devtools console, is a claim and not a
  mechanism. `FxDial` writes it: `localStorage["mms.fx"]` as a per-device manual override, else
  `lite` on a low tier (the gate `TierUpCelebration` and `PaySuccess` already use), else absent —
  full strength, which is the instruction. Its docblock says the part that is easy to leave out:
  core count is a poor proxy for a per-tab memory ceiling, a recent iPhone reports 6–8 cores with a
  tight WebKit budget, and the manual lever is therefore the real one.
- Smaller, all verified in the built CSS: a `(0,3,0)` hover rule reinstated `--sh-lift` underneath
  an active bloom on the tip chip (the pill had its counterpart, the chip did not); the six new
  `filter:` effects had no `forced-colors` escape, which the UA does not force away; two comments
  pointed at `ambient-contrast.test.ts`, a file that does not exist; a comment described the
  `--pa-grain-op` value the same PR had already changed; the header carried a "NO backdrop-filter —
  mobile GPU budget" note three thousand lines above the rule that frosts it; and the bevel's
  1.4089 / 1.6025 did not reproduce (1.3971 / 1.6758 — a design figure, unguarded, now said to be).

**Not shipped, and said out loud rather than quietly dropped.** The dish-card photo bleed is deferred
(M129): it needs `--card-photo` wired at three call sites, and a raw `url()` in CSS bypasses
`next/image`, so every rail card would fetch a second unoptimized copy of its photo to paint a hover
tint. The scroll-driven specular sweep on the chrome is rejected outright: whether repainting a
backdrop-filtered element forces its backdrop to be re-blurred could not be measured in this
environment, and it would ride the app's hottest surface. The design also called for `overflow:
hidden` on the sheet head; that would clip `.mms-sheet-close`'s focus ring (`top: 6px` against a
4.5px ring leaves ~1.5px of margin), so the rake is painted as a background layer instead — which
also means it cannot tint the title.

### Night stays Night — the aubergine re-hue is reverted (2026-08-27)

The owner looked at the shipped aubergine ground and rejected it: _"I actually prefer the Night than
the Aubergine."_ All nine ground values #235 rotated are restored, along with the three mirrors that
cannot read a custom property (`viewport.themeColor`, the service worker's offline shell, the Stripe
Appearance fallback).

The revert was **checked, not asserted**: both `.dark` blocks were parsed and compared token by token,
and 38 of the 39 dark tokens come back byte-identical to `fbeb809^`, with `--jade-strong` the one
deliberate exception. The comparison was falsified against a mutated `--pg` first, so a green result
meant the check could actually see a difference — the repo has shipped guards that were green for the
wrong reason before.

⚠️ **That was a one-off shell check, not a committed guard, and this line should not be read as
claiming one.** Nothing in the repo pins `--oa`, either `--grad` stop, or `--surface-elevated` to any
reference: `check-theme-parity`'s surface 7 asserts only `--surface-glass = --cd` and
`--surface-vellum = --sf`, and the contrast audit only asserts `≥ 4.5`, which a wrong-but-legible value
satisfies. So **4 of the 9 values this revert moved are held by review alone.**
`docs/W22D_HUE_DECISION.md` §9 already recorded that gap; it is repeated here because a CHANGELOG line
claiming verification is exactly where a reader stops looking. Filed as **M127**.

Because the rotation had held OKLab L fixed, undoing it costs nothing in contrast. Relative luminance
returns to pg 0.00725 · sf 0.01243 · cd 0.01697 · oa 0.00825 · elevated 0.02334, and the depth ladder
keeps its spacing: Y ratios pg→sf 1.716× · sf→cd 1.365× · cd→elevated 1.375×.

**`--jade-strong` stays lifted**, and the reason outlives the rotation that exposed it. On the
restored Night `--cd` the alias would score **4.5237** quantized and **4.5112** float — clearing by
0.0112 at worst, a margin _smaller than the 0.0124 the two measurement methods disagree by on this
same combo_. A ratio sitting inside its own measurement noise is undecided, not passing. `#62b380`
scores 4.6827 / 4.6698, clear on both methods, so the choice stops depending on which method is
right (that question stays filed as M122, now re-measured against Night).

Also kept from #235, because neither depended on the hue: `check-theme-parity`'s **surface 7** (the
translucent surfaces pinned to the opaque tokens whose channels they hand-copy) and the contrast
audit's added dark combo. Coverage has no hue.

Gate, run and watched to completion rather than assumed: **`pnpm verify:slice` green** — 227 mutants
caught, no orphans, exit 0 · **`pnpm turbo lint typecheck build test`** 8/8, with `test` force-run
rather than taken from cache (92 files, 1044 tests) · **`pnpm check:docs`** clean · **contrast audit**
71 pass · **`check-theme-parity`** exit 0, confirming dark `--surface-glass` = `--cd` rgb(39, 31, 56)
and `--surface-vellum` = `--sf` rgb(32, 26, 46) on the restored values.

⚠️ The first version of this line claimed only `turbo lint typecheck build` · audit · parity, and the
blind audit caught that it silently dropped the two gates `CLAUDE.md` makes blocking (`verify:slice`,
`check:docs`) **and** the `test` task. A gate line that omits gates is worse than no gate line, since
it reads as a complete account.

### A finding I filed at HIGH, and then measured out of existence (2026-08-27)

**M128 claimed shipped Night had a live sub-AA pixel from the page grain, and that the composited
ground out-glowed the cards sitting on it. Both claims are withdrawn.** The row is rewritten from
measurement and downgraded to **low**.

Codex round 2 refused it on method rather than on conclusion, and was right. The number rested on a
grain pixel assumed to be alpha 1 **and** rgb 255 simultaneously — a claim about how `feTurbulence`
distributes RGBA that had never been measured. I had reported it as "reproducing exactly on both
models"; both models shared that assumption, so the agreement was worth nothing.

Three independent measurements settled it: the SVG 1.1 §15.7.15 reference algorithm transcribed and
self-validated against the spec's own test vector (the 10,000th number from seed 1 must be
1043618065 — it is), plus two headless-Chromium renders of the real CSS, one decoding the PNGs with a
hand-written zlib inflater. They agree on mean RGB to **0.05/255**, which is the load-bearing
cross-check: it proves the from-spec model reproduces Skia rather than merely agreeing with itself.

| claim                                       | filed                      | measured                                                    |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| worst grain pixel                           | `#39333c` → 4.2610         | **no pixel produces it**                                    |
| max grain alpha                             | assumed 1.0                | **0.894** — alpha 255 occurs zero times                     |
| whitest channel                             | assumed 255                | **242** — white never occurs                                |
| pixels with alpha > 0.85 AND all rgb > 0.85 | assumed to exist           | **zero**                                                    |
| ground vs card                              | ground ≥ `--cd` (inverted) | **`--cd` is 1.762× its page**, 1.079× in the brightest tile |
| the culprit                                 | the grain                  | **`--tex-line` grid crossings**, 100% of them               |

A sub-AA region does exist — 170 of 1,260,000 viewport px, worst `#3c373d` → 4.0410 — but every
instance is a 1px grid hairline inside the top gold lobe, and **neither layer breaches alone** (bare
crossing 4.5897, grain-only max 5.0101). No text-sized region is near the floor: the worst 44×44
patch means 5.4667. **So the row's own prescription was inert** — dimming `--tex-grain-opacity`, which
is what it told you to do, would have moved nothing.

What is still unverified is what decides whether even **low** is warranted: nobody has measured a real
page with real text over those pixels, and the app header covers y=0 where the effect is strongest.
Two of the three renders also share Chromium — WebKit and Gecko are unmeasured, and iOS Safari is a
primary target here.

**Next, and the actual ask:** Night is not just being put back, it is being deepened — _"make Night
more enriched, enhanced, layered, shades, effects."_ Four independent directions (depth · light ·
material · atmosphere) are being designed against measured ground truth and will be shown as a
rendered prototype board for the owner to pick from before any token moves.

### Production: M22 · M70 · M72a applied — a live money-path outage closed (2026-08-27)

**Not a routine migration push.** Production was running app code that called five database objects
that did not exist, and had been since #233 merged.

The app half of a migration auto-deploys to production on merge to `main`; the SQL half is a manual
apply. Three migrations merged, three auto-deployed, none applied. PostgREST resolves `.rpc()` by
argument NAME and rejects an entire query naming an unknown column, so the live production
deployment (`fbeb809`, READY) was failing on:

| call site                                  | needed                                          | production had              |
| ------------------------------------------ | ----------------------------------------------- | --------------------------- |
| `webhook/route.ts:322`                     | `mms_fulfill_order(…, p_promo_cents)`           | 10 args, no `p_promo_cents` |
| `staff-cart.ts:294`                        | `mms_fulfill_cash_order(…, p_promo_cents)`      | 7 args, no `p_promo_cents`  |
| `create-intent/route.ts:283`               | `mms_pin_promo_grant`                           | did not exist               |
| `create-intent/route.ts:301,421`           | `mms_release_promo_grant(p_cart_id, p_attempt)` | did not exist               |
| `release-lock/route.ts:57` · `cart.ts:746` | `mms_release_promo_grant_for_holder`            | did not exist               |
| `cart.ts:412`                              | `qr_carts.promo_granted_cents`                  | column did not exist        |

Checkout, promo-apply, card fulfillment and cash settle were all failing. The webhook correctly
returned 5xx rather than swallowing it, so Stripe held the retry — meaning a card could be captured
with no order written. It went unnoticed only because the app is pre-launch: 14 paid orders total,
the last on 2026-08-17.

⚠️ **Prod's migration history is divergent from this repo**: `supabase_migrations.schema_migrations`
holds MCP-generated version stamps sharing **zero** values with the repo filenames (repo
`20260618000000_qr_platform_init.sql` vs prod `20260618063513 qr_platform_init`). Each migration was
therefore applied individually with the MCP `apply_migration` — the path every migration on this
project has actually taken — and verified before the next: signature, shape count, and
`has_function_privilege` for `anon` / `authenticated` / `service_role`.

⚠️ **The first version of this entry said plain `supabase db push` would replay from `create table
menu_categories`. That was wrong, and Codex corrected it on #236.** The CLI validates divergent
remote history and REFUSES; `--include-all` ("Include all migrations not found on remote history
table") is the flag that would force a replay. `db push` is still not the command to reach for here —
it cannot apply anything until the histories are reconciled — but "it refuses" and "it replays" are
very different facts, and the fence in `CLAUDE.md` now states the real one.

⚠️ **This paragraph was itself corrected again (M148, 2026-08-29).** It used to end "`--include-all`
on this drift is genuinely destructive", which was the SECOND unverified inference in a row about a
command nobody here has run — there is no DB connection string in the agent environment, so
`--dry-run` could not be executed against prod. Codex's round 2 on #236 reports that
`FindPendingMigrations` rejects remote versions absent from the local directory **regardless of the
flag**, and that `includeAll` only admits local migrations preceding the latest remote version — so
with 97 remote-only stamps BOTH forms stop before applying anything. The claim is removed rather than
replaced with a third guess. What is safe to rely on is the conclusion, which never depended on the
mechanism: `db push` in any form is unusable here until the histories are reconciled (M125). Codex's deeper point also stands: that fence prescribed
perpetuating the drift rather than fixing it, so reconciling the histories with
`supabase migration repair` is filed as **M125** rather than left implicit.

**Result:** prod at 97 migrations; all nine RPCs present with exactly one shape each and
`service_role`-only execute; `promo_granted_cents` present; no ERROR-level advisories; and no
function this pass touched appears among the SECURITY DEFINER functions `anon` or `authenticated`
can execute (the seven that do are pre-existing RLS predicates and M87 triggers).

**Two real M70 defects were found by the pre-apply audit and filed rather than fixed inline** —
**M123** (high), a promo grant pinned at checkout survives lock-TTL expiry (5 min) and then prices a
different basket, wrong in both directions; and **M124** (high),
`mms_release_promo_grant_for_holder` matches on `locked_by = p_uid` alone, so a late `pagehide`
beacon from one tab clears the pin a SECOND tab's PaymentIntent was derived under — and if it lands
between that capture and its webhook, the reconcile disagrees with what was charged.

⚠️ **Both descriptions above are the CORRECTED ones.** This entry originally named the wrong
function for M124 (`mms_release_promo_grant`), filed it as med/"defence-in-depth", and prescribed a
`status = 'open'` gate — which cannot close it, because the cart genuinely is open in that window.
Codex caught the stale wording surviving into this summary after the registry row itself was fixed.
The remedy for both rows is an attempt/era discriminator, never a status gate. Applying M70 was
still strongly net-positive: it replaced a total promo outage with an edge case.

**The rail, not the checklist, is the real gap.** Nothing in the repo tracks "SQL applied?"
separately from "PR merged" — which is precisely how three migrations shipped half-deployed without
anyone noticing. Until that exists, treat a merged migration as UNAPPLIED until the catalog says
otherwise — and note that `pg_proc` is **not** a universal check (Codex, #236): plenty of migrations
here create only columns, indexes, policies or data and leave no function row at all
(`w17c_cash_tip.sql` and `w23a_sold_out.sql` contain zero `create function` statements). Verify the
objects THAT file actually creates, via `information_schema` / `pg_catalog` as appropriate.

### M86 · PR A — Night turns aubergine (2026-08-26)

The owner asked (2026-08-20) for a _"slightly-purple-aubergine-hue theme for dark mode"_.
[`docs/W22D_HUE_DECISION.md`](docs/W22D_HUE_DECISION.md) §5 quantified that as the **ground** hue
rotating off its old 260°, named the ~10 values that carry it, and warned that one contrast combo
would have to be paid for. This is that half — dark only. The light/maroon half (PRs B and C) stays
blocked on three owner questions and is untouched here.

**Rotated in OKLCH with L and C held fixed — hue only.** The decision note measured an HSL rotation
at constant S/L, which raises luminance (its table watched the tightest combo fall to 4.384 by +25°).
Holding OKLab L instead keeps every ground token's relative luminance where it was to within a
thousandth — `--pg` 0.00725 → 0.00719, `--sf` 0.01243 → 0.01245, `--cd` 0.01697 → 0.01671,
`--surface-elevated` 0.02334 → 0.02314 — so the ladder a diner reads as depth is unchanged and only
the hue moves: **HSL 259° → 277°**, squarely inside the note's 270–285 band. Nine values move
(`--pg` `--sf` `--cd` `--surface-elevated` `--oa`, both `--grad` stops, `--surface-glass`,
`--surface-vellum`); the accent/status hues sit across the wheel and do not.

**`--jade-strong` loses its alias, and the reason is worth stating precisely — the precise version is
not the one first written.** The wallet chip's hover background is
`color-mix(in oklab, --jade 18%, var(--cd))` — an OKLab mix against an **opaque** second colour, so
re-hueing `--cd` moves the blend's a/b and its luminance even though `--cd`'s own lightness barely
moved. `jade-strong on chip tint HOVER /cd` was already the tightest combo in the audit at 4.5237;
after the rotation the suite scores it **4.5012**. So jade gets ruby's W22d-1 treatment, smaller:
hold OKLab hue and chroma, move L 0.6919 → 0.6999 as searched; 8-bit rounding lands the shipped
`#62b380` at OKLCH(0.7012, 0.1102, 154.73) against `--jade`'s (0.6919, 0.1094, 155.14), so the values
are stated as measured rather than as "identical hue and chroma".

⚠️ **The margin that motivated this is smaller than the measurement's own precision, and an earlier
revision built a story on the difference.** `mixOklab` quantizes the blended background to 8-bit
before computing luminance; carrying floats instead moves this combo ~0.03 — larger than the
rotation's own effect (~0.02) — and reverses its sign:

| method                         | pre-rotation `--cd` | post-rotation `--cd` | rotation's effect |
| ------------------------------ | ------------------- | -------------------- | ----------------- |
| 8-bit (what the suite asserts) | 4.5237              | 4.5012               | −0.0225 — a cost  |
| float                          | 4.5112              | 4.5313               | +0.0201 — a gain  |

So _"the rotation cost this combo"_ is a fact about where rounding happens, not about the palette.
What holds on **both** methods: the alias sits within ~0.03 of the 4.5 line — on it, inside the
noise — and `#62b380` clears on both (4.6594 quantized, 4.6906 float). That is the justification, and
it no longer depends on which method is right. Which one models a real screen is a genuine question,
filed as **M122** rather than settled here.

All **28** dark combos clear AA — measured from the suite, not counted by eye; an earlier revision
said 27, which was the count _before_ this diff added one.

**New guard — surface 7 of `check-theme-parity.mjs`: the translucent surfaces that cannot reference
the token they ARE.** `--surface-glass` and `--surface-vellum` are the frosted forms of `--cd` and
`--sf`, and CSS gives no way to say so (`rgba()` takes raw channels; there is no
`rgba(var(--cd), 0.9)`), so each hand-copies three numbers out of another token in the same file.
That is this script's subject exactly and it had no coverage — which is why this re-hue meant editing
four values in lockstep by hand and trusting the author to notice. Three of the four pairs track;
light `--surface-vellum` is a hand-authored warm `#faf7ef` matching neither `--sf` nor `--pg`, so it
is listed as a **named exemption rather than a silent skip** — and the exemption is itself checked
against both bases its rationale names, and **fails closed**: a value it cannot parse is a failure,
never a pass, and `var()` aliases are **resolved** before any comparison.

Three rounds of the same fail-open shape were needed to get there, each found by Codex, each one read
further out — worth listing, because the pattern is the lesson:

1. The exempt value not parsing as `rgba()` short-circuited to green — so rewriting it as `#f2efe7`
   (exactly `--sf`, the stale condition itself) or `var(--sf)` left the guard green. The commit
   message claimed a non-`rgba()` value had been falsified when only the NON-exempt path had been.
2. The channel matcher accepted a **prefix**, so `rgba(250, 247, 239, nope)` yielded three happy
   channels and reported clean. A custom property takes an arbitrary token stream at parse time and
   fails only at substitution, so the vellum consumers would have lost their fill with every gate
   green. Both paths had the hole; they now share one anchored reader that validates the closing
   delimiter and the alpha, and rejects out-of-range channels.
3. An **unresolvable base** was read as "not stale". Alias `--sf: var(--vellum-ground)`, mirror that
   alias in the print re-pin, and the whole script reported clean while the exemption was genuinely
   stale — two reads failing at once, since `expectHex` was also comparing the alias string to
   itself and calling it a match. Aliases are not hypothetical: `.dark` ships
   `--ac-strong: var(--ac)` and `--gold-strong: var(--gold)` today.

Every one of the three is the same error: **absence of evidence read as evidence of absence.** A
guard that cannot evaluate its subject must fail, not pass. Re-falsified six ways, including two
negative controls (a syntax-only change must still pass; a whitespace variant must still match).

⚠️ **An earlier revision of this entry claimed a live AA failure on the order-ready wall board, and
a new CI guard justified by it. Both were wrong and both are gone — the record is kept because the
mistake is more instructive than the change would have been.**

The claim was that `.orb-col-ready h2` shipped `color: var(--gold)` on `--pg` at **1.97:1**. That
ratio is correct for the LIGHT ground, and that heading never renders on the light ground: every
`.orb-root` wrapper is Night-forced (`<div className="orb-root dark">`, `ReadyBoard.tsx:164/187/208`)
and `.orb-col-ready` exists nowhere else, so it always resolved to dark `--gold` `#f4c879` on dark
`--pg` — **11.70:1**. `globals.css` said so in the same block that was edited ("Same Night-forced
wrapper as the KDS"). The "fix" to `--gold-strong` was a **byte-identical no-op**, since
`--gold-strong: var(--gold)` in `.dark`. A number computed correctly, attributed to a surface that
renders in the other theme, then written into six places as fact.

The guard built on it — `scripts/check-text-tokens.mjs`, a grep banning `--gold`/`--ac2` as `color:`
— is **removed rather than repaired**, for a reason that outlives it: _a grep cannot know which theme
a rule renders in, and that is the fact deciding the rule._ `--gold` as text is illegitimate on the
light ground and perfectly legitimate inside this repo's Night-forced subtrees (`.orb-root dark`,
`.kds-root dark`). As a blocking CI step it would have rejected correct code with an untrue
diagnosis. Its scope table also carried two invented values — a `2.10` contrast **no colour can
produce** (`#e8a83c`'s maximum against pure white is 2.0797; the real figure is 1.8100, the tightest
of the three and quoted as the loosest) and a hex `#f6d9a8` found nowhere in the repo (light `--ac2`
is `#c8772a`) — in a file whose own header congratulated itself for catching a fabricated
reassurance.

**What survives is the assertion that was missing all along.** The board's real pairing — dark
`--gold` on dark `--pg` — had **no coverage**, while a defect that never existed collected six
citations. It is now asserted, dark-only, with the theme restriction as the point rather than a
convenience.

The wider gap is filed as **M120**, re-scoped by all of this: a text×surface sweep must resolve the
_rendered_ theme per call site, because this repo has theme-forced subtrees — which is exactly why it
is not a regex. **M121** (the homepage brand star at 1.97:1 on cream — genuinely light-rendered, and
WCAG 1.4.11 exempts logotypes, so a brand question rather than a defect) stands for the owner.

Red-first throughout: the parity guard was watched failing on all three mirrors before they were
updated; the contrast audit was watched failing at 4.492473 (matching the predicted 4.4925 to four
decimals) on a deliberately under-paid rotation, and the surviving wall-board combo at 2.0659 on a
darkened dark `--gold`; surface 7 was falsified five ways (drifted channel, re-hued base with the
frosted surface left behind, undeclared surface, non-`rgba()` value, stale exemption).

**Red-first was necessary and not sufficient here, which is the lesson worth keeping.** The removed
guard was falsified five ways and every one passed, because falsification proves an assertion _can_
fail — never that what it asserts is _true of the app_. Its headline catch was watched going red on a
real call site and was still a non-defect, because nothing in the loop asked which theme that call
site renders in. The same gap made the old audit combo's own red-first (1.9741, on the light map)
evidence for the wrong claim. A guard needs both halves: a falsification, and a check that its
subject is real.

Two further self-inflicted bugs were caught during construction and are recorded because both are
house failure modes: the sweep first matched **its own documentation** — the fix's comment quoted the
banned `color: var(--gold)` verbatim — reporting prose nobody renders; and its failure message
**fabricated a reassurance**, claiming the suggested `--ac-strong` "aliases `--ac2` in dark so Night
is unchanged" when `--ac-strong` aliases `--ac` and that swap does move Night. Every ratio in this
entry was computed against `tokens.css`, never transcribed.

### M72a — the settlement derives availability instead of being told it (2026-08-26)

**The registry said closing M72 needed a reservation. The widest of its three windows did not.**
`mms_settle_precheck_and_void` was HANDED the unsellable ids as `p_menu_ids` and voided exactly what
it was told; the server never consulted `menu_items` at all. So "which dishes can no longer be made"
was a **client-supplied decision on a money path** — the one shape this repo forbids outright — and
the window between the app's catalog read and the void was a full PostgREST round-trip wide. An 86
landing in it was missed and the whole hold captured for a dish the kitchen could not make.

The function now derives the set itself, joining `menu_items` inside the same data-modifying
statement that voids, under the cart-row lock it already held. One snapshot, so the app→DB
round-trip that used to sit in front of the void is gone — and it applies regardless of what the
caller sends, because the list is no longer consulted.

⚠️ **Shrunk, not closed — an earlier draft of this entry said "zero" and Codex round 2 was right to
call it.** Under READ COMMITTED a statement reads from a snapshot taken when the statement begins, so
an 86 committing after that snapshot but before the statement finishes is still missed. What remains
of window A is the statement's own execution; `setItemSoldOut` takes no cart lock, so nothing
serialises the two. The stronger reason for this change is not the milliseconds anyway — it is that
"which dishes can no longer be made" stops being a client-supplied decision on a money path.

⚠️ **No TypeScript changed, and that is a correction rather than a scope choice.** The first draft
also deleted the app-side catalog read and sent an empty `p_menu_ids`. Codex round 1 caught why that
is unsafe: PostgREST resolves `.rpc()` by argument NAME, so the call still SUCCEEDS against the OLD
five-argument function — which short-circuits on `array_length(p_menu_ids, 1) is null` (w23d:190) and
voids **nothing**. With the app-side read gone too, deploying the app before the migration captures
the full authorization for a sold-out basket, silently. My reasoning had held that keeping the
signature made this safe in both directions; that is true of RPC _resolution_ and false of
_semantics_. Shipping only the SQL is safe in every order: the new function ignores what it is sent,
the old one keeps working with the list it is given. Removing the read, the argument and the
now-redundant cross-check is **M72b**, after `db push` lands.

⚠️ **This does not close M72, and the rollout gate needs re-deciding.** Two windows remain —
`getCartTotals` never reads `menu_items`, and the Stripe capture is an HTTP call no transaction can
span. `docs/HANDOFF.md` gates PICKUP_MANUAL_CAPTURE on "M70 · M71 · M72 closed"; ticking that on the
strength of this would be the overstatement the repo keeps paying for, so the row stays **open (A
closed)** and the gate carries the caveat.

⚠️ **And the residual is minutes, not milliseconds.** `apps/qr/lib/stripe.ts` passes neither
`timeout` nor `maxNetworkRetries`, so stripe@22.2.1 applies 80 000 ms per attempt and 2 retries,
retrying on any connection error, on 409 and on every 5xx — precisely when a capture is slow. Every
statement of the residual as "one round-trip" was wrong by three orders of magnitude. Capping the
retries is the cheapest lever on that window by far and is filed as **M72c**, not done here, because
it changes retry behaviour for every Stripe call in the app.

**The signature is deliberately unchanged, and that is the security-relevant part.** `p_menu_ids` is
retained and never read rather than dropped, because a DROP+CREATE resets `pg_proc.proacl` to NULL —
EXECUTE **to PUBLIC**. Measured on a scratch stack: after a drop-and-recreate, an `authenticated`
role could void lines and mint a `qr_dropped_lines` row with an attacker-chosen `payment_intent`,
which `mms_dropped_snapshot` then renders back to a diner. It gets through because SECURITY DEFINER
bypasses the table grants and `null is distinct from null` is FALSE, so an open cart with a released
lock passes both `-2` gates — and every QR diner is `authenticated` (anonymous auth). `CREATE OR
REPLACE` on the same signature preserves the ACL. Dropping the parameter is filed as **M72b**, to be
done with the revoke/grant pair re-asserted in the same migration.

**Two mechanics that were measured, not reasoned about.** `and t.state = 'draft'` on the UPDATE's own
qual is not redundant with the CTE's filter: under READ COMMITTED the executor re-checks the UPDATE's
qual against the new row version (EPQ) while the CTE's filter was evaluated in the earlier snapshot.
Without it, two sessions voiding the same line wrote **two** `qr_dropped_lines` rows — and that
ledger has no unique constraint while `mms_dropped_snapshot` aggregates without `distinct`, so the
duplicate reaches the diner's /track card and receipt as the same dish listed twice. The ledger CTE
also joins `voided` rather than `unsellable`, so only what the UPDATE actually claimed is recorded.
And the join is `mi.id::text = ci.menu_item_id`, never the reverse: `menu_item_id` is a soft text ref
that may hold a grocery barcode, and `::uuid` raises 22P02 on it, aborting the settlement and
answering `retry` to Stripe for 72 h.

**The fixture is the test.** The repo's only SQL test of this function could not falsify a single one
of its four WHERE arms — deleting `menu_item_id = any(p_menu_ids)`, `state = 'draft'`,
`fulfillment in (…)`, or even `cart_id = p_cart` each left it green, because a one-line fixture
satisfies every arm vacuously. The new file uses five lines chosen to kill specific mutations, and
the load-bearing one is the **negative control**: a dish that must SURVIVE. Without it the entire
sellability predicate is deletable — void everything and the count still matches. It also pins the
`-1`/`-2` authority arms, which had **zero** SQL coverage (they were pinned only in TypeScript,
against a mocked return value), and asserts the function's privileges with `has_function_privilege`,
a guard this repo did not previously have for any function.

The general gap is filed as **T7**: `verify:slice` mutates only `.ts`, so 0 of 227 mutants name a
`supabase/` file and a SQL predicate can be deleted with every gate in the repo green.

### An authorized promo survives to settlement (2026-08-25)

**M70 closed — and it was four defects, not one.** A promo that lapses between authorization and
capture raises the live total above the hold, and `planCapture` cancels the entire order
(`liveTotalCents > authorizedCents` → `over_authorized`). Safe, but one missing dish cancelled
everything.

The registry filed the min-subtotal shortage. `mms_promo_discount` returns 0 on **four** conditions,
and three of them need no cart change at all:

| trigger                                 | needs a basket change?   |
| --------------------------------------- | ------------------------ |
| code deleted, or `active` flipped false | no                       |
| `now() < valid_from`                    | no                       |
| `now() > valid_until`                   | **no — pure wall clock** |
| `subtotal < min_subtotal_cents`         | yes (the filed case)     |

A hold taken at 23:58 under a promo expiring at midnight, captured at 00:01, cancelled for exactly
the same reason as the sold-out shortage. Owner's call (2026-08-25): honour all four.

**The grant is PINNED at authorization.** `qr_carts.promo_granted_cents` is written by
`mms_pin_promo_grant` before the amount is derived, and `mms_promo_discount` returns it from then on.
The arithmetic is not duplicated: the existing body is renamed `mms_promo_discount_live` byte-for-
byte, and the public reader — **same signature, so no caller changes anywhere** — is "the pin if
there is one, else live".

Also worth recording: the total can only rise when the discount drops to **zero**. For `pct`,
total = S·(1−p); for a partial `flat`, total = S − v. Both increase with the subtotal, so shrinking
a basket lowers them. Those four drops are the entire surface.

⚠️ **The pin deliberately outlives the lock.** Fulfillment re-derives the breakdown and reconciles it
against the captured amount; clearing the pin at release or capture would make the derived total
disagree with what was charged and raise `reconcile_mismatch`. It is cleared in exactly three places
that end its meaning — a new promo code (same UPDATE as the code write, so they cannot drift) and a
cancelled settlement (scoped to the cancelled attempt's ERA, so neither a redelivery nor a
first-time cancel for a superseded intent can wipe a newer hold's grant) — plus an attempt that
abandons before minting an intent, which the cancellation path cannot see at all.

⚠️ **A pin of 0 is a real answer** (`is not null`, never `> 0`). A cart with no valid promo at
authorization grants 0, and a promo becoming valid mid-settlement must not lower the total below what
the reconcile expects. A `coalesce(nullif(pin, 0), live)` tidy-up would break exactly that.

⚠️ **The TS half was unguardable and the coverage guard said "clean" anyway.** `create-intent` has
no test file and carries a `verify:slice-exempt` line whose stated reason is about W19's tip
ceiling — so the pin call was waved through by an exemption that never covered it. Deleting the pin
would have left every gate in this repo green while M70 silently regressed.
`scripts/check-promo-grant-pin.mjs` (a fourth cheap grep, beside the photo-filter and theme-parity
ones) now asserts the pin is taken AND taken before the amount is derived; both rules watched failing
first. The exemption comment now says what it actually covers. **An exemption is a claim about what
is covered elsewhere; when a file grows a rule the claim does not cover, the exemption is stale.**

⚠️ **A fast step that gates a slow proof is not a small failure.** `database.types.ts` is
`pnpm db:types` output and `db:types` needs Docker, so in a cloud session a new RPC's entry is typed
by hand — and the first thing that checks it is `migrations-check + types-fresh`: six image pulls and
120 replayed migrations to reject one misplaced line. This PR burned two of those cycles on plain
alphabetical slips. The cost was not the minutes: `types-fresh` runs BEFORE that job's SQL tests, so
each slip tore the stack down with every one of M70's assertions still unrun — the migration read
"checked" when nothing about it had executed, under a red check naming a types file.
`scripts/check-generated-types-sorted.mjs` (a fifth cheap grep) decides it from the file alone in
milliseconds: the generator emits `Tables` keys, `Functions` keys and every `Args` list in plain ASCII
order (46 · 70 · 64 blocks), and the error names the exact pair to swap. It deliberately does not
guard the entry's line-breaking — that is prettier's 80-column printer, and position is both the
cheap half and the half that was actually wrong. Wired into `verify:slice` and CI's fast lane; six
failure modes, including both "parsed zero keys" cases, watched failing first.

**Codex round 1 found two P1s in the pin's lifecycle, both real, both mine.**

The first: `mms_pin_promo_grant` runs before the amount is derived, so every create-intent exit
between the pin and a live PaymentIntent — the "Empty cart" and tip-ceiling refusals, and the outer
catch on a `getCartTotals` throw or a Stripe failure — left a grant authorizing nothing. The diner
edits the now-unlocked cart, re-checks-out, and the pin is a no-op because it is not null, so the
abandoned attempt's grant prices the new basket. Cancellation could not cover it: that records the
end of a hold that _existed_. `mms_release_promo_grant` now runs on all three paths.

The second is sharper, and the codebase had already written the rule down. My clear inside
`mms_mark_settle_canceled` was scoped to the CART and guarded only on the insert's row count — which
rules out a redelivery of the same intent, but not a _first-time_ cancel for a superseded attempt
arriving while a successor hold is live. That would wipe the successor's grant, and its webhook would
then re-derive the live promo and hit the exact reconciliation mismatch this change exists to
prevent. `manual-capture-run.ts:159-161`, three lines above the `superseded` call site:

> _"The verdict is keyed on the PaymentIntent, so it describes THIS attempt only and cannot paint
> over the successor's — which is exactly why the cancellation ledger is per-intent and not
> per-cart."_

The clear is era-scoped now (`locked_at is not distinct from p_attempt`, the same comparison
`mms_settle_precheck_and_void` uses). **Third time this session the fix was already written next
door** — after `lock.ts` three lines up and the analytics lesson one property above.

**Three more P1s, one root cause, and the predicate that finally satisfies all of them.** Rounds 2
and 3 kept circling the same thing from different angles: the pin has no owner, so every clear had to
GUESS whether it was the current attempt — from `locked_at` (which moves), from a verdict (which goes
stale), or not at all (cart-wide). Three drafts, each wrong in a different direction:

1. **cart-scoped** — a first-time cancel for a superseded intent wiped a live successor's grant.
2. **`locked_at is not distinct from p_attempt`** — CI reddened case 8. `attempt` is declared
   _"forensics only, never read by the diner path"_ and `markCanceled` nulls an unparseable one on
   purpose, so a predicate must not make it authoritative; and a TTL-released lock NULLS `locked_at`,
   so an ordinary cancel naming a real era stopped matching and the grant leaked.
3. **`p_reason <> 'superseded'`** — the verdict is STALE. `superseded` describes what the PRECHECK
   observed; between that check (`manual-capture-run.ts:123-144`) and the verdict write (`:192`) the
   same payer can start another checkout, `acquireCartLock` refreshes `locked_at`, and the successor
   pins and derives its amount while the old verdict still reads `over_authorized`.

The question was never "which attempt am I?" but **"is a DIFFERENT live attempt depending on this pin
right now?"** — and the cart's current `locked_at`, read at write time, answers it:
`(locked_at is null or locked_at is not distinct from p_attempt)`. No live lock → nothing depends on
the pin → clear. My era → clear. Another era → leave it. Both clears use it, and it **deletes** the
verdict special-case rather than adding to it.

Two more leaks closed with it. `mms_release_promo_grant` is now era-scoped (`acquireCartLock` lets the
same diner re-acquire and REFRESHES `locked_at`, so two overlapping create-intents are two eras on one
cart sharing one uid — only the era separates them). And the SUCCESS-path abandons: returning a client
secret mints no authorization, so "Edit order" and the `pagehide` beacon were unlocking carts with a
live pin — a diner minting on a $30 basket, tapping Edit order and dropping to $24 still got the $10
grant, below the promo's own $25 minimum. Those two are clients that never saw an era, so they prove
ownership the way `releaseCartLock` does (`locked_by`), via `mms_release_promo_grant_for_holder`.

⚠️ `acquireCartLock` now RETURNS the era it stamped, and `create-intent` stops re-SELECTing
`locked_at` a few statements later — a second derivation of a value we already held, whose window is
exactly where a competing acquisition lands. `LockAcquisition` is a per-literal discriminated union so
a real era is paired with the `acquired` outcome alone: `era`'s non-nullness is the type's, not an
assertion, and a future fourth outcome becomes a type error. (A single member with a three-literal
discriminant cannot be ELIMINATED by `===`, so it never narrows — that shape typechecks and silently
leaves `era` nullable everywhere.)

Fifteen SQL cases. Cases 8 · 11 · 12 · 13 pull against each other by design — a superseded cancel must
not clear, a TTL-released one must, and a stale cancel with a non-superseded verdict must not — so no
single direction can be "fixed" alone again.

**Codex round 2 also found the promo write racing the pay lock, and that one is separate.**
`applyPromo` refuses a `locked || settling` cart — but it reads that at authz time, and TWO awaited
RPCs run before the write. Long enough for a tablemate to reach the pay screen, take the lock and pin
the grant; the write, gated only on `status = 'open'`, then clears a LIVE attempt's pin. Its
PaymentIntent was minted under the old code, the webhook re-derives under the new one, and
`reconcile_mismatch` lands after the card is charged. The freeze is now re-tested in the same
statement that writes, against the same EFFECTIVE predicates `assertCartMember` uses (a lock is only
real inside `CART_LOCK_TTL`; `locked = true` with a null `locked_at` is not a lock).

⚠️ `{ count: "exact" }`, not `.select("id")` — a mutation with `.select()` asks PostgREST for
`return=representation`, and PostgREST 14 re-applies the top-level `or()` against the RETURNING
projection, so `locked` falls out of scope and the whole UPDATE 400s with 42703. That is written down
at `lock.ts:49-56`, where it once gave every checkout a spurious 409. **Fifth time this session the
answer was already next door.**

And the refusal is READ, not assumed: three facts land on the same zero row count (closed · a
tablemate holds the lock · the table is settling), and a fourth outcome is honest too — if the
diagnosis read fails we do not know why, so it answers `error` rather than inventing a verdict. Eight
cases in `lib/cart-promo-freeze.test.ts` on a fake PostgREST that EVALUATES the filters, so a deleted
predicate moves the row instead of merely changing a call list; both directions pinned (a STALE lock
must still let a promo through). Five mutants, each watched failing first.

**Then CI overturned the era fix, and the third draft is the simplest of the three.** Round 1's
correction re-derived the era as `locked_at is not distinct from p_attempt`, and case 8 went red.
Two reasons, and the column states the first itself: `qr_settlement_cancellations.attempt` is
"forensics only, never read by the diner path" and `markCanceled` nulls an unparseable one on
purpose — _"losing the era is survivable, losing the verdict is not"_ — so a predicate must not make
it authoritative. And the cart lock has a TTL that auto-releases an abandoned pay screen, nulling
`locked_at`, so an ordinary cancel naming a real era stops matching and the grant leaks. **A guard
tightened until the valid case fails is not safer; it moves the defect.**

The era test was already computed and did not need re-deriving: `mms_settle_precheck_and_void`
returns -2 exactly when `v_locked_at is distinct from p_attempt` (the null attempt included), and the
caller maps -2 to the one reason `superseded`. So the grant follows the LOCK's rule, stated one line
above that mapping — `if (prior.reason !== "superseded") await releaseOurLock(…)` — because the grant
and the lock have the same owner. `and p_reason <> 'superseded'`, plus `status = 'open'` (the only
state where a stale grant can price a next basket, and the gate `mms_pin_promo_grant` already uses).
**Fourth time this session the answer was already written next door.**

Twelve SQL cases (registered in `ci.yml`), one per trigger plus the zero-pin, idempotence, cancel-
release, redelivery, code-change, abandoned-attempt and superseded-era rules. Case 1 is a control with no pin — without it the file
could not tell "the pin works" from "the promo never drops any more" — and each lapse case asserts
the _live_ value is 0 alongside, so none of them can pass vacuously. Cases 11 and 12 pull in opposite
directions on purpose — a superseded cancel must not clear, a TTL-released one must — and only the
verdict satisfies both.

### Promo reporting records what was delivered, not what was quoted (2026-08-25)

**Codex round 2, and it was right to press.** Round 1 raised the analytics gap and I filed it as
superseded; round 2 pointed out that once `promoCents` exists and is threaded into both fulfillment
callers, leaving the reporting on the apply-time quote is a choice rather than a gap — a zero-total
settle could report a promo's full face while fulfillment consumed it on a smaller contribution, or
did not consume it at all.

`payment_succeeded` (card) and `staff_settle_cash` both now carry `promo_cents`: the promo's
DELIVERED contribution, the same figure the redemption is consumed on. `promo_applied` keeps
recording `mms_promo_check`'s value and is labelled in place as the **quote** — what the code was
worth against the basket as it stood at apply time. It was always approximate (a void or a comp after
apply already moved the delivered amount); reward-first just made 0 reachable.

The card event's neighbouring comment already carried this exact lesson from W23c round 2 —
_"what was COLLECTED, not what was held"_ — one property up. Report what happened, not what was asked.

### Fulfillment consumes a promo only when the promo delivered (2026-08-25)

**Codex round 1 on the M22 PR, and it falsified the claim the change rested on.** I argued reward-first
was free because "a promo's budget is a redemption COUNT — it costs the same one redemption either
way." It does not. `mms_fulfill_order` and `mms_fulfill_cash_order` both gated consumption on
`p_discount_cents > 0` — the **combined** discount, which is not a fact about the promo at all. A
reward large enough to cover the basket clamps the promo to 0 while keeping that sum positive, so the
code was consumed having delivered **nothing**: `promo_codes.used` incremented and a
`promo_redemptions` row landed, spending global and per-session budget that bought no discount.

⚠️ **The hole PRE-EXISTS — M22 widened it, it did not dig it.** An attached code that has expired or
fallen under its min-subtotal already made `mms_promo_discount` return 0 while an applied reward kept
the combined value positive. Reward-first simply made a second, more ordinary route to the same
place. Both are closed here.

`CartTotals` gains `promoCents` — the promo's own post-reward contribution, derived once beside the
clamp — and both fulfillment RPCs take `p_promo_cents` and gate on it. The parameter is added LAST,
DEFAULTED, and the predicate coalesces to the old value, so a caller that has not been updated keeps
exactly today's behaviour: the migration is safe to land ahead of the app deploy rather than in
lockstep with it. Adding a parameter makes a NEW signature rather than replacing the old one
(Postgres keys functions by argument types), so each old signature is dropped first — which drops its
grants, hence the explicit re-grants.

`supabase/tests/m22_promo_consumed_on_its_own_contribution_test.sql` (registered in `ci.yml`) carries
four cases: the defect, the legitimate consume (without which deleting `mms_promo_consume` outright
would leave the file green), the omitted-parameter fallback that makes the deploy safe, and the cash
path — the same gate behind a different door. `promoCents` also replaced the three places
`Checkout.tsx` re-derived the promo as `discountCents - rewardCents`.

### A reward coupon stopped being burned at less than its face (2026-08-25)

**M22 closed.** `mms_redeem_cart_reward` flips `redeemed_at` unconditionally, so a coupon is spent in
full whatever it delivered — while `computeTotals` clamped the reward to whatever the promo left of
the subtotal. The gap between the two was value destroyed silently, for one diner, permanently.

**The fix that costs nothing: the reward clamps FIRST.** Both orders equal `min(promo + reward,
subtotal)` — the diner's total, the tax base, the order snapshot and the promo's redemption
accounting are byte-identical either way, which the new order-independence sweep measures rather than
asserts. All the order decides is **which instrument absorbs the clamp**, and the two are not alike:

|               | clamped                                                              |                                                  |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| reward coupon | single-use, personal, **destroyed** on redemption                    | every discarded cent is gone for that diner      |
| promo code    | budget is a redemption **count**, consumed by `p_discount_cents > 0` | costs the same one redemption at 100¢ as at 600¢ |

Clamping the destructible one first was strictly the worse of two identically-priced choices. Reward-
first removes the promo collision outright.

**What it can't fix, the diner is now told.** A coupon still loses value when the whole chargeable
basket is smaller than its face. Owner's call (2026-08-25) was **burn in full, but disclose it**, so
`CartTotals` carries `rewardFaceCents` beside the clamped `rewardCents`, `rewardShortfallCents()`
derives the residual, and the applied-reward row says so bilingually — next to the Remove the diner
would use if they'd rather save it. It promises nothing and states the amount.

⚠️ **The registry's own repro was unreachable.** M22 was filed with subtotal $10 / promo $6 / reward
$9. Prod's `mms_rewards_config` is `reward_base_cents` **500** against `reward_min_redeem_cents`
**5000**, so a $9 coupon does not exist and a $10 basket is refused at apply. Real exposure was ≤ the
coupon's $5 face, reached either by a promo eating the base or by the basket shrinking after apply —
the numbers came from a unit fixture and had never been checked against the live config.

⚠️ `rewardFaceCents` is deliberately non-zero on a basket that charges nothing: it states what the
attached coupon is _worth_, which is a fact about the coupon. The disclosure gates on the **applied**
amount instead, so it stays quiet with no reward row to qualify — and blanking the face would have
hidden the worst case, a basket that shrank away under an attached coupon.

Three rules, each watched failing first: reverting the ordering reddens 4 (`expected 400 to be 900`,
plus the sweep's anti-degeneracy assert), deriving the face from the clamp reddens 6 (`expected 400
not to be 400`), gating the disclosure on the face reddens 1 (`expected 500 to be 0`). The stale
`totals/reward-clamp-order` mutant MOVED to the promo clamp rather than being deleted — the second
clamp is what keeps the total non-negative, and it changed owner.

### The rest of the fabricated diagnoses — and two of them weren't (2026-08-25)

**M119 closed.** Four remaining sites where a refusal stated a cause the code never established. Two
turned out to be worse than filed: not wrong sentences, wrong **outcomes**.

**`grocery.ts:73` destroyed the shopper's scan.** `unknown_barcode` sits in `grocery-queue.ts`'s
`REJECT_REASONS`, so the offline queue treats it as definitive — dequeue, tell the shopper, never
retry. An unreadable catalog read answering `unknown_barcode` therefore **permanently discarded a
queued scan** during a reconnect drain. The queue's own fall-through names the right bucket:

```ts
if (REJECT_REASONS.has(result.reason)) return "rejected";   // dequeue + tell the shopper
…
return "retry";                                            // locked / settling / unreadable
```

The fix needed nothing new. `ScanAddFailure` already includes `CartUnavailable`, whose `unreadable`
variant is documented as _"a failed read … the caller must offer Retry and MUST NOT offer to start a
fresh basket"_; `isTerminal` is false for it, `classifyReplay` already retries it, and the page's
final `else` already renders honest transient copy. The right answer was in the codebase — this one
read wasn't using it.

**`reorder.ts:128` added zero reorder dishes and called each one unavailable.** An empty `itemById`
doesn't mean nothing is available, it means **we never asked** — so every food line was skipped as
`gone`, the reorder added nothing, and the diner got one false statement per dish.

_(An earlier draft of this entry said "empty cart". Codex was right that that overstates it:
`reorderOrder` only inserts, never clears, so a cart that already held dishes stays non-empty. The
functional claim stands; the wording doesn't.)_

**The first fix over-blocked, and Codex caught that too.** It refused the whole reorder. But
`priceItem` re-reads `is_active,is_sold_out` on **every** add and throws — so the batch read is an
optimisation plus a source of precise skip reasons, never the only thing between a diner and a
delisted dish. Aborting every otherwise-valid dish to re-check something already checked one layer
down is cost with no cover. Worse, the refusal advertised _"try again in a moment"_ into a screen
with **no way to try again**: `MenuBrowser` sets `reorderRan.current = true` and strips the `reorder`
URL param _before_ calling, so the effect never re-runs. A promise the code doesn't keep — in the
change that exists to stop making them.

So the fallback now proceeds and lets the per-line gate decide. That needed one more piece to stay
honest: `priceItem`'s availability refusal carries its reason (`ItemUnsellableError`), because
otherwise a sold-out dish on that path came back `needs_choices` — swapping a wrong outcome for a
wrong sentence, which is not a fix here. A mutant pins each half.

The other two are the filed shape:

- **`lock.ts:68`** returned `closed` on an unreadable status read, so checkout told a diner whose
  order is open that it is _"no longer open."_ `LockResult` gains `unavailable` → a retryable 503.
- **`create-share-intent:51`** denied membership on a dropped error — a **400**, client fault, for
  our outage.

**The through-line, and the thing worth carrying:** in `lock.ts`, `create-share-intent` and
`reorder.ts`, the identical shape sat **immediately beside a corrected instance**. `lock.ts` is the
sharpest — the comment one statement above the defect describes this exact bug and fixes it on the
UPDATE, where it had given _every_ checkout a spurious 409 after the PostgREST 14 upgrade. The fix
landed three lines too high. Fixing one read does not fix its neighbour, and the neighbour is where
the next defect lives.

All four watched failing first, and each is pinned by a mutant.

**Codex round 2 found the fix's own version of the defect, and it was the sharpest one here.**
`priceItem` read the item with `.single()`, which reports a **0-row result as an ERROR** — so
`if (error || !item)` folded _"this dish is no longer in the catalog"_ together with _"we could not
reach the catalog"_ and answered `gone` for both. That was unreachable while `reorderOrder` refused
outright on a failed batch read. The round-1 fallback made it reachable, and it put the fabricated
diagnosis straight back onto the screen the fallback exists to keep honest. `.maybeSingle()` is what
separates them (`{ data: null, error: null }` for a genuine no-row — the same reason the Stripe
webhook's idempotency read uses it), which leaves `error` meaning exactly one thing. A new
`ItemUnreadableError` carries that, and `ReorderSkipReason` gains `unreadable`.

⚠️ `MenuBrowser`'s `unavailable` bucket was an **exclusion** list — everything that wasn't
`needs_choices` or `grocery` — so the new reason would have landed silently in _"isn't available
today"_, re-fabricating the diagnosis it was added to prevent. An exclusion bucket makes every future
reason default to the strongest claim on the screen; it is an inclusion list now.

⚠️ The reorder fixture initially passed at an **earlier** guard — the order-lookup mock lacked
`earned_by`/`status`, so both cases bailed out before the read under test and the defect case was red
for an unrelated reason. An anti-degeneracy assert now pins that the case reaches the availability
logic at all.

### The tab's payment mutex failed open (2026-08-25)

**M119 (a) closed — the first item off the class M116 uncovered, and the only one that was a wrong
outcome rather than a wrong sentence.**

Opening a tab is a cart mutation, so it waits behind the same mutex every other one does. It didn't:

```ts
const { data: payCart } = await db.from("qr_carts").select(…).eq("id", cartId).maybeSingle();
if (await paymentInFlightReason(payCart)) return { ok: false, error: "Someone's paying right now…" };
```

The `{ error }` was discarded — and `paymentInFlightReason(null)` returns null by **deliberate
contract** (`pay-guard.ts:38`, pinned by `pay-guard.test.ts:142`): null means _"there is no cart"_,
not _"we could not tell"_. So a failed read didn't mis-word the refusal, it **skipped** it. A tab
opened on a cart whose card was mid-authorization, and nothing downstream re-checks: `mms_open_tab`
gates on the cart being `open`, which it still is during an authorization.

Binding the error also separates the two reasons `payCart` can be null — a genuinely **absent** cart
still falls through to the RPC, which is authoritative on existence; only an **unreadable** one
refuses. Case 4 caught a quiet second symptom nobody had filed: on a failed read the audit row was
written with a `NULL` session (`payCart?.session_id ?? null`).

**The fix is in the caller, not the guard.** All nine `paymentInFlightReason` call sites were read;
the other eight already refuse an unreadable or absent cart before calling. One caller not honouring
a contract is not a reason to change that contract at nine sites.

⚠️ **The coverage guard could not see this file.** `tabs.ts` matched no `MONEY_MARKER`, so the money
mutex was revertible with every gate green — the guard was blind to exactly the file whose money
defect it exists to catch. `paymentInFlightReason` is now a marker, listed as a _function_ for the
same reason `captureAllIfReady` and `summarizeRefund` are: the money lives in the decision, not in a
column. Proven red-first. This also brings `floor.ts`, `approvals.ts` and `voids.ts` under the
marker with no mutant yet — deliberate and not silent, since the guard only demands one for a
_changed_ file.

**Retracted:** the sweep's reading of `pay-guard.ts:67` was wrong on the remedy. That
`return "split_in_progress"` on a read error is a documented W10d fail-**closed** decision, not a
defect; its only real residue is that staff see a specific sentence for an outage. Recorded in M119
so nobody "fixes" it into failing open.

### A refusal that fails closed must not also invent a reason (2026-08-24)

**M116 closed.** Securing a tab is a dine-in concept, so `setup-intent` refused a pickup or
scan-and-go session with _"Tabs are for dine-in tables."_ That sentence is true for a genuine pickup
session and false for an unreadable one — and the route reached it either way, because it resolved
the mode in a **second** read whose `{ error }` it discarded:

```ts
const { data: sess } = await db.from("table_sessions").select("mode")…
if (sess?.mode !== "dinein") return … "Tabs are for dine-in tables." … 400
```

On a failed read `sess` is null, `sess?.mode` is undefined, the comparison passes, and a diner
sitting at a real dine-in table is told their table is not one. The refusal was right; the
**diagnosis** was invented — the route stated a fact about their session it had never learned.

**The window is not what it looks like.** `assertCartMember` reads `table_sessions` too and already
fails closed with 503, so this was never "the database is down for the whole request". It was the gap
_between_ the two reads: authz succeeds, a blip lands, this read fails. Handling the error would have
narrowed that gap; deleting the read removes it. `mode` now comes off the row `assertCartMember`
already proved active (M108).

Five cases in a new `route.test.ts`, watched failing first — case 2 fails on the unfixed route with
the false sentence verbatim, and case 5 asserts the route never touches `table_sessions` at all, so
the deletion stays deleted rather than drifting back to a corrected re-read. Two mutants (210 total),
both measured killing.

⚠️ **`check-money-coverage` reported "clean" for this file before either mutant existed** — and it was
clean over an _empty set_, because it diffs `base...HEAD` and the change was still uncommitted.
Committing first turned it red. A guard run at the wrong moment is not a guard.

**The shape turned out not to be confined to one route (M119, filed).** A blind sweep for it — four
auditors over the routes, the lib modules, the authz/lock primitives and the Server Actions, each
candidate then put to a refute-biased verifier against real source — returned **7 confirmed, 1
refuted**. (The refuted one was `setup-intent` itself, refuted because this fix had already landed
mid-sweep.) The #226 census that had cleared these asked _"does it fail closed?"_, and every one of
them does; it never asked whether the sentence is true.

One is a different and worse class, and should go first:

- `tabs.ts:66` **fails OPEN**. A discarded `{ error }` leaves `payCart` null, so
  `paymentInFlightReason(null)` cannot see an in-flight payment and the refusal _"Someone's paying
  right now — try the tab again in a moment."_ is silently **skipped**. A wrong outcome on a money
  guard, not a wrong sentence.

Two of the five fabricated diagnoses are worth naming:

- `lock.ts:68` drops `error` and returns `"closed"`, so a diner with an open order is told _"This
  order is no longer open."_ The sibling read **three lines above** binds its error, directly under a
  comment promising to _"message it honestly"_.
- `pay-guard.ts:67` **does** bind and log the error — and returns `"split_in_progress"` anyway.
  Binding an error is not the same as answering honestly with it: the outage needs its own return
  value, not the nearest refusal.

Not fixed here. This PR closes the row it was filed for; the class gets its own change, so each fix
can be watched failing on its own surface.

### The table merge refuses two tables of different kinds (2026-08-23)

**M109 closed — the same-mode rule moves from TypeScript into the database.**

`mms_merge_table_orders` re-parents a source cart's lines into a target cart keeping `fulfillment`
verbatim, and its body never mentioned `mode`. The rule that a pickup table cannot be merged into a
dine-in one lived only at `floor.ts:666` — a client-side check in front of a service_role RPC. M100's
exact defect shape, one function over: the invariant asserted in one place and enforced in another.

M97's fold predicate looked like cover and was not. It refuses to FOLD two lines whose tags differ,
but a refused fold **re-parents** — the line lands on the target cart as its own row anyway, and the
merge tail then cancels the source cart and closes the source session. A pickup guest's session is
gone and their food is on somebody else's table; the tag survives the move, so the toggle will now
accept a flip to `dinein` (M100's gate reads the target session, which really is dine-in) and re-tax
the line, while the to-go routing no longer matches the table it sits on.

The fix is a whole-merge **gate**, not a fold predicate — two tables of different kinds should not be
merged at all, so it raises and rolls back beside the existing open/active and secured-tab gates. A
mode term on the delete and the re-parent instead would make a cross-mode merge silently move nothing
while still cancelling the source cart, which is worse than the defect it replaces.

**The suite shipped for review with a hole, and the blind adversarial pass found it (HIGH).** A
session's `mode` and its lines' `fulfillment` tags travel together in ordinary data — a pickup
session's lines are `togo`, a scan-and-go session's are `grocery` — so five fixtures built from
ordinary tables left the two perfectly correlated, and the suite was measured **green against a gate
that never read `mode` at all**, comparing line tags instead. M109's own defect, reintroduced with
every test passing.

The correlation is not a law, and that is the way out: a seated diner can tap "To go", which is what
`mms_set_line_fulfillment` exists for, so a `dinein` session legitimately holds a `togo` line. Two
cases now break it in opposite directions, and both are needed:

- **Case 4** — modes EQUAL, tags DIFFER. A tag-reading gate refuses; the merge must succeed.
- **Case 5** — modes DIFFER, tags MATCH. A tag-reading gate allows; the merge must refuse. A gate
  that ANDs a tag conjunct onto a real mode comparison passes case 4 and is caught only here.

Two more cases carry the other pair of mis-writes:

- **Case 3** (scan-and-go → pickup) kills the `dinein`-flavoured gate. M100's neighbouring guard is
  spelled `p_fulfillment = 'dinein' and v_mode <> 'dinein'`; copy that shape and you get a gate that
  refuses both dine-in directions and merges scan-and-go straight into pickup. Cases 1 and 2 pass it.
- **Case 7** (pickup ↔ pickup) kills the opposite over-tightening, "both must be dine-in", which
  cases 1–6 all pass. Over-blocking is as expensive as under-blocking.

The same pass corrected a second claim: the post-refusal assertions cannot prove the gate **precedes**
the destructive tail. A plpgsql `begin … exception` block is an implicit savepoint, so the merge rolls
back wherever the gate sits — measured, by relocating it below `update table_sessions set status =
'closed'` and watching the file stay green. They are now labelled as the fixture-drift checks they are.

`floor.ts` now maps the new raise to its own sentence. Without that, a refusal would have surfaced as
"a table changed" — a fabricated diagnosis, and the branch's own comment would have become false.

Proven red-first against the pre-M109 body; 7 mutants in `verify-mode-authority.mjs` (27 total, four
functions), one a DOCUMENTED SURVIVOR — the fail-closed null test, unreachable while the gate above it
proves both carts exist.

The gate reads `mode` **without a lock**, deliberately. This first shipped with a `for update` on both
session rows and it was removed before merge: it bought nothing for `mode` (that column has no writer
anywhere), so its real justification was a `status` race one column over — and it was not free.
`explain` gives `LockRows → Sort (Sort Key: s.id)` while `mms_sweep_expired_sessions` (pg_cron, every
15 min) is `Update → Seq Scan`. Two orders over the same rows is a deadlock path that does not exist
today only because the merge tail locks exactly one session row. The `status` race is real and keeps
its own row (M118) rather than a half-fix here, with that ordering constraint recorded.

### The cart line keeps its own tax category (2026-08-23)

**M17 closed — by snapshotting the category, after the obvious fix was measured and rejected.**

`mms_set_line_fulfillment` re-resolved a line's `tax_category` from `menu_items` on every for-here ⇄
to-go flip, coalescing a MISS to `'hot_prepared'`. `menu_item_id` is a soft text ref with no FK, so a
pruned catalog row left a live draft line pointing at nothing — and hot food is taxable both ways
while cold food is exempt to-go.

The first fix refused the toggle when the category would not resolve. The blind adversarial pass and
Codex both rejected it, and they were right. `getCartTotals` reads `tax_cents` only as a **boolean**
(`totals-math.ts`: a line joins the taxable base when `taxCents > 0`), so comparing the stored
_number_ before and after says nothing about what the guest pays. Measured properly, on a real
Postgres with the catalog row pruned after the line was minted:

|                 | correct | before  | refusing                        | **this fix** |
| --------------- | ------- | ------- | ------------------------------- | ------------ |
| dine-in → to-go | exempt  | TAXABLE | TAXABLE — _identical charge_    | **exempt**   |
| to-go → dine-in | TAXABLE | TAXABLE | exempt — _new under-collection_ | **TAXABLE**  |

Refusing bought nothing in the direction M17 was filed for, additionally stranded the box (the line
stays tagged `dinein`, so `mms_init_togo_status` never stamps and the counter never sees a bag), and
introduced an under-collection in the other — M97's worse direction. It was strictly worse than the
code it replaced.

No rule over the row recovers the category either. The owner states the CDTFA rule as: cold to-go
exempt, hot to-go taxable, dine-in all taxable, except groceries — which is exactly what
`mms_taxable` implements, and it leaves `(togo, tax = 0)` as cold-or-grocery and `(dinein, tax > 0)`
as hot-or-cold. Two of four transitions are genuinely ambiguous. An earlier header claimed three were
derivable; `grocery_food` (exempt in **both** directions) falsifies it, and both reviewers caught
that independently.

So the fix is to stop losing the fact. `qr_cart_items` already snapshots `name`, `modifiers` and
`unit_price_cents` and left the category a live lookup — that is the whole defect. It now carries
`tax_category`, backfilled for every resolvable row and stamped inside
`mms_cart_item_insert_if_open`, where the item is certain to exist because the caller has just priced
off that row. The signature is unchanged, so there is no deploy window and no caller edit. The toggle
reads the line, both directions are exact, and the tag still moves.

Six cases in `supabase/tests/m17_line_tax_category_test.sql`, each pinned by its own mutant (19/19 in
`verify:mode-authority`, which now also proves from the migration filenames — not from function
identity — that its chain is complete). Residual, stated honestly: a row already orphaned when this
applied keeps the taxable default, which is unrecoverable and drains as carts close.

Also: `scripts/check-migration-versions.mjs` — a duplicate version prefix used to fail only at the
INSERT into `schema_migrations`, after CI had started a stack and replayed 92 migrations. It cost a
cycle here. Now a millisecond-scale filename check inside `verify:slice`, covering both the duplicate
and the malformed-name-is-silently-skipped shape.

### The session mode is read ONCE, and the board stops publishing dine-in on a dropped read (2026-08-23)

**M108 · M113 closed.** Three call sites re-read `table_sessions.mode` — a fact the caller already
held one frame earlier. `assertCartMember` selects that row to prove the session is
active and throws 503 when the read fails — so `addItem` and `reorderOrder` each issued a SECOND query
for the mode whose `{ error }` they discarded. An unreadable session therefore resolved to
`undefined !== "dinein"`, tagged a real dine-in table's line `togo`, and rang the to-go tax: cold food
that CDTFA Reg 1603 taxes at a table came out EXEMPT. Under-collection is the direction M97 calls the
legally worse one, and it happened on the app's busiest money fork.

The fix is a deletion, not error handling: `CartAuthz` now carries `mode`, both call sites read the
one binding, and a round-trip leaves every add. The read that survives already fails closed, so an
unreadable session can no longer decide a tax fork at all.

**Auditing for twins is what found M113.** Every other read of that column was classified rather than
assumed, and `api/board/route.ts` turned out to have the same defect failing the opposite way. It
resolves each order's session mode to keep dine-in off the order-ready board (`table_number is null`
alone does not express the rule — a dine-in session at an unregistered sticker stamps null too), and
its discarded error left the mode map EMPTY, so every comparison passed. The exposure is narrower
than "the whole table": the query already filters `table_number is null`, so a REGISTERED dine-in
table never reaches the read, and `customer_name` is one value per order — it is the staff-entered
call-out name on a dine-in order at an _unregistered_ sticker, one per order, on a screen the dining
room can read. Real, and worth stating at its true size. It now answers `reason: "unavailable"` 503 —
the refusal `board-poll.ts` already folds to retry-and-hold, so a live board keeps its last snapshot
instead of blanking — and the filter became an **allowlist** (`pickup`/`scango`, the modes SPEC-KDS §6
puts on the wall). Two rounds got that predicate wrong in the same direction before it landed:
`!== "dinein"` publishes both a row absent from an answer that DID arrive _and_ any fourth mode value
the CHECK gains later. A board defined positively has to name what it publishes.

`table_sessions.mode` is read in **eleven** places, not the four the first draft of this note claimed — `addItem` · `reorderOrder` · `api/board` · `api/session/peek` · `manual-capture-mode` · `kitchen` · `register` · `expo` · `staff-open-cart` · `create-intent` · `setup-intent`, plus the SQL that joins it. The three fixed here were the fail-open ones; the rest were re-read and each either fails closed or is caller-scoped, so no other live fail-open reader remains. The census is written out because a wrong one is how M113 stayed unfiled: a reader who trusts a count does not re-grep the shape.

Guarded red-first, both of them. `lib/cart-add-mode.test.ts` is new (the add path had no coverage at
all — a `cold_food` fixture, the only shape whose two arms produce different integers, with the cents
computed by the real `lineTax` rather than transcribed) and so is `app/api/board/route.test.ts`; three
mutants pin the rules, and `reorder-mode.test.ts`'s DB mock now carries NO `table_sessions` row, so
re-introducing either second read turns it red. M114 files the leftover: `setup-intent` fails closed
but explains itself with a sentence that is false during an outage.

### Stripe live cutover completed, and the remaining advisories pinned down (2026-08-23)

**The live webhook cutover is done.** Owner rotated `STRIPE_WEBHOOK_SECRET` in Vercel Production and
redeployed (`dpl_2t9dAXQ`, READY on `3223f9a`); the withheld `payment_intent.payment_failed` was then
restored to `we_1U7KIJ…` and the predecessor `we_1Tjz1l…` disabled. Live QR fulfillment now runs on one
endpoint, on the SDK's own `api_version` `2026-05-27.dahlia`, at the canonical
`qr.mandalaymorningstar.com`.

Verified rather than assumed, twice over. Before touching anything irreversible, the production
deployment list was checked: at the first "go" there was **no READY production deployment** since the
endpoint was created, so the rotated secret could not have been serving and deleting the predecessor
would have stopped fulfillment. After the redeploy reached READY, a **forged** `stripe-signature` was
confirmed to be rejected `400`.

**That forged-signature check proved less than it looked like, and the correction is the useful part.**
A forged signature returns `400` against _any_ non-empty secret — the correct one, the predecessor's, or
a typo. So it establishes that a secret is set and enforced; it does **not** establish that the value
matches `we_1U7KIJ…`, and with the predecessor disabled a mis-pasted secret would have left the sole
live endpoint rejecting every real delivery. The cutover was briefly recorded as complete on that
evidence, which it did not support (Codex #225 P1). The Stripe connector exposes no Events API, so
`pending_webhooks` and per-endpoint delivery status are both unreachable from a session — the gap could
not be closed by measuring harder.

**It was then closed properly: the owner confirmed the endpoint's delivery log shows all `200`s
(2026-08-23).** That is `docs/ENV.md` step 6 — legitimately signed live deliveries verifying against the
rotated secret — so the cutover is now proven, not merely applied. Recorded this way deliberately: the
sequence (claimed → challenged → actually verified) is more useful to the next reader than a clean
"verified" would have been.

The predecessor is **disabled, not deleted**: the Stripe connector exposes no delete for webhook
endpoints (list/create/retrieve/update only). Disabling is what carries the safety property — a
disabled endpoint takes no deliveries, so its now-stale secret cannot queue 72h of retries, and
`payment_failed` can never replay from it.

**M112 re-proven unreachable by a second, independent route.** The first proof concerned the GRANT
(`anon=U/supabase_admin`; REVOKE only removes grants made by the revoking role). Dropping the extension
instead is equally barred: `pg_graphql` is owned by `supabase_admin` with
`pg_has_role(current_user, extowner, 'MEMBER') = false`. Neither path is reachable from a migration, and
the Supabase MCP exposes no auth/config surface — so it is a Dashboard action or nothing. Recorded so a
third attempt is not spent on it.

**`SEND_EMAIL_HOOK_SECRET` confirmed set in production** by a non-destructive probe: the route answers
`500 Hook not configured` when unset and `401` once set, and production returns `401 Stale timestamp`.
`docs/ENV.md` now carries the one-line curl. Scope stated honestly — it proves the Vercel variable only;
Supabase-side hook enablement is not observable from here.

### Blind adversarial review — `review:bundle` + the `adversarial-auditor` agent (2026-08-22)

Owner observation, and it matched the record: across #221–#223 the Codex rounds consistently beat the
in-session adversarial pass on the same diffs. The cause is structural, not model quality — an
in-session reviewer inherits the author's frame and then confirms it. #223's P1 is the proof: the
author wrote "`mms_fulfill_order` is idempotent, so no double-fulfillment", every in-context pass
accepted it, and a blind reader asked "safe against _what_?" and found an event whose handler's own
comment forbids the redelivery the plan introduced.

- **`pnpm review:bundle`** (`scripts/review-bundle.mjs`) writes `.review-bundle/`: the raw diff, the
  full current text of every changed file, a heuristic blast radius (out-of-diff files mentioning a
  changed module), and a prompt containing no narrative. "Don't pass the history" is not enforceable
  as a rule — the author _is_ the history — so the bundle makes the isolation structural: hand over
  that directory and nothing else. Exits non-zero on an empty diff, skips secret-like paths, and keeps
  deletions in the patch while omitting them from the file copies.
- **`.claude/agents/adversarial-auditor.md`** — a spawnable agent (`subagent_type:
"adversarial-auditor"`), read-only tools. Zero agreeableness, explicit defect bias, three lenses
  (defensive · architectural · idiomatic), and a structured matrix where any CRITICAL item forces
  REJECT. Treats prose inside the diff — comments, changelog, PR body — as claims to falsify.
- **A four-part evidence standard**, added deliberately as a counterweight to the aggressive prior:
  every finding needs a `file:line` anchor, an exact trigger, an observable consequence, and a
  **disproof condition**. Two of three Codex rounds on #223 reached right conclusions through invented
  mechanisms, and the mechanism is what the next reader trusts. No disproof condition means it is an
  open question, not a defect.
- The **HARD CAP is untouched** (≤3 lenses, ≤10 agents, ~15 min, never relaunch). Isolation makes each
  agent's input smaller, not the budget larger.

Recorded as `.claude/LEARNINGS.md` #55; `CLAUDE.md` and `docs/WORKFLOW.md` now route the adversarial
step through the bundle.

**Codex round 1 found nine real defects in the review tooling itself**, which is the strongest
available evidence for the premise. Every one was verified against source before it was fixed:

- **P1** — with every changed path secret-like, the allow-list pathspec was empty and
  `git diff <range> --` has no pathspec at all, so git emitted the **unrestricted** diff and wrote the
  credential into the patch the bundle swears never contains one. Reproduced on a throwaway repo whose
  only change was a tracked `.env`; the patch is now 0 bytes and the omission is listed in
  `MANIFEST.md` rather than only on stdout.
- **P1** — the auditor was granted `Bash` while the changelog called its toolset read-only. On a
  hostile branch that is arbitrary execution with the parent session's credentials. Narrowed to
  `Read`/`Grep`/`Glob`, and the constraint is now stated in the agent prompt so a later editor knows it
  is load-bearing.
- Allow-listing destination paths rendered a **pure rename** as an addition with no deletion, hiding
  that the old module vanished — replaced with `:(exclude,literal)` pathspecs, which also fixed the P1.
- `a/b__c.ts` and `a__b/c.ts` **both flattened to `a__b__c.ts`**, the second write destroying the first
  while `MANIFEST.md` claimed both were present. Names are now assigned once with collisions suffixed.
- `.env.example` — the canonical env-var list per `README.md` — was being **filtered out as a secret**,
  hiding deployment-contract changes. Placeholders are exempt.
- Git **quotes non-ASCII paths** by default (`café.ts` → `"caf\303\251.ts"`), so the pathspec matched
  nothing and the manifest called a present file deleted. Now `-z` NUL-delimited.
- A **dirty worktree** was silently excluded while `PROMPT.md` called the bundle the complete change.
  Now aborts, matching `verify:slice`.
- The blast radius listed **filenames only**, but the evidence standard demands a `file:line` quote and
  forbids reading outside the bundle — so an architectural finding could only ever be an open question.
  Now carries `file:line` plus the matching source line.
- A dynamic route built the term `staff/table/[id]`, which `git grep` reads as a **character class** —
  it matched a file containing `staff/table/i` and missed every real caller. Terms truncate at the
  first dynamic segment and search fixed-string.

**Codex round 2 found four more, one of them the sharpest yet.**

- **P1** — the secret filter was **escapable by renaming**. `--name-only` reports only a rename's
  destination, so `.env.secret` → `safe.txt` passed `isSecret` on the innocuous name and the script
  copied an AWS key into `FILES/safe.txt`. Reproduced end-to-end. Now parsed from `--name-status -z`,
  which carries both paths (`R100`, old, new); an entry is secret if **either** side matches, and both
  sides go into the exclusion pathspec so the old blob cannot surface in the patch either.
- Callers of **deleted** and **renamed-from** modules were never searched, because terms came from the
  files that still exist. That is the one case the architectural lens most needs — an unchanged caller
  importing a module that just vanished. Terms now come from the union of present, deleted and
  renamed-from paths; verified reporting `Consumer.tsx:1 — import { helper } from "@/lib/order-helper"`
  for a module deleted in the same commit.
- `existsSync` **follows symlinks**, so a changed-but-dangling one was labelled deleted while its blob
  was perfectly readable. `git show` is authoritative for presence at HEAD and is now the only test.
- A deep path flattens into one component and can breach the filesystem's 255-byte limit, throwing
  `ENAMETOOLONG` **after** the previous bundle was removed — no bundle at all. Names now bound at 200
  bytes with a content hash; verified at 197.

**Codex round 3 found three more**, and per the round-3 rule these landed because a credential leak is
not a shrinking-materiality nit:

- **P1** — the round-2 rename fix did not cover **copies**. Rename detection is on by default; copy
  detection is not, so with `.env.secret` left in place and copied to `safe.txt`, `--name-status`
  reported only `A safe.txt`, the source never reached `isSecret`, and the credential landed in both
  `DIFF.patch` and `FILES/`. Reproduced. Now `-C --find-copies-harder` — the latter is what makes
  UNCHANGED files eligible as copy sources, which is exactly this case — feeding the same both-sides
  filter, which already handled the `C` status.
- `slice` counts UTF-16 code units while the bound is in **bytes**, so a multibyte path could still
  breach the limit after "truncation". A 300-character CJK stem sliced naively measured **564 bytes**
  against a 188-byte budget; the byte-budget version yields 186.
- A changed **binary** file was skipped without being recorded, so the manifest's fallback reported it
  as `_deleted_` while the patch said only "Binary files differ" — a materially false account of the
  change. Binaries are now tracked and labelled present-but-binary; verified with a PNG.

### Connector sweep — Supabase · Stripe · Vercel (2026-08-22)

A full read-only check of all three connectors. Vercel was clean (zero runtime errors in 7 days);
Supabase healthy with no 4xx/5xx in its edge logs. Two things were not.

**The Stripe webhook delivered only 2 of the 6 events its handler implements.** The **test-mode**
endpoint (`we_1TkFUz…`) carried three events, but one of them (`payment_intent.created`) has no handler at all, so the overlap with
the six implemented types was two. `charge.refunded`,
`payment_intent.canceled`, `setup_intent.succeeded` and `payment_intent.amount_capturable_updated`
were all unsubscribed — so a refunded order never flipped `qr_orders.status` (and the M4 Star never
receded), a canceled split-share hold stayed on the board as live money, a saved card never flipped
the tab to `secure`, and manual capture never completed. The Supabase Stripe **sync** endpoint
subscribes to ~90 events but does not substitute: it mirrors into `stripe.*` tables the app never
reads (`grep` returns zero hits). All four added to it.

**Both modes needed that fix, and the first pass only checked one.** Stripe webhook endpoints are
**per-mode objects**, so the sweep's “the endpoint” was never the whole story: it examined the test
endpoint and left the LIVE one (`we_1Tjz1l…`, a separate object on a different production alias)
still carrying only `payment_intent.succeeded` + `payment_intent.payment_failed`. That was inert
while Production ran test keys — and stopped being inert the moment it ran live ones, which enabling
Apple Pay requires. The live endpoint now carries the same six, so a live refund, a released hold, a
saved card and a manual capture all reach their handlers. It is subscribed to **exactly** the six the
route implements; the test endpoint additionally carries the handler-less `payment_intent.created`,
left alone as pre-existing noise rather than churned. Both remain pinned to `api_version`
`2022-08-01` against an SDK on `2026-05-27.dahlia`, and that half needs a new endpoint plus a signing-
secret rotation (below).

**91 Supabase security advisories triaged to two actionable items**, the rest being this app's design:
28 anonymous-sign-in notices (diners ARE anonymous), 21 `rls_enabled_no_policy` (deny-all = the safe
shape), 7 SECURITY DEFINER RLS helpers (`anon_exec=false`, `search_path=''`, and RLS cannot work
without them), 2 more that are TRIGGER functions and not callable at all — verified on production:
`trigger functions can only be called as triggers` — and 3 mutable-`search_path` functions inside the
vendor `stripe` schema.

Of the two that remained, only one was fixable, and finding that out was the useful part:

- the `auth_rls_initplan` warnings are on policies that **never execute**. `mms_profiles` and
  `mms_rewards` grant SELECT to `service_role` only, and a policy can only narrow what a GRANT
  permits. The InitPlan rewrite ships anyway as hygiene, documented explicitly as **not** a
  performance fix so nobody cites it as one.
- the `pg_graphql` revoke is a **silent no-op** — the grant is owned by `supabase_admin` and
  `postgres` cannot revoke it. Removed rather than shipped, and filed as M112. It was caught only
  because the test asserted the outcome instead of trusting the statement.

`supabase/tests/advisor_sweep_test.sql` guards what actually protects those tables — the absence of a
client grant — rather than the dead policy. Both cases induced red against production first.

### Staff sign-in on every surface, and sessions that survive the night (2026-08-21)

Owner: _"I want the kitchen staff portal, kiosk, board, and front house staff portal, to login with
OTP email via url and stays logged in on device until logged out."_

**Why it did not stay logged in, measured rather than guessed.** Two independent causes, and neither
was the login:

1. **Nothing refreshed the session server-side.** `@supabase/ssr`'s browser client persists to
   cookies and refreshes the access token WHILE A TAB IS OPEN AND AWAKE. It cannot do that for the
   request that arrives after the tab was closed, after a wall display slept, or on the first cold
   navigation the next morning — the server reads an expired JWT, `getStaffAuth()` answers `anon`,
   and the shell redirects to the login. A Server Component cannot fix this itself: RSC render is
   READ-ONLY for cookies, so even when the SSR client refreshes it has nowhere to persist the result.
   `proxy.ts` now does it, scoped to `/staff`, `/kiosk`, `/board`.
2. **`AnonAuthGate` was signing staff out on purpose.** It exempted `/staff` only, so a staff session
   on `/kiosk` or `/board` was swapped for an anonymous diner session within a second of landing.
   Both surfaces are now exempt.

⚠️ An earlier note in this session said "no middleware.ts — that's where staying-logged-in lives".
That was wrong: Next 16 renamed the convention and this app has had `proxy.ts` all along (it carries
the per-request CSP nonce). The refresh is a scoped addition to it, not a new file — and the scoping
matters, because that matcher covers EVERY document route and an auth round-trip in front of every QR
scan would be a real cost on the hot path for anonymous sessions that need none of it.

**All four surfaces now take the same email sign-in.** `/staff` (front-of-house, kitchen, expo) had
it; `/kiosk` and `/board` gain it via `lib/device-auth.ts`, which replaces two hand-copied
constant-time token checks with one gate accepting EITHER the device token OR a staff session.

Two properties were nearly lost adding that, and the existing suite caught the first:

- **A wrong token used to cost zero database work** (`kiosk.test.ts` counts queries). Falling through
  to `getStaffAuth()` on every miss quietly retired it — an anonymous client hammering `/kiosk?k=wrong`
  would each buy a `getUser()` round-trip plus a `staff` row read. The staff lookup now runs only when
  the request actually carries a Supabase auth cookie: a routing hint, never a credential, since
  `getStaffAuth` still verifies the session and the row.
- **The token is checked BEFORE auth**, so a bookmarked device keeps working through an auth-plane
  outage instead of acquiring a new dependency on it (W10b's rule, one surface further out). A failed
  auth read is now `unavailable`, never `denied` — a 401 would tell a running TV it had been
  de-authorized during a database blip.

**Landing where you signed in.** `/staff/login?next=/kiosk` carries the destination through both the
magic link and the Google redirect, so an email opened on the lobby iPad lands on the kiosk rather
than the console — which matters most on a screen with no keyboard to re-type a URL with. `next`
arrives in a URL and rides into a mailbox, so it is treated as attacker-controlled: `lib/safe-next.ts`
rejects the two candidates a naive predicate accepts — `/\evil.com` (a backslash aliases to `/`) and
`/<TAB>/evil.com` (TAB/LF/CR are STRIPPED before parsing), both of which resolve to `https://evil.com`
— then resolves against a throwaway origin and demands it back, and finally allowlists the three
sign-in surfaces. A test asserts the PREMISE too, so if a runtime ever stops normalizing those the
comments get rewritten rather than trusted.

**Codex round 1 found SEVEN — 4×P1, 3×P2 — and all seven were real.** Every P1 lived in a CLIENT
consumer of a server contract this slice changed, which is precisely why the self-review missed them:
the modules were tested, their callers were never opened.

- **The board never polled without a token.** `ReadyBoard` initialised to `unlinked` and returned
  early from `poll()` on an empty token, so the documented `/staff/login?next=/board` flow dead-ended
  on "not linked" — the headline feature, non-functional. It now starts LOADING and lets the server
  adjudicate, because a staff session lives in a cookie the client cannot read.
- **`window` was read during server render.** `StaffLogin` is a Client Component, but Next still
  SSRs it, and a `useMemo` factory runs in that pass — so the callback URL threw before the page
  could paint, taking the whole sign-in surface down. The original code read `window` inside the
  handlers for exactly this reason; moving it somewhere tidier broke it.
- **The refresh dropped cookies.** `setAll` rebuilt the response per cookie, discarding each prior
  `Set-Cookie`, and `rebuild()` closed over a header clone taken BEFORE the cookie writes. A real
  session is CHUNKED (`.0`/`.1` once the JWT passes 4KB), so only the last chunk shipped — half a
  session, which reads as none. Invisible on a short token, permanent on a real one, in exactly the
  overnight path this exists for. Now accumulates and builds once, and `build()` re-reads the request.
- **The kiosk lost its anonymous session.** Exempting `/kiosk` outright stopped `AnonAuthGate`
  minting the anon user `openKioskOrder` requires (`no_auth`), so a token-only kiosk could not start
  an order. The exemption is now `keepStaff`: it suppresses only the sign-OUT swap and leaves the
  mint alone.
- **An auth blip blanked a live board**, because `ReadyBoard` treated every 503 as unlinked. The API
  now says `reason`, and only `not_configured` is a verdict about the device.
- **`unavailable` was flattened to `denied` on the kiosk reset**, and its detached abandonment path
  only retries `error` — so a blip left the cart live and a dine-in table reported occupied until
  TTL. Reverting that fix left every other test green, so it is now pinned red-first.
- **The parked destination survived a typed-code sign-in**, so a later default login consumed a stale
  `/kiosk` destination. Cleared on that path, and the default case now clears rather than no-ops.

56 new tests (931 qr). `docs/ENV.md` carries the two dashboard settings that decide how long "until
logged out" actually is — neither is in code.

**Codex round 2** found three more, two real defects and one accepted trade:

- **The callback decoded the parked destination twice**, and Next's request-cookie parser had already
  decoded it once. A device token is base64: `k=aB%2Bc%2Fd%3D%3D` survives one decode and becomes
  `k=aB+c/d==` after two — and `+` in a query string means SPACE, so `/board` read the token as
  `aB c/d==`. The token-first fallback that exists to outlive an auth outage was silently dead on
  the one path nobody re-tests after signing in. Measured, then pinned by a route test that runs the
  written cookie through the REAL parser rather than typing out what it thinks Next does.
- **A repeated `?next=` crashed the sign-in page.** Next hands `?next=/board&next=/kiosk` through as
  a `string[]`, which sails past `!raw`, past `STRIPPABLE.test` (it stringifies), and then dies on
  `raw.startsWith` — a crafted URL returning a 500 instead of the login form. `safeNext` now takes
  `unknown` and rejects on TYPE, including an object that stringifies to a permitted path.
- **A staff sign-in on the kiosk or board is a full console session** — origin-wide, so `/staff` on
  that device accepts it. Reported correctly; **deliberately not taken**, per the owner's "staff
  login, no extra restriction" (the point of the slice is testing production flows). Filed as M111
  with the one-line close, since the console lock already exists.

Also pinned the round-1 cookie fix, which had shipped with no test at all: `withRefreshedStaffSession`
now has four, and the chunked-rotation case was watched failing against the old shape first.

**The in-session adversarial pass** (3 lenses — security/privacy · concurrency · product truth) then
found **six more, all real**, and the headline one means the feature did not work:

- **The tokenless kiosk could never open an order.** `kioskOpenInput.k` was `z.string().min(1)`, and
  the parse runs BEFORE `authorizeDevice` — so on an iPad signed in via `/staff/login?next=/kiosk`,
  with no `?k=` by design, every tap returned "Something went wrong — please order at the counter."
  forever. It hid because the tokenless case was proved against **board**, whose route calls the gate
  directly with no schema in front of it. A contract tested through one caller says nothing about
  another. Bound kept at `.max(200)`; the gate still refuses an empty token when one is configured.
- **A bodyless 503 blanked a live board.** `body?.reason !== "unavailable"` is `true` when `body` is
  null, and a platform-level 503 (Vercel throttle, paused deployment) answers with an HTML page that
  will not parse. The least informative response we can receive was treated as the most authoritative
  one — the same W10b shape as the round-1 fix, one layer further out.
- **A board that BOOTED into an outage said "Connecting…" indefinitely**, over a Ready column reading
  "Ready orders light up here." It never reached `live`, so the failure fold sent it back to
  `loading` forever. There is now an `offline` state that says the true thing and escalates to the
  paper instruction past the shared two-minute window.
- **"Isn't linked — open the board with its device link"** was rendered to installs that have no
  device link, discarding the honest sentence the API had already written. The verdict now carries
  the server's own message plus the recovery that actually applies.
- **The 5s poll had no in-flight guard**, so a late response rewound `prevReady` and the next tick
  re-flashed and re-CHIMED an order already called — sending a customer who collected their bag back
  to the counter. Every other staff board already had this lock.
- **A dead arm in `safeNext`'s allowlist** (`startsWith(`${p}?`)`) — a resolved `URL.pathname` can
  never contain a raw `?`. Harmless, but its comment credited it with keeping `/board?k=…` working
  when `path === p` is what does, so a maintainer trimming the "redundant" line could delete the
  load-bearing one.

**Codex round 3** found one more, and it is the last: `next=/staff/login` and `/staff/auth/callback`
were accepted as post-auth destinations, so a successful sign-in could land you back on the login
page — which reads as a failed sign-in, on exactly this flow. Reported as an infinite redirect loop;
traced, it terminates in three hops (each peels a layer, a bare `/staff/login` falls back to
`/staff`, no fixed point). The bounced sign-in is the real defect and is closed by segment-matched
exclusion, so a future `/staff/logins-report` is unaffected.

Three of the adversarial findings lived in `ReadyBoard.tsx`, which has no test and **cannot** have one (vitest here is
`environment: "node"`, `include: ["**/*.test.ts"]`). So the poll's two decisions moved to
`lib/board-poll.ts` as pure functions with 11 tests — the repo's own rule that decision logic belongs
in `lib/`, applied outside the money paths for the first time. `mintFail` also grew honest arms:
`unavailable` and `no_auth` are transient and the guest's next tap fixes them, so sending that person
to the counter was both false and the most expensive possible answer.

### M100 · M107 — the session's mode is the authority, and two RPCs never asked (2026-08-21)

`Checkout.tsx` renders the For-here/To-go pills and "Make it now" behind `isDineIn &&`, and its own
comment says why that gate fails closed on an unknown mode: "a missing control costs a tap, a wrong
one costs the order". A Server Action is a public POST, so the gate is advisory — and neither
`mms_set_line_fulfillment` nor `mms_fire_line` ever read `table_sessions.mode`. Measured on a
migrated database, one $14.00 cold-food line on a `pickup` session:

    mms_set_line_fulfillment(line,'dinein') -> ok    fulfillment=dinein  tax_cents 0 -> 147
    mms_fire_line(line)                     -> ok    state=fired         cart status=open
    …settle it, then mms_init_togo_status   -> NULL  expo-visible lines: 0

**M100's money is the smaller half.** `getCartTotals` reads a line's `tax_cents` only as a boolean
taxable flag and taxes the whole `unit_price_cents * qty`, so the tag moves the ENTIRE line across
the taxable base — 147¢ of tax CDTFA does not levy to-go, on the only two fulfillment-sensitive
categories (`cold_food`, `beverage_cold`). The larger harm is routing: `mms_init_togo_status` stamps
`preparing` only when a `togo`/`grocery` line exists and `expo.ts` reads
`.in("fulfillment",["togo","grocery"])`, so a SINGLE-line pickup order tagged dine-in settles with
`togo_status` NULL and zero expo lines — /track never leaves "Order placed", nobody bags it, nobody
calls the customer. The food is still cooked (`mms_fire_pending_food` lost its mode gate in W3), so
it reaches the pass with no destination. A paid order that no staff surface shows.

**M107, found while proving M100.** `mms_fire_line` needs only an open cart and a `togo` line, which
every pickup cart satisfies BEFORE payment, and `kitchen.ts` reads carts `in ('open','paid')` — so an
unpaid pickup line lands on the KDS, against that file's own comment that "pickup/scango only ever
fire paid". Dine-in fires pre-payment by design; pickup and scan-and-go are pay-first.

**Neither is a new idea.** `mms_fire_cart` and `mms_fire_pending_food` have joined `table_sessions`
inside their write since S4.2. Four lines differ per function against a verbatim restatement.

**The guard is one-directional.** `dinein` is what a non-dine-in session may not reach; `togo` stays
open on every mode, because a guard phrased "no toggling off a dine-in session" passes every refusal
case and traps a mis-tagged line as permanently taxable — the damage, made unfixable.

**Reachability, measured on the live project rather than reasoned.** Fourteen mode/tag/state/status
combinations exist and exactly ONE is illegitimate: `pickup/dinein/draft/paid`, 2 lines on 1 cart. So
the hole has been REACHED in production — and the instance that landed is harmless on both axes,
which is part of reporting it honestly: both lines are `hot_prepared` ($13.00 Nan-Gyi Mont Ti and
Shan Noodles), which `mms_line_tax` prices at 137¢ dine-in AND 137¢ to-go, and their order carried
four other bag lines so `togo_status` stamped and the expo saw it. ⚠️ An earlier draft of the
migration header justified the one-directional guard with "rows tagged `dinein` on a pickup cart
exist today — every line written before this applies". That is FALSE: `addItem` yields `togo` for
every non-dine-in mode and the S4 backfill did the same, so the only writer that can produce this
shape is the toggle itself.

**A green run proves nothing on its own, and here the reason is structural.** `plpgsql` ASSERT stops
at the FIRST failure, so running the new eight-case SQL test red-then-green proves ONE case and
silently skips seven — a statement about one case offered as if it covered eight.
`scripts/verify-mode-authority.mjs` is the missing half: twelve mutations of the live functions, each
requiring a green BASELINE first (or an already-red case is credited to the mutant), a changed
`md5(prosrc)` (a patch that never applied would otherwise read as a hole in the test), and the NAMED
case — not merely some case — to be the one that reddens, then a byte-identical restore. One mutant
is a documented SURVIVOR: it MEASURES the migration header's claim that the in-write mode term cannot
diverge from its pre-check while `table_sessions.mode` is immutable, instead of leaving that claim an
untested comment. Its complement proves the term still earns its place — delete the PRE-CHECK and the
write is still refused, the verdict degrading to `stale` rather than a dine-in tag reaching a pickup
line.

**Three defects the battery found in its own first draft**, all invisible from a passing run: a
mutant credited to the WRONG case (replacing the pre-check outright makes case 1 fail with `stale`,
so it never reached the case it named); two test cases with no mutant at all (the reverse dine-in
flip, and the end-to-end expo assertion — the latter falsifiable only by mutating
`mms_init_togo_status`, a function this migration does not contain, because mutating the guards makes
case 1 fail first); and a startup assertion that was itself decorative — it hashed and restored one
function at a time, so the first iteration's restore healed the drift the second was looking for, and
stubbing out `mms_fire_line` produced a clean pass until the loop was split in two.

`makeItNow` had **no test at all** before this — the suite mocked `makeItNowInput` and never called
the action. The rule has ONE home and it is the SQL statement; what the TS tests pin is that the
verdict reaches the caller by NAME rather than flattened into a generic "error", with a
`verify:slice` mutant on each of the two callers (199 total).

Scoped out and filed rather than folded in: **M17** (same RPC, but a different product decision and a
fixture none of the eight cases produce — and M100 narrows it, since an orphaned line on a
non-dine-in session can no longer be flipped to `dinein` at all) and **M108** (`addItem` and
`reorderOrder` discard their session-mode read's error and default to `togo`, where the
`staff-open-cart.ts` read beside them fails closed).

### M102 — the second session, and a battery that says what it proves (2026-08-21)

M97 added a concurrency guard to `mms_merge_table_orders` and shipped it **reasoned-correct and
unproven**, saying so in its own header: none of its predicates can differ from the cursor's values
without a concurrent committed write, and every file in `supabase/tests/` is single-session by
construction. `scripts/verify-merge-race.mjs` is that missing session — three `psql` processes, no
new dependency, ~4s.

**How the window is entered.** B mutates the SOURCE row and holds its transaction open. A calls the
merge: it takes the cart locks, opens its loop cursor — reading the source at its pre-B value,
because a reader never blocks on an uncommitted write — locks the target, and BLOCKS at the guarded
DELETE, the statement under test. B commits; A's delete re-checks its WHERE against the new tuple
under EvalPlanQual and refuses. The sync device IS the production mutation (a diner tapping `+`
mid-merge is literally `update … set qty`), and the wait graph is acyclic by construction: B takes
its only lock before A starts and requests nothing after.

**Eleven scenarios.** C0/C1 are CONTROLS and are not optional — every scenario that asserts the guard
REFUSES is also passed by a `delete … and false` mutant, so the controls are the only thing proving
it still ALLOWS a legitimate fold. S1–S6 cover qty, state, comped, price, fulfillment and notes, and **S1b/S4b cover the OTHER
DIRECTION of the two numeric ones** — every scenario mutating its column one way makes the whole
`>=`/`<=` mis-write family invisible, and `and qty >= r.qty` (a one-character typo) survives a
decrease while destroying a unit on the increase that every document here names as the hazard. The
repo already states that rule in `m98_merge_matches_price_test.sql`; M102's first version dropped
it. S7
covers the TARGET: B re-prices the target row, and the match query's `for update` forces READ
COMMITTED to re-evaluate against the new version and skip it, so the source re-parents at the price
it was quoted instead of being folded into a line now priced $10.00.

**A committed battery, because a green run proves nothing on its own.** `--mutants` applies fourteen
mutations to the LIVE function and requires each to be caught by the scenario that names it, with
the controls staying green. Every mutant asserts the pattern still matches, the apply succeeded,
`md5(prosrc)` actually changed, and the body is restored byte-identical — the first ad-hoc version
reported a SURVIVOR that was really a malformed `sed` leaving a syntax error, so the mutant never
applied and the harness ran against the unmutated function. It also proves a GREEN BASELINE before
the first mutant, or an already-failing scenario is credited to whichever mutant names it. Wired
into CI.

**Defects only the battery could find**, all invisible from inside a passing run: S7's first version
asserted liveness alone and its mutant SURVIVED (removing the `for update` does not stop A blocking —
the bump takes the same row lock one statement later); the fixture was DEGENERATE, both lines at
qty 1, so a fold's `v_moved += r.qty` could not be told from a literal 1; and `assertFoldable` — the
hand-copied anti-degeneracy check — was LOOSER than the fold it copies, omitting the modifier key
and the qty cap. Its header claimed it "fails safe: a stale copy returns 0 and this aborts", which is
exactly inverted: an omitted predicate makes the copy looser, so it passes while the real fold
refuses, and six scenarios then land on their expected numbers via the no-match path having never
entered the guarded DELETE.

**A correction, not a discovery**: the `provolatile` guard's stated reason was false. It claimed
marking the function STABLE would make every scenario "go green having proved nothing". Measured, a
non-VOLATILE plpgsql function cannot run its first statement — `ERROR: SELECT FOR UPDATE is not
allowed in a non-volatile function` — so it goes loudly RED. The assertion is kept because it turns
that mid-run error into a named refusal; it is a diagnostics guard, not a silent-green one.

**It COMMITS, and nothing else in this repo does** — session B must see session A's fixtures, so
they cannot live in a rolled-back transaction. It therefore takes no DSN argument at all, states its
transport (`sslmode`/`gssencmode`) rather than inheriting libpq defaults, scrubs every libpq variable
that could redirect it OR flip a guard predicate, and refuses in-DB on three measured facts: `ssl`,
a private/loopback `inet_server_addr()`, and the absence of any cart line that is not its own.
`usesuper` is PRINTED and deliberately NOT asserted — an earlier version asserted it, on a value that
had been reasoned rather than measured, and it is `f` on hosted AND `f` on the CLI stack, so the
first CI run refused to run at all. `inet_server_port()` is 5432 on both and must never be used.
Every write is behind a latch set only when that refusal RETURNS, so a throw inside it cannot fall
through to the top-level catch and make cleanup's cascading delete the first thing to touch the
database. A session advisory lock stops two runs deleting each other's committed fixtures.

### M104 — the next add really does get the new price (2026-08-21)

`insertOrIncLine`'s sibling query matched a repeat add on cart, item, fulfillment, state, notes, seat,
adder and modifier labels — but **not on `unit_price_cents`**. On that merge branch the price
`priceItem` had just re-derived from the live menu was **computed and discarded**, because
`mms_cart_item_inc_qty` carries no price and only bumps qty. So the second unit was charged at the
_first_ add's snapshot.

**This was not a "the quote holds" policy**, and `menu-price.ts` is where that gets settled. Its own
header promises: _"the new price takes effect on the NEXT add, everywhere at once (diner menu,
register, kiosk, reorder), because all four go through `priceItem`."_ Going **through** `priceItem` is
not the same as **using** its result — the promise was the intended behaviour all along, and this
predicate is what makes it true. That header now records that the bullet was false until this shipped.

Nor was the old behaviour coherent as a policy. Whether the second unit got the old price was decided
by the _other_ merge predicates: the new price after "send to kitchen" and the old one before it, the
new price with an allergy note and the old one without. **No quote-holding policy is keyed on allergy
notes.**

**Both directions bite.** A price rise under-charges the restaurant; a price **drop** charges the
diner _more_ than the menu is showing. On the real applied Balachaung edit ($3.00 → $10.00) that is
**−774¢ on a rise and +773¢ on a drop** for the second unit — asymmetric, because `computeTotals`
rounds ONE aggregate taxable base rather than each line, and 1300¢ × 10.5% = 136.5 rounds up. (Both
figures come from running `computeTotals` itself, not from differencing per-line taxes by hand: an
earlier draft wrote the pair as "±774¢", and a review round differencing it the other way proposed
"±773¢". Neither is right; the engine is.) Up to **98 units** can ride one stale snapshot (the qty
cap) — then it freezes
verbatim into `qr_order_items` and travels to the receipt, the email, `/track`, refund math and QBO.
Nothing notices, because create-intent and the webhook reconcile both derive from the same row.

**Fewer preconditions than M98**, which is why it was filed as the more reachable twin: one cart, one
diner, one open session — versus two carts, two active sessions, a seatless target and a matching
adder. Already-quoted units are untouched: a mismatch inserts a **fresh line** at the current price
rather than re-pricing anything, so `menu-price.ts`'s other promise still holds exactly.

Guarded by three cases in `lib/order-lines-seat.test.ts` (filters, not outcomes — the harness's `eq`
is a no-op, so a behavioural assertion would prove the mock) and by the new
`order-lines/second-add-keeps-the-stale-price` mutant. `.eq` and never `.is`, because
`unit_price_cents` is `not null` — the opposite conclusion from the `by_seat`/`added_by` predicates
directly above it, which is the same three-nullability-stories trap M98's migration header names.

### M98 — the merge fold must match on `unit_price_cents` too (2026-08-21)

The **price** hole in the fold's identity key, the one M97's registry row explicitly left open.
⚠️ An earlier draft called it the _last_ hole. That is **refuted, twice over** (adversarial review):
`modifier_option_ids` is still unmatched — the fold keys on the display-LABEL array, which is exactly
the lossiness M3 exists to fix and which M3's own header names ("the SQL fold key rides display
text") — and the same price hole exists on the ordinary **add** path (M104), which needs one cart and
one diner rather than two active sessions. Filed as M103 and M104 rather than claimed closed.
`mms_merge_table_orders` matched on seat, adder (M96), tag (M97), state, notes, item and modifiers —
but not on **price**. It bumps the target's qty and **deletes** the source row, so the source's units
silently adopt the target's price snapshot.

Two carts hold the same dish at two prices because `setMenuPrice` writes `menu_items.base_price_cents`
**live**, and says so: _"Lines ALREADY in a cart keep the price they were quoted … nothing here
touches `qr_cart_items`."_ A cart line is an insert-time snapshot, and the price editor is a floor
surface sitting beside the 86 button.

**Worse than M97, and the registry understated it.** Error = `srcQty × (targetPrice − sourcePrice)`
on the subtotal, plus 10.5% tax on that, plus the tip riding the corrupted net. M97 was capped at
10.5% of one line and only bit cold categories — a hot dish's tag flip cost nothing. This is
**uncapped**, multiplies by qty, and applies to every category. On the real applied Balachaung change
($3.00 → $10.00), one unit each side is **+773¢ or −774¢**, and which one depends only on the merge
direction, so there is no safe ordering. Break-even against M97's worst case is a price edit of about
**$1.33**.

**`=` and not `is not distinct from` — right operator, different reason.** `unit_price_cents` is
`not null` since `create table`, with no default and no `alter` ever touching it. Do not copy M97's
argument one row down (`fulfillment` is not-null _with_ a default and a backfill), and note that
`added_by` two rows above needs the opposite operator because it _is_ nullable. Three adjacent
predicates, three different nullability stories.

**Reachability, stated honestly:** nothing in production can hit this today — a probe found **0**
non-closed `table_sessions`, so every merge raises at the "both tables still active" gate before
reaching the loop. That is a pre-launch fact, not a safety property: both preconditions are
by-construction, and prod already holds the shape (several menu items sit at two distinct
`unit_price_cents` across existing cart lines). A correctness tightening on an unreached path, not an
incident.

The predicate joins the **guarded delete** too, and the reason is deliberately not the `qty` reason:
the fold does no arithmetic on price, so omitting it would yield "decided eligibility on a stale
price" (the `fulfillment` class) rather than a destroyed unit (the `qty` class). It is included
because the column's immutability today rests on two _caller conventions_ — an early return and one
call site that omits the argument — not on a database guarantee. ⚠️ Reasoned-correct and **unproven**:
no single-session SQL test can make that branch fail (M102).

Pinned by `supabase/tests/m98_merge_matches_price_test.sql`.

⚠️ **The first version of this entry claimed the test was "watched failing on CI". It was not, and it
could not have been** (adversarial review, HIGH). `ci.yml` triggers on `pull_request` and on pushes to
`main` — nothing else — so the test-only commit, pushed while the previous PR was already merged and
this one did not yet exist, produced **zero** check runs. M97's identical claim is sound only because
_opening_ its PR triggered CI at the then-head. The red was therefore re-obtained for real, by
removing the migration on an open PR and watching the SQL job fail, and this entry now points at that
run. A reasoned assertion written in the language of an observation is the exact failure this repo's
first rule exists to prevent.

**Cases 1 and 2** open with an **anti-degeneracy assert** that their two lines are foldable on every
other predicate and differ only on price — because a fixture that quietly violates an unrelated
predicate has passed for the wrong reason twice in this repo's merge tests, caught by review both
times rather than by the suite. Cases 3–5 cannot carry it (3 and 4 are same-price by construction, 5
holds two candidates), and an earlier draft wrongly claimed all five did. Case 5 is labelled order-dependent (`limit 1` with no
`order by`) and is never the only case catching a mutation.

### M97 — the table-merge fold must match on `fulfillment` too (2026-08-21)

`mms_merge_table_orders` folds a source line into a matching target line by bumping the target's qty
and **deleting** the source row. The match tests state, notes, `by_seat`, `added_by` (M96), the menu
item and the modifier key — but not `fulfillment`, while `insertOrIncLine` has always refused exactly
that fold on the client side (_"a for-here add must NOT merge into a to-go line (different
routing/tax)"_). `mergeTables` blocks cross-**session-mode** merges, which is a different thing: two
dine-in tables are always eligible, and either one's lines may carry any tag.

**This is a wrong charged amount, not only a wrong kitchen route.** `getCartTotals` reads a line's
stored `tax_cents` **only as a boolean** taxable-or-not flag and taxes the full `unit_price_cents ×
qty`; cold food and cold beverages are taxable dine-in and exempt to-go (CDTFA Reg 1603). The fold
deletes the source row, so its units inherit the target's tag and the target's `tax_cents` wholesale,
and nothing recomputes:

- to-go folds into dine-in → both units taxable → **the guest is over-charged**
- dine-in folds into to-go → neither taxable → **California sales tax is never collected**

On a $14.00 cold-food line that is **147¢ in each direction**. Nothing downstream notices: the
PaymentIntent amount and the webhook reconcile are derived from the same corrupted rows and therefore
agree, so `mms_fulfill_order`'s amount-mismatch assert never fires, and the tag is then copied
verbatim into `qr_order_items` — permanent through receipt, email and `/track`.

**`=` and not `is not distinct from`.** `fulfillment` is `not null` with a backfill, so plain
equality is right — matching the `state` and `menu_item_id` predicates beside it. The line directly
**above** needs `is not distinct from` for the opposite reason (`added_by` is nullable and never
backfilled). They are different on purpose, and no test can tell the two operators apart here, so
`m97_merge_matches_fulfillment_test.sql` says so rather than shipping a case that pretends otherwise.

**Scope, stated honestly:** the live collision is `dinein ⇄ togo` only. A grocery line cannot reach
the fold at all — its `menu_item_id` is a barcode and a food line's is a uuid, so the existing item
predicate already separates them, and it carries a real `by_seat` so it can never be a fold target.
The registry's original wording ("a `togo` **or `grocery`** source line") was wrong and is corrected. A second ground offered for grocery's unreachability — _"it carries a real `by_seat` so it can never
be a fold target"_ — is also **false** and is withdrawn: the re-parent branch nulls `by_seat`, so an
already-re-parented grocery line is seatless and is a perfectly good target. The conclusion stands on
the item-id half alone; the wrong half is recorded because a wrong reason for a right answer is how
the answer later gets overturned.

The test was committed **before** the fix and CI was watched failing on it — there is no Docker in
this container, so CI is the only place a SQL guard can be seen to bite.

**A predicate on a MUTABLE column needs more than a predicate** (Codex round 1, P2 — real, and
specific to this change). The loop runs on a READ COMMITTED snapshot, and `fulfillment` can change
under it: a diner taps For-here/To-go mid-merge and `mms_set_line_fulfillment` commits, because that
function takes no lock on `qr_carts` — it only _reads_ `status` through an `exists`, and a reader
never blocks against `for update`. A stale `r.fulfillment` would then fold a now-dine-in row into a
to-go target: the exact wrong tax this change exists to prevent, back through the door. M96 needed
none of this, because `added_by` is immutable by trigger and cannot change under a cursor.

Both halves are closed without widening the lock footprint beyond the rows being written: the target
is held by a `for update` on the match query, and the source re-asserts its own identity **in the
delete** — the same in-statement re-assertion `mms_set_line_fulfillment` performs one function over,
and the rule CLAUDE.md states for every guarded mutation.

⚠️ **The first draft of that guard re-asserted four of the five mutable columns and omitted `qty`** —
caught by adversarial review, HIGH. `qty` is the one re-asserted column the very next statement does
arithmetic on, and `mms_cart_item_inc_qty` commits straight through the cart lock for exactly the
same reason the tag does. A diner tapping `+` mid-merge leaves tag/state/notes/comped unchanged, so
the delete would have **succeeded** and the target been bumped by the stale qty — **one unit silently
destroyed**: not charged, not cooked, no error. A guard that re-asserts four of five mutable columns
is not a guard, it is a narrower race. The delete runs **first** and the qty bump
only if it landed; bumping first would double-count a row the delete then refused. A refused delete
falls through to the re-parent, which is always safe.

**Codex round 2 then found the guard's other two edges** — both real, both fixed. (1) A row voided or
comped **after** the loop's snapshot correctly fails the guarded delete, but the fallback re-parent was
**unconditional**, so it carried a $0'd line into the target — contradicting the very invariant the
loop's own WHERE states (`state <> 'voided' and not comped`) and stranding the accepted void audit on a
cart about to be cancelled. Eligibility is now re-asserted in the re-parent too, and an ineligible row
is **left on the source**, where its audit already lives. (2) `v_moved` — which `mergeTables` records as
the units moved — was incremented from the snapshot's `r.qty` in every branch, so a concurrent `+`
that made the delete refuse would re-parent a two-unit row and report one. It now counts what actually
moved: `r.qty` on a fold (the delete just re-asserted it), and the value read back from the row on a
re-parent.

⚠️ **The race itself is not covered by a test, and cannot be from a single psql session** — the five
cases prove the fold still behaves, not that the guard serializes. Verifying it needs two concurrent
sessions, which no harness in this repo has.

⚠️ **Correction to a merged migration.** `20260820140000_m96_merge_keeps_adder.sql` calls itself "its
seventh definition". That was measured with a grep requiring the `public.` prefix, and **four** of the
definitions omit it, so the real count was eleven and this is the **twelfth**. The M96 adversarial
review "verified" the seven by re-running the same pattern out of the same file — two independent
measurements, one shared blind spot. The applied migration is left untouched; the correction lives in
the new migration's header and in `docs/OPEN-ITEMS.md`.

### M90 — one chime engine, and one envelope (2026-08-20)

`kds-sound.ts` (W3c) and `diner-sound.ts` (W22f) each synthesized tones with the same fast-attack /
exponential-release mallet shape, ~15 duplicated lines apart. W22f filed this rather than doing it,
because converting the **kitchen's** chime inside a diner-facing slice would have risked the cook's
ticket sound for a nice-to-have. On its own, with the KDS behaviour pinned, it is safe.

**What is shared and what is not.** `chime-core.ts` owns creating and resuming the AudioContext and
turning a list of notes into oscillator + gain-ramp calls. It owns none of the policy, because every
axis of that inverts between the two callers — default (0.8 loud versus OFF), arming (an explicit
"Enable sound" tap at shift start versus the preference toggle being the gesture), what a failure
costs (the visual channel still covers a ticket; a diner loses garnish), and the vocabulary itself.
`chime.ts` still owns the diner's rules and `kds-sound.ts` still keeps the kitchen's.

**The seam is worth more than the saved lines.** The envelope is exactly what a refactor can silently
change — a ramp target, a start offset, the tail on `stop()` — and none of it was observable, because
WebAudio needs a browser and there is no DOM runner in this repo. So both halves were made checkable:
`chimeSchedule` is a pure function compared against a **verbatim transcription** of the pre-M90
arithmetic (operator order included — float addition is not associative), and `ChimeEngine` is driven
through a recording fake context, so the node-graph calls are asserted rather than assumed. The audio
path of either surface had **no test at all** before this; it now has **25** (of 28 added — the other
three are the volume preference, which touches no audio).

`KdsChime`'s surface (`arm` · `armed` · `play(channel, soft)`) is unchanged, so no KDS caller was
touched. Its tone tables, the 0.8 default, the 0.4 soft multiplier and the pickup/scango routing are
each pinned against the numbers that shipped with W3c.

Two details the refactor deliberately did **not** tidy: `PEAK_FLOOR` (0.001) stays ten times `FLOOR`
(0.0001), because a peak equal to the ramp's start is a ramp with no direction — audible as silence,
with a `stop()` still scheduled; and the KDS reads its volume only **after** confirming the station is
armed, so a ticket landing before shift start costs no storage hit.

### M96 — a table merge must not fold away one diner's attribution (2026-08-20)

`mms_merge_table_orders` folds a source line into a matching target line by bumping the target's qty
and **deleting** the source row. The match required `t.by_seat is null` — the R5c rule that a fold
never touches a diner's own line — and before M87 that was enough, because a seatless line belonged
to nobody.

M87 changed what seatless means: a line can be seatless and still belong to someone. Two ways in, and
the first needs no prior merge at all — a **staff-added** target line is seatless and adderless from
the start, so a diner's dish folded into it on the very first merge and their row was deleted. The
second is the twice-merged table: a line re-parented by an earlier merge has `by_seat = null` (the
re-parent branch clears it) but keeps its `added_by`, since the immutability trigger pins that column
against every update, so a dish B chose could fold into a line A chose. Either way the source diner
ends with no record of a dish they really chose.

**One narrowing predicate:** `and t.added_by is not distinct from r.added_by`. `is not distinct from`
and not `=`, because two nulls must **match** — a staff-added line on each table still folds, and
`null = null` is null, which would have quietly stopped every such fold and doubled the register's
line count. (Not kiosk: a kiosk order carries the device's own verified anon uid as its seat, which
the M87 trigger copies into `added_by`, so a kiosk line has an adder like any diner's.) Different adders now re-parent instead, which is what the `else` branch
already does for every other non-match; the cart, the split and the totals all sum per line anyway.

Pinned by `supabase/tests/m96_merge_keeps_adder_test.sql` — all four cases (both adderless still
folds · a staff target and a diner source re-parent, the first-merge shape · different adders
re-parent, both adders surviving and the seat cleared · same adder still folds), driven by the real
merge RPC rather than a hand-written fold.

⚠️ This was filed on #214 as "justified, not fixed", calling the change a disproportionate blast
radius. That estimate was wrong and is retracted in `docs/OPEN-ITEMS.md`: it is one predicate of the
same shape as the two narrowings beside it.

### M87 — the seat that CHOSE the dish, carried into the order (2026-08-20)

`qr_cart_items.by_seat` is the verified diner uid that added a line. Every fulfill RPC dropped it
when copying the cart into `qr_order_items`, so once an order existed the only person attached to a
dish was `qr_orders.earned_by` — **who paid**.

W22e's "your usual" is built on that history, and the gap forced it to exclude dine-in entirely: on a
dine-in table the host who picks up the tab owned every guest's dish in the data, so two such visits
would name a dish they had never once ordered — and hand a stranger's diet, religion or allergy back
to them as their own taste. Honest, and it cost the archetype: **a solo dine-in regular is exactly
who the card is for, and they never saw it.**

**An IMMUTABLE adder, three writers, one added expression each.** `added_by uuid` on both
`qr_cart_items` and `qr_order_items`, and `ci.added_by` added to the item-copy in `mms_fulfill_order` (restated from its W23d body),
`mms_fulfill_cash_order` and `mms_fulfill_split_order` (from M3). Nothing else in any of the three
changes, so a diff against those files is a one-line-per-function read.

#### Codex round 1 killed the premise, and it was right

**`qr_cart_items.by_seat` is not "who chose" — and the first draft of this migration snapshotted it.**
It starts as the adder's uid, but `assignLine` REWRITES it: the split-the-bill UI on `/cart` assigns
a line to the seat that will **pay** for it. So the column carries two meanings — "who added this"
until someone splits, "who owes for this" afterwards — and a host who generously takes her guest's
dish onto her own share would have inherited that guest's taste. **Precisely the false-preference
defect this migration exists to prevent, wearing a more precise-looking label.** The repo's own
comment calls `by_seat` "provenance-only", which stopped being true when the split UI shipped.

The fix is an adder identity nothing may rewrite, enforced by the database rather than by convention:
`qr_cart_items.added_by`, seeded at INSERT from whatever the inserting path supplied and pinned
against every later UPDATE by `mms_freeze_added_by`. A **trigger** rather than three more restated
insert RPCs, because it covers every insert path — diner, staff, kiosk, grocery — including ones
added later. `supabase/tests/…` now proves it against the real production write: a reassign moves
`by_seat` and cannot move `added_by`, and the payer is credited with nothing.

Two more from the same round, both real: the split fixture pinned `settle_expected_cents = 1000`
against a 1105 capture, so `mms_fulfill_split_order` would have raised its reconcile mismatch before
reaching any attribution assertion (the SQL test could not have passed); and `mms_usual_lines` had no
`ORDER BY`, so PostgREST's `max_rows = 1000` would truncate a heavy history to an **arbitrary**
subset rather than a capped one — now `order by created_at desc limit 500`, deterministic and below
the cap.

**Nullable, with no default and no backfill.** An order fulfilled before this migration has no seat
and must not acquire a guessed one. A merge-reparented line has none either — the merge deliberately
clears attribution — and neither does a staff- or kiosk-added line.

**The attribution rule is a SQL function, not a query built in TypeScript.** `mms_usual_lines(uid,
since)` is `SECURITY DEFINER`, revoked from `public`/`anon`/`authenticated` (it takes a uid, so an
`authenticated` grant would be an endpoint for reading any stranger's eating habits), and its WHERE
clause is the whole rule:

- **`added_by = uid`** — the diner ADDED this line. True regardless of who paid or how the order
  settled, which is what finally recognises a dine-in regular, and what makes a **split** table
  attributable at all: its order row carries no payer, because each share has its own PaymentIntent.
- **`added_by is null AND earned_by = uid AND fulfillment <> 'dinein'`** — the pre-M87 fallback,
  unchanged in meaning, so no existing habit stops counting on deploy day. Both extra conditions are
  load-bearing: `added_by is null` because a line we KNOW somebody else added must never be
  re-attributed to the payer, and the dine-in exclusion because that is precisely where paying and
  choosing come apart.

It lives in SQL because the union cannot be expressed as a PostgREST filter across an embedded table,
and a rule spread over a `.or()` string is a rule nobody can test. It also **strictly improves the
modes W22e already counted**: the old justification for to-go was "the payer chose the food", which
is an assumption; with the seat on the line it is a fact, or it is null and not guessed at.

**Proved against a real database, driven by the real writers.** `supabase/tests/m87_order_item_seat_test.sql`
(registered in `ci.yml`'s required list) calls the three fulfill RPCs rather than inserting into
`qr_order_items` by hand — W23d's sharpest review finding was that a guard fed by a fixture proves the
fixture. It asserts: the seat survives all three writers; **a dine-in host does not inherit her
guest's dish** while the guest who chose it is credited although he paid nothing; a split diner is
attributable at all; a pre-M87 to-go habit still counts; the fallback never reaches dine-in and never
re-attributes a line whose seat is known; voided, comped and refunded lines stay out; and the function
is not diner-callable.

⚠️ **The SQL test could not be run locally** — this container has no Docker, so there is no local
Supabase stack and `supabase gen types --local` could not run either. The generated types were
hand-written to the generator's conventions and CI's `types-fresh` job is the authority on both.
Stated rather than glossed: if either is wrong, CI says so before merge.

#### The in-session adversarial round — the index could not serve the query

One lens set (SQL/migration correctness · privacy · product truth). It independently confirmed the
three findings above were the real defects and that the three restated fulfill RPCs differ from their
baselines by **exactly one comment, one insert column and one select expression each** — checked
mechanically rather than by eye, with the signatures byte-identical so `create or replace` mints no
overload. It also verified the `revoke ... from public` (required for PUBLIC's implicit EXECUTE, and
present) and that no app query selects `*` from either table, so the new column reaches no browser.

Then the finding worth the round: **the partial index cannot serve the read.** The predicate ORed
across two TABLES — arm A on `qr_order_items.added_by`, arm B on `qr_orders.earned_by` — and Postgres
cannot BitmapOr across a join, so _neither_ index was usable and the plan joined every paid order in
the window against all of `qr_order_items` before filtering and sorting. On the app's highest-traffic
page, for every signed-in diner. Now a **`union all`** of the two arms, each using its own index —
`union all` and not `union` because the arms are provably disjoint (`added_by = uid` versus
`added_by is null`), so there is nothing to deduplicate.

Three smaller ones, all taken: the freeze trigger fired plpgsql on _every_ cart-line update while only
ever restoring an unchanged value (now split, with `when (new.added_by is distinct from old.added_by)`
on the UPDATE half); the column comment still named table merges as a null case, which stopped being
true when attribution moved off `by_seat` (a merge clears the seat but not the adder — deliberate,
since a seat id is a stable `auth.uid()`, and now written down); and `coalesce(refunded_cents, 0)` was
dead code on a `not null default 0` column _and_ made the predicate non-sargable.

#### Codex round 2 — the adder can be folded away, twice

Both findings are the same class and both are real: a line's adder survives a _reassignment_ (the
trigger sees to that) but can still be lost when two lines **fold into one**.

**Fixed — `insertOrIncLine` merged on `by_seat` alone.** After Ben adds a dish and Ana reassigns it
onto her share, Ana adding the same dish matched Ben's row on the seat and bumped its quantity, while
the trigger held `added_by` at Ben. Ana's addition then existed nowhere, so a dish she really chose
never reached her history. The merge key now requires **both** — byte-identical for every ordinary add
(outside a reassign the two columns agree), and for a cart still open across this migration the rows
simply stop merging and insert fresh, which this module's own header already calls a tolerated
outcome. New suite `order-lines-seat.test.ts` asserts the query's FILTERS rather than an outcome —
the shared harness's `eq`/`is` are no-ops that return the same rows whatever is asked, so an outcome
assertion there would prove the mock — plus a mutant, and three ways of breaking it watched red.

**Justified and filed as M96 — the table-merge fold.** `mms_merge_table_orders` folds a source line
into an unassigned target and deletes the source, taking that diner's adder with it. Not fixed here:
the failure direction is **silence** rather than a false claim, the fold only ever targets lines that
already carry no seat (the merge deliberately clears attribution on re-parent), and the merge RPC has
been restated many times [⚠️ corrected 2026-08-21: this sentence originally read "seven times"; the
real count was eleven — see the M97 entry] and carries the void/comp guards — a disproportionate blast radius for a
rare, silent under-count.

Registry: M87 closed. One new `verify:slice` mutant (196 total) for the merge key; the attribution rule itself is SQL,
and the counting module next door still carries its eight.

### M82 — a `busy` prop on the Sheet primitive, and two live defects it names (2026-08-20)

`Sheet` hands every caller four ways to dismiss. While a sheet body has an irreversible write in
flight, dismissing does not cancel it — the refund still moves, the void still spends one of a
manager's five PIN attempts, the add still reaches the server. All dismissal changes is that nobody
sees how it ended, on a tree that has usually unmounted by the time the answer lands.

**The registry entry miscounted the vectors.** M82 said "three dismissal vectors" and "blocks the
three exits", counting Esc, ✕ and drag and **omitting the SCRIM** — the easiest of the four to hit by
accident on a phone, since a bottom-anchored sheet with the keyboard up leaves the entire upper
screen as scrim.

**The first version of this entry then overstated what that miscount would have cost, and the claim
is retracted.** It said a `busy` built to that description "would have blocked three and leaked the
fourth". In this code shape it would not have: Radix funnels Esc, the scrim and the ✕ into one
`onOpenChange`, so a guard there catches the scrim whether or not its author was thinking about the
scrim, and leaking it would take deliberately _adding_ an `onPointerDownOutside`. The miscount is a
real documentation error — someone planning this work would have reasoned about three exits — but it
was never one edit from shipping a hole, and saying so was a scarier story than the facts support.

What the enumeration actually buys is now stated and tested: `channelOf` maps the four vectors onto
the **two channels** the wiring can distinguish (`radix`, `drag`), which proves the single choke
point covers three of the four and stops a future edit from quietly moving one onto its own path.

It was also wrong about the scale. "Eleven callers today" reads as eleven that need this. A scout of
every one found **eight perform no irreversible write at all** — the pickers and viewers, plus the
cart sheets, whose write lands in a provider that outlives the sheet and is plainly visible in the
cart afterwards. One was already guarded. **Two were live defects:**

- **`LossActionSheet` had no guard while its sibling did, and is the worse case.** `voidLine` runs
  `verifyStaffPin` _before_ the RPC, and that atomically spends one of the manager's five attempts.
  Dismiss mid-flight — a downward flick on a tablet being handed across a pass — and the verdict and
  the attempt are both gone, with nothing on screen having said so. The natural response is to try
  again, which walks the manager toward a floor-wide lockout.
- **`StaffModSheet` loses a refusal that has nowhere else to go.** `staffAddItem`'s "This table is
  mid-payment — wait until they've finished." is rendered _only_ inside the sheet, and deliberately:
  `StaffMenuBrowser` routes it there with the comment _"the page-level one is behind the modal
  scrim."_ Dismissing mid-add destroys the only surface that message has, so the server is told
  nothing and the item simply is not there.

**The policy is a pure module.** `packages/ui/src/sheet-dismiss.ts` owns the busy gate, the vector
enumeration, and the R5b drag thresholds — `120px` and `700`, inline magic numbers with no assertion
of any kind since they were written, deciding whether a scroll that wandered downward closes
someone's half-filled sheet. They are now tested, including that the drag is **downward only** (an
upward tug is someone pulling the sheet further open).

**The wiring is asserted as source text, on purpose.** There is no DOM runner anywhere in this
monorepo — `packages/ui` and `apps/qr` are both `environment: "node"`, and CI hard-fails on an
orphan `.test.tsx` — so a behavioural "Esc while busy leaves the dialog open" test costs an infra
slice, not a file. But W22c, W22e and W22f each shipped a correct module whose _caller_ defeated it,
and a pure predicate cannot notice that `sheet.tsx` forgot one of the four vectors — which is the
entire defect class M82 exists to close. Six wiring assertions cover it, each watched red.

**The affordance the local fix could not give.** `RefundActionSheet`'s guard was complete (all four
vectors converge on one `onOpenChange`), but the ✕ stayed visually enabled and silently inert, and
the handle rubber-banded for no stated reason. The prop keeps the ✕ **visible, 44×44 and named** —
QA §A P0 asks for visible and labelled, never for always-enabled — while announcing it as
unavailable via `aria-disabled` and naming the reason ("Close — finishing, please wait"). Never
native `disabled`: the ✕ is the FIRST tabbable element in the sheet, so disabling a focused one
destroys the user's place (WCAG 2.4.3, the rule W22e learned). The dialog carries `aria-busy`; the
primitive mounts **no** live region, because QA §A P1 allows exactly one per view and four callers
already render a `role="status"` in the sheet body.

**One thing the primitive cannot enforce, stated on the prop:** `busy` must be driven by something
that settles on the failure path. All four exits are blocked while it is true and the focus scope is
`trapped`, so a `busy` that never clears is a permanent keyboard trap (WCAG 2.1.2). Every caller
passes a `useTransition` flag.

Registry: M82 closed; M94 · M95 filed (both `InviteSheet`, found by the scout, out of scope here).
No new `verify:slice` mutants — `packages/ui` is outside `MONEY_PATHS` and the runner's cwd is
hardcoded to `apps/qr`. The gate moves from **821 qr + 70 ui** to **831 qr + 87 ui**.

### M83 — the email palette, named once and pinned (2026-08-20)

The largest surface that had never been checked: five React Email templates carrying **48 hand-copied
hex literals**, on the artifact a diner is most likely to open on an unknown client in unknown light.
No migration, no behaviour change on screen.

**Nothing here was failing AA — this is coverage, not correctness, and saying so is the point.** Every
one of the nine text pairs already cleared 4.5:1, the tightest being `--ac` on `--cd` at **4.84**. The
gap was that no guard could see them: `contrast-audit.test.ts` parses `tokens.css` (which an email
cannot import), and `check-theme-parity.mjs` covered five other `var()`-less surfaces but not this
one. W22d proper is a token edit by definition, and it would have split the emails from the app in
silence.

**One table, and a link back.** `apps/qr/emails/palette.ts` holds 11 entries, each naming in its own
doc comment the light token it mirrors. `check-theme-parity.mjs` gains **surface 6** and makes two
assertions, because either alone is insufficient: every entry equals its token, **and** no raw colour
exists anywhere else under `apps/qr/emails/` — a guard on the table alone would have passed on all
five templates the day before this ran. `contrast-audit.test.ts` then asserts the nine pairs as token
pairs, which is the other half of the chain: the parity guard proves the emails _are_ these tokens,
the audit proves the tokens clear AA, and neither alone says anything about what a diner reads.

**Three invented values retired.** `#e8e2d9` appeared three times and is the composite of nothing —
not `--bd` over `--cd`, `--pg` or white — and `AuthCodeEmail` carried a lone `rgba(58,35,23,0.12)`, a
different alpha from `--bd`'s 0.1 for no stated reason. Both become one **derived** value the guard
_recomputes_ from `--bd` over `--cd` rather than comparing to a stored string, so it tracks a change
in either half. (Flattened rather than left as rgba because Outlook's Word rendering engine drops an
rgba border outright.) The receipt slip's `#ffffff` becomes `--cd`, which is what the on-screen slip
already is. Two semantic drifts fixed while the names were being assigned: text on a solid fill is
`--oa`, not `--cd`, and the constant fills are `--ink`, not `--tx`.

**`color-scheme: light` is now declared.** The templates bake a light editorial palette with
hand-picked contrast, and Apple Mail, iOS Mail and Outlook will otherwise apply an automatic dark
transform to pairs nobody has ever measured. The declaration makes those clients render the message
as authored. It is a mitigation and not a guarantee — Gmail's Android app inverts regardless — which
is a reason to keep the pairs comfortably above the floor, not a reason to skip it.

**Two defects in the guards themselves, both found by falsifying them.**

- The first version of surface 6 searched the whole palette file for a `= --token` marker, so the
  file's own header prose ("Do not add a key without a `= --token` marker") matched first and bound a
  token named `--token` to the key `pg`. One entry parsed; nine were silently unchecked. The parse is
  now anchored inside the `EMAIL = { … }` table and each marker is bound to its own key in a single
  match — the same failure mode the offline shell taught this script, arriving from a new direction.
- `contrast-audit`'s dark map read the `.dark` block alone, but **`.dark` overrides `:root`, it does
  not replace it**. Tokens declared once on purpose — `--ink` carries a comment explaining it is a
  CONSTANT so dark text on a constant-bright fill stays legible — came back missing. No assertion had
  ever happened to touch one; the first that did produced a bare `expected NaN to be >= 4.5`, naming
  neither the token nor the reason. The dark map now merges over light (what a browser does) and
  `tok()` throws by name instead of returning `""`.

**A third guard, because the source is not the artifact.** Pinning the table proves what the
templates _say_; only rendering proves what a diner _receives_. `emails/palette.test.ts` renders all
four templates and asserts the set of colours in their style attributes is a subset of the palette —
plus a positive twin, since "no stray colours" passes trivially on a template that emits none. It
immediately found one: React Email's `<Hr>` carries its own default as a **shorthand**
(`border-top: 1px solid #eaeaea`), and the receipt's `borderColor` override merged _beside_ it rather
than replacing it, so every emailed receipt shipped `border-top:1px solid #eaeaea;border-color:#e8e2d9`.
A browser resolves that to the palette value; an email client is not a browser, several drop or
reorder the longhand, and `#eaeaea` is a cool grey that appears nowhere in this palette. Overriding
`borderTop` removes it from the output. Nothing that reads source could have seen it.

Two false positives were fixed in that guard before trusting it, both from scanning the whole
document: React Email's `&#8202;`/`&#8203;` spacing entities parse as `#8202`/`#8203`, and a receipt
code that happens to be four hex digits (`#A1B2`) parses as a colour. It now scans style attributes
only. `vitest.config.ts` also gains `esbuild: { jsx: "automatic" }` — `tsconfig` says
`"jsx": "preserve"` because Next owns the transform, so any `.tsx` reached from a test was compiled
against the classic runtime and threw `React is not defined` at render.

#### The adversarial round — the guards' own bypasses

One lens (guard integrity, the right one for a commit that is almost entirely new guards). It
verified every load-bearing claim independently — 48 literals, `--ac` on `--cd` at 4.843, `--oa` on
`--ink` at 1.012, the `--bd` composite, React Email's `<Hr>` base — and then **demonstrated six ways
to ship an unpinned colour with all three guards green.** Each is fixed and each was watched red:

- **A non-hex entry was unchecked end to end.** The completeness check matched `key: "#`, so adding
  `shade: "rgba(58,35,23,0.4)"` with no doc comment and using it in a template passed every guard:
  the check could not see it, the entry parser never matched it, and the render sweep waved it
  through because it _was_ in the table. `--bd` is itself an rgba token, so this was not
  hypothetical. Now matches any string-valued key, at any indentation.
- **A colour KEYWORD bypassed both scanners.** `color: "white"` is invisible to a search for
  `#…`/`rgba(…)`, on a surface whose whole rule is "no colour except the table". The render test is
  inverted: it parses colour-valued DECLARATIONS by property name and asserts each value is in the
  palette, which catches every spelling including ones CSS has not grown yet.
- **Nothing bound the PAIRINGS.** Switching a body line from `EMAIL.t2` to `EMAIL.gold` shipped
  **2.05:1** text with parity, the audit and the render sweep all green — because the parity guard
  proves each VALUE is a token and the audit proves those tokens clear AA, and neither knows which
  colour a template puts on which ground. The claim "every text×surface pair rendered by
  `apps/qr/emails/*`" was one no guard held. There is now a real pairing assertion: a declaration
  carrying its own `background-color` is a filled element and is checked against that; anything else
  is text on one of the two grounds and must clear **both**.
- **The sweep was top-level `.tsx` only.** `emails/extra-styles.ts` and `emails/parts/Badge.tsx`
  could both carry raw colour — while the commit claimed no raw colour existed anywhere under the
  directory. A guard whose scope is narrower than its stated claim is the claim being wrong.
- **The comment strip ate real code.** `//[^\n]*` deletes from any `//` inside a string, so one
  `backgroundImage: "url(https://…)"` blinded the rest of its line and a raw `#ff0000` sailed
  through. The strip that existed to prevent false positives was manufacturing false negatives; a
  `//` preceded by `:` is a URL scheme and is now left alone.
- **The `.dark` merge cannot fail today** — `--ink` is the only light-only colour token and the pair
  reading it was made light-only in the same commit. The modelling is right; the guard is
  unfalsifiable, so it is **labelled prophylactic** rather than claimed, which is what the red-first
  rule requires when it points at your own work.

Also corrected: this file said the pre-fix receipt shipped `border-color:#ebe7e2`; it shipped
`#e8e2d9` (`#ebe7e2` is the post-fix value). And the render fixture's comment claimed it exercised a
dropped line and a pickup slot while carrying neither — the fixture now does.

That fix immediately surfaced **M93**: `--oa` on `--ink` is **1.01:1** in dark. No live surface uses
it and the emails are light-only, so nothing is broken — but it is exactly the plausible-looking,
catastrophic pair the audit's negative bucket exists for, and that bucket is light-only today.

### W22f — a sound identity, opt-in and off by default (2026-08-20)

Two sounds, and only two: a rising two-note bell when an order goes to the kitchen, and a downward
phrase when payment lands. No migration, no server change, no new dependency — an oscillator and a
`localStorage` key.

**The policy is a pure module (`lib/chime.ts`, six mutants); only the WebAudio plumbing is not.** The
split is the same one W22e made and for the same reason: `apps/qr/vitest.config.ts` is
`environment: "node"`, so a rule left beside the audio code could not be guarded at all.

1. **Off by default, and off means silent.** `soundEnabled()` answers false for an unset preference
   **and for every failure of the store** — private mode, partitioned storage, a locked-down browser
   all throw on read, and a broken store is not consent. A sound cannot be un-played, and the guest is
   sitting in a room with other people.
2. **Sound is never the only feedback.** Exactly the rule `haptics.ts` already states. Both moments
   own a visible half already (the send beat's paper settle, PaySuccess's confetti and receipt), so a
   diner with sound off — which is everyone, by default — loses nothing.
3. **Never on an error path.** There is no `error` moment and there must not be one: a sound on
   failure turns a recoverable, private problem into a public one, and the whole table looks over at
   someone whose card just declined. Errors are read, not heard. The test pins the exact key list
   rather than a count, so a moment cannot slip in under a rename.
4. **Two moments, both already ceremony.** Sending and being paid. An add, a tap, a step is traffic,
   and giving traffic a sound is how an app becomes a slot machine.
5. **Quieter than the kitchen.** `CHIME_LEVEL` is 0.22 against `KdsChime`'s 0.8 default. That is a
   working device on a hot line a cook must hear across the room; this is someone's phone at a table
   with other people at it.
6. **`enabled` and `armed` fail separately and neither implies the other.** A diner can have sound on
   from a previous session while this session's AudioContext was never unlocked. That must be silence,
   not a throw on the send and pay paths.

**The toggle tap IS the arming gesture** — the correction that shaped the whole slice. Browsers create
an AudioContext `suspended` and resume it only from a real interaction (strictly, on iOS). The KDS
gets an explicit "Enable sound" tap at shift start; a diner never does. So the `role="switch"` on
`/account` arms inside its own handler and reports ON only if audio is genuinely usable afterwards —
and rolls the write back if it is not. A switch reading "on" while the device refused the context
would promise a sound that cannot happen, which is the same class of lie as any other unkept copy.

**`localStorage` is the store, not a mirror of it.** The switch reads through `useSyncExternalStore`
with an explicit server snapshot of OFF, rather than copying the value into state in an effect —
which React Compiler's `set-state-in-effect` rule forbids and which would also go stale the moment a
second tab wrote the preference.

**The proposal's placement was wrong and is corrected in writing, not quietly re-scoped.** W22f said
"a toggle beside reduced motion"; there is no diner-facing reduced-motion control, and there should
not be one — reduced motion is honored from the OS media query alone (`MotionConfig
reducedMotion="user"` plus explicit `shouldAnimate` gates), which is the accessible behaviour.
Inventing a second, app-local motion switch to give this one a neighbour would have been the worse
outcome. Noted in `docs/W22_DESIGN_PROPOSAL.md`.

#### The adversarial round — the claim was true of the module and false of the app

Two lenses (product truth · a11y+concurrency), both BLOCK, and **both found the same HIGH
independently** without seeing each other's output. Every finding below was reproduced by hand before
being acted on.

- **The switch read ON while nothing could ever sound.** `ctx` is module state and dies with the
  document; the preference is `localStorage` and does not. `armSound()` had exactly one call site —
  the toggle — so on every page load AFTER the one where the diner armed it, `enabled` was true,
  `armed` was false, and `mayChime` correctly returned silence while the switch said ON and the copy
  named two bells. The module was right; the app around it falsified the module's central claim. Fixed
  with `primeSound()` (a root `SoundPrimer`): a one-shot capture-phase `pointerdown`/`keydown` re-arm
  per document, plus a `visibilitychange` re-arm for the iOS interruption case (a call suspends the
  context and nothing was resuming it).
- **The pay chime could not fire on the pay path, and DID fire where nothing was paid.** Stripe's
  Payment Element hard-navigates to `return_url`, so `/track` mounts in a brand-new document with no
  user activation — and activation does not survive a navigation, so on iOS that document can never
  resume an AudioContext. Meanwhile `HomeResumeCard` and `liveOrderTrackHref` link to `/track` with
  Stripe's own `redirect_status=succeeded` shape, and those are client-side navigations that KEEP the
  document — so tapping "In progress — track your order" hours later was the one place the pay bell
  was reliably audible. **That link was already replaying the whole arrival celebration** (confetti,
  the celebrate haptic, "Payment confirmed") long before this slice; the chime just made it audible.
  Both links now carry `resume=1` and `/track` gates `justPaid` on it — a resume is not an arrival —
  with a mutant and a test on the marker. The pay chime itself stays **best-effort by construction**,
  and the toggle's copy therefore names only the kitchen bell, which the code keeps on every device.
  This is the same bargain `haptics.ts` already ships: iOS Safari implements no `navigator.vibrate` at
  all, and the celebrate haptic ships anyway _because nothing depends on it_. Rule 2 is what makes
  that acceptable, and it is why rule 2 is not decorative.
- **The paid chime rang under a headline that had just stopped saying "Paid".** `PaySuccess` softens
  its copy while `awaitingCapture` because no money has moved — and chimed the sound whose documented
  meaning is "the payment resolved home". Now gated, on its own latch rather than the haptic's, so it
  still fires when the flag flips as the order lands.
- **`window.localStorage` was read outside the try.** With all site data blocked the _property getter_
  throws `SecurityError`, before `soundEnabled`'s own guard can run — and `isSoundOn` is
  `useSyncExternalStore`'s `getSnapshot`, so the throw took `/account` to the error boundary instead
  of failing to OFF. `chime.test.ts` proved the rule for one shape only (a stub whose `getItem`
  throws), which a stub object is incapable of expressing. New `diner-sound.test.ts` covers the real one.
- **The private-mode swallow's own comment was false.** `setSoundOn` caught a throwing `setItem` and
  claimed "the toggle still works for this session" — but every read went straight back to the store,
  so the switch snapped to OFF and nothing sounded. An in-memory override now makes the sentence true.
- Also fixed: a double-tap during the `await` computed `next` from a stale render value, so an
  OFF-intent tap landed as a second ON (now reads the store, behind a busy ref); the "this device
  wouldn't let us play sound" message was sticky and could sit under a switch that was now on; the
  refusal was announced to nobody (`role="status"` + `aria-describedby`, since a refused tap changes
  no `aria-checked` and a screen-reader diner otherwise heard nothing at all); the `sr-only` On/Off
  span was dead (`aria-label` overrides children — `aria-checked` already carries the state); a
  `.sound-switch:disabled` rule for a state the component never sets; and one mutant's rationale
  claimed a collapsed `enabled && armed` would THROW — it does not, it queues notes into a suspended
  context that the browser plays whenever it later resumes, i.e. a bell minutes late on an unrelated
  tap, which is a worse failure and the real reason the two flags stay separate.

**Not unified with the KDS chime, deliberately.** `KdsChime` and `diner-sound.ts` share ~15 lines of
mallet envelope while every policy above inverts between them. Converting the kitchen engine inside a
diner slice would put the cook's ticket chime at risk for a nice-to-have — filed as **M90** with its
own PR and the KDS suite watched. M91 records that the preference is discoverable only on `/account`.

### W22e — "your usual," honestly (2026-08-20)

One recognition card on the arrival beat, built from the diner's OWN paid history. No migration; no
new server action (the add rides the cart context's existing server-authoritative `add`).

**The whole slice is the honesty bar.** A personal history is small enough that one coincidence looks
like a pattern, so `lib/menu/your-usual.ts` is a pure module carrying six rules, each with a mutant. Rules 1
and 4 are shown **as first built**; the adversarial round below rewrote both:

1. **An occurrence is a DISTINCT ORDER, never a quantity.** Three teas in one sitting is one order of
   tea. Counting rows would let a single large party crown a dish for whoever happened to pay — and
   on a personal card that reads far worse than on an aggregate, because the diner knows they have
   only been in once.
2. **A pair must have actually co-occurred.** The copy joins dishes with a `+`, which asserts they
   were ordered _together_. If Mohinga rode orders A and B while Tea rode C and D, they are two
   separate habits and the `+` states a meal that never happened. A pair needs ≥2 shared orders.
3. **Ties break on RECENCY, then on name — never on row order.** The first draft's comparator
   returned a non-zero value for genuinely equal entries, which is an invalid comparator; the order
   then fell through to Map insertion order, i.e. whatever sequence the database returned. That is
   exactly the invented preference the rule forbids. **My own test caught it.**
4. **Unavailable dishes are filtered BEFORE ranking.** Offering an 86'd dish is the W23a
   anti-pattern the app already paid for. Filtering first also means a sold-out favourite does not
   crowd out the runner-up — the diner gets the dish they _can_ have rather than nothing.
5. **Say nothing rather than something thin.** Below the threshold the outcome is `none` and the
   arrival beat renders exactly what a first-timer sees.

**The copy asks rather than tells.** "Your usual?" keeps its question mark: two orders is enough to
ask and nowhere near enough to assert. A question that misses is a shrug; a statement that misses is
the app claiming to know someone it does not. No count is shown — "you've ordered this 7 times" is
equally true and reads like surveillance.

**Privacy by construction.** The read is not a Server Action, takes no uid parameter (the moment it
does, it becomes an endpoint for reading strangers' habits), and pins the query to
`earned_by = <the SSR-verified uid>`. The only things that leave are a menu item id and a name the
diner can already see. Whole-body try/catch: a config gap degrades to "no card", never a 500 on the
app's highest-traffic page.

**No second money surface.** The card never sees or quotes an amount; the add sends an item id and
the server re-derives the price. Adds are serialized, not parallel — two concurrent adds against a
cart closing mid-flight can land on opposite sides of the status guard, leaving the diner with half
of what the button offered and no way to tell which half.

#### The adversarial round — the premise was broken in three places

Two lenses (product truth · privacy+a11y), both BLOCK. They also **contradicted each other twice**,
which is its own finding: one claimed `--r-md` exists and one claimed it does not (it does not — the
card was rendering square), and they split on whether a `referencedTable` order reaches the parent
(it does, but only because the embed is `!inner`). Resolved by hand.

- **The card offered dishes it could not add — including its own canonical example.** `priceItem`
  runs with `enforceCardinality`, which THROWS for any dish holding a `min_select >= 1` group, and
  the card adds with no modifiers. Seven seeded dishes qualify, and **Burmese Milk Tea is one of
  them** via its required `drink_temp` group — so "Mohinga + Tea", the example in the proposal, this
  changelog and the design language, was precisely the broken case. Worse, the failure was
  misdiagnosed downstream: the provider read the throw as an expired session, flashed "Reconnecting
  to your table…", re-minted the session, and the diner got four contradicting messages in one live
  region while the first dish sat in their cart.
- **One sitting could become a habit.** The threshold counted distinct ORDERS, and the session mints
  a fresh cart after every payment — so a second dine-in round or a forgotten drink is a second order
  id an hour later. `ArrivalBeat` next door already encodes the right doctrine ("two orders in one
  sitting are two orders"); this module made exactly the claim its neighbour avoids. Now counts
  distinct **days**, in the restaurant's timezone — an 8pm dinner in Covina is already tomorrow in
  UTC, which would have split one evening in two.
- **`earned_by` is who PAID, not who ate.** `qr_order_items` carries no seat (`by_seat` lives on the
  cart and is dropped at fulfillment), so a dine-in host covering a four-top owns every guest's dish
  in this data — and the card would name a dish they never ordered, handing a stranger's diet,
  religion or allergy back as their own taste. The read now counts **to-go and pickup only**. That
  costs the archetype (a solo dine-in regular is exactly who this is for) and it is still the right
  call — the same one `/staff/tips` makes about `settled_by`. Registry **M87** carries the migration
  that would let dine-in back in. The header comment had claimed the opposite outright.

Also fixed: partial refunds still counted (W23b is explicit that `status` stays `paid`, so
`refunded_cents` is the only signal); **the privacy guard passed with the scoping moved into a
comment** — the review proved the bypass, so comments are stripped before asserting and `getUser()`
vs `getSession()` is now pinned too; a retry after a half-failed pair re-added the first dish; the
button became `disabled` while focused and dropped focus to `<body>`; "Added ✓" could contradict a
cart the diner had since emptied; the label was a `<p>` where every sibling band uses a real heading;
and `.usual-card` used **`--r-md`, which does not exist** — an undefined custom property computes to
`0`, so the one new card in a 20px-rounded design language shipped with square corners.

**And the comparator post-mortem in the first commit was backwards.** It claimed a non-zero return
for equal entries "falls through to Map insertion order". Measured: returning **0** preserves
insertion order (ES2019 stable sort), while returning `-1` REVERSES it — the broken comparator
produces a sort artifact, not database order. That inverted rule had been promoted into
`DESIGN-LANGUAGE.md` as normative doctrine and is corrected there.

8 new mutants (**188** total), 20 tests, every one red-first verified. Registry: **M87–M89**.

### W22d-1 — the Night correctness floor (2026-08-20)

**Dark mode was failing AA on a diner's own rewards screen, and had been since K3a.**
`tokens.css` aliased dark `--ruby-strong: var(--ruby)` under a comment asserting the opposite —
_"bright-on-dark clears AA on the tint"_. Measured against the real call sites it does not:

| Recipe                                            | Where                     | Ratio    |
| ------------------------------------------------- | ------------------------- | -------- |
| `ruby-strong` on ruby 14% over `--cd`             | `AccountStatus` tier row  | **4.47** |
| `ruby-strong` on ruby 16% over `--cd`             | `AccountStatus` tier card | **4.32** |
| `ruby-strong` on the chip's oklab 18% hover blend | `.wallet-chip-star`       | **4.23** |

The audit never caught it because ruby was not in the combo matrix at all — a rigorous test asserting
nothing about the one hue that needed it.

**Two precision notes, since this slice is about claims outrunning their evidence.** Of the three
rows above, only the tier row renders informational text: the chip's `✦` is `aria-hidden` decoration,
outside 1.4.3, and `WelcomeBackChooser`'s 16% tint holds a colour **emoji**, so `color` has no visual
effect there at all — an earlier draft cited it as a failing surface and was wrong. Fixing all three
is still right (a decorative glyph nobody can make out is its own defect), but the honest count is
one confirmed text failure, one decorative, one inert. Fixed by lifting only the TEXT variant (`--ruby` still
paints the dot, glyph and border at a fine 5.55): same OKLab hue and chroma, L 0.702 → 0.728, worst
case now 4.66, searched numerically rather than picked.

**The split is the point.** Deepening the ground — which is what W22d proper does — raises every dark
ratio. Against one _illustrative_ deeper ground I tested, ruby reached 4.81 unaided — a number about
a palette that does not exist yet, and not quotable as a property of W22d. The structural point stands
without it: had any deeper ground landed first, this guard would have been born GREEN and the defect
would have survived untouched on every surface that is not `--cd`. So the
correctness floor ships first, with the guard born red at 4.47.

**Coverage added** (`contrast-audit.test.ts`, 41 → 57 tests): the reward tier tints at both live alpha
recipes; the wallet chip's `color-mix(in oklab, …, <opaque>)` blend for all three tiers at rest AND
hover — a genuinely different blend from every `%, transparent` tint, and where the tightest failure
lived; `t3 on surface-elevated` (`tx` was guarded, `t3` was not); and an `--ac2` negative guard,
light-only because dark `--ac2` IS the legible bright gold.

**The badge tint percentages are now parsed out of `badge.tsx`** rather than transcribed. They were
the one un-derived fixture left, so retuning `TONES` would have moved the shipped contrast while the
suite kept asserting the old recipe. The regex pins the mix SPACE too, since `in srgb` → `in oklab`
composites identically against `transparent` but not against an opaque colour.

**New — `scripts/check-theme-parity.mjs`**, wired into `verify:slice`. Some hex escapes the token
system entirely: the service worker's offline shell is a string baked into `sw.ts` and ships before
any stylesheet exists, and `viewport.themeColor` is consumed by browser chrome before first paint.
Neither can read a custom property, so both carry hand-copied values that no test can reach — and
**two had already drifted** (`#1d1a2e` / `#f3effa` against a `--tx` of `#1b1714` / `#f3ecdf`). The
guard was born red on exactly those two.

Also fixed:

- **`stripeAppearance` fell back to the LIGHT palette in dark.** All five fallbacks were light hex
  while `theme` correctly branched on `.dark`. The fallback fires when `getPropertyValue` returns
  empty — a custom property read before the stylesheet applies, i.e. a cold load on a slow
  connection — so it painted near-black text on a cream card into an iframe Stripe was rendering as
  `night`. An unreadable card form exactly when the network is already bad.
- **The print re-pin could not reach an inline style.** `.receipt-artifact { color: #1b1714
!important }` does not cover `ReceiptCard`'s `color: var(--warn)` on a descendant, because an
  inline style outranks an ancestor rule — so printing from Night put `#e0855f`, a hue chosen for a
  dark ground, onto forced white. `--ok`/`--warn`/`--ac` and the three `-strong` hues now re-pin too.
- `ResilienceShell`'s toast carried a hardcoded `rgb(0 0 0 / 0.25)` shadow between four `var()`
  properties; Night has its own `--sh-md`.

Docs corrected in place: the proposal's _"recomputed contrast fixtures … hardcoded-fixture tests come
with it"_ (that port happened at M5·P5.5 and was improved — there are no fixtures), `QR_FROM_DELIVERY`'s
copy of the same claim and its "tightest combo" numbers, `W9_PLAN`'s _"pins hex fixtures"_, and the
false ruby comment in `tokens.css`. **The proposal's "deeper espresso ground" is also flagged rather
than followed**: shipped Night is aubergine (~260°), so espresso is a hue rotation, not a deepening —
an open owner decision, not something the word should smuggle in.

#### The adversarial round — including two failures in this commit's own thesis

Two lenses (a11y/colour · product truth/guard integrity). The ruby fix itself was confirmed sound at
every live recipe, and `mixOklab` verified against browser reference values. What it found instead:

- **This commit hand-copied hex and drifted, on the commit whose thesis is that hand-copied hex
  drifts.** Two of the eight tokens added to the print re-pin were wrong: `--gold-strong` was pasted
  from `--ac-strong` (`#8f5009` for `#8a5a00`), and `--jade-strong` was `#25663f` — a value that
  existed **nowhere else in the repo**. A Gold- or Jade-tier diner printing `/account` got an
  off-brand hue on paper. The block's own new comment promised "values = the light theme's own",
  which is precisely the kind of prose-instead-of-enforcement this slice is about.
- **`check-theme-parity.mjs` said "three surfaces" and checked two.** The print block — the one this
  commit edits — was the missing third, and the `stripeAppearance` fallbacks carried a comment
  claiming the script pinned them before it did. Both are now genuinely covered: the guard grew to
  four surfaces, was born red on exactly the two drifted values, and `--bd` comparison normalises
  whitespace so an rgba can be pinned too.
- **Two live AA failures in LIGHT mode, both violating a rule this file already asserts.** The audit
  carries a negative guard declaring plain `--ac` on `--sf` must fail — and two call sites were doing
  exactly that on a ground tighter than bare `--sf`: `.lend-banner-back` at **3.53:1** (the only way
  out of lend mode) and `.wb-method` at **3.70:1** (the sign-in chooser on the very rewards surface
  this slice is about). The guard was right; nothing connected it to the call sites. Both now read
  `--ac-strong`, and both combos are asserted — `.lend-banner-back` clears at only 4.53, too thin to
  leave on trust.
- **The email templates use `#9b8f82`, which corresponds to no token and fails AA on all three of its
  grounds**: 3.16:1 on the receipt slip and 3.00:1 on the email body, carrying the destination
  headers, the per-line kitchen note and the honest "why you got this" reason line. Fixed to `--t3`'s
  light value. The remaining ~40 hand-copied hexes in `apps/qr/emails/*` are filed as **M83** — the
  largest uncovered contrast surface left, and the canonical "cannot read a custom property" case.

Also corrected: the audit attributed its 16% recipe to `WelcomeBackChooser` "over `--cd`" when that
component's avatar sits on `--sf`. Filed rather than fixed: **M84** (the tier/chip percentages are
still transcribed while the badge ones are now parsed — the same reasoning applies, and this commit
only half-applied it) and **M85** (the audit models a tinted chip's ground as flat `--cd`, but
`AccountStatus` renders `<Card textured>`, so dots show through the translucent tint).

**Two visible changes here are NOT the AA fix, and the owner scoped this slice to correctness — so
they are disclosed rather than buried.** `ResilienceShell`'s offline pill moves from a hardcoded
`rgb(0 0 0 / 0.25)` to `--sh-md`, which is softer in light and deeper in dark; and the print re-pin
is on `html, html.dark`, so correcting `--gold-strong`/`--jade-strong` also changes **light-mode**
print output for any `--jade-strong` text (teal → the real token). Both are the same class the slice
exists to remove — a hardcoded colour and a wrong transcription — so removing them is in scope, but
neither is an AA failure and a reader deserves to know a pixel moved.

**Codex could not review this PR either** — same usage limit as #207. Recorded, not papered over.

No migration.

### W22c — the gesture layer, and three corrections (2026-08-20)

`docs/W22_DESIGN_PROPOSAL.md` listed five parts. **Three were already built**, so most of this slice
is fixing what the docs said rather than adding what they asked for:

| Proposal said                                   | Actually                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "swipe-to-close on every sheet"                 | shipped at **R5b** — `Sheet` drags on a handle-initiated `useDragControls`, body scroll untouched                         |
| "the R5b `useSwipeToClose` seam, still unbuilt" | **there is no such hook here** — that is the delivery repo's name; `docs/HANDOFF.md` pointed at a seam that never existed |
| "iOS keyboard floors audited (16px inputs)"     | done earlier, app-wide                                                                                                    |
| "edge-consistency on back navigation"           | done earlier; what was missing is `overscroll-behavior-x` on the rails (below)                                            |
| "pick < commit < celebrate"                     | **three words, one too few** — v7.2 designed three add-weights, so the vocabulary ships as four                           |

**The haptic vocabulary** (`lib/haptics.ts`) is the real defect. `hapticTap(ms)` let one weight mean
two things and it did: **8ms was both a PICK and a COMMIT.** `ItemSheet.choose` buzzed 8 for
selecting a modifier option — its own comment reasoning "8 < the Add's 12, a pick is smaller than a
commit" — while the Add pill and the grocery scan-add buzzed the same 8 for putting an item in the
basket. A diner's thumb was told "you chose something" and "you bought something" in identical
language. `haptic()` now takes a **moment**, not a duration: `pick` 6 · `add` 8 · `commit` 12 ·
`celebrate` pattern. The numeric export is **deleted** rather than re-typed, which is what makes a
raw millisecond a compile error instead of a lint warning. The one weight that changes is
`ItemSheet.choose` (8 → 6) — the defect being corrected, not a side effect of the rename.

Two rules travel with it. **Reduced motion is read synchronously from `matchMedia` inside
`haptic()`**, never via `useAnimationPreference` — that hook seeds `shouldAnimate = true` before its
effect resolves (SSR-safe by design) and a haptic is irreversible, so an RM user would be buzzed once
per first tap; `PaySuccess` carried its own copy of that guard, which is exactly why the rule now
lives in one function. And **a haptic may never be the only feedback for an event**: iOS Safari
implements no `navigator.vibrate` at all, so on this app's most common device every one of these is a
silent no-op.

**Pull-to-refresh** (`lib/pull-refresh.ts` + `components/PullToRefresh.tsx`) moves the **indicator**
and never the page. `/menu`'s `<main>` hosts two `position: fixed` descendants — `PaperAmbient` and
`CartBar` — and a `transform` on an ancestor creates a containing block for fixed descendants, so
translating the page for the pull would drag the Add-to-cart bar off the bottom of the screen and
crop the ambient. Same family as the `isolation: isolate` rule W22a·depth learned on `PaperAmbient`'s
host. The rubber band is asymptotic to 96px and arms at 48 — the curve is its own inverse at the
midpoint, so `pullTravel(96) === 48` exactly. Computed, not chosen: a threshold a diner reaches by
accident while scrolling a long menu is worse than no gesture.

**What the refresh is allowed to SAY** (`lib/catalog-freshness.ts`) is the load-bearing rule.
`router.refresh()` returns `void` and cannot report failure, so freshness is **proven** by an RSC
render stamp the page passes down, never inferred from the data that came back. And a failed catalog
read produces an **empty** snapshot — diffed naively against a full one, every dish reads as newly
sold out and the app announces to every diner in the room at once that the whole restaurant has run
out. That is the delivery repo's "a failure must never read as empty" arriving at a brand-new
boundary, and it is why the outcome is a three-state union whose third state is `unverified`. Never
collapse it into `unchanged`: "we couldn't check" and "nothing changed" produce the same screen and
are different sentences, and only one of them is true when the wifi drops. Price movement is reported
as a **count**, never a delta (W17b ships a live staff price editor, so prices really do move
mid-service — but the server owns the number and a client-stated "+$1.00" starts an argument the
client cannot win), and nothing ever "just" sold out, because `sold_out_at` is not in the menu page's
select.

**Rail overscroll.** `overscroll-behavior-x: contain` on the seven horizontal scrollers, so a swipe
that runs off the end of a rail stops there instead of triggering the browser's back gesture. **`-x`
only, never the shorthand** — the shorthand would also claim the vertical axis and kill the
pull-to-refresh this same slice adds.

**`RefundActionSheet` migrated to the canonical `Sheet`** — the migration its own `overlay` comment
had been asking for since P1-5. One migration closes four real defects: `aria-modal="true"` with no
focus trap (the attribute promises assistive tech the rest of the page is inert; the deleted
rationale argued the trap was unnecessary while leaving the claim that it existed); Esc bound with
`onKeyDown` on a non-focusable overlay `<div>`, so it worked only while a control inside happened to
hold focus; scrim `onClick` dismissal that a text-selection **drag** out of the PIN field could fire,
losing a manager's refund to a slipped finger; and no `--kb-inset` on a bottom-anchored sheet whose
`type="password"` PIN sits directly above the Refund button, so the phone keyboard covered the one
control the sheet exists to reach.

#### The adversarial round found the slice's own rule failing in the wiring

Three lenses (product truth · a11y · concurrency). Two HIGH, and both were the module's stated rule
holding in the unit test while the live wiring reproduced it for free:

- **A render that landed is not a read that succeeded.** `catalogStale` was passed only to the
  gesture's `disabled` prop, never to the freshness decision — and the stale branch stamps
  `Date.now()` like any other render. So `advanced` certified a render where the database was never
  reached, putting the DegradedStrip (_"this is the menu from a few minutes ago"_) and a toast
  reading _"Menu is up to date."_ on screen together. Worse: `readLastGoodCatalog` is per-INSTANCE
  module state bounded by traffic rather than a TTL, so a refresh landing on another warm instance
  can serve an **older** cache than the diner already had — and diff it into _"Mohinga is back on."_
  about a dish that is still 86'd. The gesture causing the exact last-tap refusal it exists to
  prevent. `catalogFreshness` now takes two independent claims (`{ advanced, trusted }`) because
  they fail independently.
- **The stamp had two owners and one value.** `advanced` compared the current stamp against
  `baseline.stamp`, which only advances when this component announces — while _any_
  `router.refresh()` on the route advances the props' stamp. `AnonAuthGate` does one on a fresh
  anonymous mint, i.e. on every cold QR scan, the primary entry path. So a first-session diner's
  first pull compared a stamp the auth gate had already bumped, found it different, and reported
  `advanced` even when the pull's own fetch never landed. The stamp is now captured at **fire** time;
  `baseline.rows` keeps its own, longer lifetime.

Also fixed, each verified before accepting it:

- **`unverified` was still adopted as the new baseline** — the module refused to _speak_ from an
  untrusted snapshot while still _remembering_ one, so a real 86 landing afterwards diffed against a
  cache instead of against what the diner had been shown, and was reported once or lost entirely.
- **No axis-dominance test.** `/menu` stacks four horizontal rails at exactly the height the gesture
  arms, a thumb arc across one drifts 10–30px vertically, and `preventDefault` on a touchmove
  cancels the scroll for that touch on **both** axes — so the rail simply would not move, and
  carrying the arc through fired a refresh. Now bails when `|dx| >= |dy|`, and hands the gesture back
  entirely once `e.cancelable` goes false (the compositor already owns the pan).
- **`armedRef` survived a drag back under the deadzone** — the indicator vanished, the diner
  believed the gesture was cancelled, and release fired anyway.
- **The gesture was the only way to reach the function** (WCAG 2.5.1 / 2.1.1): unreachable by
  keyboard, by switch access, and — because VoiceOver claims single-finger drags — under a screen
  reader. A reload is not the equivalent, by the component's own argument. There is now a real
  `<button>` on the eyebrow row calling the same `fire()`; the pull is the shortcut.
- **The wake re-read spoke.** It reused the pull's path, and `announce` is a single-slot **visible**
  toast — so returning to the tab within 2.6s of tapping Add replaced _"Added Mohinga"_ with an
  unrequested _"Menu is up to date."_ A pull or a tap is a question and is always owed an answer;
  the wake now speaks only when it has news.
- **`catalogStale` suppressed the whole component**, wake included — so a diner who hit one blip was
  stranded on the last-good copy with no path back short of a hard reload, the one action that
  throws the last-good copy away. `disabled` now means what its own doc always said: a sheet is open.
  That also closes the case where the pull claimed an open `ItemSheet`'s scroll (the listeners are on
  `window`, the sheet is a portal, and Radix's scroll lock never stops propagation).
- **The `preventDefault` moved above the in-flight bail.** This app declines `overscroll-behavior-y`
  app-wide, so that call is the only thing stopping Chrome-Android's native pull-to-refresh from
  reloading the document — and it was off during the RSC round-trip, i.e. for the second pull, on the
  slow connection where it costs most.
- **`.ptr` was `absolute` under an unpositioned `<main>`**, so it resolved against the document and a
  wake-fired refresh painted its only progress state above the viewport. Now `fixed`.
- **`RefundActionSheet` had no in-flight guard.** `Cancel` has always carried `disabled={pending}`,
  but the migration added three exits that ignored it — and the caller unmounts on close, so a
  dismissal mid-flight drops the server's answer: no error, no confirmation, no board refresh, over
  money that may already have left the card.
- An `ambient` wake can no longer downgrade an `asked` refresh already in flight.
- The comment claiming the pull arms at "exactly 96px of FINGER movement" was wrong — the caller
  subtracts an 8px deadzone first, so it is **104px** (computed, not read).
- The freshness sentence is the longest this app announces and was inheriting `flash`'s 2200ms
  default, written for "Added Mohinga". `freshnessDurationMs` derives it.

**Codex could not review this PR** — the connector answered _"You have reached your Codex usage
limits for code reviews."_ That is recorded rather than papered over: the standing two-round rule did
not run, and the in-session pass is not an independent second reviewer.

4 new mutants (**180** total), 4 new suites. No migration.

### W23d — tell the diner what the settlement dropped (2026-08-19)

Registry **M71**. W23c's outcomes are all correct on the money and all **silent** to the guest, and
the two silences are different problems because only one of them has an order:

| What happened | What the guest saw before                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| partial       | a receipt listing what they GOT, for the amount actually charged — both true, neither mentioning that the basket changed              |
| all dropped   | no order at all → the tracker polls ~30s and lands on copy asserting a payment: _“Your payment is safe — show this screen to staff.”_ |

That last sentence is the reason this slice exists: it sends a guest to the counter to ask about
money nobody took. `OrderTracker.tsx` had already been burned twice by the same assumption (W9c's
paid-and-eaten meal, the split-payer receipt promise), and both times the lesson was that the copy
carried the happy path's premise into a branch where it was false.

**The partial fact rides the order.** `qr_orders.dropped_lines` is W23b's `refunded_cents` move
again: one column on a row the diner already reads under the untouched `qr_order_read` policy, so
the live browser subscription, both server fallback reads, the durable `?r=` receipt, the emailed
receipt and the /account card all inherit it through `track-order.ts` / `receipt-entry.ts` /
`rewards.ts`. No policy widened, no second query, no new authorization surface.

**The cancelled fact cannot ride the order, because the point is that there isn't one.** It also
must not ride `qr_dropped_lines`: a cancellation with **zero** dropped lines is reachable — a promo
lapses on `valid_until`, purely on time, and `planCapture` answers `over_authorized` with nothing
voided (registry M70) — so a verdict on the line ledger would have nowhere to go in exactly the case
whose copy differs most. It gets `qr_settlement_cancellations`, keyed on the **PaymentIntent**, one
row per attempt and never overwritten: a diner cancelled twice is told the truth about both holds.

**The verdict is recorded BEFORE the hold is cancelled**, and that ordering is the load-bearing part.
A failed cancel is retryable (the intent is still `requires_capture`); a lost verdict is not, because
the moment the hold is cancelled every redelivery short-circuits on the live-status guard and the
write never runs again. Cancel-then-mark would strand the guest on the false copy permanently on one
transient DB failure.

**The verdict is asserted, never inferred.** Right after `paymentIntents.capture` and before
`mms_fulfill_order`, “no order and no verdict” is exactly what a healthy capture looks like too — so
`undecided` and `error` both fall through to today's answer, and only a recorded cancellation speaks.

Also in this slice: every dropped row is stamped with **its own attempt's** PaymentIntent (a cancelled
settlement leaves the cart open, so a cart-id-only join would print “sold out before we could make
it” on the receipt for the order the guest placed afterwards); **five cancel reasons, none of which
claims more than its verdict proves** — `over_authorized` fires with the lines still available,
`cart_not_open` covers a cart that was CANCELLED as well as one that was settled, `nothing_left` is a
zeroed total rather than an emptied basket (so it never says “everything sold out”; the dropped
list's own count heading carries the shortage), and `no_cart` shares the unknown-code copy because a
state whose whole problem is missing information cannot be explained; and `PaySuccess` stops claiming “Paid — thank you!” while a
manual-capture PI is merely authorized — the checkmark and confetti stay (the order went through),
the money claim and the Stars pill wait for the order to land. A dropped line is never a receipt row
and never carries a dollar figure: a number printed for money that was never charged reads as a
refund line.

A recorded cancellation is also TERMINAL for its intent (Codex round 1): the durability rule opens a window where a row says "no payment was taken" over a still-capturable hold, and re-deriving a plan on the redelivery could answer capture — so a verdict on record short-circuits straight to cancelling. 19 new mutants (176 total), 3 new suites, 1 new SQL test. Migration `20260819300000`. Every surface
renders `[]` until `PICKUP_MANUAL_CAPTURE` is on, so today's behaviour is byte-for-byte unchanged.

### W23c — capture what the kitchen made, cancel the rest (2026-08-19)

Registry **M69**, and the last of the three W23 slices. W23a put an availability gate immediately
before `paymentIntents.create`, which bounded the exposure to the seconds between the mint and the
charge but could not remove it: the diner then spends a minute typing a card number, and an 86
landing in **that** window still produced a real charge for food nobody could make. A gate cannot
close it — by the time anyone knows, the money has moved.

Manual capture removes the window rather than narrowing it. A pickup order is now **authorized** at
the tap, and between the authorization and the capture the app takes one more look at the live
catalog:

| What the catalog says      | What happens                                    |
| -------------------------- | ----------------------------------------------- |
| everything still available | capture the full hold — identical to today      |
| something ran out          | void those lines, capture the **reduced** total |
| nothing survives           | **cancel** the hold                             |

A cancelled authorization is the whole point: it leaves **nothing** on the guest's statement, where a
capture-then-refund leaves "we took your money and gave it back" plus a week of waiting.

**The design got small once the right seam appeared.** Nothing is fulfilled at authorization —
capturing makes Stripe fire `payment_intent.succeeded`, and _that_ creates the order, through the
same handler and the same `mms_fulfill_order` as every other payment. So an order is only ever born
already captured: there is no "authorized" limbo for the receipt, the rewards, the history or the
refund path to learn about, and `status='paid'` never has to mean anything new. An earlier shape
fulfilled at authorization and captured later, which needed a fourth order status and a fifth receipt
state; this one changes two files and adds a function. `mms_fulfill_order` already excludes voided
lines, so voiding at authorization makes the whole downstream path correct by construction — W23b's
receipt renders the result without knowing any of this happened.

The parts that are easy to get wrong, and how they are settled:

- **Order of operations: void → re-derive → capture.** Money moves LAST, exactly as on the automatic
  path, so the failure modes stay ones the app already survives. A total read before the void still
  contains the dish the kitchen ran out of; re-reading afterwards is also what recomputes the tip at
  the chosen rate against the reduced base.
- **An unreadable void does not capture.** The availability read has just said this basket cannot be
  filled — leaving the hold standing costs nothing and lets Stripe redeliver.
- **The intent is re-read, not trusted from the event body.** Stripe redelivers for 72h, and a second
  delivery must not re-void a basket whose money has already moved.
- **The reconcile compares `amount_received`, not `amount`.** They are equal on the automatic path;
  on a partial capture they deliberately differ, and comparing against the hold would 409 every
  partial capture into 72h of retries with the diner charged and no order.
- **`mms_void_unavailable_lines` is a new function** because `mms_void_line` answers `in_flight`
  while the cart is locked. That guard is right against a _second_ actor mutating a basket mid
  payment — but this caller is the settlement itself, holding the lock. Widening the guard would have
  opened that window to every void caller to serve one path that already owns it.
- **The idempotency key carries the capture method**, or flipping the flag would replay a previous
  intent minted the other way and charge a retrying diner on the spot.

Behind **`PICKUP_MANUAL_CAPTURE=1`** (`docs/ENV.md`). Unset is the pre-W23c behaviour byte-for-byte,
so this lands dark and gets turned on when someone is ready to watch it. **Pickup only**: dine-in
already settles after the meal and has no window to close; scan-and-go is goods the shopper is
holding. The 2-day pickup horizon sits inside a card authorization's ~7-day life — verified against
prod's `pickup_config`, and recorded as the assumption that breaks first if that is ever widened.

Twelve new mutants (**157** total) and two new suites: `manual-capture.test.ts` pins the amount
decision (5200 / 3800 / 1400 — no two figures confusable), and `manual-capture-run.test.ts` pins the
**order**, because three of its four risky states are ones where capturing would be wrong and the
correct move is to leave the hold untouched. Migration `20260819200000`.

### W23b — a partial refund the guest can actually see (2026-08-19)

Registry **M2**. Line-level refunds (S4.3b) leave `qr_orders.status = 'paid'`, and W1c only ever
shipped the FULL-refund arm — so a partially-refunded order had no diner-readable trace anywhere.
W22r made that worse rather than better: the /track slip became a full itemized receipt, so a
part-returned order printed every line at full price under **"Paid in full · Card"**. The app took
money back and then told the guest, in writing, on four surfaces, that they had paid in full.

The ledger that knows the truth (`mms_refunds`) is manager-read by design — it carries reason codes
and staff ids. Widening its RLS to reach a diner would expose the whole audit trail to surface two
numbers, so the two numbers land instead on the rows the diner can already read.

- **Two columns, answering different questions** — not one value stored twice.
  `qr_orders.refunded_cents` is **how much** came back: Stripe is the authority and
  `charge.amount_refunded` is its cumulative answer, so the reconcile writes it with `greatest()`
  (Stripe redelivers within 72h and an out-of-order replay carries a _smaller_ amount). That also
  covers a refund issued from the Stripe **dashboard**, which writes no ledger row at all and was
  previously invisible end to end. `qr_order_items.refunded_cents` is **which line** — Stripe has no
  idea, so `mms_record_refund` writes it inside the same transaction as the ledger row, after the
  `on conflict do nothing` guard so a redelivered backstop cannot double-count.
- **The shape of the bug was in a signature.** `receiptStatusLabel` took a **boolean**, and a partial
  refund is a third state. `lib/refund-view.ts` now owns the decision, computed once per read
  (`track-order` · `receipt-entry` · `rewards`) and rendered by all four surfaces: the /track slip,
  the durable `?r=` receipt, the emailed copy, and the /account history card.
- **The Total row still prints the fulfillment-time snapshot verbatim.** A refund is a _later_ fact,
  so it gets its own rows beneath — "Refunded" then **"You paid"**, the only derived number in the
  slice and derived once.
- **Lines state an amount, never a strike-through.** `mms_refund_authorize` clamps a refund to the
  order's remaining pool, so a struck line would claim the whole dish came back when only part did.
- **`status='refunded'` with `refunded_cents = 0`** — every pre-W23b refund, and every dashboard one
  — reports the **whole total** as returned. "$0.00 came back" is a lie in the guest's favour and no
  less a lie for it.
- **No `refunded_cents <= total_cents` CHECK.** The invariant is true, but a refused write means
  money left the account with no record — the exact condition the ledger exists to prevent — and the
  display side is already safe (the net floors at zero).
- The email's **preview line** says "$14.00 refunded" for a refunded order: for many people that
  line is the whole receipt.

`check-money-coverage` gained `refunded_cents` and `summarizeRefund` as markers — without them
`refund-view.ts` was a money-**decision** module the guard could not see (pure, touching none of the
existing DB nouns), so the rule deciding whether a receipt says "Paid in full" would have been
revertible with every gate green. **Watched it fail before trusting it:** unclaiming the file made
the guard name it, and restoring made it green again.

Seven new mutants (**145** total). `lib/refund-view.test.ts` separates the three states on the one
field that distinguishes them, with amounts chosen so no two rows are confusable (5200 / 1400 /
3800). Migration `20260819100000`; the ledger back-fill is a genuine no-op today — verified against
prod first (0 ledger rows, 0 refunded orders).

### W23a — the 86 button, and the availability gate on the money path (2026-08-19)

Owner, design-thinking the flow: _"shouldn't the checkout be allowed only after kitchen accepts the
order per items or rejects if out of stock and food is prepared and finally ready to be served, so
that refunds are minimal or avoided?"_

**The audit answered the question by finding a different problem.** Gating checkout on kitchen
acceptance is the wrong instrument — for dine-in it is already the shipped design (`mms_fire_cart`
fires an OPEN, unpaid cart; the table eats, then settles, and an 86 is a free solo void), and for
pickup it would put a blocking tap on every ticket and invert the failure mode from harmless
bookkeeping into food-made-nobody-billed. What actually produced the exposure was this:

> `menu_items.is_sold_out` has existed since the platform-init migration. **Fifteen surfaces read it.
> Nothing has ever written it.** `menu_items` carries a public-read policy and no write policy at all.

So the kitchen had no way to say "we're out", and the charge path never asked: `priceItem` — the one
server-side pricing authority — selected no availability column, and `create-intent` contained zero
references to `sold`, `available`, `is_active` or `menu_items` before `paymentIntents.create`.

- **The 86 button** (`lib/menu-availability.ts`) on the `setMenuPrice` pattern: role gate → service
  client → compare-and-swap on the state the screen showed → `.select("id")` row verification → an
  audit row. Role floor is **server**, deliberately below the price editor's manager — the person who
  discovers a dish is out is at the wok, and an 86 is operational and reversible where a price is a
  money decision. On **both** surfaces the owner asked for: the KDS ticket line (one tap from the
  screen that just revealed it) and `/staff/menu`. One tap each way, no confirm step — a confirm is
  the friction that makes people skip it mid-rush; the ledger is what keeps it accountable.
- **Manual lifetime with a visible stamp** (owner's call). `sold_out_at` is written with the flag and
  **cleared** on the way back, so a stale timestamp can never outlive the flag it describes. There is
  no auto-clear: a timer can quietly put a genuinely-empty dish back on sale mid-service, which is the
  more expensive mistake. The stamp is the only signal a flag has outlived its shift.
- **The gate, in two places.** `priceItem` refuses a sold-out or delisted dish at ADD time (the better
  guest moment — one line, not a whole checkout). `create-intent` re-checks the assembled cart against
  the live catalog **immediately before the Stripe mint**, in the same shape as the pickup-capacity and
  open-hours refusals already there. Both exist on purpose: a cart sits open while the diner reads and
  decides, and the 86 can land in that window. It **refuses and names the dish** rather than silently
  dropping the line — an amount that changes under the diner's finger at the Pay button is exactly the
  surprise the money doctrine forbids. Note this refuses where the pickup soft-cap over-accepts, and
  the difference is deliberate: an over-sold slot means a dish made late, an over-sold 86 means a dish
  that does not exist.
- **Fail-open on a transport blip** (`availability-read.ts`): an unreadable catalog returns "nothing is
  unavailable" and the charge proceeds. Being wrong costs one refund; failing closed blocks every
  diner at the Pay button on every catalog blip.
- **A `sold_out` reason code** on both the refund and the void/comp sheets. The premise was untested —
  production shows **14 paid orders and zero refunds, zero voids, zero comps, and zero items ever
  flagged sold out** — and an out-of-stock incident would previously have landed in "other" and been
  invisible. This is the cheapest way to turn the owner's instinct into a number.

Eight new mutants (138 total) and three new suites: `lib/availability.test.ts` pins the decision,
`lib/order-lines-availability.test.ts` pins the add-time refusal against the real `priceItem`, and
`lib/menu-availability.test.ts` reuses the price editor's CAS-modelling double so a CAS-less
implementation cannot pass.

**Review round 1 changed three things that could not be worked around on the floor.**

- **The charge gate keyed on `state !== "voided"`, and blocked lines nobody could remove.** A dine-in
  table whose dish was 86'd _after_ it fired — possibly after they ate it — got "remove it to keep
  going" about a line `permissions.ts` forbids a diner to touch, with no remedy on the screen. It was
  also the wrong question: a fired line is already made, so an 86 does not threaten it. The gate now
  keys on **`draft`**, which is the batch an 86 actually governs and the one a diner can act on;
  pickup and scan-and-go lose nothing, since those lines stay draft until payment fires them.
- **Both new "We ran out" reason codes were rejected by the server.** The two action sheets offered
  `sold_out` while `refundLineInput`, `voidLineInput` and `requestApprovalInput` all hard-failed the
  Zod parse — the column is a length CHECK, not an enum, so the three schemas were the whole gap.
- **The add-time half of the gate did not exist.** The edit never landed, and three comments plus the
  commit message described a check that was not in the code. `priceItem` now selects
  `is_sold_out,is_active` and refuses by name before deriving an amount, and both halves read one
  predicate (`itemSellable`) so they cannot drift.

Also from that round: a dish **missing from the catalog** counts as unavailable (`menu_item_id` is a
soft ref with no FK, and absence must not answer "fine" when it means "unknown"); the gate moved
**above** the pickup block so a refused order never spends an ASAP slot's capacity; `KitchenLine`
carries `soldOut`, so the KDS shows "Off the menu" instead of offering an 86 the server would refuse
and stops asserting a hardcoded `expectedSoldOut: false`; the ledger row carries the decision's own
instant rather than the insert's clock; and split-tender is documented as a **deliberate** non-gate
(shares freeze at split-open and dine-in food fires from the open cart, so refusing there would block
money for food nobody is charged for).

**Residual, by design:** an 86 landing between the Stripe mint and the webhook confirm still produces
a refundable order. Closing that window is what **W23c** (manual capture for pickup) is for.

### W22b — installed-native: the live order chip expands, and the install stops being a bookmark (2026-08-17)

Owner go: _"Build W22b as planned"_ (`docs/W22_DESIGN_PROPOSAL.md` · Installed-native). Two claims
in that proposal turned out to be wrong and are **corrected in the doc** rather than quietly
dropped — see the amended section there.

- **There is no "fired → cooking → ready".** `qr_orders.togo_status` is CHECK-constrained to
  `preparing | ready | picked_up`, and `preparing` is stamped by the **Stripe webhook** at
  payment, not by a cook. Line-level `fired`/`in_progress` live on `qr_cart_items`, are absent
  from `qr_order_items`, and are readable only while the table session holds. So the proposal's
  parenthetical described a rail the data cannot source, and "every value in it is already real
  (kitchen taps)" was false for stage one. The chip speaks the vocabulary that was already true.
  A genuine cooking stage is filed as **M64**.

- **Two live falsehoods fixed before the chip could make them persistent.** The header pill
  re-derived its own ladder off the raw column instead of calling `liveOrderStatusWord`, so a
  pure GROCERY basket read "Preparing" (nobody is cooking a basket the shopper scanned and is
  holding) and read "Ready" when the expo had merely verified its exit pass. /track refused both —
  and the pill MORPHS into /track's chip on the tap, so the J1 cut cross-faded two different
  claims about one order in one second. Both now read one function; `kindFromTrackedOrder` names
  the mode ladder once (it was hand-copied in three places).

- **`useOrderStatus` resets on a key change.** `order`/`exhausted` were never cleared and
  `AppHeader` is mounted once in the root layout, so a diner's SECOND order rendered the FIRST
  order's word and was `timedOut` on its first frame — dropping to the "Placed" floor while
  tracking perfectly well. A slim pill hid that; an expandable panel would not.

- **The chip is a disclosure, inside the header.** `.app-header` is `position: sticky` with no
  `overflow`, so an absolute sibling is contained but unclipped and inherits the header's stacking
  context for free — above page content, below any sheet scrim. No new z token, no offset var, no
  page-padding changes, no PaperAmbient isolation exposure. `aria-expanded` + a conditional
  `aria-controls`; `aria-haspopup="dialog"` stays reserved for the ≥2-order tray. Esc closes and
  restores focus, outside-pointerdown closes without moving it, a route change closes **at render
  time** (the header is snapshotted during a J1 view transition). When the expo bumps `picked_up`
  under an open panel, the state folds at render and focus re-parks on the brand link — a restore
  to a removed node silently falls to `<body>`. Open wears the lit-gold cap; "Ready" keeps its
  `--ok` status recipe, because a status never takes the selection vocabulary. Not a live region:
  every diner route already owns its one announcer and this is chrome mounted once.

- **Panel content is derived in `lib/live-order-panel.ts`, not in the component** — there is no
  React test runner here, so a rule left in a `.tsx` cannot be guarded at all. It prints stored
  values only: real expo stamps, the diner's own slot as an absolute time, the fulfillment-time
  total rendered verbatim. No ETA, no elapsed cook time, no queue position, no stage counter.
  "In the kitchen" gets no clock.

- **The install.** `id` pinned to `start_url` (without it a later start_url move mints a second
  home-screen icon for everyone installed, unmergeably); explicit `scope`/`lang`/`dir`/
  `categories`; `launch_handler: navigate-existing` so re-scanning a table QR navigates the open
  window instead of opening a second one with a second chip and a second subscription; the
  whole-origin `orientation: "portrait"` lock **removed** (it was pinning /board's landscape wall
  display and staff tablets); real 192/512/maskable-512 rasters generated from the one badge
  source by `scripts/gen-pwa-icons.mjs`; three-door shortcuts with **no** "track my order" entry
  (a bare /track is a stub for anyone without an order). Closes the raster-icon half of **S4**.

- **Precache 261.0KB → 93.1KB** (measured from the generated banner). It was carrying a 117KB
  email logo only email clients fetch and launcher icons the OS requests at install; the 245KB of
  new icons are excluded for the same reason. Kept: `logo.png` and `icon.svg`, which the running
  page actually renders.

- **`app/manifest.test.ts`** asserts every icon exists on disk and every PNG starts with the PNG
  signature. `public/logo.png` is WebP bytes behind a `.png` name, and an icon sourced from it
  passes lint, typecheck and build in silence — failing only as a blank icon on a home screen
  after install. Proven red-first both ways.

- **iOS splash + status bar deliberately NOT shipped**, and not half-shipped: Next 16.2.9 emits
  only `mobile-web-app-capable`, so `statusBarStyle` is inert and startup images would be links
  iOS ignores. Making it live is not theme-safe without a real notched device (**M62**).

- **Review round 1 (adversarial BLOCK + Codex P2), all fixed.** The two that mattered were both
  self-inflicted: (a) the chip's base label still rode `order.mode`, and the TO-GO door navigates to
  `/menu?mode=pickup&door=togo` — so `mode` is literally "pickup" for every to-go order and the chip
  read "Pickup · Ready" while the panel it opened one line below was headed "To-go", breaking the
  very invariant this slice states for itself; it now rides `kind`, with `order.mode` surviving only
  as the pre-row fallback. (b) The panel was a sibling AFTER `</nav>`, so a keyboard user tabbed
  through Rewards and Cart to reach content they had just opened (WCAG 2.4.3 / 1.3.2); it now follows
  its trigger immediately — `.app-header-actions` is `position: static`, so the containing block and
  the absolute geometry are unchanged. Also: `picked_up` now outranks the grocery short-circuit (a
  collected basket has been collected — /track had been losing that word); the panel's money row is
  labelled **"Order total"**, because on a split-tender order it is the whole table's bill under a
  chip headed "Your order"; the manifest test now READS `--pg` out of `tokens.css` instead of
  transcribing `#faf9f5`, which would have let the seam re-open with the suite green (proven
  red-first: `expected '#faf9f5' to be '#ff0000'`); and the icon generator no longer imports a `.ts`
  module (native TS loading needs Node 22.6+ while the repo's floor is `node >=20`) — it reads
  `public/email-logo.png` and asserts the source's magic bytes before drawing. The icons regenerate
  **byte-identically**, confirming `_og/logo.ts` was only ever that file in base64. New row **M68**.
- **Review round 2 — the kitchen word now requires actual to-go FOOD.** Codex and the in-session
  adversarial pass converged independently on the same defect, from opposite directions: a DINE-IN
  order carrying self-scanned groceries and no to-go box has a non-null `togo_status` (the webhook
  stamps `fulfillment in ('togo','grocery')`), so a seated diner read "Preparing", then "Ready",
  about their own shopping — while /track's `pureGrocery` branch classified the very same order as a
  completed exit pass. One reviewer traced it unreachable today; the other did not. Rather than bet
  on reachability, the rule now lives in ONE place: `liveOrderStatusWord` gates the kitchen word on
  **`hasTogoFood`** — the single predicate that separates a kitchen bag from an exit-pass check — and
  `buildLiveOrderPanel` gates the expo stamps on the same field. This is the "name it ONCE" rule
  applied to a predicate rather than a value, and it closes **M68** in the same PR that filed it.
  New mutant `live-order/kitchen-word-needs-togo-food` with a fixture that separates the paths
  (kind dinein · grocery-only takeaway · non-null `togo_status`).
- New registry rows: **M62** iOS splash/status-bar prerequisite chain, **M63** install
  screenshots (real captures only), **M64** a genuine cooking stage, **M65** a held scheduled
  pickup reading "Preparing" for hours, **M66** the offline pill painting over the cart CTA,
  **M67** the hand-copied chrome-top offset.

### Docs — the W22 sweep, and README joins the measured-count guard (2026-08-17)

Owner: _"Merge when ready and update Readme, docs, etc"_ — the docs caught up to what W22a,
W22a·depth and W22r actually shipped, and the guard extended so this class of drift fails CI
instead of aging quietly.

- **`scripts/check-docs.mjs` now measures README's counts too.** `check:docs` already refused
  transcribed test/mutant counts in `OPEN-ITEMS.md` + `HANDOFF.md`; README carried the same kind of
  numbers with no guard, so its "1112 tests" line had been stale since W17. README joins the
  live-state set — proven red-first (a planted `999 qr tests` failed with
  `README.md:18 — says 999 qr tests, measured 586`).
- **README rebuilt around the real topology.** The headline states the shipped tracks and the live
  gate; the overview and the architecture diagram no longer claim the delivery PWA lives in this
  monorepo (M5 was reshaped 2026-06-24 — separate repos, own Supabase projects, one Stripe
  account); the apps/packages table, tech stack, and CI table match what's on disk (three real
  workflows + the note that the review is in-session, never in CI); the dead claude-review badge is
  replaced by the docs gate; Features gained the W22a menu bands, the W22r receipts/email/tracking
  line, and the staff/kitchen surfaces; the tax description is corrected to the category-aware
  engine on the discounted base.
- **`CLAUDE.md`, `ROADMAP.md`, `HANDOFF.md`** — the gate commands describe what the scripts do
  today (124 mutants across 38 money/authority modules, the dirty-target abort, the real CI job
  list); the roadmap logs W21b–d, W22a, W22a·depth, W22r and rewrites Now/Next/Later; the handoff
  opens on the W22 slate with the prod-applied migration markers.
- **Design + reference docs** — DESIGN-LANGUAGE gains the warm-paper layer, the PaperAmbient
  no-isolate invariant and the receipt/real-clocks rules; ENV documents the diner-receipt sender
  chain (and that the hosted badge needs a publicly reachable origin); BACKEND_ARCHITECTURE lists
  `packages/db/src/factory.ts`; W22_DESIGN_PROPOSAL marks W22a + W22r shipped;
  QR_FROM_DELIVERY logs the second wave.
- **The docs gate now runs in CI, and can actually fail.** Codex round 1 found the hole the whole
  entry above rested on: **no workflow invoked `pnpm check:docs`**, so every count guard in it — the
  new README coverage included — was decorative on a PR. `ci.yml`'s `build` job runs it first now
  (pure file + `vitest list` work: no build, no DB, no network).
- **Two holes in the guard itself, both found by planting a wrong number and watching it pass.**
  (1) README states the gate's size inside a fenced `bash` block whose comment **wraps**, so
  `124 verify:slice` ended one line and `# mutants` began the next — the `#` sits where every rule
  expects whitespace, and a planted `999` stayed green. `countFailures` now blanks a wrapped
  comment continuation while preserving the newline, so offsets and reported line numbers stay
  byte-exact. (2) The historical-number exemption matched the bare phrase **"was written"**, which
  appears in `CLAUDE.md` as ordinary prose about a guard — exempting the gate-size count on the same
  line. Narrowed to `at (the) time` / `at that point` / `as of <year>` / `historical`, all of which
  are genuinely load-bearing in `HANDOFF.md`. **`CLAUDE.md` also joined the live-state set** — it
  quotes the gate's size and was never measured. Both fixes proven red-first.
- **`docs/WORKFLOW.md` rewritten** — it was the doc README and CLAUDE.md both point to for the loop,
  and it still documented five workflows that no longer exist (`claude-review.yml`,
  `adversarial-pr.yml`, `claude-fix-pr-comments.yml`, a weekly `adversarial.yml`, plus the
  `review`/`security`/`adversarial-pr` stub checks). It now describes the three real workflows, the
  draft-PR/two-Codex-round/one-adversarial-pass gate, and the HARD CAP — with a banner for readers
  who remember the old loop. `.github/claude-review-prompt.md` and `.claude/LEARNINGS.md` #51 stop
  claiming the retired stubs are still configured.
- **The QA checklist no longer calls the card path live.** It said "the card path is LIVE"; C2 is
  open, which means prod holds **live** Stripe keys while the **live webhook is unconfigured** — the
  one state where a real charge can succeed and `mms_fulfill_order` never fires. Now stated as
  code-complete on test keys and **blocked on C2**. The reduced-motion row had also been _replaced_
  by a rail-specific one, leaving every other animated surface with no acceptance check — the
  general row is back, with the rail row beside it.
- **`docs/MOTION_AND_PERF.md`** — the rails' reduced-motion path said "duplicate DOM **included**";
  `MarqueeRail` appends the loop copies only when motion is on, so it is **excluded**. Left as-is,
  the motion authority invited a future implementation to render redundant hidden cards.
- **Round 2 — the exemption was too coarse, and three claims were still wrong.** The historical-number
  escape hatch was scoped to the whole LINE, so on `HANDOFF.md`'s `88 mutants at the time (124 today)`
  the marker exempted **both** numbers and the live one could rot untouched. A historical marker
  qualifies the number it FOLLOWS, so the exemption is now a tight window after the match, and the
  `(N today)` form got a rule of its own (mutant-context-scoped, so it can't grab an unrelated
  `(3 today)`). Proven **both** ways: `(999 today)` goes red, while re-dating the historical `88` stays
  green. Also fixed: `docs/ARCHITECTURE.md` called the repo **private** when it is deliberately public
  for free Actions minutes (`setup.sh` bootstraps `--public`; visibility is not a licence — the code
  stays proprietary), and carried a contradictory leftover telling you to create it `--private`;
  `CLAUDE.md`'s new design summary repeated the "duplicate DOM included" error corrected in
  `MOTION_AND_PERF.md`; and the interaction-hooks paragraph claimed **every** hook self-gates on
  reduced motion, when `useRipple` is framer-free pure state that never calls
  `useAnimationPreference` — it is CALLER-gated (`AddButton.tsx:342` binds `onPointerDown` only when
  `shouldAnimate`), and a consumer following the old wording would animate for reduced-motion users.
- **`docs/OPEN-ITEMS.md`** — five new registry rows found while reading the code against the docs:
  **M57** the receipt-sent stamp is blind to the send result, **M58** a bounce never un-claims
  "✓ sent", **M59** plain-text money rows run together, **M60** /account history drops kitchen
  notes, **M61** the paper-ambient invariants (no isolating host, `<html>` owns the ground) are
  unguarded.

### W22r — receipts, the receipt email, and live tracking, complete (2026-08-17)

Owner: _"Receipts, email templates, should be as detailed, styled per W22 designs, and polished
as delivery app with restaurant logos, addresses, contact information, etc., live trackings
should also be detailed, styled, and polished."_

- **`lib/brand.ts`** — the restaurant's identity ONCE, every string verbatim from the delivery
  repo's production constants: name, "750 Terrado Plaza, Suite 33, Covina, CA 91723",
  (626) 665-5317, admin@mandalaymorningstar.com, Instagram/Facebook. No hours anywhere in either
  repo → none invented.
- **The receipt artifact** (`?r=` + print) is a complete business document: the badge in the
  lockup, a full identity foot (address · tel · mailto), destination group headings (the Bill's
  exact vocabulary, only when the basket spans 2+), per-line kitchen notes ("the kitchen will see
  it" now has its paper proof), and the pickup contact name — every figure still the
  fulfillment-time snapshot, verbatim.
- **The receipt email** matches the delivery app's shell: the true-PNG badge (`/email-logo.png` —
  the app's `logo.png` is WebP-in-.png that email clients can't decode), the bilingual
  Mingalabar kicker, a 3-cell solid triad bar (email clients drop gradients), and a full identity
  footer with socials + an honest reason line ("you asked for your receipt"). Adds a plain-text
  alternative rendered from the same element and a reply-to that lands in the owner's real inbox.
- **The live tracker itemizes** — one shared shape (`lib/track-order.ts`: one select + one mapper
  replacing three hand-copied ones) now carries lines, the full breakdown, tender, and the expo's
  real timestamps. The /track slip lists every line (mods · notes · destination groups) with the
  zero-gated receipt rows; the step rail shows REAL times (placed / ready / picked-up — "In the
  kitchen" stays bare, no honest clock exists); the tender is named; the contact foot rides the
  page. Authorization unchanged: RLS on the live read, uid-scoped fallback, same field set both
  paths.

### W22a·depth — the warm-paper pass (2026-08-16)

Owner go: _"Merge and Build W22a as planned"_ (`docs/W22_DESIGN_PROPOSAL.md` · Depth & ceremony —
port the delivery repo's proven kit, rebuilt to QR tokens, never imported).

- **Two-tier diffuse shadows** — new `--sh-paper` token (tight ambient + a NEGATIVE-SPREAD wide
  layer, both themes): every `.card` now wears the sheen lip + the two-tier lift (the old flat
  `--sh` read square over busy backdrops); `.surface-paper` adopts the same recipe.
- **The R1 kit finally consumed** — `.surface-vellum` on the ConfirmSwap decision card (a warmer
  surface for a moment of consideration); md:+ frost on the sticky `.app-header`/`.menu-toolbar`
  (mobile keeps today's exact opaque paint — the GPU budget forbids blur below md).
- **`PaperAmbient`** — a fixed, gradient-masked hairline grid under a soft gold bloom with grain
  behind every diner main (menu · bill/pay · account · track · durable receipt · grocery; cards
  keep the DOTS so the two textures never read identical). Static, blur-free, `aria-hidden`,
  print-hidden, and **no host isolation**: the page ground moved to `<html>` only, so the fixed
  z:-1 layer paints above the canvas without a stacking context that would trap fixed overlays
  (tier-up scrim, toasts, confetti) beneath the app header — the #195 review lesson.
- **Ceremony 1 — the thermal-print receipt**: the /track paid summary is now a printed SLIP (card
  body + torn perforated foot); freshly paid it prints on — clip-path opens top→bottom while a
  gold print-head light (a SIBLING of the clipped element, delivery's lesson) rides the frontier
  on the identical 1.05s curve. Presentation-only: every figure stays the server-rendered value.
  Reduced motion renders the finished slip instantly.
- **Ceremony 2 — the send-to-kitchen paper beat**: on a successful send a small receipt glyph
  lifts off toward the kitchen and fades, and the undo control settles in — keyed per send,
  decorative (the live region already says it in words), `display:none` under reduced motion.
- **Digits: deliberately no work** — QR rolls money on `@number-flow/react`, which owns its
  baseline; the delivery repo's baseline-anchor lesson applies to hand-rolled reels only.

### W22a — the drifting start + one taste-buds bar (2026-08-16)

Owner: _"start here should world class UI/UX feature two independent moving and micro-interactions
rows each 10 items. Explore your Burmese taste buds should be like the allergen pills bar … and
can remove allergen pills bar as the new section will make it redundant incorporating some
allergens pills into it?"_

- **"Start here" is now TWO independently drifting rows** (`MarqueeRail` on the native scroller —
  swipe, chevrons, and keyboard survive): row A keeps the honest curation (paid-order ranks with
  tie-aware seals, `popular` fallback) drifting one way; row B is **"a little of everything"** — a
  category round-robin (`lib/menu/startHereRows.ts`, tested) drifting the other way, slower. A
  curation rule, not a ranking, so no seals and its own quieter caption.
- **Motion stays a guest:** pauses on touch/hover/focus/offscreen/hidden-tab + 2.2s after any
  manual scroll; a visible pause/play coin in the heading (WCAG 2.2.2); `prefers-reduced-motion`
  gets the exact pre-W22 static rail (no drift, no duplicate set); edge fades drop while focus is
  inside so a ring is never faded.
- **"Explore your Burmese taste buds"** — the taste section retitled and rebuilt as matching
  single-line pill rails (the owner's "like the allergen pills bar"), and the toolbar's dietary
  bar MOVED IN beside the cravings: same lit-gold-cap vocabulary, bilingual for the first time
  (5 diet pills gain MY accents — K15), with a caption owning the semantic difference ("filters
  the whole menu"). The fail-safe free-from disclaimer traveled with the pills.
- **Recommendations now respect active diets** (a lit vegan pill can never sit beside a shrimp
  card), and searching with a diet active shows an honest "Showing vegan only · Show all" strip
  in the toolbar — the one state where the pills are off-screen.
- Pill micro-interactions: press-give, emoji lean-in on hover, one-beat settle pop on light-up —
  all reduced-motion-gated; Burmese pill accents lifted to the 13px floor.

### W21d — the Codex backlog sweep (2026-08-16)

Owner: _"check all other Codex reviews you haven't analyzed that might be worth fixing."_ Codex
reviewed every PR since #178 (its install), and until the W21 process fix nobody read them: 31
findings across #178–#190, all landed post-merge. Triage: 18 fixed here, 5 closed by a decisive
prod measurement, 4 already fixed by later work, 4 justified/deferred to OPEN-ITEMS.

- **Allergen safety (#187, both P1s):** Sanwin Makin declares **dairy** (butter is in its own
  description), Crispy Shrimp in Fish Sauce declares **fish** — migration `20260816080000` +
  catalog snapshot + seed; the item sheet's "Contains" line now tells the whole truth.
- **Money (#183 P1):** a locale decimal COMMA in the cash-tip/tendered fields was deleted, turning
  "5,00" into a **$500** tip — commas now normalize to a point. (#184 P1): a kiosk tip intent
  arriving after the counter screen mounted was silently dropped — it now syncs into the field
  unless the cashier already typed. (#183 P2): the cash settle reports the PERSISTED order's
  total, not an echo of the request (two same-staff tabs can race; the ledger is the truth).
- **One house ladder, finally everywhere (#182):** SharePay's split-tip ask still offered the
  pre-W17c-3 15/18/20 — it now reads `TIP_LADDER` like every other surface, with the quiet-None
  convention. (#189): "None"/"No tip" no longer wears the lit gold cap in the UNANSWERED initial
  state (checkout + share) — aria-pressed keeps the truth; the visual stays quiet.
- **Price editor (#180, P1+3×P2):** the action now verifies the price the manager's SCREEN showed
  (`expectedPriceCents` — the old CAS only guarded the server's own read-to-write window); the
  zero-row re-read distinguishes outage from deletion; a rejected Server Action no longer wedges
  "Saving…" forever; a successful save parks focus on the search field instead of `<body>`.
- **Register/tips (#186, 3×P2):** a server's query now carries `settled_by = me OR IS NULL` (the
  shared bucket intact, colleagues' rows never read into the process); both paged money reads
  gained an `id` tiebreaker (tied `created_at` across a page boundary could duplicate/drop rows);
  a failed name lookup falls back to `Staff #id` instead of collapsing everyone into "A teammate".
- **Kiosk (#184/#188):** upsell adds now await the refreshed cart INSIDE the transition and the
  footer disables meanwhile (a fast continue tipped a percentage of the pre-upsell subtotal);
  presets whose derived cents breach the $1,000 cap are never offered (the write refuses them and
  the kiosk deliberately swallows the result); recovering from a failed read refocuses the open
  step's heading. The kiosk No-tip ghost weight is DELIBERATE (owner: "none is not encouraged").
- **Plant-based honesty (carried from #192's Codex round):** the 🌱 taste chip now EXCLUDES
  `vegan-optional` — the dietary predicate's own fail-safe rule (the default prep of an
  Everything-Salad-class dish is not plant-based), so those dishes leave its recommendations.
- **Custom tip honesty (#190):** the cap line now quotes the EFFECTIVE ceiling
  (`min($1,000, 4000·net)`) — on a promo-crushed net the old line stayed silent while the clamp
  charged less than the typed figure.
- **Fresh-DB parity (#185/#187/#190):** migrations run before seed, so their guarded UPDATEs
  no-op on fresh databases — a seed appendix now re-applies the two POS prices, four Burmese
  spellings, six house-voice descriptions, and the two allergen amendments post-insert.
- **Docs truth (#178/#179/#181/#187):** the W17a "zero markup" sweep had real holes (paid carts
  excluded, toggle-repriced lines missed, factor-before-modifiers) — closed by a decisive prod
  measurement (zero orders in the W16a window; addendum in W17_PLAN); the audit ledger is
  "un-forgeable", not "unskippable"; the menu reference's units column follows the same
  price-agreement rule as its price column (a $100 catering tray's 20 units no longer inflate the
  $10 dish); the uncommitted `w17d2_build.py` claim stands corrected by the addendum's committed
  probe. Deferred with open items: M54 (kiosk-tip atomic lock), M55 (price-audit atomicity +
  CASCADE ledger).

### W21c — the design language, written down (2026-08-16)

Owner: _"with insights and design thinking UI/UX preferences from start to W21, update repo docs,
readme, claude, and propose next level improvements."_ New `docs/DESIGN-LANGUAGE.md` distills the
as-built doctrine (selection vocabulary, motion idioms, the optimistic doctrine, honesty rules,
bilingual + a11y + receipt-language money surfaces); `docs/W22_DESIGN_PROPOSAL.md` proposes the
next-level slate (depth & ceremony ⭐ → installed-native PWA + live order chip → gesture layer →
designed Night → honest personalization → opt-in sound); README gains the design section +
links; CLAUDE.md points every future visual/motion/copy change at the doctrine first.

### W21b — review round: Codex joins the gate (2026-08-16)

The owner: _"why codex reviews not taken into account after PR pulls?"_ Root cause: Codex only
fires when a PR leaves draft, and the flow marked-ready-and-squashed in one breath — #191's four
findings (all real) landed five minutes after the merge, unread. The rule is now in CLAUDE.md
(`@codex review` on the draft at open; fix-or-justify every finding before merge). This round
folds BOTH reviewers' findings in:

- **Codex #191 P1 — payment could race a pending pickup-timing write.** The write chain now lives
  in a ref Checkout owns and `continueToPayment` drains it before minting the intent (a queued
  write refused as locked would otherwise leave payment on the previous server timing).
- **Codex #191 P1 — checkout navigation could race a pending add.** The provider tracks every
  in-flight add/setItemQty and exposes `settled()`; the CartBar drains it before navigating (an
  optimistic add exposed the bar while create-intent could lock the cart first, refusing an item
  the toast had announced). Resolves instantly when nothing is pending.
- **Codex #191 P2 — a failed revert could strand the optimistic pill.** PickupWhenChoice keeps the
  last CONFIRMED server slot locally and snaps back to it on refusal even when the authoritative
  re-read itself fails (refresh() swallows read errors by design).
- **Codex #191 P2 — rank seals invented an order for ties.** `competitionRanks` (pure + tested):
  tied dishes share a numeral (1, 2, 2, 4), computed from the counts in the page, not array position.
- **Codex #192 P1 / review LOW — the pay itemization binds to the LOCKED cart** (refresh after
  create-intent locks; post-lock staff edits stay visible and the webhook reconcile refuses a
  mismatched charge).
- **Codex #192 P2 / review LOW — the pickup contact write is load-bearing**: verified with
  `.select("id")`, refusing the payment (releasing the lock) when nothing wrote — a charge without
  the stored phone defeats the requirement. Scango's optional name keeps its non-fatal stance.
- **Codex #192 P2 / review MED — the phone finally has a reader**: the expo board joins
  `qr_orders.cart_id → qr_carts.customer_phone` (fourth bounded staff-gated read) and renders a
  one-tap tel: link on pickup tickets.
- **Review MED — `openSettlement` gates by session MODE** (dine-in only, fail-closed): the split is
  a directly-POSTable second charge boundary that skipped create-intent's pickup slot/contact
  gates — a solo pickup diner IS their session's host. Pinned by three new tests.
- **Review LOWs**: taste empty-state advice was algorithmically backwards ("fewer" → "different"
  cravings, matching is OR); chips renamed to their literal rules ("Noodles, rice & soups",
  "Salads & veggies"); `surpriseMe` clamps a full-range rng; the surprise row re-derives by id
  against the live catalog (no stale sold-out cards); the two-row Start-here wall is now an opt-in
  modifier (>3 cards) so a one-heart FavoritesRail doesn't render a blank second row; the SQL
  test gains the 21-char upper-bound probe; the merged exit line restores "the table stays open
  for everyone else"; a single-group bill announces as "Your bill" again.

### W21 — clarity & personalization (2026-08-16)

The owner's batch, verbatim: _"cart bill and also final pay total bill (stripe checkout) should
organize dine-in and take-out items for clarity, Sales Tax (10.5%) properly formatted, kitchen is
မီးဖိုချောင်, pickup time slot still focus on soonest after selection. pickup should need name name
and phone numbe. Start here cards should be same size and larger and maybe two rows? how about a
personalizble/customizable recommendations section …? back to start and leave this table is
redundant?"_

- **The bill organizes by destination.** One shared renderer (`BillLines`) groups receipt rows into
  "At your table" / "To-go" / "Grocery" (headings only when the basket really spans 2+), on the Bill
  moment AND the pay step — which previously showed only totals: the diner confirmed a charge with
  no itemization on the very screen that takes the card. Section labels live once (`BILL_GROUPS`),
  shared with the editing cards.
- **"Sales tax (10.5%)" formats correctly.** The receipt row's `dt` is a flex container, which
  DROPS whitespace-only children — the note's `{" "}` gap vanished and rendered "Sales tax(10.5%)"
  fused. The gap is now a margin (the exact trap already documented on `<My/>`).
- **Kitchen is မီးဖိုချောင်** — 12 strings swept from မီးဖို (stove) per the owner's correction; K15
  still owns the native check.
- **The slot sheet lands ON your pick.** W20 scrolled the selected chip into view but the dialog's
  auto-focus still parked on the first chip (the earliest = Soonest). Once per open, real focus
  moves to the diner's chip (announcing "Your current time, …"); day-browsing is never yanked back.
- **Pickup requires a name and phone.** New pure gate `pickupContactMissing`
  (lib/pickup-contact.ts — shape + a ≥7-digit floor, mutant `pickup-contact/digit-floor-dropped`
  watched red first) runs at create-intent (refused BEFORE any slot capacity is consumed) and
  client-side (instant message + focus to the missing field). Phone stored on the cart only
  (`qr_carts.customer_phone`, CHECK-mirrored, migration `20260816070000`; SQL test
  `pickup_phone_bound_test.sql` in CI's required list) — PII: never analytics, no order snapshot
  until a staff surface reads it. Prefilled per-device like the name; scango keeps its optional
  call-out (nothing to phone a walk-out about).
- **Start here: uniform, larger, two rows.** The rail is a two-row horizontal grid of equal 158px
  cells (was one ragged 132px strip); photos upsized.
- **Find your dish — the taste picker.** Craving chips (🍜🍛🦐🥗🌶🌱🍳🧁, bilingual) →
  a recommendation rail where every card SAYS the literal category/tag rule it matched
  (lib/menu/taste.ts, pure + tested; keyword category matching so a rename can't kill a chip), plus
  "✨ Surprise me" (random in-stock picks excluding the diner's own hearts, framed as "How about
  this?" — never a fabricated affinity). Picks persist per-device and are editable any time; an
  empty match answers honestly instead of padding with fillers.
- **One exit line, two distinct doors.** The dine-in arrival beat's two stacked door-picker links
  merged: "Back to the start keeps your table · Leave this table frees it on this phone."

### W20 — alive & instant: optimistic UX, reactions, honest leaves (2026-08-16)

The owner's batch, verbatim: _"unleash creativity and imagination: Buttons, options, selections,
cards … still don't feel alive and interactive enough. Tip option needs to be reimagined … texts
change with % selections … Checkout Bill should include … sales tax %? Reward pick needs
improvement and That reward is already on another order error. To-go and groceries should also have
leave options and customers should have option to leave tables? Pick a pickup time still not on
selected slot. … why not make optimistic and instant feedback …? Start here carousel should have
more menu items and maybe more elevated UI/UX …"_

- **Optimistic everywhere the money allows.** The pickup ASAP⇆Scheduled pills flip the instant
  they're tapped (`PickupWhenChoice` writes in the background; a refusal reverts + explains via the
  view's one live region, serialized by a write token so an old slow failure can never clobber a
  newer choice); the slot sheet is a PURE picker (tap → report up → close, no in-sheet round trip);
  the item sheet's Add closes NOW (the provider's add was already optimistic — count bump + flash —
  and owns both outcomes). Amounts stay server-authoritative throughout: nothing optimistic touches
  a charged number.
- **"Still not on selected slot" — root-caused as slot IDENTITY.** The RPC and table serializations
  of one timestamptz differ as strings, so the sheet's `===` never matched the cart's slot. New
  `sameSlot` (lib/pickup-slot.ts) compares by INSTANT, drives the lit chip, the "✓ Yours" tag, day
  seeding, and a scroll-into-view on open (RM-aware). Tested against both serializations + garbage.
- **The tip ask REACTS.** `tipReaction` (lib/tip.ts, pure + pinned): each rung answers with its own
  bilingual line, warmer as the ladder climbs; a custom amount gets the warm generic; None gets
  NOTHING (declining is never met with a reaction). Keyed `.mms-rise` so each line rises in fresh.
- **The Bill names the tax rate.** All three totals blocks render "Sales tax (10.5%)" — the note is
  computed from `taxRate()` (the one authority), never a transcribed literal.
- **The reward follows its owner.** `mms_apply_reward` v3 (migration `20260816060000`) releases
  holds from IDLE carts (open ∧ unlocked ∧ not settling — exactly `mms_clear_reward`'s guard)
  before the in_use check, so the owner's own abandoned cart can no longer strand their coupon;
  a genuinely mid-payment holder still refuses (stealing from it would strand the webhook
  reconcile). Proven red-first: the new SQL test's first assertion FAILED against prod's old
  function before the migration existed (`supabase/tests/reward_follows_owner_test.sql`,
  registered in CI's required list). The `in_use` copy now tells the truth that remains.
- **Every mode has a named leave.** Pickup and the grocery market get the arrival-beat exit the
  dine-in menu got in W19 ("Back to the start — your order/basket stays saved on this phone");
  dine-in adds a real **Leave this table** — device-level only (`forgetDineinOnThisDevice` clears
  the persisted join code; the table stays open for everyone else; never a server mutation).
- **Start here, elevated.** The rail grows to 10 items; when real paid-order counts curated it,
  each card wears a rank seal (#1 gets the lit-gold cap + glow; sr-only twin says it in words —
  the hand-set "our picks" fallback shows NO ranks, a numeral it can't back); cards lift + photos
  breathe on hover (transform-only, RM-gated).

### W19 — production readiness: nine complaints, nine fixes (2026-08-16)

The owner's batch, verbatim: _"Pick options, select, on focus, and buttons pop or reveals … are
boring and not fun, not styled, not centered … tip options should animate and encourage creatively
with increase %. … no limit to custom or capped amount. What if customers forget to send items to
kitchen and move forward to pay …? Save a card option seems confusing. So does Make it now … how to
switch from dine-in to main portal …? why take out time selection focus always on soonest even
after selected? New menu items lacks the vibrant fun descriptions of older items."_

- **The press-state layer.** The idiom kit existed but was hover-gated — dead on the phone. Now:
  the Pay CTA fires its glow + sheen sweep on PRESS and focus-visible; ConfirmSwap reveals with
  `.mms-rise`, centers its copy, its buttons carry real press states (proceed wears the CTA
  gradient — it replaces one), and the MY label keeps its height while busy; Send-to-kitchen's
  outline + undo buttons join `.checkout-outline-btn` (hover wash + press); modifier option rows
  get hover/press and the checked control pops (`mmsPop`), with a light haptic on pick;
  SharePay's Authorize — the one CTA that takes the actual card hold — finally wears
  `.checkout-cta`. Every new rule joins the checkout reduced-motion block.
- **The tip ladder warms as it climbs** — each chip carries `--tip-heat` (15% barely gilded → 30%
  glowing); selection lights the full gold cap (`.checkout-tip-on`, the mode pills' vocabulary,
  shared with SharePay so the two can't drift); the preview amount pops when it changes.
- **The custom tip is uncapped to $1,000** (the cash tip's own bound). The 100%-of-order clamp is
  gone: `TIP_AMOUNT_MAX_CENTS` in lib/tip.ts, enforced in create-intent on the DERIVED cents (a
  rate cannot express a dollar cap), schema rail `.max(4000)`, client clamps to the same constant,
  new tests + a new mutant (122 total). Split path deliberately unchanged (its 0.5 CHECK; presets only).
- **Forgot-to-send → pay is now an INFORMED flow** (never a block — `mms_fire_pending_food` fires
  drafts the moment payment lands; money was always safe, timing was the surprise): a new pure
  `unsentFoodQty` (dinein+togo drafts, matching the fire predicate; tested + 2 mutants), a warm
  Bill-moment notice with the host's way back, "N items not sent yet" under View bill & pay, and
  the charge confirm itself names them in both tongues.
- **"Save a card" → "Put a card on file — leave whenever"**, with a "Not paying yet?" kicker
  breaking it visually from the Pay CTA (it read as a save-my-card checkout convenience; it is the
  walk-out tab). Before/after copy now shares one noun ("card on file").
- **"Make it now" → "Send to kitchen now · usually ~12 min"** — names the real action (a per-line
  kitchen commit, the vocabulary of the chip it becomes) and hedges the config estimate.
- **Dine-in now says how to leave**: the arrival beat carries "Ordering to-go or groceries too?
  Back to the start — your table stays open" via `menuHref(null)` (the exit always existed — the
  header logo — but nothing said so; the promise matches the home screen's resume card).
- **The pickup-time picker bug, root-caused as two stacked defects**: (1) the slot sheet had no
  concept of the current choice — `currentSlot` prop added, the diner's slot wears the lit state +
  ✓ Yours, the ⚡ Soonest chip keeps its tag but glows only while nothing is chosen, and the sheet
  opens on the chosen slot's day; (2) the ASAP pill genuinely re-lit after a pay-step round-trip —
  the choice lived in component state seeded from a stale server prop under the keyed step wrapper;
  it is now owned by Checkout, re-read by `refresh()` via the new shared `normalizePickupSlot`
  (lib/pickup-slot.ts, tested), so the pill state tracks the server truth.
- **The menu voice, completed** (`20260816050000_w19_menu_voice.sql`): the 31 W17d-2 items + 6
  W15-era stragglers rewritten in the house voice (concrete + em-dash pivot + triplet/kicker;
  honesty rule kept — no invented ingredients; "the regulars' pick" backed by the POS export).
  Burmese in the warmer diaspora register, still pending K15.

### W18 — the warm pass: tips that encourage, rewards that delight, a kitchen card that answers (2026-08-16)

The owner, verbatim: _"tip ask should be fun and encourage! never capped or round up, and none is
not encouraged lol. Use a reward also needs to improve. Your order's with the kitchen card should be
more interactive and informative when interacted. Your order page needs page navigation buttons?
Burmese should be fun, friendly, natural?"_

- **The tip ask encourages.** A warm subline under the ask — "It all goes to the team who made your
  meal" (TRUE for this surface: a phone payment's tip lands in W17c-4's shared team bucket) — and a
  "Thank you so much!" the moment a tip is on (ambient text, never a second live region). The
  percentages LEAD and **"None" sits last and quiet** — same tap target, muted ink, an exit rather
  than an offer. Kiosk mirrors it: the three percentage doors lead; "No tip" is a quiet ghost below
  the grid (still records 0, a real answer).
- **Round-up retired** (owner: "never capped or round up") — the chip, `roundUpTip`, the
  `effectiveTipRate` branch, its 3 mutants and tests (122 → 119). Its derive-don't-store lesson
  stays recorded in CLAUDE.md. The cap **lecture** is gone too; the custom-tip bound itself must
  stay spoken (silently charging less than typed is a wrong number), so the over-100% line now
  leads with gratitude: "Wow, thank you! $X — your whole order again — is the most we can take."
- **"Use a reward" leads with the good news** — "You've got a reward waiting" (count kept),
  "Pick one — it comes right off this order", "good through" instead of "expires", bilingual at
  last (W16b), and ဆုလာဘ် → ဆုလက်ဆောင် everywhere (the word the account already uses).
- **The kitchen strip opens.** The header is now a 44px disclosure: tap for a dish-by-dish view —
  Being made / With the kitchen / Served, each line under its state — the same kitchen-tap truth
  the strip already narrated, per dish. Bilingual headline accents. Chevron honors reduced motion.
- **The order page navigates.** "Browse the menu / market" (mode-true label, same `menuHref`
  discipline as the empty state) now sits ON the order view, hidden while a peer's pay-window lock
  freezes the cart.
- **Burmese moved to the friendly spoken register** (conversational-polite တယ်/မယ်, warmed with
  နော် — the way staff talk to a guest, not the way a ministry writes to one): the full kiosk
  dictionary, the cart dict's formal stragglers (ပို့နေသည် → ပို့နေပါတယ်, ကတ် ငြင်းပယ်ခံရသည် →
  ကတ်က အဆင်မပြေပါ), glossary alignment (မှာယူမှု → အော်ဒါ). All still pending Min's K15 native
  check — flagged per the standing rule.

### W17 design pass — the tip surfaces and the new menu, re-read as a designer (2026-08-16)

A UI/UX sweep of every screen W17 touched, fixing the places where the shipped pixels fell short of
the recorded intent:

- **Kiosk tip ask: the decline is now genuinely equal in weight.** The code's own comment (and the
  W17c-3 changelog) promised "No tip **first and identical in weight**" — but it rendered as a ghost
  outline beside three filled accent CTAs, visually demoting the decline the copy swore not to. All
  four choices are now the same `kiosk-door` card (label + exact dollar amount; the decline carries
  the checkout None-chip's em-dash), in one `auto-fit` rank. Doors also gain the `:disabled` dimming
  the CTA always had.
- **Kiosk interposed steps move focus** (QA §A): the upsell and tip screens replace the review
  screen wholesale, so focus silently dropped to `<body>` on each swap. The step heading now takes
  focus, which also makes a screen reader announce where the flow went.
- **The review's HIGH — the tip ask was unreachable on every upsell order.** `upsellOpen` was never
  cleared and the upsell renders ahead of the tip screen, so whenever the upsell interposed,
  "No thanks" re-rendered the same upsell (a dead-feeling first tap) and the second tap skipped the
  tip ask entirely — the guest's intent recorded as "never asked" (W17c-3, live since it shipped).
  One line: `askTipThenHandoff` closes the upsell explicitly.
- **Desserts placeholder glyph**: W17d-2's new category fell through `categoryIconName` to the
  generic dish glyph — every tile in a category that is entirely awaiting photography read as
  "unsorted" rather than "sweet". `/dessert|sweet|cake/` now maps to the existing `cat-candy`.
- **Register quick-tip chips light up**: tapping 15/20/30% filled the field but gave no pressed
  feedback. The chip is now lit exactly while the field holds its amount — derived from the field
  (the single source), never stored, so hand-editing the field unlights it the moment they diverge.
  "None" stays an action (clears the field), deliberately not a toggle.
- **`/staff/tips` zero state**: "Guests tipped $0.00 across 0 orders" read as a measured verdict on
  a day that hadn't happened yet — the shared bucket now says "No tips from phone payments yet
  today" until there is something to report.

### W17d-2 — the missing POS menu items, verified one at a time (2026-08-16)

The owner's directive, both halves: _"new menu items from POS are creatively created and not
duplicated if we already have prior to the POS data"_ and _"verify each item before adding"_. 98 of
149 POS items had no exact Burmese match in the 66-item catalog; **every one was classified before
anything was created**, and the full record lives in `docs/W17_PLAN.md` §W17d-2.

- **31 genuine adds** — 1,450 units of Jan–Jul 2026 volume, from Pork Tamarind Stew (151) down to
  Bottled Water (1). Each passed a machine check: no slug / English / exact-Burmese collision
  against the catalog, loose-Burmese overlaps printed for adjudication (one, adjudicated distinct:
  oil-rice-with-peas ⊂⊃ white-peas), price **read from the named POS row, never transcribed**. Built as
  designed items (bilingual names + descriptions, tax category, declared-only allergens — never
  `allergen-reviewed`), no photo yet so the designed `PhotoPlaceholder` renders. Plus a new
  **Desserts** category (sanwin makin, coconut sago, fresh fruits had no home).
- **~25 duplicates skipped** — a different Burmese spelling, word order, or an English-only POS
  label (`ကြက်သဲမြစ်` = our `ကြက်အသဲမြစ်`; `နန်းကြီးသုပ်` at 1,702 units = our nangyi mont-ti;
  Faluda, Everything Salad, Red Bull, shwekyi…).
- **4 catalog Burmese typos fixed**, guarded on the current wrong value — they were hiding real
  matches (`လက်ဖတ် → လက်ဖက်` ×2, `ငါးရံ → ငါးရံ့`, `ထေါင်း → ထောင်း`).
- **The reference generator's join fixed, red-first.** It compared non-NFC strings, so Myanmar
  asat/dot-below byte ordering — identical on screen — hid Rakhine Mont-Ti's 126-unit match. And
  exact matches now prefer the price-agreeing POS row: one dish can own several exact-named rows
  (the $10 oil-rice dish vs its $100 catering tray), and ranking by volume alone put the tray's
  price beside the dish as a false +$90 delta.
- **Skipped with reasons**: modifiers (`Egg Add-on` $3 — price question vs our $1.50/$2.00; Chicken
  Masala = a style option), **alcohol** (~49 units — a licensing question the owner answers first),
  catering trays, ≤2-unit one-off rings. Flagged questions (hilsa fried-vs-steamed naming, duck
  curry, ginger salad, fishcake) recorded for the owner.
- The reference backlog drops **98 → 60**, every residual row classified; §Price deltas stays
  "None". Migration `20260816040000` (idempotent; an upfront assert names every category slug the
  inserts join on and raises if one is missing — an `insert … select` over an absent category would
  otherwise insert zero rows _silently_, review finding). Data-only change — no new money-path
  code, no new mutants needed.
- **Review fix (HIGH): the `gluten` allergen code is not one the app recognizes.** The gluten-free
  chip rules on `gluten_wheat` exactly, and a NON-empty allergen list disables the unknown-is-unsafe
  fail-safe — so a dish _declaring_ gluten passed the gluten-free filter. Fixed on the new
  bean-fritters and on pre-existing veggie-fritters (guarded UPDATE), and the reference generator
  now **fails on any allergen code outside the canonical set** (watched red on both rows first).

### W17c-4 — tip transparency for the team (2026-08-16)

Last of the four tipping enhancements. `/staff/tips`, linked from the floor for every staff member.

**The honest constraint shapes the whole screen.** `qr_orders.settled_by` is stamped when a _staff
member_ took the money — a cash settle, a counter reader tap — and is **null** when the guest paid on
their own phone. That isn't missing data to fill in with a guess; it's a real difference between "you
were tipped this" and "the shift was tipped this". So there are two buckets and they are **never
blended**:

- **Handed to a person** — per-staff totals, and the count of orders that actually carried a tip.
- **Paid on a phone** — the shared amount, stated plainly as belonging to nobody in particular.

**No averages, no projections, no per-head split.** How the shared pool divides is the owner's
decision, and a number computed here would look exactly like a policy they had agreed to. The copy
says so, because this is the screen staff will read as an authoritative statement of their pay.

- **The role rule lives in the read, not the page.** A server sees only their own line, and the scope
  is a **predicate** — a colleague's row never enters the process. Managers and owners see everyone.
- **Names resolve inside the read**, because `listStaff` is owner-only and this screen is for
  everyone; only the ids that survived the summary are looked up.
- **A failed read renders the outage shell**, never "you were tipped nothing" — the worst false
  verdict on a screen about someone's earnings. A failed _name_ lookup is not a failed report: an id
  is a worse label than a name, but an honest one.
- **The shared bucket is true for everyone who sees it** (review HIGH). Scoping the _query_ for a
  server hid colleagues — and also made a null `settled_by` structurally impossible, so every server
  was shown _"Guests who paid on their own phones tipped $0.00 across 0 orders"_ as fact, directly
  under the promise that nothing here is an estimate. A privacy filter had become a lie about money.
  The read now takes the whole day and narrows via a **pure, mutant-pinned** `scopeToSelf`: their own
  line, the shared bucket intact. A server's headline is their own total, never the shared pool
  folded in.
- **The read is paged** like `getDayCashSummary` (review MED), for the reason that function
  documents: PostgREST truncates at max-rows with `error` still null, and a silently short tip figure
  is the same lie. Only `paid` rows are fetched, so refunded and pending don't burn the budget.
- 5 new mutants (**122 total**): the shared pool credited to a person, the self-scope zeroing it, a
  server's headline absorbing it, a refunded tip counted, and a negative tip deducting.

### W17d-1 — the catalog matches the register (2026-08-16)

Owner, 2026-08-16: _"prices should be most recent POS 2026 reference."_

W17a established that the register's price **is** the price. The generated reference found exactly
two dishes where ours disagreed, both matched on the **Burmese** name — the reliable key, since POS
and catalog English labels diverge freely:

| Dish              | မြန်မာ         | Was    | Now        | 2026 units |
| ----------------- | -------------- | ------ | ---------- | ---------- |
| Balachaung        | ဘာလချောင်ကြော် | $3.00  | **$10.00** | 269        |
| Crab Masala Curry | ဂဏန်းမဆလာ      | $30.00 | **$35.00** | 93         |

Balachaung is the large move, and it had been flagged as possibly a _different dish_ — ours read as a
$3 condiment side, the POS ring as the $10 fried version. The Burmese names match exactly and the
owner's answer was to follow the POS. The reasoning is recorded in the migration: if a $3 side
genuinely exists alongside the $10 dish, it is a **second** menu item, not this one.

- **Only these two.** Approximate (`≈`) name matches are deliberately untouched — one name merely
  containing another is not evidence about price (`ပဲပြုတ်` White Peas is a substring of
  `ပဲပြုတ်ထမင်းကြော်` Burmese Fried Rice, two different dishes).
- **Guarded on the current value, not just the slug**, so re-running after a manager has since edited
  a price from `/staff/menu` cannot stomp their decision. A second run is a no-op either way.
- `docs/data/MENU_REFERENCE.md` now reports **no price deltas** — the catalog and the register agree.

### W17c-3 — the house tip ladder, on the kiosk and the register (2026-08-16)

Owner, 2026-08-16: _"tip should be 15%, 20%, 30% options."_

- **`TIP_LADDER` is 15/20/30 on every surface** — diner checkout, kiosk, register. This _replaces_
  W17c-1's basket-size fork rather than merely overruling it: that fork existed because 18% of a $4
  tea is a meaningless 72¢, and 30% of the same tea is $1.20 — an amount a counter tipper actually
  leaves. A house that asks differently depending on where you stand is not one house.
- **The kiosk asks.** A tip step between the commitment and the handoff, shown once, and only when
  there is something to tip on (a pure-grocery basket takes none). **"No tip" is first and identical
  in weight** — the ask must never make declining feel wrong. It records `0`, a real answer.
- **The choice survives the walk to the counter.** The kiosk pays at the register minutes later, so
  `qr_carts.intended_tip_cents` holds it — named for what it is. `null` (never asked) stays distinct
  from `0` (asked, chose nothing) because the register renders them differently; a default would
  erase a real answer. Bounded by Zod **and** a column CHECK, refused while the cart is locked or
  settling, and status-guarded **in the UPDATE** so a settle landing mid-write can't repoint a tip a
  cashier is already counting against.
- **The register offers the same ladder as one-tap chips** that _fill_ the cashier's field rather
  than settling, so the amount stays visible and adjustable. Pre-filled from the kiosk choice with a
  line naming where the number came from — a pre-filled amount with no explanation reads as an
  app-invented charge. The cashier's entry remains the authority (W17c-2).
- **A failed tip write still hands off.** An unrecorded intent is a smaller harm than a dead-ended
  kiosk, and the cashier can simply ask.
- **The cap filter was made reachable.** `verify:slice` caught its mutant _surviving_: with a fixed
  ladder no preset ever breaches the 0.5 ceiling, so removing the filter changed nothing observable —
  a decorative guard. `tipPresets` now takes the ladder as a defaulted parameter so a test can pass
  one that breaches the cap and watch the rung get dropped.
- **The register's chips use the same base as every other surface** (review HIGH): they were computed
  off the tax-inclusive `settleTotalCents` while the diner and kiosk both offer percentages against
  the tip _base_ (subtotal − discount, pre-tax). An identical "20%" label therefore charged more at
  the counter — on a $50 net at 10.5% tax, $11.05 instead of $10.00 — breaking the one-ladder
  invariant this very slice claims. The base now comes from the same `getCartTotals` breakdown.
- **`setKioskTip` verifies the write matched a row** (review MED). An UPDATE returns no row count, so
  the status predicate could correctly _block_ a repoint during a settle race and the action would
  still answer ok, claiming an intent nobody recorded — the same trap `applyPromo` already closes.
  6 new mutants (**117 total**).

### W17c-2 — the cash tip is on the books (2026-08-16)

Second of the four tipping enhancements. `settleCash` passed `p_tip_cents: 0` unconditionally and the
code called cash tips _"in-hand/off-system"_ — an honest description of where the money goes and a
wrong one of the books, since the tip is part of what the cashier collected. The drawer never
reconciled against the day summary, and nobody could answer what the team was tipped.

- **The cashier enters the tip in the confirm step**, before the tendered field, because change is
  owed against the _tipped_ total. On every cash settle, not just the counter handoff — a table pays
  cash too, and its tip was equally unrecorded.
- **The one amount on the money path a human supplies.** Nothing on the server can derive it: only
  the person who took the cash knows what was left. Bounded by Zod (`0..100000`) **and** a new
  `qr_orders_tip_cents_nonneg` column CHECK — a negative tip would otherwise _reduce_ the recorded
  total, a silent discount wearing a tip's name, arriving through the money path with every other
  guard satisfied. Deliberately **no** ceiling relative to the bill: a tip larger than the order is
  real, and over-blocking a legitimate settle mid-service is as bad as under-blocking a mistake.
- **The returned total is the all-in collected amount.** `getCartTotals` is called with `tipRate 0`,
  so its total is tip-free; the change helper reading it unadjusted would hand the tip back as change.
- **The Z-report reports cash tips as _included_ in the drawer figure**, never as a bucket to add —
  the RPC folds the tip into the order total, so adding it again would overstate the drawer by
  exactly the tips and send a cashier hunting for money that was never missing.

`mms_fulfill_cash_order` has always taken `p_tip_cents` and folded it into the total, so nothing is
re-signed — the migration (`20260816010000`) adds only the missing bound. 3 new mutants (**114
total**), and `settleCash` gains its first executable coverage.

### W17c-1 — the tip ask fits the basket, and offers to round up (2026-08-16)

First of the four tipping enhancements the owner selected. `lib/tip.ts` is pure — it is arithmetic
with real edge cases, and arithmetic that decides a charged amount belongs where it can be tested
without a DOM.

- **The unit follows the basket.** Under $20 the presets are flat dollars; at or above, percentages.
  18% of a $4 tea is 72¢ — a chip nobody taps, presented in a form that reads as an ask. The chip
  _count_ is unchanged, so the five-wide 320px row still fits.
- **"Round up to $36.00"** on its own full-width row, naming the destination total _and_ the exact
  cents it adds. Not a sixth chip: the row is already full, and this offer has to state where it
  lands to be honest.
- **Nothing is offered that the server would refuse.** The binding cap is the **split** path's 0.5
  (`qr_cart_shares.tip_rate`'s column CHECK), not single-pay's 1.0 — a tip is chosen before the table
  decides how it settles, and a chip valid one way but refused the other surfaces a bound as a failed
  payment at the last tap. Pinned against **both** schemas so neither can drift.
- **Round-up declines to fire on an already-whole total.** There is nothing to round, and charging a
  dollar under that label would be a different, larger ask wearing the round-up's clothes.
- **The round-up rate is DERIVED each render, never frozen** (review HIGH, a defect this slice
  introduced): its rate depends on the basket, so storing the tapped number desynced it from the
  total it names the instant the cart moved — a promo, a qty edit, a group peer's edit. The diner was
  then charged a tip that rounds to nothing, on a total the UI no longer named, with **no chip lit**
  to show a tip was active at all. Percentages had never exposed this because 18% is 18% whatever the
  basket does. The component now stores the _choice_; `effectiveTipRate` in `lib/tip.ts` derives the
  rate from the current numbers, so the pressed chip and the charge read one value and cannot
  disagree. That decision lives in `lib/` deliberately — `Checkout.tsx` is outside
  `check-money-coverage`'s paths and has no component test, so a rule left there could not be guarded.
- Every chip still produces a **rate**, never an amount — the charge stays `round(net × rate)`
  server-side. The tests assert each label against that exact formula, swept across basket sizes
  rather than one convenient fixture, and the round-up sweep now covers **every** value of
  `due % 100` (it had stepped by 7, testing 14 of 100 while reading as exhaustive). Both sweeps
  collect failures instead of making 80k `expect` calls — 2.9s → 49ms, because a slow guard is one
  someone eventually stops running. 5 new mutants (**111 total**), each watched red.

Still to come in W17c: the tip on the staff cash settle, the kiosk/register tip prompt, and staff tip
transparency.

### W17b — a manager can set a menu price from the console (2026-08-16)

The owner's parenthetical in the W17 directive: _"staff portal should be able to update prices?"_

`/staff/menu` (manager+) lists the live catalog at the prices a guest would actually be charged, and
lets a manager change one. This is the **only** place in the app where a money amount crosses from a
human into the system — every other amount is server-derived, and that rule isn't weakened here: a
manager setting the menu price is the decision the rule protects. What changes is which number
`priceItem` reads next.

- **Gated where it counts.** The manager floor is re-checked _inside_ `setMenuPrice` — a Server
  Action is a public POST endpoint, so the page gate is convenience and the action gate is the
  authority. The service client is created only _after_ the gate: authz proven before elevation.
- **Bounded on both sides.** Zod `.min(25).max(500000)` **and** a new `menu_items_base_price_cents_bounds`
  column CHECK. `base_price_cents` was writable only by a migration until now; once a human can type
  it, a fat-fingered $1,900 has to be a refusal, not a money incident.
- **`menu_price_audit`** records old → new against the caller's `staffId`. Staff mutations elsewhere
  are best-effort PostHog telemetry — the right weight for "who bumped a ticket"; a price is the
  number every future guest pays and has to be answerable from the database months later. RLS:
  manager+ read, **no insert policy at all** so only the service-role path can append — which is what
  makes the ledger unskippable.
- **An unrecorded change is surfaced, not swallowed.** If the ledger insert fails the manager is told
  the price landed but the record didn't, rather than handed a clean success over a change nobody
  logged. The price is deliberately not rolled back: an unrecorded correct price beats a reverted one
  the kitchen has already been told about.
- **Nobody is re-priced mid-meal.** `unit_price_cents` is stamped on a line at add time and nothing
  here touches `qr_cart_items`, so lines already in a cart keep what they were quoted and paid orders
  are history. The page and the confirm step both say so.
- Two-step confirm naming the old price, the new price and the direction — the staff console's
  existing inline idiom (`CashSettleButton` et al), and exactly the class of button the owner asked
  to confirm in W16c. Focus moves into the group on open and back to Save on cancel.
- **Compare-and-swap on the write** (review MED): the update asserts the price it read, not just the
  id. Keyed on the id alone, two managers on two tablets both land their write and the second records
  a ledger row claiming it changed the price _from_ a value that was already gone. The live price is
  still whoever wrote last — not itself wrong — but reconstructing "from what?" is the only reason
  the ledger exists. Losing the race matches zero rows, which is re-read and reported as "someone
  else just set it to $X — nothing was changed", distinct from the dish having vanished.
- 5 new mutants (**106 total**), each watched red: the role floor dropped to `server`, the zero-row
  update reading as success, a transport failure reading as "no such dish", the price write without
  its compare-and-swap, and the swallowed audit failure.

**Deliberately not included: a per-mode `togo_price_cents`.** W17a established one POS price per dish,
and the handful that genuinely differ would need the dine-in↔to-go toggle to **re-price again** — the
machinery W17a just removed. That is a real money-path change and it waits on the owner confirming
the four candidate prices rather than being built on the chance they say yes.

### W17a — real POS pricing (the mode markup is reverted) (2026-08-16)

The owner: _"let's just revert to real POS pricing for both dine-in and take-out for now."_ Decision
locked via AskUserQuestion: **bare POS price, no markup** — dine-in and to-go ring the same amount.

**Why the W16a markup was wrong, from the owner's own exports.** Zettle/PayPal stores ONE menu price
per dish; what separated a dine-in ring from a to-go ring at the register was the TAX COLUMN, not the
price. Dine-in rows carry 25.5% (10.5% sales tax + a 15% dine-in **service charge**); to-go rows
carry 10.5%. Validated on the qty=1 rows of the 2025 report, which act as a Rosetta stone — "Duck
To-Go 1 $2.00 $21.00" → net $19.00 × 0.105 = $2.00, and "Salted Fish Dine-In 1 $4.85 $23.85" →
the same net $19.00 × 0.255 = $4.85. Same dish, same $19.00 menu price, two tax treatments. Across
the 365 rows whose rate is derivable, 209 sit at ~10.5% and 155 at ~25.5% (one outlier). And of the
72 dishes sold BOTH ways in Jan–Jul 2026, **66 price identically**. So W16a's +15% dine-in re-created, as a price increase, the very service charge
the owner had just retired.

- **`lib/mode-price.ts` is deleted** (with its suite and `reorder-mode.test.ts`). The charged unit is
  `base_price_cents` + the chosen modifiers' deltas, at the one `priceItem` seam — every add path
  (diner, staff register, kiosk, reorder) inherits it. Every price DISPLAY reverts with it.
- **The for-here↔to-go toggle is tax-only again.** A flip moves the routing tag and the per-line tax
  (cold food is taxable dine-in, exempt to-go); it never re-prices. `setLineFulfillment` simply omits
  `p_unit_price_cents` — the SQL fn's documented "leave the price alone" path (`coalesce(null,
stored)`) — so **no migration is needed** and no signature changes. The optimistic client flip
  drops its rescale preview for the same reason.
- **Tax stays 10.5%** (owner-confirmed) and the service charge stays retired: `serviceChargeCents`
  remains a constant 0 in the totals shape, and `lib/receipt-view.ts` keeps its `> 0`-gated
  historical row + SB-1524 disclosure so pre-change orders still render their snapshot.
- verify:slice: the 5 markup mutants are retired and 2 replace them — `order-lines/pos-price-marked-up`
  (a factor grown back at the seam) and `cart/toggle-re-prices-the-line` (any price forwarded on a
  flip). The staff mode-fork mutant survives with its real meaning: it guards the routing + tax fork,
  not a price. `order-lines-price.test.ts` and `cart-toggle.test.ts` are rewritten against the
  unfactored seam; the staff-cart fork assertions moved from the pricing call to the line's tag.

### W16d+e — the photos come back · bilingual breathing room (2026-08-15)

**W16d — the missing dish photos.** The owner asked why dishes like Kyay-O had lost their photos.
Root cause: W13 added a `fallback.jpg → null` display filter believing those rows shared one
generic stock image. Probing the live storage bucket disproved it — every
`menu-photos/<id>/fallback.jpg` is a DISTINCT real photo of that dish (different sizes and etags
per id; the `photo.jpg` some rows were assumed to have 404s). **Measured against prod: of 66 active
menu items, 34 carried a filtered filename — every one a real photo** — 29 carried another, and
just 3 are genuinely NULL. So the filter was hiding 34 real photos behind the placeholder on the
menu grid, item sheet, Start-here, favorites, cart and bill thumbs, and order history at once —
while the kiosk, which never imported it, had been showing those same photos all along.

- `displayImageUrl` is **deleted**; `safeImageUrl` (containment — what `next/image` and the CSP
  accept) is the only rule left, and all four importers now call it. "Does this dish have a photo?"
  is a DATA question: a row with no photography carries NULL and still gets the designed placeholder.
- The kiosk and the staff add-items page passed the RAW DB value into `next/image` (which throws at
  render on a non-allowlisted host) — both now go through containment too.
- `media-url.test.ts` inverted red-first: a contained `fallback.jpg` must PASS; an uncontained one
  must still be refused. **`scripts/check-photo-filter.mjs` is the guard that actually pins the
  fix** (wired into `verify:slice`): the unit test is BLIND to the filter being re-added at a call
  site — proven by re-adding it inside `getCartView` and watching the suite stay green while the
  grep goes red. Docs carrying the wrong "31 of 60 dishes have no photo" count corrected against
  the measured figures — the owner's photography task is 3 NULL dishes (OPEN-ITEMS C5,
  PRODUCTION_PLAN §1/§5/§W2a).

**W16e — spacing and typography** ("texts, fonts, contents, surfaces, layers … with enough
paddings and margins"). Two structural levers, then the ranked list:

- `[lang="my"]` finally gets `line-height: var(--lh-my)`. The token has said 1.6 since W5, but only
  the retired `body.my` reading mode ever applied it — so no Burmese accent has EVER had its own
  leading, and Myanmar stacks diacritics above and below the base glyph. This is what makes W16b's
  stacked-everywhere bilingual layout safe by construction. `body` likewise inherits `--lh-normal`
  instead of the browser's ~1.2.
- Burmese below the 13px floor lifted to `--fs-sm` (Start-here, history lines, the history heading
  accent, modifier groups and options); the dish's Burmese name goes to body size with its crowding
  negative margin removed.
- The photo SLOT no longer hides on a null src (Start-here + favorites rendered ragged short cards
  next to full ones); `.item-hero` swaps its fixed 200px band for an aspect ratio so restored photos
  crop less.
- `.checkout-cta` gains the `min-height` + vertical padding its call sites kept re-declaring — the
  bilingual two-line labels grow the button instead of clipping. Token hygiene: `--w-content` for
  the three hardcoded 440s, `--s3`/`--s4`/`--s5` for off-grid card gaps and padding, one 12px
  rhythm across the cart/bill/history/favorites thumb rows, explicit margins on the menu category
  heading (Tailwind v4 preflight zeroes them), and breathing room + a width guard on the add toast.

### W16c — the important buttons ask first (2026-08-15)

Owner directive: "Important buttons like Send to kitchen … or finalize pay bill should ask to
confirm decision."

- **`ConfirmSwap`** (`components/ConfirmSwap.tsx`) — the repo's inline two-step confirm idiom
  (already shipped four times on the staff side) extracted as ONE shared primitive: the trigger is
  replaced in place by a `role="group"` card with Cancel + proceed. Deliberately not a modal —
  nothing else is inerted, so `aria-modal`/`alertdialog` would lie; the Radix `Sheet` (scrim +
  drag + lazy domMax chunk) is the wrong tool for two buttons. Focus parks on the SAFE choice, the
  caller returns it to its trigger, both targets ≥48px, no new live region, no animation.
- **Three money CTAs now confirm**: **Send to kitchen** (names the item count it commits; the 10s
  server-clocked undo STAYS — the two guard different failure modes), the **finalize charge** in
  `PaymentSection` (the real `stripe.confirmPayment`, not the review step's intent mint, which is
  already reversible via "Edit order"), and **SharePay's Authorize $X** (a real card hold, so the
  same policy rather than a silent inconsistency).
- **The wallet path stays unguarded by design** — Apple/Google Pay interpose the OS payment sheet,
  and stalling `ExpressCheckoutElement.onConfirm` behind an app dialog both double-asks and risks
  expiring the wallet session.
- Copy is bilingual and pure (`lib/i18n/confirm.ts` + `lib/confirm-copy.ts`): the owner's Burmese
  "Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ" rides the send proceed-button **verbatim** (pinned by a test
  and a mutant), amounts are Latin digits in BOTH tongues, and every decision's copy is walked by
  `confirm-copy.test.ts` (3 rules proven red-first, 2 new mutants — 105 total).

### W16b — always bilingual: the language toggle is retired (2026-08-15)

Owner directive ("Ditch the language toggle and have bilingual only"):

- **Deleted**: `LocaleToggle`, `LocaleProvider` (useLocale/useT), the proxy's Accept-Language
  cookie seed, `setLocalePref` (+ the `lang_change` PostHog event), the /account Language row,
  the `body.my` reading mode, the `mms.qr.locale` handover exemption, and the locale carriers
  (`LOCALE_COOKIE`/`LOCALE_STORAGE_KEY`/`isLocale`). `<html lang="en">` is fixed; Burmese
  renders as per-span `lang="my"` accents (WCAG 3.1.2). `mms_profiles.locale` returns to
  dead-column status (no writer; column left in place).
- **Kept**: the typed `lib/i18n` dictionaries + guards (the bilingual string source), the
  `[lang="my"]`/`[lang="en"]` typographic rules, and `t(locale, key)`'s signature.
- **Every W5-L2 money moment now renders STACKED EN+MY**: the checkout headings, receipt rows
  (a bilingual `Row` — EN label + inline Padauk accent against the dotted leader), EmptyState,
  promo placeholder/Apply, tip heading, grand-total label, and the three CTAs (Send-to-kitchen —
  the owner's named example — View bill & pay, Pay), each with the MY line under the EN+amount
  line, Latin digits only. Deliberate exception: tip CHIPS stay EN-only (five chips on a 320px
  row; the bilingual group heading carries MY).

### W16a — no service charge · mode-derived prices · 10.5% tax (2026-08-15)

> **Superseded by W17a (2026-08-16)** on the pricing half only: the mode markup below was reverted
> to bare POS prices once the Zettle exports showed the 15% was the service charge, not a price
> difference. The service-charge retirement and the 10.5% tax rate stand.

The owner's money reset (closes C12 + C13): the 5% SB-1524 service charge is **retired**, and
service margin moves into the prices themselves —

- **Mode-derived prices** (`lib/mode-price.ts`): dine-in = base ×1.15, to-go = base ×1.05, each
  rounded to the nearest $0.25 (Math.round half-up over cents/25); the factor applies to the
  base + modifier-delta SUM at the ONE pricing seam (`priceItem`); grocery untouched. The
  for-here↔to-go toggle re-prices in TS (exact re-derive from stored option ids, ratio-rescale
  fallback) and hands the price to the re-signed `mms_set_line_fulfillment` — SQL never re-rounds.
- **Sales tax 0.0975 → 0.105** (owner-confirmed L.A rate), TS + SQL in one deploy
  (`20260815200000_w16a_mode_prices_tax.sql`); both parity suites recomputed in Node.
- `serviceChargeCents` stays in the totals/order shape as a constant 0 (split/webhook/QBO/receipt
  contracts unbroken); historical receipts keep their stored service row + SB-1524 disclosure.
- Every price display reproduces the server math via `modePriceCents` (menu cards, item sheet,
  favorites rail, kiosk, staff register); checkout drops the service row + disclosure; stale
  service-charge copy fixed across staff surfaces.
- verify:slice: 4 new mutants (factor drifts ×2, rounding-deleted, staff mode-fork collapse) —
  99 total.

### M3 — modifier option ids (faithful reorder) (2026-08-15)

Order lines finally carry the STABLE option ids beside the display labels
(`20260815100000_m3_modifier_option_ids.sql`):

- `modifier_option_ids jsonb not null default '[]'` on qr_cart_items + qr_order_items; NO
  backfill (label→id is lossy by construction). Labels stay the receipt artifact.
- `mms_cart_item_insert_if_open` re-signed (+`p_option_ids`, appended last, spread-only-when-set
  in TS — deploy-order safe); the three fulfill RPCs restated from their newest baselines with
  the column riding the cart→order item copy.
- `priceItem` returns `optionIds`; the diner add, staff add, and reorder paths all thread them.
- **Reorder is faithful now**: stored ids re-price through the same `priceItem` at today's
  deltas; a vanished/deactivated option is DISCLOSED (`optionsReset`), a required-group loss
  skips honestly (`needs_choices`); legacy label-only rows keep the base-dish fallback. Decision
  rules live pure in `lib/reorder-options.ts` — pinned by tests + 4 new verify:slice mutants (96 total).
- `modKey` (line merge + SQL fold) stays on labels — Q10 registry.

### W15 — POS truth: real Zettle data → menu · grocery · favorites (2026-08-15)

Six months of real POS history (Jan–Jul 2026 sales + the 2026-07-31 item library) reconciled
into the catalog (`docs/W15_PLAN.md`):

- **Menu**: 10 price corrections to the library's dine-in price (Kyay-O 18→20, Tea Salad 12→14,
  Coffee 6.50→5, …); 9 `popular` tags stamped from REAL top sellers (the StartHereBand/badge
  fallback layer is finally data-grounded — `getMostLoved` still supersedes it as QR history
  grows); 6 missing high-sellers added (Veggie Fritters, NgaPi & Veggies, Malar Spicy Beef,
  White Peas, two packaged drinks pinned `retail_nonfood` — carbonated is always taxable in CA).
- **Grocery**: 60 exact-match shelf-price updates (`price_source: zettle_pos_jul2026`,
  compare_at cleared where the CHECK would break) + 9 house SKUs (Balachaung jar, dried
  goat/fish/crickets — synthetic 29915-prefix EAN-13s). 14 fuzzy matches deliberately NOT
  applied (owner-review table in the plan).
- **Prod apply artifact**: `supabase/data/w15_pos_apply.sql` (guarded, idempotent).
- **Surfaced, not changed** (owner decisions → C12/C13): POS 15% dine-in service charge vs the
  app's disclosed 5%; POS 10.5% L.A sales tax vs the app's 9.75% Covina rate.

### W5-L1+L2 — one tongue: the EN↔MY toggle + the money-moment dictionary (2026-08-15)

S2 (high) progress — the app finally switches languages (`docs/W5_PLAN.md`):

- **`lib/i18n/`** — typed `{en, my}` dictionaries (`common.ts` chrome + S14a glossary; `cart.ts`
  ~50 money-moment keys, v7.2-sourced where authored), `as const` + `keyof` so a missing key is a
  compile error; `t(locale, key)` is the whole engine (Burmese is plural-free — no i18n library).
- **Six red-first guards** (`lib/i18n/strings.test.ts`): EN/MY parity · no untranslated
  placeholders · Myanmar-script presence · Latin digits on money/legal keys · the အော်ဒါ glossary
  rule · `t()`/`isLocale` shape.
- **Locale carrier** — `mms_locale` cookie (1y, not httpOnly) read in the force-dynamic root
  layout → `<html lang>` + `body.my` stamped SERVER-side (no EN→MY flash); `LocaleProvider` flips
  client leaves synchronously then `router.refresh()`es the RSC shells; `proxy.ts` seeds from
  Accept-Language (my → MY, everything else EN) only when absent; `mms.qr.locale` mirror is
  EXEMPT from the W14 device-handover clear (a person's setting, not an order pointer).
- **The toggle** — AppHeader chip on every diner route + the /account Language row; kiosk a11y
  rule verbatim (visible label IS the target language's own name, `lang="my"` on the Burmese
  label); `setLocalePref` revives dead-since-M4 `mms_profiles.locale` + `lang_change` PostHog.
- **`body.my` reading mode** — Padauk becomes the base face, display/eyebrow tracking neutralized
  (negative tracking collides stacked Myanmar glyphs), `--lh-my` leading, `overflow-wrap:
anywhere` on every `lang="my"` subtree.
- **L2 render sites** — Checkout headings (primary/accent swap by locale), empty cart, totals row
  labels, promo/tip/custom chips, Send-to-kitchen CTA, View-bill/Pay CTAs; the SB-1524 Burmese
  plain-voice line ACCOMPANIES the English disclosure in MY mode (EN stays the legally operative
  artifact). `receipt-view.ts`/`totals-math.ts` stay monolingual — translation is presentation at
  the render site, never in a money module.

### W7a — the receipt artifact (2026-08-15)

Closes S1 (high): the post-pay receipt finally exists as an ARTIFACT — durable, emailable,
printable (`docs/W7A_PLAN.md`):

- **The durable link**: `mms_receipt_tokens` (migration) — an opaque ≥256-bit bearer per order
  (the merge-token pattern: service-role only, 90-day TTL, revocable, rotated only after expiry so
  an emailed link never dies under the diner). `/track?r=<token>` renders the **session-less
  itemized artifact** — the copy that outlives the 4h anon TTL, a cleared table, and the device.
  The resolve predicate IS the authorization (shape gate + expiry, both red-first + mutants); the
  mint requires an ALREADY-authorized caller (earner or `qr_order_payers` — pinned + mutant).
- **The artifact itself** (`ReceiptCard` + `lib/receipt-view.ts`, pure + red-first): itemized
  lines, zero-gated breakdown, ONE order-level tax row (M7 — per-line tax can differ by a
  rounding cent), the **SB-1524 disclosure verbatim wherever the fee appears** (DESIGN-RESEARCH
  names fees-only-on-the-emailed-receipt as the north-star teardown's failure), tender vocabulary
  incl. the W6c reader ("Card · reader"), bilingual accents, reorder + account doors.
- **Print**: the repo's first `@media print` block — the artifact prints as a clean slip
  (print-to-PDF IS the PDF pipeline); a `Print or save as PDF` affordance on the view.
- **Email receipt** (consent-first — nothing auto-sends): "Email me this receipt" on the /track
  receipt card, account email pre-filled never auto-submitted; `setReceiptEmail` authorizes
  (earner/payer) → rates (`RECEIPT_RATE` 5/10min — a purpose-built outbound-email budget, never
  MUTATE_RATE's 120/min) → writes `qr_orders.receipt_email` with the paid-status guard in the
  statement → drains the Resend send via `after()` (`OrderReceiptEmail`, the same pure model as
  the page, durable link embedded). Feature-off honestly when no from-address is configured;
  `RESEND_RECEIPT_FROM` (C8) ships with a documented `RESEND_FROM` fallback.
- v7.2's "Receipt sent to your phone" promise becomes true — and honest.

### W14 — the profile slice (2026-08-14)

Recognition, history richness, and account presence (`docs/W14_PLAN.md`) — RUBRIC axis J-F
("Visit N ≠ visit 1"), the axis that baselined at 1:

- **The name finally exists**: `setDisplayName` is the FIRST writer of `mms_profiles.display_name`
  (the column shipped with M4; three readers waited a year) — an inline Add/Edit-name affordance
  on the identity card (prefills from the device's typed table/pickup name, never auto-saves;
  80-char bound refused with honest copy, mirrored by the column CHECK). Saving lights up the
  /account heading, the menu's "Mingalaba, {first name} ✦" greeting, the lend confirm, and the
  switcher chips. The card grows the v7.2 profile shape: tier-tinted avatar initial
  (grapheme-segmented — a Burmese initial renders whole) + "Member since {Mon YYYY}" tenure.
- **Device-session hygiene (J19's K7 half)**: switch/lend/forget now clear `mms.name` + every
  `mms.qr.*` pointer (`lib/device-session.ts`, boundary pinned red-first) — a handed-over phone
  can no longer rejoin the owner's table under the owner's name.
- **History rows lead with the photo**: `getOrderHistory` joins TODAY's catalog over the soft
  `menu_item_id` refs (menu uuid / grocery barcode — the W13 `getCartView` partition; advisory
  posture, media only, amounts untouched) → 44px lead thumbs + `lang="my"` sublines on the
  receipt lines (`.history-line-my`), with the designed placeholder always rendered.
- **The reorder link stops guessing (J19's mode half)**: `reorderLink` derives the destination
  from the order's own lines — pure-grocery links to the market ("Shop the market again" — the
  old link re-ran a reorder that skips grocery and returned nothing); food rides the pickup
  door, with dine-in deliberately demoted (no phantom host table minted from home).
- **Account presence**: the masthead recognizes ("Mingalaba, {name} ✦ · N orders this month" —
  only when real data exists), the favorites strip gives the hearts a home on the profile
  (in-stock, hearts order, cap 8 — `pickFavoriteRail` pinned), skeleton parity for the identity
  card + thumb rows, bilingual masthead/history accents (K15-flagged for native check).
- **M46 discipline**: the history card's decision logic extracted to `lib/order-history-view.ts`
  (month grouping at the LA clock, fulfillment precedence, lead-photo pick, reorder destination)
  — every rule red-first, including a surviving-mutant catch (the empty-lines reorder case).

### W13 — the premium feel (2026-08-14)

The maximalist polish pass (`docs/W13_PLAN.md`) against RUBRIC axis #5's own named criteria —
the add moment, photos, haptics, directional motion, bilingual accents:

- **The added-to-cart moment**: the toast springs in on the `--spring` curve and speaks both
  tongues ("Added to your order · ထည့်ပြီးပါပြီ", the MY segment its own `lang="my"` span); the
  cart bar springs up (`translateY(140%) → none`) with the v7.2 count capsule + keyed `.mms-pop`;
  a 5-gem deterministic `MicroBurst` fires from the Add control on the morph; the **haptic weight
  hierarchy** ships (6 stepper · 8 quick-add/scan · 12 sheet-add, `lib/haptics.ts`) with the
  synchronous-matchMedia reduced-motion guard promoted from PaySuccess.
- **Photos + Burmese on the money path**: `getCartView` lines now carry `imageUrl` + `nameMy`
  (menu half rides the existing availability query — zero extra round trips; grocery half is one
  barcode-keyed read); 50px thumbs on the cart line cards, 40px on the bill receipt rows, the
  designed `PhotoPlaceholder` ALWAYS rendered; grocery basket rows stop collapsing the photo
  slot; `fallback.jpg` rows fall to the designed placeholder instead of a generic stock image.
- **`lib/media-url.ts`** — the ONE image-URL containment guard, shared + red-first-pinned. The
  new suite **caught a real hole in the W4b-era inline guard: protocol-relative `//evil.host/…`
  passed the `startsWith("/")` check** (the browser resolves it cross-origin); closed everywhere.
- **Directional steps**: back flips inside /cart (bill→order, pay→review) enter from the left —
  the J1 back-slides-back rule finally applies to the in-checkout cuts.
- **Bilingual accents**: the moment headings ("Your order · သင့်အော်ဒါ", "Your bill ·
  သင့်ဘောက်ချာ"), the empty cart, and per-line Burmese names across cart + bill (100% `name_my`
  coverage finally reaches the post-add path).
- Presentation-only (no charged amount, no mutation path); every new keyframe is token-duration
  (RM collapse) or carries its own reduced-motion block; transform/opacity only.

### W12 — the two-moment checkout (2026-08-14)

The dine-in cart stops asking the diner to pick a **settlement model** ("Send to kitchen" vs
"Keep tab open" vs "Secure your tab" vs "Continue") and stages the two verbs a restaurant guest
actually has — the world-class shape (me&u / sunday / Toast converged here); design-of-record
`docs/W12_PLAN.md`, anchored on ORDER-MODEL's own **"'Checkout' = tab-close"**:

- **The Order moment** (`/cart`, drafts present): the editing surface + **"Send to kitchen · N
  items" promoted to the primary CTA**, with a quiet live-total "View bill & pay · $X →" bar
  (promoted to primary once everything's with the kitchen). No promo/tip/fee ceremony here.
- **The Pay moment** ("Your bill" — the mid-meal settle-nudge journey lands here directly): the
  lines as read-only rows inside the textured receipt slip (qty × name · dotted leader · amount ·
  kitchen state · owner) over the fee breakdown + SB-1524, then promo/reward/tip and **"Pay · $X"**
  (group: "Pay the whole order"). "← Back to your order" mirrors the pay step's quiet pattern.
- **Tab vocabulary retired diner-side** — the tab is a state, not a choice: the "or settle later"
  tray, the "Keep tab open" pill, and the diner `openTab` call are gone (an unsettled table IS the
  trust tab; staff floor machinery, ceiling/nudge, audit all untouched); the CTA never says
  "Settle tab"; `SecureTabButton` reframed as one quiet benefit line on the bill ("Save a card —
  leave whenever"); a secured tab reads "Card on file — pay here anytime, or just leave…".
- Presentation-only: same route, same machinery (pay-window lock + beacon, realtime, splits,
  settling board, outage honesty), zero money-path changes; pickup/scango unchanged (already
  one-moment). The stage flip rides the existing `viewKey` focus + enter-animation discipline;
  the landing rule is pure + pinned (`lib/checkout-stage.ts`, red-first; 362 qr tests).
- Registry: **S13 opened** (an open tab never extends the 4h session TTL — surfaced by the W12
  periphery map) · S3.1 diner-open affordance noted retired.

### W7b — the resilience shell (2026-08-13)

Production readiness (closes **S3**; plan: `docs/W7B_PLAN.md`): the PWA/offline layer, ported from
the delivery repo's production-hardened Serwist pattern and made STRICTER for this app's honesty
discipline.

- **The service worker** (`sw/sw.ts`, built by `scripts/build-sw.mjs` after `next build`; the
  artifact joins turbo's build outputs — the cache-blindness trap). Documents are **network-only**
  (the per-request CSP nonce forbids HTML caching; a cached document would also break the W10b
  chunk-reload boundary) with a **synthetic offline shell** built inside the SW; `/api/*`,
  `/ingest/*`, and every POST are never intercepted (a cached `/api/health` ok would re-blame the
  diner during a real outage); runtime caches cover only hashed immutables + `/_next/image`
  (status-200 only — the delivery cache-poisoning lesson), capped + `purgeOnQuotaError`.
- **The update flow** (`ResilienceShell`): registration + `registration.update()` on a 10-min
  heartbeat + visibility/online wakes (installed PWAs never hard-navigate), the first-install
  `controllerchange` guard, and a quiet "A new version is ready — Refresh" strip (`SKIP_WAITING` →
  guarded reload → 4s failsafe). The ambient **offline pill** reads `useConnectionTruth`
  (`you-offline` only; `we-down` keeps the per-surface outage voices), `role="note"`, hidden on
  `/staff` · `/kiosk` · `/board`.
- **The offline scan queue** (the concrete-walled-store case). Server half: `mms_scan_events` +
  both cart-write RPCs re-signed with `p_scan_id` — the per-scan-EVENT claim is the RPC's first
  statement, atomic with the write, so an at-least-once replay can never double-add (a repeat
  barcode WITHOUT a scanId still deliberately counts — the live rule). A duplicate answers as an
  idempotent OK (inc: silent no-op; insert: NIL-uuid sentinel). Client half
  (`lib/grocery-queue.ts`): entries are `{scanId, cartId, barcode, queuedAt}` — never a price;
  enqueue only on device-offline; serialized FIFO drain with spacing through the page's
  seq-ticketed funnel; verdicts ride scanAdd's union (rejected dequeues, a TERMINAL cart flushes
  its whole queue — never replay into a re-minted fresh basket); 2h TTL, capped, corrupt-entry
  pruning; a visibly-distinct pending strip (queued scans never join the basket or total).
- **The barcode map** (`lib/grocery-catalog-cache.ts`): the browse fetch stashes barcode→name/price
  for offline feedback — labeled estimates ("≈"), display-only by construction.
- Guards: `lib/grocery-queue.test.ts` (16) · `lib/order-lines-scan.test.ts` (3) ·
  `lib/grocery-scan.test.ts` (2) · `supabase/tests/scan_dedupe_test.sql` (CI real stack, in the
  required list; BURN asserts red-first-run on a local pg16) · six new `verify:slice` mutants
  (**88 total**), each watched fail.
- **Review round (ONE capped pass, 3 lenses / 7 agents / ~15 min): 2 HIGH (same defect) + 1 MED +
  4 LOW confirmed, 1 refuted — all fixed.** The HIGH: the transport-catch enqueue minted a FRESH
  scanId for a live attempt that may have committed (live scans carried no id) — a lost-response
  scan replayed under a new identity and double-added past the ledger. Fix: `add()` mints ONE id
  per physical scan, sends it on the LIVE attempt, and the queued retry reuses it (pinned by the
  `enqueue-mints-its-own-id` mutant). MED: the drain's per-outcome toasts clobbered each other
  (single-slot flash) — a rejected saved scan vanished behind the success line; now ONE composed
  `drainSummary` message (pure, unit-pinned). LOWs: both RPCs now RAISE on a refused write with a
  claimed scan_id (a committed claim with no write burns the id — its replay would report
  "delivered" for a scan that never landed; SQL-pinned in `scan_dedupe_test.sql`); the update
  strip's 4s failsafe is cancelled on the normal `controllerchange` reload (no double reload on
  slow networks); the cross-tab localStorage lost-update residual is documented + accepted (S3b).

### W6c — Stripe Terminal (2026-08-06)

In-person card at the register (M6·P6.2 pulled forward; plan: `docs/W6C_PLAN.md`). Server-driven:
the S700 is commanded through the Stripe API from staff-gated actions — no client SDK, no
connection tokens (the plan's correction to M6_DESIGN), and the reader never sets a price.

- **The settle (`lib/terminal.ts`).** `settleCard` copies `closeSecureTab`'s freeze lifecycle, not
  `settleCash`'s: `acquireSettlement` BEFORE any money derivation, PI minted from
  `getCartTotals(cart, 0)` (`card_present`, automatic capture, per-attempt idempotency key —
  a stable key caches a decline 24h), `processPaymentIntent` with `skip_tipping: true`, and the
  success path HOLDS the freeze — the webhook's open→paid flip is the terminal state. Every
  failure path cancels the orphan PI and releases. `terminalStatus` polls the PI's truth and
  `extendSettlement`s mid-collect (a slow chip interaction can't outlive the 10-min TTL and lose
  the cart to a diner mint / kioskReset / a new split). `cancelTerminal` clears the reader, then
  the PI, and releases ONLY on a successful PI cancel ("too late" when the tap won).
- **The webhook arm (`kind: 'terminal'`).** Rides the existing succeeded→reconcile→
  `mms_fulfill_order` path (idempotent on the PI id, cross-tender guard included) with three
  deltas: `tender='terminal'` + `settled_by` attribution, the counter-session close (extracted to
  `staff-open-cart.ts` and shared with `settleCash` — a webhook-fulfilled counter order must not
  squat in the register queue for 12h), and a terminal `payment_intent.canceled` release arm.
- **Migration `20260806100000_w6c_terminal.sql`.** `tender` CHECK grows `'terminal'`;
  `mms_fulfill_order` re-signs with `p_settled_by` + `p_tender` (both defaulted — the deployed
  online path resolves unchanged; full live-body restate from w3_kitchen, both signatures dropped,
  grants re-issued). Types regenerated.
- **The register UI.** "Card on the reader · $X" beside Cash (rendered only when
  `STRIPE_TERMINAL_READER_ID` is configured — feature-off unset, the /board pattern); the live
  collect panel survives the settle section's unmount (parent state, the W6a handoff lesson) with
  honest states (on reader · recording · declined-with-code-copy · canceled) and a reader Cancel;
  the counter handoff `#CODE` card unchanged. Z-report gains **Card · reader** as its own column
  (never folded into online card — the reader reconciles against Stripe Terminal).
- **Tip = 0 in v1, decided.** The webhook reconcile recomputes `getCartTotals(cartId, tipRate)`;
  a reader-added dollar tip has no rate that reproduces it — every tipped tap would 409-loop.
  On-reader tipping = registry follow-up (S11, needs an absolute-cents tip channel end to end).
- **Review fixes (ONE capped pass, in-cap, 2 CONFIRMED HIGH):** the freeze is now keyed by a
  **per-attempt id** riding the PI metadata, and every release — the poll's decline release, staff
  cancel, and BOTH webhook arms (`canceled` + a new terminal `payment_failed` sub-branch) — is
  **scoped to its attempt** (`releaseSettlementFor`), so a late delivery after a routine
  cancel→retry can never null a successor attempt's live freeze (and a same-staff double-tap can
  no longer share a freeze via the same-owner re-acquire). A **decline releases at observation**
  (the poll), so "try another card or cash" is true the moment it renders — no more webhook-gated
  dead register. The captured-but-unfulfilled window keeps extending the freeze; the reader Cancel
  is PI-verified (never wipes another table's prompt); the collect handle survives a reload
  (sessionStorage re-attach); the counter close no longer bounces the cashier off the `#CODE`
  card; blind polls and a stuck "Recording…" escalate honestly; Terminal tab closes audit as
  staff; one live region per panel; `getStripe` can't strand a freeze; ENV.md's simulated-reader
  note corrected (incl. the `presentPaymentMethod` test-drive step).
- Guards: `lib/terminal.test.ts` (15 — call shapes + ordering, never scripted answers) ·
  `lib/lock.test.ts` (the scoped-release predicate) · `lib/register-math.test.ts` terminal bucket
  · eight new `verify:slice` mutants (**82 total**), each watched fail. Live reader registration +
  smoke owed on hardware + Terminal enablement.

### W6b — the kiosk shell (2026-08-06)

The self-serve surface (closes **S5**; plan: `docs/W6B_PLAN.md`). Reuse-don't-fork (M6·P6.1): the
kiosk is an ordinary anon client whose orders ride the diner cart machinery verbatim.

- **The mint (`openKioskOrder`).** Device-token-gated (constant-time, unset = feature off — the
  /board pattern); mints per-order `kiosk-` sessions WITH a membership row for the kiosk's stable
  anon uid, so `addItem`/`scanAdd`/`getCartView` authorize unchanged. Dine-in claims a registered
  table (occupancy by table number); counter-style orders carry the register's 12h horizon.
- **The reset FORKS — three ways.** Mid-order idle (45s + 15s countdown) ABANDONS via `kioskReset`
  — cart-cancel FIRST with the counter-settle freeze + pay-lock + open status in the statement
  (the register wins every race; a settled dine-in session keeps its KDS ticket), then the session
  close, both scoped to `kiosk-` sessions in the statement (the token is no skeleton key). Once
  the customer taps "Pay at the counter" they've COMMITTED: an upsell-screen timeout advances to
  the handoff (honest idle copy — the order survives), never abandons. The HANDOFF screen clears
  the SCREEN only (the order's home is the register queue / floor). Session ids live in memory
  only; the topbar "← Start over" routes through the same fork (screen-clear post-handoff, real
  abandon mid-order — with a retry + loud log, never fire-and-forget).
- **The shell.** `.kiosk-root` big-touch tier (the `--kfs-*` pattern; 68px floor), attract screen
  whose EN/MY tiles are the entry (kiosk chrome dictionary ⚠️ pending Min's native check), three
  doors, HID keyboard-wedge → the existing `scanAdd`, exactly ONE `goesWellWith` rail (capped 6,
  anchored on the last-added food line), server-derived totals, pay-at-counter handoff.
- **Hardening:** `/api/session` refuses to CREATE reserved-prefix (`reg-`/`kiosk-`) sessions —
  closes the W6a spoof surface (client-minted fake counter-queue entries); the `?k=` device token
  joins the PostHog `REDACT_PARAMS` (never in `$current_url`). Registry: S5 closed; S9 (dine-in
  dual-session residual), S8 (kiosk ADA pass) + S10 (queue-from-mint, accepted) opened.
- **Review fixes (capped pass, killed at cap + hand-triaged):** order tallies lifted to the flow
  ("Back" from review no longer strands a non-empty cart behind a disabled CTA); honest scan
  refusals (unknown barcode / unavailable / needs-the-scale named, not "something went wrong");
  scan dedupe narrowed 1500→400ms (a deliberate re-scan counts — the server increments qty);
  occupied-table + unknown-table mint refusals get real strings; the no-name handoff stops
  promising a name call-out; IdleModal takes focus on open; per-customer language reset; the CTA
  shows item count, never a client-summed pre-tax figure.
- Guards: `lib/kiosk.test.ts` (10) · `lib/session-code.test.ts` (3) · seven new `verify:slice`
  mutants (74 total), each watched fail.

### W6a — the FOH register (2026-08-05)

Walk-up and phone orders can finally exist (closes **K6 · K17**; plan: `docs/W6A_PLAN.md`). The
register is composition: the mint was the missing piece, and the money path is the proven cash
settle end-to-end.

- **The mint (`openRegisterOrder`).** Counter arms as per-order `mode='pickup'` sessions keyed
  `reg-<code>` — staff-gated service-role, NO member row (invisible to every diner surface), never
  `/api/session` (its rate limits key on one anon seat). Start-a-table find-or-creates the ACTIVE
  dine-in session on the registered sticker, so a later diner scan converges on it.
- **The order screen grew up.** Search + category chips; the staff modifier sheet (shape helpers
  shared with the diner menu — can't drift); `staffAddItem` prices with `enforceCardinality: true`
  and a 1–9 qty; name capture gives a cash order the expo call-out it never had.
- **Settle ends in a handoff.** Tendered/change helper (display-only `changeDue`) + the `#CODE`
  card matching the kitchen ticket and ready board. The charge stays `getCartTotals` → the
  idempotent, subtotal-reconciled `mms_fulfill_cash_order`, unchanged.
- **Today's takings** (Z-report-lite): manager-gated, LA-day window (`laDayStartIso`, DST-correct
  by verification), orders bucketed by tender with refunded counted apart — an order-status split,
  honestly labeled. One additive migration: `qr_orders_created_idx` (⚠️ prod `db push` waits for
  the owner's Supabase restore).
- Registry: K6 + K17 closed; K18 (staff per-line re-route) + K19 (cash-path hours gate) opened.
- Guards: `lib/register-math.test.ts` (9) · `lib/staff-cart.test.ts` (4) · `lib/register.test.ts`
  (4) · six new `verify:slice` mutants (68 total), each watched fail before commit.

### W11 — the split ledger becomes durable (2026-08-05)

The two migrations W10d designed but could not ship (closes **M1 · M25 · M29 · M43 · M44 · M45**;
plan: `docs/W11_PLAN.md`). ⚠️ Prod `db push` waits for the owner's Supabase restore.

- **The reconcile is real (M1/M25).** `qr_carts.settle_expected_cents` is pinned at `openSettlement`
  from the same derivation that produces the shares; `mms_fulfill_split_order(p_cart_id)` — the
  tautological second parameter is deleted — compares Σ(amount − tip) over the captured ledger against
  that constant, with the idempotent branch FIRST; the durable `qr_refunds_needed` row is written by
  the **caller** when the raise surfaces (an in-fn insert is rolled back by its own raise). An unpinned
  open fails closed.
- **The capture race is closed (M45).** `capture_started_at` is stamped before each capture
  (fail-closed, first-writer-wins), cleared by a capture that took no money; both exits refuse on a
  stamped share and their deletes exclude it.
- **The dead end tells someone (M43/M44).** Abandoned holds and orphaned captures land in
  `qr_refunds_needed`; the approvals page grows a manager refunds strip; the board tells an aborted
  payer their hold was released.
- **Every payer keeps their order (M29).** `qr_order_payers` survives clear-table: full tracker,
  account history, `didIPayForCart`. Star earning stays host-only pending the owner's product call.
- 5-test capture-order suite + 5-test payer-probe suite (`lib/orders-payers.test.ts`) +
  pin/stamp/refunds tests in `lib/split.test.ts` (40); 62 `verify:slice` mutants · 289 qr tests.

### W10d — A split table can always finish (2026-08-02)

Two split-tender defects the W10c reviews surfaced (closes OPEN-ITEMS **M39**, **M40**).

- **A declined split payer can re-pay again.** The share PaymentIntent's idempotency key was
  `share_<id>_<amount>`, and the route cancels the prior intent before re-creating — so Stripe replayed
  the canceled one for 24h. Reached by a remount, a tip toggle, or SharePay's "Try again" (the common
  decline path re-confirms the same intent and was fixed in W10c). The key now carries the intent it
  replaces, and a failed claim write no longer cancels the minted intent, which would recreate the
  same dead end on the retry.
- **Aborting a split releases every hold it abandons**, not just rows reading `authorized`/`pending` —
  a `failed` row can still carry a live ~7-day authorization, and the delete on the next line destroys
  the only record of it. Cancel failures are now reported; the delete checks its own error.
- **Built and reverted: the real fulfillment reconcile (M1/M25).** Deriving the expectation from the
  live cart is wrong — the webhook burns the applied reward right after fulfilling and a promo can
  expire mid-settlement, so every redelivered event computed a larger total and the guard raised for
  72h; and refusing pre-capture is not free once the straggler path has already captured some shares.
  The finding is written up in `docs/W10_PLAN.md` §W10d and M1/M25 stay open with the design that
  works (persist the expected total at open time). Three new gaps logged: **M42**, **M43**, **M44**.
- 209 qr tests and 30 `verify:slice` mutants at the time this section was written — see the pre-merge
  subsection below for the state that actually shipped.

#### Pre-merge review — six HIGH fixes before this shipped (2026-08-04)

The pre-merge adversarial pass (5 lenses, 22 findings, 16 surviving independent refutation) returned
**BLOCK**. Three of the six HIGH were regressions this slice itself introduced. All six were verified
against the real code before being acted on.

- **The claim UPDATE had re-introduced the 2026-07-08 checkout outage.** W10d replaced the claim's
  `.eq()`/`.is()` filters with a top-level `.or()` while keeping `.select("id")` — exactly the
  PostgREST-14 `return=representation` or-tree re-projection that 42703'd every checkout in July, and
  which `lib/lock.ts` carries a standing rule against. It would have made `updErr` truthy on every
  share mint: a 500 whose retry derives the same key and 500s again, i.e. **M39 shipping inert**. Now
  counts rows via `{ count: "exact" }`.
- **`payment_intent_unexpected_state` is also Stripe's code for a SUCCEEDED PaymentIntent** —
  `captureAllIfReady` retrieves on it for precisely that reason. The abort loop read it as "already
  dead", so a capture whose post-capture mark threw (row still reading `authorized`) let the host's
  Cancel delete a share whose card was really charged: no order, no row, no refunds record, no log
  naming the intent. New `lib/split-hold.ts` asks Stripe what the state IS.
- **The pre-mint cancel was a bare `catch {}`, and M39 made that newly unsafe** — the claim now
  repoints `stripe_payment_intent_id` to the replacement, and that column is the only record of the
  intent. A swallowed 429/5xx stranded a live hold for ~7 days. Now classified; an unestablished state
  fails closed with a 503 and mints nothing.
- **Abort cancelled from a stale snapshot.** `SharePay` mints on mount, so a payer merely opening the
  sheet mid-abort had their row repointed to a new intent and then deleted, that intent never released.
  The DELETE now returns what it removed and a second pass releases anything the loop never tried.
- **A `$0` by-person seat permanently bricked the table.** Reproduced:
  `deriveShareBreakdowns({3000,0,150,289}, [a,b,c], lines owned by a+b)` gives seat `c` `baseCents: 0`,
  which `openSettlement` auto-settles to `captured` with a NULL PaymentIntent. Abort threw "Payment
  already completed" over nothing, re-open threw "Payments are already in progress", and
  `paymentInFlightReason` returned `split_in_progress` with **no TTL escape** — so cash-settle,
  clear-table, voids and comps were refused forever, and any other seat's live hold could never be
  released. All three sites now discriminate on the PaymentIntent, not the status.
- **The whole M40 rule could not fail.** Nothing imported `lib/split.ts` from a test and `verify:slice`
  targeted 8 other files, so reverting either rule left the suite green. New `lib/split.test.ts`
  (18 tests, query-recording mock) plus 8 `split/*` + `split-hold/*` mutants.
- **`openSettlement` got M40's rule too** — a re-open deleted the prior share set and cancelled nothing,
  and past the 10-minute TTL it is the table's only forward exit.
- **Smaller, same review:** a lost claim re-reads the row instead of asserting "Your share was just
  settled" on a `pending` share (two tip taps ~1s apart made that the likelier case, and "refresh to see
  it" discarded the tip); `SettlementBoard`'s `canPay` accepts `canceled`, which the server's claim
  predicate always did, so a payer whose mint died keeps a **Try again**.
- 227 qr tests and 38 `verify:slice` mutants at that point. **M45** opened for the abort/capture race
  that needs a migration to close.

#### Pre-merge RE-review — the fix layer had its own defects (2026-08-04)

The re-review was scoped to the fix layer above, because this repo's history says that is where the
damage lands (W10c: five BLOCK rounds, every HIGH in the newest fix layer). It found three more.

- **The money mutex failed OPEN.** `paymentInFlightReason` never destructured its count read's `error`,
  so a transport failure yielded `count: null` and the answer was "nothing in flight — go ahead". Not a
  regression from this slice, but this slice edited that exact statement and the window is real:
  `captureAllIfReady` deliberately captures on a STALE freeze once a table is fully covered, so between
  that capture and the succeeded webhook this read is the ONLY thing between captured cards and a cash
  settle. Now fails closed, with the repo's first `pay-guard` test.
- **`openSettlement` detected a succeeded charge and re-opened anyway.** The first fix released the
  prior holds but bucketed a `captured` outcome in with `unknown` — logging a completed charge as a
  stranded "hold" and inserting a fresh share set the table would pay a second time. The sibling
  `abortSettlement`, written in the same commit, treats that signal as fatal. Now it reads and releases
  BEFORE deleting, refuses on `captured`, keeps the freeze, and carries abort's survivor check.
- **Four rules added by the fix layer could not fail** — including the `{ count: "exact" }` claim whose
  regression convened the whole round: a reviewer reverted it and the suite stayed green. `.tsx` files
  have no suite here, so the board's "finishing up…" gate moved to `lib/split-board.ts` to become
  testable; the route got its first test; `split-hold`'s inner fail-closed arm was unreachable because
  the Stripe mock's `retrieve` could not reject.
- **Also:** the lost-claim branch could cancel an intent the row now POINTS AT — a concurrent twin's
  live authorization — because the re-read fetched only `status`; and `canPay` learning `canceled` broke
  its complement, so the board said "finishing up…" (and spoke it into the live region) over a table
  that cannot finish.
- **The money registry had stopped rendering.** An unescaped `|` inside M45 widened its row to 6 cells
  against a 5-cell header; GFM then refuses the _whole_ table, so all 45 rows became one raw pipe
  paragraph. `prettier` is what widened the delimiter, so `format:check` could not catch it. Fixed, plus
  a second table broken the same way on `main`.
- 267 qr tests and 49 `verify:slice` mutants. New suites: `lib/split.test.ts` (31), route (13),
  `lib/pay-guard.test.ts` (9), `lib/split-board.test.ts` (5).

#### Round 3 — triaged inline, and the review loop itself got cheaper (2026-08-05)

A third agent round stalled mid-flight; its two completed lenses were salvaged and triaged by hand
rather than re-run. Three real defects, all one shape — round 2's `captured`/`unknown` discipline
applied to one pass but not its sibling:

- **`openSettlement`'s pre-delete pass now fails CLOSED on an unestablishable hold** (abort logs and
  proceeds because it is the table's EXIT; a re-open is optional, so refusing costs nothing while
  proceeding deleted the only row recording the hold).
- **Its post-delete pass now RESTORES a row whose intent was captured inside the delete window** — the
  delete returns the full money shape and the row goes back as `captured`; merely refusing would still
  double-charge on the host's retry, since the next re-open would find no trace of the capture.
- **The route's lost-claim branch cancels nothing when its re-read fails** — a null row made the
  pointer comparison read as "not ours", picking the destructive branch on the one input carrying no
  information.

Plus three mock repairs from the same salvage (pay-guard's mock handed back a count that was never
requested; the route suite recorded no claim predicates and never asserted the charged amount; the
repair-mark status was unpinned) — each watched fail first.

**And the efficiency change:** two new zero-token gates now do what two review lenses used to.
`scripts/check-money-coverage.mjs` (first step of `verify:slice`) fails in ~1s when a changed
money-path file has no mutant — the exact class that cost two ~3.5M-token review rounds to find.
`scripts/check-docs.mjs` (`pnpm check:docs`) validates every markdown table's GFM header/delimiter
parity (prettier is what _introduces_ the breaks) and measures live-state doc counts via
`vitest list` instead of trusting prose. Both proven against the real historical failures before
being wired in. Reviews drop to three delta-scoped lenses.

- 273 qr tests and 52 `verify:slice` mutants at merge.

### W10c — The money path stops answering with numbers it isn't sure of (2026-08-02)

The money half of the W10 outage work (closes OPEN-ITEMS **M30** and **M31**; plan:
docs/W10_PLAN.md §W10c). One root cause runs through all of it: **postgrest-js resolves a transport
failure into `{ data: null, error }` — it does not reject** — so a destructure of only `{ data }`
produced a confident, perfectly-shaped, WRONG answer during an outage.

- **`getCartTotals` throws on an unreadable cart (M30).** All three reads check `error`. A zeroed
  total used to make the webhook's derived amount disagree with a REAL charge, triaging an outage as
  **tampering** (wrong alarm, wrong `refunds_needed` reason, no retry); it now takes the "Totals
  lookup failed; will retry" 500 that already existed. The partial failure was worse: items
  readable, `mms_promo_discount` not, discount silently 0 — the diner charged MORE than the cart in
  front of them showed. Pinned by `lib/totals.test.ts` (4 cases incl. a happy path) + 2 new
  **nine** new `verify:slice` mutants (29 total, up from 20): four totals arms plus five covering
  `split-settle.ts`, which had no executable coverage of any kind before this slice.
- **`split-settle` returns 5xx so Stripe redelivers (M31).** Every `qr_cart_shares`/`qr_carts` read
  and write in the five split handlers throws on `error` (`cartIdForPi` returns null only for a
  genuine no-row); the webhook's split branches, plus its `existing`-order and `cartRow` reads, 500
  instead of logging-and-ACKing. The retry machinery already existed — the libs were never telling
  it anything had gone wrong.
- **Client money surfaces stop lying about what already happened.** `RewardField` gains
  try/catch/finally (both actions throw under an outage, so `busy` latched TRUE and every coupon
  button died silently) plus its own error line in the applied branch; `SharePay` bounds the
  post-authorize spinner at 25s and then states the hold is real — locking the tip group, which
  would otherwise cancel it; `/track` escalates to "your payment is safe — show this screen to staff
  and we'll match it up" with a reference from its own URL once both the live read and the fallback
  give up, withdraws the `/account` link (same backend), and gives a genuinely offline device its own
  branch (Refresh is `location.reload()`, which offline would destroy the receipt);
  `SettlementBoard`'s 5s poll backs off to a 30s cap while unreadable.
- **`lib/lock` releases return their write error** instead of dropping it — best-effort by design at
  every call site, but the webhook's `payment_failed` branch logs it. Still 200 deliberately: unlike
  the split marks, both releases are UNCONDITIONAL by cart (no status predicate scopes them to the
  era the event belongs to), so opting into redelivery could clear a live `settle_at` on a split the
  table has since opened. The 5-minute lock and 10-minute settle TTLs are the designed backstop.
- **Five adversarial review rounds, all BLOCK**, and every HIGH landed in the FIX layer rather than
  the original build — including one the pre-PR fix introduced: scoping `onShareFailed`'s write to
  `pending|failed` stopped a stale redelivery downgrading a captured share, but also made
  `authorized → failed` unrepresentable. An issuer declining the CAPTURE fires `payment_failed` while
  the row still reads `authorized`, and that mark is what short-circuits `captureAllIfReady` and lets
  the payer re-pay; without it the table dead-ends with money taken and no order. It now asks Stripe
  what is true now instead of inferring from delivery order.
- **Disclosed, not hidden (OPEN-ITEMS M36):** making `getCartTotals` throw means a cart write that
  COMMITTED can still be reported to the diner as a failure when only the totals read broke, under
  partial degradation. Accepted for this slice because what it replaced was worse (a silent $0 total
  on a live cart, flowing into the pay button); the real fix is a `totals: "unknown"` marker on the
  returned view rather than failing the mutation.
- **Runbook:** Stripe redelivers for 72h only — a longer pause needs a manual dashboard resend plus a
  shares-vs-orders sweep after restore.

### W10b — Staff boards keep the ledger through an outage (2026-08-01)

The staff half of the W10 outage work (closes OPEN-ITEMS **M32**; plan: docs/W10_PLAN.md §W10b).
The stance: a staff board is a ledger, not a website — mid-service its most valuable asset is the
last-known state, so an outage must never blank it, redirect it, or fake liveness over it.

- **`StaffAuth` gains `unavailable`**: `getStaffAuth` separates transport failure from verdict at
  `getUser()` and BOTH staff-row reads; `requireStaff` throws 503 `unavailable`;
  `requireStaffPage` returns null → the ~10 staff pages render `StaffOutageShell` in place (URL
  kept, one-tap retry) instead of a login redirect that destroyed mid-service state.
- **Boards freeze, never blank**: KDS/Expo/Floor/TableDetail/Approvals keep their last-known
  snapshot on outage with one shared banner (`lib/staff-outage.ts`) — the snapshot's own server
  clock as the "as of" stamp, escalating past 2 minutes to "take new orders on paper; nothing here
  is lost" — and keep polling for recovery. `raceTimeout` stops a hung poll from freezing the
  `inFlight` lock behind a live-looking board.
- **False-verdict sweep**: every staff queue/anchor read now error-checks — a failed read can no
  longer render "All clear", "No bags waiting", "the floor is quiet", "no open order", "no card on
  file", or "nothing to settle". All 24 mutation arms discriminate outage ("that change wasn't
  saved — keep it on paper") from sign-out; void/refund/approval reason unions gain `outage`.
- **Login/PIN/sign-out honesty**: the StaffLogin handlers, PinUnlock and both sign-out paths branch
  on the retryable-auth shape — an outage no longer reads as a wrong email, wrong code, wrong PIN,
  or "check your connection"; `app/staff/error.tsx` gives /staff routes a staff-voiced boundary.
- **Only a server verdict assigns blame**: a board says "we can't reach the ordering system" only
  when the SERVER answered `unavailable`; repeated failures from the device itself say "not
  updating right now" (it could be that tablet's wifi). The 2-minute escalation is measured in a
  single clock domain, so a skewed tablet clock can't decide when staff are told to run on paper.
- **Shared route-boundary recovery** (`lib/error-recovery.ts`): a segment `error.tsx` SHADOWS the
  root one, so the stale-deploy chunk reload + explicit error capture are shared rather than
  re-implemented — the always-on kitchen tablets are the likeliest to hold replaced chunk URLs.

### W10a — The app tells the truth when the kitchen is unreachable (2026-08-01)

Built against a LIVE outage (the QR Supabase project's free-tier idle pause) — an 8-surface audit
(78 findings, docs/W10_MATRIX.md) mapped what every user actually saw, and this slice ships the
truth layer + the flagship fixes (plan: docs/W10_PLAN.md; staff + money-path follow as W10b/W10c).

- **The three truths**: /api/health (DB-less probe) + useConnectionTruth → `you-offline` /
  `we-down` / `unknown`. On the swept surfaces (grocery adds, grocery aisles, checkout promo)
  "check your connection" is now only said when navigator.onLine is actually false; the remaining
  connection-blaming strings (dine-in join copy, staff PIN/login) ride W10b with their surfaces.
- **Transport failure stops masquerading as a verdict**: AuthzError gains `unavailable` (503) —
  a paused DB no longer answers "Not signed in" / "Invalid session" / 404 no_cart; the mint + peek
  routes return 503 + Retry-After.
- **@mms/ui fallback primitives**: OutageState (bilingual 🫖 card, retry escalation), DegradedStrip,
  RetryButton (survives its own tap), EmptyState tone="error", an `offline` icon.
- **Branded not-found.tsx** (the app's only unbranded screen, on the worst journey moment) and an
  outage-aware, bilingual error.tsx that escalates after repeated failures.
- **The menu serves last-good during an outage** (module-state catalog cache + honest staleness
  strip; the dead `revalidate = 300` line removed) instead of "The menu catalog is empty.";
  getMostLoved can no longer cache its error state for an hour.
- **/cart says the truth**: "We can't reach your order right now — it's safe" + in-place retry,
  replacing "This order isn't available on this device" for outages.
- **The auth plane fails loudly**: AnonAuthGate publishes its outcome; the home page renders an
  honest session-unavailable strip with a working retry — ending the eternal-skeleton limbo where
  anonymous sign-in failed silently and every surface looked like it was loading forever.
- **HomeResumeCard adopts the W9c honesty floor** (statusWord) — no more indefinite "Confirming
  your order" during an outage.

### W9e — Chrome that stays where it belongs (2026-08-01)

Five findings from the W9 audit (+ J21 from W9d's pre-merge review) about chrome that drifted off
its post. All presentation/a11y — no money-path or data change anywhere in the slice.

- **The add-confirmation toast clears the pinned bars on notched iPhones.** Both fixed toasts
  (TableCartProvider's and `.grocery-toast`) sat on a bare `bottom: 84/90px` while the CartBar and
  grocery CTA beneath them composed `env(safe-area-inset-bottom)` — so at the app's single
  highest-frequency moment the toast landed ON the button the diner was about to tap. Both now
  compose the inset.
- **Every bottom sheet keeps its exit chrome in reach.** The grab handle, title and ✕ now live in
  one sticky `.mms-sheet-head`, so a dish sheet with modifiers can no longer scroll its only visible
  close control out of view (QA §A P0). The ✕'s 44×44 target with the visible 32px disc survives —
  its offsets were re-derived against the new containing block, which coincides with the old edges.
- **Sheets get the 440px column everything else has.** `.mms-sheet` was the one overlay with no
  width bound; it now caps at `--w-content` centered with auto margins (never `translateX` — framer
  owns `transform` on that element for swipe-to-close), and floats as a full-radius card ≥480px.
  The staff `LossActionSheet` narrows too — deliberate: the form reads better at column width.
- **Every sheet restores focus on close (J21).** The `Sheet` primitive never renders a
  `Dialog.Trigger`, and Radix's modal content preventDefaults its own close-restore then focuses
  that null ref — so every close in the app dropped focus on `<body>`. The primitive now captures
  the opener at mount and restores it by default; a caller-supplied `onCloseAutoFocus` (the grocery
  basket sheet, whose trigger can unmount) still wins.
- **The tip ask gets its visible heading back.** "Add a little extra?" (v7.2 verbatim) now titles
  the tip group via `aria-labelledby`, so the accessible and visible names finally match. The
  SB-1524 disclosure deliberately stays ABOVE the ask — moving it back to the prototype's position
  would re-open the double-ask arm W2d closed.
- **One type-scale floor fix:** `.slot-soonest-tag` was 9px, below the scale's own 11px `--fs-xs`
  floor, on a diner-facing pickup surface.

### W9d — The market reads like a market (2026-07-31)

Four findings from the W9 audit on the grocery door. No charged amount changes: the pill, the sheet,
the recovery copy and the expo words are all presentation over the same server-priced paths.

- **The "Save N%" pill means something again.** The old `pct >= 15` gate admitted 306 of 396 SKUs —
  77% of the shelf shouting is wallpaper, and wallpaper on a price claim trains shoppers to ignore
  the one place we say "this is genuinely a good buy". Featured is now a stored merchandising
  DECISION (`grocery_items.is_featured_deal`, owner-editable), not a computed threshold — a per-aisle
  percentile would move the badge between SKUs on every catalog refresh, a worse trust failure than
  over-badging. Seeded deterministically in SQL: top 2 per aisle by ABSOLUTE savings among real ≥20%
  markdowns (dollars off beats percent off), barcode tiebreak → 16 of 396 SKUs (4%). The backfill
  lives in the migration (live DB) **and** seed.sql (fresh environments — the seed loads after
  migrations, so the migration's copy alone would feature nothing locally/CI). The quiet inline
  "Compare at $X" strike still shows on every genuine discount; the pill's accessible-name suffix
  moved with the visual gate, so sighted and SR shoppers hear the same market.
- **The Browse door finally shows the basket.** The pinned CTA is now a bar: a basket-review bottom
  sheet trigger (count + bag) beside the checkout pill. The sheet is a thin window onto the page's
  existing state — same `lines`, same `onStep`/one-op lock, same savings + EBT-subtotal reductions,
  one shared checkout callback — never a second basket surface, and no new live region (the page
  toast stays the one announcer). The Scan door's inline list is untouched (still `hidden`-gated, so
  steppers and accessible names never duplicate).
- **A finished basket stops blaming the radio.** Every grocery failure used to surface as "check your
  connection", so a shopper whose cart was paid on another tab (or whose session aged out) retried a
  dead basket forever. `scanAdd`/`getGroceryLines` now return discriminated results; the reason comes
  from a new membership-gated describer (`whyCartUnavailable`) that asks membership FIRST — a
  non-member or unknown cart always gets the same `unreadable`, so the action never becomes the cart
  lifecycle oracle the W9c /cart work refused to build. Terminal reasons (paid / cancelled / session
  expired) empty the list honestly and offer "Start a fresh basket" (the hook's re-mint, used at
  last); transient ones only ever get Retry — a re-mint against a merely-unreadable cart would
  find-or-create a NEW cart and silently abandon the shopper's real lines. The truth strip also
  renders post-hydration now (its old gate made it unreachable once anything was on screen), saying
  "what's shown may be out of date" instead of failing in silence.
- **The expo stops handing staff phantom bagging work.** A pure-grocery scan-&-go order — the shopper
  already holds the goods — now reads "Verify · #code" / "Handed over" instead of "Bag for X" /
  "Bagged & ready", carries a "verify the exit pass; nothing to bag" line, and the header counts it
  as "N to verify" instead of folding it into "N bags waiting". Vocabulary only: the
  `preparing → ready → picked_up` status machine and `mms_init_togo_status` are untouched.

### W9c — Your paid order stays yours (2026-07-31)

Five findings from the W9 audit about what happens **after** the money moves. Nothing here changes a
charged amount.

- **/track survives the table being cleared.** The tracker reads `qr_orders` from the browser, so its
  authorization is `is_member(session_id)` — and that lapses the moment a server clears the table or the
  ~4h session TTL sweeps, routinely while a dine-in diner is still sitting there. The row was fine; they
  just couldn't see it, so the tracker polled itself out and told them their paid, eaten meal "just
  hasn't appeared here yet". A new uid-scoped server fallback (`earned_by`, stamped at fulfillment,
  outlives every session) resolves the same order. The key is a LOOKUP, never a credential — both
  branches AND `earned_by = uid`, so holding a /track URL grants nothing.
- **The known split gap gets its own words.** `mms_fulfill_split_order` stamps only the HOST as earner,
  so every other share payer legitimately fails that read on an order they really did pay into. Their
  own share row proves it (`seat_id = uid` — nothing they don't already own), and they get honest copy
  instead of a false alarm.
- **A resolved-by-fallback tracker says it's a snapshot.** There is no Realtime behind it, and a rail
  that has quietly stopped moving while still looking live is the same dishonesty in a nicer outfit.
- **The rewards RPC error stops fabricating a zeroed hub.** `mms_rewards_summary`'s `{ error }` was
  dropped in all THREE readers, so a failed read rendered 0 Stars / $0 / tier `new` as fact to a diner
  possibly sitting on Gold — and `TierUpCelebration` then wrote that fabricated rank to localStorage as
  its baseline, firing a full-screen "Tier unlocked" on the next healthy visit for a climb that never
  happened. The third reader feeds the POST-PAYMENT screen, so it congratulated diners with "0 Stars".
  All return null on error, never on empty (a new diner legitimately has no row). A rewards failure now
  shows a banner and keeps the order history — the rest of this slice points diners there for receipts.
- **The header pill stops saying "Confirming" forever.** It fell back to that label whenever the live
  read had no order, which is permanent once the poll exhausts on a cleared table. Now bounded by
  `timedOut` — label only: no `clearOrder()`, which would destroy a just-paid split order's only route
  back to /track.
- **The paid-cart dead end names itself.** Back-navigating onto your own paid cart said "This order
  isn't available on this device"; it now says the order is complete and points at /account. Unknown-cart
  and non-member deliberately stay **indistinguishable** so cart ids remain un-enumerable.
- **Reorder carries the allergy note.** `notes` is snapshotted at fulfillment and was simply never
  selected, so every reorder silently dropped it — under an item sheet that promises "add any allergy in
  the note below and the kitchen will see it". An over-cap legacy note is **dropped and disclosed by
  name, never truncated**: cutting "no peanuts, no shellfish, no sesame" at 160 chars yields a note that
  reads as complete and is not. Pinned by `reorder-notes.test.ts` (9 tests, 5 mutations caught —
  including the plausible "just truncate it" fix).

### W9b — every dead control says why (2026-07-31)

Eight confirmed findings from the W9 audit, all one shape: **a control goes inert and nothing says why.**
Nothing here changes a charged amount.

- **The checkout finally receives the pay-window lock.** `getCartView` has returned `locked`/`lockedBy`
  since P3.2 and `<Checkout>` never took them — so a diner whose tablemate was checking out watched every
  stepper snap silently back. The v7.2 lockbar now renders on the review step, the line controls / promo /
  tip / primary CTA disable with a reason, and the CTA reads "Waiting for {name} to finish" instead of
  sending the diner into a 409 to find out. Gated on `lockedByPeer`, never bare `locked` — the payer holds
  their own lock.
- **A way back from the pay step, above the fold.** The pay step is a state change, not a route, so browser
  Back leaves `/cart` entirely and strands the lock. Pushing a same-pathname history entry is not the fix
  (both `cart/page.tsx` and `track/page.tsx` document the ~4s view-transition popstate hang it causes), so:
  an explicit control at the top, plus a `pagehide` `sendBeacon` to a new `POST /api/cart/release-lock`
  that frees the lock when the diner abandons the tab. **Not** wired to `visibilitychange` (that fires on
  every wallet app-switch) and **not** on the successful-payment redirect (`pagehide` fires there too —
  releasing then would open the cart under a live authorization).
- **Settling says so, everywhere it bites.** The freeze had no announcement at all: the menu's Add pills
  just stopped working. There is now an edge-triggered announcement through the provider's one live region
  (baselined off the first server view, so arriving at an already-settling table isn't announced at mount),
  a GuestList banner that links to the board, and the kitchen timeline's settle nudge swapped from "settle
  up from your order" — an invitation to edit a frozen cart — to "pay your share".
- **The mint window is audible.** `loading` had been on the cart context since M3 with **zero consumers**;
  the Add pill and item-sheet CTA now carry `aria-busy` and a reason during it. The three reasons live in
  one shared ladder (`lib/inert-reason.ts`, 9 tests, precedence + copy pinned) rather than a ternary
  re-typed per component.
- **The settlement board stops lying in three ways.** A member with no share row (joined after the split
  opened) gets read-only copy naming the host instead of a board with no way in; a post-first-load refresh
  failure says the rows are stale rather than passing a frozen snapshot off as live; and the board may only
  navigate to the receipt on a **server-typed** `settled` — Server Action errors are redacted in prod, so
  routing on "it threw" would eject a mid-authorization payer to a receipt that doesn't exist yet.
- **Pickup availability is a three-state answer.** A failed `mms_pickup_slots` read returned `[]`, which the
  sheet rendered as the calm "No pickup times available right now" — telling a diner the kitchen was closed
  when we simply couldn't ask. `ok:false` now earns a retry; `ok:true` with an empty list keeps the calm copy.
- **The board never celebrates a payment that didn’t happen.** `assertCartMember` raises `cart_closed`
  for any `status != 'open'`, and `qr_carts.status` includes `'cancelled'` — so a table whose stale freeze
  let a server merge or clear it would have been told **“Everyone’s paid”** and sent to a receipt that will
  never exist, having paid nothing. `getSettlement` now re-reads the status and emits `settled` only for
  `'paid'`; anything else renders “This table’s order was closed — nobody was charged” and never navigates.
- **The lock release can’t fire on a bfcache freeze, and now does fire on a soft navigation.** `pagehide`
  skips `event.persisted` (the page comes back with the same mounted Payment Element and the same
  clientSecret — releasing would hand tablemates a cart the diner is about to pay a stale amount for), and
  an unmount arm covers App Router back-navigation, which fires no unload event at all.
- **`openSettlement` no longer swallows its derive reads (OPEN-ITEMS M24, closed).** A failed
  `session_members` read produced zero share rows behind an acquired freeze — a permanently stuck table —
  and a failed `qr_cart_items` read zeroed every by-person weight, so `allocate`'s all-zero fallback served
  an **even split to a host who chose by-person, and charged it.** Both now release the freeze and fail
  loudly; `SplitSection`'s catch re-syncs (it previously refreshed only on success, leaving a stale review
  screen offering edits the freeze would refuse).

### tooling — `pnpm verify:slice`, the mechanical pre-PR gate (2026-07-31)

Three adversarial review rounds across W9a and W8 each returned BLOCK, and nearly every finding reduced
to one thing: **a guard was written and never made to fail.** The reviews cost ~1M tokens and 30–56
minutes each; the mutation battery that finds the same class runs in about a minute for free. So it now
runs FIRST, and the review spends its attention on what only a reader can judge.

`scripts/verify-slice.mjs` runs the gate, applies **18 semantic mutations** to `totals-math` · `tax` ·
`split-math` · `permissions` (each must turn its owning suite red), and mirrors CI's orphan-suite check.
Design points that came straight from this session's failures:

- **A STALE mutant is a failure, not a skip.** If a `find` pattern no longer matches, the code moved and
  that guard is now fiction — the exact silent rot the script exists to prevent.
- **It refuses to run on a dirty target file.** It rewrites files in place; a crash must never eat work.
- **It aborts on a red baseline**, since every mutant would otherwise look "caught" for the wrong reason.
- **A survivor's message names the real cause** — a degenerate fixture where two code paths produce
  identical numbers — and says to search for separating inputs rather than add assertions.

**All four failure modes were demonstrated, not asserted:** a gutted suite → 3 SURVIVED + exit 1; a
broken pattern → STALE + exit 1; a planted `.test.tsx` → orphan + exit 1; an uncommitted target file →
refusal. Clean run: 18/18 caught.

`CLAUDE.md` gains the **red-first rule** (never write a guard you have not watched fail) and the
**never-transcribe-a-number rule** — the two habits behind every defect the reviews caught.

### W8 — Proof: the money path is now mechanically enforced (2026-07-31)

The charge authority had **zero** executable coverage. It now has **161 tests across 8 files** (up from
35 across 5), and every guard is **proven able to fail**, not asserted to work. **No charged amount
changed.**

> **Both review rounds returned BLOCK, and both were right.** Pre-PR: the money path was sound, but
> **five of this slice's own guards could not fail** — a suite that licenses future change while
> silently green is exactly the failure mode W8 exists to prevent. Pre-merge, scoped to the un-reviewed
> delta: the M23 pin's runtime half was a **tautology** (asserting an object the test itself built
> lacked a key the test never added) and its type claim was **overstated** — it tripped on a required
> `fulfillment` field but not the likelier optional one; three hand-derivations reached the **right
> answers via wrong intermediate steps**, which in a repo whose doctrine is "the comment is the proof"
> is a defect; and the registry edit put status vocabulary in the **Sev** column while leaving `Status`
> stale. All fixed; both verdicts are recorded on the PR.

- **`lib/totals-math.ts` (new) — a pure `computeTotals` seam** extracted from under `getCartTotals`'s
  three I/O reads. `getCartTotals` keeps its signature and does the reads; the arithmetic moves
  verbatim. **Proven behaviour-preserving by differential-testing the new seam against the
  pre-extraction arithmetic (transcribed from `origin/main`) over 200,000 runs / 199,997 DISTINCT
  baskets — 0 divergences. The harness is committed as `scripts/w8a-extraction-equivalence.mjs` so
  that claim is falsifiable rather than trust-me; it holds the pre-extraction arithmetic as a frozen
  verbatim copy of `origin/main`, and re-running it reproduces the figure.** (The first run used a naive LCG whose product overflows 2^53; it yielded
  only 374 distinct values in 5,000 draws, so the original "200,000 baskets" claim was inflated. Both
  the differential harness and the in-suite sweeps now use mulberry32.) The three reads stay sequential; parallelising them is not behaviour-preserving in the
  failure case.
- **`lib/totals-math.test.ts`** — the 7 charge invariants, every expected value a hand-computed
  literal. **Mutation-tested:** six deliberate breakages (reward clamping to subtotal instead of
  remaining · service reusing the tax pro-rata — the "DRY" refactor that moves a charge by 1¢ ·
  tip gated on every-line-is-grocery · only-draft-is-chargeable · tip on subtotal instead of net ·
  rounding _inside_ the ratio) were each injected and confirmed to turn the suite red. The last one
  **escaped the first draft**, so a fixture that separates it (100¢ taxable + 1395¢ exempt, promo 500
  → tax 7 correct vs 6 mutant) was added.
- **`lib/tax.test.ts` + `supabase/tests/tax_parity_test.sql`** — the TS↔SQL mirror, pinned from BOTH
  sides. The halves deliberately do not read each other: a TS test that parsed the migration would be
  a turbo-cache trap (turbo hashes only files inside the workspace, so editing a migration leaves
  `@mms/qr:test` a cache hit replaying a green log against drifted SQL). **All four drift drills run
  for real** against a local Postgres 16: TS rate → red, SQL rate → red, SQL category flip → red, and
  the `check_asserts`-off run demonstrated exiting 0 having proved nothing (which is why every SQL test
  file now sets the GUC, `rls_membership_test.sql` included).
- **`lib/permissions.test.ts`** — the complete 5 × 5 × 2 authority matrix (50 cells), exhaustive by
  construction via `Record<LineState, …>` so widening the union breaks the build. Exactly 7 cells are
  allowed. This gate is what stops a guest mutating a fired ticket and had never been tested.
- **`lib/split-math.test.ts`** — `allocate`'s sum invariant (the one `mms_fulfill_split_order`
  hard-raises on, so a drift there makes a paid table unfulfillable) **plus the per-seat charge limbs
  the first draft left degenerate.** The review proved six mutations to `deriveShareBreakdowns` — the
  function that writes what each card is actually charged — all passed 15/15: its discount limb was
  never exercised (every fixture had `discountCents: 0`), even-mode was tested with equal ownership so
  it was indistinguishable from by-person, and the unassigned-line fixture had _only_ unassigned lines
  so dropping them fell back to the same even split. Separating fixtures were found by search and all
  **6/6 mutations are now caught**. The M23 pin was also rewritten: it claimed "a grocery-only seat is
  billed 75¢" on a fixture with no grocery marker at all — `deriveShareBreakdowns`' line type has no
  `fulfillment` field — so it would have stayed green after M23 was fixed. It now states the gap
  **structurally**, and stops compiling if that field is ever added.
- **CI wiring, three traps closed.** The SQL step hard-coded ONE filename — a new `.sql` would have
  "passed by not existing"; it now globs _and_ checks each required file by name (a bare count floor
  would still pass after a rename once a third file lands). The **orphan-suite guard** fails the build
  on any test file no vitest config runs — including **any `.test.tsx` anywhere**, since neither config
  matches `.tsx` and a React component test is the most likely future orphan; the first draft
  whitelisted it by directory, and the review proved it by dropping a deliberately-failing `.test.tsx`
  into `apps/qr/components/` and watching the guard print PASS.
- **`tax_parity_test.sql` §4 rewritten.** It asserted `round(19.5::numeric) = 20` on hardcoded
  literals — a statement about PostgreSQL itself that never referenced the functions under test, so it
  was green for every possible state of the code, _including_ the numeric→float8 regression its comment
  claimed to catch. Its premise was also inverted: the **value table** is what catches float8, because
  58.5 → 59 under numeric and 58 under banker's rounding. §4 now asserts through `mms_line_tax`, and
  was **verified to go red under an induced float8 regression** on a real Postgres 16.

**Corrections to this repo's own docs, found by the spec pass:** `CLAUDE.md` and `W8_PLAN.md` cited
`packages/db/migrations/0001`, which does not exist (the tax engine is
`supabase/migrations/20260618000000_qr_platform_init.sql`); `W8_PLAN.md` named a `settled` `LineState`
(not a member), a CI `verify` job (that is the delivery repo's name), and claimed `lib/pickup.ts`
computes the slot grid (it contains zero arithmetic — the grid is entirely SQL, so **W8d is deferred as
an SQL slice**). The plan's own drift-proof recipe was also broken: 1400¢ rounds to 137 under both
0.0975 and 0.098, so the suggested probe would have stayed green through the exact drift it tests for.

**Twelve findings filed rather than fixed** (`M17`–`M26`, `T4`–`T5`) — including a reward that is
burned at less than face value when it overflows the remaining base (`M22`), the split path
re-implementing the money rules without W1a's grocery exclusion (`M23`), `split.ts` swallowing both
PostgREST errors into a permanently stuck table (`M24`), and `allocate(total, [])` silently dropping
the total (pinned).

### W9a — One door, carried all the way through (mode identity, scan → reorder) (2026-07-31)

A 14-agent happy-path + craft audit ([`docs/W9_PLAN.md`](docs/W9_PLAN.md); 84 raw → 32 deduped → 24
CONFIRMED, 0 refuted) found the money machinery sound but **not one diner journey finished end to
end**, under one theme: _the app already computed the answer and drops it at the last hop_. W9a
closes the mode-identity half of that.

- **The phantom table, root-caused (J1, high).** `resolveQrCode` wrote the dine-in join code to
  localStorage **before** the mint. So a mistyped or stale `?j=` that the server 404'd was still
  persisted — and the failure arm's "Try again" reloaded a URL whose `?j=` was already stripped, so
  the mint was no longer join-only and **provisioned a brand-new table keyed to the typo, with that
  guest as host**. The menu then looked entirely normal (party of one, no error) while their whole
  meal accumulated on a cart the real party could never see. Now only a code the server ACCEPTED is
  persisted (the existing post-mint write). `GuestList` surfaces the server's own reason and treats
  **"No table found"** as terminal — offering `<JoinTable />` to enter a different code instead of a
  retry that re-mints. The transient arm keeps its reload (a network blip must still recover).
- **Two table-only controls, off the pickup cart (J2, high).** "Make it now" and "For here / To go"
  rendered on every pickup cart. "Make it now" fires a line the KDS deliberately refuses for a
  pre-paid channel — leaving it non-draft, so the diner could **never edit that line again**;
  flipping to "For here" re-routed the order off the expo board and froze `/track` at "Order placed"
  forever. Both now gate on `isDineIn`, **not** `!isTakeout`: `cart/page.tsx` nulls `splitContext` on
  any read failure, so `!isTakeout` is also true for _unknown mode_ — and a missing control costs a
  tap where a wrong one costs the order.
- **`/track` stops calling Table 4 "To-go" (J3).** `qr_orders` carries no mode column and
  `table_number` is null for an unregistered sticker, so a new `hasDineInFood` derives the mode from
  the order's own `qr_order_items.fulfillment` snapshot — the same truth routing and tax use, and the
  only one that survives the table session being closed by routine turnover or the 4h anon TTL. The
  header reads `Table 4` (or plain `Dine-in`), and the 4-step takeaway rail — structurally frozen at
  step 1, because nothing ever bumps `togo_status` for a plate eaten at the table — is replaced by a
  terminal settled-table card. A table with a to-go box keeps the rail; one with groceries keeps the
  exit pass.
- **Six bare `/menu` links (F9/G13).** New `lib/menu-href.ts` (`menuHref` · `menuLinkText` ·
  `modeFromOrder`): carry the mode, or route to the **door picker** — never guess. `scango` →
  `/grocery` (closes G13). Fixed at `OrderTracker` (the only forward affordance on the post-pay
  screen), `track/page` ×3, `account/page`, `OrderHistory`, `cart/page`, `Checkout` ×2. Link TEXT
  moves with the destination — a link to `/` no longer says "Back to menu". `cart/page`'s exit is
  promoted from an inline-styled ~20px link to `nav-link-strong` (≥44px, QA §A).
- **Two dishonest strings retired.** "Made fresh when you check out — ready in about 12 min. Want it
  sooner? Tap 'Make it now.'" rendered on pickup carts (whose lines are also `togo`) — four sections
  above the control that was about to schedule the order for tomorrow, pointing at a button pickup no
  longer shows. Now dine-in only; `PickupWhenChoice` is the single owner of the pickup timing promise
  (it holds the live ASAP⇆scheduled state, which this paragraph never saw). And "First name for
  pickup / we'll call your name when your order's up" no longer renders on a pure-grocery basket —
  the shopper is holding the bag they scanned; there is no counter handoff to name.
- **An ESLint ban on the bare literal**, scoped to JSX `href` + `router.push` so `TransitionNav`'s
  journey-depth map and `AppHeader`'s pathname compare stay legal. Verified by inducing a violation
  (red) and reverting (green) rather than assuming.

**Pre-PR adversarial review caught a regression in the headline fix — fixed before merge.** All four
lenses returned BLOCK on the same defect: `useTableSession`'s URL-strip effect deletes `?t=`/`?j=` on
mount, so removing the pre-mint persist left the join code in a **closure and nowhere else** while the
mint was in flight. A hard reload in that window — GuestList's own "Try again" is a
`window.location.reload()` — arrived with no code in the URL and none in storage, so `/api/session`
provisioned a phantom table: **the same orphaning, moved from a mistyped invite code onto a flaky-wifi
sticker scan**, a path the original bug never touched. Fixes:

- **The URL strip now runs only after a successful mint** (`[session]` deps). The credential leaves
  history at the same moment it stops being the only copy; a mistyped `?j=` still never reaches
  localStorage, because its mint 404s before the strip can fire.
- **"Try again" re-mints in place** via a newly-exposed `revalidate()` on the cart context instead of
  reloading — the code stays in memory, so a retry can only ever rejoin the real table. That also makes
  retry safe on the 404 arm, which now keeps **both** a retry and the JoinTable escape: `findActive`
  swallows its PostgREST error, so a transient DB failure returns the same "No table found" string as a
  genuinely wrong code. Party-full stays the one terminal arm.
- **The hidden pickup-name field no longer transmits.** Gating only the render was worse for privacy
  than leaving it visible: `firstName` hydrates from `mms.name`, so a scan-&-go shopper with any stored
  name still shipped it → `qr_carts.customer_name` → the order snapshot → the **wall-mounted public
  `/board` TV**, with no surface left to see or clear it. Submit and hydrate now match the render gate.
- **JoinTable closes its sheet before routing** — a successful join unmounted an open Radix dialog, so
  focus restored to a trigger that unmounted with it and landed on `<body>` (WCAG 2.4.3).
- **One bare `/menu` survived the sweep** as a default parameter in `TableTimeline`; the lint rule now
  covers braced `href={...}` and default params, and its comment no longer overclaims (a hoisted const
  or template literal still passes — it catches the shape the six real regressions took).
- **The settled-table copy no longer says the meal is over.** A dine-in diner can pay _before_ sending
  food to the kitchen (`mms_fire_pending_food` fires their draft lines at settlement), so "thanks for
  dining with us" was a goodbye delivered before the food.
- **A registered `tableNumber` now counts as a dine-in signal**, so an all-to-go order placed at a table
  no longer reads "To-go" in the header while the receipt six lines below prints "Table 4".
- **The prep-time line stays on scango carts**, which have no `PickupWhenChoice` to replace it — pre-W5f
  the To-go door minted scango sessions, so those carts really can carry hot food. The "Make it now"
  sentence remains dine-in only, since that is the only mode still rendering the control it names.

**Pre-merge adversarial review — verdict FIX_THEN_MERGE, fixes applied.** A second four-lens pass
(weighted toward the fix commit, which no one had reviewed) returned 32 findings; the refutation agent
confirmed 31 and reduced them to **2 must-fix — both dishonest strings this slice itself created**:

- **`menuLinkText` was never applied to Checkout's two links.** An empty scan-&-go basket showed
  "Browse the menu" over a `/grocery` destination, and `TimelineStrip` hardcoded "Back to the menu"
  while its default href had become the door picker. `TimelineStrip` now takes the **mode**, not a
  pre-baked href, and derives both — the label is now structurally incapable of drifting from the
  destination, which is the whole point of the helper pair. `menuLinkText` gained a `tone`
  (`"back"` | `"browse"`) so a forward CTA reads "Browse the market" on scango, and the two
  hardcoded "Choose how you're ordering" duplicates now route through it.
- Also fixed, though the verifier ranked it below the merge bar: **the retry button deleted itself.**
  `revalidate()` clears `error` and the failure block is gated on `error`, so tapping "Try again"
  unmounted the focused button — the same WCAG 2.4.3 defect this slice fixed one file over in
  JoinTable. The busy state is **derived** from the provider's existing `loading` (the React Compiler
  lint rightly rejects setState-in-effect), gated behind a click tick so the ordinary first mount
  stays silent, and uses `aria-disabled` rather than `disabled` so the keyboard user keeps their place.

The verifier refuted the three reported "blockers" with grounded reasoning — notably the `DINEIN_KEY`
cross-party rejoin, which is **pre-existing** (`TablePicker` already pushes a code-free
`/menu?mode=dinein` from an always-visible button, and nothing has ever cleared that key); W9a adds one
more entrance whose previous behaviour orphaned 100% of dine-in diners who tapped it. Six ranked
follow-ups registered as `J15`–`J20`.

No migration, no schema change, **no charged amount touched** — `hasDineInFood` reads a column the
query already selected. Gate 8/8; both lint rules verified by inducing a violation and reverting.

### docs — W8 plan-of-record: the money-path test harness, then the register (2026-07-31)

A full-repo audit ("what's left to refine · is every customer path validated · are we ready for the
staff/kiosk surface") found the answers were: real registry debt, **no**, and **console yes / register
no**. Documented so the next session can pick it up cold.

- **[`docs/W8_PLAN.md`](docs/W8_PLAN.md)** (new) — the plan-of-record. **W8 (proof)** then **W6a
  (register)**. The finding: **5 test files monorepo-wide and zero on money/auth/journey** —
  `totals.ts` (the charge authority), `tax.ts`, `cart.ts`, `split.ts`/`split-math.ts`, `pickup.ts`,
  `authz.ts`, `permissions.ts`, `staff-cart.ts` all uncovered; no Playwright, no `e2e/`. Slices:
  **W8a** extract a pure `computeTotals` seam out from under the I/O + the 7 charge invariants
  (voided/comped exclusion · clamp order · tax on the discounted taxable base · grocery-excluded
  service base · pure-grocery tip forced 0 · integer-cent total identity · mixed-basket flat promo)
  - M6/M7 pinning tests · **W8b** tax TS↔SQL parity asserted in the existing `migrations-check` job
    (the "keep them in sync" rule becomes a failing build) · **W8c** split cent-reconcile +
    `canMutateLine` state×role matrix + the M11 pin · **W8d** pickup slot-grid regression pins ·
    **W8e** journey smoke, **recommended deferred** (no staging project; preview + prod share one QR
    project on live Stripe keys). **W8 changes no charged amount.** W6a detail: staff-minted sessions ·
    search + modifier picker in the staff add screen (with the `staffAddItem` trusted-path decision
    called out) · repeat-last-order (blocked on M3's label-not-id snapshot) · Z-report-lite.
- **`docs/OPEN-ITEMS.md`** — new **Proof / test coverage (W8)** section: `T1` (high — no executable
  coverage on any money/auth path), `T2` (TS↔SQL tax drift unguarded), `T3` (gated — no e2e, needs a
  staging project). `K17` marked planned:W6a.
- **`ROADMAP.md`** — `W8` row added to the W-track; build order now `… → W5 → W8 → W6`.
- **`docs/HANDOFF.md`** — new "NEXT SESSION" banner carrying the three audit answers + the pointer.

### W5g — pickup slot sheet revamp (organized dayparts + soonest) (2026-07-22)

The pickup time picker was a flat grid of 15-minute chips — an undifferentiated wall once a day had
many slots. W5g organizes it and adds tasteful signposting (now more prominent since scheduling is a
deliberate choice post-W5f).

- **Daypart sections** — the selected day's times group into 🌅 **Morning** · ☀️ **Afternoon** ·
  🌆 **Evening**, each a labeled `role="group"` (SR hears "Afternoon pickup times, Today") with a muted
  count. `dayPart()` helper buckets by shop-tz hour.
- **Soonest chip** — the single earliest bookable slot is lit as an accent chip with a ⚡ Soonest tag
  (+ `sr-only` "Soonest available"), so a diner who wants "as soon as I can schedule" spots it instantly.
- **Warmer low-capacity badge** — "🔥 2 left" (emoji `aria-hidden`); tabular-nums on the time so columns
  don't jitter as the meridian changes.
- Also (from the W5f pre-PR review): `pickup_when_confirmed` analytics event at the pay boundary that
  BOTH the ASAP and scheduled paths hit (the default-ASAP path fired no client-side timing event, which
  would have shown a false drop-off in the Pickup-commitment funnel — funnel def updated); removed the
  now-dead `DoorFace` `trailing` prop.

### W5f — collapse the To-go door fork (decide "when" at checkout) (2026-07-22)

The To-go door was a disclosure that forked **Now** (→ scango) vs **Schedule for later** (→ pickup)
_before_ the diner had seen the menu — then W5e re-asked the same question at checkout. That fork
predated W5e: pickup couldn't fire immediately, so "Now" had to route to scango. W5e removed that
constraint (ASAP snaps the earliest slot and fires now), making "Now" just pickup-ASAP — so the door
fork was redundant, and choosing "Schedule for later" then landed on an ASAP-defaulted checkout.

- **To-go is now one door** → the pickup menu; the ASAP↔scheduled decision lives solely at **checkout**
  (`PickupWhenChoice`, W5e) — the one place it's actionable. Model: doors = _what you're doing_
  (Dine-in · To-go · Grocery), checkout = _when_.
- `TogoDoor` (disclosure component) + all `.togo-*` CSS removed; the door is now a plain `ModeCard`
  link, identical to Dine-in/Grocery. The **"Now → scango" food path is dropped** (owner-confirmed
  workaround); scango mode stays for the separate Grocery scan-and-go door.
- Net −172 lines. No money/DB/RLS surface touched — pure entry-IA simplification.

### W5e — to-go ASAP↔scheduled pickup choice at checkout (2026-07-22)

Pickup ordering FORCED a capacity slot before the diner could order (the menu auto-opened the slot
sheet). W5e makes **ASAP a first-class default** and moves the timing decision to an explicit choice at
checkout — but ASAP stays honestly gated by the same open-hours + capacity limits scheduling enforces.

- **`PickupWhenChoice`** (new) — a segmented **ASAP · make it now ⇆ Schedule a time** control on
  `/cart` (pickup only; scango is self-scanned grocery, no kitchen fire). Reuses the `.checkout-pill`
  lit-cap language; errors route into the checkout's single review-step live region (no new region);
  the Scheduled pill's accessible name carries the full day+time; both emoji `aria-hidden`; 44px.
- **ASAP is hours- + capacity-gated, not "no slot".** `mms_pickup_asap` (new RPC) SNAPS the earliest
  bookable slot (consuming its capacity, only within open hours / while capacity remains — via the
  existing `mms_pickup_slots`) yet fires **immediately** (`fire_at = null` → `mms_fire_pending_food`
  fires it at settlement). Enforced at the **charge boundary** (create-intent) so a client can't dodge
  it: a closed kitchen or fully-booked day refuses ASAP with an honest message rather than taking a
  paid order it can't fulfill. `mms_pickup_asap_ok` (new) pre-warns the pill so it never offers an ASAP
  the pay boundary would reject; `mms_clear_pickup_slot` (new) toggles a scheduled slot back to ASAP.
- **Menu no longer force-opens the slot sheet.** `PickupSlotChip` now reads **"Pickup · ASAP · Schedule ›"**
  — an optional upgrade, not a required gate; a diner is never blocked behind "pick a time" to order.

Money-invariant held: `pickup_slot`/`fire_at` are fulfillment metadata, never read by `getCartTotals` —
choosing ASAP vs scheduled moves no amount. Migration `20260722000000`.

### W5d — grocery detail sheet + denser cards (2026-07-22)

The grocery card carried everything (photo + name + brand/size + price + unit + EBT + a full-width
Add pill), making it tall + sparse for a ~400-SKU market, and there was no detail view. W5d adds a
detail sheet and reclaims the card density it enables.

- **`GroceryItemSheet`** (new, sibling of the menu `ItemSheet`) — reuses the `@mms/ui` Sheet
  (Radix focus-trap + swipe-to-close) + the `.item-hero`/`.item-cta-bar` CSS + the keyed-body /
  focus-on-swap choreography. Shows the hero photo (aisle-icon fallback), bilingual name, aisle
  Badge, brand·size, a sheet-scale price block (compare-at strike + Save% + unit price, all via the
  honest `saleInfo`/`unitPriceLabel`), and **EBT as an eligibility fact** ("Eligible for EBT/SNAP",
  never "pay with EBT" — 2027 tender). Add/step route through the **same `onAdd`/`onStep`** the cards
  use — one server-priced money path, no second add surface; kept open on add (swaps to the stepper).
- **Card density** — the whole card is a `.gcard-open` button (opens the sheet); a **44px circular
  quick-add FAB** (non-nested sibling) floats in the photo corner, replacing the full-width Add pill;
  **unit price on its own line** (G17); **name 13→15px** to menu scale (G17); photo capped 1:1→132px
  (less dominant); grid/pad tightened. Card ~335→305px, more of the market above the fold.
- **a11y (pre-PR adversarial pass, all fixed before PR):** the card button's accessible name folds in
  the glanceable scan facts (price · sale% · unit · EBT) so an SR user scanning for sales/EBT staples
  doesn't have to open every sheet; the carted floating stepper keeps **full 44px** buttons (the pill
  reclaims corner space, not the targets); the sheet mirrors the card's Add→stepper focus handoff;
  `PhotoPlaceholder` is a `<span>` (valid inside the card button); the last-unit-remove search-refocus
  no longer fights the open sheet's focus trap.

### W5c — menu item depth: bilingual data + real modifier coverage + sheet quantity (2026-07-21)

The R6b item sheet + R5c stepper existed but ran on a hollow catalog: 5/60 items had modifier
groups, zero Burmese below the name line, and the sheet had no quantity control (F8).

- **Bilingual catalog columns** (migration `20260721000000`): `menu_items.description_my`,
  `modifier_groups.name_my`, `modifier_options.name_my` — all nullable/additive. The sheet renders
  the Burmese description under the EN line and stacked MY labels on every modifier group + option
  (`lang="my"`, Padauk, token colors). ⚠️ All 60 descriptions + 12 group + 25 option labels are
  Claude-authored diaspora register — pending Min's native check (OPEN-ITEMS K15).
- **Real modifier coverage** (seed + live import): spice level (Mild/Medium/Burmese hot) on the 22
  made-to-order noodle/stir-fry/hand-mixed-salad dishes + owner-tagged `spicy_optional` items —
  deliberately NOT on batch-pot curries (can't honestly promise per-order heat); sweetness + a
  required Hot/Iced choice on the two made-to-order drinks (Coffee's own description promises it);
  "Add rice" (steamed +$2 / coconut +$3 — the real side prices) on every à-la-carte curry; v7.2's
  soft-egg add-on (+$1.50) on the six noodle bowls. Only the two drinks move to the "Choose" pill;
  everything else keeps one-tap add. ⚠️ Kitchen confirmation before real service (OPEN-ITEMS).
- **Sheet quantity** (F8): a pre-add 1–9 stepper in the CTA bar — "−" only lowers the _pending_
  count, so it can never silently delete a customized cart line (QA §D); bound buttons are
  `aria-disabled` focusable no-ops (native `disabled` would drop keyboard/SR focus at the bound).
  One write lands "2 × Mohinga": `addItem` gains a bounded `qty` (Zod 1–9 **+** SQL bounds; the
  existing `qr_cart_items_qty_range 1–99` CHECK already backstops the column); the two write RPCs
  gain defaulted `p_by`/`p_qty` params, sent **only when qty>1** (the W3 `p_notes` pattern — a
  pre-migration DB still resolves every default caller, pinning deploy-order safety). The CTA
  adopts v7.2's anatomy — label left, live advisory total right, inside the one button; the flash
  announces the unit count ("Added 3 to your order"); MY descriptions join the menu search the
  same way EN ones already did. The server still re-prices everything.

### W5c·r2 — owner feedback round (2026-07-21)

Min's preview feedback on #146, all four points:

- **The real add-ons menu** replaces the conservative rice/egg pair: one "Choose your add-ons"
  group (multiple, up to 8) with the owner's exact list + prices — Steamed White Rice +$2 ·
  Coconut Rice +$3 · Boiled Egg +$1.50 · Sunny Egg +$2 · Mohinga Soup +$4 · Ohn-Noh Soup +$4 ·
  Balachaung +$2 · Veggie Fritters +$3 — on every main (all six food categories; drinks + sides
  sit out). Kyay-O's own Brains group renamed "Kyay-O add-ons" to disambiguate.
- **Option glyphs** — slug-keyed emoji-as-content map (`lib/menu/optionGlyph.ts`, aria-hidden,
  fixed slot): 🌶/🌶🌶/🌶🌶🌶 spice scale, ☕/🧊 temperature, dish glyphs on the add-ons pantry.
  Spice-medium Burmese corrected to ပုံမှန်အစပ် (owner).
- **Engaging EN descriptions** — all 60 rewritten to the sensory/fun voice (a few lines adapt the
  owner's own review phrasing); value-stable UPDATE block in seed §W5c·r2, live-applied.
- **Official logo** — the Morning Star badge (the delivery app's shipped asset) replaces the ✦ in
  the header brand lockup; the ✦ stays the in-app accent mark elsewhere.

### W5c·r3 — brand-asset pass + glyph refinements (2026-07-21)

- **Badge everywhere** (owner's go on the brand follow-up): favicon (`public/icon.svg` — the badge
  embedded, letterboxed, zero config changes), maskable PWA icon (badge inside the 80% safe zone on
  the brand-dark field), apple-touch icon, and the OG/twitter share card all now lead with the
  official badge (`app/_og/logo.ts` — PNG twin base64-embedded for Satori, same pattern as the
  fonts). The ✦ remains the in-app accent mark.
- **Glyphs inline + in color** — option emoji now ride inline with the label (leading for the
  add-ons pantry, trailing for the intensity meters) with VS16 forcing color presentation; the
  fixed-slot column (which clipped 🌶🌶🌶) is gone. Sweetness gains a 🍯/🍯🍯/🍯🍯🍯 meter; the top
  spice step is renamed **"Burmese 🔥"** (owner's copy — the 🔥 lives in the option name, DB +
  live), leaving 🌶️ → 🌶️🌶️ → Burmese 🔥 as the escalation.

### W5c·pre-merge — deep-pass hardening (2026-07-21)

The pre-merge adversarial pass (6 lenses, per-finding verification) surfaced real defects in the new
add-ons group; all fixed before merge (migration `20260721120000`, live-applied):

- **Allergen honesty (HIGH, safety)** — an add-on can introduce an allergen the base dish doesn't
  declare (Balachaung → shellfish on an `allergen-reviewed` "contains nothing" salad). `modifier_options`
  gains an `allergens[]` column; the item sheet now shows **"Contains shellfish"** on the option row
  (visible, not the aria-hidden glyph) **and folds a chosen add-on's allergens into the item's Contains
  line**, so the fail-safe free-from claim can't be silently broken. Conservative tags (over-warn is the
  safe direction; kitchen refines in C11): Balachaung→shellfish, eggs→egg, Mohinga Soup→fish+egg,
  Ohn-Noh Soup + Veggie Fritters→gluten.
- **Cross-category tax (MED, money) — documented, not code-fixed** — the add-ons are all hot prepared
  food but a line carries ONE tax category, so a hot add-on on a **cold to-go salad** rides the salad's
  exemption (small CDTFA under-collection). The first attempt fed a per-part `tax_cents` into the line,
  but `getCartTotals` (the charge authority) reads `tax_cents` only as a **boolean** taxable flag and
  taxes the **whole** `unit_price_cents` — so that would have **over-charged** the entire salad+add-on
  line. Reverted to the single-category-per-line model (correct in 3 of 4 cases; under-collects only the
  hot-side-on-cold-to-go case). `modifier_options.tax_category` is **staged** for the real fix (a per-line
  taxable-base engine — its own milestone); the residual is now a documented known limitation (OPEN-ITEMS
  C11), same class as the accepted iced-drink nuance. _(Caught by the Codex PR review — credit where due.)_
- **Self-pairings (MED, UX)** — the blanket add-ons mapping offered flagship dishes their own component
  (Mohinga → "Mohinga Soup", Ohn-Noh Khao Swe → "Ohn-Noh Soup", Coconut Chicken & Rice → "Coconut Rice"
  - "Balachaung"). Unlinked from those three (50→47 item links; live + seed).
- **Qty a11y (MED)** — the sheet qty stepper is now a `role="spinbutton"` (aria-valuenow/min/max +
  aria-controls), so a screen reader hears the new count on each step without a second live region.
- **Cap honesty (LOW)** — a multi-unit add that merges into a line near the 99 cap now re-announces the
  units that actually landed instead of the optimistic requested count (only fires at the cap edge).

### W5b — desktop rail affordances (2026-07-21)

The app is a fixed phone column even on desktop, so every horizontal rail overflows there too — but
a mouse can't swipe, and all seven diner rails hid their scrollbar: overflow content was unreachable
for fine-pointer users. Two tiers, both gated to hover-capable fine pointers (touch keeps the clean
edge-to-edge look):

- **Chip rails** (`.menu-rail` category chips, `.menu-diets` dietary filters, `.aisle-rail-scroll`
  grocery aisles) — a real, slim token-colored scrollbar returns on desktop.
- **Card carousels** (`.start-here-rail` StartHere + Favorites, `.item-upsell-row` "Goes well
  with", `.slot-days` pickup days) — a shared `<Rail>` shell overlays chevron nudge buttons on the
  side(s) that actually overflow (ResizeObserver + rAF-throttled scroll measure; smooth scrollBy,
  `auto` under reduced-motion). Nudges are aria-hidden + untabbable on purpose — keyboard/AT users
  already reach every card by tabbing (native scroll-into-view); the buttons are a pointer-only
  affordance.

### W5a — session resume: the swipe-back dead end, closed (2026-07-21)

An active table/basket was invisible outside the menu (the home surfaces were order-based only),
and the picker refused a diner's OWN table — the "same user can't re-enter after swipe back" bug.

- **Member-aware picker claim** — the `?table=N` claim path 409'd whenever the table had an active
  session, even when the claimant was already a member of it. It now checks membership first and
  converges (a rejoin, not a takeover); the stranger refusal is intact.
- **`GET /api/session/peek`** (new) — a passive "do I have a live session?" read: verified Bearer
  anon token → active, non-expired sessions this seat belongs to (the mint's own predicate), plus
  the open cart id + line count. Read-only by design (never mints, never slides the TTL) and
  minimal-disclosure (no join codes, members, or expiry). A failed peek is an empty peek.
- **Home resume card for live sessions** (`HomeSessionCard`) — the session-level sibling of the
  order-based `HomeResumeCard`: "Table 5 is still open · 3 items" → back into the menu, or "Your
  basket · N items" → straight to the cart. Restraint: dine-in shows even empty (a claimed table is
  live state); solo baskets only with items (solo sessions auto-exist per device).
- **"Your table" in the picker** — the diner's own live table renders as the warmest chip on the
  grid (clay ring + wash, "Your table") instead of a dead "Seated"; tapping it resumes.

### W4g — grocery editorial polish (2026-07-18)

First pass of a world-class design refinement on the grocery Browse surface — it was built
function-first in W4 and never got the editorial pass the menu did (RUBRIC north star: type-led,
warm, unhurried). Targets the "junky / bloated / unrefined" gaps:

- **Editorial masthead** — a display-serif (Fraunces) title over one quiet subline replaces the
  eyebrow + generic `h1` + a 2-line EBT text-wall. The honest EBT/SNAP disclosure is **demoted** to
  one quiet tagged line under the toolbar (undated per the W4a rule; per-item chips + the Scan-door
  EBT subtotal carry the detail).
- **One token system for the chrome** — the 9 ad-hoc inline `CSSProperties` objects (search field,
  results, hint rows, scanned row, retry buttons, toast, checkout CTA) are replaced by token-pure
  `globals.css` classes (`.grocery-search/-results/-result/-hint/-scanned-row/-retry/-toast/-cta`),
  so the surface is consistent, dark-mode-clean, and free of magic numbers.
- **Cohesive toolbar** — the Browse|Scan segmented control + search read as one grouped cluster
  (`.grocery-toolbar`), and the checkout CTA is a lit clay pill (was a rectangle). No behaviour,
  a11y, or money change — pure presentation over the same server-priced cart.

### W4f — right-edge aisle fan-out section nav (2026-07-18)

A "you are here" aisle minimap for the grocery Browse view — the vertical companion to the
horizontal filter rail (which is kept). A fixed right-edge strip of aisle ticks scroll-spies the
section currently under the header and fans out to bilingual EN/MY labels to jump between aisles.

- **Scroll-spy + jump** (`useAisleSpy`) mirrors the in-app `MenuBrowser` pattern — an
  `IntersectionObserver` over the `data-aisle` sections (topmost-intersecting under the header wins),
  `--lend-offset`-aware inset, `LEND_CHANGE_EVENT`/resize rebuild, and a 600ms jump-freeze so the lit
  marker doesn't flicker through sections during a smooth-scroll.
- **Input-aware fan** (`AisleFanNav`): desktop `:hover`, keyboard `:focus-within`, and a touch
  tap-to-open (first tap fans the labels, second jumps) — outside-tap / idle collapse. Pure
  navigation; never touches the cart/money path.
- **Self-hiding**: renders only when ≥2 sections are stacked, so it disappears the moment the filter
  isolates a single aisle. Floats in the gutter (`pointer-events` only on the 44px ticks) so it costs
  zero grid width. Token-pure active cap + `prefers-reduced-motion` off-switch; `.aisle-section`
  `scroll-margin-top` lands a jump below the sticky header.
- **Editorial design pass** — the resting state is now one cohesive vellum **rail** (a `::before` on
  a content-sized inner wrapper, so it hugs the dots) with soft dots that **spring into an elongated
  lit clay pill** for the in-view aisle, instead of scattered hairline ticks. The fan-out labels are
  refined `surface-elevated` pills with a gold hairline + `--sh-md`, springing in (`--spring`) with a
  stagger; the active label carries a clay fill + `--glow-ac`. No-blur (mobile GPU budget) — depth
  from tokens only. Interaction unchanged (CSS + an inert inner wrapper).
- **Responsive split** — the vertical fan-nav is now **desktop-only** (`≥ md`, where the centred
  column leaves real gutter for it). On **mobile** the horizontal aisle FILTER rail is **sticky**
  instead (full-bleed bar that pins under the header on scroll; tiles in an inner scroller so the
  opaque bg isn't eaten by the edge-fade mask). The old gutter-reserve is dropped — cards are
  full-width on mobile.
- **Slim, self-tucking mobile rail** — the sticky rail no longer eats ~20% of the screen: the chunky
  90px icon+EN+MY tiles are now single-line **chips** (icon + English, ≥44px) ~half the height, and
  the bar **auto-hides while scrolling down** (full-screen grid) and **slides back on scroll-up**
  (`useHideOnScrollDown`, rAF-throttled passive listener; stays visible under `prefers-reduced-motion`;
  desktop unaffected). So category nav costs zero space while browsing and returns the instant it's
  reached for. Chips carry the **bilingual EN-over-MY** label (icon + stacked EN/MY).
- **Pre-merge deep adversarial pass** (2 confirmed LOW findings, both folded in): a keyboard/SR jump
  now announces the arrived aisle via a nav-owned polite `sr-only` live region (focus stays on the
  tick — the silent scroll was imperceptible to non-sighted users); and the touch open-press window is
  now also disarmed on `pointerup` when the finger lifts off the pressed tick (a release onto the gap
  fires neither `click` nor `pointercancel`, so a genuine re-tap could otherwise be swallowed).

### W4e hardening — post-merge adversarial follow-up (2026-07-18)

The three adversarial-pass findings that didn't land with the W4e design pass, shipped alone (#141):

- **Basket "You're saving" now floors with the cards** — routed through the same `saleInfo` ≥1%
  gate the cards/hits use, so a sub-1% `compare_at` gap (the DB CHECK only enforces `>`, not a
  minimum) can no longer advertise a phantom aggregate saving with no visibly-discounted line.
- **Aisle-rail focus ring un-clipped** — the trailing `mask-image` edge-fade is dropped on
  `:focus-within`; it was clipping the rightmost tile's `:focus-visible` ring (WCAG 2.4.7).
- **Compare-at null-safety** — RPC/catalog reads use loose `== null` so an `undefined` from an
  un-migrated RPC collapses to null instead of rendering `$NaN`; dead `.gcard-sale` override removed.

### W4e design pass — the sale actually reads as a sale (2026-07-18)

Pre-merge design-weighted adversarial pass (verdict PASS, 0 blockers; money/legal clean). Applied the
P1 craft wins that were the point of W4e — a sale card was visually identical to a full-price one:

- **Gold + constant-ink "Save X%" badge** (new `--ink` token, theme-constant) — the savings signal no
  longer wears the clay of the Add CTA, so the eye tells "on sale" from "buy me". Loud pill reserved
  for **≥15%** markdowns; the honest inline "Compare at" strike shows on every real sale.
- **Escalated discounted price** (`.gcard-price-sale`: larger + deep-clay) — the sale price is the
  typographic hero. Compare-at + price share one `.gcard-foot` (fixes the double-`margin-top` defect).
- **Add-button press** (CSS spring, RM-gated — not 395 framer buttons) + **stepper mount pop**;
  **entrance stagger** on cards; **solid lit active aisle tile** (was a Night-invisible 10% tint);
  **rail edge-fade** scroll cue; **bigger placeholder glyph**; **EBT demoted** to a neutral outline
  chip (its green no longer reads as a second CTA); basket **total/savings/EBT moved to the Scan door**
  (the arm's-length total was buried under the aisle grid on Browse).
- **a11y/defect fixes:** browse-card sr-only no longer double-speaks the price; `saleInfo` floors at
  1% (no "Save 0%" from a hand-entered near-equal compare-at); RPC-nullability comment. Deferred
  P2/P3 polish → OPEN-ITEMS G17. Gate 6/6 + 76 tests green; contrast-audit clean.

### W4e — the Sale layer: honest "Compare at" market pricing (2026-07-18)

The 2022 price list becomes a value story: the charged price stays the (below-market) 2022 number,
and a real competitor-market reference sits above it as **"Compare at $X"**. No charge changes —
this is a display layer; checkout still re-derives every amount server-side.

- **Schema** (`20260718000000`): `grocery_items.compare_at_cents` with a **DB CHECK `> price_cents`**
  (a sale can never be fabricated as ≤ what we charge); `mms_grocery_search` returns it too
  (drop+recreate for the new column, grants re-asserted service-role-only).
- **Grounded pricing, not invented** (the house "never fabricate" bar): per-category multipliers
  derived from **live 2026-07 competitor sampling** (myanmarfoodusa.com + shopmyanmarfood.com,
  size-comparable). Guardrails in `gen_seed.py`: **≤40% discount cap**, a **per-category absolute
  ceiling** = the real sampled competitor high (a compare-at never exceeds a price a competitor was
  actually seen charging), **bulk multipacks excluded**, **health + home-personal excluded** (their
  market wasn't clearly above ours — no defensible ref), charm-rounded. Result: **313/396 on sale,
  11–40% off (avg ~29%)**. Framing is **"Compare at" (market comparison)**, never "Was" (FTC-safe).
- **UI:** a "Save X%" chip on the card photo + struck `compare_at` beside the price (sr-only carries
  "$X, compare at $Y, save Z%"), the same on search hits, and a basket **"You're saving $X vs.
  typical market prices"** line (real, only genuinely-discounted lines count). Import artifact
  refreshes `compare_at_cents` on re-run (derived) while the charged columns stay INSERT-only.
- Methodology + defensibility recorded in `docs/GROCERY_MARKET_PLAN.md §pricing`. Gate 6/6 green;
  migration applied to live; the grounded catalog import (with sale prices) run against live.

### W4a+W4b — the market grows up: real 395-SKU catalog + Browse|Scan (2026-07-17)

The grocery door becomes a shoppable market. Data source: the owner's wholesale/retail price lists
(Nov 2021 – Apr 2022), parsed + normalized into `supabase/data/grocery_catalog.json` (the committed
source of truth) and rendered into the seed + a live-import artifact. **No money-path change** —
browse adds ride the existing authorized `scanAdd`; steppers ride `setQty`; totals stay
server-derived.

- **W4a catalog** — migration `20260717000000`: `grocery_items` gains `category` (10-aisle CHECK) ·
  `brand` · `sku` (unique) · `size_qty`/`size_unit` · `synonyms text[]`, pg_trgm GIN on both names,
  and `mms_grocery_search(p_q)` (ILIKE over name/name_my/synonyms + trigram similarity, rank-ordered,
  available+non-weighed only; service-role-only grants). **395 real SKUs** seeded — bilingual names
  (100% MY / 96% EN), brand, aisle, pack size, EBT/tax by aisle (food = `grocery_food`+EBT; personal
  care/household/herbal = `retail_nonfood`), romanization synonyms as data (laphet/lahpet,
  mohinga/mohingar…). Barcodes are **GS1 store-internal EAN-13s (prefix 299)** derived from the SKU
  until real shelf UPCs are captured. ⚠️ Prices are 2021-22 vintage — the live import
  (`supabase/data/grocery_catalog_import.sql`) waits on Min's price confirmation.
- **W4b Browse|Scan** — one catalog, two doors: a manual-activation tablist (Browse default — the
  camera permission ask waits for an explicit Scan choice; choice persists per visit); bilingual
  aisle tiles (8 new curated `Icon` glyphs); Weee!-anatomy cards (placeholder-photo tile · EN+MY
  names · brand + pack size · price + honest $/100g unit price · EBT tag · one-tap Add that swaps to
  the shared stepper once carted, double-tap-serialized); search upgraded to the trgm RPC with
  bilingual hit rows + per-glyph Padauk fallback. The **session gates the basket, not the market**
  (catalog is a public read — aisles render while the scango session mints). K5's cart-truth
  discipline extends across tabs: the pre-hydration "couldn't check your basket" strip is visible
  from BOTH doors (an invisible basket + a browse re-add would double server qty), and the
  EBT-eligible subtotal line lands with undated honest copy.
- Verified on the local stack: migration + seed apply clean; `lahpet`→tea-leaf and
  `mohingar`→mohinga search hits; browse add → cart line → CTA total end-to-end. Full gate green;
  knip's two flags pre-date this change.

### W7 hotfix — OG font load crashed EVERY page (prod homepage outage) (2026-07-17)

Immediately after the W7 brand-kit merge (#136), the prod homepage — and every page — began returning a
500 ("This page couldn't load"). Root cause: `opengraph-image.tsx` read its fonts via
`readFileSync(new URL("./_og/*.woff", import.meta.url))`, which throws in the **prod server bundle**
(`ERR_INVALID_ARG_TYPE` / `Invalid URL` — the bundled `URL` class fails Node `fs`/`url`'s native
`instanceof URL` check). Because the OG image lives in the **root-layout metadata**, every page imported
that module to emit `og:image` and faulted. It escaped all reviews because it degrades to a cached 200 +
a logged error under local `next start`; it's only fatal in the Vercel bundle.

- **Fix:** embed the Fraunces (OFL) subset woffs as base64 `Buffer`s in `app/_og/fonts.ts` and import them
  — **zero** file-path / URL / asset-tracing dependency, so it can't crash on any runtime. `fileURLToPath(URL)`
  hit the same instanceof crash; `fetch(new URL(file://))` isn't supported on the Node build runtime — base64
  is the runtime-agnostic fix. Verified against `next start`: `/ · /menu · /track · /opengraph-image` all 200
  with zero runtime errors; the OG renders byte-identically in Fraunces.
- **Learning** (`.claude/LEARNINGS.md`): never `readFileSync(new URL(...))` a bundled asset in a route that
  feeds root-layout metadata — the bundled URL fails Node's `instanceof` and 500s every page; embed or fetch.

### W7 (brand kit) — social / PWA shell: OG card · metadataBase · apple-touch · manifest (2026-07-17)

The first W7 "shell" slice — the brand-asset kit, closing most of OPEN-ITEMS S4. No app-UI or money
change; all page metadata + generated images. Gate green.

- **Social share card** — `app/opengraph-image.tsx` (+ `twitter-image.tsx` re-exporting it): a next/og
  (Satori) wordmark lockup — the ✦ mark over "Mandalay Morning Star" in Fraunces Black on paper cream, a
  clay hairline, the honest tagline. Fraunces is **bundled** (latin-subset OFL woff in `app/_og/`) so the
  image prerenders at build with **no** request-time font fetch.
- **`metadataBase`** — extracted the env-resolved origin (`NEXT_PUBLIC_SITE_URL` → Vercel prod → prod
  domain) out of `email.tsx` into a shared `lib/site-url.ts`, and set `metadataBase` from it so the OG /
  twitter / manifest URLs resolve absolute. Added `twitter: summary_large_image`, `appleWebApp`,
  `applicationName`.
- **Icons + PWA** — `app/apple-icon.tsx` (next/og 180×180 gold ✦ on brand-dark — the iOS home-screen
  icon iOS won't take from an SVG) · `app/manifest.ts` (installable: name/short_name/standalone/portrait,
  `theme_color`/`background_color` from `--pg` #faf9f5) · `public/icon-maskable.svg` (full-bleed field +
  safe-zone mark so Android's adaptive mask can't clip it). The `/icon.svg` favicon is unchanged.
- **Lint** — the next/og image routes (Satori needs literal-px `fontSize` + a raw `<img>`) are exempted
  from the numeric-`fontSize` token ban + `no-img-element`; they aren't app UI.
- **C10 closed** — the Stripe wallet-domain registration landed (`pmd_1Tu6…`, live/prod); W2d's Express
  Checkout wallets now render (card path unchanged).
- **Deferred to a focused follow-up:** the `--star` token + gold unification — a cross-app color-token
  refactor kept out of this asset PR to bound the regression surface.

### W2 (part 3) — staff surfaces: type-scale + icon sweep; numeric-fontSize ban now repo-wide (2026-07-17)

Closes the W2b/W2c tail on the **staff** surfaces (KDS · expo · floor · orders · approvals · team · PIN/
lock · login · feedback), completing F3 and F5 for the whole app. Presentational only — no totals/refund/
PIN/auth logic touched; gate green (lint · typecheck · build).

- **Type-scale.** ~23 staff files' inline `fontSize` magic numbers → tokens. Diner-tier chrome → `--fs-*`;
  **KDS/kitchen reads stay on the ops `--kfs-*` tier** (id 32 · item 28 · mod 21 · clock 24 · meta 15) so
  no kitchen number ever SHRANK — the 13/14px KDS chrome grew to `--kfs-meta` (15), never down (staff read
  the board at 1–2 m; a shrink would be an ops regression).
- **Icons.** Retired the last functional emoji-as-chrome with `@mms/ui` `<Icon>`: 🔊→`volume` · ↩→`undo` ·
  BUMP ✓→`check` · Added ✓→`check` · ▲▼→`chevron-up`/`-down` · ⚠→`alert` · ☆→`star` · 🔒→`lock` · 🥡→`bag`;
  the staff feedback star-rating (`★`/`☆` repeats) → five lucide stars (filled/outline) behind an existing
  `role="img"` "N of 5 stars" name. Four glyphs added to the curated set (volume/undo/chevron-up/-down).
- **Lint ban now repo-wide.** Dropped the `**/staff/**` `ignores` from the `no-restricted-syntax`
  numeric-`fontSize` ban — it now covers every `.tsx` with no exclusions, so the type scale can't regress
  anywhere in the app.

### W2c (part 2) — type-scale sweep: inline font-sizes → --fs-\* tokens + lint ban (2026-07-17)

Kills the inline `fontSize` magic numbers (F3) on the checkout → track → rewards **hero path** and makes
them un-regressable. The owner chose "adopt the disciplined scale" (vs. preserving pixels).

- **Snapped each element to the nearest `--fs-*` by role** — `10–11.5→xs(11)` · `12–14.5→sm(13)` ·
  `15–16→body(16)` · `17–19→h3(17)` · `20–24→h2(21)` · `26–31→h1(26)` · `32+→display`. Mostly ±1px
  unifications (before/after verified); the largest single shift is the checkout grand-total figure
  `24→h2(21)` (still the hero). One decorative hero glyph (`34`) mapped to `display`, not h1.
- **The ENTIRE diner path is now swept** (~30 files, 192 inline font-sizes → tokens): checkout/pay/track/
  rewards · menu (`MenuBrowser` flagship title `34→display`) · account · cart/grocery/error pages · the
  group/split/tab/invite/feedback components · mode doors · barcode scanner. Decorative mascots (36/40)
  and hero glyphs (34) → `display`; page titles (26–30) → `h1`; a vestigial `fontSize` on the (now
  `<Icon>`-rendered) feedback stars was dropped.
- **ESLint ban** on numeric inline `fontSize` (`no-restricted-syntax`, matching any numeric literal in a
  `fontSize` value) now covers the **whole diner path** (`components/**` + `app/**`), excluding only the
  not-yet-swept **staff** surfaces (`**/staff/**`). Verified: it errors on a numeric, passes on tokens.
- **Remaining:** the **staff** surfaces (KDS/expo/floor) — drop the `ignores` once they're swept too.

### W2d — checkout / pay craft (wallet-first · custom tip · fees-before-tip) (2026-07-17)

The money-path slice of W2. **Server-authority invariant preserved:** the client never sends an amount —
`create-intent` re-derives it from `getCartTotals(cartId, tipRate)` and the webhook recomputes identically
from `metadata.tipRate`. No RLS/DB/migration change.

- **Wallet-first (Express Checkout).** `<ExpressCheckoutElement>` (Apple/Google Pay/Link) rendered ABOVE
  the card element in `PaymentSection`, sharing ONE `confirm()` with the card form — it pays the **same**
  PaymentIntent (no second intent, no client amount). Renders nothing until a wallet is present AND the
  domain is registered in Stripe; `onLoadError`/no-wallet fails closed to the card flow, so it's safe to
  ship before the domain is verified. An "or pay with card" divider shows only when a wallet is available.
- **Custom tip.** A "Custom" chip reveals a dollar field; the amount rides as a **rate** (`customCents /
net`, derived during render via `customTipRateFromDollars` → `effectiveTipRate`) so `create-intent` and
  the webhook apply the identical `round(net·rate)` — the diner types dollars, the server derives the
  amount. Clamped to 100% of the order (schema `tipRate` cap widened `0.5 → 1.0`; a stray rate is rejected
  server-side); re-derived from the CURRENT net so a group peer's edit can't silently re-scale a fixed-$
  tip. Focus moves to the field on open; `aria-pressed`/`-expanded`/`-controls` + a labelled input.
- **Fees before the tip ask.** The review receipt now shows the fee breakdown (subtotal → service charge →
  tax) and the **SB-1524 disclosure ABOVE** the tip selector (surprise fees are the #1 benchmark
  complaint); a standalone grand-total bar (tip-inclusive, `NumberFlow` roll, the single `.vt-cart-total`
  morph target) lands below. Presentation only — no math change.
- **The amount on the CTA + honest group caveat.** The primary CTA carries the estimate — "Continue · $X",
  or for a group **"Pay the whole order · $X"** (elevating the trust caveat a guest who read "your share"
  needs), or "Settle tab · $X". The residual caveat reworded + bumped off 11.5px (F9).
- **Designed empty-cart.** `EmptyState` (cart glyph + copy + a "Browse the menu" CTA) replacing the bare
  "Nothing here yet"; the menu link carries the session mode (a bare /menu defaulted to scan-&-go, F9).

### W2 — flagship craft foundation (icons · placeholder · perceived-perf · order code) (2026-07-17)

The buildable-now, non-money slices of W2 — the three things a diner sees first (missing photos,
emoji-as-iconography, the blank-frame wait) plus a quotable order code. No money/auth/RLS surface changes.

- **W2b — the brand icon set.** New `@mms/ui` `<Icon>` (`packages/ui/src/icon.tsx`): a curated,
  bounded **lucide-react** set (the delivery app's set too — M5 "learn from delivery"; Next
  auto-optimizes the imports so only used glyphs ship) at one brand stroke weight (1.75), decorative
  (`aria-hidden`) by default with a `label` escape for standalone controls, and a filled variant via
  `fill`. Retires **~30 functional emoji-chrome glyphs across the diner path** (search · trash · receipt ·
  favorite · card/cash · flame · bag · cart · gift · close · pin · alert · info · lock · people · star ·
  check + `cat-*` placeholder glyphs) — `sheet` close, `Stepper` remove (`removeGlyph` widened to
  `ReactNode`), `AppHeader` cart, menu search/info/empty, `ItemSheet`/`FavoritesRail` heart,
  `Checkout` line-state chips, `OrderTracker`/`OrderHistory` receipt+tender, pickup pin/bag, feedback
  stars, guest lock/people, reward gift, settlement/secure-tab checks, recovery alert. The `✦` wordmark
  mark stays a text glyph; content/mascot emoji (🍵 flourish, 🫖 error/track medallions, mode-door
  tiles, reward-tier emblems) stay. Staff surfaces (KDS/expo/floor) deferred to a staff pass.
- **W2a — the designed missing-photo placeholder.** `BlurUpImage` gains a `fallback` prop; a new
  `PhotoPlaceholder` (the dish's **category glyph + ✦** over the item gradient) fills it — so a
  photoless **or broken-hotlink** dish (28 point at a `fallback.jpg`, and every URL hotlinks the
  delivery bucket) reads intentional instead of an empty tile. Wired into the menu grid, ItemSheet hero
  - suggestions, favorites, start-here, and grocery. (The bucket migration + real photos stay gated on
    live Supabase + Min.)
- **W2c — perceived performance + recovery.** Geometry-matched `loading.tsx` for the four cold-hit-blank
  routes (`(order)/menu`, `(order)/dine-in`, `/track`, `/grocery` — `/menu` is cookie-dynamic so it
  Server-renders on demand). `error.tsx` gains a **stale-deploy ChunkLoadError guard** (a one-shot,
  cooldown-guarded hard reload — `reset()` just re-requests the dead chunk) + type migrated onto the
  `--fs-*`/`--lh-*` scale. (The ~360 inline-`fontSize` type-scale sweep is a separate per-screen PR.)
- **W2e — the quotable order code.** The food `/track` receipt card now shows the short `#ABCDEF`
  reference (grocery/refund already had one) — a dine-in/pickup diner finally has something to quote at
  the counter. Visible tail `aria-hidden` + an `sr-only` spaced sibling (matches the exit-pass pattern).
  Itemized rows / email receipt / print stylesheet stay in W2d/W2e.

### W3 — the kitchen you can trust (KDS · expo · order-ready board) (2026-07-16)

- **W3a (ops blocker, K4):** every channel now reaches the kitchen. `mms_fire_pending_food` drops its
  dine-in gate — paid pickup/scango food fires at the cart's stored `fire_at` (= slot − prep, the M2
  seam), so a scheduled order renders as a dimmed **HELD** card that turns live at fire time (no cron;
  manual "Fire now" allowed via `mms_fire_ticket_now`, paid-carts-only so it can never eat a diner's
  undo grace). The pg_cron reconciler learns the widened fire. Expo sorts by **effective due time**
  (`arrived? · pickup_slot ?? created_at`) with "Here now" pinned — a 6pm slot paid at noon no longer
  heads the queue all afternoon. **Latent bug fixed:** `mms_line_transition` guarded `status='open'`,
  so any line fired AT checkout (paid cart) was unbumpable — kitchen edges now accept paid carts, and
  refuse lines the board hasn't shown (`fire_at ≤ now()` on start/serve).
- **W3b (the ticket + the board, K1/K2/K5):** full-bleed KDS with a dedicated `--kfs-*` type tier
  (32px identity · ≥28px/800 items · 21px full-contrast modifiers · solid qty chips), Night theme
  forced (glare/burn-in), channel badge + 2-threshold urgency header strips (config-driven
  `mms_kds_config`, per-channel; pickup ages from fire time) + mm:ss elapsed. **The notes channel:**
  bounded `qr_cart_items.notes` (Zod 160 + column CHECK) — ItemSheet gains "A note for the kitchen"
  (the allergen copy finally points at a real channel), staff line editor gets draft-only note
  set/clear (`setLineNotes`), notes ride the order snapshot to expo, render as the highest-contrast
  red band on the ticket, and **never merge** (insertOrIncLine + `mms_merge_table_orders` treat a
  noted line as unfoldable — "no peanuts" can't silently spread to or vanish from units).
- **W3c (attention + rush, K3/K8/K9):** gesture-armed WebAudio chime (distinct dine-in vs counter
  tones, volume persisted, soft re-chime on a ticket un-started past the config window) + keyed edge
  flash + "N new →" pill; fixed grid pages at 8 with an unmissable **"+N more"** (text never shrinks);
  the **All-Day rail** ("Mohinga ×4") reduced client-side; header shows open · oldest · late ·
  avg-today (`mms_kds_stats`, local-midnight window off `pickup_config.tz`).
- **W3d (bump/recall/resilience, K7/K10/K12):** ticket-level **BUMP** (64px zone; serves exactly the
  displayed line ids — a line that fired mid-tap is never silently served) with a 6s undo toast + a
  2-minute **recall rail** (both enforced in SQL: `mms_bump_ticket`/`mms_recall_ticket`, timestamps
  `started_at`/`bumped_at` stamped for metrics); `navigator.wakeLock` + visibility re-acquire on
  KDS/expo; **honest 401/lock**: the polled reads return a discriminant (`signin`/`locked`) and the
  boards hard-redirect instead of wearing "Reconnecting…" forever; station tags (wok/cold/drinks from
  menu category) as persisted client-side chips — a station bump serves only that station's lines.
- **W3e (the order-ready board):** optional **"First name for pickup"** at pickup/scango checkout
  (`qr_carts.customer_name` → order snapshot; localStorage-prefilled, never in analytics) — expo bags
  and KDS tickets finally headline a human name + short code. Read-only **`/board`** for any smart-TV
  browser: Preparing | Ready (bilingual EN/MY), gold flash on the ready transition, picked-up cards
  linger 10 min then auto-clear (`togo_ready_at`/`togo_picked_up_at` stamped by the expo bump), held
  scheduled orders stay off until fire time. The TV can't join the private realtime channels, so it
  polls the **sanitized `/api/board`** (name + code + status only) behind a constant-time device token
  (`BOARD_DEVICE_TOKEN`, docs/ENV.md) on the house 5s cadence.
- Migration `20260716000000_w3_kitchen.sql` (additive; fulfill RPCs restated with only the
  name/notes copy; idempotent; verified behaviorally on the local stack — 16 scenario checks incl.
  grant lockdown). **⚠️ Apply to live before merge** (the PR preview shares the live DB).

### W0 + W1 — truth/registry + stop the bleeding (2026-07-16)

- **W1a (money):** grocery retail lines are excluded from the SB-1524 service-charge base in
  `getCartTotals` (discount pro-rated onto the service base exactly like tax onto the taxable base) and
  tip is forced to 0 server-side on a pure-grocery basket — one derivation covers create-intent, the
  webhook reconcile, cash settle, and split shares identically. Checkout hides the tip group on
  pure-grocery baskets and renders the service-charge row + SB-1524 disclosure only when actually
  charged. A bag of rice no longer pays a "kitchen wages" charge. Plus Q9: the intent idempotency key
  gains the payer uid so a second payer can't inherit the first payer's PI + Stars attribution.
- **W1b (security):** Q4 — `settle_at` slides forward on payer activity (extend-only; never revives an
  aborted/taken-over settlement) and `captureAllIfReady` relaxes for the fully-covered case, so a table
  slower than the 10-min TTL no longer dead-ends with every card authorized ~7 days (also fixed the
  sibling $0-share-settles-last dead-end). Q6 — the seven unthrottled mutations gain the per-device
  flood guard. Q7 — manager-PIN step-ups pre-flight the approver (active manager/owner ≠ caller) + a
  per-caller step-up rate bucket before any lockout budget is spent (closes the floor-wide
  approvals/voids/refunds lockout DoS).
- **W1c (security+UX):** the /track **refund arm** — a fully-refunded order shows an honest terminal
  state (warn chip · refund card with the real 5–10-day window + order reference · suppressed
  goodbye/feedback/ETA) instead of a step rail claiming the kitchen's on it. Q11 —
  `requireStaffPage()` replaces the hand-copied gate triplet on all 10 staff pages; CSP pins Supabase
  to our project host (delivery host kept for photos until W2a) + prefetch-header'd documents get a
  static fallback CSP; `getFeedbackState` reports feedback-existence only to the order's earner.
- **W0 (docs):** `docs/OPEN-ITEMS.md` — the single severity-tagged registry (joins the "Gate before
  done" checklist) · `RUBRIC.md` gains the **O-axes** ops scorecard + the grocery browse/exit widening ·
  three benchmark-grounded design sources for the surfaces v7.2 never covered: `SPEC-KDS.md`,
  `SPEC-GROCERY.md`, `SPEC-KIOSK.md` (linked from the context INDEX).

### Added — the 🏭 W-track plan: production polish across all four fronts (2026-07-16)

- **[`docs/PRODUCTION_PLAN.md`](docs/PRODUCTION_PLAN.md)** — plan-of-record for the owner's brief ("nowhere
  near production level polish"): an 8-agent audit+benchmark pass (diner path · grocery · staff/kitchen ·
  foundation code audits + sunday/kiosk/KDS/scan-and-go world-class benchmarks), the honest diagnosis of why
  ≈4.5 self-scores missed the felt gap, and phases W0–W7 (truth/registry → money blockers → hardware-grade
  kitchen → flagship craft → shell → grocery market → bilingual system → FOH register + kiosk shell).
  Verified ship-blockers logged: grocery baskets pay the 5% restaurant service charge and are offered tip
  presets (`apps/qr/lib/totals.ts:52`), and paid pickup/scango orders never reach the KDS
  (`apps/qr/lib/kitchen.ts:70`). ROADMAP gains the W-track board; HANDOFF banner repointed.

### Added — shared-device account experience: switch · remember · lend (2026-07-15)

- **Switch back to your own account in one tap.** The signed-in account card gains a **Switch account** action, and the guest sign-in card now shows a **"Welcome back" chooser** — remembered prior sign-ins on this device (name/tier/email hints only, **never tokens**) as one-tap re-auth chips (email → pre-filled OTP; Google → one-tap). Returning to your account is now "tap your name + confirm," not "retype your email + wait." Privacy-first for a shared phone: a per-chip **×** and a **"Not you? Forget this device"** wipe the roster. See [`docs/SHARED_DEVICE.md`](docs/SHARED_DEVICE.md).
- **"Order for a friend" lend mode.** The signed-in card can hand the phone to a friend: it drops to a **clean 0-Star guest session** (the friend never touches your account) and raises a global **"Ordering for a friend"** ribbon with a **Done — back to [you]** one-tap return. Structurally closes the shared-device Stars-merge footgun.
- **Merge-safety hinge.** A K3b Stars-merge now fires **only** when a genuine guest saves _their own_ Stars into a pre-existing account (typed a taken email / used Google). An explicit **switch** (a remembered chip, or a lend-mode return) **suppresses** the merge — the current session's guest Stars are never swept onto the account you switch to. No schema change; server stays the sole authority on rewards/orders (hints are display-only and grant no access).

### Fixed — guest rewards clarity + hardened signed-in detection (2026-07-14)

- **The guest "Keep your rewards" card now names the stakes.** Seeing your device's Stars + a "save your Stars" pitch read as a contradiction (an anonymous guest session earns Stars, but they're bound to that device). The card now leads with the real count — "You've earned **N Stars** on this device — they live only here. … keep them for good; your past orders come with you" — so it's clear _why_ to attach an email/Google, not just _that_ you should.
- **Hardened the "signed-in" (upgraded) check** from `is_anonymous === false` to `!== true` across the rewards reads (`getRewardsState`/`getRewardsBadge`/`getRewardsProgress`/`getWelcomeBack`/`ensureProfile`). An anonymous session always carries `is_anonymous: true`, but a real account can surface it as `false` **or** omit it — and `undefined === false` would wrongly drop a signed-in diner back to the guest pitch. `!== true` treats anything not-explicitly-anonymous as the real account it is (belt-and-suspenders; not the cause of the current guest-sees-pitch behavior, which is by design).

### Fixed — UI/UX polish: keyboard-safe sheets, To-go dropdown, richer signed-in card (2026-07-14)

- **Bottom sheets ride above the on-screen keyboard.** A focused input in a bottom `Sheet` (e.g. the dine-in "join a table" party-code entry) was buried behind the mobile keyboard. Fixed in the shared `Sheet` primitive: it tracks the keyboard via the **VisualViewport API** and lifts itself by a `--kb-inset` — on **both iOS and Android** (both keep the layout viewport full-height on keyboard, so a `position:fixed` sheet would otherwise sit behind it), with the sheet's max-height subtracting the inset so its top never slips under the notch. Deliberately **not** the global `interactive-widget=resizes-content` (it would jump the fixed menu CartBar above the keyboard and reflow the `100dvh` staff login). Ref-counted across stacked sheets and thresholded (>120px) so the iOS URL-bar collapse doesn't false-lift. Benefits every sheet with an input.
- **The To-go door dropdown is smooth and no longer clipped.** The Now/Schedule disclosure animated only its `grid-template-rows` height (a layout animation that read steppy, and the last choice was cut tight against the collapse edge at `2px` bottom padding). Now the content also fades + slides in on a GPU opacity/transform layer (so the reveal is smooth even where the reflow steps), the choices get even breathing room (no clipping), and the caret rotation is synced to the panel — all with a `prefers-reduced-motion` off-switch.
- **The signed-in account card is a real identity card.** `AccountStatus` (shown on `/account` when signed in, replacing the "Save your Stars" pitch) now shows your **name + email** and a **tier standing chip** (tier-tinted, AA text, `✦ N Stars` at a glance) alongside the sign-out — where before it showed only a name. The full Stars ring + tier ladder stays the Rewards card below (the chip is a compact summary, not a duplicate).

### Docs — K6: the Journey II track closes (2026-07-14)

- **Self-scored re-score of the three door-paths** on the J-axes (`docs/JOURNEY2_PLAN.md`), the same honesty as the J6 close — against shipped code, by the author: **dine-in / pickup / grocery all ≈4.5**, up from the J6 close's ≈4.3 / 4.3 / 4.4. **J-B (progress clarity)** + **J-C (effort)** carried the doors/table/tray lift; **J-F (recognition)** took the biggest jump (the persistent wallet chip + the cross-device Stars merge); **J-A/J-G** recovered a real hole (grocery server-hydration + the session-gated tray never deep-linking to an unreadable tracker).
- **Door-keyed funnels re-pinned vs the J0 originals** — the K0 `door` property rides the existing `session_created` event (+ client `mode_selected`/`door_opened`), so each J0 funnel now **breaks down by door** with no new events. Verified in PostHog: `session_created` **carries `door`**, but it has **no non-null values in the taxonomy yet** — no diner has flowed through a wired door in this environment, so the before/after door-split comparison is **pending real traffic, not fabricated** (same posture as J0's "the funnels decide whether it's met in the room"). Rollout caveat documented: a bare sticker scan with no `?door=` mints `door: null` until every physical sticker carries a door param.
- **QA sweep** of every K-surface against `docs/context/QA-CHECKLIST.md` §A/§C — all closed in the per-phase pre-PR + pre-merge adversarial passes (#123–128); no new P0/P1. Recorded in `docs/REVIEW.md` (restoring the per-phase QA log for the J/K tracks) and `docs/HANDOFF.md` refreshed to "Journey II track closed."

### Added — K4: the orders tray — many live orders, one calm surface (2026-07-14)

- **The live-orders read** (`getMyLiveOrders`, `apps/qr/lib/orders.ts`): server-authoritative + uid-scoped (`earned_by` = the SSR-verified uid, anon or upgraded), service-role — a diner only ever sees their **own** in-flight orders. "Live" = status `paid` AND placed in the last 12h AND not terminal (`togo_status='picked_up'`) AND its **session is still open** (`table_sessions.expires_at > now()` + not closed). The session gate applies to **every kind**, not just dine-in: `/track`'s read is RLS-gated by `is_member(session_id)`, so an order past its ~4h session is unreadable there — surfacing it would deep-link to a tracker that never resolves, so the tray shows only what `/track` can actually open (this also gives dine-in, which has no pick-up signal, its terminal bound). `qr_orders` has no mode column, so **kind** is derived from the line `fulfillment` (+ `pickup_slot`). Cash-settled orders carry no `earned_by`, so they're invisible here — the same attribution rule as rewards, **stated in the tray**.
- **The header pill grows up:** with **0** live orders it's absent; with **≤1** it's the single pill as before (this device's own order with its instant realtime status word, else the lone server order — so a **cross-device** order still surfaces); with **≥2** it becomes a **count-badged button** that opens the **orders tray** — a bottom sheet (the shared Radix `Sheet`: focus-trap, Esc, scrim, swipe-to-close) with one row per in-flight order (mode glyph · table/slot/exit-pass context · honest status), each linking to its own `/track`. The tray "earns its ink only when it disambiguates."
- **No new realtime channels** (the plan's "one freshness rule"): the tray/badge are a `getMyLiveOrders` poll refetched on mount / `visibilitychange` / focus / when a new order is placed (the J3 pattern) — the collapsed single pill keeps its one existing channel.
- **/account "Today"** (`TodayOrders`): the same live read rendered as a section above order history (server-rendered, fresh on navigation), hidden when nothing's in flight.
- **One shared vocabulary** (`apps/qr/lib/live-order.ts`): the status words are `/track`-aligned (`Ready for pickup` · `Ready` · `Preparing` · `Order received` · grocery `Ready to go`) and the `/track` deep-link is built in one place, so the tray, the pill, and "Today" can never show a status or a link `/track` wouldn't. Token-pure rows (modeled on `.home-resume`); ≥44px targets; `role="list"`; decorative glyphs `aria-hidden`; the tray opener carries `aria-haspopup="dialog"` + a count-bearing accessible name; reduced-motion-safe.

### Added — K3b: your Stars follow you when you sign in (2026-07-14)

- **The merge** (`20260714000000_k3b_stars_merge`, applied to live + types regenerated): signing into a **pre-existing** account from a device that earned Stars anonymously used to **abandon** them (#113's copy said so, honestly). Now it **moves** them. While still anonymous, the two sign-into-existing paths (`email_exists` OTP recovery · `identity_already_exists` Google recovery) mint a single-use, ≥256-bit **merge token** (`mintMergeToken`) bound to the anon uid and stash it in `localStorage` — so it **survives the full-page Google PKCE redirect**. After sign-in, `/account`'s `MergeRedeemer` redeems it (`redeemMergeToken`) and the server re-stamps that anon uid's orders + coupons + favorites + feedback onto the signed-in account. The **upgrade-in-place** paths (`email_change` / `linkIdentity`, same uid) need no merge and mint nothing.
- **The coupon problem, solved without a watermark column — the coupon ROWS _are_ the watermark:** `mms_merge_anon_rewards` moves the anon uid's coupons and re-indexes them **contiguously above the target's max milestone index** (`max` offset — never a count · dense `row_number()` · **redeemed coupons move too**, as index-occupiers), so every already-earned milestone is OCCUPIED and `mms_reward_on_fulfill`'s `on conflict (user_id, milestone_index) do nothing` can **never re-mint a spent milestone**. The merge then mints the single legitimate **boundary** milestone the combined orders now justify (`floor(A)+floor(B) ≤ floor(A+B) ≤ +1` — exactly-once). **Proven with a BEGIN/ROLLBACK scenario test** against the live functions before shipping (boundary carry · redeemed-occupier survival · idempotent re-run).
- **The late-payment race (P0-1):** a Stripe payment that lands **after** the merge (its `earnerUid` was baked at intent-create) would have credited the orphan anon uid. A durable **`mms_identity_merges`** redirect — resolved at **both** webhook earn sites via the new `mms_earn_on_fulfill(order, earner)` RPC (replacing the 2-step `update()` + `mms_reward_on_fulfill()`) — makes the merge permanent for late orders. Identical to the old path when no merge exists (the coalesce falls through to the passed earner).
- **Hardened by a pre-build design critique:** source **must still be anonymous** + target **must be a real account** (a stale token can't strip a real account or merge into a guest — P0-2); one-merge-per-anon (the `mms_identity_merges` PK); token redeemed **merge-first, mark-redeemed-after** (the PK is the real single-use authority, so a transient failure **retries** instead of stranding Stars on a burned token). All three SECURITY DEFINER functions `revoke … from public/anon/authenticated` + `grant … to service_role`; both new tables RLS-locked, service-role only.
- **The merge beat** (`MergeRedeemer`): a one-shot celebration on `/account` when Stars actually moved — the **real** carried-over Star count (the DB merge's paid-Star total, never a fabricated number) in the Fraunces display face over a scrim + reused confetti, bilingual thank-you. Silent on a nothing-to-merge outcome. Mirrors `TierUpCelebration`'s a11y discipline (`role="status"`, focus moves to dismiss + restores on close, Escape/tap dismiss, confetti + card entrance gated on `shouldAnimate` + device tier with a reduced-motion off-switch). Honest copy: the email-taken / already-linked recovery microcopy now promises the move ("we'll move this device's Stars onto it") instead of the pre-K3b "signing in won't transfer your Stars."

### Added — K3a: rewards presence — held, not just earned (2026-07-13)

- **The persistent wallet chip** (`WalletChip` + `useRewardsBadge`): a signed-in diner now carries their standing with them — the **tier glyph + a tier tint + live Stars balance**, tapping through to /account — in the **menu header** (replacing the plain ✦-count affordance) and beside the **checkout "Your order" heading** (recognition at the pay moment). It renders **nothing for an anonymous diner** (they keep the quiet ✦-count + "Save" nudge — recognition, not a pitch). Balance is the server-derived `getRewardsBadge` value; a fetch failure just hides the chip; an anon→upgrade auth change flips it in live (no reload).
- **Tier tint, token-pure:** `--ruby` completes the tier-tint quad (`new`=`--ac` · `jade` · `ruby` · `gold`) in `tokens.css` (light + dark, with AA `-strong` text variants); `tierTint()` maps `tierId → {fill, text}` in `rewards-tiers.ts` — the single tier source, so there's no second color map to drift (unlike delivery's two-map hazard).
- **Quiet when signed in** (`AccountStatus`): an upgraded diner's /account now leads with an identity card (who you are + a **sign-out**) instead of the "Save your Stars" upgrade pitch, and the old plain "Signed in as …" footer note is gone. **Honest sign-out:** the QR app has no logged-out state, so signing out **re-mints a fresh anonymous session inline** (mirroring AnonAuthGate — `router.refresh()` alone would leave the app sessionless, since it doesn't re-run client effects) and drops to guest browsing — the Stars stay on the account, reachable on the next sign-in — and the two-tap confirm says exactly that, with focus following the step both ways (WCAG 2.4.3) and `busy` reset so a re-mint hiccup can't stick the button.
- **Honest post-pay copy:** `isUpgraded` now rides on `getRewardsProgress`, so PaySuccess claims "Reward unlocked — **saved to your account**" only when it's true (an anonymous diner sees "Reward unlocked!" — no false durability claim), and the GoodbyeBeat warms to "saved to your account" for a signed-in diner while keeping the softer "with your rewards" for anon.

### Added — K2: the table registry — dine-in has a real table, at last (2026-07-13)

- **The registry** (`20260713000000_k2_table_registry`, applied to live + types regenerated): `qr_tables` — `table_number` (PK, 1–99 CHECK) ↔ an opaque unguessable 8-char sticker `qr_code` ↔ `active`, seeded 1–10. **RLS-locked, service-role only** (verified: the anon role is `permission denied` — the tokens are session join keys, never exposed via the anon key). The sticker↔table mapping is DATA, so re-stickering is an `UPDATE`, not a deploy. Plus `table_sessions.table_number` (FK to the registry) and a **denormalized `qr_orders.table_number`** stamped at fulfillment.
- **The picker** (`/dine-in`, reached from the Dine-in door — the "can't scan the sticker" fallback; a scanned sticker still deep-links straight to the menu): an RSC reads the registry + **truth-at-read-time occupancy** via the service client and hands the client only `{number, occupied}` — **the token never touches the client**. A polished grid of 1–10 (editorial Fraunces numerals, open/seated states, a green "open" dot, dashed-border seated chips that keep text contrast, 44px+ targets, staggered entrance, reduced-motion-safe). **Open → claim & host; seated → enter the party's code** (the owner's decision: a stranger can't drop into a live cart from the picker — the physical sticker scan is the code-free path). Registry-read failure degrades to "scan your sticker / start without a number," never a dead-end.
- **The mint resolves by number, server-side** (`/api/session`): the picker routes by `?table=N`; the server looks up the table's registered token (the token never travels through the client), re-checks it's registered + active (the picker is advisory — a stale/forged number 400s), stamps the session's `table_number`, and returns it. A sticker scan (`?t=`) resolves its number from the token too. **Race guards:** a picker CLAIM that finds the table already active — or loses the insert race — refuses (409 "join with the party's code") instead of silently joining a stranger's live party. The `?table=` param is stripped on mount (a reload rejoins via the persisted token, never re-claims).
- **The number flows everywhere it was missing:** the arrival greeting ("Mingalaba, Min ✦ · Table 7"), the guest list ("Table 7 · Party of 3"), the invite sheet ("Table 7 code"), the settle beat, the **staff floor board** (real labels at last — sorted 1→10, an "unregistered" flag on a legacy/unmapped sticker so staff map it), the KDS + expo tickets the cook/expo call out, /track's receipt card, and the account order history (the table you sat at that night — durable off the denormalized snapshot, which survives the ~4h session TTL that the live `table_sessions` read can't). Unregistered/legacy stickers keep working (`table_number = null` — never brick one).

### Added — K1: three doors — the entry IA (2026-07-13)

- **The house has three honest doors now:** **Dine-in · To-go · Grocery** — the internal mode values (`dinein|scango|pickup`, a DB CHECK) do NOT migrate; presentation moves, plumbing stays. The entry is a designed moment, not a utility switch: three cards in the menu's own language (emoji tile, **bilingual EN/MY name** — `ဆိုင်တွင်စားရန်` / `ပါဆယ်ယူရန်` / `ကုန်စုံဝယ်ရန်`, `lang="my"` Padauk for correct SR pronunciation), one honest descriptor each.
- **To-go is one door with Now-or-scheduled decided INSIDE it** (`TogoDoor`), not by picking a different app mode. It's a **disclosure**: tapping opens it (`aria-expanded`, rotating caret) to reveal two nested choices — **Now** → the scango menu (today's counter-food flow: orders reach staff via the expo at pay) and **Schedule for later** → the pickup menu (real capacity-checked slots). The closed panel is `inert` + row-collapsed (not focusable / not announced / not hit-testable) while the `grid-template-rows` 0fr→1fr transition still animates the collapse; reduced-motion off-switch on the caret, panel, and choices. **Wiring decided by plan-critique recon:** an "ASAP slot" is unrepresentable in the money path (create-intent hard-400s a slotless pickup cart), so Now→scango carries zero money-path risk — exactly the "presentation moves, plumbing stays" promise.
- **Grocery is a first-class peer door** (no longer a border-separated afterthought), straight to its own scanner surface (K5).
- **"Scan & Go" retired diner-facing:** the menu eyebrow (`To-go`), the /track mode label (`To-go`), the grocery H1 (`Scan your basket`) **plus the grocery page's own loading + error strings** (`Starting grocery scanning…` / `Couldn't start grocery scanning`), and the site `metadata`/OpenGraph description (`dine-in, to-go, or grocery`) no longer carry the old brand name; staff surfaces (`FloorDetailLive`, `TableCard`) and code comments keep the internal `scango` vocabulary.
- **Adversarial review fold (1 MED, 1 LOW):** the MED caught the sweep's own miss — the grocery loading/error states still said "Scan & Go" on the very page whose H1 was renamed (the phase's "retired diner-facing" claim wasn't met until fixed); the LOW swept the site metadata description. The disclosure a11y (the highest-risk surface — closed-panel `inert`, focus-trap airtightness, tab-order removal) and the door-privacy trace verified clean.
- **K0 menu wiring (deferred from K5) lands:** `?door=` flows entry → `/menu` → `TableCartProvider` → `useTableSession` → the `session_created` mint, narrowed to the analytics enum server-side (an arbitrary query value never reaches the typed slot; door is analytics-only, never authz). The `TogoDoor` sends `door=togo` for both scango and pickup, so the three-door funnel stays distinguishable even where two doors share an internal mode; a code-join (`JoinTable`) carries `door=dinein`. Door-keyed funnel re-pin waits for K6.
- **Honest limit:** the doors use the established emoji-tile card language (elevated with the bilingual line), not photos — no door-photo assets exist, and a broken/generic stock image would be worse than a clean tile.

### Added — K5: grocery grown up — the list is the cart's truth (2026-07-13)

- **The live money-display bug is fixed.** /grocery's list was a local-only ledger: a refresh (or a backgrounded phone reclaiming the tab) showed "Nothing scanned yet" and hid the checkout CTA while the server cart still held — and would charge — the items, and re-scanning "lost" items doubled the server qty behind a UI showing 1. The page now renders the CART's grocery lines: hydrated from the server when the session lands and on every tab re-focus (the J3 freshness pattern), and reconciled from each scan's OWN response — `scanAdd` returns the fresh server view in the same round trip (the addItem pattern), so the list can never drift from what checkout will charge.
- **`getGroceryLines(cartId)`** (`lib/grocery.ts`): the member-gated read behind the hydration — cart lines (`fulfillment='grocery'`, voided excluded, `created_at` order) joined with the catalog's presentation fields (`ebt_eligible`, `image_url`). Zod-parsed like every sibling action; same `assertCartMember` gate as every cart read; read-only. **A failed query THROWS, never resolves `[]`** (the `searchGroceryItems` discipline) — a read failure posing as an empty basket would be the very bug this phase fixes, via the error path. Post-hydration failures are a commented deliberate swallow (keep the last-known list; the next scan/focus re-syncs); a PRE-hydration failure shows "Couldn't check your basket" with a real Retry — never a perpetual "checking…" with nothing in flight. In `scanAdd`, a post-write read failure returns `lines: null` (the write already committed — the scan must not fail, but null ≠ empty: the client keeps its list).
- **Product-grade rows:** photo (56px `BlurUpImage` on `grocery_items.image_url`, hidden when the catalog has none — and a server-side host guard nulls any non-allowlisted URL so a bad catalog entry can't crash `next/image`), name + EBT tag, `qty × unit` line, line total, and **qty steppers bound to CART-LINE ids through the existing `setQty` path** — no new money surface; qty 0 removes, matching the menu's rule. Steppers are 44px, `role="group"` with per-item aria-labels ("One more/less X", minus at qty 1 = "Remove X"), single-flight via `aria-disabled` + handler early-return (NOT `disabled`, which drops the button from the tab order and strands keyboard/SR focus on `<body>` every tap; a remove parks focus on the search input before the row unmounts), optimistic with a server reconcile after every write — a refused write (locked/settling/raced) snaps back to truth, and a refused write whose reconcile ALSO fails rolls back to the pre-flip snapshot (the optimistic view never outlives a write the server refused).
- **Out-of-order reads can't lie:** every server read (hydration sync, scan response, stepper reconcile) takes a monotonic ticket at issue time and applies only if nothing later-issued has applied — a visibilitychange sync issued on a waking radio that resolves AFTER a fresher scan can no longer clobber it (the invisible-vanish → re-scan-doubles path).
- **Honest empty state:** "Checking your basket…" until the first server read lands, then "Nothing scanned yet." — the page never claims an empty basket it hasn't verified, and a failed first check says so with a Retry.
- **K0 rides along:** `session_created` gains the analytics-only `door` property (`sessionMintInput.door` enum, never authz) — /grocery mints with `door: "grocery"`; an unclaimed door emits `null` (never a mode fallback — "scango" in the door vocabulary would pollute the K6 funnels); the menu-page wiring lands with the K1 doors.
- **Adversarial review fixes (1 HIGH, 4 MED, 4 LOW folded):** the HIGH was `readGroceryLines` swallowing query errors into `[]` — a transient DB error would have rendered "Nothing scanned yet." + hidden checkout CTA over a cart the server would still charge, reintroducing the bug through the error path; the MEDs were the stale-read overwrite (now the ticket guard), the missing optimistic rollback on double failure, the `disabled`-strands-focus trap, and the perpetual "checking…" on a failed first read.

### Added — Journey II plan (K0–K6): one house, three doors (2026-07-12)

- **`docs/JOURNEY2_PLAN.md`** — the sequel track, built from the owner's five structural findings after walking the shipped J-track: the mode IA is wrong (Scan & Go bundles counter food with the grocery scanner), dine-in has no real table identity, rewards are earned but not held, the app thinks about one active order at a time, and grocery is a stub next to the menu. Decisions locked with the owner (recommendation-led): **three doors** (Dine-in · To-go with ASAP-or-slot · Grocery — no mode migration; presentation moves, plumbing stays), **table registry** (`qr_tables` 1–10, sticker-mapped, honest-occupancy picker fallback), **rewards continuity — all three** (persistent wallet chip, stars merge on sign-in via a server-verified single-use merge token, quiet when signed in), **orders tray** (the pill becomes a live multi-order surface), plus grocery grown up to product-grade rows. Phases K0–K6, one PR each, same adversarial gates as the J-track.

### Added — J6: mode tempo — the Journey track closes (2026-07-12)

- **Grocery speed-run:** a GIANT running total (40px rolling figure readable at arm's length while the other hand scans — presentation of the same client-side sum the checkout CTA already carries; the charge is re-derived server-side at checkout, as everywhere) lands above the scanned lines.
- **The exit pass replaces false theater.** A pure grocery basket's /track used to show "In the kitchen · Cooking" — the `togo_status` initializer (a best-effort RPC in the webhook's `after()`) covers grocery lines, so the step rail lit for a jar of pickled tea nobody was cooking. Now: "✓ Paid — you're all set" with the big uuid-tail order code (the same short reference the account history prints) and "show this on your way out if asked". Mixed orders (grocery + to-go food) keep the rail — a bag really is being made. The tracker's single `role="status"` announces the honest paid state.
- **Pickup step audit — no cuts, on purpose.** The path is already at the theoretical floor + 1 (the slot sheet auto-opens once per mount, slot selection is one tap, two-step checkout is the money rule). The one further cut available — defaulting the slot to next-available — was rejected on honesty grounds: it silently commits a pickup time the diner didn't choose. Documented rather than built.
- **Dine-in rounds:** the table timeline now says "Next round's with the kitchen" when dishes fire after others were served — the plan's "if tables order in waves" condition answered per-table, live, by the real line states (no aggregate analytics required, nothing guessed).
- **Track close:** self-scored journey-axis "after" table in `docs/JOURNEY_PLAN.md` (dine-in 2.7 → ≈4.3, pickup 2.9 → ≈4.3, grocery 3.1 → ≈4.4), marked for what it is — the author's pre-launch score; the J0 funnels and live diners decide whether the bar is met in the room.

### Added — J5: recognition — visit N ≠ visit 1 (2026-07-12)

- **The track's one migration** (`20260712000000_j5_recognition`, applied to live + types regenerated): `qr_favorites` — uid-scoped menu hearts with RLS own-rows-only on all three verbs, `authenticated` grants only, a uuid FK to `menu_items` (grocery barcodes can never land here) and a row count naturally capped by PK+FK at catalog size; plus `qr_orders.arrived_at`, the J3-deferred "I'm here" enabler.
- **Welcome back** (`getWelcomeBack` → `ArrivalBeat`): an upgraded account is greeted by name ("Mingalaba, Min ✦"); a returning anonymous diner gets "Welcome back — N orders with us this month" only at N≥2, counted from PAID orders at the restaurant's clock — phrased as ORDERS, never "visits" (two orders in one sitting are two orders; the plan's "third visit" copy was an overclaim the data can't back). The dine-in party line always outranks the warmth line — coordination beats sentiment. First-timers see J2's greeting unchanged.
- **Favorites**: a heart on the item sheet (44px, `aria-pressed`, optimistic with revert — every read/write rides the caller's own RLS session, no service-role path exists) and a "Your favorites" rail that REPLACES the start-here band the moment ≥1 heart exists — a returning diner needs their own shortlist, not our guidance. In-stock items only; same rail vocabulary as J2 (one system).
- **Reorder "your usual"** (`reorderOrder`): earner-gated (`earned_by = uid`), cart-membership + lock/settle + rate-limit guarded, and built ENTIRELY on the add path's own primitives — `priceItem` re-derives every amount at today's menu (historical cents are never copied), `insertOrIncLine` is the same status-atomic write, `lineTax` the same tax rule. Vanished, sold-out, requires-choices, and grocery lines skip with per-item reasons. **Honest deltas:** history stores modifier NAMES, not option ids — a modified line returns as the base dish and says so ("came back without options — tap to re-choose"); every dish lands at qty 1 ("quantities start at one") because the status-atomic core is qty-1 by design and one stepper tap beats a new guarded write path on a money table. Surfaces: "Order this again" on /account order cards → `/menu?reorder=<id>` → the menu runs it once the session cart exists, announces the outcome through the provider's ONE live region (+ a dismissible visible note), and strips the param so back/refresh can't double-run.
- **"I'm here"** (deferred from J3, honored in this window): the /track ready card gains the button (pickup only — a scan&go diner is already in the room); `announceArrival` stamps `arrived_at` once (member-gated; idempotent in the SQL statement; a hostile client's whole write surface is one nullable timestamp); the expo board shows a "Here now" flag over the EXISTING floor realtime — no new channel, no `realtime.messages` policy.
- **`posthog.identify` decision: no.** Anonymous diners get no client↔server identity bridging without a real consent surface — the uid-keyed server funnels already measure the money path end-to-end, and the split client/server funnel view is an acceptable cost for not linking a device's browsing to an identity nobody consented to connect. Revisit only if an explicit consent banner ships. (A counts-only server-side `reorder_used` event lands for J-F evidence.)
- **Adversarial review fixes (2 MED, 6 LOW):** reorder outcomes are now per-reason honest — a required-choice dish says "needs a choice — tap it on the menu" instead of the false "isn't available today", a mid-loop cart close aborts with the truth instead of misreporting the remaining dishes, and a >30-line order discloses the cap (reads now deterministic); "Order this again" carries `mode=pickup` for slot orders so the slot picker stays in the flow (a bare /menu is scan&go — the bag would have fired immediately on payment); `announceArrival` asserts membership BEFORE the already-stamped success (killing an arrival-oracle for leaked order ids); reorder's guard failures return one generic string (no `AuthzError` internals in the UI); the migration + live DB now revoke the default-privilege ALL from `authenticated` before the narrow grant; focus parks on dismiss/confirm unmounts (reorder note → menu heading, "I'm here" → ready card); the favorites rail renders the Burmese name like the band it replaces; the heart rides the same mutation rate guard as every other diner write.

### Added — J4: settle & goodbye — the peak-end completion (2026-07-11)

- **Goodbye beat** (`GoodbyeBeat`) on `/track`, fresh payments only: after R7a's success spike, the flow now ENDS somewhere — a bilingual farewell (ကျေးဇူးတင်ပါတယ် Kyay-zu tin ba de — see you next time, real `lang="my"` Padauk content) plus one rewards door for every payer. For the order's EARNER, the account hub's own `StarsRing` mounts drawn to the post-order milestone cycle — `getRewardsProgress` orders the summary read after attribution, so the arc the diner watches fill already includes this order's Star (the Star visibly arrives into the ring; nothing animated that isn't true) — plus "your Star and this receipt are with your rewards" (deliberately NOT "saved to your account": an anonymous diner's Stars are device-bound until they upgrade, and /account's own upgrade card exists to offer exactly that durability). Ambient, not a live region (the tracker's single `role="status"` already announced the payment).
- **The whole exit arc runs on one honest clock — food in hand, not money moved.** The goodbye and the review ask land when nothing to-go is FOOD (pure dine-in — already eaten at the table; pure grocery — the basket's in hand at payment) or at the expo's picked-up tap. The clock is keyed on the order's LINES, not `togo_status`: the status can't tell a grocery basket from a bag being made (the fulfillment trigger sets it for grocery too), and it initializes in the webhook's `after()` block — briefly null on a fresh bag order — so gating on it would flash (or, on a stale-response race, pin) a premature goodbye mid-wait. `useOrderStatus` now reads line fulfillments (`hasTogoFood`), which are immutable and race-immune. A pickup diner mid-wait gets neither a premature "see you next time" nor a review ask for a meal they haven't held — both rise (realtime) the moment the bag is handed over, which IS the visit's end.
- **The receipt tucks into your account — the third J1 shared cut** (`.vt-receipt`): on track→account, the /track receipt card morphs into the account's "Your orders" card — the receipt visibly files itself into the diner's history. Gated to the earner on a fresh payment so the metaphor is never a false promise (a split share-payer's history won't contain this order; they get no morph, no claim). On fresh-payment mounts the tracker's bottom "View your rewards" link yields to the beat's door — one clear entry, decided once at mount (never a link that vanishes underfoot when the progress poll resolves).
- **Group settle end-beat** (`SettlementBoard`): when the last share captures, the whole table now sees "Everyone's paid 🎉 — ကျေးဇူးတင်ပါတယ်" together for a ~1.6s breath before everyone is moved to the shared receipt — announced once through the settle view's single status region, and nothing overwrites it mid-breath (neither a losing in-flight host abort nor the last payer's own share-flip message, whose flip can be observed in the same load as the table completing); the progress line/bar step aside, the host's now-impossible "Cancel split" hides (a dead affordance is not an option), and if focus fell with the unmounted controls it parks on the beat (WCAG 2.4.3). If a diner navigates away during the breath, the pending redirect dies with the board (no later yank).
- **Review ask re-timed, not rebuilt:** M4's `FeedbackPrompt` (already ungated + one-per-order — compliance holds) rides the food-in-hand clock above; DOM order places the ask after the goodbye beat.
- **Honest deltas from the plan:** the tuck lands on the "Your orders" history card, not the header account icon — the J1 grammar gives chrome its own stable view-transition name precisely so it never re-animates, and morphing page content INTO the header would break the one-camera-move rule. PaySuccess's verbatim v7.2 headline is untouched — the group moment lives on the settlement board, where the table actually sees it together. The earner's ring renders only from a sane summary snapshot (a transient RPC failure inside the progress read could pin stars:0 — no ring beats a wrong ring).

### Added — J3: the wait, designed (2026-07-11)

- **Table timeline** (`TableTimeline` — `TimelineStrip` + `MenuTimeline`): a slim ambient strip on the menu header and the checkout review step narrating the kitchen's REAL taps — `fired → in_progress → served` are literally KdsBoard's Start/Ready buttons, so "Mohinga is being made" is the kitchen's own word, never a guess or a fabricated ETA. Plate-count line ("2 with the kitchen · 3 cooking · 3 served", qty-weighted), a dessert/tea invitation when everything's served, and a quiet "ready to settle up?" pointer once the table's been idle ~20 min post-serve (client-observed serve time — the schema stores no `served_at`; the copy stays "when you're ready", never presumptuous). The strip is deliberately **not** a live region: the one-live-region-per-view rule holds (kitchen flips are glanceable ambient state, the same discipline as the never-announced CartBar total).
- **Poor-wifi freshness backstop:** restaurant interiors drop realtime — both cart surfaces now refetch on `visibilitychange` (`TableCartProvider` for the menu mount, `Checkout` for the review-step mount, which also covers pickup carts that have no realtime at all), so a phone that slept through a websocket drop shows the kitchen's current state the moment it wakes (stronger than the planned "reconnecting" label: the strip is never staler than the last foreground).
- **Honest pickup countdown** on `/track`: the slot line gains "in ~N min" (30s tick, shown only within 90 min of the slot) and "any minute now" at the slot — derived purely from the diner's own chosen slot time, dropped entirely once the kitchen marks the order ready/picked-up (the kitchen's word outranks the clock; no fabricated prep ETA) and dropped again ~15 min past an un-actioned slot (an eternal "any minute now" is a claim the app can't keep).
- **Deferred (honest):** the pickup _I'm here_ ping — the "floor channel" is postgres_changes (read-only per-subscriber RLS), not a broadcast channel a diner may publish to; doing it right needs a `realtime.messages` staff policy or an orders column, i.e. J5's migration window (this track's one migration).
- **Adversarial review fixes (1 HIGH, 2 MED):** the settle nudge's "order" link now carries the server-issued `?cart=` id (a bare `/cart` renders the not-available placeholder — the nudge's one action was a dead end) and falls back to linkless copy when no id exists; the checkout dessert line's menu link now carries the session `mode` (a bare `/menu` defaults to scan-&-go and would strand a dine-in diner's dessert order in a phantom per-device cart); the `Checkout` visibility refetch above was itself a review finding (the strip's freshness claim only held for the menu mount). Also from review: invitations go quiet on a locked/settling cart (the menu can't accept an add and the bill is already in motion), and the checkout strip reads the optimistic view so a "Make it now" tap and the narration agree instantly.

### Added — J2: arrival beat + guided start (2026-07-11)

- **Arrival beat** (`ArrivalBeat`) — the first branded moment after the scan: a bilingual greeting (မင်္ဂလာပါ Mingalaba ✦, real `lang="my"` content in the Padauk face, not decoration) + one mode-aware place-setting line. Dine-in party copy comes from **live presence** ("3 of you at the table — order together, settle together") — never a fabricated table number (sessions carry no human table label). The once-per-session beat composes with J1's `SurfaceMemory` for free: it premieres on the session's first menu visit and lands settled on revisits.
- **"Start here" band** (`StartHereBand`) — the guided opening for first-timers: a horizontal rail of the top-6 dishes tables actually love, each card opening the same item sheet as a menu row. Hidden the moment the diner is _finding_ (search text or a diet filter active). Curation is real data first, honest fallback to `popular`-tagged items while order history is thin.
- **"Table favorite" badge — the `popular` tag goes data-backed.** `lib/menu/mostLoved.ts` is a counts-only, service-role aggregate over PAID orders (60-day window, ≥2 distinct orders so one party's bulk order can't crown a dish, uuid-only ids so grocery barcode lines are excluded, cached 1h, resolves `[]` on any failure so it can never take the menu down — and no uid/order-id/amount ever leaves the module). When real counts crown an item, "Table favorite" supersedes the hand-set `popular` tag — the truer claim wins, which is `badges.ts`'s founding never-fabricate rule. Menu row and item sheet stay in agreement.

### Added — J1: continuity engine — the route-change grammar (2026-07-11)

- **Route changes are choreographed, not cut.** Client navigation now rides the View Transitions API via `next-view-transitions` (~2KB; works on stable React — Next's native flag needs a React canary, disqualified for a money app; non-supporting browsers keep the instant cut). The grammar: **forward** (deeper into the journey — home→menu→cart→track by depth map) drifts the page in from the right (16px + fade, 240ms), **back** from the left (browser back too, via popstate), lateral cross-fades. The `AppHeader` carries its own `view-transition-name`, so the wayfinding chrome stays put while the page moves under it — one camera move.
- **Two shared-element cuts:** the CartBar subtotal **morphs into the checkout hero total** on menu→cart (the money you're watching never blinks out of existence), and the header order pill **morphs into `/track`'s status chip** (the status you tapped lands as the status you're watching). Names are provably unique per document (CartBar is menu-only; the pill hides on /track; only the review-step total carries the name).
- **Staggers premiere once per session per surface** (`SurfaceMemory` + sessionStorage): returning to the menu mid-meal is turning back to your table, not a re-premiere. Zeroed duration lands content settled — the reduced-motion presentation, nothing hidden.
- **Honest cut revisions:** the planned checkout→track receipt cut is a Stripe full-page redirect (no client transition exists) — replaced by the order-pill cut; the menu item→sheet morph is deferred to J2 because the sheet's existing framer slide-up/swipe-to-close would double-animate against a view transition. Reduced motion: a CSS-level off-switch snaps every transition group (the JS gates can't cover a library-started transition).
- Verified end-to-end: Playwright smoke over localhost (direction stamps `forward`/`back` correctly; stagger memory premiere→quiet across revisits; no new console errors) and the J1 keyframes/classes confirmed present in the **built** CSS.
- **Adversarial review fixes (3 MED):** the `/track` "Refresh" + `/cart` "Reload the split" self-refresh links now `replace` instead of push — a duplicate same-pathname history entry would hang the transition library's popstate handler ~4s on the next browser-back (a stranded recovery path); dynamic mid-session mounts (a newly-scanned grocery line, a guest joining) moved to a new **`.mms-rise`** class so `SurfaceMemory`'s once-per-session gate never kills a landing animation on a revisited surface; the grocery "Check out" push and `JoinTable`'s home→menu push now ride the journey grammar (they'd bypassed it — an asymmetric animated-back/instant-forward).

### Added — J0: journey measurement spine (rubric axes + funnels + baseline) (2026-07-11)

- **`docs/context/RUBRIC.md`** — seven **journey axes** (J-A continuity · J-B progress · J-C effort · J-D emotional arc · J-E dead-time · J-F recognition · J-G recovery), scored per _path_ at the same ≥4.3 bar, plus the honest baseline: dine-in **2.7**, pickup **2.9**, grocery **3.1** — recovery is already world-class (the hardening paid off), continuity/arc/dead-time/recognition are the gap, exactly what J1–J5 attack.
- **PostHog "J0 · Journey baseline" dashboard** (pinned) — four server-side, uid-joined funnels starting at the true scan moment (`session_created` carries `mode` + the diner uid): dine-in scan→add→send→paid, pickup and grocery scan→add→paid, and the headline **time-to-first-add** (median, time-to-convert). Every J-phase PR reports before/after against these. Known limit documented: client events (cookieless anon id) can't join server funnels; the `identify` bridge is a consent-posture decision deferred to J5.
- Visual walkthrough reel deferred: the cloud sandbox's Chromium has no browser egress to the preview — capture locally before J1 merges (noted in `JOURNEY_PLAN.md`).

### Added — Journey track plan (J0–J6): paths over screens (2026-07-10)

- **`docs/JOURNEY_PLAN.md`** — the layer above the (shipped) Richness/World-Class screen work: a diagnosis of why the app still feels assembled rather than choreographed (hard cuts between routes, undesigned arrival/wait/goodbye, catalog-not-guided deciding, no return-visit memory; root cause — the rubric scores screens, not paths), a six-moment journey frame per mode (arrive · decide · commit · wait · settle · return), and seven phased PRs: **J0** journey rubric + PostHog funnels + walkthrough baseline → **J1** continuity engine (directional route transitions + shared-element continuity) → **J2** arrival beat + guided start → **J3** the wait designed from real line states → **J4** settle & goodbye (peak-end) → **J5** recognition (welcome-back · server-re-priced reorder · favorites) → **J6** mode tempo. `ROADMAP.md` gains the 🧭 Journey track section.

### Fixed — Account sign-in recovery for an existing email + past-orders card overflow (2026-07-10)

- **"A user with this email address has already been registered" is no longer a dead end.** When the diner enters an email that already belongs to another Morning Star account, `updateUser` 422s `email_exists` — previously surfaced as a raw error with no way forward. `AccountUpgrade` now detects that (by error code, message fallback) and pivots to a **sign-in recovery** (mirroring the existing Google `identity_already_exists` path): the button becomes **"Send sign-in code"**, which `signInWithOtp({ shouldCreateUser: false })`s the existing account and verifies with OTP type `email` (vs the `email_change` upgrade). Copy stays honest — signing in switches to that account and won't transfer this device's unsaved Stars; editing the email clears the recovery to retry the normal upgrade. Announced through the card's single existing `role="status"` region (no second live region).
- **Past-orders receipt cards no longer overflow on mobile.** The month `<ul>` and the `.history-summary` used implicit `auto` grid columns, so a long nowrap order-summary line sized the receipt card to its max-content (~462px) and blew the account column past the viewport (~117px horizontal overflow at 390px). Both grids now use `grid-template-columns: minmax(0, 1fr)`, so the column shrinks and the summary ellipsizes as intended (verified via a rendered harness: overflow 117px → 0, card 462px → fits).

The menu Add/stepper still felt laggy vs the delivery app: a decrement showed no feedback until the write returned, the whole stepper went **disabled** mid-write (rapid taps blocked), and `setQty` cost **two** server round-trips. All fixed UI-side — pricing stays server-authoritative (the client never re-prices; only the display count is optimistic, never the money total).

- **One round-trip writes.** `setQty` now returns the fresh server-authoritative view (mirroring `addItem`), so `TableCartProvider.setItemQty` applies it directly instead of a second `getCartView` refresh — halving the decrement/remove latency.
- **Instant, race-safe stepper.** The `-`/`+` now update the digit the instant they're tapped (an optimistic delta on **both** directions, not just add) and no longer disable during the in-flight write, so rapid taps stay live. Writes serialize through a per-button queue that threads each op's returned view to the next, so serialized `-` taps each peel a real, still-present line (no stale-read snap-back). The hard freeze (`locked`/`settling`/no-session) still disables the control — only the transient `busy` freeze is gone.
- **Instant cart count both ways.** The provider's optimistic count went from add-only (`pendingAdds`) to a signed `pendingDelta`, so the `CartBar` count drops immediately on a remove too (clamped ≥ 0), reconciling to server truth as the view returns. The subtotal stays server-derived on purpose — a wrong-for-a-moment amount on a money surface is worse than a beat of latency.
- Checkout's own optimistic layer (`applyOptimistic`/`qtyChain`) is untouched; the `setQty` return value is additive, so its `await setQtyAction(...)` call is unaffected.

### Fixed / Added — Rewards reflects sign-in + world-class past orders (2026-07-09)

- **Rewards now updates on sign-in.** The header rewards badge fetched once on `[hidden, orderKey]` and never re-ran on an auth change — and `router.refresh()` re-runs only Server Components, not a client effect — so the "Save your Stars" nudge + Star count stayed stale after an anon→account upgrade until a full reload. The header now subscribes to `supabase.auth.onAuthStateChange` (`SIGNED_IN`/`USER_UPDATED`/`TOKEN_REFRESHED`) and refetches, and also refetches on route change (the webhook may stamp a Star after the diner leaves `/track`). Fixed the Google path's missing refresh too: `AccountUpgrade` now `router.refresh()`es once the OAuth PKCE exchange confirms a real account (`is_anonymous === false`), so `/account`'s RewardsHub isn't stale on the Google return either.
- **Past orders → expandable receipts.** Rewrote `OrderHistory` (still a server component — native `<details>` for free disclosure a11y): orders are grouped by month, each an expandable receipt showing per-line qty · name · modifiers · price and the full server-derived breakdown (subtotal / discount / service / tax / tip / total), plus a `#ref` from the order id and a To-go/Grocery chip. Widened `getOrderHistory`'s `SELECT` (**zero migration** — every column already existed) and added a real "No orders yet → Browse the menu" empty state (the section no longer hides for new diners). Dates/months render in the restaurant's timezone so an evening order never drifts to the next day. Totals are presentation-only (rendered verbatim, never recomputed).

### Added — Wayfinding follow-ups: cart-from-anywhere + live split-tender pill (2026-07-09)

Closes the two v1 boundaries noted when the wayfinding header shipped. Client-nav + a read-only resolver only — no money/auth/RLS/order logic touched.

- **Cart-from-anywhere** — a tiny `CartPublisher` mounted in the menu publishes `TableCartProvider`'s server-minted open-cart id to the wayfinding store (`publishCart`), so the header's off-menu "back to cart" link now works after _any_ menu session, not just after a `/cart` visit. The stored cart id is cleared once an order is captured (it became a placed order).
- **Live split-tender status** — a thin member-gated `resolveSplitOrderId` server action (wrapping the `server-only` `getSplitOrderId`) lets the header pill + homepage resume card resolve a split-tender order's id (which has no PaymentIntent) and show its **live** status ("Confirming → Preparing → Ready") instead of a generic label. Extracted a shared `useActiveOrderStatus` hook (store read + split resolve + `useOrderStatus` + terminal-state retire); its `track` gate also collapses the header/card/tracker to **one realtime channel per route** (retiring the earlier duplicate-subscription nit).

### Added — Persistent wayfinding header + active-order resume + cold-load session fix (2026-07-09)

QR screens were islands connected by ad-hoc links that nearly all pointed one way (→ menu): `/account` was reachable from a single place (the post-payment tracker), `/track` only via the Stripe redirect (close the tab and the order was gone), and there was no persistent chrome. Adds the diner's wayfinding spine. Client-nav + presentation only — no money/auth/RLS/order logic touched; tokens only, no blur/backdrop-filter (mobile GPU budget), ≥44px targets, one live region per view, reduced-motion-gated, light + Night.

- **`AppHeader`** — a slim sticky top bar in the root layout (self-hides on `/staff`): brand→home · a contextual **"Your order · [status]"** pill→`/track` · a **rewards** affordance (✦ Star count + an anon **"Save your rewards"** nudge)→`/account` · an off-menu **"back to cart"** link. Cart is a link, not a live counter (the menu's bottom `CartBar` stays the single source of truth there); the order pill is deliberately not a live region (no double-announce with `/track`).
- **`ActiveOrderProvider`** — a small root-layout client store (React Context) that observes the URL for `mode`/`cart` and captures the live order at the `/track` success landing, persisting to `localStorage`; a 4h TTL retires a resumable order (a pure dine-in order has no `picked_up` done-signal). Live status via `useOrderStatus`; split-tender resumes via `/track?cart=…&paid=1`.
- **`HomeResumeCard`** — the homepage leads with a way back to a live order's tracker.
- **`getRewardsBadge`** — a lean uid-scoped read (Stars + tier + `isUpgraded`) for the header, mirroring `getRewardsProgress`.
- **Cold-load session fix** — `AnonAuthGate` now `router.refresh()`es after a _fresh_ anonymous mint, so a deep-link straight to `/account` re-renders with the session instead of flashing the "couldn't load your rewards" fallback.
- **`--header-height` token** — the menu's sticky `.menu-toolbar` offsets below the header (no double-count of `env(safe-area-inset-top)`).

### Changed — Account, sign-in, order-status & past-orders world-class pass (2026-07-08)

Extends the checkout craft language (paper-sheen lip · accent lift · gold warmth · textured slips · quiet-nav vocabulary) to the account/rewards hub, the anon→account sign-in card, the `/track` order-status states, and post-order navigation — so the surfaces a diner reaches _after_ ordering match the checkout bar. Presentation only — auth/rewards/order logic untouched; token-pure (only the sanctioned Google brand mark uses literal color), no blur/backdrop-filter (mobile GPU budget), 60fps, every animation reduced-motion-gated.

- **Account masthead** — an editorial `✦ Mandalay Morning Star` kicker + "Rewards & account" display title + a gold hairline that fades to nothing, above the (already-rich) reward cards; a quiet "← Back to menu" nav-link closes the page.
- **Sign-in card** — primary buttons adopt the `.checkout-cta` gold-warmed clay gradient (+ sheen lip + one-sweep shine); a branded **Continue with Google** button carries the official Google "G" (matching `StaffLogin`); inputs become calm inset fields that bloom an accent focus border; a labeled fading-hairline divider separates the paths; the card is textured.
- **Past orders** — each order is now a lifted "receipt" slip (top-lit fill + sheen lip + hover deepen) with a tender **badge** pill (`✓ Paid · Card`), tabular totals.
- **Rewards wallet** — earned-reward coupons become **gold-wash tickets** with a punched notch on each edge; the lifetime-spend stat gains a sheen lip + faint gold warmth.
- **Order status (`/track`)** — the static confirmation states (payment received · processing · unsuccessful · direct-visit stub) are now elevated textured panels headed by an icon **medallion** (a warm caution medallion for the failure state), instead of naked text; the live tracker's footer + all "back / view rewards / refresh" links adopt the shared **quiet nav-link** vocabulary (accent, ≥44px, underline-wipe + arrow nudge).

### Fixed — Account upgrade: graceful `identity_already_exists` on Google link (2026-07-08)

When a diner tapped "Continue with Google" on `/account` and picked a Google account **already linked to a different Morning Star account**, `supa.auth.linkIdentity` bounced back to `/account?error_code=identity_already_exists…` with a `422` on `/auth/v1/user` — and nothing read that callback error, so the diner saw a raw error URL and a dead end. `AccountUpgrade` now reads the error from the query (via `useSearchParams`, derived — not a `setState`-in-effect), shows an honest message, cleans the URL (`replaceState`), and switches the Google button to a **sign-in recovery** (`signInWithOAuth`) so they reach their existing account and its saved rewards instead of re-attempting a link that would fail the same way.

### Changed — Checkout-surface cohesion: line cards, receipt, promo/reward, split board (2026-07-08)

Extends the #105 pill/sheen/lift/glow craft language across the rest of the checkout surface. Presentation only — money/lifecycle logic untouched; token-pure, no blur/backdrop-filter (mobile GPU budget), 60fps, reduced-motion-gated.

- **Line-item cards** — a soft shadow-_deepen_ on hover (no translate, so the stepper + destination pills never slide under the cursor); the per-line price now **rolls** (`NumberFlow`) as the optimistic qty changes.
- **Receipt slip** — a dotted **leader** runs from each breakdown label to its amount (the iconic receipt cue), drawn by a decorative flex spacer between `<dt>`/`<dd>`.
- **Promo + reward** — the promo input blooms an accent border on focus (keeps the global focus ring); **Apply** becomes an accent pill; the reward affordances gain hover-lift, and the **reward-applied** row is a warm gold-wash pill with a one-sweep shimmer.
- **Split** — the Evenly/By-person toggle reuses the `.checkout-pill` segmented language; "Split & pay separately" is an accent pill.
- **Settlement board** — a live **progress bar** (gold→clay) fills as shares are authorized (real `paid/total` values); settled share rows get a warm accent left-edge; the "Paid" badge gains a gold halo.

### Fixed — Checkout `create-intent` 409 (cart-lock acquire 42703 on PostgREST 14) (2026-07-08)

`POST /api/stripe/create-intent` returned **409 (Conflict)** on every attempt — checkout was fully broken
in production. Root cause: `acquireCartLock` / `acquireSettlement` (`apps/qr/lib/lock.ts`) built the atomic
conditional UPDATE with `.select("id")`, which sends `Prefer: return=representation`; under PostgREST 14
(Supabase's recent platform upgrade) a mutation with that header re-applies the top-level `or()` logic-tree
against the `RETURNING` projection, so `qr_carts.locked` fell out of scope and the UPDATE 400'd with `42703`
(undefined_column). Both functions swallowed the error, read 0 rows, and returned `held_by_other` /
`settling_other` → a spurious 409. Fixed by counting affected rows via `{ count: "exact" }` (no
representation) and surfacing the error (honest 500) instead of masquerading a query failure as a lock
conflict. Verified against live PostgREST. Pure code change — no schema migration.

### Changed — Checkout: organized pill actions + optimistic cart selections (2026-07-08)

- **Action hierarchy** — the four competing full-width buttons (Send to kitchen · Continue to payment · Keep tab open · Secure your tab) become **one hero pay CTA** with the tab options demoted into a labeled **“or settle later” pill tray** (Keep tab open · Secure your tab). Send-to-kitchen stays a distinct pre-pay action by the food. Clear primary-vs-secondary hierarchy.
- **Pill vocabulary** — a shared `.checkout-pill` system (full-radius, textured, press-settle, accent glow, reduced-motion-safe): per-line **For here / To go** is a segmented pill toggle, **Make it now** an accent-outline action pill, and the settle-later tray pills reuse the same language. `SecureTabButton` gains a `compact` tray-pill mode whose card form expands full-width below the row.
- **Optimistic cart selections** — qty stepper, For-here/To-go re-route, and Make-it-now now reflect **instantly** (React 19 `useOptimistic` overlay) instead of waiting on a server round-trip + `refresh()`; the server action reconciles underneath and corrects a refused edit. Money stays server-authoritative — only per-line qty/destination/state flip optimistically; the totals receipt reconciles on refresh.
- **World-class craft pass** — layered pill surfaces (paper sheen lip + top-lit fill), a lit lifted selected cap with a warm gold **halo** glow (fill stays clay so `--oa` cream text holds AA — no gold-under-text trap), hover-lift + press-settle micro-interactions, a **recessed tray** with a fading-hairline divider, and a premium primary CTA (`--ac`→`--ac-strong` depth gradient, a one-sweep diagonal shine, a nudging arrow) shared by both _Continue to payment_ and _Pay_. Transform/opacity/box-shadow/gradient only — no blur/backdrop-filter (mobile GPU budget) — 60fps, every animation reduced-motion-gated.

### Changed — World-class UX: the full craft pass (menu · cart · checkout · track · grocery · staff · rewards · split) (2026-07-02)

The whole app taken through the world-class bar (`docs/WORLD_CLASS_UX_PLAN.md`), each slice gated +
adversarially reviewed (verdicts on PR #104). Presentation-only throughout — money/lifecycle logic untouched.

- **Layering system** — a z-index **token scale** (`--z-toolbar < --z-scrim < --z-sheet < --z-toast <
--z-alert/confetti < --z-tierup`) replaces scattered hardcodes; sheets paint **above** the sticky menu
  toolbar (root-fixes drag-to-close being stolen); one `--scrim` token both themes (tier-up no longer a light
  wash on Night); sheets get an inset `--sheen` paper lip; toolbar gains a hairline + shadow.
- **Snappy** — optimistic add-to-cart (instant Add→stepper morph; staff add "Added ✓" likewise), `/cart`
  prefetched from CartBar + grocery, `loading.tsx` skeletons for cart / account / staff floor / table
  drill-down / all four consoles, bump/approve buttons hold their pending state through the refetch.
- **Flowing** — item-sheet upsell swap scrolls to the new item's hero + moves focus; `/track`'s rail fill
  flows down as the order advances; scanned grocery lines + settlement shares + order history + guest
  avatars rise in (`.mms-stagger`, keyed — no re-animation); active menu tab centers in its rail + lifts
  (`--sh-lift`, unclipped).
- **Textured layers everywhere** — checkout receipt + `/track` paid summary + drill-down/staff-add/KDS
  cards + settlement rows + rewards hero/tier + invite code card all on `.card-textured`.
- **Focus seams closed (WCAG 2.4.3)** — checkout view changes (incl. the realtime settling flip),
  reward apply/remove, account-upgrade steps, feedback submit, staff drill-down void/comp/approval swaps
  (edge-triggered catch-all), console bump-offs, refund success; feedback stars are honest `aria-pressed`
  toggles (were arrow-key-less fake radios); redundant `aria-live` on `role="status"` swept app-wide.
- **Pickup date picker** redesigned: day-selector cards + a responsive time grid (was a flat chip stack).
- **Reachability** — `/account` (the rewards hub) gains its first diner-facing link, on `/track`.

### Added — World-class UX: homepage proof + type-scale + wordmark identity (2026-07-02)

First slice of the world-class UX initiative (`docs/WORLD_CLASS_UX_PLAN.md`) — elevate the editorial/Night
language, starting with the flagship entry screen as a proof-of-direction.

- **Type-scale tokens** (`@mms/ui/tokens.css`, additive) — `--fs-display/-h1/-h2/-h3/-body/-sm/-xs`,
  `--lh-*`, `--track-*`, `--w-content`, `--s10/--s15`. Retires inline magic font-sizes. Contrast-audit
  (41 tests) unaffected — no color token changed.
- **Wordmark identity** — the homepage hero replaces the **☕ emoji** with the **✦ Morning Star mark**
  (brand gold, reframed inside the existing glow + draw-on ring + parallax) and renders **"Mandalay Morning
  Star"** as a real Fraunces **display wordmark** (was a tiny uppercase eyebrow). Strings verbatim.
- **First brand assets** — `apps/qr/public/icon.svg` (the ✦ mark) wired as the favicon + OG metadata
  (QR had no `public/` before).
- **Grid discipline** — homepage spacing now all `--s*` tokens (was `60/24/22/13/20/16/440` magic numbers);
  `text-wrap: balance` on the wordmark (no widows).
- **`themeColor` fix** — `#fffaf2/#0f1115` → the real `--pg` values `#faf9f5/#171221` (killed the Night
  status-bar seam; audit U-Q5).

### Fixed — Holistic audit: money/security remediation (2026-07-02)

Cross-repo adversarial audit (`docs/HOLISTIC_IMPROVEMENT_PLAN.md`). The QR-side confirmed fixes:

- **Merge re-charged voided/comped lines (HIGH regression).** `mms_merge_table_orders` lost its S2.3 void/comp
  fold guards when `20260623030000` restated the body (later rebased by R5c `20260629120000`) — a table merge
  folded a voided/comped source line's qty into an active target, re-charging diners for a $0'd line.
  `20260702000000` restates the fn as the **union** of every prior guard (source `state <> 'voided' and not
comped`, target same-state + void filter + `by_seat is null`, both-sessions-active, S5 approvals-supersede)
  - the S3 secure-tab refusal + trust carry-forward. Signature unchanged → no types drift.
- **Split-payer double-charge race (HIGH).** `create-share-intent` overwrote the share row with `.eq("id")`
  only, so a concurrent capture webhook between the status read and the write was reverted to `pending`
  (orphan capture + pay-twice). The update now guards `.in("status",[pending,failed,canceled])` + optimistic
  PI-id match, `.select("id")` to detect 0 rows → cancel the new PI + 409.
- **Fire-at-checkout backstop never covered card/split (HIGH).** `mms_reconcile_settled_fulfillment` scans
  `cart_id is not null`, but only the cash fulfill stamped it. `20260702000100` stamps `cart_id` in the card +
  split `qr_orders` inserts (partial-unique is cash-scoped; card is PI-idempotent → one insert) so the pg_cron
  backstop fires their draft food / inits togo / snapshots EBT.
- **Grocery insert PUBLIC EXECUTE (LOW, latent).** `20260702000200` adds the missing `revoke … from public`
  on `mms_cart_item_insert_if_open` (LEARNINGS #58; RLS denies today).

⚠️ The three migrations need live-apply + advisor check + a money-path smoke before merge.

### Added — Richness R9b: homepage hero (maximal) (2026-07-01)

The "morning coffee" signature moment behind the mode picker — the final Richness slice.

- **`HomeHero`** (new) — ☕ glyph over a radial-gradient glow (no blur), a draw-on SVG ring, rising
  `.mms-steam` wisps (`useInView`-paused offscreen), and **multi-layer pointer/gyro parallax**
  (`useHeroParallax`: glyph leads, glow/ring trail) — **device-tier-gated** (zeroed on `low`) + reduced-motion
  gated. Staggered header lines. All decorative layers `aria-hidden`; heading/copy stay the accessible content.
- **Homepage** (`app/page.tsx`) — a fixed masked dot-texture backdrop (`.home-bg`, no blur) behind the
  transparent `<main>`; the ModeCard stagger finished (grocery `index={4}`).
- **`globals.css`** — R9b `.home-hero*` / `.home-bg` + `homeHeroRingDraw`; radial-gradient/stroke/transform
  only, ring draw-on reduced-motion-gated.

### Added — Richness R9a: staff-board live-notice (2026-07-01)

Brings **full-but-informative** richness to the staff boards (owner overrode the plan's "restrained" for ops
surfaces; the perf/a11y/honesty guardrails still hold). The signature: a saturated server registers a change
**peripherally** — event-driven only, no idle loops behind live data.

- **`LiveMoney`** (new) — a running subtotal that ROLLS (NumberFlow) + FLASHES directionally on change
  (accent up / muted down); self-contained prev value; reduced-motion gated; real cents only (display-only).
- **`StaggerList`** (new) — shared `role="list"` with framer card-enter on arrival + exit on removal, keyed
  so only added/removed items animate; stagger capped at 500ms; reduced-motion → no enter/exit. Adds no live
  region.
- **Floor** — FloorBoard diffs table status → a one-shot ring pulse on a just-changed `TableCard`
  (`interactive`+`textured`, subtotal via `LiveMoney`); FloorDetailLive subtotal → `LiveMoney`.
- **KDS / Expo / Approvals / Orders** — routed through `StaggerList`; `card-textured` surfaces; primary
  actions get a `.staff-btn` press. Each board keeps its single existing live region.
- **`globals.css`** — `.floor-live*`, `.floor-card-pulse`, `.staff-btn` (+ keyframes), all transform/opacity/
  color + one-shot box-shadow, every one with a reduced-motion off-switch. No blur/backdrop-filter.

R9b (maximal homepage hero) follows.

### Added — Richness R8: real Stars on /track + the rewards hub (2026-06-30)

Retires R7a's placeholder `gems = round(total)` display rule for the **real loyalty Stars**
(`mms_rewards_summary`: 1 paid order = 1 Star), and brings the signature rewards flourishes to the two
honest-but-plain surfaces. All motion is CSS `@media (prefers-reduced-motion)`-gated (no `shouldAnimate`
first-render race); rewards are server-derived and the earn-claim is gated on real attribution.

- **/track** — the pay-success pill now shows **"✦ +N Star(s) earned"** (the real per-order earn) + an
  honest **"N order(s) to your next reward"** caption. New `getRewardsProgress(orderId?)` server action
  fetches the milestone summary race-correct (once the order has landed → the webhook counted it) and
  server-checks `earned_by === auth.uid()`, so a split-tender **non-host** share-payer (who earns nothing —
  only the host does) never sees a Star they didn't get; no session → no claim.
- **Stars ring** (`StarsRing`, new) — a 148px SVG `stroke-dashoffset` progress ring over the real milestone
  cycle, pure-CSS draw-on, `✦{stars}` rolling via `NumberFlow`, one composed `role="img"` label.
- **Tier-up celebration** (`TierUpCelebration`, new) — fires once on a genuine tier climb (`localStorage`
  last-seen-rank compare; first sight/revisit/downgrade stay silent), rAF-deferred reveal, reused confetti,
  `role="status"`, ≥44px dismiss.
- **RewardsHub** (`/account`) — flat bar → the Stars ring hero; `NumberFlow` on stars + lifetime spend; a
  CLS-safe tier-ladder entrance (no hover-lift — the rungs aren't interactive) with a soft glow on the
  current rung; an **honest "How it works"** panel (earn a Star / a reward every N Stars / climb the tiers)
  that replaces the prototype's fictional perk grid (free milk tea / snacks / birthday — not deliverable;
  `isEarlyAccess` has no consumers).
- **`globals.css`** — `.stars-ring*`, `.reward-rung*`, `.tier-up*` + keyframes, all transform/opacity/stroke
  with reduced-motion off-switches (built-CSS grep confirms emit).

### Added — Richness R7b: checkout review/pay polish (2026-06-30)

Brings the checkout review + pay surfaces up to the celebration's bar (R7a). All motion is CSS
`@media (prefers-reduced-motion)`-gated (not the `shouldAnimate` hook — applying the R7a reduced-motion-race
learning), and money stays presentation-only / server-authoritative.

- **Tip chips** — press settle + a smooth tint/preview transition when the rate changes.
- **CTAs** — Continue / Pay get an accent glow (`--sh-glow`) on hover + a press settle; Edit gets a quiet
  hover + press.
- **Cart lines** — `card-textured` (a richer layered surface; deliberately _not_ `card-interactive`, which
  would imply a clickable affordance the line doesn't have).
- **Order summary** — the grand total reads as the hero figure (hairline divider + display serif + larger).
- **Step transition** — the review ↔ pay change enter-slides via a keyed CSS-animated wrapper; the Stripe
  Payment Element mounts with the wrapper and the enter is a transform, so the card iframe never reloads
  (appearance is mount-time). The always-mounted `<h1>` stays the focus target.

### Added — Richness R7a: pay-success celebration + money-roll (2026-06-30)

The highest-impact single moment: a pay-success "thunk" on `/track` and rolling money. (R7b polishes the
checkout review/pay surfaces next.) The Payment Element hard-redirects to `/track?...&redirect_status=succeeded`,
so the celebration lives there (gated by a new `OrderTracker` `justPaid` prop; split-tender `paid=1` too).

- **Pay-success celebration** (`PaySuccess` + `Confetti`, new) — a draw-on SVG checkmark (`pathLength`) +
  **"Paid — thank you!"** + a **"✦ +N gems earned"** pill, with a one-shot confetti burst + success haptic
  (`[10,40,18]`). Confetti is bespoke (≤90 CSS-animated transform/opacity spans, token gold/jade/clay, no
  blur) and gated on `shouldAnimate && useDeviceTier()!=="low"`; reduced-motion drops the confetti + leaves the
  checkmark at rest. No new live region — the tracker's single `role="status"` carries the spoken confirmation.
- **Gems** = `round(total)` — a deterministic display rule (≈1/$) over the **real paid total**, shown once the
  order lands; not a fabricated/persisted balance.
- **NumberFlow money-roll** — the `CartBar` subtotal and the Checkout `Total`/`Estimated total` row now roll as
  the amount changes (currency format, snaps under reduced-motion). Static `aria-label` kept so the amount
  isn't re-announced per tap. **Money stays presentation-only / server-authoritative — totals math untouched.**

### Added — Richness R6b: item detail sheet — modifiers · live price · upsell · photo-hero (2026-06-30)

Tapping a menu row opens a detail bottom-sheet (the `@mms/ui` `Sheet`, R5b swipe-to-close + Radix focus
trap/restore) — the customize moment. Modifier groups are loaded **eagerly** with each item in the RSC (most
items have none), so the sheet renders + previews instantly with no client round-trip.

- **Modifier groups** — required single-selects (radio) render before optional multi-selects (checkbox),
  driven by `min_select`; native inputs (`accent-color` tokenized) in `fieldset`/`legend` groups; a
  `:has()`-driven selected tint; multi-selects disable past `max_select`. Logic in `lib/menu/modifiers.ts`.
- **Live price — client preview, server-final.** The sheet sums base + selected `price_delta_cents` for an
  instant **advisory** total; on add it calls `add(id, modifierIds)` → `addItem`→`priceItem`, which validates
  the option ids against the item's groups and **re-derives the charge**. The client never sends a price.
- **Required-modifier guard** — the inline quick-Add (which sends `[]`) is replaced by a **"Choose"** pill for
  any item with a required group, so a required choice (e.g. curry style) can't be bypassed (`priceItem`
  doesn't enforce `min_select`). Optional-only / no-modifier items keep one-tap Add.
- **"Goes well with"** — a hardcoded pairing-rules map (`lib/menu/upsell.ts`, no schema change) suggests up to
  3 **real**, in-stock items (category rules → popular → other-category fallback; never fabricated); a tap
  swaps the open item.
- **Photo-hero + honesty** — big blur-up hero (RM-gated), name/MY/description, real badges, and a fail-safe
  allergen note ("Contains …" when declared + the always-on "ask our staff" guide). Sticky Add-to-order CTA
  (disabled + perceivable when sold-out / cart-locked / required choice unmet).

### Added — Richness R6a: menu browse layer — search · category rail · dietary filters · blur-up · badges (2026-06-30)

The flat menu list becomes a browsable surface (R6a; the item detail sheet is R6b). The RSC page now fetches
the catalog (incl. `description_en`, `tags`, `allergens`) and hands it to a client `MenuBrowser` that owns the
search / category / dietary state — data stays server-fetched, only the interaction is client-side.

- **Search** — sticky pill input, live client-filter on EN/MY name + description; `text-base` (≥16px → no
  iOS focus-zoom); labelled "Search the menu"; 🔍 `aria-hidden`.
- **Category jump-rail** — a `<nav aria-label="Menu categories">` of chips (NOT `role="tablist"` — it's a
  scroll-spy jump nav, not switched panels): tap → smooth `scrollIntoView` (instant under reduced-motion);
  an `IntersectionObserver` sets `aria-current` on the in-view category; the rail tracks the filtered set.
  44px targets, lit active / ghost inactive.
- **Dietary filters** — toggle chips (Vegetarian/Vegan/Gluten-free/No nuts/No shellfish), `aria-pressed`,
  jade tint when on. **Fail-safe** logic in `lib/menu/dietary.ts`: a free-from chip excludes any dish that
  declares the allergen AND any dish with **no declared allergens unless `allergen-reviewed`** (unknown ≠
  safe); an inline disclaimer ("Allergen info is a guide — please tell our staff about any allergy.") shows
  only while a free-from chip is active.
- **Blur-up images** (`BlurUpImage`) — `next/image` fades + un-blurs on load over a gradient placeholder;
  `onError` drops the img; transform/opacity/filter only, reduced-motion-gated; no broken-image flash.
- **Badges** — `@mms/ui` Badge for the item's **real** tags only (Popular/Vegan/Vegetarian) — never a
  fabricated "Signature"; sold-out stays a dimmed, disabled row (not removed).
- **Empty state** — one live region (`role="status"`) "Nothing matches" + a "Clear filters" button.

### Added — Richness R5c: menu Add → quantity-stepper morph + per-seat group lines (completes R5) (2026-06-29)

The menu's per-item **Add** pill now morphs into an inline accent quantity stepper (− qty +) once the
viewer has the item in their cart line (the v7.2 prototype's `.add → .stp` morph) — quick re-order and
removal without leaving the menu, **in every mode including dine-in groups**.

- **Group-cart model → per-seat lines.** `insertOrIncLine` now scopes its merge by `by_seat`, so two
  diners ordering the same item get **separate lines** (each owns + manages their own qty) instead of
  folding into one shared line owned by the first adder. This makes the menu morph unambiguous for every
  diner (your Add/stepper always targets your own line, `canMutateLine` own-draft always passes) and the
  by-person split is pre-attributed by contributor. Application-level only — no schema change (no unique
  constraint existed). Solo carts (one seat) are unchanged; a staff "added-by-server" line (`by_seat=null`)
  stays separate + assignable via `assignLine`. Totals/tax are aggregate-identical (summed per line); the
  cart, KDS ticket, and split board show one row per contributor.
  - **Menu tolerates duplicate own lines (aggregate, don't enforce one).** A diner can legitimately hold more
    than one matching own draft line — a host `assignLine` onto an item they already have, a price-snapshot
    difference between two adds, or a concurrent first-add race — and there's deliberately no unique
    constraint. So the menu stepper **sums the viewer's matching lines** (exactly as the cart, split, and
    totals already do) and the `−` peels a line at a time, instead of forcing a one-line invariant via a
    fragile cross-path coalesce. The staff **table-merge** (`mms_merge_table_orders`) still folds only into an
    **unassigned** target line, so a source diner's units never inherit a target diner's `by_seat` (which
    would skew by-person shares). The menu `setItemQty` recovery path now `refresh()`es on failure too, so a
    rejected quick-remove snaps back to server truth instead of leaving a stale line.
- **`AddButton`** finds the viewer's OWN line by `insertOrIncLine`'s exact per-seat keys (item + no
  modifiers + **default fulfillment** + draft + own `by_seat`, not comped) and renders the
  `.mms-qty-stepper` when `qty > 0`. **+** reuses the server-authoritative `add`; **−** calls the new
  `setItemQty` (`qty<=0` removes → morphs back to the Add pill). The in-cart **+** gates on the **live**
  cart `line.soldOut` (fresher than the page-render menu prop).
- **`TableCartProvider`** — new `setItemQty` (`setQty`-backed; server re-derives every amount; authz'd
  `canMutateLine` own-draft-only) re-syncing from server truth with `add`'s session-recovery path; the
  provider now also exposes **`settling`** (split-tender freeze) so the menu controls disable during it.
- a11y: 44px tap targets; `aria-hidden` −/+ glyphs with woven names; an `.sr-only` real quantity (not a
  live region); decrement/removal **announced** via the one live region (WCAG 4.1.3); **focus moves to the
  Add pill on remove** (kept focusable via `aria-disabled` when sold-out, and the move waits for `busy` to
  clear so it lands on an enabled pill — WCAG 2.4.3). Pop/`:active` reduced-motion-gated.

### Added — Richness R5b: Sheet swipe-to-close (first domMax consumer) (2026-06-29)

The `@mms/ui` bottom `Sheet` (Radix Dialog) now drags down to dismiss — the iOS-native expectation,
symmetric with tap-scrim / Esc / the ✕.

- **`DomMaxProvider`** (`packages/ui`) — a nested `LazyMotion` with an async `domMax` loader (drag/layout),
  loaded only when a Sheet mounts (kept off the root chunk; the root stays `domAnimation`).
- **`Sheet`** wraps its Radix `Dialog.Content` in `DomMaxProvider` and renders it `asChild` as an `m.div`.
  Drag is **handle-initiated** (`useDragControls` + `dragListener={false}`) so the body's `overflow-y:auto`
  scroll is untouched — only the grab handle starts a drag; a downward drag ≥120px or a fast flick closes.
  The CSS `up` entrance + scrim/Esc/✕ + focus-trap are unchanged; the public API is identical, so all four
  consumers (PickupSlotSheet, LossActionSheet, InviteSheet, JoinTable) inherit swipe-to-close for free.

### Added — Richness R5a: primitive richness pass (2026-06-29)

Makes the shared primitives feel alive so screens inherit it — all CSS/`domAnimation`-level, opt-in,
reduced-motion-gated, transform/box-shadow only (no `blur()`, mobile-safe glows).

- **`Card`** (`packages/ui`) gains opt-in `textured` + `interactive` props (CSS-only → stays
  Server-Component safe; default off, the 12 existing Card sites unchanged). `.card-textured` =
  printed-matter `::before` (gradient-masked dot-grid, radius-clipped, `pointer-events:none`,
  AT-invisible — restrained on purpose so it doesn't repeat into a pattern down a dense list; the
  `--glow-ac` token is reserved for R7's hero/celebration surfaces); `.card-interactive` = hover
  shadow-lift + press settle (use only on clickable hosts). **Adopted `card-textured` on the menu item
  rows** (depth; not interactive — the row isn't clickable until R6's item sheet).
- **`Stepper`** — a count-bounce on quantity change (the aria-label stays on a stable outer span so AT
  never re-announces; only an `aria-hidden` inner digit replays `mms-pop`) + a press settle on both
  buttons. Both cart + staff-line-editor consumers inherit it.
- **`ModeCard`** (homepage) — `card-interactive` + a `--grad` gradient emoji tile + a staggered
  fade/rise entrance (per-card delay, RM-gated).

### Added — Richness R3+R4: framer-motion (lazy) + interaction hooks (2026-06-29)

The motion engine for the rest of the Richness track, adopted lazily + scoped, with the first consumer.

- **R3 — framer-motion** `^12.26.1` added (`packages/ui` + `apps/qr`); new `MotionProvider` wraps the app
  in `LazyMotion features={domAnimation} strict` (root layout). `domAnimation` async-loads after hydration
  (~18KB gz, never blocks first paint) and covers animations/variants/exit/press-hover-focus gestures;
  `strict` forbids the un-treeshakeable `motion.*` (only `m.*`). `domMax` (drag/`layout`) is **deferred to R5**
  (sheet swipe), loaded only where used. Vitest framer stub deferred — QR's tests are node-env/pure-logic
  (`*.test.ts`), so no jsdom suite imports framer yet; the first `*.test.tsx` adds the stub.
- **R4 — interaction hooks** ported to `packages/ui/src/interactions.ts`: `useTilt`, `useMagnetic`,
  `useHeroParallax`, `useRipple` (re-skinned to QR's `useAnimationPreference`; reduced-motion-gated,
  rAF-throttled, IntersectionObserver-detached offscreen). Carries the delivery caveats (no tilt on a
  CTA-bearing card; no scroll-coupled background parallax).
- **First consumer — `AddButton`** now answers a tap with a reduced-motion-gated `whileTap` spring press +
  a `useRipple` ripple (new `.mms-ripple` utility). Purely presentational; the server-authoritative add
  path is unchanged.

### Added — Richness R2: dark-mode activation (2026-06-29)

The full Night palette existed in `tokens.css` `.dark` but nothing ever set `.dark` on `<html>` — dark
was unreachable at runtime (caught by the M5 audit). R2 activates it, system-driven.

- **Activation** (`apps/qr/app/layout.tsx` + new `components/ThemeSync.tsx`): a **nonce-carrying blocking
  inline script**, first in `<body>`, sets `.dark` from `prefers-color-scheme` before first paint (no theme
  flash) — it carries the per-request CSP nonce (`proxy.ts` strict-dynamic) or it'd be blocked. `ThemeSync`
  keeps the class in sync on a live OS-theme flip. No `next-themes` (QR has no theme picker); the address-bar
  `themeColor` (also `prefers-color-scheme`-keyed) stays in lockstep.
- **Dark bug fixes** (from a verified per-surface audit — rewards & staff surfaces were already clean):
  6× undefined `var(--bg)` (resolved to transparent → card-on-card meld in Night) → `var(--sf)` recessed-field
  token (FeedbackPrompt, OrderHistory, RewardField, AccountUpgrade ×2, MergeTableButton); a hardcoded
  light-theme `boxShadow` on the cart error alert → `var(--sh-md)` (was invisible on the Night page);
  `SharePay` Stripe appearance consolidated to the shared `stripeAppearance()` helper (kills the inline drift).
- **Stripe note:** the Payment Element resolves its theme at **mount** (correct in both themes after
  activation); a mid-session OS flip is deliberately **not** re-keyed — remounting would wipe in-progress card
  entry, a worse regression than a cosmetic stale theme.

### Added — Richness R1: motion + depth token/texture foundation (2026-06-29)

First slice of the 🎨 Richness track ([`docs/RICHNESS_PLAN.md`](docs/RICHNESS_PLAN.md)) — the reusable depth
layer R2–R9 build on. **Additive only** (no existing token or component changed); built on QR's clean token
base, not a port of delivery's accreted `--hero-*` system.

- **Tokens** (`packages/ui/src/tokens.css`, both `:root` and `.dark`): motion (`--ease-in-out`, `--dur-fast`,
  `--dur-slow`), texture (`--tex-dot`/`--tex-line`/`--tex-grain-opacity`), mobile-safe glow stops
  (`--glow-ac`/`--glow-gold`), layered surfaces (`--surface-glass`/`--surface-vellum`/`--surface-elevated`,
  `--sheen`, `--sh-glow`). New durations collapse under `prefers-reduced-motion`.
- **Utilities** (`apps/qr/app/globals.css`): `.tex-dotgrid`/`.tex-linegrid` (gradient-**masked** so they fade to
  nothing at the edges, never uniform wallpaper), `.tex-grain` (inline SVG, zero network), `.surface-glass`/
  `-vellum`/`-paper` (opaque on mobile, `backdrop-filter` only `md:+` — the iOS WebKit OOM budget), and
  `pop`/`steam` keyframes (RM-gated). Confirmed emitting in built CSS.
- **Guardrail:** `--surface-elevated` (text-bearing chrome) locked in `contrast-audit.test.ts` for both themes
  (41 tests green).

### Added — Grocery Scan & Go: quantities + status-atomic upsert + scanner hardening (2026-06-29)

Scan & Go now treats repeat scans of the same barcode as a **quantity increment** (one line "3 × $X")
instead of stacking duplicate rows, and routes adds through the same hardened cart primitive as the
restaurant flow.

- **Server-atomic upsert** — `scanAdd` now calls the shared `insertOrIncLine` (+ `touchCart`) instead of a
  plain insert, so grocery adds finally get the **in-SQL `status='open'` guard** (retires the prior plain-insert
  TODO). Migration `20260624040000_grocery_status_atomic_insert.sql` widens `mms_cart_item_insert_if_open`'s
  `p_menu_item_id` to `text` so a barcode can use the same primitive (uuid & text both gen to `string` — no
  types drift). Totals stay server-authoritative; the client `qty × price` is display-only.
- **Scanner lifecycle hardened** — `BarcodeScanner` early-checks `getUserMedia`, tracks a `stopped` flag to
  prevent emit-after-teardown, and reliably tears down the camera stream + RAF on unmount.
- **Cleanups** — removed genuinely-unused `CSSProperties` imports (`SettlementBoard`, `Avatar`).

### Changed — M5 deep audit + fixes · Richness-track plan + handoff (2026-06-29)

Closed out M5 with a deep cross-slice adversarial audit (5 finder lenses × per-finding adversarial verification,
34 agents) and teed up the next initiative.

- **Audit verdict: sound** — zero findings touch money/auth/RLS/pricing/tax; 20 confirmed (1 Med + 11 Low + 8 Nit),
  8 rejected. Two systemic threads: a holistic a11y blind spot (live regions stack at component _seams_) and a
  primitive-migration tail (stragglers still hand-rolling what the new primitives cover).
- **Fixed (safe / byte-identical):** `EmptyState` composes `<Card>` (retires the last inlined `.card` recipe);
  `FloorBoard` empty state → `<EmptyState>` (harmonizes the 4th board); `SettlementBoard` seat avatar →
  `<Avatar size="md">` (completes the P5.4b wave). **Corrected the false dark-mode claim** in `M4_DESIGN.md` —
  `.dark` is never applied at runtime, so the app is light-only (dark activation tracked as Richness R2).
- **Deferred (flagged, not silently shipped):** dark-mode activation, the live-region-at-the-seams items, status
  chips→Badge (a visual change), split-pay avatar dim (cosmetic).
- **New: [`docs/RICHNESS_PLAN.md`](docs/RICHNESS_PLAN.md)** — the phased **Richness track (R1–R9)** to bring
  delivery's textures/surfaces/micro-interactions/motion to QR (built from a delivery-richness catalog + a QR
  gap audit + a feasibility study). Decisive calls: adopt framer-motion lazily (`domAnimation` root, `domMax`
  scoped), dark via a nonce-carrying `prefers-color-scheme` inline script, `NumberFlow` over `RollingDigits`,
  rebuild textures on QR tokens. ROADMAP + HANDOFF + LEARNINGS updated.

### Added — M5 · P5.5: Vitest + contrast-audit (QR's first test infra) (2026-06-29)

QR's **first automated tests** — locking in the WCAG-AA claim the design system makes. Vitest 4 wired into
`packages/ui` + `apps/qr` (node-env, pure-logic — sidesteps `server-only`/Tailwind-CSS), and the turbo `test`
gate is now live in CI (`.github/workflows/ci.yml`).

- **`packages/ui/src/__tests__/contrast-audit.test.ts`** — ported from delivery, improved: it **parses
  `tokens.css` at test time** (resolves `var()` aliases like dark `--ac-strong: var(--ac)`; flattens the
  `color-mix(... N%, transparent)` badge tints over `--cd`) rather than mirroring hardcoded hex — so a token
  edit is checked automatically (delivery's hardcoded fixtures could silently pass on a regressed token).
  Asserts the full text×surface matrix in **both themes** (tightest: light `t3`/`sf` 4.76, dark `jade-strong`
  4.61) **plus light-theme negative guards** (plain `--ac`/`--gold` as text must STAY <4.5 — the reason the
  `-strong` variants exist; guards against a future revert to the vivid hue as text).
- **`apps/qr/lib/avatars.test.ts`** — seat-hue×`#fff` AA (drives the real `seatColor` hash, no hardcoded
  palette) + `seatColor` determinism + `seatInitial` logic. **Finding:** the P5.4b-1 "two lightest seat hues
  sit just under AA" worry was a **phantom** — all five `PCOL` hues clear 4.5:1 (lightest `#A65F10` = 4.92);
  the stale `avatar.tsx` comment is corrected.
- **Tooling:** `vitest@4.0.17` (matches delivery); `esbuild` added to `pnpm-workspace.yaml allowBuilds`;
  `packages/ui/tsconfig.json` gets `types: ["node","react"]` (node builtins for the fs-based token parse).
  37 tests green; full gate (`lint typecheck build test`) 8/8.
- **Deferred fast-follow:** pure money-math tests (`tax.ts`, `split-math.ts`); component tests (need jsdom +
  `@vitejs/plugin-react` + `@testing-library`, added when the first one lands — no speculative apparatus now).

### Added — M5 · P5.4c: Card primitive (no variants — drift unified) (QR ← delivery transfer) (2026-06-28)

A context sweep before building **overturned the planned `elevated/outlined/filled` variant taxonomy** — that
described the _delivery_ app, not QR. In QR all 25 `className="card"` sites are surface-uniform (every override
is just padding); the only real fork — shadow vs no-shadow — was **accidental drift** in 10 hand-rolled inline
copies that re-typed the surface and silently dropped `box-shadow`. So the win isn't adding variants; it's
retiring the drift.

- **`Card`** (`packages/ui/src/card.tsx`) — pure presentational (Server-Component safe), **no variants**.
  Applies the global **`.card`** class (the single source of truth in `globals.css`) so it can never drift from
  the 25 class sites. Polymorphic `as` (default `div`) so a clickable card is a real `<Link>`/`<a>`/`<button>`
  (native focus/semantics, not a `role="button"` div); `ref` forwards (React 19 ref-as-prop) for the focus-
  management panels; `style`/`className` passthrough for per-site layout.
- **Migrated the 10 inline re-implementations to `<Card>`** — `OrderHistory`, `AccountUpgrade`, `FeedbackPrompt`
  (×2), `RewardsHub`, `staff/CashSettleButton`, `staff/CloseSecureTabButton`, `staff/MergeTableButton` (×2 focus
  panels), `SecureTabButton`, `staff/feedback` rows, and `staff/TableCard` (the `<Link>` card). Their consts are
  trimmed to layout-only; the surface (incl. shadow) now comes from `.card`.
  - **Visual change to flag:** the 9 accidentally-flat surfaces (account/rewards/feedback + the staff cash/
    secure-tab/merge confirm panels) **gain the canonical subtle `--sh` ambient shadow** — the deliberate
    "unify drift" call. `TableCard` already had the shadow → unchanged. The 25 `className="card"` sites are
    untouched. Accent-pill `.card` abusers (`CartBar`, grocery CTA) untouched.
- **Out of scope (tracked):** the 4 tinted ok/warn status surfaces (OrderTracker + FloorDetailLive banners) are
  a future **`Callout`** primitive, not a Card variant. `EmptyState` keeps its own inline surface copy (predates
  Card; safe, optional future dedup via `<Card>`).
- Gate 6/6 green. Pre-PR + deep pre-merge adversarial passes.

### Added — M5 · P5.4b-2: Skeleton + Stepper primitives (QR ← delivery transfer) (2026-06-28)

The loading/qty cluster of P5.4b. Both built to QR tokens, each wired to **real existing consumers** — and a
context sweep **refuted the assumption that the stepper had only one consumer**: there are two, already drifted.

- **`Skeleton`** (`packages/ui/src/skeleton.tsx`) — pure presentational (Server-Component safe) shimmer
  placeholder; `width`/`height`/`radius`/`circle` + a `style` passthrough for layout. Always `aria-hidden`
  (a skeleton is never announced — both consumers keep "one live region per view", their error branch owns
  `role=alert`). The shimmer `@keyframes` + its reduced-motion off-switch live in `apps/qr/app/globals.css`
  (`.mms-skeleton`) — a keyframe can't be authored inline, so the primitive references the class (same
  package↔app split as `Sheet`→`.mms-sheet`); the highlight is a `color-mix` of `--sf`/`--cd` (no hardcoded
  colors). Adopted in **`PickupSlotSheet`** (day-grouped slot-chip mirror) + **`SettlementBoard`** (share-row
  mirror: avatar circle + name/amount bars + status pill). Fast-follow consumers noted: `SharePay`, `MergeTableButton`.
- **`Stepper`** (`packages/ui/src/stepper.tsx`) — interactive (client) qty −/+ control; **presentational only**
  (the parent keeps the optimistic update / `startTransition` / rollback — the qty _math_ is untouched). Encodes
  the load-bearing rules once: 44px targets, the **remove-at-min swap** (the "−" becomes a destructive Remove
  with a swapped glyph + accessible name), the **increment gate** (`disabled`/`qty>=max`/`soldOut`, each with the
  right name; sold-out "+" dims), and the non-live center count (`<span>`, never `<output>` — its implicit
  `role=status` would announce per tap). Adopted in **`StaffLineEditor`** (red ✕ remove, no count) + the
  customer cart **`Checkout`** (🗑 remove, center count, warm "Add another X" label via `incrementLabel`) —
  re-converging two copies that had drifted.
  - **Minor flagged deltas on the customer cart `Checkout` stepper** (presentation only — qty math + the
    warm "Add another X" microcopy unchanged): glyph font 20→18px (imperceptible); a sold-out "+" now dims
    (opacity 0.55, consistent with staff). Staff gains a "Maximum 99" aria cap label.
- A **4-lens deep pre-PR adversarial review** drove: the `incrementLabel` prop (keeps the cart's warm copy —
  it had flattened to the staff phrasing); the sold-out dim tuned 0.4→0.55 (0.4 read "broken"); the dark-mode
  shimmer highlight shifted toward `--cd` (was near-imperceptible); and an `sr-only` "Loading…" cue beside each
  `aria-hidden` skeleton (restores the SR text the old `<p>` carried, with no live region). Deferred (tracked):
  focus-restore on line-removal at qty 1 — **pre-existing** in both old steppers, its own a11y ticket.
- Gate 6/6 green.

### Added — M5 · P5.4b-1: Avatar primitive + tabChip→Badge (QR ← delivery transfer) (2026-06-28)

The floor/presence cluster of P5.4b. Built to QR tokens; each adopted at a real site. (Skeleton + Stepper —
the loading/qty cluster, thinner consumers — follow in P5.4b-2.)

- **`Avatar`** (`packages/ui/src/avatar.tsx`) — pure presentational (Server-Component safe) initial-in-a-circle;
  caller passes the resolved `initial`+`color` (QR's `seatColor`/`seatInitial` stay app-side). Sizes match the
  consumers exactly (`md` 30/12, `sm` 22/10), optional `ring` for overlap, `aria-label` else decorative.
  Adopted in **`GuestList`** (overlapping presence avatars) + **`SplitSection`** (2 static attribution avatars);
  the interactive 44px tap-target `aav` stays bespoke (it's a button, not a display circle).
- **`tabChip` → `Badge`** — the floor open-tab indicator now uses `Badge`, unifying it with the adjacent
  `FloorStatusChip` (deep-review carry-forward from P5.4a, unblocked by the new `decorative` prop), all chips now
  `bordered` (the shared outlined look) at the Badge's normalized 700 weight. **`TableCard`** (decorative — the
  card's `aria-label` already names the tab state; over-ceiling keeps a non-color `⚠` cue, never color-alone for
  color-blind staff) + **`FloorDetailLive`** (announced — its text is the only place the tab state is named;
  **secured = `jade`** affirmative tone vs **open = `accent`**, restoring the `✓`/`●` two-state read). **Visual
  change:** the `●`/`✓` glyph → a tone-colored dot + unified pill geometry (preview-flag for review).
- Gate 6/6 green. `Avatar`'s two consumers + the `tabChip` migration confirmed against the originals. Pre-merge
  deep adversarial pass (3 lenses) drove the `bordered`/`jade`/`⚠` refinements above; one tracked follow-up — the
  two lightest `seatColor` hues sit just under AA behind the white avatar initial (pre-existing; redundant cue).

### Added — M5 · P5.4a: `@mms/ui` lint + Badge + EmptyState primitives (QR ← delivery transfer) (2026-06-24)

First slice of the primitive library — built to QR tokens, each adopted at an **existing duplicated** site
(no dead code). No functional change; colors/AA (`-strong` tokens) byte-identical — the only render deltas are
a sub-pixel unification of the floor chip (dot 6→7px + hairline `letter-spacing`/`nowrap`).

- **`@mms/ui` is now linted** — added `packages/ui/eslint.config.mjs` (extends `@mms/config/eslint` +
  `eslint-plugin-react-hooks`) + a `lint` script, so `turbo lint` now covers the shared hooks/components
  (`motion.ts`/`sheet.tsx`/the new primitives) — previously typecheck-only (P5.3 review Low-2). 6/6 gate tasks.
- **`Badge`** (`packages/ui/src/badge.tsx`) — pure presentational (Server-Component safe) status/role chip with
  semantic **`tone` presets** (`gold`/`jade`/`accent`/`ok`/`warn`/`neutral`) that carry the AA-correct mapping
  (text `-strong` on a tint; vivid decorative dot) so that rule lives once in the primitive, not in every call
  site — plus explicit `color`/`background`/`dot`/`bordered` overrides for bespoke palettes, and
  `aria-label`/`decorative` (aria-hidden) passthroughs. `RoleBadge` (owner/manager/server) uses `tone`;
  `FloorStatusChip` (its flat-on-`--cd` states) uses the explicit path — both render byte-identical.
- **`EmptyState`** (`packages/ui/src/empty-state.tsx`) — the "nothing here" card (token surface = `.card`),
  title + optional subtitle/icon/action + `titleAs` (`p` default / `h2`/`h3` for standalone regions, a11y).
  `KdsBoard` + `ApprovalsBoard` + **`ExpoBoard`** (now unified across the staff board family) use it.
- **Deep pre-merge review (3 parallel lenses): all PASS** — the API-design lens prompted the `tone` presets +
  a11y passthroughs; the consistency lens prompted ExpoBoard's migration; build/lint/deps proved eslint efficacy
  - frozen-lockfile safety. Carry-forward: the `tabChip`↔`FloorStatusChip` floor adjacency is a **pre-existing**
    (sub-perceptual) inconsistency — a Badge-migration candidate for P5.4b (now unblocked by `decorative`).
- **Deferred:** `Avatar`/`Skeleton`/`Stepper` → P5.4b; `Card` variants → P5.4c (20+ sites); `Tooltip`/`Drawer`/
  tilt → no QR consumer.

### Added — M5 · P5.3: motion discipline + perf budget (QR ← delivery transfer) (2026-06-24)

Establishes QR's motion/perf foundation **before** richer motion lands (P5.4+), so it never reintroduces the
sibling app's prod iOS-WebKit-OOM crash. No behavior change to existing flows.

- **`@mms/ui` foundation primitives** (lean, SSR-safe, `"use client"`, exported from the package root):
  `useAnimationPreference()` (`{ shouldAnimate }` — the JS counterpart to the CSS reduced-motion query,
  reactive to OS changes), `useInView()` (IntersectionObserver offscreen-pause; falls back to in-view where
  IO is absent), `useDeviceTier()` (`low|mid|high|desktop`, SSR-safe `low` first paint — the gate for future
  heavy GPU FX). Ported lean from delivery (no in-app override store — QR has no motion-settings UI yet).
- **Canonical consumer:** the `/track` active-step pulse (`mms-track-now`, the app's one infinite loop) is now
  gated `shouldAnimate && inView` — JS reduced-motion + offscreen-pause — with the `useInView` ref on the
  stable `<ul>` (not the moving dot). Proves the primitives without retrofitting JS onto already-correct CSS.
- **`docs/MOTION_AND_PERF.md`** — the discipline doc: reduced-motion (CSS + JS), 60fps transform/opacity-only,
  offscreen-pause, the **mobile GPU/blur budget** (no stacked `backdrop-filter`/large `blur()` on mobile;
  radial-gradient glows; gate heavy FX behind `md:`/`useDeviceTier`; budget the initial composite), and
  `desktop`-only gating for the heaviest GPU (high cores ≠ lifted WebKit memory ceiling).
- **Deferred to P5.4:** `useRipple`/`useTilt` interaction hooks — meaningless without component consumers; they
  land with the primitive library that uses them (carry the "no tilt on a CTA card / disable on keyboard focus"
  caveats). Learnings captured in `.claude/LEARNINGS.md`.

### Added — M5 · P5.2: iOS / mobile hardening sweep (QR ← delivery transfer) (2026-06-24)

First transfer slice of the reshaped M5 — ports delivery's production-hardened mobile/iOS patterns into QR,
built to QR's own tokens. Pure mobile-robustness; no behavior/logic change to money/auth/data.

- **Bottom sheets size by `--sheet-max-h` (dvh), not `vh`** — new `--sheet-max-h: calc(100dvh -
env(safe-area-inset-top) - 1rem)` token in `@mms/ui/tokens.css`; the shared `.mms-sheet` (every
  `@mms/ui` Sheet — JoinTable/InviteSheet/PickupSlotSheet/LossActionSheet) now uses it + clears the home-bar
  inset in its bottom padding. iOS `vh` is the large viewport, so a `90vh` sheet's top/close button could hide
  under the status bar.
- **Safe-area insets via position, not padding**, on every edge-pinned element: `CartBar` + grocery
  `checkoutCta` (bottom), `TableCartProvider` recovery alert (top), `RefundActionSheet` overlay (bottom), the
  staff `table/[id]/add` sticky header **and** the diner `menu` sticky header (top — handheld tableside is the
  worst notched-portrait case). (Mid-floating toasts at bottom 84/90 already clear the inset — left as-is.)
  `.mms-sheet` carries a `90vh` fallback before the `dvh` value for iOS <15.4; `RefundActionSheet`'s inner
  sheet gained `--sheet-max-h` + scroll to match. (Deferred to **P5.6/PWA**: a top inset on ordinary page-flow
  content — cosmetic in browser-portrait where `safe-area-top≈0`, only relevant once a standalone PWA ships.)
- **16px form controls on mobile** — a single `@media (max-width: 639.98px)` base rule pins
  `input`/`textarea`/`select` to 16px (overrides inline sizing) so iOS never auto-zooms on focus; desktop sizes
  resume at `sm:`. QR had fixed _some_ inputs ad hoc (StaffLogin/FeedbackPrompt/JoinTable) but missed others
  (grocery search, InviteSheet, RefundActionSheet) — this closes the whole class in one rule.
- Audited clean (no change needed): nested-scroll wheel traps and breakpoint-coupled overlay anchors — QR uses
  centered inline-styled fixed elements, not Tailwind-breakpoint-anchored dropdowns.
- Verified the new CSS emits in the built bundle (`--sheet-max-h`, `safe-area-inset`, the mobile media query);
  gate green (`turbo lint typecheck build`). Backlog: `docs/QR_FROM_DELIVERY.md`.

### Changed — M5 · P5.1: reshaped from migration → "QR learns from delivery" (repos stay separate) (2026-06-24)

**M5 is no longer a repo migration.** On review with Min we changed direction: the two apps stay **separate
repos** (own deploys, own CI, own Supabase projects, the shared Stripe account) and the younger **QR** app
**learns from** the mature, live **delivery** PWA instead. Drivers: the shared-`@mms/ui` payoff is unrealized
while the apps run **different design lineages** (QR's `@mms/ui/tokens.css` is the tighter, WCAG-AA-verified
base — keep it, don't fork delivery's 34 KB accreted set); delivery's real value to QR is **craft + production
learnings** (a transfer, not a repo merge); and the migration's dep-dedup would **force-bump a live production
app** (next/react/eslint/TS — a regression surface, the owner's #1 frustration). Full-repo co-location is
**reconsidered at M6** if Terminal/kiosk need a shared runtime.

- **Docs reshaped:** `docs/M5_DESIGN.md` rewritten as the transfer design-of-record (with the superseded
  co-location plan kept for history); `ROADMAP.md` §M5, `docs/HANDOFF.md`, and `CLAUDE.md` ("What this is")
  updated; **new `docs/QR_FROM_DELIVERY.md`** — the prioritized transfer backlog synthesized from two grounded
  adversarial audits (delivery's app-agnostic wisdom · QR's posture/gaps).
- **New slice plan:** P5.0 (the `@mms/db` factory, #79) retained as a clean internal refactor → **P5.2** iOS/
  mobile hardening sweep → **P5.3** motion discipline + perf budget → **P5.4** primitive library in `@mms/ui`
  (built to QR tokens) → **P5.5** contrast-audit test + QR test infra → **P5.6** PWA/offline (deferred).
- **Key correction over the delivery catalog's instinct:** transfer _behavior + craft + primitives_, never the
  design tokens — QR keeps its own. **Audit fact recorded:** delivery uses file-based migrations.

### Changed — M5 · P5.0: `@mms/db` generic client factory (multi-app prep) (2026-06-24)

**(Superseded by the P5.1 reshape above — repos stay separate; retained as a clean internal refactor.)** The first M5 build slice: make `@mms/db` reusable by a second app without merging databases. New
`@mms/db/factory` exports `createServiceRoleClient<DB>` / `createPublicClient<DB>` / `createSessionClient<DB>`
/ `createSsrClient<DB>` / `createBrowserSupabaseClient<DB>` — the client construction + cookie/auth wiring,
**generic over the project's `Database` type and injected with `url`/`key`** (no `process.env` read). QR's
`serviceClient()`/`publicClient()`/`sessionClient()`/`serverClient()`/`browserClient()` keep **identical
signatures** and now delegate to the factory bound to QR env + QR types — so all ~20 QR call sites are
byte-unchanged (zero behavior change), the `server-only` service-role boundary stays on QR's wrapper, and
`apps/delivery` (P5.2) will bind the same factory to its own project + types. The per-app type-file rename
(`database.types.delivery.ts`) and Zod-schema namespacing are deferred to P5.2 (churn-without-enablement until
delivery lands; would needlessly risk the byte-exact `types-fresh` gate now). Plan: `docs/M5_DESIGN.md`.

### Added — M5 prep: design-of-record for the delivery-app migration (2026-06-24)

**(Superseded by the P5.1 reshape above — M5 is now a transfer, not a migration.)** Pre-build design for M5 (bring the live delivery PWA into the monorepo), grounded in a structural recon of
the packages. `docs/M5_DESIGN.md` + a HANDOFF refresh (S4 audit remediation shipped → M5 unblocked) +
`ROADMAP.md` M5 (a P5.0 prep slice + the design pointer).

- **Locked scope:** code co-location, **not** a database merge — apps share `@mms/ui`/`@mms/config`/tooling +
  the one Stripe account; each keeps its own Supabase project. `@mms/db` is the only QR-coupled package and
  the focus of the prep slice (a generic project-parameterized client factory + per-app generated types +
  namespacing the QR-only Zod schemas off the shared root, closing audit P2).
- **CI:** a per-app matrix (two stacks) replaces the single-Supabase `types-fresh`/migrations-check assumption.
- **Rewards unification is explicitly post-M5 ("M5a"):** with two databases, a unified wallet is a
  cross-project data problem, not a code move — M5 ships two ledgers + honest copy, not a false promise.

### Fixed — S4 audit remediation: refund correctness + fire-at-checkout durability (2026-06-24)

The money/kitchen defects the S4 audit (`docs/S4_AUDIT.md`) surfaced. Migration `20260624030000`.

- **P0-1 (money-out BLOCKER):** `mms_refund_authorize` under-refunded any qty>1 taxable line — `tax_cents`
  is stored **per-unit** but the refund added it once, not `×qty`. Now the line's tax is its pro-rata share
  of the order's tax (scales with qty). **P1-1:** the refund is also **discount-aware** (refunds the
  discounted goods + share of tax on the discounted base, mirroring `getCartTotals`, not the undiscounted
  list price) and carries an **order-level over-refund cap** (Σ refunds ≤ net + tax = total − service − tip),
  so cumulative line refunds can never exceed what was collected. `RefundActionSheet` now shows the
  server-derived `refundableCents` (a `lib/refunds.ts` mirror of the SQL) so the figure shown IS what refunds.
- **P1-2 (silent charge-with-no-fire):** the settlement `after()` drain (fire pending food · init togo ·
  snapshot EBT) had no backstop if `after()` cold-stopped after the 200 ack. Added a **pg_cron reconciler**
  (`mms_reconcile_settled_fulfillment`, every 5 min, the QBO-drain pattern) that re-runs the idempotent
  side-effects for recently-paid orders with un-done work, and **split the three RPCs into independent
  try/catch** in all three settlement paths (card webhook single + split; cash) so a throw on one can't
  starve the others.
- **P1-3 (wrong-batch undo):** `mms_undo_fire` keyed on `max(fire_at)`, so a host's grace-Undo could claw
  back a guest's S4.2 "make it now" line. It now takes a `fire_batch` (the send hands the client its batch
  id) and reverses **only that batch** — never another actor's line sharing the grace window.
- **P1-4 (>24h re-refund double-pay):** the `charge.refunded` ledger backstop **5xx**s on a list/record
  failure (was: logged + swallowed), so Stripe redelivers within its 72h window instead of permanently
  losing the row and risking a second real refund once the idempotency key expires.
- **P0-2 (M5 blocker, doc):** reconciled the project-topology contradiction — `ROADMAP.md` M5 +
  `BACKEND_ARCHITECTURE.md` now state the locked design: apps share **packages + the one Stripe account**,
  each on its **own** Supabase project (no DB merge). M5 is a code unification, not a database merge.

### Added — S4.3c: split-tender seam (EBT eligibility-at-sale; tender split = 2027) — **S4 COMPLETE** (2026-06-24)

The data-model seam so the **2027 EBT tender split** (one tender pays the eligible grocery subset, another
pays the rest) is a tender-time branch, not a rewrite. Design: `docs/S4_DESIGN.md` S4.3c (C1–C3). Migration
`20260624020000`. **No tender logic built** (EBT = 2027, gated on Forage/USDA-TPP + FNS authorization).

- **`qr_order_items.ebt_eligible`** (default false) — the **eligibility-at-sale** record + the 2027 partition
  key. `mms_snapshot_ebt_eligibility(order)` marks the order's grocery lines whose catalog item is
  `ebt_eligible`, called **best-effort in the settlement `after()` side-effects** (card · cash · split) — **off
  the money path**, no fulfill-RPC change. Idempotent; food/prepared lines stay false; a hiccup leaves false
  (the catalog stays derivable). A permanent audit record, immune to later catalog drift.
- **The line-categorization seam is otherwise already in place** — `qr_order_items.fulfillment` (S4.3a)
  identifies grocery lines; the per-payer PI ledger (`qr_cart_shares`) generalizes to per-tender. The
  payment↔line-subset **association shape** (a `qr_payment_lines` join vs `paid_by_intent`) is **deliberately
  deferred** to the 2027 Forage build (committing it now would guess the PI model and risk a money-table
  rewrite) — documented so 2027 is a branch, not a discovery. The S4.3b `split_unsupported` line-refund
  deferral resolves on this same seam.
- Function `SECURITY DEFINER`, `search_path=''`, revoked from public/anon/authenticated + service_role only.

**S4 (unified basket & fulfillment routing) is complete** — S4.1 per-line tag + mixed cart · S4.2 fire
routing + KDS subset · S4.3a to-go fulfillment loop · S4.3b line-level refunds · S4.3c EBT seam. The 2027 EBT
tender + split-order line refunds ride the documented seam.

### Added — S4.3b: line-level refunds (`charge.refunded` + manager-gated per-line refund) (2026-06-24)

Money-OUT: the captured-line counterpart to S2.3's open-cart void. Design: `docs/S4_DESIGN.md` S4.3b
(B1–B4). Migration `20260624010000`. Second of three S4.3 slices.

- **`/staff/orders`** (manager-gated) — recent paid orders, expand to lines, **Refund** a line. The
  RefundActionSheet collects a reason + the manager's **own PIN** (money-out re-auth at action time;
  lockout-counted). Split-tender orders flag "refund via dashboard" (per-payer-PI allocation deferred).
- **Server-derived, idempotent, audited** — `mms_refund_authorize` re-derives the amount
  (`unit_price_cents*qty + tax_cents` — goods + that line's tax; service/tip are order-level, not per-line)
  - the PaymentIntent and validates paid / single-PI / not-already-refunded / manager. The Stripe refund is
    **idempotency-keyed on the line** (a double-submit returns the same refund — no double money out);
    `mms_record_refund` writes the **`mms_refunds` ledger** (unique `stripe_refund_id` + unique-per-line) + a
    `mms_approvals` audit row (`kind='refund'`). Amount + PI are never client-supplied.
- **`charge.refunded` webhook** — Stripe-authoritative reconcile: flips `qr_orders.status='refunded'` once
  `amount_refunded >= total_cents` (idempotent; also catches **dashboard-issued** refunds). This is the
  state **M4 refund-recede** was blocked on — the rewards summary counts only `status='paid'`, so a full
  refund recedes the Star. A partial (single-line) refund leaves `status='paid'` (the ledger has the detail).
- **Hardening** — all three RPCs `SECURITY DEFINER`, `search_path=''`, revoked from public/anon/authenticated
  - service*role only; `mms_refunds` RLS-on (manager-read). A ledger-write failure \_after* a successful Stripe
    refund is logged, not surfaced — the webhook reconciles regardless (money moved correctly). Split-line
    refunds + coupon claw-back are documented deferrals.

### Added — S4.3a: to-go fulfillment loop (bagging/expo station + "to-go ready" signal) (2026-06-24)

Closes the unified-basket loop end-to-end: order → route → fire → cook → **bag → ready → hand off**, with a
diner signal so nobody pays and walks out without their bag. Design: `docs/S4_DESIGN.md` S4.3a (A1–A6).
Migration `20260624000000`. First of three S4.3 slices (then line refunds, then the split-tender seam).

- **`qr_orders.togo_status`** (`preparing`/`ready`/`picked_up`, nullable — null = pure dine-in, no bag) is the
  ready signal. `/track` already subscribes to `qr_orders`, so it rides that existing Realtime path — no new
  channel. Set to `preparing` at settlement (best-effort, off the money path).
- **Expo / bagging station** (`/staff/expo`) — the takeaway counterpart to the KDS. Lists paid orders with a
  takeaway portion + their **to-go/grocery lines only**, with a two-stage bump: **Bagged & ready**
  (`preparing→ready`, lights the diner's `/track`) then **Picked up** (`ready→picked_up`, drops off). Staff-
  gated (`requireStaff`), realtime + 5s poll backstop, mirrors the KDS.
- **Snapshot `qr_order_items.fulfillment`** — the order-item snapshot now carries the per-line fulfillment tag
  (additive column copy in all three fulfill RPCs; no money logic changed), so a paid order knows which lines
  are the bag. Slice C (split-tender seam) inherits this per-line categorization.
- **`/track` shows real progression** — `togo_status` lights the pickup/scango step rail
  (`preparing`→In the kitchen, `ready`→Ready for pickup, `picked_up`→Picked up) + a prominent **"your order's
  ready — grab it before you head out"** banner. Honest (server-signal only, no fabricated countdown); a
  dine-in order with no bag rests as before. One live region, SR-announced.
- **Hardening** — `mms_set_togo_status` re-asserts the legal edge (`preparing→ready→picked_up`) **in the SQL
  write** (`'stale'` on a raced/illegal edge); `mms_init_togo_status` is idempotent + takeaway-gated; both
  revoked from public/anon/authenticated + granted service_role. Init drained via `after()` (a hiccup can't
  roll back a payment). Advisors baseline-only.

### Added — S4.2: per-line fire routing + KDS subset + ready signal (2026-06-23)

The fulfillment tag now drives **when** a line fires. Design of record: `docs/S4_DESIGN.md` S4.2 (F1–F6).
Migration `20260623220000`. Scoped to the **dine-in unified basket**; pickup/scango keep their M2 scheduled
order-level fire (untouched).

- **Fire routing** — `mms_fire_cart` ("Send to kitchen") now fires **only `dinein`** draft lines (was: every
  draft line of a dine-in session). A `togo` line waits for checkout / "make it now"; a `grocery` line never
  fires. The KDS subset (`dinein` + fired `togo`) falls out for free — grocery never reaches `state='fired'`.
- **"Make it now"** — `makeItNow` + `mms_fire_line` fire a single `togo` food line early (draft→fired, +10s
  grace). Member + `canMutateLine` gated; the RPC re-derives open-cart + draft + `togo` **in SQL** (a `dinein`
  line uses the batch send, `grocery` refused). A per-line button in the cart's To-go group.
- **Fire-at-checkout (no charge-with-no-fire)** — at settlement, `mms_fire_pending_food` fires every still-draft
  **food** line (dinein+togo, never grocery) of the **paid** dine-in cart, so the kitchen makes everything the
  guest paid for. Called **best-effort after** the (untouched) money RPCs — card webhook, cash settle, and the
  split-tender close — drained via `after()` so a kitchen-fire hiccup can never roll back a captured payment or
  NACK a Stripe webhook. Idempotent; dine-in-gated.
- **KDS** — now reads kitchen lines on **open _or paid_** carts (a to-go line fired at checkout lives on the
  just-paid cart; the old open-only filter hid it). `cancelled` excluded; the line-state gate keeps served/
  voided off. Each ticket line shows a **"To-go" badge** (text + decorative glyph, `aria-hidden`) so the
  cook/expo bags it instead of running it to the table.
- **"Ready in ~X"** — the To-go group + the "Make it now" button surface an honest estimate from
  `pickup_config.prep_minutes` (a configured value, **not** a fabricated live countdown). The persistent diner
  "to-go ready" departure status + bagging/expo station remain **S4.3**.

### Added — S4.1: unified basket — per-line fulfillment tag + mixed-destination cart (2026-06-23)

One basket, one payment, lines that route to different destinations. Design of record:
`docs/S4_DESIGN.md` (threat model U1–U4 + the EBT split-tender seam). Migration `20260623100000`.

- **Per-line fulfillment tag drives per-line tax** — every cart line carries a `fulfillment`
  (`dinein`/`togo`/`grocery`) that **supersedes the session mode** for routing _and_ tax. Food
  defaults from context (dine-in→`dinein`, pickup/scan→`togo`); grocery auto-tags `grocery` and is
  never guest-flippable (routing + exemption are fixed). The tag flows into `mms_line_tax`, so a
  cold-food line taxed at the dine-in/to-go boundary recomputes correctly when its tag flips
  (cold_food/beverage_cold are taxable dine-in, exempt to-go). `tax_cents` is stored per line and is
  the taxable base `getCartTotals` already sums — no new total/charge path.
- **Cart grouped by destination** — `Checkout` renders the basket in `<section aria-label>` blocks
  (Here · To go · Grocery), headings shown only when 2+ destinations are present. Single-destination
  carts read exactly as before.
- **Food For-here/To-go toggle** — a per-line, draft-only, member-gated toggle
  (`mms_set_line_fulfillment`: open-cart + draft-state + not-grocery guard **in SQL**, server-recomputed
  tax). `role="group"`, `aria-pressed`, 44px targets. Grocery lines show no toggle.

Fire-routing / KDS subset / ready signal land in S4.2; bagging/expo + split-tender + line-level refunds in S4.3.

### Added — M4 P4.3: feedback + ungated review triage (2026-06-23) — M4 COMPLETE

Post-order feedback at peak goodwill, the **ungated** way (`docs/M4_DESIGN.md` R9/R10; `DESIGN-RESEARCH.md`
"review-gating is the trap"). Migration `20260623090000`.

- **Ask everyone, gate nothing** — a `FeedbackPrompt` on `/track` collects a 1–5 rating + optional comment;
  after **any** rating the public **Google review link is offered to all** (never routed by score — that
  would breach Google policy + the FTC). A low rating adds a "we'll make it right" recovery line **and
  still** shows the link.
- **Triage = internal routing, never suppression** — a low rating (≤3) pings staff (PostHog signal) and
  surfaces on a **manager-gated `/staff/feedback`** queue (owner-read RLS, low ratings highlighted) for
  recovery; it never changes what the diner can do.
- **Integrity** — one feedback per order (`unique(order_id)`), by the order's **earner** (`mms_submit_feedback`
  re-derives `earned_by` = the SSR uid + paid order; a non-earner is refused and never sees the prompt).
  Rating bounded 1–5 (Zod + `CHECK`), comment ≤1000 (Zod + `CHECK`). `mms_feedback` owner-read RLS, off
  realtime; `mms_feedback_config.google_review_url` owner-tunable (null → no link, graceful).

**M4 is complete** — rewards earn + account upgrade + hub (P4.1) · redemption · order history · split-earn
(P4.2) · feedback + ungated reviews (P4.3). Documented-blocker deferrals (reorder, settings, refund-recede)
remain noted in `docs/M4_DESIGN.md`.

### Added — M4 P4.2: split-tender earn attribution (2026-06-23)

A split-tender order now earns — previously the split fulfill stamped no earner, so a table that split the
bill earned nothing. The **host-of-record** (the cart's `session.host_seat`) earns the one Star (order-count
model: one order = one Star; net spend credited to the organizer, parity with the S3 host-of-record). The
webhook split-fulfill resolves the host uid, stamps `qr_orders.earned_by`, and awards via
`mms_reward_on_fulfill` — exactly-once (only on the open→paid transition), best-effort (never fails the
money ack). Per-share attribution is a noted future refinement (needs a per-payer earn ledger). No schema
change. This **finishes the buildable M4 P4.2 remainder**; reorder (lines store modifier labels not option
ids → can't faithfully re-price), settings (theme/lang — OS + bilingual menu already cover it; real lang =
i18n initiative), and refund-recede (blocked on S4.3 refund infra) stay deferred with documented blockers.

### Added — M4 P4.2: order history (2026-06-23)

The diner's own past orders on `/account` (read-only). `getOrderHistory` reads their PAID orders
(`earned_by` = the SSR-verified uid — anon or upgraded), newest first, with a short item summary; a
service-role read scoped to the uid, so a diner only sees their own. Cash/staff-closed orders (no earner)
don't appear — honest "orders you placed", not the whole table's. No new schema. Reorder + settings are
deferred to their own slices (see `docs/M4_DESIGN.md`): reorder needs an active table-bound cart; settings
(theme/lang) is blocked on a theme-override provider + an i18n layer (today the theme is pure
`prefers-color-scheme` and there's no diner i18n framework — shipping the toggles now would be hollow).

### Added — M4 P4.2: reward redemption at checkout (2026-06-23)

A diner redeems an earned Morning Star reward coupon on their order — completing the earn→see→**use** loop
(P4.1 issued + showed them; this spends them). Migration `20260623070000`.

- **Rides the existing discount rail** — a reward is held by `qr_carts.applied_reward_id` and surfaces via
  `mms_reward_discount` (parallel to `mms_promo_discount`), folded into `getCartTotals().discountCents`
  (new `rewardCents` sub-field for display). So the create-intent amount, the **webhook reconcile**, the
  cash subtotal-reconcile, and every order snapshot stay server-authoritative — no new money math.
- **Stable across the pay window** — expiry is gated at **apply** time (not totals time), so the discount
  can't shift between intent-create and the webhook and break the reconcile.
- **Single-use, atomic** — `mms_apply_reward` validates ownership (the reward's `user_id` = the caller's
  uid, so a guessed code is just "invalid" — no enumeration), unredeemed/unexpired, the redemption minimum,
  open+unlocked cart, and that it isn't held by another open cart. `mms_redeem_cart_reward` flips it to
  redeemed at fulfillment (conditional → idempotent on Stripe redelivery) across **card, cash, and split**.
  Refused mid-pay so a reward never changes a total a peer is settling.
- **UI** — `RewardField` on the cart ("Use a reward") lists the diner's coupons + applies/removes one; the
  breakdown shows a distinct "Reward −$X" line. Rewards-hub wallet copy is now truthful. Member-gated
  `applyReward`/`clearReward`/`getMyRewardCoupons`; honest per-reason copy.

### Added — M4 P4.1: Morning Star Rewards + account (QR-local) (2026-06-23)

Design of record: `docs/M4_DESIGN.md`. A diner earns rewards and can upgrade their anonymous session to a
durable account. **QR-local** ledger (unify with the delivery app at M5); earn rules **mirror** delivery
(Stars = paid-order count; tiers `new`/`jade`/`ruby`/`gold` by lifetime net spend; milestone-step reward
coupons) so M5 is a data merge, not a rename. Migration `20260623060000`.

- **Server-authoritative, derived rewards** — `mms_rewards_summary` derives Stars/spend/tier from the
  caller's **paid** `qr_orders` (never a client-held balance). `qr_orders.earned_by` is stamped at
  fulfillment from `create-intent`'s PI metadata; `mms_reward_on_fulfill` issues a reward coupon when Stars
  cross a milestone (idempotent per milestone index). Rewards are **best-effort** in the webhook — a hiccup
  never fails the money ack. Cash/staff closes earn nothing (no diner payer).
- **Account upgrade in place** — `updateUser({ email })` + `verifyOtp` (email OTP) or `linkIdentity`
  (Google), keeping the **same uid** so past orders + Stars carry over. The `mms_account` marker is set
  **while still anonymous** so `AnonAuthGate` (which previously signed out any non-anon session on a diner
  route — a P0 for upgraded accounts) keeps the upgraded session.
- **Rewards hub** at `/account` (was a stub; `/rewards` now redirects there) — tier ladder, Stars progress,
  earned-reward wallet. Bilingual gem names; tokens, 44px, `role`/`aria` on every control; honest copy
  (the wallet says rewards are _saved_, not yet redeemable in-app — redemption is P4.2).
- `mms_profiles` (owner-RLS account), `mms_rewards` (coupons), `mms_rewards_config`/`mms_reward_tiers`
  (tunable, seeded to delivery values) — all service-role-write, owner-read where a diner reads their own;
  off realtime. `config.toml`: manual linking on + the Google provider (disabled until creds wired).

### Added — S3.3: server-discretion gating (nudge · ceiling · audit log) — wraps the S3 tabs milestone (2026-06-23)

The discretion layer over the tab lifecycle, courtesy-framed and config-driven — never an auto-charge.
Migration `20260623040000`.

- **T13 — durable tab-action audit log** (`mms_tab_events`): append-only, **non-PII** (the staff uid only;
  never the anonymous diner's), service-role write, **owner-read RLS** (mirrors `mms_approvals`), off
  realtime. Logged on **open** (`logTabEvent` from `openTab`), **secure** (the `setup_intent.succeeded`
  webhook), and **close** (cash via `settleCash`; card/secure via the `payment_intent.succeeded` fulfill,
  attributed by PI metadata). This is the opener attribution S3.1-A3 deliberately pulled off the
  diner-readable cart row. `mms_open_tab` now returns `opened`/`exists` so a fresh open logs exactly once.
- **T11 — silent ceiling**: the floor flags a **trust** tab whose running subtotal crosses `ceiling_cents`
  ($400) — a "Tab at $X" banner + a warn-tinted floor-card chip. A flag only; never auto-converts or
  auto-charges (the conversion to secure stays the diner's choice on `/cart`).
- **T12 — courtesy nudge**: a config-driven hint to consider a secure tab — `party` (≥ `nudge_party_size`)
  or `age` (open past the new `nudge_tab_age_min`, 90 min). A system hint with scripting, not per-customer
  judgment; suppressed once secure.
- **T14 — host-of-record**: the secure-tab drill-down names the host whose card is on file.

### Added — S3.2: secure tab (SetupIntent → off-session close) (2026-06-23)

A diner saves a card (SetupIntent, `usage:'off_session'`) at open or mid-tab; the tab settles off-session
on the card at close. SAQ-A throughout — only Stripe tokens, never PAN. Migration `20260623020000`.

- **Tokens off the realtime row** — the Customer + PaymentMethod tokens live in a service-role-only
  `mms_tab_secure` sidecar (default-deny RLS, **not** on the realtime publication), since `qr_carts` fans
  its full row to anonymous table members. The cart signals only `tab_type='secure'`.
- **Card-save** — `/api/stripe/setup-intent` (member-gated) mints/reuses one ephemeral Customer per tab +
  a SetupIntent; the diner saves a card via a setup-mode Payment Element on `/cart` ("Secure your tab").
  The webhook `setup_intent.succeeded` → `mms_secure_tab` records the token + flips `tab_type='secure'`
  (server-authoritative — never reports "secured" the gateway didn't accept).
- **Off-session close** — `closeSecureTab` (staff) charges the card on file for the final total via an
  `off_session`+`confirm` PI that flows through the **existing** `payment_intent.succeeded` →
  reconcile → `mms_fulfill_order` path (no fourth fulfill path); holds the settle mutex; a decline /
  authentication_required surfaces an honest cash/fresh-card fallback and never strands the tab paid. **No
  tip is added off-session** (an off-session charge must not invent a tip the guest didn't authorize).
- **Staff** — "Tab secured · card on file" on the drill-down + a "Close tab · card on file" action (cash
  stays a fallback).

### Fixed — S3.1 trust-tab: post-merge deep-adversarial follow-ups (2026-06-23)

Two fresh-context deep reviewers (concurrency/data-integrity + UX/a11y) over the merged S3.1 diff.
Migration `20260623010000`.

- **A1 (data-integrity)** — `mms_merge_table_orders` ignored the tab columns, so folding a table with an
  open trust tab into another silently dropped the tab (floor stopped showing "Tab"; S3.3 ceiling/nudge
  wouldn't gate). The merge now carries the tab forward — inherit up, never downgrade a target secure tab,
  earliest open time.
- **A2 (concurrency)** — `openTab` now refuses while money's in flight (single-pay lock / split freeze /
  authorized share), reusing the canonical `paymentInFlightReason` mutex — the server backstop for the
  diner `/cart` path (the staff floor already hid Open-tab mid-payment).
- **B1 (UX)** — diner `/cart` now live-syncs a server-opened tab for **solo/duo** dine-in too (cart
  realtime was gated on `isGroup`), so the screen flips to "Tab open / Settle tab" without a manual reload.
- **B2 (a11y)** — focus moves to the order heading when the staff Open-tab control unmounts on open (was
  dropping to `<body>`, WCAG 2.4.3).
- **A3 (privacy)** — dropped `tab_opened_by` (it stored the opener's `auth.uid()` on the diner-readable
  `qr_carts` row, fanning a **staff** uid out to anonymous diners over realtime); `mms_open_tab` loses its
  `p_by` arg. Opener attribution returns in S3.3 via the service-role-only `mms_tab_events` audit log.

### Added — S3.1: trust tab (deferred settlement) (2026-06-23)

"Keep the tab open" — the table order accumulates across the night and settles once at close. A trust tab
is the existing `qr_carts` order with settlement deferred (not a new ledger), so close reuses the existing
tenders (cash settle; the diner's card via the Payment Element, which already carries tip-on-final-total) —
no fourth fulfill path. Migration `20260623000000`.

- **Spine (SQL)** — `qr_carts` tab columns (`tab_type`/`tab_opened_at`/`tab_opened_by`, CHECK-guarded);
  `mms_open_tab` (dine-in + open + session-not-closed guards, idempotent, never downgrades a secure tab,
  `SECURITY DEFINER`, service-role-only); `mms_tab_config` singleton ($400 ceiling · nudge ≥10, for S3.3),
  service-role-only RLS.
- **Open — dual authority (T3)** — a server opens a tab from the floor drill-down; a diner opens one from
  `/cart` ("Keep tab open · settle later", dine-in only). Both write the one table-owned cart, each gated in
  SQL (staff via `getStaffAuth`; diner via `assertCartMember`).
- **Floor legibility** — a "Tab" badge on the floor board card + the drill-down header, the "tab opened …"
  time, and the cash settle re-framed as "Close tab · cash" once a tab is open.
- **Diner** — a calm "Tab open — settle when you're ready" state and a "Settle tab" CTA on `/cart`.

### Changed — S2-polish: the deferred S2-audit sweep (2026-06-23)

The remaining `docs/S2_AUDIT.md` should-fixes, landed in one pass. Migration `20260622100000`.

- **S3 / S7 (SQL)** — `mms_now()` gives the KDS a DB-clock grace cutoff (no app/DB skew double-pull); a new
  `fire_batch uuid` makes "one Undo = one Send" **structural** — `mms_fire_cart` stamps one id per send and
  `mms_undo_fire` reverses exactly the latest in-grace batch (not a `max(fire_at)` tie). Comped lines stay
  excluded from undo.
- **gate-reason (SQL)** — `mms_void_line` / `mms_request_approval` snapshot why they gated
  (`comp`/`cooked`/`ceiling`/`solo`) into `mms_approvals.gate_reason`, so the audit ledger is reconstructable
  even if `mms_loss_config` later changes.
- **S9** — the polled staff boards (KDS, Approvals, table Detail) surface a "Reconnecting — showing the last
  known …" signal after 2 consecutive poll failures, so a frozen board can't masquerade as live.
- **S11 / S14 (LossActionSheet)** — with no manager signed in, "Request a manager's approval" becomes the
  primary action (the PIN path can't complete); a missing reason now shows an inline "Pick a reason to
  continue" validation instead of a silently-disabled CTA.
- **S12 / S13 (refactors)** — a shared `DINER_STATE_COPY`/`STAFF_STATE_COPY` line-state vocabulary, and a
  shared `<ManagerPinStepUp>` (manager select + PIN + lockout + PIN-failure copy) de-duplicating the
  LossActionSheet/ApprovalsBoard step-up.

### Added — S2.4: the approvals primitive (request → approve/deny → audit) (2026-06-22)

Generalizes S2.3's manager-present void/comp into a full **request → approve/deny → audit** flow with
**default-safe `pending` states** (D1–D4). Migration `20260622080000`. **Completes S2.**

- **`mms_request_approval`** — when no manager is at hand, a server requests a gated void/comp. Creates a
  **`pending`** `mms_approvals` row and **does not touch the line** (still charged, food not un-fired — the
  default-safe state, D2). Refuses if the action is server-solo (`no_approval_needed`) or the line is
  already voided/comped. A **partial unique index** (`line_id WHERE status='pending'`) blocks a second open
  request per line (`already_pending`, D4).
- **`mms_resolve_approval`** — a manager's decision: **approve** applies the recorded action (void→`voided`
  / comp→`comped`) + flips the row `approved`; **deny** flips `denied` and leaves the line live. Resolves a
  row **only once** (idempotent on `pending`, D4); the approver must be an **active `manager`/`owner` ≠ the
  requester** (D3, re-checked in SQL). Approve requires the line still on an open cart (a settled-line refund
  stays the S4.3 seam); an already-applied line is a benign idempotent close.
- **`/staff/approvals`** — a manager-gated live queue (`ApprovalsBoard`, **polled** every 5s since the audit
  table is owner-read RLS and off the realtime publication) with per-request Approve/Deny via the manager-PIN
  step-up. A manager+ nav link on the floor with a pending count.
- **`LossActionSheet`** gains a **"Request approval"** path for gated actions (no PIN — the deferred sibling
  of "approve now"). The staff drill-down shows **"Approval requested"** on a line with an open request, so a
  second request can't stack. Owner-remote/SMS stays deferred — the `pending` states make it a notify-add.
- **Merge ↔ pending guard** (caught in pre-PR review): a one-tap table merge now **supersedes** any pending
  request on the source cart in the same transaction — so a merged-away line can't have its void/comp later
  applied to the wrong (target) table with a misleading audit. A `superseded` terminal status keeps the
  ledger honest (it wasn't a manager's denial); the loss can be cleanly re-requested on the merged table.

### Added — S2.3: loss-gated voids/comps + the first durable audit ledger (2026-06-22)

Server-initiated **void** (cancel + remove) and **comp** (free, kitchen still makes it) on a fired line,
gated by loss, with a two-party audit. Migration `20260622060000`.

- **The loss gate is SERVER-derived** (never client-asserted): a void of a `fired`-but-uncooked line under
  the ceiling → **server-solo + reason** (~zero loss, no PIN — avoids PIN-fatigue). A **cooked** line
  (`in_progress`/`served`), any **comp** (a giveaway), or any value **over the ceiling** (`$20` absolute,
  tunable in `mms_loss_config`) → **manager-PIN step-up**. `cooked?`/`loss` come from the line's state +
  value in `mms_void_line`, never the request body.
- **Manager step-up reuses `mms_staff_verify_pin`** (lockout-counted): the server taps the manager's name →
  the manager enters their PIN. A `server`-role PIN is **rejected even when correct**, and the approver
  **can't be the initiator** (no self-approval) — both re-checked in SQL.
- **`mms_approvals`** — the first **durable, append-only** audit ledger (the S2.4 approvals primitive,
  void as consumer #1): initiating server + authorizing manager + line + reason + amount + cooked flag,
  written **in the same transaction** as the state flip (no audit ⇒ no void). RLS default-deny, owner-read.
- **A voided/comped line is charged $0 everywhere** — `getCartTotals`, both promo RPCs, the cash-settle
  reconcile, and all three order-snapshot copies exclude `state='voided' OR comped`, so a void can't be
  silently charged and a comp re-derives the total correctly. The diner cart shows a **"Removed"** /
  **"Comped"** chip with a struck price; split shares exclude them so no one pays a removed item's share.
- **Staff UI:** post-fire lines on the table drill-down swap the qty stepper for a **Void / Comp** action
  (`LossActionSheet` — reason picker + manager name-picker + PIN, reusing the S1.1b PIN pattern); refused
  mid-payment (shared mutex). Refunding an **already-captured** line is out of scope here — it rides S4.3.
- **a11y:** the sheet's action/reason are `role="group"` + `aria-pressed` toggles (the app's segmented
  convention), the manager is a labelled `<select>`, the PIN reuses the numeric pattern, ≥44px targets,
  one live region; voided/comped lines are struck + badged on the staff drill-down too.
- **Merge guard** (`20260622070000`): `mms_merge_table_orders` now skips voided/comped lines on both the
  source and target scans, so a one-tap table merge can't fold a voided line's qty into an active target
  (re-charge) or an active line into a comped/voided target (giveaway) — a gap S2.3 made reachable.

### Added — S2.2: post-fire "Ask server" + server-clocked undo grace (2026-06-22)

Thread the real line state into the diner cart and give the host a 10s undo on a send.

- **`mms_fire_cart` now stamps `fire_at = now() + 10s`** (the undo grace; Min's S2 decision, ORDER-MODEL
  default 5s). The KDS already reads only `fire_at <= now()` (S2.1b), so a just-sent line is visibly
  **`fired`** to the table but **invisible to the kitchen** until its grace elapses. Migration
  `20260622050000`.
- **`mms_undo_fire(cart)`** — atomic, grace-gated batch `fired→draft` (+ `fire_at=null`): reverses only the
  **latest in-grace batch** (`fire_at = max(in-grace fire_at)`, cart-`open` + dine-in guarded), so a rapid
  fire-A-then-fire-B never lets one Undo silently claw back batch A; a line whose grace already passed is
  left `fired` (the kitchen has it → removal routes to a void, S2.3). INVOKER + service-role-only.
- **`canMutateLine` now keys on the real `line.state` everywhere** — `getCartView` threads `state` +
  `fire_at` into `CartItem`; a `draft` line keeps its stepper, a fired/cooking/served line shows a state
  chip (**"Ask a server"**) in its place. Fixes the solo-dine-in gap where a fired line stayed editable in
  the UI. `LineState` is now canonical in `@mms/db` (cart + the isomorphic gate share one definition).
- **"Sent ✓ — Undo (Ns)"** window on the host's send button — counts down the **server-measured** grace
  (`undoUntil − serverNow`, from this client's receipt, so client-clock skew can't lengthen it); Undo
  re-checks the grace server-side (`expired` ⇒ honest "ask a server"), so a drifted client clock can't
  extend it either. Re-syncs the cart on send/undo (solo dine-in isn't on the realtime channel).
- **a11y:** state chip ≥44px with a visually-hidden "ask a server" hint (real text, not an `aria-label` on
  a bare span); the countdown lives in the button label, **not** the live region (no per-second SR flood);
  focus moves to the heading only when a replaced stepper actually drops focus to `<body>` (B4).

### Added — S2.1b: fire mechanism + KDS + bump (2026-06-22)

The kitchen loop on the S2.1a spine: send-to-kitchen → live fire queue → two-stage bump.

- **`qr_cart_items.fire_at`** — the ONE unified fire timer (S2_DESIGN spine #3). Dine-in stamps `now()`
  on send (immediate); pickup's scheduled per-line fire is the S4.2 seam. Partial KDS index on
  `(fire_at) where state in ('fired','in_progress')`. Migration `20260622040000`.
- **`mms_fire_cart(cart)`** — one atomic statement: `draft→fired` + `fire_at=now()` for the cart's draft
  batch, **only** while the parent cart is `open` **and** the session is **dine-in** — so a paid/cancelled
  cart fires 0 (A3), grocery `scango` never fires (A5, locks at payment), pickup's scheduled fire is
  excluded, and a re-send is a clean no-op (A2, no double-fire). INVOKER + service-role-only.
- **KDS console** at `/staff/kitchen` (`lib/kitchen.ts` · `KdsBoard`) — the live cross-table fire queue
  grouped into per-table tickets, oldest-first, on the proven S1.2 `postgres_changes` read path (no
  broadcast/privatization). Cook bumps **Start** (`fired→in_progress`) → **Ready** (`in_progress→served`,
  drops off) via the shipped `mms_line_transition`; a stale tap on an already-bumped line is a benign
  "already updated". Only lines past their `fire_at` show (so the S2.2 undo grace keeps a just-sent line
  off the line until it expires).
- **Diner "Send to kitchen"** (dine-in **host**, `cart.ts` `sendToKitchen` + `SendToKitchenButton`) and a
  staff **fire from the console** (`staffFireCart`) — both fire via `mms_fire_cart` (server re-enforces
  host/dine-in/cart-open). Honest confirmation, no fabricated ETA; the ~10s "Sent! — Undo" grace lands in
  S2.2.
- Diner post-fire edit rejection is now **honest** ("Ask a server to change an item that's already gone to
  the kitchen") — the full client-side disable + undo arrive in S2.2.
- Verified on the local stack (fire dine-in/grocery/pickup/non-open/re-send + the bump chain + grants +
  index); gate green; types regenerated. Migration **pending a live apply**.

### Added — S2.1a: line-state spine (2026-06-22)

The pre-settlement line lifecycle the kitchen-trust layer (S2) is built on — spine only, no UI/firing yet.

- **`qr_cart_items.state`** (`draft|fired|in_progress|served|voided`, default `draft`, DB `CHECK`) — the
  line's kitchen-life lives on the open cart (which _is_ the table order until settle), not `qr_orders`.
  Existing rows backfill to `draft` (nothing fired pre-S2). Migration `20260622030000`.
- **`mms_line_transition(line, to_state)`** — the legal-edge graph in SQL (`draft→fired→in_progress→served`,
  `fired→draft` undo, `→voided` from any non-settled state); a single atomic UPDATE that matches only a
  legal from-state **and** a parent cart `status='open'`, so an illegal jump / terminal-state mutation /
  non-open cart is a 0-row no-op (never a silent overwrite). INVOKER + service-role-only grant (the
  cart-RPC precedent; avoids advisor 0029).
- **`canMutateLine` v2** (`apps/qr/lib/permissions.ts`) — **staff are now a first-class actor**. A diner may
  edit only an OWN, still-`draft` line; post-fire editing is staff-only (fixes the M3 placeholder that let a
  diner "host" edit fired food). Threaded through the diner server path (`assertCartItemMember` now returns
  `lineState`; `cart.ts` passes the real state) so firing (S2.1b) can never outpace the gate.
- Verified on the local stack (all legal/illegal/terminal/non-open transitions + the backfill + grants);
  types regenerated; gate green. Migration **pending a live apply**.
- **S2 open decisions confirmed** (see `docs/S2_DESIGN.md`): manager taps-name→PIN · console-view KDS ·
  20%/$20 loss ceiling · 10s per-batch undo grace.

### Fixed — S1 audit S2 + S7: session-gated settlement + staff-provisioning hardening (2026-06-22) — audit closeout

Closes the last two audit SHOULD-FIX items.

- **S2 — session-gate cash settle + merge** (migration `20260622020000`): `mms_fulfill_cash_order` and
  `mms_merge_table_orders` only checked the cart was `open`, not that its `table_sessions` row was still
  open. The background sweeper (`mms_sweep_expired_sessions`) closes an idle session **without** cancelling
  its cart, so an `open` cart can outlive its session — letting a cash settle or a merge record against a
  closed table (the invariant previously lived in `clearTable`'s ordering, which the sweeper bypasses).
  Both RPCs now fold `exists(table_sessions … status <> 'closed')` into the atomic claim / open-count
  check. The **card** path (`mms_fulfill_order`) is intentionally left ungated — a captured Stripe charge
  must fulfill regardless of session state (its guard is the cart-status claim). Verified on the local
  stack: open-session settle succeeds; closed-session settle/merge refuse, cart left untouched.
- **S7 — staff-provisioning hardening** (`staff-actions.ts`): owner provisioning (a) leaked account
  existence ("that email already has an account") — now a **generic** "couldn't create" message (no
  existence oracle); (b) had **no rate limit** — now a coarse per-owner `mms_rate_limit` (20/hour, the
  existing generic limiter); (c) wrote **no audit trail** — now emits PostHog audit events
  (`staff_provisioned` / `staff_deactivated` / `staff_reactivated`), parity with clear/merge/settle.
- **S1 retrospective audit fully remediated** — both blockers (B1, B2) and all seven SHOULD-FIX (S1–S7)
  closed; see `docs/S1_AUDIT.md`.

### Fixed — S1 audit B3 + a11y batch: staff floor accessibility (2026-06-22)

No-migration accessibility/UX pass over the staff floor drill-down.

- **B3 — `RoleBadge` contrast** (`RoleBadge.tsx`, `tokens.css`): role-chip text used the vivid
  `--gold`/`--jade`/`--ac` on their own 14–16% tint — measured **1.83:1** (owner gold), 4.04 (server),
  4.73 (manager): two sub-AA. Text now uses the `-strong` token (added `--gold-strong`/`--jade-strong`
  alongside the existing `--ac-strong`); the vivid hue stays on the decorative (aria-hidden) dot for the
  color identity. Re-measured: **5.21 / 5.19 / 5.92** — all clear AA.
- **S4 — sold-out `+`** (`StaffLineEditor.tsx`, `floor.ts`, `floor-types.ts`): an 86'd line still showed a
  live increment. `TableLineView` now carries `soldOut` (resolved from `menu_items.is_sold_out` via the
  line's `menu_item_id`); the `+` is disabled with an honest accessible name ("… is sold out — can't add
  more") and a visible "· Sold out" tag. Decrease/remove stay available.
- **S5 — dual live regions** (`ClearTableButton.tsx`): its error was a second `aria-live="polite"` region
  on a view that already has one (the shared line-edit status). Switched to an assertive `role="alert"`
  rendered only on error — parity with its siblings (CashSettle/Merge), leaving exactly one polite region.
- **S6 — dropped focus** (`ClearTableButton.tsx`, `CashSettleButton.tsx`, `MergeTableButton.tsx`): focus
  fell to `<body>` when a confirm/step panel mounted/unmounted. Focus now moves into each panel as it
  opens and returns to the trigger on cancel/close (first-mount guarded) — WCAG 2.4.3, parity with
  `FloorDetailLive`'s line-remove focus move.

### Fixed — S1 audit B2/S1/S3: money atomicity + fulfillment completeness (2026-06-22)

Closes the audit's second blocker (the card-after-cash double-charge) plus the fulfill-claim TOCTOU and
the stranded-charge recovery gap — and restores two behaviors a prior redefinition had silently dropped.

- **B2 — card-after-cash double-charge** (`apps/qr/lib/staff-cart.ts`): `settleCash` now **atomically
  acquires the settlement freeze** (`acquireSettlement`) before deriving totals, releasing it on every
  exit. `acquireSettlement` flips `settle_at` only when the cart is open **and** `locked=false`, and
  `acquireCartLock` already requires `settle_at` null/stale — so cash and card are now mutually exclusive
  in **both** directions. Previously a diner could begin + capture a card payment during the
  `getCartTotals→RPC` window, and the late webhook would orphan that charge.
- **S1 — atomic fulfill claim** (`mms_fulfill_order`): replaced the non-atomic `exists(open)` check +
  separate trailing `update` with a single `update … set status='paid' where status='open' returning
session_id` claim (parity with the cash twin) — closing the TOCTOU where a concurrent cash settle
  between the two statements could double-record.
- **Regression fixes (introduced by S1.3's redefinition of `mms_fulfill_order`):** restored the cart's
  **`pickup_slot`/`fire_at` copy** onto the order (broke `/track`'s pickup ETA + the S2 KDS `fire_at`
  seam for card orders) and the **`mms_promo_consume` call** at fulfillment (promo redemptions weren't
  recorded → per-session/global caps under-counted). Added promo-consume to the **cash** twin too, for
  cap integrity on a cash-settled promo cart.
- **S3 — durable refund-needed ledger** (`qr_refunds_needed`, migration `20260622010000`): on the
  cross-tender branch the webhook now records the captured-but-orphaned PI (idempotent on the PI,
  best-effort) so an operator / S4.3 auto-refund has a recovery surface — telemetry alone stranded the
  charge. Service-role-only (default-deny RLS).
- Money path verified on the local stack (atomic claim · idempotent-on-PI · cross-tender raise → 1 order ·
  pickup_slot/fire_at copied · promo redemption recorded · ledger default-deny); types regenerated; gate
  green. **Needs a live migration apply** (additive/idempotent).

### Fixed — S1 audit B1: `is_staff()` unverified-email RLS escalation (2026-06-22)

The S1 retrospective audit ([`docs/S1_AUDIT.md`](docs/S1_AUDIT.md)) found the SQL `is_staff()` /
`is_staff_at_least()` email-allowlist branch trusted the **raw JWT `email` claim** with no verification —
and because RLS/Realtime evaluate it **directly** (bypassing the app's `getStaffAuth` `email_confirmed_at`
check), a session asserting a provisioned staff email could **read every active table's diner data + the
staff roster**. Writes were never exposed (mutations go through `requireStaff`).

- **Fix** (`20260622000000_is_staff_email_verified.sql`): the email branch now resolves through a
  `staff_session_email_match()` SECURITY DEFINER helper that reads `auth.users` for the current
  `auth.uid()` and requires the email be **confirmed** (`email_confirmed_at`) **and** from a
  provider-verified **OAuth** identity (`provider <> 'email'`) — never the spoofable claim. Provisioned +
  bootstrapped staff (and OTP sign-ins into their pre-created user) still match by `user_id = auth.uid()`,
  unaffected. Verified on the local stack across five identity scenarios; types regenerated; gate green.
- **⚠️ Binding backstop is live auth config (Min):** disable public email/password signup (staff are
  admin-provisioned; diners use anonymous sign-in) **or** turn email confirmations ON, and restrict the
  Google provider to the workspace domain with automatic cross-provider linking off. Under
  confirmations-OFF auto-confirm, the `provider <> 'email'` guard is what holds the RLS layer.

### Added — S1.4 soft convergence (one-tap table merge) (2026-06-21)

The recovery for a double-order (a guest scans **and** tells the server). The ORDER-MODEL convergence is
**soft/advisory** — phones, the staff POS, and the kiosk all write the same table session, the floor shows
table state, and the cleanup for the occasional parallel order is a **one-tap merge**, not a billing dispute.

- **One-tap merge** (`MergeTableButton` on `FloorDetailLive` → `mergeTables`): from a table's drill-down a
  server folds **this** table's open order into another, then this table closes. Pick a same-mode candidate
  from a legible list (label · item count · party), confirm, and the lines move. **Any active staff** may
  merge (a non-loss turnover cleanup, like clear-table — no manager-PIN; that step-up is reserved for S2's
  loss-gated voids/comps/refunds); logged non-PII (`staff_merge_tables`: role, units moved, both sessions).
- **Server-authoritative, atomic** (`mms_merge_table_orders`): re-parents **already-server-priced** lines
  (never recomputes or trusts a client price) — bumps an identical target line (same item + normalized,
  order-independent modifier set) when it stays within the 99-per-line cap, else re-parents it as its own
  line so **no units are ever dropped**; moved lines lose seat attribution (`by_seat = null`). Both carts are
  row-locked and must still be `open`, so a concurrent settle/clear loses the race cleanly. The action refuses
  a closed/paid table, a cross-mode merge (per-line tax basis is dine-in vs to-go), or either side mid-payment
  (shared `pay-guard` mutex). Source cart → `cancelled`, source session → `closed` (the diner-side guards
  already honor both, so a racing source-diner write lands on a closed door).
- **Honest scope:** the system can't auto-detect that two labels are one physical table (the sticker
  `qr_code` is the only identity and it's unique per active session), so convergence is an **explicit** staff
  tool over the floor's legibility (S1.2), not a fabricated divergence alarm. **Session expiry** is already
  covered (`mms_sweep_expired_sessions` on pg_cron + the `expires_at` floor filter + sliding renewal, P3.4).
- **DB:** migration `20260621160000_table_merge.sql` (one SECURITY DEFINER fn, `revoke … from public, anon,
authenticated` + `grant … to service_role`); types regenerated. Money path verified on the local stack
  (merge, identical-line bump across modifier order, 99-cap re-parent with no unit loss, non-open/same-cart
  raises, grant lockdown). **Completes S1 (staff & floor).**

### Added — S1.3 staff write + cash settle ("order for a guest" · "pay a human") (2026-06-21)

The door for humans (ORDER-MODEL): the cart belongs to the **table**, not the phone, so staff write the
**same** order ledger a diner does — and "pay a human" / cash is a deferred-settlement of that one order.

- **Staff order for a guest** (`/staff/table/[id]`, `FloorDetailLive` + `/staff/table/[id]/add`): from the
  drill-down a server can **add items** (the same public catalog as the diner menu, base item — no modifier
  tier, parity with `AddButton`), **bump qty / remove** lines (qty steppers; staff have authority over
  **any** line — no `canMutateLine` restriction, unlike a guest). Pricing stays **100% server-authoritative**
  — the client sends only item ids, never a price — via the shared `lib/order-lines.ts` (`priceItem` +
  `insertOrIncLine`, extracted from `cart.ts` so the diner and staff paths can't drift). Staff-added lines
  carry `by_seat = null` ("added by server", unassigned for the by-person split).
- **Settle in cash** (`CashSettleButton` → `settleCash`): records the table order as paid with `tender='cash'`,
  no Stripe. `getCartTotals` (the single tax engine) derives the authoritative total — `subtotal − discount
  - service + tax`, **`tip=0`** (a cash tip is in-hand/off-system) — and `mms_fulfill_cash_order`snapshots it:
**idempotent on`cart_id`** (partial-unique index), **atomic `open→paid` flip**, and a **subtotal reconcile**
    (re-derives Σ lines in SQL vs the passed breakdown) so a diner racing the settle raises instead of recording
    a stale total. The **SB-1524 5% service charge\*\* is applied + disclosed; the confirm shows the all-in amount.
- **Shared payment mutex** (`lib/pay-guard.ts`, `paymentInFlightReason`): clear-table (refactored onto it),
  staff write, and cash settle all refuse while a card payment / split settlement is in flight (fresh
  single-pay lock, open split freeze, or any authorized/captured share) — so cash can't double-charge a table
  and a write can't change a total a diner is paying. The card path (`acquireCartLock` requires `status='open'`)
  can't start after a cash settle; cash is refused while the lock is held → no card-vs-cash double-charge.
- **Logged, non-PII** (PostHog, decoupled via `after()`): `staff_added_item` / `staff_settle_cash` (role, not
  name; total + item count) for the turnover/audit trail. The durable two-party audit table arrives with S2.
- **Schema** (migration `20260621150000`, additive/guarded): `qr_orders.tender` (`card`|`cash`, default
  `card` backfills existing), `cart_id` (cash idempotency + traceability), `settled_by` (→ `staff.user_id`);
  the cash RPC is `revoke … from public` + `grant … to service_role`. RLS unchanged (diners read only their
  own session's orders, cash included). Verified on the local stack: happy path, idempotent retry,
  subtotal-mismatch raise, double-settle raise.

### Added — S1.2 staff floor view (live per-table state + read-only drill-down + clear-table) (2026-06-21)

The "legible table state" that makes soft multi-door convergence work (ORDER-MODEL): a server glances at
`/staff` and sees the whole room, live.

- **Live floor** (`/staff`, `FloorBoard`): every **active** table (status='active' AND not past its TTL —
  the same liveness `is_member` uses) as a card — label (`qr_code`), mode, **status** (seated / ordering /
  paying / splitting / paid), party + host, a **running pre-tax subtotal** (honest "so far" — NOT a charge;
  the authoritative total/tax is derived at checkout, so we don't re-run the tax engine per table on the
  hot path nor mirror the rule in SQL) or the authoritative `qr_orders.total_cents` once paid, and relative
  last-activity. Kept live by **Postgres-Changes** (`useFloorRealtime`) authorized by the **existing
  `is_staff()` SELECT RLS** S1.1a folded into the session/cart/order tables — Realtime enforces it
  per-subscriber, so a staff socket sees every table and a diner sees none. Non-private channel (reads are
  RLS-gated); a staff _broadcast_ push (S2 KDS→floor) is the only thing that would need a
  `realtime.messages` is_staff() policy. 400ms-debounced re-fetch of the server-authoritative snapshot + a
  5s poll backstop + subscribe-time self-heal (parity with the group-cart board).
- **Read-only drill-down** (`/staff/table/[id]`, `FloorDetailLive`): the party and the actual cart lines
  (with split attribution), kept live by watching the open cart's `qr_cart_items` by `cart_id` (nothing
  bumps `qr_carts.updated_at`, so last-activity + the live refresh key off the latest line, not that
  column).
- **Clear table** (`clearTable`): staff turnover — closes the session + cancels the open cart so a ghost
  cart never carries to the next party. Any active staff (routine turnover, **not** a loss action → no PIN,
  unlike an S2 void); two-step confirm; **refuses while a payment is in flight** (a fresh single-pay lock /
  split freeze) **and** if any split share is already `authorized`/`captured` (so a stale-but-committed
  split can't be cancelled out from under a capture → no charge-with-no-order). Logged non-PII via PostHog
  (`after()`-decoupled); the durable two-party audit table lands with S2's approvals primitive.
- All three reads + the write are `requireStaff()` + service-role (the cross-table floor is staff-only by
  design, so the gate is at the action, not RLS rows); inputs Zod/uuid-bounded. Migration
  `20260621140000_floor_realtime.sql` adds `table_sessions` + `session_members` to the realtime publication
  (publication membership only — no schema/type change). Adversarial subagent: PASS (F1 live-update
  correctness + F2 split-share clear guard + F3 id validation fixed pre-PR).

### Added — S1.1b staff PIN (shared-tablet fast-path + the S2 step-up primitive) (2026-06-21)

A per-person **PIN** for a shared floor tablet, built as "sudo on the existing role model" (ORDER-MODEL):
a staff member signs in for real (S1.1a magic-link / OAuth / OTP) once, then sets a PIN so they can
re-authorize on the shared device without another email round-trip. The verify-with-lockout function is
the **same primitive S2's manager step-up** (cooked-item void / refund) will reuse.

- **Secret isolation:** the bcrypt hash lives in its OWN service-role-only table `staff_pins` (RLS
  default-deny, `revoke … from anon, authenticated`), NOT a column on `staff` — `staff` is
  client-readable by self/owner, so a `pin_hash` column would be reachable; a separate table keeps it
  off every client read surface (the `rate_events`/`promo_attempts` pattern). Hash is bcrypt via
  pgcrypto (`extensions.crypt`/`gen_salt('bf',10)`).
- **Atomic verify + lockout** (`mms_staff_verify_pin`, SECURITY DEFINER, `search_path=''`): an advisory
  xact lock keyed by the staff id serializes concurrent attempts so the counter can't be raced; **5**
  consecutive misses → a **15-minute** lockout; a lapsed lockout grants a fresh budget; a correct PIN
  resets. Returns one of `ok | wrong | locked | no_pin` + remaining attempts / lock expiry. **Fail-CLOSED**
  in the app wrapper (an RPC error reads as `error`, never a pass — it guards a privileged step-up).
- **Keyed by the resolved staff-row PK** (`StaffCaller.staffId`), not the session uid — an email-matched
  Google/magic-link session whose uid differs from the provisioned row still lands on the right PIN.
- **Set / rotate / remove** self-service at `/staff/profile` (`PinManager`); 4–8 digits, trivial PINs
  (all-same / consecutive runs, any length) rejected; bounded by Zod **and** the SQL `pin_format` CHECK.
- **Shared-tablet lock** (`/staff/lock`): a "Lock" control sets an httpOnly, path-scoped cookie and the
  staff shell (`/staff`, `/staff/team`, `/staff/profile`) redirects there until the SAME member re-enters
  their PIN. Documented honestly as an **attribution / quick-privacy affordance, not a hard boundary**
  (the Supabase session + staff-row gate remain the real boundary). Escapes: "Forgot PIN? Sign out", and
  lock is refused unless a PIN is set (no stranding). Lockout shows a live countdown; one live region per
  view, 44px targets, decorative glyphs `aria-hidden`.
- All three fns locked down (`revoke … from public, anon, authenticated` + `grant … to service_role`).
  Migration `20260621130000_staff_pin.sql` (additive); types regenerated. Adversarial subagent **PASS**.

### Fixed — staff OTP resend loop (per-address cooldown; 429 steers to Google) (2026-06-21)

The "Too many code requests. Wait a minute…" loop on `/staff/login` was **not** a hanging Send-Email Hook
(auth logs show GoTrue's `/otp` durations are all sub-second) — it's GoTrue's own
**`over_email_send_rate_limit`** (429), the email rate limit that fires _before_ the hook (so unrelated to
Resend). The code enabler: `StaffLogin`'s 60s resend cooldown was reset on **every keystroke**, so editing
the email even one character wiped the gate → an instant re-tap → tripping the limit. The cooldown is now
**scoped to the address it was sent to** (clearing-and-retyping the same address can't wipe it; a genuinely
different address sends freely). The 60s "Resend in Ns" countdown now appears only after a **successful**
send (where ~60s is the honest per-address window); a **429 instead blocks the address and steers to
Google** (no email, never rate-limited) rather than arming a 60s countdown that would just re-enable into
the same hourly cap. A send error also returns focus to the email field (it was stranded on the disabled
button), and the status region is `aria-describedby`-linked so it's read on that focus. The real unblock is
a config change — raise Supabase → Auth → **Rate Limits → "Rate limit for sending emails"** (`docs/ENV.md`).

### Fixed — OTP code input accepts the token as-issued; magic link restored (2026-06-21)

The real cause of "code doesn't match" was the **input**, not the link: `StaffLogin` stripped non-digits
(`replace(/\D/g,"")`), capped at `maxLength={6}`, and required exactly 6 chars — so a token that's longer
or not purely numeric (Supabase's OTP length is configurable) could never equal the issued token. The
input now accepts the token as-issued (strips whitespace only, no digit-strip, no 6-cap, `length >= 6`).
The **magic link is restored** in the auth email (it wasn't the problem — #41's code-only build still
failed, which is what isolated this to the input). `tokenLen` is still logged for confirmation.

### Fixed — auth email is code-only (OTP `otp_expired`) (2026-06-21)

The OTP code kept failing "doesn't match" (`otp_expired` in the auth logs) while the magic link
sometimes worked: the 6-digit code and the magic link are **one single-use Supabase token**, and Gmail
**pre-fetches the link** (observed as a Google-IP `GET /verify` consuming the token) before the code can
be typed. The Send-Email Hook (`/api/auth/send-email`) now sends a **code-only** email — no magic link
to pre-consume — so the typed code stays valid. One-click sign-in remains via Google OAuth. (A
non-secret `tokenLen` is logged so any future mismatch is diagnosable.)

### Added — Polished auth emails via Supabase Send-Email Hook + React Email (2026-06-21)

Makes magic-link/OTP work reliably with polished templates (delivery-app stack), and removes the SMTP
pain entirely: auth emails now route through a **Supabase Send-Email Hook** to our app, which renders a
**React Email** template and sends via the **Resend API** — no SMTP to misconfigure (this is what was
causing the Gmail `534`/500) or rate-limit.

- **`/api/auth/send-email`** — the Send-Email Hook endpoint. Verifies the Standard-Webhooks (Svix)
  signature (`SEND_EMAIL_HOOK_SECRET`) + a ±5-min replay window via a shared `lib/standard-webhook.ts`,
  then renders + sends. The **6-digit code is the hero** (typed on `/staff/login`, immune to email
  link-prefetchers that consume a single-use magic link — the `otp_expired` we were hitting); the magic
  link is a secondary button. A send failure returns 500 so GoTrue surfaces it (the user is waiting).
- **React Email templates** (`apps/qr/emails/`, `@react-email/components` + `/render`, same as the
  delivery app) — a shared brand `MmsEmailLayout` + `AuthCodeEmail`, and the staff **invite/deactivation**
  emails migrated off inline HTML to React Email (`lib/email.ts` → `lib/email.tsx`). Brand-aligned
  (literal palette — email's sanctioned token exception).
- **Config** (you): enable the Send-Email Hook in Supabase + set `SEND_EMAIL_HOOK_SECRET` (`docs/ENV.md`
  "Email"). No SMTP needed.

### Added — Staff Google OAuth + email allowlist (2026-06-21)

Staff sign-in now supports **Google OAuth** alongside magic-link + OTP — and Google sidesteps the SMTP
issues entirely (the built-in Supabase sender was rate-limited, then misconfigured to Gmail → `534`/500).
All three methods resolve to the same **email allowlist**, so identity is robust across auth methods.

- **Migration `…120000_staff_oauth_email`** (additive, non-destructive) — `staff` gains an `email`
  column (unique on `lower(email)`); `is_staff()` / `is_staff_at_least()` / `staff_read_self` now match
  **`user_id` OR the verified email claim** (`auth.jwt()->>'email'`). So a Google/magic-link sign-in that
  mints a fresh uid still resolves to the provisioned row by email; `user_id` stays the PK (provisioning
  unchanged, OTP `shouldCreateUser:false` still works). Anon diners carry no email claim → no match.
  Applied to live + advisor-clean (anon still can't execute the helpers).
- **`StaffLogin`** — "Continue with Google" (`signInWithOAuth`) above the email path; `signInWithOtp` now
  sets `emailRedirectTo` so the magic **link** lands on the new **`/staff/auth/callback`** route (PKCE
  `exchangeCodeForSession` → `/staff`); the OTP **code** still verifies in-page (cross-device-safe).
- **Provisioning** — `provisionStaff` stores the (lower-cased) `email` on the row; `getStaffAuth` and the
  self-deactivation guard match by uid **or** email (a Google session uid can differ from the row's), and
  the deactivation notice now reads the row's stored email (no `getUserById`). Team view shows the email.
- **Config** (you): Google Cloud OAuth web client + Supabase Google provider + redirect URL — see
  `docs/ENV.md` "Staff sign-in" + the simplified owner bootstrap.

### Added — Resend email-events webhook (2026-06-21)

- **`/api/resend/webhook`** — a signed, public endpoint for Resend email events (delivered / bounced /
  complained / …). Verifies the **Svix** signature (`RESEND_SIGNING_SECRET`, via `node:crypto` — no new
  dep) + a ±5-min replay window before trusting anything, then **flags bounces/complaints** in server
  logs (the actionable "an invite didn't land" signal — masked recipient + opaque `email_id`, never the
  raw address) and captures **PII-free** deliverability events to PostHog. Idempotent + fail-safe (200
  after verify; a processing hiccup never triggers an endless retry); drains analytics via `after()`.
  Mirrors the Stripe-webhook conventions; the middleware matcher already skips `/api`.
- **Prod-domain fallback** — `siteUrl()` (email links) now falls back to `https://qr.mandalaymorningstar.com`
  (the real prod domain) when `NEXT_PUBLIC_SITE_URL`/`VERCEL_PROJECT_PRODUCTION_URL` are unset. Docs
  (`ENV.md`, `HANDOFF.md`) gain `RESEND_SIGNING_SECRET` + the webhook-setup step.

### Added — Staff email (Resend) + login hardening (2026-06-21)

Follow-up to S1.1a after owner sign-in hit Supabase's built-in email rate limit (429) and the magic-link
email shipped only a link, not the OTP code the UI expects.

- **Resend transactional email** (`apps/qr/lib/email.ts`, same `resend` SDK as the delivery app) — a
  fail-safe wrapper (never throws into the caller; unset keys = skipped + logged) sending two staff-
  lifecycle emails, both fired from `after()` so a Resend outage never fails the mutation: an **invite**
  on `provisionStaff` ("you've been added as {role}, sign in here") and a **deactivation notice** on
  `setStaffActive(false)`. Owner-entered name is HTML-escaped; links use `NEXT_PUBLIC_SITE_URL`
  (falls back to the Vercel URL). Email colors are literal brand values (clients can't use `@mms/ui`
  tokens — the one sanctioned exception).
- **Login hardening** (`StaffLogin`) — a **429 is now distinguished** from a bad address ("too many
  requests, wait a minute" vs "check it's your staff address"), and a **60-second resend cooldown**
  with a live countdown (`Resend in {n}s`) stops users re-tripping the rate limit.
- **Docs** — `docs/ENV.md` gains the Resend/SMTP env (`RESEND_API_KEY`/`RESEND_FROM`/`NEXT_PUBLIC_SITE_URL`)
  - an "Email" section: auth emails go via **Supabase Auth → SMTP pointed at Resend** (with the
    `{{ .Token }}` template fix + rate-limit raise), app email via the SDK. Added to the HANDOFF activation
    checklist (required for staff login to work at volume).

### Added — S1.1a Staff identity, roles & RLS (2026-06-21)

The foundation of the **service-model track** ([`docs/context/ORDER-MODEL.md`](docs/context/ORDER-MODEL.md)):
a staff console at `/staff`, distinct from anonymous diners. Staff are **real accounts** (magic-link /
email-OTP) with a role (**server < manager < owner**) and a stable `auth.uid()` — the per-person identity
the S2 two-party void audit will need. The order ledger stays shared: one table-owned cart that diners,
and now staff, both read. Migration applied to the QR project + advisor-checked; RLS verified behaviorally
(staff reads any table ✓, non-member diner blocked ✓, diner's own session unbroken ✓). Fresh-context
adversarial subagent run pre-PR (verdict: ship with fixes — all landed).

- **Migration `…100000_staff_identity`** — `staff` table (`user_id`→auth.users, role CHECK, name CHECK
  1..80, `active`); `is_staff()` / `is_staff_at_least(min_role)` SECURITY DEFINER helpers mirroring
  `is_member` (search_path pinned, `auth.uid()` wrapped, **revoked from public AND `anon` by name** —
  Supabase default privileges grant `anon`/`authenticated` EXECUTE explicitly, so `from public` alone
  leaves the anon grant; granted to `authenticated` for policy evaluation). RLS extended **additively** —
  `or public.is_staff()` folded into the six session-scoped SELECT policies via `ALTER POLICY` (one
  permissive policy per role/action; no advisor 0006). `staff` RLS = self-or-owner read; writes
  service-role only.
- **Auth surface** — `/staff/login` passwordless OTP (`signInWithOtp` `shouldCreateUser:false` → only
  provisioned accounts; `verifyOtp`); `AnonAuthGate` now **skips `/staff`** and, on diner routes, **swaps
  a stray non-anon (staff) session for a fresh anonymous one** so a staff uid can never back the diner
  surface on a shared browser. `/staff` distinguishes anon / not-staff / staff so a wrong account
  **recovers (sign out) instead of looping**.
- **Roles** — owner-only `/staff/team`: provision staff by email (service-role creates the OTP identity +
  staff row, rolls back the orphan auth user if the row insert fails), assign role, deactivate/reactivate
  (keeps the row for audit; guards self-deactivation). Every action re-checks `requireStaff('owner')`
  server-side — the client gating is cosmetic. a11y: per-member `aria-label`s, deliberate focus on step
  change, alert on the denied state.
- **Bootstrap** — there is deliberately **no self-serve first-owner path** (it would let any visitor seize
  ownership); the first owner is created out-of-band. See [`docs/HANDOFF.md`](docs/HANDOFF.md).

_Deferred to S1.1b: the shared-tablet **PIN** fast-path (the same PIN primitive S2's manager step-up reuses)._

### Fixed — M0/M1/M2 hardening (pre-S1 milestone red-team) (2026-06-21)

Five fresh-context adversarial lenses over M0 (foundations), M1 (single-pay spine + security/infra) and
M2 (promos · pickup · grocery · QBO). **The money/auth/RLS/secrets spine across all three is sound** —
tax on the discounted taxable base with TS↔SQL parity, reconcile-before-write + double idempotency,
server-authoritative amounts, promo enumeration/cap lockdown, pickup overbooking guards (holds + advisory
lock + anchor stability), QBO total-preserving + off-by-default + never-blocks-the-money-path + `server-only`
secrets, nonce CSP + SAQ-A card isolation + fail-fast env all verified. Edge/foundation fixes (no migration):

- **Burmese now actually renders (High).** Padauk was loaded with `subsets: ["latin"]` — but it's a
  Myanmar-script face, so `next/font` never fetched the Myanmar glyphs and every `name_my` string silently
  fell back to the system sans, defeating the bilingual moat. Now `["latin","myanmar"]` (`app/layout.tsx`).
- **Dark-mode token contrast to AA (Med).** `--t3` on Night surfaces was 4.40:1 (`--sf`) / 4.10:1 (`--cd`)
  — under AA; raised to `#9d95a8` (5.84 / 5.45), still dimmer than `--t2`. Latent today (no theme toggle
  until M5) but fixed before it ships. `tokens.css` header comment corrected (it overstated "AA verified")
  and now records the text×surface matrix + the `--ac-strong`-for-accent-on-tint rule.
- **`scanAdd` settling-guard parity (Med).** Grocery `scanAdd` now rejects edits during a split settlement
  like its restaurant siblings — unreachable in the solo grocery flow today, defense-in-depth per LEARNINGS
  #72 so a future multi-device grocery cart can't slip an edit mid-settle.
- **Analytics URL scrub widened + replay off (Low).** `before_send` now also strips Stripe
  `payment_intent`/`redirect_status` from `$current_url`/`$referrer` (order-correlatable ids — "opaque ids
  only", QA §C P2), and `disable_session_recording: true` asserts replay OFF in code (a Stripe iframe is on
  the pay screen). The scrub still covers the `?t=`/`?j=` join key.
- **Nits:** barcode comment aligned to the 8–14-digit regex; removed the unused `@mms/config/tsconfig`
  export + its orphan file (config drift).
- _Deferred (tracked):_ the M1-money sub-6¢ taxable-SKU inference (taxability read from `tax_cents>0`; no
  real SKU hits it; the clean fix needs a small data-model change) and the order-vs-line `tax_cents`
  snapshot granularity (charge is correct, receipt-sum cosmetic); QBO production-activation items
  (refresh-token rotation, drain advisory lock) — already on the activation checklist.

### Fixed — M3 hardening (pre-S1 milestone red-team) (2026-06-21)

A four-lens fresh-context adversarial pass over the whole M3 surface (group cart + split-tender + abuse
limits) before S1 builds on it found the money/auth/RLS spine sound; the escapes were at the edges. Fixed:

- **Split-tender completion no longer strands a paid diner (Critical).** The settlement board redirected
  every payer to `/track?cart=…`, which — having no Stripe `redirect_status`/`payment_intent` (each share
  has its own PI) — fell through to the "…once you've placed an order" stub. Now it redirects with
  `&paid=1`; `/track` resolves the split order via a member-gated `getSplitOrderId` (`lib/order.ts`,
  authorized on **session** membership since the cart is `paid`) and renders the live tracker — generalized
  `useOrderStatus`/`OrderTracker` to key by **order id** (split orders carry no PaymentIntent). An
  un-stamped order (brief post-capture race) shows an honest "payment received — finalizing", never a dead end.
- **Join code no longer leaks to analytics (High, privacy).** `instrumentation-client.ts` adds a
  `before_send` that scrubs `?t=`/`?j=` (the live session credential) from `$current_url`/`$referrer`, and
  `useTableSession` strips them from the address bar after consumption (localStorage still rejoins on
  reload). The server `onRequestError` path was already scrubbed; this closes the client pageview path.
- **Settlement board poll terminates (High).** `load()` short-circuits once the all-captured redirect
  fires, so the 5 s poll + realtime callbacks stop hitting a now-paid cart during navigation.
- **Cart can't increment a sold-out line (Med, QA §D).** `getCartView` resolves `menu_items.is_sold_out`
  (uuid-filtered so grocery barcodes are skipped) → `CartItem.soldOut`; the cart Stepper disables "+"
  (remove stays enabled).
- **A read-miss mid-split no longer drops a payer into an unwinnable plain checkout (Med).** `/cart` shows
  a retry when the cart is settling but `getSplitContext` returned null.
- **a11y (High/Med):** the sheet close ✕ is now a 44 px tap target (visible disc stays ~32 px via
  padding + `background-clip`); the menu list gets `role="list"`; a new `--ac-strong` token raises
  accent-text-on-tinted-fill to ≥4.5:1 (badges/chips/buttons across the split UI); the sheet/scrim honor
  `prefers-reduced-motion`.
- **Realtime broadcast guard (Med):** load-bearing comments on the non-private `cart:`/`shares:` channels
  — RLS-safe for postgres-changes today, but S2 must make them private + add a `realtime.messages` policy
  before adding any `.send()` broadcast.
- _Deferred (tracked):_ the split-fulfill amount reconcile is DB-sum-vs-DB-sum (tautological — becomes
  load-bearing at **S4.3** partial-capture); the P3.3a display vs P3.3b tender share-math divergence
  (label/align in a follow-up); cross-owner delete is host-only without a confirm (product sign-off).

### Added — M3·P3.4 abuse limits (2026-06-21)

- **Per-device rate limits** on the public POST surface. A generic SQL limiter (`rate_events` ledger +
  `mms_rate_limit(bucket, key, max, window)` — count-first / self-GC / reject-without-record, the proven
  `mms_promo_attempt` pattern) gates **join/mint** (`/api/session`, 30/min → 429) and **cart mutations**
  (addItem/setQty/assignLine/scanAdd/setDisplayName/openSettlement + both Stripe create-intent routes,
  120/min). Keyed by the **verified seat** (one device) — not per-session — so a hostile member can't DoS
  co-diners' shared cart. New-seat churn is bounded a layer down by GoTrue's anon sign-up limit.
  **Fail-open** (`apps/qr/lib/rate.ts`): a limiter glitch never strands a paying diner; the DB caps + lock
  - server-authoritative money remain the hard invariants.
- **Party-size cap (12)** on `session_members` via an **advisory-locked `BEFORE INSERT` trigger**
  (`mms_enforce_party_size`) — atomic under concurrent joins (count-then-insert can't overshoot). A
  friendly route pre-check returns a 409 on the common path; the trigger is the backstop and its
  `party_full` raise also maps to the 409. UI: cap-aware Invite (a "Table's full" note replaces the invite
  affordance at the cap) + honest copy, no retry on the terminal full case (`GuestList`/`InviteSheet`).
- **Background session sweeper** — `mms_sweep_expired_sessions()` on a **pg_cron** schedule (every 15 min)
  closes idle expired sessions so the `table_sessions_active_qr_uniq` slot stays clean (the backstop the
  index comment anticipated; renewal-on-write + the mint-time sweep already cover the in-use path). Also
  bounds the ephemeral ledgers. The schedule is **guarded** so a local CI stack without pg_cron applies
  the migration cleanly; the function works whether or not it's scheduled.
- **RLS membership negative tests** (`supabase/tests/rls_membership_test.sql`, wired into CI) — prove a
  non-member can't read another table's session/members/cart/items/shares/order under RLS (+ a positive
  control). Plain-SQL `assert`s in a rolled-back transaction; **verified PASS against the live project**.
- Migration `20260621000000_abuse_limits` (additive) applied to live + `get_advisors` clean (only the
  intentional `rate_events` default-deny INFO); all three new fns verified service-role-only. Adversarial
  subagent: **PASS** (zero Critical/High). _Deferred (Low, documented):_ a mutate-rate 429 in `add` shows
  the session-recovery copy (self-correcting; precise per-reason copy needs a result discriminant — the
  thrown message is redacted in prod).

### Added — M3·P3.3b split-tender (dine-in, Option A: authorize-all → capture-together) (2026-06-20)

- **Each diner pays their own card.** A host opens a split (`openSettlement`) → the cart freezes
  table-wide (`settle_at`) and the server derives a per-seat **base** breakdown
  (`deriveShareBreakdowns`): subtotal by assigned-line total, **tax on each seat's own taxable base**,
  service on net, discount pro-rata — every component largest-remainder so **Σ shares == the cart total
  to the cent**. Each payer authorizes their share on a `capture_method: manual` PaymentIntent
  (`create-share-intent`, server-derived amount + their own tip; the client never sends a price).
- **No money moves until the table is covered.** The webhook captures **all** shares together once the
  last authorizes, then `mms_fulfill_split_order` snapshots the **one** order (idempotent on the cart
  open→paid flip; reconciles Σ captured == the total) and lifts the freeze. **Abandon/decline cancels
  the holds** — no one is charged for an incomplete order.
- **Live settlement board** (`SettlementBoard` + `useSettlementRealtime` on `qr_cart_shares`): every
  phone sees shares flip pending → authorized → captured live, with an "$X of $Y authorized" progress;
  the viewer pays inline (`SharePay`), the host can cancel, and all-captured sends the table to the receipt.
- **Money-safety hardening** (two adversarial passes): capture is gated on a **live** settlement
  (cart open + fresh freeze) so a stale/aborted/taken-over settlement is never captured; abort claims
  first + defers to an in-flight capture + never deletes a captured share; each capture is **verified**
  (re-fetch on `unexpected_state`) so a canceled PI can't be mismarked captured. Residual sub-ms races
  fail **loud** (the fulfill fn raises), never silent — the "never charged-with-no-order" promise.
- **`qr_cart_shares` ledger** + `settle_at`/`settle_by` freeze; member-read RLS, realtime, service-role
  fulfill fn. Single-pay and split are mutually exclusive at the lock/freeze acquire boundary.

### Added — production error tracking (PostHog, client + server) (2026-06-20)

- **Server-side capture** (`apps/qr/instrumentation.ts` `onRequestError`): every uncaught error in a
  Server Component / Server Action / route handler now reports to PostHog via
  `captureExceptionImmediate` (captures **and** flushes — serverless-safe). This closes the gap that
  made the session-expiry bug hard to diagnose: a thrown Server Action error is **redacted in prod**,
  so it never reached the client or any tool — diagnosis meant reading Supabase logs. Personless,
  opaque non-PII context only (path / route / method — QA §C P2); Node-runtime-guarded so the Edge
  middleware bundle never pulls in the Node client.
- **Client-side** exception capture was already on (`posthog-js capture_exceptions: true`). Added
  **branded error boundaries** — `app/error.tsx` (segment-level, recovers in place with the layout +
  session mounted) and `app/global-error.tsx` (root crash) — that **explicitly** `captureException`
  (React boundaries swallow errors before posthog-js's window.onerror auto-capture sees them) and
  offer an accessible "Try again" reset instead of Next's default screen.
- **No Sentry:** PostHog now covers both client and server exceptions with zero new deps/secrets;
  a second vendor would be redundant here (+112 packages + client-bundle weight + secrets to provision).

### Fixed — dine-in session expiry stranded diners ("Couldn't add that") (2026-06-20)

- **Root cause:** the table session's TTL is a hard **4h** (`table_sessions.expires_at default now() +
interval '4 hours'`). The mint route found a session by `status='active'` **only**, while
  `assertCartMember` **and** the `is_member` RLS fn reject on `expires_at <= now()` — so an expired-but-
  still-`active` session was handed back as "live", then every cart write `403`'d on it. The client
  surfaced the generic **"Couldn't add that — please try again"**, a retry that could never succeed.
- **Sliding renewal (server):** any authorized touch (`assertCartMember`) and every rejoin
  (`/api/session`) now slides `expires_at` forward — throttled to the back half of the window so a
  read-heavy path doesn't write each call. A table that's actually in use no longer expires mid-meal.
- **Expiry-consistent mint + sweep (server):** `findActive` now also requires `expires_at > now()`
  (matching authz + RLS); a stale expired session squatting on the `status='active'` partial unique
  index is **swept to `closed`** before minting fresh (the sweep that index's comment anticipated).
- **Graceful recovery (client):** a failed cart op now **re-mints** (`useTableSession.revalidate`)
  instead of stranding — the diner recovers without a manual reload, with an honest message that
  distinguishes a **renewed** session ("Reconnected — try that again") from a **timed-out** one
  ("we started a fresh order"). Schema-free (no migration); `apps/qr/lib/session-ttl.ts` mirrors the DB TTL.

### Added — M3·P3.3a split-the-bill foundation (dine-in) (2026-06-20)

- **Split the bill on `/cart`** (dine-in group): Even / By-person toggle, per-line avatar **assignment**
  (by-person), and a **cent-reconciled per-seat share** breakdown. Shares are computed **client-side
  from the server-authoritative grand total + lines** via the isomorphic `lib/split-math` (instant — no
  round-trip, no layout shift) — `largest-remainder so Σ shares == the total to the cent` (deterministic
  leftover penny — QA §D). The server share-derivation lands with the tender in P3.3b (same math).
- **`canMutate(line_state, actor_role, isOwner)`** (`lib/permissions.ts`, isomorphic) — the generalized
  mutation gate the S-track extends. M3: the **host** may edit/remove **any** line, a **guest** only
  their **own** (the cross-owner-delete guard). Enforced server-side in `setQty` + `assignLine`, and the
  UI disables controls it would reject (a guest sees others' lines as read-only with the owner avatar,
  never a control that just fails).
- **Live across the table:** `assignLine` touches `updated_at` → the P3.2 realtime sub re-syncs every
  phone's cart + shares. `assignLine` is member + canMutate gated, the target must be a session member,
  and it re-checks `status='open'`.
- **Honest scope:** the shares are a **reference** breakdown — the order is still **paid in full at
  checkout** (per-card tender is **P3.3b**, Option A: authorize-all → capture-together). The pay button
  carries an honest "this pays the full order" note in a group; no future-promise copy. Schema-free.
- **Craft (deep pre-merge UI/UX pass → ≥4.3):** instant optimistic shares (no empty-then-pop layout
  shift); share/assign/mode changes **announced through the cart's single live region** (a11y); a
  reduced-motion-safe fade on the toggle + assignment avatars and a press "thunk" so the assign tap
  registers with weight (RUBRIC #2/#5). _Deferred to P3.3b (tracked):_ folding the assign row onto the
  cart line itself (v7.2 parity) and a lock banner on `/cart`. Reviewed by two fresh-context adversarial
  subagents (pre-PR: 2 must-fix + 3 should-fix; pre-merge UI/UX: 4 should-fix) — all addressed/tracked.

### Added — M3·P3.2-lock cart-lock-at-pay (2026-06-20)

- **Freezes the cart for the pay window** so a peer can't mutate it mid-checkout (which would drift the
  total from the fixed PaymentIntent amount → webhook reconcile 409 → **charged-but-no-order**). The
  hole P3.2's live multi-writer cart exposed; deferred from P1.3 on purpose because a naïve lock strands
  an abandoned pay-screen.
- **`qr_carts.locked_at` + `locked_by`** (+ existing `locked`). Effective lock = held AND fresh within a
  **5-min TTL** (`CART_LOCK_TTL`), so a hard tab-close auto-releases. `create-intent` acquires via ONE
  atomic conditional UPDATE (`status=open AND (unlocked OR locked_by=me OR stale)`) — race-safe (Postgres
  re-checks the WHERE under the row lock; a fresh lock by another can't be stolen), and the SAME payer
  re-acquires after a refresh instead of being told "someone's checking out." Released on decline
  (webhook), "Edit order" (scoped to the locker), the TTL, or any create-intent failure path.
- **One guard, everywhere:** `assertCartMember` returns the _effective_ lock, so every existing mutation
  path (addItem / setQty / applyPromo / scanAdd / setPickupSlot) rejects. **UI:** AddButton disabled +
  a v7.2 lockbar; the transition is announced through the provider's **single** live region (the lockbar
  is plain visual — no second region); "Edit order" releases. The aspirational "locks the cart" comments
  are now true; "the host locked it" copy → "someone's checking out" (the locker may be a guest).
- **Hardened in passing:** `scanAdd` (grocery) now routes through the status-atomic
  `mms_cart_item_insert_if_open` RPC like `addItem` (was a plain insert — same TOCTOU class as the hole
  above). Migration `20260620000700` (2 nullable columns; `database.types.ts` hand-edited, `types-fresh`
  validated). Reviewed by a fresh-context adversarial subagent **pre-PR + pre-merge** (0 blockers).

### Added — M3·P3.2 live group-cart sync (dine-in, multi-device) (2026-06-20)

- **A peer's cart change now appears live on every phone at the table.** `qr_carts` + `qr_cart_items`
  join the `supabase_realtime` publication (+ `replica identity full` on `qr_cart_items` so a line
  removal/DELETE matches the `cart_id` filter); a new `useCartRealtime` hook subscribes to **Postgres
  Changes** (door-agnostic, like `/track` — a future staff-POS write propagates too) and the consumer
  re-fetches the **server-authoritative** `getCartView` into keyed React state (never client math).
  Authorization is the existing member-gated SELECT RLS (`qr_cart_read`/`qr_citem_read`), enforced
  per-subscriber by Realtime — a guessed `cart:{id}` channel reveals nothing. Migration `20260620000600`
  (publication + replica identity only → no `types-fresh` drift).
- **Honest peer announcements.** When a guest adds an item, the others hear "[name] added [item]" through
  the **single** existing live region (the real, un-simulated version of the v7.2 friend-add toast);
  `by_seat` is the verified adder, so attribution is trustworthy. Your own add is filtered (never
  "you added your own item"); a peer's qty-change/remove just refreshes (the event doesn't carry the
  actor, so no false attribution). All notices now flow through one `flash` helper with a single
  clear-timer, so overlapping events replace deterministically. **Dine-in only** (solo modes have no
  peers → no subscription).
- **Degrades gracefully:** on `SUBSCRIBED` the hook re-fetches (self-heals changes missed while the
  socket was down or before the subscription); a `CHANNEL_ERROR`/`TIMED_OUT` is logged (not silently
  swallowed) and recovers on reconnect. Reviewed by a fresh-context adversarial subagent (0 blockers;
  1 should-fix — the missing channel-error handling — + 2 nits, all addressed). _Cart-lock-at-pay (the
  money-path race) is the next focused PR — it needs a schema change + its own review._

### Added — M3·P3.1 group cart join + presence (dine-in, multi-device) (2026-06-20)

- **A second phone joins the SAME dine-in cart**, two ways: a scanned **table sticker** deep-link
  (`/menu?mode=dinein&t=<token>`) or the host's **server-issued invite code** (an unguessable 8-char
  code, shared as a code/link or entered via the entry "Join a table" sheet, `&j=<code>`). The
  `qr_code` doubles as the join key, so `/api/session` find-or-join converges every phone on one
  session + cart. **Schema-light:** one partial unique index (`table_sessions_active_qr_uniq`) makes
  concurrent same-sticker joins race-safe (collide → re-read → converge, no split-brain) — indexes
  don't touch the generated types, so no `types-fresh` drift. The host-start session code is minted
  **server-side** (`apps/qr/lib/session-code.ts`); a wrong invite code is **join-only** (404, never
  mints a phantom host-table); a guessable sticker token still requires anon-auth membership on top.
- **Live presence guest list — dine-in ONLY** (RED-TEAM #3 honesty; solo Scan&Go/Pickup never show
  presence). `useGroupCart` wires the existing private `table:{sessionId}` channel (RLS-gated on
  `realtime.messages`); presence is keyed by the **stable seat** (no ghost-churn, LEARNINGS #4), the
  client-asserted name is **sanitized on ingest** (strip control/RTL chars + clamp), and a new guest
  joining is announced through the **single** existing live region. Avatars + "party of N" built to
  the v7.2 party aesthetic; a failed mint surfaces an inline retry, not a silently missing strip.
- **Name your own seat** (`setDisplayName`, `apps/qr/lib/members.ts`): member-authz'd, scoped to the
  caller's own seat, Zod-capped **+** a new column CHECK; never sent to PostHog (opaque seat only).
- Scope boundaries held: live cart-change sync is **P3.2**, split-the-bill / **split-tender** is
  **P3.3** (pulls the S4.3 seam forward per the milestone decision) — neither is over-promised in the
  P3.1 copy. Reviewed by a fresh-context adversarial subagent (0 blockers; 5 should-fix addressed).

### Added — M2·P2.4 QuickBooks Online sync of paid orders (2026-06-20)

- **Paid orders post to QBO as Sales Receipts, two-ledger clearing.** Each paid `qr_order` becomes a
  QuickBooks Sales Receipt **deposited to a Stripe _clearing_ account** (sales land in clearing on order;
  the Stripe payout later clears it to the bank). Tax is posted as an **explicit line** with
  `GlobalTaxCalculation:"NotApplicable"` so QBO's Automated Sales Tax can't recompute/override our
  category-aware figure — the receipt total reconciles to the cent against the Stripe charge.
- **Pure, self-checking mapper** (`apps/qr/lib/qbo/mapping.ts`): `buildSalesReceipt` **throws rather than
  posts** if the line items don't reconcile to the stored subtotal, the parts don't sum to the total, or a
  non-zero amount (service/tax/tip) has no configured item ref. Validated locally (balances to total;
  throws on imbalance + missing ref).
- **Fail-safe, idempotent, out-of-band client** (`apps/qr/lib/qbo/client.ts`): a no-op unless
  `QBO_SYNC_ENABLED=true` (records `skipped`); OAuth2 refresh-token → cached access token; one Sales
  Receipt per order guarded by the new `qbo_sync_queue` ledger (migration `20260620000400`, RLS
  default-deny, **service-role only** — verified `anon`/`authenticated` denied + `service_role` r/w on the
  live project, advisor-clean). The webhook enqueues on fulfillment then posts inside `after()`, so
  QuickBooks latency/outage **never** blocks the Stripe ack or fulfillment; `processPendingQboSyncs` drains
  stranded/errored rows on demand.
- **Off by default.** Ships dark; activation (sandbox QBO company + refs/creds, then the first post) is a
  documented step. See [`docs/QBO_SYNC.md`](docs/QBO_SYNC.md) + the QBO rows in `docs/ENV.md`. Deferred:
  refresh-token rotation persistence, a cron drain, and refund mapping.

### Added — M2·P2.3 grocery Scan & Go session/cart (2026-06-20)

- **Real server-issued Scan & Go session.** `/grocery` now mints its cart via `useTableSession("scango")`
  — the same anon-auth `table_sessions` / `session_members` / `qr_carts` + membership-authz the dine-in
  and pickup flows use — replacing the demo client-minted `crypto.randomUUID()` that the `assertCartMember`
  guard rightly rejected (a client-asserted session id was the very thing M1·P1.1 closes). So `scanAdd` is
  now authorized like every other mutation, prices/taxes stay server-derived, and the cart carries to
  `/cart` + Stripe checkout. The dishonest "Scan & Go opens with grocery sessions (M2)" placeholder is gone.
- **Name-search fallback for unknown barcodes.** When a barcode won't scan or isn't in the catalog, a
  debounced name search (`searchGroceryItems`, a public read of the public-RLS `grocery_items`, returning
  only available + non-weighed items, LIKE-metacharacters escaped, length-bounded input) lets the diner
  find the item by name; a tap adds it through the **same** authorized `scanAdd` (server re-derives price +
  category-aware tax). EBT-eligible hits are tagged.
- **Fixed in passing:** the barcode scanner tore down + restarted the camera on every render (a fresh
  `onScan` each time) — now memoized so it starts once; and `/grocery` had two live regions (the scanned-
  lines `aria-live` + the status toast) → collapsed to one (the toast announces each add).

- **Capacity-limited pickup slots + a server fire-time.** Migration `20260620000100_pickup_scheduling`
  adds a tunable single-row `pickup_config` (tz, hours, slot interval, **capacity per slot**, lead, prep,
  hold TTL — seeded 10:30am–6:30pm · 15-min · 6/slot for Covina), `pickup_slot` + `fire_at` columns on
  `qr_carts` → carried to `qr_orders`, and two service-role-only SECURITY DEFINER functions:
  - **`mms_pickup_slots(p_exclude_cart)`** — tz-aware, returns today's bookable slots from
    `max(open, now+lead)` to close with **remaining capacity = capacity − (paid orders + live holds)**.
    A "hold" is an open cart that picked the slot and is still active (session unexpired, touched within
    the hold TTL) — so **capacity is honest _during_ ordering, not only after payment** (without this,
    N diners all see the last seat free before any has a paid row → overbook). `p_exclude_cart` drops
    the caller's own hold so a diner sees their slot's true availability.
  - **`mms_set_pickup_slot`** — race-safe (a per-slot `pg_advisory_xact_lock` serializes concurrent
    picks of the same slot) + status-atomic; sets `pickup_slot` + `fire_at = slot − prep`.
- **Fire-time = the S2 seam.** `fire_at` is computed + stored now for S2's KDS to consume; M2 has no
  kitchen actor, so nothing fires yet — no second timer grown (per the roadmap touch-point).
- **`/track` echoes the chosen slot as the ETA** ("Ready ~11:45 AM") with the pickup step variant
  (`Order placed → In the kitchen → Ready for pickup → Picked up`) — **no fabricated countdown, no
  "we'll text you"** promise the code can't keep. create-intent re-validates the slot still has room at
  the pay boundary (excluding the cart's own hold) and requires a slot for pickup orders; the cart
  surfaces the reason ("Pick a pickup time first." / "That pickup time just filled — pick another.").
- **Snappier cart/slot interactions** (perceived latency): each Add was two sequential server
  round-trips (mutate, then a full `getCartView` re-fetch) with no feedback until both landed —
  `addItem` now **returns the fresh view** (one round-trip) and the cart count bumps **optimistically**
  on tap; picking a slot drops the redundant post-set refetch and the tapped chip shows an immediate
  "Setting…" state. (The SQL was never the bottleneck — `mms_pickup_slots` runs ~10ms; the cost was
  round-trips + cold serverless starts on preview.)
- **Next-day rollover** (migration `20260620000200`): slots span today + `horizon_days` (default 2), so
  an after-hours browser pre-orders for tomorrow instead of hitting an empty "today only" wall. The sheet
  groups by day (Today / Tomorrow / weekday); the chip + `/track` ETA prefix the day when it isn't today.
- **UI (v7.2):** the "Pick a pickup time" sheet (`PickupSlotSheet`, capacity-aware, auto-opens on first
  pickup load), a header chip showing/Changing the slot (`PickupSlotChip`), tz-correct time display.
- **Validated** on a local Postgres stack (slot generation, fire-offset, hold-based capacity, exclude-self
  re-pick, advisory-lock serialization, stale-hold freeing, fulfillment carry) and **applied to the live
  QR project** (grant lockdown verified `anon=false`; advisors clean apart from the intentional
  `pickup_config` default-deny). **Pre-PR adversarial subagent: FAIL → fixed → PASS** — it caught the
  capacity-overbooking race (paid-only count); the holds + advisory lock + exclude-self close it.
- _Deferred:_ an inline slot-picker on `/cart` (today a slot-less checkout shows a clear reason and the
  diner picks via the menu chip); a hold/abandoned-cart sweep (holds self-expire via the TTL).

### Fixed — M2·P2.2 same-day slot alignment (2026-06-20)

- **Same-day pickup slots rendered off-grid and were false-rejected at checkout** — a regression from the
  `20260620000200` multiday rewrite, which moved `now+lead` into today's `generate_series` lower bound,
  anchoring the grid at a non-aligned instant that drifts every second. Two breakages across the whole
  operating window (any time `now+lead > open`): (1) slots showed arbitrary times (e.g. 11:18, 11:33)
  instead of the aligned :00/:15/:30/:45; (2) the grid shifted between a diner's pick and the
  re-validation — and **both** `mms_set_pickup_slot` and the create-intent pay-boundary check re-call
  `mms_pickup_slots` — so a valid same-day slot matched nothing on the fresh grid → set returned
  `unavailable` and checkout 409'd "that pickup time just filled". Migration
  `20260620000300_pickup_slots_align_fix` restores `…0100`'s pattern: anchor each day's series at the
  day's **open** (aligned) and **filter** `slot ≥ now+lead`. Future days keep all slots; same-day drops
  only past/too-soon ones, and the grid is now stable across the selection→checkout window. Caught by the
  **pre-merge adversarial subagent** (the after-hours manual smoke test had only exercised the next-day
  path); verified old-vs-new on the live stack (`12:31,12:46,…` → `12:45,13:00,…`).

### Added — M2·P2.1 server-validated promo codes (2026-06-20)

- **Real promo enforcement, server-authoritative.** Migration `20260620000000_promo_validation` gives
  `promo_codes` real semantics (`valid_from`/`valid_until`, `min_subtotal_cents`, `per_session_limit`,
  plus `CHECK`s: `value ≥ 0`, pct `≤ 1`, etc.), adds two RLS-default-deny ledgers
  (`promo_redemptions` audit + per-session cap; `promo_attempts` rate-limit), and five service-role-only
  SECURITY DEFINER functions:
  - **`mms_promo_check`** — the single apply gate: active + window + `min_subtotal` + global `max_uses`
    - per-session cap → returns a stable `reason` enum + the computed discount.
  - **`mms_promo_discount`** — the single **pricing** source `getCartTotals` now calls (replacing the
    inline TS), so the displayed/charged discount can't drift. Caps are a redemption budget (apply +
    fulfillment), not a pricing gate, so the discount stays stable through checkout.
  - **`mms_promo_attempt`** — per-session **rate-limit** (anti-enumeration): 10 / 5-min window,
    count-first so a capped session is rejected without recording (the window can drain), self-GC'ing.
  - **`mms_promo_consume`** — redemption at **fulfillment**: soft global cap (the charge already
    reconciled the discount, so `used` may overrun by the count of concurrently-applied-but-unfulfilled
    carts — accepted) + a **hard per-session cap re-checked under a row lock** (a DB invariant, not just
    the app-layer apply gate). `mms_fulfill_order` now calls it (after its idempotency early-return, so
    consumption is exactly-once under Stripe's ≤72h retries).
- **`applyPromo` returns a discriminated result** (`{ok, discountCents} | {ok:false, reason}`) instead of
  throwing — Next redacts thrown Server Action errors in prod, so the cart now shows the _specific_
  reason (invalid / expired / min-not-met / exhausted / used-at-this-table / rate-limited …) via a
  `Record<PromoReason, string>` map. Seeded test codes: `WELCOME10` (10% off) and `TEAHOUSE5` ($5 off
  ≥ $20).
- **Validated end-to-end on a local Postgres stack** (discount math, min-subtotal gate, rate-limit
  10/window, consume + per-session backstop, global exhaustion) and **applied to the live QR project**;
  `get_advisors` clean apart from documented/intentional lints.
- **Pre-PR adversarial subagent: PASS** (zero Critical/High). Folded in its hardening (per-session cap as
  a DB invariant; rate-limit window-drain + bound; honest soft-cap comment). **Advisors then caught a
  real EXECUTE-grant gap the subagent missed:** `revoke … from public` alone left the promo functions
  callable by `anon`/`authenticated` (Supabase explicitly grants them too) — `mms_promo_consume` was
  directly callable to burn a code's budget. Fixed: `revoke … from public, anon, authenticated`
  (verified `has_function_privilege('anon', …) = false`), plus a covering index on
  `promo_redemptions.order_id` (advisor 0001).
- **Fixed in passing — the live QR project was missing P1.5's `track_realtime`** (CI only tests a local
  stack; nothing had applied it to prod), so `qr_orders` wasn't in the realtime publication and `/track`
  live updates were silently broken in production. Applied it.
- _Deferred:_ tell the diner the exact shortfall on `min_not_met` ("add $X more") — a UX assist, not a
  correctness gap; a `promo_attempts` global retention job (today it self-GCs per active session).

### Added — M1·P1.6 hardening: nonce CSP + fail-fast env (2026-06-20)

- **Nonce-based Content-Security-Policy.** New `apps/qr/proxy.ts` (Next 16's rename of the
  `middleware` convention) mints a **fresh nonce per request** and emits
  `script-src 'self' 'nonce-…' 'strict-dynamic' https://js.stripe.com` — so we finally **drop
  `script-src 'unsafe-inline'`**, the one directive that made the old static CSP toothless against an
  injected `<script>`. `'strict-dynamic'` trusts the nonced framework bootstrap and whatever it loads
  (Stripe.js via `loadStripe`; PostHog via the same-origin `/ingest` proxy), so the host allow-list is
  just a pre-CSP3 fallback. The CSP **moved out of `next.config.ts`** (a per-request nonce can't be a
  static header) into the proxy; the nonce-free headers (Referrer-Policy / `nosniff` /
  Permissions-Policy / HSTS) stay in `next.config.ts` so they still cover the API + static responses
  the proxy matcher skips. Also tightened: `object-src 'none'`, `form-action 'self'`,
  `worker-src 'self' blob:`.
- **`frame-src` includes `https://*.js.stripe.com`** (with `js.stripe.com` + `hooks.stripe.com`): the
  Payment Element mounts iframes on per-origin `*.js.stripe.com` shards, and `frame-src` is a plain
  host allow-list that `'strict-dynamic'` does **not** cover — without the wildcard the card field can
  fail to render. `'unsafe-eval'` is added to `script-src` **in development only**
  (`NODE_ENV === "development"`): React's dev runtime + Turbopack HMR evaluate via `eval()`, which a
  nonce can't authorize, so `pnpm dev` would otherwise be broken by its own CSP; production never ships
  `'unsafe-eval'`. (Both surfaced by the pre-PR adversarial subagent — production-mode smoke testing
  alone had masked them.)
- **All routes render dynamically** (`export const dynamic = "force-dynamic"` in the root layout):
  Next can only stamp the per-request nonce onto its `<script>` tags during a per-request render, so a
  statically prerendered shell would ship scripts with no nonce and `'strict-dynamic'` would block
  them. The app is anon-auth + DB-driven, so the four otherwise-static shells lose no meaningful
  optimization. Verified end-to-end in **both** modes: the response CSP nonce matches the nonce on
  **all 18** rendered `<script>` tags and rotates per request; `/api/*` correctly gets no CSP;
  `'unsafe-eval'` is present under `next dev` and absent under `next start`.
- **Fixed in passing — `Permissions-Policy: camera=(self)`.** The header was `camera=()`, an empty
  allow-list that blocks the camera for **all** origins including our own — which would silently break
  the grocery Scan & Go viewfinder (`getUserMedia`). Now first-party only; mic/geo stay fully off.
- **Fail-fast env reads (hardening).** `packages/db/src/server.ts` now reads
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / the publishable key through a
  `requireEnv` guard that throws `Missing required env var: …` instead of the old `process.env.X!`
  feeding `undefined` to `createClient` (which resurfaced as a cryptic auth/network failure deeper in
  the stack — and once masked the delivery-vs-QR project mix-up). The Stripe **webhook** now returns a
  clear `500 "Webhook not configured"` when `STRIPE_WEBHOOK_SECRET` is unset (so Stripe redelivers once
  it's wired) instead of feeding `undefined` to `constructEvent` and masquerading as a `400 "Bad
signature"`; a missing `stripe-signature` header is an explicit 400.
- **`docs/ENV.md`** — the variable inventory (client/server, secret/not) + the Vercel **preview→prod**
  matrix (test keys on Preview, live on Production; staging when QR gets traffic), and the steps to
  wire the Preview env that unblock the Payment Element on PR previews. _Remaining (infra, Min):_ set
  those Preview env vars in Vercel.
- **ESLint flat config + `packages/config`** (the third P1.6 line item) already landed in M0·P0.9 —
  `@mms/config/eslint` is the shared base and `apps/qr/eslint.config.mjs` extends it; verified, no
  change needed.

### Added — M1·P1.5 live order tracking via Realtime (2026-06-19)

- **`/track` is now live.** After the Payment Element redirect, `apps/qr/components/OrderTracker.tsx` subscribes (`apps/qr/lib/useOrderStatus.ts`) to **Realtime Postgres Changes** on the diner's own `qr_orders` row — keyed by the `payment_intent` Stripe appends to the `return_url` — so the order appears **the moment the async webhook fulfills, with no manual refresh** (closes the deferred processing-state polling). Authorization is the existing `qr_order_read` RLS (`is_member(session_id)`), enforced per-subscriber, so a guessed `payment_intent` reveals nothing. Migration `20260619000400_track_realtime` adds `qr_orders` to the `supabase_realtime` publication (guarded/idempotent; no schema/type change). A **bounded fallback re-fetch** (~30s) covers the redirect→insert race / a cold socket so the order reliably surfaces even if the live channel is slow.
- **Status timeline built to v7.2.** `Order placed → In the kitchen → Ready → Served` ported from the prototype's `.tk` rail (18px dots, 2.5px connector, accent **pulse** on the active step → `globals.css` `mmsPulse`, success-green when done) — tokens only, no hardcoded colors. a11y: an `<ol>` with `aria-current="step"`, a single polite live region announcing the phase change, decorative dots `aria-hidden`, `prefers-reduced-motion` disables the pulse. Honest microcopy — no fabricated ETA countdown (real ETA needs the KDS).
- **Forward-compatible by design.** M1 has no kitchen actor, so the active step rests at "Order placed"; **S2's kitchen-status updates flow through the same subscription** with no client change (the timeline reads the future status). Dine-in / pickup step variants arrive with the S-track / M2.2.
- **Folded in the P1.4 adversarial findings** (PR #12 verdict, all non-blocking): `payment_succeeded` PostHog `capture` moved **inside** the fulfilled branch so a duplicate Stripe redelivery no longer double-counts analytics; the full `fulfillErr` (code/details/hint) is logged, not just `.message`; `getCartTotals` is wrapped in try/catch for context-rich 500s; `.env.example` `NEXT_PUBLIC_SUPABASE_URL` reverted to a `YOUR_QR_PROJECT` placeholder so local dev can't silently target the live DB.

### Fixed — M1·P1.4 webhook fulfillment is retry-safe (2026-06-19)

- **No more silent charged-but-unfulfilled orders.** `apps/qr/app/api/stripe/webhook/route.ts` previously `await`ed `mms_fulfill_order` without checking its result — and supabase-js returns a Postgres error in `{ error }` (it does **not** throw), so a failed fulfillment still returned `200 { received: true }`. Stripe treats 2xx as handled and never retries → the diner is charged but no `qr_orders` row exists. Now a non-null `error` logs + returns **5xx**, so Stripe redelivers (up to 72h); fulfillment stays idempotent on the PaymentIntent id, so a later successful retry is safe.
- **Observability:** a `payment_intent.succeeded` whose intent metadata is missing `cartId` (anomalous — `create-intent` always sets it; can't fulfill and a retry won't help) is now `console.error`'d instead of vanishing.
- **Already in place (P1.0), unchanged:** signature verification, idempotency on the PI id, and the amount-reconcile (`getCartTotals` vs `intent.amount` → 409 on mismatch before fulfilling). _Gem awarding stays deferred → M4_ (anon diner ↔ `loyalty_rewards.user_id NOT NULL`).
- **Docs:** `.env.example` corrected — QR runs on its **own** Supabase project (`fasnpdhtvqtzjlvruqcu`), not the shared delivery one; added the webhook-endpoint + `stripe listen` guidance for `STRIPE_WEBHOOK_SECRET`.

### Added — M1·P1.3 Stripe Payment Element (test mode) (2026-06-19)

- **Two-step checkout** in `apps/qr/components/Checkout.tsx`: a **review** step (line steppers, promo, tip, server totals) → **"Continue to payment"** POSTs the member-gated `/api/stripe/create-intent` `{cartId, tipRate}` → a **pay** step that mounts `<Elements>` + `<PaymentElement>` (`apps/qr/components/PaymentSection.tsx`) on the returned `clientSecret`, with an **"← Edit order"** way back. The amount is server-authoritative throughout (review breakdown from `getCartView`; tip-inclusive grand total from `create-intent`); the tip-chip `<small>` is a labeled preview only.
- **Tip selector** faithful to the v7.2 prototype — `No extra / 15% / 18% / 20%` chips, `aria-pressed`, `<small>` preview on the **discounted** base; the exact tip is re-derived server-side (`getCartTotals`, capped 0–50% by Zod).
- **PCI/SAQ-A intact** — `getStripePromise()` (`apps/qr/lib/stripe-client.ts`) loads Stripe.js once; PAN lives only in the Payment Element iframe. The Element **appearance is derived from `@mms/ui` tokens at runtime** (light = editorial, `.dark` = Night). Apple/Google Pay surface via `automatic_payment_methods`. `confirmPayment` returns to **`/track`**, now a real confirmation driven by Stripe's `redirect_status` (succeeded / processing / failed); the live timeline stays P1.5.
- **Folded-in deferrals**: `sessionMintOutput` Zod-parses the `/api/session` response (`useTableSession`); the promo live region is `aria-atomic`; focus moves to the heading when a stepper removes the last unit of a line.
- **Adversarial-pass hardening (zero-critical verdict).** A11y: focus moves to the heading on every **review↔pay transition** (the trigger button unmounts while focused — WCAG 2.4.3), and decorative `←` glyphs (Edit order / back links) are `aria-hidden` so they aren't announced. UX/trust: the **review summary now previews the selected tip** as a "Tip" row + "Estimated total" (identical `Math.round(netCents·rate)` to the server, so it reconciles exactly with the pay-step total — no surprise jump); the `/track` **processing** state gets a reassurance copy + a way off the page, and `/track` sets a per-state tab title via `generateMetadata`. Security: `create-intent` 500s return a generic `"Payment service error"` (the raw SDK message is logged server-side only — no recon surface before live keys).
- _Deferred (documented in `docs/REVIEW.md`):_ **cart-lock-during-pay → the group-cart Realtime phase.** Locking at intent-create strands a cart if the diner abandons the pay screen (no auto-release), and a lock only matters under concurrent editing (not wired yet); the signature-verified webhook **already reconciles** the live total vs `intent.amount` before fulfilling (a mutated cart 409s, never mis-fulfills), which is the P1.3 guard. Test-mode only — no real cards.

### Added — M1·P1.2 cart-create + line-merge + the cart flow (2026-06-19)

- **Server-issued cart.** `POST /api/session` now **find-or-creates the session's open cart** and returns `cartId` (idempotent — reuses the active session's open cart, or starts a fresh one after a previous cart is paid). The client never invents a cart id.
- **`useTableSession(mode)`** (client) — waits for the anon session, then mints/joins the table session via the Bearer-verified `/api/session` and exposes the `cartId`. A stable per-device QR identity per mode (localStorage) reuses the same session/cart across navigations instead of minting a new one each load.
- **Menu ordering.** `TableCartProvider` establishes the session once and shares a live, server-authoritative cart view; each item gets an `AddButton` (sends an item id, never a price; disabled until the cart exists and when sold out — a disabled control, not a missing one) and a sticky `CartBar` (live count + subtotal → `/cart`).
- **Line-merge.** `addItem` merges identical lines — same `menu_item_id` + the **normalized (order-independent) modifier set** → bumps `qty` instead of inserting a duplicate row (QA §B; keeps the cart bounded). Unit-checked for order-independence + jsonb-null safety.
- **Cart + checkout page.** `getCartView` (member-gated, RED-TEAM #2 — not an IDOR read) returns lines + server totals; the cart page renders them with 44px quantity steppers (`setQty`, `0` removes), server-validated promo, and the SB-1524 disclosure — re-fetching totals after every mutation (never client math). One polite live region (promo result); the rolling total is not `aria-live`. The pay CTA is a placeholder until **P1.3** mounts the Stripe Payment Element here.
- **Concurrency + a11y hardening (from the adversarial review).** Migration `20260619000000_cart_concurrency` adds an **atomic `mms_cart_item_inc_qty`** RPC (line-merge now `qty = qty + 1` in-DB — no lost-update race under concurrent group adds) and a **partial unique index** `qr_carts(session_id) WHERE status='open'` (so the find-or-create can't leave two open carts — `/api/session` re-reads on the conflict). `assertCartMember` now rejects non-`open` carts (paid carts are immutable). A11y: `aria-busy` on AddButton; `CartBar` is a real `<button>` (Enter+Space, QA §A P1); Stepper qty is an `<output>`; one polite notice region surfaces add failures; promo status clears on resubmit.
- **Money-path + a11y hardening (second review/adversarial pass).** Migration `20260619000100_cart_item_qty_cap` makes the increment **bounded + status-atomic**: `mms_cart_item_inc_qty` now JOINs the parent cart and requires `status='open'` and `qty < 99` in one UPDATE (closes a group-cart qty-inflation vector — `qty × unit_price` is the future Stripe amount — and a webhook `status='paid'` flip racing the app-layer guard), with a column `CHECK (qty between 1 and 99)` backstop for every write path. Client: `Checkout.refresh()`/`changeQty` swallow the post-payment 403 (no uncaught rejection on a paid cart); the Stepper `+` disables at 99; `TableCartProvider` announces a brief **success** confirmation as well as failures (WCAG 4.1.3) without making the rolling total `aria-live`; `applyPromo`'s PostHog `distinctId` is the verified `uid` (joins the diner profile), not the cart id.
- **Status-atomic mutations + grant lockdown + a11y (third review/adversarial pass — gate PASS).** Migration `20260619000200_cart_mutations_status_atomic` adds `mms_cart_item_insert_if_open` and `mms_cart_item_set_qty_if_open` so **every** cart write (insert / increment / setQty / delete) carries the `status='open'` guard into one SQL statement — closing the post-payment TOCTOU on the insert + setQty paths, not just the increment. It also fixes the **EXECUTE-grant gap**: the earlier `revoke … from anon, authenticated` was a no-op (Postgres grants new functions to `PUBLIC`), so all three cart RPCs now `revoke … from public` + `grant execute … to service_role` (mirrors `20260618000100_lockdown_grants`). Client a11y/UX: `TableCartProvider.refresh()` + the initial-load effect swallow the paid-cart 403 (no false-negative "Couldn't add", no unhandled rejection); the Stepper count is a plain `<span>` (not `<output>` — its implicit `role="status"` is announced on every press by NVDA/VoiceOver); the disabled pay CTA uses a visible `aria-describedby` note instead of `title`; AddButton says "Sold out" (not "86'd"); `CartBar` `encodeURIComponent`s the cart id.
- **Final symmetry + UX (fourth review/adversarial pass — gate PASS).** Migration `20260619000300_inc_qty_signal_closed` makes `mms_cart_item_inc_qty` **raise** on a closed cart instead of silently no-op'ing (it was the one path whose 0-row result the caller couldn't see → a phantom "Added"); the 99-cap stays a deliberate silent no-op on an open cart (signature unchanged → no type drift). `applyPromo`'s `qr_carts` write is now status-atomic too (`.eq("status","open")` + check) — so **all four** mutation paths are symmetric. The provider's live region is explicitly `aria-atomic`.
- **Reliability + observability (fifth pass — gate PASS, "correct and complete").** `/api/session` now checks the `session_members` insert error and 500s on any non-`23505` failure (a swallowed error previously returned a `cartId` that every later `assertCartMember` would 403 on — a silently broken session). `qr_carts.updated_at` touch failures are logged (non-fatal). Promo error UX: since Next redacts Server Action errors in production, the client can't read the failure reason off the thrown error — replaced the brittle message-match with one honest retry-safe message (per-reason promo messaging via a result-based return → M2).
- _Deferred (documented in `docs/REVIEW.md`):_ promo redemption caps/rate-limit → **M2·P2.1** (consume-on-fulfillment; no codes seeded today); **lock-cart-at-`create-intent`** (the stuck-payment vector) → **P1.3** with the unlock-on-failure lifecycle + webhook reconcile; `setQty` last-write-wins + the first-add double-insert merge → the **group-cart realtime** phase (neither is a charge error; no realtime concurrency is wired yet); `modKey` by option **id** vs label → when the modifier sheet ships; **qrCode host-squatting** (HMAC-signed QR payloads) → **M3** QR provisioning; raw `cartId` in the URL / paid-cart distinct message / Stepper debounce → later (the auth gate, not the id, is the guard).

### Added — M1·P1.1 anonymous-auth session wiring + Zod input layer + DB-drift CI (2026-06-18)

- **Anonymous-auth wiring (P1.1).** Diner identity is now a real, verified `auth.uid()` end-to-end (Supabase Anonymous Auth, decision #2):
  - **`AnonAuthGate`** (mounted in the root layout) calls `signInAnonymously()` on first load; the session persists in cookies via `@supabase/ssr`. **`useAnonSession()`** surfaces `{ accessToken, seat }` to client code (Realtime `setAuth`, Bearer fetches).
  - **`@mms/db/server` `serverClient(cookies)`** — SSR cookie-backed client so Server Actions / routes can read + **verify** the caller's `auth.uid()` (kept Next-agnostic via a cookie adapter).
  - **`POST /api/session`** verifies the `Authorization: Bearer` anon token (`getUser(token)`), records `session_members.seat_id = uid` (idempotent on rejoin), sets `host_seat`, and creates the host's cart — no client-asserted identity, no custom JWT (replaced the placeholder `crypto.randomUUID()` seat).
- **Per-action authorization (RED-TEAM #2; closes REVIEW.md gate #3 + QA §C "group-cart auth").** One guard — **`apps/qr/lib/authz.ts`** (`getCallerUid` + `assertCartMember`/`assertCartItemMember`) — gates **every** mutation: `addItem` / `setQty` / `applyPromo` (`cart.ts`), `scanAdd` (`grocery.ts`), and `create-intent` (closes `TODO(C3)`). Membership + cart-lock are re-checked from the verified uid before any write; `by_seat` provenance comes from the uid, not the client. `getCartTotals` moved to an internal `lib/totals.ts` (not a Server Action ⇒ no IDOR-read; the signature-verified webhook still calls it server-to-server).
- **Zod input layer (P1.0a).** `@mms/db/schemas` validates every external input at the trust boundary — ids `uuid`, money/qty non-negative `int`, tip capped ≤ 50%, barcode `^\d{8,14}$`, names length-capped. Routes return 400 on bad shape; actions throw. Pricing stays server-authoritative (the client only asserts _shape_: an item id + modifier ids).
- **DB-drift CI (P1.0a) + `supabase/config.toml`.** New `ci.yml` **`migrations-check`** boots a local stack (`supabase start`) applying `supabase/migrations` + seed, and **`types-fresh`** regenerates `database.types.ts` (`--local`) and fails on any drift. `config.toml` enables anonymous sign-ins (rate-limited, short JWT) as code; `db:types` regenerates the committed types the same way. (Generated `database.types.ts` added to knip ignore.)
- **Notes:** the live project's anonymous sign-ins must be toggled on (dashboard / `supabase config push`) for preview runtime. Grocery Scan & Go's demo cart is now correctly rejected by the authz guard until its real server-issued session lands (M2·P2.3) — the page degrades gracefully.

### Added — In-repo research context for remote sessions (`docs/context/`) (2026-06-18)

- **Problem:** Claude Code remote sessions only have `main`, but the decision-grade research (prototypes, red-team, QA gate, rubric, $0 stack) lived only in Min's Cowork workspace — so remote sessions built blind, and `CLAUDE.md`/`README` pointed at `../POS & Self-Serve 2026/…` paths that don't exist in a clone.
- **`docs/context/`** — distilled, durable subset that travels with every clone: `INDEX.md` (the map), `RESEARCH-DIGEST.md` (business · product · design · compliance · pricing _why_), `QA-CHECKLIST.md` (the canonical in-repo launch gate), `RUBRIC.md` (the 10-dim ≥4.3 bar), `RED-TEAM.md` (standing security/UX standards + known traps), `FREE-KIT-MAP.md` ($0 stack). Principle: **conclusions in git, process in Cowork.**
- **`docs/prototype/v7.2.html`** — the canonical visual/interaction reference (graded ≈4.3), copied byte-for-byte from the Cowork prototype.
- **`DESIGN-RESEARCH.md`** — distilled UI/UX research: the job-to-be-done + conversion evidence, the Sunday north-star teardown (with the review-gating FTC trap called out so a session doesn't copy it), the **paid UI-kit buy-list** (HeroUI Pro · Motion+ · shadcnblocks · Mobbin · optional React Bits), and the component/motion/voice craft bar — paired with the free stack.
- **Wired in:** `CLAUDE.md` + `README` + `docs/HANDOFF.md` index `docs/context/`; the SessionStart hook (`learning-context.mjs`) points every session at it; the PR-review prompt cross-checks `QA-CHECKLIST.md` + `RUBRIC.md` + `RED-TEAM.md`. Fixed the two broken `../POS%20…` README links and corrected the stale "one Supabase project" model in **`CLAUDE.md` and `README`** (QR + delivery are separate Supabase projects; QR owns its catalog).
- **Review workflow:** professional **`claude/<type>/<slug>` branch convention** (`CLAUDE.md` + `docs/WORKFLOW.md`); the diff-scoped **`adversarial-pr` gate is now fail-closed** (no verdict ⇒ fail, not pass) and re-promptable before merge via the **`adversarial` label**, with an **`adversarial-signed-off`** escape hatch for workflow-editing PRs that skip their own review under the anti-tampering guard. New labels added to `setup.sh`.
- **Product decisions captured:** `docs/context/ORDER-MODEL.md` — the dine-in service model (table-owned order · edit-rights by **line-state × role** · loss-gated voids + manager-PIN + **owner remote-approve** on one approvals primitive · **trust/secure tabs** on server discretion · **soft** multi-door convergence + one-tap merge · unified basket with to-go **fire-at-checkout**). Sequenced into `ROADMAP.md` as the **S1–S4 service-model track** with dependency notes + a recommended interleave (`M1→M2→M3→S1→S2→S3→M4→S4→M5→M6`).

### Added — Dedicated Supabase project: clean schema applied + seeded (2026-06-18)

- **QR now has its own Supabase project** (`MMS QR Platform`, ref `fasnpdhtvqtzjlvruqcu`) — no longer bending around the live delivery DB. The project came pre-seeded with an unrelated app's template tables (10 tables + a `handle_new_user` trigger on `auth.users`); cleared them after confirming 0 rows (the trigger would have broken anonymous sign-ins).
- **Applied a clean init schema** (`supabase/migrations/20260618000000_qr_platform_init.sql`): the catalog is **owned here** (`menu_categories`/`menu_items`/`modifier_groups`/`modifier_options`/`item_modifier_groups`/`grocery_items`), `tax_category` is a **first-class column on `menu_items`** (the `mms_menu_tax*` side-tables + resolver are gone), session/cart/order tables (`qr_*`), the cents tax engine, anonymous-auth **membership RLS**, realtime private-channel policies, and `mms_fulfill_order`.
- **Seeded the real menu** from `supabase/seed.sql` — 8 categories · 60 items · 7 modifier groups · 14 options · 6 grocery SKUs, with CA CDTFA tax classification.
- **Hardened grants** (`..._lockdown_grants.sql`): revoke `EXECUTE` from `PUBLIC` (Postgres' default) so `mms_fulfill_order` is service-role-only and `is_member`/`is_host` are `authenticated`-only; revoke `anon` SELECT on session-scoped tables. `get_advisors` is clean apart from documented, intentional exceptions.
- **Generated types + wired them in** (`packages/db/src/database.types.ts` → `createClient<Database>` in `@mms/db`): dropped the `as unknown` menu-embed cast and refactored `cart.ts` to read `tax_category` from the column (removed the deleted RPC). Old `packages/db/migrations/000{1,2}` superseded by `supabase/migrations/`.

### Added — Backend & database architecture design + advisor hardening (2026-06-18)

- **`docs/BACKEND_ARCHITECTURE.md`** — design of record for the four locked decisions: free-tier + a dedicated **staging** Supabase project (promote to prod manually), **Supabase Anonymous Auth** for diners (RLS off `auth.uid()`), **service-role Server Actions** as the authoritative write path, and **generated Supabase types + Zod** input validation. Covers the env/migration workflow (converge on the CLI timestamped format the delivery app already uses), the membership-based RLS model, the full backend routing map, the `@mms/db` package shape, and a phased plan (P1.0a infra → P1.1 auth → P1.2–P1.6).
- **⚠️ Documented the anon-auth blast radius:** enabling anonymous sign-ins on the _shared_ project grants every QR diner the `authenticated` Postgres role, so the delivery app's `authenticated` RLS must be audited on staging before enabling on prod (mitigations in §1).
- **Migration hardening (grounded in live `get_advisors`):** every QR function now pins `search_path` (bodies schema-qualified) and **revokes `EXECUTE` from `anon`/`authenticated`** (advisors 0028/0029); added **covering indexes** on every QR foreign key (advisor 0001). `mms_fulfill_order` / `mms_menu_tax_category` / the tax helpers are service-role-only.
- **ROADMAP:** inserted **P1.0a** (staging project, CLI migrations, typegen + Zod, CI `migrations-check`/`types-fresh`) and rewrote **P1.1** to the Anonymous-Auth membership model (was: custom HS256 table-session JWT). Updated `/api/session` + `useGroupCart` comments to the new model.

### Changed — M1·P1.0 schema reconciliation (2026-06-18)

- **Namespaced the QR session tables** `qr_carts` / `qr_cart_items` / `qr_orders` / `qr_order_items` so they no longer silently collide with the live delivery `carts`/`orders`/`order_items` (whose `create table if not exists` was no-op'ing). Repointed every query: `lib/cart.ts`, `lib/grocery.ts`, `app/api/session/route.ts`, the Stripe webhook, and the cart page.
- **Reads the real, delivery-owned menu.** `priceItem` + the menu RSC now hit the live `menu_items` (`name_en`/`name_my`, `base_price_cents`, `category_id → menu_categories`); modifiers are derived from the normalized `item_modifier_groups → modifier_groups → modifier_options.price_delta_cents` and **intersected server-side** so a client can't price a foreign/cheaper option id. Dropped the placeholder `menu_items` table + seed from `0001`.
- **Money is integer cents end-to-end** (parity with the delivery schema): `CartTotals`/`CartItem`, `lib/tax.ts` (`mms_line_tax` now `amount_cents → tax_cents`), the migrations (`*_cents` columns, grocery `price_cents`), and `create-intent` (no more `×100`). Dollars are formatted only at the UI edge.
- **Tax category sourced QR-side** without touching the delivery menu: `mms_menu_category_tax` (per-category default, seeded for all 8 live categories) + `mms_menu_tax` (per-item override), resolved by `mms_menu_tax_category()`.
- **Fulfillment** rewritten: `mms_fulfill_order` writes `qr_orders`/`qr_order_items` in cents and **reconciles** the breakdown against the PaymentIntent amount (the webhook recomputes `getCartTotals` with the `tipRate` carried in intent metadata; the function re-checks the sum == the charge and is idempotent on the PI id). Closes the L2 amount-reconcile TODO. ⚠️ Gem awarding stays deferred — `loyalty_rewards.user_id` is `NOT NULL`, so anonymous QR diners need an account link (M4) first.
- Validated read-only against prod (seed covers every category; cents tax math matches `lib/tax.ts`). Migrations are **not** applied to prod; Supabase branching needs the Pro plan, so apply on a branch before merge. See [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md). Gate green.

### Changed — Toolchain refresh to latest stable + M1 unblocking (2026-06-17)

- **Monorepo on latest stable:** pnpm 9.12→**11.7**, turbo 2.3→**2.9**, TypeScript 5.6→**6.0**, Next 16.1.2→**16.2.9**, React **19.2.7**, Stripe SDK 17→**22** (apiVersion pinned to the SDK's `2026-05-27.dahlia`, derived from the constructor type so future bumps can't drift it), `@supabase/supabase-js` **2.108**/`ssr` **0.12**, plus `@number-flow/react`, `@zxing/library`, `zustand`, Radix, Tailwind, prettier, knip. The supply-chain `minimumReleaseAge` guard auto-pinned PostHog to the latest release older than the cutoff.
- **pnpm 11 migration:** moved `overrides` from `package.json` to `pnpm-workspace.yaml`; added `allowBuilds` approval for `sharp`/`unrs-resolver` (and skipped `core-js`'s funding postinstall); bumped `pnpm/action-setup` + `setup.sh`.
- **Build fix:** `next/font/google` fetched via Turbopack's Rust fetcher failed behind a TLS-intercepting proxy; `next.config.ts` now opts Turbopack into the system trust store (no-op on Vercel) so the build is green in CI/remote sandboxes.
- **Lint upgrade:** re-enabled Next `core-web-vitals` (a11y/perf/react-hooks) — it ships a native flat config now — and fixed the warnings it surfaced (`react-hooks/exhaustive-deps` in `useGroupCart`, anonymous default exports). ESLint pinned to latest **9.x**: its bundled `eslint-plugin-react` still uses a context API removed in ESLint 10.
- **Types:** declared `@types/node` + `server-only` on `@mms/db` and set `types: ["node"]` (pnpm's symlinked store isn't picked up by TS auto-inclusion); dropped deprecated `baseUrl` (removed in TS 7); knip config modernized for v6.
- **⚠️ Data-migration blocker surfaced:** the live shared Supabase project already has `carts`/`orders`/`order_items`/`menu_items` with different shapes, so QR `0001`'s `create table if not exists` would silently no-op. Guarded the migration + documented the reconciliation plan in [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md); added **M1·P1.0** to the roadmap. Nothing applied to prod.

### Added — Theme-color viewport (2026-06-17)

- `apps/qr/app/layout.tsx`: split `themeColor` out of `metadata` into a separate `viewport` export (Next 16 contract). Light/dark schemes set so the mobile address-bar matches Day and Night surfaces.

### Added — Claude config + CI (2026-06-16, learned from the delivery app)

- **Claude Code config:** root `CLAUDE.md` (monorepo guide + developer profile), `.claude/settings.json` with hooks — SessionStart **learning-context**, SessionEnd **retro**, and a PostToolUse **auto-format** (Prettier + ESLint --fix on edited files, an improvement over the delivery app) — plus `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` memory, and `.mcp.json` (Supabase / GitHub / Sentry MCP).
- **Quality:** `@mms/config` shared preset (ESLint flat + Prettier) + root `eslint.config.mjs` / `prettier.config.mjs` / `.prettierignore` / `knip.json`; root scripts `lint`/`format`/`knip`.
- **Reviews/CI:** ported the delivery app's richer `claude-review.yml` (Vercel-preview-grounded, ultrathink/Opus, fork-safe, OAuth token) + `.github/claude-review-prompt.md` spec, and `ensure-preview.yml` (webhook-drop safety net).

### Planned (M1 — walking pay path)

- Sign the table-session JWT (`/api/session`); authz on every Server Action; Payment Element; webhook amount-reconcile; nonce CSP. See `ROADMAP.md`.

## [M0] — 2026-06-16 — Scaffold

### Added

- Turborepo + pnpm monorepo (`apps/qr`, `packages/{ui,db}`); `@mms/*` aliases; root config.
- `@mms/db`: Supabase browser/service/session clients, shared types, migrations.
  - `0001_qr_ordering.sql` — `table_sessions`, `session_members`, `carts`, `cart_items`, `orders`, `order_items`, `promo_codes`; RLS keyed to active-session membership (`is_member`/`is_host`); **private Realtime authorization**; **category-aware tax** (`mms_taxable`/`mms_line_tax`) replacing the flat 10.5%; menu seed; idempotent `mms_fulfill_order`.
  - `0002_grocery.sql` — UPC-keyed `grocery_items` (tax category + `ebt_eligible`) + seed.
- `@mms/ui`: editorial-forward + Night tokens, Radix-based accessible `Sheet`, NumberFlow.
- `apps/qr`: App Router shell, entry mode-picker, **menu RSC**, broad screen stubs (track/rewards/account/cart); **server-authoritative cart** actions; Stripe **create-intent** + **webhook** routes; **Realtime group-cart** hook; **grocery Scan & Go** (`BarcodeScanner` + `scanAdd` + `/grocery`); PostHog client; CSP/security headers; `next/image` policy.
- CI/reviews: `ci.yml` (turbo lint/typecheck/build), `claude-review.yml` (Claude PR + security review), `adversarial.yml` (weekly), `setup.sh` (public repo + Turbo link), `.github` templates + CODEOWNERS.
- Docs: `ARCHITECTURE.md`, `GROCERY_SCANGO.md`, `REVIEW.md`, `WORKFLOW.md`, `ROADMAP.md`.

### Fixed (post-scaffold red-team)

- Tax computed on the **discounted taxable base** (not a pro-rata of the rounded aggregate).
- Removed an over-broad host RLS `UPDATE` policy; all writes go through service-role Server Actions.
- `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`).
- Realtime presence uses a **stable** seat from the JWT (no per-subscribe churn).
- Stripe `create-intent` passes an idempotency key.

### Lineage

Productionizes the **v7.2 prototype** (design ≈4.3/5 on a 10-dimension world-class rubric; hardened across four parallel red-teams). The decision-grade research is distilled in-repo at [`docs/context/`](docs/context/INDEX.md) with the v7.2 reference at `docs/prototype/v7.2.html`; the full iteration history + Design Hub stay in Min's Cowork workspace (`../POS & Self-Serve 2026/02-design/`), outside git.
