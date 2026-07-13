# Journey II (K0–K6) — one house, three doors

**Where this comes from:** the Journey track (J0–J6, shipped) choreographed the paths we had. The
owner's read after walking them: _good direction, could be so much better_ — and the five critiques
behind that are all structural, not polish: the mode architecture is confusing (Scan & Go does two
unrelated jobs), dine-in has no real table identity, rewards don't feel owned once you're signed in,
the app can only think about one active order at a time, and the grocery surface is a toy next to the
menu. Journey II fixes the HOUSE, not the hallways.

Decisions locked with the owner (2026-07-12, recommendation-led options accepted):
**3 doors** (Dine-in · To-go · Grocery — Scan & Go dies as a customer-facing concept) ·
**table registry** (real table numbers 1–10, sticker-mapped, picker fallback) ·
**rewards continuity, all three** (persistent wallet card · stars merge on sign-in · quiet when
signed in) · **orders tray** (the pill becomes a live multi-order tray).

Companion docs: `JOURNEY_PLAN.md` (J0–J6, shipped) · `docs/context/RUBRIC.md` (axes + baseline) ·
`ARCHITECTURE.md`. The J-track's working rules carry over verbatim: **real data only, honest copy,
server-authoritative money, one live region per view, pre-PR + pre-merge adversarial passes, one
phase = one PR.**

## The five findings, restated as design problems

1. **The doors are wrong.** "Scan & Go" bundles counter food (a to-go order you happen to place
   standing up) with the grocery scanner (a different activity entirely). Diners shouldn't parse our
   internal plumbing at the front door.
2. **Dine-in has no address.** Sessions key on opaque sticker tokens; nothing in the room is called
   "Table 7" — not the greeting, not the kitchen ticket, not the floor board. Hospitality starts with
   knowing where someone is sitting.
3. **Rewards are earned but not HELD.** A signed-in regular still gets pitched "save your Stars", the
   balance lives only on /account, and signing in on a new device abandons that device's anonymous
   Stars (the #113 recovery copy says so out loud).
4. **One order at a time.** A real customer has a pickup in flight, sits down to eat, and grabs a jar
   off the shelf — three live orders. The header pill tracks exactly one; the rest vanish from view.
5. **Grocery is a stub.** The scanned list is client-local (a refresh eats it), shows no product
   photos (the catalog has them), and has no steppers — nothing like the menu's craft.

## K0 — Track spine (this doc + funnels relabel) `docs + analytics, small PR`

- This plan, the ROADMAP track section, and the K-axes note in `RUBRIC.md` (the J-axes carry over —
  Journey II moves J-B progress-clarity, J-C effort, and J-F recognition; no new axes needed).
- PostHog: add a `door` property to `session_created` (client-known at mint) so the three-door IA can
  be funneled distinctly even where two doors share an internal mode. Re-pin the dashboard with
  door-keyed funnels alongside the J0 originals (the before/after seam is the relabel date).

## K1 — Three doors (the entry IA) `apps/qr, one PR`

The entry becomes three honest doors; the internal mode values (`dinein|scango|pickup` — a DB CHECK
constraint) do NOT migrate. Presentation moves; plumbing stays.

- **Dine-in** — unchanged flow (sticker deep-link or host-start), now landing on K2's table identity.
- **To-go** — one door for "food I'll carry out": **Now or scheduled** decided INSIDE the door, not
  by picking a different app mode. **Wiring decided by plan-critique recon (not deferred): the door
  offers Now → `scango` menu / Schedule → `pickup` menu as its first interaction.** The "ASAP slot"
  alternative is DEAD on evidence: create-intent hard-400s a slotless pickup cart and re-validates
  against `mms_pickup_slots` (capacity-checked real slots only) — ASAP is unrepresentable there
  without editing the money path + a migration, which would falsify this phase's "presentation moves,
  plumbing stays" claim. To-go-Now's real semantics ARE today's scango counter-food flow (orders
  reach staff via the expo at pay; the KDS is dine-in-only), so this wiring delivers them with zero
  money-path risk.
- **Grocery** — its own first-class door straight to the scanner (K5 gives it a worthy surface).
- The entry page is a designed moment, not a utility switch: three doors with the same card language
  as the menu (photo, bilingual line each), because the front door is a first impression too.
- Copy sweep: "Scan & Go" disappears everywhere diner-facing (header eyebrows, ArrivalBeat lines,
  /track mode labels, exit pass); staff surfaces may keep internal vocabulary.
- **Honesty rule for the funnels:** the `door` property (K0) keeps To-go-ASAP distinguishable from
  grocery even if they share `scango` plumbing in wiring (b).

> **Shipped (2026-07-13).** Entry = three doors (Dine-in · To-go · Grocery), bilingual EN/MY, grocery
> promoted to a peer. `TogoDoor` is a disclosure (`aria-expanded` + `inert`/row-collapsed closed panel,
> RM-safe) revealing Now→`scango` / Schedule→`pickup`. K0 `?door=` threaded entry→menu→`TableCartProvider`
> →`useTableSession`→mint, narrowed to the enum server-side. "Scan & Go" retired diner-facing (menu
> eyebrow, /track label, grocery H1); staff surfaces keep `scango`. Doors use the emoji-tile card
> language, not photos (no assets exist — a broken/stock image would be worse). Funnel re-pin at K6.

## K2 — The table registry (the track's one migration) `apps/qr + 1 migration, one PR`

- **Migration:** `qr_tables` — `table_number int primary key check (1..N config)`, `qr_code text
unique` (the physical sticker's opaque token), `active bool`. Seed 1–10; the sticker↔table mapping
  is data, so re-stickering a table is an UPDATE, not a deploy. Plus `table_sessions.table_number
int null references qr_tables(table_number)`.
- **Convergence rule (the critique's key catch):** the picker path ADOPTS the table's registered
  sticker token as the session `qr_code` — find-or-create by that token, exactly as if the sticker
  had been scanned. Scan and picker therefore land in the SAME session (the existing
  `table_sessions_active_qr_uniq` partial index + the 23505 re-read convergence already arbitrate
  the race); a companion scanning the physical sticker after a picker-start joins the party instead
  of minting a split-brain twin. One active session per table is the invariant; the occupancy display
  becomes a JOIN affordance ("Table 3 is seated — join them, or pick another"), not a warning about
  parallel sessions (which the machinery rightly forbids).
- **Unknown/unregistered tokens keep working:** a `?t=` token not in `qr_tables` mints a session with
  `table_number = null` (today's behavior — never brick a legacy/unregistered sticker) and the floor
  board flags it "unregistered sticker" so staff map it in the registry.
- **The number flows everywhere it's been missing:** ArrivalBeat ("Mingalaba, Min ✦ · Table 7"),
  GuestList/invite copy, KDS + expo tickets, the floor board (real labels at last), /track, the
  receipt, the settle beat. The J2 honesty constraint ("sessions carry no human table label") is
  RESOLVED by making the label real, not by fabricating one.
- Guards: the picker is advisory; the server re-checks the table exists + is active in the mint;
  occupancy is read-only truth (active sessions) rendered as the join affordance above.

> **Shipped (2026-07-13).** Migration: `qr_tables` (RLS-locked, service-only — anon `permission
denied`; opaque 8-char tokens matching the join-code UX) + `table_sessions.table_number` FK +
> denormalized `qr_orders.table_number` stamped in all three fulfill RPCs (additive; money math
> untouched). **Owner's call on the occupancy fork: a SEATED table needs the party's code** (not a
> code-free remote join) — so open→claim&host, seated→`?j=` code entry; the physical sticker stays
> the code-free path. Picker `/dine-in` routes by NUMBER (`?table=N`) — the token never reaches the
> client; the mint resolves it server-side, re-checks active, and the CLAIM path 409s rather than
> converge onto an already-active table (race-safe against the plan's convergence, which stays for the
> sticker path). The number flows to arrival/guest-list/invite/settle + floor/KDS/expo (staff) +
> track/receipt (denormalized, expiry-durable). Unregistered tokens → `table_number` null, flagged on
> the floor.

## K3a — Rewards presence (chip + quiet) `apps/qr, one PR`

- **Persistent wallet card:** signed-in diners get a compact Stars chip in the journey (menu header +
  checkout review — balance ✦ + tier tint, tap → /account). Real balance (`getRewardsProgress`-class
  read), never cached stale across a payment; anonymous diners keep the current quiet treatment (the
  chip is recognition, not a pitch).
- **Quiet when signed in:** `AccountUpgrade` becomes a status card for upgraded users (who you are +
  sign-out), and every "save your Stars" pitch line site-wide gates on `!isUpgraded`.

## K3b — Stars merge on sign-in (its own PR — the track's deepest review) `apps/qr + 1 migration`

Split from K3a deliberately (the critique's call): the merge is the one genuinely new authorization
surface in the track AND its hardest money problem — it must not ship padded with chip styling.

- **The merge:** signing in to an existing account from a device with anonymous Stars currently
  ABANDONS them (#113's honest copy says so). Fix with a server-verified merge: while still
  anonymous, the device mints a short-lived, single-use **merge token** (server-signed, bound to the
  anon uid); after sign-in the client redeems it and the server re-stamps that anon uid's `earned_by`
  orders + `qr_favorites` (+ feedback rows) onto the signed-in uid, then invalidates the token.
  Client-asserted uids are never trusted — the token IS the proof of having held the anon session.
  **It must survive the Google path:** `identity_already_exists` recovery is a full-page PKCE
  redirect, so the token is minted BEFORE any sign-in begins and persists in storage across the
  redirect; the upgrade-in-place path (`email_change`, same uid) needs no merge at all.
- **The coupon problem (specced BEFORE build — the critique's top finding):** `mms_rewards` is a
  materialized ledger minted from a bare `count(*) where earned_by = uid` with
  `unique(user_id, milestone_index)`. A naive re-stamp re-counts orders that already produced
  (possibly redeemed) anonymous coupons — the same 5 paid orders could mint a SECOND $5 coupon on
  the target — and anon-held unredeemed coupons would strand on the dead uid. The merge migration
  therefore: (1) moves the anon uid's coupons to the target (unredeemed stay live; redeemed move as
  history), (2) re-indexes on collision, and (3) sets the target's mint WATERMARK to the merged
  ledger's max milestone index so `mms_reward_on_fulfill` can never re-mint a milestone either uid
  already produced. Star-count jumps across skipped milestones mint nothing retroactively — the
  watermark rule, stated in the migration, is the invariant the adversarial review checks.
- Idempotent + bounded; the UI says exactly what moved ("2 orders and 14 Stars joined your account").

## K4 — The orders tray (many live orders, one calm surface) `apps/qr, one PR`

- **Server read:** `getMyLiveOrders()` — uid-scoped (`earned_by`), status `paid`, pre-terminal
  (togo_status not `picked_up`), **time-bounded (last 12h) AND session-bounded for dine-in**
  (`expires_at > now()` — nothing in the diner settle flow closes a session; staff close, the 4h
  sliding TTL sweep, or a re-mint do, so "until the session closes" alone would show a finished
  dinner as live for hours, and pre-sweep rows are still status='active'). Count-bounded,
  newest-first. Honest limitation, stated where relevant: cash-settled orders carry no `earned_by`
  (they earn nothing) and are invisible here — same attribution rule as rewards. Plus the open carts
  the device already knows (resume-your-table/basket).
- **The tray:** the header pill grows a live count badge; tap opens a sheet listing every in-flight
  order — mode icon, honest status chip (the same words /track uses), table number (K2) or slot or
  "exit pass" context — each row tapping through to its own /track. One realtime-ish freshness rule:
  refetch on open + visibilitychange (the J3 pattern), no new channels.
- **/account "Today":** the same read rendered as a section above order history.
- ActiveOrderProvider evolves from `order: ActiveOrder | null` to a keyed store; the single-pill
  behavior remains the collapsed state (badge hidden at ≤1 live order — the tray earns its ink only
  when it disambiguates).

## K5 — Grocery, grown up `apps/qr, one PR`

- **Server-hydrated list:** /grocery renders the CART's grocery lines (survives refresh; the local
  optimistic layer stays for scan-instant feedback — same pattern as the menu's optimistic adds).
- **Product-grade rows:** photo (`grocery_items.image_url`), name, EBT tag, unit price, **qty
  steppers + remove** (the existing `setQty` path — no new money surface), line totals — the same
  card craft as menu rows.
- Steppers bind to CART-LINE ids from `getCartView` (not barcodes) — `setQty` is line-generic, so
  "no new money surface" holds literally.
- The giant running total and exit pass (J6) stay the anchors; the scanner stays the hero interaction.
- **PULLED FORWARD (the critique upgraded "can" to "must"):** the local-only list is a live
  money-display bug today — after a refresh the page says "Nothing scanned yet" and the checkout CTA
  vanishes while the server cart still holds (and will charge) the items, and a re-scan doubles the
  server qty behind a UI showing 1. K5 builds FIRST.

> **Shipped (2026-07-13).** As designed: `getGroceryLines` (member-gated, voided excluded) hydrates
> on session-ready + tab re-focus; `scanAdd` returns the fresh server view in its own response (the
> addItem one-round-trip pattern) so the list reconciles from the scan itself; product rows (56px
> photo, EBT tag, qty × unit, line total) with 44px aria-labeled steppers on CART-LINE ids through
> the existing `setQty` (qty 0 removes — no new money surface), optimistic + server-reconcile +
> single-flight `busyLine`; honest "Checking your basket…" until the first read lands. K0's `door`
> property rode along (`door: "grocery"` on the mint; menu wiring waits for the K1 doors; funnel
> re-pin at K6).

## K6 — Close the track `docs + sweep, small PR`

- Door-keyed funnel screenshots vs the J0 originals; rubric re-score of the three door-paths
  (self-scored, marked as such — same honesty as the J6 close); QA-checklist sweep of every new
  surface; LEARNINGS entries for the sharp edges.

## Sequencing + rules

**K0 → K5 → K1 → K2 → K3a → K3b → K4 → K6.** K5 first — it fixes a live money-display bug (see
K5). K1 before K2 so the doors exist before the table identity lands behind the dine-in door. K3
split: presence (K3a) ships light; the merge (K3b) ships alone under the track's deepest review.
Every phase: recon before design, the pre-PR sweep, the fresh-context adversarial subagent pre-PR
AND pre-merge with verdicts posted, per-PR "merge go" from the owner. Money rules unchanged and
non-negotiable: prices server-derived, RLS everywhere, no new write primitives where an existing
guarded one serves.

**Known honest limits going in:** the merge token design must survive adversarial review before any
build (it touches attribution = money-adjacent); table occupancy display is truth-at-read-time, not
a reservation system; the tray shows orders this UID earned — a split-tender guest sees their table's
order only while their session lives (attribution is the host's, same as rewards).
