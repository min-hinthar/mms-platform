# Phase 1c · grocery — integration notes

Branch `p1c/grocery` (base `0a1a5c6`). Four commits: pure libs + tests · tokens/contrast + the Scan
stage · Browse · masthead/door/labels/notes.

## §XX The market's front door (Phase 1c)

- **The door says only what the catalog keeps.** The home door reads "Browse the aisles or scan shelf
  barcodes as you shop" (the old masthead sub, verbatim). Browse is the default door
  (`GROCERY_DEFAULT_DOOR = "browse"`, `lib/grocery-landing.ts`) because every catalog barcode is a
  synthetic 299-prefix code; `/grocery?tab=scan` is the explicit in-store entry. The landing ladder is
  `?tab` link → the visit's stored tap → an `#aisle-*` hash → the default, and the only flip after
  mount is browse → scan, so the camera never starts on a door about to flip away. Only taps and
  `?tab` write the stored tap; an applied `?tab` is stripped with `replaceState(history.state, …)`.
- **The masthead is two lines** (§21 rhythm): the eyebrow "Grocery · စျေး" over "Shop the market" at
  `--fs-h1`. No sub, no exit tile before the toolbar; the exit is a quiet `.nav-link` at the page
  foot ("Back to the start — your basket stays saved on this device").
- **Ink box for the camera, paper for recovery.** idle · primer · starting · live share ONE fixed
  `section.scan-stage` (constant `--ink`, identical in both themes, never `.card-textured`); its
  height is declared twice on the property (vh, then svh), never through a custom property. denied ·
  busy · no-camera · unsupported · in-app · failed are EmptyState panels that grow freely, with one
  primary action ("Try again" or "Search by name").
- **The camera prompt follows a tap or a prior grant.** `cameraOpening`: no API / insecure →
  unsupported (in-app inside a webview); permission denied → the denied panel with no futile
  `getUserMedia`; granted → auto; prompt/unknown with a remembered grant (`mms-grocery-cam`) → auto;
  otherwise the primer's one tap. The permission query is raced at 500ms; a throw or timeout reads
  "unknown", never "granted". A denial under 400ms after a tap opens the settings help itself.
- **The camera runs only while the page is visible** and the Scan door is open: hidden → every track
  stopped; visible → restarted without a tap; Browse, a finished basket or a session error unmount the
  stage. The primer's note ("The camera is on only while this screen is open") says exactly that.
- **The lock claims "read", never "added".** Beat one is the reticle lock on an announced sighting
  (240ms scale + 900ms gold corners, transform/opacity only, RM → a static 900ms gold state); beat two
  is the server's verdict (haptic, toast, row). No sound (§15), no new haptic name (§12).
- **The result sits where the eye is, and a miss persists.** The result bar lives INSIDE the stage
  (never below the fold, above the reticle), written at every `add()` outcome through `slotAfter`:
  ok/repeat/queued → the M186 chip ("Add another"); a catalog miss from the camera → a notice
  (unknown: "Barcode not on file" + Search; weighed/unavailable: the kiosk's shipped copy). A Browse
  or search miss never plants a notice on the hidden Scan door. Not a live region — the toast is the
  view's announcement.
- **A sheet swallows sightings.** `decodeHold`: the basket sheet open → `swallow` (recorded in the
  throttle, never announced — before or after the sheet); no basket yet → `hold` (recorded; the
  `hold → none` edge resets the throttle so the item in frame adds once); only that edge resets.
- **Shelves of six.** The market home is the sticky aisle rail, then one shelf per stocked aisle —
  the first six in catalog order (no featured-first while G19 is open), "See all {n}" only when there
  are more — a snap rail on a phone (2 + a peek, gutter-bled), a 3-across grid from the tablet tier.
  Each shelf premieres once (`.mms-stagger`), never per card.
- **Aisles are hash entries, and lateral moves replace.** `#aisle-<slug>`: home → aisle pushes
  (marked `mmsAisle`, Next's `__NA` kept), aisle → aisle replaces, leaving an entry we pushed walks
  `history.back()` (so the in-page "All aisles" and the browser's Back look the same), a deep-linked
  aisle replaces. The rail's chips are links with `aria-current` (the lit cap moved from
  `aria-pressed`). Focus lands on the aisle view's heading on entry and returns to the opener on
  leave; scroll is restored by hand.
- **Focus never falls to `<body>`, and no live region is added.** Start/Try again → the stage box; a
  failure → the panel's visible h2 (`EmptyState titleId`); an ambient change moves focus only when
  focus was inside the stage and its element unmounts; Dismiss → the stage box; a finished basket →
  "Start a fresh basket". BarcodeScanner's `role="alert"` and Browse's catalog `role="alert"` are gone
  (the catalog failure is announced through the page's toast, only while Browse shows).
- **Money labels say pre-tax.** The Scan door's figure is "Subtotal · before tax"; both checkout CTAs
  are named "Check out — {n} item(s), subtotal $x before tax". Amounts are unchanged.

## CHANGELOG

- **Phase 1c · grocery — the market's front door.** The Scan door becomes one honest camera stage
  (a primer before any prompt, six recoverable failure panels, a result bar inside the viewfinder
  that keeps misses on screen, sightings swallowed under the basket sheet, the camera off whenever the
  page is hidden); Browse becomes a market home (shelves of six with "See all", aisles as Back-able
  hash entries); a two-line masthead; the home door promises only what the catalog keeps; the Scan
  figure and both checkout CTAs say "subtotal … before tax". Browse stays the default door;
  `/grocery?tab=scan` is the in-store entry.

## OPEN-ITEMS rows

| Sev    | Item                                                                                                                                                                                                                                                                                                                                                                                              | Why / where                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| close  | **G6** — camera permission is no longer a dead end: `cameraFailure` branches on `DOMException.name`, six recovery panels, Try again, settings help, in-app classification.                                                                                                                                                                                                                        | `lib/camera-state.ts`, `components/grocery/ScanStage.tsx`                                                  |
| update | **G5** partial — reticle, the decode lock (beat one) and a persistent miss notice shipped; the **torch** is still open; the beep is retired by §15.                                                                                                                                                                                                                                               | `components/BarcodeScanner.tsx`, `components/grocery/ScanResult.tsx`                                       |
| update | **G10** partial — pause (sheet swallow / pre-basket hold) and the visibility stop shipped; the rAF-rate BarcodeDetector throttle and the `@zxing/library` replacement on iPhone are still open.                                                                                                                                                                                                   | `components/BarcodeScanner.tsx`                                                                            |
| update | **G15** partial — BarcodeScanner's `role="alert"` and Browse's catalog `role="alert"` removed; the page's sessionError alert, the truth strip's `role="status"` and AisleFanNav's sr-only `aria-live` remain.                                                                                                                                                                                     | `app/grocery/page.tsx`, `components/grocery/AisleFanNav.tsx`                                               |
| update | **M187** — narrow to the server-totals half (`readGroceryView`): the labels now say "Subtotal · before tax" / "subtotal $x before tax"; the figure itself is still Σ unit × qty.                                                                                                                                                                                                                  | `app/grocery/page.tsx`, `components/grocery/GroceryBasketSheet.tsx`                                        |
| update | **C6** note — `grocery_scan_miss {barcode}` (PostHog, once per barcode per page life) now harvests the real shelf codes shoppers try; use it to pick the UPCs to capture.                                                                                                                                                                                                                         | `app/grocery/page.tsx`                                                                                     |
| med    | **Scan-first switch-on criterion** (the spec calls it G22): flip `GROCERY_DEFAULT_DOOR` only when shelf labels carry codes that match `grocery_items` AND `grocery_scan_miss` falls below an agreed share of scans. The switch-on PR must also add the device arms (fine pointer / no camera API / denied → Browse) and a pending landing state that holds the camera until the landing resolves. | `lib/grocery-landing.ts` docblock cites this row — assign the ID and update the citation if it is not G22. |
| owner  | Print a `/grocery?tab=scan` shelf/door sign (QR) for in-store shoppers — gated on the switch-on row above (the sign should not land shoppers on a camera that misses every real label).                                                                                                                                                                                                           | —                                                                                                          |
| low    | MEASURE on a real iPhone: what `navigator.permissions.query({name:"camera"})` reports on a repeat visit (the remembered-grant arm assumes "prompt"), whether the visibility restart re-prompts, and ZXing CPU while `swallow`ing under the sheet.                                                                                                                                                 | `lib/camera-state.ts` (`cameraOpening`), `components/BarcodeScanner.tsx`                                   |
| low    | MEASURE on devices: the two EN settings-help paths ("iPhone · Safari: tap aA … → Camera → Allow"; "Android · Chrome: tap the icon left of the address → Permissions → Camera → Allow") — OS labels must read as the device shows them.                                                                                                                                                            | `components/grocery/ScanStage.tsx`                                                                         |
| low    | MEASURE (starting values from the spec, not measured here): `INSTANT_REFUSAL_MS = 400`, `PERMISSION_QUERY_MS = 500`, the 400ms "Starting the camera…" delay, the stage height `min(width·0.75, 36svh)`, the shelf's 2.4 visible cards, and the aisle view's 72px rail allowance in `scroll-margin-top`.                                                                                           | `lib/camera-state.ts`, `components/grocery/ScanStage.tsx`, `app/globals.css` (Phase 1c · grocery)          |
| low    | Screenshots of every stage state and panel at 375×548, 390×664 and 768, light and Night, at 200% text, with and without the CTA band — not possible in the agent environment (no browser/device). At 375×548 the result bar and the reticle may touch (expected by the spec).                                                                                                                     | —                                                                                                          |
| low    | K15 — ~30 new Burmese strings in `lib/i18n/market.ts` (all Claude-authored) await Min's native read; the proposed glossary entry basket = စျေးခြင်း is K15-HIGH.                                                                                                                                                                                                                                  | `lib/i18n/market.ts`                                                                                       |
| low    | While the basket mints, the page-level "Starting your basket…" line and the stage's hint say the same thing on the Scan door (the page line predates the stage and also serves Browse).                                                                                                                                                                                                           | `app/grocery/page.tsx`                                                                                     |
| low    | Pre-existing (not introduced here): `add()`'s `useCallback` omits `truth` (`react-hooks/exhaustive-deps` warning, present on base). Safe to add now that the scanner reads `onScan` through a ref.                                                                                                                                                                                                | `app/grocery/page.tsx`                                                                                     |
| low    | Out of scope, carried: bilingual toasts (every /grocery toast is EN-only), the weighed type-2 UPCs (G9), the exit pass (G7), M233, G12, G13, G18, G20, SNAP/EBT checkout (2027), an aisle tile grid / compact-row card / featured-first shelves (wait on G19).                                                                                                                                    | spec `out_of_scope`                                                                                        |

## Mutate-set / CLAUDE.md enumeration changes

- **New file in the mutate set:** `apps/qr/lib/camera-state.ts` — bucket **lib** (measured with
  CLAUDE.md's own grep: `apps/qr/lib` 116 → **117**; total files 132 → **133**; the components,
  `app/api` and `packages/db` buckets are unchanged — so the enumeration reads 117+3+12+1=133).
- **Mutants added** (one `// ── Phase 1c · grocery ──` block at the end of `MUTANTS`; total 754 →
  **756**, measured by counting `id:` lines):
  - `grocery/a-sheet-over-a-minting-basket-only-holds` — KILLED by `lib/camera-state.test.ts`
  - `grocery/a-sheet-holds-instead-of-swallowing` — KILLED by `lib/camera-state.test.ts`
- **Mutants re-anchored:** none (no file already in the mutate set was edited;
  `pnpm check:mutant-anchors` clean, 756 anchors / 133 files).

## Owner-visible behaviour changes

- The home screen's Grocery door now reads "Browse the aisles or scan shelf barcodes as you shop"
  (was "Scan barcodes, pay, walk out").
- /grocery opens on Browse, as before. `/grocery?tab=scan` opens straight on the Scan door (use it for
  an in-store sign once shelf codes match the catalog).
- The masthead is just "GROCERY · စျေး" over "Shop the market"; the "Back to the start" exit moved to
  the bottom of the page.
- Scan tab: a barcode icon (was a shopping cart). Tapping Scan shows a black viewfinder box with
  "Scan as you shop" and a "Start scanning" button — the phone's camera prompt only appears after
  that tap (or straight away if the camera was already allowed). If the camera is blocked, busy,
  missing, or the shopper is inside Instagram/Facebook/LINE, a card explains it in English and
  Burmese with "Try again" and/or "Search by name"; a blocked camera also offers "How to turn the
  camera on".
- While scanning: corner brackets frame the barcode and flash gold the moment a code is read; the
  result stays inside the viewfinder — "Add another" for something already in the basket, or a
  "Barcode not on file" notice with a Search button (weighed / unavailable items show the kiosk's
  wording). The camera light goes off when the phone is locked or the tab is left, and comes back on
  its own. Nothing is added while the basket sheet is open.
- Browse: one row of six per aisle with "See all N"; tapping an aisle opens its full list, and the
  phone's Back button returns to the market. Burmese on the aisle chips is larger (13px).
- The Scan figure reads "Subtotal · before tax" (was "Running total"); screen readers hear "subtotal
  $x before tax" on both checkout buttons.

## Deviations from spec

1. **Docs not edited** (change 23; CLAUDE.md enumeration in change 22): the brief reserves
   DESIGN-LANGUAGE, CHANGELOG, OPEN-ITEMS, ROADMAP, HANDOFF and CLAUDE.md for integration — their
   content is in this file.
2. **`/line/i` is not a real mutation of the in-app regex.** The spec's test says `/line/i` goes red on
   the Android Chrome fixture because its UA contains "Linux" — but "Linux" does not contain "line"
   (l-i-n-u-x), so that mutation SURVIVED when induced. The pinned hazard is a looser PREFIX
   (`\bLin`), which does match "Linux" and was watched go red; the docblock and test comment say so.
3. **The Night `--on-ink` pin's "first falsifiable dark-merge assertion"** belongs to
   `contrast-audit.test.ts`, not composite-contrast: composite-contrast's own `.dark` merge was already
   falsifiable (reverting it throws on `--kds-held-op`). So the scan-stage pins live in
   composite-contrast as specced, AND a labelled two-case block in contrast-audit reads `--on-ink`
   through ITS merge — reverting that merge fails exactly that one case (1 of 90), measured.
4. **`mmsAisle` marker semantics.** The spec says every write passes `{...history.state, mmsAisle:
true}`. Taken literally, a lateral replace on a DEEP-LINKED aisle would mark it ours, and "All
   aisles" would then `history.back()` out of /grocery. As built: a push sets `mmsAisle: true`, a
   lateral replace keeps the entry's own marker, a replace to home sets it `false` — the marker means
   "an entry we pushed over the market home", which is what `pushedByUs` needs.
5. **`ScanSlot`'s chip carries a `key`** (`{kind:"chip", key}`), like the notice, so the bar re-keys
   per outcome as the spec's "`.mms-rise` keyed per outcome" requires.
6. **`gateOnHoldChange`** is an extra pure helper in `lib/camera-state.ts` (the hold → none reset rule
   the spec puts in BarcodeScanner), so the edge rule is falsifiable by a value as well as by the
   component suite.
7. **`queueOffline` takes `via`** so the `queued` outcome reaches `slotAfter` with its real door
   (`slotAfter` ignores `via` for queued; the change is honesty, not behaviour). Every refusal reaches
   `slotAfter` through one `if (!r.ok) noteOutcome(…)` above the reason chain rather than a call per
   branch; the transport catch calls it too.
8. **The aisle view's h2 is a `section aria-labelledby`**, and the rail's nav label is "Aisles" (was
   "Grocery aisles") per the spec's copy block.
9. **`check:style-literals` exits 1 by design** after commit 4: `css-tracking` FELL 10 → 9 (the
   spec'd removal of `.grocery-title`'s `-0.015em`). The guard demands `--update` for a fall and the
   brief forbids running it — integration re-records the baseline.
10. **The loading skeleton keeps its sr-only cue verbatim** ("Loading your basket…").

## LEARNINGS candidates

- **A spec's mutation line is a claim too — induce it.** "`/line/i` → red on the Android fixture"
  read right and was wrong: "Linux" is not "line". Only running the mutation showed the test was
  pinning nothing for that edit.
- **`git checkout -- <file>` to undo a red-first mutation also discards the file's uncommitted
  work.** Restore from a byte copy (and md5-compare) instead; the mutation runner used here does.
- **A mocked hook returning a fresh function per render re-runs every effect keyed on it.** The
  catalog read's effect depends on `diagnose`; an inline `async () => …` in the `useConnectionTruth`
  mock re-fetched on every render and doubled the failure announcement. Mocks of `useCallback`-backed
  hooks must return stable identities.
- **react-hooks v7 `immutability` treats a ref passed as a prop as a prop** — `pendingFocus.current =
…` in the extracted card was an ERROR until the prop was renamed `pendingFocusRef` (the rule's own
  hint: refs are recognised by a `Ref` suffix).
