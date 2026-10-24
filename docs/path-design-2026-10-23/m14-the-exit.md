# picked-m14 — The exit after paying: Walked to the Door (guided), refined

<!-- round4-citation-key -->

> **Reading this spec.** It is one moment of round 4; the record is [`../PATH_DESIGN_2026-10-23.md`](../PATH_DESIGN_2026-10-23.md), and where the two disagree the record's _Cross-spec reconciliations_ win, then this file's appendices, then its body. Code citations are against `origin/main` @ `09c1c2a`; a bare path is under `apps/qr/`. A few citations name the round's working files, which are not in the repo: **`common.md` D1–D8** are the record's defaults **R4·1–R4·8** (same numbers); **`vocab.md`** is the record's _Shared vocabulary (round 4)_; **`amend.md`** is this spec's appendix A (and the record's reconciliations); **`brief-mNN.md`** and **`mNN.json`** are the three concepts and the judges' notes, summarized in the record's section for this moment; **`picked-mNN.md`** is this file's own body (the critic's line numbers in appendix B point into it as it stood before the appendices); **`lens.md`** is the round's design lens, restated in the record's opening sections. Every Burmese string marked _K15 draft_ is a draft for the native sitting, never final copy.

Backbone: **Walked to the Door (guided)** — one farewell, then one quiet question at a time in a single
slot under it, a visible "Before you go · 1 of 2", "Not now" met with silence, and the house's ONE Undo
form before the one write this moment makes. Grafts applied (m14.json → .judgement.grafts, all six):
(1) `FEEDBACK_UNDO_MS = PICKED_UNDO_MS` (6 s), (2) the shipped `askOurStaff` pair after a 1–3,
(3) the quiet tail NOT grafted, (4) "How was everything?" + "ဘယ်လိုလဲ?" verbatim from v7.2:544,
(5) "See your receipt →" as the Bill close card's ONE hero verb, (6) the farewell's Burmese at
`--fs-h1` 26px. Not grafted: drag-to-rate, the seal, the implicit decline. D1 (common.md) applied exactly.

Every product claim below was read against `origin/main @ 09c1c2a` (`git rev-parse --short HEAD` →
`09c1c2a`). Where a claim failed, the design changed (see DECISIONS 7, 9, 14).

## The code as it stands (the facts the three screens depend on)

- The post-pay mount order below the slip is ReceiptActions → SaveStarsPrompt → GoodbyeBeat →
  FeedbackPrompt (`apps/qr/components/OrderTracker.tsx:1631-1667`). The goodbye is gated on `justPaid`
  (`:1659`); the feedback ask is not (`:1665`); both share the J4 food-in-hand clock
  `arrived && !refunded && (!order.hasTogoFood || togo === "picked_up")`.
- Three live regions on one view: the tracker's (`OrderTracker.tsx:710`, stepping aside for the pickup
  page's own, `PickupPromise.tsx:454`), ReceiptActions' (`ReceiptActions.tsx:191`) and FeedbackPrompt's
  (`FeedbackPrompt.tsx:118`) — OPEN-ITEMS F36 (`docs/OPEN-ITEMS.md:513`).
- `successRewardsDoor` withholds the goodbye's link while the save card shows
  (`apps/qr/lib/save-stars.ts:93`); `SAVE_STARS_DECLINE_CAP = 2` (`:102`); the card's words are
  `saveStarsCopy` (`:159-176`), its MY heading `SAVE_STARS_HEADING_MY` (`:139`), its offline reason
  `saveStarsBlockedReason` (`:186-188`), its CTA links `/account?tab=you` (`SaveStarsPrompt.tsx:135`).
- The farewell pair is shipped: ကျေးဇူးတင်ပါတယ် / "Kyay-zu tin ba de — see you next time"
  (`GoodbyeBeat.tsx:71-74`); its MY runs at `--fs-h3` today (`apps/qr/app/globals.css:6894-6898`); the
  card's tint is `color-mix(in oklab, var(--ac) 5%, var(--cd))` with an 18% accent border (`:6873-6881`).
- The feedback predicate is earner-only in TS (`apps/qr/lib/feedback.ts:39-41`) AND in SQL —
  `mms_submit_feedback` returns `not_found` when `earned_by` is null and `not_yours` otherwise
  (`supabase/migrations/20260623090000_m4_feedback.sql:46-48`); no later migration touches it
  (`grep -l mms_submit_feedback supabase/migrations/*.sql` → that one file). The manager page is
  `requireStaff("manager")` (`feedback.ts:129`). The low-rating path is a PostHog capture, not a staff
  notification (`feedback.ts:85-90`). K13 is read-only on purpose (`docs/OPEN-ITEMS.md:527`).
- The receipt's seat arm: a COUNTER tender (`cash` / `terminal`, `apps/qr/lib/counter-tender.ts:6`)
  plus a `session_members` row for the order's session with `created_at <= qr_orders.created_at`
  (`apps/qr/lib/receipt.ts:100-117`); the seat buys the link only — no email (`receipt.ts:49-51`,
  `ReceiptActions.tsx:89-91, 153-154`). M206's boundary is decided as exactly this predicate
  (`docs/DECISIONS_2026-10-18.md:224-226`).
- The counter path into /track: the Bill's `CounterSettledCard` links only "← Browse the menu"
  (`apps/qr/components/PayAtCounter.tsx:296-301`, mounted by `Checkout.tsx:4074-4078`); the Menu's
  TableEndedCard links `endTrackHref` = `/track?cart=…&paid=1` with no `resume=1`
  (`apps/qr/lib/session-truth.ts:410-413`); `track/page.tsx:153` sets `justPaid={resume !== "1"}`, so
  every counter arrival today replays the celebration and the print-on (`OrderTracker.tsx:1349, 1623`).
- The ONE Undo form, shipped on the guest's phone: the SAME `Button` node relabels inside its own slot,
  `--sf` with a 1.5px dashed `--ac` edge (`globals.css:7323-7327` `.arrival-undo`, `:3811-3817`
  `.checkout-undo`), the count an aria-hidden leaf reading ` — 6s` (`PickupPromise.tsx:588-598`), the
  label stacked EN over ပြန်ဖျက် (`PickupPromise.tsx:548-556`, `TRACK.undo`, `track.ts:90`); its
  duration `ARRIVAL_UNDO_MS = PICKED_UNDO_MS` (`apps/qr/lib/pickup-promise.ts:55`,
  `apps/qr/lib/expo-rules.ts:152` = 6 000 ms); the keyboard hold `lib/undo-hold.ts` (cap 60 s, warn at
  5 s, `:34-39`); the form's rule in words: `docs/PATH_DESIGN_2026-10-07.md:104-113`;
  "One Undo form, with its duration named once": `docs/DECISIONS_2026-10-18.md:164-168`.
- The settled dine-in arm (`OrderTracker.tsx:921-966`): eyebrow "Paid", `receiptStatusLabel`
  ("Paid in full · Cash", `apps/qr/lib/refund-view.ts:83-87`), "Table {n} is settled — your server will
  take it from here." (`:945`), the kitchen rows (`OrderKitchenList`, the words
  "Served · ထုတ်ပြီး" from `DINER_STAGE_WORD`, `apps/qr/lib/line-state-copy.ts:45`,
  `staff.ts:3152`), "Order reference #XXXXXX" (`:960-965`). Its spoken line is `settledSpoken`
  (`apps/qr/lib/track-settled.ts:31-33`); its foot `settledFoot` (`:66-69`).
- `exitAsks()` does not exist yet — a new pure function in `apps/qr/lib/` (a `MONEY_PATHS` directory,
  `scripts/check-money-coverage.mjs:39`), so it ships with mutants beside the existing
  `lct/receipt-counter-*` four (`scripts/verify-slice.mjs:36098-36122`) and the one `feedback/*` mutant
  (`:6481`).
- The composite-contrast guard pins two tinted grounds today, neither of them the goodbye's
  (`packages/ui/src/__tests__/composite-contrast.test.ts:379-425`, GROUNDS = `.taste-why`,
  `.arrival-exit-link:hover`). Graft 6 adds `.goodbye-beat` to it (DECISIONS 6).

Shared geometry for all three screens: phone 390×844, light; y 0–47 ground (safe area, nothing drawn);
y 47–103 AppHeader as built (logo + "Morning Star"); the content column x 20–370 (350 wide, the picked
artboards' column); the diner tabs y 750–844 (60 + 34 inset), "Order" current. Cards: radius 20, --cd
#fffdf8, 1px --bd rgba(58,35,23,0.1), `--sh-paper`, `.card-textured` dots (`globals.css` `.card-textured::before`:
18px grid, 130%/110% top mask). Page ground: --pg #faf9f5 with PaperAmbient lines. The frame is a
scrolled viewport: the top half of /track (PD3's pickup page on screen 1; the header block + settled card
on screen 3) sits above it unchanged.

---

## SCREEN picked-m14-1.dc.html — Before you go · 1 of 2 (the card-paid to-go exit)

**Device:** phone 390×844. **Theme:** light. **Moment:** a card-paid to-go order, bag just handed over
(`togo === "picked_up"`, the expo's tap); this phone is the earner, a guest (not signed in), under the
decline cap, the receipt's email door on; the page scrolled so the slip's tail sits under the header.
The top half (PD3's "Picked up — enjoy!" / "Thanks for coming by.", `track.ts:60, 77`, the spent
PaySuccess, the One Pass) is above the frame and untouched.

### LAYOUT (top to bottom)

- **y 103–151 · the slip's last rows** (the shipped `.receipt-slip-body`, `card-textured`, x 20–370,
  side hairlines only — its top is above the frame): "Tax" · "$2.75" 13px --t2 (row 103–123);
  "Total" · "$31.50" 15px 700 --tx, `class="tn"` (row 127–151); padding 0 16px 6px.
- **y 151–163 · the tear** `.receipt-tear` (11px shipped; drawn 12): --cd with the 12px-pitch notches
  biting from the bottom; aria-hidden.
- **y 163–169 · 6px of ground** so the perforation reads as a tear (the stub below is a second piece
  of paper, not the slip's continuation — DECISIONS 8).
- **y 169–273 · THE RECEIPT STUB (104px)** — the receipt's two doors, no longer a loose block: x 20–370,
  background --cd, no top border, radius 0 0 20 20, `--sh-paper`, padding 4px 16px, two stacked rows
  (the shipped `ReceiptActions` wrap is a `grid` with `justifyItems: start`, `ReceiptActions.tsx:215`):
  - row 1 (48px): `<a class="nav-link">` "View & print your full receipt →" 14px 700 --ac #a65f10
    (`.nav-link`, `globals.css:4510-4521`, min-height 44), with the K15 DRAFT line beneath inside the
    same link, `<span lang="my">` Padauk 13px --t2 (two lines inside one 48px target — DECISIONS 11).
  - row 2 (48px): `<button class="nav-link">` "Email me this receipt" (`ReceiptActions.tsx:207`), same
    recipe, its DRAFT MY beneath. Renders only when `link.emailEnabled && link.canEmail` (`:153-154`).
  - The email form, when open, unfolds INSIDE the stub below row 2 exactly as shipped (label "Email your
    receipt to", 44px input at 16px, "Send receipt" / "Cancel", `:156-188`); its own `role="status"`
    (`:191`) is deleted — the error sentences (`:131-137, 140`) go to the view's one region (A11Y).
- **y 285–434 · THE FAREWELL (hero, 350×149)**: `.card card-textured` + the shipped `.goodbye-beat` tint
  (border 1px color-mix(--ac 18%, --bd) → drawn rgba(166,95,16,0.26); background
  linear-gradient(180deg, color-mix(--ac 5%, --cd), --cd) → drawn `linear-gradient(180deg, #fbf5ec, #fffdf8)`;
  inset 0 1px 0 --sheen; radius 20), padding 18px 18px 14px, text centered, `aria-label="Thank you"`.
  - y+18: `<span lang="my">ကျေးဇူးတင်ပါတယ်</span>` Padauk 700, **26px (`--fs-h1`)**, line-height 1.6
    (42px box), --tx #1b1714 — graft 6. No glyph above it (DECISIONS 5).
  - y+64: "Kyay-zu tin ba de — see you next time" Hanken 800, 15px (`--fs-lead`), lh 1.45, --tx.
  - y+94: the what-next line, 13px --t2 #6e6358 lh 1.5: "This receipt lives in your order history."
    then, as its own block, `<span lang="my">ဒီဘောက်ချာက သင့်အော်ဒါမှတ်တမ်းထဲမှာ ရှိနေပါမယ်</span>` Padauk 13px
    --t2 (the shipped pair, `track.ts:138-141`). The tracker's foot (`OrderTracker.tsx:1669`) no longer
    repeats it on this arm (one owner per sentence).
  - No Star line: while the save ask is live in the slot the door is `none` (`save-stars.ts:93`), so the
    "with your rewards" line and link are absent — unchanged rule. No ring on this half (the +1 Star and
    the ring belong to the top half's PaySuccess; `GoodbyeBeat.tsx:44-48` guards stay for the `link` arm).
- **y 446–466 · THE ARC'S EYEBROW (20px row)**: left `.eyebrow` "BEFORE YOU GO · 1 OF 2" — 11px
  (`--fs-xs`) 700, `--track-eyebrow` 0.13em, uppercase, --ac (the count is `exitAsks().length`, never a
  literal 2). Right, `aria-hidden`: two dots, gap 6 — the active one 8px solid --ac, the other a 6px ring
  1.5px --t3 #726859 (size AND fill differ). With exactly one ask the eyebrow reads "BEFORE YOU GO" and
  the dots are omitted (screen 3).
- **y 472–757 · THE SLOT, ask 1 = KEEP YOUR STAR (350×285)**: the shipped `.save-stars surface-vellum`
  card (vellum `--surface-vellum` rgba(250,247,239,.97) under the clay→sage wash, `globals.css:528-540`;
  drawn as rgba(250,247,239,0.97) with a faint `linear-gradient(140deg, rgba(166,95,16,0.08), rgba(31,110,99,0.07))`;
  1px --bd; radius 20; inset sheen), padding 16px 16px 14px, `<section aria-labelledby="ask-h">`.
  The 40px ✦ medallion column (`.save-stars-medallion`, `--grad`) stays as shipped at the card's left
  (`SaveStarsPrompt.tsx:107-109`) — the Stars' own glyph belongs to the Stars' ask.
  - h2#ask-h "Keep your Star" Fraunces 600 17px (`--fs-h3`) lh 1.22 --tx; beneath it
    `<span lang="my">ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်</span>` Padauk 13px --t2 (2 lines, 42px).
  - body 13px --t2 lh 1.5 (≈4 lines, 80px): "Guest Stars live only on this phone. Save them to an account
    with an email code or Google, and the orders that earned them come along too." + " Emailing a
    receipt doesn’t save them." (the note only because the email door rendered, `save-stars.ts:172`).
  - margin 12 → `.ui-btn-secondary` block 48px "Save to an account →" (paper: --cd, 1px --bd, --tx 15px
    800, inset sheen; the `→` aria-hidden `.ui-btn-arrow-fwd`) → margin 2 → `.ui-btn-quiet` 44px
    "Not now" centered, --t2 14px 700. Exactly ZERO filled pills on this half of the page.
- **y 757–750**: nothing below the slot on this arm (the foot's sentence moved into the farewell); the
  diner tabs at 750 overlap the slot's bottom padding only.

### COPY (English) — verbatim, with source

- "Tax" · "Total" · "$2.75" · "$31.50" — example figures (the slip renders the fulfillment-time snapshot
  verbatim, `OrderTracker.tsx:1434-1439`).
- "View & print your full receipt →" (`ReceiptActions.tsx:148-151`)
- "Email me this receipt" (`ReceiptActions.tsx:207`); after a send "Send again" (`:207`), the note
  "Receipt on its way to {email}" / "✓ Receipt sent to {email}" (`:198-203`); the form's "Email your
  receipt to" · "Send receipt" · "Cancel" · "Sending…" (`:158, 175, 186`).
- "Kyay-zu tin ba de — see you next time" (`GoodbyeBeat.tsx:74`)
- "This receipt lives in your order history." (`apps/qr/lib/i18n/track.ts:139`)
- "BEFORE YOU GO · 1 OF 2" — NEW, the house's own words (J29; v7.2 draws no exit arc). EN-only by the
  diner eyebrow policy (`PayAtCounter.tsx:282` "Paid at the counter" ships EN-only).
- "Keep your Star" · "Guest Stars live only on this phone. Save them to an account with an email code
  or Google, and the orders that earned them come along too." · "Emailing a receipt doesn’t save them."
  · "Save to an account" · "Not now" (`apps/qr/lib/save-stars.ts:165-174`). With n>1: "Keep your
  {n} Stars" (`:167`); after a reward: "Guest Stars — and the reward you just unlocked — …" (`:170`).
- Offline (the CTA withheld, rendered `aria-disabled` with its reason): "You look offline — saving
  needs a connection." (`save-stars.ts:187`).

### COPY (Burmese) — shipped strings or the briefs' drafts only

- ကျေးဇူးတင်ပါတယ် — SHIPPED (`GoodbyeBeat.tsx:72`).
- ဒီဘောက်ချာက သင့်အော်ဒါမှတ်တမ်းထဲမှာ ရှိနေပါမယ် — SHIPPED K15 draft (`track.ts:140`), reused verbatim.
- ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော် — SHIPPED K15 draft (`save-stars.ts:139`).
- "View & print your full receipt" → ဘောက်ချာ အပြည့်အစုံ ကြည့်/ပုံနှိပ်မယ် — K15 DRAFT (brief-m14.md:155, guided;
  ဘောက်ချာ = the glossary noun `common.ts:11`, ပုံနှိပ် = `pilot.gloss.print` `staff.ts:2356`). Flag the
  "/" for the sitting (DECISIONS 11).
- "Email me this receipt" → ဒီဘောက်ချာကို အီးမေးလ် ပို့ပေးပါ — K15 DRAFT (brief-m14.md:156, guided).
- "Not now" → နောက်မှ — K15 DRAFT (brief-m14.md:157, guided). Drawn beneath "Not now" only if the
  drawer keeps the 44px row; else EN alone (the shipped `dismiss` is EN-only, `save-stars.ts:174`).
- The eyebrow, "Tax", "Total", the email form and its notes: EN-only (no shipped Burmese; none invented).

### STATES

- **ARRIVAL at picked_up (realtime):** the farewell and the eyebrow+slot rise together on ONE `.mms-rise`
  (240 ms, `--ease-out`, the goodbye's shipped 420 ms delay kept); nothing else moves. **RESUME
  (`resume=1`) or a revisit after the bag:** the same frame at rest — the farewell now renders on the J4
  clock without `justPaid` (`OrderTracker.tsx:1659` loses `justPaid &&`), static when
  `!justPaid || hasCelebrated(...)` (`apps/qr/lib/celebration-latch.ts:21`).
- **BEFORE PICKED_UP:** slip + stub only; no farewell, no eyebrow, no slot — nothing is said before the
  bag (the J4 clock does not move: brief-m14.md:12).
- **DOOR PENDING** (`successRewardsDoor` → `pending`, `save-stars.ts:92`): the farewell renders; the
  eyebrow and slot wait (a door appears, never vanishes — DL §26). **DOOR LINK** (declined / capped /
  signed in): the farewell gains the shipped line "Your Star and this receipt are with your rewards." /
  "…saved to your account." (`GoodbyeBeat.tsx:85-86`) and the 44px `.nav-link` "See them in your
  rewards →" / "View your rewards →" (`:93-98`, href `/account?tab=rewards`); the slot then opens on
  ask 2 (if any) and the eyebrow reads "BEFORE YOU GO".
- **SPLIT SHARE-PAYER:** farewell + "View your rewards →" only; no Keep ask; no feedback ask (not the
  earner — `feedback.ts:39-41`); eyebrow and slot absent.
- **DECLINE CAP** (2 declined orders on this device, `save-stars.ts:102`): the Keep ask never enters
  `exitAsks()`; the header ✦ stays the door.
- **OFFLINE** (`useConnectionTruth`): the CTA stays rendered as `role="link" aria-disabled="true"
tabIndex=0 aria-describedby=<reason>` (`SaveStarsPrompt.tsx:122-133`); the email button is withheld
  the same way; the receipt link is a plain href and stays.
- **REFUNDED in full:** no farewell, no eyebrow, no slot — the refund arm speaks (`refundArmCopy`,
  `track-settled.ts:41-54`); the slip reads "Refunded — this charge was returned to you"
  (`refund-view.ts:84`). **Partly refunded:** everything renders; the slip's head reads "Partly refunded ·
  Card" (`:85`).
- **NIGHT:** the same geometry on the M126 ladder — --cd #2b213c, vellum rgba(33,26,48,.95), --ac
  #e7a53a, --tx #f3ecdf, --t2 #bcafc8; no glass on any of these cards.
- **REDUCED MOTION:** the one rise is instant; nothing auto-moves on this half of the page.

### INTERACTIONS

- "Not now" → `decline(orderId)` (the shipped `useSaveStarsAsk`, `OrderTracker.tsx:600`) → the slot's
  content is replaced in place by ask 2 (`.mms-rise` 240 ms; RM instant), the eyebrow becomes "BEFORE
  YOU GO · 2 OF 2", the second dot lights; the farewell gains its "with your rewards" line + link
  (door → `link`) with no motion. If the slot held focus, focus moves to the new ask's h2
  (`tabIndex=-1`, `preventScroll`) — the SaveStarsPrompt neighbour rule.
- "Save to an account →" → `/account?tab=you` (the one save flow, DL §26). Back from there must not
  replay anything: the celebration latch covers the top half; the arc has no one-shot.
- "View & print your full receipt →" → the durable `?r=` page in the same tab (as today). "Email me this
  receipt" → the form unfolds inside the stub, focus into the input (`preventScroll`), Cancel folds it
  and returns focus to the trigger (`ReceiptActions.tsx:101-110`).
- Nothing on this screen auto-scrolls, auto-focuses on mount, or animates after the first read. No
  haptic, no sound (the pass's one `celebrate` already fired at the top, DL §12).

### A11Y

- ONE live region per view: on the pickup page it is PickupPromise's `role="status"`
  (`PickupPromise.tsx:454`); the stub's email errors reach it through an `announce(sentence)` callback
  the page owns (the `droppedSpokenNotice` second-child pattern, `OrderTracker.tsx:755-760`).
  ReceiptActions' own region (`:191`) is deleted. F36's /track half closes.
- Names: the stub is `<nav aria-label="Receipt">`; the farewell `<section aria-label="Thank you">`
  (GoodbyeBeat's name kept); the slot `<section aria-labelledby="ask-h">`; the dots and the medallion
  `aria-hidden`; the `→` arrows `aria-hidden`.
- Targets: both stub rows 48px; "Save to an account →" 48px; "Not now" 44px; the tabs 44px.
- Never colour alone: the active dot differs by size; the disabled CTA is `aria-disabled` + its reason as
  `aria-describedby`, never a native `disabled` that leaves the Tab order.
- Burmese: every MY run in its own `<span lang="my">` at ≥13px Padauk, lh 1.6, separated from the English
  by block flow or a margin (never a whitespace flex child, DL §6). English leads every line.

---

## SCREEN picked-m14-2.dc.html — Before you go · 2 of 2 (the feedback ask, armed → sent)

**Device:** phone 390×844. **Theme:** light. **Moment:** the same page as screen 1, after "Not now" on
the Stars ask (or for a viewer with no Stars ask). The guest has tapped **3 stars**, typed a short note,
and pressed Send: the SAME node now reads "Undo — 6s" with ပြန်ဖျက် beneath; the stars and note stay
visible and inert. **Interactive (RULES2 §B):** after the 6-second window the slot swaps to the
done-low card (the product's own behaviour); tapping Undo restores the form.

### LAYOUT — frame A, ARMED (the default frame; `hint-placeholder-val` true)

- **y 103–115** page ground (the stub's bottom edge is just above the frame).
- **y 115–264 · THE FAREWELL** exactly as screen 1 (26px Padauk / 15px English / the shipped
  what-next pair). Now that the Stars ask was passed, the farewell ALSO carries, after the what-next
  line: "Your Star and this receipt are with your rewards." 13px --t2 (`GoodbyeBeat.tsx:86`) and the
  44px `.nav-link` "See them in your rewards →" (`:94`) — so the card is 350×207 here (y 115–322) and
  everything below shifts by 58px: eyebrow y 334–354, slot y 360–628, done card y 334–531. (Pixel
  values below are given for the card WITHOUT the rewards line, as on screen 1; add 58 when drawn with
  it — draw it WITH it: this viewer passed the ask, so `door === "link"`.)
- **y 276–296 · EYEBROW** "BEFORE YOU GO · 2 OF 2", the second dot 8px solid --ac, the first a 6px ring.
- **y 302–570 · THE SLOT, ask 2 = FEEDBACK, ARMED (350×268)**: `.card card-textured` paper (--cd, 1px
  --bd, radius 20, inset sheen, `--sh-paper`), padding 16px 16px 14px,
  `<section aria-labelledby="ask-h">`.
  - y+16 (row 24px): h2#ask-h **"How was everything?"** Fraunces 600 17px lh 1.22 --tx, then inline
    `<span lang="my" style="margin-inline-start: 8px">ဘယ်လိုလဲ?</span>` Padauk 700 15px --tx — graft 4,
    both verbatim `docs/prototype/v7.2.html:544`.
  - y+50 (44px): the rating row `role="group" aria-label="Rating, 1 to 5 stars"`
    (`FeedbackPrompt.tsx:89`): five `<button type="button" aria-pressed>` 44×44, gap 8, centered (252px);
    `Icon name="star"` 28px; stars 1–3 lit (fill --ac #a65f10, stroke --ac, `aria-pressed="true"`), 4–5
    idle (fill none, stroke --t3 #726859, `aria-pressed="false"`); names "1 star" … "5 stars"
    (`:95`). Inert during the hold: `pointer-events: none`, opacity 1 (the guest sees exactly what is
    about to be sent).
  - y+104 (84px): `<textarea id="fb-comment" rows="3" maxlength="1000">` holding the typed note
    "Mohinga was a touch salty today." — 16px (`--fs-field`, the iOS zoom floor), lh 1.4, padding 10px
    12px, --sf #f2efe7, 1px --bd, radius 12, --tx; its `<label>` sr-only "Anything you’d like to add?
    (optional)" (`:103-105`), the same text as placeholder when empty (`:110`). Unfocused (RULES: the
    moment before/after the keyboard), inert during the hold.
  - y+200 (54px): **THE UNDO FORM in the Send's own slot** — the SAME `Button size="lg" block` node that
    was "Send feedback": background --sf #f2efe7, border 1.5px dashed --ac #a65f10, radius 999, inset 0
    1px 0 --sheen, never filled (`.arrival-undo`, `globals.css:7323-7327`; PATH_DESIGN:104-108). Label a
    `.pickup-btn-stack` column (`PickupPromise.tsx:548-556`): line 1 "Undo" 15px 800 --tx with the
    aria-hidden leaf `<span aria-hidden class="tn"> — 6s</span>` 15px 600 --t2 (the `ArrivalUndoCount`
    shape, `:588-598`); line 2 `<span lang="my">ပြန်ဖျက်</span>` Padauk 700 13px --tx. The accessible name
    is "Undo ပြန်ဖျက်" and never changes while the count runs. The name flips Send → Undo only after the
    350 ms same-gesture guard (PATH_DESIGN:106) so the finger that pressed Send cannot land on Undo.
  - "Not now" is removed for the hold (DECISIONS 10); the card closes with its 14px bottom pad.
- **y 570–750**: page ground. Nothing below on this arm.

### LAYOUT — frame B, SENT LOW (after the window; also the ALREADY-REVIEWED shape)

- The eyebrow and the slot card leave in ONE cut (DECISIONS 12); in their place at **y 276–473 ·
  THE DONE CARD (350×197)**: `.card card-textured` paper, padding 18px: h2#fb-h `tabIndex=-1` (focused
  on mount only after THIS device's submit — `DoneHeading`, `FeedbackPrompt.tsx:127-138`) **"Thank you
  for telling us"** Fraunces 600 17px --tx + beneath `<span lang="my">` DRAFT 13px --t2; then
  "Sorry it wasn’t perfect." 13px --t2 lh 1.5 (margin 4); then — graft 2 — the shipped `askOurStaff`
  pair "Not what you expected? Ask our staff." 13px --t2 + `<span lang="my">ထင်ထားတာနဲ့ မတူဘူးလား? ဝန်ထမ်းကို
မေးကြည့်ပါနော်</span>` Padauk 13px --t2 (the `TableEnded.tsx:114-120` `quiet` + `bodyMy` shape); then
  the 44px `.nav-link` "Share your visit on Google →" (`:73-75`, when `googleReviewUrl` is set, offered
  after ANY rating). The farewell above is now the last warm thing.
- Rating 4–5 instead: h2 "Thanks for your feedback!" + DRAFT MY; sub "We’re so glad you joined us at
  Mandalay Morning Star." (`:65, :70`); no staff line; the Google link.

### COPY (English)

- "How was everything?" (`docs/prototype/v7.2.html:544` — replaces the shipped "How was your visit?",
  `FeedbackPrompt.tsx:84`)
- "1 star" … "5 stars" (`FeedbackPrompt.tsx:95`); "Rating, 1 to 5 stars" (`:89`)
- "Anything you’d like to add? (optional)" (`FeedbackPrompt.tsx:104, 110`)
- "Send feedback" · "Sending…" (`FeedbackPrompt.tsx:116`)
- "Undo" (`COMMON.undo`, `common.ts:26`; `TRACK.undo`, `track.ts:90`) — the " — 6s" leaf is aria-hidden
- "Not now" (`save-stars.ts:174`, the one pass word)
- "Thanks for your feedback!" · "We’re so glad you joined us at Mandalay Morning Star." (`:65, :70`)
- "Thank you for telling us" · "Sorry it wasn’t perfect." — NEW (D1): replaces "Thank you — we’ll make it
  right" (`:65`) and "…A manager will see this and follow up." (`:69`), which promise what K13 cannot
  record. No "manager's list" either (DECISIONS 9).
- "Not what you expected? Ask our staff." (`apps/qr/lib/i18n/cart.ts:253`)
- "Share your visit on Google →" (`FeedbackPrompt.tsx:74`)
- "Couldn’t save your feedback — please try again." (`FeedbackPrompt.tsx:47`) — inline under the Send
  node in --warn 13px AND written to the one live region.
- "Your table already sent one — thank you." — NEW (brief-m14.md:84, quiet), said only when `reviewed`
  is true on mount for a SEAT viewer or `submitFeedback` answers `exists` for a seat.
- "You’re offline — this sends when you’re back." — NEW (brief-m14.md:204, guided): the Send node's
  `aria-describedby` reason while offline; the hold does not start offline.
- Live-region sentences (sr-only, NEW, EN-only): on arm "{n} stars — sends in 6 seconds. Undo available."
  (brief-m14.md:67, quiet); on Undo "Not sent." (same); five seconds before a held window is let go
  "It sends in a few seconds." (the `capSoon` shape, `track.ts:113-116`).

### COPY (Burmese)

- ဘယ်လိုလဲ? — v7.2:544 VERBATIM (the prototype draws this sheet; retires the guided K15 draft
  ဒီနေ့ လာစားတာ ဘယ်လိုလဲ?).
- ပြန်ဖျက် — SHIPPED (`common.ts:26`, `track.ts:90`, `staff.ts:306` `kds.undo`); D3: the mark you just
  made is erased — the send has not gone yet (PATH_DESIGN:111-112).
- ထင်ထားတာနဲ့ မတူဘူးလား? ဝန်ထမ်းကို မေးကြည့်ပါနော် — SHIPPED K15 draft (`cart.ts:254`), reused verbatim.
- ကျေးဇူးတင်ပါတယ် / ဒီဘောက်ချာက သင့်အော်ဒါမှတ်တမ်းထဲမှာ ရှိနေပါမယ် — as screen 1.
- "Thank you for telling us" → ပြောပြတဲ့အတွက် ကျေးဇူးတင်ပါတယ် — K15 DRAFT (brief-m14.md:58/199; shaped on the
  shipped `pickedUpSub` လာတဲ့အတွက် ကျေးဇူးတင်ပါတယ်, `track.ts:78`).
- "Sorry it wasn’t perfect." → အဆင်မပြေခဲ့တာ တောင်းပန်ပါတယ် — K15 DRAFT (brief-m14.md:200, guided).
- "Thanks for your feedback!" → အကြံပြုတဲ့အတွက် ကျေးဇူးတင်ပါတယ် — K15 DRAFT (brief-m14.md:198, guided).
- "Send feedback" → အကြံပြုချက် ပို့မယ် — K15 DRAFT (brief-m14.md:195/243; the noun from v7.2:544, the
  diner verb ending of `common.ts:30`), drawn beneath "Send feedback" in the same two-line stack as Undo.
- "Not now" → နောက်မှ — K15 DRAFT (brief-m14.md:197).
- "Your table already sent one — thank you." → သင့်စားပွဲက ပြောပြပြီးသားပါ — ကျေးဇူးတင်ပါတယ် — K15 DRAFT
  (brief-m14.md:91, quiet).
- "Share your visit on Google →", the live-region sentences, the error line, the offline reason, the
  placeholder: EN-only, listed (no shipped Burmese; none invented).

### STATES (the slot's whole life)

- **IDLE** (as mounted; drawn on screen 3): h2 + stars + "Not now" only. No note field, no Send: the
  one question first (DECISIONS 13). Slot 350×154.
- **RATED** (a star tapped): the star fills with the kit's 260 ms pop (RM: none; no haptic — a rating is
  not a commit, DL §12); the note field and the Send pill rise beneath on `.mms-rise` (RM: instant) —
  growth below the finger, the tapped star never moves; "Not now" stays. Send = `.ui-btn-primary` block
  54px (the `lg` size, `primitives.css:66-70`), clay ramp, --oa ink, 15px 800, label stacked "Send
  feedback" / DRAFT MY — the ONE filled pill on the page in this state. Slot 350×314.
- **ARMED** (frame A): Send → the Undo form in the same node after the 350 ms guard; a 6-second window
  (`FEEDBACK_UNDO_MS = PICKED_UNDO_MS`, named once in `lib/expo-rules.ts` consumers, the window rule
  `pickedUndoOpen` reused verbatim); the leaf counts 6 → 1 once a second; stars + note inert; "Not now"
  gone. KEYBOARD on Undo (`:focus-visible`) holds the window (`lib/undo-hold.ts`, cap 60 s, the 5 s
  warning sentence above). TAB HIDDEN mid-window: the timer keeps running while the page lives; a page
  unloaded inside the window loses the write and nothing ever claimed "sent" (the shipped precedent,
  `expo-rules.ts:148-149` — DECISIONS 15).
- **SENDING** (window closed): the node shows the kit's 1em spinner with "Sending…" (`:116`), still
  --sf, dashed edge dropped (the committing posture, `PickupPromise.tsx:534-535`).
- **SENT** (frame B) / **SENT LOW** (frame B as drawn): the done card, focus on its h2.
- **UNDO**: the form returns (rating + note intact), the node reads "Send feedback" again, "Not now"
  returns, focus stays on the node (it never left), the region says "Not sent." No toast — the act
  reversed was local.
- **FAILED** (`error` / rate-limited): the node returns to "Send feedback" enabled; the inline line
  "Couldn’t save your feedback — please try again." in --warn beneath it; the same sentence through the
  one region; stars + note live again. **`exists`** → the done card (earner: "Thanks for your feedback!";
  seat: "Your table already sent one — thank you."), never a claim about a tap this phone did not make.
- **ALREADY REVIEWED on a revisit** (`reviewed` true, no local submit): the done card renders without
  focus and without the eyebrow.
- **"NOT NOW"** (idle or rated): the slot and the eyebrow are removed in one cut; declining is met with
  silence (DL §9); the ask does not return on a resume of this order — a per-device memory keyed
  `mms.exitFeedback.passed.v1` (the `useSaveStarsAsk` shape), per order id, no cap needed (one order,
  one ask). The farewell is the last card.
- **OFFLINE**: Send stays rendered `aria-disabled` with its reason paragraph as `aria-describedby`; the
  hold never starts offline; stars and the note still work.
- **NIGHT / REDUCED MOTION**: as screen 1; the star pop, the slot rise and the eyebrow swap collapse to
  cuts; the window's length is unchanged under RM.

### INTERACTIONS (and the artboard's state machine)

- Artboard `state.phase ∈ {armed, idle, sent}`, `state.secs` 6…0. Constructor: `phase: "armed",
secs: 6`, a 1 000 ms interval decrementing `secs`; at 0 → `phase: "sent"` and the interval cleared.
  `renderVals()` returns `isArmed`, `isIdle`, `isSent`, `undoLeaf` (" — {secs}s"), `undo()` (clears the
  interval → `phase: "idle"`), `send()` (→ `phase: "armed"`, `secs: 6`, a new interval). Three `<sc-if>`
  blocks (armed slot · idle-with-rating slot · done card); `hint-placeholder-val` true on the armed one.
  Every `{{ }}` hole is a dotted lookup; no expressions in markup. RM media rule as RULES2 §B.
- In the product: star tap → `aria-pressed` flips (plain toggles, not role=radio — `FeedbackPrompt.tsx:86-88`);
  Send → the hold; window close → `submitFeedback(orderId, rating, comment)` ONCE (`feedback.ts:56-93`,
  the rating bounded 1–5 and the note ≤1000 by `submitFeedbackInput`, `packages/db` schemas:560-564);
  ok → the done card and focus; Undo → restore; "Not now" → silence.

### A11Y

- ONE live region (PickupPromise's on the pickup page, the tracker's `OrderTracker.tsx:710` elsewhere);
  FeedbackPrompt's own `role="status"` (`:118`) is deleted. The region speaks the arm, the Undo and the
  failure; the success is the focus move to the done h2 (WCAG 2.4.3, the shipped `DoneHeading` rule) —
  no second region, no duplicate announcement.
- The Send→Undo→Send is ONE node, so focus never jumps inside the window; the count is an aria-hidden
  leaf so the name "Undo ပြန်ဖျက်" is stable; `:focus-visible` on it holds the window (capped).
- Stars: 44×44 toggles, names "1 star"…"5 stars", lit = fill + `aria-pressed="true"` (never colour
  alone). The textarea has its sr-only `<label>`; 16px so iOS never zooms.
- Disabled is `aria-disabled` + `aria-describedby`, never native `disabled` (the §17 rule); the inert
  stars during the hold keep their names and state (`pointer-events: none` only).
- Burmese: `lang="my"` spans at ≥13px Padauk; the inline ဘယ်လိုလဲ? separated by `margin-inline-start`.

---

## SCREEN picked-m14-3.dc.html — The cash-settled table, walked to the door (arriving from the Bill)

**Device:** phone 390×844. **Theme:** light. **Moment:** Table 7 ate, Dad settled the table in cash at
the register; a guest at the table tapped **"See your receipt →"** on the Bill's close card and arrived
at `/track?cart=…&paid=1&resume=1` — a RESUME, never an arrival: no PaySuccess, no confetti, no chime,
no haptic, no thermal print-on, no `.mms-rise`; every card at rest. This phone is a seat (never the
earner), admitted by the receipt's seat arm; nobody at the table has rated yet. The frame is scrolled to
the slip; the header block ("Table 7" eyebrow + h1 "Your order", `OrderTracker.tsx:697-699`) and the
settled card sit above it, unchanged (`:921-966`: "Paid" · "Paid in full · Cash" · "Table 7 is settled —
your server will take it from here." · the dishes "Mohinga — Served · ထုတ်ပြီး", "Laphet thoke — Served ·
ထုတ်ပြီး" · "Order reference #A1B2C3").

### THE WAY IN — the Bill's close card (`CounterSettledCard`, PayAtCounter.tsx:268-305), graft 5

Not an artboard of its own; the door screen 3 is reached by. The card keeps its shipped grammar
(`.card card-textured mms-pop`, padding 18px 18px 16px, grid gap 8): eyebrow "Paid at the counter"
with the check icon, --ok (`:283-285`); h3 "All paid — thank you!" Fraunces 21px 800 + `<span lang="my">`
ရှင်းပြီးပါပြီ — ကျေးဇူးတင်ပါတယ် 13px 600 --t2 (`cart.ts:189`); body "This bill was paid at the counter.
There’s nothing left to pay here." 16px --t2 + its shipped MY (`cart.ts:190-193`; lift `bodyMy` from
`--fs-xs` 11px to `--fs-sm` 13px — the Burmese floor, OPEN RISK 6). Then, NEW, for `by === "counter"`
only: **the ONE hero verb** — `<Link className={buttonClass({ variant: "primary", block: true })}>`
48px, label a `.pickup-btn-stack` column: "See your receipt →" 15px 800 --oa over
`<span lang="my">ဘောက်ချာ ကြည့်မယ်</span>` Padauk 13px 700 — href `endTrackHref(end, cartId)` which now
appends `&resume=1` (`session-truth.ts:412` → `/track?cart=…&paid=1&resume=1`; the Menu's TableEndedCard
inherits the fix for free). Beneath it "← Browse the menu" demoted to a quiet `.nav-link` 44px (14px 700
--ac, the `←` aria-hidden `.nav-arrow-back`), text from `menuLinkText(mode, "browse")`
(`apps/qr/lib/menu-href.ts:45-49`) with the shipped MY beside it (`common.ts:30` မီနူး ကြည့်မယ် /
`:32` စျေး ကြည့်မယ်). For `by === "card"` (a tablemate's card paid; this seat cannot see that receipt,
`cart.ts:194-195`): no hero — the quiet nav-link alone, as today. DL §32: one filled pill or none.

### LAYOUT (top to bottom, the /track frame)

- **y 103–251 · THE SETTLED SLIP at rest** (`.receipt-slip` → `.card card-textured receipt-slip-body`,
  padding 12, radius 20 20 0 0, x 20–370): head row (gap 12): the 40px receipt medallion (radius 12,
  `--grad` `linear-gradient(135deg, #f1e7d6, #fbf4e8)`, the receipt icon 20px --ac, aria-hidden); "2 items
  · $31.50" 13px 700 tabular; "Paid in full · Cash · Table 7" 13px --t2 (`receiptStatusLabel` +
  ` · Table {n}`, `OrderTracker.tsx:1391-1393`); right: "ORDER" 11px 700 0.05em uppercase --t3 over
  "#A1B2C3" 13px 800 0.05em --tx (both aria-hidden; sr-only "Order reference A 1 B 2 C 3",
  `:1405-1432`). Then the itemised rows 13px, `class="tn"`, gap 4 (y 167–247): "Mohinga" · "$14.50";
  "Laphet thoke" · "$14.25"; "Tax" · "$2.75" (--t2); hairline; "Total" · "$31.50" 15px 700. Every figure
  is the fulfillment-time snapshot verbatim.
- **y 251–262 · the tear**, **y 262–268 · 6px ground**.
- **y 268–324 · THE RECEIPT STUB (56px)**: ONE row — "View & print your full receipt →" + its DRAFT MY
  beneath (48px target) — the seat arm mints the link and nothing else (`receipt.ts:49-51, 100-117`;
  `canEmail: false` → no email row, `ReceiptActions.tsx:153-154`). BEFORE M206 nothing about Stars
  appears anywhere on this screen; AFTER M206 the stub gains a second row "✦ Add this meal to my Stars →"
  (EN-only BY DECISION, `DECISIONS_2026-10-18.md:1163-1164`) linking to the `?r=` receipt where the one
  claim per order lives — never a Star pill, count or ring here before it lands.
- **y 336–482 · THE FAREWELL (350×146)**: the same hero card as screen 1 — ကျေးဇူးတင်ပါတယ် 26px Padauk 700
  / "Kyay-zu tin ba de — see you next time" 15px 800 — with the counter arm's own what-next line,
  verbatim `settledFoot("Your table’s all settled", "cash", true)`: **"Your table’s all settled — keep
  your receipt with the link above."** 13px --t2, 2 lines (`track-settled.ts:66-69`; true because the
  stub sits directly above). No MY exists for it (none invented). No Star line, no ring, no rewards link
  (a seat earned nothing; `door` is `none`-equivalent: no Stars claim before M206). The tracker's foot
  (`OrderTracker.tsx:1686`) renders nothing on this arm now (one owner per sentence).
- **y 494–514 · EYEBROW** "BEFORE YOU GO" — one ask, so no count and no dots (`exitAsks().length === 1`).
- **y 520–674 · THE SLOT, ask = FEEDBACK, IDLE (350×154)**: the paper card, padding 16px 16px 14px:
  h2 "How was everything?" + inline ဘယ်လိုလဲ? (y+16, 24px); the five idle stars 44×44, gap 8, centered,
  `aria-pressed="false"`, stroke --t3 (y+50, 44px); "Not now" `.ui-btn-quiet` 44px centered --t2
  (y+96). No note field, no Send yet (they rise after the first star — screen 2's RATED state). ZERO
  filled pills on the page.
- **y 674–750**: ground. The tabs at 750.

### COPY (English)

- "Paid in full · Cash" (`refund-view.ts:86`; a partial refund reads "Partly refunded · Cash", `:85`)
- "2 items · $31.50" · "Table 7" · "ORDER" · "#A1B2C3" · "Mohinga" · "Laphet thoke" · "Tax" · "Total" —
  the shipped slip's shape (`OrderTracker.tsx:1383-1393, 1416-1427`), example figures.
- "View & print your full receipt →" (`ReceiptActions.tsx:148`)
- "✦ Add this meal to my Stars →" — AFTER M206 ONLY (`DECISIONS_2026-10-18.md:1163`).
- "Kyay-zu tin ba de — see you next time" (`GoodbyeBeat.tsx:74`)
- "Your table’s all settled — keep your receipt with the link above." (`track-settled.ts:68`); with no
  link rendered: "Your table’s all settled." (`:68`, the unlinked arm).
- "BEFORE YOU GO" — NEW eyebrow (EN-only, as screen 1).
- "How was everything?" (v7.2:544) · "Not now" · the star names · and, after a tap, screen 2's full set.
- "Your table already sent one — thank you." — NEW (brief-m14.md:84) when a tablemate rated first.
- On the Bill: "All paid — thank you!" · "This bill was paid at the counter. There’s nothing left to pay
  here." (`cart.ts:189-192`) · "Paid at the counter" (`PayAtCounter.tsx:285`) · **"See your receipt →"
  — NEW** (the graft's words) · "Browse the menu" / "Browse the market" (`menu-href.ts:47-48`).

### COPY (Burmese)

- ကျေးဇူးတင်ပါတယ် — SHIPPED (`GoodbyeBeat.tsx:72`).
- ထုတ်ပြီး (Served) on the settled card's rows above the frame — SHIPPED (`staff.ts:3152` via
  `DINER_STAGE_WORD.served`, `line-state-copy.ts:45`).
- ဘယ်လိုလဲ? — v7.2:544 VERBATIM. ပြန်ဖျက် — SHIPPED. ထင်ထားတာနဲ့ မတူဘူးလား? ဝန်ထမ်းကို မေးကြည့်ပါနော် — SHIPPED draft
  (`cart.ts:254`), after a 1–3.
- "View & print your full receipt" → ဘောက်ချာ အပြည့်အစုံ ကြည့်/ပုံနှိပ်မယ် — K15 DRAFT (brief-m14.md:155).
- "See your receipt →" → ဘောက်ချာ ကြည့်မယ် — K15 DRAFT (m14.json grafts (5); ဘောက်ချာ `common.ts:11` + the
  shipped verb phrase of `browseMenu` မီနူး ကြည့်မယ်, `common.ts:30`).
- On the Bill: ရှင်းပြီးပါပြီ — ကျေးဇူးတင်ပါတယ် and the body's MY — SHIPPED (`cart.ts:189-193`);
  မီနူး ကြည့်မယ် / စျေး ကြည့်မယ် — SHIPPED (`common.ts:30, 32`).
- "Your table already sent one — thank you." → သင့်စားပွဲက ပြောပြပြီးသားပါ — ကျေးဇူးတင်ပါတယ် — K15 DRAFT
  (brief-m14.md:91).
- "Your table’s all settled — keep your receipt with the link above.", "Add this meal to my Stars"
  (EN-only by decision), the eyebrow: EN-only, listed.

### STATES

- **RESUME (the only way a counter settle reaches /track from the app):** `justPaid` false → no
  PaySuccess, no `receipt-print`, no printhead, no `.mms-rise`; the one region speaks `settledSpoken` on
  arrival: "Paid in full · Cash. Your table’s bill is paid." (`track-settled.ts:31-33`). Measurable: the
  celebration latch is written only by a card payment (`PaySuccess.tsx:126-132`), never a counter tender.
- **SEAT ADMITTED (drawn):** `callerMayReceiveReceipt` → `seat` buys the stub's link; `getFeedbackState`
  → `canReview` true through the SAME seat predicate (PR B); the slot renders.
- **SEAT NOT ADMITTED** (a phone that joined the sticker AFTER the settle — the next party, m182,
  `receipt.ts:96-99`): no stub, no slot, no eyebrow; the farewell still renders (a farewell claims
  nothing) with the unlinked foot "Your table’s all settled." Nothing on this page lets the next party
  rate the last party's meal.
- **A TABLEMATE RATED FIRST** (`reviewed` true on mount, or `exists` on submit — one row per order,
  `m4_feedback.sql:50-53`): the slot is the done card without focus: "Your table already sent one —
  thank you." + DRAFT MY, then the Google link; never "Thanks for your feedback!" about a tap this phone
  did not make.
- **KITCHEN STILL COOKING** (a dish fired at the settle by `mms_fire_pending_food`): the settled card
  above says so (`OrderTracker.tsx:939-958`); the farewell renders on the dine-in clock as today
  (pure dine-in → immediately, `:1650-1659`) — unchanged, flagged in OPEN RISKS 5.
- **REFUNDED in full:** no farewell, no slot; the refund arm speaks (`refundArmCopy("cash")`: "Your
  money was handed back.", `track-settled.ts:42-47`). **Partly refunded:** everything renders; the slip's
  head reads "Partly refunded · Cash".
- **BEFORE / AFTER M206:** as the stub above. One claim per order; a second seat tapping the claim reads
  the receipt page's own refusal, never this screen's.
- **OFFLINE:** the stub's link is a plain href and stays; a star tap works; the Send stays
  `aria-disabled` with its reason; nothing arms offline.
- **NIGHT / REDUCED MOTION:** as screen 1 (nothing moves on a resume anyway).

### INTERACTIONS

- Arrival by the Bill's hero verb (above) or the Menu's TableEndedCard "Track your order" — both through
  `endTrackHref`, both `&resume=1` now; `celebrationKey` is never latched, PaySuccess never mounts.
- "View & print your full receipt →" → the `?r=` page (seat-minted, `getReceiptLink`'s counter arm,
  `receipt.ts:120-130`).
- Star tap / Send / Undo / Not now: identical to screen 2. The authorization is re-checked server-side on
  submit by the same seat predicate — ONE module (extract `receipt.ts:100-117` into a pure, mutant-guarded
  `lib/` function read by `callerMayReceiveReceipt`, `getFeedbackState` and `submitFeedback`), and the
  SQL half re-asserts it inside `mms_submit_feedback` (PR B). A 4-top: the first seat's window closing
  writes the order's one row; a tablemate whose window closes seconds later gets `exists` → the
  table-already-sent line, their stars clear.
- Focus: a resume lands focus nowhere special (no heading steal); after a submit, focus moves to the
  done h2; after "Not now", the slot leaves and focus (if it was inside) moves to the previous focusable
  — the stub's link (`SaveStarsPrompt.tsx:18-37` `neighbourOf`).

### A11Y

- ONE live region: the tracker's `role="status"` (`OrderTracker.tsx:710`) speaks `settledSpoken` on
  arrival and the arc's sentences after (second child); no card below adds one.
- Names: the settled card `aria-label="Order paid"` (`:927`); the slip's code sr-only; the stub
  `<nav aria-label="Receipt">`; the farewell `aria-label="Thank you"`; the slot `aria-labelledby`.
- Targets: the stub row 48px; stars 44×44; "Not now" 44px; on the Bill the hero 48px and the nav-link
  44px.
- The Bill's card keeps no live region (its arrival is already announced; `Checkout.test.tsx:1066`).

---

## DECISIONS

1. **Guided is the backbone; every graft applied; nothing else from the other two** — OWNER_RULINGS
   §E:149-160 ("diner moments guided"), common.md's default for m14, m14.json grafts (1)–(6) and its
   three exclusions (drag-to-rate, the seal, the implicit decline).
2. **`FEEDBACK_UNDO_MS = PICKED_UNDO_MS` (6 s), the window rule `pickedUndoOpen` reused, the label
   "Undo — 6s"** — graft (1); DECISIONS_2026-10-18:164-168; the shipped leaf format `PickupPromise.tsx:597`.
3. **The feedback heading is "How was everything?" + ဘယ်လိုလဲ?** — graft (4); v7.2:544 draws this sheet,
   so the verbatim rule binds (DESIGN-LANGUAGE §9:249-253); one K15 draft retired.
4. **"See your receipt →" is the Bill close card's ONE hero verb; "Browse the menu" is a quiet
   nav-link; `by === "card"` keeps no hero** — graft (5); DL §32:2465-2470; the seat arm exists only for a
   COUNTER tender (`receipt.ts:100-106`), so a tablemate's card payment cannot offer a receipt this seat
   may not have.
5. **The farewell's Burmese at `--fs-h1` 26px, and the ✦ glyph removed from the farewell** — graft (6);
   the ✦ is the Stars' glyph (`common.ts:13`) and a farewell above a Keep-your-Star ask must not wear the
   currency it is not claiming; the Stars' medallion stays on the Stars' card (`SaveStarsPrompt.tsx:107`).
6. **`.goodbye-beat` joins `composite-contrast.test.ts`'s GROUNDS** (--t2 over --ac 5% over --cd, both
   themes) — graft (6) says "bounded by" the guard, and today it is not in it (`:402-405`); the guard is
   the number, not a hand calculation.
7. **The cash seat's rating is PR B, owner-gated** — D1; the SQL refuses it today
   (`m4_feedback.sql:46-48`), so the design admits the seat only through a migration redefining
   `mms_submit_feedback` with the receipt's seat predicate, applied one file via MCP on the owner's go
   (OWNER_RULINGS #5:51). PR A ships everything else without it (the slot still renders for earners).
8. **The receipt's doors are a stub torn below the slip, 6px of ground after the tear** — the guided
   artboard's idea (doors riding the tail), made legible as a perforation between two pieces of paper
   (PATH_DESIGN:99-103: "a receipt tear means a slip torn off the roll").
9. **The low-rating thank-you is "Thank you for telling us" + "Sorry it wasn’t perfect." + the shipped
   `askOurStaff` pair, and nothing about a manager** — D1 + graft (2); the manager page is a read
   (`feedback.ts:128-129`) and K13 has no handled state (`OPEN-ITEMS.md:527`), so even "it's on the
   manager's list" hints at a follow-up the code does not record.
10. **"Not now" leaves during the hold** — you cannot decline what you just sent; it sits below the Send
    node, so removing it moves nothing under the finger (the finger is on the node that became Undo).
11. **The stub's links carry their K15 drafts beneath, inside the same 48px target** — bilingual on one
    surface (DL §6) using the briefs' drafts only; graft (3) forbids the "Full receipt → · ဘောက်ချာ" tail,
    not a translation of the shipped verb.
12. **The eyebrow and the slot leave in ONE cut when the done card lands** — the guided brief's "DONE
    eyebrow for 1.2 s" was a second motion after a write; one swap, then focus on the thank-you, keeps
    "nothing moves after the first read" and needs no RM special case.
13. **The feedback ask opens with the question and the stars alone; the note and Send rise after the
    first star** — guided's "one quiet question at a time" applied inside the ask; it removes the only
    `aria-disabled` primary on the page and keeps the cash seat's whole exit under the tabs on 844px.
14. **The seat predicate becomes ONE pure module** read by the receipt mint, `getFeedbackState` and
    `submitFeedback` (and re-asserted in SQL) — the "name it ONCE" rule (CLAUDE.md money-path rules);
    `apps/qr/lib/` is a `MONEY_PATHS` directory (`check-money-coverage.mjs:39`), so `exitAsks`, the
    seat predicate and the window rule each carry mutants in the first commit.
15. **A page unloaded inside the window loses the write** — the one form's shipped precedent
    (`expo-rules.ts:148-149`); nothing ever claimed "sent" before the window closed, and a lost rating
    costs the guest nothing. (The guided brief's fire-on-hidden was dropped for consistency with the
    shipped form.)
16. **No delight anywhere in the arc** — the pass's one moment is PaySuccess on a card payment
    (`PaySuccess.tsx:103-132`); a cash settle's resume celebrates nothing; a rating pop is a 260 ms
    state change, not a moment (DL §12:350-353).
17. **The eyebrow stays EN-only** — the diner-side eyebrow policy (`PayAtCounter.tsx:285`); the Burmese
    lives on the h2 beside it, which is what a parent reads.

## OPEN RISKS

1. **PR B is a migration** (`mms_submit_feedback` admits the seat arm; one file, owner's go, ruling #5)
   and the cash seat's "How was everything?" cannot ship before it; until then screen 3 renders the
   farewell + stub with no slot. The SQL must mirror the TS predicate exactly (`created_at <=
qr_orders.created_at`, counter tenders only) with a `supabase/tests/*.sql` asserting both the refusal
   (a seat taken after the settle) and the admission, red-first.
2. **One row per order at a 4-top:** whoever's window closes first speaks for the table; a tablemate's
   honest 2 after a neighbour's 5 is refused as `exists`. The spec says so plainly ("Your table already
   sent one") — the owner may prefer one row per seat (a schema change: the unique key on `order_id`,
   `m4_feedback.sql`), which is a different ask and is not designed here.
3. **The farewell's Burmese at 26px is the one visual change to a shipped card** — `.goodbye-beat-line
[lang="my"]` 17 → 26px (`globals.css:6894-6898`); re-measure the card at 375×667 and in Night
   (#f3ecdf on the #2b213c tint) before merging; the contrast guard (DECISIONS 6) covers --t2 on the
   tint, not the heading, which clears AA trivially but is not pinned.
4. **`exitAsks()` and the ask memory key `mms.exitFeedback.passed.v1` are new** — the decline is per
   device, like the Stars ask's (F36 already records that a per-device cap is not per uid).
5. **J4's clock is untouched** (brief-m14.md:12): a pure dine-in table that paid BEFORE its last dish
   left the kitchen sees the farewell at once while the settled card still reads "Cooking" — unchanged
   behaviour, now more visible because the goodbye no longer hides behind `justPaid`.
6. **Two shipped Burmese lines sit under the 13px floor on the Bill's close card** — `bodyMy` is
   `--fs-xs` 11px (`PayAtCounter.tsx:339-345`); the spec lifts it to `--fs-sm`, a one-token change the
   build should carry (and the same `bodyMy` in `TableEnded.tsx` is already 13px, `:160-165`).
7. **The seven K15 drafts** this moment draws (the two stub lines — the "/" in ကြည့်/ပုံနှိပ်မယ် especially —
   "See your receipt", "Thank you for telling us", "Sorry it wasn’t perfect.", "Thanks for your
   feedback!", "Send feedback", "Not now", "Your table already sent one") join the K15 · post-pay ledger
   the day they ship; the sitting may re-word any of them.
8. **The interactive artboard runs a real 6-second timer** (RULES2 §B allows state and events); if the
   canvas runtime does not run constructor timers, the armed frame is the static fallback and the done
   card is reached only through the spec text.
9. **Screen 1 is tight at 844px** (the Stars ask's body is four lines with the email note); on 375×667
   the slot's CTA sits below the fold — acceptable (the page scrolls; the farewell and the eyebrow are
   the fold), but measure it with the real `.save-stars` padding before the PR.
10. **The one live region on the pickup page belongs to PickupPromise** (`:454`) while the tracker's
    (`:710`) owns every other arm — the `announce` callback must route by page, or the F36 close
    reintroduces a second region on exactly the screen that had one.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

**The shared vocabulary (every moment takes it):** ONE VOICE, TWO REGISTERS; ONE SET OF MARKS (the 2026-10-07 vocabulary, PATH_DESIGN_2026-10-07.md:74-135, extended — never paralleled). DINER (m13–m16, guided, English leading; D5's "မင်္ဂလာပါ · Good evening" is the one Burmese-first line): each screen says NOW once as its heading; then ONE actor-first next-step sentence with no label — when the hero is DOCKED its one line slot carries that sentence (live) or the hero's held reason (held), never both and never a third line ("Ready to pay." is neither); the Order · Pay rail (+ /track's status path) is the only step vocabulary, so no dots, rings or "n of m" marks appear beside it; a shared cart never shows a count; inside any window the words are future/-ing, past tense only after a confirmed write; a link's Burmese rides inline after the English (margin, never a whitespace flex child), stacking inside the same ≥44px target only when it does not fit; back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px. STAFF (m17–m20, glanceable, Burmese first, English echo stacked on headings/slots, inline on count lines, NEVER on a 44px chip): the next step lives in the control's own words; counts in prose render Burmese numerals under `my` (`fill.ts` `{n}`), standalone figures (clocks, money, codes, table numbers, the KDS stat row) stay Latin; every refusal is keyed by code and twinned in `OUTAGE_TWINS`. SHARED MARKS: lit-gold cap (`--ac` fill, `--oa` ink, sheen + gold halo; `.checkout-pill-on` on phones, the `.kds-chip[aria-pressed]`/`.staff-seg` rule on the console) = chosen or you-are-here, never a recommendation, never a status; solid ✓ disc in `--ok` = done (a diner line answered, PAID on a settled row); half disc (left `--warn`, right paper) = partly returned; full `--warn` disc = returned in full; HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else (`--t2` on phones, `--warn` on the console) — no eyebrow dot, no refund state, no inert control may use it; DASHED `--ac` edge on `--sf` = provisional, which on every surface here means the open Undo window (the diner's `.arrival-undo`/`.checkout-undo`, the console's `.clear-undo`/`undoBtn`): the SAME node that committed relabels "Undo" + the D3 Burmese (ပြန်ဖျက် when a mark you made is erased, ပြန်ယူ when something sent comes back), arms after the same-gesture guard (350 ms phones / 400 ms console), writes at `PICKED_UNDO_MS` named once per consumer (`FEEDBACK_UNDO_MS`, `TEAM_UNDO_MS`, `ARRIVAL_UNDO_MS` = 6 000), the seconds an aria-hidden leaf in the register's shipped shape (diner " — 6s", staff "· 6s"), the KDS cream pill its one shipped exception, Esc never an Undo unless every window has it; HELD/INERT CONTROL = the real control at its real shape, `aria-disabled` (never native) with the reason in its name or `aria-describedby`, dimmed by the shipped rule (`.ui-btn` .55, `.checkout-pill` .65, `.staff-btn` .6) — never a dashed ghost, never a hollow ring; BUSY = `aria-busy` with the label KEPT (on a `.staff-btn` plus the .6 dim — D8; on an `@mms/ui .ui-btn` the full-ink spinner plus a stated word like "Refunding…"), never "…", never native disabled, and busy marks only the ONE control that is writing (the zone's fact is `aria-disabled`); WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word — light: the word in `--warn` (the console's shipped `.entry-msg-warn`/`Badge warn` pair); Night: the word in `--tx`, only the mark in `--warn` (P2bm) — a warn GROUND fill only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge; GREEN = done and settled, calm (never counted, never pulsing, filled only where it just landed: the picked header, the ✓ disc); GOLD TINT = the till (money taken/owed/waived) and the brand mark, never an alarm; a REMOVING verb (Deactivate, Mark sold out) is a paper pill with `--warn` ink, a RESTORING verb (Reactivate, Put back) a paper pill with `--ok` ink — no tinted fills on routine verbs so nothing shouts during normal service; CHEVRON › = opens/collapsed, ⌄ = expanded, inside the row button; one dismiss word "Close · ပိတ်", one cancel word "Cancel · မလုပ်တော့(ပါ)", one search field recipe on the console (the pad's 48px `--sf` radius-12 field + the 44px `pad.search.clear` circle); ONE live region per view, the count/kicker/hint/next-step lines all static; the receipt code is ONE glyph string on both sides of the counter ("#A1B2C3" on the guest's slip and on Dad's desk); the ONE KITCHEN TRACK's stamps (ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) are the words for the kitchen's state on every surface that shows it. LOUDNESS LADDER (console): ALARM may tint and move — KDS Late, a late bag, money in doubt (the stranded charge, the unpaid badge) said once in the view's one region; CALL — one filled tile per room (the guest asking to pay, the rung lane card's one-shot ring); MARK — glyph + word, no fill, no motion (refund shapes, the dated since-clock, the not-sent ring, dashed pending, the stale disc); CALM — done, paid, picked up, put back. No fact is marked twice on one screen; delight is one moment per pass, never on a first read or inside a window; glass is Night-only, the bar alone.

**This moment's amendments:**

1. Drop the two aria-hidden eyebrow dots (8px solid `--ac` / 6px ring `--t3`): the 6px ring is the diner's HOLLOW RING ("Not sent yet", PATH_DESIGN:88-91) and a dot pair is a second step vocabulary beside the Order · Pay rail (PATH_DESIGN:80). The eyebrow's words "BEFORE YOU GO · 1 OF 2" / "BEFORE YOU GO" carry the count alone; the slot geometry is unchanged.
2. Say that D1's "Undo · 6s" is rendered by the SHIPPED diner leaf " — 6s" (`ArrivalUndoCount`, PickupPromise.tsx:588-598) — one leaf shape per register (diner " — {n}s", staff "· {n}s" from `table.send.undoLeft`), reuse beating a new string; flag the glyph difference for the owner as a non-change.
3. Write the link-Burmese rule the register shares: the stub links' K15 drafts ride INLINE after the English with `margin-inline-start: 8px` (the `browseMenu` / m13 / m16 shape) and stack inside the same 48px target only because these two drafts do not fit on one line — so the stacked form is the fit fallback, not a new recipe.
4. Cross-register word check, no change: "Paid in full · Cash" and "Partly refunded · Cash" (`receiptStatusLabel`) are the same keys Dad's desk prints (m17); "Served · ထုတ်ပြီး" on the settled card is the ONE KITCHEN TRACK's third stamp — cite `lib/kitchen-track.ts` as the source so m19's lane is held to the same word.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The cash seat's real way into /track is left as an ARRIVAL, and the new hero 'See your receipt →' cannot render on the card the spec puts it on. This breaks D1 ('A resume is never an arrival… so no counter arrival replays the celebration').**
   - Evidence: Spec :420-436 puts 'See your receipt →' on CounterSettledCard with href `endTrackHref(end, cartId)`. Spec :507 and :535-536 say 'the only way a counter settle reaches /track from the app' is through endTrackHref with &resume=1. In code, when `counterPayOutcome` returns an order this seat may see, Checkout navigates straight away: `if (o.orderId) { journeyRef.current.push(`/track?cart=${…}&paid=1`); return; }` (apps/qr/components/Checkout.tsx:1102-1104). There is no resume=1, so `justPaid={resume !== "1"}` (track/page.tsx:153) is true and PaySuccess replays. CounterSettledCard is reached only on the opposite branch, where no order is visible (Checkout.tsx:1106-1115 'No order this seat may see'). There `endTrackHref` returns null (session-truth.ts:411, `!end.orderId`), and the card receives no `end` or orderId at all (Checkout.tsx:4074-4078; PayAtCounter.tsx:268-276).
   - Fix: Redesign the counter close in Checkout. Either (a) replace the auto-push at Checkout.tsx:1103 with the CounterSettledCard plus the 'See your receipt →' hero, passing the known orderId and cartId and building the href through `endTrackHref` (now with &resume=1). Or (b) keep the push but add `&resume=1` and draw the hero only on a card that has an orderId. State which one, list Checkout.tsx:1103 as a third path, and drop the 'only way' claim. Spec the `by==="counter"` hero only for the branch that has an order.
2. **D1's Undo form is not applied. D1 says 'tap a star, the send arms, "Undo · 6s" in the slot, the write sent when the window closes'. The spec adds a step: tapping a star raises a note field and a filled 'Send feedback' primary, and only Send arms the window. Its Undo word also does not fit its own design under the D3 rule.**
   - Evidence: common.md D1. Spec :344-351 (IDLE has no Send; RATED raises the note and a `.ui-btn-primary` Send; ARMED means 'Send → the Undo form') and DECISIONS 13 (:599-601). Spec :240 has the guest press Send. The D3 rule (PATH_DESIGN_2026-10-07.md:109-113) makes ပြန်ယူ the word when something you sent comes back, and the guest's phone uses it for Send's undo. The spec keeps ပြန်ဖျက် (:326-327, :277) while the user's act is a Send. ပြန်ဖျက် is only right if the star mark is what arms the window, which is what D1 says.
   - Fix: Make the star tap the commit, as D1 says. Tapping a star arms FEEDBACK_UNDO_MS in the slot, and that same node relabels Undo ပြန်ဖျက် with the ' — 6s' leaf after the 350 ms guard. Make the note an optional 'Add a note' that pauses the window, and have the one write fire when the window closes. Remove the filled Send primary and the RATED state. Or, if the spec keeps Send, record it as an owner question (D1 is reversible only on the owner's word) and use ပြန်ယူ.
3. **Every resume locks the arc's door at 'pending', and the spec's own rule then holds the slot. The cash seat (always a resume) therefore never gets the feedback ask. Screen 1's 'RESUME: the same frame at rest' is also false, because the Keep-your-Star ask cannot exist on a resume. exitAsks() has no defined inputs.**
   - Evidence: The rewards poll runs only when justPaid: `if (!justPaid || !resolvedOrderId || progressDone.current) return;` (OrderTracker.tsx:562). So on resume=1 pollSettled stays false and progress stays null, and `successRewardsDoor` returns `{goodbye:"pending"}` (save-stars.ts:91-92). `saveStarsOffer` returns null when `!i.justPaid` (save-stars.ts:48). The spec's DOOR PENDING rule (:183-184) says 'the eyebrow and slot wait'. Screen 3 is a resume by construction (:411-413), and its claim 'door is none-equivalent' (:461) has no mechanism behind it. Spec :177-180 says resume shows 'the same frame', which includes the Keep ask. The 'BEFORE YOU GO · 1 OF 2' count (:121) also depends on getFeedbackState's async answer and can change after the first read.
   - Fix: Define exitAsks()'s signature and its truth table in the spec. Inputs: justPaid, offer, door, asked, canReview/reviewed (resolved), and passed-memory. On !justPaid the Stars ask is absent and the door must not hold the feedback slot. Show the eyebrow and its count only once both asks have resolved, so the count never changes on screen. Redraw screen 1's RESUME state without the Keep ask. Add mutants for the resume arm.
4. **Copy promises what the code does not do. The offline reason says the feedback 'sends when you're back', but the spec gives offline no queue, retry or auto-send.**
   - Evidence: Spec :316-317: "You’re offline — this sends when you’re back." as Send's aria-describedby, with 'the hold does not start offline'. :374-375 and :529-530 say Send stays aria-disabled and nothing arms offline. Nothing re-arms or submits on reconnect, so the guest must tap again. Standing rule: copy promises only what the code keeps.
   - Fix: Use a sentence the code keeps, built on the shipped reason shape `saveStarsBlockedReason` ('You look offline — saving needs a connection.', save-stars.ts:187), for example 'You look offline — sending needs a connection.' (EN-only, listed). Or spec a real queued send that fires on reconnect, with its Undo window.
5. **Amendment 1 is not applied. The eyebrow's two aria-hidden dots are still drawn, and the 6px ring in --t3 is the diner's HOLLOW RING ('Not sent yet' and nothing else). A dot pair is also a second step vocabulary beside the Order · Pay rail.**
   - Evidence: amend.md m14 §1. Spec :122-123 ('two dots… the other a 6px ring 1.5px --t3'), :208 ('the second dot lights'), :254 ('the second dot 8px solid --ac, the first a 6px ring'), :229 ('the active dot differs by size'), :226-227. Vocab: 'HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else'; PATH_DESIGN_2026-10-07.md:83-84 and :89-91.
   - Fix: Delete the dots everywhere: layout, the Not-now interaction, the A11Y names and the 'never colour alone' bullet. 'BEFORE YOU GO · 1 OF 2' / 'BEFORE YOU GO' carries the count alone, with the slot geometry unchanged.
6. **Amendments 2, 3 and 4 are not reflected. The spec treats stacked Burmese as the rule rather than the fit fallback. It does not flag the Undo-leaf glyph difference for the owner. It does not cite lib/kitchen-track.ts as the source of 'Served · ထုတ်ပြီး'.**
   - Evidence: amend.md m14 §2-4. Spec DECISIONS 11 (:593-595) and :98-102 state 'carry their K15 drafts beneath' as the recipe, with no inline-first rule (`margin-inline-start: 8px`, the browseMenu / m13 / m16 shape). DECISIONS 2 (:566-567) names 'Undo — 6s' but does not say that D1 wrote 'Undo · 6s' and the shipped diner leaf is ' — {n}s' (PickupPromise.tsx:597), nor flag it as a non-change. :56-58 and :491-492 cite line-state-copy.ts:45 / staff.ts:3152 but not apps/qr/lib/kitchen-track.ts (it exists at 09c1c2a).
   - Fix: Rewrite DECISIONS 11 so the drafts ride inline after the English with margin-inline-start 8px, and stack inside the same 48px target only because these two drafts do not fit. Add to DECISIONS 2 that the shipped diner leaf ' — {n}s' renders D1's 'Undo · 6s' (staff '· {n}s' from table.send.undoLeft), flagged for the owner as a non-change. Cite lib/kitchen-track.ts as the ONE KITCHEN TRACK source for 'Served · ထုတ်ပြီး' so m19 is held to the same word.
7. **For the counter case, the farewell and 'How was everything?' ask the table to rate a meal that may still be cooking. This contradicts the settled card's own honesty rule shown just above it.**
   - Evidence: The shipped settled card says it 'Deliberately does NOT say the meal is over… mms_fire_pending_food fires their still-draft dine-in lines at settlement — so "thanks for dining with us" would be a goodbye delivered before the food' (OrderTracker.tsx:936-939). The spec renders the farewell 'see you next time' plus the rating slot immediately on the cash seat's resume while rows may read Sent/Cooking (spec :521-523), and only lists this as OPEN RISK 5 (:633-635). The brief says 'design the counter case' (brief-m14.md:12).
   - Fix: For the dine-in counter arm, gate the farewell and the slot on the ONE KITCHEN TRACK: every dish 'Served', from the `dishes` rows the settled card already reads. Hold both while any row is Sent or Cooking, and render them at rest once all rows read Served. Leave the to-go J4 clock untouched.
8. **The failure line breaks the binding WARN mark: there is no 6px --warn disc, and Night keeps the word in --warn instead of --tx.**
   - Evidence: Spec :312-313 and :364-365: 'Couldn’t save your feedback — please try again.' inline in --warn 13px, and NIGHT is 'as screen 1' (:376). Vocab: 'WARN = a 6px --warn disc (the one warn mark…) beside a word — light: the word in --warn…; Night: the word in --tx, only the mark in --warn (P2bm)'.
   - Fix: Draw the 6px --warn disc (aria-hidden) before the sentence. Light theme: word in --warn. Night: word in --tx with only the disc in --warn. The sentence still goes through the view's one live region.
9. **Wrong citations.**
   - Evidence: 'Paid at the counter' is at PayAtCounter.tsx:282 (`{by === "counter" ? "Paid at the counter" : "Paid"}`). The spec cites it as :282 (:153), :283-285 (:424), :285 (:485) and :285 (DECISIONS 17, :613). :509-510 claims 'the celebration latch is written only by a card payment (PaySuccess.tsx:126-132), never a counter tender'. In fact the latch is written by any PaySuccess mount with a celebrationKey (PaySuccess.tsx:127-131), including today's counter arrival through Checkout.tsx:1103. `.checkout-undo` starts at globals.css:3814, not :3811.
   - Fix: Cite PayAtCounter.tsx:282 everywhere. Restate the latch claim: on a resume PaySuccess does not mount, so nothing latches or replays. Correct the CSS line.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Screen 1 has two thank-yous close together: the top half's 'Thanks for coming by. / လာတဲ့အတွက် ကျေးဇူးတင်ပါတယ်' (track.ts:77-78) and the farewell's ကျေးဇူးတင်ပါတယ်. Consider letting the farewell own the thanks on the picked-up arm.
- The live-region sentence 'sends in 6 seconds' becomes untrue while a keyboard hold pauses the window. Speak the arm without the number ('Sends in a few seconds. Undo available.'), or re-speak it at the cap warning only.
- The 'Not now' K15 draft line ('drawn only if the drawer keeps the 44px row') is a drawer's choice. Decide it in the spec.
- The 4-top single-row case ('Your table already sent one') may read as a refusal to a tablemate who rated honestly seconds later. Put OPEN RISK 2 to the owner as one question rather than leaving it in risks.
- The CounterSettledCard's menu link can read 'Choose how you’re ordering' when the mode is unknown (menu-href.ts:46). Name its MY pair (common.ts:33) instead of only မီနူး / စျေး ကြည့်မယ်.
- Measure 375×667 for screen 3, now that the cash seat's slot may sit below the farewell. The 844 fit in DECISIONS 13 rests on the slot staying idle.
