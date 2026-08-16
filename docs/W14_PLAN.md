# W14_PLAN — The profile slice (recognition · history richness · account presence)

**Status: SHIPPED (2026-08-14).** Owner directive: "plan-build next production readiness, profile
design thinking world class." Design parents: `docs/context/RUBRIC.md` **J-F Recognition**
("Visit N ≠ visit 1: welcomed back, remembered, one tap to the usual" — the axis that baselined at
**1**, the worst in the table), `docs/prototype/v7.2.html` `accountHTML()` (the profile card with
avatar-initial + "Teahouse regular · ✦140 · since 2023", photo-led history rows, the receipt
sheet's "Reorder these"), `docs/context/DESIGN-RESEARCH.md` §"Photos sell ≈ +35%" + principle 5
(bilingual parity), `docs/M4_DESIGN.md` (the account spine + its deliberate deferrals).

## The audit (what the map found)

The `/account` machinery is sound — server-authoritative reads, W9c error honesty, the K3b merge,
the W11 payer visibility — but the _surface_ fails J-F on three counts:

- **No name, ever.** `mms_profiles.display_name` exists (1–80 CHECK, owner-read RLS, service-role
  write) and is read in three places (`AccountStatus` heading, `getWelcomeBack` — the designed
  "Mingalaba, Min ✦" greeting — and `firstNameOf` for the lend confirm), but **nothing writes it**.
  `ensureProfile` upserts only `{id, email}`. So the signed-in heading is a raw email, the greeting
  is structurally nameless, and `WelcomeBackChooser` always falls back to a masked email.
- **History is a text ledger, not a memory.** v7.2 leads every history row with a dish photo;
  `qr_order_items` carries no `image_url`/`name_my` — but `menu_item_id` is a soft text ref, so a
  batch join to `menu_items` needs **no migration** (the exact shape W13 shipped for `getCartView`).
  History is also monolingual while `name_my` is 100%-populated and rendered on every pre-pay
  surface.
- **The reorder link guesses the mode** (registry J19): non-pickup orders land scan&go even when
  the order was dine-in food, while `modeFromOrder()` — built for exactly this — sits unused three
  files away. And K7 switch/lend leaves `mms.qr.dinein` + `mms.name` behind, so "Order for a
  friend" hands over a clean auth session attached to a dirty device session.
- **`/account` never says "we know you."** `getWelcomeBack()` (visits-this-month at the LA clock)
  is called only on the menu; favorites live only on the menu rail; the skeleton has no shape for
  the identity card or Today section (layout shift for exactly the returning diners J-F is about).

## W14·1 — recognition: the name finally exists

- **`setDisplayName` server action** (`lib/rewards.ts`): SSR-verified uid, **upgraded accounts
  only** (a device-bound anon "profile" would promise durability the 4h TTL breaks), Zod
  `trim().min(1).max(80)` mirroring the column CHECK, `withinMutationRate` flood guard,
  service-role update. Clearing = set null (the column allows it).
- **`AccountStatus` grows the v7.2 profile card**: avatar circle (first grapheme of
  name-else-email, `aria-hidden`, tier-tinted ring), name-or-email heading, secondary email line,
  **tenure line** "Member since {Mon YYYY}" from `mms_profiles.created_at` (surfaced through
  `getRewardsState` — one added select field), tier chip unchanged. An inline **"Add your name" /
  "Edit name"** affordance: single text input + Save/Cancel, the same one-line inline-confirm
  idiom the card already uses (focus parks on Cancel, returns to trigger), busy state, honest
  failure line through the card's one `role="status"`.
- **Seed-once from the device name**: the checkout already collects `mms.name` for pickup; the
  edit form **prefills** (never auto-writes) from it — the diner confirms, we don't assume.
- **What the name lights up, for free**: `getWelcomeBack().name` → the menu's "Mingalaba, {first
  name} ✦"; the lend confirm's "back to {name}"; `WelcomeBackChooser` chips show a first name
  instead of a masked email. All three reads exist today.
- **J19 device hygiene**: `toGuest()` (switch + lend) clears `mms.qr.dinein` + `mms.name` — a
  handed-over device must not be able to rejoin the owner's table under the owner's name. The keys
  live in `lib/` constants; the clear is a pure helper (`lib/device-session.ts`) pinned red-first.

## W14·2 — history richness: photos + Burmese on the receipt

- **`getOrderHistory` joins the catalog** exactly the way W13's `getCartView` does: partition the
  order lines' soft `menu_item_id` refs by `uuidRe` — uuid refs batch-read
  `menu_items.select("id,image_url,name_my")`, non-uuid (barcode) refs batch-read
  `grocery_items.select("barcode,image_url,name_my")` — one `Promise.all`, a Map keyed by ref,
  join failure degrades to the text row (never a dead history). Lines gain
  `imageUrl: string | null` (through `safeImageUrl` — containment only since W16d; it was the now-
  deleted `displayImageUrl`, whose filename filter
  rule) and `nameMy: string | null`. **Live-vs-snapshot caveat** (registry S14b): the joined
  name/photo is TODAY's catalog against an add-time snapshot — acceptable for a thumbnail +
  subline; the EN snapshot name stays the row's primary text.
- **History rows lead with the photo** (v7.2 `.hrow` pattern): 44px thumb on the summary row
  (first line's image, `BlurUpImage` + `PhotoPlaceholder` always — the W13 idiom), `name_my`
  subline (`lang="my"`, `--font-my`) on the detail lines. `sizes="44px"`.
- **The reorder link stops guessing** (closes J19's mode half): compose the href from
  `modeFromOrder({pickupSlot, tableNumber, ...per-line fulfillments})`. The one honest exception
  stays: a historical **dine-in** order reordered from `/account` must NOT mint a phantom table —
  `modeFromOrder` maps that case to scan&go/pickup exactly as designed (it never returns a table
  the device doesn't hold).
- **M46 discipline — extract before enriching**: the inline decision logic (`groupByMonth`, the
  fulfillment-kind precedence, item-count reduce, reorder-href composition, and the new
  thumb-pick rule) moves to **`lib/order-history-view.ts`**, red-first unit tests; the `.tsx`
  keeps only rendering.

## W14·3 — account presence: the page knows you

- **Masthead recognition line**: `/account` calls `getWelcomeBack()` (it already exists —
  decorative, swallow-on-fail): signed-in with a name → "Mingalaba, {first name} ✦"; N≥2 paid
  orders this month → "· {N} orders this month". Absent data renders the masthead exactly as
  today (no fabricated tenure/visits — the honesty rule).
- **Favorites strip**: a compact `role="list"` of the diner's hearts (`getFavoriteIds` +
  menu-item join, capped 8, in-stock first), each linking to the menu (`menuHref(null)` rules
  respected — no mode guess), with the designed placeholder for photo-less dishes. Renders only
  when hearts exist (recognition, not a pitch — the WalletChip rule).
- **Skeleton parity** (`loading.tsx`): add the identity-card block and a Today-row block so the
  swap doesn't shift for signed-in returners (RUBRIC #1 — a named perennial laggard).
- **Bilingual accents** (the W13 heading idiom): "Rewards & account · ဆုလက်ဆောင်နှင့် အကောင့်"
  masthead subline + the history heading — accents only; the toggle stays W5 (S2).

## Hardening + the rules that bind

- **No migration in this slice.** Every read rides existing columns; the name write hits an
  existing service-role column with an existing CHECK. (M3 option-ids, S1 receipt artifact,
  settings/theme/locale — deliberately out, registry.)
- Money discipline: history amounts stay the fulfillment-time snapshots rendered verbatim —
  the join adds media only, never touches a number.
- New client logic testable by construction: `order-history-view.ts` + `device-session.ts` are
  pure `lib/` modules, red-first; no `.test.tsx` (M46).
- a11y: avatar + thumbs `aria-hidden` (the name is already in the row's composed label); the name
  form is a labeled input; focus returns to the edit trigger on save/cancel; no new live regions
  (the card's existing `role="status"` is the announcer).
- Images: containment everywhere a URL crosses to `next/image`; 44px `sizes`. ⚠️ **W16d:** the
  helper named here (`displayImageUrl`) is GONE — it also filtered by FILENAME on a wrong
  assumption and hid 34 real dish photos. Use `safeImageUrl` (containment only); see
  `apps/qr/lib/media-url.ts`.
- Every new animation rides token durations (auto-collapsed under RM) or gets its own RM block.

## Deliberately out (registry)

- **M3** modifier option-ids (faithful reorder) — needs a schema + write-path change; the
  single highest-leverage migration for this surface, its own slice.
- **S1** receipt artifact (email/print/durable link) — W2e, gated on C8 (from-address).
- **S2** the EN↔MY toggle — W5's milestone; W14 ships accents.
- **M29's product half** (do split payers earn?) — still deliberately unmade.
- Settings (theme/language/payment methods) — hollow until the runtime supports them
  (`M4_DESIGN.md` §deferred); v7.2's perk grid stays demo fiction.
- Pagination/search past 20 orders; the spend-recap layer; anon identity object.

## Slices

- **W14·1** — `setDisplayName` + profile card (avatar · tenure · edit) · greeting/lend/chooser
  light-up · J19 device-key hygiene.
- **W14·2** — history catalog join (photos + `name_my`) · thumb rows · `modeFromOrder` href ·
  `lib/order-history-view.ts` extraction (red-first).
- **W14·3** — masthead recognition · favorites strip · skeleton parity · bilingual accents.
- **W14·4** — docs sweep · gates · ONE capped review · PR #169 → ready + auto-merge.
