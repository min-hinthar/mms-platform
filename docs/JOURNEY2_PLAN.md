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
- **To-go** — one door for "food I'll carry out": **ASAP or scheduled** decided INSIDE the door, not
  by picking a different app mode. Recon decides the wiring, two candidates (build-time decision,
  recorded in the shipped note):
  (a) _preferred if it holds:_ To-go = `pickup` mode with an **"ASAP" slot option** added — the slot
  sheet's first choice becomes "As soon as it's ready" (fires at checkout, like today's scango
  make-it-now); scheduled slots unchanged. `scango` then becomes grocery-only.
  (b) _fallback:_ the To-go door offers Now → `scango` menu / Schedule → `pickup` menu as its first
  interaction. (Two taps where (a) has one — only if (a)'s fire-at-checkout recon finds a money-path
  landmine, e.g. create-intent requiring a slot.)
- **Grocery** — its own first-class door straight to the scanner (K5 gives it a worthy surface).
- The entry page is a designed moment, not a utility switch: three doors with the same card language
  as the menu (photo, bilingual line each), because the front door is a first impression too.
- Copy sweep: "Scan & Go" disappears everywhere diner-facing (header eyebrows, ArrivalBeat lines,
  /track mode labels, exit pass); staff surfaces may keep internal vocabulary.
- **Honesty rule for the funnels:** the `door` property (K0) keeps To-go-ASAP distinguishable from
  grocery even if they share `scango` plumbing in wiring (b).

## K2 — The table registry (the track's one migration) `apps/qr + 1 migration, one PR`

- **Migration:** `qr_tables` — `table_number int primary key check (1..N config)`, `qr_code text
unique` (the physical sticker's opaque token), `active bool`. Seed 1–10; the sticker↔table mapping
  is data, so re-stickering a table is an UPDATE, not a deploy. Plus `table_sessions.table_number
int null references qr_tables(table_number)`.
- **Sticker scan** (`?t=<token>`): the session mint resolves the token → table number and stamps the
  session. **Host-start without a sticker:** a designed table picker (1–10 from the registry, live
  occupancy honestly shown from active sessions — "Table 3 · party of 4 seated" so nobody claims an
  occupied table by accident; picking one stamps the session the same way).
- **The number flows everywhere it's been missing:** ArrivalBeat ("Mingalaba, Min ✦ · Table 7"),
  GuestList/invite copy, KDS + expo tickets, the floor board (real labels at last), /track, the
  receipt, the settle beat. The J2 honesty constraint ("sessions carry no human table label") is
  RESOLVED by making the label real, not by fabricating one.
- Guards: the picker is advisory, the server re-checks the table exists + is active in the mint;
  occupancy display is read-only truth (active sessions), never a lock (two parties CAN share a
  table — a warning, not a wall).

## K3 — Rewards you can hold `apps/qr (+ 1 tiny migration if merge needs a ledger), one PR`

All three, per the owner:

- **Persistent wallet card:** signed-in diners get a compact Stars chip in the journey (menu header +
  checkout review — balance ✦ + tier tint, tap → /account). Real balance (`getRewardsProgress`-class
  read), never cached stale across a payment; anonymous diners keep the current quiet treatment (the
  chip is recognition, not a pitch).
- **Stars merge on sign-in (the #113 gap, done right):** signing in to an existing account from a
  device with anonymous Stars currently ABANDONS them. Fix with a server-verified merge: while still
  anonymous, the device mints a short-lived, single-use **merge token** (server-signed, bound to the
  anon uid); after OTP sign-in the client redeems it and the server re-stamps that anon uid's
  `earned_by` orders + `qr_favorites` (+ feedback rows) onto the signed-in uid, then invalidates the
  token. Client-asserted uids are never trusted (a bare "merge uid X into me" endpoint would be an
  account-takeover primitive — the token IS the proof of having held the anon session). Loyalty
  recount is automatic (`mms_rewards_summary` derives from `earned_by`). Idempotent + bounded; the
  UI says exactly what moved ("2 orders and 14 Stars joined your account").
- **Quiet when signed in:** `AccountUpgrade` becomes a status card for upgraded users (who you are +
  sign-out), and every "save your Stars" pitch line site-wide gates on `!isUpgraded`.

## K4 — The orders tray (many live orders, one calm surface) `apps/qr, one PR`

- **Server read:** `getMyLiveOrders()` — uid-scoped (`earned_by`), status `paid`, pre-terminal
  (togo_status not `picked_up`; dine-in orders until their session closes), bounded + newest-first.
  Plus the open carts the device already knows (resume-your-table/basket).
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
- The giant running total and exit pass (J6) stay the anchors; the scanner stays the hero interaction.

## K6 — Close the track `docs + sweep, small PR`

- Door-keyed funnel screenshots vs the J0 originals; rubric re-score of the three door-paths
  (self-scored, marked as such — same honesty as the J6 close); QA-checklist sweep of every new
  surface; LEARNINGS entries for the sharp edges.

## Sequencing + rules

**K0 → K1 → K2 → K3 → K4 → K5 → K6.** K1 before K2 so the doors exist before the table identity
lands behind the dine-in door (K2's arrival copy assumes the new entry). K5 is independent — it can
be pulled forward any time as a quick win. Every phase: recon before design, the pre-PR sweep, the
fresh-context adversarial subagent pre-PR AND pre-merge with verdicts posted, per-PR "merge go" from
the owner. Money rules unchanged and non-negotiable: prices server-derived, RLS everywhere, no new
write primitives where an existing guarded one serves (K3's merge is the one genuinely new
authorization surface in the track — it gets the deepest review).

**Known honest limits going in:** the merge token design must survive adversarial review before any
build (it touches attribution = money-adjacent); table occupancy display is truth-at-read-time, not
a reservation system; the tray shows orders this UID earned — a split-tender guest sees their table's
order only while their session lives (attribution is the host's, same as rewards).
