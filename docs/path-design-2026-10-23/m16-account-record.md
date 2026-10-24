# picked-m16 — The Quiet Ledger, grafted (refined spec)

<!-- round4-citation-key -->

> **Reading this spec.** It is one moment of round 4; the record is [`../PATH_DESIGN_2026-10-23.md`](../PATH_DESIGN_2026-10-23.md), and where the two disagree the record's _Cross-spec reconciliations_ win, then this file's appendices, then its body. Code citations are against `origin/main` @ `09c1c2a`; a bare path is under `apps/qr/`. A few citations name the round's working files, which are not in the repo: **`common.md` D1–D8** are the record's defaults **R4·1–R4·8** (same numbers); **`vocab.md`** is the record's _Shared vocabulary (round 4)_; **`amend.md`** is this spec's appendix A (and the record's reconciliations); **`brief-mNN.md`** and **`mNN.json`** are the three concepts and the judges' notes, summarized in the record's section for this moment; **`picked-mNN.md`** is this file's own body (the critic's line numbers in appendix B point into it as it stood before the appendices); **`lens.md`** is the round's design lens, restated in the record's opening sections. Every Burmese string marked _K15 draft_ is a draft for the native sitting, never final copy.

Moment m16: the account record — every receipt one tap away, and the Save-your-Stars card in two tongues.
Backbone: **The Quiet Ledger** (judges' recommendation; the owner did not overrule, common.md D6). Grafts applied, all ten (m16.json `.judgement.grafts`): (1) ဘောက်ချာ beside "Receipt →" on every row · (2) the one bilingual question as the segmented control's visible heading · (3) the two-sentence disclosure before the chips, each chip's `aria-describedby` · (4) the pure `lib/save-steps.ts` return-router with a test per arrival · (5) `notes` in the history select so the composed row name can say the kitchen note · (6) the shipped `saveStarsCopy` sentence replaces "your past orders come with you too" · (7) "You paid $x" from `netPaidCents` on the collapsed row · (8) the refusal card's h1 takes focus on mount · (9) the sticky tab row, no swipe, opaque `--pg` · (10) the Gold variant of the Rewards lede read from `nextTier() === null`. Left behind: the swipe, the seal rings, the 3-step rail, the per-panel masthead crossfade.

Every product claim below was read against `origin/main` @ `09c1c2a`. Where a claim in the briefs failed, the design changed (DECISIONS). Artboard geometry uses the literal token hex per RULES.md; the build uses the tokens named here.

Shared example (one family across the three screens, like for like): the regular **Thiri** (upgraded; 3 orders this month; 9 Stars) on screens 1–2; a **guest with 3 Stars** on a shared phone that remembers **Mom** on screen 3. Orders: `#A1B2C3` Sun, Oct 19, 2026, 7:12 PM · Table 4 · $42.10, partly refunded $9.00 (Tea leaf salad), kitchen note “no cilantro” on the Mohinga; `#K7M2Q` Oct 12 · $38.40 · Table 4; `#P2X9A` Oct 3 · $21.75 · Grocery.

---

## SCREEN picked-m16-1.dc.html — Orders · the record (the regular, a partly refunded order, every row a door)

**Device:** phone 390×844. **Theme:** light (Night values at the end of the block).

### LAYOUT (y from the top; page padding 24 → content x 24–366, 342 wide — `app/account/page.tsx:217` `padding: 24`)

- **0–47** safe area: plain ground `--pg` #faf9f5, nothing drawn.
- **47–103** AppHeader 56px: logo 51×34 + "Morning Star" Fraunces 16/800; nothing on the right — the header's live-order pill is off on this route by design (`components/TodayOrders.tsx:13-14`).
- **103–127** top padding 24.
- **MASTHEAD** `PageMasthead` (`packages/ui/src/masthead.tsx:44-54`; `.ui-masthead` grid gap 8, margin-bottom 24, `primitives.css:327-331`) — **no `lede` prop** (the lede moves into each panel, below):
  - 127–143 `.ui-kicker` "✦ Mandalay Morning Star" 11px 700 0.13em uppercase #a65f10 (`primitives.css` `.ui-kicker`; the ✦ `aria-hidden`).
  - 151–179 h1 **"Account"** Fraunces 26px 600 −0.02em lh 1.08 #1b1714 (replaces "Rewards & account", `page.tsx:229`; the word is v7.2's own, `docs/prototype/v7.2.html:524`, and the diner tab is already "Account", `lib/diner-tabs.ts:169` — one word per concept).
  - 187–213 `<p lang="my" class="ui-masthead-my">` **"အကောင့်"** Padauk 16px lh 1.6 #6e6358 (`primitives.css:349-355`; v7.2.html:524).
  - 221–241 the recognition line, ONLY when real (`page.tsx:238-247`; DESIGN-LANGUAGE §14): "Mingalaba, Thiri ✦ · 3 orders this month" 13px 700 #8f5009 (`class="tn"` on the 3). Absent for a guest — nothing reserved.
  - 249–250 `.account-masthead-rule` 1px gold-fade (`globals.css:4498-4507`).
  - masthead margin-bottom 24 → **274**.
- **TAB BAND — sticky (graft 9)** 274–334: a 60px band = 8px pad · the 44px pills · 8px pad; `position: sticky; top: var(--header-height)` (56px, under the header's pane), `z-index: var(--z-toolbar)`, background `--pg` **opaque in both themes** (the header is the one frosted pane — glass never nests, DESIGN-LANGUAGE §1/§30), a 1px `--bd` hairline on the band's bottom edge only while stuck (`data-stuck` from an IntersectionObserver sentinel; no transition under reduced motion). Inside: `.account-tabs` grid 3 × 108.67 gap 8 (`globals.css:4439-4444`); each `.account-tab` a REAL `<a href="/account?tab=…" role="tab">` 44px pill 13px 700 (`:4445-4466`): **"Orders" lit** = `.account-tab-on` (#a65f10 fill, #fffdf8 ink, `--sh-lift` `0 2px 8px -1px rgba(166,95,16,0.42)`, `:4467-4472`, `aria-selected="true"`); "Rewards" · "You" vellum (#f2efe7, 1px rgba(58,35,23,0.1), #6e6358, `tabindex="-1"`). The band's bottom pad + 12 → content at **354** (today's `.account-tabs` margin-bottom is 20, `:4443`; the band keeps 20 below the pills).
- **PANEL LEDE (new — the lede speaks to the panel in view, D6)** 354–399, the FIRST child of the Orders `tabpanel` (rendered per panel, flipped with the panel's `hidden` — never a crossfade above the tabs): EN **"Your paid orders and their receipts, kept here."** 15px/22 #6e6358; beneath, `<span lang="my">` draft Padauk 13px/1.6 #726859 margin-top 2 (a block margin, never a whitespace flex child). Margin-bottom 16 → **415**.
  - [GUEST ONLY, +36] the shipped `.account-save-line` "✦ Your Stars live only on this phone. Save them to an account →" (`page.tsx:130-141`; `globals.css:4482-4488`) sits between the lede and the card. Absent for Thiri.
  - [LIVE ORDER ONLY] the shipped `TodayOrders` block (`page.tsx:112`) sits between the lede and the save line; renders nothing otherwise.
  - [REWARDS READ FAILED] the shipped `role="alert"` banner (`page.tsx:121-124`) above the card; the record renders regardless (W9c).
- **THE RECORD CARD** from 415: `.card` 342 wide, radius 20, #fffdf8, 1px rgba(58,35,23,0.1), `--sh-paper` + inset sheen, padding 20 → inner 302 (x 44–346). `aria-labelledby="history-h"` (`OrderHistory.tsx:97`).
  - 435–455 h2 **"YOUR ORDERS"** 13px 800 uppercase 0.02em #6e6358 + `<span lang="my">` **"သင့်အော်ဒါများ"** Padauk 13px 400 #726859 margin-left 8 (shipped verbatim, `OrderHistory.tsx:98-102`, styles `:364-381`). Margin-bottom 4.
  - 471–488 `.history-month` "OCTOBER 2026" 12px 800 uppercase 0.05em #6e6358 + "3" 12px 700 #726859 (`aria-hidden`, the LISTED count, `:106-111`) + the gold-fade hairline to the right edge (`globals.css:4687-4709`; margin 12 2 8) → rows from **496**.
  - **ROW** (`<li class="mms-stagger">`, gap 8): the WHOLE row is ONE `<a>` (`TransitionLink prefetch={false}`) to `/account/receipt?o=<orderId>`, wearing today's `.history-card` surface (radius 12, 1px `--bd`, gradient `--sf` 55% → `--cd`, inset sheen, `globals.css:4710-4718`), padding 12 14, grid `44px minmax(0,1fr)` gap 12, text-decoration none, color `--tx`. The `<details>` disclosure and its hand-copied breakdown (`OrderHistory.tsx:126-310`, `TotalRow` `:354-361`) are DELETED — the receipt is drawn once, on screen 2.
    - Thumb 44×44 radius 10 (`BlurUpImage` lead photo or `PhotoPlaceholder thumb`; `aria-hidden`; placeholder `linear-gradient(135deg,#f1e7d6,#fbf4e8)`).
    - **Line 1** 508–532: left "Oct 19" 16px 700 #1b1714 + " #A1B2C3" 11px 600 0.02em #726859 `tn`; right **"$42.10"** 16px 800 #1b1714 `tn` — the charged total, verbatim `total_cents`.
    - **Line 2** 538–557: left `lineSummary` 13px/1.45 #6e6358 nowrap/ellipsis "2× Mohinga · 1× Tea leaf salad" (`lib/order-history-view.ts:55`); right, PARTIAL REFUND ONLY (graft 7): **"You paid $33.10"** 13px 700 #a44b34 `tn` nowrap — `o.refund.netPaidCents` (`lib/refund-view.ts:68`), read, never recomputed.
    - **Line 3** 563–580, ONLY when a line carries a note (M60; graft 5 adds `notes` to `getOrderHistory`'s item select, `lib/rewards.ts:440`; the field already exists on `OrderHistoryLine`, `:357-359`): italic 11px #726859 **“no cilantro”** nowrap/ellipsis — the `ReceiptCard` `noteLine` idiom (`ReceiptCard.tsx:116`, `:261-265`); several notes join with " · "; the full text is spoken in the row's name.
    - **Line 4** 586–608 chip row, flex-wrap gap 8: `.history-badge` [card stroke glyph 13px `aria-hidden`] **"Paid · Card"** (11px 800, #8f5009 on the 8% clay tint, `globals.css:4641-4653`; `TENDER_LABEL`, `OrderHistory.tsx:42`) · `.history-refunded` **"Partly refunded"** (#a44b34 on 12% warn, `:4671-4683`; `refundChipLabel`, `refund-view.ts:117-119`) · `.history-fulfill` **"To go"** (#6e6358 on `--sf`, `:4656-4668`; `FULFILL_LABEL`, `OrderHistory.tsx:44`) · "3 items" 11px #726859. Other rows: "Table 4" (`:192-194`), "Grocery", "{n} sold out" (`droppedChipLabel`, `lib/dropped-view.ts:119-122`).
    - **Line 5** 614–634 THE DOOR, right-aligned (grafts 1): **"Receipt"** 13px 700 #a65f10 · `<span lang="my">`**ဘောက်ချာ**`</span>` Padauk 13px 400 #726859 margin-left 6 (the glossary noun, `lib/i18n/common.ts:11`) · "→" #a65f10 `.nav-arrow .nav-arrow-fwd` margin-left 4 (`aria-hidden`; nudges 3px on hover, `globals.css:4544-4551`). Not a second control — it is the anchor's visible verb; it replaces today's "›" chevron (`OrderHistory.tsx:159-161`).
    - bottom padding 12 → row 1 ends **646** (150 tall; 129 without the note line; 110 without note and refund).
    - **646–690** `.history-again` band (`globals.css:4489-4495`, unchanged, D4): right-aligned **"Order again →"** `.nav-link` 14px 700 #a65f10, 44px target (`OrderHistory.tsx:320-345`); "Track this pickup →" joins it (gap 16, wraps) only for an uncollected pickup (`o.trackHref`, `:329-335`); a pure-grocery order reads "Shop the market again →" (`reorderLink`, `order-history-view.ts:82-101`). Margin-bottom 8 → **698**.
  - **ROW 2** 698–827 (129: no note, no refund): "Oct 12 #K7M2Q" · "$38.40" · "2× Mohinga · 1× Tea leaf salad" · Paid · Card · Table 4 · 3 items · Receipt ဘောက်ချာ →; band 827–871 "Order again →". The fold is **750**: the tab bar overlays row 2 — the page scrolls.
  - **ROW 3** 879–989 (110): "Oct 3 #P2X9A" · "$21.75" · "1× Shan noodles · 1× Burmese milk tea" · Paid · Card · Grocery · 2 items · Receipt ဘောက်ချာ →; band "Shop the market again →".
  - **CARD FOOT** (last child, margin-top 8): **"Cash-paid orders aren’t shown here."** 12px #726859 — the shipped sentence VERBATIM (`AppHeader.tsx:264`), true until M206's history half lands (counter orders get no `earned_by`, so `getOrderHistory` — `earned_by` / `qr_order_payers`, `lib/rewards.ts:421-431` — can never list one; DECISIONS_2026-10-18 M206); beneath, `<span lang="my">` draft Padauk 13px #726859.
  - card padding-bottom 20. Then `AccountFavorites` (renders nothing without hearts, `AccountFavorites.tsx:10-12`).
- **750–844** `.diner-tabs` (60 + 34 safe): Menu · Order · **Account** (`aria-current="page"`, #8f5009); the Account tab carries the shipped Stars capsule **"9"** (`.diner-tab-count` 18px, #a65f10/#fffdf8, 12px 800, `tn`, top −6 left 18 of the icon box, `globals.css:5577-5592`; `diner-tabs.ts:174` — the rewards badge the header carried, DESIGN-LANGUAGE §30). The Order tab has no count (no cart) and no dot (no live order).

**Night** (`data-theme="dark"`, the M126 ladder): ground #100c19; card #2b213c; rows gradient from #211a30 to #2b213c; ink #f3ecdf / #bcafc8 / #a69eb1; the lit tab #e7a53a with #130d1e ink; the door's accent #e7a53a; the refund words #e0855f on #33231d; the sticky band `--pg` #100c19 opaque — no glass on the band, none on any card.

### COPY (English) — verbatim

- Account
- Mandalay Morning Star
- Mingalaba, Thiri ✦ · 3 orders this month (only when real)
- Orders · Rewards · You
- Your paid orders and their receipts, kept here.
- ✦ Your Stars live only on this phone. Save them to an account → (guest only, shipped `page.tsx:131-139`)
- YOUR ORDERS
- OCTOBER 2026
- Oct 19 #A1B2C3 · $42.10 · 2× Mohinga · 1× Tea leaf salad · You paid $33.10 · “no cilantro”
- Paid · Card · Partly refunded · Refunded · {n} sold out · To go · Grocery · Table 4 · 3 items
- Receipt → (the door's English)
- Order again → · Shop the market again → · Track this pickup →
- Cash-paid orders aren’t shown here.
- No orders yet · When you order — at the table, for pickup or from the market — your receipts live here. · Browse the menu → (empty state, shipped `OrderHistory.tsx:77-88`)
- We couldn’t load your past orders just now — check back in a moment. (`page.tsx:156`)
- We couldn’t load your Stars and rewards just now — try again in a moment. Your orders are below either way. (`page.tsx:122-123`)
- Loading your account… (the skeleton's sr-only cue; replaces "Loading your rewards…", `account/loading.tsx:38`)
- Rewards panel lede (not drawn here): "Earn Stars as you order — climb the gem tiers and unlock Kyay-Zu-Par! rewards." (shipped verbatim, `page.tsx:231`) — or, when `nextTier(state.tierId) === null` (`lib/rewards-tiers.ts:41-44`; graft 10): "Gold — the top of the ladder. You still earn Stars as you order."
- Row accessible name (sr): "Order A1B2C3, Sun, Oct 19, 2026, 7:12 PM, total $42.10, paid Card, $9.00 refunded, you paid $33.10, To go, note: no cilantro. Open the receipt."

### COPY (Burmese) — shipped strings or the briefs' drafts only

- **အကောင့်** — GROUNDED, v7.2 verbatim (`docs/prototype/v7.2.html:524`).
- **သင့်အော်ဒါများ** — SHIPPED (`OrderHistory.tsx:99-101`).
- **ဘောက်ချာ** — SHIPPED word, the S14a glossary noun (`lib/i18n/common.ts:11`; `cart.ts:21` "သင့်ဘောက်ချာ", `:44` "ဘောက်ချာ ကြည့်မယ်") — the door's accent on every row.
- **ရှင်းပြီးသား အော်ဒါတွေနဲ့ ဘောက်ချာတွေ ဒီမှာ ရှိပါတယ်** — K15 DRAFT (brief-m16.md:169, the Kept Ledger's Orders lede; ရှင်းပြီး from `cart.ts:258` `paidInFull`).
- **ငွေသားနဲ့ ရှင်းထားတဲ့ အော်ဒါတွေ ဒီမှာ မပြပါ** — K15 DRAFT (brief-m16.md:64 / :299) for the cash foot (ငွေသားနဲ့ ရှင်း from `cart.ts` `counterTakesCash`).
- Rewards lede drafts (not drawn): **အော်ဒါတိုင်းမှာ ကြယ် စုပါ — ကျောက်မျက် အဆင့်တွေ တက်ပြီး Kyay-Zu-Par! ဆုလက်ဆောင်တွေ ရယူပါ** — K15 DRAFT (brief-m16.md:175) under the shipped pitch; the Gold lede ships EN-only (its brief draft, :176, belongs to a different sentence — see new copy).
- The row words ("Receipt", "Order again", the chips, "You paid") stay English beside the one Burmese noun: chips and 11px badges carry no echo (the owner's echo policy, brief-m16.md:298-300); money words are receipt language (DESIGN-LANGUAGE §8).

### A11Y

- Tabs: `role="tablist" aria-label="Account sections"`; three real `<a role="tab">` links with manual activation — Arrow/Home/End move focus, Enter/Space select (`AccountHub.tsx:28-32`, `:100-104`); `?tab=` written with `replaceState` (`:83`); the sticky band changes nothing in the tab semantics.
- Each history row: ONE `<a>` whose `aria-label` is the composed sentence above — today's `OrderHistory.tsx:129` with the kitchen note added after the fulfillment clause and "Show items." → "Open the receipt."; the thumb, the ✦, the card glyph and the arrow `aria-hidden`; "Order again →" is a SEPARATE link under the row — never nested (no interactive-in-interactive). Rows ≥110px, the band 44px, tabs 44px.
- Never colour alone: the refund fact is a word on the chip and in the name, "You paid" is a word; the lit tab carries `aria-selected`.
- One live region per view: the shipped rewards `role="alert"` banner is the Orders panel's only one; the rows are plain anchors (no busy state, no status line — a failed mint lands on the refusal page, screen 2's state).
- Focus: a row tap is a navigation; the browser's own pop returns to the tapped row (bfcache); no scripted focus on the hub. The lede flips with the panel and never takes focus.
- Reduced motion: `.mms-stagger` entrance off, `.account-tab` transition none (`globals.css:4474-4477`), the arrow nudge off, no band transition.
- `prefers-reduced-motion` and `data-fx` do not change layout; the band is opaque in every mode.

---

## SCREEN picked-m16-2.dc.html — the durable receipt, opened from a row (partly refunded; one way back)

**Device:** phone 390×844. **Theme:** light.

What the tap does: `/account/receipt?o=<orderId>` is a server page that re-authorizes the SSR caller with `callerMayReceiveReceipt` (earner · recorded split payer · the counter seat taken before the settle — `lib/receipt.ts:59-118`; `getReceiptLink` is the shipped action that runs exactly this pair, `:120-131`), reuses the order's live 90-day token or mints one (`mintReceiptToken` find-or-create with the sliding window, rotate only after expiry, `lib/receipt-token.ts:38-75`; TTL `:22`), and redirects to `/track?r=<token>` (Next `redirect()` on a GET — no history entry, so Back from the receipt returns to /account). `prefetch={false}` on the rows is load-bearing: a prefetch of this page would bump a live token's expiry (idempotent, never a counter).

### LAYOUT (page padding 24, `.page-col page-col-narrow` — `app/track/page.tsx:20-21`)

- **0–47** safe area. **47–103** AppHeader. **103–127** padding.
- **127–171 THE WAY BACK (the one change to this page):** **"← All your orders"** `.nav-link` 44px, 14px 700 #a65f10, left-aligned, the arrow `.nav-arrow .nav-arrow-back` `aria-hidden` (nudges −3px on hover, `globals.css:4552-4554`) + `<span lang="my">`**သင့်အော်ဒါများ**`</span>` Padauk 13px 400 #726859 margin-left 8. It is the M79 `BackLink`: pop when the previous in-app entry is /account (always, after the row's redirect), otherwise replace to `/account?tab=orders` — never push (DECISIONS_2026-10-18.md:637-656, decided; `BackLink.tsx` does not exist yet and `NavDirectionSync`'s stack is a `useRef`, C15 `:261`). Until it lands, the same label ships as a plain `Link` to `/account?tab=orders` and the PR says so. The shipped foot link "All your orders →" (`track/page.tsx:126-131`) is REMOVED so the page never offers one destination twice. Margin-bottom 16.
- **187–~735 `ReceiptCard`** — `section.card.card-textured.receipt-artifact`, 342 wide, padding 20, dots on the card (`.card-textured::before` 18px grid of `--tex-dot`, `globals.css:1023-1035`), lines on the page (`PaperAmbient`). Everything inside is `ReceiptCard.tsx:44-205` AS BUILT — this screen exists to show that the record has exactly one receipt rendering:
  - 207–232 head row (`:51-96`): left `<p class="eyebrow">` [`/logo.png` 38×25 radius 4, `alt=""`] "✦ Mandalay Morning Star" 11px 800 0.13em #a65f10; right "Order" 11px 700 #726859 over "#A1B2C3" 13px 800 #1b1714 `tn` (both `aria-hidden`; sr-only "Order reference A 1 B 2 C 3", `:91`).
  - 238–261 h1 **"Your receipt"** 21px 900 #1b1714 (`--fs-h2`, `--fw-black`, `:216-222`) with `<span lang="my">`**သင့်ဘောက်ချာ**`</span>` Padauk 13px 400 #6e6358 margin-top 2 as a block beneath (`:66-71`) → 263–284.
  - 290–310 meta "Sun, Oct 19, 2026, 7:12 PM · Table 4" 13px #6e6358 (`receiptDateLabel`, `lib/receipt-view.ts:73-85`, pinned to America/Los_Angeles; a pickup adds "· Pickup {slot} · For {name}", `:73-82`).
  - 320– the lines, ONE unlabeled list for a single-destination order (`aria-label="Items"`; headings "At your table / To-go / Grocery" only when the basket spans 2+, `groupReceiptLines`, `receipt-view.ts:103-141`): each `.history-line` = qty "2×" 13px #6e6358 (the × `aria-hidden`) · name 16px #1b1714 + the note **“no cilantro”** italic 11px #726859 (`noteLine`, `:116`) · amount 16px #6e6358 `tn`. Line 2: "1× Tea leaf salad" with **"Refunded $9.00"** 11px 700 #a44b34 beneath (`lineRefundLabel`, `refund-view.ts:145`) · $9.00. ≈ 320–410.
  - 422–530 `<dl class="history-totals">` from `buildReceiptRows` + `buildRefundRows` (`ReceiptCard.tsx:44-47`): Subtotal $38.50 · Tax $3.60 · **Total $42.10** (grand: 1px top rule, 16px 800) · then, AFTER the Total, **Refunded −$9.00** (#a44b34) · **You paid $33.10** (grand) (`refund-view.ts:98-102`). Discount, Service charge (5%) and Tip rows only when the snapshot holds them; the SB-1524 disclosure only when `serviceDisclosed` (`receipt-view.ts:57-67`).
  - 542–562 the settled line **"Partly refunded · Card"** 13px 700 #6e6358 (`refundedLine`, `ReceiptCard.tsx:145-148`; `receiptStatusLabel`, `refund-view.ts:83-86`) — a refunded order never reads "Paid in full" and never gets the ✦ (`:147`).
  - 570–603 the partial note 11px #726859, 2 lines: "The refunded amount goes back to the card you paid with. Your bank decides when it lands." (`partialRefundNote`, `refund-view.ts:174-177`; cash: "The refunded amount was handed back to you in cash.").
  - 617–637 farewell "Thank you — see you again soon." 13px #6e6358 + `<span lang="my">`**ကျေးဇူးတင်ပါတယ်**`</span>` margin-left 8 (`:184-187`).
  - 651–715 foot: 1px `--bd` rule; "Mandalay Morning Star · 750 Terrado Plaza, Suite 33, Covina, CA 91723" 11px #726859; "(626) 665-5317 · admin@mandalaymorningstar.com" — `tel:`/`mailto:` links padded to 44px targets (`:194-203`; strings from `lib/brand.ts:14-24`). No hours anywhere.
  - card padding-bottom 20 → ~735.
- **749– the action stack** `.print-hide` margin-top 14, grid gap 10 (`track/page.tsx:112-131`): `PrintReceiptButton` — a 48px paper pill, printer stroke svg `aria-hidden` + **"Print or save as PDF"** (the shipped label, `PrintReceiptButton.tsx:9`); then **"Order this again →"** `.nav-link` 44px (`:118-123`; "Shop the market again" for a pure-grocery order). Both sit under the fold (750) and scroll up; the receipt is the hero.
- **750–844** `.diner-tabs` — the bar IS rendered on /track (`app/layout.tsx:171`; `dinerTabsHidden` hides only /staff, /board, /kiosk, /kit — `lib/diner-tabs.ts:58-66`): **Order** is the current tab (`activeDinerTab("/track") → "order"`, `:73-85`), its href the page's own URL (`:163-165`), no count, no dot; **Account** carries the Stars capsule "9". Drawn as built — see OPEN RISKS.

**Night:** the receipt on the `--cd` #2b213c rung with #f3ecdf ink and #e0855f refund words; `@media print` re-pins light paper and hides the ambient, the back link, the actions and the tab bar.

**THE REFUSAL (state, same column):** when `mintReceiptToken` returns null (best-effort by design, `receipt-token.ts:35-36`, `:71-73`) or the authorization cannot be read (fail-closed `null`, `receipt.ts:67`, `:80`, `:113`), `/account/receipt?o=` renders in place: 127–171 the same "← All your orders · သင့်အော်ဒါများ" (the hero and the ONE way out); 187– `.card.card-textured.track-notice` (`globals.css:4603-4639`): a 64px medallion (receipt stroke svg `aria-hidden` — the shipped `🧾` emoji idiom drawn as a glyph) · h1 **"We couldn’t open this receipt just now"** Fraunces 24px (`.track-notice h1`, `:4628-4630`), `tabIndex={-1}`, **focused on mount** (graft 8) · p 14px #6e6358 **"Your order is still in your list — go back and try again in a moment."** + `<span lang="my">` draft beneath. No second button; nothing claims the order is gone — it came from `getOrderHistory` moments ago (status `paid`, `rewards.ts:427`, which `RECEIPT_STATUSES` admits, `receipt-entry.ts:18`). The EXPIRED-LINK card for a dead `?r=` from an old email stays the shipped honest-neutral copy word for word (`track/page.tsx:84-105`): "We couldn’t open this receipt" / "The link may have expired — receipt links last 90 days from when they’re shared. If you signed in when you ordered, your orders live in your account." / "My orders →" — it diagnoses nothing and never promises the account holds the order.

### COPY (English) — verbatim

- ← All your orders
- Your receipt · Order · #A1B2C3
- Sun, Oct 19, 2026, 7:12 PM · Table 4
- 2× Mohinga · “no cilantro” · $29.50 · 1× Tea leaf salad · Refunded $9.00 · $9.00
- Subtotal · Tax · Total · Refunded · You paid
- Partly refunded · Card
- The refunded amount goes back to the card you paid with. Your bank decides when it lands.
- The refunded amount was handed back to you in cash. (cash tender)
- Refunded — this charge was returned to you (full refund)
- Paid in full · Card ✦ (no refund)
- Thank you — see you again soon.
- Mandalay Morning Star · 750 Terrado Plaza, Suite 33, Covina, CA 91723 · (626) 665-5317 · admin@mandalaymorningstar.com
- Print or save as PDF
- Order this again → · Shop the market again →
- We couldn’t open this receipt just now · Your order is still in your list — go back and try again in a moment.
- We couldn’t open this receipt · The link may have expired — receipt links last 90 days from when they’re shared. If you signed in when you ordered, your orders live in your account. · My orders →

### COPY (Burmese)

- **သင့်အော်ဒါများ** — SHIPPED (`OrderHistory.tsx:99-101`), the back link's accent (the Spike's choice, brief-m16.md:363); no new sentence written for the door.
- **သင့်ဘောက်ချာ** — SHIPPED (`ReceiptCard.tsx:69-70`; `cart.ts:21`).
- **ကျေးဇူးတင်ပါတယ်** — SHIPPED (`ReceiptCard.tsx:185-186`).
- **ဒီဘောက်ချာကို အခု ဖွင့်လို့ မရသေးပါ** — K15 DRAFT (brief-m16.md:366) for the refusal h1 (ဖွင့်လို့ မရသေးပါဘူး `cart.ts:304`).
- **သင့်အော်ဒါ စာရင်းထဲမှာ ရှိနေဆဲပါ — ပြန်သွားပြီး ခဏနေ ထပ်ကြိုးစားပါ** — K15 DRAFT (brief-m16.md:367) for the refusal body (`cart.ts:336`; ထပ်ကြိုးစား `common.ts:21`, v7.2).
- The money rows stay monolingual by design (`cart.ts:13-16`); the expired-link card stays EN-only as shipped (binding).

### A11Y

- A new document: reading order is the back link → the receipt's h1 → labelled lists (`role="list" aria-label`) → the `<dl>` → the status line → the foot's 44px tel/mailto → the actions. The order reference is `aria-hidden` with its sr-only spaced twin (`ReceiptCard.tsx:84-91`).
- The back link's name is "All your orders"; `nav-arrow-back` is `aria-hidden`.
- On the refusal page the h1 receives focus on mount so a screen reader hears the refusal before the way out (graft 8); on the receipt itself nothing steals focus.
- No live region on this page (none today; `ReceiptActions` is not mounted on the `?r=` view — `track/page.tsx:78-82` mounts no live layer).
- Reduced motion: nothing moves; the arrow nudges are hover-only transforms inside the `prefers-reduced-motion` reset (`globals.css:4959`).
- Print: `@media print` flattens `.receipt-artifact`; the back link, actions, ambient and tab bar are `print-hide`.

---

## SCREEN picked-m16-3.dc.html — You · the save card: one question, the chooser's cost said first, the form behind the switch

**Device:** phone 390×844. **Theme:** light. **Drawn state:** a guest with 3 Stars on a shared phone that remembers one identity (Mom · m•••@gmail.com · Email); the guest has answered **Sign in**; the artboard is drawn SCROLLED by 216px so the sticky band holds the tabs and the card's chooser is in view (the unscrolled page coordinates are given first, the artboard's second).

### LAYOUT

Page (unscrolled): 127–143 kicker · 151–179 h1 "Account" · 187–213 "အကောင့်" · (no recognition line for a guest) · 221–222 gold rule · masthead ends 246. **TAB BAND** 246–306 (8 · 44 · 8), **"You" lit**, Orders/Rewards vellum. Content at 326.

- **PANEL LEDE** 326–371: EN **"Your Stars and sign-in on this phone."** 15px/22 #6e6358 + `<span lang="my">` draft Padauk 13px/1.6 #726859 margin-top 2. Margin-bottom 16 → **387**.
- **THE SAVE CARD** 387–~1230 (`AccountUpgrade`, `Card textured`, radius 20, padding 20, dots; inner 302). Its shell changes; every handler is byte-for-byte the shipped one (`AccountUpgrade.tsx:182-262` send, `:330-347` chip, `:392-403` focus on step change, `:583-618` submit, `:629-650` verify, `:956-970` the region).
  - 407–423 eyebrow `.eyebrow` **"✦ Save your Stars"** 11px 800 0.13em uppercase #a65f10 (shipped words, `:690-693`) — CONSTANT under both intents (today it flips to "Sign in", `:692`): the intent lives in the segments, not above them.
  - 429–450 h2 `id="upgrade-h"` **"Keep your rewards"** 17px 800 #1b1714 (`:694-696`) — constant too (today "Welcome back" under sign-in, `:695`).
  - 452–494 the Burmese line FIRST under the heading, `<p lang="my">` Padauk 13px/1.6 #6e6358, two lines: **"ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်"** (`lib/save-stars.ts:139`, carries no numeral by design, `:132-136`).
  - 506–551 **THE QUESTION** (graft 2) — `<p id="intent-q">`: **"Are you new here, or coming back?"** 15px 700 #1b1714 + `<span lang="my">`**အသစ်လား၊ ပြန်လာတာလား?**`</span>` Padauk 13px/1.6 #6e6358 margin-top 2 (block).
  - 559–619 **THE SEGMENTED CONTROL** — `<div role="group" aria-labelledby="intent-q" class="account-seg">`, the `.staff-seg` recipe brought to the diner side (`globals.css:12375-12391`: track 302×60, `color-mix(in oklab, var(--sf) 85%, transparent)` → #f2efe7 at 85%, 1px rgba(58,35,23,0.1), padding 4, radius 999; segments gap 2). Two `<button type="button" aria-pressed>` 145×52: label 14px 700 (17px) over `<span lang="my">` Padauk 13px/1.6 (21px), centred, radius 999. Left **"Save my Stars" / ကြယ်တွေ သိမ်းမယ်** — idle: transparent, #6e6358. Right **"Sign in" / အကောင့်ဝင်မယ်** — PRESSED: the ONE lit-gold cap exactly as every pressed staff chip (`globals.css:8977-8995`: #a65f10 fill, #fffdf8 ink, `inset 0 1px 0 var(--sheen)`, `0 0 14px -6px var(--glow-gold)` = rgba(232,168,60,0.34)); the M126 ignition 420ms, static under reduced motion. A segment tap runs the shipped toggle body (`:737-744`: `setIntent`, clear error · emailTaken · carryBlocked); focus stays on the pressed segment; no server round trip. Replaces the text-link switch (`:735-751`).
  - **Under SAVE (state A, not drawn):** 631– the pitch, ONE sentence pair 13px/1.5 #6e6358: **"You’ve earned 3 Stars on this phone — they live only here. Save them to an account with an email code or Google, and the orders that earned them come along too."** — sentence 1 is the shipped count line (`:713-717`, "device" → "phone" to match the save line and the Burmese heading — one word per concept), sentence 2 is the shipped `saveStarsCopy` body verbatim (`lib/save-stars.ts:164-165`), replacing ":718-719 keep them for good; your past orders come with you too" (graft 6 — the M237-safe promise). 0 Stars / failed read (`page.tsx:106` `stars={0}`): "You’re earning Stars on this phone — they live only here. Save them to an account with an email code or Google." — no number anywhere. Then the Email field → "Email me a code" → "Continue with Google" → status (no chooser: a chip is a SWITCH that suppresses the carry, never a save — `docs/SHARED_DEVICE.md:54-56`; F36's "form before chips on a save arrival").
  - **Under SIGN IN with remembered identities (DRAWN):**
    - 631–651 the chooser's heading `.wb-heading` **"Welcome back — pick up where you left off"** 13px 700 #6e6358 (shipped, `WelcomeBackChooser.tsx:81-83`; `globals.css:4977-4982`) — the section's `aria-labelledby`. The shipped 4-line sign-in sentence (`:703-712`) is NOT drawn when the chooser is: the disclosure's second sentence states the carry promise before any press; without identities (state C) the shipped sentence returns.
    - 661–802 **THE DISCLOSURE (graft 3)** — `<p id="wb-note" class="wb-note">` 13px/1.5 #6e6358 (`globals.css:13960-13965`), BEFORE the chips in DOM and on screen, two short sentences with the SAME FACTS as `chooserLeavesNote`'s one 30-word sentence (`lib/save-stars.ts:233-274`; M237's limit kept — the promise names only the Stars and the orders that EARNED them, `:215-216`, `:211-214`): **"Tapping a name leaves behind this phone’s 3 guest Stars and the orders that earned them."** (2 lines) **"To bring them along, use your email or Google below."** (1 line) then `<span lang="my" class="wb-note-my">` the SHIPPED line verbatim (3 lines Padauk 13px): **"နာမည်ကို နှိပ်ရင် ဒီဖုန်းက ကြယ်တွေနဲ့ အော်ဒါတွေ မပါလာပါဘူး — ကြယ်တွေ ယူလာချင်ရင် အောက်က အီးမေးလ် ဒါမှမဟုတ် Google နဲ့ ဝင်ပါ"**. Variants (each a test, red-first on the existing suite `lib/save-stars.test.ts`): with a live order — "…this phone’s 3 guest Stars and its orders, including the one in progress." / "To bring the Stars and the orders that earned them along, use your email or Google below."; count unknown (`stars: null`) — "…anything this phone earned as a guest[, including your order in progress]." / the same second sentence; 0 Stars with a live order — the shipped single sentence "Tapping a name signs in without your order in progress." (`:265-271`) with its shipped MY line (`:210`). Each chip's `aria-describedby="wb-note"` (shipped wiring, `WelcomeBackChooser.tsx:111`).
    - 810–866 **THE CHIP** `.wb-row` (`globals.css:4994-5015`): `<button class="wb-chip">` 56px, radius 14, #f2efe7, 1px `--bd`, inset sheen: 28px tier-tinted avatar disc (gold tint 16% fill / 34% ring, the tier's glyph drawn as a stroke svg, `aria-hidden`) · **"Mom"** 15px 700 #1b1714 over **"m•••@gmail.com"** 12px #6e6358 · **"Email"** 11px #6e6358 right (`aria-hidden`); accessible name "Sign back in as Mom, m•••@gmail.com, Gold tier, via email" (`:113-115`); beside it `.wb-forget` 44×44 "×" (`aria-label="Forget Mom on this device"`, `:141`). Up to three chips, 8px apart.
    - 874–918 **"Not you? Forget this device"** `.nav-link` 44px (`:148-151`).
    - 926–927 a 1px `--bd` hairline (margin 8 0) replaces the words "or use another account" (`:152-154`).
    - 935–955 `Field label="Email" labelMy="အီးမေးလ်"` (`packages/ui/src/field.tsx:29-53`): "Email" 14px 700 #1b1714 + `.ui-field-label-my` **အီးမေးလ်** Padauk 14px 500 #6e6358 margin-inline-start 8.
    - 961–1009 the input `.ui-field-control.account-field` 48px radius 12, the sunken well #efece2 with the inverted bevel (`globals.css:4900-4914`), 16px type, placeholder "you@example.com", `inputMode=email autoComplete=email`. A refusal of THIS address draws the Field's one note line beneath it (F20, `:107-110`, `aria-describedby` + `aria-invalid`) and pushes the CTA down.
    - 1021–1075 the HERO `.checkout-cta` 54px radius 12 (`globals.css:2271-2293`: the clay ramp #a65f10→#8f5009, inset sheen, `--sh-lift`, the one-sweep shine): **"Send sign-in code"** 16px 800 #fffdf8 (`:804-806`) over `<span lang="my">` draft **ဝင်ဖို့ ကုဒ် ပို့ပါ** Padauk 13px 700. Busy: "Sending…" + `aria-busy` (`:802`).
    - 1085–1139 the paper secondary `.account-oauth` 54px (the `.ui-btn-secondary` recipe: #fffdf8, 1px `--bd`, inset sheen, `--sh`; never a second filled pill): the 18px Google "G" (the sanctioned brand-colour svg, `aria-hidden`, `:898-911`) + **"Sign in with Google"** 16px 700 #1b1714 (`:913`) over `<span lang="my">` draft **Google နဲ့ ဝင်မယ်** 13px (Google wrapped `lang="en"`). The shipped "or" tray-label (`:876-878`) is removed — one filled verb, one paper alternative.
    - 1151–1167 the card's ONE `<p role="status" aria-atomic>` (`:956`), min-height 16, 13px #a44b34, empty at rest.
    - card padding-bottom 20. Below, unchanged: the `SoundToggle` card, then "Help & contact" (`AccountHelp.tsx:23-24`, strings from `lib/brand.ts`, no hours).

**The artboard (scrolled 216px):** 47–103 header; **103–163 the stuck tab band** (8 · 44 · 8, `--pg` opaque, the 1px `--bd` hairline at 162–163 — `data-stuck`), "You" lit; the lede has slid under the band; card top at **171**: eyebrow 191–207 · h2 213–234 · MY line 236–278 · question 290–335 · segments 343–403 (Sign in pressed) · "Welcome back — pick up where you left off" 415–435 · disclosure 445–586 · the chip 594–650 · "Not you? Forget this device" 658–702 · hairline 710 · "Email · အီးမေးလ်" 719–739 · the input's top 745–750. The tab bar 750–844 (You's panel, Account lit, Stars capsule "3") covers the rest; the CTA (805–859) and Google (869–923) follow on scroll.

**Night:** track #211a30 at 85%; the cap #e7a53a with #130d1e ink; the well #171422; the card #2b213c; the paper button #2b213c with #f3ecdf; the G mark keeps its brand colours.

### COPY (English) — verbatim

- Your Stars and sign-in on this phone.
- Save your Stars · Keep your rewards
- Are you new here, or coming back?
- Save my Stars · Sign in
- You’ve earned 3 Stars on this phone — they live only here. Save them to an account with an email code or Google, and the orders that earned them come along too.
- You’re earning Stars on this phone — they live only here. Save them to an account with an email code or Google.
- Enter the email on your Morning Star account, or continue with Google — your Stars and past orders are there waiting, and the 3 Stars and anything else saved on this phone come along. (Sign in, no identities; shipped `:703-712`)
- Welcome back — pick up where you left off
- Tapping a name leaves behind this phone’s 3 guest Stars and the orders that earned them. · To bring them along, use your email or Google below.
- Tapping a name leaves behind this phone’s 3 guest Stars and its orders, including the one in progress. · To bring the Stars and the orders that earned them along, use your email or Google below.
- Tapping a name signs in without your order in progress. (shipped)
- Mom · m•••@gmail.com · Email · Not you? Forget this device
- Email · you@example.com
- Email me a code · Send sign-in code · Sending…
- Continue with Google · Sign in with Google
- 6-digit code sent to {email} · 123456 · Confirm & save my rewards · Confirm & sign in · Confirming… · ← Use a different email (code step, shipped `:813-870`)
- That email already has a Morning Star account — tap “Send sign-in code” to use it. We’ll move this device’s Stars onto it when you sign in. (`:967`)
- Sign in without them — leave this device’s Stars behind (`CARRY_OVERRIDE_LABEL`, `lib/merge-carry.ts:69`, only while blocked)
- You look offline — saving needs a connection. (`save-stars.ts:193`)

### COPY (Burmese)

- **ဒီဖုန်းက သင့်ကြယ်တွေနဲ့ အကောင့်ဝင်မှု** — K15 DRAFT (m16.json, the Receipt Spike S3 copy_my) for the You lede (ကြယ်တွေ `save-stars.ts:139`; အကောင့်ဝင် `staff.ts:60`).
- **ကြယ်တွေက ဒီဖုန်းထဲမှာပဲ ရှိသေးတယ် — သိမ်းထားလိုက်ပါနော်** — SHIPPED K15 draft (`lib/save-stars.ts:139`), the heading's Burmese line.
- **အသစ်လား၊ ပြန်လာတာလား?** — K15 DRAFT (m16.json, the Kept Ledger S3 copy_my), the one question.
- **ကြယ်တွေ သိမ်းမယ်** — K15 DRAFT (m16.json, Quiet S3 / Spike S3 copy_my) for "Save my Stars" (သိမ်း = the shipped Save, `staff.ts:797`).
- **အကောင့်ဝင်မယ်** — K15 DRAFT (m16.json, Spike S3 copy_my) for "Sign in" (grounded `staff.ts:60`; the staff imperative is "ဝင်ပါ", `staff.ts:2517` — the diner register softens it, for Min's call).
- **နာမည်ကို နှိပ်ရင် ဒီဖုန်းက ကြယ်တွေနဲ့ အော်ဒါတွေ မပါလာပါဘူး — ကြယ်တွေ ယူလာချင်ရင် အောက်က အီးမေးလ် ဒါမှမဟုတ် Google နဲ့ ဝင်ပါ** — SHIPPED (`save-stars.ts:208-209`), the disclosure, unchanged under the split English.
- **နာမည်ကို နှိပ်ရင် လုပ်နေဆဲ အော်ဒါ မပါလာပါဘူး** — SHIPPED (`save-stars.ts:210`), the live-order-only variant.
- **အီးမေးလ်** — SHIPPED word (`save-stars.ts:209`; `staff.ts:2510`), the field's `labelMy`.
- **ဝင်ဖို့ ကုဒ် ပို့ပါ** — K15 DRAFT (m16.json, Kept S4 copy_my) for "Send sign-in code" (ကုဒ် ပို့ပေးပါမယ် `staff.ts:2494`).
- **အီးမေးလ်နဲ့ ကုဒ် ပို့ပေးပါ** — K15 DRAFT (m16.json, Quiet S3 copy_my) for "Email me a code".
- **Google နဲ့ ဝင်မယ်** — K15 DRAFT (m16.json, Spike S3 copy_my; the shipped pattern "{x} နဲ့ ဝင်ပါ", `staff.ts:2513`) for "Sign in with Google".
- **Google နဲ့ ဆက်သွားမယ်** — K15 DRAFT (m16.json, Quiet S3 copy_my) for "Continue with Google" (Google stays Latin, `lang="en"`).
- **ဒီဖုန်းကို မေ့လိုက်ပါ** — K15 DRAFT (m16.json, Kept S4 copy_my) for the "Forget this device" half of "Not you? Forget this device".
- **တခြား အီးမေးလ် သုံးမယ်** — SHIPPED (`staff.ts:2522`, same English) for "← Use a different email" on the code step.
- **အီးမေးလ်ထဲက ကုဒ်ကို ရိုက်ထည့်ပါ။** — SHIPPED (`staff.ts:2498`), the code step's Burmese line under its label.
- The count sentences, the recovery sentences, the chooser heading, the masked identity and the code-step confirms ship EN-only (listed below): no numeral enters a Burmese line (`save-stars.ts:132-136`), and the identity-door and money-adjacent sentences are K15-HIGH — never a guess.

### A11Y

- The segments are `aria-pressed` buttons in a `role="group"` labelled by the visible question (toggles are `aria-pressed`, DESIGN-LANGUAGE §7); the pressed state is fill + ink + the attribute, never colour alone; 52px tall, 145 wide.
- The disclosure precedes the chips in DOM and on screen and is every chip's `aria-describedby` (the shipped wiring, `WelcomeBackChooser.tsx:111`; DESIGN-LANGUAGE §26 "a disclosure before a costly tap names every cost — and is the control's accessible DESCRIPTION").
- Chips 56px with a 44×44 "×" each; the list `role="list"`; the busy chip `aria-busy` (`:110`).
- The Field's refusal is drawn under the box (`aria-describedby` + `aria-invalid`); the region says it only when focus was already in the box (F20, `:54-60`, `:958-960`).
- ONE live region on the card (`:956`); the `SoundToggle`'s own `role="status"` (`SoundToggle.tsx:86`) remains F36's open consolidation — noted, not widened here.
- Focus: moves to the new step's input on the step change (`:392-403`); a segment tap keeps focus on the segment; nothing is stolen on mount; after success the card is replaced by `AccountStatus` (unchanged) and focus lands on its heading.
- Return-router (graft 4) — pure `lib/save-steps.ts` `saveCardArrival({ resume, code, error_code, error, emailTaken, hasIdentities })` → `{ intent, phase, chooser }`, one test per arrival, red-first: `?resume=<email>` (lend return) → Sign in, the owner's chip busy (the shipped chip path fires in code, `:540-565`); an OAuth `?code=` → Sign in with the callback recovery in the status line; `?error_code=` / `?error=` → Sign in with the recovery (`lib/account-hub.ts:36-48` already routes all three to You); `emailTaken` typed under Save → STAYS on Save with the shipped recovery sentence and the CTA re-worded "Send sign-in code" (`:804-806`, `:966-967`) — no segment jumps under the finger. Every branch is reachable with scripts off: the segments render as links `?tab=you&intent=save|signin`.
- Reduced motion: the cap's ignition static, chip entrance (`wb-in`) off, no height animation anywhere.

---

## DECISIONS

1. Backbone The Quiet Ledger, every graft applied, the four leave-behinds left (m16.json `.judgement`; owner default D6).
2. The whole row is the receipt's door; the `<details>` breakdown and `TotalRow` are deleted — one receipt derivation, by construction (judges' fork 1; W17 "name it once"; D6 "nothing drawn twice").
3. The lede leaves the masthead and becomes each panel's first child, flipped with the panel (D6 "speaks to the panel in view"); no masthead crossfade (left behind) — text above the tabs never changes.
4. The page is "Account" / "အကောင့်" (v7.2.html:524; `diner-tabs.ts:169`); the Rewards pitch lives on Rewards, verbatim, with the Gold variant chosen by `nextTier() === null` (graft 10; `rewards-tiers.ts:41-44`) — never a transcribed tier name.
5. The Gold lede reads "You still earn Stars as you order" (the shipped pitch's own claim shape) instead of the brief's "A Star still lands with every order": a counter settle earns none until M206 — the honest sentence wins and ships EN-only.
6. The kitchen note is VISIBLE on the row (D6 "the kitchen note on the history line") and spoken in its name (graft 5): `notes` joins `getOrderHistory`'s select (`rewards.ts:440`) — M60 closes on both surfaces.
7. "You paid $x" rides the collapsed row's second line for a partial refund, from `netPaidCents` (graft 7; `refund-view.ts:68`); the Total stays the charged figure.
8. The cash sentence is the card's foot AND the empty state's second line (verbatim `AppHeader.tsx:264`; D6 "stays true"): the counter regular's gap explains itself (two of three concepts; the judges' "its cash foot … right").
9. The skeleton's cue is "Loading your account…" — true for every landing panel, since the boundary cannot read `?tab` (`loading.tsx:38`; judges' line-number note).
10. ONE TZ-pinned day formatter: `fmtDay`/`fmtFull` hoisted from `OrderHistory.tsx:48-58` into `lib/receipt-view.ts` beside `receiptDateLabel` (`:73-85`, already the one receipt module), and `RewardsHub.tsx:89`'s `toLocaleDateString()` retired (D6 "one date formatter on the hub").
11. The receipt page DOES carry the diner tab bar with Order current — the briefs' "no tab bar on /track?r=" failed against `layout.tsx:171` + `dinerTabsHidden` (`diner-tabs.ts:58-66`) + `activeDinerTab` (`:76-78`); drawn as built, flagged below.
12. The way back is at the TOP of the receipt page ("← All your orders · သင့်အော်ဒါများ", the shipped words with the arrow turned), the foot's forward "All your orders →" removed — one destination offered once; M79's BackLink when it exists, a plain Link until then (decided, not built: C15).
13. "Print or save as PDF" is the shipped label (`PrintReceiptButton.tsx:9`) — the Quiet artboard's "Print this receipt" was not a shipped string and is not copied.
14. The refusal from the account row gets its own honest card (the order IS in the list; mint is best-effort) with the h1 focused on mount (graft 8); the expired-link card stays verbatim (binding).
15. The card's eyebrow and h2 stop flipping with the intent — the question + segments carry it (graft 2); the chooser keeps its own shipped "Welcome back — pick up where you left off" heading as its section label.
16. When the chooser is drawn, the shipped four-line sign-in sentence is not: the two-sentence disclosure says the carry promise before any press (the #312 rule) with M237's limit; without identities the shipped sentence returns.
17. The chooser mounts only under Sign in (F36's "form before chips" half; `SHARED_DEVICE.md:54-56`); a remembered-chip sign-in costs one more tap (Sign in → chip) — the honest price of the subtraction (Quiet's own count).
18. Graft 6 applied as the shipped `saveStarsCopy` second sentence after the shipped count line; "device" → "phone" on that one shipped line so the card, the save line and the Burmese heading say one word.
19. The sticky band is opaque `--pg` in both themes with an 8px pad and a stuck hairline (graft 9); no swipe, no second glass pane.
20. The Account tab's Stars capsule is drawn because it ships (`diner-tabs.ts:174`); example values 9 (Thiri) and 3 (the guest) are examples, never a claim.

## OPEN RISKS

1. **The Order tab lights on the account's receipt** (`activeDinerTab("/track") → "order"`, `diner-tabs.ts:76-78`): a diner reading a receipt from Account sees Order lit. Recommended delta for the build PR, not drawn: `activeDinerTab` takes the `?r=` presence (DinerTabs already reads `searchParams`, `DinerTabs.tsx:3`, `:47`) and answers "account" for the durable view, with a test; the artboard shows today's truth.
2. **A bearer `?r=` lands in the phone's history on every row tap** — the same exposure as the emailed link, now reachable from the app on a shared phone (Quiet risk 3). The alternative, `/account/receipt?o=` rendering `ReceiptCard` behind the session, is one owner question away and changes no row.
3. **The sliding window extends a live token on every open** (`receipt-token.ts:46-57`; a prefetch too): acceptable per the mint docblock; S17 names no retention window — the UI promises no number of days.
4. **M79's BackLink is decided and not built** (C15: the stack is new state); until it lands, "← All your orders" pushes a second /account entry. Say so in the PR.
5. **Deleting the inline breakdown removes the one receipt readable without leaving the hub**; a flaky connection now needs the second page (Quiet risk 5).
6. **`app/account/page.test.tsx` pins the document order and the masthead** (`:128`, `:156`); the title/lede move and the row shape red it red-first — expected, not a defect.
7. **AccountUpgrade is the most reviewed auth surface** (A7b, F20, the `?resume=` precedence): JSX-shell-only, handlers untouched, its jsdom suite and the `save-stars` mutants re-run; a Codex round on the exact head (or, out of quota, the capped blind pass) is non-negotiable.
8. **Eleven K15 drafts** on an identity door (the question, both segments, the CTA and Google lines, the lede, the refusal card, the cash foot, the Orders lede, "Forget this device"): every one flagged in place in a new `lib/i18n/account.ts` and on the K15 ledger; the segment and Google labels are HIGH-band — ship EN-only if Min has not read them by merge, never a guess (Spike risk 8).
9. **The two-sentence disclosure must be proved against `chooserLeavesNote`'s three variants** (`save-stars.ts:233-274`) — a split that drops "the orders that earned them" weakens a binding disclosure (Kept risk 4); the existing suite goes red-first.
10. **The shipped sign-in sentence's "anything else saved on this phone"** (`:709-711`) overclaims a paid-only split share (M237); this spec hides it behind the chooser but does not rewrite it — a row for the build.
11. **`PrintReceiptButton` and the `track-notice` medallion use emoji glyphs** (`🖨`, `🧾`); the artboards draw stroke svgs — a craft nit for the build, not a copy change.
12. **The Rewards lede's Burmese** ships only for the non-Gold pitch (the brief's draft); the Gold sentence is new and EN-only.
13. **A history row whose status flips to `refunded` leaves the list** (`rewards.ts:427` filters `paid`) — the fully refunded order is reachable only by its emailed link; honest today, and the expired card's own comment knows it (`track/page.tsx:90-92`).

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

**The shared vocabulary (every moment takes it):** ONE VOICE, TWO REGISTERS; ONE SET OF MARKS (the 2026-10-07 vocabulary, PATH_DESIGN_2026-10-07.md:74-135, extended — never paralleled). DINER (m13–m16, guided, English leading; D5's "မင်္ဂလာပါ · Good evening" is the one Burmese-first line): each screen says NOW once as its heading; then ONE actor-first next-step sentence with no label — when the hero is DOCKED its one line slot carries that sentence (live) or the hero's held reason (held), never both and never a third line ("Ready to pay." is neither); the Order · Pay rail (+ /track's status path) is the only step vocabulary, so no dots, rings or "n of m" marks appear beside it; a shared cart never shows a count; inside any window the words are future/-ing, past tense only after a confirmed write; a link's Burmese rides inline after the English (margin, never a whitespace flex child), stacking inside the same ≥44px target only when it does not fit; back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px. STAFF (m17–m20, glanceable, Burmese first, English echo stacked on headings/slots, inline on count lines, NEVER on a 44px chip): the next step lives in the control's own words; counts in prose render Burmese numerals under `my` (`fill.ts` `{n}`), standalone figures (clocks, money, codes, table numbers, the KDS stat row) stay Latin; every refusal is keyed by code and twinned in `OUTAGE_TWINS`. SHARED MARKS: lit-gold cap (`--ac` fill, `--oa` ink, sheen + gold halo; `.checkout-pill-on` on phones, the `.kds-chip[aria-pressed]`/`.staff-seg` rule on the console) = chosen or you-are-here, never a recommendation, never a status; solid ✓ disc in `--ok` = done (a diner line answered, PAID on a settled row); half disc (left `--warn`, right paper) = partly returned; full `--warn` disc = returned in full; HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else (`--t2` on phones, `--warn` on the console) — no eyebrow dot, no refund state, no inert control may use it; DASHED `--ac` edge on `--sf` = provisional, which on every surface here means the open Undo window (the diner's `.arrival-undo`/`.checkout-undo`, the console's `.clear-undo`/`undoBtn`): the SAME node that committed relabels "Undo" + the D3 Burmese (ပြန်ဖျက် when a mark you made is erased, ပြန်ယူ when something sent comes back), arms after the same-gesture guard (350 ms phones / 400 ms console), writes at `PICKED_UNDO_MS` named once per consumer (`FEEDBACK_UNDO_MS`, `TEAM_UNDO_MS`, `ARRIVAL_UNDO_MS` = 6 000), the seconds an aria-hidden leaf in the register's shipped shape (diner " — 6s", staff "· 6s"), the KDS cream pill its one shipped exception, Esc never an Undo unless every window has it; HELD/INERT CONTROL = the real control at its real shape, `aria-disabled` (never native) with the reason in its name or `aria-describedby`, dimmed by the shipped rule (`.ui-btn` .55, `.checkout-pill` .65, `.staff-btn` .6) — never a dashed ghost, never a hollow ring; BUSY = `aria-busy` with the label KEPT (on a `.staff-btn` plus the .6 dim — D8; on an `@mms/ui .ui-btn` the full-ink spinner plus a stated word like "Refunding…"), never "…", never native disabled, and busy marks only the ONE control that is writing (the zone's fact is `aria-disabled`); WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word — light: the word in `--warn` (the console's shipped `.entry-msg-warn`/`Badge warn` pair); Night: the word in `--tx`, only the mark in `--warn` (P2bm) — a warn GROUND fill only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge; GREEN = done and settled, calm (never counted, never pulsing, filled only where it just landed: the picked header, the ✓ disc); GOLD TINT = the till (money taken/owed/waived) and the brand mark, never an alarm; a REMOVING verb (Deactivate, Mark sold out) is a paper pill with `--warn` ink, a RESTORING verb (Reactivate, Put back) a paper pill with `--ok` ink — no tinted fills on routine verbs so nothing shouts during normal service; CHEVRON › = opens/collapsed, ⌄ = expanded, inside the row button; one dismiss word "Close · ပိတ်", one cancel word "Cancel · မလုပ်တော့(ပါ)", one search field recipe on the console (the pad's 48px `--sf` radius-12 field + the 44px `pad.search.clear` circle); ONE live region per view, the count/kicker/hint/next-step lines all static; the receipt code is ONE glyph string on both sides of the counter ("#A1B2C3" on the guest's slip and on Dad's desk); the ONE KITCHEN TRACK's stamps (ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) are the words for the kitchen's state on every surface that shows it. LOUDNESS LADDER (console): ALARM may tint and move — KDS Late, a late bag, money in doubt (the stranded charge, the unpaid badge) said once in the view's one region; CALL — one filled tile per room (the guest asking to pay, the rung lane card's one-shot ring); MARK — glyph + word, no fill, no motion (refund shapes, the dated since-clock, the not-sent ring, dashed pending, the stale disc); CALM — done, paid, picked up, put back. No fact is marked twice on one screen; delight is one moment per pass, never on a first read or inside a window; glass is Night-only, the bar alone.

**This moment's amendments:**

1. The "Save my Stars / Sign in" segmented control is the DINER's own two-way pill row — `.checkout-pill-row` with two `.checkout-pill` buttons (`aria-pressed`, the label over `<small lang="my">`, 44px+ tall, flex 1 1 0) and `.checkout-pill-on` on the chosen one (globals.css:3629-3639) — not `.staff-seg` brought over from the console. Same lit-gold cap, the diner's shipped chrome; the pills can be 52px tall to hold the Burmese sub-line. Everything else about the control (toggle body, focus, links with scripts off) stands.
2. Keep the arrow LAST on the row door ("Receipt · ဘောက်ချာ →") and say that D6's "Receipt → ဘောက်ချာ" is descriptive: the register puts the Burmese inline after the English and the arrow at the end (m13's back link, m14's stub links, the shipped `nav-arrow-fwd`).
3. Add to OPEN RISKS, no redraw: the ✦ in the masthead kicker is the brand mark AND the Stars' glyph (m14 DECISION 5 removes it from the farewell for that reason); on the You panel the eyebrow "✦ Save your Stars" is the Stars meaning — one glyph, two meanings, as shipped; flag for the owner rather than invent a second mark.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The binding m16 system amendments are not applied. The spec body contradicts amendment 1 and leaves out amendments 2 and 3.**
   - Evidence: amend.md m16 §1 requires the intent control to be the diner's `.checkout-pill-row` with two `.checkout-pill` buttons and `.checkout-pill-on` (globals.css:3579-3639, :3690-3694), not `.staff-seg`. picked-m16.md:178 still specifies `class="account-seg"`, "the `.staff-seg` recipe brought to the diner side (globals.css:12375-12391: track 302×60 … segments gap 2)" and 145×52 segments. The Night line (:195, "track #211a30 at 85%") follows the same recipe. Amendment 3 (the ✦ in the masthead kicker and in the "✦ Save your Stars" eyebrow is one glyph with two meanings, to be flagged for the owner) is missing from OPEN RISKS (:274-288). Amendment 2's sentence (D6's "Receipt → ဘောက်ချာ" is descriptive, and the arrow goes last) is never stated, and COPY :65 still lists "Receipt →".
   - Fix: Redraw screen 3's control as `.checkout-pill-row` (flex, gap 8) with two `.checkout-pill` buttons, `flex: 1 1 0`, 52px tall, label over `<small lang="my">`, the chosen one `.checkout-pill-on`. Drop the 60px track and the `.account-seg` / `.staff-seg` geometry in light and Night. Add the ✦ double-meaning risk to OPEN RISKS. Restate the door as "Receipt · ဘောက်ချာ →" and note that D6's order is descriptive.
2. **The direction's graft is missing: m16 must carry guided's SPOKEN NEXT STEP, but every panel lede describes the panel instead of telling the diner what to do next.**
   - Evidence: common.md: "m16 QUIET backbone carrying guided's spoken next step and bilingual question". vocab.md DINER: "each screen says NOW once as its heading; then ONE actor-first next-step sentence". picked-m16.md:29 "Your paid orders and their receipts, kept here." and :172 "Your Stars and sign-in on this phone." are descriptions with no action for the diner. The backbone's own next step, "Tap an order for its receipt." with its K15 draft "ဘောက်ချာ ကြည့်ဖို့ အော်ဒါကို နှိပ်ပါ" (brief-m16.md:40, :63), was dropped without a decision.
   - Fix: Make each panel lede ONE actor-first next step, for example Orders: "Tap an order to open its receipt." with the existing brief-m16.md:63 draft beneath. Give You a next step per state (guest: save or sign in; member: the identity card's own verb). Record the choice in DECISIONS.
3. **Both panel ledes promise more than the code keeps. "kept here" claims a durable record, and the You lede says a member's Stars are on this phone.**
   - Evidence: Orders: a guest's history is the anon uid's (getOrderHistory, rewards.ts:397-430), and the guest save line directly below says it lives only on this phone (page.tsx:131-133). The read is capped at 20 (rewards.ts:397, :403) with no paging. It filters `status = 'paid'` (rewards.ts:427), so a fully refunded order leaves the list (the spec's own OPEN RISK 13). Counter-tender orders never appear (rewards.ts:341-342). You: for an upgraded member the card under the lede is AccountStatus, which says "Your Stars stay on your account — switch or lend this phone anytime." (AccountStatus.tsx:196). The lede "Your Stars and sign-in on this phone." (:172) contradicts it.
   - Fix: Drop "kept here". Use the next-step lede from the previous finding, or a claim the read supports ("Receipts for your recent orders."). Give You a member variant that does not place the Stars on the phone, or make the You lede guest-only. Each variant gets a test.
4. **State C keeps the shipped sign-in sentence, which overclaims what a save carries: a split share this phone only PAID does not come along.**
   - Evidence: picked-m16.md:205 lists "…the 3 Stars and anything else saved on this phone come along" (AccountUpgrade.tsx:703-711) as the copy whenever no identities are remembered. save-stars.ts:212-216 (BRING_ALONG) and :153-157 say the merge carries only the Stars and the orders that EARNED them; `qr_order_payers` is not re-stamped (M237). The spec's OPEN RISK 10 admits the overclaim but ships it ("does not rewrite it"). The brief's binding rule: M237's limit stays.
   - Fix: Rewrite the state-C sentence with the M237-safe facts, for example "…your Stars and past orders are there waiting, and this phone's 3 Stars and the orders that earned them come along." Do not use "anything else saved on this phone". Add a test that fails red on the old wording.
5. **The refusal card promises "Your order is still in your list — try again" for every failure, including a refusal that a retry can never fix.**
   - Evidence: getReceiptLink returns `refused` when there is no user, when the caller holds no arm, and when an authorization read fails closed (receipt.ts:122-129, :68, :79, :116), and `unavailable` only when the mint fails (:130-131). The spec draws one card for both (picked-m16.md:123) and justifies the claim with "it came from getOrderHistory moments ago". But the row is a plain anchor that the spec says can be long-pressed or opened in a new tab (:42, brief :71), so `/account/receipt?o=` can be opened signed out, after a chip switch, or by someone else. For those callers "still in your list" is false and retrying never succeeds.
   - Fix: Branch on the reason. `unavailable` gets the retry copy. `refused` gets a neutral line ("We couldn't open this receipt." with the back link) that says nothing about the list and does not diagnose, keeping the no-existence-oracle rule (receipt.ts:17-18). Give each branch a test.
6. **Every row tap writes a 90-day bearer URL into the browser history of the shared phone this moment is designed for, and "Forget this device" cannot remove it.**
   - Evidence: Screen 2 redirects to `/track?r=<token>` (picked-m16.md:101). That token is the entire authorization, with no session check (receipt-token.ts:78-80), and every open slides its expiry forward 90 days (:47-56). brief-m16.md:6 names "a shared-phone family" as a user. SHARED_DEVICE.md:50-51 promises "easy to clear" through "Not you? Forget this device", which wipes the identity hints, not history or autocomplete. The spec defers this to the owner (OPEN RISK 2). D6 asks only that the row open the durable receipt; it does not require a bearer hop.
   - Fix: Render `ReceiptCard` in-session at `/account/receipt?o=`: authorize with the same earner/payer/seat arms, read via getReceiptEntry, mint no token, write nothing on GET, put no bearer in history. Keep `?r=` for the emailed link. If the owner prefers the hop, mark it as the owner's explicit call in DECISIONS rather than shipping it as the default.
7. **The sticky tab band's offset ignores the notch inset and the lend banner, so on the drawn notched phone it overlaps the app header.**
   - Evidence: picked-m16.md:28 specifies `position: sticky; top: var(--header-height)` at `z-index: var(--z-toolbar)`. The header is `height: calc(var(--header-height) + env(safe-area-inset-top))` at `--z-toolbar` (globals.css:5220-5233). Every shipped sticky shell uses `top: calc(var(--header-height) + env(safe-area-inset-top, 0px) + var(--lend-offset, 0px))` (globals.css:1212, :7718), most at `z-toolbar − 1` (:5119, :7719). The spec's own artboard puts the stuck band at y103 = 47 + 56 (:193), which its CSS cannot produce: it would stick at y56 and cover 47px of the header, and it would sit under the lend-mode banner.
   - Fix: Use the shipped offset `calc(var(--header-height) + env(safe-area-inset-top, 0px) + var(--lend-offset, 0px))` and `z-index: calc(var(--z-toolbar) - 1)`, and say so in the layout block.
8. **The refund marks break the round's binding mark vocabulary: a warn ground on a routine settled fact, warn ink on the paid figure, and warn words in Night.**
   - Evidence: vocab.md SHARED MARKS: half disc = partly returned, full --warn disc = returned in full; the warn GROUND fill is allowed "only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge"; in Night "the word in --tx, only the mark in --warn". The spec puts "Partly refunded" on `.history-refunded`, a 12% warn ground (globals.css:4671-4683, picked-m16.md:41); colours "You paid $33.10" #a44b34 / Night #e0855f (:39, :51); and keeps the "{n} sold out" chip on the same warn ground (OrderHistory.tsx:186).
   - Fix: Draw the refund state as the half disc (partial) or full disc (full) plus the word, on a paper chip. Set "You paid $x" in --tx/--t2, because it is the settled amount, not an alarm. In Night, the word goes in --tx and only the disc in --warn. Give the sold-out chip a paper ground. Apply the same to the receipt's status line if it gains a mark.
9. **The redrawn card keeps the busy and held states the vocabulary forbids: native `disabled` across the whole card and a bare "…" busy label.**
   - Evidence: vocab.md: BUSY = `aria-busy` with the label KEPT, "never '…', never native disabled, and busy marks only the ONE control that is writing (the zone's fact is aria-disabled)". The spec changes the card's shell but keeps `disabled={busy}` on the CTA, the Google button and the override hatch (AccountUpgrade.tsx:796, :838, :889, :942), on every chip, × and forget-all (WelcomeBackChooser.tsx:109, :139, :149), and the chip's `{loading ? "…"}` (WelcomeBackChooser.tsx:133). It never says what the new segments do while a send is in flight.
   - Fix: Only the writing control gets `aria-busy` with its word kept ("Sending…" with the spinner on the CTA; the chip keeps "Email"/"Google" plus the spinner). Every other control gets `aria-disabled` with the reason in `aria-describedby` and the shipped dim (.65 on `.checkout-pill`). The segments are `aria-disabled` while busy.
10. **The You panel ships with two live regions.**

- Evidence: The card's `<p role="status">` (AccountUpgrade.tsx:956) and SoundToggle's `<p role="status">` (SoundToggle.tsx:86) render on the same panel. The spec acknowledges it ("F36's open consolidation — noted, not widened here", picked-m16.md:244) but redraws this panel anyway. The standing rule and vocab.md both say "ONE live region per view".
- Fix: Close it in this moment. Make SoundToggle's sub-line static text tied to its switch by `aria-describedby`, and route its one refusal ("This device wouldn't let us play sound.") to the panel's single region, or move focus to the described switch. Mark F36 closed.

11. **The shared example is not like for like, and the order codes it draws cannot exist.**

- Evidence: The shared example puts #A1B2C3 at Table 4 (picked-m16.md:8), and screen 2's meta says "· Table 4" (:110). Screen 1's row draws "To go" with no "Table 4" chip (:41), though the code always renders it when `tableNumber != null` (OrderHistory.tsx:192-194). Its composed name (:73) also drops ", Table 4", which today's label includes (OrderHistory.tsx:129). The code is `o.id.slice(-6).toUpperCase()` (rewards.ts:491): six hex characters. "#K7M2Q" and "#P2X9A" (:45-46) are five characters and contain non-hex letters. vocab.md: the receipt code is ONE glyph string on both sides of the counter.
- Fix: Add the "Table 4" chip and ", Table 4" in the name to row 1, or make the example a real to-go pickup on both screens. Replace the codes with six-character hex tails (for example #7F3A9C, #E04B21).

12. **The receipt page's way back falls back to a push, which binding decision M79 rules out.**

- Evidence: picked-m16.md:106: "Until it lands, the same label ships as a plain Link to /account?tab=orders". OPEN RISK 4 admits it "pushes a second /account entry". DECISIONS_2026-10-18.md:637-656 (M79) picks "Pop when the previous in-app entry is the target, otherwise replace", with "An empty stack falls back to replace". A spec that contradicts a decision is a defect (common.md).
- Fix: Build M79's BackLink in this moment's PR (the decision is already specified), or ship a fallback that obeys M79's empty-stack branch: `router.replace('/account?tab=orders')`, never a push.

13. **Several citations are wrong, and two claimed behaviours do not exist in the cited code.**

- Evidence: nextTier is rewards-tiers.ts:36-39; the spec's :41-44 (:72, Decision 4) is spendToNextTierCents. activeDinerTab's "/track" case is diner-tabs.ts:78-80, not :76-78 (:263, :276). The file is components/nav/DinerTabs.tsx, and useSearchParams is at :44, not "DinerTabs.tsx:3, :47" (:276). TodayOrders sits at page.tsx:114, not :112 (:31). PrintReceiptButton is called "a 48px paper pill" (:118); it is minHeight 44, radius 11, on --sf (PrintReceiptButton.tsx:14-27). The row door "nudges 3px on hover, globals.css:4544-4551" (:42), but that rule is `.nav-link:hover .nav-arrow-fwd`, and the row anchor is `.history-card`, not `.nav-link`, so nothing nudges.
- Fix: Correct each citation. Either add an explicit `.history-card:hover .nav-arrow-fwd` rule, inside the reduced-motion reset, or drop the nudge claim. Describe the print button as built, or specify the change.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- `/account/receipt` sits under app/account/, so app/account/loading.tsx (the hub skeleton with "Loading your account…") will flash on every row tap and on the refusal path. Give the route its own loading.tsx or place it outside /account.
- loading.tsx models the masthead line for line, including the two-line lede (loading.tsx:27-29). The spec removes the lede and adds the sticky band and a per-panel lede but changes only the sr-only cue, so the skeleton will jump. Re-model it.
- The page metadata title is still "Rewards & account · Morning Star" (page.tsx:30). Rename it with the h1 "Account" (one word per concept).
- `.account-tab-on` (globals.css:4467-4472) has no sheen and no gold halo, while the pressed segment on the same screen wears the full lit-gold cap. Join the tab to the ONE lit-cap list so 'you are here' and 'chosen' render alike.
- The Gold lede hardcodes the word "Gold" even though Decision 4 / graft 10 say "never a transcribed tier name". Read `tierMeta(state.tierId).english` once nextTier() === null.
- Specify the split disclosure for the 1-Star singular and for 2+ orders in progress (save-stars.ts:241-246, :256-258). Name a test for each variant.
- "Every branch is reachable with scripts off" through `?intent=` links is decorative: page.tsx's searchParams has no `intent`, and AccountUpgrade's sends are client handlers. Also, `aria-pressed` buttons and links are two different elements. Pick one progressive-enhancement shape or drop the claim.
- `saveCardArrival` takes `hasIdentities`, which comes from localStorage (client only). If it decides intent during render it will mismatch on hydration; decide it after mount.
- Decision 18's one word for one concept ("phone") still leaves "device" in :967's recovery line, CARRY_OVERRIDE_LABEL, "Forget this device" and "Forget Mom on this device". List them for the build or for K15.
- The refusal page at /account/receipt lights no diner tab (activeDinerTab exact-matches "/account"). Say which tab is current there.
- Specify the focus-visible ring on the pressed `.checkout-pill-on` (outline in --oa, the shipped lit-cap focus rule) so keyboard focus stays visible on gold.
- Counter Terminal orders (COUNTER_TENDERS includes "terminal") are also absent from history, while the foot says only "Cash-paid". D6 binds the sentence, so flag it for the owner before Terminal hardware (C7) lands.
